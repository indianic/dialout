'use client';

import { useRouter } from 'next/navigation';
import {
  Share2, StickyNote, ListChecks, SquareTerminal, Globe, X,
} from 'lucide-react';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import PageHeader from '@/components/dashboard/PageHeader';
import SharingManagement from '@/components/SharingManagement';

export default function SharedPage() {
  const router = useRouter();
  const { sharedProjects, onlineMachineIds, openTerminal, unsubscribeShare, reloadShared } = useDashboard();

  return (
    <div>
      <PageHeader
        title="Shared with me"
        subtitle="Projects teammates have shared with you. Read-only, but you can comment."
        icon={<Share2 size={20} />}
      />

      {sharedProjects.length === 0 ? (
        <div className="empty-state mb-8">
          <Share2 size={36} style={{ color: 'var(--dim)' }} />
          <div className="font-display mt-4" style={{ fontSize: 22, color: 'var(--txt)' }}>No shared projects yet</div>
          <p className="text-[13px] mt-2" style={{ color: 'var(--muted)' }}>Ask a teammate to share a project with you.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-10">
          {sharedProjects.map((p) => {
            const daemonOnline = p.machineId ? onlineMachineIds.includes(p.machineId) : false;
            return (
              <div key={p.id} className="p-card is-dead p-5 flex flex-col" style={{ minHeight: 170 }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="tag-chip">shared by {p.sharedByName}</span>
                  <button className="btn-icon danger" style={{ width: 28, height: 28 }} title="Unsubscribe" onClick={() => unsubscribeShare(p.shareId)}><X size={14} /></button>
                </div>
                <div className="font-semibold" style={{ fontSize: 16, color: 'var(--txt)' }}>{p.name}</div>
                <div className="flex items-center gap-3 mt-1 font-mono text-[12px]" style={{ color: 'var(--muted)' }}>
                  {p.port && <span className="tnum" style={{ color: 'var(--accent)', fontWeight: 600 }}>:{p.port}</span>}
                  {p.url && <span className="url-clip">{p.url}</span>}
                </div>
                {p.description && (
                  <p className="text-[12.5px] mt-2" style={{ color: 'var(--muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.description}</p>
                )}
                <div className="flex-1" />
                <div className="flex items-center gap-2 mt-4 pt-3" style={{ borderTop: '1px solid var(--b1)' }}>
                  <button className="btn-icon" title="Notes" onClick={() => router.push(`/projects/${p.id}?tab=notes`)}><StickyNote size={15} /></button>
                  <button className="btn-icon" title="Todos" onClick={() => router.push(`/projects/${p.id}?tab=todos`)}><ListChecks size={15} /></button>
                  {p.allowTerminal && daemonOnline && (
                    <button className="btn-icon" title="Terminal" onClick={() => openTerminal(p)}><SquareTerminal size={15} /></button>
                  )}
                  {p.allowTerminal && p.machineId && p.port && daemonOnline && (
                    <a className="btn-icon" title="Live preview" href={`/ws/tunnel/${p.machineId}/${p.sharePort || p.port}/`} target="_blank" rel="noreferrer"><Globe size={15} /></a>
                  )}
                  <span className="ml-auto font-mono text-[10px]" style={{ color: 'var(--dim)' }}>{p.sharedByEmail}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <SharingManagement onReload={reloadShared} />
    </div>
  );
}
