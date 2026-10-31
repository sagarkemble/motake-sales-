"use client";

import { ChevronRightIcon, ClipboardCheckIcon } from "lucide-react";
import Link from "next/link";

import { RouteTag } from "~/components/shared/route-tag";
import { Badge } from "~/components/ui/badge";
import { useGatepasses } from "~/hooks/use-gatepasses";
import { useSalesmen } from "~/hooks/use-salesmen";
import { useTranslate } from "~/hooks/use-translate";
import { usePageRefresh } from "~/providers/page-refresh-provider";

const ALL_SALESMEN_PAGE_SIZE = 200;

/** Salesmen whose GatePass of today is handed over and waits for Admin; hidden when none. */
export function VerificationWaitingPanel() {
  const tx = useTranslate();
  const { canonicalBusinessDate: businessDate } = useGatepasses();
  const { gatepasses, refetchGatepasses, isGatepassesFetching } = useGatepasses({
    businessDate: businessDate || undefined,
    includeDayGatepasses: true,
  });
  const { salesmenPage } = useSalesmen({
    listFilters: { page: 1, pageSize: ALL_SALESMEN_PAGE_SIZE },
  });
  usePageRefresh(refetchGatepasses, isGatepassesFetching, Boolean(businessDate));

  const waiting = gatepasses.filter((gatepass) => gatepass.status === "pending_verification");
  if (waiting.length === 0) return null;

  const nameOf = (salesmanId: string) => {
    const entry = salesmenPage.items.find(({ salesman }) => salesman.id === salesmanId);
    return entry ? (entry.profile.name ?? entry.salesman.salesmanCode) : "";
  };

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-amber-500/40 bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ClipboardCheckIcon className="size-4 text-amber-700" />
          <h2 className="text-sm font-medium">{tx("admin.dashboard.verification.title")}</h2>
        </div>
        <Badge variant="outline" className="border-transparent bg-amber-500/15 text-amber-800">
          {waiting.length}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">{tx("admin.dashboard.verification.body")}</p>
      <div className="flex flex-col gap-2">
        {waiting.map((gatepass) => (
          <Link
            key={gatepass.id}
            href={`/admin/salesman/${gatepass.salesmanId}?tab=verification`}
            className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3 outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <p className="truncate text-sm font-medium">{nameOf(gatepass.salesmanId)}</p>
              <RouteTag name={gatepass.routeName} code={gatepass.routeCode} />
            </div>
            <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-brand">
              {tx("admin.dashboard.verification.open")}
              <ChevronRightIcon className="size-4" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
