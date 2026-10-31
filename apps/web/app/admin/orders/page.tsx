"use client";

import { PlusIcon } from "lucide-react";
import Link from "next/link";

import { BillList } from "~/components/admin/bills/bill-list";
import { OrderList } from "~/components/admin/orders/order-list";
import { Button } from "~/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { useTranslate } from "~/hooks/use-translate";

export default function AdminOrdersPage() {
  const tx = useTranslate();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4">
      <Tabs defaultValue="orders">
        {/* Two equal halves: full width beside New order on a phone, a fixed width from sm up. */}
        <div className="flex items-center gap-3">
          <TabsList className="grid h-10 min-w-0 flex-1 grid-cols-2 rounded-full sm:w-72 sm:flex-none">
            <TabsTrigger value="orders" className="rounded-full">
              {tx("admin.orders.tab.orders")}
            </TabsTrigger>
            <TabsTrigger value="bills" className="rounded-full">
              {tx("admin.orders.tab.bills")}
            </TabsTrigger>
          </TabsList>
          <Button
            asChild
            className="ml-auto h-10 shrink-0 rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
          >
            <Link href="/admin/orders/new">
              <PlusIcon className="size-4" />
              {tx("admin.orders.new.button")}
            </Link>
          </Button>
        </div>

        <TabsContent value="orders" className="pt-2">
          <OrderList />
        </TabsContent>

        <TabsContent value="bills" className="pt-2">
          <BillList />
        </TabsContent>
      </Tabs>
    </div>
  );
}
