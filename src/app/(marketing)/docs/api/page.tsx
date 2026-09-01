import type { Metadata } from 'next';
import Link from 'next/link';
import PageHeader from '@/components/marketing/PageHeader';
import { GITHUB_URL, COUNTS } from '@/lib/marketing-content';

export const metadata: Metadata = {
  title: 'API — Dialout',
  description:
    'The HTTP contract for native clients: cookie or bearer authentication, the native client header, and where the OpenAPI document lives.',
};

export default function ApiPage() {
  return (
    <>
      <PageHeader
        eyebrow="Documentation · API"
        title="One API, two ways to authenticate."
        lede={`${COUNTS.apiRoutes} routes. Every one authenticates, and every client-supplied id is authorized separately — a valid session only proves you are some user.`}
      />

      <section className="mk-section">
        <div className="mk-wrap">
          <div style={{ maxWidth: 860 }}>
          <span className="mk-eyebrow">Authentication</span>
          <h2 className="mk-h2">A cookie for browsers, a bearer token for everything else.</h2>
          <p className="mk-body" style={{ marginTop: 14 }}>
            Both carry the same JWT. Browsers get it as an HttpOnly cookie, which page scripts
            cannot read. Native clients ask for it explicitly and send it as a bearer token. When
            both are present, the bearer token wins.
          </p>

          <div className="mk-dark" style={{ marginTop: 22 }}>
            <div className="mk-dark-head"><span>Getting a token as a native client</span></div>
            <div className="mk-term" style={{ fontSize: 12.5 }}>
{`POST /api/auth
Content-Type: application/json
X-DevDash-Client: native

{ "action": "login", "email": "you@example.com", "pin": "…" }`}
            </div>
          </div>

          <p className="mk-body" style={{ marginTop: 18 }}>
            The raw token is returned in the response body <strong>only</strong> when the request
            carries the native client header. The header is still spelled{' '}
            <code className="mk-lit">X-DevDash-Client</code> — it is a wire name that shipped
            mobile clients are pinned to, so it did not get renamed with the brand. Browsers deliberately never send it, so a script on
            a page cannot read or exfiltrate a session even if it can make the request.
          </p>

          <div className="mk-dark" style={{ marginTop: 18 }}>
            <div className="mk-dark-head"><span>Using it</span></div>
            <div className="mk-term" style={{ fontSize: 12.5 }}>
{`GET /api/projects
Authorization: Bearer <jwt>`}
            </div>
          </div>

          <p className="mk-body" style={{ marginTop: 18 }}>
            The same two credentials authenticate the WebSocket upgrade — the cookie, or the token
            as a query parameter.
          </p>
          </div>
        </div>
      </section>

      <hr className="mk-rule" />
      <section className="mk-section">
        <div className="mk-wrap">
          <div style={{ maxWidth: 860 }}>
          <span className="mk-eyebrow">Shape</span>
          <h2 className="mk-h2">What to expect from a route.</h2>
          <div style={{ marginTop: 20 }}>
            {[
              {
                t: 'Authentication is mandatory everywhere',
                b: 'There is no unauthenticated data route. Two-factor is enforced at the API layer as well as in the interface, so a half-enrolled account cannot read data by talking to the API directly.',
              },
              {
                t: 'A 404 may mean "not yours"',
                b: 'Denials by id return 404 rather than 403, deliberately, so ids cannot be enumerated by watching which ones come back forbidden.',
              },
              {
                t: 'Auth is one route, dispatched by action',
                b: 'Login, two-factor verification, enrolment, registration, PIN reset, two-factor reset, machine switching and logout are all POSTs to the auth route with an action field.',
              },
              {
                t: 'Listing a secret never returns it',
                b: 'Credentials, two-factor secrets and machine API keys are encrypted at rest and are never included in a list response — only an explicit reveal route returns one.',
              },
              {
                t: 'The projects list is the expensive call',
                b: 'It live-checks every port on every request, relaying through the agent when one is online. Treat it as the hot path it is, and do not poll it in a tight loop.',
              },
            ].map((x) => (
              <div key={x.t} style={{ padding: '16px 0', borderTop: '1px solid var(--b1)' }}>
                <h3 className="mk-h3">{x.t}</h3>
                <p className="mk-body" style={{ marginTop: 7, fontSize: 14.5 }}>{x.b}</p>
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
          <span className="mk-eyebrow">The contract</span>
          <h2 className="mk-h2">OpenAPI, hand-maintained.</h2>
          <p className="mk-body" style={{ marginTop: 14 }}>
            The full specification lives in the repository at{' '}
            <code className="mk-lit">docs/api/openapi.yaml</code>. It is written by hand rather
            than generated, which is worth knowing in both directions: it describes what native
            clients are actually pinned to, and it drifts if a route change does not update it in
            the same commit.
          </p>
          <p className="mk-body" style={{ marginTop: 14 }}>
            If you are building against it and find a mismatch, that is a bug worth reporting —
            a shipped mobile app is pinned to that document in a way the web interface never was.
          </p>
          <div className="mk-cta-row" style={{ marginTop: 26 }}>
            <a
              href={`${GITHUB_URL}/blob/main/docs/api/openapi.yaml`}
              className="mk-cta"
              target="_blank"
              rel="noreferrer noopener"
            >
              Read the OpenAPI document
            </a>
            <Link href="/support" className="mk-cta-ghost">Report a mismatch</Link>
          </div>
          </div>
        </div>
      </section>
    </>
  );
}
