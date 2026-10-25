"use client";

import { Button } from "~/components/ui/button";
import { useTranslate } from "~/hooks/use-translate";

interface ListPagerProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

/** Previous / next under a paginated list. Renders nothing for a single page. */
export function ListPager({ page, totalPages, onPageChange }: ListPagerProps) {
  const tx = useTranslate();

  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between pt-2">
      <p className="text-xs text-muted-foreground">
        {tx("common.pagination.pageOf", { page, total: totalPages })}
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          className="rounded-full"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          {tx("common.pagination.previous")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="rounded-full"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          {tx("common.pagination.next")}
        </Button>
      </div>
    </div>
  );
}
