'use client';

import { useState, useEffect } from 'react';
import { ShieldCheck, Loader2, AlertCircle, Copy, Check } from 'lucide-react';
import OtpInput from './OtpInput';

interface TwoFactorWizardProps {
  requirePin: boolean;
  onComplete: () => void;
  onCancel?: () => void;
}

type Step = 'pin' | 'email' | 'qr' | 'backup';

async function post(body: unknown) {
  const r = await fetch('/api/auth', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return { ok: r.ok, data: await r.json() };
}

export default function TwoFactorWizard({ requirePin, onComplete, onCancel }: TwoFactorWizardProps) {
  const [step, setStep] = useState<Step>(requirePin ? 'pin' : 'email');
  const [pin, setPin] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [totp, setTotp] = useState('');
  const [secret, setSecret] = useState('');
  const [qr, setQr] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // In the no-PIN path (fresh login/register), there is no PIN-step button to
  // trigger the email code, so send it on mount.
  useEffect(() => {
    if (!requirePin) requestCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Step PIN + request email code (also used to (re)send the email code).
  async function requestCode() {
    setLoading(true); setError('');
    const { ok, data } = await post({ action: 'enroll-request-code', pin });
    setLoading(false);
    if (!ok) { setError(data.error || 'Failed'); return; }
    setStep('email');
  }

  async function verifyEmail() {
    setLoading(true); setError('');
    const { ok, data } = await post({ action: 'enroll-verify-email', code: emailCode });
    setLoading(false);
    if (!ok) { setError(data.error || 'Invalid code'); return; }
    setSecret(data.secret); setQr(data.qr); setStep('qr');
  }

  async function activate() {
    setLoading(true); setError('');
    const { ok, data } = await post({ action: 'enroll-activate', code: totp });
    setLoading(false);
    if (!ok) { setError(data.error || 'Invalid code'); return; }
    setBackupCodes(data.backupCodes || []); setStep('backup');
  }

  function copyCodes() {
    navigator.clipboard.writeText(backupCodes.join('\n')).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="card-v2" style={{ padding: '24px 22px', maxWidth: 410, margin: '0 auto' }}>
      <div className="flex items-center gap-2 mb-4" style={{ color: 'var(--accent)' }}>
        <ShieldCheck size={18} /> <span className="font-display" style={{ fontSize: 18 }}>Set up two-factor auth</span>
      </div>

      {step === 'pin' && (
        <div>
          <label className="label">Confirm your 4-digit PIN</label>
          <div className="flex justify-center mt-2">
            <OtpInput length={4} masked value={pin} onChange={setPin} label="Your 4-digit PIN" autoFocus />
          </div>
          <button className="btn-grad w-full mt-4" disabled={loading || pin.length !== 4} onClick={requestCode}>
            {loading ? <Loader2 size={16} className="spin" /> : 'Send email code'}
          </button>
        </div>
      )}

      {step === 'email' && (
        <div>
          <div className="text-[12.5px] mb-2" style={{ color: 'var(--muted)' }}>
            We emailed a 6-digit code to verify your address. Enter it to continue.
          </div>
          <div className="flex justify-center mt-2">
            <OtpInput length={6} size="sm" value={emailCode} onChange={setEmailCode} label="Email verification code" autoFocus />
          </div>
          <button className="btn-grad w-full mt-4" disabled={loading || emailCode.length !== 6} onClick={verifyEmail}>
            {loading ? <Loader2 size={16} className="spin" /> : 'Verify email'}
          </button>
          <button type="button" onClick={requestCode} disabled={loading}
            className="w-full text-center mt-3 text-[12px]"
            style={{ color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
            Resend code
          </button>
        </div>
      )}

      {step === 'qr' && (
        <div>
          <div className="text-[12.5px] mb-2" style={{ color: 'var(--muted)' }}>
            Scan this with Google Authenticator, Authy, or 1Password, then enter the 6-digit code it shows.
          </div>
          {qr && <img src={qr} alt="2FA QR code" style={{ width: 180, height: 180, margin: '10px auto', display: 'block', borderRadius: 8 }} />}
          <div className="text-center text-[11px] mb-3" style={{ color: 'var(--dim)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
            Manual key: {secret}
          </div>
          <div className="flex justify-center">
            <OtpInput length={6} size="sm" value={totp} onChange={setTotp} label="Authenticator app code" autoFocus />
          </div>
          <button className="btn-grad w-full mt-4" disabled={loading || totp.length !== 6} onClick={activate}>
            {loading ? <Loader2 size={16} className="spin" /> : 'Verify & enable'}
          </button>
        </div>
      )}

      {step === 'backup' && (
        <div>
          <div className="text-[13px] mb-3" style={{ color: 'var(--live)' }}>
            2FA is on. Save these one-time backup codes — each works once if you lose your authenticator.
          </div>
          <div className="glass rounded-lg p-3 mb-3" style={{ fontFamily: 'monospace', fontSize: 14, columnCount: 2 }}>
            {backupCodes.map((c) => <div key={c}>{c}</div>)}
          </div>
          <button type="button" className="ftab w-full justify-center mb-3" onClick={copyCodes}>
            {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy codes</>}
          </button>
          <button className="btn-grad w-full" onClick={onComplete}>I've saved them — continue</button>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-center gap-1.5 text-center mt-3 text-[12.5px]" style={{ color: 'var(--offline)' }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}
      {onCancel && step !== 'backup' && (
        <button type="button" onClick={onCancel} className="w-full text-center mt-3 text-[12px]"
          style={{ color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
          Cancel
        </button>
      )}
    </div>
  );
}
