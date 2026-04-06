import { apiBaseUrl, sessionStore } from './backend';

export type ChatRealtimeEvent = {
  type: string;
  payload: any;
};

type Listener = (event: ChatRealtimeEvent) => void;

const listeners = new Set<Listener>();
let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let manualDisconnect = false;

const emit = (event: ChatRealtimeEvent) => {
  listeners.forEach((listener) => {
    try {
      listener(event);
    } catch {
      // Ignore listener errors so one bad subscriber does not break the socket loop.
    }
  });
};

const getWebSocketUrl = () => {
  const base = apiBaseUrl.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:');
  const token = sessionStore.get()?.accessToken;
  return token ? `${base}/ws/chat?token=${encodeURIComponent(token)}` : null;
};

const scheduleReconnect = () => {
  if (manualDisconnect || reconnectTimer || listeners.size === 0) {
    return;
  }
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    openSocket();
  }, 2000);
};

const openSocket = () => {
  const url = getWebSocketUrl();
  if (!url || socket) {
    return;
  }

  manualDisconnect = false;
  socket = new WebSocket(url);

  socket.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data) as ChatRealtimeEvent;
      emit(payload);
    } catch {
      // Ignore malformed events.
    }
  };

  socket.onclose = () => {
    socket = null;
    scheduleReconnect();
  };

  socket.onerror = () => {
    socket?.close();
  };
};

export const subscribeChatRealtime = (listener: Listener) => {
  listeners.add(listener);
  openSocket();

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      disconnectChatRealtime();
    }
  };
};

export const disconnectChatRealtime = () => {
  manualDisconnect = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (socket) {
    socket.close();
    socket = null;
  }
};
