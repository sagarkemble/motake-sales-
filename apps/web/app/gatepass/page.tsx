import { redirect } from "next/navigation";

// GatePass moved inside the Admin shell; old links and bookmarks still land on it.
export default async function OldGatepassPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const item of Array.isArray(value) ? value : value ? [value] : []) query.append(key, item);
  }
  const queryString = query.toString();
  redirect(queryString ? `/admin/gatepass?${queryString}` : "/admin/gatepass");
}
