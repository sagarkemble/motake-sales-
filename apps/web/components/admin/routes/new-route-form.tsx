"use client";

import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { useRoutes } from "~/hooks/use-routes";
import { useTranslate } from "~/hooks/use-translate";
import { getErrorMessage } from "~/lib/get-error-message";
import type { IndianStateName } from "@repo/trpc/client";

import { DeliveryStateSelect } from "./delivery-state-select";

interface NewRouteFormProps {
  onCreated: (routeId: string) => void;
  onCancel: () => void;
}

/** Name and delivery state only. The server generates the Route code. */
export function NewRouteForm({ onCreated, onCancel }: NewRouteFormProps) {
  const tx = useTranslate();
  const { createRouteAsync, isCreatingRoute } = useRoutes();
  const [name, setName] = useState("");
  // Most Routes deliver inside Maharashtra, where the seller is.
  const [deliveryState, setDeliveryState] = useState<IndianStateName | "">("Maharashtra");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setErrorMessage(tx("admin.routes.validation.name"));
      return;
    }
    if (!deliveryState) {
      setErrorMessage(tx("admin.routes.validation.deliveryState"));
      return;
    }
    try {
      const response = await createRouteAsync({ name, deliveryState });
      onCreated(response.data.id);
    } catch (error) {
      setErrorMessage(getErrorMessage(tx, error, tx("admin.routes.createFailed")));
    }
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="flex flex-col gap-3 rounded-2xl border bg-card shadow-sm p-3"
      noValidate
    >
      <div>
        <p className="text-sm font-medium">{tx("admin.routes.newTitle")}</p>
        <p className="text-xs text-muted-foreground">{tx("admin.routes.codeGeneratedHint")}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-route-name">{tx("admin.routes.name")}</Label>
        <Input
          id="new-route-name"
          value={name}
          maxLength={120}
          onChange={(event) => {
            setName(event.target.value);
            setErrorMessage(null);
          }}
          className="rounded-xl bg-muted-soft"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-route-delivery-state">{tx("admin.routes.deliveryState")}</Label>
        <DeliveryStateSelect
          id="new-route-delivery-state"
          value={deliveryState}
          onValueChange={(nextDeliveryState) => {
            setDeliveryState(nextDeliveryState);
            setErrorMessage(null);
          }}
        />
      </div>
      {errorMessage && (
        <p role="alert" className="text-xs text-destructive">
          {errorMessage}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          type="submit"
          disabled={isCreatingRoute}
          className="rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
        >
          {isCreatingRoute ? tx("common.status.pleaseWait") : tx("admin.routes.create")}
        </Button>
        <Button type="button" variant="ghost" className="rounded-full" onClick={onCancel}>
          {tx("common.actions.cancel")}
        </Button>
      </div>
    </form>
  );
}
