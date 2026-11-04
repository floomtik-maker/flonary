/**
 * Synthetic demo portfolio. Prices are random walks (deterministic per symbol) anchored on
 * plausible levels — NOT real market data. Used by `npm run dev:demo`, the shareable demo
 * build, and as a playground before the real API is configured.
 */
import type { Account, CalendarEvent, Instrument, Point, PriceHistory, Transaction } from '../../shared/types';
import type { UserData } from '../api/backend';
import { addDays, addMonths, toISODate } from '../../shared/series';

export interface DemoInstrumentSpec extends Instrument {
  target: number; // price today
  drift: number; // annual
  vol: number; // annual
  /** [month (1-12), day, amount per share] — paid every year */
  dividends?: [number, number, number][];
  /** Months (1-12) when quarterly results are published */
  earningsMonths?: number[];
}

export const DEMO_CATALOG: DemoInstrumentSpec[] = [
  { symbol: 'AAPL', name: 'Apple', currency: 'USD', asset_class: 'stock', country: 'États-Unis', sector: 'Technologie', target: 262, drift: 0.14, vol: 0.27, dividends: [[2, 9, 0.26], [5, 12, 0.26], [8, 11, 0.26], [11, 10, 0.26]], earningsMonths: [1, 4, 7, 10] },
  { symbol: 'MSFT', name: 'Microsoft', currency: 'USD', asset_class: 'stock', country: 'États-Unis', sector: 'Technologie', target: 498, drift: 0.16, vol: 0.24, dividends: [[2, 19, 0.83], [5, 15, 0.83], [8, 21, 0.83], [11, 20, 0.91]], earningsMonths: [1, 4, 7, 10] },
  { symbol: 'NVDA', name: 'NVIDIA', currency: 'USD', asset_class: 'stock', country: 'États-Unis', sector: 'Semi-conducteurs', target: 187, drift: 0.55, vol: 0.5, earningsMonths: [2, 5, 8, 11] },
  { symbol: 'ASML.AS', name: 'ASML Holding', currency: 'EUR', asset_class: 'stock', country: 'Pays-Bas', sector: 'Semi-conducteurs', target: 868, drift: 0.1, vol: 0.36, dividends: [[4, 28, 1.84], [10, 28, 1.6]], earningsMonths: [1, 4, 7, 10] },
  { symbol: 'MC.PA', name: 'LVMH', currency: 'EUR', asset_class: 'stock', country: 'France', sector: 'Luxe', target: 612, drift: -0.02, vol: 0.28, dividends: [[4, 28, 7.5], [12, 3, 5.5]], earningsMonths: [1, 4, 7, 10] },
  { symbol: 'AI.PA', name: 'Air Liquide', currency: 'EUR', asset_class: 'stock', country: 'France', sector: 'Matériaux', target: 172, drift: 0.09, vol: 0.18, dividends: [[5, 19, 3.3]], earningsMonths: [2, 4, 7, 10] },
  { symbol: 'TTE.PA', name: 'TotalEnergies', currency: 'EUR', asset_class: 'stock', country: 'France', sector: 'Énergie', target: 54.8, drift: 0.05, vol: 0.22, dividends: [[1, 2, 0.79], [3, 21, 0.85], [6, 19, 0.85], [9, 22, 0.85]], earningsMonths: [2, 4, 7, 10] },
  { symbol: 'SAN.PA', name: 'Sanofi', currency: 'EUR', asset_class: 'stock', country: 'France', sector: 'Santé', target: 88, drift: 0.02, vol: 0.2, dividends: [[5, 12, 3.92]], earningsMonths: [2, 4, 7, 10] },
  { symbol: 'CW8.PA', name: 'Amundi MSCI World UCITS ETF', currency: 'EUR', asset_class: 'etf', country: 'Monde', sector: 'ETF Actions monde', target: 598, drift: 0.1, vol: 0.15 },
  { symbol: 'manual:pee-actions-monde', name: 'FCPE Actions Monde (PEE BNP)', currency: 'EUR', asset_class: 'fund', country: 'Monde', sector: 'Fonds actions', manual: true, target: 31.4, drift: 0.08, vol: 0.13 },
  // Extra symbols available in the demo search
  { symbol: 'GOOGL', name: 'Alphabet', currency: 'USD', asset_class: 'stock', country: 'États-Unis', sector: 'Technologie', target: 251, drift: 0.15, vol: 0.3, earningsMonths: [2, 4, 7, 10] },
  { symbol: 'AMZN', name: 'Amazon', currency: 'USD', asset_class: 'stock', country: 'États-Unis', sector: 'Consommation', target: 228, drift: 0.12, vol: 0.32, earningsMonths: [2, 4, 7, 10] },
  { symbol: 'AIR.PA', name: 'Airbus', currency: 'EUR', asset_class: 'stock', country: 'France', sector: 'Aéronautique', target: 205, drift: 0.13, vol: 0.27, dividends: [[4, 22, 2.0]], earningsMonths: [2, 4, 7, 10] },
  { symbol: 'SU.PA', name: 'Schneider Electric', currency: 'EUR', asset_class: 'stock', country: 'France', sector: 'Industrie', target: 238, drift: 0.15, vol: 0.25, dividends: [[5, 8, 3.9]], earningsMonths: [2, 4, 7, 10] },
  { symbol: 'ESE.PA', name: 'BNP Paribas Easy S&P 500 UCITS ETF', currency: 'EUR', asset_class: 'etf', country: 'États-Unis', sector: 'ETF Actions US', target: 27.9, drift: 0.12, vol: 0.17 },
];

export const DEMO_START = '2022-01-03';

/** Mulberry32 seeded PRNG */
function prng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function gaussian(rand: () => number) {
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function businessDays(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const wd = new Date(d + 'T00:00:00Z').getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(d);
  }
  return out;
}

export function syntheticHistory(spec: DemoInstrumentSpec, today: string): PriceHistory {
  const days = businessDays(DEMO_START, today);
  const rand = prng(hash(spec.symbol));
  const dt = 1 / 252;
  const logs: number[] = [0];
  for (let i = 1; i < days.length; i++) {
    const shock = gaussian(rand) * spec.vol * Math.sqrt(dt);
    logs.push(logs[i - 1] + (spec.drift - (spec.vol * spec.vol) / 2) * dt + shock);
  }
  const shift = Math.log(spec.target) - logs[logs.length - 1];
  const points: Point[] = days.map((d, i) => [d, round2(Math.exp(logs[i] + shift))]);
  const dividends: Point[] = [];
  for (const [m, day, amount] of spec.dividends ?? []) {
    for (let y = 2022; y <= Number(today.slice(0, 4)); y++) {
      const d = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      if (d >= DEMO_START && d <= today) dividends.push([d, amount]);
    }
  }
  dividends.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return { symbol: spec.symbol, currency: spec.currency, points, dividends };
}

/** EUR per USD around 0.92 */
export function syntheticFx(currency: string, today: string): Point[] {
  const days = businessDays(DEMO_START, today);
  const rand = prng(hash('fx' + currency));
  const base = currency === 'USD' ? 0.91 : currency === 'GBP' ? 1.17 : currency === 'CHF' ? 1.05 : 1;
  let x = 0;
  return days.map((d) => {
    x = x * 0.995 + gaussian(rand) * 0.004;
    return [d, Math.round(base * (1 + x) * 10000) / 10000];
  });
}

export function syntheticEvents(spec: DemoInstrumentSpec, today: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const year = Number(today.slice(0, 4));
  for (const y of [year, year + 1]) {
    for (const m of spec.earningsMonths ?? []) {
      const d = `${y}-${String(m).padStart(2, '0')}-${String(20 + (hash(spec.symbol + m) % 8)).padStart(2, '0')}`;
      if (d >= today) events.push({ symbol: spec.symbol, date: d, kind: 'earnings' });
    }
  }
  // Announce only the very next dividend (the rest is estimated by the calendar logic)
  const nextDiv = (spec.dividends ?? [])
    .map(([m, day, amount]) => {
      let d = `${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      if (d < today) d = `${year + 1}-${d.slice(5)}`;
      return { d, amount };
    })
    .sort((a, b) => (a.d < b.d ? -1 : 1))[0];
  if (nextDiv) events.push({ symbol: spec.symbol, date: nextDiv.d, kind: 'ex_dividend', amount: nextDiv.amount, currency: spec.currency });
  return events.sort((a, b) => (a.date < b.date ? -1 : 1)).slice(0, 4);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function buildDemoData(today = toISODate(new Date())): UserData {
  const spec = (s: string) => DEMO_CATALOG.find((c) => c.symbol === s)!;
  const hist: Record<string, PriceHistory> = {};
  const h = (s: string) => (hist[s] ??= syntheticHistory(spec(s), today));
  const fxUsd = syntheticFx('USD', today);
  const priceOn = (s: string, d: string) => {
    const pts = h(s).points;
    let p = pts[0][1];
    for (const [pd, v] of pts) {
      if (pd > d) break;
      p = v;
    }
    return p;
  };
  const fxOn = (d: string) => {
    let p = fxUsd[0][1];
    for (const [pd, v] of fxUsd) {
      if (pd > d) break;
      p = v;
    }
    return p;
  };
  const bday = (d: string) => {
    let x = d;
    while ([0, 6].includes(new Date(x + 'T00:00:00Z').getUTCDay())) x = addDays(x, 1);
    return x;
  };

  const accounts: Account[] = [
    { id: 'acc-ibkr', name: 'Interactive Brokers', broker: 'ibkr', kind: 'CTO' },
    { id: 'acc-tr', name: 'Trade Republic', broker: 'trade_republic', kind: 'PEA' },
    { id: 'acc-pee', name: 'PEE BNP Paribas', broker: 'bnp_pee', kind: 'PEE' },
  ];
  const txs: Transaction[] = [];
  let id = 0;
  const trade = (account_id: string, type: 'BUY' | 'SELL', symbol: string, date: string, quantity: number, fees = 1, buyTheDipDays = 0) => {
    let d = bday(date);
    if (type === 'BUY' && buyTheDipDays) {
      let low = Infinity;
      for (const [pd, v] of h(symbol).points) if (pd >= date && pd <= addDays(date, buyTheDipDays) && pd <= today && v < low) [low, d] = [v, pd];
    }
    // Demo storytelling: sell when the position first reaches ~+20 % (else at the best price)
    if (type === 'SELL') {
      const buys = txs.filter((t) => t.symbol === symbol && t.type === 'BUY');
      const cost = buys.reduce((acc, t) => acc + t.price * t.quantity, 0) / Math.max(1e-9, buys.reduce((acc, t) => acc + t.quantity, 0));
      const after = buys.length ? addDays(buys[buys.length - 1].date, 120) : date;
      const until = addDays(today, -60);
      let best: [string, number] | null = null;
      let hit: string | null = null;
      for (const [pd, v] of h(symbol).points) {
        if (pd < after || pd > until) continue;
        if (!best || v > best[1]) best = [pd, v];
        if (!hit && v >= cost * 1.2) hit = pd;
      }
      d = hit ?? best?.[0] ?? d;
    }
    const s = spec(symbol);
    txs.push({
      id: `demo-${++id}`,
      account_id,
      date: d,
      type,
      symbol,
      quantity,
      price: priceOn(symbol, d),
      fees,
      amount: 0,
      currency: s.currency,
      fx_rate: s.currency === 'USD' ? fxOn(d) : null,
      source: 'demo',
    });
  };

  // Interactive Brokers — US & EU stocks
  trade('acc-ibkr', 'BUY', 'AAPL', '2022-03-14', 20);
  trade('acc-ibkr', 'BUY', 'MSFT', '2022-09-26', 10);
  trade('acc-ibkr', 'BUY', 'NVDA', '2023-01-17', 120);
  trade('acc-ibkr', 'BUY', 'AAPL', '2023-06-12', 10);
  trade('acc-ibkr', 'SELL', 'NVDA', '2024-06-18', 60);
  trade('acc-ibkr', 'BUY', 'ASML.AS', '2024-02-05', 4);
  trade('acc-ibkr', 'BUY', 'MSFT', '2025-04-08', 5);

  // Trade Republic — PEA: French stocks + monthly ETF plan
  trade('acc-tr', 'BUY', 'SAN.PA', '2022-06-20', 30, 1, 400);
  trade('acc-tr', 'BUY', 'AI.PA', '2022-11-07', 15);
  trade('acc-tr', 'BUY', 'MC.PA', '2023-05-09', 3);
  trade('acc-tr', 'SELL', 'SAN.PA', '2024-09-16', 30);
  trade('acc-tr', 'BUY', 'TTE.PA', '2024-03-11', 40);
  for (let d = '2023-01-05'; d <= today; d = addMonths(d, 1)) {
    const day = bday(d);
    if (day > today) break;
    const p = priceOn('CW8.PA', day);
    txs.push({ id: `demo-${++id}`, account_id: 'acc-tr', date: day, type: 'BUY', symbol: 'CW8.PA', quantity: Math.round((250 / p) * 10000) / 10000, price: p, fees: 0, amount: 0, currency: 'EUR', source: 'demo', note: 'Plan d’épargne' });
  }

  // PEE — monthly contribution + employer match, valued monthly
  const pee = spec('manual:pee-actions-monde');
  const peeHist = h(pee.symbol);
  const manual: Point[] = [];
  for (let d = '2022-01-15'; d <= today; d = addMonths(d, 1)) {
    const day = bday(d);
    if (day > today) break;
    const p = priceOn(pee.symbol, day);
    manual.push([day, p]);
    txs.push({ id: `demo-${++id}`, account_id: 'acc-pee', date: day, type: 'BUY', symbol: pee.symbol, quantity: Math.round((180 / p) * 10000) / 10000, price: p, fees: 0, amount: 0, currency: 'EUR', source: 'demo', note: 'Versement + abondement' });
  }
  const lastPee = peeHist.points.at(-1)!;
  if (manual.at(-1)![0] !== lastPee[0]) manual.push(lastPee);

  // Dividends received on held shares
  const sorted = [...txs].sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const s of DEMO_CATALOG) {
    for (const [d, dps] of h(s.symbol).dividends ?? []) {
      const byAcc = new Map<string, number>();
      for (const t of sorted) {
        if (t.symbol !== s.symbol || t.date >= d) continue;
        byAcc.set(t.account_id, (byAcc.get(t.account_id) ?? 0) + (t.type === 'BUY' ? t.quantity : -t.quantity));
      }
      for (const [account_id, qty] of byAcc) {
        if (qty <= 1e-9) continue;
        const pay = bday(addDays(d, 2));
        if (pay > today) continue;
        txs.push({ id: `demo-${++id}`, account_id, date: pay, type: 'DIVIDEND', symbol: s.symbol, quantity: 0, price: 0, fees: 0, amount: Math.round(qty * dps * 100) / 100, currency: s.currency, fx_rate: s.currency === 'USD' ? fxOn(pay) : null, source: 'demo' });
      }
    }
  }

  const used = new Set(txs.map((t) => t.symbol));
  const instruments: Instrument[] = DEMO_CATALOG.filter((s) => used.has(s.symbol)).map(
    ({ symbol, name, currency, asset_class, country, sector, manual }) => ({ symbol, name, currency, asset_class, country, sector, manual }),
  );
  return { accounts, transactions: txs, instruments, manualPrices: { [pee.symbol]: manual } };
}
