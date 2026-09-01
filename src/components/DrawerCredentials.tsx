'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Plus, Trash2, Copy, Eye, EyeOff, Check } from 'lucide-react';
import { ProjectCredential } from '@/types';
import { useToast } from '@/components/Toast';

const ENVIRONMENTS = ['local', 'live'];
const KINDS = ['login', 'email', 'api', 'db', 'other'];

interface DrawerCredentialsProps {
  projectId: number;
  isOwner: boolean;
}

interface DraftState {
  environment: string; kind: string; label: string;
  backendUrl: string; username: string; secret: string;
}

const EMPTY: DraftState = { environment: 'local', kind: 'login', label: '', backendUrl: '', username: '', secret: '' };

// Only treat http(s) URLs as clickable — never render a javascript:/data: href
// (backendUrl is set by the owner but viewed by shared users → XSS vector).
function safeHttpUrl(url: string): string | null {
  try {
    const p = new URL(url);
    return (p.protocol === 'http:' || p.protocol === 'https:') ? url : null;
  } catch {
    return null;
  }
}

export default function DrawerCredentials({ projectId, isOwner }: DrawerCredentialsProps) {
  const { toast } = useToast();
  const [creds, setCreds] = useState<ProjectCredential[]>([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<DraftState>(EMPTY);
  const [revealed, setRevealed] = useState<Record<number, string>>({});
  const [copiedKey, setCopiedKey] = useState<string>('');
  const hideTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/projects/${projectId}/credentials`);
      if (r.ok) setCreds(await r.json());
    } catch {}
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  // Clear any pending auto-hide timers on unmount.
  useEffect(() => {
    return () => {
      Object.values(hideTimers.current).forEach(clearTimeout);
      hideTimers.current = {};
    };
  }, []);

  function clearHideTimer(credId: number) {
    const t = hideTimers.current[credId];
    if (t) {
      clearTimeout(t);
      delete hideTimers.current[credId];
    }
  }

  function hideRevealed(credId: number) {
    clearHideTimer(credId);
    setRevealed((m) => { const n = { ...m }; delete n[credId]; return n; });
  }

  async function reveal(credId: number): Promise<string | null> {
    if (revealed[credId] !== undefined) return revealed[credId];
    try {
      const r = await fetch(`/api/projects/${projectId}/credentials/${credId}/reveal`, { method: 'POST' });
      if (!r.ok) { toast('Could not reveal'); return null; }
      const { secret } = await r.json();
      setRevealed((m) => ({ ...m, [credId]: secret }));
      clearHideTimer(credId);
      hideTimers.current[credId] = setTimeout(() => {
        delete hideTimers.current[credId];
        setRevealed((m) => { const n = { ...m }; delete n[credId]; return n; });
      }, 30000);
      return secret;
    } catch { toast('Could not reveal'); return null; }
  }

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(''), 1200);
    } catch { toast('Copy failed'); }
  }

  async function copySecret(credId: number) {
    const s = await reveal(credId);
    if (s !== null) copy(s, `secret-${credId}`);
  }

  function toggleReveal(credId: number) {
    if (revealed[credId] !== undefined) {
      hideRevealed(credId);
    } else {
      reveal(credId);
    }
  }

  async function addCredential() {
    if (!draft.label && !draft.username && !draft.secret) { toast('Enter at least a label or username'); return; }
    try {
      const r = await fetch(`/api/projects/${projectId}/credentials`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft),
      });
      if (!r.ok) throw new Error();
      toast('Credential added');
      setDraft(EMPTY); setAdding(false); load();
    } catch { toast('Save failed'); }
  }

  async function remove(credId: number) {
    try {
      const r = await fetch(`/api/projects/${projectId}/credentials`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credentialId: credId }),
      });
      if (!r.ok) throw new Error();
      toast('Deleted'); load();
    } catch { toast('Delete failed'); }
  }

  function CopyBtn({ text, k }: { text: string; k: string }) {
    if (!text) return null;
    return (
      <button className="btn-icon" title="Copy" onClick={() => copy(text, k)}>
        {copiedKey === k ? <Check size={13} /> : <Copy size={13} />}
      </button>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[13px]" style={{ color: 'var(--muted)' }}>
          Encrypted at rest. {isOwner ? 'You and anyone this project is shared with' : 'Shared with you'} can reveal &amp; copy.
        </p>
        {isOwner && !adding && (
          <button className="btn-ghost" onClick={() => setAdding(true)}><Plus size={15} /> Add credential</button>
        )}
      </div>

      {adding && (
        <div className="glass rounded-xl p-4 mb-3 flex flex-col gap-2.5">
          <div className="grid grid-cols-2 gap-2.5">
            <select className="inp" value={draft.environment} onChange={(e) => setDraft({ ...draft, environment: e.target.value })}>
              {ENVIRONMENTS.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
            <select className="inp" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
              {KINDS.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
          <input className="inp" placeholder="Label (e.g. Admin panel)" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
          <input className="inp" placeholder="Backend / login URL" value={draft.backendUrl} onChange={(e) => setDraft({ ...draft, backendUrl: e.target.value })} />
          <input className="inp" placeholder="Username / email" value={draft.username} onChange={(e) => setDraft({ ...draft, username: e.target.value })} />
          <input className="inp" type="password" placeholder="Password / secret" value={draft.secret} onChange={(e) => setDraft({ ...draft, secret: e.target.value })} />
          <div className="flex gap-2 justify-end">
            <button className="btn-ghost" onClick={() => { setAdding(false); setDraft(EMPTY); }}>Cancel</button>
            <button className="btn-grad" onClick={addCredential}>Save</button>
          </div>
        </div>
      )}

      {creds.length === 0 && !adding && (
        <p className="text-[13px]" style={{ color: 'var(--dim)' }}>No credentials yet.</p>
      )}

      <div className="flex flex-col gap-2.5">
        {creds.map((c) => (
          <div key={c.id} className="glass rounded-xl p-3.5">
            <div className="flex items-center gap-2 mb-2">
              <span className={`status-chip ${c.environment === 'live' ? 'live' : 'static'}`}>{c.environment}</span>
              <span className="pill">{c.kind}</span>
              {c.label && <span className="text-[13px] font-semibold" style={{ color: 'var(--txt)' }}>{c.label}</span>}
              <span className="flex-1" />
              {isOwner && <button className="btn-icon danger" title="Delete" onClick={() => remove(c.id)}><Trash2 size={14} /></button>}
            </div>
            <div className="flex flex-col gap-1.5 font-mono text-[12px]" style={{ color: 'var(--muted)' }}>
              {c.backendUrl && (
                <div className="flex items-center gap-2">
                  <span style={{ minWidth: 70, color: 'var(--dim)' }}>URL</span>
                  {safeHttpUrl(c.backendUrl) ? (
                    <a href={safeHttpUrl(c.backendUrl)!} target="_blank" rel="noreferrer noopener" className="hover:underline truncate" style={{ color: 'var(--accent)' }}>{c.backendUrl}</a>
                  ) : (
                    <span className="truncate" style={{ color: 'var(--txt)' }}>{c.backendUrl}</span>
                  )}
                  <CopyBtn text={c.backendUrl} k={`url-${c.id}`} />
                </div>
              )}
              {c.username && (
                <div className="flex items-center gap-2">
                  <span style={{ minWidth: 70, color: 'var(--dim)' }}>User</span>
                  <span className="truncate" style={{ color: 'var(--txt)' }}>{c.username}</span>
                  <CopyBtn text={c.username} k={`user-${c.id}`} />
                </div>
              )}
              {c.hasSecret && (
                <div className="flex items-center gap-2">
                  <span style={{ minWidth: 70, color: 'var(--dim)' }}>Secret</span>
                  <span className="truncate" style={{ color: 'var(--txt)' }}>
                    {revealed[c.id] !== undefined ? (revealed[c.id] || '(empty)') : '••••••••'}
                  </span>
                  <button className="btn-icon" title={revealed[c.id] !== undefined ? 'Hide' : 'Reveal'} onClick={() => toggleReveal(c.id)}>
                    {revealed[c.id] !== undefined ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                  <button className="btn-icon" title="Copy secret" onClick={() => copySecret(c.id)}>
                    {copiedKey === `secret-${c.id}` ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
