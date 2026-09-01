'use client';

import { ReactNode } from 'react';

export default function PageHeader({ title, subtitle, icon, actions }: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
      <div className="flex items-center gap-3">
        {icon && (
          <span className="grid place-items-center rounded-xl shrink-0" style={{ width: 42, height: 42, background: 'var(--grad-soft)', border: '1px solid var(--glass-border)', color: 'var(--accent)' }}>
            {icon}
          </span>
        )}
        <div>
          <h1 className="font-display" style={{ fontSize: 26, lineHeight: 1.1, color: 'var(--txt)' }}>{title}</h1>
          {subtitle && <p className="text-[13px] mt-0.5" style={{ color: 'var(--muted)' }}>{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}
