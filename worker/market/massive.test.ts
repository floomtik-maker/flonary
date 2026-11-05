import { afterEach, describe, expect, it, vi } from 'vitest';
import { fromMassive, groupedDailyToCloses, isUsTicker, massive, toMassive } from './massive';

// Fixtures shaped like the examples in the official Massive docs (trimmed).
const AGGS = {
  ticker: 'AAPL',
  adjusted: false,
  status: 'OK',
  resultsCount: 2,
  results: [
    { c: 225.5, h: 227, l: 224, o: 226, t: 1730696400000, v: 1000 }, // 2024-11-04 05:00Z
    { c: 222.0, h: 226, l: 221, o: 225, t: 1730782800000, v: 1000 }, // 2024-11-05 05:00Z
  ],
};
const PREV = { ticker: 'AAPL', status: 'OK', results: [{ T: 'AAPL', c: 115.97, o: 115.55, h: 117.59, l: 114.13, t: 1605042000000, v: 1 }] };
const GROUPED = {
  status: 'OK',
  adjusted: false,
  results: [
    { T: 'TANH', c: 25.9102, t: 1602705600000 },
    { T: 'BRK.B', c: 410.2, t: 1602705600000 },
    { T: 'BAD', c: null, t: 1602705600000 },
  ],
};
const DIVS = {
  status: 'OK',
  results: [
    { ticker: 'AAPL', ex_dividend_date: '2024-08-12', cash_amount: 0.25, split_adjusted_cash_amount: 0.25, currency: 'USD' },
    { ticker: 'AAPL', ex_dividend_date: '2020-08-07', cash_amount: 0.82, split_adjusted_cash_amount: 0.205, currency: 'USD' },
  ],
};
const SPLITS = {
  status: 'OK',
  results: [{ ticker: 'AAPL', execution_date: '2020-08-31', split_from: 1, split_to: 4, adjustment_type: 'forward_split' }],
};
const TICKERS = {
  status: 'OK',
  results: [{ ticker: 'BRK.B', name: 'Berkshire Hathaway Inc.', market: 'stocks', primary_exchange: 'XNYS', type: 'CS', currency_name: 'usd' }],
};

function mockFetch(body: unknown, status = 200) {
  const fn = vi.fn(async (_url: string) => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fn);
  return fn;
}
const urlOf = (fn: ReturnType<typeof mockFetch>) => new URL(fn.mock.calls[0][0]);

afterEach(() => vi.unstubAllGlobals());

describe('Massive symbols', () => {
  it('recognises US tickers only', () => {
    for (const s of ['AAPL', 'MSFT', 'BRK-B', 'F']) expect(isUsTicker(s)).toBe(true);
    for (const s of ['MC.PA', 'SAP.DE', 'VOD.L', 'BTC-USD', 'ETH-EUR', 'manual:pee-fund', 'aapl']) expect(isUsTicker(s)).toBe(false);
  });
  it('maps share classes', () => {
    expect(toMassive('BRK-B')).toBe('BRK.B');
    expect(fromMassive('BRK.B')).toBe('BRK-B');
    expect(toMassive('AAPL')).toBe('AAPL');
  });
});

describe('groupedDailyToCloses', () => {
  it('maps every ticker to its close', () => {
    expect(groupedDailyToCloses(GROUPED)).toEqual({ TANH: 25.9102, 'BRK-B': 410.2 });
  });
  it('tolerates empty / invalid payloads', () => {
    expect(groupedDailyToCloses({ status: 'OK', resultsCount: 0 })).toEqual({});
    expect(groupedDailyToCloses(null)).toEqual({});
  });
});

describe('massive provider', () => {
  it('eod: raw closes, ascending, adjusted=false', async () => {
    const fn = mockFetch(AGGS);
    const throttle = vi.fn(async () => {});
    const r = await massive('KEY', throttle).eod('AAPL', '2024-11-01');
    expect(r).toEqual({ currency: 'USD', points: [['2024-11-04', 225.5], ['2024-11-05', 222]] });
    const u = urlOf(fn);
    expect(u.origin).toBe('https://api.massive.com');
    expect(u.pathname).toMatch(/^\/v2\/aggs\/ticker\/AAPL\/range\/1\/day\/2024-11-01\/\d{4}-\d{2}-\d{2}$/);
    expect(u.searchParams.get('adjusted')).toBe('false');
    expect(u.searchParams.get('apiKey')).toBe('KEY');
    expect(throttle).toHaveBeenCalledTimes(1);
  });

  it('dividends: raw cash_amount by ex-date, sorted', async () => {
    const fn = mockFetch(DIVS);
    expect(await massive('K').dividends('AAPL', '2020-01-01')).toEqual([
      ['2020-08-07', 0.82],
      ['2024-08-12', 0.25],
    ]);
    const u = urlOf(fn);
    expect(u.pathname).toBe('/stocks/v1/dividends');
    expect(u.searchParams.get('ticker')).toBe('AAPL');
    expect(u.searchParams.get('ex_dividend_date.gte')).toBe('2020-01-01');
  });

  it('splits: ratio = split_to / split_from', async () => {
    const fn = mockFetch(SPLITS);
    expect(await massive('K').splits('AAPL')).toEqual([['2020-08-31', 4]]);
    expect(urlOf(fn).pathname).toBe('/stocks/v1/splits');
  });

  it('quote: previous close', async () => {
    const fn = mockFetch(PREV);
    const q = await massive('K').quote('BRK-B');
    expect(q).toMatchObject({ symbol: 'BRK-B', price: 115.97, currency: 'USD' });
    expect(urlOf(fn).pathname).toBe('/v2/aggs/ticker/BRK.B/prev');
  });

  it('quote: 404 when no bar', async () => {
    mockFetch({ status: 'OK', results: [] });
    await expect(massive('K').quote('ZZZZ')).rejects.toMatchObject({ status: 404 });
  });

  it('search: maps tickers back to internal format', async () => {
    const fn = mockFetch(TICKERS);
    expect(await massive('K').search('berkshire')).toEqual([
      { symbol: 'BRK-B', name: 'Berkshire Hathaway Inc.', exchange: 'XNYS', type: 'CS', currency: 'USD' },
    ]);
    expect(urlOf(fn).searchParams.get('search')).toBe('berkshire');
  });

  it('groupedDailyCloses: one call for the whole market', async () => {
    const fn = mockFetch(GROUPED);
    expect(await massive('K').groupedDailyCloses('2020-10-14')).toEqual({ TANH: 25.9102, 'BRK-B': 410.2 });
    expect(urlOf(fn).pathname).toBe('/v2/aggs/grouped/locale/us/market/stocks/2020-10-14');
  });

  it('rate limit (429) → 503', async () => {
    mockFetch({ status: 'ERROR' }, 429);
    await expect(massive('K').eod('AAPL', '2024-01-01')).rejects.toMatchObject({ status: 503 });
  });
});
