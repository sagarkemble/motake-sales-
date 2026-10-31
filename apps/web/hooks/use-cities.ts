import type { RouterOutputs } from "@repo/trpc/client";

import { trpc } from "~/trpc/client";

export type City = RouterOutputs["cities"]["list"]["data"][number];

// Admin and salesman: the Customer city picker and Admin Settings > Cities.
export function useCities({ enabled = true }: { enabled?: boolean } = {}) {
  const utils = trpc.useUtils();

  const citiesQuery = trpc.cities.list.useQuery(undefined, { enabled });

  const createCityMutation = trpc.cities.create.useMutation({
    onSuccess: () => utils.cities.invalidate(),
  });

  return {
    cities: citiesQuery.data?.data ?? [],
    isCitiesLoading: citiesQuery.isLoading,
    isCitiesError: citiesQuery.isError,
    refetchCities: citiesQuery.refetch,

    createCityAsync: createCityMutation.mutateAsync,
    isCreatingCity: createCityMutation.isPending,
  };
}

// Cities grouped under their state, states and names in list order (the server sorts them).
export function groupCitiesByState(cities: City[]): { state: string; cities: City[] }[] {
  const groups = new Map<string, City[]>();
  for (const city of cities) groups.set(city.state, [...(groups.get(city.state) ?? []), city]);
  return [...groups].map(([state, citiesOfState]) => ({ state, cities: citiesOfState }));
}

// The state holding the most cities: the likely state for a new one.
export function busiestState(cities: City[]): string | null {
  const groups = groupCitiesByState(cities);
  return (
    groups.reduce<{ state: string; cities: City[] } | null>(
      (busiest, group) =>
        !busiest || group.cities.length > busiest.cities.length ? group : busiest,
      null,
    )?.state ?? null
  );
}
