"use client";

import { ShoppingCartIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "~/components/ui/button";
import { useTranslate } from "~/hooks/use-translate";

export function CartEmptyState() {
  const tx = useTranslate();

  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-muted/40">
        <ShoppingCartIcon className="size-7 text-muted-foreground" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{tx("salesman.cart.emptyTitle")}</p>
        <p className="text-xs text-muted-foreground">{tx("salesman.cart.emptyBody")}</p>
      </div>
      <Button asChild className="h-auto min-h-10 whitespace-normal rounded-full bg-brand py-2 text-brand-foreground hover:bg-brand/90">
        <Link href="/salesman">{tx("salesman.cart.startShopping")}</Link>
      </Button>
    </div>
  );
}
