'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, RefreshCw, AlertCircle } from 'lucide-react';

/**
 * "Request access" — the public queue that stands in for open signup.
 *
 * Shorter than the enquiry form on purpose. Every extra field on a form whose
 * only job is to get someone in line is a reason to close the tab, so this asks
 * for the two things needed to send an invite, and two optional ones that make
 * the queue triageable.
 *
 * On success the form is replaced by the confirmation rather than showing a
 * banner above a still-filled form: the request is in, so leaving a live Send
 * button on screen invites a double send.
 */

const label: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--txt)',
  marginBottom: 6,
};

const field: React.CSSProperties = {
  width: '100%',
  background: 'var(--inp-bg)',
  border: '1px solid var(--b2)',
  borderRadius: 10,
  padding: '10px 12px',
  fontSize: 14.5,
  fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
  color: 'var(--txt)',
};

interface Challenge {
  code: string;
  token: string;
}

export default function AccessRequestForm({ sourcePage }: { sourcePage: string }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [machineCount, setMachineCount] = useState('');
  const [useCase, setUseCase] = useState('');

  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [answer, setAnswer] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const loadChallenge = useCallback(async () => {
    setAnswer('');
    try {
      const res = await fetch('/api/enquiries/captcha', { cache: 'no-store' });
      if (!res.ok) throw new Error('captcha');
      setChallenge(await res.json());
    } catch {
      setChallenge(null);
    }
  }, []);

  useEffect(() => { loadChallenge(); }, [loadChallenge]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (sending || !challenge) return;
    setSending(true);
    setError('');
    try {
      const res = await fetch('/api/access-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, email, company, machineCount, useCase, sourcePage,
          captchaToken: challenge.token,
          captchaAnswer: answer,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.');
        if (data.refresh) await loadChallenge();
        return;
      }
      // `duplicate` comes back when the address already has an account or an
      // open request. Shown as success on purpose — the alternative tells an
      // anonymous visitor whether an address is registered here.
      setDone(true);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <div className="mk-card" style={{ padding: 32, textAlign: 'center' }}>
        <CheckCircle2 size={34} style={{ color: 'var(--live)' }} aria-hidden="true" />
        <h3 className="mk-h3" style={{ fontSize: 20, marginTop: 14 }}>You are in the queue.</h3>
        <p className="mk-body" style={{ marginTop: 10, maxWidth: 460, marginInline: 'auto' }}>
          A confirmation is on its way to <strong style={{ color: 'var(--txt)' }}>{email}</strong>.
          A person reviews these by hand — when yours is approved you will get a second email with
          a link to create your account.
        </p>
        <p className="mk-small" style={{ marginTop: 14, maxWidth: 460, marginInline: 'auto' }}>
          Don’t want to wait? Dialout is open source. You can run your own copy today.
        </p>
      </div>
    );
  }

  return (
    <form className="mk-card" style={{ padding: 28 }} onSubmit={submit} noValidate>
      <div style={{ display: 'grid', gap: 16 }}>
        <div>
          <label style={label} htmlFor="ar-name">Your name</label>
          <input id="ar-name" style={field} value={name} onChange={(e) => setName(e.target.value)}
            required maxLength={120} autoComplete="name" />
        </div>

        <div>
          <label style={label} htmlFor="ar-email">Work email</label>
          <input id="ar-email" type="email" style={field} value={email}
            onChange={(e) => setEmail(e.target.value)} required maxLength={200} autoComplete="email" />
          <p className="mk-small" style={{ marginTop: 7 }}>
            Your invite will be locked to this address, so use the one you want to sign in with.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          <div>
            <label style={label} htmlFor="ar-company">Company <span style={{ fontWeight: 400, color: 'var(--dim)' }}>(optional)</span></label>
            <input id="ar-company" style={field} value={company}
              onChange={(e) => setCompany(e.target.value)} maxLength={160} autoComplete="organization" />
          </div>
          <div>
            <label style={label} htmlFor="ar-machines">How many machines?</label>
            <select id="ar-machines" style={field} value={machineCount}
              onChange={(e) => setMachineCount(e.target.value)}>
              <option value="">Not sure yet</option>
              <option value="1">Just one</option>
              <option value="2-3">2 – 3</option>
              <option value="4-10">4 – 10</option>
              <option value="10+">More than 10</option>
            </select>
          </div>
        </div>

        <div>
          <label style={label} htmlFor="ar-usecase">
            What do you want to use it for? <span style={{ fontWeight: 400, color: 'var(--dim)' }}>(optional)</span>
          </label>
          <textarea id="ar-usecase" style={{ ...field, minHeight: 96, resize: 'vertical' }}
            value={useCase} onChange={(e) => setUseCase(e.target.value)} maxLength={2000}
            placeholder="A sentence is plenty — e.g. “reaching my office Mac and a build box from my laptop and phone”." />
        </div>

        <div>
          <label style={label} htmlFor="ar-captcha">Type the code below</label>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div aria-hidden="true" style={{
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              fontSize: 21, fontWeight: 700, letterSpacing: '0.32em',
              background: '#0c0e13', color: '#d6dae3',
              padding: '11px 8px 11px 18px', borderRadius: 10,
              userSelect: 'none', minWidth: 132, textAlign: 'center',
            }}>
              {challenge ? challenge.code : '·····'}
            </div>
            <button type="button" onClick={loadChallenge} className="mk-cta-ghost"
              style={{ padding: '9px 13px', borderRadius: 10 }} aria-label="Get a new code">
              <RefreshCw size={15} />
            </button>
            <input id="ar-captcha" style={{ ...field, flex: 1, minWidth: 120, textTransform: 'uppercase' }}
              value={answer} onChange={(e) => setAnswer(e.target.value)} required maxLength={12}
              autoComplete="off" spellCheck={false} aria-label="The code shown" />
          </div>
          {!challenge ? (
            <p className="mk-small" style={{ marginTop: 8, color: 'var(--offline)' }}>
              Could not load a code. Refresh the page, or email us directly.
            </p>
          ) : null}
        </div>

        {error ? (
          <div role="alert" style={{
            display: 'flex', gap: 9, alignItems: 'flex-start',
            background: 'var(--glass)', border: '1px solid var(--b2)',
            borderRadius: 10, padding: '11px 13px',
          }}>
            <AlertCircle size={16} style={{ color: 'var(--offline)', flexShrink: 0, marginTop: 1 }} />
            <span className="mk-body" style={{ fontSize: 14 }}>{error}</span>
          </div>
        ) : null}

        <div>
          <button type="submit" className="mk-cta" disabled={sending || !challenge}
            style={{ opacity: sending || !challenge ? 0.6 : 1 }}>
            {sending ? <Loader2 size={16} className="animate-spin" /> : null}
            {sending ? 'Sending…' : 'Request access'}
          </button>
        </div>
      </div>
    </form>
  );
}
