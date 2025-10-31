// utils/merchantNotifyBridge.js
import { DeviceEventEmitter } from 'react-native';
import { merchantSocket } from '../utils/userSocket'; // adjust path if different

function normalizeIncoming(payload) {
  if (!payload) return null;
  if (payload.type === 'order_created' && payload.order) {
    const o = payload.order;
    return {
      id: o.notification_id || o.id || `notif-${Date.now()}`,
      orderId: String(o.order_id || o.orderCode || o.id),
      data: {
        title: 'New order received',
        body: `You have a new order for Nu ${Number(o.total_amount || o.total || 0).toFixed(2)}`,
        owner_type: o.owner_type || o.module || 'mart',
        status: o.status || 'PENDING',
      },
    };
  }
  if (payload.orderId || payload.data) return payload;
  return null;
}

let wired = false;
export function wireMerchantNotifyBridge() {
  if (wired) return;
  wired = true;

  if (!merchantSocket) {
    console.warn('[notify-bridge] merchantSocket not found');
    return;
  }

  merchantSocket.on('order:created', (raw) => {
    const mapped = normalizeIncoming(raw);
    if (mapped) {
      console.log('[notify-bridge] emitting merchant-notify', mapped);
      DeviceEventEmitter.emit('merchant-notify', mapped);
    }
  });

  // Optional direct pass-through
  merchantSocket.on('merchant-notify', (raw) => {
    const mapped = normalizeIncoming(raw) || raw;
    console.log('[notify-bridge] pass-through merchant-notify', mapped);
    DeviceEventEmitter.emit('merchant-notify', mapped);
  });
}
