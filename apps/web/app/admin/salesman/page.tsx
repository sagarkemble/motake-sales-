"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PlusIcon, UserIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { ListItemSkeleton } from "~/components/admin/shared/list-item-skeleton";
import { getErrorMessage } from "~/lib/get-error-message";
import { useSalesmen } from "~/hooks/use-salesmen";
import { useListQueryState } from "~/hooks/shared/use-list-query-state";

function SalesmanPageContent() {
  const router = useRouter();
  const pageSize = 20;
  const { page, setPage } = useListQueryState({ withSearch: false });

  const { salesmenPage, isSalesmenListLoading, deactivateSalesmanAccountAsync } = useSalesmen({
    listFilters: { page, pageSize },
  });

  async function handleDeactivate(salesmanId: string) {
    try {
      await deactivateSalesmanAccountAsync({ id: salesmanId });
      toast.success("Salesman deactivated");
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not deactivate salesman. Try again."));
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-4">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-semibold">Salesmen</h1>
        <Button
          asChild
          size="icon"
          className="size-9 shrink-0 rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
        >
          <Link href="/admin/salesman/new" aria-label="New salesman">
            <PlusIcon />
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {isSalesmenListLoading ? (
          <ListItemSkeleton count={6} />
        ) : salesmenPage.items.length === 0 ? (
          <p className="col-span-full py-8 text-center text-sm text-muted-foreground">No salesmen yet</p>
        ) : (
          salesmenPage.items.map(({ salesman, profile }) => (
            <div
              key={salesman.id}
              role="button"
              tabIndex={0}
              onClick={() => router.push(`/admin/salesman/${salesman.id}`)}
              onKeyDown={(event) => {
                if (event.key === "Enter") router.push(`/admin/salesman/${salesman.id}`);
              }}
              className="flex items-center gap-3 rounded-2xl border bg-card p-3 text-left transition-colors hover:bg-accent/50"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted/40">
                <UserIcon className="size-5 text-muted-foreground" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{profile.name ?? "Unnamed"}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {salesman.salesmanCode} · {profile.phone ?? profile.email}
                </p>
              </div>

              <Button
                size="sm"
                variant="outline"
                className="rounded-full border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={profile.status === "inactive"}
                onClick={(event) => {
                  event.stopPropagation();
                  void handleDeactivate(salesman.id);
                }}
              >
                Deactivate
              </Button>
            </div>
          ))
        )}
      </div>

      {salesmenPage.totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground">
            Page {salesmenPage.page} of {salesmenPage.totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="rounded-full"
              disabled={salesmenPage.page <= 1}
              onClick={() => setPage(salesmenPage.page - 1)}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="rounded-full"
              disabled={salesmenPage.page >= salesmenPage.totalPages}
              onClick={() => setPage(salesmenPage.page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminSalesmanPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-4">
          <ListItemSkeleton count={6} />
        </div>
      }
    >
      <SalesmanPageContent />
    </Suspense>
  );
}
