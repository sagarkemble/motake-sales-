const SKU_MAX_LENGTH = 64;
const SKU_PREFIX = "vr-";
const COUNTER_DIGITS = 3;

// Lower-case ASCII slug of Product name + Variety name; non-alphanumerics collapse to one hyphen.
export function varietySkuSlug(productName: string, varietyName: string): string {
  const maxSlugLength = SKU_MAX_LENGTH - SKU_PREFIX.length - 1 - COUNTER_DIGITS;
  return `${productName} ${varietyName}`
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxSlugLength)
    .replace(/-+$/g, "");
}

// `vr-{slug}-` (or `vr-` when the names have no ASCII letters or digits).
export function varietySkuPrefix(slug: string): string {
  return slug ? `${SKU_PREFIX}${slug}-` : SKU_PREFIX;
}

// Next free counter after the SKUs already under this prefix.
export function nextVarietySku(skuPrefix: string, existingSkus: string[]): string {
  const counterPattern = new RegExp(`^${skuPrefix.replace(/-/g, "\\-")}(\\d+)$`);
  const highestCounter = existingSkus.reduce((highest, sku) => {
    const match = counterPattern.exec(sku);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  const sku = `${skuPrefix}${String(highestCounter + 1).padStart(COUNTER_DIGITS, "0")}`;
  // Only different names that slug alike share a prefix, so 999 is never reached in practice.
  if (sku.length > SKU_MAX_LENGTH) throw new Error(`SKU counter exhausted for ${skuPrefix}`);
  return sku;
}
