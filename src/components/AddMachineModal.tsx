'use client';

import { useEffect, useRef, useState } from 'react';
import { MonitorSmartphone, Plus } from 'lucide-react';

interface AddMachineModalProps {
  open: boolean;
  existingNames: string[];
  onClose: () => void;
  onAdd: (name: string) => Promise<void>;
}

export default function AddMachineModal({ open, existingNames, onClose, onAdd }: AddMachineModalProps) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName('');
    setSaving(false);
    // Focus after paint — the input does not exist until this render commits.
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); document.removeEventListener('keydown', onKey); };
  }, [open, onClose]);

  if (!open) return null;

  const trimmed = name.trim();
  // Case-insensitive: two machines called "Laptop" and "laptop" are the same
  // machine to a human, and the name is what every machine picker shows.
  const duplicate = existingNames.some((n) => n.toLowerCase() === trimmed.toLowerCase());
  const canSave = trimmed.length > 0 && !duplicate && !saving;

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onAdd(trimmed);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 440 }}>
        <div style={{ padding: '28px 28px 24px' }}>
          <span className="grid place-items-center rounded-2xl mb-4" style={{ width: 48, height: 48, background: 'var(--grad-soft)', border: '1px solid var(--glass-border)', color: 'var(--accent)' }}>
            <MonitorSmartphone size={22} />
          </span>
          <h2 className="font-display" style={{ fontSize: 22, color: 'var(--txt)' }}>Add a machine</h2>
          <p className="mt-1.5" style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6 }}>
            A machine is one computer you work on — your laptop, a desktop, or a server.
            Projects, terminals, and API keys all belong to a machine.
          </p>

          <label htmlFor="machine-name" className="block mt-5 mb-1.5" style={{ fontSize: 12, color: 'var(--muted)' }}>
            Machine name
          </label>
          <input
            id="machine-name"
            ref={inputRef}
            className="inp"
            value={name}
            maxLength={60}
            placeholder="MacBook Pro, Office Desktop, build-box…"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          />
          {duplicate && (
            <p className="mt-1.5" style={{ fontSize: 11.5, color: 'var(--offline)' }}>
              You already have a machine called “{trimmed}”.
            </p>
          )}

          <p className="mt-3" style={{ fontSize: 11.5, color: 'var(--dim)', lineHeight: 1.6 }}>
            After adding it, generate an API key for this machine and run{' '}
            <code style={{ background: 'var(--glass)', padding: '1px 5px', borderRadius: 4 }}>dialout init</code>{' '}
            on the machine itself to connect it.
          </p>

          <div className="flex gap-2.5 justify-end mt-6">
            <button className="btn-ghost" onClick={onClose} style={{ minWidth: 100 }}>Cancel</button>
            <button className="btn-grad" onClick={submit} disabled={!canSave} style={{ minWidth: 130, opacity: canSave ? 1 : 0.5 }}>
              <Plus size={16} /> {saving ? 'Adding…' : 'Add machine'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
