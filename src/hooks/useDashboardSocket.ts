import { useEffect, useRef, useCallback, useState } from 'react';

interface DashboardEvent {
  type: 'machine_online' | 'machine_offline' | 'machine_status_sync' | 'port_status' | 'notification' | 'session_start' | 'session_end' | 'ai_session_events';
  machineId?: number;
  machines?: number[];
  data?: any;
  tmuxName?: string;
  events?: any[];
  status?: string;
}

interface UseDashboardSocketOptions {
  userId: number;
  machineId: number;
  wsUrl: string;
  onMachineStatus?: (machineId: number, online: boolean) => void;
  onMachineSync?: (onlineMachineIds: number[]) => void;
  onPortStatus?: (projectId: number, isRunning: boolean) => void;
  onNotification?: (notification: any) => void;
  // Chat events for one AI session. Follows the same optional-callback shape
  // as the four above rather than a generic listener, so a page only receives
  // what it asked for.
  onAiEvents?: (machineId: number, tmuxName: string, events: any[], status: string) => void;
}

export function useDashboardSocket({
  userId,
  machineId,
  wsUrl,
  onMachineStatus,
  onMachineSync,
  onPortStatus,
  onNotification,
  onAiEvents,
}: UseDashboardSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const reconnectTimer = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    // Nothing to connect to yet. The dashboard mounts this hook before the
    // session has resolved, so userId is 0 and wsUrl is '' on the first render;
    // without this the socket would fail immediately and then retry every three
    // seconds forever against a URL that can never work.
    if (!wsUrl || !userId || !machineId) return;

    const url = `${wsUrl}/dashboard?userId=${userId}&machineId=${machineId}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      // Subscribe to updates
      ws.send(JSON.stringify({ type: 'subscribe', userId, machineId }));
    };

    ws.onmessage = (event) => {
      try {
        const msg: DashboardEvent = JSON.parse(event.data);
        switch (msg.type) {
          case 'machine_online':
            onMachineStatus?.(msg.machineId!, true);
            break;
          case 'machine_offline':
            onMachineStatus?.(msg.machineId!, false);
            break;
          case 'machine_status_sync':
            onMachineSync?.(msg.machines || []);
            break;
          case 'port_status':
            onPortStatus?.(msg.data?.projectId, msg.data?.isRunning);
            break;
          case 'notification':
            onNotification?.(msg.data);
            break;
          case 'ai_session_events':
            onAiEvents?.(msg.machineId!, msg.tmuxName!, msg.events || [], msg.status || 'idle');
            break;
        }
      } catch { /* ignore */ }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      // Auto-reconnect after 3s
      if (!reconnectTimer.current) {
        reconnectTimer.current = setTimeout(() => {
          reconnectTimer.current = null;
          connect();
        }, 3000);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [wsUrl, userId, machineId, onMachineStatus, onMachineSync, onPortStatus, onNotification, onAiEvents]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { connected };
}
