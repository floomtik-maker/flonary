import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { usePortfolio } from '../lib/usePortfolio';
import { useProfiles } from '../lib/useProfiles';
import { useBackend } from '../api';
import { computeSignals, RISK_LABELS } from '../../shared/analysis';
import { dividendYield, upcomingEvents } from '../../shared/calendar';
import { addMonths, toISODate, valueAtOrFirst } from '../../shared/series';
import type { AssetClass, Instrument } from '../../shared/types';
import { PriceChart } from '../components/PriceChart';
import { TransactionForm } from '../components/TransactionForm';
import { Avatar, Gain, Modal, PageLoading, Segmented } from '../components/ui';
import { IconBack } from '../components/Icons';
import { ASSET_CLASS_LABELS, TX_LABELS, date, eur, money, pct, qty } from '../lib/format';

type Range = '6M' | '1Y' | '5Y';

export function PositionDetail() {
  const { symbol: raw } = useParams();
  const symbol = decodeURIComponent(raw ?? '');
  const { state, loading, error } = usePortfolio();
  const { profiles } = useProfiles([symbol]);
  const [range, setRange] = useState<Range>('1Y');
  const [editing, setEditing] = useState(false);
  const [addingTx, setAddingTx] = useState(false);

  const hist = state?.histories[symbol];
  const position = state?.result.positions.find((p) => p.symbol === symbol) ?? state?.result.closedPositions.find((p) => p.symbol === symbol);
  const signals = useMemo(() => (hist ? computeSignals(hist.points, position?.closed ? undefined : position?.avgPrice) : null), [hist, position]);

  if (error) return <div className="card error">{error}</div>;
  if (loading || !state) return <PageLoading />;
  const inst = state.instruments[symbol];
  if (!position || !inst) {
    return (
      <div className="card">
        Titre introuvable. <Link to="/positions">Retour</Link>
      </div>
    );
  }

  const manual = inst.manual || symbol.startsWith('manual:');
  const points = hist?.points ?? [];
  const from = range === '6M' ? addMonths(state.today, -6) : range === '1Y' ? addMonths(state.today, -12) : addMonths(state.today, -60);
  const windowPts = points.filter((p) => p[0] >= from);
  const trades = state.data.transactions.filter((t) => t.symbol === symbol).sort((a, b) => (a.date < b.date ? 1 : -1));
  const dy = dividendYield(hist, state.today);
  const fx = (c: string) => (c === 'EUR' ? 1 : (valueAtOrFirst(state.fx[c], state.today) ?? 1));
  const events = position.closed
    ? []
    : upcomingEvents({ positions: [position], histories: state.histories, profiles, fxToEUR: fx, today: state.today, horizonDays: 365 });

  return (
    <>
      <div className="page-head">
        <div className="toolbar">
          <Link to="/positions" className="btn ghost small" aria-label="Retour">
            <IconBack width={18} height={18} />
          </Link>
          <Avatar symbol={symbol} name={position.name} />
          <div>
            <h1>{position.name}</h1>
            <div className="muted small">
              {manual ? 'Valorisation manuelle' : symbol} · {ASSET_CLASS_LABELS[inst.asset_class]} {inst.country ? `· ${inst.country}` : ''} {inst.sector ? `· ${inst.sector}` : ''}
            </div>
          </div>
        </div>
        <div className="toolbar">
          <button className="btn small" onClick={() => setEditing(true)}>
            Modifier la fiche
          </button>
          <button className="btn small primary" onClick={() => setAddingTx(true)}>
            + Achat / vente
          </button>
        </div>
      </div>

      <div className="grid grid-main">
        <div className="stack">
          <section className="card">
            <div className="toolbar" style={{ marginBottom: 8 }}>
              <div>
                <div className="hero-value num" style={{ fontSize: 28 }}>{money(position.price, position.currency)}</div>
                {position.dayChangePct != null && (
                  <span className="small">
                    <Gain pct={position.dayChangePct / 100} /> aujourd'hui
                  </span>
                )}
              </div>
              <span className="spacer" />
              <Segmented
                value={range}
                onChange={setRange}
                options={[
                  { value: '6M', label: '6M' },
                  { value: '1Y', label: '1A' },
                  { value: '5Y', label: '5A' },
                ]}
              />
            </div>
            <PriceChart
              points={windowPts}
              fullPoints={points}
              currency={position.currency}
              avgPrice={position.closed ? undefined : position.avgPrice}
              signals={manual ? null : signals}
              trades={trades}
              showZones={!manual}
            />
            <div className="legend" style={{ marginTop: 8 }}>
              <span><i style={{ background: 'var(--series-1)' }} />Cours</span>
              {!position.closed && <span><i style={{ background: 'var(--series-7)' }} />Votre PRU</span>}
              {!manual && (
                <>
                  <span><i style={{ background: 'var(--series-3)' }} />Moy. 50 j</span>
                  <span><i style={{ background: 'var(--series-2)' }} />Moy. 200 j</span>
                  <span><i style={{ background: 'var(--good)', height: 8, opacity: 0.4 }} />Zone d'achat</span>
                  <span><i style={{ background: 'var(--warn)', height: 8, opacity: 0.4 }} />Zone de sortie</span>
                </>
              )}
              <span>● achats / ventes</span>
            </div>
          </section>

          {!manual && signals && (
            <section className="card">
              <div className="card-title">Analyse technique</div>
              <div className={`signal ${signals.tone}`}>{signals.headline}</div>
              <ul className="reasons">
                {signals.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
              <div className="stat-grid" style={{ marginTop: 14 }}>
                <Stat label="Zone d'achat" value={`${money(signals.entryZone[0], position.currency)} – ${money(signals.entryZone[1], position.currency)}`} />
                <Stat label="Zone de sortie" value={`${money(signals.exitZone[0], position.currency)} – ${money(signals.exitZone[1], position.currency)}`} />
                <Stat label="Stop de protection" value={money(signals.stop, position.currency)} />
                <Stat label="RSI 14 j" value={signals.rsi14 != null ? signals.rsi14.toFixed(0) : '—'} />
                <Stat label="Plus haut / bas 1 an" value={`${money(signals.high52, position.currency)} / ${money(signals.low52, position.currency)}`} />
                <Stat label="Risque" value={signals.risk ? `${signals.risk}/7 · ${RISK_LABELS[signals.risk]}` : '—'} />
                <Stat label="Volatilité 1 an" value={signals.volatility != null ? pct(signals.volatility) : '—'} />
                <Stat label="Pire baisse 1 an" value={pct(signals.maxDrawdown1y)} />
                {dy && dy.ttm > 0 && <Stat label="Rendement dividende" value={pct(dy.yield)} />}
              </div>
              <p className="disclaimer">
                Indicateurs calculés automatiquement à partir de l'historique des cours (moyennes mobiles, RSI, supports/résistances sur 3 mois). Ce ne sont pas des
                conseils en investissement.
              </p>
            </section>
          )}

          {manual && <ManualValuations symbol={symbol} currency={inst.currency} />}
        </div>

        <div className="stack">
          <section className="card">
            <div className="card-title">Ma position</div>
            {position.closed ? (
              <p className="muted small" style={{ marginTop: 0 }}>Position entièrement vendue.</p>
            ) : (
              <div className="stat-grid">
                <Stat label="Quantité" value={qty(position.quantity)} />
                <Stat label="PRU" value={money(position.avgPrice, position.currency)} />
                <Stat label="Valeur" value={eur(position.valueEUR)} />
                <Stat label="Poids" value={pct(position.weight)} />
              </div>
            )}
            <div className="list" style={{ marginTop: 10 }}>
              {!position.closed && (
                <div className="row">
                  <div className="row-main">Plus-value latente</div>
                  <Gain value={position.unrealizedEUR} pct={position.unrealizedPct} />
                </div>
              )}
              <div className="row">
                <div className="row-main">Plus-value réalisée</div>
                <Gain value={position.realizedEUR} />
              </div>
              <div className="row">
                <div className="row-main">Dividendes reçus</div>
                <Gain value={position.dividendsEUR} />
              </div>
              <div className="row" style={{ fontWeight: 600 }}>
                <div className="row-main">Gain total</div>
                <Gain value={position.totalGainEUR} />
              </div>
            </div>
          </section>

          {events.length > 0 && (
            <section className="card">
              <div className="card-title">Prochains événements</div>
              <div className="list">
                {events.slice(0, 4).map((e, i) => (
                  <div className="row" key={i}>
                    <div className="row-main">
                      <div className="row-title">{e.kind === 'earnings' ? 'Résultats' : 'Dividende'}</div>
                      <div className="row-sub">
                        {date(e.date)}
                        {e.estimated ? ' · estimé' : ''}
                      </div>
                    </div>
                    {e.expectedEUR ? <span className="num up small">+{eur(e.expectedEUR)}</span> : null}
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="card">
            <div className="card-title">
              Opérations <small>{trades.length}</small>
            </div>
            <div className="list">
              {trades.slice(0, 12).map((t) => (
                <div className="row" key={t.id}>
                  <div className="row-main">
                    <div className="row-title">{TX_LABELS[t.type]}</div>
                    <div className="row-sub">{date(t.date)}</div>
                  </div>
                  <div className="row-right num small">
                    {t.type === 'DIVIDEND' ? money(t.amount, t.currency) : `${qty(t.quantity)} × ${money(t.price, t.currency)}`}
                  </div>
                </div>
              ))}
            </div>
            {trades.length > 12 && (
              <Link to={`/mouvements?symbol=${encodeURIComponent(symbol)}`} className="small" style={{ color: 'var(--accent)' }}>
                Voir les {trades.length} opérations →
              </Link>
            )}
          </section>
        </div>
      </div>
      {editing && <InstrumentEditor instrument={inst} onClose={() => setEditing(false)} />}
      {addingTx && (
        <TransactionForm
          accounts={state.data.accounts}
          instruments={state.data.instruments}
          defaultSymbol={symbol}
          defaultAccountId={position.accounts[0]}
          onClose={() => setAddingTx(false)}
        />
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="num" style={{ fontWeight: 600, marginTop: 2 }}>{value}</div>
    </div>
  );
}

export function InstrumentEditor({ instrument, onClose }: { instrument: Instrument; onClose: () => void }) {
  const backend = useBackend();
  const qc = useQueryClient();
  const [form, setForm] = useState<Instrument>(instrument);
  const save = useMutation({
    mutationFn: () => backend.saveInstrument(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['data'] });
      onClose();
    },
  });
  return (
    <Modal title="Fiche du titre" onClose={onClose}>
      <div className="form-grid">
        <label className="field full">
          Nom
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label className="field">
          Type d'actif
          <select className="input" value={form.asset_class} onChange={(e) => setForm({ ...form, asset_class: e.target.value as AssetClass })}>
            {Object.entries(ASSET_CLASS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Devise
          <input className="input" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} />
        </label>
        <label className="field">
          Pays / zone
          <input className="input" placeholder="France, États-Unis, Monde…" value={form.country ?? ''} onChange={(e) => setForm({ ...form, country: e.target.value || null })} />
        </label>
        <label className="field">
          Secteur
          <input className="input" value={form.sector ?? ''} onChange={(e) => setForm({ ...form, sector: e.target.value || null })} />
        </label>
      </div>
      <p className="hint">Le pays et le secteur alimentent l'exposition géographique et sectorielle (utile pour les ETF « Monde »).</p>
      {save.error && <div className="error">{(save.error as Error).message}</div>}
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>
          Annuler
        </button>
        <button className="btn primary" disabled={save.isPending} onClick={() => save.mutate()}>
          Enregistrer
        </button>
      </div>
    </Modal>
  );
}

function ManualValuations({ symbol, currency }: { symbol: string; currency: string }) {
  const backend = useBackend();
  const qc = useQueryClient();
  const { state } = usePortfolio();
  const [d, setD] = useState(toISODate(new Date()));
  const [p, setP] = useState('');
  const list = [...(state?.data.manualPrices[symbol] ?? [])].reverse();
  const add = useMutation({
    mutationFn: () => backend.saveManualPrice(symbol, d, Number(p.replace(',', '.'))),
    onSuccess: () => {
      setP('');
      qc.invalidateQueries({ queryKey: ['data'] });
    },
  });
  const del = useMutation({
    mutationFn: (date: string) => backend.deleteManualPrice(symbol, date),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['data'] }),
  });
  const valid = d && Number(p.replace(',', '.')) > 0;
  return (
    <section className="card">
      <div className="card-title">Valeurs liquidatives</div>
      <p className="hint" style={{ marginTop: 0 }}>
        Ce support n'a pas de cotation automatique (fonds d'épargne salariale…). Saisissez la valeur de la part à partir de votre relevé : la courbe et la
        performance se mettent à jour.
      </p>
      <div className="toolbar">
        <input className="input" type="date" value={d} onChange={(e) => setD(e.target.value)} style={{ width: 170 }} />
        <input className="input" inputMode="decimal" placeholder={`Valeur de la part (${currency})`} value={p} onChange={(e) => setP(e.target.value)} style={{ width: 200 }} />
        <button className="btn primary" disabled={!valid || add.isPending} onClick={() => add.mutate()}>
          Ajouter
        </button>
      </div>
      <div className="list" style={{ marginTop: 10, maxHeight: 260, overflow: 'auto' }}>
        {list.map(([date_, price]) => (
          <div className="row" key={date_}>
            <div className="row-main">{date(date_)}</div>
            <div className="num">{money(price, currency)}</div>
            <button className="btn ghost small danger" onClick={() => del.mutate(date_)} aria-label="Supprimer">
              ×
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
