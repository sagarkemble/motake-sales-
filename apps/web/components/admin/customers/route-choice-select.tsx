"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { useRoutes } from "~/hooks/use-routes";
import { useTranslate } from "~/hooks/use-translate";
import { cn } from "~/lib/utils";

interface RouteChoiceSelectProps {
  id?: string;
  value: string;
  excludeRouteId?: string;
  className?: string;
  onValueChange: (routeId: string) => void;
}

/** Listed Routes only (hidden ones are never offered); Inactive ones are labelled. */
export function RouteChoiceSelect({
  id,
  value,
  excludeRouteId,
  className,
  onValueChange,
}: RouteChoiceSelectProps) {
  const tx = useTranslate();
  const { routeChoices, isRouteChoicesLoading } = useRoutes({
    choicesFilters: { excludeRouteId },
  });

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger id={id} className={cn("w-full rounded-full bg-muted/40", className)}>
        <SelectValue
          placeholder={
            isRouteChoicesLoading
              ? tx("common.status.loading")
              : routeChoices.length === 0
                ? tx("admin.routes.noChoices")
                : tx("admin.routes.pickRoute")
          }
        />
      </SelectTrigger>
      <SelectContent>
        {routeChoices.map((route) => (
          <SelectItem key={route.id} value={route.id}>
            {route.name} · {route.code}
            {route.status === "inactive" && ` (${tx("common.status.inactive")})`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
