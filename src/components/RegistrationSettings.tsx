'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle, Check, Copy, Loader2, Mail, ShieldCheck, Trash2, UserPlus, X,
} from 'lucide-react';

/**
 * Who may join this instance, and who is waiting to.
 *
 * Rendered in two halves with different audiences and different gates:
 *
 *  - **Registration policy** and the **request queue** are admin-only, and the
 *    whole block is absent — not disabled — for everyone else. A greyed-out
 *    control tells a non-admin that a lever exists and they cannot reach it,
 *    which is an invitation to go looking for it.
 *  - **Invites** are for every enrolled user, because the feature only works if
 *    growing the instance does not route through one person.
 *
 * The component asks the server what it is allowed to show rather than being
 * told by a prop: `/api/settings/registration` answers 404 to a non-admin, and
 * that 404 is the signal to render only the invite half.
 */

interface Policy {
  signupEnabled: boolean;
  trialEnabled: boolean;
  closedSignupNote: string;
}

interface Invite {
  id: number;
  email: string;
  source: string;
  note: string | null;
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
  createdAt: string | null;
}

interface AccessRequest {
  id: number;
  name: string;
  email: string;
  company: string | null;
  role: string | null;
  machineCount: string | null;
  useCase: string | null;
  status: string;
  createdAt: string | null;
  inviteUsedAt: string | null;
}

function fmt(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function inviteStatus(i: Invite): { label: string; tone: 'live' | 'waiting' | 'off' } {
  if (i.usedAt) return { label: 'Joined', tone: 'live' };
  if (i.revokedAt) return { label: 'Revoked', tone: 'off' };
  if (new Date(i.expiresAt).getTime() < Date.now()) return { label: 'Expired', tone: 'off' };
  return { label: 'Waiting', tone: 'waiting' };
}

const toneVar = { live: 'var(--live)', waiting: 'var(--accent)', off: 'var(--dim)' } as const;

export default function RegistrationSettings() {
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [savingKey, setSavingKey] = useState<string>('');

  const [invites, setInvites] = useState<Invite[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteNote, setInviteNote] = useState('');
  const [sending, setSending] = useState(false);
  const [inviteError, setInviteError] = useState('');
  // The one-time link, kept in view so it can be copied when mail is not set up.
  const [lastLink, setLastLink] = useState<{ email: string; link: string; emailed: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [acting, setActing] = useState<number | null>(null);

  const loadInvites = useCallback(async () => {
    const r = await fetch('/api/invites');
    if (r.ok) setInvites((await r.json()).invites ?? []);
  }, []);

  const loadRequests = useCallback(async () => {
    const r = await fetch('/api/access-requests');
    if (r.ok) setRequests((await r.json()).requests ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const r = await fetch('/api/settings/registration');
      if (r.ok) {
        setAdmin(true);
        setPolicy(await r.json());
        loadRequests();
      } else {
        setAdmin(false);
      }
      loadInvites();
    })();
  }, [loadInvites, loadRequests]);

  async function savePolicy(patch: Partial<Policy>, key: string) {
    if (!policy) return;
    setSavingKey(key);
    // Optimistic, then reconciled with what the server actually stored. A toggle
    // that waits for a round trip before moving feels broken on a slow link.
    setPolicy({ ...policy, ...patch });
    const r = await fetch('/api/settings/registration', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (r.ok) setPolicy(await r.json());
    setSavingKey('');
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setSending(true);
    setInviteError('');
    setLastLink(null);
    const r = await fetch('/api/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail.trim(), note: inviteNote.trim() }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      setInviteError(data.error || 'Could not send that invite.');
    } else {
      setLastLink({ email: data.email, link: data.link, emailed: data.emailed });
      setInviteEmail('');
      setInviteNote('');
      loadInvites();
    }
    setSending(false);
  }

  async function revoke(id: number) {
    const r = await fetch(`/api/invites/${id}`, { method: 'DELETE' });
    if (r.ok) loadInvites();
  }

  async function review(id: number, action: 'approve' | 'decline') {
    setActing(id);
    const r = await fetch(`/api/access-requests/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok && action === 'approve' && data.link) {
      setLastLink({ email: '', link: data.link, emailed: data.emailed });
    }
    setActing(null);
    loadRequests();
    loadInvites();
  }

  function copyLink(link: string) {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  if (admin === null) return null;

  const pending = requests.filter((r) => r.status === 'pending');
  const liveInvites = invites.filter((i) => inviteStatus(i).tone === 'waiting');

  return (
    <>
      {admin && policy && (
        <div className="card-v2 mb-5" style={{ padding: '20px 22px' }}>
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck size={16} style={{ color: 'var(--accent)' }} />
            <h3 className="text-[14px] font-semibold">Who can join</h3>
          </div>
          <p className="text-[12.5px] mb-5" style={{ color: 'var(--dim)', lineHeight: 1.6 }}>
            Instance-wide, not per-user. These two switches decide what a stranger
            sees on the sign-in page.
          </p>

          <Toggle
            label="Open registration"
            help="Anyone with the URL can create an account. Leave this off to stay invite-only — the usual setting."
            checked={policy.signupEnabled}
            busy={savingKey === 'signupEnabled'}
            onChange={(v) => savePolicy({ signupEnabled: v }, 'signupEnabled')}
          />

          <Toggle
            label="Accept access requests"
            help="Shows a “Request access” form on the website and the sign-in page. Requests land in the queue below for you to approve."
            checked={policy.trialEnabled}
            busy={savingKey === 'trialEnabled'}
            onChange={(v) => savePolicy({ trialEnabled: v }, 'trialEnabled')}
          />

          {!policy.signupEnabled && (
            <div className="mt-4">
              <label className="label">Message on the sign-in page</label>
              <input
                type="text"
                className="inp"
                placeholder="New accounts are invite-only right now."
                value={policy.closedSignupNote}
                onChange={(e) => setPolicy({ ...policy, closedSignupNote: e.target.value })}
                onBlur={(e) => savePolicy({ closedSignupNote: e.target.value }, 'note')}
                maxLength={500}
              />
              <p className="text-[11.5px] mt-1.5" style={{ color: 'var(--dim)' }}>
                Shown to anyone who lands on sign-in without an invite. Leave blank for the default wording.
              </p>
            </div>
          )}
        </div>
      )}

      {admin && (
        <div className="card-v2 mb-5" style={{ padding: '20px 22px' }}>
          <div className="flex items-center gap-2 mb-1">
            <Mail size={16} style={{ color: 'var(--accent)' }} />
            <h3 className="text-[14px] font-semibold">
              Access requests
              {pending.length > 0 && (
                <span className="ml-2 text-[11px] font-mono px-1.5 py-0.5 rounded"
                  style={{ background: 'var(--accent-weak)', color: 'var(--accent)' }}>
                  {pending.length} waiting
                </span>
              )}
            </h3>
          </div>
          <p className="text-[12.5px] mb-4" style={{ color: 'var(--dim)', lineHeight: 1.6 }}>
            Approving one emails a single-use signup link. Declining is silent — nobody is told no.
          </p>

          {requests.length === 0 ? (
            <p className="text-[12.5px]" style={{ color: 'var(--dim)' }}>
              {policy?.trialEnabled
                ? 'Nothing waiting. Requests from the website appear here.'
                : 'Turn on “Accept access requests” above to collect these.'}
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {requests.slice(0, 40).map((r) => (
                <div key={r.id} className="rounded-lg p-3" style={{ border: '1px solid var(--hairline)' }}>
                  <div className="flex items-start justify-between gap-3">
                    <div style={{ minWidth: 0 }}>
                      <div className="text-[13px] font-medium truncate">
                        {r.name}
                        {r.company ? <span style={{ color: 'var(--dim)' }}> · {r.company}</span> : null}
                      </div>
                      <div className="text-[12px] font-mono truncate" style={{ color: 'var(--muted)' }}>{r.email}</div>
                      {r.useCase && (
                        <p className="text-[12px] mt-1.5" style={{ color: 'var(--muted)', lineHeight: 1.55 }}>{r.useCase}</p>
                      )}
                      <div className="text-[11px] mt-1.5 font-mono" style={{ color: 'var(--dim)' }}>
                        {fmt(r.createdAt)}
                        {r.machineCount ? ` · ${r.machineCount} machines` : ''}
                        {r.role ? ` · ${r.role}` : ''}
                      </div>
                    </div>

                    {r.status === 'pending' ? (
                      <div className="flex items-center gap-1.5" style={{ flexShrink: 0 }}>
                        <button
                          type="button" className="btn-green" disabled={acting === r.id}
                          onClick={() => review(r.id, 'approve')}
                        >
                          {acting === r.id ? <Loader2 size={13} className="spin" /> : <Check size={13} />} Approve
                        </button>
                        <button
                          type="button" className="btn-ghost" disabled={acting === r.id}
                          onClick={() => review(r.id, 'decline')}
                          title="Decline — no email is sent"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ) : (
                      <span className="text-[11px] font-mono" style={{
                        color: r.status === 'approved' ? 'var(--live)' : 'var(--dim)', flexShrink: 0,
                      }}>
                        {r.status === 'approved' ? (r.inviteUsedAt ? 'JOINED' : 'APPROVED') : 'DECLINED'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="card-v2 mb-5" style={{ padding: '20px 22px' }}>
        <div className="flex items-center gap-2 mb-1">
          <UserPlus size={16} style={{ color: 'var(--accent)' }} />
          <h3 className="text-[14px] font-semibold">Invite someone</h3>
        </div>
        <p className="text-[12.5px] mb-4" style={{ color: 'var(--dim)', lineHeight: 1.6 }}>
          They get a link that works once, only for their address, and expires in 14 days.
        </p>

        <form onSubmit={sendInvite} className="flex flex-col gap-2.5 mb-4">
          <div className="flex gap-2.5 flex-wrap">
            <input
              type="email" required placeholder="colleague@company.com"
              className="inp" style={{ flex: '1 1 220px' }}
              value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)}
            />
            <input
              type="text" placeholder="Note (optional, for you)"
              className="inp" style={{ flex: '1 1 180px' }}
              value={inviteNote} onChange={(e) => setInviteNote(e.target.value)} maxLength={200}
            />
            <button type="submit" className="btn-grad" disabled={sending} style={{ flex: '0 0 auto' }}>
              {sending ? <Loader2 size={15} className="spin" /> : 'Send invite'}
            </button>
          </div>

          {inviteError && (
            <div className="flex items-center gap-1.5 text-[12.5px]" style={{ color: 'var(--offline)' }}>
              <AlertCircle size={14} /> {inviteError}
            </div>
          )}
        </form>

        {lastLink && (
          <div className="rounded-lg p-3 mb-4" style={{ background: 'var(--accent-weak)' }}>
            <div className="text-[12.5px] mb-2" style={{ lineHeight: 1.6 }}>
              {lastLink.emailed
                ? <>Invite sent{lastLink.email ? <> to <strong>{lastLink.email}</strong></> : null}. Here is the link as well — it is shown once and cannot be retrieved later.</>
                : <>The invite was created but the email could not be sent. Pass this link on yourself — it is shown once and cannot be retrieved later.</>}
            </div>
            <div className="flex items-center gap-2">
              <code className="text-[11px] font-mono truncate flex-1 px-2 py-1.5 rounded"
                style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
                {lastLink.link}
              </code>
              <button type="button" className="btn-ghost" onClick={() => copyLink(lastLink.link)}>
                {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        )}

        {invites.length === 0 ? (
          <p className="text-[12.5px]" style={{ color: 'var(--dim)' }}>
            You have not invited anyone yet.
          </p>
        ) : (
          <>
            <div className="text-[11px] font-mono mb-2" style={{ color: 'var(--dim)', letterSpacing: 1 }}>
              YOUR INVITES · {liveInvites.length} OUTSTANDING
            </div>
            <div className="flex flex-col gap-1.5">
              {invites.slice(0, 30).map((i) => {
                const st = inviteStatus(i);
                return (
                  <div key={i.id} className="flex items-center justify-between gap-3 py-1.5"
                    style={{ borderBottom: '1px solid var(--hairline)' }}>
                    <div style={{ minWidth: 0 }}>
                      <div className="text-[12.5px] font-mono truncate">{i.email}</div>
                      {i.note ? (
                        <div className="text-[11.5px] truncate" style={{ color: 'var(--dim)' }}>{i.note}</div>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-3" style={{ flexShrink: 0 }}>
                      <span className="text-[11px] font-mono" style={{ color: toneVar[st.tone] }}>
                        {st.label.toUpperCase()}
                      </span>
                      <span className="text-[11px] font-mono hidden sm:inline" style={{ color: 'var(--dim)' }}>
                        {st.tone === 'waiting' ? `expires ${fmt(i.expiresAt)}` : fmt(i.usedAt || i.createdAt)}
                      </span>
                      {st.tone === 'waiting' && (
                        <button type="button" onClick={() => revoke(i.id)} title="Revoke this invite"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--dim)' }}>
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </>
  );
}

function Toggle({
  label, help, checked, busy, onChange,
}: {
  label: string; help: string; checked: boolean; busy: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 py-2.5 cursor-pointer" style={{ userSelect: 'none' }}>
      <button
        type="button" role="switch" aria-checked={checked} aria-label={label}
        onClick={() => !busy && onChange(!checked)}
        style={{
          flexShrink: 0, marginTop: 2, width: 38, height: 22, borderRadius: 999,
          border: '1px solid var(--hairline)', cursor: busy ? 'wait' : 'pointer',
          background: checked ? 'var(--accent)' : 'var(--surface)',
          position: 'relative', transition: 'background .15s ease',
        }}
      >
        <span style={{
          position: 'absolute', top: 2, left: checked ? 18 : 2, width: 16, height: 16,
          borderRadius: 999, background: checked ? '#fff' : 'var(--dim)',
          transition: 'left .15s ease',
        }} />
      </button>
      <span style={{ minWidth: 0 }}>
        <span className="block text-[13px] font-medium">{label}</span>
        <span className="block text-[12px] mt-0.5" style={{ color: 'var(--dim)', lineHeight: 1.55 }}>{help}</span>
      </span>
    </label>
  );
}
