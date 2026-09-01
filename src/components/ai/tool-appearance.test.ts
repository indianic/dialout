import { describe, it, expect } from 'vitest';
import { toolAppearance, toolClass } from './tool-appearance';

describe('tool-appearance', () => {
  it('maps known tools to their action class', () => {
    expect(toolClass('Read')).toBe('read');
    expect(toolClass('Glob')).toBe('read');
    expect(toolClass('Grep')).toBe('search');
    expect(toolClass('WebSearch')).toBe('search');
    expect(toolClass('Bash')).toBe('run');
    expect(toolClass('Task')).toBe('run');
    expect(toolClass('Edit')).toBe('write');
    expect(toolClass('Write')).toBe('write');
  });

  it('is case and whitespace insensitive', () => {
    expect(toolClass('  bASh  ')).toBe('run');
  });

  // New tools ship constantly. An unknown name must render as a neutral row,
  // never throw and never blank the trace.
  it('falls back to other for an unknown tool', () => {
    expect(toolClass('SomeToolShippedNextWeek')).toBe('other');
    expect(toolAppearance('SomeToolShippedNextWeek').colorVar).toBe('--dim');
  });

  it('failure beats the name-derived class', () => {
    const a = toolAppearance('Read', false);
    expect(a.cls).toBe('failure');
    expect(a.colorVar).toBe('--offline');
    expect(a.glyph).toBe('✕');
  });

  it('every class has a glyph and a colour token', () => {
    for (const name of ['Read', 'Grep', 'Bash', 'Edit', 'Nonsense']) {
      const a = toolAppearance(name);
      expect(a.glyph.length).toBeGreaterThan(0);
      expect(a.colorVar.startsWith('--')).toBe(true);
    }
  });
});
