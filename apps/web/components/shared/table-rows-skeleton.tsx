import { Skeleton } from "~/components/ui/skeleton";
import { Table, TableBody, TableCell, TableRow } from "~/components/ui/table";

interface TableRowsSkeletonProps {
  rows?: number;
  columns?: number;
}

export function TableRowsSkeleton({ rows = 4, columns = 5 }: TableRowsSkeletonProps) {
  return (
    <Table>
      <TableBody>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <TableRow key={rowIndex}>
            {Array.from({ length: columns }).map((_, columnIndex) => (
              <TableCell key={columnIndex}>
                <Skeleton className="h-4 w-full" />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
