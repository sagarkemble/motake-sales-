const MAX_PAGE_SIZE = 200;

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function buildPaginationOffsets({ page, pageSize }: PaginationParams) {
  const normalizedPageSize = Math.min(Math.max(pageSize, 1), MAX_PAGE_SIZE);
  const normalizedPage = Math.max(page, 1);

  return {
    limit: normalizedPageSize,
    offset: (normalizedPage - 1) * normalizedPageSize,
  };
}

export function toPaginatedResult<T>(
  items: T[],
  totalCount: number,
  { page, pageSize }: PaginationParams,
): PaginatedResult<T> {
  const normalizedPageSize = Math.min(Math.max(pageSize, 1), MAX_PAGE_SIZE);
  const normalizedPage = Math.max(page, 1);

  return {
    items,
    totalCount,
    page: normalizedPage,
    pageSize: normalizedPageSize,
    totalPages: Math.max(Math.ceil(totalCount / normalizedPageSize), 1),
  };
}
