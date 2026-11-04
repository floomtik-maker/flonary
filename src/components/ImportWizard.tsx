import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useBackend } from '../api';
import type { Account, Instrument, Transaction } from '../../shared/types';
import { FIELD_LABELS, detectMapping, looksLikeIbkr, parseCsv, parseIbkrCsv, rowsToTransactions, type Field } from '../../shared/importers/csv';
import { parseIbkrFlexXml } from '../../shared/importers/ibkr';
import { guessCountry } from '../../shared/geo';
import { Modal } from './ui';
import { TX_LABELS, date, money, qty } from '../lib/format';
import { newId } from './TransactionForm';

type Draft = Omit<Transaction, 'id' | 'account_id'>;
interface Parsed {
  format: string;
  drafts: Draft[];
  errors: string[];
  names: Record<string, { name: string; currency: string; isin?: string }>;
  /** generic CSV only */
  csv?: { headers: string[]; rows: string[][]; mapping: Partial<Record<Field, number>> };
}

function parseFile(text: string, filename: string, mapping?: Partial<Record<Field, number>>): Parsed {
  if (text.includes('<FlexQueryResponse') || filename.toLowerCase().endsWith('.xml')) {
    const r = parseIbkrFlexXml(text);
    return { format: 'Interactive Brokers (Flex XML)', drafts: r.transactions, errors: r.warnings, names: r.names };
  }
  const rows = parseCsv(text);
  if (rows.length < 2) return { format: 'CSV', drafts: [], errors: ['Fichier vide ou illisible'], names: {} };
  if (looksLikeIbkr(rows[0])) {
    const r = parseIbkrCsv(rows);
    return { format: 'Interactive Brokers (Flex CSV)', drafts: r.transactions, errors: r.warnings, names: r.names };
  }
  const map = mapping ?? detectMapping(rows[0]);
  const res = rowsToTransactions(rows.slice(1), map);
  const names: Parsed['names'] = {};
  for (const r of res) if (r.tx?.symbol && r.name) names[r.tx.symbol] ??= { name: r.name, currency: r.tx.currency, isin: r.isin };
  const isTr = rows[0].map((h) => h.toLowerCase()).join('|').includes('shares');
  return {
    format: isTr ? 'Trade Republic (export pytr)' : 'CSV générique',
    drafts: res.filter((r) => r.tx).map((r) => r.tx!),
    errors: res.filter((r) => r.error).map((r) => `Ligne ${r.line} : ${r.error}`),
    names,
    csv: { headers: rows[0], rows: rows.slice(1), mapping: map },
  };
}

export function ImportWizard({ accounts, instruments, onClose }: { accounts: Account[]; instruments: Instrument[]; onClose: () => void }) {
  const backend = useBackend();
  const qc = useQueryClient();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [mapping, setMapping] = useState<Partial<Record<Field, number>> | undefined>();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(() => (file ? parseFile(file.text, file.name, mapping) : null), [file, mapping]);

  async function onFile(f: File | undefined) {
    if (!f) return;
    if (f.size > 5_000_000) return setError('Fichier trop volumineux (5 Mo max).');
    setError(null);
    setResult(null);
    setMapping(undefined);
    setFile({ name: f.name, text: await f.text() });
  }

  async function doImport() {
    if (!parsed || !accountId) return;
    setBusy(true);
    setError(null);
    try {
      const known = new Set(instruments.map((i) => i.symbol));
      // Resolve ISIN-only rows to a ticker through the market search
      const isinMap = new Map<string, { symbol: string; name: string; currency: string; manual: boolean }>();
      for (const d of parsed.drafts) {
        if (!d.symbol?.startsWith('isin:')) continue;
        const isin = d.symbol.slice(5);
        if (isinMap.has(isin)) continue;
        const existing = instruments.find((i) => i.isin === isin);
        if (existing) {
          isinMap.set(isin, { symbol: existing.symbol, name: existing.name, currency: existing.currency, manual: !!existing.manual });
          continue;
        }
        const hit = (await backend.search(isin).catch(() => []))[0];
        const fallbackName = parsed.names[d.symbol]?.name ?? isin;
        isinMap.set(isin, hit ? { symbol: hit.symbol, name: hit.name, currency: hit.currency || d.currency, manual: false } : { symbol: `manual:${isin.toLowerCase()}`, name: fallbackName, currency: d.currency, manual: true });
      }
      const txs: Transaction[] = parsed.drafts.map((d) => {
        let symbol = d.symbol;
        if (symbol?.startsWith('isin:')) symbol = isinMap.get(symbol.slice(5))!.symbol;
        return { ...d, symbol, id: newId(), account_id: accountId };
      });
      // Create missing instruments
      const created = new Set<string>();
      for (const t of txs) {
        if (!t.symbol || known.has(t.symbol) || created.has(t.symbol)) continue;
        created.add(t.symbol);
        const fromIsin = [...isinMap.entries()].find(([, v]) => v.symbol === t.symbol);
        const meta = parsed.names[t.symbol] ?? (fromIsin ? parsed.names[`isin:${fromIsin[0]}`] : undefined);
        const name = fromIsin?.[1].name ?? meta?.name ?? t.symbol;
        const isEtf = /ETF|UCITS|MSCI|S&P/i.test(name);
        await backend.saveInstrument({
          symbol: t.symbol,
          name,
          currency: fromIsin?.[1].currency ?? meta?.currency ?? t.currency,
          asset_class: fromIsin?.[1].manual ? 'fund' : isEtf ? 'etf' : 'stock',
          country: guessCountry(t.symbol, name, isEtf),
          isin: fromIsin?.[0] ?? meta?.isin ?? null,
          manual: fromIsin?.[1].manual ?? false,
        });
      }
      // Manual instruments get a valuation from their trade prices so they are not valued at 0
      for (const t of txs) if (t.symbol?.startsWith('manual:') && t.price > 0) await backend.saveManualPrice(t.symbol, t.date, t.price);
      const r = await backend.saveTransactions(txs);
      await qc.invalidateQueries({ queryKey: ['data'] });
      setResult(`${r.inserted} opération(s) importée(s)${r.skipped ? `, ${r.skipped} doublon(s) ignoré(s)` : ''}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Importer des opérations" onClose={onClose} wide>
      {result ? (
        <>
          <p style={{ fontSize: 16 }}>✓ {result}</p>
          <div className="modal-actions">
            <button className="btn primary" onClick={onClose}>
              Terminer
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="form-grid">
            <label className="field">
              Compte de destination
              <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.kind})
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Fichier (.csv ou .xml)
              <input className="input" type="file" accept=".csv,.txt,.xml,text/csv" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
          </div>
          <details className="hint" style={{ marginTop: 10 }}>
            <summary>Formats reconnus</summary>
            <ul>
              <li>
                <b>Interactive Brokers</b> : relevé Flex Query (sections Trades + Cash Transactions) en XML ou CSV.
              </li>
              <li>
                <b>Trade Republic</b> : export CSV des transactions généré par l'outil open source <i>pytr</i> (colonnes Date, Type, Value, ISIN, Shares, Fees).
              </li>
              <li>
                <b>Tout autre CSV</b> avec des colonnes date, type (achat/vente/dividende), ticker ou ISIN, quantité, prix, frais, montant, devise. Vous pouvez
                ajuster les colonnes ci-dessous.
              </li>
            </ul>
          </details>

          {parsed && (
            <>
              <p className="small" style={{ marginBottom: 6 }}>
                Format détecté : <b>{parsed.format}</b> · {parsed.drafts.length} opération(s) lisible(s)
                {parsed.errors.length > 0 && ` · ${parsed.errors.length} ligne(s) ignorée(s)`}
              </p>
              {parsed.csv && (
                <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', marginBottom: 10 }}>
                  {(Object.keys(FIELD_LABELS) as Field[]).map((f) => (
                    <label className="field" key={f}>
                      {FIELD_LABELS[f]}
                      <select
                        className="input"
                        value={parsed.csv!.mapping[f] ?? ''}
                        onChange={(e) => setMapping({ ...parsed.csv!.mapping, [f]: e.target.value === '' ? undefined : Number(e.target.value) })}
                      >
                        <option value="">—</option>
                        {parsed.csv!.headers.map((h, i) => (
                          <option key={i} value={i}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              )}
              <div className="table-wrap" style={{ maxHeight: 280, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Titre</th>
                      <th className="r">Quantité</th>
                      <th className="r">Prix / montant</th>
                      <th className="r">Frais</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.drafts.slice(0, 50).map((d, i) => (
                      <tr key={i}>
                        <td>{date(d.date)}</td>
                        <td>{TX_LABELS[d.type]}</td>
                        <td>{d.symbol?.replace('isin:', 'ISIN ') ?? '—'}</td>
                        <td className="r num">{d.quantity ? qty(d.quantity) : ''}</td>
                        <td className="r num">{money(d.price || d.amount, d.currency)}</td>
                        <td className="r num">{d.fees ? money(d.fees, d.currency) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parsed.drafts.length > 50 && <p className="hint">… et {parsed.drafts.length - 50} autres.</p>}
              {parsed.errors.length > 0 && (
                <div className="warning-box" style={{ marginTop: 10, maxHeight: 100, overflow: 'auto' }}>
                  {parsed.errors.slice(0, 20).map((e) => (
                    <div key={e}>{e}</div>
                  ))}
                </div>
              )}
              <p className="hint">Les opérations déjà importées sont détectées et ignorées : vous pouvez réimporter un fichier sans créer de doublons.</p>
            </>
          )}
          {error && <div className="error">{error}</div>}
          <div className="modal-actions">
            <button className="btn" onClick={onClose}>
              Annuler
            </button>
            <button className="btn primary" disabled={!parsed || parsed.drafts.length === 0 || !accountId || busy} onClick={doImport}>
              {busy ? 'Import en cours…' : `Importer ${parsed?.drafts.length ?? ''} opération(s)`}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
