"use client";

import {
  AlertCircleIcon,
  CheckCircle2Icon,
  ChevronLeftIcon,
  PackageIcon,
  PlusIcon,
  SearchIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fragment, Suspense, useState } from "react";
import { toast } from "sonner";

import { useDebouncedPreviewInput } from "~/components/admin/ledger/bill-paper-forms";
import { CustomerPicker } from "~/components/admin/ledger/customer-picker";
import { InactiveBanner } from "~/components/admin/ledger/ledger-parts";
import {
  OutcomeUnknownAlert,
  ReasonField,
  RefusalAlert,
  useBalanceText,
} from "~/components/admin/ledger/ledger-shared";
import { GstRate } from "~/components/shared/gst-rate";
import { QuantityStepper } from "~/components/shared/quantity-stepper";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";
import { Input } from "~/components/ui/input";
import { Skeleton } from "~/components/ui/skeleton";
import { Spinner } from "~/components/ui/spinner";
import { useFormatMoney } from "~/hooks/use-format-money";
import { useLedger, useLedgerPreviews, type RaiseBillCatalogRow } from "~/hooks/use-ledger";
import { useTranslate } from "~/hooks/use-translate";
import { billTaxRows } from "~/lib/bill-tax-rows";
import { isOutcomeUnknown, refusalMessage } from "~/lib/refusal";

type Basket = Record<string, number>;

interface RaisedBill {
  billId: string;
  billNumber: string;
  totalPaise: number;
}

// Variant A: search the Route catalog, tap to add, cart with steppers and server totals beside it.
function RaiseBillCart({
  customerId,
  catalog,
  onRaised,
}: {
  customerId: string;
  catalog: RaiseBillCatalogRow[];
  onRaised: (bill: RaisedBill) => void;
}) {
  const tx = useTranslate();
  const { formatPaise } = useFormatMoney();
  const [query, setQuery] = useState("");
  const [basket, setBasket] = useState<Basket>({});
  const [reason, setReason] = useState("");
  const [refusal, setRefusal] = useState<string | null>(null);
  const { raiseBillAsync, isRaisingBill } = useLedger({ customerId });
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  // One key per Bill being built here (the cart remounts per Customer), rotated only once the Bill
  // is raised: a retry after a lost answer, even with a reworded reason, never bills twice.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const lines = catalog
    .filter((row) => (basket[row.varietyId] ?? 0) > 0)
    .map((row) => ({ varietyId: row.varietyId, quantity: basket[row.varietyId]! }));
  const previewInput = lines.length > 0 ? { customerId, lines } : null;
  const debouncedPreviewInput = useDebouncedPreviewInput(previewInput);
  const { raiseBillPreview, raiseBillPreviewError, isRaiseBillPreviewFetching } = useLedgerPreviews(
    {
      raiseBill: debouncedPreviewInput,
    },
  );
  const previewIsCurrent = JSON.stringify(debouncedPreviewInput) === JSON.stringify(previewInput);
  const badLines = previewIsCurrent ? (raiseBillPreview?.badLines ?? []) : [];
  const catalogById = new Map(catalog.map((row) => [row.varietyId, row]));
  const found = catalog.filter((row) =>
    `${row.productName} ${row.name} ${row.sku}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const canSubmit =
    lines.length > 0 && reason.trim() !== "" && badLines.length === 0 && !isRaisingBill;

  async function handleSubmit() {
    if (!canSubmit) return;
    setRefusal(null);
    setOutcomeUnknown(false);
    try {
      const result = await raiseBillAsync({
        customerId,
        lines,
        reason: reason.trim(),
        idempotencyKey,
      });
      setIdempotencyKey(crypto.randomUUID());
      setBasket({});
      setReason("");
      onRaised(result.data);
    } catch (error) {
      if (isOutcomeUnknown(error)) setOutcomeUnknown(true);
      else setRefusal(refusalMessage(tx, error, tx("admin.ledger.refusals.generic")));
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="min-w-0 rounded-md border bg-card">
        <div className="relative border-b p-3">
          <SearchIcon className="pointer-events-none absolute left-5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={tx("admin.ledger.raiseBill.search")}
            className="pl-8"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <ul className="divide-y">
          {found.length === 0 && (
            <li className="p-6 text-center text-sm text-muted-foreground">
              {tx("admin.ledger.raiseBill.noMatch")}
            </li>
          )}
          {found.map((row) => (
            <li key={row.varietyId} className="flex items-center justify-between gap-2 px-3 py-2">
              <div className="min-w-0 text-sm">
                <p className="truncate font-medium">
                  {row.productName} {row.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {tx("admin.ledger.raiseBill.perUnit", {
                    price: formatPaise(row.routePricePaise),
                    unit: row.unit,
                  })}{" "}
                  · <GstRate gstRateBps={row.gstRateBps} exempt={row.exempt} />
                </p>
              </div>
              {(basket[row.varietyId] ?? 0) > 0 ? (
                <QuantityStepper
                  quantity={basket[row.varietyId]!}
                  minQuantity={0}
                  disabled={isRaisingBill}
                  onQuantityChange={(quantity) =>
                    setBasket({ ...basket, [row.varietyId]: quantity })
                  }
                />
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isRaisingBill}
                  onClick={() => setBasket({ ...basket, [row.varietyId]: 1 })}
                >
                  <PlusIcon className="size-4" /> {tx("admin.ledger.raiseBill.add")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </section>
      <aside className="space-y-3 rounded-md border bg-card p-3 lg:sticky lg:top-20 lg:self-start">
        <p className="text-sm font-medium">
          {tx("admin.ledger.raiseBill.cartTitle", { count: lines.length })}
        </p>
        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {tx("admin.ledger.refusals.empty_basket")}
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {lines.map((line) => {
              const row = catalogById.get(line.varietyId)!;
              const priced = previewIsCurrent
                ? raiseBillPreview?.lines.find((item) => item.varietyId === line.varietyId)
                : undefined;
              return (
                <li key={line.varietyId} className="flex justify-between gap-2">
                  <span className="min-w-0 truncate">
                    {line.quantity} × {row.name}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {priced
                      ? formatPaise(
                          priced.taxablePaise +
                            priced.cgstPaise +
                            priced.sgstPaise +
                            priced.igstPaise,
                        )
                      : "…"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {badLines.length > 0 && (
          <RefusalAlert
            title={tx("admin.ledger.raiseBill.badLinesTitle")}
            message={badLines
              .map(
                (line) =>
                  `${catalogById.get(line.varietyId)?.name ?? line.varietyId}: ${tx(`admin.ledger.raiseBill.badLine.${line.reason}`)}`,
              )
              .join(" · ")}
          />
        )}
        {raiseBillPreviewError && lines.length > 0 && (
          <p className="text-sm text-destructive">
            {refusalMessage(tx, raiseBillPreviewError, tx("admin.ledger.refusals.generic"))}
          </p>
        )}
        {raiseBillPreview && lines.length > 0 && (
          <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-0.5 text-sm">
            <dt className="text-muted-foreground">{tx("admin.bills.taxable")}</dt>
            <dd className="text-right tabular-nums">
              {formatPaise(raiseBillPreview.totals.taxablePaise)}
            </dd>
            {billTaxRows(raiseBillPreview.totals).map((row) => (
              <Fragment key={row.tax}>
                <dt className="text-muted-foreground">{tx(`admin.bills.${row.tax}`)}</dt>
                <dd className="text-right tabular-nums">{formatPaise(row.paise)}</dd>
              </Fragment>
            ))}
            <dt className="text-muted-foreground">{tx("admin.bills.roundOff")}</dt>
            <dd className="text-right tabular-nums">
              {formatPaise(raiseBillPreview.totals.roundOffPaise)}
            </dd>
            <dt className="font-semibold">
              {tx("admin.ledger.raiseBill.total", { count: raiseBillPreview.totals.totalQuantity })}
            </dt>
            <dd className="text-right font-semibold tabular-nums">
              {formatPaise(raiseBillPreview.totals.totalPaise)}
            </dd>
          </dl>
        )}
        {isRaiseBillPreviewFetching && lines.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {tx("admin.ledger.paper.preview.checking")}
          </p>
        )}
        <ReasonField
          id="raise-reason"
          value={reason}
          onChange={setReason}
          disabled={isRaisingBill}
          placeholder={tx("admin.ledger.raiseBill.reasonPlaceholder")}
        />
        {outcomeUnknown && <OutcomeUnknownAlert message={tx("admin.ledger.outcomeUnknown.bill")} />}
        {refusal && <RefusalAlert message={refusal} />}
        <Button className="w-full" disabled={!canSubmit} onClick={handleSubmit}>
          {isRaisingBill && <Spinner />}
          {isRaisingBill
            ? tx("admin.ledger.raiseBill.submitting")
            : raiseBillPreview && previewIsCurrent && lines.length > 0
              ? tx("admin.ledger.raiseBill.submitAmount", {
                  amount: formatPaise(raiseBillPreview.totals.totalPaise),
                })
              : tx("admin.ledger.raiseBill.submit")}
        </Button>
      </aside>
    </div>
  );
}

function RaiseBillPageContent() {
  const tx = useTranslate();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const balanceText = useBalanceText();
  const { formatPaise } = useFormatMoney();
  const customerId = searchParams.get("customer");
  const [raised, setRaised] = useState<RaisedBill | null>(null);
  const { summary, catalog, isCatalogLoading, isCatalogError, refetchCatalog } = useLedger({
    customerId: customerId ?? undefined,
    loadCatalog: true,
  });
  const inactive = summary?.customer.status === "inactive";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <Link
          href={customerId ? `/admin/ledger?customer=${customerId}` : "/admin/ledger"}
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeftIcon className="size-4" />
          {tx("admin.ledger.title")}
        </Link>
        <CustomerPicker
          value={customerId}
          selectedLabel={
            summary ? `${summary.customer.shopName} · ${summary.customer.phone}` : undefined
          }
          onChange={(nextCustomerId) => {
            setRaised(null);
            router.replace(`${pathname}?customer=${nextCustomerId}`, { scroll: false });
          }}
        />
      </div>
      <h1 className="text-base font-semibold">{tx("admin.ledger.raiseBill.title")}</h1>
      {summary && (
        <p className="text-sm">
          <span className="font-medium">{summary.customer.shopName}</span>
          <span className="text-muted-foreground">
            {" "}
            · {summary.customer.routeName} ({summary.customer.routeCode}) ·{" "}
            {balanceText(summary.footer.closing)}
          </span>
        </p>
      )}
      {raised && (
        <Alert>
          <CheckCircle2Icon />
          <AlertTitle>{tx("admin.ledger.raiseBill.successTitle")}</AlertTitle>
          <AlertDescription>
            <p>
              {tx("admin.ledger.raiseBill.success", {
                number: raised.billNumber,
                amount: formatPaise(raised.totalPaise),
              })}
            </p>
            <Button size="sm" variant="outline" className="mt-2" asChild>
              <Link href={`/admin/ledger/bills/${raised.billId}`}>
                {tx("admin.ledger.raiseBill.openPaper")}
              </Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {!customerId ? (
        <div className="rounded-md border border-dashed bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          {tx("admin.ledger.raiseBill.pickCustomer")}
        </div>
      ) : inactive ? (
        <InactiveBanner />
      ) : isCatalogLoading ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-9 w-full" />
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : isCatalogError ? (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>{tx("admin.ledger.raiseBill.catalogError.title")}</AlertTitle>
          <AlertDescription>
            <p>{tx("admin.ledger.raiseBill.catalogError.body")}</p>
            <Button size="sm" variant="outline" className="mt-2" onClick={() => refetchCatalog()}>
              {tx("common.actions.tryAgain")}
            </Button>
          </AlertDescription>
        </Alert>
      ) : catalog.length === 0 ? (
        <Empty className="rounded-md border bg-card py-10">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PackageIcon />
            </EmptyMedia>
            <EmptyTitle>
              {tx("admin.ledger.raiseBill.catalogEmpty.title", {
                route: summary?.customer.routeName ?? "",
              })}
            </EmptyTitle>
            <EmptyDescription>{tx("admin.ledger.raiseBill.catalogEmpty.body")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <RaiseBillCart
          key={customerId}
          customerId={customerId}
          catalog={catalog}
          onRaised={(bill) => {
            setRaised(bill);
            toast.success(
              tx("admin.ledger.raiseBill.success", {
                number: bill.billNumber,
                amount: formatPaise(bill.totalPaise),
              }),
            );
            // The notice sits above the catalog; on a phone the cart is far below it.
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}
    </div>
  );
}

export default function AdminRaiseBillPage() {
  return (
    <Suspense fallback={null}>
      <RaiseBillPageContent />
    </Suspense>
  );
}
