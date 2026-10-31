// The first three ASCII letters of the name, upper-case, accents dropped ("Rāvi" → "RAV"), or
// "SM" when the name has none.
export function salesmanCodeLetters(name: string): string {
  const letters = name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 3);
  return letters || "SM";
}

// `{AAA}-{last 4 phone digits}-{yymmdd}`, e.g. `RAV-4321-261031` for Ravi, 98765 44321, added
// 31 Oct 2026. A code already taken gets the first free `-2`, `-3`, … suffix.
export function nextSalesmanCode(
  name: string,
  phone: string,
  businessDate: string,
  existingCodes: string[],
): string {
  const phoneDigits = phone.replace(/\D/g, "").slice(-4).padStart(4, "0");
  const date = businessDate.slice(2).replaceAll("-", "");
  const base = `${salesmanCodeLetters(name)}-${phoneDigits}-${date}`;
  const taken = new Set(existingCodes);
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}
