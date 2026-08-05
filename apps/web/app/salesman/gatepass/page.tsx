"use client";

import { format } from "date-fns";
import { PackageIcon } from "lucide-react";

import { useGatepasses } from "~/hooks/use-gatepasses";
import { useProducts } from "~/hooks/use-products";

const CATALOG_PAGE_SIZE = 200;

export default function SalesmanGatepassPage() {
  const businessDateKey = format(new Date(), "yyyy-MM-dd");

  const { myGatepass, isMyGatepassLoading } = useGatepasses({
    businessDate: businessDateKey,
    includeMyGatepass: true,
  });
  const { productsPage } = useProducts({
    listFilters: { page: 1, pageSize: CATALOG_PAGE_SIZE },
  });

  const varietyDisplayById = new Map(
    productsPage.items.flatMap(({ product, varieties }) =>
      varieties.map((variety) => [
        variety.id,
        { productName: product.name, varietyName: variety.name, unit: variety.unit },
      ]),
    ),
  );

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-4">
      <p className="text-sm text-muted-foreground">{format(new Date(), "d MMM yyyy")}</p>

      {isMyGatepassLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading</p>
      ) : !myGatepass ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          No gate pass has been given to you for today yet.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {myGatepass.items.map((item) => {
            const display = varietyDisplayById.get(item.varietyId);
            return (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-2xl border bg-card p-3"
              >
                <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted/40">
                  <PackageIcon className="size-5 text-muted-foreground" />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {display?.productName ?? "Product"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {display?.varietyName} ({display?.unit})
                  </p>
                </div>

                <div className="flex gap-4 text-right text-xs">
                  <div>
                    <p className="text-muted-foreground">Given</p>
                    <p className="font-medium">{item.issuedQty}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Sold</p>
                    <p className="font-medium">{item.soldQty}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Left</p>
                    <p className="font-medium">{item.availableQty ?? item.issuedQty - item.soldQty}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
