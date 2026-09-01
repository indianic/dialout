'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, RefreshCw, AlertCircle } from 'lucide-react';

/**
 * The public enquiry form, used by /contact and /enterprise.
 *
 * One component for both because the difference is four extra qualifying
 * fields, not a different flow — and a second near-identical form is how the
 * two drift apart.
 *
 * On success the form is replaced by the confirmation rather than showing a
 * banner above a still-filled form: the submission is finished, so leaving a
 * live Send button on screen invites a double send.
 */

type Kind = 'contact' | 'enterprise';

interface Props {
  kind: Kind;
  sourcePage: string;
  /** Heading shown once the enquiry has been sent. */
  doneTitle?: string;
}

interface Challenge {
  code: string;
  token: string;
}

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

export default function EnquiryForm({ kind, sourcePage, doneTitle }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [phone, setPhone] = useState('');
  const [machines, setMachines] = useState('');
  const [teamSize, setTeamSize] = useState('');
  const [hosting, setHosting] = useState('');
  const [securityReview, setSecurityReview] = useState(false);
  const [message, setMessage] = useState('');

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
      // Leaving challenge null disables the Send button and says why, rather
      // than letting someone fill the whole form and fail at the last step.
      setChallenge(null);
    }
  }, []);

  useEffect(() => {
    loadChallenge();
  }, [loadChallenge]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (sending || !challenge) return;
    setSending(true);
    setError('');

    try {
      const res = await fetch('/api/enquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind, sourcePage, name, email, company, phone, message,
          machines, teamSize, hosting, securityReview,
          captchaToken: challenge.token,
          captchaAnswer: answer,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.');
        // A spent or expired token can never succeed, so replace it rather
        // than letting the user retype into a dead challenge.
        if (data.refresh) await loadChallenge();
        return;
      }
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
        <h3 className="mk-h3" style={{ fontSize: 20, marginTop: 14 }}>
          {doneTitle || 'Thanks — we have it.'}
        </h3>
        <p className="mk-body" style={{ marginTop: 10, maxWidth: 440, marginInline: 'auto' }}>
          A confirmation is on its way to{' '}
          <strong style={{ color: 'var(--txt)' }}>{email}</strong>. A person will reply, usually
          within one working day.
        </p>
      </div>
    );
  }

  const isEnterprise = kind === 'enterprise';

  return (
    <form className="mk-card" style={{ padding: 28 }} onSubmit={submit} noValidate>
      <div style={{ display: 'grid', gap: 16 }}>
        <div className="mk-grid-2" style={{ gap: 16 }}>
          <div>
            <label style={label} htmlFor="eq-name">Name</label>
            <input id="eq-name" style={field} value={name} onChange={(e) => setName(e.target.value)}
              required maxLength={120} autoComplete="name" />
          </div>
          <div>
            <label style={label} htmlFor="eq-email">Email</label>
            <input id="eq-email" style={field} type="email" value={email}
              onChange={(e) => setEmail(e.target.value)} required maxLength={200} autoComplete="email" />
          </div>
        </div>

        <div className="mk-grid-2" style={{ gap: 16 }}>
          <div>
            <label style={label} htmlFor="eq-company">
              Company <span style={{ color: 'var(--dim)', fontWeight: 400 }}>(optional)</span>
            </label>
            <input id="eq-company" style={field} value={company}
              onChange={(e) => setCompany(e.target.value)} maxLength={160} autoComplete="organization" />
          </div>
          <div>
            <label style={label} htmlFor="eq-phone">
              Phone <span style={{ color: 'var(--dim)', fontWeight: 400 }}>(optional)</span>
            </label>
            <input id="eq-phone" style={field} value={phone}
              onChange={(e) => setPhone(e.target.value)} maxLength={60} autoComplete="tel" />
          </div>
        </div>

        {/* The three answers the enterprise page says decide the shape of an
            engagement. Asking here saves a round trip. */}
        {isEnterprise ? (
          <>
            <div className="mk-grid-2" style={{ gap: 16 }}>
              <div>
                <label style={label} htmlFor="eq-machines">How many machines?</label>
                <input id="eq-machines" style={field} value={machines}
                  onChange={(e) => setMachines(e.target.value)} maxLength={60} placeholder="e.g. 40" />
              </div>
              <div>
                <label style={label} htmlFor="eq-team">How many people?</label>
                <input id="eq-team" style={field} value={teamSize}
                  onChange={(e) => setTeamSize(e.target.value)} maxLength={60} placeholder="e.g. 15" />
              </div>
            </div>
            <div>
              <label style={label} htmlFor="eq-hosting">Where would you host it?</label>
              <input id="eq-hosting" style={field} value={hosting}
                onChange={(e) => setHosting(e.target.value)} maxLength={120}
                placeholder="AWS, Azure, GCP, DigitalOcean, on-premise…" />
            </div>
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
              <input type="checkbox" checked={securityReview}
                onChange={(e) => setSecurityReview(e.target.checked)}
                style={{ marginTop: 3, width: 16, height: 16, accentColor: 'var(--accent)' }} />
              <span className="mk-body" style={{ fontSize: 14 }}>
                We have a security review to get through
              </span>
            </label>
          </>
        ) : null}

        <div>
          <label style={label} htmlFor="eq-message">
            {isEnterprise ? 'What are you trying to do?' : 'Your message'}
          </label>
          <textarea id="eq-message" style={{ ...field, minHeight: 130, resize: 'vertical' }}
            value={message} onChange={(e) => setMessage(e.target.value)} required maxLength={4000}
            placeholder={isEnterprise
              ? 'What you are running today, and what you need it to do.'
              : 'Tell us what you need.'} />
          <p className="mk-small" style={{ marginTop: 7 }}>
            Please don’t include credentials, API keys or <code className="mk-lit">.env</code>{' '}
            contents. We never need them.
          </p>
        </div>

        {/* Captcha. The code is generated and checked on the server; the answer
            is never sent to the browser. */}
        <div>
          <label style={label} htmlFor="eq-captcha">Type the code below</label>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div
              aria-hidden="true"
              style={{
                fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                fontSize: 21, fontWeight: 700, letterSpacing: '0.32em',
                background: '#0c0e13', color: '#d6dae3',
                padding: '11px 8px 11px 18px', borderRadius: 10,
                userSelect: 'none', minWidth: 132, textAlign: 'center',
              }}
            >
              {challenge ? challenge.code : '·····'}
            </div>
            <button type="button" onClick={loadChallenge} className="mk-cta-ghost"
              style={{ padding: '9px 13px', borderRadius: 10 }} aria-label="Get a new code">
              <RefreshCw size={15} />
            </button>
            <input id="eq-captcha" style={{ ...field, flex: 1, minWidth: 120, textTransform: 'uppercase' }}
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
            {sending ? 'Sending…' : isEnterprise ? 'Send enquiry' : 'Send message'}
          </button>
        </div>
      </div>
    </form>
  );
}
