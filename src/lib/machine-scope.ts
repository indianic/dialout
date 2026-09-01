// How a list endpoint interprets `?machineId=`.
//
// Native clients send `machineId=all` so the first screen is "what needs me"
// across every owned machine. The web UI omits the param and still means
// "the machine in this session" — changing that default would silently
// widen every existing page that lists by JWT machine.
export function parseMachineScope(
  raw: string | null,
  sessionMachineId: number
): 'all' | number {
  if (raw === 'all') return 'all';
  if (raw == null || raw === '') return sessionMachineId;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : sessionMachineId;
}
