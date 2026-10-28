"use client";

import { PlusIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { FilingDialog } from "~/components/admin/gst/filing-dialog";
import {
  FilingsList,
  GstError,
  GstSkeleton,
  IrnPendingBadge,
  IrnPendingList,
} from "~/components/admin/gst/gst-lists";
import { ListPager } from "~/components/shared/list-pager";
import { Button } from "~/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { useGst, type Gstr1Filing } from "~/hooks/use-gst";
import { useTranslate } from "~/hooks/use-translate";

const PAGE_SIZE = 25;

type GstTab = "filings" | "irn";

// Admin GST (Spec I): the filed GSTR-1 months, Record / Correct filing, and the IRN pending
// count and list, oldest Bill first. Admin only (the Admin shell sends a salesman away).
function GstPageContent() {
  const tx = useTranslate();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab: GstTab = searchParams.get("tab") === "irn" ? "irn" : "filings";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const [target, setTarget] = useState<Gstr1Filing | "new" | null>(null);

  const {
    filings,
    isFilingsLoading,
    isFilingsError,
    refetchFilings,
    irnPendingCount,
    irnPendingPage,
    isIrnPendingLoading,
    isIrnPendingError,
    refetchIrnPending,
  } = useGst({ loadFilings: true, irnPendingPage: { page, pageSize: PAGE_SIZE } });

  function replaceQuery(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-display text-2xl">{tx("admin.gst.title")}</h1>
        <Button size="sm" disabled={isFilingsLoading} onClick={() => setTarget("new")}>
          <PlusIcon className="size-4" />
          {tx("admin.gst.recordFiling")}
        </Button>
      </div>
      <Tabs
        value={tab}
        onValueChange={(value) => replaceQuery({ tab: value === "irn" ? "irn" : null, page: null })}
      >
        <TabsList className="grid w-full grid-cols-2 sm:inline-flex sm:w-auto">
          <TabsTrigger value="filings">{tx("admin.gst.tabs.filings")}</TabsTrigger>
          <TabsTrigger value="irn" className="gap-1.5">
            {tx("admin.gst.tabs.irnPending")} <IrnPendingBadge count={irnPendingCount} />
          </TabsTrigger>
        </TabsList>
        <TabsContent value="filings" className="space-y-2">
          {isFilingsLoading ? (
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
        </TabsContent>
        <TabsContent value="irn" className="space-y-2">
          {isIrnPendingLoading ? (
            <GstSkeleton />
          ) : isIrnPendingError ? (
            <GstError onRetry={() => void refetchIrnPending()} />
          ) : (
            <>
              <IrnPendingList rows={irnPendingPage.items} />
              {irnPendingPage.items.length > 0 && (
                <>
                  <p className="text-xs text-muted-foreground">
                    {tx("admin.gst.irn.count", { count: irnPendingPage.totalCount })} ·{" "}
                    {tx("admin.gst.irn.hint")}
                  </p>
                  <ListPager
                    page={irnPendingPage.page}
                    totalPages={irnPendingPage.totalPages}
                    onPageChange={(nextPage) => replaceQuery({ page: String(nextPage) })}
                  />
                </>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
      <FilingDialog target={target} filings={filings} onClose={() => setTarget(null)} />
    </div>
  );
}

export default function AdminGstPage() {
  return (
    <Suspense fallback={null}>
      <GstPageContent />
    </Suspense>
  );
}
