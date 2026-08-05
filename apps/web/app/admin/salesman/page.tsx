"use client";

import { useState, Suspense } from "react";
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
  const [includeDeleted, setIncludeDeleted] = useState(false);

  const {
    salesmenPage,
    isSalesmenListLoading,
    deactivateSalesmanAccountAsync,
    isDeactivatingSalesmanAccount,
    reactivateSalesmanAccountAsync,
    isReactivatingSalesmanAccount,
    deleteSalesmanAccountAsync,
    isDeletingSalesmanAccount,
  } = useSalesmen({
    listFilters: { page, pageSize, includeDeleted },
  });

  async function handleDeactivate(salesmanId: string) {
    try {
      await deactivateSalesmanAccountAsync({ id: salesmanId });
      toast.success("Salesman deactivated");
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not deactivate salesman. Try again."));
    }
  }

  async function handleReactivate(salesmanId: string) {
    try {
      await reactivateSalesmanAccountAsync({ id: salesmanId });
      toast.success("Salesman reactivated");
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not reactivate salesman. Try again."));
    }
  }

  async function handleDelete(salesmanId: string) {
    if (!window.confirm("Are you sure you want to soft-delete this salesman?")) return;
    try {
      await deleteSalesmanAccountAsync({ id: salesmanId });
      toast.success("Salesman deleted");
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not delete salesman. Try again."));
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

      <div className="flex items-center justify-end">
        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
          <input
            type="checkbox"
            checked={includeDeleted}
            onChange={(event) => setIncludeDeleted(event.target.checked)}
            className="rounded border-gray-300"
          />
          Show deleted salesmen
        </label>
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
              className={`flex items-center gap-3 rounded-2xl border bg-card p-3 text-left transition-colors hover:bg-accent/50 ${
                profile.deletedAt ? "opacity-60" : ""
              }`}
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

              <div className="flex shrink-0 items-center gap-2">
                {profile.deletedAt ? (
                  <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                    Deleted
                  </span>
                ) : null}
                {profile.status === "active" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full border-muted text-foreground hover:bg-accent hover:text-foreground"
                    disabled={Boolean(profile.deletedAt) || isDeactivatingSalesmanAccount}
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleDeactivate(salesman.id);
                    }}
                  >
                    Deactivate
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full border-brand text-brand hover:bg-brand/10 hover:text-brand"
                    disabled={Boolean(profile.deletedAt) || isReactivatingSalesmanAccount}
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleReactivate(salesman.id);
                    }}
                  >
                    Reactivate
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={Boolean(profile.deletedAt) || isDeletingSalesmanAccount}
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleDelete(salesman.id);
                  }}
                >
                  Delete
                </Button>
              </div>
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
