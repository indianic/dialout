import type { Metadata } from 'next';
import Link from 'next/link';
import PageHeader from '@/components/marketing/PageHeader';
import FleetPanel from '@/components/marketing/FleetPanel';
import { GITHUB_URL } from '@/lib/marketing-content';

export const metadata: Metadata = {
  title: 'Demo — Dialout',
  description: 'What the four main surfaces look like: the fleet, a terminal, an AI session, and a tunnel.',
};

/**
 * There is no hosted instance to demo against — the product is self-hosted by
 * definition, and a shared public one would be a machine anyone could open a
 * terminal on. So this page shows the four surfaces as the product renders
 * them rather than as marketing screenshots, and says plainly that the way to
 * see the real thing is to install it.
 */
export default function DemoPage() {
  return (
    <>
      <PageHeader
        eyebrow="Demo"
        title="There is no public demo, and there is a reason."
        lede="A shared instance would be a machine strangers could open a terminal on. What follows is what each surface actually looks like; installing it takes about fifteen minutes if you want the real one."
      >
        <div className="mk-cta-row" style={{ marginTop: 28 }}>
          <Link href="/docs/quick-start" className="mk-cta">Install it instead</Link>
          <a href={GITHUB_URL} className="mk-cta-ghost" target="_blank" rel="noreferrer noopener">
            Read the source
          </a>
        </div>
      </PageHeader>

      <section className="mk-section">
        <div className="mk-wrap">
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,.85fr) minmax(0,1.15fr)', gap: 48, alignItems: 'center' }} className="mk-hero-grid">
            <div>
              <span className="mk-eyebrow">01 · The fleet</span>
              <h2 className="mk-h2">Every machine, and what is up.</h2>
              <p className="mk-body" style={{ marginTop: 16 }}>
                Ports are checked on every load — batched through the agent when the machine is
                online, and an 800 ms TCP probe when it is not. The arrow direction is the point:
                each machine reached out to the server, not the other way round.
              </p>
            </div>
            <FleetPanel />
          </div>
        </div>
      </section>

      <hr className="mk-rule" />
      <section className="mk-section">
        <div className="mk-wrap">
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.15fr) minmax(0,.85fr)', gap: 48, alignItems: 'center' }} className="mk-hero-grid">
            <div className="mk-dark">
              <div className="mk-dark-head">
                <span>dd-a41f · tmux</span>
                <span className="mk-term-live" aria-hidden="true">attached</span>
              </div>
              <div className="mk-term">
                <span className="mk-term-dim">$ </span><span className="mk-term-cmd">npm run build</span>{'\n'}
                <span className="mk-term-dim">▲ Next.js 15.0.0</span>{'\n'}
                <span className="mk-term-dim">  Creating an optimized production build ...</span>{'\n'}
                <span className="mk-term-live">✓ Compiled successfully</span>{'\n'}
                {'\n'}
                <span className="mk-term-dim"># laptop closed — session keeps running</span>{'\n'}
                <span className="mk-term-dim"># reattached from the phone 40 minutes later</span>{'\n'}
                <span className="mk-term-dim">$ </span><span className="mk-term-cmd">_</span>
              </div>
            </div>
            <div>
              <span className="mk-eyebrow">02 · A terminal</span>
              <h2 className="mk-h2">Real tmux, not a web shell.</h2>
              <p className="mk-body" style={{ marginTop: 16 }}>
                Close the tab and the build carries on. Reattach from another browser or the phone
                and you are in the same session. Open your native terminal and you join that one
                too.
              </p>
            </div>
          </div>
        </div>
      </section>

      <hr className="mk-rule" />
      <section className="mk-section">
        <div className="mk-wrap">
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,.85fr) minmax(0,1.15fr)', gap: 48, alignItems: 'center' }} className="mk-hero-grid">
            <div>
              <span className="mk-eyebrow">03 · An AI session</span>
              <h2 className="mk-h2">Waiting on you, or working.</h2>
              <p className="mk-body" style={{ marginTop: 16 }}>
                Read from the transcript the CLI already writes, so it does not break when the CLI
                redraws its interface. A push fires on the working → waiting transition, with a
                two-minute cooldown.
              </p>
            </div>
            <div className="mk-dark">
              <div className="mk-dark-head">
                <span>claude · mbp-14 · ~/www/api</span>
                <span className="mk-term-warn" aria-hidden="true">waiting</span>
              </div>
              <div className="mk-term" style={{ whiteSpace: 'pre-wrap' }}>
                <span className="mk-term-dim">you  </span>
                <span className="mk-term-cmd">the migration fails on a fresh database</span>{'\n\n'}
                <span className="mk-term-dim">claude  </span>
                <span className="mk-term-cmd">The column is added by a script that is not in the</span>{'\n'}
                <span className="mk-term-cmd">        ordered list, so it never runs. Add it and</span>{'\n'}
                <span className="mk-term-cmd">        redeploy — shall I?</span>{'\n\n'}
                <span className="mk-term-warn">        ▸ waiting for your reply · 2m</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <hr className="mk-rule" />
      <section className="mk-section">
        <div className="mk-wrap">
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.15fr) minmax(0,.85fr)', gap: 48, alignItems: 'center' }} className="mk-hero-grid">
            <div className="mk-dark">
              <div className="mk-dark-head">
                <span>tunnel</span>
                <span className="mk-term-live" aria-hidden="true">200 OK</span>
              </div>
              <div className="mk-term" style={{ whiteSpace: 'pre-wrap' }}>
                <span className="mk-term-dim">local   </span><span className="mk-term-cmd">http://localhost:3000</span>{'\n'}
                <span className="mk-term-dim">public  </span><span style={{ color: '#5b9cf8' }}>https://dialout.dev/ws/tunnel/mbp-14/3000/</span>{'\n\n'}
                <span className="mk-term-dim">rewritten in the response:</span>{'\n'}
                <span className="mk-term-cmd">  /_next/… /api/…  in html, js, css</span>{'\n'}
                <span className="mk-term-cmd">  fetch · XMLHttpRequest · pushState</span>{'\n'}
                <span className="mk-term-cmd">  anchor clicks · Navigation API</span>{'\n'}
                <span className="mk-term-cmd">  Location headers on redirects</span>
              </div>
            </div>
            <div>
              <span className="mk-eyebrow">04 · A tunnel</span>
              <h2 className="mk-h2">Send the URL, not a deploy.</h2>
              <p className="mk-body" style={{ marginTop: 16 }}>
                The response is rewritten so the app survives being served under a path prefix.
                That is the difference between a client seeing your branch and a client seeing a
                page that loads its shell and stops.
              </p>
            </div>
          </div>
        </div>
      </section>

      <hr className="mk-rule" />
      <section className="mk-section">
        <div className="mk-wrap" style={{ textAlign: 'center' }}>
          <h2 className="mk-h2">The real one runs on your server.</h2>
          <div className="mk-cta-row" style={{ marginTop: 22, justifyContent: 'center' }}>
            <Link href="/docs/quick-start" className="mk-cta">Quick start</Link>
            <Link href="/features" className="mk-cta-ghost">Full feature list</Link>
          </div>
        </div>
      </section>
    </>
  );
}
