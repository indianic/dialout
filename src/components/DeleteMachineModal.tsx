'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';

/**
 * Deleting a machine is not deleting a project.
 *
 * It takes every project registered to that machine with it, and everything
 * hanging off those projects: notes, todos, quick-launch commands, stored
 * credentials, shares and their comments, plus every terminal session and its
 * recorded output. None of that is recoverable and none of it is visible from
 * this screen, so the modal lists it rather than saying "and its related data".
 *
 * The name has to be typed. A red button one click away is the right weight for
 * a project — a wrong click there loses one row you can re-add in a minute. It
 * is the wrong weight for this, where the same slip costs a machine's entire
 * history. Typing the name is the cheapest thing that converts a reflex into a
 * decision.
 */
export default function DeleteMachineModal({
  open, machineName, onClose, onConfirm,
}: {
  open: boolean;
  machineName: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setTyped(''); setBusy(false); }
  }, [open, machineName]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, busy]);

  if (!open) return null;

  const matches = typed.trim() === machineName.trim();

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal-box" style={{ maxWidth: 460 }}>
        <div style={{ padding: '28px 28px 26px' }}>
          <div className="flex items-start gap-3.5" style={{ marginBottom: 18 }}>
            <span
              className="grid place-items-center rounded-2xl"
              style={{
                width: 46, height: 46, flexShrink: 0,
                background: 'rgba(244,63,94,.14)',
                border: '1px solid rgba(244,63,94,.3)',
                color: 'var(--offline)',
              }}
            >
              <AlertTriangle size={22} />
            </span>
            <div style={{ minWidth: 0 }}>
              <h2 className="font-display" style={{ fontSize: 20, color: 'var(--txt)', lineHeight: 1.25 }}>
                Delete this machine?
              </h2>
              <p className="font-mono" style={{ fontSize: 13, color: 'var(--txt)', marginTop: 5, wordBreak: 'break-word' }}>
                {machineName}
              </p>
            </div>
          </div>

          <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.65, marginBottom: 12 }}>
            This permanently deletes the machine and everything belonging to it:
          </p>

          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 18px', fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.9 }}>
            {[
              'Every project registered to it, with its notes, todos and quick-launch commands',
              'Stored credentials for those projects',
              'Shares with teammates, and their comments',
              'Every terminal session and its recorded output',
              'Tracked services and the agent API key',
            ].map((line) => (
              <li key={line} style={{ display: 'flex', gap: 9 }}>
                <span aria-hidden="true" style={{ color: 'var(--offline)', flexShrink: 0 }}>•</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>

          <p style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 8 }}>
            Type <strong className="font-mono" style={{ color: 'var(--txt)' }}>{machineName}</strong> to confirm.
          </p>
          <input
            className="inp font-mono"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={machineName}
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
            aria-label={`Type ${machineName} to confirm deletion`}
          />

          <div className="flex gap-2.5 justify-end" style={{ marginTop: 22 }}>
            <button className="btn-ghost" onClick={onClose} disabled={busy} style={{ minWidth: 100 }}>
              Cancel
            </button>
            <button
              className="btn-solid btn-red"
              disabled={!matches || busy}
              style={{ minWidth: 150, opacity: matches && !busy ? 1 : 0.5, cursor: matches && !busy ? 'pointer' : 'not-allowed' }}
              onClick={async () => {
                if (!matches || busy) return;
                setBusy(true);
                try { await onConfirm(); } finally { setBusy(false); }
              }}
            >
              {busy ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />}
              {busy ? 'Deleting…' : 'Delete machine'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
