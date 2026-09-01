'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  total: number;
  page: number;
  perPage: number;
  onPageChange: (page: number) => void;
  onPerPageChange: (perPage: number) => void;
}

const PER_PAGE_OPTIONS = [15, 30, 60, 90, 0]; // 0 = All

export default function Pagination({ total, page, perPage, onPageChange, onPerPageChange }: PaginationProps) {
  if (total < 15) return null;

  const totalPages = perPage === 0 ? 1 : Math.ceil(total / perPage);
  const start = perPage === 0 ? 1 : page * perPage + 1;
  const end = perPage === 0 ? total : Math.min((page + 1) * perPage, total);

  return (
    <div className="flex items-center justify-between flex-wrap gap-2 py-2">
      {/* Left: showing info */}
      <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
        <span className="font-mono tnum">{start}&ndash;{end}</span> of <span className="font-mono tnum">{total}</span>
      </div>

      {/* Center: page buttons */}
      <div className="flex items-center gap-1">
        {totalPages > 1 && (
          <>
            <button
              className="btn-icon"
              disabled={page === 0}
              onClick={() => onPageChange(page - 1)}
              title="Previous page"
              aria-label="Previous page"
              style={{ opacity: page === 0 ? 0.3 : 1 }}
            >
              <ChevronLeft size={16} />
            </button>
            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i}
                className="font-mono tnum"
                onClick={() => onPageChange(i)}
                aria-label={`Page ${i + 1}`}
                aria-current={i === page ? 'page' : undefined}
                style={{
                  minWidth: 30, padding: '4px 8px', fontSize: 12.5, cursor: 'pointer',
                  borderRadius: 'var(--r-sm)',
                  background: i === page ? 'var(--grad)' : 'transparent',
                  color: i === page ? '#fff' : 'var(--muted)',
                  border: `1px solid ${i === page ? 'transparent' : 'var(--b2)'}`,
                  fontWeight: i === page ? 700 : 400,
                  transition: 'all .12s',
                }}
              >
                {i + 1}
              </button>
            )).slice(
              // Show max 7 page buttons centered on current page
              Math.max(0, Math.min(page - 3, totalPages - 7)),
              Math.max(7, Math.min(page + 4, totalPages))
            )}
            <button
              className="btn-icon"
              disabled={page >= totalPages - 1}
              onClick={() => onPageChange(page + 1)}
              title="Next page"
              aria-label="Next page"
              style={{ opacity: page >= totalPages - 1 ? 0.3 : 1 }}
            >
              <ChevronRight size={16} />
            </button>
          </>
        )}
      </div>

      {/* Right: per-page selector */}
      <div className="flex items-center gap-2">
        <span className="label" style={{ margin: 0 }}>Show</span>
        <select
          value={perPage}
          onChange={(e) => { onPerPageChange(parseInt(e.target.value)); onPageChange(0); }}
          className="inp"
          style={{ width: 'auto', padding: '4px 8px', fontSize: 12.5 }}
        >
          {PER_PAGE_OPTIONS.map((n) => (
            <option key={n} value={n}>{n === 0 ? 'All' : n}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
