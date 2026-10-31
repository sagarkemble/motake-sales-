"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "~/lib/utils";

// Underlined faintly so a phone, with no hover, still shows the name opens something.
const NAME_LINK =
  "underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:decoration-current";

/** A Customer's shop name that opens their Admin page. */
export function CustomerNameLink({
  customerId,
  className,
  children,
}: {
  customerId: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={`/admin/customers/${customerId}`} className={cn(NAME_LINK, className)}>
      {children}
    </Link>
  );
}

/** A salesman's name that opens their Admin page. */
export function SalesmanNameLink({
  salesmanId,
  className,
  children,
}: {
  salesmanId: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={`/admin/salesman/${salesmanId}`} className={cn(NAME_LINK, className)}>
      {children}
    </Link>
  );
}
