const IST_OFFSET_MILLISECONDS = 5.5 * 60 * 60 * 1000;

// The Asia/Kolkata calendar date (YYYY-MM-DD) of an instant. "Today" is businessDateOf(now).
export function businessDateOf(instant: Date): string {
  const istInstant = new Date(instant.getTime() + IST_OFFSET_MILLISECONDS);
  return istInstant.toISOString().slice(0, 10);
}
