"use client";

import { PlusIcon } from "lucide-react";
import { useState } from "react";

import { AddUnitDialog } from "~/components/admin/products/add-unit-dialog";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { useTranslate } from "~/hooks/use-translate";
import { useUnits } from "~/hooks/use-units";

/** Every unit a Variety size can be in. Units are added, never edited or removed. */
export function UnitsTab() {
  const tx = useTranslate();
  const { units, isUnitsLoading, isUnitsError, refetchUnits } = useUnits();
  const [isAddOpen, setIsAddOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-muted-foreground">{tx("admin.settings.units.intro")}</p>
        <Button
          type="button"
          className="shrink-0 gap-1.5 rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
          onClick={() => setIsAddOpen(true)}
        >
          <PlusIcon className="size-4" />
          {tx("admin.settings.units.add")}
        </Button>
      </div>

      {isUnitsLoading ? (
        <Skeleton className="h-48 w-full rounded-2xl" />
      ) : isUnitsError ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm text-muted-foreground">{tx("admin.settings.loadFailed")}</p>
          <Button variant="outline" size="sm" onClick={() => void refetchUnits()}>
            {tx("common.actions.tryAgain")}
          </Button>
        </div>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-sm">
          {units.map((unit) => (
            <li key={unit.id} className="px-3 py-2.5 text-sm font-medium">
              {unit.code}
            </li>
          ))}
        </ul>
      )}

      <AddUnitDialog open={isAddOpen} onOpenChange={setIsAddOpen} />
    </div>
  );
}
