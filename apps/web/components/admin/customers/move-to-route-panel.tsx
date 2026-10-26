"use client";

import { TriangleAlertIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { useCustomers } from "~/hooks/use-customers";
import { useTranslate } from "~/hooks/use-translate";
import { getErrorMessage } from "~/lib/get-error-message";

import { RouteChoiceSelect } from "./route-choice-select";

interface MoveToRoutePanelProps {
  customerId: string;
  currentRouteId: string;
  onMoved: () => void;
  onCancel: () => void;
}

/** Picks a listed Route other than the current one. A refusal (open Pre-orders) shows inline. */
export function MoveToRoutePanel({
  customerId,
  currentRouteId,
  onMoved,
  onCancel,
}: MoveToRoutePanelProps) {
  const tx = useTranslate();
  const { moveCustomerRouteAsync, isMovingCustomerRoute } = useCustomers();
  const [targetRouteId, setTargetRouteId] = useState("");
  const [refusal, setRefusal] = useState<string | null>(null);

  async function handleMove() {
    if (!targetRouteId) return;
    setRefusal(null);
    try {
      await moveCustomerRouteAsync({ id: customerId, toRouteId: targetRouteId });
      onMoved();
    } catch (error) {
      setRefusal(getErrorMessage(error, tx("admin.customers.move.failed")));
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-muted/30 p-3">
      <div>
        <Label htmlFor={`move-route-${customerId}`}>{tx("admin.customers.move.title")}</Label>
        <p className="text-xs text-muted-foreground">{tx("admin.customers.move.hint")}</p>
      </div>
      <RouteChoiceSelect
        id={`move-route-${customerId}`}
        value={targetRouteId}
        excludeRouteId={currentRouteId}
        className="bg-card"
        onValueChange={(routeId) => {
          setTargetRouteId(routeId);
          setRefusal(null);
        }}
      />
      {refusal && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm"
        >
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
          <span>{refusal}</span>
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!targetRouteId || isMovingCustomerRoute}
          onClick={() => void handleMove()}
          className="rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
        >
          {isMovingCustomerRoute ? tx("common.status.pleaseWait") : tx("admin.customers.move.cta")}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="rounded-full" onClick={onCancel}>
          {tx("common.actions.cancel")}
        </Button>
      </div>
    </div>
  );
}
