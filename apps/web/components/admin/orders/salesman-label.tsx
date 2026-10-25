"use client";

import { useTranslate } from "~/hooks/use-translate";

interface SalesmanLabelProps {
  salesmanCode: string | null;
  salesmanName: string | null;
}

/** Salesman name, or "Office" for an order the office placed without a salesman. */
export function SalesmanLabel({ salesmanCode, salesmanName }: SalesmanLabelProps) {
  const tx = useTranslate();

  if (!salesmanCode && !salesmanName) {
    return <span className="italic">{tx("admin.orders.office")}</span>;
  }
  return <span>{salesmanName ?? salesmanCode}</span>;
}
