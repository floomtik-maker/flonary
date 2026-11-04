import { useMemo, useState } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { usePortfolio } from '../lib/usePortfolio';
import { project } from '../../shared/analysis';
import { PageLoading } from '../components/ui';
import { compactEur, eur, pct } from '../lib/format';
import { parseNumber } from '../../shared/importers/csv';

export function Projection() {
  const { state, loading, error } = usePortfolio();
  const current = Math.round(state?.result.summary.totalValue ?? 0);
  const historical = useMemo(() => {
    const s = state?.result.series ?? [];
    const first = s.find((x) => x.value > 0);
    const last = s.at(-1);
    if (!first || !last) return null;
    const years = (Date.parse(last.date) - Date.parse(first.date)) / (365.25 * 86_400_000);
    return years >= 1 ? Math.pow(last.twr, 1 / years) - 1 : null;
  }, [state]);

  const [initial, setInitial] = useState<string | null>(null);
  const [monthly, setMonthly] = useState('300');
  const [years, setYears] = useState(15);
  const [rate, setRate] = useState(7);

  const init = initial ?? String(current);
  const data = useMemo(
    () =>
      project({
        initial: Math.max(0, parseNumber(init) || 0),
        monthly: Math.max(0, parseNumber(monthly) || 0),
        years,
        annualReturn: rate / 100,
        startDate: state?.today ?? new Date().toISOString().slice(0, 10),
      }).map((p) => ({ ...p, band: [p.low, p.high] as [number, number] })),
    [init, monthly, years, rate, state?.today],
  );

  if (error) return <div className="card error">{error}</div>;
  if (loading || !state) return <PageLoading />;
  const end = data[data.length - 1];
  const gains = end.value - end.contributed;

  return (
    <>
      <div className="page-head">
        <h1>Projection</h1>
      </div>
      <div className="grid grid-main">
        <section className="card">
          <div className="hero-label">Dans {years} ans, votre portefeuille pourrait valoir</div>
          <div className="hero-value num">{eur(end.value)}</div>
          <div className="small muted">
            fourchette {eur(end.low)} – {eur(end.high)} (rendement {rate - 3} % à {rate + 3} %)
          </div>
          <div style={{ width: '100%', height: 300, marginTop: 16 }}>
            <ResponsiveContainer>
              <ComposedChart data={data} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d: string) => d.slice(0, 4)}
                  tick={{ fontSize: 12, fill: 'var(--text-3)' }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={40}
                />
                <YAxis orientation="right" tickFormatter={compactEur} tick={{ fontSize: 12, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} width={64} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload as (typeof data)[number];
                    return (
                      <div className="tooltip num">
                        <div className="t-date">{p.date.slice(0, 7)}</div>
                        <div>
                          Valeur : <b>{eur(p.value)}</b>
                        </div>
                        <div className="muted">Versé : {eur(p.contributed)}</div>
                        <div className="up">Intérêts composés : +{eur(p.value - p.contributed)}</div>
                      </div>
                    );
                  }}
                />
                <Area dataKey="band" stroke="none" fill="var(--series-1)" fillOpacity={0.1} isAnimationActive={false} />
                <Line dataKey="contributed" stroke="var(--contrib)" strokeDasharray="4 4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                <Line dataKey="value" stroke="var(--series-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="legend" style={{ marginTop: 8 }}>
            <span>
              <i style={{ background: 'var(--series-1)' }} />
              Valeur projetée
            </span>
            <span>
              <i style={{ background: 'var(--contrib)' }} />
              Total versé
            </span>
            <span>
              <i style={{ background: 'var(--series-1)', opacity: 0.25, height: 8 }} />
              Fourchette ±3 pts
            </span>
          </div>
          <div className="kpis">
            <div className="kpi">
              <div className="kpi-label">Total versé</div>
              <div className="kpi-value num">{eur(end.contributed)}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Gains des intérêts composés</div>
              <div className="kpi-value num up">+{eur(gains)}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Part des gains</div>
              <div className="kpi-value num">{pct(end.value > 0 ? gains / end.value : 0)}</div>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-title">Hypothèses</div>
          <div className="stack" style={{ gap: 14 }}>
            <label className="field">
              Capital de départ (€)
              <input className="input" inputMode="decimal" value={init} onChange={(e) => setInitial(e.target.value)} />
              <span className="hint">Par défaut : la valeur actuelle de votre portefeuille.</span>
            </label>
            <label className="field">
              Versement mensuel (€)
              <input className="input" inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} />
            </label>
            <label className="field">
              Durée : {years} ans
              <input type="range" min={1} max={40} value={years} onChange={(e) => setYears(Number(e.target.value))} />
            </label>
            <label className="field">
              Rendement annuel moyen : {rate} %
              <input type="range" min={0} max={15} step={0.5} value={rate} onChange={(e) => setRate(Number(e.target.value))} />
            </label>
            {historical != null && (
              <button className="btn small" onClick={() => setRate(Math.max(0, Math.min(15, Math.round(historical * 200) / 2)))}>
                Utiliser mon rendement historique ({pct(historical)} / an)
              </button>
            )}
            <p className="hint" style={{ margin: 0 }}>
              Repère : les actions mondiales ont rapporté environ 7 % par an en moyenne sur longue période, avec de fortes variations d'une année à l'autre.
              Projection hors fiscalité et inflation.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}
