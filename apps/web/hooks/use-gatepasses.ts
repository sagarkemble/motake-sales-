import { trpc } from "~/trpc/client";

interface UseGatepassesParams {
  businessDate?: string;
  includeMyGatepass?: boolean;
  includeAdminOverview?: boolean;
  enabled?: boolean;
}

export function useGatepasses({
  businessDate,
  includeMyGatepass = false,
  includeAdminOverview = false,
  enabled = true,
}: UseGatepassesParams = {}) {
  const utils = trpc.useUtils();
  const dateIsSet = enabled && Boolean(businessDate);
  const canonicalDateQuery = trpc.gatepasses.getCanonicalDate.useQuery(undefined, { enabled });

  const gatepassesForDateQuery = trpc.gatepasses.listForDate.useQuery(
    { businessDate: businessDate ?? "" },
    { enabled: dateIsSet && includeAdminOverview },
  );
  const myGatepassQuery = trpc.gatepasses.getMine.useQuery(
    { businessDate: businessDate ?? "" },
    { enabled: dateIsSet && includeMyGatepass },
  );
  const allotmentMatrixQuery = trpc.gatepasses.getAllotmentMatrix.useQuery(
    { businessDate: businessDate ?? "" },
    { enabled: dateIsSet && includeAdminOverview },
  );
  const endOfDayTotalsQuery = trpc.gatepasses.getEndOfDayTotals.useQuery(
    { businessDate: businessDate ?? "" },
    { enabled: dateIsSet && includeAdminOverview },
  );

  const allotGatepassMutation = trpc.gatepasses.allot.useMutation({
    onSuccess: () => utils.gatepasses.invalidate(),
  });
  const recordGatepassSaleMutation = trpc.gatepasses.recordSale.useMutation({
    onSuccess: () => utils.gatepasses.invalidate(),
  });
  const recordGatepassReturnMutation = trpc.gatepasses.recordReturn.useMutation({
    onSuccess: () => utils.gatepasses.invalidate(),
  });
  const verifyGatepassMutation = trpc.gatepasses.verify.useMutation({
    onSuccess: () => utils.gatepasses.invalidate(),
  });

  return {
    canonicalBusinessDate: canonicalDateQuery.data?.data.businessDate ?? "",
    isCanonicalDateLoading: canonicalDateQuery.isLoading,

    gatepasses: gatepassesForDateQuery.data?.data ?? [],
    isGatepassesLoading: gatepassesForDateQuery.isLoading,
    isGatepassesError: gatepassesForDateQuery.isError,
    refetchGatepasses: gatepassesForDateQuery.refetch,

    myGatepass: myGatepassQuery.data?.data ?? null,
    isMyGatepassLoading: myGatepassQuery.isLoading,
    isMyGatepassError: myGatepassQuery.isError,
    refetchMyGatepass: myGatepassQuery.refetch,

    allotmentMatrix: allotmentMatrixQuery.data?.data ?? [],
    isAllotmentMatrixLoading: allotmentMatrixQuery.isLoading,
    isAllotmentMatrixError: allotmentMatrixQuery.isError,
    refetchAllotmentMatrix: allotmentMatrixQuery.refetch,

    endOfDayTotals: endOfDayTotalsQuery.data?.data ?? null,
    isEndOfDayTotalsLoading: endOfDayTotalsQuery.isLoading,
    isEndOfDayTotalsError: endOfDayTotalsQuery.isError,
    refetchEndOfDayTotals: endOfDayTotalsQuery.refetch,

    allotGatepass: allotGatepassMutation.mutate,
    allotGatepassAsync: allotGatepassMutation.mutateAsync,
    isAllottingGatepass: allotGatepassMutation.isPending,
    allotGatepassError: allotGatepassMutation.error ?? null,

    recordGatepassSale: recordGatepassSaleMutation.mutate,
    recordGatepassSaleAsync: recordGatepassSaleMutation.mutateAsync,
    isRecordingGatepassSale: recordGatepassSaleMutation.isPending,
    recordGatepassSaleError: recordGatepassSaleMutation.error ?? null,

    recordGatepassReturn: recordGatepassReturnMutation.mutate,
    recordGatepassReturnAsync: recordGatepassReturnMutation.mutateAsync,
    isRecordingGatepassReturn: recordGatepassReturnMutation.isPending,
    recordGatepassReturnError: recordGatepassReturnMutation.error ?? null,

    verifyGatepass: verifyGatepassMutation.mutate,
    verifyGatepassAsync: verifyGatepassMutation.mutateAsync,
    isVerifyingGatepass: verifyGatepassMutation.isPending,
    verifyGatepassError: verifyGatepassMutation.error ?? null,
  };
}
