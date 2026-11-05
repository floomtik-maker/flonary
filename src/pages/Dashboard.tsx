import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { usePortfolio } from '../lib/usePortfolio';
import { useUpcomingEvents } from '../lib/useEvents';
import { periodPerformance, type PeriodKey } from '../../shared/portfolio';
import { PerformanceChart } from '../components/PerformanceChart';
import { Avatar, Gain, PageLoading, Segmented } from '../components/ui';
import { BROKER_LABELS, dateNoYear, eur, pct, signedPct } from '../lib/format';
import { Welcome } from './Welcome';
import { BENCHMARK_LABEL, simulateBenchmark } from '../../shared/benchmark';

const PERIODS: { value: PeriodKey; label: string }[] = [
  { value: '1M', label: '1M' },
  { value: '6M', label: '6M' },
  { value: 'YTD', label: 'YTD' },
  { value: '1Y', label: '1A' },
  { value: 'ALL', label: 'Tout' },
];

export function Dashboard() {
  const { state, loading, error } = usePortfolio();
  const [period, setPeriod] = useState<PeriodKey>('1Y');
  const [showBench, setShowBench] = useState(false);
  const { events } = useUpcomingEvents(state, 90);
  const perf = useMemo(() => (state ? periodPerformance(state.result.series, period, state.today) : null), [state, period]);
  // Same flows invested in the world ETF over the selected window (starts from the portfolio value)
  const benchPeriod = useMemo(
    () => (showBench && perf && state?.benchmark ? simulateBenchmark(perf.points, state.benchmark.prices) : null),
    [showBench, perf, state],
  );

  if (error) return <div className="card error">{error}</div>;
  if (loading || !state || !perf) return <PageLoading />;
  if (state.data.transactions.length === 0) return <Welcome />;

  const { summary, positions, accounts, warnings } = state.result;
  const insights = buildInsights(state.benchmark?.result ?? null, positions, events);
  const realizedAndDiv = summary.realized + summary.dividends;

  return (
    <>
      <div className="page-head">
        <h1>Synthèse</h1>
        <Link className="btn primary" to="/mouvements?new=1">
          + Opération
        </Link>
      </div>
      <div className="grid grid-main">
        <div className="stack">
          <section className="card">
            <div className="hero-label">Valeur totale du portefeuille</div>
            <div className="hero-value num">{eur(summary.totalValue, { cents: false })}</div>
            <div className="toolbar">
              <Gain value={summary.totalGain} pct={summary.totalGainPct} pill />
              <span className="muted small">depuis le début · ventes et dividendes inclus</span>
            </div>

            <div className="toolbar" style={{ marginTop: 18, marginBottom: 6 }}>
              <span className="small" style={{ color: 'var(--text-2)' }}>
                Sur la période : <Gain value={perf.gain} /> · <span className="num">{signedPct(perf.twrPct)}</span>
              </span>
              <span className="spacer" />
              <Segmented value={period} options={PERIODS} onChange={setPeriod} />
            </div>
            <PerformanceChart points={perf.points} compare={benchPeriod ? { label: BENCHMARK_LABEL, points: benchPeriod.series } : undefined} />
            <div className="legend" style={{ marginTop: 8, alignItems: 'center' }}>
              <span>
                <i style={{ background: 'var(--series-1)' }} />
                Valeur
              </span>
              <span>
                <i style={{ background: 'var(--contrib)' }} />
                Argent investi
              </span>
              {benchPeriod && (
                <span>
                  <i style={{ background: 'var(--series-2)' }} />
                  {BENCHMARK_LABEL}
                </span>
              )}
              {state.benchmark && (
                <button
                  type="button"
                  className="chip"
                  aria-pressed={showBench}
                  onClick={() => setShowBench((v) => !v)}
                  style={{ marginLeft: 'auto', border: '1px solid var(--border)', cursor: 'pointer', ...(showBench ? { background: 'var(--series-2)', color: '#fff', borderColor: 'transparent' } : {}) }}
                >
                  Comparer à l'{BENCHMARK_LABEL}
                </button>
              )}
            </div>

            <div className="kpis">
              <div className="kpi">
                <div className="kpi-label">Plus-values latentes</div>
                <div className="kpi-value">
                  <Gain value={summary.unrealized} />
                </div>
              </div>
              <div className="kpi" title="Gains encaissés lors des ventes + dividendes reçus. Ils restent comptés dans votre performance.">
                <div className="kpi-label">Réalisé + dividendes</div>
                <div className="kpi-value">
                  <Gain value={realizedAndDiv} />
                </div>
              </div>
              <div className="kpi" title="Argent réellement versé (achats non financés par des ventes), moins les retraits.">
                <div className="kpi-label">Investi net</div>
                <div className="kpi-value num">{eur(summary.netContributions)}</div>
              </div>
            </div>
            {summary.cash > 1 && (
              <p className="hint" style={{ marginBottom: 0 }}>
                Dont {eur(summary.cash)} de liquidités issues de ventes et dividendes, toujours comptées dans le portefeuille.
              </p>
            )}
            {warnings.length > 0 && (
              <div className="warning-box" style={{ marginTop: 12 }}>
                {warnings.slice(0, 3).map((w) => (
                  <div key={w}>{w}</div>
                ))}
              </div>
            )}
            {state.marketError && <div className="warning-box" style={{ marginTop: 12 }}>Cours indisponibles : {state.marketError}. Valorisation au dernier prix connu.</div>}
          </section>

          <section className="card">
            <div className="card-title">
              Principales positions <Link to="/positions" className="small" style={{ color: 'var(--accent)' }}>Tout voir →</Link>
            </div>
            <div className="list">
              {positions.slice(0, 6).map((p) => (
                <Link to={`/positions/${encodeURIComponent(p.symbol)}`} className="row" key={p.symbol}>
                  <Avatar symbol={p.symbol} name={p.name} />
                  <div className="row-main">
                    <div className="row-title">{p.name}</div>
                    <div className="row-sub">{pct(p.weight)} du portefeuille</div>
                  </div>
                  <div className="row-right">
                    <div className="num" style={{ fontWeight: 600 }}>{eur(p.valueEUR)}</div>
                    <div className="small">
                      <Gain pct={p.unrealizedPct} />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </div>

        <div className="stack">
          {insights.length > 0 && (
            <section className="card">
              <div className="card-title">À retenir</div>
              <div className="list">
                {insights.map((t, i) => (
                  <div className="row" key={i} style={{ minHeight: 0 }}>
                    <div className="row-main small" style={{ color: 'var(--text-2)' }}>
                      {t}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="card">
            <div className="card-title">Comptes</div>
            <div className="list">
              {accounts
                .map((a) => ({ ...a, account: state.data.accounts.find((x) => x.id === a.account_id) }))
                .sort((a, b) => b.valueEUR - a.valueEUR)
                .map((a) => (
                  <div className="row" key={a.account_id}>
                    <div className="row-main">
                      <div className="row-title">{a.account?.name ?? 'Compte supprimé'}</div>
                      <div className="row-sub">
                        {a.account ? `${BROKER_LABELS[a.account.broker] ?? ''} · ${a.account.kind}` : ''}
                      </div>
                    </div>
                    <div className="row-right">
                      <div className="num" style={{ fontWeight: 600 }}>{eur(a.valueEUR)}</div>
                      <div className="small">
                        <Gain value={a.gainEUR} />
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </section>

          <section className="card">
            <div className="card-title">
              À venir <Link to="/calendrier" className="small" style={{ color: 'var(--accent)' }}>Calendrier →</Link>
            </div>
            {events.length === 0 && <div className="muted small">Aucun événement dans les 90 prochains jours.</div>}
            <div className="list">
              {events.slice(0, 5).map((e, i) => (
                <div className="row" key={i}>
                  <div style={{ width: 48, textAlign: 'center' }}>
                    <div className="small muted">{dateNoYear(e.date).split(' ')[1]}</div>
                    <div style={{ fontWeight: 700, fontSize: 18 }}>{dateNoYear(e.date).split(' ')[0]}</div>
                  </div>
                  <div className="row-main">
                    <div className="row-title">{e.name}</div>
                    <div className="row-sub">
                      {e.kind === 'earnings' ? 'Publication des résultats' : 'Détachement du dividende'}
                      {e.estimated ? ' (estimé)' : ''}
                    </div>
                  </div>
                  {e.expectedEUR ? <div className="row-right num up small">+{eur(e.expectedEUR)}</div> : null}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

type Insight = ReactNode;

/** At most 3 one-line takeaways computed from the data. */
function buildInsights(
  bench: ReturnType<typeof simulateBenchmark>,
  positions: { name: string; weight: number }[],
  events: { kind: string; date: string; expectedEUR?: number | null }[],
): Insight[] {
  const out: Insight[] = [];
  if (bench && Math.abs(bench.difference) >= 1) {
    const better = bench.difference > 0;
    out.push(
      <>
        Vous faites <b className={better ? 'up' : 'down'}>{better ? '+' : '−'}{eur(Math.abs(bench.difference), { cents: false })}</b> {better ? 'de plus' : 'de moins'} qu'un {BENCHMARK_LABEL} depuis le début
      </>,
    );
  }
  const top = positions[0];
  if (top && top.weight >= 0.1) {
    out.push(
      <>
        {top.name} pèse <b>{pct(top.weight)}</b> du portefeuille
      </>,
    );
  }
  const div = events.find((e) => e.kind !== 'earnings' && e.expectedEUR);
  if (div) {
    out.push(
      <>
        Prochain dividende : <b className="up">{eur(div.expectedEUR!)}</b> le {dateNoYear(div.date)}
      </>,
    );
  }
  return out.slice(0, 3);
}
