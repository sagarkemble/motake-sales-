"use client";

import { useParams } from "next/navigation";
import { Suspense } from "react";

import { MoneyPaperView } from "~/components/admin/ledger/money-paper-view";
import { PaperLoadError, PaperSkeleton } from "~/components/admin/ledger/money-paper-parts";
import { useMoneyPaper } from "~/hooks/use-ledger";
import { useTranslate } from "~/hooks/use-translate";

function PaymentPaperPageContent() {
  const tx = useTranslate();
  const { paymentId } = useParams<{ paymentId: string }>();
  const { paymentPaper, isPaymentPaperLoading, refetchPaymentPaper } = useMoneyPaper({ paymentId });

  if (isPaymentPaperLoading) return <PaperSkeleton />;

  if (!paymentPaper) {
    return (
      <PaperLoadError
        title={tx("admin.ledger.money.paper.loadErrorPayment")}
        onRetry={() => refetchPaymentPaper()}
      />
    );
  }

  return (
    <MoneyPaperView
      model={{ kind: "payment", paper: paymentPaper }}
      onReload={refetchPaymentPaper}
    />
  );
}

export default function AdminPaymentPaperPage() {
  return (
    <Suspense fallback={<PaperSkeleton />}>
      <PaymentPaperPageContent />
    </Suspense>
  );
}
