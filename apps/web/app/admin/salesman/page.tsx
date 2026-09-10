"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreVerticalIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { ListItemSkeleton } from "~/components/shared/list-item-skeleton";
import { getErrorMessage } from "~/lib/get-error-message";
import { getNameInitials } from "~/lib/get-name-initials";
import { useSalesmen } from "~/hooks/use-salesmen";
import { useListQueryState } from "~/hooks/shared/use-list-query-state";
import { useTranslate } from "~/hooks/use-translate";

function SalesmanPageContent() {
  const tx = useTranslate();
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
      toast.success(tx("admin.salesmen.deactivateSuccess"));
    } catch (error) {
      toast.error(getErrorMessage(error, tx("admin.salesmen.deactivateFailed")));
    }
  }

  async function handleReactivate(salesmanId: string) {
    try {
      await reactivateSalesmanAccountAsync({ id: salesmanId });
      toast.success(tx("admin.salesmen.reactivateSuccess"));
    } catch (error) {
      toast.error(getErrorMessage(error, tx("admin.salesmen.reactivateFailed")));
    }
  }

  async function handleDelete(salesmanId: string) {
    if (!window.confirm("Are you sure you want to soft-delete this salesman?")) return;
    try {
      await deleteSalesmanAccountAsync({ id: salesmanId });
      toast.success(tx("admin.salesmen.deleteSuccess"));
    } catch (error) {
      toast.error(getErrorMessage(error, tx("admin.salesmen.deleteFailed")));
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-semibold">Salesmen</h1>
        <Button
          asChild
          size="icon"
          className="size-9 shrink-0 rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
        >
          <Link href="/admin/salesman/new" aria-label={tx("admin.salesmen.newAria")}>
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {isSalesmenListLoading ? (
          <ListItemSkeleton count={6} />
        ) : salesmenPage.items.length === 0 ? (
          <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
            {tx("admin.salesmen.empty")}
          </p>
        ) : (
          salesmenPage.items.map(({ salesman, profile }) => {
            const isDeleted = Boolean(profile.deletedAt);

            return (
              <div
                key={salesman.id}
                role="button"
                tabIndex={0}
                onClick={() => router.push(`/admin/salesman/${salesman.id}`)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  router.push(`/admin/salesman/${salesman.id}`);
                }}
                className={`flex items-center gap-3 rounded-2xl border bg-card p-3.5 text-left shadow-sm transition-colors hover:border-brand/40 hover:shadow-md ${
                  profile.deletedAt ? "opacity-60" : ""
                }`}
              >
                <Avatar className="size-11 shrink-0 border">
                  <AvatarImage src={profile.avatarUrl ?? undefined} alt={profile.name ?? "Salesman"} />
                  <AvatarFallback className="bg-brand/10 text-sm font-semibold text-brand">
                    {getNameInitials(profile.name, "S")}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{profile.name ?? "Unnamed"}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {salesman.salesmanCode} · {profile.phone ?? profile.email}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {profile.deletedAt ? (
                    <Badge
                      variant="outline"
                      className="border-transparent bg-destructive/10 text-destructive"
                    >
                      Deleted
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className={
                        profile.status === "active"
                          ? "border-transparent bg-brand/10 text-brand"
                          : "border-transparent bg-muted text-muted-foreground"
                      }
                    >
                      {profile.status === "active" ? "Active" : "common.status.inactive"}
                    </Badge>
                  )}

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={tx("admin.salesmen.actionsAria")}
                        className="size-8 shrink-0"
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        <MoreVerticalIcon className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
                      {profile.status === "active" ? (
                        <DropdownMenuItem
                          disabled={isDeactivatingSalesmanAccount}
                          onSelect={() => handleDeactivate(salesman.id)}
                        >
                          Deactivate
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          disabled={isReactivatingSalesmanAccount}
                          onSelect={() => handleReactivate(salesman.id)}
                        >
                          Reactivate
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        variant="destructive"
                        disabled={isDeletingSalesmanAccount}
                        onSelect={() => handleDelete(salesman.id)}
                      >
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })
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
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-4 sm:px-6">
          <ListItemSkeleton count={6} />
        </div>
      }
    >
      <SalesmanPageContent />
    </Suspense>
  );
}
