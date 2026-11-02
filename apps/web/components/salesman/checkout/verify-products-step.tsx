"use client";

import { AlertTriangleIcon } from "lucide-react";

import { CartItemRow } from "~/components/salesman/cart/cart-item-row";
import { QuoteTotals, type CheckoutQuote } from "~/components/shared/checkout/quote-totals";
import { RefusalAlert } from "~/components/shared/checkout/refusal-alert";
import { GstRate } from "~/components/shared/gst-rate";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { useFormatMoney } from "~/hooks/use-format-money";
import { useTranslate } from "~/hooks/use-translate";
import type { CheckoutRefusal } from "~/lib/checkout-refusal";
import type { CartLine } from "~/providers/cart-provider";

interface VerifyProductsStepProps {
  cartLines: CartLine[];
  routeName: string | null;
  quote: CheckoutQuote | null;
  isQuoteLoading: boolean;
  quoteRefusal: CheckoutRefusal | null;
  hasQuoteError: boolean;
  onRetryQuote: () => void;
  onQuantityChange: (cartLine: CartLine, quantity: number) => void;
  onRemove: (varietyId: string) => void;
}

/** Cart check: the server's Route price and GST per line, bad and short lines, and totals. */
export function VerifyProductsStep({
  cartLines,
  routeName,
  quote,
  isQuoteLoading,
  quoteRefusal,
  hasQuoteError,
  onRetryQuote,
  onQuantityChange,
  onRemove,
}: VerifyProductsStepProps) {
  const tx = useTranslate();
  const { formatPaise } = useFormatMoney();
  const badLineCount = quote?.badLines.length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-base font-semibold">{tx("salesman.checkout.cart.title")}</p>
        <p className="text-sm text-muted-foreground">
          {routeName
            ? tx("salesman.checkout.cart.hintRoute", { route: routeName })
            : tx("salesman.checkout.cart.hint")}
        </p>
      </div>

      {quoteRefusal ? (
        <RefusalAlert refusal={quoteRefusal} shopName="" />
      ) : hasQuoteError ? (
        <Alert variant="destructive" className="border-destructive/30 bg-destructive-faint">
          <AlertTriangleIcon />
          <AlertTitle>{tx("salesman.checkout.cart.quoteFailed")}</AlertTitle>
          <AlertDescription>
            <Button
              size="sm"
              variant="outline"
              className="mt-1 rounded-full"
              onClick={onRetryQuote}
            >
              {tx("common.actions.tryAgain")}
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        badLineCount > 0 && (
          <Alert variant="destructive" className="border-destructive/30 bg-destructive-faint">
            <AlertTriangleIcon />
            <AlertTitle>
              {tx("salesman.checkout.cart.badLinesTitle", { count: badLineCount })}
            </AlertTitle>
            <AlertDescription>{tx("salesman.checkout.cart.badLinesHint")}</AlertDescription>
          </Alert>
        )
      )}

      <div className="flex flex-col gap-2">
        {cartLines.map((cartLine) => {
          const pricedLine = quote?.lines.find((line) => line.sku === cartLine.sku);
          const badLine = quote?.badLines.find((line) => line.sku === cartLine.sku);
          const shortLine = quote?.shortLines.find((line) => line.sku === cartLine.sku);
          return (
            <CartItemRow
              key={cartLine.varietyId}
              cartLine={cartLine}
              tone={badLine ? "bad" : shortLine ? "short" : "default"}
              onQuantityChange={(quantity) => onQuantityChange(cartLine, quantity)}
              onRemove={() => onRemove(cartLine.varietyId)}
              footer={
                badLine ? (
                  <p className="text-xs text-destructive">
                    {tx(`salesman.checkout.cart.badLine.${badLine.reason}`)}
                  </p>
                ) : (
                  <>
                    {pricedLine && (
                      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>
                          {formatPaise(pricedLine.routePricePaise)} × {pricedLine.qty} · GST{" "}
                          <GstRate gstRateBps={pricedLine.gstRateBps} exempt={pricedLine.exempt} />
                        </span>
                        <span className="font-medium tabular-nums text-foreground">
                          {formatPaise(pricedLine.taxablePaise)}
                        </span>
                      </div>
                    )}
                    {shortLine && (
                      <p className="text-xs text-amber-700">
                        {tx("salesman.checkout.cart.shortLine", {
                          left: shortLine.leftQty,
                          need: shortLine.needQty,
                        })}
                      </p>
                    )}
                  </>
                )
              }
            />
          );
        })}
      </div>

      {!quoteRefusal && !hasQuoteError && (
        <div className="rounded-2xl border bg-card shadow-sm p-4">
          <QuoteTotals totals={quote?.totals ?? null} isLoading={isQuoteLoading} />
        </div>
      )}

      <p className="text-xs text-muted-foreground">{tx("salesman.checkout.cart.balanceLater")}</p>
    </div>
  );
}
