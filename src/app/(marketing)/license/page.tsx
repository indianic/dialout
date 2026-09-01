import type { Metadata } from 'next';
import Link from 'next/link';
import PageHeader from '@/components/marketing/PageHeader';
import { GITHUB_URL } from '@/lib/marketing-content';

export const metadata: Metadata = {
  title: 'Licence — Dialout',
  description: 'Dialout is MIT licensed. What that means in practice, and the full licence text.',
};

const MIT = `MIT License

Copyright (c) 2026 IndiaNIC Infotech Ltd

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

export default function LicensePage() {
  return (
    <>
      <PageHeader
        eyebrow="Licence"
        title="MIT. Do what you like with it."
        lede="One of the shortest licences there is, and one of the least restrictive. The summary below is a reading, not a substitute — the text underneath is the licence."
      />

      <section className="mk-section">
        <div className="mk-wrap">
          <div className="mk-grid-3">
            {[
              { t: 'You can', b: 'Use it commercially, modify it, distribute it, sublicense it, sell products built on it, and run it inside a company without telling anyone.' },
              { t: 'You must', b: 'Keep the copyright notice and the licence text in copies or substantial portions of the software. That is the whole obligation.' },
              { t: 'You cannot', b: 'Hold the authors liable, or expect a warranty. It is provided as is — which, for something that opens terminals on your machines, is worth reading twice.' },
            ].map((c) => (
              <div key={c.t} className="mk-card">
                <h2 className="mk-h3">{c.t}</h2>
                <p className="mk-body" style={{ marginTop: 9, fontSize: 14.5 }}>{c.b}</p>
              </div>
            ))}
          </div>

          <div className="mk-dark" style={{ marginTop: 32 }}>
            <div className="mk-dark-head">
              <span>LICENSE</span>
              <span aria-hidden="true">MIT</span>
            </div>
            <div className="mk-term" style={{ fontSize: 12.5, whiteSpace: 'pre-wrap' }}>{MIT}</div>
          </div>

          <p className="mk-small" style={{ marginTop: 18 }}>
            The authoritative copy is{' '}
            <a href={`${GITHUB_URL}/blob/main/LICENSE`} className="mk-link" target="_blank" rel="noreferrer noopener">
              LICENSE in the repository
            </a>
            . If this page and that file ever disagree, that file wins.
          </p>
        </div>
      </section>

      <hr className="mk-rule" />
      <section className="mk-section">
        <div className="mk-wrap" style={{ textAlign: 'center' }}>
          <h2 className="mk-h2">Questions about using it commercially?</h2>
          <div className="mk-cta-row" style={{ marginTop: 22, justifyContent: 'center' }}>
            <Link href="/contact" className="mk-cta-ghost">Ask us</Link>
            <Link href="/pricing" className="mk-cta-ghost">Pricing</Link>
          </div>
        </div>
      </section>
    </>
  );
}
