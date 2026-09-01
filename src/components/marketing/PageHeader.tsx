/**
 * The masthead every non-home marketing page opens with. Keeping it in one
 * component is what stops fourteen pages from each inventing their own
 * heading rhythm.
 */
export default function PageHeader({
  eyebrow, title, lede, children,
}: {
  eyebrow: string;
  title: string;
  lede?: string;
  children?: React.ReactNode;
}) {
  return (
    <>
      <section className="mk-section-tight" style={{ paddingTop: 64 }}>
        <div className="mk-wrap">
          <span className="mk-eyebrow">{eyebrow}</span>
          <h1 className="mk-h1" style={{ fontSize: 'clamp(32px, 4.6vw, 52px)', maxWidth: 860 }}>
            {title}
          </h1>
          {lede ? (
            <p className="mk-lede" style={{ marginTop: 18, maxWidth: 640 }}>
              {lede}
            </p>
          ) : null}
          {children}
        </div>
      </section>
      <hr className="mk-rule" />
    </>
  );
}
