export function getNameInitials(name: string | null | undefined, fallback: string): string {
  if (!name) return fallback.toUpperCase();

  const nameParts = name.trim().split(/\s+/).filter(Boolean);
  if (nameParts.length === 0) return fallback.toUpperCase();

  const firstInitial = nameParts[0]?.charAt(0) ?? "";
  const lastInitial = nameParts.length > 1 ? (nameParts.at(-1)?.charAt(0) ?? "") : "";

  return (firstInitial + lastInitial).toUpperCase();
}
