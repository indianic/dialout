import type { Metadata } from 'next';
import Link from 'next/link';
import PageHeader from '@/components/marketing/PageHeader';
import { COUNTS } from '@/lib/marketing-content';

export const metadata: Metadata = {
  title: 'How it works — Dialout',
  description:
    'The outbound-only agent, the three processes, and why the HTTP tunnel rewrites responses instead of just proxying them.',
};

export default function HowItWorksPage() {
  return (
    <>
      <PageHeader
        eyebrow="How it works"
        title="One principle, three processes."
        lede="The agent connects out. Everything else in the architecture follows from that one decision, including the parts that look unusual."
      />

      {/* The architecture, drawn in the mono the product uses for literals. */}
      <section className="mk-section">
        <div className="mk-wrap">
          <span className="mk-eyebrow">Architecture</span>
          <h2 className="mk-h2">Where each connection goes.</h2>
          <p className="mk-body" style={{ marginTop: 16, maxWidth: 620 }}>
            Read the arrows. Every one that touches a developer machine points away from it.
          </p>

          <div className="mk-dark" style={{ marginTop: 28 }}>
            <div className="mk-dark-head"><span>Topology</span></div>
            <div className="mk-term" style={{ fontSize: 12.5 }}>
{`Browser ──HTTP──▶ Next.js :50051 ──HTTP (localhost)──┐
   │                                                  │
   └──WS /ws/* ──▶ ws-server :50052 ◀──WSS /daemon────┴── agent
                        │                                (your machine)
                   PostgreSQL`}
            </div>
          </div>

          <div className="mk-grid-3" style={{ marginTop: 28 }}>
            {[
              { t: 'The web app', p: ':50051', b: 'UI and REST API. Holds sessions, database writes and authorization. It never talks to an agent directly — every daemon call goes through one module, over localhost, behind an internal token.' },
              { t: 'The WebSocket server', p: ':50052', b: `The only process that holds agent sockets. ${COUNTS.wsServerLines} lines in one file, bound to 127.0.0.1 by default because its relay endpoints are remote command execution if they are reachable.` },
              { t: 'The agent', p: 'your machine', b: `A CLI daemon with ${COUNTS.agentCommands} commands, installed as a launchd or systemd service with a cron watchdog. It dials out and holds the socket open.` },
            ].map((c) => (
              <div key={c.t} className="mk-card">
                <h3 className="mk-h3">{c.t}</h3>
                <code className="mk-lit" style={{ display: 'inline-block', marginTop: 8 }}>{c.p}</code>
                <p className="mk-body" style={{ marginTop: 11, fontSize: 14.5 }}>{c.b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <hr className="mk-rule" />
      <section className="mk-section">
        <div className="mk-wrap">
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,.8fr) minmax(0,1.2fr)', gap: 48 }} className="mk-hero-grid">
            <div>
              <span className="mk-eyebrow">The outbound principle</span>
              <h2 className="mk-h2">Why nothing dials in.</h2>
            </div>
            <div>
              <p className="mk-body">
                Every remote-management tool has to solve the same problem: your server needs to
                reach a machine that is behind NAT, on a corporate network, or on hotel Wi-Fi.
                Most solve it by asking you to open something — a forwarded port, a VPN, a
                firewall rule, an inbound tunnel.
              </p>
              <p className="mk-body" style={{ marginTop: 14 }}>
                Dialout inverts it. The agent opens the connection and keeps it, so the machine
                needs no inbound reachability at all. A laptop that moves between four networks a
                day stays online the whole time, and the security surface on it is a single
                outbound socket rather than a listening port.
              </p>
              <p className="mk-body" style={{ marginTop: 14 }}>
                The cost is that the server has to hold every socket, which is why that is one
                dedicated process rather than something the web app does on the side.
              </p>
            </div>
          </div>
        </div>
      </section>

      <hr className="mk-rule" />
      <section className="mk-section">
        <div className="mk-wrap">
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,.8fr) minmax(0,1.2fr)', gap: 48 }} className="mk-hero-grid">
            <div>
              <span className="mk-eyebrow">Terminals</span>
              <h2 className="mk-h2">Detach, don’t kill.</h2>
            </div>
            <div>
              <p className="mk-body">
                Every terminal is a tmux session, so the shell outlives the browser tab. When a
                browser socket drops, the server keeps the PTY for ten minutes so a reconnect
                resumes exactly where you were. Past that it detaches the tmux client and leaves
                the session running — only closing the terminal deliberately ends it.
              </p>
              <p className="mk-body" style={{ marginTop: 14 }}>
                Session names are deterministic, so reopening a tab attaches to the session that
                is already there instead of starting a second one. A tab’s startup command is
                deliberately not replayed on that path: it would type a command into the session
                you just rejoined.
              </p>
              <p className="mk-body" style={{ marginTop: 14 }}>
                <code className="mk-lit">setup-cowork</code> writes a guarded block into your
                shell rc so a terminal you open normally joins the same tmux. Everything
                interpolated into that block is filtered first — it is a file the tool writes into
                your shell startup, and it is treated that way.
              </p>
            </div>
          </div>
        </div>
      </section>

      <hr className="mk-rule" />
      <section className="mk-section">
        <div className="mk-wrap">
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,.8fr) minmax(0,1.2fr)', gap: 48 }} className="mk-hero-grid">
            <div>
              <span className="mk-eyebrow">AI sessions</span>
              <h2 className="mk-h2">Read the transcript, not the screen.</h2>
            </div>
            <div>
              <p className="mk-body">
                Claude Code, Codex and Grok each already write a structured JSONL transcript of
                the session. The agent finds the right file, tails it, and normalises all three
                into one event type — so the chat surface does not know or care which CLI produced
                a message.
              </p>
              <p className="mk-body" style={{ marginTop: 14 }}>
                The alternative would be scraping the terminal UI, which breaks on every upstream
                release. Finding the file is the hard part instead: each vendor escapes the
                working directory differently, and a session’s directory can change mid-session,
                so a transcript is matched against any directory its header mentions rather than
                just the first.
              </p>
            </div>
          </div>
        </div>
      </section>

      <hr className="mk-rule" />
      <section className="mk-section">
        <div className="mk-wrap">
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,.8fr) minmax(0,1.2fr)', gap: 48 }} className="mk-hero-grid">
            <div>
              <span className="mk-eyebrow">The tunnel</span>
              <h2 className="mk-h2">A proxy is not enough.</h2>
            </div>
            <div>
              <p className="mk-body">
                Serving a local app under a path prefix breaks it. The app emits absolute paths —{' '}
                <code className="mk-lit">/_next/…</code>, <code className="mk-lit">/api/…</code> —
                that resolve to the wrong place, so the page loads its shell and then stalls.
              </p>
              <p className="mk-body" style={{ marginTop: 14 }}>
                So the tunnel rewrites the response. Absolute paths are rewritten in HTML, CSS and
                JavaScript, and an injected script patches <code className="mk-lit">fetch</code>,{' '}
                <code className="mk-lit">XMLHttpRequest</code>,{' '}
                <code className="mk-lit">history.pushState</code>, anchor clicks and the Navigation
                API at runtime. Redirect <code className="mk-lit">Location</code> headers are
                rewritten too, and <code className="mk-lit">content-encoding</code> is stripped
                because the body was decoded to rewrite it.
              </p>
              <p className="mk-body" style={{ marginTop: 14 }}>
                Bodies are capped at 10 MB. Machine-offline and server-not-running both return a
                styled page rather than a proxy error, because the reader is usually a client who
                does not know what either of those means.
              </p>
            </div>
          </div>
        </div>
      </section>

      <hr className="mk-rule" />
      <section className="mk-section">
        <div className="mk-wrap" style={{ textAlign: 'center' }}>
          <h2 className="mk-h2">Fifteen minutes to a working install.</h2>
          <div className="mk-cta-row" style={{ marginTop: 22, justifyContent: 'center' }}>
            <Link href="/docs/quick-start" className="mk-cta">Quick start</Link>
            <Link href="/features" className="mk-cta-ghost">Full feature list</Link>
          </div>
        </div>
      </section>
    </>
  );
}
