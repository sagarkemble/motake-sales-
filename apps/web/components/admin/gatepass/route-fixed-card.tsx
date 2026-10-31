"use client";

import { LockIcon } from "lucide-react";

import { RouteTag } from "~/components/shared/route-tag";
import { useTranslate } from "~/hooks/use-translate";

interface RouteFixedCardProps {
  routeName: string;
  routeCode: string;
}

/** A GatePass's Route: set at allotment and never changed. */
export function RouteFixedCard({ routeName, routeCode }: RouteFixedCardProps) {
  const tx = useTranslate();

  return (
    <div className="flex flex-col gap-1 rounded-xl border bg-muted-faint p-3">
      <p className="text-xs text-muted-foreground">{tx("admin.customers.form.route")}</p>
      <RouteTag name={routeName} code={routeCode} className="text-sm" />
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <LockIcon className="size-3" />
        {tx("admin.gatepass.routeFixedHint")}
      </p>
    </div>
  );
}
