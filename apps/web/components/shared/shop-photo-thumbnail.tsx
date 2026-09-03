import { StoreIcon } from "lucide-react";

import { cn } from "~/lib/utils";

interface ShopPhotoThumbnailProps {
  shopPhotoUrl?: string | null;
  shopName?: string;
  size?: "sm" | "md" | "lg";
  shape?: "rounded" | "circle";
  className?: string;
}

const sizeClassName = {
  sm: "size-8",
  md: "size-10",
  lg: "size-28",
} as const;

const iconSizeClassName = {
  sm: "size-4",
  md: "size-5",
  lg: "size-10",
} as const;

export function ShopPhotoThumbnail({
  shopPhotoUrl,
  shopName = "Shop",
  size = "md",
  shape = "rounded",
  className,
}: ShopPhotoThumbnailProps) {
  const shapeClassName = shape === "circle" ? "rounded-full" : "rounded-lg";

  if (shopPhotoUrl) {
    return (
      <img
        src={shopPhotoUrl}
        alt={shopName}
        className={cn(
          "shrink-0 object-cover",
          sizeClassName[size],
          shapeClassName,
          className,
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center bg-muted/40",
        sizeClassName[size],
        shapeClassName,
        className,
      )}
    >
      <StoreIcon className={cn("text-muted-foreground", iconSizeClassName[size])} />
    </div>
  );
}
