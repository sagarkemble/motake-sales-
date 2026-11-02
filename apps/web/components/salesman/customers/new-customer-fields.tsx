"use client";

import { RouteIcon } from "lucide-react";
import { useId } from "react";

import { CityPicker } from "~/components/shared/city-picker";
import { ImageUpload } from "~/components/shared/image-upload";
import { PreferredLanguagePicker } from "~/components/shared/preferred-language-picker";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { useCustomers } from "~/hooks/use-customers";
import { useTranslate } from "~/hooks/use-translate";
import type { PreferredLanguage } from "~/lib/preferred-language";

export interface NewCustomerFormValues {
  shopName: string;
  phone: string;
  address: string;
  cityId: string;
  shopPhotoKey: string;
  shopPhotoUrl: string;
  preferredLanguage: PreferredLanguage;
}

export const EMPTY_NEW_CUSTOMER_FORM: NewCustomerFormValues = {
  shopName: "",
  phone: "",
  address: "",
  cityId: "",
  shopPhotoKey: "",
  shopPhotoUrl: "",
  preferredLanguage: "mr",
};

/** Shop name, phone, address and city are required to save a Customer; the shop photo is optional. */
export function isNewCustomerFormFilled(form: NewCustomerFormValues): boolean {
  return (
    form.shopName.trim().length > 0 &&
    form.phone.trim().length > 0 &&
    form.address.trim().length > 0 &&
    form.cityId.length > 0
  );
}

/** Salesman Add Customer: no Route picker (the Active GatePass Route) and no GSTIN. */
export function NewCustomerFields({
  routeName,
  newCustomerForm,
  onNewCustomerFormChange,
}: {
  routeName: string;
  newCustomerForm: NewCustomerFormValues;
  onNewCustomerFormChange: (fieldValues: Partial<NewCustomerFormValues>) => void;
}) {
  const tx = useTranslate();
  const { createShopPhotoUploadUrlAsync } = useCustomers();
  // The checkout mounts a mobile and a desktop tree; ids must differ between them.
  const idPrefix = useId();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 rounded-2xl border border-brand/30 bg-brand-faint px-3 py-2 text-sm">
        <RouteIcon className="size-4 shrink-0 text-brand" />
        <span>{tx("salesman.checkout.customer.addedOnRoute", { route: routeName })}</span>
      </div>

      <div className="rounded-2xl border bg-card shadow-sm p-3">
        <Label className="mb-2 block">{tx("salesman.checkout.customer.shopPhoto")}</Label>
        <ImageUpload
          imageUrl={newCustomerForm.shopPhotoUrl || null}
          requestUploadUrl={createShopPhotoUploadUrlAsync}
          altText={tx("admin.customers.form.shopPhoto")}
          shape="square"
          uploadButtonLabel={tx("salesman.checkout.customer.uploadPhoto")}
          onUploaded={(result) =>
            onNewCustomerFormChange({
              shopPhotoKey: result.imageKey,
              shopPhotoUrl: result.imageUrl,
            })
          }
          onDelete={
            newCustomerForm.shopPhotoUrl
              ? async () =>
                  onNewCustomerFormChange({
                    shopPhotoKey: "",
                    shopPhotoUrl: "",
                  })
              : undefined
          }
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-new-customer-shop-name`}>
          {tx("salesman.checkout.customer.shopName")}
        </Label>
        <Input
          id={`${idPrefix}-new-customer-shop-name`}
          placeholder={tx("salesman.checkout.customer.shopNamePlaceholder")}
          value={newCustomerForm.shopName}
          onChange={(event) => onNewCustomerFormChange({ shopName: event.target.value })}
          className="h-11 rounded-xl"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-new-customer-phone`}>{tx("common.fields.phone")}</Label>
        <Input
          id={`${idPrefix}-new-customer-phone`}
          type="tel"
          placeholder={tx("salesman.checkout.customer.phonePlaceholder")}
          value={newCustomerForm.phone}
          onChange={(event) => onNewCustomerFormChange({ phone: event.target.value })}
          className="h-11 rounded-xl"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-new-customer-address`}>{tx("common.fields.address")}</Label>
        <Textarea
          id={`${idPrefix}-new-customer-address`}
          placeholder={tx("salesman.checkout.customer.addressPlaceholder")}
          value={newCustomerForm.address}
          onChange={(event) => onNewCustomerFormChange({ address: event.target.value })}
          className="rounded-xl"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-new-customer-city`}>{tx("common.cities.label")}</Label>
        <CityPicker
          id={`${idPrefix}-new-customer-city`}
          value={newCustomerForm.cityId}
          onValueChange={(cityId) => onNewCustomerFormChange({ cityId })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-new-customer-language`}>
          {tx("common.preferredLanguage.label")}
        </Label>
        <PreferredLanguagePicker
          id={`${idPrefix}-new-customer-language`}
          value={newCustomerForm.preferredLanguage}
          onValueChange={(preferredLanguage) => onNewCustomerFormChange({ preferredLanguage })}
        />
      </div>
    </div>
  );
}
