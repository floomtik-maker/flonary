/**
 * OpenFIGI (https://www.openfigi.com/api) — free, no key needed. Used to turn an ISIN
 * (as found in Trade Republic / broker exports) into a ticker without spending EODHD calls.
 */
import type { SearchResult } from '../../shared/types';
import { getJson } from './types';

/** Bloomberg exchange code → internal suffix, in order of preference */
const EXCH: [string, string][] = [
  ['FP', '.PA'],
  ['NA', '.AS'],
  ['GY', '.DE'],
  ['BB', '.BR'],
  ['IM', '.MI'],
  ['SM', '.MC'],
  ['SE', '.SW'],
  ['LN', '.L'],
  ['US', ''],
];
const CURRENCY: Record<string, string> = { '': 'USD', '.L': 'GBp', '.SW': 'CHF' };

interface FigiRow {
  ticker: string | null;
  exchCode: string | null;
  name: string;
  securityType: string | null;
  marketSector?: string;
}

/** Picks the main listing among OpenFIGI rows. `preferUS` for US ISINs. */
export function pickListing(rows: FigiRow[], isin: string): SearchResult | null {
  const order = isin.startsWith('US') ? [['US', ''] as [string, string], ...EXCH.filter(([c]) => c !== 'US')] : EXCH;
  for (const [code, suffix] of order) {
    const r = rows.find((x) => x.exchCode === code && x.ticker);
    if (r) {
      const symbol = r.ticker!.replace(/\s+/g, '-').replace(/\/$/, '') + suffix;
      return {
        symbol,
        name: titleCase(r.name),
        exchange: code,
        type: r.securityType === 'ETP' ? 'ETF' : (r.securityType ?? undefined),
        currency: CURRENCY[suffix] ?? 'EUR',
      };
    }
  }
  return null;
}

function titleCase(s: string) {
  return s.toLowerCase().replace(/(^|[\s-])\S/g, (m) => m.toUpperCase());
}

export async function searchIsin(isin: string): Promise<SearchResult[]> {
  const res = await getJson<{ data?: FigiRow[]; warning?: string }[]>('https://api.openfigi.com/v3/mapping', 'OpenFIGI', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify([{ idType: 'ID_ISIN', idValue: isin }]),
  });
  const hit = pickListing(res[0]?.data ?? [], isin);
  return hit ? [hit] : [];
}

export const isIsin = (q: string) => /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(q.trim().toUpperCase());
