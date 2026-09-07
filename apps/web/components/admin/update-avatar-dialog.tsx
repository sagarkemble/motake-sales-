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
      toast.success(tx("Avatar updated"));
    } catch (updateError) {
      toast.error(getErrorMessage(updateError, tx("Could not save the avatar. Try again.")));
    }
  }

  async function handleDeleted() {
    try {
      await deleteMyAvatarAsync();
      toast.success(tx("Avatar removed"));
    } catch (deleteError) {
      toast.error(getErrorMessage(deleteError, tx("Could not remove the avatar. Try again.")));
      throw deleteError;
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Update avatar</DialogTitle>
        </DialogHeader>

        <ImageUpload
          imageUrl={signedInUser?.avatarUrl ?? null}
          requestUploadUrl={createAvatarUploadUrlAsync}
          altText="Avatar"
          shape="circle"
          uploadButtonLabel="Upload avatar"
          onUploaded={handleUploaded}
          onDelete={handleDeleted}
        />
      </DialogContent>
    </Dialog>
  );
}
