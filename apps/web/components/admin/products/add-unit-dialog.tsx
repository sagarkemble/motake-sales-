"use client";

import { useEffect, useId, useState } from "react";
import { toast } from "sonner";

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
import { useTranslate } from "~/hooks/use-translate";
import { useUnits, type UnitOfMeasure } from "~/hooks/use-units";
import { getErrorMessage } from "~/lib/get-error-message";

interface AddUnitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded?: (unit: UnitOfMeasure) => void;
}

/** A unit of measure, one word. Opened from Settings > Units and from the Variety form. */
export function AddUnitDialog({ open, onOpenChange, onAdded }: AddUnitDialogProps) {
  const tx = useTranslate();
  const idPrefix = useId();
  const { createUnitAsync, isCreatingUnit } = useUnits({ enabled: false });
  const [code, setCode] = useState("");
  const trimmed = code.trim();
  const isOneWord = !/\s/.test(trimmed);

  useEffect(() => {
    if (open) setCode("");
  }, [open]);

  async function addUnit() {
    if (!trimmed || !isOneWord) return;
    try {
      const { data: unit } = await createUnitAsync({ code: trimmed });
      toast.success(tx("admin.settings.units.added", { code: unit.code }));
      onAdded?.(unit);
      onOpenChange(false);
    } catch (error) {
      toast.error(getErrorMessage(tx, error, tx("admin.settings.units.addFailed")));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !isCreatingUnit && onOpenChange(nextOpen)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{tx("admin.settings.units.addTitle")}</DialogTitle>
          <DialogDescription>{tx("admin.settings.units.addHint")}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            // The Variety form behind this dialog is a form too.
            event.preventDefault();
            event.stopPropagation();
            void addUnit();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${idPrefix}-unit-code`}>{tx("admin.settings.units.code")}</Label>
            <Input
              id={`${idPrefix}-unit-code`}
              value={code}
              maxLength={12}
              placeholder={tx("admin.settings.units.codePlaceholder")}
              aria-invalid={!isOneWord}
              onChange={(event) => setCode(event.target.value)}
              className="rounded-xl bg-muted-soft"
            />
            {!isOneWord && (
              <p className="text-xs text-destructive">{tx("admin.settings.units.oneWord")}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="submit"
              disabled={!trimmed || !isOneWord || isCreatingUnit}
              className="w-full rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
            >
              {isCreatingUnit ? tx("common.status.pleaseWait") : tx("admin.settings.units.add")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
