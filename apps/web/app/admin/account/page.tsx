"use client";

import { ChevronRightIcon, Loader2Icon, SettingsIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { UpdateAvatarDialog } from "~/components/admin/update-avatar-dialog";
import { UpdatePhoneNumberDialog } from "~/components/account/update-phone-number-dialog";
import { InstallAppButton } from "~/components/shared/install-app-button";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Skeleton } from "~/components/ui/skeleton";
import { useAuth } from "~/hooks/use-auth";
import { useTranslate } from "~/hooks/use-translate";
import { getErrorMessage } from "~/lib/get-error-message";
import { getNameInitials } from "~/lib/get-name-initials";

export default function AdminAccountPage() {
  const tx = useTranslate();
  const {
    signedInUser,
    isSignedInUserLoading,
    refetchSignedInUser,
    updateMyProfileAsync,
    isUpdatingMyProfile,
  } = useAuth();

  const [isUpdateAvatarDialogOpen, setIsUpdateAvatarDialogOpen] = useState(false);
  const [isUpdatePhoneDialogOpen, setIsUpdatePhoneDialogOpen] = useState(false);
  const [nameInputValue, setNameInputValue] = useState("");

  const avatarInitial = getNameInitials(signedInUser?.name, "A");
  const hasNameChanged = nameInputValue.trim() !== (signedInUser?.name ?? "").trim();

  useEffect(() => {
    setNameInputValue(signedInUser?.name ?? "");
  }, [signedInUser?.name]);

  async function handleSaveName() {
    const trimmedName = nameInputValue.trim();
    if (!trimmedName || !hasNameChanged) return;

    try {
      await updateMyProfileAsync({ name: trimmedName });
      toast.success(tx("account.profile.nameUpdated"));
    } catch (updateError) {
      toast.error(getErrorMessage(updateError, tx("account.profile.nameSaveFailed")));
    }
  }

  if (isSignedInUserLoading) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-4">
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (!signedInUser) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-3 px-4 py-10 text-center">
        <p className="text-sm text-muted-foreground">{tx("account.profile.loadFailed")}</p>
        <Button variant="outline" size="sm" onClick={() => void refetchSignedInUser()}>
          {tx("common.actions.tryAgain")}
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-4">
      <Card className="bg-card">
        <CardContent className="flex flex-col items-center gap-3">
          <Avatar className="size-24 ring-4 ring-brand/10">
            <AvatarImage src={signedInUser.avatarUrl ?? undefined} alt="Avatar" />
            <AvatarFallback className="text-2xl">{avatarInitial}</AvatarFallback>
          </Avatar>
          <Badge variant="secondary" className="capitalize">
            {signedInUser.role}
          </Badge>
          <Button variant="outline" size="sm" onClick={() => setIsUpdateAvatarDialogOpen(true)}>
            {tx("account.profile.changeAvatar")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tx("account.profile.title")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="account-name">{tx("common.fields.name")}</Label>
            <div className="flex gap-2">
              <Input
                id="account-name"
                value={nameInputValue}
                onChange={(event) => setNameInputValue(event.target.value)}
                placeholder={tx("account.profile.namePlaceholder")}
              />
              <Button
                type="button"
                size="sm"
                disabled={
                  !hasNameChanged || isUpdatingMyProfile || nameInputValue.trim().length === 0
                }
                onClick={() => void handleSaveName()}
              >
                {isUpdatingMyProfile ? <Loader2Icon className="size-4 animate-spin" /> : null}
                {tx("common.actions.save")}
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="account-email">{tx("common.fields.email")}</Label>
            <Input id="account-email" value={signedInUser.email} readOnly disabled />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="account-phone">{tx("common.fields.phone")}</Label>
            <div className="flex gap-2">
              <Input
                id="account-phone"
                value={signedInUser.phone ?? tx("common.status.notSet")}
                readOnly
                disabled
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsUpdatePhoneDialogOpen(true)}
              >
                {tx("common.actions.change")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Link
        href="/admin/settings"
        className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-brand/40 hover:bg-brand/5"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
          <SettingsIcon className="size-5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-medium">{tx("admin.settings.accountEntry.title")}</span>
          <span className="text-xs text-muted-foreground">
            {tx("admin.settings.accountEntry.description")}
          </span>
        </span>
        <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
      </Link>

      <InstallAppButton />

      <UpdateAvatarDialog
        open={isUpdateAvatarDialogOpen}
        onOpenChange={setIsUpdateAvatarDialogOpen}
      />
      <UpdatePhoneNumberDialog
        open={isUpdatePhoneDialogOpen}
        onOpenChange={setIsUpdatePhoneDialogOpen}
      />
    </div>
  );
}
