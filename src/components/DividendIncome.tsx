import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { PortfolioState } from '../lib/usePortfolio';
import type { UpcomingEvent } from '../../shared/calendar';
import { valueAtOrFirst } from '../../shared/series';
import { dividendIncome, type IncomeMonth } from '../lib/income';
import { compactEur, eur, monthLabel, pct } from '../lib/format';

const shortMonth = new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: 'UTC' });

/** "Revenus passifs": dividends received (12 months) and expected (next 12 months). */
export function DividendIncome({ state, events }: { state: PortfolioState; events: UpcomingEvent[] }) {
  const income = useMemo(
    () =>
      dividendIncome({
        transactions: state.data.transactions,
        toEUR: (t) => t.amount * (t.fx_rate ?? (t.currency === 'EUR' ? 1 : (valueAtOrFirst(state.fx[t.currency], t.date) ?? 1))),
        events,
        costBasis: state.result.positions.reduce((s, p) => s + p.costEUR, 0),
        today: state.today,
      }),
    [state, events],
  );
  const hasBars = income.months.some((m) => m.received || m.expected);

  return (
    <section className="card" style={{ marginBottom: 16 }}>
      <div className="kpi-label">Revenus passifs</div>
      <div className="grid grid-3" style={{ marginTop: 8 }}>
        <div>
          <div className="small muted">Reçus (12 derniers mois)</div>
          <div className="hero-value num" style={{ fontSize: 24 }}>{eur(income.trailing12m)}</div>
        </div>
        <div>
          <div className="small muted">Attendus (12 prochains mois)</div>
          <div className="hero-value num" style={{ fontSize: 24 }}>{eur(income.next12m)}</div>
        </div>
        <div>
          <div className="small muted">Rendement sur coût</div>
          <div className="hero-value num" style={{ fontSize: 24 }}>{income.yieldOnCost == null ? '—' : pct(income.yieldOnCost)}</div>
        </div>
      </div>
      {hasBars && (
        <div style={{ width: '100%', height: 160, marginTop: 12 }}>
          <ResponsiveContainer>
            <BarChart data={income.months} margin={{ top: 8, right: 0, left: 0, bottom: 0 }} barCategoryGap="20%">
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="month"
                tickFormatter={(m: string) => shortMonth.format(new Date(m + 'T00:00:00Z')).replace('.', '')}
                tick={{ fontSize: 11, fill: 'var(--text-3)' }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={16}
              />
              <YAxis orientation="right" tickFormatter={compactEur} tick={{ fontSize: 11, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} width={56} />
              <Tooltip
                cursor={{ fill: 'var(--border)', opacity: 0.4 }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const m = payload[0].payload as IncomeMonth;
                  return (
                    <div className="tooltip num">
                      <div className="t-date">{monthLabel(m.month)}</div>
                      {m.received > 0 && <div>Reçus : <b>{eur(m.received)}</b></div>}
                      {m.expected > 0 && <div className="muted">Attendus : {eur(m.expected)}</div>}
                      {!m.received && !m.expected && <div className="muted">Aucun dividende</div>}
                    </div>
                  );
                }}
              />
              <Bar dataKey="received" stackId="d" fill="var(--series-1)" isAnimationActive={false} />
              <Bar dataKey="expected" stackId="d" fill="var(--series-1)" fillOpacity={0.35} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {hasBars && (
        <div className="small muted" style={{ display: 'flex', gap: 16, marginTop: 6 }}>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'var(--series-1)', marginRight: 6 }} />Reçus</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'var(--series-1)', opacity: 0.35, marginRight: 6 }} />Attendus</span>
        </div>
      )}
      <div className="hint">Estimation sur vos quantités actuelles, avant impôts. Rendement sur coût = dividendes des 12 derniers mois / montant investi dans vos titres.</div>
    </section>
  );
}
