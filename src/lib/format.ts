const eur0 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const eur2 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct1 = new Intl.NumberFormat('fr-FR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
const num = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 4 });
const compact = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 });

/** 12 345 € (no decimals above 1 000 €, cents below) */
export function eur(v: number, opts: { cents?: boolean } = {}): string {
  if (!Number.isFinite(v)) return '—';
  return (opts.cents ?? Math.abs(v) < 1000) ? eur2.format(v) : eur0.format(v);
}

/** Signed amount: +1 234 € / −56 € */
export function signedEur(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const s = eur(Math.abs(v));
  return (v > 0.005 ? '+' : v < -0.005 ? '−' : '') + s;
}

/** Signed percent from a ratio: 0.123 → +12,3 % */
export function signedPct(ratio: number): string {
  if (!Number.isFinite(ratio)) return '—';
  const s = pct1.format(Math.abs(ratio));
  return (ratio > 0.0005 ? '+' : ratio < -0.0005 ? '−' : '') + s;
}

export function pct(ratio: number): string {
  return Number.isFinite(ratio) ? pct1.format(ratio) : '—';
}

export function money(v: number, currency: string): string {
  if (!Number.isFinite(v)) return '—';
  try {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: currency === 'GBp' ? 'GBP' : currency, maximumFractionDigits: v >= 1000 ? 0 : 2 }).format(
      currency === 'GBp' ? v / 100 : v,
    );
  } catch {
    return `${num.format(v)} ${currency}`;
  }
}

export function qty(v: number): string {
  return num.format(v);
}

export function compactEur(v: number): string {
  return compact.format(v) + ' €';
}

export function tone(v: number): 'up' | 'down' | '' {
  return v > 0.005 ? 'up' : v < -0.005 ? 'down' : '';
}

const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const dateShort = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const monthFmt = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export function date(iso: string): string {
  return dateFmt.format(new Date(iso + 'T00:00:00Z'));
}
export function dateNoYear(iso: string): string {
  return dateShort.format(new Date(iso + 'T00:00:00Z'));
}
export function monthLabel(iso: string): string {
  const s = monthFmt.format(new Date(iso + 'T00:00:00Z'));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const AVATAR_COLORS = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-7)', 'var(--series-5)', 'var(--series-6)', 'var(--series-4)', 'var(--series-8)'];
export function avatarColor(symbol: string): string {
  let h = 0;
  for (let i = 0; i < symbol.length; i++) h = (h * 31 + symbol.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
export function initials(name: string): string {
  return name
    .replace(/[^A-Za-zÀ-ÿ0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

export const BROKER_LABELS: Record<string, string> = {
  ibkr: 'Interactive Brokers',
  trade_republic: 'Trade Republic',
  bnp_pee: 'BNP Paribas (PEE)',
  other: 'Autre',
};

export const ASSET_CLASS_LABELS: Record<string, string> = {
  stock: 'Actions',
  etf: 'ETF',
  fund: 'Fonds',
  crypto: 'Crypto',
  bond: 'Obligations',
  other: 'Autre',
};

export const TX_LABELS: Record<string, string> = {
  BUY: 'Achat',
  SELL: 'Vente',
  DIVIDEND: 'Dividende',
  DEPOSIT: 'Versement',
  WITHDRAWAL: 'Retrait',
  FEE: 'Frais',
};
