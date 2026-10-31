import type { RouterInputs, RouterOutputs } from "@repo/trpc/client";
import { useEffect } from "react";

import { refusalOf } from "~/lib/refusal";

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
export type PaymentPaper = RouterOutputs["ledger"]["paymentPaper"]["data"];
export type RefundPaper = RouterOutputs["ledger"]["refundPaper"]["data"];
export type OpeningPaper = RouterOutputs["ledger"]["openingPaper"]["data"];
export type PaymentMode = PaymentPaper["payment"]["mode"];

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
  // A Payment or Refund moves the Balance the Customer screens show.
  const invalidateMoney = () => {
    utils.ledger.invalidate();
    utils.customers.invalidate();
  };
  const addPaymentMutation = trpc.ledger.addPayment.useMutation({
    onSuccess: invalidateMoney,
    onError: invalidateMoney,
  });
  const addRefundMutation = trpc.ledger.addRefund.useMutation({
    onSuccess: invalidateMoney,
    onError: invalidateMoney,
  });
  const raiseBillMutation = trpc.ledger.raiseBill.useMutation({
    onSuccess: () => {
      utils.ledger.invalidate();
      utils.bills.invalidate();
      // Lifetime stats and sales reports sum the Bills.
      utils.customers.invalidate();
      utils.reports.invalidate();
    },
  });

  return {
    rowsPage:
      rowsQuery.data?.data ??
      emptyPaginatedResult<LedgerRow>(rowFilters?.page, rowFilters?.pageSize),
    isRowsLoading: rowsQuery.isLoading,
    isRowsFetching: rowsQuery.isFetching,
    isRowsError: rowsQuery.isError,
    refetchRows: rowsQuery.refetch,

    summary: summaryQuery.data?.data ?? null,
    isSummaryLoading: summaryQuery.isLoading,
    isSummaryError: summaryQuery.isError,
    refetchSummary: summaryQuery.refetch,
    isSummaryFetching: summaryQuery.isFetching,

    openPreorders: openPreordersQuery.data?.data ?? [],
    refetchOpenPreorders: openPreordersQuery.refetch,
    isOpenPreordersFetching: openPreordersQuery.isFetching,

    catalog: catalogQuery.data?.data ?? [],
    isCatalogLoading: catalogQuery.isLoading,
    isCatalogError: catalogQuery.isError,
    refetchCatalog: catalogQuery.refetch,

    addOpeningBalanceAsync: addOpeningBalanceMutation.mutateAsync,
    isAddingOpeningBalance: addOpeningBalanceMutation.isPending,

    raiseBillAsync: raiseBillMutation.mutateAsync,
    isRaisingBill: raiseBillMutation.isPending,

    addPaymentAsync: addPaymentMutation.mutateAsync,
    isAddingPayment: addPaymentMutation.isPending,

    addRefundAsync: addRefundMutation.mutateAsync,
    isAddingRefund: addRefundMutation.isPending,
  };
}

interface UseMoneyPaperParams {
  paymentId?: string;
  refundId?: string;
  // The Opening paper is read by Customer; it has no id of its own.
  openingCustomerId?: string;
  enabled?: boolean;
}

// The Payment, Refund and Opening papers (Spec H) and the two Corrects. A refused Correct also
// reloads the paper, as a refused Bill write does; the open Correct form keeps the event it was
// opened on, so a stale save is refused rather than resent on the newer paper.
export function useMoneyPaper({
  paymentId,
  refundId,
  openingCustomerId,
  enabled = true,
}: UseMoneyPaperParams = {}) {
  const utils = trpc.useUtils();

  const paymentPaperQuery = trpc.ledger.paymentPaper.useQuery(
    { paymentId: paymentId ?? "" },
    { enabled: enabled && Boolean(paymentId) },
  );
  const refundPaperQuery = trpc.ledger.refundPaper.useQuery(
    { refundId: refundId ?? "" },
    { enabled: enabled && Boolean(refundId) },
  );
  const openingPaperQuery = trpc.ledger.openingPaper.useQuery(
    { customerId: openingCustomerId ?? "" },
    { enabled: enabled && Boolean(openingCustomerId) },
  );
  const openingSummaryQuery = trpc.ledger.summary.useQuery(
    { customerId: openingCustomerId ?? "" },
    { enabled: enabled && Boolean(openingCustomerId) },
  );

  const invalidatePapers = () => {
    utils.ledger.invalidate();
    utils.customers.invalidate();
  };
  const correctPaymentMutation = trpc.ledger.correctPayment.useMutation({
    onSuccess: invalidatePapers,
    onError: invalidatePapers,
  });
  const correctRefundMutation = trpc.ledger.correctRefund.useMutation({
    onSuccess: invalidatePapers,
    onError: invalidatePapers,
  });

  return {
    paymentPaper: paymentPaperQuery.data?.data ?? null,
    isPaymentPaperLoading: paymentPaperQuery.isLoading,
    refetchPaymentPaper: paymentPaperQuery.refetch,

    refundPaper: refundPaperQuery.data?.data ?? null,
    isRefundPaperLoading: refundPaperQuery.isLoading,
    refetchRefundPaper: refundPaperQuery.refetch,

    // Undefined until loaded; null when the Customer has no Opening balance.
    openingPaper: openingPaperQuery.data?.data,
    openingSummary: openingSummaryQuery.data?.data ?? null,
    isOpeningPaperLoading: openingPaperQuery.isLoading || openingSummaryQuery.isLoading,
    isOpeningPaperError: openingPaperQuery.isError || openingSummaryQuery.isError,
    refetchOpeningPaper: () => {
      void openingPaperQuery.refetch();
      void openingSummaryQuery.refetch();
    },

    correctPaymentAsync: correctPaymentMutation.mutateAsync,
    isCorrectingPayment: correctPaymentMutation.isPending,

    correctRefundAsync: correctRefundMutation.mutateAsync,
    isCorrectingRefund: correctRefundMutation.isPending,
  };
}

interface UseBillPaperParams {
  billId?: string;
  orderId?: string;
  enabled?: boolean;
}

// The Bill paper and its three writes, and the Pre-order paper. A refused write also reloads the
// paper, so a retry never resends a version number the server has moved past.
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
    // Cancel gives sold qty back to the gate pass; lifetime stats and reports sum the Bills.
    utils.gatepasses.invalidate();
    utils.customers.invalidate();
    utils.reports.invalidate();
  };
  const correctMutation = trpc.ledger.correct.useMutation({
    onSuccess: invalidatePapers,
    onError: invalidatePapers,
  });
  const cancelMutation = trpc.ledger.cancel.useMutation({
    onSuccess: invalidatePapers,
    onError: invalidatePapers,
  });
  const raiseNoteMutation = trpc.ledger.raiseNote.useMutation({
    onSuccess: invalidatePapers,
    onError: invalidatePapers,
  });

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
  };
}

// A Bill version's or Note's PDF: a 5-minute link, drawn first when the PDF was never drawn.
// Fetched on click only, never cached.
export function useDocumentDownloadLink() {
  const utils = trpc.useUtils();
  return {
    fetchDownloadLink: async (target: RouterInputs["documents"]["downloadLink"]) =>
      (await utils.documents.downloadLink.fetch(target, { staleTime: 0 })).data,
  };
}

const PAPER_OUT_OF_DATE = new Set(["stale_version", "bill_cancelled", "unknown_line"]);

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

  // A preview refused because the paper is out of date reloads the paper, as a refused write does.
  const utils = trpc.useUtils();
  const stalePaper = [correctPreviewQuery.error, raiseNotePreviewQuery.error].some((error) =>
    PAPER_OUT_OF_DATE.has(refusalOf(error)?.reason ?? ""),
  );
  useEffect(() => {
    if (stalePaper) void utils.ledger.billPaper.invalidate();
  }, [stalePaper, utils]);

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
