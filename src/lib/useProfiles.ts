import { useQueries } from '@tanstack/react-query';
import { useBackend } from '../api';
import type { InstrumentProfile } from '../../shared/types';

/** Fetches profiles (country, sector, upcoming events) for market symbols. Cached 12h. */
export function useProfiles(symbols: string[]): { profiles: Record<string, InstrumentProfile | undefined>; loading: boolean } {
  const backend = useBackend();
  const market = symbols.filter((s) => !s.startsWith('manual:'));
  const results = useQueries({
    queries: market.map((symbol) => ({
      queryKey: ['profile', symbol],
      queryFn: () => backend.profile(symbol),
      staleTime: 12 * 60 * 60_000,
      retry: 1,
    })),
  });
  const profiles: Record<string, InstrumentProfile | undefined> = {};
  market.forEach((s, i) => (profiles[s] = results[i].data));
  return { profiles, loading: results.some((r) => r.isLoading) };
}
