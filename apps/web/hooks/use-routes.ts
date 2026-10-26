import type { RouterInputs, RouterOutputs } from "@repo/trpc/client";

import { trpc } from "~/trpc/client";

export type RouteListRow = RouterOutputs["routes"]["list"]["data"][number];
export type RouteChoice = RouterOutputs["routes"]["choices"]["data"][number];
export type RoutePriceFormRow = RouterOutputs["routes"]["get"]["data"]["varieties"][number];

interface UseRoutesParams {
  listFilters?: RouterInputs["routes"]["list"];
  choicesFilters?: RouterInputs["routes"]["choices"];
  routeId?: string;
  enabled?: boolean;
}

// Admin only. Salesmen never pick a Route or change a Route price.
export function useRoutes({
  listFilters,
  choicesFilters,
  routeId,
  enabled = true,
}: UseRoutesParams = {}) {
  const utils = trpc.useUtils();

  const routesListQuery = trpc.routes.list.useQuery(listFilters ?? { includeHidden: false }, {
    enabled: enabled && Boolean(listFilters),
  });
  const routeChoicesQuery = trpc.routes.choices.useQuery(choicesFilters ?? {}, {
    enabled: enabled && Boolean(choicesFilters),
  });
  const routeQuery = trpc.routes.get.useQuery(
    { id: routeId ?? "" },
    { enabled: enabled && Boolean(routeId) },
  );

  // Customers and GatePasses show the Route name, code and hidden flag, so a Route change refreshes
  // them too. Prices only feed the Route screens and the allot screen, which read from `routes`.
  function invalidateRouteViews() {
    return Promise.all([
      utils.routes.invalidate(),
      utils.customers.invalidate(),
      utils.gatepasses.invalidate(),
    ]);
  }

  const createRouteMutation = trpc.routes.create.useMutation({
    onSuccess: () => utils.routes.invalidate(),
  });
  const updateRouteMutation = trpc.routes.update.useMutation({
    onSuccess: invalidateRouteViews,
  });
  const setRouteStatusMutation = trpc.routes.setStatus.useMutation({
    onSuccess: invalidateRouteViews,
  });
  const hideRouteMutation = trpc.routes.hide.useMutation({
    onSuccess: invalidateRouteViews,
  });
  const showRouteMutation = trpc.routes.show.useMutation({
    onSuccess: invalidateRouteViews,
  });
  const setRoutePriceMutation = trpc.routes.setPrice.useMutation({
    onSuccess: () => utils.routes.invalidate(),
  });
  const clearRoutePriceMutation = trpc.routes.clearPrice.useMutation({
    onSuccess: () => utils.routes.invalidate(),
  });

  return {
    routes: routesListQuery.data?.data ?? [],
    isRoutesListLoading: routesListQuery.isLoading,
    isRoutesListError: routesListQuery.isError,
    refetchRoutesList: routesListQuery.refetch,

    routeChoices: routeChoicesQuery.data?.data ?? [],
    isRouteChoicesLoading: routeChoicesQuery.isLoading,
    isRouteChoicesError: routeChoicesQuery.isError,

    route: routeQuery.data?.data.route ?? null,
    routePriceForm: routeQuery.data?.data.varieties ?? [],
    isRouteLoading: routeQuery.isLoading,
    isRouteError: routeQuery.isError,
    refetchRoute: routeQuery.refetch,

    createRouteAsync: createRouteMutation.mutateAsync,
    isCreatingRoute: createRouteMutation.isPending,

    updateRouteAsync: updateRouteMutation.mutateAsync,
    isUpdatingRoute: updateRouteMutation.isPending,

    setRouteStatusAsync: setRouteStatusMutation.mutateAsync,
    isSettingRouteStatus: setRouteStatusMutation.isPending,

    hideRouteAsync: hideRouteMutation.mutateAsync,
    isHidingRoute: hideRouteMutation.isPending,

    showRouteAsync: showRouteMutation.mutateAsync,
    isShowingRoute: showRouteMutation.isPending,

    setRoutePriceAsync: setRoutePriceMutation.mutateAsync,
    clearRoutePriceAsync: clearRoutePriceMutation.mutateAsync,
  };
}
