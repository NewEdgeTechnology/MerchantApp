// services/realtime/merchantSocket.js
import { DeviceEventEmitter, Platform } from 'react-native';
import io from 'socket.io-client/dist/socket.io.js';

let socket = null;

const BASE_URL = 'https://grab.newedge.bt';
const PATH = '/orders/socket.io';

export function connectMerchantSocket({ user_id, business_id }) {
  try {
    if (!user_id || !business_id) {
      console.log('[SOCKET] Missing user_id or business_id');
      return;
    }
    if (socket) {
      try { socket.disconnect(); } catch {}
      socket = null;
    }

    socket = io(BASE_URL, {
      path: PATH,
      withCredentials: true,
      transports: ['websocket'], // avoid polling Transport unknown
      auth: {
        devUserId: Number(user_id),
        devRole: 'merchant',
        business_id: Number(business_id),
      },
      extraHeaders: Platform.select({
        ios: undefined,
        android: undefined,
        default: undefined,
      }),
    });

    socket.on('connect', () => console.log('[SOCKET] ✅ connected', socket.id));
    socket.io.on('error', (e) => console.log('[SOCKET.IO ERROR]', e));
    socket.io.engine.on('error', (e) => console.log('[ENGINE.IO ERROR]', e));
    socket.on('disconnect', (r) => console.log('[SOCKET] 🔌 disconnected:', r));

    // Forward server notifications to RN
    socket.on('notify', (payload) => {
      console.log('[SOCKET] 📦 notify:', payload);
      DeviceEventEmitter.emit('merchant-notify', payload);
    });

    // Optional: live status updates to order list
    socket.on('order:status', (update) => {
      DeviceEventEmitter.emit('order-updated', update);
    });
  } catch (e) {
    console.log('[SOCKET] setup error:', e?.message || e);
  }
}

export function getMerchantSocket() {
  return socket;
}

export function disconnectMerchantSocket() {
  try { socket?.disconnect(); } catch {}
  socket = null;
}
