import { AppState, type AppStateStatus } from 'react-native';
import { getWsUrl } from '../config';

type Handler = (msg: Record<string, unknown>) => void;

export class SocketManager {
  private token: string;
  private ws: WebSocket | null = null;
  private destroyed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private dashboard = new Set<Handler>();
  private openHandlers = new Set<() => void>();
  private queue: unknown[] = [];
  private appSub: ReturnType<typeof AppState.addEventListener> | null = null;

  constructor(token: string) {
    this.token = token;
    this.appSub = AppState.addEventListener('change', this.onApp);
    this.connect();
  }

  setToken(token: string) {
    if (token === this.token) return;
    this.token = token;
    // Next reconnect (background → foreground, or drop) uses the new JWT.
  }

  private onApp = (state: AppStateStatus) => {
    if (state === 'background') this.drop();
    if (state === 'active') this.connect();
  };

  private url() {
    return `${getWsUrl()}/dashboard?token=${encodeURIComponent(this.token)}`;
  }

  private connect() {
    if (this.destroyed) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    try {
      this.ws = new WebSocket(this.url());
    } catch {
      this.schedule();
      return;
    }
    this.ws.onopen = () => {
      this.attempt = 0;
      while (this.queue.length) this.ws?.send(JSON.stringify(this.queue.shift()));
      this.openHandlers.forEach((h) => h());
    };
    this.ws.onmessage = (ev) => {
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(String(ev.data)); } catch { return; }
      this.dashboard.forEach((h) => h(msg));
    };
    this.ws.onclose = () => {
      this.ws = null;
      if (!this.destroyed && AppState.currentState === 'active') this.schedule();
    };
    this.ws.onerror = () => { /* onclose follows */ };
  }

  private drop() {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    const w = this.ws;
    this.ws = null;
    try { w?.close(); } catch { /* ignore */ }
  }

  private schedule() {
    if (this.destroyed || this.reconnectTimer) return;
    const delay = Math.min(15_000, 1000 * 2 ** this.attempt);
    this.attempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  send(msg: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
    else this.queue.push(msg);
  }

  onDashboard(handler: Handler) {
    this.dashboard.add(handler);
    return () => { this.dashboard.delete(handler); };
  }

  onOpen(handler: () => void) {
    this.openHandlers.add(handler);
    return () => { this.openHandlers.delete(handler); };
  }

  destroy() {
    this.destroyed = true;
    this.appSub?.remove();
    this.drop();
    this.dashboard.clear();
    this.openHandlers.clear();
    this.queue.length = 0;
  }
}

let singleton: SocketManager | null = null;

export function getSocket(token: string): SocketManager {
  if (singleton) {
    singleton.setToken(token);
    return singleton;
  }
  singleton = new SocketManager(token);
  return singleton;
}

export function resetSocket() {
  singleton?.destroy();
  singleton = null;
}
