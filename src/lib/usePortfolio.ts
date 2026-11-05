import { useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useBackend } from '../api';
import { computePortfolio, type PortfolioResult } from '../../shared/portfolio';
import { BASE_CURRENCY, type Instrument, type PriceHistory, type Quote } from '../../shared/types';
import type { UserData } from '../api/backend';
import { addDays, toISODate } from '../../shared/series';
import { BENCHMARK_SYMBOL, simulateBenchmark, type BenchmarkResult } from '../../shared/benchmark';

export interface PortfolioState {
  data: UserData;
  instruments: Record<string, Instrument>;
  histories: Record<string, PriceHistory>;
  quotes: Record<string, Quote>;
  fx: Record<string, [string, number][]>;
  result: PortfolioResult;
  today: string;
  /** Market data still loading (portfolio shown with transaction prices meanwhile) */
  marketLoading: boolean;
  marketError: string | null;
  /** Same cash flows invested in a world ETF (BENCHMARK_SYMBOL), over the whole history; null if no prices */
  benchmark: { symbol: string; prices: [string, number][]; result: BenchmarkResult | null } | null;
}

export function useUserData() {
  const backend = useBackend();
  return useQuery({ queryKey: ['data'], queryFn: () => backend.getData() });
}

/** Loads user data + market data and runs the portfolio engine. */
export function usePortfolio(): { state: PortfolioState | null; loading: boolean; error: string | null } {
  const backend = useBackend();
  const dataQ = useUserData();
  const data = dataQ.data;
  const today = toISODate(new Date());

  const instruments = useMemo(() => {
    const m: Record<string, Instrument> = {};
    for (const i of data?.instruments ?? []) m[i.symbol] = i;
    return m;
  }, [data]);

  const symbols = useMemo(() => [...new Set((data?.transactions ?? []).map((t) => t.symbol).filter((s): s is string => !!s))].sort(), [data]);
  const marketSymbols = useMemo(() => symbols.filter((s) => !instruments[s]?.manual && !s.startsWith('manual:')), [symbols, instruments]);
  // The benchmark's history is fetched with the rest (it is not a position unless actually held)
  const historySymbols = useMemo(() => [...new Set([...marketSymbols, BENCHMARK_SYMBOL])].sort(), [marketSymbols]);
  const currencies = useMemo(() => {
    const set = new Set<string>();
    for (const t of data?.transactions ?? []) set.add(t.currency);
    for (const s of symbols) if (instruments[s]) set.add(instruments[s].currency === 'GBp' ? 'GBP' : instruments[s].currency);
    set.delete(BASE_CURRENCY);
    return [...set].sort();
  }, [data, symbols, instruments]);
  const firstDate = useMemo(() => (data?.transactions ?? []).reduce((m, t) => (t.date < m ? t.date : m), today), [data, today]);

  const histQ = useQuery({
    // 400 extra days so the 200-day moving average exists from the first purchase
    queryKey: ['history', historySymbols, firstDate],
    queryFn: () => backend.history(historySymbols, addDays(firstDate, -400)),
    enabled: !!data,
    staleTime: 60 * 60_000,
    // keep showing the previous figures while a new symbol loads (no skeleton flash)
    placeholderData: keepPreviousData,
  });
  const quotesQ = useQuery({
    queryKey: ['quotes', marketSymbols],
    queryFn: () => backend.quotes(marketSymbols),
    enabled: !!data,
    staleTime: 5 * 60_000,
    // keep showing the previous figures while a new symbol loads (no skeleton flash)
    placeholderData: keepPreviousData,
    refetchInterval: 5 * 60_000,
  });
  const fxQ = useQuery({
    queryKey: ['fx', currencies, firstDate],
    queryFn: () => backend.fx(currencies, firstDate),
    enabled: !!data,
    staleTime: 6 * 60 * 60_000,
    // keep showing the previous figures while a new symbol loads (no skeleton flash)
    placeholderData: keepPreviousData,
  });

  const state = useMemo<PortfolioState | null>(() => {
    if (!data) return null;
    const histories: Record<string, PriceHistory> = { ...(histQ.data ?? {}) };
    const benchHist = histories[BENCHMARK_SYMBOL];
    if (!symbols.includes(BENCHMARK_SYMBOL)) delete histories[BENCHMARK_SYMBOL];
    // Manual instruments are valued from the user's own valuations
    for (const [symbol, points] of Object.entries(data.manualPrices ?? {})) {
      if (points.length) histories[symbol] = { symbol, currency: instruments[symbol]?.currency ?? BASE_CURRENCY, points };
    }
    // Instruments unknown to the user table: infer currency from the market data
    const inst = { ...instruments };
    for (const s of symbols) {
      if (!inst[s]) {
        const tx = data.transactions.find((t) => t.symbol === s);
        inst[s] = { symbol: s, name: s, currency: histories[s]?.currency ?? tx?.currency ?? BASE_CURRENCY, asset_class: 'other' };
      }
    }
    const quotes = quotesQ.data ?? {};
    const fx = fxQ.data ?? {};
    const result = computePortfolio({ transactions: data.transactions, instruments: inst, prices: histories, fx, quotes, today });
    const benchPrices = benchHist?.currency === BASE_CURRENCY ? benchHist.points : undefined;
    const benchmark = benchPrices?.length ? { symbol: BENCHMARK_SYMBOL, prices: benchPrices, result: simulateBenchmark(result.series, benchPrices) } : null;
    return {
      data,
      benchmark,
      instruments: inst,
      histories,
      quotes,
      fx,
      result,
      today,
      marketLoading: histQ.isLoading || fxQ.isLoading,
      marketError: (histQ.error as Error | null)?.message ?? (fxQ.error as Error | null)?.message ?? null,
    };
  }, [data, histQ.data, quotesQ.data, fxQ.data, histQ.isLoading, fxQ.isLoading, histQ.error, fxQ.error, instruments, symbols, today]);

  return {
    state,
    loading: dataQ.isLoading || (!!data && (histQ.isLoading || fxQ.isLoading)),
    error: (dataQ.error as Error | null)?.message ?? null,
  };
}
