import type { AiSessionSummary } from '@dialout/shared';
import { api } from './client';
import type { Machine } from '../store/auth';
import { useAuth } from '../store/auth';

export type AiRow = AiSessionSummary & { machineId: number; machineName: string };

export const AI_SESSIONS_KEY = ['ai-sessions'] as const;

type ListResponse = {
  sessions?: (AiSessionSummary & { machineId?: number; machineName?: string })[];
  machines?: { id: number; offline?: boolean }[];
  offline?: boolean;
};

function keyOf(s: AiRow) {
  return `${s.machineId}:${s.tmuxName}`;
}

export function uniqueAi(rows: AiRow[]): AiRow[] {
  const seen = new Set<string>();
  const out: AiRow[] = [];
  for (const r of rows) {
    const k = keyOf(r);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

function tag(
  s: AiSessionSummary & { machineId?: number; machineName?: string },
  fallbackId: number,
  names: Map<number, string>,
): AiRow | null {
  const machineId = Number(s.machineId) || fallbackId;
  if (!machineId) return null;
  return {
    ...s,
    machineId,
    machineName: s.machineName || names.get(machineId) || '',
  };
}

function understoodAll(data: ListResponse): boolean {
  return Array.isArray(data.machines) && data.machines.length > 0;
}

// Fast path only. Native terminals are a DB read; AI used to wait on a live
// agent walk, then (on production) switch-machine once per box — 10s timeout
// each. `machineId=all` / per-id are instant when the server honours them.
// Remaining machines are filled by expandAiSessions so the first paint is not
// blocked on offline boxes.
export async function fetchAiSessions(machines: Machine[]): Promise<{ rows: AiRow[]; covered: 'all' | number[] }> {
  const targets = machines.filter((m) => !m.hidden);
  const names = new Map(targets.map((m) => [m.id, m.name]));
  const jwtId = useAuth.getState().machineId || targets[0]?.id || 0;

  try {
    const data = await api<ListResponse>('/api/ai-sessions?machineId=all');
    if (understoodAll(data)) {
      const rows = uniqueAi(
        (data.sessions || []).map((s) => tag(s, jwtId, names)).filter((s): s is AiRow => !!s),
      );
      return { rows, covered: 'all' };
    }
  } catch { /* older servers do not understand machineId=all */ }

  const online = targets.filter((m) => m.isOnline !== false);
  const probeId = online[0]?.id || jwtId;
  if (!probeId) return { rows: [], covered: [] };

  try {
    const probe = await api<ListResponse>(`/api/ai-sessions?machineId=${probeId}`);
    const honored = (probe.machines || []).some((x) => x.id === probeId)
      || (probe.sessions || []).some((s) => Number(s.machineId) === probeId);

    if (honored) {
      const rest = online.filter((m) => m.id !== probeId);
      const others = await Promise.all(rest.map(async (m) => {
        try {
          const data = await api<ListResponse>(`/api/ai-sessions?machineId=${m.id}`);
          return { m, raw: data.sessions || [] };
        } catch {
          return { m, raw: [] as NonNullable<ListResponse['sessions']> };
        }
      }));
      const parts = [{ m: { id: probeId, name: names.get(probeId) || '' }, raw: probe.sessions || [] }, ...others];
      return {
        rows: uniqueAi(parts.flatMap((p) => p.raw.map((s) => tag(s, p.m.id, names)).filter((s): s is AiRow => !!s))),
        covered: parts.map((p) => p.m.id),
      };
    }

    return {
      rows: uniqueAi(
        (probe.sessions || []).map((s) => tag(s, jwtId, names)).filter((s): s is AiRow => !!s),
      ),
      covered: jwtId ? [jwtId] : [probeId],
    };
  } catch {
    return { rows: [], covered: [] };
  }
}

export async function expandAiSessions(
  machines: Machine[],
  already: AiRow[],
  covered: 'all' | number[],
): Promise<AiRow[]> {
  if (covered === 'all') return already;
  const have = new Set(covered);
  const missing = machines.filter((m) => !m.hidden && m.isOnline !== false && !have.has(m.id));
  if (!missing.length) return already;

  const original = useAuth.getState().machineId;
  const extra: AiRow[] = [];
  for (const m of missing) {
    try {
      await api('/api/auth', {
        method: 'POST',
        body: JSON.stringify({ action: 'switch-machine', machineId: m.id }),
      });
      const data = await api<ListResponse>('/api/ai-sessions', { signal: AbortSignal.timeout(4000) });
      if (data.offline) continue;
      for (const s of data.sessions || []) {
        extra.push({ ...s, machineId: m.id, machineName: m.name });
      }
    } catch { /* skip this machine */ }
  }
  if (original) {
    try {
      await api('/api/auth', {
        method: 'POST',
        body: JSON.stringify({ action: 'switch-machine', machineId: original }),
      });
    } catch { /* keep last JWT */ }
  }
  return uniqueAi([...already, ...extra]);
}
