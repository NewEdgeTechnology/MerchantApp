// components/OrderNotifyOverlay.js
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Animated, Easing, Platform, Pressable, StyleSheet, Text, View,
  DeviceEventEmitter, Alert, Dimensions
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import * as SecureStore from 'expo-secure-store';
import {
  NOTIFICATION_READ_ENDPOINT as ENV_NOTIF_READ_ENDPOINT,
  ORDER_ENDPOINT as ENV_ORDER_ENDPOINT,
} from '@env';

const ORDER_BASE    = (ENV_ORDER_ENDPOINT || '').trim().replace(/\/+$/, '');
const READ_ONE_BASE = (ENV_NOTIF_READ_ENDPOINT || '').trim().replace(/\/+$/, '');

const { width: W } = Dimensions.get('window');
const base = 390;
const s = (n) => Math.max(10, Math.round((W / base) * n));
const currency = (n) => `Nu ${Number(n || 0).toFixed(2)}`;

// ⏱️ auto-hide after a few seconds (tweak if you like)
const AUTO_HIDE_MS = 6000;

/* ---------- session helpers ---------- */
async function getToken() {
  let token = await SecureStore.getItemAsync('auth_token');
  if (!token) {
    try {
      const raw = await SecureStore.getItemAsync('merchant_login');
      if (raw) {
        const parsed = JSON.parse(raw);
        token = parsed?.token ?? parsed?.auth_token ?? parsed?.access_token ?? null;
      }
    } catch {}
  }
  return token;
}
async function resolveBusinessId() {
  try {
    const raw = await SecureStore.getItemAsync('merchant_login');
    if (raw) {
      const parsed = JSON.parse(raw);
      const v =
        parsed?.merchant?.business_id ??
        parsed?.merchant?.businessId ??
        parsed?.business_id ??
        parsed?.businessId;
      const n = Number.parseInt(String(v ?? '').trim(), 10);
      if (Number.isFinite(n)) return n;
    }
  } catch {}
  return null;
}

/* ---------- navigation helper (OrderDetails only) ---------- */
function safeNavigateToOrderDetails(orderId, navigation, extraParams = {}) {
  const params = { orderId: String(orderId), ...extraParams };
  const nav = navigation || global?.__nav;

  try { nav?.navigate?.('OrderDetails', params); } catch {}
  // Also broadcast so your App.js listener can catch it too if needed
  DeviceEventEmitter.emit('open-order-details', params);
  return true;
}

/* ---------- URL builders ---------- */
const buildReadOneUrl = (notificationId) =>
  READ_ONE_BASE ? READ_ONE_BASE.replace('{notificationId}', String(notificationId)) : null;

const buildOrdersGroupedUrl = (businessId, ownerType) => {
  if (!ORDER_BASE || !businessId) return null;
  let url = ORDER_BASE
    .replace('{businessId}', String(businessId))
    .replace('{business_id}', String(businessId));
  try {
    const u = new URL(url);
    if (String(ownerType).toLowerCase() === 'mart' && !u.searchParams.get('owner_type')) {
      u.searchParams.set('owner_type', 'mart');
    }
    return u.toString();
  } catch {
    if (String(ownerType).toLowerCase() === 'mart' && !/[?&]owner_type=/.test(url)) {
      url += (url.includes('?') ? '&' : '?') + 'owner_type=mart';
    }
    return url;
  }
};

/* ---------- hydration helpers ---------- */
const sameId = (a, b) => String(a ?? '').replace(/^ORD[-_]?/i, '') === String(b ?? '').replace(/^ORD[-_]?/i, '');
const coalesce = (...vals) => { for (const v of vals) if (v != null && v !== '') return v; return null; };

function normalizeOrderRecord(row = {}, user = {}) {
  const items = row.order_items ?? row.items ?? row.raw_items ?? [];
  const normalizedItems = Array.isArray(items)
    ? items.map((it, idx) => ({
        item_id: coalesce(it.item_id, it.id, idx),
        item_name: coalesce(it.item_name, it.name, it.title, 'Item'),
        quantity: Number(coalesce(it.quantity, it.qty, 1)),
      }))
    : [];
  return {
    id: coalesce(row.order_code, row.orderCode, row.id, row.order_id),
    order_code: coalesce(row.order_code, row.orderCode, row.id, row.order_id),
    customer_name: coalesce(row.customer_name, user.user_name, user.name, ''),
    payment_method: coalesce(row.payment_method, row.payment, ''),
    type: coalesce(row.type, row.fulfillment_type, row.delivery_option, row.delivery_type, ''),
    delivery_address: coalesce(row.delivery_address, row.address, ''),
    note_for_restaurant: coalesce(row.note_for_restaurant, row.restaurant_note, row.note_for_store, row.note, ''),
    total: Number(coalesce(row.total, row.total_amount, 0)),
    raw_items: normalizedItems,
    status: String(row.status || 'PENDING').toUpperCase(),
  };
}
async function fetchOrderHydrated({ businessId, ownerType, orderId }) {
  const groupedUrl = buildOrdersGroupedUrl(businessId, ownerType);
  if (!groupedUrl) return null;
  try {
    const token = await getToken();
    const res = await fetch(groupedUrl, {
      method: 'GET',
      headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    const text = await res.text();
    let json = {}; try { json = text ? JSON.parse(text) : {}; } catch {}
    let groups = [];
    if (Array.isArray(json?.data)) groups = json.data;
    else if (Array.isArray(json)) groups = json;
    else return null;

    const flattened = [];
    for (const g of groups) {
      if (Array.isArray(g?.orders)) for (const o of g.orders) flattened.push({ row: o, user: g.user || {} });
      else flattened.push({ row: g, user: g.user || {} });
    }
    const hit = flattened.find(({ row }) => sameId(row?.order_code ?? row?.id ?? row?.order_id, orderId));
    if (!hit) return null;
    return normalizeOrderRecord(hit.row, hit.user);
  } catch { return null; }
}

/* ---------- server actions ---------- */
async function markOneReadServer(notificationId) {
  const url = buildReadOneUrl(notificationId);
  if (!url) return false;
  try {
    const token = await getToken();
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ is_read: true }),
    });
    return res.ok;
  } catch { return false; }
}

/* ============================= Component ============================= */
export default function OrderNotifyOverlay({ navigation }) {
  const [data, setData] = useState(null); // { id (notifId), orderId, title, body, total, status?, ownerType? }
  const [markedRead, setMarkedRead] = useState(false);

  const slide = useRef(new Animated.Value(-260)).current;
  const autoHideRef = useRef(null);      // ⏱️ keep track of auto-hide timer
  const isVisibleRef = useRef(false);    // avoid double-animations

  const clearAutoHide = () => {
    if (autoHideRef.current) {
      clearTimeout(autoHideRef.current);
      autoHideRef.current = null;
    }
  };
  const scheduleAutoHide = () => {
    clearAutoHide();
    autoHideRef.current = setTimeout(() => {
      hide(); // no callback needed
    }, AUTO_HIDE_MS);
  };

  const show = useCallback(() => {
    // If already visible, don't re-run the slide-in; just reset timer
    if (!isVisibleRef.current) {
      Animated.timing(slide, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }).start(() => { isVisibleRef.current = true; });
    }
    scheduleAutoHide(); // always (re)start the timer
  }, [slide]);

  const hide = useCallback((cb) => {
    clearAutoHide();
    Animated.timing(slide, {
      toValue: -260,
      duration: 180,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true
    }).start(({ finished }) => {
      if (finished) {
        isVisibleRef.current = false;
        setData(null);
      }
      cb && cb();
    });
  }, [slide]);

  const normalizeStatus = (v) => (typeof v === 'string' ? v.trim().toUpperCase() : null);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('merchant-notify', (payload) => {
      const { id, orderId, data: inner } = payload || {};
      const title = inner?.title || 'New order';
      const body  = inner?.body  || '';

      let status =
        normalizeStatus(payload?.status) ||
        normalizeStatus(inner?.status) ||
        normalizeStatus(inner?.meta?.status) ||
        (/(?:\b|_)(COMPLETED)(?:\b|_)/i.test(body) ? 'COMPLETED' : null);

      const ownerType =
        inner?.owner_type ||
        payload?.owner_type ||
        inner?.meta?.owner_type ||
        null;

      let total = null;
      const m = body.match(/Nu\W*([\d]+(?:\.[\d]+)?)/i);
      if (m) total = Number(m[1]);

      // 🔁 Overwrite current banner with latest payload
      setMarkedRead(false);
      setData({ id, orderId: String(orderId), title, body, total, status, ownerType });
      show(); // this resets auto-hide timer every time
      DeviceEventEmitter.emit('merchant-notify-ack', { id });
    });
    return () => sub?.remove?.();
  }, [show]);

  // Keep status in overlay in sync if some other screen updates it
  useEffect(() => {
    if (!data?.orderId) return;
    const sub = DeviceEventEmitter.addListener('order-updated', (evt) => {
      if (!evt || String(evt.id) !== String(data.orderId)) return;
      const nextStatus = normalizeStatus(evt.patch?.status);
      if (nextStatus) setData((prev) => prev ? { ...prev, status: nextStatus } : prev);
    });
    return () => sub?.remove?.();
  }, [data?.orderId]);

  const openDetails = useCallback(async () => {
    if (!data?.orderId) return;
    const businessId = await resolveBusinessId();
    const groupedUrl = buildOrdersGroupedUrl(businessId, data?.ownerType);
    const hydrated = await fetchOrderHydrated({ businessId, ownerType: data?.ownerType, orderId: data.orderId });

    hide(() => {
      const ok = safeNavigateToOrderDetails(data.orderId, navigation, {
        fromOverlay: true,
        ownerType: data?.ownerType,
        status: data?.status,
        ordersGroupedUrl: groupedUrl,
        order: hydrated ? hydrated : { id: String(data.orderId) },
      });
      if (!ok) {
        Alert.alert('Navigation', 'Could not open Order Details. Ensure route name is "OrderDetails".');
      }
    });
  }, [data?.orderId, data?.ownerType, data?.status, navigation, hide]);

  const onMarkRead = useCallback(async () => {
    if (!data?.id) return;
    const ok = await markOneReadServer(data.id);
    setMarkedRead(ok || true); // optimistic
    DeviceEventEmitter.emit('notification-read', { id: data.id, ok });
    // keep it showing until auto-hide or user closes; do not hide immediately
  }, [data?.id]);

  useEffect(() => () => clearAutoHide(), []); // cleanup on unmount

  if (!data) return null;

  return (
    <Animated.View style={[styles.wrap, { transform: [{ translateY: slide }] }]}>
      <View style={styles.card}>
        <Pressable onPress={openDetails} android_ripple={{ color: '#e2e8f0' }} style={styles.touchArea}>
          <View style={styles.headerRow}>
            <Icon name="notifications-outline" size={s(18)} color="#065f46" style={{ marginTop: 15 }} />
            <Text style={styles.title} numberOfLines={1}>{data.title}</Text>
          </View>

          <Text style={styles.body} numberOfLines={2}>{data.body}</Text>

          <View style={styles.metaRow}>
            <View style={styles.badge}><Text style={styles.badgeText}>Order: {data.orderId}</Text></View>
            {Number.isFinite(data.total) && (
              <View style={[styles.badge, styles.badgeMoney]}>
                <Text style={[styles.badgeText, styles.badgeMoneyText]}>Total: {currency(data.total)}</Text>
              </View>
            )}
            {!!data.status && (
              <View style={[styles.badge, styles.badgeDone]}>
                <Text style={[styles.badgeText, styles.badgeDoneText]}>{data.status}</Text>
              </View>
            )}
            {!!data.ownerType && (
              <View style={styles.badge}><Text style={styles.badgeText}>{String(data.ownerType).toUpperCase()}</Text></View>
            )}
          </View>
        </Pressable>

        {/* Two compact buttons */}
        <View style={styles.btnRow}>
          <Pressable
            style={({ pressed }) => [styles.btnSm, styles.btnGhost, pressed && { opacity: 0.9 }]}
            onPress={onMarkRead}
          >
            <Icon name={markedRead ? 'checkmark-done-outline' : 'checkmark-outline'} size={s(14)} color={markedRead ? '#0f766e' : '#0f172a'} />
            <Text style={[styles.btnGhostText, markedRead && { color: '#0f766e', fontWeight: '800' }]}>
              {markedRead ? 'Marked read' : 'Mark as read'}
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.btnSm, styles.btnPrimary, pressed && { opacity: 0.9 }]}
            android_ripple={{ color: '#bfdbfe' }}
            onPress={openDetails}
          >
            <Icon name="open-outline" size={s(14)} color="#fff" />
            <Text style={styles.btnPrimaryText}>View details</Text>
          </Pressable>

          <Pressable style={styles.dismiss} onPress={() => hide()}>
            <Icon name="chevron-up" size={s(18)} color="#475569" />
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

/* ---------------- styles ---------------- */
const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0, right: 0, top: 0,
    paddingTop: Platform.select({ ios: s(56), android: s(26), default: s(26) }),
    paddingBottom: s(8),
    paddingHorizontal: 0,
    zIndex: 9999,
    alignItems: 'center',
    pointerEvents: 'box-none',
  },
  card: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 0,
    paddingHorizontal: s(30),
    paddingVertical: s(10),
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: s(14),
    shadowOffset: { width: 0, height: s(8) },
  },
  touchArea: { paddingBottom: s(6) },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: s(6) },
  title: { marginLeft: s(16), marginTop: 15, fontWeight: '800', color: '#064e3b', fontSize: s(16), lineHeight: s(14) },
  body: { color: '#0f172a', marginBottom: s(10), fontSize: s(14), lineHeight: s(19) },

  metaRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: s(8), marginBottom: s(12), flexWrap: 'wrap',
  },
  badge: { paddingHorizontal: s(10), paddingVertical: s(6), borderRadius: s(999), backgroundColor: '#f1f5f9' },
  badgeMoney: { backgroundColor: '#ecfdf5' },
  badgeMoneyText: { color: '#065f46' },
  badgeDone: { backgroundColor: '#ecfdf5' },
  badgeDoneText: { color: '#065f46' },
  badgeText: { fontWeight: '700', color: '#334155', fontSize: s(13) },

  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(20),
    flexWrap: 'wrap',
    justifyContent: 'flex-start'
  },
  btnSm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(6),
    height: s(36),
    paddingHorizontal: s(12),
    borderRadius: s(10),
  },
  btnGhost: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0' },
  btnGhostText: { color: '#0f172a', fontWeight: '700', fontSize: s(13) },
  btnPrimary: { backgroundColor: '#00b14f' },
  btnPrimaryText: { color: '#ffffff', fontWeight: '800', fontSize: s(13) },
  dismiss: {
    height: s(36),
    paddingHorizontal: s(12),
    borderRadius: s(10),
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
