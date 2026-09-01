'use client';

// Single shared WebSocket for all terminal sessions + dashboard events.
// Multiplexes multiple PTY sessions over one connection.

export interface DevDashSocket {
  send: (msg: any) => void;
  subscribe: (sessionId: string, handler: (msg: any) => void) => () => void;
  subscribeDashboard: (handler: (msg: any) => void) => () => void;
  destroy: () => void;
  isConnected: () => boolean;
}

export function createDevDashSocket(wsUrl: string, userId: number, machineId: number): DevDashSocket {
  const sessionHandlers = new Map<string, (msg: any) => void>();
  const dashboardHandlers = new Set<(msg: any) => void>();
  const pendingQueue: any[] = [];
  let ws: WebSocket | null = null;
  let destroyed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function doConnect() {
    if (destroyed) return;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

    const url = `${wsUrl}/multiplex?userId=${userId}&machineId=${machineId}`;

    try {
      ws = new WebSocket(url);
    } catch {
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      if (destroyed) { ws?.close(); return; }
      // Flush queued messages
      while (pendingQueue.length > 0) {
        const msg = pendingQueue.shift();
        ws!.send(JSON.stringify(msg));
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        // Route to session handler if message has an id
        if (msg.id && sessionHandlers.has(msg.id)) {
          sessionHandlers.get(msg.id)!(msg);
          return;
        }
        // Otherwise broadcast as dashboard event
        dashboardHandlers.forEach((h) => h(msg));
      } catch { /* ignore */ }
    };

    ws.onclose = () => {
      ws = null;
      if (!destroyed) scheduleReconnect();
    };

    ws.onerror = () => { /* onclose will fire */ };
  }

  function scheduleReconnect() {
    if (destroyed) return;
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      doConnect();
    }, 2000);
  }

  function send(msg: any) {
    if (destroyed) return;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    } else {
      pendingQueue.push(msg);
    }
  }

  function subscribe(sessionId: string, handler: (msg: any) => void): () => void {
    sessionHandlers.set(sessionId, handler);
    return () => { sessionHandlers.delete(sessionId); };
  }

  function subscribeDashboard(handler: (msg: any) => void): () => void {
    dashboardHandlers.add(handler);
    return () => { dashboardHandlers.delete(handler); };
  }

  function destroy() {
    destroyed = true;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    if (ws) {
      const w = ws;
      ws = null;
      // Only close if actually open, otherwise let it fail silently
      try { w.close(); } catch { /* ignore */ }
    }
    sessionHandlers.clear();
    dashboardHandlers.clear();
    pendingQueue.length = 0;
  }

  function isConnected(): boolean {
    return ws?.readyState === WebSocket.OPEN || false;
  }

  // Start connection
  doConnect();

  return { send, subscribe, subscribeDashboard, destroy, isConnected };
}
