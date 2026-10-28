"use client";

import { useParams } from "next/navigation";
import { Suspense } from "react";

import { MoneyPaperView } from "~/components/admin/ledger/money-paper-view";
import { PaperLoadError, PaperSkeleton } from "~/components/admin/ledger/money-paper-parts";
import { useMoneyPaper } from "~/hooks/use-ledger";
import { useTranslate } from "~/hooks/use-translate";

function RefundPaperPageContent() {
  const tx = useTranslate();
  const { refundId } = useParams<{ refundId: string }>();
  const { refundPaper, isRefundPaperLoading, refetchRefundPaper } = useMoneyPaper({ refundId });

  if (isRefundPaperLoading) return <PaperSkeleton />;

  if (!refundPaper) {
    return (
      <PaperLoadError
        title={tx("admin.ledger.money.paper.loadErrorRefund")}
        onRetry={() => refetchRefundPaper()}
      />
    );
  }

  return (
    <MoneyPaperView model={{ kind: "refund", paper: refundPaper }} onReload={refetchRefundPaper} />
  );
}

export default function AdminRefundPaperPage() {
  return (
    <Suspense fallback={null}>
      <RefundPaperPageContent />
    </Suspense>
  );
}
