"use client";

import { useState } from "react";
import { toast } from "sonner";

import {
  EMPTY_NEW_CUSTOMER_FORM,
  isNewCustomerFormFilled,
  NewCustomerFields,
  type NewCustomerFormValues,
} from "~/components/salesman/customers/new-customer-fields";
import { Button } from "~/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "~/components/ui/drawer";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useCustomers } from "~/hooks/use-customers";
import { useTranslate } from "~/hooks/use-translate";
import { getErrorMessage } from "~/lib/get-error-message";

interface AddCustomerDrawerProps {
  routeName: string;
  onClose: () => void;
}

/** Add a Customer outside checkout; the server puts them on the Active GatePass Route. */
export function AddCustomerDrawer({ routeName, onClose }: AddCustomerDrawerProps) {
  const tx = useTranslate();
  const [newCustomerForm, setNewCustomerForm] =
    useState<NewCustomerFormValues>(EMPTY_NEW_CUSTOMER_FORM);
  const { createCustomerAsync, isCreatingCustomer } = useCustomers();

  async function saveCustomer() {
    try {
      const createdCustomerResponse = await createCustomerAsync({
        shopName: newCustomerForm.shopName.trim(),
        phone: newCustomerForm.phone.trim(),
        address: newCustomerForm.address.trim(),
        shopPhotoKey: newCustomerForm.shopPhotoKey,
        preferredLanguage: newCustomerForm.preferredLanguage,
      });
      toast.success(
        tx("salesman.customers.addSuccess", {
          shop: createdCustomerResponse.data.shopName,
          route: routeName,
        }),
      );
      onClose();
    } catch (createCustomerError) {
      toast.error(
        getErrorMessage(tx, createCustomerError, tx("salesman.checkout.error.saveCustomer")),
      );
    }
  }

  return (
    <Drawer open onOpenChange={(open) => !open && !isCreatingCustomer && onClose()}>
      <DrawerContent className="data-[vaul-drawer-direction=bottom]:max-h-[90dvh]">
        <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col">
          <DrawerHeader className="text-left">
            <DrawerTitle>{tx("salesman.customers.add")}</DrawerTitle>
            <DrawerDescription>{tx("salesman.customers.addHint")}</DrawerDescription>
          </DrawerHeader>

          <ScrollArea className="flex min-h-0 flex-1 flex-col [&>[data-slot=scroll-area-viewport]>div]:block!">
            <div className="px-4 pb-4">
              <NewCustomerFields
                routeName={routeName}
                newCustomerForm={newCustomerForm}
                onNewCustomerFormChange={(fieldValues) =>
                  setNewCustomerForm((currentValues) => ({ ...currentValues, ...fieldValues }))
                }
              />
            </div>
          </ScrollArea>

          <DrawerFooter>
            <Button
              type="button"
              className="w-full rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
              disabled={!isNewCustomerFormFilled(newCustomerForm) || isCreatingCustomer}
              onClick={() => void saveCustomer()}
            >
              {isCreatingCustomer ? tx("common.status.pleaseWait") : tx("salesman.customers.add")}
            </Button>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
