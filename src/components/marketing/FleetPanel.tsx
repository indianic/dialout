'use client';

import { useEffect, useState } from 'react';

/**
 * The hero's signature element.
 *
 * It is the product's own fleet list, set in type rather than shown as a
 * screenshot. Two reasons that is the right call here: a screenshot dates the
 * moment a single label changes and does not survive the crop most social
 * platforms apply, and — more to the point — the thing worth showing is the
 * direction of the arrow. Every row reads
 *
 *     <machine>  ->  dialout.dev
 *
 * with the connection leaving the machine. That is the entire product thesis,
 * so it is rendered as content, not as an illustration of content.
 *
 * The boot sequence runs once on mount: rows arrive in order, then each dot
 * flips offline -> live on the delay its machine would really take. One
 * orchestrated moment beats motion scattered across the page, and it is fully
 * skipped under prefers-reduced-motion (the rows render live and settled).
 */

const MACHINES = [
  { name: 'mbp-14',      port: ':3000',  label: 'api',      delay: 240 },
  { name: 'studio-m2',   port: ':5173',  label: 'web',      delay: 520 },
  { name: 'linux-box',   port: ':8080',  label: 'php',      delay: 880 },
  { name: 'ci-runner',   port: ':50051', label: 'dialout',  delay: 1180 },
];

export default function FleetPanel() {
  // Start "settled" for SSR and for readers who asked for reduced motion, so
  // the panel is never a pile of invisible rows if the effect does not run.
  const [live, setLive] = useState<boolean[]>(() => MACHINES.map(() => false));
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setLive(MACHINES.map(() => true));
      return;
    }
    setAnimate(true);
    const timers = MACHINES.map((m, i) =>
      setTimeout(() => setLive((prev) => prev.map((v, j) => (j === i ? true : v))), m.delay),
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  const online = live.filter(Boolean).length;

  return (
    <div className="mk-dark" role="img" aria-label={`Fleet view: ${MACHINES.length} machines, each connecting outbound to dialout.dev`}>
      <div className="mk-dark-head">
        <span>Fleet</span>
        <span aria-hidden="true">
          {online} / {MACHINES.length} online
        </span>
      </div>

      <div>
        {MACHINES.map((m, i) => (
          <div
            key={m.name}
            className={`mk-fleet-row${animate ? ' mk-boot' : ''}`}
            style={animate ? { animationDelay: `${80 + i * 110}ms` } : undefined}
          >
            <span className={`mk-dot${live[i] ? ' mk-dot-live' : ''}`} />
            <span className="mk-fleet-name">{m.name}</span>
            {/* The arrow points away from the machine. No inbound port is
                opened on it, so nothing in this panel points back. */}
            <span className="mk-fleet-out">&rarr; dialout.dev</span>
            <span className="mk-fleet-port">
              {m.port} <span style={{ color: 'rgba(214,218,227,.4)' }}>{m.label}</span>
            </span>
          </div>
        ))}
      </div>

      <div
        className="mk-term"
        style={{ borderTop: '1px solid rgba(255,255,255,.09)', paddingTop: 14, paddingBottom: 14 }}
      >
        <span className="mk-term-dim">{'# no inbound ports, no VPN, no port forwarding'}</span>
      </div>
    </div>
  );
}
