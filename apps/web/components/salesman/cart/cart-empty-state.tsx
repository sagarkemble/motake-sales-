import { ShoppingCartIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "~/components/ui/button";

export function CartEmptyState() {
  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-muted/40">
        <ShoppingCartIcon className="size-7 text-muted-foreground" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">Your cart is empty</p>
        <p className="text-xs text-muted-foreground">Add some products to get started.</p>
      </div>
      <Button asChild className="rounded-full bg-brand text-brand-foreground hover:bg-brand/90">
        <Link href="/salesman">Start shopping</Link>
      </Button>
    </div>
  );
}
