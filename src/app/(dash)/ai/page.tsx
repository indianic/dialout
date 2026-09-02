'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Bot, RefreshCw, Plus, Trash2 } from 'lucide-react';
import PageHeader from '@/components/dashboard/PageHeader';
import AiStatusDot from '@/components/ai/AiStatusDot';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import NewAiSessionModal from '@/components/ai/NewAiSessionModal';
import PushToggle from '@/components/ai/PushToggle';

interface AiSession {
  tmuxName: string;
  kind: string;
  title: string;
  folder: string;
  gitBranch: string;
  profile: string;
  status: string;
  origin?: 'tmux' | 'launched';
  updatedAt: number;
}

// Scoped to the selected machine, matching the model the sidebar picker,
// projects and terminals all already use.
function AiSessionsView() {
  const { session } = useDashboard();
  // Which machine this list is scoped to. Without it the page looks identical
  // whether the selected machine has no sessions or is not the machine the
  // agent is actually reporting as — the two are indistinguishable, and the
  // second one reads as "my session vanished".
  const machineName = session?.machines.find((m) => m.id === session.machineId)?.name
    || (session ? `Machine ${session.machineId}` : '');
  const router = useRouter();
  const search = useSearchParams();
  // Overlay state lives in the URL, matching the rest of the dashboard, so it
  // is linkable and Escape-closable rather than a local boolean.
  //
  // The key is `new-session`, NOT `new`. GlobalOverlays is mounted app-wide in
  // Shell.tsx and opens the project editor for ANY `?new=` on ANY route
  // (`modalOpen = !!newParam || !!editId`), so `/ai?new=1` opened "Add project"
  // on top of this page. Every param that page-level overlay state uses has to
  // be one GlobalOverlays does not claim: new, edit, delete, share, add-machine.
  const showNew = search.get('new-session') === '1';
  const [sessions, setSessions] = useState<AiSession[]>([]);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/ai-sessions');
      const data = await res.json();
      setSessions(data.sessions || []);
      setOffline(!!data.offline);
    } catch {
      setOffline(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Only launched sessions can be deleted; a tmux session belongs to the
  // user's own terminal and is not DevDash's to end.
  const remove = useCallback(async (id: string) => {
    await fetch(`/api/ai-sessions/${session?.machineId}/${encodeURIComponent(id)}`,
      { method: 'DELETE' });
    void load();
  }, [session?.machineId, load]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 10_000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <div>
      <PageHeader
        title="AI Sessions"
        subtitle={machineName ? `Agent CLIs running on ${machineName}.` : 'Every agent CLI running on your machines.'}
        icon={<Bot size={20} />}
        actions={
          <>
            <PushToggle />
            <button className="btn-ghost" onClick={() => void load()}>
              <RefreshCw size={16} /> Refresh
            </button>
            <button className="btn-grad" onClick={() => router.push('/ai?new-session=1')}>
              <Plus size={16} /> New session
            </button>
          </>
        }
      />

      {loading ? (
        <p style={{ color: 'var(--dim)', fontSize: 13 }}>Looking for sessions…</p>
      ) : offline ? (
        <p style={{ color: 'var(--muted)', fontSize: 13.5 }}>
          The agent on <strong>{machineName}</strong> is offline, so its sessions cannot be listed.
        </p>
      ) : sessions.length === 0 ? (
        <div style={{ maxWidth: '62ch' }}>
          <p style={{ color: 'var(--txt)', fontSize: 15, marginBottom: 8 }}>
            No agent sessions running on <strong>{machineName}</strong>.
          </p>
          <p style={{ color: 'var(--muted)', fontSize: 13.5, lineHeight: 1.7 }}>
            Press <strong>New session</strong> to start one here, or run <code>claude</code> or{' '}
            <code>codex</code> in a terminal on this machine and it will appear within a few
            seconds. A terminal session has to be inside tmux — run{' '}
            <code>dialout setup-cowork</code> once if your terminals are not wrapped yet.
          </p>
        </div>
      ) : (
        <ul style={{ display: 'grid', gap: 8, listStyle: 'none', padding: 0 }}>
          {sessions.map((s) => (
            <li key={s.tmuxName}>
              <Link
                href={`/ai/${session?.machineId}/${encodeURIComponent(s.tmuxName)}`}
                className="card"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 12, padding: '14px 16px',
                }}
              >
                <span style={{ minWidth: 0 }}>
                  <span style={{
                    display: 'block', color: 'var(--txt)', fontSize: 14.5, fontWeight: 500,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {s.title}
                  </span>
                  <span style={{
                    display: 'block', color: 'var(--dim)', fontSize: 12, marginTop: 3,
                  }}>
                    {s.kind} · {s.folder}
                    {s.gitBranch ? ` · ${s.gitBranch}` : ''}
                    {s.profile !== 'default' ? ` · ${s.profile}` : ''}
                    {machineName ? ` · ${machineName}` : ''}
                  </span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <AiStatusDot status={s.status} />
                  {s.origin === 'launched' && (
                    <button
                      className="btn-icon"
                      aria-label="Delete session"
                      title="Delete this session"
                      onClick={(e) => {
                        // The row is a link; without this the click navigates
                        // into the session it is about to delete.
                        e.preventDefault();
                        e.stopPropagation();
                        void remove(s.tmuxName);
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {showNew && session && (
        <NewAiSessionModal
          machineId={session.machineId}
          onClose={() => router.push('/ai')}
        />
      )}
    </div>
  );
}

export default function AiSessionsPage() {
  // useSearchParams needs a boundary; the (dash) layout has one but this page
  // reads params during its own render.
  return (
    <Suspense fallback={<p style={{ color: 'var(--dim)', fontSize: 13 }}>Loading…</p>}>
      <AiSessionsView />
    </Suspense>
  );
}
