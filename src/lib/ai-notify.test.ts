import { describe, it, expect } from 'vitest';
import { shouldNotifyAi } from './ai-notify';

// This is the logic most capable of annoying someone into turning
// notifications off, so every rule gets a case.
describe('shouldNotifyAi', () => {
  const NOW = 1_000_000;

  it('fires when a working session starts waiting for input', () => {
    expect(shouldNotifyAi('working', 'waiting_input', undefined, NOW)).toBe(true);
  });

  it('fires when a working session starts waiting for approval', () => {
    expect(shouldNotifyAi('working', 'waiting_approval', undefined, NOW)).toBe(true);
  });

  it('stays silent while the status is unchanged', () => {
    // Without this the agent's five-second poll would re-notify forever.
    expect(shouldNotifyAi('waiting_input', 'waiting_input', undefined, NOW)).toBe(false);
  });

  it('stays silent for a session seen for the first time', () => {
    // It was probably already sitting there before anyone subscribed;
    // announcing it would mean a burst on every reconnect.
    expect(shouldNotifyAi(undefined, 'waiting_input', undefined, NOW)).toBe(false);
  });

  it('stays silent when a session goes back to working', () => {
    expect(shouldNotifyAi('waiting_input', 'working', undefined, NOW)).toBe(false);
  });

  it('stays silent when a session merely goes idle', () => {
    // Idle is not "your turn" — nobody needs waking for it.
    expect(shouldNotifyAi('working', 'idle', undefined, NOW)).toBe(false);
  });

  it('does not fire on idle -> waiting_input', () => {
    // Only work that was actually running is worth being pulled back to.
    expect(shouldNotifyAi('idle', 'waiting_input', undefined, NOW)).toBe(false);
  });

  it('respects the cooldown so a run of short tool calls cannot spam', () => {
    expect(shouldNotifyAi('working', 'waiting_input', NOW - 30_000, NOW)).toBe(false);
  });

  it('fires again once the cooldown has passed', () => {
    expect(shouldNotifyAi('working', 'waiting_input', NOW - 200_000, NOW)).toBe(true);
  });
});
