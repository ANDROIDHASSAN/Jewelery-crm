import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table';
import { cn } from '@/lib/cn';

export interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  /** Cap the scrollable body height. When set, the header sticks to the top. */
  maxBodyHeight?: number;
  className?: string;
}

export function DataTable<T>({
  columns,
  data,
  onRowClick,
  emptyMessage = 'No rows.',
  maxBodyHeight,
  className,
}: DataTableProps<T>): JSX.Element {
  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });
  return (
    <div className={cn('rounded-md border border-ink-100 bg-ink-0 overflow-hidden', className)}>
      <div
        className="overflow-x-auto overflow-y-auto"
        style={maxBodyHeight ? { maxHeight: maxBodyHeight } : undefined}
      >
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 bg-ink-25/95 backdrop-blur z-10 border-b border-ink-100">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
                    className="px-3 py-2.5 text-left text-[10px] font-semibold tracking-[0.14em] text-ink-500 uppercase"
                  >
                    {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-10 text-center text-ink-400 text-sm">
                  {emptyMessage}
                </td>
              </tr>
            )}
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                className={cn(
                  'h-10 border-b border-ink-50 last:border-b-0 transition-colors duration-fast',
                  onRowClick && 'cursor-pointer hover:bg-ink-25 active:bg-ink-50',
                )}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2 text-ink-800 align-middle">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
