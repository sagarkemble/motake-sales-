"use client";

import { BackHeader } from "~/components/admin/products/back-header";
import { CitiesTab } from "~/components/admin/settings/cities-tab";
import { CreditNoteDeadlineTab } from "~/components/admin/settings/credit-note-deadline-tab";
import { NumberSeriesTab } from "~/components/admin/settings/number-series-tab";
import { SellerSettingsTab } from "~/components/admin/settings/seller-settings-tab";
import { UnitsTab } from "~/components/admin/settings/units-tab";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { useSettings } from "~/hooks/use-settings";
import { useTranslate } from "~/hooks/use-translate";

export default function AdminSettingsPage() {
  const tx = useTranslate();
  const {
    creditNoteDeadlines,
    isCreditNoteDeadlinesLoading,
    isCreditNoteDeadlinesError,
    refetchCreditNoteDeadlines,
  } = useSettings();

  // The deadline list runs newest first from next year, so it also names the financial years.
  const financialYears = creditNoteDeadlines.map((entry) => entry.financialYear);
  const [nextFinancialYear, currentFinancialYear] = financialYears;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-4">
      <BackHeader href="/admin/account" title={tx("admin.settings.title")} />
      <Tabs defaultValue="seller">
        <TabsList className="w-full">
          <TabsTrigger value="seller">{tx("admin.settings.tabs.seller")}</TabsTrigger>
          <TabsTrigger value="prefixes">{tx("admin.settings.tabs.prefixes")}</TabsTrigger>
          <TabsTrigger value="deadline">{tx("admin.settings.tabs.deadline")}</TabsTrigger>
          <TabsTrigger value="cities">{tx("admin.settings.tabs.cities")}</TabsTrigger>
          <TabsTrigger value="units">{tx("admin.settings.tabs.units")}</TabsTrigger>
        </TabsList>
        <TabsContent value="seller" className="mt-4">
          <SellerSettingsTab />
        </TabsContent>
        <TabsContent value="prefixes" className="mt-4">
          {isCreditNoteDeadlinesLoading ? (
            <Skeleton className="h-96 w-full rounded-2xl" />
          ) : isCreditNoteDeadlinesError || !currentFinancialYear || !nextFinancialYear ? (
            <LoadFailed onRetry={() => void refetchCreditNoteDeadlines()} />
          ) : (
            <NumberSeriesTab
              financialYears={financialYears}
              currentFinancialYear={currentFinancialYear}
              nextFinancialYear={nextFinancialYear}
            />
          )}
        </TabsContent>
        <TabsContent value="deadline" className="mt-4">
          {isCreditNoteDeadlinesLoading ? (
            <Skeleton className="h-96 w-full rounded-2xl" />
          ) : isCreditNoteDeadlinesError ? (
            <LoadFailed onRetry={() => void refetchCreditNoteDeadlines()} />
          ) : (
            <CreditNoteDeadlineTab deadlines={creditNoteDeadlines} />
          )}
        </TabsContent>
        <TabsContent value="cities" className="mt-4">
          <CitiesTab />
        </TabsContent>
        <TabsContent value="units" className="mt-4">
          <UnitsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function LoadFailed({ onRetry }: { onRetry: () => void }) {
  const tx = useTranslate();
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <p className="text-sm text-muted-foreground">{tx("admin.settings.loadFailed")}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        {tx("common.actions.tryAgain")}
      </Button>
    </div>
  );
}
