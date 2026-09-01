'use client';

import { useEffect, useState, type ComponentType } from 'react';

// Loaded on demand so only /ai pays for the renderer. Until the chunk lands the
// text renders as plain pre-wrap — which is exactly what the chat did before
// this change, so a slow connection degrades to the old behaviour rather than
// to a blank bubble.
export default function AiMessage({ text }: { text: string }) {
  const [mod, setMod] = useState<{ Md: ComponentType<any>; gfm: unknown } | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([import('react-markdown'), import('remark-gfm')])
      .then(([md, gfm]) => {
        if (alive) setMod({ Md: md.default as ComponentType<any>, gfm: gfm.default });
      })
      .catch(() => { /* stay on the plain-text fallback */ });
    return () => { alive = false; };
  }, []);

  if (!mod) {
    return <div className="aic-msg" style={{ whiteSpace: 'pre-wrap' }}>{text}</div>;
  }

  const { Md, gfm } = mod;
  return (
    <div className="aic-msg">
      <Md
        remarkPlugins={[gfm]}
        components={{
          // Raw HTML is never enabled, but links still need the noopener guard
          // and a target — this text was written by an agent, not by us.
          a: (p: any) => <a {...p} target="_blank" rel="noopener noreferrer" />,
          // A wide table must scroll in its own box, not widen the page.
          table: (p: any) => <div className="aic-tablewrap"><table {...p} /></div>,
        }}
      >
        {text}
      </Md>
    </div>
  );
}
