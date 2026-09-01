import { describe, it, expect } from 'vitest';
import { parseMachineScope } from './machine-scope';

describe('parseMachineScope', () => {
  it('treats all as the cross-machine fan-out', () => {
    expect(parseMachineScope('all', 3)).toBe('all');
  });

  it('omitting the param keeps the session machine (web compat)', () => {
    expect(parseMachineScope(null, 3)).toBe(3);
    expect(parseMachineScope('', 3)).toBe(3);
  });

  it('parses a concrete id', () => {
    expect(parseMachineScope('12', 3)).toBe(12);
  });

  it('falls back to the session machine on garbage', () => {
    expect(parseMachineScope('nope', 3)).toBe(3);
    expect(parseMachineScope('0', 3)).toBe(3);
    expect(parseMachineScope('-1', 3)).toBe(3);
  });
});
