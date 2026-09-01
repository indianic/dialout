'use client';

const LABELS: Record<string, { label: string; color: string }> = {
  working:          { label: 'Working',   color: 'var(--live)' },
  waiting_approval: { label: 'Needs you', color: 'var(--static)' },
  waiting_input:    { label: 'Waiting',   color: 'var(--accent)' },
  idle:             { label: 'Idle',      color: 'var(--dim)' },
};

export default function AiStatusDot({ status }: { status: string }) {
  const meta = LABELS[status] || LABELS.idle;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12,
                   color: 'var(--muted)', flexShrink: 0 }}>
      <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%',
                                 background: meta.color, flexShrink: 0 }} />
      {meta.label}
    </span>
  );
}
