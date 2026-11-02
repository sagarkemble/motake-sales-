"use client";

import { LogOutIcon, MailIcon, PhoneIcon, TicketIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { InstallAppButton } from "~/components/shared/install-app-button";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { useAuth } from "~/hooks/use-auth";
import { useSalesmen } from "~/hooks/use-salesmen";
import { useTranslate } from "~/hooks/use-translate";
import { getErrorMessage } from "~/lib/get-error-message";
import { getNameInitials } from "~/lib/get-name-initials";

// View only: the salesman's photo, name and phone are changed by the Admin.
export default function SalesmanAccountPage() {
  const tx = useTranslate();
  const router = useRouter();
  const { logoutAsync, isLoggingOut } = useAuth();
  const { mySalesmanProfile, isMySalesmanProfileLoading, refetchMySalesmanProfile } = useSalesmen({
    includeMyProfile: true,
  });

  const profile = mySalesmanProfile?.profile ?? null;
  const salesman = mySalesmanProfile?.salesman ?? null;
  const avatarInitial = getNameInitials(profile?.name, "S");

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
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
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

  const detailRows = [
    { key: "email", label: tx("common.fields.email"), value: profile.email, icon: MailIcon },
    {
      key: "phone",
      label: tx("common.fields.phone"),
      value: profile.phone ?? tx("common.status.notSet"),
      icon: PhoneIcon,
    },
    {
      key: "code",
      label: tx("account.profile.salesmanCode"),
      value: salesman.salesmanCode,
      icon: TicketIcon,
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-4">
      <p className="text-base font-semibold">{tx("common.nav.account")}</p>

      <div className="flex items-center gap-3 rounded-2xl border bg-card p-4">
        <Avatar className="size-16">
          <AvatarImage src={profile.avatarUrl ?? undefined} alt="Avatar" />
          <AvatarFallback className="text-xl">{avatarInitial}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-base font-semibold">{profile.name}</p>
          <p className="font-mono text-xs text-muted-foreground">{salesman.salesmanCode}</p>
        </div>
      </div>

      <div className="flex flex-col divide-y rounded-2xl border bg-card">
        {detailRows.map((row) => (
          <div key={row.key} className="flex items-center gap-3 px-4 py-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
              <row.icon className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{row.label}</p>
              <p className="break-all text-sm font-medium tabular-nums">{row.value}</p>
            </div>
          </div>
        ))}
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
    </div>
  );
}
