const IST_OFFSET_MILLISECONDS = 5.5 * 60 * 60 * 1000;

export function toIstBusinessDate(timestamp: Date): string {
  const istTimestamp = new Date(timestamp.getTime() + IST_OFFSET_MILLISECONDS);
  return istTimestamp.toISOString().slice(0, 10);
}
