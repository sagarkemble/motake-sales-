"use client";

import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { ImageUpload } from "~/components/shared/image-upload";
import { getErrorMessage } from "~/lib/get-error-message";
import { useAuth } from "~/hooks/use-auth";
import { useTranslate } from "~/hooks/use-translate";

interface UpdateAvatarDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UpdateAvatarDialog({ open, onOpenChange }: UpdateAvatarDialogProps) {
  const tx = useTranslate();
  const { signedInUser, createAvatarUploadUrlAsync, updateMyProfileAsync, deleteMyAvatarAsync } =
    useAuth();

  async function handleUploaded(result: { imageKey: string; imageUrl: string }) {
    try {
      await updateMyProfileAsync({ avatarKey: result.imageKey });
      toast.success(tx("account.avatar.updated"));
    } catch (updateError) {
      toast.error(getErrorMessage(updateError, tx("account.avatar.saveFailed")));
    }
  }

  async function handleDeleted() {
    try {
      await deleteMyAvatarAsync();
      toast.success(tx("account.avatar.removed"));
    } catch (deleteError) {
      toast.error(getErrorMessage(deleteError, tx("account.avatar.removeFailed")));
      throw deleteError;
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{tx("account.avatar.title")}</DialogTitle>
        </DialogHeader>

        <ImageUpload
          imageUrl={signedInUser?.avatarUrl ?? null}
          requestUploadUrl={createAvatarUploadUrlAsync}
          altText={tx("account.avatar.alt")}
          shape="circle"
          uploadButtonLabel={tx("account.avatar.upload")}
          onUploaded={handleUploaded}
          onDelete={handleDeleted}
        />
      </DialogContent>
    </Dialog>
  );
}
