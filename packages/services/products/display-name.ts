// "Toned Milk 500 ml", as the product_varieties.display_name column computes it: the size without
// trailing zeros, and just the size when the name is empty.
export function varietyDisplayName(variety: {
  name: string;
  sizeValue: string | null;
  uomCode: string | null;
}): string {
  if (variety.sizeValue === null || variety.uomCode === null) return variety.name;
  return `${variety.name} ${Number(variety.sizeValue)} ${variety.uomCode}`.trim();
}
