const CODE_MAX_LENGTH = 64;
const CODE_PREFIX = "rt-";
const COUNTER_DIGITS = 3;

// Lower-case ASCII slug of the Route name: accents dropped ("Kolhāpur" → "kolhapur"), every
// other run of characters becomes one hyphen.
export function routeCodeSlug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Highest counter in any Route code, whatever its slug.
export function highestRouteCounter(existingCodes: string[]): number {
  return existingCodes.reduce((highest, code) => {
    const match = /-(\d+)$/.exec(code);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
}

// `rt-{slug}-{nnn}` (or `rt-{nnn}` when the name has no ASCII letters or digits). `{nnn}` is one
// global counter across every Route; the slug is cut so the whole code fits 64 characters.
export function nextRouteCode(name: string, existingCodes: string[]): string {
  const counter = String(highestRouteCounter(existingCodes) + 1).padStart(COUNTER_DIGITS, "0");
  const maxSlugLength = CODE_MAX_LENGTH - CODE_PREFIX.length - 1 - counter.length;
  const slug = routeCodeSlug(name).slice(0, maxSlugLength).replace(/-+$/g, "");
  return slug ? `${CODE_PREFIX}${slug}-${counter}` : `${CODE_PREFIX}${counter}`;
}
