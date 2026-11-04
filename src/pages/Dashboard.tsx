import { useState } from 'react';
import { Link } from 'react-router-dom';
import { usePortfolio } from '../lib/usePortfolio';
import { useUpcomingEvents } from '../lib/useEvents';
import { periodPerformance, type PeriodKey } from '../../shared/portfolio';
import { PerformanceChart } from '../components/PerformanceChart';
import { Avatar, Gain, PageLoading, Segmented } from '../components/ui';
import { BROKER_LABELS, dateNoYear, eur, pct, signedPct } from '../lib/format';
import { Welcome } from './Welcome';

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
  const { events } = useUpcomingEvents(state, 90);

  if (error) return <div className="card error">{error}</div>;
  if (loading || !state) return <PageLoading />;
  if (state.data.transactions.length === 0) return <Welcome />;

  const { summary, positions, accounts, series, warnings } = state.result;
  const perf = periodPerformance(series, period, state.today);
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
            <PerformanceChart points={perf.points} />
            <div className="legend" style={{ marginTop: 8 }}>
              <span>
                <i style={{ background: 'var(--series-1)' }} />
                Valeur
              </span>
              <span>
                <i style={{ background: 'var(--contrib)' }} />
                Argent investi
              </span>
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
