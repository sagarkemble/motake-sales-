"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { RouterOutputs } from "@repo/trpc/client";
import { AlertTriangleIcon, PencilIcon, PlusIcon, WandSparklesIcon } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "~/components/ui/form";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { useSettings } from "~/hooks/use-settings";
import { useTranslate } from "~/hooks/use-translate";
import { getErrorMessage } from "~/lib/get-error-message";
import { cn } from "~/lib/utils";

type SellerSettings = NonNullable<RouterOutputs["settings"]["seller"]["get"]["data"]>;
type Tx = ReturnType<typeof useTranslate>;

// Spec J: optional seller details printed only on Documents (PDFs). A blank field clears it and the
// PDF leaves that line out. Limits follow the settings route (pan 10, IFSC 11, account number 34).
const PAN_PATTERN = /^[A-Z]{5}\d{4}[A-Z]$/;
const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_NUMBER_PATTERN = /^\d{6,18}$/;
const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const TAX_FIELDS = ["pan", "place", "terms"] as const;
const BANK_FIELDS = [
  "bankAccountName",
  "bankName",
  "bankBranch",
  "bankAccountNumber",
  "bankIfsc",
] as const;
const MONO_FIELDS = new Set(["pan", "bankAccountNumber", "bankIfsc"]);
const MAX_LENGTH = {
  pan: 10,
  place: 120,
  terms: 2000,
  bankAccountName: 200,
  bankName: 120,
  bankBranch: 120,
  bankIfsc: 11,
} as const;

type TaxFormValues = { pan: string; place: string; terms: string };
type BankFormValues = {
  bankAccountName: string;
  bankName: string;
  bankBranch: string;
  bankAccountNumber: string;
  bankIfsc: string;
};
type DocumentField = (typeof TAX_FIELDS)[number] | (typeof BANK_FIELDS)[number];

// The PAN a GSTIN was issued to: its characters 3–12.
function panFromGstin(gstin: string): string | null {
  return GSTIN_PATTERN.test(gstin) ? gstin.slice(2, 12) : null;
}

// Same split as the PDF: one printed line per non-blank line.
function termLines(terms: string): string[] {
  return terms.split("\n").filter((line) => line.trim() !== "");
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function maxLengthRule(tx: Tx, max: number) {
  return z.string().refine((value) => value.trim().length <= max, {
    message: tx("admin.settings.documents.validation.tooLong", { max }),
  });
}

export function SellerDocumentDetails({ seller }: { seller: SellerSettings }) {
  const tx = useTranslate();
  const [openDialog, setOpenDialog] = useState<"tax" | "bank" | null>(null);

  return (
    <>
      <DocumentDetailsCard
        title={tx("admin.settings.documents.taxTitle")}
        empty={tx("admin.settings.documents.taxEmpty")}
        fields={TAX_FIELDS}
        seller={seller}
        onEdit={() => setOpenDialog("tax")}
      />
      <DocumentDetailsCard
        title={tx("admin.settings.documents.bankTitle")}
        empty={tx("admin.settings.documents.bankEmpty")}
        fields={BANK_FIELDS}
        seller={seller}
        onEdit={() => setOpenDialog("bank")}
      />
      <TaxDocumentsDialog
        open={openDialog === "tax"}
        onOpenChange={(open) => setOpenDialog(open ? "tax" : null)}
        seller={seller}
      />
      <BankDetailsDialog
        open={openDialog === "bank"}
        onOpenChange={(open) => setOpenDialog(open ? "bank" : null)}
        seller={seller}
      />
    </>
  );
}

function DocumentDetailsCard({
  title,
  empty,
  fields,
  seller,
  onEdit,
}: {
  title: string;
  empty: string;
  fields: readonly DocumentField[];
  seller: SellerSettings;
  onEdit: () => void;
}) {
  const tx = useTranslate();
  const isBlank = fields.every((field) => !seller[field]?.trim());

  return (
    <section className="rounded-2xl border bg-card shadow-sm p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-medium">{title}</h2>
        <Button size="sm" variant="outline" className="rounded-full" onClick={onEdit}>
          {isBlank ? <PlusIcon /> : <PencilIcon />}
          {isBlank ? tx("admin.settings.documents.add") : tx("admin.settings.seller.edit")}
        </Button>
      </div>
      {isBlank ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
          {fields.map((field) => {
            const value = seller[field]?.trim();
            return (
              <div key={field} className="contents">
                <dt className="text-muted-foreground">{tx(`admin.settings.fields.${field}`)}</dt>
                <dd className={cn("min-w-0 break-words", MONO_FIELDS.has(field) && "font-mono")}>
                  {!value ? (
                    <span className="text-muted-foreground">—</span>
                  ) : field === "terms" ? (
                    <TermLines terms={value} />
                  ) : (
                    value
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </section>
  );
}

function TermLines({ terms }: { terms: string }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {termLines(terms).map((line, index) => (
        <li key={index}>{line}</li>
      ))}
    </ul>
  );
}

interface DocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seller: SellerSettings;
}

function TaxDocumentsDialog({ open, onOpenChange, seller }: DocumentDialogProps) {
  const tx = useTranslate();
  const { updateSellerAsync, isUpdatingSeller } = useSettings();
  const panOfGstin = panFromGstin(seller.gstin);

  const formSchema = useMemo(
    () =>
      z
        .object({
          pan: z.string(),
          place: maxLengthRule(tx, MAX_LENGTH.place),
          terms: maxLengthRule(tx, MAX_LENGTH.terms),
        })
        .superRefine((values, context) => {
          const pan = values.pan.trim().toUpperCase();
          if (!pan) return;
          if (!PAN_PATTERN.test(pan)) {
            context.addIssue({
              code: "custom",
              message: tx("admin.settings.documents.validation.pan"),
              path: ["pan"],
            });
          } else if (panOfGstin && pan !== panOfGstin) {
            context.addIssue({
              code: "custom",
              message: tx("admin.settings.documents.validation.panGstin", { pan: panOfGstin }),
              path: ["pan"],
            });
          }
        }),
    [tx, panOfGstin],
  );

  const defaultValues = useMemo(
    () => ({
      pan: seller.pan ?? "",
      place: seller.place ?? "",
      terms: seller.terms ?? "",
    }),
    [seller.pan, seller.place, seller.terms],
  );

  const form = useForm<TaxFormValues>({ resolver: zodResolver(formSchema), defaultValues });

  useEffect(() => {
    if (open) form.reset(defaultValues);
  }, [open, defaultValues, form]);

  async function handleSubmit(values: TaxFormValues) {
    try {
      await updateSellerAsync({
        pan: blankToNull(values.pan.toUpperCase()),
        place: blankToNull(values.place),
        terms: blankToNull(values.terms),
      });
      toast.success(tx("admin.settings.documents.updateSuccess"));
      onOpenChange(false);
    } catch (error) {
      toast.error(getErrorMessage(tx, error, tx("admin.settings.documents.updateFailed")));
    }
  }

  const pan = form.watch("pan");
  const terms = form.watch("terms");
  const offerGstinPan = panOfGstin !== null && pan.trim().toUpperCase() !== panOfGstin;
  const lines = termLines(terms);

  return (
    <DocumentDialog
      open={open}
      onOpenChange={onOpenChange}
      isSubmitting={isUpdatingSeller}
      title={tx("admin.settings.documents.taxTitle")}
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col gap-4">
          {!pan.trim() && (
            <p className="text-xs text-muted-foreground">
              {tx("admin.settings.documents.gstinOnFile")}{" "}
              <span className="font-mono">{seller.gstin}</span>
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="pan"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{tx("admin.settings.fields.pan")}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      maxLength={MAX_LENGTH.pan}
                      autoCapitalize="characters"
                      placeholder={panOfGstin ?? "ABCDE1234F"}
                      className="rounded-xl bg-muted-soft font-mono uppercase"
                      onChange={(event) => field.onChange(event.target.value.toUpperCase())}
                    />
                  </FormControl>
                  <FormDescription className="text-xs">
                    {tx("admin.settings.documents.panHint")}
                  </FormDescription>
                  {offerGstinPan && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="-ml-2 w-fit rounded-full text-brand"
                      onClick={() =>
                        form.setValue("pan", panOfGstin, {
                          shouldDirty: true,
                          shouldValidate: true,
                        })
                      }
                    >
                      <WandSparklesIcon />
                      {tx("admin.settings.documents.useFromGstin", { pan: panOfGstin })}
                    </Button>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="place"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{tx("admin.settings.fields.place")}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      maxLength={MAX_LENGTH.place}
                      placeholder={tx("admin.settings.documents.placePlaceholder")}
                      className="rounded-xl bg-muted-soft"
                    />
                  </FormControl>
                  <FormDescription className="text-xs">
                    {tx("admin.settings.documents.placeHint")}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="terms"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{tx("admin.settings.fields.terms")}</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    rows={5}
                    maxLength={MAX_LENGTH.terms}
                    placeholder={tx("admin.settings.documents.termsPlaceholder")}
                    className="min-h-28 rounded-xl bg-muted-soft"
                  />
                </FormControl>
                <FormDescription className="text-xs">
                  {tx("admin.settings.documents.termsHint", {
                    count: field.value.length,
                    max: MAX_LENGTH.terms,
                  })}
                </FormDescription>
                <FormMessage />
                {lines.length > 0 && (
                  <div className="rounded-xl border border-dashed px-3 py-2 text-xs">
                    <p className="mb-1 font-medium text-muted-foreground">
                      {tx("admin.settings.documents.printsAs")}
                    </p>
                    <TermLines terms={terms} />
                  </div>
                )}
              </FormItem>
            )}
          />

          <DocumentFormFooter
            isSubmitting={isUpdatingSeller}
            onCancel={() => onOpenChange(false)}
          />
        </form>
      </Form>
    </DocumentDialog>
  );
}

function BankDetailsDialog({ open, onOpenChange, seller }: DocumentDialogProps) {
  const tx = useTranslate();
  const { updateSellerAsync, isUpdatingSeller } = useSettings();

  const formSchema = useMemo(
    () =>
      z.object({
        bankAccountName: maxLengthRule(tx, MAX_LENGTH.bankAccountName),
        bankName: maxLengthRule(tx, MAX_LENGTH.bankName),
        bankBranch: maxLengthRule(tx, MAX_LENGTH.bankBranch),
        bankAccountNumber: z.string().refine(
          (value) => {
            const digits = value.replace(/\s/g, "");
            return digits === "" || ACCOUNT_NUMBER_PATTERN.test(digits);
          },
          { message: tx("admin.settings.documents.validation.accountNumber") },
        ),
        bankIfsc: z.string().refine(
          (value) => {
            const ifsc = value.trim().toUpperCase();
            return ifsc === "" || IFSC_PATTERN.test(ifsc);
          },
          { message: tx("admin.settings.documents.validation.ifsc") },
        ),
      }),
    [tx],
  );

  const defaultValues = useMemo(
    () => ({
      bankAccountName: seller.bankAccountName ?? "",
      bankName: seller.bankName ?? "",
      bankBranch: seller.bankBranch ?? "",
      bankAccountNumber: seller.bankAccountNumber ?? "",
      bankIfsc: seller.bankIfsc ?? "",
    }),
    [
      seller.bankAccountName,
      seller.bankName,
      seller.bankBranch,
      seller.bankAccountNumber,
      seller.bankIfsc,
    ],
  );

  const form = useForm<BankFormValues>({ resolver: zodResolver(formSchema), defaultValues });

  useEffect(() => {
    if (open) form.reset(defaultValues);
  }, [open, defaultValues, form]);

  async function handleSubmit(values: BankFormValues) {
    try {
      await updateSellerAsync({
        bankAccountName: blankToNull(values.bankAccountName),
        bankName: blankToNull(values.bankName),
        bankBranch: blankToNull(values.bankBranch),
        bankAccountNumber: blankToNull(values.bankAccountNumber.replace(/\s/g, "")),
        bankIfsc: blankToNull(values.bankIfsc.toUpperCase()),
      });
      toast.success(tx("admin.settings.documents.updateSuccess"));
      onOpenChange(false);
    } catch (error) {
      toast.error(getErrorMessage(tx, error, tx("admin.settings.documents.updateFailed")));
    }
  }

  // Never blocks Save: the PDF prints only the bank lines that are filled.
  const bankValues = form.watch(BANK_FIELDS);
  const missing = BANK_FIELDS.filter((_, index) => !bankValues[index]?.trim());
  const isPartlyFilled = missing.length > 0 && missing.length < BANK_FIELDS.length;

  function bankInput(
    name: (typeof BANK_FIELDS)[number],
    options: { mono?: boolean; numeric?: boolean; placeholder?: string } = {},
  ) {
    return (
      <FormField
        control={form.control}
        name={name}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{tx(`admin.settings.fields.${name}`)}</FormLabel>
            <FormControl>
              <Input
                {...field}
                maxLength={name === "bankAccountNumber" ? 34 : MAX_LENGTH[name]}
                inputMode={options.numeric ? "numeric" : undefined}
                autoCapitalize={name === "bankIfsc" ? "characters" : undefined}
                placeholder={options.placeholder}
                className={cn("rounded-xl bg-muted-soft", options.mono && "font-mono uppercase")}
                onChange={(event) =>
                  field.onChange(
                    name === "bankIfsc" ? event.target.value.toUpperCase() : event.target.value,
                  )
                }
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    );
  }

  return (
    <DocumentDialog
      open={open}
      onOpenChange={onOpenChange}
      isSubmitting={isUpdatingSeller}
      title={tx("admin.settings.documents.bankTitle")}
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col gap-4">
          {bankInput("bankAccountName", {
            placeholder: tx("admin.settings.documents.accountNamePlaceholder"),
          })}
          <div className="grid gap-4 sm:grid-cols-2">
            {bankInput("bankName")}
            {bankInput("bankBranch")}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {bankInput("bankAccountNumber", { mono: true, numeric: true })}
            {bankInput("bankIfsc", { mono: true, placeholder: "BKID0000919" })}
          </div>

          {isPartlyFilled && (
            <div className="flex gap-2 rounded-xl bg-amber-soft px-3 py-2 text-xs">
              <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
              <p>
                {tx("admin.settings.documents.bankPartial", {
                  missing: missing.map((field) => tx(`admin.settings.fields.${field}`)).join(", "),
                })}
              </p>
            </div>
          )}

          <DocumentFormFooter
            isSubmitting={isUpdatingSeller}
            onCancel={() => onOpenChange(false)}
          />
        </form>
      </Form>
    </DocumentDialog>
  );
}

function DocumentDialog({
  open,
  onOpenChange,
  isSubmitting,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isSubmitting: boolean;
  title: string;
  children: ReactNode;
}) {
  const tx = useTranslate();
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isSubmitting) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{tx("admin.settings.documents.dialogDescription")}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

// The note that old PDFs keep their details, then Save / Cancel like the Seller form.
function DocumentFormFooter({
  isSubmitting,
  onCancel,
}: {
  isSubmitting: boolean;
  onCancel: () => void;
}) {
  const tx = useTranslate();
  return (
    <>
      <p className="text-xs text-muted-foreground">{tx("admin.settings.documents.appliesNote")}</p>

      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <Button
          type="submit"
          disabled={isSubmitting}
          className="rounded-full bg-brand text-brand-foreground hover:bg-brand/90 sm:flex-1"
        >
          {isSubmitting ? tx("common.status.pleaseWait") : tx("admin.settings.seller.saveChanges")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="rounded-full"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          {tx("common.actions.cancel")}
        </Button>
      </div>
    </>
  );
}
