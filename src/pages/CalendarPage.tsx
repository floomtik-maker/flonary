import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePortfolio } from '../lib/usePortfolio';
import { useUpcomingEvents } from '../lib/useEvents';
import { Empty, PageLoading, Segmented } from '../components/ui';
import { dateNoYear, eur, monthLabel } from '../lib/format';
import { valueAtOrFirst } from '../../shared/series';

type Filter = 'all' | 'div' | 'earnings';

export function CalendarPage() {
  const { state, loading, error } = usePortfolio();
  const { events, loading: evLoading } = useUpcomingEvents(state, 365);
  const [filter, setFilter] = useState<Filter>('all');

  const received = useMemo(() => {
    if (!state) return 0;
    const year = state.today.slice(0, 4);
    return state.data.transactions
      .filter((t) => t.type === 'DIVIDEND' && t.date.startsWith(year))
      .reduce((s, t) => s + t.amount * (t.fx_rate ?? (t.currency === 'EUR' ? 1 : (valueAtOrFirst(state.fx[t.currency], t.date) ?? 1))), 0);
  }, [state]);

  if (error) return <div className="card error">{error}</div>;
  if (loading || !state) return <PageLoading />;

  const list = events.filter((e) => (filter === 'all' ? e.kind !== 'dividend_payment' : filter === 'div' ? e.kind !== 'earnings' : e.kind === 'earnings'));
  const expected12m = events.filter((e) => e.kind === 'ex_dividend').reduce((s, e) => s + (e.expectedEUR ?? 0), 0);
  const byMonth = new Map<string, typeof list>();
  for (const e of list) {
    const k = e.date.slice(0, 7) + '-01';
    byMonth.set(k, [...(byMonth.get(k) ?? []), e]);
  }

  return (
    <>
      <div className="page-head">
        <h1>Calendrier</h1>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Tout' },
            { value: 'div', label: 'Dividendes' },
            { value: 'earnings', label: 'Résultats' },
          ]}
        />
      </div>
      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="kpi-label">Dividendes attendus (12 mois)</div>
          <div className="hero-value num" style={{ fontSize: 28 }}>{eur(expected12m)}</div>
          <div className="hint">Estimation sur vos quantités actuelles, avant impôts.</div>
        </div>
        <div className="card">
          <div className="kpi-label">Dividendes reçus en {state.today.slice(0, 4)}</div>
          <div className="hero-value num" style={{ fontSize: 28 }}>{eur(received)}</div>
          <div className="hint">D'après vos opérations enregistrées.</div>
        </div>
      </div>
      <section className="card">
        {evLoading && list.length === 0 && <p className="muted">Chargement des événements…</p>}
        {!evLoading && list.length === 0 && <Empty title="Aucun événement à venir">Les dates de résultats et de dividendes de vos titres s'afficheront ici.</Empty>}
        {[...byMonth.entries()].map(([month, evs]) => (
          <div key={month} style={{ marginBottom: 18 }}>
            <div className="small muted" style={{ fontWeight: 600, marginBottom: 4 }}>
              {monthLabel(month)}
            </div>
            <div className="list">
              {evs.map((e, i) => (
                <Link key={i} to={`/positions/${encodeURIComponent(e.symbol)}`} className="row">
                  <div className="num" style={{ width: 64, fontWeight: 600 }}>
                    {dateNoYear(e.date)}
                  </div>
                  <span className={`pill ${e.kind === 'earnings' ? 'neutral' : 'up'}`} style={{ minWidth: 92, justifyContent: 'center' }}>
                    {e.kind === 'earnings' ? 'Résultats' : e.kind === 'dividend_payment' ? 'Paiement' : 'Dividende'}
                  </span>
                  <div className="row-main">
                    <div className="row-title">{e.name}</div>
                    <div className="row-sub">
                      {e.kind === 'earnings' ? 'Publication trimestrielle / annuelle' : e.amount ? `${e.amount.toLocaleString('fr-FR')} ${e.currency ?? ''} par action` : ''}
                      {e.estimated ? ' · date estimée' : ''}
                    </div>
                  </div>
                  {e.expectedEUR ? <span className="num up">+{eur(e.expectedEUR)}</span> : null}
                </Link>
              ))}
            </div>
          </div>
        ))}
        <p className="disclaimer">« Date estimée » : calculée à partir du dividende versé l'an dernier, en attendant l'annonce officielle.</p>
      </section>
    </>
  );
}
