import type { Metadata } from 'next';
import Link from 'next/link';
import PageHeader from '@/components/marketing/PageHeader';
import CopyCommand from '@/components/marketing/CopyCommand';

export const metadata: Metadata = {
  title: 'Quick start — Dialout',
  description: 'From nothing to a machine showing green, in about fifteen minutes.',
};

export default function QuickStartPage() {
  return (
    <>
      <PageHeader
        eyebrow="Documentation · Quick start"
        title="Running in about fifteen minutes."
        lede="Two halves: the server once, then the agent on every machine you want to see. Do them in that order — the agent needs a key the server issues."
      />

      <section className="mk-section">
        <div className="mk-wrap">
          <div style={{ maxWidth: 820 }}>
          <span className="mk-eyebrow">Part one · the server</span>
          <h2 className="mk-h2">Once, on the machine you will keep.</h2>
          <p className="mk-body" style={{ marginTop: 14 }}>
            You need Node and PostgreSQL. Anywhere they both run is fine — a small VPS is plenty.
          </p>

          <div style={{ display: 'grid', gap: 22, marginTop: 28 }}>
            <div>
              <h3 className="mk-h3">1. Create the database</h3>
              <div style={{ marginTop: 10 }}><CopyCommand command="createdb dialout" /></div>
            </div>

            <div>
              <h3 className="mk-h3">2. Get the code and its dependencies</h3>
              <div style={{ marginTop: 10 }}>
                <CopyCommand command="git clone https://github.com/indianic/dialout.git && cd dialout && npm install" />
              </div>
            </div>

            <div>
              <h3 className="mk-h3">3. Configure it</h3>
              <p className="mk-body" style={{ marginTop: 7, fontSize: 14.5 }}>
                Copy the example environment file and set two values:{' '}
                <code className="mk-lit">DATABASE_URL</code> and{' '}
                <code className="mk-lit">JWT_SECRET</code>. Everything else is optional.
              </p>
              <div style={{ marginTop: 10 }}>
                <CopyCommand
                  command="cp .env.example .env"
                  note="JWT_SECRET must be set — the WebSocket server refuses to start without a signing secret, because a token derived from an empty string would be guessable"
                />
              </div>
            </div>

            <div>
              <h3 className="mk-h3">4. Create the schema</h3>
              <div style={{ marginTop: 10 }}>
                <CopyCommand command="npm run db:push" note="Local and development only. Production schema changes go through the migration scripts." />
              </div>
            </div>

            <div>
              <h3 className="mk-h3">5. Start it</h3>
              <div style={{ marginTop: 10 }}>
                <CopyCommand command="npm run dev" note="Web app on :50051, WebSocket server on :50052" />
              </div>
              <p className="mk-body" style={{ marginTop: 10, fontSize: 14.5 }}>
                Open <code className="mk-lit">http://localhost:50051</code>, register, and enrol
                two-factor. Two-factor is mandatory and enforced by the API, not just the
                interface — there is no way to skip it.
              </p>
            </div>
          </div>
          </div>
        </div>
      </section>

      <hr className="mk-rule" />
      <section className="mk-section">
        <div className="mk-wrap">
          <div style={{ maxWidth: 820 }}>
          <span className="mk-eyebrow">Part two · each machine</span>
          <h2 className="mk-h2">The agent, on everything you want to see.</h2>
          <p className="mk-body" style={{ marginTop: 14 }}>
            First, in the dashboard: <strong>Settings → Machines → add a machine</strong>. It gives
            you a key starting <code className="mk-lit">mch_</code>. Keep it — it is shown once.
          </p>

          <div style={{ display: 'grid', gap: 22, marginTop: 28 }}>
            <div>
              <h3 className="mk-h3">1. Install it</h3>
              <div style={{ marginTop: 10 }}>
                <CopyCommand command="npm install -g @indianic/dialout" note="macOS and Linux" />
              </div>
            </div>
            <div>
              <h3 className="mk-h3">2. Point it at your server</h3>
              <div style={{ marginTop: 10 }}>
                <CopyCommand command="dialout init" note="Asks for the server URL and the mch_ key" />
              </div>
            </div>
            <div>
              <h3 className="mk-h3">3. Run it as a service</h3>
              <div style={{ marginTop: 10 }}>
                <CopyCommand command="dialout install-service" note="launchd on macOS, systemd on Linux, plus a cron watchdog that restarts it" />
              </div>
            </div>
            <div>
              <h3 className="mk-h3">4. Confirm</h3>
              <div style={{ marginTop: 10 }}>
                <CopyCommand command="dialout status" />
              </div>
              <p className="mk-body" style={{ marginTop: 10, fontSize: 14.5 }}>
                The machine turns green in the dashboard. If you get a 401, the key is not
                registered on the server — re-add the machine and run{' '}
                <code className="mk-lit">init</code> again. It does not mean the agent is
                misconfigured.
              </p>
            </div>
          </div>
          </div>
        </div>
      </section>

      <hr className="mk-rule" />
      <section className="mk-section">
        <div className="mk-wrap">
          <div style={{ maxWidth: 820 }}>
          <span className="mk-eyebrow">Then</span>
          <h2 className="mk-h2">Two things worth doing next.</h2>
          <div className="mk-grid-2" style={{ marginTop: 24 }}>
            <div className="mk-card">
              <h3 className="mk-h3">Scan for projects</h3>
              <p className="mk-body" style={{ marginTop: 8, fontSize: 14.5 }}>
                Point the scanner at a folder tree and it finds the projects you never registered.
                Scan a port range and it tells you what is already answering.
              </p>
            </div>
            <div className="mk-card">
              <h3 className="mk-h3">Wire up cowork</h3>
              <p className="mk-body" style={{ marginTop: 8, fontSize: 14.5 }}>
                <code className="mk-lit">dialout setup-cowork</code> writes a guarded block
                into your shell rc, so a terminal you open normally joins the same tmux session the
                browser attaches to.
              </p>
            </div>
          </div>

          <div className="mk-cta-row" style={{ marginTop: 30 }}>
            <Link href="/docs/installation" className="mk-cta">Full installation guide</Link>
            <Link href="/support" className="mk-cta-ghost">Something went wrong</Link>
          </div>
          </div>
        </div>
      </section>
    </>
  );
}
