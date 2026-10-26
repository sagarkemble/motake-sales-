"use client";

import Link from "next/link";

import {
  SHORT_REASON_LABEL_KEYS,
  isHandedOver,
  shortQtyOf,
  sumGatepassQuantities,
  type GatepassQuantityTotals,
} from "~/lib/gatepass-quantities";
import { GatepassStatusBadge } from "~/components/shared/gatepass-status-badge";
import { RouteTag } from "~/components/shared/route-tag";
import { StatGridSkeleton } from "~/components/shared/stat-grid-skeleton";
import { TableRowsSkeleton } from "~/components/shared/table-rows-skeleton";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { useGatepasses, type AllotmentMatrixRow } from "~/hooks/use-gatepasses";
import { useTranslate } from "~/hooks/use-translate";
import { cn } from "~/lib/utils";

interface GatepassTabProps {
  salesmanId: string;
  isSalesmanDeleted?: boolean;
}

export function GatepassTab({ salesmanId, isSalesmanDeleted = false }: GatepassTabProps) {
  const tx = useTranslate();
  const { canonicalBusinessDate: businessDate, isCanonicalDateLoading } = useGatepasses();
  const { gatepasses, allotmentMatrix, isGatepassesLoading, isAllotmentMatrixLoading } =
    useGatepasses({ businessDate: businessDate || undefined, includeAdminOverview: true });

  if (isCanonicalDateLoading || isGatepassesLoading || isAllotmentMatrixLoading || !businessDate) {
    return (
      <div className="flex flex-col gap-4">
        <StatGridSkeleton count={4} />
        <div className="rounded-2xl border bg-card p-2">
          <TableRowsSkeleton rows={4} columns={7} />
        </div>
      </div>
    );
  }

  // A salesman may hold several gatepasses on the same day (one at a time). Surface the active
  // one if present, otherwise the most recent (list is newest-first).
  const salesmanGatepasses = gatepasses.filter((gatepass) => gatepass.salesmanId === salesmanId);
  const activeGatepass = salesmanGatepasses.find((gatepass) => gatepass.status === "active");
  const todaysGatepass = activeGatepass ?? salesmanGatepasses[0];
  const allocatedItems = allotmentMatrix.filter((row) => row.gatepassId === todaysGatepass?.id);

  const handedOver = isHandedOver(todaysGatepass?.status);
  const totals = sumGatepassQuantities(allocatedItems);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between rounded-2xl border bg-card p-4">
        <div>
          <p className="text-sm font-medium">{tx("admin.salesmen.gatepass.todayTitle")}</p>
          <p className="text-xs text-muted-foreground">{businessDate}</p>
          {todaysGatepass && (
            <RouteTag
              name={todaysGatepass.routeName}
              code={todaysGatepass.routeCode}
              className="mt-1"
            />
          )}
          {todaysGatepass && (
            <p className="mt-1 text-xs text-muted-foreground">
              {handedOver
                ? tx("admin.salesmen.gatepass.handedOverReturned", { count: totals.returned })
                : tx("admin.salesmen.gatepass.notHandedOver")}
            </p>
          )}
        </div>
        <GatepassStatusBadge
          status={todaysGatepass?.status ?? "not_issued"}
          hasDiscrepancy={todaysGatepass?.hasDiscrepancy}
        />
      </div>

      {/* A new GatePass waits only while the salesman holds an Active one. */}
      <Button
        asChild={!activeGatepass && !isSalesmanDeleted}
        disabled={Boolean(activeGatepass) || isSalesmanDeleted}
        variant="outline"
        className="w-full rounded-full"
      >
        {isSalesmanDeleted ? (
          tx("admin.salesmen.gatepass.salesmanDeleted")
        ) : activeGatepass ? (
          tx("admin.salesmen.gatepass.alreadyActive")
        ) : (
          <Link href={`/gatepass?salesmanId=${salesmanId}`}>
            {todaysGatepass
              ? tx("admin.salesmen.gatepass.allotAgain")
              : tx("admin.salesmen.gatepass.allot")}
          </Link>
        )}
      </Button>

      <GatepassQuantityKpis totals={totals} handedOver={handedOver} />

      <div className="rounded-2xl border bg-card p-2">
        {allocatedItems.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {tx("admin.salesmen.gatepass.noItemsToday")}
          </p>
        ) : (
          <GatepassLinesTable rows={allocatedItems} handedOver={handedOver} />
        )}
      </div>

      <p className="text-xs text-muted-foreground">{tx("admin.salesmen.gatepass.footnote")}</p>
    </div>
  );
}

interface GatepassQuantityKpisProps {
  totals: GatepassQuantityTotals;
  handedOver: boolean;
}

/** Issued / sold / left, plus returned and short once the salesman has handed over. */
export function GatepassQuantityKpis({ totals, handedOver }: GatepassQuantityKpisProps) {
  const tx = useTranslate();
  const stats = [
    { label: "salesman.gatepass.col.issued", value: totals.issued },
    { label: "salesman.gatepass.col.sold", value: totals.sold },
    { label: "salesman.gatepass.col.left", value: totals.left },
    { label: "salesman.gatepass.col.returned", value: handedOver ? totals.returned : null },
    {
      label: "salesman.gatepass.col.short",
      value: handedOver ? totals.short : null,
      isShort: true,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {stats.map((stat) => (
        <div key={stat.label} className="rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">{tx(stat.label)}</p>
          <p
            className={cn(
              "text-xl font-semibold tabular-nums",
              stat.isShort && Boolean(stat.value) && "text-amber-600",
            )}
          >
            {stat.value ?? "—"}
          </p>
        </div>
      ))}
    </div>
  );
}

interface GatepassLinesTableProps {
  rows: AllotmentMatrixRow[];
  handedOver: boolean;
}

export function GatepassLinesTable({ rows, handedOver }: GatepassLinesTableProps) {
  const tx = useTranslate();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{tx("admin.varieties.product")}</TableHead>
          <TableHead>{tx("admin.salesmen.gatepass.variety")}</TableHead>
          <TableHead className="text-right">{tx("salesman.gatepass.col.issued")}</TableHead>
          <TableHead className="text-right">{tx("salesman.gatepass.col.sold")}</TableHead>
          <TableHead className="text-right">{tx("salesman.gatepass.col.left")}</TableHead>
          <TableHead className="text-right">{tx("salesman.gatepass.col.returned")}</TableHead>
          <TableHead>{tx("salesman.gatepass.col.short")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((item, index) => {
          const short = handedOver ? shortQtyOf(item) : 0;
          return (
            <TableRow
              key={`${item.varietyId}-${index}`}
              className={short > 0 ? "bg-amber-500/5" : undefined}
            >
              <TableCell className="font-medium">{item.productName}</TableCell>
              <TableCell className="text-muted-foreground">{item.varietyName}</TableCell>
              <TableCell className="text-right tabular-nums">{item.issuedQty}</TableCell>
              <TableCell className="text-right tabular-nums">{item.soldQty}</TableCell>
              <TableCell className="text-right font-semibold tabular-nums">
                {item.sellableQty}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {handedOver ? item.returnedQty : "—"}
              </TableCell>
              <TableCell>
                {short > 0 ? (
                  <div className="flex flex-col gap-0.5">
                    <Badge
                      variant="outline"
                      className="w-fit border-transparent bg-amber-500/10 text-amber-600"
                    >
                      {short} ·{" "}
                      {item.shortReason
                        ? tx(SHORT_REASON_LABEL_KEYS[item.shortReason])
                        : tx("admin.salesmen.gatepass.noReason")}
                    </Badge>
                    {item.shortNote && (
                      <span className="text-xs text-muted-foreground">{item.shortNote}</span>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
