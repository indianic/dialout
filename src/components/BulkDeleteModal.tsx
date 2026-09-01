'use client';

import { useEffect } from 'react';
import { Trash2 } from 'lucide-react';

interface BulkDeleteModalProps {
  open: boolean;
  names: string[];
  onClose: () => void;
  onConfirm: () => void;
}

export default function BulkDeleteModal({ open, names, onClose, onConfirm }: BulkDeleteModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const count = names.length;

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 420 }}>
        <div style={{ padding: '30px 28px', textAlign: 'center' }}>
          <span className="grid place-items-center mx-auto rounded-2xl mb-4" style={{ width: 52, height: 52, background: 'rgba(244,63,94,.14)', border: '1px solid rgba(244,63,94,.3)', color: 'var(--offline)' }}>
            <Trash2 size={24} />
          </span>
          <h2 className="font-display" style={{ fontSize: 22, color: 'var(--txt)' }}>
            Delete {count} project{count === 1 ? '' : 's'}?
          </h2>
          <div className="mt-3 mx-auto text-left" style={{ maxWidth: 320, maxHeight: 150, overflowY: 'auto', borderRadius: 10, border: '1px solid var(--b1)', padding: '8px 12px' }}>
            {names.map((n, i) => (
              <span key={i} style={{ display: 'block', fontSize: 12.5, color: 'var(--txt)', lineHeight: 1.7 }}>{n}</span>
            ))}
          </div>
          <p className="mt-3" style={{ fontSize: 12.5, color: 'var(--muted)' }}>This permanently removes them and their notes &amp; todos.</p>
          <div className="flex gap-2.5 justify-center mt-6">
            <button className="btn-ghost" onClick={onClose} style={{ minWidth: 110 }}>Cancel</button>
            <button className="btn-solid btn-red" onClick={onConfirm} style={{ minWidth: 110 }}><Trash2 size={16} /> Delete {count}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
