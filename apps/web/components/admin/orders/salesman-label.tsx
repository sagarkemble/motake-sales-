"use client";

import { SalesmanNameLink } from "~/components/admin/shared/name-links";
import { useTranslate } from "~/hooks/use-translate";

interface SalesmanLabelProps {
  salesmanCode: string | null;
  salesmanName: string | null;
  // Given, the name opens the salesman's page.
  salesmanId?: string | null;
}

/** Salesman name, or "Office" for an order the office placed without a salesman. */
export function SalesmanLabel({ salesmanCode, salesmanName, salesmanId }: SalesmanLabelProps) {
  const tx = useTranslate();

  if (!salesmanCode && !salesmanName) {
    return <span className="italic">{tx("admin.orders.office")}</span>;
  }
  if (salesmanId) {
    return (
      <SalesmanNameLink salesmanId={salesmanId}>{salesmanName ?? salesmanCode}</SalesmanNameLink>
    );
  }
  return <span>{salesmanName ?? salesmanCode}</span>;
}
