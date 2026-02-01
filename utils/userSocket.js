// utils/userSocket.js
import { DeviceEventEmitter } from 'react-native';
import io from 'socket.io-client/dist/socket.io.js';

// --- Adjust these if you proxy through a prefix. ---
// Backend code uses: path: "/socket.io"
const SOCKET_BASE_URL = 'https://grab.newedge.bt';
// Use "/socket.io" unless you know you’ve mounted it under a prefix via a reverse proxy.
const SOCKET_PATH = '/grablike/socket.io';

let socket = null;
let debugAllEvents = true; // turn false once stable

/** Normalize different server payload shapes into one UI-friendly shape */
function normalizeOrderStatusPayload(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const orderId =
    raw.orderId ??
    raw.order_id ??
    raw?.data?.orderId ??
    raw?.data?.order_id ??
    raw?.order?.id ??
    null;

  const statusRaw =
    raw?.data?.status ??
    raw.status ??
    raw?.data?.newStatus ??
    raw?.data?.state ??
    null;

  const reason =
    raw?.data?.reason ??
    raw?.reason ??
    raw?.data?.status_reason ??
    raw?.status_reason ??
    null;

  const createdAt = raw.createdAt ?? Date.now();

  const status = typeof statusRaw === 'string' ? statusRaw.toUpperCase().trim() : statusRaw;

  return { orderId, status, reason, createdAt, raw };
}

export function connectUserSocket({ user_id }) {
  try {
    if (!user_id) {
      console.log('[USER SOCKET] Missing user_id, not connecting.');
      return null;
    }

    // cleanup any existing
    try { socket?.disconnect(); } catch {}

    socket = io(SOCKET_BASE_URL, {
      path: SOCKET_PATH,
      withCredentials: true,
      transports: ['websocket'], // backend is websocket-only in your code
      auth: {
        // Backend DEV_NOAUTH expects these:
        devUserId: Number(user_id),
        devRole: 'user',
      },
    });

    socket.on('connect', () => {
      console.log('[USER SOCKET] ✅ connected:', socket.id);
    });

    socket.on('connect_error', (err) => {
      console.log('[USER SOCKET] ❌ connect_error:', err?.message, err?.description || '', err?.context || '');
    });

    socket.on('disconnect', (reason) => {
      console.log('[USER SOCKET] 🔌 disconnected:', reason);
    });

    // Primary event from backend
    socket.on('order:status', (payload) => {
      const normalized = normalizeOrderStatusPayload(payload);
      console.log('[USER SOCKET] 🔔 order:status', normalized);
      if (normalized) DeviceEventEmitter.emit('user-order-status', normalized);
    });

    // Helpful aliases if backend names ever vary
    const aliases = ['status:update', 'order:status:changed', 'order:update'];
    aliases.forEach((evt) =>
      socket.on(evt, (payload) => {
        const normalized = normalizeOrderStatusPayload(payload);
        console.log(`[USER SOCKET] 🔔 ${evt}`, normalized);
        if (normalized) DeviceEventEmitter.emit('user-order-status', normalized);
      })
    );

    // Optional: see everything during debugging
    if (debugAllEvents && socket.onAny) {
      socket.onAny((event, ...args) => {
        try {
          console.log(`[USER SOCKET][onAny] ${event}:`, JSON.stringify(args?.[0], null, 2));
        } catch {
          console.log(`[USER SOCKET][onAny] ${event}:`, args);
        }
      });
    }

    // Generic notify (mostly merchant-facing, but harmless to log here)
    socket.on('notify', (payload) => {
      console.log('[USER SOCKET] 📦 notify', payload);
      // If you want: DeviceEventEmitter.emit('user-notify', payload);
    });

    return socket;
  } catch (e) {
    console.log('[USER SOCKET] setup error:', e?.message || e);
    return null;
  }
}

export function getUserSocket() {
  return socket;
}

// Call after you know the orderId (after POST or on Track screen)
export function joinOrderRoom(orderId) {
  if (!socket || !orderId) return;
  console.log('[USER SOCKET] joining room for order:', orderId);
  socket.emit('order:join', { orderId });
}

export function disconnectUserSocket() {
  try { socket?.disconnect(); } catch {}
  socket = null;
}

/** Convenience subscription helpers for the UI */
export function onUserOrderStatus(handler) {
  return DeviceEventEmitter.addListener('user-order-status', handler);
}
export function offUserOrderStatus(sub) {
  try { sub?.remove?.(); } catch {}
}

/** Toggle verbose onAny logging at runtime */
export function setUserSocketDebug(v) {
  debugAllEvents = !!v;
}