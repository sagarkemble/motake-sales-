"use client";

import { useRef, useState } from "react";
import { Loader2, Trash2, Upload } from "lucide-react";

import { Button } from "~/components/ui/button";
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
  uploadButtonLabel = "Upload image",
  className,
}: ImageUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(imageUrl);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [uploadErrorMessage, setUploadErrorMessage] = useState<string | null>(null);

  async function handleFileSelected(selectedFile: File | undefined) {
    if (!selectedFile) return;
    setUploadErrorMessage(null);

    if (!acceptedContentTypes.includes(selectedFile.type as AcceptedContentType)) {
      setUploadErrorMessage("Use a JPEG, PNG, or WEBP image.");
      return;
    }
    if (selectedFile.size > maxFileSizeBytes) {
      setUploadErrorMessage("Image must be 5MB or smaller.");
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
      setUploadErrorMessage("Upload failed. Try again.");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDeleteClicked() {
    if (!onDelete) return;
    if (!window.confirm("Remove this image?")) return;

    setUploadErrorMessage(null);
    setIsDeleting(true);
    try {
      await onDelete();
      setPreviewUrl(null);
    } catch {
      setUploadErrorMessage("Could not remove the image. Try again.");
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
            "flex size-28 items-center justify-center border border-dashed bg-muted/40 text-xs text-muted-foreground",
            previewShapeClassName,
          )}
        >
          No image
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
          disabled={isUploading || isDeleting}
          onClick={() => fileInputRef.current?.click()}
        >
          {isUploading ? <Loader2 className="animate-spin" /> : <Upload />}
          {isUploading ? "Uploading" : uploadButtonLabel}
        </Button>

        {onDelete && previewUrl && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isUploading || isDeleting}
            onClick={handleDeleteClicked}
          >
            {isDeleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
            {isDeleting ? "Removing" : "Remove"}
          </Button>
        )}
      </div>

      {uploadErrorMessage && <p className="text-sm text-destructive">{uploadErrorMessage}</p>}
    </div>
  );
}
