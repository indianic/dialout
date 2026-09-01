'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  MonitorSmartphone, SquareTerminal, ScrollText, Settings, X, Play,
  KeyRound, Copy, Eye, EyeOff, RefreshCw, Search, Trash2,
} from 'lucide-react';
import { Machine } from '@/types';

interface MachineWithStatus extends Machine {
  isOnline: boolean;
  hasApiKey: boolean;
  canCopyKey: boolean;
  apiKeyPrefix: string | null;
  apiKeyLastUsed: string | null;
}

interface Recording {
  id: number;
  machineId: number;
  command: string;
  cwd: string;
  startedAt: string;
  endedAt: string;
  exitCode: number | null;
}

interface MachineManagementProps {
  userId: number;
  machines: Machine[];
  currentMachineId: number;
  onTerminal?: (machineId: number, machineName: string) => void;
}

function formatDuration(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ${secs % 60}s`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function formatDate(d: string): string {
  return new Date(d).toLocaleString([], {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function MachineManagement({ userId, machines: initialMachines, currentMachineId, onTerminal }: MachineManagementProps) {
  const [machines, setMachines] = useState<MachineWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatedKey, setGeneratedKey] = useState<{ machineId: number; key: string } | null>(null);
  const [copiedKeyId, setCopiedKeyId] = useState<number | null>(null);
  const [showInstructions, setShowInstructions] = useState<number | null>(null);

  // Session logs modal state
  const [logsMachine, setLogsMachine] = useState<MachineWithStatus | null>(null);
  const [logs, setLogs] = useState<Recording[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsPage, setLogsPage] = useState(0);
  const [logsPerPage] = useState(15);
  const [logsSearch, setLogsSearch] = useState('');
  const [logsLoading, setLogsLoading] = useState(false);

  const loadMachines = useCallback(async () => {
    try {
      const r = await fetch(`/api/machines?userId=${userId}`);
      if (r.ok) setMachines(await r.json());
    } catch { /* silent */ }
    setLoading(false);
  }, [userId]);

  useEffect(() => { loadMachines(); }, [loadMachines]);

  const loadLogs = useCallback(async (machineId: number, page: number, search: string) => {
    setLogsLoading(true);
    try {
      const params = new URLSearchParams({
        machineId: String(machineId),
        page: String(page),
        perPage: String(logsPerPage),
      });
      if (search) params.set('search', search);
      const r = await fetch(`/api/terminals/recordings?${params}`);
      if (r.ok) {
        const data = await r.json();
        setLogs(data.recordings);
        setLogsTotal(data.total);
      }
    } catch { /* silent */ }
    setLogsLoading(false);
  }, [logsPerPage]);

  function openLogs(m: MachineWithStatus) {
    setLogsMachine(m);
    setLogsPage(0);
    setLogsSearch('');
    loadLogs(m.id, 0, '');
  }

  function closeLogs() {
    setLogsMachine(null);
    setLogs([]);
  }

  async function generateKey(machineId: number) {
    const r = await fetch(`/api/machines/${machineId}/api-key`, { method: 'POST' });
    if (r.ok) {
      const data = await r.json();
      setGeneratedKey({ machineId, key: data.apiKey });
      loadMachines();
    }
  }

  async function copyKey(machineId: number) {
    const r = await fetch(`/api/machines/${machineId}/api-key`);
    if (!r.ok) return;
    const data = await r.json();
    if (data.key) {
      await navigator.clipboard.writeText(data.key);
      setCopiedKeyId(machineId);
      setTimeout(() => setCopiedKeyId(null), 1500);
    }
  }

  async function revokeKey(machineId: number) {
    await fetch(`/api/machines/${machineId}/api-key`, { method: 'DELETE' });
    setGeneratedKey(null);
    loadMachines();
  }

  async function toggleHidden(machineId: number, hidden: boolean) {
    await fetch(`/api/machines/${machineId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hidden }),
    });
    loadMachines();
  }

  if (loading) {
    return <div className="text-center py-8 text-sm" style={{ color: 'var(--muted)' }}>Loading machines...</div>;
  }

  const totalPages = Math.ceil(logsTotal / logsPerPage);

  return (
    <div>
      <div className="sec-label">
        <MonitorSmartphone size={15} style={{ color: 'var(--muted)' }} />
        <span>Machines</span>
        <span className="sec-count">{machines.length}</span>
      </div>

      {/* Machine cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {machines.map((m) => (
          <div
            key={m.id}
            className="card-v2"
            style={{ padding: 18, display: 'flex', flexDirection: 'column', minHeight: 170, animation: 'cardIn .22s ease both' }}
          >
            {/* Top row: status + actions */}
            <div className="flex items-start justify-between" style={{ marginBottom: 10 }}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`status-chip ${m.isOnline ? 'live' : 'offline'}`}>
                  <span className={m.isOnline ? 'live-dot' : 'dead-dot'} />
                  {m.isOnline ? 'Online' : 'Offline'}
                </span>
                {m.id === currentMachineId && (
                  <span className="tag-chip" style={{ background: 'var(--accent-weak)', color: 'var(--accent)' }}>Current</span>
                )}
                {m.hidden && (
                  <span className="tag-chip">Hidden</span>
                )}
              </div>
              <div className="card-acts flex gap-1 items-center">
                {m.isOnline && onTerminal && (
                  <button className="btn-icon" onClick={() => onTerminal(m.id, m.name)}
                    title="Open Terminal" aria-label="Open Terminal" style={{ color: 'var(--accent)' }}>
                    <SquareTerminal size={15} />
                  </button>
                )}
                <button className="btn-icon" onClick={() => openLogs(m)}
                  title="Session Logs" aria-label="Session Logs">
                  <ScrollText size={15} />
                </button>
                <button className="btn-icon"
                  onClick={() => toggleHidden(m.id, !m.hidden)}
                  title={m.hidden ? 'Show in dropdown' : 'Hide from dropdown'}
                  aria-label={m.hidden ? 'Show in dropdown' : 'Hide from dropdown'}
                  style={{ color: m.hidden ? 'var(--dim)' : 'var(--muted)' }}
                >{m.hidden ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                <button className="btn-icon"
                  onClick={() => setShowInstructions(showInstructions === m.id ? null : m.id)}
                  title="Setup" aria-label="Setup">
                  <Settings size={15} />
                </button>
              </div>
            </div>

            {/* Machine name */}
            <div className="font-display" style={{ fontWeight: 700, fontSize: 15, color: 'var(--txt)', lineHeight: 1.3, marginBottom: 8 }}>
              {m.name}
            </div>

            {/* API Key info */}
            <div className="flex items-center gap-1.5" style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
              <KeyRound size={13} style={{ color: 'var(--dim)' }} />
              {m.hasApiKey ? (
                <>
                  <span className="font-mono tnum" style={{ color: 'var(--txt)' }}>{m.apiKeyPrefix}........</span>
                  {m.canCopyKey ? (
                    <button className="btn-icon" onClick={() => copyKey(m.id)}
                      title="Copy API key" aria-label="Copy API key"
                      style={{ color: copiedKeyId === m.id ? 'var(--live)' : 'var(--muted)' }}>
                      <Copy size={13} />
                    </button>
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--dim)' }} title="Key was created before copy support — regenerate to enable">
                      (regen to copy)
                    </span>
                  )}
                  {copiedKeyId === m.id && (
                    <span style={{ fontSize: 11, color: 'var(--live)' }}>Copied!</span>
                  )}
                </>
              ) : (
                <span style={{ color: 'var(--dim)' }}>No API key</span>
              )}
            </div>

            {m.apiKeyLastUsed && (
              <div style={{ fontSize: 11.5, color: 'var(--dim)', marginBottom: 6 }}>
                Last used: <span className="font-mono tnum">{formatDate(m.apiKeyLastUsed)}</span>
              </div>
            )}

            <div className="flex-1" />

            {/* Bottom actions */}
            <div className="flex items-center justify-between" style={{ borderTop: '1px solid var(--b1)', paddingTop: 10, marginTop: 4 }}>
              <div className="flex gap-1.5">
                {m.hasApiKey && (
                  <button onClick={() => revokeKey(m.id)} className="btn-solid btn-red flex items-center gap-1">
                    <Trash2 size={13} /> Revoke
                  </button>
                )}
                <button onClick={() => generateKey(m.id)} className="btn-ghost flex items-center gap-1">
                  {m.hasApiKey ? <RefreshCw size={13} /> : <KeyRound size={13} />}
                  {m.hasApiKey ? 'Regen' : 'Gen Key'}
                </button>
              </div>
              <div style={{ fontSize: 11, color: 'var(--dim)' }}>
                ID <span className="font-mono tnum">{m.id}</span>
              </div>
            </div>

            {/* Generated Key Display */}
            {generatedKey?.machineId === m.id && (
              <div className="glass" style={{ marginTop: 10, padding: 10, borderRadius: 'var(--r-sm)' }}>
                <div className="label flex items-center gap-1.5" style={{ marginBottom: 6 }}>
                  <KeyRound size={13} style={{ color: 'var(--live)' }} />
                  API key — copy now (shown only once)
                </div>
                <div className="font-mono text-xs break-all select-all" style={{ padding: 7, borderRadius: 'var(--r-sm)', background: 'var(--b1)', color: 'var(--txt)' }}>
                  {generatedKey.key}
                </div>
                <button onClick={() => navigator.clipboard.writeText(generatedKey.key)}
                  className="btn-ghost flex items-center gap-1" style={{ marginTop: 8 }}>
                  <Copy size={13} /> Copy
                </button>
              </div>
            )}

            {/* Setup Instructions */}
            {showInstructions === m.id && (
              <div className="glass" style={{ marginTop: 10, padding: 10, borderRadius: 'var(--r-sm)' }}>
                <div className="label flex items-center gap-1.5" style={{ marginBottom: 6 }}>
                  <Settings size={13} style={{ color: 'var(--muted)' }} />
                  Daemon setup
                </div>
                <pre className="font-mono" style={{ fontSize: 11, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--muted)' }}>
{`# Install
npm install -g dialout

# Configure + start
devdash-agent init
devdash-agent setup-cron`}
                </pre>
              </div>
            )}
          </div>
        ))}
      </div>

      {machines.length === 0 && (
        <div className="empty-state">
          <MonitorSmartphone size={26} style={{ color: 'var(--dim)' }} />
          <div style={{ marginTop: 8 }}>No machines found. Add a machine from the header menu.</div>
        </div>
      )}

      {/* ── Session Logs Modal ── */}
      {logsMachine && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && closeLogs()}>
          <div className="modal-box mx-3" style={{ maxWidth: 720, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            {/* Modal Header */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--b1)', flexShrink: 0 }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <ScrollText size={18} style={{ color: 'var(--accent)' }} />
                  <div>
                    <div className="font-display" style={{ fontSize: 18, color: 'var(--txt)' }}>
                      Session Logs
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--dim)', marginTop: 2 }}>
                      {logsMachine.name} &middot; <span className="font-mono tnum">{logsTotal}</span> recording{logsTotal !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
                <button className="btn-icon" onClick={closeLogs} title="Close" aria-label="Close">
                  <X size={16} />
                </button>
              </div>

              {/* Search */}
              <div className="relative" style={{ marginTop: 10 }}>
                <Search size={14} className="absolute" style={{ left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--dim)' }} />
                <input
                  type="text"
                  placeholder="Search commands..."
                  value={logsSearch}
                  onChange={(e) => {
                    setLogsSearch(e.target.value);
                    setLogsPage(0);
                    loadLogs(logsMachine.id, 0, e.target.value);
                  }}
                  className="inp w-full"
                  style={{ paddingLeft: 32 }}
                />
              </div>
            </div>

            {/* Session list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 20px' }}>
              {logsLoading ? (
                <div className="text-center py-8 text-sm" style={{ color: 'var(--dim)' }}>Loading...</div>
              ) : logs.length === 0 ? (
                <div className="empty-state">
                  <ScrollText size={24} style={{ color: 'var(--dim)' }} />
                  <div style={{ marginTop: 8 }}>
                    {logsSearch ? 'No matching sessions' : 'No recorded sessions on this machine'}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {logs.map((rec) => (
                    <div key={rec.id} className="card-v2" style={{ padding: '10px 14px' }}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3" style={{ minWidth: 0, flex: 1 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: rec.exitCode === 0 ? 'var(--live)' : rec.exitCode === null ? 'var(--dim)' : 'var(--offline)' }} />
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div className="font-mono" style={{ fontSize: 12.5, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {rec.command || 'shell'}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 2 }}>
                              <span className="font-mono tnum">{formatDate(rec.startedAt)}</span>
                              {rec.endedAt && <> &middot; <span className="font-mono tnum">{formatDuration(rec.startedAt, rec.endedAt)}</span></>}
                              {rec.exitCode !== null && <> &middot; exit <span className="font-mono tnum">{rec.exitCode}</span></>}
                            </div>
                            <div className="font-mono" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {rec.cwd}
                            </div>
                          </div>
                        </div>
                        <a
                          href={`/sessions/${rec.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-ghost flex items-center gap-1"
                          style={{ whiteSpace: 'nowrap', textDecoration: 'none', flexShrink: 0 }}
                        >
                          <Play size={13} /> Replay
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ padding: '10px 20px', borderTop: '1px solid var(--b1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <div style={{ fontSize: 12, color: 'var(--dim)' }}>
                  Page <span className="font-mono tnum">{logsPage + 1}</span> of <span className="font-mono tnum">{totalPages}</span>
                </div>
                <div className="flex gap-1.5">
                  <button
                    disabled={logsPage === 0}
                    onClick={() => { setLogsPage(logsPage - 1); loadLogs(logsMachine.id, logsPage - 1, logsSearch); }}
                    className="btn-ghost"
                    style={{ cursor: logsPage === 0 ? 'not-allowed' : 'pointer', opacity: logsPage === 0 ? 0.4 : 1 }}
                  >Prev</button>
                  <button
                    disabled={logsPage >= totalPages - 1}
                    onClick={() => { setLogsPage(logsPage + 1); loadLogs(logsMachine.id, logsPage + 1, logsSearch); }}
                    className="btn-ghost"
                    style={{ cursor: logsPage >= totalPages - 1 ? 'not-allowed' : 'pointer', opacity: logsPage >= totalPages - 1 ? 0.4 : 1 }}
                  >Next</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
