"use client";

import { useParams } from "next/navigation";
import { Suspense } from "react";

import { OpeningPaperView } from "~/components/admin/ledger/money-paper-view";
import { PaperLoadError, PaperSkeleton } from "~/components/admin/ledger/money-paper-parts";
import { useMoneyPaper } from "~/hooks/use-ledger";
import { useTranslate } from "~/hooks/use-translate";

// The Opening paper is read by Customer: a Customer has at most one Opening balance.
function OpeningPaperPageContent() {
  const tx = useTranslate();
  const { customerId } = useParams<{ customerId: string }>();
  const {
    openingPaper,
    openingSummary,
    isOpeningPaperLoading,
    isOpeningPaperError,
    refetchOpeningPaper,
  } = useMoneyPaper({ openingCustomerId: customerId });

  if (isOpeningPaperLoading) return <PaperSkeleton />;

  if (isOpeningPaperError || openingPaper === undefined || !openingSummary) {
    return (
      <PaperLoadError
        title={tx("admin.ledger.money.paper.loadErrorOpening")}
        customerId={customerId}
        onRetry={refetchOpeningPaper}
      />
    );
  }

  return <OpeningPaperView opening={openingPaper} summary={openingSummary} />;
}

export default function AdminOpeningPaperPage() {
  return (
    <Suspense fallback={null}>
      <OpeningPaperPageContent />
    </Suspense>
  );
}
