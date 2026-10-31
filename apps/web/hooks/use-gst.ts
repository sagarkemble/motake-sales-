import type { RouterInputs, RouterOutputs } from "@repo/trpc/client";

import { trpc } from "~/trpc/client";

import { emptyPaginatedResult } from "./shared/pagination";

export type Gstr1Filing = RouterOutputs["gst"]["listFilings"]["data"][number];
export type Gstr1FilingPreview = RouterOutputs["gst"]["previewFiling"]["data"];
export type IrnPendingRow = RouterOutputs["gst"]["listIrnPending"]["data"]["items"][number];
export type BillGstState = RouterOutputs["gst"]["billState"]["data"];
export type GstAction = keyof BillGstState["allowed"];

interface UseGstParams {
  // Page of the IRN pending list; left out, the list is not loaded.
  irnPendingPage?: RouterInputs["gst"]["listIrnPending"];
  loadFilings?: boolean;
  // A month to preview before its first filing (`YYYY-MM`).
  previewMonth?: string | null;
  enabled?: boolean;
}

// The Admin GST page (Spec I): filed months, IRN pending count and list, and Record / Correct
// filing. A filing locks Bills dated in its month, so every write also reloads the Bill papers.
export function useGst({
  irnPendingPage,
  loadFilings = false,
  previewMonth,
  enabled = true,
}: UseGstParams = {}) {
  const utils = trpc.useUtils();

  const filingsQuery = trpc.gst.listFilings.useQuery(undefined, {
    enabled: enabled && loadFilings,
  });
  const irnPendingCountQuery = trpc.gst.irnPendingCount.useQuery(undefined, { enabled });
  const irnPendingQuery = trpc.gst.listIrnPending.useQuery(irnPendingPage ?? {}, {
    enabled: enabled && Boolean(irnPendingPage),
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

    irnPendingCount: irnPendingCountQuery.data?.data ?? null,
    isIrnPendingCountLoading: irnPendingCountQuery.isLoading,
    refetchIrnPendingCount: irnPendingCountQuery.refetch,
    isIrnPendingCountFetching: irnPendingCountQuery.isFetching,

    irnPendingPage:
      irnPendingQuery.data?.data ??
      emptyPaginatedResult<IrnPendingRow>(irnPendingPage?.page, irnPendingPage?.pageSize),
    isIrnPendingLoading: irnPendingQuery.isLoading,
    isIrnPendingError: irnPendingQuery.isError,
    refetchIrnPending: irnPendingQuery.refetch,
    isIrnPendingFetching: irnPendingQuery.isFetching,

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

// The Bill paper's GST block (Spec I): the Bill's GST state and its three writes. Enter and
// Correct IRN change the paper's lock; portal cancellation cancels the Bill, so each write
// reloads the papers, the Ledger and the GST page, refused or not (as Spec G's writes do).
export function useBillGst({ billId, loadFilings = false, enabled = true }: UseBillGstParams = {}) {
  const utils = trpc.useUtils();

  const billStateQuery = trpc.gst.billState.useQuery(
    { billId: billId ?? "" },
    { enabled: enabled && Boolean(billId) },
  );
  const filingsQuery = trpc.gst.listFilings.useQuery(undefined, {
    enabled: enabled && loadFilings,
  });

  const invalidateBill = () => {
    utils.gst.invalidate();
    utils.ledger.invalidate();
    utils.bills.invalidate();
  };
  const invalidateCancelled = () => {
    invalidateBill();
    // Cancel gives sold qty back to the gate pass; lifetime stats and reports sum the Bills.
    utils.orders.invalidate();
    utils.gatepasses.invalidate();
    utils.customers.invalidate();
    utils.reports.invalidate();
  };
  const enterIrnMutation = trpc.gst.enterIrn.useMutation({
    onSuccess: invalidateBill,
    onError: invalidateBill,
  });
  const correctIrnMutation = trpc.gst.correctIrn.useMutation({
    onSuccess: invalidateBill,
    onError: invalidateBill,
  });
  const portalCancellationMutation = trpc.gst.recordPortalCancellation.useMutation({
    onSuccess: invalidateCancelled,
    onError: invalidateCancelled,
  });

  return {
    billGstState: billStateQuery.data?.data ?? null,
    isBillGstStateLoading: billStateQuery.isLoading,
    isBillGstStateError: billStateQuery.isError,
    refetchBillGstState: billStateQuery.refetch,

    filings: filingsQuery.data?.data ?? [],

    enterIrnAsync: enterIrnMutation.mutateAsync,
    isEnteringIrn: enterIrnMutation.isPending,

    correctIrnAsync: correctIrnMutation.mutateAsync,
    isCorrectingIrn: correctIrnMutation.isPending,

    recordPortalCancellationAsync: portalCancellationMutation.mutateAsync,
    isRecordingPortalCancellation: portalCancellationMutation.isPending,
  };
}

// Drafts (only while IRN pending, drawn on demand, never stored) and the signed QR image link.
// Fetched on click only, never cached.
export function useGstDocuments() {
  const utils = trpc.useUtils();
  return {
    fetchDraftPdf: async (billId: string) =>
      (await utils.gst.draftPdf.fetch({ billId }, { staleTime: 0, gcTime: 0 })).data,
    fetchPortalJsonDraft: async (billId: string) =>
      (await utils.gst.portalJsonDraft.fetch({ billId }, { staleTime: 0, gcTime: 0 })).data,
    fetchSignedQrImageLink: async (billId: string) =>
      (await utils.documents.signedQrImageLink.fetch({ billId }, { staleTime: 0 })).data,
  };
}
