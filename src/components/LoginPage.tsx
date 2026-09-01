'use client';

import { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { LogoMark } from './marketing/Logo';
import TwoFactorWizard from './TwoFactorWizard';
import OtpInput from './OtpInput';

interface LoginPageProps {
  onSuccess: () => void;
}

type Mode = 'login' | 'register' | 'reset';
// Which screen we're on within login. 'form' is the email+PIN card.
type View = 'form' | 'twofa' | 'enroll' | 'reset2fa';

export default function LoginPage({ onSuccess }: LoginPageProps) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [machineName, setMachineName] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  // Reset flow: 'request' asks for email → emails a code; 'confirm' verifies it.
  const [resetStep, setResetStep] = useState<'request' | 'confirm'>('request');
  const [resetCode, setResetCode] = useState('');

  const [view, setView] = useState<View>('form');
  const [twofaCode, setTwofaCode] = useState('');
  const [trustDevice, setTrustDevice] = useState(false);
  const [reset2faStep, setReset2faStep] = useState<'request' | 'confirm'>('request');
  const [reset2faCode, setReset2faCode] = useState('');

  useEffect(() => {
    setError('');
    setSuccess('');
    setOtpCode('');
    setResetStep('request');
    setResetCode('');
  }, [mode]);

  async function handleLogin() {
    if (!email.trim()) { setError('Enter your email'); return; }
    if (otpCode.length !== 4) { setError('Enter 4-digit code'); return; }

    setLoading(true); setError('');
    try {
      const r = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', email: email.trim(), otpCode }),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error || 'Login failed'); setLoading(false); return; }
      setLoading(false);
      if (data.pending === '2fa') { setView('twofa'); return; }
      if (data.pending === 'enroll') { setView('enroll'); return; }
      onSuccess();
    } catch {
      setError('Connection failed');
    }
    setLoading(false);
  }

  async function handleRegister() {
    if (!name.trim() || !email.trim() || !machineName.trim()) { setError('All fields required'); return; }
    if (otpCode.length !== 4) { setError('Set a 4-digit code'); return; }

    setLoading(true); setError('');
    try {
      const r = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'register', name: name.trim(), email: email.trim(), otpCode, machineName: machineName.trim() }),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error || 'Registration failed'); setLoading(false); return; }
      setLoading(false);
      if (data.pending === 'enroll') { setView('enroll'); return; }
      onSuccess();
    } catch {
      setError('Connection failed');
    }
    setLoading(false);
  }

  async function handleRequestReset() {
    if (!email.trim()) { setError('Enter your email'); return; }

    setLoading(true); setError(''); setSuccess('');
    try {
      const r = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request-reset', email: email.trim() }),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error || 'Could not send code'); setLoading(false); return; }
      setResetStep('confirm');
      setSuccess('If that email is registered, a 6-digit code was sent. Check your inbox.');
    } catch {
      setError('Connection failed');
    }
    setLoading(false);
  }

  async function handleConfirmReset() {
    if (resetCode.length !== 6) { setError('Enter the 6-digit code from your email'); return; }
    if (otpCode.length !== 4) { setError('Set a new 4-digit code'); return; }

    setLoading(true); setError('');
    try {
      const r = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm-reset', email: email.trim(), code: resetCode, newOtpCode: otpCode }),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error || 'Reset failed'); setLoading(false); return; }
      setSuccess('Code updated. You can now log in with your new 4-digit code.');
      setTimeout(() => { setMode('login'); }, 1600);
    } catch {
      setError('Connection failed');
    }
    setLoading(false);
  }

  async function handleVerify2fa() {
    if (twofaCode.trim().length < 6 && !twofaCode.includes('-')) { setError('Enter your 6-digit code or a backup code'); return; }
    setLoading(true); setError('');
    try {
      const r = await fetch('/api/auth', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify-2fa', code: twofaCode.trim(), trustDevice }),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error || 'Invalid code'); setLoading(false); return; }
      onSuccess();
    } catch { setError('Connection failed'); }
    setLoading(false);
  }

  async function handleRequest2faReset() {
    if (!email.trim()) { setError('Enter your email'); return; }

    setLoading(true); setError(''); setSuccess('');
    try {
      const r = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset-2fa-request', email: email.trim() }),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error || 'Could not send code'); setLoading(false); return; }
      setReset2faStep('confirm');
      setSuccess('If that email has 2FA enabled, a 6-digit code was sent. Check your inbox.');
    } catch {
      setError('Connection failed');
    }
    setLoading(false);
  }

  async function handleConfirm2faReset() {
    if (reset2faCode.length !== 6) { setError('Enter the 6-digit code from your email'); return; }

    setLoading(true); setError('');
    try {
      const r = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset-2fa-confirm', email: email.trim(), code: reset2faCode }),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error || 'Reset failed'); setLoading(false); return; }
      setView('form'); setMode('login');
      setReset2faStep('request'); setReset2faCode(''); setTwofaCode('');
      setSuccess('Two-factor authentication was reset. Log in, then set it up again.');
    } catch {
      setError('Connection failed');
    }
    setLoading(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === 'login') handleLogin();
    else if (mode === 'register') handleRegister();
    else if (resetStep === 'request') handleRequestReset();
    else handleConfirmReset();
  }

  function renderOtpInputs() {
    return (
      <div className="flex justify-center my-4">
        <OtpInput length={4} masked value={otpCode} onChange={setOtpCode} label="4-digit code" />
      </div>
    );
  }

  const tabs: { key: Mode; label: string }[] = [
    { key: 'login', label: 'Log in' },
    { key: 'register', label: 'Register' },
    { key: 'reset', label: 'Reset OTP' },
  ];

  if (view === 'enroll') {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center px-4 py-10">
        <TwoFactorWizard requirePin={false} onComplete={onSuccess} />
      </div>
    );
  }

  if (view === 'twofa') {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center px-4 py-10">
        <div className="card-v2" style={{ padding: '24px 22px', width: '100%', maxWidth: 410 }}>
          <div className="font-display mb-3" style={{ fontSize: 20 }}>Enter your authenticator code</div>
          <input className="inp" inputMode="text" placeholder="6-digit code or backup code"
            value={twofaCode} onChange={(e) => setTwofaCode(e.target.value)} autoFocus
            style={{ textAlign: 'center', letterSpacing: '0.2em' }} />
          <label className="flex items-center gap-2 mt-3 text-[12.5px]" style={{ color: 'var(--muted)' }}>
            <input type="checkbox" checked={trustDevice} onChange={(e) => setTrustDevice(e.target.checked)} />
            Trust this device for 14 days
          </label>
          {error && <div className="flex items-center justify-center gap-1.5 text-center mt-3 text-[12.5px]" style={{ color: 'var(--offline)' }}><AlertCircle size={14} /> {error}</div>}
          <button className="btn-grad w-full mt-4" disabled={loading} onClick={handleVerify2fa}>
            {loading ? <Loader2 size={17} className="spin" /> : 'Verify'}
          </button>
          <button type="button" onClick={() => { setView('reset2fa'); setReset2faStep('request'); setError(''); setSuccess(''); }}
            className="w-full text-center mt-3 text-[12px]" style={{ color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
            Lost your authenticator?
          </button>
        </div>
      </div>
    );
  }

  if (view === 'reset2fa') {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center px-4 py-10">
        <div className="card-v2" style={{ padding: '24px 22px', width: '100%', maxWidth: 410 }}>
          <div className="font-display mb-3" style={{ fontSize: 20 }}>Reset two-factor authentication</div>

          {reset2faStep === 'request' ? (
            <>
              <div className="text-center text-[12.5px] mb-3" style={{ color: 'var(--muted)', lineHeight: 1.6 }}>
                Enter your email and we&apos;ll send a 6-digit code to disable 2FA on your account. You&apos;ll need to set it up again after logging in.
              </div>
              <label className="label">Email</label>
              <input type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} className="inp" autoComplete="email" />
            </>
          ) : (
            <div className="mb-3.5">
              <label className="label text-center w-full">Verification code</label>
              <div className="flex justify-center mt-2">
                <OtpInput length={6} size="sm" value={reset2faCode} onChange={setReset2faCode} label="6-digit code from your email" autoFocus />
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center gap-1.5 text-center mt-3 text-[12.5px]" style={{ color: 'var(--offline)' }}>
              <AlertCircle size={14} /> {error}
            </div>
          )}
          {success && (
            <div className="flex items-center justify-center gap-1.5 text-center mt-3 text-[12.5px]" style={{ color: 'var(--live)' }}>
              <CheckCircle2 size={14} /> {success}
            </div>
          )}

          <button className="btn-grad w-full mt-4" disabled={loading} onClick={reset2faStep === 'request' ? handleRequest2faReset : handleConfirm2faReset}>
            {loading ? <Loader2 size={17} className="spin" /> : reset2faStep === 'request' ? 'Send code' : 'Reset 2FA'}
          </button>

          {reset2faStep === 'confirm' && !loading && (
            <button
              type="button"
              onClick={() => { setReset2faStep('request'); setReset2faCode(''); setError(''); setSuccess(''); }}
              className="w-full text-center mt-3 text-[12px]"
              style={{ color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Use a different email or resend code
            </button>
          )}

          <button
            type="button"
            onClick={() => { setView('twofa'); setReset2faStep('request'); setReset2faCode(''); setError(''); setSuccess(''); }}
            className="w-full text-center mt-3 text-[12px]"
            style={{ color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Back to authenticator code
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center px-4 py-10">
      <div style={{ width: '100%', maxWidth: 410 }}>
        {/* Brand */}
        <div className="text-center mb-7">
          {/* The mark, on the terminal ground it uses everywhere else. A generic
              grid glyph said nothing about the product; the chevron leaving the
              dot is the one image that does. */}
          <span className="grid place-items-center mx-auto rounded-2xl mb-4" style={{ width: 58, height: 58, background: '#0c0e13', color: '#ffffff' }}>
            <LogoMark size={32} />
          </span>
          <div style={{ fontFamily: "'IBM Plex Sans', system-ui, sans-serif", fontWeight: 700, letterSpacing: '-0.02em', fontSize: 40, lineHeight: 1, color: 'var(--txt)' }}>Dialout</div>
          <div className="text-[13px] mt-1.5" style={{ color: 'var(--muted)' }}>Your machines, one room</div>
        </div>

        {/* Card */}
        <div className="card-v2" style={{ padding: '24px 22px' }}>
          {/* Mode tabs */}
          <div className="flex items-center gap-1 glass rounded-full p-1 mb-6">
            {tabs.map(({ key, label }) => (
              <button key={key} type="button" onClick={() => setMode(key)} className={`ftab flex-1 justify-center ${mode === key ? 'on' : ''}`}>
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit}>
            {mode === 'register' && (
              <div className="mb-3.5">
                <label className="label">Full name</label>
                <input type="text" placeholder="Sandeep Mundra" value={name} onChange={(e) => setName(e.target.value)} className="inp" autoComplete="name" />
              </div>
            )}

            <div className="mb-3.5">
              <label className="label">Email</label>
              <input type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} className="inp" autoComplete="email" />
            </div>

            {mode === 'register' && (
              <div className="mb-3.5">
                <label className="label">Machine name</label>
                <input type="text" placeholder="Office Desktop" value={machineName} onChange={(e) => setMachineName(e.target.value)} className="inp" />
              </div>
            )}

            {mode === 'reset' && resetStep === 'confirm' && (
              <div className="mb-3.5">
                <label className="label text-center w-full">Verification code</label>
                <div className="flex justify-center mt-2">
                  <OtpInput length={6} size="sm" value={resetCode} onChange={setResetCode} label="6-digit code from your email" autoFocus />
                </div>
              </div>
            )}

            {mode === 'reset' && resetStep === 'request' ? (
              <div className="text-center text-[12.5px] mb-1" style={{ color: 'var(--muted)', lineHeight: 1.6 }}>
                Enter your email and we&apos;ll send a 6-digit code to reset your login code.
              </div>
            ) : (
              <div className="mb-1">
                <label className="label text-center w-full">
                  {mode === 'login' ? 'Enter your 4-digit code' : mode === 'register' ? 'Set your 4-digit code' : 'Set a new 4-digit code'}
                </label>
                {renderOtpInputs()}
              </div>
            )}

            {error && (
              <div className="flex items-center justify-center gap-1.5 text-center mb-3 text-[12.5px]" style={{ color: 'var(--offline)' }}>
                <AlertCircle size={14} /> {error}
              </div>
            )}
            {success && (
              <div className="flex items-center justify-center gap-1.5 text-center mb-3 text-[12.5px]" style={{ color: 'var(--live)' }}>
                <CheckCircle2 size={14} /> {success}
              </div>
            )}

            <button type="submit" className="btn-grad w-full" disabled={loading} style={{ marginTop: 4 }}>
              {loading ? <Loader2 size={17} className="spin" />
                : mode === 'login' ? 'Log in'
                : mode === 'register' ? 'Create account'
                : resetStep === 'request' ? 'Send code'
                : 'Set new code'}
            </button>

            {mode === 'reset' && resetStep === 'confirm' && !loading && (
              <button
                type="button"
                onClick={() => { setResetStep('request'); setResetCode(''); setOtpCode(''); setError(''); setSuccess(''); }}
                className="w-full text-center mt-3 text-[12px]"
                style={{ color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Use a different email or resend code
              </button>
            )}
          </form>
        </div>

        <div className="flex items-center justify-center gap-1.5 text-center mt-5 text-[11px]" style={{ color: 'var(--dim)' }}>
          <ShieldCheck size={13} /> Secured with a 4-digit OTP
        </div>
      </div>
    </div>
  );
}
