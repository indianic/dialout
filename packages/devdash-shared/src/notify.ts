// When an AI session change is worth interrupting someone for.
//
// Pure so it can be tested without starting a server. This is the logic most
// capable of annoying a user into switching notifications off, so it is
// deliberately conservative.

export const NOTIFY_COOLDOWN_MS = 120_000;

const WAITING = new Set(['waiting_input', 'waiting_approval']);

export function shouldNotifyAi(
  previous: string | undefined,
  next: string,
  lastNotifiedAt: number | undefined,
  nowMs: number
): boolean {
  // Nothing to say about a session we are seeing for the first time: it was
  // probably already sitting there before anyone subscribed, and announcing
  // it would mean a burst on every agent reconnect.
  if (previous === undefined) return false;
  if (previous === next) return false;
  // Only a transition INTO waiting counts. Notifying on the state itself
  // would re-fire every five seconds for as long as the session sat there.
  if (!WAITING.has(next)) return false;
  // Only work that was actually running is worth being pulled back to; idle
  // sessions drifting into 'waiting' are not news.
  if (previous !== 'working') return false;
  if (lastNotifiedAt && nowMs - lastNotifiedAt < NOTIFY_COOLDOWN_MS) return false;
  return true;
}
