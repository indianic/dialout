'use client';

import { toolAppearance } from './tool-appearance';
import type { ToolItem } from './chat-blocks';

function Chip({ name, ok }: { name: string; ok: boolean | null }) {
  const a = toolAppearance(name, ok !== false);
  return (
    <span
      className="aic-chip"
      style={{
        background: `color-mix(in srgb, var(${a.colorVar}) 16%, transparent)`,
        color: `var(${a.colorVar})`,
      }}
      aria-hidden
    >
      {a.glyph}
    </span>
  );
}

export default function AiToolTrace({ items }: { items: ToolItem[] }) {
  return (
    <div style={{ display: 'grid', gap: 9 }}>
      <div className="aic-rule">
        did {items.length} thing{items.length === 1 ? '' : 's'}
      </div>

      {items.map((t) => (
        <div key={t.id} style={{ display: 'grid', gap: 5, minWidth: 0 }}>
          <div className="aic-tool">
            <Chip name={t.name} ok={t.ok} />
            <span className="aic-name">{t.name}</span>
            <span
              className="aic-path"
              style={t.ok === false ? { color: 'var(--offline)' } : undefined}
              title={t.summary}
            >
              {t.summary}
            </span>
          </div>

          {/* A failure is never collapsed. An error the reader has to expand to
              see is an error they will miss. */}
          {t.ok === false && t.resultPreview && (
            <pre className="aic-res" style={{ color: 'var(--offline)', paddingLeft: 29 }}>
              {t.resultPreview}
            </pre>
          )}

          {t.ok === true && t.resultPreview && (
            <details className="aic-res">
              <summary>output · {t.resultLines} line{t.resultLines === 1 ? '' : 's'}</summary>
              <pre>{t.resultPreview}</pre>
            </details>
          )}
        </div>
      ))}
    </div>
  );
}
