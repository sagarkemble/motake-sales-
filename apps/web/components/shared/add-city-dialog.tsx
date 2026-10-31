"use client";

import type { IndianStateName } from "@repo/trpc/client";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";

import { DeliveryStateSelect } from "~/components/admin/routes/delivery-state-select";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { useCities, type City } from "~/hooks/use-cities";
import { useTranslate } from "~/hooks/use-translate";
import { getErrorMessage } from "~/lib/get-error-message";

interface AddCityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Filled in when the dialog opens.
  initialName?: string;
  initialState?: string | null;
  onAdded?: (city: City) => void;
}

/** A city under one Indian state. Opened from Settings > Cities and from the city picker. */
export function AddCityDialog({
  open,
  onOpenChange,
  initialName = "",
  initialState = null,
  onAdded,
}: AddCityDialogProps) {
  const tx = useTranslate();
  const idPrefix = useId();
  const { createCityAsync, isCreatingCity } = useCities({ enabled: false });
  const [state, setState] = useState<IndianStateName | "">("");
  const [name, setName] = useState("");

  useEffect(() => {
    if (!open) return;
    setState((initialState as IndianStateName | null) ?? "");
    setName(initialName);
  }, [open, initialName, initialState]);

  async function addCity() {
    if (!state || !name.trim()) return;
    try {
      const { data: city } = await createCityAsync({ name, state });
      toast.success(tx("common.cities.added", { name: city.name, state: city.state }));
      onAdded?.(city);
      onOpenChange(false);
    } catch (error) {
      toast.error(getErrorMessage(tx, error, tx("common.cities.addFailed")));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !isCreatingCity && onOpenChange(nextOpen)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{tx("common.cities.addTitle")}</DialogTitle>
          <DialogDescription>{tx("common.cities.addHint")}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void addCity();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${idPrefix}-city-state`}>{tx("common.cities.state")}</Label>
            <DeliveryStateSelect
              id={`${idPrefix}-city-state`}
              value={state}
              onValueChange={setState}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${idPrefix}-city-name`}>{tx("common.cities.name")}</Label>
            <Input
              id={`${idPrefix}-city-name`}
              value={name}
              maxLength={120}
              placeholder={tx("common.cities.namePlaceholder")}
              onChange={(event) => setName(event.target.value)}
              className="rounded-xl bg-muted/40"
            />
          </div>
          <DialogFooter>
            <Button
              type="submit"
              disabled={!state || !name.trim() || isCreatingCity}
              className="w-full rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
            >
              {isCreatingCity ? tx("common.status.pleaseWait") : tx("common.cities.add")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
