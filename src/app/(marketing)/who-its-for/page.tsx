import type { Metadata } from 'next';
import Link from 'next/link';
import PageHeader from '@/components/marketing/PageHeader';
import { AUDIENCES } from '@/lib/marketing-content';

export const metadata: Metadata = {
  title: 'Who it’s for — Dialout',
  description:
    'Who Dialout is built for, and — just as usefully — who should probably run something else.',
};

const NOT_FOR = [
  {
    t: 'You have exactly one machine and one project',
    b: 'A control room for one room is a room. You would spend more time installing it than it saves.',
  },
  {
    t: 'You need it on Windows machines',
    b: 'The server runs anywhere Node runs, but the agent ships for macOS and Linux only — it depends on tmux and on process inspection with no Windows equivalent yet.',
  },
  {
    t: 'You want someone else to host it',
    b: 'There is no hosted tier. If you do not want to run a server, this is the wrong tool — though we will install it on yours.',
  },
  {
    t: 'You are managing production fleets',
    b: 'This is built for the machines you develop on. For servers you deploy to, a real orchestration and observability stack is the right answer.',
  },
];

export default function WhoItsForPage() {
  return (
    <>
      <PageHeader
        eyebrow="Who it’s for"
        title="Built for people with more machines than attention."
        lede="If more than one computer runs your code, the cost is not any single machine — it is remembering which one is running what."
      />

      <section className="mk-section">
        <div className="mk-wrap">
          <span className="mk-eyebrow">A good fit</span>
          <div className="mk-grid-2" style={{ marginTop: 22 }}>
            {AUDIENCES.map((a) => (
              <div key={a.title} className="mk-card">
                <h2 className="mk-h3">{a.title}</h2>
                <p className="mk-body" style={{ marginTop: 9, fontSize: 14.5 }}>{a.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <hr className="mk-rule" />
      <section className="mk-section">
        <div className="mk-wrap">
          <span className="mk-eyebrow">Probably not a fit</span>
          <h2 className="mk-h2">When to run something else.</h2>
          <p className="mk-body" style={{ marginTop: 14, maxWidth: 580 }}>
            Saying this here costs a little traffic and saves you an evening.
          </p>
          <div className="mk-grid-2" style={{ marginTop: 26 }}>
            {NOT_FOR.map((n) => (
              <div key={n.t} style={{ padding: '18px 0', borderTop: '1px solid var(--b1)' }}>
                <h3 className="mk-h3">{n.t}</h3>
                <p className="mk-body" style={{ marginTop: 8, fontSize: 14.5 }}>{n.b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <hr className="mk-rule" />
      <section className="mk-section">
        <div className="mk-wrap" style={{ textAlign: 'center' }}>
          <h2 className="mk-h2">Still sounds like you?</h2>
          <div className="mk-cta-row" style={{ marginTop: 22, justifyContent: 'center' }}>
            <Link href="/docs/quick-start" className="mk-cta">Quick start</Link>
            <Link href="/use-cases" className="mk-cta-ghost">Use cases</Link>
          </div>
        </div>
      </section>
    </>
  );
}
