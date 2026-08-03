export interface PaginatedResult<TItem> {
  items: TItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function emptyPaginatedResult<TItem>(
  page: number | undefined,
  pageSize: number | undefined,
): PaginatedResult<TItem> {
  return { items: [], totalCount: 0, page: page ?? 1, pageSize: pageSize ?? 20, totalPages: 0 };
}
