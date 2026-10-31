"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MapPinIcon, MoreVerticalIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { StatusBadge } from "~/components/admin/products/status-badge";
import { ListItemSkeleton } from "~/components/shared/list-item-skeleton";
import { ListPager } from "~/components/shared/list-pager";
import { getErrorMessage } from "~/lib/get-error-message";
import { getNameInitials } from "~/lib/get-name-initials";
import { useSalesmen } from "~/hooks/use-salesmen";
import { useListQueryState } from "~/hooks/shared/use-list-query-state";
import { useTranslate } from "~/hooks/use-translate";
import { usePageRefresh, usePageReloading } from "~/providers/page-refresh-provider";

function SalesmanPageContent() {
  const tx = useTranslate();
  const router = useRouter();
  const pageSize = 20;
  const { page, setPage } = useListQueryState({ withSearch: false });
  const [includeDeleted, setIncludeDeleted] = useState(false);

  const {
    salesmenPage,
    isSalesmenListLoading,
    refetchSalesmenList,
    isSalesmenListFetching,
    deactivateSalesmanAccountAsync,
    isDeactivatingSalesmanAccount,
    reactivateSalesmanAccountAsync,
    isReactivatingSalesmanAccount,
    deleteSalesmanAccountAsync,
    isDeletingSalesmanAccount,
  } = useSalesmen({
    listFilters: { page, pageSize, includeDeleted },
  });
  usePageRefresh(refetchSalesmenList, isSalesmenListFetching);
  const isReloading = usePageReloading();

  async function handleDeactivate(salesmanId: string) {
    try {
      await deactivateSalesmanAccountAsync({ id: salesmanId });
      toast.success(tx("admin.salesmen.deactivateSuccess"));
    } catch (error) {
      toast.error(getErrorMessage(tx, error, tx("admin.salesmen.deactivateFailed")));
    }
  }

  async function handleReactivate(salesmanId: string) {
    try {
      await reactivateSalesmanAccountAsync({ id: salesmanId });
      toast.success(tx("admin.salesmen.reactivateSuccess"));
    } catch (error) {
      toast.error(getErrorMessage(tx, error, tx("admin.salesmen.reactivateFailed")));
    }
  }

  async function handleDelete(salesmanId: string) {
    if (!window.confirm(tx("admin.salesmen.deleteConfirmPrompt"))) return;
    try {
      await deleteSalesmanAccountAsync({ id: salesmanId });
      toast.success(tx("admin.salesmen.deleteSuccess"));
    } catch (error) {
      toast.error(getErrorMessage(tx, error, tx("admin.salesmen.deleteFailed")));
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6">
      <div className="flex items-center justify-end">
        <h1 className="sr-only">{tx("admin.salesmen.title")}</h1>
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
          <Checkbox
            checked={includeDeleted}
            onCheckedChange={(checked) => setIncludeDeleted(checked === true)}
            className="data-[state=checked]:border-brand data-[state=checked]:bg-brand"
          />
          {tx("admin.salesmen.showDeleted")}
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {isSalesmenListLoading || (isReloading && isSalesmenListFetching) ? (
          <ListItemSkeleton count={6} />
        ) : salesmenPage.items.length === 0 ? (
          <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
            {tx("admin.salesmen.empty")}
          </p>
        ) : (
          salesmenPage.items.map(({ salesman, profile, activeRouteName }) => {
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
                className={`flex cursor-pointer items-center gap-3 rounded-2xl border bg-card p-3.5 text-left outline-none transition-colors hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
                  profile.deletedAt ? "opacity-60" : ""
                }`}
              >
                <Avatar className="size-11 shrink-0 border">
                  <AvatarImage
                    src={profile.avatarUrl ?? undefined}
                    alt={profile.name ?? tx("admin.nav.salesman")}
                  />
                  <AvatarFallback className="bg-brand/10 text-sm font-semibold text-brand">
                    {getNameInitials(profile.name, "S")}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {profile.name ?? tx("admin.salesmen.unnamed")}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {salesman.salesmanCode} · {profile.phone ?? profile.email}
                  </p>
                  <p
                    aria-label={tx("admin.salesmen.activeRouteAria")}
                    className={`mt-0.5 flex items-center gap-1 truncate text-xs font-medium ${
                      activeRouteName ? "text-brand" : "text-muted-foreground"
                    }`}
                  >
                    <MapPinIcon className="size-3 shrink-0" />
                    <span className="truncate">
                      {activeRouteName ?? tx("admin.salesmen.noActiveRoute")}
                    </span>
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {profile.deletedAt ? (
                    <Badge
                      variant="outline"
                      className="border-transparent bg-destructive/10 text-destructive"
                    >
                      {tx("common.status.deleted")}
                    </Badge>
                  ) : (
                    <StatusBadge status={profile.status === "active" ? "active" : "inactive"} />
                  )}

                  {/* A deleted salesman is gone for good: no Reactivate, no second Delete. */}
                  {!isDeleted && (
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
                            {tx("admin.customers.deactivate")}
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            disabled={isReactivatingSalesmanAccount}
                            onSelect={() => handleReactivate(salesman.id)}
                          >
                            {tx("admin.customers.reactivate")}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          variant="destructive"
                          disabled={isDeletingSalesmanAccount}
                          onSelect={() => handleDelete(salesman.id)}
                        >
                          {tx("admin.products.deleteConfirm")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <ListPager
        page={salesmenPage.page}
        totalPages={salesmenPage.totalPages}
        onPageChange={setPage}
      />
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
