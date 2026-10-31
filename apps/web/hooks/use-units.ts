import type { RouterOutputs } from "@repo/trpc/client";

import { trpc } from "~/trpc/client";

export type UnitOfMeasure = RouterOutputs["units"]["list"]["data"][number];

// Admin: the Variety form's unit picker and Settings > Units.
export function useUnits({ enabled = true }: { enabled?: boolean } = {}) {
  const utils = trpc.useUtils();

  const unitsQuery = trpc.units.list.useQuery(undefined, { enabled });

  const createUnitMutation = trpc.units.create.useMutation({
    // The new unit goes into the list at once, so a picker can select it before the refetch lands.
    onSuccess: ({ data: unit }) => {
      utils.units.list.setData(undefined, (previous) =>
        previous ? { ...previous, data: [...previous.data, unit] } : previous,
      );
      return utils.units.invalidate();
    },
  });

  return {
    units: unitsQuery.data?.data ?? [],
    isUnitsLoading: unitsQuery.isLoading,
    isUnitsError: unitsQuery.isError,
    refetchUnits: unitsQuery.refetch,

    createUnitAsync: createUnitMutation.mutateAsync,
    isCreatingUnit: createUnitMutation.isPending,
  };
}
