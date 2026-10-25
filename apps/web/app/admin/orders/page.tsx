"use client";

import { BillList } from "~/components/admin/bills/bill-list";
import { OrderList } from "~/components/admin/orders/order-list";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { useTranslate } from "~/hooks/use-translate";

export default function AdminOrdersPage() {
  const tx = useTranslate();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4">
      <Tabs defaultValue="orders">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="orders" className="flex-1 sm:flex-none">
            {tx("admin.orders.tab.orders")}
          </TabsTrigger>
          <TabsTrigger value="bills" className="flex-1 sm:flex-none">
            {tx("admin.orders.tab.bills")}
          </TabsTrigger>
        </TabsList>

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
