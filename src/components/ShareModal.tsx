'use client';

import { useState } from 'react';
import { Share2, Copy, X, SquareTerminal, Server } from 'lucide-react';
import { Project, Machine } from '@/types';
import { useToast } from './Toast';

interface ShareModalProps {
  open: boolean;
  project: Project | null;
  machines: Machine[];
  currentMachineId: number;
  onClose: () => void;
  onReload: () => void;
}

export default function ShareModal({ open, project, machines, currentMachineId, onClose, onReload }: ShareModalProps) {
  const { toast } = useToast();
  const [tab, setTab] = useState<'share' | 'copy'>('share');
  const [email, setEmail] = useState('');
  const [targetMachine, setTargetMachine] = useState<number>(0);
  const [copyPort, setCopyPort] = useState('');
  const [copyPath, setCopyPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [inviteConfirm, setInviteConfirm] = useState<string | null>(null);
  const [allowTerminal, setAllowTerminal] = useState(false);
  const [sharePort, setSharePort] = useState('');
  const [sharePath, setSharePath] = useState('');

  if (!open || !project) return null;

  const otherMachines = machines.filter((m) => m.id !== currentMachineId);

  async function handleShare(confirmInvite = false) {
    const targetEmail = confirmInvite ? inviteConfirm! : email.trim();
    if (!targetEmail) { toast('Enter an email'); return; }
    setLoading(true);
    try {
      const r = await fetch('/api/shares', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project!.id,
          email: targetEmail,
          confirmInvite,
          allowTerminal,
          port: sharePort ? parseInt(sharePort) : undefined,
          rootPath: sharePath || undefined,
        }),
      });
      const data = await r.json();

      if (data.needsConfirm) {
        setInviteConfirm(data.email);
        setLoading(false);
        return;
      }

      if (!r.ok) { toast(data.error || 'Share failed'); setLoading(false); return; }

      if (data.invited) {
        toast(`Invite sent to ${targetEmail} — they'll see this project when they register`);
      } else {
        toast(`Shared with ${targetEmail}`);
      }
      setEmail('');
      setInviteConfirm(null);
      onClose();
    } catch {
      toast('Share failed');
    }
    setLoading(false);
  }

  async function handleCopy() {
    if (!targetMachine) { toast('Select a machine'); return; }
    setLoading(true);
    try {
      const r = await fetch('/api/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project!.id,
          targetMachineId: targetMachine,
          port: copyPort ? parseInt(copyPort) : undefined,
          rootPath: copyPath || undefined,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        toast(data.error || 'Copy failed');
        setLoading(false);
        return;
      }
      toast('Project linked to machine');
      onReload();
      onClose();
    } catch {
      toast('Copy failed');
    }
    setLoading(false);
  }

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box mx-3" style={{ maxWidth: 440 }}>
        {/* Header */}
        <div className="flex items-center justify-between" style={{ padding: '14px 20px', borderBottom: '1px solid var(--b1)' }}>
          <div className="flex items-center gap-2.5">
            <Share2 size={18} style={{ color: 'var(--accent)' }} />
            <div>
              <div className="font-display" style={{ fontSize: 20, color: 'var(--txt)' }}>Share / Copy</div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 1 }}>{project.name}</div>
            </div>
          </div>
          <button className="btn-icon" onClick={onClose} title="Close" aria-label="Close"><X size={16} /></button>
        </div>

        {/* Tabs */}
        <div className="flex" style={{ borderBottom: '1px solid var(--b1)' }}>
          <button onClick={() => setTab('share')} className="flex-1 flex items-center justify-center gap-2"
            style={{
              fontSize: 13, fontWeight: 500, padding: '10px 14px',
              color: tab === 'share' ? 'var(--accent)' : 'var(--dim)',
              background: 'none', borderWidth: 0, cursor: 'pointer',
              borderBottomWidth: 2, borderBottomStyle: 'solid',
              borderBottomColor: tab === 'share' ? 'var(--accent)' : 'transparent',
            }}>
            <Share2 size={15} /> Share with user
          </button>
          <button onClick={() => setTab('copy')} className="flex-1 flex items-center justify-center gap-2"
            style={{
              fontSize: 13, fontWeight: 500, padding: '10px 14px',
              color: tab === 'copy' ? 'var(--accent)' : 'var(--dim)',
              background: 'none', borderWidth: 0, cursor: 'pointer',
              borderBottomWidth: 2, borderBottomStyle: 'solid',
              borderBottomColor: tab === 'copy' ? 'var(--accent)' : 'transparent',
            }}>
            <Copy size={15} /> Copy to machine
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '20px' }}>
          {tab === 'share' ? (
            <div>
              {inviteConfirm ? (
                /* Invite confirmation dialog */
                <div style={{ textAlign: 'center' }}>
                  <div className="font-display" style={{ fontSize: 22, color: 'var(--txt)', marginBottom: 8 }}>
                    User not found
                  </div>
                  <div className="font-mono mb-2" style={{ fontSize: 12.5, color: 'var(--txt)' }}>
                    {inviteConfirm}
                  </div>
                  <div className="mb-5" style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6 }}>
                    This email is not registered yet. Send an invite? When they register with this email, they will automatically see this project in their Shared tab.
                  </div>
                  <div className="flex gap-3 justify-center">
                    <button className="btn-ghost" onClick={() => setInviteConfirm(null)}>Cancel</button>
                    <button className="btn-grad" onClick={() => handleShare(true)} disabled={loading}>
                      {loading ? '...' : 'Send invite'}
                    </button>
                  </div>
                </div>
              ) : (
                /* Normal share form */
                <>
                  <div className="label">Share with (email)</div>
                  <div className="mb-3" style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                    The user will see your project in their Shared tab and can view notes, todos, and leave comments.
                  </div>
                  <input
                    type="email"
                    placeholder="colleague@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleShare()}
                    className="inp mb-4"
                  />

                  {/* Terminal access toggle */}
                  <div className="glass mb-4" style={{ borderRadius: 'var(--r-sm)', padding: 12 }}>
                    <label className="flex items-center gap-2 cursor-pointer" style={{ marginBottom: allowTerminal ? 10 : 0 }}>
                      <input type="checkbox" checked={allowTerminal} onChange={(e) => setAllowTerminal(e.target.checked)}
                        style={{ accentColor: 'var(--accent)' }} />
                      <SquareTerminal size={15} style={{ color: 'var(--muted)' }} />
                      <span style={{ fontSize: 13, color: 'var(--txt)' }}>
                        Allow terminal &amp; preview access
                      </span>
                    </label>
                    {allowTerminal && (
                      <div className="grid grid-cols-2 gap-3 mt-1">
                        <div>
                          <div className="label">Port on their machine</div>
                          <input type="number" placeholder={String(project.port || '')} value={sharePort}
                            onChange={(e) => setSharePort(e.target.value)}
                            className="inp" />
                        </div>
                        <div>
                          <div className="label">Path on their machine</div>
                          <input type="text" placeholder={project.rootPath || '~/project'} value={sharePath}
                            onChange={(e) => setSharePath(e.target.value)}
                            className="inp" />
                        </div>
                      </div>
                    )}
                  </div>

                  <button className="btn-grad w-full flex items-center justify-center gap-2" onClick={() => handleShare()} disabled={loading}>
                    <Share2 size={15} /> {loading ? '...' : 'Share project'}
                  </button>
                </>
              )}
            </div>
          ) : (
            <div>
              <div className="label">Target machine</div>
              <div className="mb-3" style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                Copy this project to another machine. You can optionally change the port.
              </div>

              {otherMachines.length === 0 ? (
                <div className="empty-state text-center py-4" style={{ fontSize: 13, color: 'var(--dim)' }}>
                  No other machines. Add one from the machine dropdown in the header.
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-1.5 mb-4">
                    {otherMachines.map((m) => (
                      <button key={m.id} onClick={() => setTargetMachine(m.id)}
                        className="text-left flex items-center gap-2"
                        style={{
                          padding: '8px 12px', borderRadius: 'var(--r-sm)',
                          background: targetMachine === m.id ? 'var(--accent-weak)' : 'var(--inp-bg)',
                          border: `1px solid ${targetMachine === m.id ? 'var(--accent)' : 'var(--b2)'}`,
                          color: targetMachine === m.id ? 'var(--accent)' : 'var(--muted)',
                          fontSize: 13, cursor: 'pointer', transition: 'all .12s',
                        }}>
                        <Server size={15} />
                        {m.name}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <div className="label">Current port</div>
                      <div className="font-mono tnum" style={{ fontSize: 14, fontWeight: 700, color: 'var(--muted)' }}>
                        :{project.port || '—'}
                      </div>
                    </div>
                    <div>
                      <div className="label">New port (optional)</div>
                      <input type="number" placeholder={String(project.port || '')} value={copyPort}
                        onChange={(e) => setCopyPort(e.target.value)}
                        className="inp" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div>
                      <div className="label">Current path</div>
                      <div className="font-mono" style={{ fontSize: 11, color: 'var(--muted)', wordBreak: 'break-all' }}>
                        {project.rootPath || '—'}
                      </div>
                    </div>
                    <div>
                      <div className="label">New path (optional)</div>
                      <input type="text" placeholder={project.rootPath || '~/project'} value={copyPath}
                        onChange={(e) => setCopyPath(e.target.value)}
                        className="inp" />
                    </div>
                  </div>

                  <button className="btn-grad w-full flex items-center justify-center gap-2" onClick={handleCopy} disabled={loading || !targetMachine}>
                    <Copy size={15} /> {loading ? '...' : 'Copy to machine'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
