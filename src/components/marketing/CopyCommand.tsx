'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

/**
 * A copyable shell command. The label says exactly what the button does and
 * stays consistent through the interaction — "Copy" becomes "Copied", not
 * "Success" — so the control names the same action before and after.
 */
export default function CopyCommand({ command, note }: { command: string; note?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard is blocked without a user gesture in some browsers and over
      // plain HTTP. The command is selectable text either way, so there is
      // nothing to recover from and nothing worth interrupting the reader for.
    }
  }

  return (
    <div className="mk-dark" style={{ borderRadius: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px' }}>
        <code
          className="mk-term"
          style={{ padding: 0, flex: 1, fontSize: 13, lineHeight: 1.6, overflowX: 'auto' }}
        >
          <span className="mk-term-dim">$ </span>
          <span className="mk-term-cmd">{command}</span>
        </code>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? 'Copied' : `Copy: ${command}`}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(255,255,255,.07)',
            border: '1px solid rgba(255,255,255,.12)',
            color: copied ? '#3ddc84' : '#d6dae3',
            borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', flexShrink: 0,
          }}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {note ? (
        <div
          style={{
            padding: '9px 14px', borderTop: '1px solid rgba(255,255,255,.09)',
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 11.5, color: 'rgba(214,218,227,.5)',
          }}
        >
          {note}
        </div>
      ) : null}
    </div>
  );
}
