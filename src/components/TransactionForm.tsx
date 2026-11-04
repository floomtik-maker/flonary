import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useBackend } from '../api';
import type { Account, Instrument, Transaction, TxType } from '../../shared/types';
import { guessCountry } from '../../shared/geo';
import { toISODate } from '../../shared/series';
import { Modal, Segmented } from './ui';
import { InstrumentPicker, type PickedInstrument } from './InstrumentPicker';
import { TX_LABELS, money } from '../lib/format';
import { parseNumber } from '../../shared/importers/csv';

export const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));

interface Props {
  accounts: Account[];
  instruments: Instrument[];
  initial?: Transaction;
  defaultSymbol?: string;
  defaultAccountId?: string;
  onClose: () => void;
}

const TYPES: TxType[] = ['BUY', 'SELL', 'DIVIDEND', 'DEPOSIT', 'WITHDRAWAL', 'FEE'];

export function TransactionForm({ accounts, instruments, initial, onClose, defaultSymbol, defaultAccountId }: Props) {
  const backend = useBackend();
  const qc = useQueryClient();
  const initialInst = instruments.find((i) => i.symbol === (initial?.symbol ?? defaultSymbol));
  const [type, setType] = useState<TxType>(initial?.type ?? 'BUY');
  const [accountId, setAccountId] = useState(initial?.account_id ?? defaultAccountId ?? accounts[0]?.id ?? '');
  const [inst, setInst] = useState<PickedInstrument | null>(initialInst ? { ...initialInst, isNew: false } : null);
  const [date, setDate] = useState(initial?.date ?? toISODate(new Date()));
  const [quantity, setQuantity] = useState(initial?.quantity ? String(initial.quantity) : '');
  const [price, setPrice] = useState(initial?.price ? String(initial.price) : '');
  const [fees, setFees] = useState(initial?.fees ? String(initial.fees) : '');
  const [amount, setAmount] = useState(initial?.amount ? String(initial.amount) : '');
  const [currency, setCurrency] = useState(initial?.currency ?? 'EUR');
  const [fx, setFx] = useState(initial?.fx_rate && initial.currency !== 'EUR' ? String(initial.fx_rate) : '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const trade = type === 'BUY' || type === 'SELL';
  const needsInstrument = trade || type === 'DIVIDEND';
  const ccy = inst && needsInstrument ? inst.currency : currency;
  const q = parseNumber(quantity);
  const p = parseNumber(price);
  const total = trade && q > 0 && p > 0 ? q * p + (type === 'BUY' ? 1 : -1) * (parseNumber(fees) || 0) : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!accountId) return setError("Créez d'abord un compte (menu Comptes).");
    if (needsInstrument && !inst && type !== 'DIVIDEND') return setError('Choisissez un titre.');
    if (trade && !(q > 0 && p > 0)) return setError('Quantité et prix doivent être positifs.');
    if (!trade && !(parseNumber(amount) !== 0 && Number.isFinite(parseNumber(amount)))) return setError('Indiquez un montant.');
    setBusy(true);
    try {
      if (inst?.isNew && needsInstrument) {
        // Enrich with country / sector when the data source knows them
        const prof = inst.manual ? null : await backend.profile(inst.symbol).catch(() => null);
        const isEtf = /etf|fund/i.test(inst.type ?? '') || /ETF|UCITS/i.test(inst.name);
        await backend.saveInstrument({
          symbol: inst.symbol,
          name: inst.name,
          currency: inst.currency,
          asset_class: inst.manual ? 'fund' : isEtf ? 'etf' : 'stock',
          country: prof?.country ?? guessCountry(inst.symbol, inst.name, isEtf),
          sector: prof?.sector ?? null,
          manual: inst.manual,
        });
        if (inst.manual && trade) await backend.saveManualPrice(inst.symbol, date, p);
      }
      const tx: Transaction = {
        id: initial?.id ?? newId(),
        account_id: accountId,
        date,
        type,
        symbol: needsInstrument ? (inst?.symbol ?? null) : null,
        quantity: trade ? q : 0,
        price: trade ? p : 0,
        fees: parseNumber(fees) || 0,
        amount: trade ? 0 : parseNumber(amount),
        currency: ccy,
        fx_rate: ccy === 'EUR' ? 1 : parseNumber(fx) > 0 ? parseNumber(fx) : null,
        note: note || null,
        source: initial?.source ?? 'manual',
        external_id: initial?.external_id ?? null,
      };
      await backend.saveTransactions([tx]);
      await qc.invalidateQueries({ queryKey: ['data'] });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={initial ? "Modifier l'opération" : 'Nouvelle opération'} onClose={onClose}>
      <form onSubmit={submit}>
        <div style={{ overflowX: 'auto', marginBottom: 14 }}>
          <Segmented value={type} onChange={setType} options={TYPES.map((t) => ({ value: t, label: TX_LABELS[t] }))} />
        </div>
        <div className="form-grid">
          <label className="field">
            Compte
            <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)} required>
              {accounts.length === 0 && <option value="">Aucun compte</option>}
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.kind})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Date
            <input className="input" type="date" value={date} max={toISODate(new Date())} onChange={(e) => setDate(e.target.value)} required />
          </label>
          {needsInstrument && (
            <div className="field full">
              Titre {type === 'DIVIDEND' && <span className="hint">(optionnel)</span>}
              <InstrumentPicker instruments={instruments} value={inst} onChange={setInst} />
            </div>
          )}
          {trade ? (
            <>
              <label className="field">
                Quantité
                <input className="input" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="10" required />
              </label>
              <label className="field">
                Prix unitaire ({ccy})
                <input className="input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="123,45" required />
              </label>
              <label className="field">
                Frais ({ccy})
                <input className="input" inputMode="decimal" value={fees} onChange={(e) => setFees(e.target.value)} placeholder="0" />
              </label>
            </>
          ) : (
            <label className="field">
              Montant ({ccy}) {type === 'DIVIDEND' && <span className="hint">net reçu</span>}
              <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="100" required />
            </label>
          )}
          {!needsInstrument && (
            <label className="field">
              Devise
              <input className="input" value={currency} maxLength={3} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
            </label>
          )}
          {ccy !== 'EUR' && (
            <label className="field">
              Taux {ccy}→EUR <span className="hint">(optionnel, sinon taux BCE du jour)</span>
              <input className="input" inputMode="decimal" value={fx} onChange={(e) => setFx(e.target.value)} placeholder="ex. 0,92" />
            </label>
          )}
          <label className="field full">
            Note
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optionnel" />
          </label>
        </div>
        {total != null && (
          <p className="hint">
            Total {type === 'BUY' ? 'payé' : 'reçu'} : <b className="num">{money(total, ccy)}</b>
          </p>
        )}
        {type === 'SELL' && <p className="hint">Le produit de la vente reste dans le compte et dans votre performance.</p>}
        {error && <div className="error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
