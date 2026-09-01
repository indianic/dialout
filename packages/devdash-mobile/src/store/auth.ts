import { create } from 'zustand';
import { api, setAccessToken, setTokenListener } from '../api/client';
import { storageDel, storageGet, storageSet } from '../storage';
import { resetSocket } from '../ws/manager';

export const TOKEN_KEY = 'devdash-token';
const MACHINE_KEY = 'devdash-machine';

export interface Machine {
  id: number;
  name: string;
  hidden?: boolean;
  isOnline?: boolean;
  terminalNameTemplate?: string | null;
  terminalPreviewLines?: number | null;
}

export interface User {
  id: number;
  name: string;
  email: string;
}

interface AuthState {
  ready: boolean;
  token: string | null;
  pendingToken: string | null;
  pending: '2fa' | 'enroll' | null;
  user: User | null;
  machines: Machine[];
  machineId: number | null;
  error: string | null;
  hydrate: () => Promise<void>;
  login: (email: string, otpCode: string) => Promise<void>;
  verify2fa: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  switchMachine: (machineId: number) => Promise<void>;
}

async function persistToken(token: string | null) {
  setAccessToken(token);
  if (token) await storageSet(TOKEN_KEY, token);
  else await storageDel(TOKEN_KEY);
}

async function persistMachine(id: number | null) {
  if (id) await storageSet(MACHINE_KEY, String(id));
}

async function preferredMachineId(machines: Machine[]): Promise<number | null> {
  const raw = await storageGet(MACHINE_KEY);
  const id = raw ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(id) || id <= 0) return null;
  return machines.some((m) => m.id === id && !m.hidden) ? id : null;
}

export const useAuth = create<AuthState>((set, get) => ({
  ready: false,
  token: null,
  pendingToken: null,
  pending: null,
  user: null,
  machines: [],
  machineId: null,
  error: null,

  hydrate: async () => {
    setTokenListener((t) => { void persistToken(t); set({ token: t }); });
    try {
      const stored = await storageGet(TOKEN_KEY);
      if (!stored) { set({ ready: true }); return; }
      setAccessToken(stored);
      try {
        const me = await api<{ user?: User; machines?: Machine[]; machineId?: number }>('/api/me');
        const machines = me.machines || [];
        const machineId = me.machineId || machines[0]?.id || null;
        set({
          ready: true,
          token: stored,
          user: me.user || null,
          machines,
          machineId,
        });
        const preferred = await preferredMachineId(machines);
        if (preferred && preferred !== get().machineId) await get().switchMachine(preferred);
      } catch {
        await persistToken(null);
        set({ ready: true, token: null, user: null, machines: [], machineId: null });
      }
    } catch {
      set({ ready: true, token: null, user: null, machines: [], machineId: null });
    }
  },

  login: async (email, otpCode) => {
    set({ error: null });
    const data = await api<{
      pending?: '2fa' | 'enroll';
      pendingToken?: string;
      success?: boolean;
      token?: string;
      user?: User;
      machines?: Machine[];
      machineId?: number;
    }>('/api/auth', {
      method: 'POST',
      body: JSON.stringify({ action: 'login', email, otpCode }),
    });
    if (data.pending) {
      set({ pending: data.pending, pendingToken: data.pendingToken || null });
      return;
    }
    if (data.token && data.user) {
      await persistToken(data.token);
      const machines = data.machines || [];
      const machineId = data.machineId || machines[0]?.id || null;
      set({
        token: data.token,
        user: data.user,
        machines,
        machineId,
        pending: null,
        pendingToken: null,
      });
      const preferred = await preferredMachineId(machines);
      if (preferred && preferred !== get().machineId) await get().switchMachine(preferred);
      else if (machineId) await persistMachine(machineId);
    }
  },

  verify2fa: async (code) => {
    set({ error: null });
    const data = await api<{
      success?: boolean;
      token?: string;
      user?: User;
      machines?: Machine[];
      machineId?: number;
    }>('/api/auth', {
      method: 'POST',
      body: JSON.stringify({
        action: 'verify-2fa',
        code,
        pendingToken: get().pendingToken,
      }),
    });
    if (!data.token || !data.user) throw new Error('No session returned');
    await persistToken(data.token);
    const machines = data.machines || [];
    const machineId = data.machineId || machines[0]?.id || null;
    set({
      token: data.token,
      user: data.user,
      machines,
      machineId,
      pending: null,
      pendingToken: null,
    });
    const preferred = await preferredMachineId(machines);
    if (preferred && preferred !== get().machineId) await get().switchMachine(preferred);
    else if (machineId) await persistMachine(machineId);
  },

  logout: async () => {
    try { await api('/api/auth', { method: 'POST', body: JSON.stringify({ action: 'logout' }) }); } catch { /* ok */ }
    resetSocket();
    await persistToken(null);
    set({ token: null, user: null, machines: [], machineId: null, pending: null, pendingToken: null });
  },

  switchMachine: async (machineId) => {
    const data = await api<{ token?: string }>('/api/auth', {
      method: 'POST',
      body: JSON.stringify({ action: 'switch-machine', machineId }),
    });
    if (data.token) await persistToken(data.token);
    await persistMachine(machineId);
    set({ machineId, token: data.token || get().token });
  },
}));
