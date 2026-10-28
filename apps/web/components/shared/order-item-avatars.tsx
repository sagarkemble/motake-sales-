import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { cn } from "~/lib/utils";

interface OrderItemPreview {
  productName: string;
  imageUrl: string | null;
}

interface OrderItemAvatarsProps {
  itemPreviews?: OrderItemPreview[];
  className?: string;
  size?: "sm" | "md";
}

const stackSpacingBySize: Record<NonNullable<OrderItemAvatarsProps["size"]>, string> = {
  sm: "-space-x-2",
  md: "-space-x-3",
};

const avatarSizeClasses: Record<NonNullable<OrderItemAvatarsProps["size"]>, string> = {
  sm: "size-5 border",
  md: "size-7 border-2",
};

const fallbackTextSizeBySize: Record<NonNullable<OrderItemAvatarsProps["size"]>, string> = {
  sm: "text-[9px]",
  md: "text-[11px]",
};

function getInitial(productName: string): string {
  return productName.trim().charAt(0).toUpperCase() || "?";
}

export function OrderItemAvatars({
  itemPreviews = [],
  className,
  size = "md",
}: OrderItemAvatarsProps) {
  if (itemPreviews.length === 0) return null;

  return (
    <div className={cn("flex rounded-full", stackSpacingBySize[size], className)}>
      {itemPreviews.map((itemPreview, itemPreviewIndex) => (
        <Avatar
          key={itemPreview.productName + itemPreviewIndex}
          className={cn(
            avatarSizeClasses[size],
            "border-card bg-secondary shadow-sm ring-1 ring-border",
          )}
          style={{ zIndex: itemPreviews.length - itemPreviewIndex }}
        >
          {itemPreview.imageUrl && <AvatarImage src={itemPreview.imageUrl} alt="" />}
          <AvatarFallback
            className={cn(fallbackTextSizeBySize[size], "font-medium text-muted-foreground")}
          >
            {getInitial(itemPreview.productName)}
          </AvatarFallback>
        </Avatar>
      ))}
    </div>
  );
}
