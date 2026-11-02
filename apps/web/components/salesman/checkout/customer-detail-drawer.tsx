"use client";

import { LanguagesIcon, MapPinIcon, PhoneIcon, SearchXIcon, UserIcon } from "lucide-react";

import { CardDetailSkeleton } from "~/components/shared/card-detail-skeleton";
import { RouteTag } from "~/components/shared/route-tag";
import { ShopPhotoThumbnail } from "~/components/shared/shop-photo-thumbnail";
import { Button } from "~/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "~/components/ui/drawer";
import { ScrollArea } from "~/components/ui/scroll-area";
import type { CheckoutCustomer } from "~/hooks/salesman/use-checkout-wizard";
import { useCustomers } from "~/hooks/use-customers";
import { useTranslate } from "~/hooks/use-translate";
import { preferredLanguageLabelKey } from "~/lib/preferred-language";

interface CustomerDetailDrawerProps {
  customerId: string | null;
  onOpenChange: (open: boolean) => void;
  onUseCustomer: (customer: CheckoutCustomer) => void;
}

/**
 * A Customer on the salesman's Active GatePass Route. The server says not found for a Customer
 * off that Route, so this never reveals where one is.
 */
export function CustomerDetailDrawer({
  customerId,
  onOpenChange,
  onUseCustomer,
}: CustomerDetailDrawerProps) {
  const tx = useTranslate();
  const { customer, isCustomerLoading } = useCustomers({ customerId: customerId ?? undefined });

  const detailRows = customer
    ? [
        {
          icon: UserIcon,
          label: tx("admin.customers.form.contactName"),
          value: customer.contactName ?? "—",
        },
        { icon: PhoneIcon, label: tx("common.fields.phone"), value: customer.phone },
        { icon: MapPinIcon, label: tx("common.fields.address"), value: customer.address },
      ]
    : [];

  return (
    <Drawer open={Boolean(customerId)} onOpenChange={onOpenChange}>
      <DrawerContent className="data-[vaul-drawer-direction=bottom]:max-h-[90dvh]">
        <DrawerHeader className="text-left">
          <DrawerTitle>{tx("salesman.checkout.customer.detailTitle")}</DrawerTitle>
        </DrawerHeader>

        {/* Radix lays the viewport content out as a table; block keeps the rows' truncation working. */}
        <ScrollArea className="flex min-h-0 flex-col [&>[data-slot=scroll-area-viewport]>div]:block!">
          <div className="flex flex-col gap-4 px-4 pb-2">
            {isCustomerLoading ? (
              <CardDetailSkeleton />
            ) : !customer ? (
              <div className="flex flex-col items-center gap-2 rounded-2xl border p-6 text-center">
                <SearchXIcon className="size-9 text-muted-foreground" />
                <p className="text-base font-semibold">{tx("admin.customers.notFound")}</p>
                <p className="text-sm text-muted-foreground">
                  {tx("salesman.checkout.customer.notFoundHint")}
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <ShopPhotoThumbnail
                    shopPhotoUrl={customer.shopPhotoUrl}
                    shopName={customer.shopName}
                    size="lg"
                    shape="rounded"
                  />
                  <div className="min-w-0">
                    <p className="text-lg font-semibold leading-tight">{customer.shopName}</p>
                    <RouteTag
                      name={customer.routeName}
                      code={customer.routeCode}
                      className="mt-1"
                    />
                  </div>
                </div>
                <div className="divide-y rounded-2xl border bg-card shadow-sm">
                  {detailRows.map((row) => (
                    <div key={row.label} className="flex items-start gap-3 px-3 py-2.5">
                      <row.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="text-[11px] text-muted-foreground">{row.label}</p>
                        <p className="text-sm">{row.value}</p>
                      </div>
                    </div>
                  ))}
                  <div className="flex items-start gap-3 px-3 py-2.5">
                    <LanguagesIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="text-[11px] text-muted-foreground">
                        {tx("common.preferredLanguage.label")}
                      </p>
                      <p className="text-sm font-medium">
                        {tx(preferredLanguageLabelKey(customer.preferredLanguage))}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {tx("common.preferredLanguage.fixedHint")}
                      </p>
                    </div>
                  </div>
                  {customer.notes && (
                    <div className="px-3 py-2.5">
                      <p className="text-[11px] text-muted-foreground">
                        {tx("admin.customers.form.notes")}
                      </p>
                      <p className="text-sm">{customer.notes}</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </ScrollArea>

        {customer && (
          <DrawerFooter>
            <Button
              type="button"
              className="h-11 rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
              onClick={() => onUseCustomer(customer)}
            >
              {tx("salesman.checkout.customer.useForOrder")}
            </Button>
          </DrawerFooter>
        )}
      </DrawerContent>
    </Drawer>
  );
}
