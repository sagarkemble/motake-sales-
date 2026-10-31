"use client";

import { PlusIcon } from "lucide-react";
import { Suspense, useState } from "react";

import { FilingDialog } from "~/components/admin/gst/filing-dialog";
import { FilingsList, GstError, GstSkeleton } from "~/components/admin/gst/gst-lists";
import { Button } from "~/components/ui/button";
import { useGst, type Gstr1Filing } from "~/hooks/use-gst";
import { useTranslate } from "~/hooks/use-translate";
import { usePageRefresh, usePageReloading } from "~/providers/page-refresh-provider";

// Admin GST (Spec I): the filed GSTR-1 months and Record / Correct filing. Admin only (the Admin
// shell sends a salesman away).
function GstPageContent() {
  const tx = useTranslate();
  const [target, setTarget] = useState<Gstr1Filing | "new" | null>(null);

  const { filings, isFilingsLoading, isFilingsError, refetchFilings, isFilingsFetching } = useGst({
    loadFilings: true,
  });
  usePageRefresh(() => refetchFilings(), isFilingsFetching);
  const isReloading = usePageReloading();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-4">
      <div className="flex items-center justify-end gap-2 md:justify-between">
        {/* The phone navbar already names the page. */}
        <h1 className="sr-only md:not-sr-only md:text-base md:font-semibold">
          {tx("admin.gst.title")}
        </h1>
        <Button
          size="sm"
          disabled={isFilingsLoading}
          onClick={() => setTarget("new")}
          className="rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
        >
          <PlusIcon className="size-4" />
          {tx("admin.gst.recordFiling")}
        </Button>
      </div>
      <div className="space-y-2">
        {isFilingsLoading || (isReloading && isFilingsFetching) ? (
          <GstSkeleton />
        ) : isFilingsError ? (
          <GstError onRetry={() => void refetchFilings()} />
        ) : (
          <>
            <FilingsList filings={filings} onCorrect={setTarget} />
            {filings.length > 0 && (
              <p className="text-xs text-muted-foreground">{tx("admin.gst.filings.hint")}</p>
            )}
          </>
        )}
      </div>
      <FilingDialog target={target} filings={filings} onClose={() => setTarget(null)} />
    </div>
  );
}

export default function AdminGstPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-5xl px-4 py-4">
          <GstSkeleton />
        </div>
      }
    >
      <GstPageContent />
    </Suspense>
  );
}
