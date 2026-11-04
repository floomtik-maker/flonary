import { useMemo } from 'react';
import { upcomingEvents, type UpcomingEvent } from '../../shared/calendar';
import { valueAtOrFirst } from '../../shared/series';
import type { PortfolioState } from './usePortfolio';
import { useProfiles } from './useProfiles';

export function useUpcomingEvents(state: PortfolioState | null, horizonDays = 365): { events: UpcomingEvent[]; loading: boolean } {
  const positions = state?.result.positions ?? [];
  const { profiles, loading } = useProfiles(positions.map((p) => p.symbol));
  const events = useMemo(() => {
    if (!state) return [];
    return upcomingEvents({
      positions,
      histories: state.histories,
      profiles,
      fxToEUR: (c) => (c === 'EUR' ? 1 : (valueAtOrFirst(state.fx[c], state.today) ?? 1)),
      today: state.today,
      horizonDays,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, JSON.stringify(Object.keys(profiles).map((k) => !!profiles[k])), horizonDays]);
  return { events, loading };
}
