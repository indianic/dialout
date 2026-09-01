'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Eye, Play, TerminalSquare, X, FolderOpen } from 'lucide-react';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { useToast } from '@/components/Toast';
import { renderTerminalName, factsFromSession, DEFAULT_TERMINAL_TEMPLATE } from '@/lib/terminal-name';
import type { LiveTerminalSession } from '@/types';

const POLL_MS = 10_000;

type TabKey = 'local' | 'web';
const TAB_STORAGE_KEY = 'devdash-terminals-tab';

// $TERM_PROGRAM → friendly badge (spec §7). New clients need no code change —
// unknown values render as-is.
const CLIENT_LABELS: Record<string, string> = {
  Apple_Terminal: 'Terminal',
  'iTerm.app': 'iTerm2',
  vscode: 'VS Code',
  Hyper: 'Hyper',
  WezTerm: 'WezTerm',
  // 'DevDash' is the value agents already in the field write into tmux's
  // @term_program. It is a wire value, not a label, so it stays — renaming it
  // here would make every existing agent's sessions fall back to the raw
  // string. Both keys map to the current brand name.
  DevDash: 'Dialout',
  Dialout: 'Dialout',
  unknown: '—',
};

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function TerminalsPage() {
  const router = useRouter();
  const { session } = useDashboard();
  const { toast } = useToast();
  const [sessions, setSessions] = useState<LiveTerminalSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissing, setDismissing] = useState<Set<number>>(new Set());
  const [tab, setTab] = useState<TabKey>('local');

  // Restored after mount, not in the initial state: this page is a client
  // component that Next also renders on the server, and reading localStorage
  // in a useState initializer makes the first client render disagree with the
  // server's HTML.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(TAB_STORAGE_KEY);
      if (saved === 'local' || saved === 'web') setTab(saved);
    } catch {}
  }, []);

  const selectTab = (next: TabKey) => {
    setTab(next);
    try { localStorage.setItem(TAB_STORAGE_KEY, next); } catch {}
  };

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/live-sessions');
      if (r.ok) {
        const data = await r.json();
        setSessions(data.sessions || []);
      }
    } catch { /* keep last list */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const open = (s: LiveTerminalSession, mode: 'peek' | 'drive') => {
    router.push(
      `/terminal/${s.machineId}/${encodeURIComponent(s.tmuxName)}?mode=${mode}&cols=${s.cols || 80}&rows=${s.rows || 24}`
    );
  };

  // Kill a session: terminates the tmux session on the machine (ends the shell
  // and its processes) so it stops being reported — not just a UI hide. Confirm
  // first since it's destructive. Optimistically remove the row.
  const kill = async (s: LiveTerminalSession) => {
    if (!window.confirm(`Kill this terminal session?\n\n${s.tmuxName}\n\nThis ends the shell and everything running in it on ${machineName(s.machineId)}.`)) {
      return;
    }
    setDismissing((prev) => new Set(prev).add(s.id));
    setSessions((prev) => prev.filter((x) => x.id !== s.id));
    try {
      const r = await fetch(`/api/terminals/${s.id}`, { method: 'DELETE' });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error();
      toast(data.machineOffline ? 'Machine offline — marked ended' : data.killed ? 'Session killed' : 'Session removed');
    } catch {
      toast('Could not kill session');
      load(); // restore the true list on failure
    } finally {
      setDismissing((prev) => { const n = new Set(prev); n.delete(s.id); return n; });
    }
  };

  const machineName = (id: number) =>
    session?.machines.find((m) => m.id === id)?.name || `Machine ${id}`;

  // Two populations share this registry and answer different questions.
  // Local = tmux sessions the cowork shell wrapper created in a real terminal
  // app; the user wants to reach them from the browser. Web = dd-* sessions
  // DevDash itself started, which used to be indistinguishable noise in this
  // list — they are the ones a Resume button is for, since their whole point
  // is that they outlive the tab that opened them.
  const localSessions = sessions.filter((s) => s.origin !== 'browser');
  const webSessions = sessions.filter((s) => s.origin === 'browser');
  const visible = tab === 'web' ? webSessions : localSessions;

  const byMachine = new Map<number, LiveTerminalSession[]>();
  for (const s of visible) {
    if (!byMachine.has(s.machineId)) byMachine.set(s.machineId, []);
    byMachine.get(s.machineId)!.push(s);
  }

  return (
    <div className="px-6 py-6 max-w-5xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="font-display" style={{ fontSize: 32 }}>Terminals</h1>
        <button className="btn-icon" onClick={() => { setLoading(true); load(); }} title="Refresh" aria-label="Refresh">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>
        {tab === 'web'
          ? 'Terminals you started in Dialout. They keep running after you close the tab — resume any of them here.'
          : 'Shell sessions from the terminal apps on your machines. Attach to watch (Peek) or type (Drive).'}
      </p>

      <div className="devdash-term-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'local'} className={tab === 'local' ? 'is-active' : ''}
          onClick={() => selectTab('local')}>
          Local{localSessions.length > 0 && <span className="devdash-term-tabcount">{localSessions.length}</span>}
        </button>
        <button role="tab" aria-selected={tab === 'web'} className={tab === 'web' ? 'is-active' : ''}
          onClick={() => selectTab('web')}>
          Web{webSessions.length > 0 && <span className="devdash-term-tabcount">{webSessions.length}</span>}
        </button>
      </div>

      {visible.length === 0 && !loading && (
        <div className="card-v2" style={{ padding: 28, textAlign: 'center' }}>
          <TerminalSquare size={28} style={{ color: 'var(--dim)', margin: '0 auto 10px' }} />
          <div style={{ color: 'var(--txt)', fontSize: 14, marginBottom: 6 }}>
            {tab === 'web' ? 'No web sessions' : 'No local sessions'}
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 12.5, lineHeight: 1.6 }}>
            {tab === 'web' ? (
              <>Open a terminal from a project or a machine — it appears here and keeps running until you close it.</>
            ) : (
              <>
                Enable session sharing on a machine with{' '}
                <code style={{ background: 'var(--glass)', padding: '2px 6px', borderRadius: 4 }}>
                  devdash-agent setup-cowork
                </code>{' '}
                — new terminal windows will appear here.
              </>
            )}
          </div>
        </div>
      )}

      {Array.from(byMachine.entries()).map(([mid, list]) => (
        <div key={mid} style={{ marginBottom: 24 }}>
          <div style={{ color: 'var(--muted)', fontSize: 11.5, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 8 }}>
            {machineName(mid)} · {list.length} session{list.length !== 1 ? 's' : ''}
          </div>
          <div className="space-y-2">
            {list.map((s) => {
              const machine = session?.machines.find((m) => m.id === s.machineId);
              const template = machine?.terminalNameTemplate || DEFAULT_TERMINAL_TEMPLATE;
              const previewLines = machine?.terminalPreviewLines ?? 3;
              const displayName = renderTerminalName(
                template,
                factsFromSession({
                  machineName: machine?.name || '',
                  folder: s.folder, folderPath: s.folderPath, createdLocal: s.createdLocal,
                  startedAt: s.startedAt, gitBranch: s.gitBranch, termProgram: s.termProgram,
                  tmuxName: s.tmuxName,
                }),
                s.tmuxName
              );
              const preview = (s.lastLines || '').split('\n').filter(Boolean).slice(-previewLines);
              return (
                <div key={s.id} className="card-v2 flex items-center gap-3" style={{ padding: '12px 16px' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--live)', boxShadow: '0 0 6px var(--live)', flex: 'none' }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="devdash-term-name">{displayName}</div>
                    {s.folderPath && (
                      <div className="devdash-term-path" title={`${machineName(s.machineId)}:${s.folderPath}`}>
                        <FolderOpen size={11} className="devdash-term-path-ico" />
                        <span className="devdash-term-path-txt">{s.folderPath}</span>
                      </div>
                    )}
                    <div className="devdash-term-meta">
                      <span className="devdash-term-id">{s.tmuxName}</span>
                      <span>{CLIENT_LABELS[s.termProgram || 'unknown'] || s.termProgram}</span>
                      {s.cols && s.rows ? <span>{s.cols}×{s.rows}</span> : null}
                      <span>active {timeAgo(s.lastActiveAt)}</span>
                    </div>
                    {previewLines > 0 && preview.length > 0 && (
                      <pre className="devdash-term-preview">{preview.join('\n')}</pre>
                    )}
                  </div>
                  <button className="btn-icon" onClick={() => open(s, 'peek')} title="Peek (read-only)" aria-label="Peek">
                    <Eye size={15} />
                  </button>
                  <button className="btn-grad" style={{ padding: '7px 14px', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}
                    onClick={() => open(s, 'drive')}>
                    <Play size={13} /> {tab === 'web' ? 'Resume' : 'Drive'}
                  </button>
                  <button className="btn-icon" onClick={() => kill(s)} disabled={dismissing.has(s.id)}
                    title="Kill session (terminates the shell on the machine)" aria-label="Kill session">
                    <X size={15} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <style jsx>{`
        .devdash-term-tabs {
          display: flex;
          gap: 4px;
          margin-bottom: 18px;
          padding: 3px;
          border-radius: 10px;
          background: var(--glass);
          width: fit-content;
        }
        .devdash-term-tabs button {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 6px 16px;
          border-radius: 7px;
          font-size: 13px;
          color: var(--muted);
          transition: color .15s, background .15s;
        }
        .devdash-term-tabs button:hover {
          color: var(--txt);
        }
        .devdash-term-tabs button.is-active {
          background: var(--card);
          color: var(--txt);
        }
        .devdash-term-tabcount {
          min-width: 18px;
          padding: 1px 5px;
          border-radius: 999px;
          background: var(--accent-weak);
          color: var(--accent);
          font-size: 10.5px;
          line-height: 1.5;
          text-align: center;
        }
        .devdash-term-name {
          font-family: 'JetBrains Mono', Menlo, Monaco, monospace;
          font-size: 13.5px;
          color: var(--txt);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .devdash-term-id {
          font-size: 10.5px;
          color: var(--dim);
        }
        .devdash-term-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 3px;
          font-size: 11.5px;
          color: var(--muted);
          min-width: 0;
          flex-wrap: wrap;
        }
        /* The path is what identifies a session, so it gets the row's one
           accent pill. The terminal-app name used to hold it and now reads as
           plain meta — it is secondary, and two accent pills would compete. */
        .devdash-term-path {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          max-width: 100%;
          margin-top: 4px;
          padding: 2px 9px 2px 7px;
          border-radius: 999px;
          background: var(--accent-weak);
          color: var(--accent);
          font-family: 'JetBrains Mono', Menlo, Monaco, monospace;
          font-size: 11px;
          line-height: 1.55;
        }
        .devdash-term-path-ico {
          flex: none;
          opacity: 0.75;
        }
        /* Truncate from the LEFT: the TAIL of a path is the project folder —
           the part that identifies the session. Clipping that end would defeat
           the point. unicode-bidi keeps the leading '/' from being reordered. */
        .devdash-term-path-txt {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          direction: rtl;
          text-align: left;
          unicode-bidi: plaintext;
        }
        /* Height is exactly the number of lines present: 2 lines render 2, and
           the slice caps it at 3. Previously pre-wrap let ONE long terminal
           line wrap into many visual rows, and max-height 3.4em could not hold
           3 lines at this line-height (3 x 1.45 = 4.35em) — so the last line
           was always sliced mid-glyph and the block height was unpredictable.
           white-space:pre keeps one output line to one visual row. */
        .devdash-term-preview {
          font-family: 'JetBrains Mono', Menlo, Monaco, monospace;
          font-size: 11px;
          line-height: 1.45;
          color: var(--muted);
          white-space: pre;
          overflow: hidden;
          margin-top: 6px;
        }
      `}</style>
    </div>
  );
}
