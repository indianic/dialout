'use client';

import { useState, useEffect, useCallback } from 'react';
import { Share2, Trash2, User } from 'lucide-react';
import { useToast } from './Toast';

interface ShareEntry {
  shareId: number;
  projectId: number;
  projectName: string;
  sharedWithName: string;
  sharedWithEmail: string;
  createdAt: string;
  type: 'active' | 'pending';
}

interface SharingManagementProps {
  onReload: () => void;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function SharingManagement({ onReload }: SharingManagementProps) {
  const { toast } = useToast();
  const [byMe, setByMe] = useState<ShareEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/shares?view=by-me');
      if (r.ok) setByMe(await r.json());
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function removeShare(entry: ShareEntry) {
    try {
      const body = entry.type === 'pending'
        ? { pendingId: entry.shareId }
        : { shareId: entry.shareId };

      await fetch('/api/shares', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      toast(entry.type === 'pending' ? 'Invite cancelled' : `Removed ${entry.sharedWithName || entry.sharedWithEmail}`);
      load();
      onReload();
    } catch {
      toast('Failed to remove');
    }
  }

  // Group by project
  const grouped = byMe.reduce<Record<number, { projectName: string; entries: ShareEntry[] }>>((acc, e) => {
    if (!acc[e.projectId]) acc[e.projectId] = { projectName: e.projectName, entries: [] };
    acc[e.projectId].entries.push(e);
    return acc;
  }, {});

  if (loading) {
    return <div className="text-center py-8" style={{ fontSize: 13, color: 'var(--dim)' }}>Loading...</div>;
  }

  const projectIds = Object.keys(grouped).map(Number);

  return (
    <div className="mt-6">
      {/* Shared by me */}
      <div className="sec-label">
        <Share2 size={15} style={{ color: 'var(--accent)' }} />
        <span>Shared by me</span>
        <span className="sec-count">{projectIds.length}</span>
      </div>

      {projectIds.length === 0 ? (
        <div className="empty-state flex flex-col items-center gap-2 py-6" style={{ fontSize: 13, color: 'var(--dim)' }}>
          <Share2 size={22} style={{ color: 'var(--muted)' }} />
          You haven&apos;t shared any projects yet
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {projectIds.map((pid) => {
            const group = grouped[pid];
            return (
              <div key={pid} className="card-v2" style={{ padding: 0, overflow: 'hidden' }}>
                {/* Project header */}
                <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid var(--b1)' }}>
                  <div className="flex items-center gap-2">
                    <span className="font-display" style={{ fontSize: 14, color: 'var(--txt)' }}>
                      {group.projectName}
                    </span>
                    <span className="pill" style={{ fontSize: 10 }}>
                      {group.entries.length} {group.entries.length === 1 ? 'user' : 'users'}
                    </span>
                  </div>
                </div>

                {/* Users */}
                {group.entries.map((entry) => (
                  <div key={`${entry.type}-${entry.shareId}`}
                    className="flex items-center justify-between px-4 py-2 group"
                    style={{ borderBottom: '1px solid var(--b1)', transition: 'background .12s' }}
                    onMouseOver={(e) => (e.currentTarget.style.background = 'var(--card-h)')}
                    onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Avatar circle */}
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%',
                        background: entry.type === 'pending' ? 'var(--b2)' : 'var(--accent-weak)',
                        border: `1px solid ${entry.type === 'pending' ? 'var(--b3)' : 'var(--b2)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        {entry.type === 'pending' ? (
                          <User size={14} style={{ color: 'var(--dim)' }} />
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700 }}>
                            {(entry.sharedWithName?.[0] || '?').toUpperCase()}
                          </span>
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate" style={{ fontSize: 13, color: 'var(--txt)', fontWeight: 600 }}>
                            {entry.type === 'pending' ? entry.sharedWithEmail : entry.sharedWithName}
                          </span>
                          {entry.type === 'pending' && (
                            <span className="pill shrink-0" style={{
                              fontSize: 10,
                              background: 'rgba(245,158,11,0.15)', color: '#f59e0b',
                              borderColor: 'rgba(245,158,11,0.25)',
                            }}>Pending</span>
                          )}
                        </div>
                        {entry.type === 'active' && (
                          <div style={{ fontSize: 12, color: 'var(--dim)' }}>
                            {entry.sharedWithEmail}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono tnum hidden group-hover:inline" style={{ fontSize: 10, color: 'var(--dim)' }}>
                        {entry.createdAt ? timeAgo(entry.createdAt) : ''}
                      </span>
                      <button className="btn-icon danger opacity-0 group-hover:opacity-100"
                        onClick={() => removeShare(entry)}
                        title={entry.type === 'pending' ? 'Cancel invite' : 'Remove share'}
                        aria-label={entry.type === 'pending' ? 'Cancel invite' : 'Remove share'}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
