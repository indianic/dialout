'use client';

import { ReactNode, useEffect, useState } from 'react';
import { Info } from 'lucide-react';

export interface HelpNavSection {
  id: string;
  label: string;
}

// Reading layout: one measured column, plus a contents rail on wide screens.
// The rail is deliberately not sticky-scrolled into the article on mobile —
// on a phone it becomes a wall of links between you and the first paragraph,
// so it collapses away entirely and the headings do the navigating.
export default function HelpArticle({
  sections,
  children,
}: {
  sections: HelpNavSection[];
  children: ReactNode;
}) {
  const [active, setActive] = useState(sections[0]?.id);

  useEffect(() => {
    const headings = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null);
    if (headings.length === 0) return;

    // rootMargin pulls the trigger line to a quarter down the viewport, so the
    // highlighted entry is the section you are reading rather than the one
    // just about to leave the top of the screen.
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: '-25% 0px -65% 0px', threshold: 0 }
    );
    headings.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, [sections]);

  return (
    <div className="help-layout">
      <article className="help-body">{children}</article>

      <nav className="help-toc" aria-label="On this page">
        <span className="help-toc-title">On this page</span>
        {sections.map((s) => (
          <a key={s.id} href={`#${s.id}`} className={`help-toc-link ${active === s.id ? 'is-active' : ''}`}>
            {s.label}
          </a>
        ))}
      </nav>

      <style jsx global>{`
        .help-layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 40px;
          align-items: start;
        }
        @media (min-width: 1100px) {
          .help-layout { grid-template-columns: minmax(0, 1fr) 190px; }
        }

        /* 68ch keeps lines in the comfortable range; without it the prose runs
           the full width of a 1400px shell and the eye loses the line return. */
        .help-body { max-width: 68ch; }
        .help-body h2 {
          font-family: 'IBM Plex Sans', system-ui, sans-serif;
          font-weight: 700;
          letter-spacing: -.022em;
          font-size: 24px;
          color: var(--txt);
          margin-top: 52px;
          scroll-margin-top: 80px;
        }
        .help-body > section:first-child h2 { margin-top: 8px; }
        .help-body h3 {
          font-family: 'IBM Plex Sans', system-ui, sans-serif;
          font-weight: 600;
          font-size: 15.5px;
          color: var(--txt);
          margin-top: 30px;
        }
        .help-body p,
        .help-body li {
          color: var(--muted);
          font-size: 15px;
          line-height: 1.72;
          text-wrap: pretty;
        }
        .help-body p { margin-top: 14px; }
        .help-body strong { color: var(--txt); font-weight: 600; }
        .help-body a {
          color: var(--accent);
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .help-body ul,
        .help-body ol { margin-top: 14px; padding-left: 20px; }
        .help-body ul { list-style: disc; }
        .help-body ol { list-style: decimal; }
        .help-body li { margin-top: 8px; padding-left: 4px; }
        .help-body code {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: .88em;
          background: var(--glass);
          border: 1px solid var(--b1);
          padding: 1px 6px;
          border-radius: 5px;
          color: var(--txt);
          white-space: nowrap;
        }

        /* The three-piece explainer. Numbered because it genuinely is a
           sequence — the request goes browser, server, agent, machine. */
        .help-flow { list-style: none !important; padding-left: 0 !important; counter-reset: flow; }
        .help-flow li {
          counter-increment: flow;
          position: relative;
          padding-left: 44px !important;
          margin-top: 16px;
          min-height: 30px;
        }
        .help-flow li::before {
          content: counter(flow);
          position: absolute;
          left: 0; top: 0;
          width: 28px; height: 28px;
          display: grid; place-items: center;
          border-radius: 50%;
          background: var(--accent-weak);
          color: var(--accent);
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
          font-weight: 600;
        }

        .help-steps { list-style: none !important; padding-left: 0 !important; counter-reset: step; margin-top: 18px; }
        .help-steps li {
          counter-increment: step;
          position: relative;
          padding-left: 34px !important;
          margin-top: 12px;
        }
        .help-steps li::before {
          content: counter(step) ".";
          position: absolute; left: 0; top: 0;
          font-family: 'JetBrains Mono', monospace;
          font-size: 13px;
          font-weight: 600;
          color: var(--accent);
        }

        .help-note {
          display: flex;
          gap: 12px;
          margin-top: 22px;
          padding: 16px 18px;
          border-radius: var(--r);
          background: var(--bg-sub);
          border: 1px solid var(--b1);
        }
        .help-note p { margin-top: 0; font-size: 14px; }
        .help-note svg { flex: none; margin-top: 2px; color: var(--accent); }

        .help-next {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          margin-top: 64px;
          padding: 24px;
          border-radius: var(--r-lg);
          background: var(--bg-sub);
          border: 1px solid var(--b1);
        }

        .help-toc {
          display: none;
          position: sticky;
          top: 80px;
          flex-direction: column;
          gap: 2px;
        }
        @media (min-width: 1100px) { .help-toc { display: flex; } }
        .help-toc-title {
          font-size: 11px;
          letter-spacing: .08em;
          text-transform: uppercase;
          color: var(--dim);
          margin-bottom: 8px;
        }
        .help-toc-link {
          font-size: 13px;
          color: var(--muted);
          padding: 5px 10px;
          border-radius: 7px;
          border-left: 1px solid var(--b1);
          transition: color .15s, background .15s;
        }
        .help-toc-link:hover { color: var(--txt); background: var(--glass); }
        .help-toc-link.is-active {
          color: var(--accent);
          border-left-color: var(--accent);
          font-weight: 500;
        }
      `}</style>
    </div>
  );
}

export function HelpSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section>
      <h2 id={id}>{title}</h2>
      {children}
    </section>
  );
}

export function Steps({ items }: { items: string[] }) {
  return (
    <ol className="help-steps">
      {items.map((s, i) => (
        <li key={i}>{s}</li>
      ))}
    </ol>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <div className="help-note">
      <Info size={17} />
      <p>{children}</p>
    </div>
  );
}
