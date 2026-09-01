'use client';

import { useEffect } from 'react';
import { Trash2 } from 'lucide-react';

interface DeleteModalProps {
  open: boolean;
  projectName: string;
  onClose: () => void;
  onConfirm: () => void;
}

export default function DeleteModal({ open, projectName, onClose, onConfirm }: DeleteModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 400 }}>
        <div style={{ padding: '30px 28px', textAlign: 'center' }}>
          <span className="grid place-items-center mx-auto rounded-2xl mb-4" style={{ width: 52, height: 52, background: 'rgba(244,63,94,.14)', border: '1px solid rgba(244,63,94,.3)', color: 'var(--offline)' }}>
            <Trash2 size={24} />
          </span>
          <h2 className="font-display" style={{ fontSize: 22, color: 'var(--txt)' }}>Delete project?</h2>
          <p className="mt-1 font-medium" style={{ fontSize: 14, color: 'var(--txt)' }}>{projectName}</p>
          <p className="mt-1.5" style={{ fontSize: 12.5, color: 'var(--muted)' }}>This permanently removes the project and its notes & todos.</p>
          <div className="flex gap-2.5 justify-center mt-7">
            <button className="btn-ghost" onClick={onClose} style={{ minWidth: 110 }}>Cancel</button>
            <button className="btn-solid btn-red" onClick={onConfirm} style={{ minWidth: 110 }}><Trash2 size={16} /> Delete</button>
          </div>
        </div>
      </div>
    </div>
  );
}
