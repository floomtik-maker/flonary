import { CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Point, Transaction } from '../../shared/types';
import type { Signals } from '../../shared/analysis';
import { sma } from '../../shared/analysis';
import { date, dateNoYear, money } from '../lib/format';

interface Props {
  points: Point[];
  /** Full history used for moving averages (so they exist at the start of the window) */
  fullPoints: Point[];
  currency: string;
  avgPrice?: number;
  signals?: Signals | null;
  trades?: Transaction[];
  showZones?: boolean;
  height?: number;
}

export function PriceChart({ points, fullPoints, currency, avgPrice, signals, trades = [], showZones = true, height = 300 }: Props) {
  if (points.length < 2) return <div className="muted small" style={{ height, display: 'grid', placeItems: 'center' }}>Historique de cours indisponible</div>;
  const closes = fullPoints.map((p) => p[1]);
  const s50 = sma(closes, 50);
  const s200 = sma(closes, 200);
  const offset = fullPoints.length - points.length;
  const step = Math.max(1, Math.floor(points.length / 500));
  const data = points
    .map((p, i) => ({ date: p[0], close: p[1], sma50: s50[offset + i], sma200: s200[offset + i] }))
    .filter((_, i, arr) => i % step === 0 || i === arr.length - 1);
  const first = data[0].date;
  const spanDays = (Date.parse(data[data.length - 1].date) - Date.parse(first)) / 86_400_000;
  const fmtTick = (d: string) =>
    spanDays > 400 ? new Date(d + 'T00:00:00Z').toLocaleDateString('fr-FR', { month: 'short', year: '2-digit', timeZone: 'UTC' }) : dateNoYear(d);
  const visibleTrades = trades.filter((t) => (t.type === 'BUY' || t.type === 'SELL') && t.date >= first);
  const lastDate = data[data.length - 1].date;
  const vals = data.map((d) => d.close);
  const vlo = Math.min(...vals);
  const vhi = Math.max(...vals);
  // Reference levels only widen the axis when they are close to the visible prices,
  // otherwise a far-away PRU would flatten the price line.
  const near = (v: number | undefined): v is number => !!v && v >= vlo * 0.75 && v <= vhi * 1.25;
  const extra = [avgPrice, ...(showZones && signals ? [signals.entryZone[0], signals.exitZone[0]] : [])].filter(near);
  const lo = Math.min(vlo, ...extra);
  const hi = Math.max(vhi, ...extra);
  const pad = (hi - lo) * 0.06;

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="date" tickFormatter={fmtTick} tick={{ fontSize: 12, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} minTickGap={40} />
          <YAxis
            orientation="right"
            domain={[Math.max(0, lo - pad), hi + pad]}
            tickFormatter={(v: number) => money(v, currency)}
            tick={{ fontSize: 12, fill: 'var(--text-3)' }}
            axisLine={false}
            tickLine={false}
            width={72}
          />
          {showZones && signals && (
            <>
              <ReferenceArea y1={signals.entryZone[0]} y2={signals.entryZone[1]} x1={first} x2={lastDate} fill="var(--good)" fillOpacity={0.09} stroke="none" ifOverflow="hidden" />
              <ReferenceArea y1={signals.exitZone[0]} y2={signals.exitZone[1]} x1={first} x2={lastDate} fill="var(--warn)" fillOpacity={0.1} stroke="none" ifOverflow="hidden" />
            </>
          )}
          {near(avgPrice) ? (
            <ReferenceLine y={avgPrice} stroke="var(--series-7)" strokeDasharray="5 4" strokeWidth={1.5} label={{ value: 'PRU', position: 'insideTopLeft', fill: 'var(--series-7)', fontSize: 12 }} />
          ) : null}
          <Tooltip
            cursor={{ stroke: 'var(--text-3)', strokeWidth: 1 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as (typeof data)[number];
              return (
                <div className="tooltip num">
                  <div className="t-date">{date(p.date)}</div>
                  <div>
                    Cours : <b>{money(p.close, currency)}</b>
                  </div>
                  {p.sma50 != null && <div className="muted">Moy. 50 j : {money(p.sma50, currency)}</div>}
                  {p.sma200 != null && <div className="muted">Moy. 200 j : {money(p.sma200, currency)}</div>}
                </div>
              );
            }}
          />
          {showZones && <Line type="monotone" dataKey="sma200" stroke="var(--series-2)" strokeWidth={1.2} dot={false} isAnimationActive={false} connectNulls />}
          {showZones && <Line type="monotone" dataKey="sma50" stroke="var(--series-3)" strokeWidth={1.2} dot={false} isAnimationActive={false} connectNulls />}
          <Line type="monotone" dataKey="close" stroke="var(--series-1)" strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }} isAnimationActive={false} />
          {visibleTrades.map((t) => {
            // snap to the closest chart date so the marker sits on the axis
            const x = data.find((d) => d.date >= t.date)?.date ?? lastDate;
            return (
              <ReferenceDot
                key={t.id}
                x={x}
                y={t.price}
                r={5}
                fill={t.type === 'BUY' ? 'var(--good)' : 'var(--bad)'}
                stroke="var(--surface)"
                strokeWidth={2}
                ifOverflow="hidden"
              />
            );
          })}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
