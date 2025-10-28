// screens/NotificationsTab.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, RefreshControl,
  TouchableOpacity, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import { useNavigation } from '@react-navigation/native';
import {
  NOTIFICATIONS_ENDPOINT as ENV_NOTIFS_ENDPOINT,
  NOTIFICATION_READ_ENDPOINT as ENV_NOTIF_READ_ENDPOINT,
  NOTIFICATION_READ_ALL_ENDPOINT as ENV_NOTIF_READ_ALL_ENDPOINT,
  NOTIFICATION_DELETE_ENDPOINT as ENV_NOTIF_DELETE_ENDPOINT,
  ORDER_ENDPOINT as ENV_ORDER_ENDPOINT, // 👈 used to build grouped orders URL
} from '@env';

const STORAGE_KEY_READMAP = '@notifications_readmap_v1';

/* ---------- helpers: business id ---------- */
const toInt = (v) => {
  const n = Number.parseInt(String(v ?? '').trim(), 10);
  return Number.isFinite(n) ? n : null;
};

async function resolveBusinessId(routeParams) {
  const fromParams = toInt(routeParams?.business_id ?? routeParams?.businessId);
  if (fromParams != null) return fromParams;

  try {
    const rawAS = await AsyncStorage.getItem('merchant_login');
    if (rawAS) {
      const parsed = JSON.parse(rawAS);
      const id = toInt(
        parsed?.merchant?.business_id ??
        parsed?.merchant?.businessId ??
        parsed?.business_id ??
        parsed?.businessId
      );
      if (id != null) return id;
    }
  } catch {}

  try {
    const rawSS = await SecureStore.getItemAsync('merchant_login');
    if (rawSS) {
      const parsed = JSON.parse(rawSS);
      const id = toInt(
        parsed?.merchant?.business_id ??
        parsed?.merchant?.businessId ??
        parsed?.business_id ??
        parsed?.businessId
      );
      if (id != null) return id;
    }
  } catch {}

  return null;
}

/* ---------- endpoints (env) ---------- */
const trimSlashes = (s = '') => String(s).replace(/\/+$/, '');
const NOTIFS_BASE   = trimSlashes(String(ENV_NOTIFS_ENDPOINT || ''));
const READ_ONE_BASE = trimSlashes(String(ENV_NOTIF_READ_ENDPOINT || ''));
const READ_ALL_BASE = trimSlashes(String(ENV_NOTIF_READ_ALL_ENDPOINT || ''));
const DELETE_BASE   = trimSlashes(String(ENV_NOTIF_DELETE_ENDPOINT || ''));
const ORDER_BASE    = trimSlashes(String(ENV_ORDER_ENDPOINT || ''));

// For notifications we still need to insert the business id to call the API now:
const buildNotificationsUrl = (businessId) =>
  NOTIFS_BASE ? NOTIFS_BASE.replace('{business_id}', String(businessId)) : null;

const buildReadOneUrl = (notificationId) =>
  READ_ONE_BASE ? READ_ONE_BASE.replace('{notificationId}', String(notificationId)) : null;

const buildReadAllUrl = (businessId) =>
  READ_ALL_BASE
    ? READ_ALL_BASE.replace('{businessId}', String(businessId)).replace('{business_id}', String(businessId))
    : null;

const buildDeleteUrl = (notificationId) =>
  DELETE_BASE ? DELETE_BASE.replace('{notificationId}', String(notificationId)) : null;

// Grouped orders URL to hand to OrderDetails (so it can hydrate exactly like OrdersTab)
const buildOrdersGroupedUrlForNav = (businessId, ownerType) => {
  if (!ORDER_BASE || !businessId) return null;
  let url = ORDER_BASE
    .replace('{businessId}', String(businessId))
    .replace('{business_id}', String(businessId));
  try {
    const u = new URL(url);
    if (ownerType === 'mart' && !u.searchParams.get('owner_type')) {
      u.searchParams.set('owner_type', 'mart');
    }
    return u.toString();
  } catch {
    if (ownerType === 'mart' && !/[?&]owner_type=/.test(url)) {
      url += (url.includes('?') ? '&' : '?') + 'owner_type=mart';
    }
    return url;
  }
};

/* ---------- auth headers ---------- */
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
async function buildHeaders(hasBody) {
  const token = await getToken();
  const h = { Accept: 'application/json' };
  if (hasBody) h['Content-Type'] = 'application/json';
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

/* ---------- UI helpers ---------- */
const typeIcon = (type) => {
  switch (type) {
    case 'order':   return 'receipt-outline';
    case 'success': return 'checkmark-circle-outline';
    case 'warning': return 'alert-circle-outline';
    case 'payout':  return 'card-outline';
    case 'promo':   return 'pricetags-outline';
    default:        return 'notifications-outline';
  }
};
const typeTint = (type) => {
  switch (type) {
    case 'order':   return '#2563eb';
    case 'success': return '#10b981';
    case 'warning': return '#f59e0b';
    case 'payout':  return '#14b8a6';
    case 'promo':   return '#a855f7';
    default:        return '#0ea5e9';
  }
};
const timeAgo = (isoOrDateLike) => {
  try {
    const t = new Date(isoOrDateLike).getTime();
    if (!Number.isFinite(t)) return '';
    const s = Math.max(1, Math.floor((Date.now() - t) / 1000));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    return `${d}d`;
  } catch { return ''; }
};
const fmtTime = (iso) => {
  try {
    const d = new Date(iso);
    const mo = d.toLocaleString(undefined, { month: 'short' });
    const day = String(d.getDate());
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${mo} ${day}, ${hh}:${mm}`;
  } catch { return ''; }
};
const normalizeType = (raw) => {
  const t = String(raw || '').toLowerCase();
  if (t.startsWith('order')) return 'order';
  if (t.includes('payout'))  return 'payout';
  if (t.includes('warn'))    return 'warning';
  if (t.includes('success')) return 'success';
  if (t.includes('promo') || t.includes('offer')) return 'promo';
  return 'system';
};

/* ---------- order id extraction (returns BOTH pretty + numeric) ---------- */
const toOrderParts = (val) => {
  if (!val) return { orderCode: null, orderIdNumeric: null };
  const raw = String(val).trim();
  const m = raw.match(/(?:ORD[-_])?(\d+)/i);
  const num = m?.[1] || null;
  const orderIdNumeric = num ? String(num) : null;
  const orderCode = num ? `ORD-${num}`.toUpperCase() : raw.toUpperCase();
  return { orderCode, orderIdNumeric };
};

const parseOrderFromText = (text = '') => {
  const str = String(text);

  let m = str.match(/\b(ORD[-_]\d+)\b/i) || str.match(/#\s*(ORD[-_]\d+)\b/i);
  if (m?.[1]) return toOrderParts(m[1]);

  m = str.match(/order(?:\s*id)?\s*[:#-]?\s*([A-Za-z0-9-]+)/i);
  if (m?.[1]) return toOrderParts(m[1]);

  m = str.match(/#\s*([0-9]{4,})\b/);
  if (m?.[1]) return toOrderParts(m[1]);

  return { orderCode: null, orderIdNumeric: null };
};

const resolveOrderFromRecord = (n) => {
  const first =
    n.order_code ?? n.orderCode ??
    n.order_no   ?? n.orderNo   ??
    n.order_id   ?? n.orderId   ??
    n.payload?.order_code ??
    n.payload?.order_no   ??
    n.payload?.order_id   ??
    null;

  if (first) return toOrderParts(first);
  return parseOrderFromText(n.body_preview ?? n.body ?? n.message ?? n.description ?? '');
};

/* ---------- infer minimal ORDER status from title/body ---------- */
const inferStatusFromText = (title = '', body = '') => {
  const t = `${title} ${body}`.toLowerCase();
  if (t.includes('completed') || t.includes('delivered')) return 'COMPLETED';
  if (t.includes('out for delivery')) return 'OUT_FOR_DELIVERY';
  if (t.includes('ready')) return 'READY';
  if (t.includes('confirm')) return 'CONFIRMED';
  if (t.includes('declin') || t.includes('reject')) return 'DECLINED';
  return 'PENDING';
};

/* ---------- map API → UI ---------- */
const mapApiNotif = (n, readMap) => {
  const id = String(n.notification_id ?? n.id ?? n._id ?? '');
  if (!id) return null;

  const type = normalizeType(n.type);
  const created = n.created_at ?? n.createdAt ?? n.timestamp ?? null;

  const title = n.title ?? 'Notification';
  let body = n.body_preview ?? n.body ?? n.message ?? n.description ?? '';
  if (String(n.type).toLowerCase() === 'order:status'
      && String(body).toLowerCase().includes('status changed to completed')) {
    body = 'Order completed successfully.';
  }

  const readServer = n.is_read ?? n.read ?? n.isRead ?? null;
  const read = readServer == null ? Boolean(readMap[id]) : (String(readServer) === '1' || readServer === true);

  const { orderCode, orderIdNumeric } = resolveOrderFromRecord(n);

  // Minimal order-like stub ONLY for id/timestamps (OrderDetails will fetch the full record)
  const orderId = orderIdNumeric ?? orderCode ?? null;
  const createdISO = created || null;
  const status = inferStatusFromText(title, body);

  const minimalOrder = orderId ? {
    id: String(orderId),
    created_at: createdISO,
    time: createdISO ? fmtTime(createdISO) : '',
    status,
  } : null;

  return {
    id, orderCode, orderIdNumeric,
    title: String(title),
    body: String(body),
    timeAgo: created ? timeAgo(created) : '',
    type,
    read,
    _created_at: created ?? null,
    _order_like: minimalOrder,
  };
};

/* ---------- API calls (PATCH only) ---------- */
const ok = (r) => r && (r.status === 200 || r.status === 204 || r.ok);

async function markOneReadServer(id) {
  const url = buildReadOneUrl(id);
  if (!url) return false;
  try {
    const headers = await buildHeaders(true);
    const res = await fetch(url, { method: 'PATCH', headers, body: JSON.stringify({ is_read: true }) });
    return ok(res);
  } catch { return false; }
}

async function markAllReadServer(businessId) {
  const url = buildReadAllUrl(businessId);
  if (!url) return false;
  try {
    const headers = await buildHeaders(true);
    const res = await fetch(url, { method: 'PATCH', headers, body: JSON.stringify({ is_read: true }) });
    return ok(res);
  } catch { return false; }
}

async function deleteNotificationServer(id) {
  const url = buildDeleteUrl(id);
  if (!url) return false;
  try {
    const headers = await buildHeaders(false);
    const res = await fetch(url, { method: 'DELETE', headers });
    return ok(res);
  } catch { return false; }
}

/* ============================= Component ============================= */
export default function NotificationsTab({
  isTablet = false,
  route,
  detailsRoute = 'OrderDetails', // ⬅️ align with OrdersTab
}) {
  const navigation = useNavigation();
  const [list, setList] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [bizId, setBizId] = useState(null);
  const readMapRef = useRef({});

  // ownerType to pass through (supports both owner types)
  const ownerType = String(route?.params?.ownerType || 'food').toLowerCase() === 'mart' ? 'mart' : 'food';

  useEffect(() => {
    (async () => setBizId(await resolveBusinessId(route?.params ?? {})))();
  }, [route?.params]);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY_READMAP);
        readMapRef.current = raw ? JSON.parse(raw) : {};
      } catch {
        readMapRef.current = {};
      }
    })();
  }, []);

  const saveReadMap = useCallback(async (next) => {
    readMapRef.current = next;
    try { await AsyncStorage.setItem(STORAGE_KEY_READMAP, JSON.stringify(next)); } catch {}
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (!bizId) return;
    const url = buildNotificationsUrl(bizId);
    if (!url) return;

    try {
      const headers = await buildHeaders(false);
      const res = await fetch(url, { headers });
      const text = await res.text();
      let data = {};
      try { data = JSON.parse(text); } catch {}
      const arr = Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.notifications)
          ? data.notifications
          : Array.isArray(data) ? data : [];

      const mapped = arr.map((n) => mapApiNotif(n, readMapRef.current)).filter(Boolean);
      mapped.sort((a, b) => (new Date(b._created_at) - new Date(a._created_at)));
      setList(mapped);
    } catch {}
  }, [bizId]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchNotifications();
    setRefreshing(false);
  }, [fetchNotifications]);

  /* ---------- actions ---------- */
  const unreadCount = useMemo(() => list.filter((n) => !n.read).length, [list]);

  const markAllRead = async () => {
    const nextReadMap = { ...readMapRef.current };
    for (const n of list) nextReadMap[n.id] = true;
    await saveReadMap(nextReadMap);
    setList((cur) => cur.map((n) => ({ ...n, read: true })));
    if (bizId) {
      const ok = await markAllReadServer(bizId);
      if (!ok) onRefresh();
    }
  };

  const onPressItem = async (item) => {
    // Use the most reliable id and let OrderDetails hydrate from backend (same as OrdersTab)
    const orderId = item.orderIdNumeric ?? item.orderCode ?? item._order_like?.id ?? null;
    if (orderId) {
      const groupedUrl = buildOrdersGroupedUrlForNav(bizId, ownerType);
      navigation.navigate(detailsRoute, {
        orderId: String(orderId),
        businessId: bizId,
        ownerType,                  // 'food' | 'mart'
        ordersGroupedUrl: groupedUrl,
        // Do not prefill fields; backend is the source of truth
        order: { id: String(orderId) },
      });
    }

    // Optimistic mark read
    if (!item.read) {
      setList((cur) => cur.map((n) => (n.id === item.id ? { ...n, read: true } : n)));
      const nextReadMap = { ...readMapRef.current, [item.id]: true };
      await saveReadMap(nextReadMap);
      const ok = await markOneReadServer(item.id);
      if (!ok) {
        const rollback = { ...readMapRef.current, [item.id]: false };
        await saveReadMap(rollback);
        setList((cur) => cur.map((n) => (n.id === item.id ? { ...n, read: false } : n)));
      }
    }
  };

  const confirmDelete = (item) => {
    Alert.alert(
      'Delete Notification',
      'Are you sure you want to delete this notification?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setList((cur) => cur.filter((n) => n.id !== item.id)); // optimistic
            const ok = await deleteNotificationServer(item.id);
            if (!ok) onRefresh();
          },
        },
      ],
      { cancelable: true }
    );
  };

  const renderRightActions = (item) => (
    <TouchableOpacity onPress={() => confirmDelete(item)} style={styles.deleteAction}>
      <Ionicons name="trash-outline" size={22} color="#fff" />
    </TouchableOpacity>
  );

  const renderItem = ({ item }) => (
    <Swipeable renderRightActions={() => renderRightActions(item)}>
      <TouchableOpacity onPress={() => onPressItem(item)} activeOpacity={0.7} style={styles.itemWrap}>
        <View style={[styles.iconWrap, { backgroundColor: typeTint(item.type) + '22' }]}>
          <Ionicons name={typeIcon(item.type)} size={22} color={typeTint(item.type)} />
          {!item.read && <View style={styles.unreadDot} />}
        </View>
        <View style={styles.itemTextWrap}>
          <View style={styles.itemTopRow}>
            <Text style={[styles.itemTitle, !item.read && styles.itemTitleUnread]} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.time}>{item.timeAgo}</Text>
          </View>
          <Text style={styles.itemBody} numberOfLines={2}>{item.body}</Text>
        </View>
      </TouchableOpacity>
    </Swipeable>
  );

  const ListHeader = () => (
    <View style={styles.headerTools}>
      <View style={styles.headerTitleRow}>
        <Text style={[styles.title, { fontSize: isTablet ? 22 : 18 }]}>Notifications</Text>
        {unreadCount > 0 && (
          <View style={styles.badge}><Text style={styles.badgeText}>{unreadCount}</Text></View>
        )}
      </View>
      <TouchableOpacity onPress={markAllRead} style={[styles.actionBtn, { alignSelf: 'flex-start' }]}>
        <Ionicons name="checkmark-done-outline" size={16} color="#00b14f" />
        <Text style={styles.actionText}>Mark all read</Text>
      </TouchableOpacity>
    </View>
  );

  const Empty = () => (
    <View style={styles.emptyWrap}>
      <Ionicons name="notifications-off-outline" size={32} color="#9ca3af" />
      <Text style={styles.emptyTitle}>You’re all caught up</Text>
      <Text style={styles.emptyBody}>New notifications will appear here.</Text>
    </View>
  );

  return (
    <View style={styles.wrap}>
      <FlatList
        data={list}
        keyExtractor={(it) => it.id}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={Empty}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingBottom: 24 }}
      />
    </View>
  );
}

/* ---------- styles ---------- */
const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#f6f7f8' },
  headerTools: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  title: { fontWeight: '700', color: '#111827' },
  badge: { backgroundColor: '#00b14f', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 8,
    borderRadius: 9, borderWidth: 1, borderColor: '#e5e7eb',
  },
  actionText: { color: '#00b14f', fontWeight: '600' },
  sep: { height: 1, backgroundColor: '#e5e7eb', marginLeft: 16 },

  itemWrap: { flexDirection: 'row', backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12 },
  iconWrap: {
    width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    marginRight: 12, position: 'relative',
  },
  unreadDot: {
    position: 'absolute', top: -2, right: -2, width: 10, height: 10, borderRadius: 5,
    backgroundColor: '#00b14f', borderWidth: 2, borderColor: '#fff',
  },
  itemTextWrap: { flex: 1 },
  itemTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  itemTitle: { color: '#111827', fontWeight: '600' },
  itemTitleUnread: { fontWeight: '800' },
  itemBody: { color: '#4b5563', marginTop: 2 },
  time: { color: '#6b7280', fontSize: 12 },

  deleteAction: {
    backgroundColor: '#ef4444', justifyContent: 'center', alignItems: 'center',
    width: 70, borderRadius: 8, marginVertical: 4,
  },

  emptyWrap: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyTitle: { color: '#111827', fontWeight: '700' },
  emptyBody: { color: '#6b7280' },
});
