"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "~/components/ui/badge";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Switch } from "~/components/ui/switch";
import { useRoutes, type RoutePriceFormRow } from "~/hooks/use-routes";
import { useTranslate } from "~/hooks/use-translate";
import { getErrorMessage } from "~/lib/get-error-message";
import { paiseToRupeeInput, parseRupeesToPaise } from "~/lib/rupee-input";

interface RoutePriceRowProps {
  routeId: string;
  variety: RoutePriceFormRow;
}

/**
 * One variety on the Route price form. A valid price saved on leave makes it Sellable; the switch
 * turning off removes the price straight away. Switching on with no price saves nothing until a
 * price is entered.
 */
export function RoutePriceRow({ routeId, variety }: RoutePriceRowProps) {
  const tx = useTranslate();
  const { setRoutePriceAsync, clearRoutePriceAsync } = useRoutes();
  const savedPaise = variety.pricePaise;
  const [priceText, setPriceText] = useState(
    savedPaise == null ? "" : paiseToRupeeInput(savedPaise),
  );
  const [isWaitingForPrice, setIsWaitingForPrice] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const priceInputRef = useRef<HTMLInputElement>(null);
  // Pressing the switch blurs the focused price field before the click lands. Without this the blur
  // would reset an empty row to Unsellable and the click would turn it straight back on.
  const isPressingSwitchRef = useRef(false);

  const isSellable = savedPaise != null || isWaitingForPrice;
  const switchId = `sellable-${routeId}-${variety.varietyId}`;
  const priceInputId = `price-${routeId}-${variety.varietyId}`;

  useEffect(() => {
    setPriceText(savedPaise == null ? "" : paiseToRupeeInput(savedPaise));
    setIsWaitingForPrice(false);
    setErrorMessage(null);
  }, [savedPaise, routeId]);

  async function savePrice(pricePaise: number) {
    setIsSaving(true);
    try {
      await setRoutePriceAsync({ routeId, varietyId: variety.varietyId, pricePaise });
      setIsWaitingForPrice(false);
    } catch (error) {
      toast.error(getErrorMessage(error, tx("admin.routes.prices.saveFailed")));
      setPriceText(savedPaise == null ? "" : paiseToRupeeInput(savedPaise));
    } finally {
      setIsSaving(false);
    }
  }

  async function clearPrice() {
    setIsSaving(true);
    try {
      await clearRoutePriceAsync({ routeId, varietyId: variety.varietyId });
    } catch (error) {
      toast.error(getErrorMessage(error, tx("admin.routes.prices.clearFailed")));
    } finally {
      setIsSaving(false);
    }
  }

  function handlePriceBlur() {
    const isPressingSwitch = isPressingSwitchRef.current;
    isPressingSwitchRef.current = false;
    if (savedPaise == null && priceText.trim() === "") {
      // The switch's own change handler decides the row's state.
      if (isPressingSwitch) return;
      setIsWaitingForPrice(false);
      setErrorMessage(null);
      return;
    }
    const pricePaise = parseRupeesToPaise(priceText);
    if (pricePaise == null) {
      setErrorMessage(tx("admin.routes.prices.invalid"));
      if (savedPaise != null) setPriceText(paiseToRupeeInput(savedPaise));
      return;
    }
    setErrorMessage(null);
    if (pricePaise !== savedPaise) void savePrice(pricePaise);
  }

  function handleSellableChange(nextSellable: boolean) {
    isPressingSwitchRef.current = false;
    setErrorMessage(null);
    if (nextSellable) {
      setIsWaitingForPrice(true);
      requestAnimationFrame(() => priceInputRef.current?.focus());
      return;
    }
    setIsWaitingForPrice(false);
    setPriceText("");
    if (savedPaise != null) void clearPrice();
  }

  return (
    <div className="flex items-start gap-3 border-b py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="text-sm font-medium">{variety.varietyName}</p>
          {!variety.varietyActive && (
            <Badge variant="secondary" className="h-4 rounded-full px-1.5 text-[10px]">
              {tx("common.status.inactive")}
            </Badge>
          )}
        </div>
        <p className="font-mono text-[11px] text-muted-foreground">
          {variety.sku} · {variety.unit}
        </p>
        {!variety.pricedOnAnyRoute && (
          <p className="text-[11px] text-muted-foreground">
            {tx("admin.routes.prices.unsellableUntilPriced")}
          </p>
        )}
        <div
          className="mt-2 flex items-center gap-2"
          onPointerDown={() => {
            if (!isSaving) isPressingSwitchRef.current = true;
          }}
        >
          <Switch
            id={switchId}
            checked={isSellable}
            disabled={isSaving}
            onCheckedChange={handleSellableChange}
          />
          <Label htmlFor={switchId} className="text-xs font-medium">
            {isSellable ? tx("admin.routes.prices.sellable") : tx("admin.routes.prices.unsellable")}
          </Label>
        </div>
      </div>
      <div className="w-32 shrink-0 sm:w-40">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">₹</span>
          <Input
            ref={priceInputRef}
            id={priceInputId}
            inputMode="decimal"
            aria-label={tx("admin.routes.prices.priceAria", {
              variety: `${variety.productName} ${variety.varietyName}`,
            })}
            aria-invalid={errorMessage != null}
            placeholder={
              isSellable ? tx("admin.routes.prices.price") : tx("admin.routes.prices.unsellable")
            }
            value={priceText}
            disabled={isSaving}
            onChange={(event) => {
              setPriceText(event.target.value);
              setErrorMessage(null);
              if (event.target.value.trim() !== "") setIsWaitingForPrice(true);
            }}
            onBlur={handlePriceBlur}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            className="text-right"
          />
        </div>
        {errorMessage && <p className="mt-1 text-[11px] text-destructive">{errorMessage}</p>}
      </div>
    </div>
  );
}
