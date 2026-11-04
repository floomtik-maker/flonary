import { Area, ComposedChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { SeriesPoint } from '../../shared/portfolio';
import { compactEur, date, dateNoYear, eur, signedEur, tone } from '../lib/format';

interface Props {
  points: SeriesPoint[];
  height?: number;
  /** 'value' = portfolio value vs money invested; 'gain' = cumulative gain */
  mode?: 'value' | 'gain';
}

/** Downsample to ~400 points so long histories stay smooth and fast. */
function thin(points: SeriesPoint[], max = 400): SeriesPoint[] {
  if (points.length <= max) return points;
  const step = points.length / max;
  const out: SeriesPoint[] = [];
  for (let i = 0; i < max; i++) out.push(points[Math.floor(i * step)]);
  out.push(points[points.length - 1]);
  return out;
}

export function PerformanceChart({ points, height = 260, mode = 'value' }: Props) {
  const data = thin(points);
  if (data.length < 2) return <div className="muted small" style={{ height, display: 'grid', placeItems: 'center' }}>Pas encore assez d'historique</div>;
  const spanDays = (Date.parse(data[data.length - 1].date) - Date.parse(data[0].date)) / 86_400_000;
  const tickFmt = (d: string) =>
    spanDays > 400 ? new Date(d + 'T00:00:00Z').toLocaleDateString('fr-FR', { month: 'short', year: '2-digit', timeZone: 'UTC' }) : dateNoYear(d);
  const key = mode === 'value' ? 'value' : 'gain';
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="valueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
          <XAxis dataKey="date" tickFormatter={tickFmt} tick={{ fontSize: 12, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} minTickGap={40} />
          <YAxis orientation="right" tickFormatter={compactEur} tick={{ fontSize: 12, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} width={64} domain={['auto', 'auto']} />
          <Tooltip
            cursor={{ stroke: 'var(--text-3)', strokeWidth: 1 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as SeriesPoint;
              return (
                <div className="tooltip num">
                  <div className="t-date">{date(p.date)}</div>
                  <div>
                    Valeur : <b>{eur(p.value)}</b>
                  </div>
                  <div className="muted">Investi : {eur(p.contributions)}</div>
                  <div className={tone(p.gain)}>Gain : {signedEur(p.gain)}</div>
                </div>
              );
            }}
          />
          {mode === 'value' && (
            <Line type="monotone" dataKey="contributions" stroke="var(--contrib)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
          )}
          <Area type="monotone" dataKey={key} stroke="var(--series-1)" strokeWidth={2} fill="url(#valueFill)" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
