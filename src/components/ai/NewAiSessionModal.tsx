'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Sparkles } from 'lucide-react';

// Trust levels, safest first. These mirror the agent's PERMISSION_MODES and
// the API's allowlist; all three validate independently, because a wrong
// string here would mean MORE permission than the user picked, not less.
const MODES: { value: string; label: string; hint: string }[] = [
  { value: 'plan',        label: 'Plan only',    hint: 'Reads and plans. Changes nothing.' },
  { value: 'default',     label: 'Normal',       hint: 'Asks in the terminal before risky steps.' },
  { value: 'acceptEdits', label: 'Auto-edit',    hint: 'Edits files without asking. Still asks for commands.' },
  { value: 'dontAsk',     label: "Don't ask",    hint: 'Runs without stopping. Use on work you can throw away.' },
];

export default function NewAiSessionModal({
  machineId,
  onClose,
}: {
  machineId: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [cwd, setCwd] = useState('');
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState('plan');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!cwd.trim() || !prompt.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/ai-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ machineId, cwd: cwd.trim(), prompt: prompt.trim(), permissionMode: mode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not start the session');
        return;
      }
      router.push(`/ai/${machineId}/${encodeURIComponent(data.id)}`);
    } catch {
      setError('Could not reach the server');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,.45)',
        display: 'grid', placeItems: 'center', padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{ width: '100%', maxWidth: 520, padding: 20, maxHeight: '90dvh', overflowY: 'auto' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <Sparkles size={18} style={{ color: 'var(--accent)' }} />
          <h2 className="font-display" style={{ flex: 1, fontSize: 18, color: 'var(--txt)' }}>
            New AI session
          </h2>
          <button className="btn-icon" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <label style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)', marginBottom: 6 }}>
          Folder on this machine
        </label>
        <input
          value={cwd}
          onChange={(e) => setCwd(e.target.value)}
          placeholder="/Users/you/www/my-project"
          spellCheck={false}
          autoCapitalize="off"
          style={{
            width: '100%', background: 'var(--bg-sub)', border: '1px solid var(--b1)',
            borderRadius: 10, padding: '11px 13px', color: 'var(--txt)', fontSize: 16,
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          }}
        />

        <label style={{
          display: 'block', fontSize: 12.5, color: 'var(--muted)', margin: '16px 0 6px',
        }}>
          What should it do?
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder="Find why the build is failing and fix it"
          style={{
            width: '100%', background: 'var(--bg-sub)', border: '1px solid var(--b1)',
            borderRadius: 10, padding: '11px 13px', color: 'var(--txt)', fontSize: 16,
            resize: 'vertical',
          }}
        />

        <fieldset style={{ border: 0, padding: 0, margin: '16px 0 0' }}>
          <legend style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 8 }}>
            How much should it be allowed to do?
          </legend>
          <div style={{ display: 'grid', gap: 6 }}>
            {MODES.map((m) => (
              <label
                key={m.value}
                style={{
                  display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer',
                  padding: '10px 12px', borderRadius: 10,
                  border: `1px solid ${mode === m.value ? 'var(--accent)' : 'var(--b1)'}`,
                  background: mode === m.value ? 'var(--accent-weak)' : 'transparent',
                }}
              >
                <input
                  type="radio"
                  name="permission-mode"
                  checked={mode === m.value}
                  onChange={() => setMode(m.value)}
                  style={{ marginTop: 3 }}
                />
                <span>
                  <span style={{ display: 'block', color: 'var(--txt)', fontSize: 14 }}>{m.label}</span>
                  <span style={{ display: 'block', color: 'var(--dim)', fontSize: 12, marginTop: 2 }}>
                    {m.hint}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* Said once, plainly, rather than discovered later: attach mode's
            ceiling applies here too — there are no Allow/Deny buttons. */}
        <p style={{ color: 'var(--dim)', fontSize: 12, lineHeight: 1.6, marginTop: 12 }}>
          This choice is made now and applies for the whole session. Dialout cannot ask you to
          approve individual steps from your phone.
        </p>

        {error && (
          <p style={{ color: 'var(--offline)', fontSize: 13, marginTop: 12 }}>{error}</p>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn-grad"
            onClick={submit}
            disabled={busy || !cwd.trim() || !prompt.trim()}
          >
            {busy ? 'Starting…' : 'Start session'}
          </button>
        </div>
      </div>
    </div>
  );
}
