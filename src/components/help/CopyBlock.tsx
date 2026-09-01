'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

// A command block that is actually copyable. Docs that print a command and
// leave you to select it by hand are the single most annoying thing about
// setup guides on a phone, where dragging a text selection across three lines
// of monospace is close to impossible.
export default function CopyBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      // Comment lines are documentation, not input — copying them means the
      // user pastes a "# or, better on a server:" line into their shell.
      const runnable = code
        .split('\n')
        .map((line) => line.replace(/\s+#\s.*$/, '').trimEnd())
        .filter((line) => line.trim() && !line.trim().startsWith('#'))
        .join('\n');
      await navigator.clipboard.writeText(runnable);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard is blocked outside a secure context; the text is on screen
      // and selectable, so there is nothing useful to say here.
    }
  };

  return (
    <div className="copy-block">
      <div className="copy-block-bar">
        <span className="copy-block-label">{label || 'Terminal'}</span>
        <button onClick={copy} className="copy-block-btn" aria-label={copied ? 'Copied' : 'Copy to clipboard'}>
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="copy-block-code">
        <code>{code}</code>
      </pre>

      <style jsx>{`
        .copy-block {
          margin-top: 16px;
          border: 1px solid var(--b1);
          border-radius: var(--r);
          background: var(--bg-sub);
          overflow: hidden;
        }
        .copy-block-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 7px 8px 7px 14px;
          border-bottom: 1px solid var(--b1);
        }
        .copy-block-label {
          font-family: 'JetBrains Mono', monospace;
          font-size: 10.5px;
          letter-spacing: .06em;
          text-transform: uppercase;
          color: var(--dim);
        }
        .copy-block-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 5px 10px;
          border-radius: 999px;
          font-size: 12px;
          color: var(--muted);
          transition: color .15s, background .15s;
        }
        .copy-block-btn:hover { color: var(--txt); background: var(--glass); }
        /* Wide commands scroll inside the block; the page itself must never
           scroll sideways because of one long npm line. */
        .copy-block-code {
          margin: 0;
          padding: 14px;
          overflow-x: auto;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 12.5px;
          line-height: 1.75;
          color: var(--txt);
          white-space: pre;
        }
      `}</style>
    </div>
  );
}
