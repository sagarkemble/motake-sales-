"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { PencilIcon } from "lucide-react";

import { BackHeader } from "~/components/admin/products/back-header";
import { GatepassTab } from "~/components/admin/salesman/gatepass-tab";
import { SalesTab } from "~/components/admin/salesman/sales-tab";
import { SalesmanEditDialog } from "~/components/admin/salesman/salesman-edit-dialog";
import { VerificationTab } from "~/components/admin/salesman/verification-tab";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Button } from "~/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { getNameInitials } from "~/lib/get-name-initials";
import { useSalesmen } from "~/hooks/use-salesmen";
import { useTranslate } from "~/hooks/use-translate";
import { DetailPageSkeleton } from "~/components/shared/detail-page-skeleton";

export default function SalesmanDetailPage() {
  const tx = useTranslate();
  const params = useParams<{ id: string }>();
  const salesmanId = params.id;

  const { salesmanById: salesmanEntry, isSalesmanByIdLoading } = useSalesmen({
    salesmanId,
  });
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  if (isSalesmanByIdLoading) {
    return <DetailPageSkeleton />;
  }

  if (!salesmanEntry) {
    return <div className="p-4 text-sm text-muted-foreground">{tx("admin.salesmen.notFound")}</div>;
  }

  const { salesman, profile } = salesmanEntry;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-4 sm:px-6">
      <BackHeader
        href="/admin/salesman"
        title={profile.name ?? tx("admin.nav.salesman")}
        avatar={
          <Avatar className="size-9 shrink-0 border">
            <AvatarImage
              src={profile.avatarUrl ?? undefined}
              alt={profile.name ?? tx("admin.nav.salesman")}
            />
            <AvatarFallback className="bg-brand/10 text-xs font-semibold text-brand">
              {getNameInitials(profile.name, "S")}
            </AvatarFallback>
          </Avatar>
        }
        actions={
          <Button
            size="icon"
            variant="outline"
            className="size-9 shrink-0 rounded-full"
            aria-label={tx("admin.salesmen.editAria")}
            onClick={() => setIsEditDialogOpen(true)}
          >
            <PencilIcon className="size-4" />
          </Button>
        }
      />

      <Tabs defaultValue="sales">
        <TabsList className="w-full">
          <TabsTrigger value="sales">{tx("admin.salesmen.tab.sales")}</TabsTrigger>
          <TabsTrigger value="gatepass">{tx("admin.salesmen.tab.gatepass")}</TabsTrigger>
          <TabsTrigger value="verification">{tx("admin.salesmen.tab.verification")}</TabsTrigger>
        </TabsList>
        <TabsContent value="sales">
          <SalesTab salesmanId={salesman.id} />
        </TabsContent>
        <TabsContent value="gatepass">
          <GatepassTab salesmanId={salesman.id} isSalesmanDeleted={Boolean(profile.deletedAt)} />
        </TabsContent>
        <TabsContent value="verification">
          <VerificationTab salesmanId={salesman.id} />
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
