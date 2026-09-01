/**
 * The Dialout mark and lockup.
 *
 * Geometry is the 24-unit grid from docs/brand/brand-guidelines.md and must
 * not drift from public/favicon.svg or scripts/generate-pwa-icons.js:
 *   chevron  M 4 17 L 12 7 L 20 17, stroke 3, round caps and joins
 *   dot      circle cx 12 cy 20.5 r 1.75
 *
 * The chevron is the connection leaving the machine; the dot is the machine.
 * One colour, always — never a gradient, and never a status colour, because
 * green and red already mean "running" and "offline" in the product and a
 * green logo would be read as a status.
 */
export function LogoMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M 4 17 L 12 7 L 20 17"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={12} cy={20.5} r={1.75} fill="currentColor" />
    </svg>
  );
}

/**
 * Mark plus wordmark. The wordmark is sentence case — Dialout, never DialOut
 * or DIALOUT. The lowercase "o" is what separates the brand from the legacy
 * DialOut/EZ product, so it is not a stylistic choice.
 */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.27 }}>
      <LogoMark size={size} className="mk-logo-mark" />
      <span
        style={{
          fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
          fontWeight: 700,
          letterSpacing: '-0.02em',
          fontSize: size * 0.86,
          lineHeight: 1,
        }}
      >
        Dialout
      </span>
    </span>
  );
}
