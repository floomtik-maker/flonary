import type { Backend, Connection, UserData } from '../api/backend';
import type { InstrumentProfile, PriceHistory, Quote } from '../../shared/types';
import { toISODate } from '../../shared/series';
import { DEMO_CATALOG, buildDemoData, syntheticEvents, syntheticFx, syntheticHistory, type DemoInstrumentSpec } from './demoData';

const KEY = 'flonary-demo-v1';
const today = () => toISODate(new Date());

function load(): UserData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as UserData;
  } catch {
    /* storage unavailable: fall back to a fresh demo */
  }
  return buildDemoData(today());
}

let state: UserData | null = null;
const data = () => (state ??= load());
function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function resetDemo() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  state = buildDemoData(today());
}

const historyCache = new Map<string, PriceHistory>();
function specFor(symbol: string): DemoInstrumentSpec {
  const known = DEMO_CATALOG.find((c) => c.symbol === symbol);
  if (known) return known;
  // Unknown symbol typed by the user: invent a plausible series
  const inst = data().instruments.find((i) => i.symbol === symbol);
  return {
    symbol,
    name: inst?.name ?? symbol,
    currency: inst?.currency ?? 'EUR',
    asset_class: inst?.asset_class ?? 'stock',
    target: 100,
    drift: 0.07,
    vol: 0.25,
  };
}
function hist(symbol: string) {
  let h = historyCache.get(symbol);
  if (!h) {
    h = syntheticHistory(specFor(symbol), today());
    historyCache.set(symbol, h);
  }
  return h;
}

const delay = <T,>(v: T, ms = 120) => new Promise<T>((r) => setTimeout(() => r(structuredClone(v)), ms));
const uid = () => Math.random().toString(36).slice(2, 10);

export const demoBackend: Backend = {
  mode: 'demo',
  me: () => delay({ id: 'demo', email: 'demo@flonary.app' }, 0),
  login: () => delay({ id: 'demo', email: 'demo@flonary.app' }),
  register: () => delay({ id: 'demo', email: 'demo@flonary.app' }),
  logout: async () => {},

  getData: () => delay(data()),
  saveAccount: async (a) => {
    const d = data();
    const acc = { ...a, id: a.id ?? 'acc-' + uid() };
    d.accounts = [...d.accounts.filter((x) => x.id !== acc.id), acc];
    persist();
    return delay(acc);
  },
  deleteAccount: async (id) => {
    const d = data();
    d.accounts = d.accounts.filter((a) => a.id !== id);
    d.transactions = d.transactions.filter((t) => t.account_id !== id);
    persist();
  },
  saveTransactions: async (txs) => {
    const d = data();
    let inserted = 0;
    let skipped = 0;
    for (const t of txs) {
      if (t.external_id && d.transactions.some((x) => x.external_id === t.external_id && x.id !== t.id)) {
        skipped++;
        continue;
      }
      const i = d.transactions.findIndex((x) => x.id === t.id);
      if (i >= 0) d.transactions[i] = t;
      else {
        d.transactions.push(t);
        inserted++;
      }
    }
    persist();
    return delay({ inserted, skipped });
  },
  deleteTransaction: async (id) => {
    const d = data();
    d.transactions = d.transactions.filter((t) => t.id !== id);
    persist();
  },
  saveInstrument: async (inst) => {
    const d = data();
    d.instruments = [...d.instruments.filter((i) => i.symbol !== inst.symbol), inst];
    historyCache.delete(inst.symbol);
    persist();
  },
  saveManualPrice: async (symbol, date, price) => {
    const d = data();
    const list = (d.manualPrices[symbol] ?? []).filter(([x]) => x !== date);
    list.push([date, price]);
    list.sort((a, b) => (a[0] < b[0] ? -1 : 1));
    d.manualPrices[symbol] = list;
    persist();
  },
  deleteManualPrice: async (symbol, date) => {
    const d = data();
    d.manualPrices[symbol] = (d.manualPrices[symbol] ?? []).filter(([x]) => x !== date);
    persist();
  },
  restore: async (u) => {
    state = structuredClone(u);
    persist();
  },

  history: (symbols) => delay(Object.fromEntries(symbols.map((s) => [s, hist(s)])), 250),
  quotes: (symbols) =>
    delay(
      Object.fromEntries(
        symbols.map((s): [string, Quote] => {
          const pts = hist(s).points;
          const last = pts[pts.length - 1][1];
          const prev = pts[pts.length - 2]?.[1] ?? last;
          return [s, { symbol: s, price: last, currency: hist(s).currency, change_pct: ((last / prev - 1) * 100) }];
        }),
      ),
    ),
  fx: (currencies) => delay(Object.fromEntries(currencies.map((c) => [c, syntheticFx(c, today())]))),
  search: async (q) => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return delay(
      DEMO_CATALOG.filter((c) => !c.manual && (c.symbol.toLowerCase().includes(s) || c.name.toLowerCase().includes(s))).map((c) => ({
        symbol: c.symbol,
        name: c.name,
        currency: c.currency,
        type: c.asset_class === 'etf' ? 'ETF' : 'Action',
        exchange: c.symbol.endsWith('.PA') ? 'Paris' : c.symbol.endsWith('.AS') ? 'Amsterdam' : 'NASDAQ/NYSE',
      })),
    );
  },
  profile: async (symbol) => {
    const sp = specFor(symbol);
    const p: InstrumentProfile = {
      symbol,
      name: sp.name,
      country: sp.country ?? null,
      sector: sp.sector ?? null,
      asset_class: sp.asset_class,
      events: syntheticEvents(sp, today()),
    };
    return delay(p);
  },

  connections: async () => [] as Connection[],
  saveConnection: async () => {
    throw new Error('Connexions désactivées en mode démo');
  },
  deleteConnection: async () => {},
  syncConnection: async () => ({ imported: 0, skipped: 0, message: 'Mode démo' }),
};
