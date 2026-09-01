// Shared daemon communication via HTTP to the WS server
// The WS server exposes HTTP endpoints for querying/commanding daemons

import { createHash } from 'crypto';
import type { AiSessionSummary } from '@dialout/shared';
import { PERMISSION_MODES } from '@dialout/shared';
export type { AiSessionSummary };

const WS_SERVER_URL = `http://localhost:${process.env.WS_PORT || 50052}`;

// Shared secret gating privileged relay endpoints on the ws-server. Derived
// from JWT_SECRET by default so the raw signing secret never travels in a
// header, and no new required config is needed. Must match ws-server exactly.
const INTERNAL_TOKEN = process.env.WS_INTERNAL_TOKEN
  || createHash('sha256').update(process.env.JWT_SECRET || '').digest('hex');

export async function getOnlineMachineIds(): Promise<number[]> {
  try {
    const res = await fetch(`${WS_SERVER_URL}/status/online`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.machineIds || [];
  } catch {
    return [];
  }
}

export async function isMachineOnline(machineId: number): Promise<boolean> {
  const online = await getOnlineMachineIds();
  return online.includes(machineId);
}

export async function requestPortScan(
  machineId: number,
  options: { ports?: number[]; from?: number; to?: number }
): Promise<{ openPorts: number[] } | null> {
  try {
    const res = await fetch(`${WS_SERVER_URL}/scan/${machineId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Token': INTERNAL_TOKEN },
      body: JSON.stringify(options),
      signal: AbortSignal.timeout(35000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function requestPortCheck(
  machineId: number,
  ports: number[]
): Promise<{ openPorts: number[] } | null> {
  try {
    const res = await fetch(`${WS_SERVER_URL}/check/${machineId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Token': INTERNAL_TOKEN },
      body: JSON.stringify({ ports }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function requestUrlCheck(
  machineId: number,
  url: string
): Promise<boolean> {
  try {
    const res = await fetch(`${WS_SERVER_URL}/tunnel/${machineId}/site/${Buffer.from(url).toString('base64')}/`, {
      signal: AbortSignal.timeout(5000),
    });
    return res.status >= 200 && res.status < 500;
  } catch {
    return false;
  }
}

export async function requestFsBrowse(
  machineId: number,
  path: string
): Promise<{ path: string; entries: { name: string; type: string }[] } | null> {
  try {
    const res = await fetch(`${WS_SERVER_URL}/browse/${machineId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Token': INTERNAL_TOKEN },
      body: JSON.stringify({ path }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function requestProjectScan(
  machineId: number,
  path: string,
  depth: number
): Promise<{ projects: any[]; error?: string } | null> {
  try {
    const res = await fetch(`${WS_SERVER_URL}/project-scan/${machineId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Token': INTERNAL_TOKEN },
      body: JSON.stringify({ path, depth }),
      signal: AbortSignal.timeout(65000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Force-kill a tmux session on a machine by name. Returns null if the machine
// is offline / unreachable. Used to actually terminate a live terminal session.
export async function requestKillTmux(
  machineId: number,
  name: string
): Promise<{ ok: boolean } | null> {
  try {
    const res = await fetch(`${WS_SERVER_URL}/kill-tmux/${machineId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Token': INTERNAL_TOKEN },
      body: JSON.stringify({ name }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function requestRunCommand(
  machineId: number,
  args: { command: string; cwd: string; background: boolean; logName?: string }
): Promise<{ ok: boolean; pid?: number; exitCode?: number; output?: string; error?: string } | null> {
  try {
    const res = await fetch(`${WS_SERVER_URL}/run-command/${machineId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Token': INTERNAL_TOKEN },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function requestAiCapabilities(
  machineId: number,
  kind: string,
  cwd: string
): Promise<any | null> {
  try {
    const res = await fetch(`${WS_SERVER_URL}/ai-capabilities/${machineId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Token': INTERNAL_TOKEN },
      body: JSON.stringify({ kind, cwd }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function requestAiSessions(
  machineId: number
): Promise<AiSessionSummary[] | null> {
  try {
    const res = await fetch(`${WS_SERVER_URL}/ai-sessions/${machineId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Token': INTERNAL_TOKEN },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.sessions || [];
  } catch {
    return null;
  }
}

export async function aiSessionCommand(
  machineId: number,
  action: 'open' | 'close' | 'input',
  tmuxName: string,
  text?: string
): Promise<boolean> {
  try {
    const res = await fetch(`${WS_SERVER_URL}/ai-${action}/${machineId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Token': INTERNAL_TOKEN },
      body: JSON.stringify({ tmuxName, text }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export const AI_PERMISSION_MODES = PERMISSION_MODES;
export type AiPermissionMode = typeof PERMISSION_MODES[number];

export async function createAiSession(
  machineId: number,
  body: { kind?: string; cwd: string; prompt: string; permissionMode?: string; configHome?: string }
): Promise<string | null> {
  try {
    const res = await fetch(`${WS_SERVER_URL}/ai-create/${machineId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Token': INTERNAL_TOKEN },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.id || null;
  } catch {
    return null;
  }
}

export async function deleteAiSession(machineId: number, id: string): Promise<boolean> {
  try {
    const res = await fetch(`${WS_SERVER_URL}/ai-delete/${machineId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Token': INTERNAL_TOKEN },
      body: JSON.stringify({ id }),
      signal: AbortSignal.timeout(10000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
