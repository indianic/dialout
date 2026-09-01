'use client';

import { useEffect, useState } from 'react';
import { Play } from 'lucide-react';

interface RunCommandModalProps {
  open: boolean;
  action: 'start' | 'stop' | 'restart';
  projectName: string;
  onClose: () => void;
  onSubmit: (command: string, opts: { background: boolean; save: boolean }) => void;
}

const PLACEHOLDER: Record<string, string> = {
  start: 'npm run dev',
  stop: 'pm2 stop app',
  restart: 'pm2 restart app',
};

export default function RunCommandModal({ open, action, projectName, onClose, onSubmit }: RunCommandModalProps) {
  const [command, setCommand] = useState('');
  const [background, setBackground] = useState(true);
  const [save, setSave] = useState(true);

  useEffect(() => { if (open) { setCommand(''); setBackground(true); setSave(true); } }, [open, action]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const title = action.charAt(0).toUpperCase() + action.slice(1);

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 460 }}>
        <div style={{ padding: '24px 26px' }}>
          <h2 className="font-display" style={{ fontSize: 20, color: 'var(--txt)' }}>{title} “{projectName}”</h2>
          <p className="mt-1" style={{ fontSize: 12.5, color: 'var(--muted)' }}>No {action} command is saved for this project. Enter one to run now.</p>

          <label className="label mt-4">{title.toUpperCase()} COMMAND</label>
          <input autoFocus className="inp" value={command} onChange={(e) => setCommand(e.target.value)} placeholder={PLACEHOLDER[action]} />

          {action === 'start' && (
            <label className="flex items-center gap-2 mt-3" style={{ fontSize: 12.5, color: 'var(--muted)' }}>
              <input type="checkbox" checked={background} onChange={(e) => setBackground(e.target.checked)} />
              Run in the background
            </label>
          )}
          <label className="flex items-center gap-2 mt-2" style={{ fontSize: 12.5, color: 'var(--muted)' }}>
            <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} />
            Save this command to the project
          </label>

          <div className="flex gap-2.5 justify-end mt-6">
            <button className="btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn-grad" disabled={!command.trim()}
              onClick={() => onSubmit(command.trim(), { background, save })}>
              <Play size={15} /> {title}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
