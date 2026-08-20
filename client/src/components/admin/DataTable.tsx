import { ReactNode } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';

export interface DataTableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  onRowClick?: (row: T) => void;
}

// Generic dense admin table (financial ledger, audit trail, fraud alerts,
// dispute queue, payout approvals) — horizontal dividers only, no vertical
// rules, per DESIGN.md "Data Tables/Lists" rule. UserTable stays a
// purpose-built component for the user-management screen; reach for this
// one for every new admin list.
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  emptyTitle = 'No records',
  emptyDescription,
  onRowClick,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className="rounded-ip-card border border-ip-outline/10 bg-ip-surface-container-lowest p-5">
        <Skeleton lines={5} className="h-5" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-ip-card border border-ip-outline/10 bg-ip-surface-container-lowest">
        <EmptyState title={emptyTitle} description={emptyDescription} />
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ip-card border border-ip-outline/10 bg-ip-surface-container-lowest">
      <table className="w-full text-sm">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className="px-5 py-3.5 text-left font-semibold text-xs uppercase tracking-wide text-ip-on-surface-variant"
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`border-t border-ip-outline/10 ${onRowClick ? 'cursor-pointer hover:bg-ip-surface-container' : ''}`}
            >
              {columns.map((col) => (
                <td key={col.key} className={`px-5 py-3.5 text-ip-on-surface ${col.className ?? ''}`}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
