import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { usePortfolio } from '../lib/usePortfolio';
import { useUpcomingEvents } from '../lib/useEvents';
import { positionMetrics, type PositionMetrics } from '../lib/positionMetrics';
import { Avatar, DataTable, Gain, PageLoading, Segmented, Tabs, type Column } from '../components/ui';
import { PageHeader } from '../components/PageHeader';
import { eur, money, pct, qty, date, dateNoYear } from '../lib/format';
import { countryFr, sectorFr } from '../../shared/geo';
import { RISK_LABELS } from '../../shared/analysis';
import { valueAtOrFirst } from '../../shared/series';
import type { Position } from '../../shared/portfolio';
import type { UpcomingEvent } from '../../shared/calendar';

type View = 'apercu' | 'performance' | 'valorisation' | 'dividendes' | 'risque';
const VIEWS: { value: View; label: string }[] = [
  { value: 'apercu', label: 'Aperçu' },
  { value: 'performance', label: 'Performance' },
  { value: 'valorisation', label: 'Valorisation' },
  { value: 'dividendes', label: 'Dividendes' },
  { value: 'risque', label: 'Risque' },
];

interface Row {
  p: Position;
  m: PositionMetrics;
  /** Next ex-dividend date known or estimated (dividends view only) */
  nextDiv: UpcomingEvent | undefined;
}

const sum = (rows: Row[], f: (r: Row) => number) => rows.reduce((s, r) => s + f(r), 0);
const dash = <span className="muted">—</span>;
/** Signed, coloured variation (ratio) or a dash when unknown */
const change = (v: number | null) => (v == null ? dash : <Gain pct={v} />);
/** Sort key that keeps null last */
const num = (v: number | null | undefined) => v ?? null;

function riskPill(risk: number | null) {
  if (risk == null) return dash;
  const tone = risk <= 3 ? 'neutral' : risk <= 5 ? 'warn' : 'down';
  return (
    <span className={`pill ${tone}`} title={`Risque ${risk} sur 7`}>
      {risk}/7 · {RISK_LABELS[risk]}
    </span>
  );
}

export function Positions() {
  const { state, loading, error } = usePortfolio();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState<'open' | 'closed'>('open');
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  const view = (VIEWS.find((v) => v.value === params.get('vue'))?.value ?? 'apercu') as View;
  const setView = (v: View) => {
    const next = new URLSearchParams(params);
    if (v === 'apercu') next.delete('vue');
    else next.set('vue', v);
    setParams(next, { replace: true });
  };

  // Upcoming dividends cost profile lookups: only fetched while the Dividendes view is open
  const { events } = useUpcomingEvents(view === 'dividendes' && status === 'open' ? state : null);

  const rows = useMemo<Row[]>(() => {
    if (!state) return [];
    const fxRate = (c: string) => valueAtOrFirst(state.fx[c === 'GBp' ? 'GBP' : c], state.today) ?? 1;
    const fxToEUR = (c: string) => (c === 'EUR' ? 1 : c === 'GBp' ? fxRate(c) / 100 : fxRate(c));
    const nextByDiv = new Map<string, UpcomingEvent>();
    for (const e of events) if (e.kind === 'ex_dividend' && !nextByDiv.has(e.symbol)) nextByDiv.set(e.symbol, e);
    return state.result.positions.map((p) => ({
      p,
      m: positionMetrics({ symbol: p.symbol, quantity: p.quantity, price: p.price, history: state.histories[p.symbol], today: state.today, fxToEUR }),
      nextDiv: nextByDiv.get(p.symbol),
    }));
  }, [state, events]);

  if (error) return <div className="card error">{error}</div>;
  if (loading || !state) return <PageLoading />;
  const { closedPositions, summary } = state.result;
  const accountName = (id: string) => state.data.accounts.find((a) => a.id === id)?.name ?? '';

  const q = query.trim().toLowerCase();
  const matches = (p: Position) =>
    !q || [p.name, p.symbol, countryFr(p.country), sectorFr(p.sector)].some((t) => (t ?? '').toLowerCase().includes(q));
  const shown = rows.filter((r) => matches(r.p));
  const shownClosed = closedPositions.filter(matches);

  const titleCol: Column<Row> = {
    key: 'title',
    label: 'Titre',
    sort: (r) => r.p.name,
    foot: 'Total',
    render: ({ p }) => (
      <div className="cell-title">
        <Avatar symbol={p.symbol} name={p.name} />
        <div className="cell-title-text">
          <div className="cell-name">{p.name}</div>
          <div className="muted small">
            {p.symbol.startsWith('manual:') ? 'Valorisation manuelle' : p.symbol}
            {p.accounts.length > 0 && ` · ${p.accounts.map(accountName).join(', ')}`}
          </div>
        </div>
      </div>
    ),
  };
  const weightCol: Column<Row> = { key: 'weight', label: 'Poids', right: true, sort: (r) => r.p.weight, render: ({ p }) => pct(p.weight), foot: pct(sum(shown, (r) => r.p.weight)) };
  const priceCol: Column<Row> = { key: 'price', label: 'Cours', right: true, render: ({ p }) => money(p.price, p.currency) };
  const dayCol: Column<Row> = { key: 'd1', label: 'Jour', right: true, sort: (r) => num(r.p.dayChangePct), render: ({ p }) => change(p.dayChangePct == null ? null : p.dayChangePct / 100) };
  const valueCol = (foot = true): Column<Row> => ({
    key: 'value',
    label: 'Valeur',
    right: true,
    sort: (r) => r.p.valueEUR,
    render: ({ p }) => <b>{eur(p.valueEUR)}</b>,
    foot: foot ? <b>{eur(sum(shown, (r) => r.p.valueEUR))}</b> : undefined,
  });

  const columns: Record<View, Column<Row>[]> = {
    apercu: [
      titleCol,
      { key: 'country', label: 'Pays', sort: (r) => countryFr(r.p.country), render: ({ p }) => countryFr(p.country) ?? dash },
      { key: 'sector', label: 'Secteur', sort: (r) => sectorFr(r.p.sector), render: ({ p }) => sectorFr(p.sector) ?? dash },
      priceCol,
      dayCol,
      valueCol(),
      {
        key: 'unrealized',
        label: '+/- value latente',
        hint: 'Écart entre la valeur actuelle et votre prix de revient (PRU)',
        right: true,
        sort: (r) => r.p.unrealizedEUR,
        render: ({ p }) => (
          <>
            <Gain value={p.unrealizedEUR} />
            <div className="small">
              <Gain pct={p.unrealizedPct} />
            </div>
          </>
        ),
        foot: <Gain value={sum(shown, (r) => r.p.unrealizedEUR)} />,
      },
      weightCol,
    ],
    performance: [
      titleCol,
      dayCol,
      { key: 'w1', label: '1 sem.', right: true, sort: (r) => num(r.m.w1), render: ({ m }) => change(m.w1) },
      { key: 'm1', label: '1 mois', right: true, sort: (r) => num(r.m.m1), render: ({ m }) => change(m.m1) },
      { key: 'ytd', label: 'Depuis janv.', hint: 'Variation du cours depuis le 1er janvier', right: true, sort: (r) => num(r.m.ytd), render: ({ m }) => change(m.ytd) },
      { key: 'y1', label: '1 an', right: true, sort: (r) => num(r.m.y1), render: ({ m }) => change(m.y1) },
      {
        key: 'total',
        label: 'Gain total',
        hint: 'Plus-value latente + gains réalisés sur les ventes + dividendes',
        right: true,
        sort: (r) => r.p.totalGainEUR,
        render: ({ p }) => <Gain value={p.totalGainEUR} />,
        foot: <Gain value={sum(shown, (r) => r.p.totalGainEUR)} />,
      },
    ],
    valorisation: [
      titleCol,
      { key: 'qty', label: 'Quantité', right: true, sort: (r) => r.p.quantity, render: ({ p }) => qty(p.quantity) },
      { key: 'pru', label: 'PRU', hint: 'Prix de revient unitaire (frais d’achat inclus)', right: true, sort: (r) => r.p.avgPrice, render: ({ p }) => money(p.avgPrice, p.currency) },
      priceCol,
      { key: 'cost', label: 'Coût de revient', right: true, sort: (r) => r.p.costEUR, render: ({ p }) => eur(p.costEUR), foot: eur(sum(shown, (r) => r.p.costEUR)) },
      valueCol(),
      weightCol,
    ],
    dividendes: [
      titleCol,
      { key: 'yield', label: 'Rendement', hint: 'Dividendes des 12 derniers mois rapportés au cours', right: true, sort: (r) => num(r.m.yield), render: ({ m }) => (m.yield == null ? dash : pct(m.yield)) },
      {
        key: 'dps',
        label: 'Par titre (12 mois)',
        right: true,
        sort: (r) => num(r.m.dividendPerShare),
        render: ({ p, m }) => (m.dividendPerShare == null ? dash : money(m.dividendPerShare, p.currency)),
      },
      {
        key: 'income',
        label: 'Revenu annuel estimé',
        hint: 'Dividendes des 12 derniers mois × titres détenus',
        right: true,
        sort: (r) => num(r.m.incomeEUR),
        render: ({ m }) => (m.incomeEUR == null ? dash : eur(m.incomeEUR)),
        foot: eur(sum(shown, (r) => r.m.incomeEUR ?? 0)),
      },
      {
        key: 'received',
        label: 'Déjà perçus',
        hint: 'Total des dividendes encaissés depuis le début',
        right: true,
        sort: (r) => r.p.dividendsEUR,
        render: ({ p }) => (p.dividendsEUR > 0 ? eur(p.dividendsEUR) : dash),
        foot: eur(sum(shown, (r) => r.p.dividendsEUR)),
      },
      {
        key: 'next',
        label: 'Prochain détachement',
        hint: '« ~ » = date estimée d’après l’an dernier',
        right: true,
        sort: (r) => r.nextDiv?.date ?? null,
        render: ({ nextDiv }) => (nextDiv ? `${nextDiv.estimated ? '~ ' : ''}${dateNoYear(nextDiv.date)}` : dash),
      },
    ],
    risque: [
      titleCol,
      { key: 'risk', label: 'Risque', hint: 'Échelle 1 à 7 calculée sur la volatilité du dernier an', right: true, sort: (r) => num(r.m.risk), render: ({ m }) => riskPill(m.risk) },
      { key: 'vol', label: 'Volatilité 1 an', right: true, sort: (r) => num(r.m.vol), render: ({ m }) => (m.vol == null ? dash : pct(m.vol)) },
      {
        key: 'dd',
        label: 'Baisse max. 1 an',
        hint: 'Plus forte baisse entre un sommet et le creux suivant sur un an',
        right: true,
        sort: (r) => num(r.m.drawdown),
        render: ({ m }) => (m.drawdown == null ? dash : <Gain pct={m.drawdown} />),
      },
      weightCol,
    ],
  };

  const closedColumns: Column<Position>[] = [
    {
      key: 'title',
      label: 'Titre',
      sort: (p) => p.name,
      render: (p) => (
        <div className="cell-title">
          <Avatar symbol={p.symbol} name={p.name} />
          <div className="cell-title-text">
            <div className="cell-name">{p.name}</div>
            <div className="muted small">{p.symbol.startsWith('manual:') ? 'Valorisation manuelle' : p.symbol}</div>
          </div>
        </div>
      ),
    },
    { key: 'first', label: 'Premier achat', sort: (p) => p.firstBuy, render: (p) => (p.firstBuy ? date(p.firstBuy) : dash) },
    { key: 'realized', label: 'Gain réalisé', right: true, sort: (p) => p.realizedEUR, render: (p) => <Gain value={p.realizedEUR} /> },
    { key: 'div', label: 'Dividendes', right: true, sort: (p) => p.dividendsEUR, render: (p) => (p.dividendsEUR > 0 ? eur(p.dividendsEUR) : dash) },
    { key: 'total', label: 'Total', right: true, sort: (p) => p.realizedEUR + p.dividendsEUR, render: (p) => <Gain value={p.realizedEUR + p.dividendsEUR} /> },
  ];

  const go = (symbol: string) => navigate(`/positions/${encodeURIComponent(symbol)}`);

  return (
    <>
      <PageHeader title="Positions" search={{ value: query, onChange: setQuery, placeholder: 'Rechercher un titre…' }} />

      <div className="view-bar">
        {status === 'open' ? <Tabs value={view} onChange={setView} options={VIEWS} label="Vue du tableau" /> : <span />}
        <Segmented
          value={status}
          onChange={setStatus}
          options={[
            { value: 'open', label: `En portefeuille (${rows.length})` },
            { value: 'closed', label: `Vendues (${closedPositions.length})` },
          ]}
        />
      </div>

      {status === 'open' ? (
        <section className="card table-card">
          <DataTable
            key={view}
            columns={columns[view]}
            rows={shown}
            rowKey={(r) => r.p.symbol}
            onRowClick={(r) => go(r.p.symbol)}
            empty={<div className="empty">{rows.length === 0 ? 'Aucune position ouverte.' : 'Aucun titre ne correspond à la recherche.'}</div>}
          />
          {view === 'performance' && <p className="hint table-note">Le gain total inclut les plus-values réalisées sur les ventes et les dividendes. Les variations portent sur le cours.</p>}
          {view === 'dividendes' && <p className="hint table-note">Estimations d’après les dividendes des 12 derniers mois ; elles ne garantissent pas les versements à venir.</p>}
        </section>
      ) : (
        <section className="card table-card">
          <p className="hint table-note" style={{ marginTop: 0 }}>
            Les gains des titres vendus restent dans votre performance globale :{' '}
            <Gain value={closedPositions.reduce((s, p) => s + p.realizedEUR + p.dividendsEUR, 0)} /> au total.
          </p>
          <DataTable
            columns={closedColumns}
            rows={shownClosed}
            rowKey={(p) => p.symbol}
            onRowClick={(p) => go(p.symbol)}
            empty={<div className="empty">{closedPositions.length === 0 ? 'Aucune position soldée pour l’instant.' : 'Aucun titre ne correspond à la recherche.'}</div>}
          />
        </section>
      )}
      <p className="hint">
        Total réalisé (ventes) : <Gain value={summary.realized} /> · Dividendes : <Gain value={summary.dividends} />
      </p>
    </>
  );
}
