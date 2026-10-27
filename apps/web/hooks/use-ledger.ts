import type { RouterInputs, RouterOutputs } from "@repo/trpc/client";

import { trpc } from "~/trpc/client";

import { emptyPaginatedResult } from "./shared/pagination";

export type LedgerRow = RouterOutputs["ledger"]["rows"]["data"]["items"][number];
export type LedgerRowType = LedgerRow["rowType"];
export type LedgerSummary = RouterOutputs["ledger"]["summary"]["data"];
export type LedgerBalance = LedgerSummary["footer"]["closing"];
export type OpenPreorder = RouterOutputs["ledger"]["openPreorders"]["data"][number];
export type BillPaper = RouterOutputs["ledger"]["billPaper"]["data"];
export type PreOrderPaper = RouterOutputs["ledger"]["preOrderPaper"]["data"];
export type RaiseBillCatalogRow = RouterOutputs["ledger"]["raiseBillCatalog"]["data"][number];
export type NoteKind = BillPaper["notes"][number]["kind"];

interface UseLedgerParams {
  customerId?: string;
  // Filters and page for the Ledger table; the footer never follows them.
  rowFilters?: Omit<RouterInputs["ledger"]["rows"], "customerId">;
  loadCatalog?: boolean;
  enabled?: boolean;
}

// Admin Ledger (Spec G): one Customer's rows, footer, Open Pre-orders, Opening balance and Raise
// Bill. Every write invalidates the whole ledger router, so the footer and Balance follow.
export function useLedger({
  customerId,
  rowFilters,
  loadCatalog = false,
  enabled = true,
}: UseLedgerParams = {}) {
  const utils = trpc.useUtils();
  const hasCustomer = enabled && Boolean(customerId);

  const rowsQuery = trpc.ledger.rows.useQuery(
    { customerId: customerId ?? "", ...(rowFilters ?? {}) },
    { enabled: hasCustomer && Boolean(rowFilters) },
  );
  const summaryQuery = trpc.ledger.summary.useQuery(
    { customerId: customerId ?? "" },
    { enabled: hasCustomer },
  );
  const openPreordersQuery = trpc.ledger.openPreorders.useQuery(
    { customerId: customerId ?? "" },
    { enabled: hasCustomer },
  );
  const catalogQuery = trpc.ledger.raiseBillCatalog.useQuery(
    { customerId: customerId ?? "" },
    { enabled: hasCustomer && loadCatalog },
  );

  const addOpeningBalanceMutation = trpc.ledger.addOpeningBalance.useMutation({
    onSuccess: () => utils.ledger.invalidate(),
  });
  const raiseBillMutation = trpc.ledger.raiseBill.useMutation({
    onSuccess: () => {
      utils.ledger.invalidate();
      utils.bills.invalidate();
    },
  });

  return {
    rowsPage:
      rowsQuery.data?.data ??
      emptyPaginatedResult<LedgerRow>(rowFilters?.page, rowFilters?.pageSize),
    isRowsLoading: rowsQuery.isLoading,
    isRowsError: rowsQuery.isError,
    refetchRows: rowsQuery.refetch,

    summary: summaryQuery.data?.data ?? null,
    isSummaryLoading: summaryQuery.isLoading,
    isSummaryError: summaryQuery.isError,
    refetchSummary: summaryQuery.refetch,

    openPreorders: openPreordersQuery.data?.data ?? [],

    catalog: catalogQuery.data?.data ?? [],
    isCatalogLoading: catalogQuery.isLoading,
    isCatalogError: catalogQuery.isError,
    refetchCatalog: catalogQuery.refetch,

    addOpeningBalanceAsync: addOpeningBalanceMutation.mutateAsync,
    isAddingOpeningBalance: addOpeningBalanceMutation.isPending,

    raiseBillAsync: raiseBillMutation.mutateAsync,
    isRaisingBill: raiseBillMutation.isPending,
  };
}

interface UseBillPaperParams {
  billId?: string;
  orderId?: string;
  enabled?: boolean;
}

// The Bill paper and its three writes, and the Pre-order paper.
export function useBillPaper({ billId, orderId, enabled = true }: UseBillPaperParams = {}) {
  const utils = trpc.useUtils();

  const billPaperQuery = trpc.ledger.billPaper.useQuery(
    { billId: billId ?? "" },
    { enabled: enabled && Boolean(billId) },
  );
  const preOrderPaperQuery = trpc.ledger.preOrderPaper.useQuery(
    { orderId: orderId ?? "" },
    { enabled: enabled && Boolean(orderId) },
  );

  const invalidatePapers = () => {
    utils.ledger.invalidate();
    utils.bills.invalidate();
    utils.orders.invalidate();
  };
  const correctMutation = trpc.ledger.correct.useMutation({ onSuccess: invalidatePapers });
  const cancelMutation = trpc.ledger.cancel.useMutation({ onSuccess: invalidatePapers });
  const raiseNoteMutation = trpc.ledger.raiseNote.useMutation({ onSuccess: invalidatePapers });

  return {
    billPaper: billPaperQuery.data?.data ?? null,
    isBillPaperLoading: billPaperQuery.isLoading,
    isBillPaperError: billPaperQuery.isError,
    refetchBillPaper: billPaperQuery.refetch,

    preOrderPaper: preOrderPaperQuery.data?.data ?? null,
    isPreOrderPaperLoading: preOrderPaperQuery.isLoading,
    isPreOrderPaperError: preOrderPaperQuery.isError,
    refetchPreOrderPaper: preOrderPaperQuery.refetch,

    correctBillAsync: correctMutation.mutateAsync,
    isCorrectingBill: correctMutation.isPending,

    cancelBillAsync: cancelMutation.mutateAsync,
    isCancellingBill: cancelMutation.isPending,

    raiseNoteAsync: raiseNoteMutation.mutateAsync,
    isRaisingNote: raiseNoteMutation.isPending,

    // A 5-minute link, drawn first when the PDF was never drawn; fetched on click only.
    fetchDownloadLink: async (target: RouterInputs["documents"]["downloadLink"]) =>
      (await utils.documents.downloadLink.fetch(target, { staleTime: 0 })).data,
  };
}

type CorrectPreviewInput = RouterInputs["ledger"]["previewCorrect"];
type RaiseNotePreviewInput = RouterInputs["ledger"]["previewRaiseNote"];
type RaiseBillPreviewInput = RouterInputs["ledger"]["previewRaiseBill"];

// Server previews for the three forms; null input means nothing to preview yet. The last answer
// stays on screen while the next one loads, so totals do not flicker as qty changes.
export function useLedgerPreviews({
  correct,
  raiseNote,
  raiseBill,
}: {
  correct?: CorrectPreviewInput | null;
  raiseNote?: RaiseNotePreviewInput | null;
  raiseBill?: RaiseBillPreviewInput | null;
}) {
  const correctPreviewQuery = trpc.ledger.previewCorrect.useQuery(
    correct ?? { billId: "", expectedVersionNumber: 1, lines: [] },
    { enabled: Boolean(correct), retry: false, placeholderData: (previous) => previous },
  );
  const raiseNotePreviewQuery = trpc.ledger.previewRaiseNote.useQuery(
    raiseNote ?? { billId: "", expectedVersionNumber: 1, kind: "debit_note", lines: [] },
    { enabled: Boolean(raiseNote), retry: false, placeholderData: (previous) => previous },
  );
  const raiseBillPreviewQuery = trpc.ledger.previewRaiseBill.useQuery(
    raiseBill ?? { customerId: "", lines: [] },
    { enabled: Boolean(raiseBill), retry: false, placeholderData: (previous) => previous },
  );

  return {
    correctPreview: correct ? (correctPreviewQuery.data?.data ?? null) : null,
    isCorrectPreviewFetching: correctPreviewQuery.isFetching,
    correctPreviewError: correct ? correctPreviewQuery.error : null,

    raiseNotePreview: raiseNote ? (raiseNotePreviewQuery.data?.data ?? null) : null,
    isRaiseNotePreviewFetching: raiseNotePreviewQuery.isFetching,
    raiseNotePreviewError: raiseNote ? raiseNotePreviewQuery.error : null,

    raiseBillPreview: raiseBill ? (raiseBillPreviewQuery.data?.data ?? null) : null,
    isRaiseBillPreviewFetching: raiseBillPreviewQuery.isFetching,
    raiseBillPreviewError: raiseBill ? raiseBillPreviewQuery.error : null,
  };
}
