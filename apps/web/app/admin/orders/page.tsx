"use client";

import { OrderList } from "~/components/admin/orders/order-list";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";

export default function AdminOrdersPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-4">
      <Tabs defaultValue="pre_order">
        <TabsList className="w-full">
          <TabsTrigger value="pre_order" className="flex-1">
            Pre-Orders
          </TabsTrigger>
          <TabsTrigger value="book_now" className="flex-1">
            Book Now
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pre_order">
          <OrderList orderType="pre_order" />
        </TabsContent>

        <TabsContent value="book_now">
          <OrderList orderType="book_now" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
