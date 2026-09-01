'use client';

import { FolderPlus, Plus } from 'lucide-react';

interface EmptyStateProps {
  onAdd: () => void;
}

export default function EmptyState({ onAdd }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <span className="grid place-items-center rounded-2xl mb-5" style={{ width: 60, height: 60, background: 'var(--grad-soft)', border: '1px solid var(--glass-border)', color: 'var(--accent)' }}>
        <FolderPlus size={30} />
      </span>
      <div className="font-display" style={{ fontSize: 26, color: 'var(--txt)' }}>No projects yet</div>
      <p className="text-[13.5px] mt-2 mb-6" style={{ color: 'var(--muted)', maxWidth: '40ch' }}>
        Scan your local ports to detect running apps, or add a project by hand.
      </p>
      <button className="btn-grad" onClick={onAdd}><Plus size={17} /> Add your first project</button>
    </div>
  );
}
