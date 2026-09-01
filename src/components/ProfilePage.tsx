'use client';

import { useEffect, useState } from 'react';
import {
  Loader2, ShieldCheck, ShieldOff, Mail, KeyRound, User,
  CheckCircle2, AlertCircle, RefreshCw, LogOut,
} from 'lucide-react';
import TwoFactorWizard from './TwoFactorWizard';
import OtpInput from './OtpInput';

async function post(action: string, extra: Record<string, unknown> = {}) {
  const r = await fetch('/api/profile', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra }),
  });
  return { ok: r.ok, data: await r.json() };
}

type NoticeKind = 'ok' | 'err';
type Notice = { kind: NoticeKind; text: string } | null;

// Feedback lands in the section that caused it, not in a toast that slides away
// before you've finished reading it. Errors and confirmations use the same slot,
// so the answer is always in the place you were already looking.
function InlineNotice({ notice }: { notice: Notice }) {
  if (!notice) return null;
  const ok = notice.kind === 'ok';
  const color = ok ? 'var(--live)' : 'var(--offline)';
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-start gap-2 mt-3 rounded-lg"
      style={{
        padding: '8px 10px',
        fontSize: 12.5,
        color,
        background: ok ? 'rgba(34,197,94,.10)' : 'rgba(244,63,94,.10)',
        border: `1px solid ${ok ? 'rgba(34,197,94,.28)' : 'rgba(244,63,94,.28)'}`,
      }}
    >
      {ok ? <CheckCircle2 size={14} style={{ flex: 'none', marginTop: 1 }} />
          : <AlertCircle size={14} style={{ flex: 'none', marginTop: 1 }} />}
      <span>{notice.text}</span>
    </div>
  );
}

// One shape for every block on the page: icon + title on top, optional hint,
// then the control. Repeating it is what makes the page read as one thing
// rather than four unrelated forms.
function Section({
  icon, title, hint, children,
}: { icon: React.ReactNode; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card-v2 mb-4" style={{ padding: 20 }}>
      <div className="flex items-center gap-2" style={{ color: 'var(--accent)' }}>
        {icon}
        <h2 className="font-display" style={{ fontSize: 16 }}>{title}</h2>
      </div>
      {hint && <p className="mt-1.5" style={{ fontSize: 12.5, color: 'var(--muted)' }}>{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="label" style={{ marginBottom: 8 }}>{children}</div>;
}

export default function ProfilePage() {
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);

  const [nameInput, setNameInput] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [emailCodeSent, setEmailCodeSent] = useState(false);
  const [emailCode, setEmailCode] = useState('');
  const [enabling, setEnabling] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [disablePin, setDisablePin] = useState('');
  const [disableTotp, setDisableTotp] = useState('');
  const [regenTotp, setRegenTotp] = useState('');
  const [newBackupCodes, setNewBackupCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const [notices, setNotices] = useState<Record<string, Notice>>({});
  const say = (key: string, kind: NoticeKind, text: string) =>
    setNotices((n) => ({ ...n, [key]: { kind, text } }));
  const clear = (key: string) => setNotices((n) => ({ ...n, [key]: null }));

  async function reload() {
    const r = await fetch('/api/auth');
    if (r.ok) {
      const d = await r.json();
      setName(d.name); setNameInput(d.name); setEmail(d.email); setTwoFactorEnabled(!!d.twoFactorEnabled);
    }
    setLoaded(true); setEnabling(false);
  }
  useEffect(() => { reload(); }, []);

  // Escape closes the disable-2FA confirm, matching every other modal in the app.
  useEffect(() => {
    if (!disableOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) setDisableOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [disableOpen, busy]);

  async function saveName() {
    if (!nameInput.trim()) return;
    setBusy(true); clear('name');
    const { ok, data } = await post('update-name', { name: nameInput.trim() });
    setBusy(false);
    if (ok) { setName(nameInput.trim()); say('name', 'ok', 'Display name updated.'); }
    else say('name', 'err', data.error || 'Could not update your name.');
  }

  async function savePin() {
    setBusy(true); clear('pin');
    const { ok, data } = await post('change-pin', { currentPin, newPin });
    setBusy(false);
    if (ok) { setCurrentPin(''); setNewPin(''); say('pin', 'ok', 'PIN changed. Use your new PIN next time you sign in.'); }
    else say('pin', 'err', data.error || 'Could not change your PIN.');
  }

  async function requestEmailChange() {
    setBusy(true); clear('email');
    const { ok, data } = await post('request-email-change', { newEmail: newEmail.trim() });
    setBusy(false);
    if (ok) { setEmailCodeSent(true); say('email', 'ok', `Verification code sent to ${newEmail.trim()}.`); }
    else say('email', 'err', data.error || 'Could not send the code.');
  }

  async function confirmEmailChange() {
    setBusy(true); clear('email');
    const { ok, data } = await post('confirm-email-change', { code: emailCode });
    setBusy(false);
    if (ok) {
      setEmail(data.email); setNewEmail(''); setEmailCode(''); setEmailCodeSent(false);
      say('email', 'ok', `Email updated to ${data.email}.`);
    } else say('email', 'err', data.error || 'That code was not accepted.');
  }

  async function disable2fa() {
    setBusy(true); clear('twofa');
    const { ok, data } = await post('disable-2fa', { pin: disablePin, totp: disableTotp });
    setBusy(false);
    if (ok) {
      setDisableOpen(false); setDisablePin(''); setDisableTotp('');
      say('twofa', 'ok', 'Two-factor authentication is now off. Your account is protected by your PIN alone.');
      reload();
    } else say('twofa-modal', 'err', data.error || 'PIN or app code was not accepted.');
  }

  async function regenBackup() {
    setBusy(true); clear('backup');
    const { ok, data } = await post('regenerate-backup-codes', { totp: regenTotp });
    setBusy(false);
    if (ok) {
      setNewBackupCodes(data.backupCodes || []); setRegenTotp('');
      say('backup', 'ok', 'New backup codes generated. Your previous codes no longer work.');
    } else say('backup', 'err', data.error || 'Could not generate new codes.');
  }

  async function revokeTrusted() {
    setBusy(true); clear('trusted');
    const { ok, data } = await post('revoke-trusted-devices');
    setBusy(false);
    if (ok) say('trusted', 'ok', 'Trusted devices signed out. They will ask for a code next time.');
    else say('trusted', 'err', data.error || 'Could not sign out trusted devices.');
  }

  if (!loaded) return <div className="grid place-items-center py-20"><Loader2 className="spin" /></div>;

  const nameDirty = nameInput.trim() !== name && !!nameInput.trim();

  return (
    <div className="max-w-[600px] mx-auto pb-10">
      {/* Identity first: who you are, and the one fact that matters about this
          account's security — before any of the forms that change them. */}
      <header className="flex items-center gap-4 mb-7">
        <div
          className="grid place-items-center font-display shrink-0"
          style={{ width: 60, height: 60, borderRadius: 18, background: 'var(--grad)', color: '#fff', fontSize: 25 }}
          aria-hidden="true"
        >
          {(name || '?').charAt(0).toUpperCase()}
        </div>
        <div style={{ minWidth: 0 }}>
          <h1 className="font-display truncate" style={{ fontSize: 26, color: 'var(--txt)' }}>{name}</h1>
          <div className="truncate" style={{ fontSize: 13, color: 'var(--muted)' }}>{email}</div>
          <div
            className="inline-flex items-center gap-1.5 mt-2"
            style={{
              padding: '2px 9px', borderRadius: 999, fontSize: 11,
              color: twoFactorEnabled ? 'var(--live)' : 'var(--muted)',
              background: twoFactorEnabled ? 'rgba(34,197,94,.12)' : 'var(--glass)',
              border: `1px solid ${twoFactorEnabled ? 'rgba(34,197,94,.3)' : 'var(--b1)'}`,
            }}
          >
            {twoFactorEnabled ? <ShieldCheck size={11} /> : <ShieldOff size={11} />}
            {twoFactorEnabled ? '2FA on' : '2FA off'}
          </div>
        </div>
      </header>

      <Section icon={<User size={16} />} title="Display name">
        <FieldLabel>Name</FieldLabel>
        <input className="inp" value={nameInput} onChange={(e) => setNameInput(e.target.value)} />
        <button className="btn-grad mt-3" disabled={busy || !nameDirty} onClick={saveName}>Save name</button>
        <InlineNotice notice={notices.name} />
      </Section>

      <Section icon={<Mail size={16} />} title="Email" hint={`Currently ${email}`}>
        {!emailCodeSent ? (
          <>
            <FieldLabel>New email</FieldLabel>
            <input className="inp" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="new@email.com" />
            <button className="btn-grad mt-3" disabled={busy || !newEmail.trim()} onClick={requestEmailChange}>Send verification code</button>
          </>
        ) : (
          <>
            <FieldLabel>Code sent to {newEmail}</FieldLabel>
            <OtpInput length={6} size="sm" value={emailCode} onChange={setEmailCode} label="Email verification code" autoFocus />
            <div className="flex gap-2 mt-4">
              <button className="btn-grad" disabled={busy || emailCode.length !== 6} onClick={confirmEmailChange}>Confirm new email</button>
              <button className="btn-ghost" onClick={() => { setEmailCodeSent(false); setEmailCode(''); clear('email'); }}>Cancel</button>
            </div>
          </>
        )}
        <InlineNotice notice={notices.email} />
      </Section>

      <Section icon={<KeyRound size={16} />} title="4-digit PIN" hint="The code you type to sign in.">
        <FieldLabel>Current PIN</FieldLabel>
        <OtpInput length={4} masked size="sm" value={currentPin} onChange={setCurrentPin} label="Current PIN" />
        <div className="mt-4">
          <FieldLabel>New PIN</FieldLabel>
          <OtpInput length={4} masked size="sm" value={newPin} onChange={setNewPin} label="New PIN" />
        </div>
        <button className="btn-grad mt-4" disabled={busy || currentPin.length !== 4 || newPin.length !== 4} onClick={savePin}>Change PIN</button>
        <InlineNotice notice={notices.pin} />
      </Section>

      <Section
        icon={<ShieldCheck size={16} />}
        title="Two-factor authentication"
        hint={twoFactorEnabled ? undefined : 'Add a second step at sign-in using an authenticator app.'}
      >
        {enabling ? (
          <TwoFactorWizard
            requirePin
            onComplete={() => { say('twofa', 'ok', 'Two-factor authentication is on.'); reload(); }}
            onCancel={() => setEnabling(false)}
          />
        ) : twoFactorEnabled ? (
          <div className="space-y-5">
            <InlineNotice notice={notices.twofa} />

            <div>
              <FieldLabel>Regenerate backup codes</FieldLabel>
              <p className="mb-2.5" style={{ fontSize: 12, color: 'var(--muted)' }}>
                Enter a current app code. This replaces your existing backup codes.
              </p>
              <OtpInput length={6} size="sm" value={regenTotp} onChange={setRegenTotp} label="Authenticator code" />
              <button className="btn-ghost mt-3" disabled={busy || regenTotp.length !== 6} onClick={regenBackup}>
                <RefreshCw size={14} /> Regenerate
              </button>
              {newBackupCodes.length > 0 && (
                <div className="glass rounded-lg p-3 mt-3" style={{ fontFamily: 'monospace', fontSize: 14, columnCount: 2 }}>
                  {newBackupCodes.map((c) => <div key={c}>{c}</div>)}
                </div>
              )}
              <InlineNotice notice={notices.backup} />
            </div>

            <div style={{ borderTop: '1px solid var(--b1)', paddingTop: 18 }}>
              <button className="btn-ghost" disabled={busy} onClick={revokeTrusted}>
                <LogOut size={14} /> Sign out trusted devices
              </button>
              <InlineNotice notice={notices.trusted} />
            </div>

            {/* Turning 2FA off is destructive and irreversible without re-enrolling,
                so it is a real button behind a confirm — not a link you brush past. */}
            <div style={{ borderTop: '1px solid var(--b1)', paddingTop: 18 }}>
              <button
                className="btn-solid btn-red"
                disabled={busy}
                onClick={() => { clear('twofa-modal'); setDisableOpen(true); }}
              >
                <ShieldOff size={14} /> Disable 2FA
              </button>
            </div>
          </div>
        ) : (
          <>
            <button className="btn-grad" onClick={() => { clear('twofa'); setEnabling(true); }}>Enable 2FA</button>
            <InlineNotice notice={notices.twofa} />
          </>
        )}
      </Section>

      {disableOpen && (
        <div
          className="overlay"
          onClick={(e) => e.target === e.currentTarget && !busy && setDisableOpen(false)}
        >
          <div className="modal-box" style={{ maxWidth: 400 }} role="dialog" aria-modal="true" aria-label="Disable two-factor authentication">
            <div style={{ padding: '28px 28px 24px' }}>
              <div className="text-center">
                <span
                  className="grid place-items-center mx-auto rounded-2xl mb-4"
                  style={{ width: 52, height: 52, background: 'rgba(244,63,94,.14)', border: '1px solid rgba(244,63,94,.3)', color: 'var(--offline)' }}
                >
                  <ShieldOff size={24} />
                </span>
                <h2 className="font-display" style={{ fontSize: 21, color: 'var(--txt)' }}>Disable 2FA?</h2>
                <p className="mt-1.5" style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                  Your account will be protected by your PIN alone. Confirm with your PIN and a current app code.
                </p>
              </div>

              <div className="mt-5">
                <FieldLabel>PIN</FieldLabel>
                <div className="flex justify-center"><OtpInput length={4} masked size="sm" value={disablePin} onChange={setDisablePin} label="PIN" autoFocus /></div>
              </div>
              <div className="mt-4">
                <FieldLabel>Authenticator code</FieldLabel>
                <div className="flex justify-center"><OtpInput length={6} size="sm" value={disableTotp} onChange={setDisableTotp} label="Authenticator code" /></div>
              </div>

              <InlineNotice notice={notices['twofa-modal']} />

              <div className="flex gap-2.5 justify-center mt-6">
                <button className="btn-ghost" style={{ minWidth: 110 }} disabled={busy} onClick={() => setDisableOpen(false)}>Cancel</button>
                <button
                  className="btn-solid btn-red"
                  style={{ minWidth: 110 }}
                  disabled={busy || disablePin.length !== 4 || disableTotp.length !== 6}
                  onClick={disable2fa}
                >
                  {busy ? <Loader2 size={16} className="spin" /> : <ShieldOff size={16} />} Disable
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
