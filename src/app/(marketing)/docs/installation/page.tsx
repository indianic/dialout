import type { Metadata } from 'next';
import Link from 'next/link';
import PageHeader from '@/components/marketing/PageHeader';
import CopyCommand from '@/components/marketing/CopyCommand';

export const metadata: Metadata = {
  title: 'Installation — Dialout',
  description:
    'Server requirements, environment variables, reverse proxy configuration, process management, and agent installation.',
};

const ENV_REQUIRED = [
  { k: 'DATABASE_URL', v: 'PostgreSQL connection string.' },
  { k: 'JWT_SECRET', v: 'Session signing secret. Unique per deployment — a session minted by one deployment must not be valid on another.' },
];

const ENV_OPTIONAL = [
  { k: 'NEXT_PUBLIC_APP_URL', v: 'Public URL of the web app.' },
  { k: 'NEXT_PUBLIC_WS_URL', v: 'Public WebSocket URL, usually the app URL with a /ws prefix.' },
  { k: 'PORT', v: 'Web app port. Defaults to 50051.' },
  { k: 'WS_PORT', v: 'WebSocket server port. Defaults to 50052.' },
  { k: 'WS_HOST', v: 'Bind address for the WebSocket server. Leave it on 127.0.0.1 unless it runs on a different host — and firewall it if you change it.' },
  { k: 'WS_INTERNAL_TOKEN', v: 'Token for the app-to-WebSocket relay. Derived from JWT_SECRET when unset, identically on both sides.' },
  { k: 'SMTP_HOST / PORT / USER / PASS', v: 'Outbound mail for PIN resets and share invitations.' },
  { k: 'FROM_EMAIL / FROM_NAME', v: 'Sender identity on those emails.' },
  { k: 'VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT', v: 'Web push. Push is disabled rather than broken when unset — but use the same pair in development and production, or existing subscriptions stop working.' },
];

export default function InstallationPage() {
  return (
    <>
      <PageHeader
        eyebrow="Documentation · Installation"
        title="The full server setup."
        lede="The quick start gets it running on a laptop. This is what changes when it needs to survive a reboot and face the internet."
      />

      <section className="mk-section">
        <div className="mk-wrap">
          <div style={{ maxWidth: 860 }}>
          <span className="mk-eyebrow">Requirements</span>
          <h2 className="mk-h2">What the server needs.</h2>
          <div className="mk-grid-2" style={{ marginTop: 24 }}>
            {[
              { t: 'Node', b: 'A current LTS release. The agent build and the WebSocket process both run on it.' },
              { t: 'PostgreSQL', b: 'One database. Keep it on localhost, or behind a private network.' },
              { t: 'A reverse proxy', b: 'Apache, Nginx or Caddy — anything that can forward a WebSocket upgrade. This is the step people get wrong.' },
              { t: 'A process manager', b: 'PM2 is what the repository ships configuration for, running the web app and the WebSocket process as two apps.' },
            ].map((r) => (
              <div key={r.t} className="mk-card">
                <h3 className="mk-h3">{r.t}</h3>
                <p className="mk-body" style={{ marginTop: 8, fontSize: 14.5 }}>{r.b}</p>
              </div>
            ))}
          </div>
          </div>
        </div>
      </section>

      <hr className="mk-rule" />
      <section className="mk-section">
        <div className="mk-wrap">
          <div style={{ maxWidth: 860 }}>
          <span className="mk-eyebrow">Environment</span>
          <h2 className="mk-h2">Two required, the rest optional.</h2>

          <h3 className="mk-h3" style={{ marginTop: 28 }}>Required</h3>
          <div style={{ marginTop: 12 }}>
            {ENV_REQUIRED.map((e) => (
              <div key={e.k} style={{ padding: '14px 0', borderTop: '1px solid var(--b1)' }}>
                <code className="mk-lit">{e.k}</code>
                <p className="mk-body" style={{ marginTop: 8, fontSize: 14.5 }}>{e.v}</p>
              </div>
            ))}
          </div>

          <h3 className="mk-h3" style={{ marginTop: 32 }}>Optional</h3>
          <div style={{ marginTop: 12 }}>
            {ENV_OPTIONAL.map((e) => (
              <div key={e.k} style={{ padding: '14px 0', borderTop: '1px solid var(--b1)' }}>
                <code className="mk-lit">{e.k}</code>
                <p className="mk-body" style={{ marginTop: 8, fontSize: 14.5 }}>{e.v}</p>
              </div>
            ))}
          </div>
          </div>
        </div>
      </section>

      <hr className="mk-rule" />
      <section className="mk-section">
        <div className="mk-wrap">
          <div style={{ maxWidth: 860 }}>
          <span className="mk-eyebrow">Reverse proxy</span>
          <h2 className="mk-h2">Two upstreams, one of them a WebSocket.</h2>
          <p className="mk-body" style={{ marginTop: 14 }}>
            The web app and the WebSocket server are separate processes on separate ports. Route{' '}
            <code className="mk-lit">/</code> to the app and{' '}
            <code className="mk-lit">/ws/</code> to the WebSocket server, and make sure the{' '}
            <code className="mk-lit">Upgrade</code> and <code className="mk-lit">Connection</code>{' '}
            headers survive the hop. Terminals connecting and then doing nothing is almost always
            this.
          </p>

          <div className="mk-dark" style={{ marginTop: 22 }}>
            <div className="mk-dark-head"><span>nginx</span></div>
            <div className="mk-term" style={{ fontSize: 12.5 }}>
{`location / {
    proxy_pass http://127.0.0.1:50051;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location /ws/ {
    proxy_pass http://127.0.0.1:50052;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s;
}`}
            </div>
          </div>

          <div className="mk-dark" style={{ marginTop: 18 }}>
            <div className="mk-dark-head"><span>apache</span></div>
            <div className="mk-term" style={{ fontSize: 12.5 }}>
{`RewriteEngine On
RewriteCond %{HTTP:Upgrade} =websocket [NC]
RewriteRule ^/ws/(.*) ws://127.0.0.1:50052/ws/$1 [P,L]

ProxyPass        /ws/  http://127.0.0.1:50052/ws/
ProxyPassReverse /ws/  http://127.0.0.1:50052/ws/
ProxyPass        /     http://127.0.0.1:50051/
ProxyPassReverse /     http://127.0.0.1:50051/`}
            </div>
          </div>

          <p className="mk-small" style={{ marginTop: 14 }}>
            Terminate TLS at the proxy. Sessions and terminal traffic are not safe over plain HTTP.
          </p>
          </div>
        </div>
      </section>

      <hr className="mk-rule" />
      <section className="mk-section">
        <div className="mk-wrap">
          <div style={{ maxWidth: 860 }}>
          <span className="mk-eyebrow">Running it</span>
          <h2 className="mk-h2">Build, then start both processes.</h2>
          <div style={{ display: 'grid', gap: 16, marginTop: 22 }}>
            <CopyCommand command="npm run build" />
            <CopyCommand command="npm run pm2:start" note="Starts the web app and the WebSocket process, then saves the PM2 process list" />
          </div>
          <p className="mk-body" style={{ marginTop: 16 }}>
            On a server that shares its database with another environment, use the migration
            scripts rather than <code className="mk-lit">db:push</code> — the latter diffs the
            schema and will drop what it does not recognise.
          </p>
          </div>
        </div>
      </section>

      <hr className="mk-rule" />
      <section className="mk-section">
        <div className="mk-wrap">
          <div style={{ maxWidth: 860 }}>
          <span className="mk-eyebrow">Security checklist</span>
          <h2 className="mk-h2">Before you point a real machine at it.</h2>
          <ul style={{ margin: '20px 0 0', padding: 0, listStyle: 'none' }}>
            {[
              'JWT_SECRET is strong and unique to this deployment.',
              'TLS terminates in front of the app, and HTTP redirects to HTTPS.',
              'The WebSocket server is on 127.0.0.1, or firewalled if it is not.',
              'PostgreSQL is not listening on a public interface.',
              'Every account has two-factor enrolled — the API enforces it, but check nobody is stuck half-enrolled.',
              'You know what is currently tunnelled. Anything tunnelled is reachable by anyone with the URL.',
            ].map((c) => (
              <li key={c} className="mk-body" style={{ padding: '11px 0', borderTop: '1px solid var(--b1)', fontSize: 14.5 }}>
                {c}
              </li>
            ))}
          </ul>
          <div className="mk-cta-row" style={{ marginTop: 30 }}>
            <Link href="/docs/api" className="mk-cta-ghost">The API</Link>
            <Link href="/installation-service" className="mk-cta-ghost">Have us do it</Link>
          </div>
          </div>
        </div>
      </section>
    </>
  );
}
