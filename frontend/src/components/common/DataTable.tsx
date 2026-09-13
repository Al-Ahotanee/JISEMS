/* Quiet Atlas: evidence-led tables with a cloud surface and restrained geographic-blue hierarchy. */
import { ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Inbox } from 'lucide-react';

export interface Column<T> {
  key: string;
  label: string;
  render?: (row: T, index: number) => ReactNode;
}

interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  perPage: number;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
  pagination?: PaginationInfo;
  onPageChange?: (page: number) => void;
  rowKey?: (row: T, index: number) => string | number;
}

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="table-cell">
          <div className="h-4 bg-dark-surface-3 rounded animate-pulse w-3/4" />
        </td>
      ))}
    </tr>
  );
}

function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  loading = false,
  emptyMessage = 'No data found',
  pagination,
  onPageChange,
  rowKey,
}: DataTableProps<T>) {
  const renderPageNumbers = () => {
    if (!pagination) return null;
    const { currentPage, totalPages } = pagination;
    const pages: (number | string)[] = [];

    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('...');

      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);

      if (currentPage < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }

    return pages.map((p, idx) => {
      if (p === '...') {
        return (
          <span key={`ellipsis-${idx}`} className="px-2 py-1 text-text-muted text-sm">
            …
          </span>
        );
      }
      const pageNum = p as number;
      return (
        <button
          key={pageNum}
          onClick={() => onPageChange?.(pageNum)}
          className={`min-w-[32px] h-8 flex items-center justify-center rounded-lg text-sm font-medium transition-colors ${
            pageNum === currentPage
              ? 'bg-primary-500 text-white'
              : 'text-text-muted hover:text-text-primary hover:bg-dark-surface-2'
          }`}
        >
          {pageNum}
        </button>
      );
    });
  };

  return (
    <div className="glass-card overflow-hidden border-dark-border">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="bg-primary-50/65">
              {columns.map((col) => (
                <th key={col.key} className="table-header">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <SkeletonRow key={`skeleton-${i}`} cols={columns.length} />
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-16">
                  <div className="flex flex-col items-center justify-center text-text-muted">
                    <Inbox className="w-12 h-12 mb-3 opacity-40" />
                    <p className="text-sm">{emptyMessage}</p>
                  </div>
                </td>
              </tr>
            ) : (
              data.map((row, idx) => (
                <tr
                  key={rowKey ? rowKey(row, idx) : idx}
                  className="hover:bg-primary-50/45 transition-colors duration-150"
                >
                  {columns.map((col) => (
                    <td key={col.key} className="table-cell">
                      {col.render
                        ? col.render(row, idx)
                        : (row[col.key] as ReactNode) ?? '—'}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-dark-border">
          <p className="text-xs text-text-muted hidden sm:block">
            Showing{' '}
            <span className="font-mono font-medium text-text-secondary">
              {(pagination.currentPage - 1) * pagination.perPage + 1}
            </span>
            –
            <span className="font-mono font-medium text-text-secondary">
              {Math.min(pagination.currentPage * pagination.perPage, pagination.totalItems)}
            </span>{' '}
            of{' '}
            <span className="font-mono font-medium text-text-secondary">
              {pagination.totalItems}
            </span>
          </p>

          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange?.(pagination.currentPage - 1)}
              disabled={pagination.currentPage <= 1}
              className="p-1.5 rounded-lg text-text-muted hover:text-primary-700 hover:bg-primary-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {renderPageNumbers()}

            <button
              onClick={() => onPageChange?.(pagination.currentPage + 1)}
              disabled={pagination.currentPage >= pagination.totalPages}
              className="p-1.5 rounded-lg text-text-muted hover:text-primary-700 hover:bg-primary-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default DataTable;
