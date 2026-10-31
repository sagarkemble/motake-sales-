"use client";

import { useRef, useState } from "react";
import { Loader2, Trash2, Upload } from "lucide-react";

import { Button } from "~/components/ui/button";
import { useTranslate } from "~/hooks/use-translate";
import { cn } from "~/lib/utils";

const maxFileSizeBytes = 5 * 1024 * 1024;
const acceptedContentTypes = ["image/jpeg", "image/png", "image/webp"] as const;
type AcceptedContentType = (typeof acceptedContentTypes)[number];

interface UploadedImageResult {
  imageKey: string;
  imageUrl: string;
}

interface ImageUploadProps {
  imageUrl: string | null;
  onUploaded: (result: UploadedImageResult) => void;
  onDelete?: () => Promise<void>;
  requestUploadUrl: (input: {
    fileName: string;
    contentType: AcceptedContentType;
    contentLength: number;
  }) => Promise<{ data: { uploadUrl: string; imageKey: string; imageUrl: string } }>;
  altText: string;
  shape?: "square" | "circle";
  uploadButtonLabel?: string;
  className?: string;
}

export function ImageUpload({
  imageUrl,
  onUploaded,
  onDelete,
  requestUploadUrl,
  altText,
  shape = "square",
  uploadButtonLabel,
  className,
}: ImageUploadProps) {
  const tx = useTranslate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(imageUrl);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [uploadErrorMessage, setUploadErrorMessage] = useState<string | null>(null);

  async function handleFileSelected(selectedFile: File | undefined) {
    if (!selectedFile) return;
    setUploadErrorMessage(null);

    if (!acceptedContentTypes.includes(selectedFile.type as AcceptedContentType)) {
      setUploadErrorMessage(tx("common.imageUpload.badType"));
      return;
    }
    if (selectedFile.size > maxFileSizeBytes) {
      setUploadErrorMessage(tx("common.imageUpload.tooLarge"));
      return;
    }

    setIsUploading(true);
    try {
      const uploadUrlResponse = await requestUploadUrl({
        fileName: selectedFile.name,
        contentType: selectedFile.type as AcceptedContentType,
        contentLength: selectedFile.size,
      });
      const { uploadUrl, imageKey, imageUrl: uploadedImageUrl } = uploadUrlResponse.data;

      const putResponse = await fetch(uploadUrl, {
        method: "PUT",
        body: selectedFile,
        headers: { "Content-Type": selectedFile.type },
      });
      if (!putResponse.ok) throw new Error("Upload to storage failed");

      setPreviewUrl(uploadedImageUrl);
      onUploaded({ imageKey, imageUrl: uploadedImageUrl });
    } catch {
      setUploadErrorMessage(tx("common.imageUpload.uploadFailed"));
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDeleteClicked() {
    if (!onDelete) return;
    if (!window.confirm(tx("common.imageUpload.confirmRemove"))) return;

    setUploadErrorMessage(null);
    setIsDeleting(true);
    try {
      await onDelete();
      setPreviewUrl(null);
    } catch {
      setUploadErrorMessage(tx("common.imageUpload.removeFailed"));
    } finally {
      setIsDeleting(false);
    }
  }

  const previewShapeClassName = shape === "circle" ? "rounded-full" : "rounded-2xl";

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      {previewUrl ? (
        <img
          src={previewUrl}
          alt={altText}
          className={cn("size-28 border object-cover", previewShapeClassName)}
        />
      ) : (
        <div
          className={cn(
            "flex size-28 items-center justify-center border border-dashed bg-muted-soft text-xs text-muted-foreground",
            previewShapeClassName,
          )}
        >
          {tx("common.imageUpload.noImage")}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={acceptedContentTypes.join(",")}
        className="hidden"
        onChange={(changeEvent) => handleFileSelected(changeEvent.target.files?.[0])}
      />

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-full"
          disabled={isUploading || isDeleting}
          onClick={() => fileInputRef.current?.click()}
        >
          {isUploading ? <Loader2 className="animate-spin" /> : <Upload />}
          {isUploading
            ? tx("common.imageUpload.uploading")
            : (uploadButtonLabel ?? tx("common.imageUpload.uploadImage"))}
        </Button>

        {onDelete && previewUrl && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={isUploading || isDeleting}
            onClick={handleDeleteClicked}
          >
            {isDeleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
            {isDeleting ? tx("common.imageUpload.removing") : tx("common.imageUpload.remove")}
          </Button>
        )}
      </div>

      {uploadErrorMessage && <p className="text-sm text-destructive">{uploadErrorMessage}</p>}
    </div>
  );
}
