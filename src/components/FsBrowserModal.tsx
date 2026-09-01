'use client';

import { useState, useCallback } from 'react';
import { Folder, CornerLeftUp, FolderOpen, Check } from 'lucide-react';

interface FsBrowserModalProps {
  open: boolean;
  machineId: number;
  currentPath?: string;
  onSelect: (path: string) => void;
  onClose: () => void;
}

interface DirEntry {
  name: string;
  type: 'directory' | 'file';
}

export default function FsBrowserModal({ open, machineId, currentPath, onSelect, onClose }: FsBrowserModalProps) {
  const [path, setPath] = useState(currentPath || '/');
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const browse = useCallback(async (dirPath: string) => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/browse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ machineId, path: dirPath }),
      });
      if (!r.ok) {
        const data = await r.json();
        setError(data.error || 'Failed to browse');
        setEntries([]);
      } else {
        const data = await r.json();
        setEntries(data.entries || []);
        setPath(dirPath);
      }
    } catch {
      setError('Connection failed');
    }
    setLoading(false);
  }, [machineId]);

  // Load on first open
  const [loaded, setLoaded] = useState(false);
  if (open && !loaded) {
    setLoaded(true);
    browse(currentPath || '/');
  }
  if (!open && loaded) {
    setLoaded(false);
  }

  if (!open) return null;

  const parentPath = path === '/' ? null : path.split('/').slice(0, -1).join('/') || '/';
  const dirs = entries.filter((e) => e.type === 'directory');

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()} style={{ zIndex: 60 }}>
      <div className="modal-box mx-3" style={{ maxWidth: 500, maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '14px 22px', borderBottom: '1px solid var(--b1)' }}>
          <div className="label flex items-center gap-1.5" style={{ marginBottom: 6 }}>
            <FolderOpen size={14} style={{ color: 'var(--muted)' }} />
            Select project directory
          </div>
          <div className="font-mono text-xs break-all" style={{ color: 'var(--accent)' }}>
            {path}
          </div>
        </div>

        {/* Directory listing */}
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
          {error && (
            <div className="px-5 py-3 text-sm" style={{ color: 'var(--offline)' }}>{error}</div>
          )}

          {loading && (
            <div className="px-5 py-3 text-sm" style={{ color: 'var(--dim)' }}>Loading...</div>
          )}

          {!loading && !error && (
            <>
              {parentPath !== null && (
                <button
                  onClick={() => browse(parentPath)}
                  className="w-full text-left px-5 py-2 text-sm hover:bg-[var(--b1)] flex items-center gap-2.5"
                  style={{ color: 'var(--muted)' }}
                >
                  <CornerLeftUp size={15} />
                  <span>..</span>
                </button>
              )}

              {dirs.map((entry) => (
                <button
                  key={entry.name}
                  onClick={() => browse(path === '/' ? `/${entry.name}` : `${path}/${entry.name}`)}
                  className="w-full text-left px-5 py-2 text-sm hover:bg-[var(--b1)] flex items-center gap-2.5"
                  style={{ color: 'var(--txt)' }}
                >
                  <Folder size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  <span className="truncate">{entry.name}</span>
                </button>
              ))}

              {dirs.length === 0 && !loading && (
                <div className="px-5 py-3 text-sm" style={{ color: 'var(--dim)' }}>
                  No subdirectories
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between" style={{ padding: '14px 22px', borderTop: '1px solid var(--b1)' }}>
          <button onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button
            onClick={() => { onSelect(path); onClose(); }}
            className="btn-grad flex items-center gap-1.5"
          >
            <Check size={15} />
            Select This Directory
          </button>
        </div>
      </div>
    </div>
  );
}
