import type { RouterOutputs } from "@repo/trpc/client";

import { trpc } from "~/trpc/client";

export type Gstr1Filing = RouterOutputs["gst"]["listFilings"]["data"][number];
export type Gstr1FilingPreview = RouterOutputs["gst"]["previewFiling"]["data"];
export type BillGstState = RouterOutputs["gst"]["billState"]["data"];
export type GstAction = keyof BillGstState["allowed"];

interface UseGstParams {
  loadFilings?: boolean;
  // A month to preview before its first filing (`YYYY-MM`).
  previewMonth?: string | null;
  enabled?: boolean;
}

// The Admin GST page (Spec I): filed months and Record / Correct filing. A filing locks Bills dated in its month, so every write also reloads the Bill papers.
export function useGst({ loadFilings = false, previewMonth, enabled = true }: UseGstParams = {}) {
  const utils = trpc.useUtils();

  const filingsQuery = trpc.gst.listFilings.useQuery(undefined, {
    enabled: enabled && loadFilings,
  });
  const previewQuery = trpc.gst.previewFiling.useQuery(
    { month: previewMonth ?? "" },
    { enabled: enabled && Boolean(previewMonth), retry: false, staleTime: 0 },
  );

  const invalidateFilings = () => {
    utils.gst.invalidate();
    utils.ledger.billPaper.invalidate();
  };
  const recordFilingMutation = trpc.gst.recordFiling.useMutation({
    onSuccess: invalidateFilings,
    onError: invalidateFilings,
  });
  const correctFilingMutation = trpc.gst.correctFiling.useMutation({
    onSuccess: invalidateFilings,
    onError: invalidateFilings,
  });

  return {
    filings: filingsQuery.data?.data ?? [],
    isFilingsLoading: filingsQuery.isLoading,
    isFilingsError: filingsQuery.isError,
    refetchFilings: filingsQuery.refetch,
    isFilingsFetching: filingsQuery.isFetching,

    filingPreview: previewMonth ? (previewQuery.data?.data ?? null) : null,
    isFilingPreviewLoading: previewQuery.isFetching,
    filingPreviewError: previewMonth ? previewQuery.error : null,

    recordFilingAsync: recordFilingMutation.mutateAsync,
    isRecordingFiling: recordFilingMutation.isPending,

    correctFilingAsync: correctFilingMutation.mutateAsync,
    isCorrectingFiling: correctFilingMutation.isPending,
  };
}

interface UseBillGstParams {
  billId?: string;
  // The filed months, for the Filed month marker's date and reference.
  loadFilings?: boolean;
  enabled?: boolean;
}

// The Bill paper's GST block (Spec I): the Bill's GST state and the filed months.
export function useBillGst({ billId, loadFilings = false, enabled = true }: UseBillGstParams = {}) {
  const billStateQuery = trpc.gst.billState.useQuery(
    { billId: billId ?? "" },
    { enabled: enabled && Boolean(billId) },
  );
  const filingsQuery = trpc.gst.listFilings.useQuery(undefined, {
    enabled: enabled && loadFilings,
  });

  return {
    billGstState: billStateQuery.data?.data ?? null,
    isBillGstStateLoading: billStateQuery.isLoading,
    isBillGstStateError: billStateQuery.isError,
    refetchBillGstState: billStateQuery.refetch,

    filings: filingsQuery.data?.data ?? [],
  };
}
