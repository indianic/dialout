'use client';

import { useState } from 'react';
import { Plus, Minus } from 'lucide-react';

/**
 * Native disclosure semantics via a button + region rather than <details>,
 * because the open row needs a controlled icon and <details> markers vary
 * between browsers. One row open at a time keeps the list scannable.
 */
export default function Faq({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div>
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.q} style={{ borderTop: '1px solid var(--b1)' }}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : i)}
              aria-expanded={isOpen}
              aria-controls={`faq-panel-${i}`}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 16,
                justifyContent: 'space-between', textAlign: 'left',
                background: 'none', border: 0, cursor: 'pointer',
                padding: '18px 0', color: 'var(--txt)',
                fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
                fontSize: 16, fontWeight: 600, letterSpacing: '-.012em',
              }}
            >
              {item.q}
              <span style={{ color: 'var(--dim)', flexShrink: 0, display: 'inline-flex' }}>
                {isOpen ? <Minus size={17} /> : <Plus size={17} />}
              </span>
            </button>
            {isOpen ? (
              <div id={`faq-panel-${i}`} className="mk-body" style={{ paddingBottom: 20, maxWidth: 720 }}>
                {item.a}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
