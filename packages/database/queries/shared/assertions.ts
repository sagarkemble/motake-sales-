export function firstOrThrow<T>(rows: T[], context: string): T {
  const [firstRow] = rows;
  if (!firstRow) {
    throw new Error(`Expected at least one row for ${context}, received none`);
  }
  return firstRow;
}
