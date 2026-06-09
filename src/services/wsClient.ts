type Listener = (data: unknown) => void;

// file:// (Electron packaged) has empty hostname — fall back to localhost
const WS_HOST = window.location.hostname || 'localhost';
const WS_URL = `ws://${WS_HOST}:3001`;
const RECONNECT_DELAY = 3000;

class VPNWebSocketClient {
  private ws: WebSocket | null = null;
  private listeners = new Map<string, Listener[]>();
  private queue: string[] = [];
  private reconnecting = false;

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    try {
      this.ws = new WebSocket(WS_URL);

      this.ws.onopen = () => {
        this.reconnecting = false;
        // Flush queued messages
        this.queue.forEach(m => this.ws?.send(m));
        this.queue = [];
        this.emit('_connected', null);
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as { type: string; data: unknown };
          (this.listeners.get(msg.type) ?? []).forEach(fn => fn(msg.data));
        } catch { /* ignore malformed */ }
      };

      this.ws.onclose = () => {
        this.emit('_disconnected', null);
        if (!this.reconnecting) {
          this.reconnecting = true;
          setTimeout(() => this.connect(), RECONNECT_DELAY);
        }
      };

      this.ws.onerror = () => { /* onclose fires after */ };
    } catch {
      setTimeout(() => this.connect(), RECONNECT_DELAY);
    }
  }

  send(type: string, data?: unknown) {
    const msg = JSON.stringify({ type, data });
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(msg);
    } else {
      this.queue.push(msg);
    }
  }

  on(type: string, listener: Listener) {
    const existing = this.listeners.get(type) ?? [];
    this.listeners.set(type, [...existing, listener]);
    return () => this.off(type, listener);
  }

  off(type: string, listener: Listener) {
    const existing = this.listeners.get(type) ?? [];
    this.listeners.set(type, existing.filter(l => l !== listener));
  }

  private emit(type: string, data: unknown) {
    (this.listeners.get(type) ?? []).forEach(fn => fn(data));
  }

  get connected() { return this.ws?.readyState === WebSocket.OPEN; }
}

export const wsClient = new VPNWebSocketClient();
