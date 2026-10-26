import type { RouterOutputs } from "@repo/trpc/client";

import { trpc } from "~/trpc/client";

export type DayGatepass = RouterOutputs["gatepasses"]["listForDate"]["data"][number];
export type GatepassHistoryRow = RouterOutputs["gatepasses"]["getMyHistory"]["data"][number];
export type GatepassStatus = GatepassHistoryRow["gatepass"]["status"];
export type AllotmentMatrixRow = RouterOutputs["gatepasses"]["getAllotmentMatrix"]["data"][number];
export type GatepassShortReason = NonNullable<AllotmentMatrixRow["shortReason"]>;

interface UseGatepassesParams {
  businessDate?: string;
  includeMyGatepass?: boolean;
  includeMyHistory?: boolean;
  includeAdminOverview?: boolean;
  includeDiscrepancies?: boolean;
  enabled?: boolean;
}

export function useGatepasses({
  businessDate,
  includeMyGatepass = false,
  includeMyHistory = false,
  includeAdminOverview = false,
  includeDiscrepancies = false,
  enabled = true,
}: UseGatepassesParams = {}) {
  const utils = trpc.useUtils();
  const dateIsSet = enabled && Boolean(businessDate);
  const canonicalDateQuery = trpc.gatepasses.getCanonicalDate.useQuery(undefined, { enabled });

  const myHistoryQuery = trpc.gatepasses.getMyHistory.useQuery(undefined, {
    enabled: enabled && includeMyHistory,
  });

  const gatepassesForDateQuery = trpc.gatepasses.listForDate.useQuery(
    { businessDate: businessDate ?? "" },
    { enabled: dateIsSet && includeAdminOverview },
  );
  const myGatepassQuery = trpc.gatepasses.getMine.useQuery(
    { businessDate: businessDate ?? "" },
    {
      enabled: dateIsSet && includeMyGatepass,
      // Admin allots and closes GatePasses from another device; a salesman screen opens on the
      // current one, not the one cached earlier.
      refetchOnMount: "always",
      retry: (failedAttemptCount, queryError) =>
        queryError.message !== "No gatepass for today" && failedAttemptCount < 3,
    },
  );
  const allotmentMatrixQuery = trpc.gatepasses.getAllotmentMatrix.useQuery(
    { businessDate: businessDate ?? "" },
    { enabled: dateIsSet && includeAdminOverview },
  );
  const endOfDayTotalsQuery = trpc.gatepasses.getEndOfDayTotals.useQuery(
    { businessDate: businessDate ?? "" },
    { enabled: dateIsSet && includeAdminOverview },
  );
  const discrepanciesQuery = trpc.gatepasses.getDiscrepancies.useQuery(
    { businessDate: businessDate ?? "" },
    { enabled: dateIsSet && (includeDiscrepancies || includeAdminOverview) },
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
  const flagGatepassMutation = trpc.gatepasses.flagDiscrepancy.useMutation({
    onSuccess: () => utils.gatepasses.invalidate(),
  });
  const submitHandoverMutation = trpc.gatepasses.submitHandover.useMutation({
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

    myHistory: myHistoryQuery.data?.data ?? [],
    isMyHistoryLoading: myHistoryQuery.isLoading,
    isMyHistoryError: myHistoryQuery.isError,
    refetchMyHistory: myHistoryQuery.refetch,

    allotmentMatrix: allotmentMatrixQuery.data?.data ?? [],
    isAllotmentMatrixLoading: allotmentMatrixQuery.isLoading,
    isAllotmentMatrixError: allotmentMatrixQuery.isError,
    refetchAllotmentMatrix: allotmentMatrixQuery.refetch,

    endOfDayTotals: endOfDayTotalsQuery.data?.data ?? null,
    isEndOfDayTotalsLoading: endOfDayTotalsQuery.isLoading,
    isEndOfDayTotalsError: endOfDayTotalsQuery.isError,
    refetchEndOfDayTotals: endOfDayTotalsQuery.refetch,

    discrepancies: discrepanciesQuery.data?.data ?? [],
    isDiscrepanciesLoading: discrepanciesQuery.isLoading,
    isDiscrepanciesError: discrepanciesQuery.isError,
    refetchDiscrepancies: discrepanciesQuery.refetch,

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

    flagGatepassDiscrepancy: flagGatepassMutation.mutate,
    flagGatepassDiscrepancyAsync: flagGatepassMutation.mutateAsync,
    isFlaggingGatepass: flagGatepassMutation.isPending,
    flagGatepassError: flagGatepassMutation.error ?? null,

    submitHandover: submitHandoverMutation.mutate,
    submitHandoverAsync: submitHandoverMutation.mutateAsync,
    isSubmittingHandover: submitHandoverMutation.isPending,
    submitHandoverError: submitHandoverMutation.error ?? null,
  };
}
