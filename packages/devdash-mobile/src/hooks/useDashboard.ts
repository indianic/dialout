import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../store/auth';
import { getSocket, resetSocket } from '../ws/manager';
import { AI_SESSIONS_KEY, uniqueAi, type AiRow } from '../api/ai-sessions';

export function useDashboard() {
  const token = useAuth((s) => s.token);
  const qc = useQueryClient();

  useEffect(() => {
    if (!token) {
      resetSocket();
      return;
    }
    const sock = getSocket(token);
    const unsub = sock.onDashboard((msg) => {
      if (msg.type === 'machine_status_sync' && Array.isArray(msg.machines)) {
        const ids = (msg.machines as unknown[]).filter((n): n is number => typeof n === 'number');
        useAuth.setState((s) => ({
          machines: s.machines.map((m) => ({ ...m, isOnline: ids.includes(m.id) })),
        }));
      }
      if (msg.type === 'machine_online' && typeof msg.machineId === 'number') {
        const id = msg.machineId;
        useAuth.setState((s) => ({
          machines: s.machines.map((m) => (m.id === id ? { ...m, isOnline: true } : m)),
        }));
      }
      if (msg.type === 'machine_offline' && typeof msg.machineId === 'number') {
        const id = msg.machineId;
        useAuth.setState((s) => ({
          machines: s.machines.map((m) => (m.id === id ? { ...m, isOnline: false } : m)),
        }));
      }
      if (msg.type === 'port_status') {
        void qc.invalidateQueries({ queryKey: ['projects'] });
        const data = msg.data as { projectId?: number } | undefined;
        if (data?.projectId) {
          void qc.invalidateQueries({ queryKey: ['project', String(data.projectId)] });
        }
      }
      if (msg.type === 'session_start' || msg.type === 'session_end') {
        void qc.invalidateQueries({ queryKey: ['live-sessions'] });
      }
      if (msg.type === 'ai_session_list' && typeof msg.machineId === 'number') {
        const machineId = msg.machineId;
        const name = useAuth.getState().machines.find((m) => m.id === machineId)?.name || '';
        const incoming = ((msg.sessions as Array<Record<string, unknown>> | undefined) || []).map((s) => ({
          ...s,
          machineId,
          machineName: (s.machineName as string) || name,
        }));
        qc.setQueryData<AiRow[]>(AI_SESSIONS_KEY, (old) => uniqueAi([
          ...(old || []).filter((row) => row.machineId !== machineId),
          ...(incoming as AiRow[]),
        ]));
      }
    });
    return unsub;
  }, [token, qc]);
}
