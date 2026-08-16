import { ChevronLeftIcon, ChevronRightIcon } from '@/components/ui/icons';

interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}

// Admin tables (Users, and anything else that outgrows a single page) —
// listUsers already returns {total, page, limit} server-side, this was the
// missing UI half; before this, anything past the first `limit` rows was
// simply unreachable.
export function Pagination({ page, totalPages, onChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  // Compact window: first, last, current +/-1, with ellipsis gaps.
  const pages = new Set<number>([1, totalPages, page, Math.max(1, page - 1), Math.min(totalPages, page + 1)]);
  const sorted = Array.from(pages).sort((a, b) => a - b);

  return (
    <nav aria-label="Pagination" className="flex items-center justify-center gap-1.5 mt-6">
      <button
        type="button"
        aria-label="Previous page"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className="w-9 h-9 flex items-center justify-center rounded-lg border border-border bg-surface-raised text-text-muted hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-fast"
      >
        <ChevronLeftIcon className="w-4 h-4" />
      </button>

      {sorted.map((p, i) => (
        <span key={p} className="flex items-center gap-1.5">
          {i > 0 && sorted[i - 1] !== p - 1 && <span className="w-4 text-center text-text-muted text-sm">…</span>}
          <button
            type="button"
            aria-current={p === page ? 'page' : undefined}
            onClick={() => onChange(p)}
            className={`w-9 h-9 rounded-lg text-sm font-semibold transition-all duration-fast ${
              p === page
                ? 'bg-primary-600 text-white shadow-md'
                : 'border border-border bg-surface-raised text-text-primary hover:bg-surface'
            }`}
          >
            {p}
          </button>
        </span>
      ))}

      <button
        type="button"
        aria-label="Next page"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        className="w-9 h-9 flex items-center justify-center rounded-lg border border-border bg-surface-raised text-text-muted hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-fast"
      >
        <ChevronRightIcon className="w-4 h-4" />
      </button>
    </nav>
  );
}
