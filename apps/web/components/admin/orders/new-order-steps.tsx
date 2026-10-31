"use client";

import { PlusIcon, SearchIcon, XIcon } from "lucide-react";
import { useId, useState } from "react";

import { CustomerPicker } from "~/components/admin/ledger/customer-picker";
import { InactiveBanner, PreorderItem } from "~/components/admin/ledger/ledger-parts";
import {
  AmountField,
  ModeField,
  ReferenceField,
} from "~/components/admin/ledger/money-paper-parts";
import { BalanceChangedDialog } from "~/components/shared/checkout/balance-changed-dialog";
import { BalanceChip } from "~/components/shared/checkout/balance-text";
import { PaymentBlock } from "~/components/shared/checkout/payment-block";
import { PaymentScannerButton } from "~/components/shared/checkout/payment-scanner-dialog";
import { QuoteTotals } from "~/components/shared/checkout/quote-totals";
import { RefusalAlert } from "~/components/shared/checkout/refusal-alert";
import { GstRate } from "~/components/shared/gst-rate";
import { ListItemSkeleton } from "~/components/shared/list-item-skeleton";
import { QuantityStepper } from "~/components/shared/quantity-stepper";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import type { OfficeOrder } from "~/hooks/use-office-order";
import { useFormatDate } from "~/hooks/use-format-date";
import { useFormatMoney } from "~/hooks/use-format-money";
import { useTranslate } from "~/hooks/use-translate";

/** The picked Customer: Route, Balance and a way back to the Customer step. */
export function PickedCustomer({ order, onChange }: { order: OfficeOrder; onChange: () => void }) {
  const tx = useTranslate();
  const { summary } = order;
  if (!summary) return null;
  return (
    <div className="flex items-start gap-3 rounded-2xl border bg-card p-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{summary.customer.shopName}</p>
        <p className="truncate text-xs text-muted-foreground">
          {summary.customer.routeName} ({summary.customer.routeCode}) · {summary.customer.phone}
        </p>
        <BalanceChip balancePaise={summary.footer.closing.balancePaise} className="mt-1" />
      </div>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="shrink-0 rounded-full"
        onClick={onChange}
      >
        {tx("admin.orders.new.change")}
      </Button>
    </div>
  );
}

export function CustomerStep({ order }: { order: OfficeOrder }) {
  const tx = useTranslate();
  const { summary } = order;
  return (
    <section className="flex flex-col gap-3">
      <div>
        <p className="text-base font-semibold">{tx("admin.orders.new.customerTitle")}</p>
        <p className="text-sm text-muted-foreground">{tx("admin.orders.new.customerHint")}</p>
      </div>
      <CustomerPicker
        value={order.customerId}
        selectedLabel={
          summary ? `${summary.customer.shopName} · ${summary.customer.phone}` : undefined
        }
        onChange={order.setCustomerId}
      />
      {summary && (
        <div className="flex flex-col gap-1 rounded-2xl border bg-card p-3 text-sm">
          <p className="font-medium">{summary.customer.shopName}</p>
          <p className="text-xs text-muted-foreground">
            {summary.customer.routeName} ({summary.customer.routeCode}) · {summary.customer.phone}
          </p>
          <BalanceChip balancePaise={summary.footer.closing.balancePaise} />
        </div>
      )}
      {order.inactive && <InactiveBanner />}
      {order.openPreorders.length > 0 && (
        <section className="flex flex-col gap-2 rounded-2xl border bg-card p-3">
          <div>
            <p className="text-sm font-medium">
              {tx("admin.orders.new.openPreorders", { count: order.openPreorders.length })}
            </p>
            <p className="text-xs text-muted-foreground">
              {tx("admin.orders.new.openPreordersHint")}
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {order.openPreorders.map((preorder) => (
              <PreorderItem key={preorder.id} preorder={preorder} />
            ))}
          </div>
        </section>
      )}
    </section>
  );
}

/** Every Variety priced on the Customer's Route; no GatePass stock limit. */
export function ItemsStep({ order }: { order: OfficeOrder }) {
  const tx = useTranslate();
  const { formatPaise } = useFormatMoney();
  const [query, setQuery] = useState("");
  const { summary, catalog } = order;
  const found = catalog.filter((row) =>
    `${row.productName} ${row.name} ${row.sku}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const nameBySku = new Map(catalog.map((row) => [row.sku, `${row.productName} · ${row.name}`]));
  const badLines = order.quote?.badLines ?? [];

  return (
    <section className="flex flex-col gap-3">
      <div>
        <p className="text-base font-semibold">{tx("admin.orders.new.itemsTitle")}</p>
        {summary && (
          <p className="text-sm text-muted-foreground">
            {tx("admin.orders.new.itemsHint", {
              route: `${summary.customer.routeName} (${summary.customer.routeCode})`,
            })}
          </p>
        )}
      </div>
      {badLines.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-2xl bg-destructive/10 p-3 text-xs text-destructive">
          {badLines.map((line) => (
            <li key={line.sku}>
              {nameBySku.get(line.sku) ?? line.sku}: {tx(`admin.orders.new.badLine.${line.reason}`)}
              <Button
                type="button"
                size="sm"
                variant="link"
                className="h-auto px-1 py-0 text-xs text-destructive"
                onClick={() => order.setQty(line.sku, 0)}
              >
                {tx("admin.orders.new.remove")}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {order.isCatalogLoading ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          <ListItemSkeleton count={5} />
        </div>
      ) : order.isCatalogError ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border p-6 text-center">
          <p className="text-sm text-muted-foreground">{tx("admin.orders.new.catalogError")}</p>
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            onClick={() => void order.refetchCatalog()}
          >
            {tx("common.actions.tryAgain")}
          </Button>
        </div>
      ) : catalog.length === 0 ? (
        <p className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          {tx("admin.orders.new.catalogEmpty", { route: summary?.customer.routeName ?? "" })}
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <div className="relative border-b p-3">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-6 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={tx("admin.orders.new.search")}
              className="rounded-full bg-muted/40 pr-9 pl-9"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={tx("common.actions.clearSearch")}
                onClick={() => setQuery("")}
                className="absolute top-1/2 right-4 size-7 -translate-y-1/2 rounded-full text-muted-foreground hover:text-foreground"
              >
                <XIcon className="size-4" />
              </Button>
            )}
          </div>
          <ul className="divide-y">
            {found.length === 0 && (
              <li className="p-6 text-center text-sm text-muted-foreground">
                {tx("admin.orders.new.noMatch")}
              </li>
            )}
            {found.map((row) => {
              const qty = order.quantities[row.sku] ?? 0;
              return (
                <li key={row.sku} className="flex items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0 text-sm">
                    <p className="truncate text-xs text-muted-foreground">{row.productName}</p>
                    <p className="truncate font-medium">{row.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatPaise(row.routePricePaise)} · GST{" "}
                      <GstRate gstRateBps={row.gstRateBps} exempt={row.exempt} />
                    </p>
                  </div>
                  {qty > 0 ? (
                    <QuantityStepper
                      quantity={qty}
                      minQuantity={0}
                      disabled={order.isPlacing}
                      onQuantityChange={(quantity) => order.setQty(row.sku, quantity)}
                    />
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 rounded-full border-brand text-brand hover:bg-brand/10 hover:text-brand"
                      disabled={order.isPlacing}
                      onClick={() => order.setQty(row.sku, 1)}
                    >
                      <PlusIcon className="size-4" /> {tx("admin.orders.new.add")}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

function AdvanceFields({ order }: { order: OfficeOrder }) {
  const tx = useTranslate();
  const idPrefix = useId();
  const { advance, setAdvance } = order;
  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-3">
      <div>
        <p className="text-sm font-semibold">{tx("admin.orders.new.advanceTitle")}</p>
        <p className="text-xs text-muted-foreground">{tx("admin.orders.new.advanceHint")}</p>
      </div>
      <ModeField
        id={`${idPrefix}-advance-mode`}
        value={advance.mode}
        onChange={(mode) => setAdvance({ ...advance, mode })}
        disabled={order.isPlacing}
      />
      {advance.mode === "upi" && <PaymentScannerButton />}
      <AmountField
        id={`${idPrefix}-advance-amount`}
        label={tx("admin.orders.new.advanceAmount")}
        value={advance.amountText}
        onChange={(amountText) => setAdvance({ ...advance, amountText })}
        error={order.advanceErrorKey ? tx(order.advanceErrorKey) : null}
        disabled={order.isPlacing}
      />
      {advance.mode !== "cash" && (
        <ReferenceField
          id={`${idPrefix}-advance-reference`}
          value={advance.reference}
          onChange={(reference) => setAdvance({ ...advance, reference })}
          disabled={order.isPlacing}
        />
      )}
    </div>
  );
}

export function CheckoutStep({ order }: { order: OfficeOrder }) {
  const tx = useTranslate();
  const formatDate = useFormatDate();
  const { formatPaise } = useFormatMoney();
  const { quote, summary } = order;
  const shopName = summary?.customer.shopName ?? "";
  const isPreOrder = order.orderType === "pre_order";

  return (
    <section className="flex flex-col gap-3">
      <p className="text-base font-semibold">
        {tx(isPreOrder ? "admin.orders.new.confirmPreOrder" : "admin.orders.new.checkoutTitle")}
      </p>
      <div className="flex flex-col divide-y rounded-2xl border bg-card">
        {quote?.lines.map((line) => (
          <div key={line.sku} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{line.name}</p>
              <p className="text-muted-foreground">
                {line.qty} × {formatPaise(line.routePricePaise)} · GST{" "}
                <GstRate gstRateBps={line.gstRateBps} exempt={line.exempt} />
              </p>
            </div>
            <span className="shrink-0 tabular-nums">{formatPaise(line.taxablePaise)}</span>
          </div>
        ))}
        <div className="px-3 py-3">
          <QuoteTotals totals={quote?.totals ?? null} isLoading={!quote} compact />
        </div>
      </div>
      {order.refusal && (
        <RefusalAlert refusal={order.refusal} shopName={shopName} onDismiss={order.clearRefusal} />
      )}
      {isPreOrder ? (
        <>
          <p className="rounded-2xl border border-dashed p-3 text-sm text-muted-foreground">
            {tx("admin.orders.new.preOrderNote", {
              date: formatDate(order.scheduledDate, "EEE, d MMM yyyy"),
            })}
          </p>
          <AdvanceFields order={order} />
        </>
      ) : (
        order.paymentContext && (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold">{tx("admin.orders.new.paymentTitle")}</p>
            <PaymentBlock
              context={order.paymentContext}
              draft={order.paymentDraft}
              onChange={order.setPaymentDraft}
              disabled={order.isPlacing}
            />
            <BalanceChangedDialog
              wasContext={order.balanceChange?.wasContext ?? null}
              nowBalancePaise={order.balanceChange?.nowBalancePaise ?? null}
              draft={order.paymentDraft}
              shopName={shopName}
              isPlacing={order.isPlacing}
              onChangePayment={order.changePayment}
              onPlaceAgain={() => void order.placeAgain()}
            />
          </div>
        )
      )}
    </section>
  );
}
