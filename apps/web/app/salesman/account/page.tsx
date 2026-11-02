"use client";

import { LogOutIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { UpdateAvatarDialog } from "~/components/salesman/update-avatar-dialog";
import { UpdatePhoneNumberDialog } from "~/components/account/update-phone-number-dialog";
import { InstallAppButton } from "~/components/shared/install-app-button";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Skeleton } from "~/components/ui/skeleton";
import { useAuth } from "~/hooks/use-auth";
import { useSalesmen } from "~/hooks/use-salesmen";
import { useTranslate } from "~/hooks/use-translate";
import { getErrorMessage } from "~/lib/get-error-message";
import { getNameInitials } from "~/lib/get-name-initials";

export default function SalesmanAccountPage() {
  const tx = useTranslate();
  const router = useRouter();
  const { logoutAsync, isLoggingOut } = useAuth();
  const {
    mySalesmanProfile,
    isMySalesmanProfileLoading,
    refetchMySalesmanProfile,
    updateMyProfileAsync,
    isUpdatingMyProfile,
  } = useSalesmen({ includeMyProfile: true });

  const [isUpdateAvatarDialogOpen, setIsUpdateAvatarDialogOpen] = useState(false);
  const [isUpdatePhoneDialogOpen, setIsUpdatePhoneDialogOpen] = useState(false);
  const [nameInputValue, setNameInputValue] = useState("");

  const profile = mySalesmanProfile?.profile ?? null;
  const salesman = mySalesmanProfile?.salesman ?? null;
  const avatarInitial = getNameInitials(profile?.name, "S");
  const hasNameChanged = nameInputValue.trim() !== (profile?.name ?? "").trim();

  useEffect(() => {
    setNameInputValue(profile?.name ?? "");
  }, [profile?.name]);

  async function handleSaveName() {
    const trimmedName = nameInputValue.trim();
    if (!trimmedName || !hasNameChanged) return;

    try {
      await updateMyProfileAsync({ name: trimmedName });
      toast.success(tx("account.profile.nameUpdated"));
    } catch (updateError) {
      toast.error(getErrorMessage(tx, updateError, tx("account.profile.nameSaveFailed")));
    }
  }

  async function handleLogout() {
    try {
      await logoutAsync();
      router.replace("/login");
    } catch (logoutError) {
      toast.error(getErrorMessage(tx, logoutError, tx("common.errors.logoutFailed")));
    }
  }

  if (isMySalesmanProfileLoading) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-4">
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (!profile || !salesman) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-3 px-4 py-10 text-center">
        <p className="text-sm text-muted-foreground">{tx("account.profile.loadFailed")}</p>
        <Button
          variant="outline"
          size="sm"
          className="rounded-full"
          onClick={() => void refetchMySalesmanProfile()}
        >
          {tx("common.actions.tryAgain")}
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-4">
      <p className="text-base font-semibold">{tx("common.nav.account")}</p>

      <div className="flex flex-col items-center gap-3 rounded-2xl border bg-card p-4">
        <Avatar className="size-24">
          <AvatarImage src={profile.avatarUrl ?? undefined} alt="Avatar" />
          <AvatarFallback className="text-2xl">{avatarInitial}</AvatarFallback>
        </Avatar>
        <Button
          variant="outline"
          size="sm"
          className="rounded-full"
          onClick={() => setIsUpdateAvatarDialogOpen(true)}
        >
          {tx("account.profile.changeAvatar")}
        </Button>
      </div>

      <div className="flex flex-col gap-4 rounded-2xl border bg-card p-4">
        <p className="text-sm font-semibold">{tx("account.profile.title")}</p>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="account-name">{tx("common.fields.name")}</Label>
            <div className="flex gap-2">
              <Input
                id="account-name"
                value={nameInputValue}
                onChange={(event) => setNameInputValue(event.target.value)}
                placeholder={tx("account.profile.namePlaceholder")}
                className="h-10 rounded-xl"
              />
              <Button
                type="button"
                className="h-10 shrink-0 rounded-full bg-brand px-4 text-brand-foreground hover:bg-brand/90"
                disabled={
                  !hasNameChanged || isUpdatingMyProfile || nameInputValue.trim().length === 0
                }
                onClick={() => void handleSaveName()}
              >
                {isUpdatingMyProfile ? tx("common.status.pleaseWait") : tx("common.actions.save")}
              </Button>
            </div>
          </div>

          <div className="flex flex-col divide-y rounded-xl border">
            <div className="flex flex-col gap-0.5 px-3 py-2.5">
              <p className="text-xs text-muted-foreground">{tx("common.fields.email")}</p>
              <p className="break-all text-sm font-medium">{profile.email}</p>
            </div>

            <div className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="text-xs text-muted-foreground">{tx("common.fields.phone")}</p>
                <p className="truncate text-sm font-medium tabular-nums">
                  {profile.phone ?? tx("common.status.notSet")}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-10 shrink-0 rounded-full px-4"
                onClick={() => setIsUpdatePhoneDialogOpen(true)}
              >
                {tx("common.actions.change")}
              </Button>
            </div>

            <div className="flex flex-col gap-0.5 px-3 py-2.5">
              <p className="text-xs text-muted-foreground">{tx("account.profile.salesmanCode")}</p>
              <p className="font-mono text-sm font-medium">{salesman.salesmanCode}</p>
            </div>
          </div>
        </div>
      </div>

      <InstallAppButton />

      <Button
        type="button"
        variant="outline"
        disabled={isLoggingOut}
        onClick={() => void handleLogout()}
        className="h-11 rounded-full border-destructive/40 text-destructive hover:bg-destructive-soft hover:text-destructive"
      >
        <LogOutIcon className="size-4" />
        {tx("common.actions.logout")}
      </Button>

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
