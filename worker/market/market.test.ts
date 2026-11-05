import { describe, expect, it } from 'vitest';
import { mergePoints, needsPriceRefresh, previousBusinessDay } from './index';
import { pickListing, isIsin } from './openfigi';
import { toEodhd, currencyOfSymbol } from './eodhd';

const cache = (last: string, fetchedOn: string) => ({ symbol: 'X', currency: 'EUR', points: [[last, 1]] as [string, number][], from: '2020-01-01', fetchedOn, corpOn: fetchedOn });

describe('market cache rules', () => {
  it('previous business day skips weekends', () => {
    expect(previousBusinessDay('2026-11-09')).toBe('2026-11-06'); // Monday → Friday
    expect(previousBusinessDay('2026-11-05')).toBe('2026-11-04');
  });
  it('refreshes at most once a day, and only when a new close should exist', () => {
    // Thursday 10:00 UTC, yesterday's close cached → up to date
    expect(needsPriceRefresh(cache('2026-11-04', '2026-11-04'), '2026-11-05', 10)).toBe(false);
    // Thursday 23:00 UTC → today's close is available
    expect(needsPriceRefresh(cache('2026-11-04', '2026-11-04'), '2026-11-05', 23)).toBe(true);
    // already fetched today
    expect(needsPriceRefresh(cache('2026-11-03', '2026-11-05'), '2026-11-05', 23)).toBe(false);
    // Monday morning with Friday's close
    expect(needsPriceRefresh(cache('2026-11-06', '2026-11-07'), '2026-11-09', 8)).toBe(false);
  });
  it('merges series', () => {
    expect(mergePoints([['2026-01-01', 1], ['2026-01-02', 2]], [['2026-01-02', 3], ['2026-01-03', 4]])).toEqual([
      ['2026-01-01', 1],
      ['2026-01-02', 3],
      ['2026-01-03', 4],
    ]);
  });
});

describe('symbols', () => {
  it('maps to EODHD', () => {
    expect(toEodhd('MC.PA')).toBe('MC.PA');
    expect(toEodhd('SAP.DE')).toBe('SAP.XETRA');
    expect(toEodhd('AAPL')).toBe('AAPL.US');
    expect(currencyOfSymbol('AAPL')).toBe('USD');
    expect(currencyOfSymbol('VOD.L')).toBe('GBp');
    expect(currencyOfSymbol('ASML.AS')).toBe('EUR');
  });
  it('picks the main listing from OpenFIGI', () => {
    const rows = [
      { ticker: 'MOH', exchCode: 'GY', name: 'LVMH MOET HENNESSY', securityType: 'Common Stock' },
      { ticker: 'LVMHF', exchCode: 'US', name: 'LVMH MOET HENNESSY', securityType: 'Common Stock' },
      { ticker: 'MC', exchCode: 'FP', name: 'LVMH MOET HENNESSY', securityType: 'Common Stock' },
    ];
    expect(pickListing(rows, 'FR0000121014')).toMatchObject({ symbol: 'MC.PA', currency: 'EUR' });
    const us = [
      { ticker: 'AAPL', exchCode: 'GY', name: 'APPLE INC', securityType: 'Common Stock' },
      { ticker: 'AAPL', exchCode: 'US', name: 'APPLE INC', securityType: 'Common Stock' },
    ];
    expect(pickListing(us, 'US0378331005')).toMatchObject({ symbol: 'AAPL', currency: 'USD' });
    expect(isIsin('FR0000121014')).toBe(true);
    expect(isIsin('LVMH')).toBe(false);
  });
});
