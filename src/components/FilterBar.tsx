'use client';

export type FilterType = 'all' | 'live' | 'offline' | 'archived' | 'services' | 'shared' | 'machines';

interface FilterBarProps {
  search: string;
  onSearchChange: (v: string) => void;
  filter: FilterType;
  onFilterChange: (f: FilterType) => void;
  runnerFilter: string;
  onRunnerChange: (v: string) => void;
  lastRefresh: string;
  searchRef: React.RefObject<HTMLInputElement | null>;
  serviceCount: number;
  sharedCount: number;
}

const FILTERS: { key: FilterType; label: string; short: string }[] = [
  { key: 'all', label: 'ALL', short: 'ALL' },
  { key: 'live', label: '\u25CF LIVE', short: '\u25CF' },
  { key: 'offline', label: '\u25CB OFFLINE', short: '\u25CB' },
  { key: 'archived', label: '\u25A3 ARCHIVED', short: '\u25A3' },
  { key: 'services', label: '\u2699 SERVICES', short: '\u2699' },
  { key: 'shared', label: '\u2194 SHARED', short: '\u2194' },
  { key: 'machines', label: '\u2699 MACHINES', short: '\u2699' },
];

const RUNNERS = ['', 'npm', 'pm2', 'yarn', 'php', 'docker', 'python', 'custom'];

export default function FilterBar({
  search, onSearchChange, filter, onFilterChange,
  runnerFilter, onRunnerChange, lastRefresh, searchRef, serviceCount, sharedCount,
}: FilterBarProps) {
  const isServices = filter === 'services';
  const isShared = filter === 'shared';

  return (
    <div className="sticky z-[39]" style={{ top: 61, borderBottom: '1px solid var(--b1)', background: 'var(--bg-sub)' }}>
      <div className="max-w-screen-xl mx-auto px-4 sm:px-5 py-2 flex items-center gap-2 sm:gap-3 flex-wrap">

        {/* Search */}
        {!isServices && !isShared && (
          <>
            <div className="flex items-center gap-2 flex-1" style={{ minWidth: 120 }}>
              <span className="font-mono" style={{ color: 'var(--muted)', fontSize: 13 }}>&#8981;</span>
              <input
                ref={searchRef}
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                className="bg-transparent font-mono outline-none flex-1"
                style={{ fontSize: 11, color: 'var(--txt)', letterSpacing: '.03em' }}
              />
              <span className="kbd">&#8984;K</span>
            </div>

            <div className="hidden sm:block" style={{ width: 1, height: 14, background: 'var(--b1)' }} />
          </>
        )}

        {/* Filter tabs */}
        <div className="flex gap-0.5">
          {FILTERS.map(({ key, label, short }) => (
            <button
              key={key}
              className={`ftab ${filter === key ? 'on' : ''}`}
              onClick={() => onFilterChange(key)}
            >
              <span className="hidden sm:inline">
                {key === 'services' ? `${label} (${serviceCount})` : key === 'shared' ? `${label} (${sharedCount})` : label}
              </span>
              <span className="sm:hidden">{short}</span>
            </button>
          ))}
        </div>

        {/* Runner filter + timestamp — hide on services tab */}
        {!isServices && !isShared && (
          <>
            <div className="hidden sm:block" style={{ width: 1, height: 14, background: 'var(--b1)' }} />

            <select
              value={runnerFilter}
              onChange={(e) => onRunnerChange(e.target.value)}
              className="inp hidden sm:block"
              style={{ width: 'auto', padding: '4px 8px', fontSize: 10, borderColor: 'transparent', background: 'transparent', color: 'var(--muted)' }}
            >
              {RUNNERS.map((r) => (
                <option key={r} value={r}>{r ? r.toUpperCase() : 'ALL RUNNERS'}</option>
              ))}
            </select>

            <div className="font-mono ml-auto hidden sm:block" style={{ fontSize: 9, color: 'var(--muted)' }}>
              {lastRefresh}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
