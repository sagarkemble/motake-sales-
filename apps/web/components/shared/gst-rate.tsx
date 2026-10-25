"use client";

import { useTranslate } from "~/hooks/use-translate";

interface GstRateProps {
  gstRateBps: number;
  exempt: boolean;
}

/** A line's GST rate, stored in basis points (500 → 5%), or "Exempt". */
export function GstRate({ gstRateBps, exempt }: GstRateProps) {
  const tx = useTranslate();

  return <>{exempt ? tx("admin.bills.exempt") : `${gstRateBps / 100}%`}</>;
}
