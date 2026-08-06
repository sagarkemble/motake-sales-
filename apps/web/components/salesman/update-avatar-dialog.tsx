"use client";

import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { ImageUpload } from "~/components/shared/image-upload";
import { getErrorMessage } from "~/lib/get-error-message";
import { useAuth } from "~/hooks/use-auth";
import { useSalesmen } from "~/hooks/use-salesmen";

interface UpdateAvatarDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UpdateAvatarDialog({ open, onOpenChange }: UpdateAvatarDialogProps) {
  const { signedInUser } = useAuth();
  const { createAvatarUploadUrlAsync, updateMyProfileAsync } = useSalesmen();

  async function handleUploaded(result: { imageKey: string; imageUrl: string }) {
    try {
      await updateMyProfileAsync({ avatarKey: result.imageKey, avatarUrl: result.imageUrl });
      toast.success("Avatar updated");
    } catch (updateError) {
      toast.error(getErrorMessage(updateError, "Could not save the avatar. Try again."));
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
        />
      </DialogContent>
    </Dialog>
  );
}
