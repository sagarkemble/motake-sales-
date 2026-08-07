"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { PencilIcon } from "lucide-react";

import { BackHeader } from "~/components/admin/products/back-header";
import { GatepassTab } from "~/components/admin/salesman/gatepass-tab";
import { SalesTab } from "~/components/admin/salesman/sales-tab";
import { SalesmanEditDialog } from "~/components/admin/salesman/salesman-edit-dialog";
import { Button } from "~/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { useSalesmen } from "~/hooks/use-salesmen";

export default function SalesmanDetailPage() {
  const params = useParams<{ id: string }>();
  const salesmanId = params.id;

  const { salesmanById: salesmanEntry, isSalesmanByIdLoading } = useSalesmen({
    salesmanId,
  });
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  if (isSalesmanByIdLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading</div>;
  }

  if (!salesmanEntry) {
    return <div className="p-4 text-sm text-muted-foreground">Salesman not found</div>;
  }

  const { salesman, profile } = salesmanEntry;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-4">
      <BackHeader
        href="/admin/salesman"
        title={profile.name ?? "Salesman"}
        actions={
          <Button
            size="icon"
            variant="outline"
            className="size-9 shrink-0 rounded-full"
            aria-label="Edit salesman"
            onClick={() => setIsEditDialogOpen(true)}
          >
            <PencilIcon className="size-4" />
          </Button>
        }
      />

      <Tabs defaultValue="sales">
        <TabsList className="w-full">
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="gatepass">Gate Pass</TabsTrigger>
        </TabsList>
        <TabsContent value="sales">
          <SalesTab salesmanId={salesman.id} />
        </TabsContent>
        <TabsContent value="gatepass">
          <GatepassTab salesmanId={salesman.id} isSalesmanDeleted={Boolean(profile.deletedAt)} />
        </TabsContent>
      </Tabs>

      <SalesmanEditDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        salesmanId={salesman.id}
        defaultValues={{
          name: profile.name ?? "",
          phone: profile.phone ?? "",
          email: profile.email,
        }}
      />
    </div>
  );
}
