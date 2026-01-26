// screens/NotificationsTab.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Alert,
  Modal,
  ScrollView,
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
  ORDER_ENDPOINT as ENV_ORDER_ENDPOINT,
  SYSTEM_NOTIFICATIONS_ENDPOINT as ENV_SYSTEM_NOTIFS_ENDPOINT,
} from '@env';

const STORAGE_KEY_READMAP = '@notifications_readmap_v1';

/* ---------- helpers: int ---------- */
const toInt = (v) => {
  const n = Number.parseInt(String(v ?? '').trim(), 10);
  return Number.isFinite(n) ? n : null;
};

/* ---------- helpers: business id ---------- */
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

/* ---------- helpers: user id (for system notifications) ---------- */
async function resolveUserId() {
  try {
    const rawAS = await AsyncStorage.getItem('merchant_login');
    if (rawAS) {
      const parsed = JSON.parse(rawAS);
      const id = toInt(
        parsed?.merchant?.user_id ??
          parsed?.merchant?.id ??
          parsed?.user?.id ??
          parsed?.user_id ??
          parsed?.id
      );
      if (id != null) return id;
    }
  } catch {}

  try {
    const rawSS = await SecureStore.getItemAsync('merchant_login');
    if (rawSS) {
      const parsed = JSON.parse(rawSS);
      const id = toInt(
        parsed?.merchant?.user_id ??
          parsed?.merchant?.id ??
          parsed?.user?.id ??
          parsed?.user_id ??
          parsed?.id
      );
      if (id != null) return id;
    }
  } catch {}

  return null;
}

/* ---------- endpoints (env) ---------- */
const trimSlashes = (s = '') => String(s).replace(/\/+$/, '');
const NOTIFS_BASE = trimSlashes(String(ENV_NOTIFS_ENDPOINT || ''));
const READ_ONE_BASE = trimSlashes(String(ENV_NOTIF_READ_ENDPOINT || ''));
const READ_ALL_BASE = trimSlashes(String(ENV_NOTIF_READ_ALL_ENDPOINT || ''));
const DELETE_BASE = trimSlashes(String(ENV_NOTIF_DELETE_ENDPOINT || ''));
const ORDER_BASE = trimSlashes(String(ENV_ORDER_ENDPOINT || ''));
const SYSTEM_NOTIFS_BASE = trimSlashes(String(ENV_SYSTEM_NOTIFS_ENDPOINT || ''));

const buildNotificationsUrl = (businessId) =>
  NOTIFS_BASE ? NOTIFS_BASE.replace('{business_id}', String(businessId)) : null;

const buildReadOneUrl = (notificationId) =>
  READ_ONE_BASE ? READ_ONE_BASE.replace('{notificationId}', String(notificationId)) : null;

const buildReadAllUrl = (businessId) =>
  READ_ALL_BASE
    ? READ_ALL_BASE.replace('{businessId}', String(businessId)).replace(
        '{business_id}',
        String(businessId)
      )
    : null;

const buildDeleteUrl = (notificationId) =>
  DELETE_BASE ? DELETE_BASE.replace('{notificationId}', String(notificationId)) : null;

const buildSystemNotificationsUrl = (userId) =>
  SYSTEM_NOTIFS_BASE ? SYSTEM_NOTIFS_BASE.replace('{user_id}', String(userId)) : null;

// Grouped orders URL (same one OrdersTab uses)
const buildOrdersGroupedUrl = (businessId, ownerType) => {
  if (!ORDER_BASE || !businessId) return null;
  let url = ORDER_BASE.replace('{businessId}', String(businessId)).replace(
    '{business_id}',
    String(businessId)
  );
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

/* ---------- TIME HELPERS ---------- */
const showAsGiven = (s) => {
  if (!s) return '';
  const d = String(s);
  const isoish = d.includes('T') ? d : d.replace(' ', 'T');
  const y = isoish.slice(0, 4),
    m = isoish.slice(5, 7),
    dd = isoish.slice(8, 10);
  const hh = isoish.slice(11, 13),
    mm = isoish.slice(14, 16);
  const monNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mon = monNames[(+m || 1) - 1] || m;
  if (!y || !m || !dd || !hh || !mm) return d;
  return `${mon} ${dd}, ${hh}:${mm}`;
};

const parseLocalFromGiven = (s) => {
  if (!s) return null;
  const str = String(s).replace(' ', 'T');
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, hh, mm, ss] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm), Number(ss || '0'));
};

const timeAgoLocal = (s) => {
  const dt = parseLocalFromGiven(s) || new Date(s);
  if (!dt || isNaN(+dt)) return '';
  const diffSec = Math.max(1, Math.floor((Date.now() - dt.getTime()) / 1000));
  if (diffSec < 60) return `${diffSec}s`;
  const m = Math.floor(diffSec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
};

const isTodayLocal = (s) => {
  const dt = parseLocalFromGiven(s) || new Date(s);
  if (!dt || isNaN(+dt)) return false;
  const now = new Date();
  return (
    dt.getFullYear() === now.getFullYear() &&
    dt.getMonth() === now.getMonth() &&
    dt.getDate() === now.getDate()
  );
};

/* ---------- type helpers ---------- */
const typeIcon = (type) => {
  switch (type) {
    case 'order':
      return 'receipt-outline';
    case 'success':
      return 'checkmark-circle-outline';
    case 'warning':
      return 'alert-circle-outline';
    case 'payout':
      return 'card-outline';
    case 'wallet':
      return 'card-outline';
    default:
      return 'time-outline';
  }
};
const typeTint = (type) => {
  switch (type) {
    case 'order':
      return '#2563eb';
    case 'success':
      return '#10b981';
    case 'warning':
      return '#f59e0b';
    case 'payout':
      return '#14b8a6';
    case 'wallet':
      return '#14b8a6';
    default:
      return '#0ea5e9';
  }
};

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
    n.order_code ??
    n.orderCode ??
    n.order_no ??
    n.orderNo ??
    n.order_id ??
    n.orderId ??
    n.payload?.order_code ??
    n.payload?.order_no ??
    n.payload?.order_id ??
    null;

  if (first) return toOrderParts(first);
  return parseOrderFromText(n.body_preview ?? n.body ?? n.message ?? n.description ?? '');
};

const inferStatusFromText = (title = '', body = '') => {
  const t = `${title} ${body}`.toLowerCase();
  if (t.includes('completed') || t.includes('delivered')) return 'COMPLETED';
  if (t.includes('out for delivery')) return 'OUT_FOR_DELIVERY';
  if (t.includes('ready')) return 'READY';
  if (t.includes('confirm')) return 'CONFIRMED';
  if (t.includes('declin') || t.includes('reject')) return 'DECLINED';
  return 'PENDING';
};

const isDeliveredLike = (status) => {
  const s = String(status || '').toUpperCase();
  return s === 'COMPLETED' || s === 'DELIVERED' || s === 'DELIVERED_SUCCESS' || s === 'SUCCESS';
};

/* ---------- filters/tabs ---------- */
const FILTER_TABS = [
  { key: 'all', label: 'All' },
  { key: 'orders', label: 'Orders' },
  { key: 'wallet', label: 'Wallet' },
  { key: 'system', label: 'System' },
];

/* ---------- local helpers ---------- */
function normalizeType(raw) {
  const t = String(raw || '').toLowerCase();
  if (t.includes('wallet')) return 'wallet';
  if (t.startsWith('order')) return 'order';
  if (t.includes('payout')) return 'payout';
  if (t.includes('warn')) return 'warning';
  if (t.includes('success')) return 'success';
  return 'system';
}

/* ---------- map API → UI ---------- */
const mapApiNotif = (n, readMap) => {
  const id = String(n.notification_id ?? n.id ?? n._id ?? '');
  if (!id) return null;

  const type = normalizeType(n.type);
  const created = n.created_at ?? n.createdAt ?? n.timestamp ?? null;

  const title = n.title ?? 'Activity';
  let body = n.body_preview ?? n.body ?? n.message ?? n.description ?? '';
  if (
    String(n.type).toLowerCase() === 'order:status' &&
    String(body).toLowerCase().includes('status changed to completed')
  ) {
    body = 'Order completed successfully.';
  }

  const readServer = n.is_read ?? n.read ?? n.isRead ?? null;
  const read =
    readServer == null ? Boolean(readMap[id]) : String(readServer) === '1' || readServer === true;

  const { orderCode, orderIdNumeric } = resolveOrderFromRecord(n);
  const orderId = orderIdNumeric ?? orderCode ?? null;
  const createdISO = created || null;
  const status = inferStatusFromText(title, body);

  const absolute = createdISO ? showAsGiven(createdISO) : '';
  const relative = createdISO ? timeAgoLocal(createdISO) : '';
  const chip = createdISO && isTodayLocal(createdISO) ? relative : absolute;

  const customerName =
    n.customer_name ??
    n.customerName ??
    n.user_name ??
    n.userName ??
    n.user?.name ??
    n.user?.user_name ??
    '';

  const minimalOrder = orderId
    ? {
        id: String(orderId),
        created_at: createdISO,
        time: absolute,
        status,
        customer_name: customerName || '',
      }
    : null;

  const walletId = n.wallet_id ?? n.walletId ?? n.wallet ?? null;
  const userId = n.user_id ?? n.userId ?? null;

  return {
    id,
    orderCode,
    orderIdNumeric,
    title: String(title),
    body: String(body),
    displayChip: chip,
    type,
    read,
    _created_at: created ?? null,
    _order_like: minimalOrder,
    walletId: walletId ? String(walletId) : null,
    userId: userId ? String(userId) : null,
  };
};

/* ---------- fetch a single order from grouped endpoint ---------- */
const sameId = (a, b) =>
  String(a ?? '').replace(/^ORD[-_]?/i, '') === String(b ?? '').replace(/^ORD[-_]?/i, '');

function coalesce(...vals) {
  for (const v of vals) if (v != null && v !== '') return v;
  return null;
}

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
    note_for_restaurant: coalesce(
      row.note_for_restaurant,
      row.restaurant_note,
      row.note_for_store,
      row.note,
      ''
    ),
    total: Number(coalesce(row.total, row.total_amount, 0)),
    raw_items: normalizedItems,
    status: String(row.status || 'PENDING').toUpperCase(),
  };
}

async function fetchOrderHydrated({ businessId, ownerType, orderId }) {
  const base = buildOrdersGroupedUrl(businessId, ownerType);
  if (!base) return null;

  try {
    const headers = await buildHeaders(false);
    const res = await fetch(base, { headers });
    const text = await res.text();
    let json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {}

    let groups = [];
    if (Array.isArray(json?.data)) groups = json.data;
    else if (Array.isArray(json)) groups = json;
    else return null;

    const flattened = [];
    for (const g of groups) {
      if (Array.isArray(g?.orders)) {
        for (const o of g.orders) flattened.push({ row: o, user: g.user || {} });
      } else {
        flattened.push({ row: g, user: g.user || {} });
      }
    }

    const hit = flattened.find(({ row }) =>
      sameId(row?.order_code ?? row?.id ?? row?.order_id, orderId)
    );
    if (!hit) return null;

    return normalizeOrderRecord(hit.row, hit.user);
  } catch {
    return null;
  }
}

/* ---------- API calls ---------- */
const ok = (r) => r && (r.status === 200 || r.status === 204 || r.ok);

async function markOneReadServer(id) {
  const url = buildReadOneUrl(id);
  if (!url) return false;
  try {
    const headers = await buildHeaders(true);
    const res = await fetch(url, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ is_read: true }),
    });
    return ok(res);
  } catch {
    return false;
  }
}

async function markAllReadServer(businessId) {
  const url = buildReadAllUrl(businessId);
  if (!url) return false;
  try {
    const headers = await buildHeaders(true);
    const res = await fetch(url, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ is_read: true }),
    });
    return ok(res);
  } catch {
    return false;
  }
}

async function deleteNotificationServer(id) {
  const url = buildDeleteUrl(id);
  if (!url) return false;
  try {
    const headers = await buildHeaders(false);
    const res = await fetch(url, { method: 'DELETE', headers });
    return ok(res);
  } catch {
    return false;
  }
}

/* ============================= Component ============================= */
export default function NotificationsTab({
  isTablet = false,
  route,
  detailsRoute = 'OrderDetails',
  kpis,
}) {
  const navigation = useNavigation();
  const [list, setList] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [bizId, setBizId] = useState(null);
  const [userId, setUserId] = useState(null);

  const [activeTab, setActiveTab] = useState('all');

  // overlay for BOTH system + orders + others
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [selectedOrderDetails, setSelectedOrderDetails] = useState(null);
  const [orderLoading, setOrderLoading] = useState(false);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const readMapRef = useRef({});

  const ownerType =
    String(route?.params?.ownerType || 'food').toLowerCase() === 'mart' ? 'mart' : 'food';

  useEffect(() => {
    (async () => setBizId(await resolveBusinessId(route?.params ?? {})))();
  }, [route?.params]);

  useEffect(() => {
    (async () => setUserId(await resolveUserId()))();
  }, []);

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
    try {
      await AsyncStorage.setItem(STORAGE_KEY_READMAP, JSON.stringify(next));
    } catch {}
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (!bizId && !userId) return;

    let mappedAll = [];

    try {
      const headers = await buildHeaders(false);

      if (bizId) {
        const url = buildNotificationsUrl(bizId);
        if (url) {
          try {
            const res = await fetch(url, { headers });
            const text = await res.text();
            let data = {};
            try {
              data = JSON.parse(text);
            } catch {}

            const arr = Array.isArray(data?.data)
              ? data.data
              : Array.isArray(data?.notifications)
              ? data.notifications
              : Array.isArray(data)
              ? data
              : [];

            const mappedBiz = arr
              .map((n) => mapApiNotif(n, readMapRef.current))
              .filter(Boolean)
              .map((n) => ({ ...n, source: 'business' }));

            mappedAll = mappedAll.concat(mappedBiz);
          } catch {}
        }
      }

      if (userId) {
        const sysUrl = buildSystemNotificationsUrl(userId);
        if (sysUrl) {
          try {
            const resSys = await fetch(sysUrl, { headers });
            const textSys = await resSys.text();
            let dataSys = {};
            try {
              dataSys = JSON.parse(textSys);
            } catch {}

            const arrSys = Array.isArray(dataSys?.notifications)
              ? dataSys.notifications
              : Array.isArray(dataSys?.data)
              ? dataSys.data
              : Array.isArray(dataSys)
              ? dataSys
              : [];

            const mappedSys = arrSys
              .map((n) => mapApiNotif(n, readMapRef.current))
              .filter(Boolean)
              .map((n) => ({
                ...n,
                type: 'system',
                source: 'system',
              }));

            mappedAll = mappedAll.concat(mappedSys);
          } catch {}
        }
      }

      mappedAll.sort((a, b) => new Date(b._created_at) - new Date(a._created_at));
      setList(mappedAll);
      setSelectionMode(false);
      setSelectedIds(() => new Set());
    } catch {}
  }, [bizId, userId]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchNotifications();
    setRefreshing(false);
  }, [fetchNotifications]);

  const unreadCount = useMemo(() => list.filter((n) => !n.read).length, [list]);

  const filteredList = useMemo(() => {
    switch (activeTab) {
      case 'orders':
        return list.filter((n) => n.type === 'order');
      case 'wallet':
        return list.filter((n) => n.type === 'wallet' || n.type === 'payout');
      case 'system':
        return list.filter((n) => n.type === 'system');
      case 'all':
      default:
        return list;
    }
  }, [list, activeTab]);

  const anySelectedUnread = useMemo(
    () => list.some((n) => selectedIds.has(n.id) && !n.read),
    [list, selectedIds]
  );

  const toggleSelect = useCallback((id) => {
    if (!id) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (next.size === 0) setSelectionMode(false);
      return next;
    });
  }, []);

  const cancelSelection = () => {
    setSelectionMode(false);
    setSelectedIds(() => new Set());
  };

  const deleteSelected = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;

    Alert.alert(
      'Delete Activities',
      `Delete ${ids.length} selected ${ids.length === 1 ? 'activity' : 'activities'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setList((cur) => cur.filter((n) => !ids.includes(n.id)));
            setSelectionMode(false);
            setSelectedIds(() => new Set());

            for (const id of ids) {
              // eslint-disable-next-line no-await-in-loop
              await deleteNotificationServer(id);
            }

            onRefresh();
          },
        },
      ],
      { cancelable: true }
    );
  };

  const markSelectedRead = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;

    const snapshot = list;

    setList((cur) => cur.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n)));

    const nextReadMap = { ...readMapRef.current };
    ids.forEach((id) => (nextReadMap[id] = true));
    await saveReadMap(nextReadMap);

    for (const id of ids) {
      const item = snapshot.find((n) => n.id === id);
      if (item && item.source === 'business') {
        // eslint-disable-next-line no-await-in-loop
        await markOneReadServer(id);
      }
    }

    setSelectionMode(false);
    setSelectedIds(() => new Set());
    onRefresh();
  };

  const markAllRead = async () => {
    const anyUnread = list.some((n) => !n.read);
    if (!anyUnread) return;

    Alert.alert('Mark all as read', 'This will mark all activities as read.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Mark all',
        style: 'default',
        onPress: async () => {
          const nextReadMap = { ...readMapRef.current };
          for (const n of list) nextReadMap[n.id] = true;
          await saveReadMap(nextReadMap);

          setList((cur) => cur.map((n) => ({ ...n, read: true })));

          if (bizId) {
            const okRes = await markAllReadServer(bizId);
            if (!okRes) onRefresh();
          }
        },
      },
    ]);
  };

  const markReadOnClick = useCallback(
    async (item) => {
      if (!item || item.read) return;

      setList((cur) => cur.map((n) => (n.id === item.id ? { ...n, read: true } : n)));
      const nextReadMap = { ...readMapRef.current, [item.id]: true };
      await saveReadMap(nextReadMap);

      if (item.source === 'business') {
        await markOneReadServer(item.id); // ✅ NOTIFICATION_READ_ENDPOINT
      }
    },
    [saveReadMap]
  );

  const onPressItem = async (item) => {
    if (selectionMode) {
      if (item.source !== 'system') toggleSelect(item.id);
      return;
    }

    await markReadOnClick(item);

    if (item.type === 'wallet' || item.type === 'payout') {
      navigation.navigate('GrabMerchantHomeScreen', { activeTab: 'Payouts', from: 'Notifications' });
      return;
    }

    setSelectedActivity(item);
    setSelectedOrderDetails(null);

    if (item.type === 'order') {
      const orderId = item.orderIdNumeric ?? item.orderCode ?? item._order_like?.id ?? null;
      if (!orderId || !bizId) return;

      setOrderLoading(true);
      try {
        const hydrated = await fetchOrderHydrated({
          businessId: bizId,
          ownerType,
          orderId: String(orderId),
        });
        setSelectedOrderDetails(hydrated || null);
      } catch {
        setSelectedOrderDetails(null);
      } finally {
        setOrderLoading(false);
      }
    }
  };

  const confirmDelete = (item) => {
    if (item.source === 'system') return;

    Alert.alert('Delete Activity', 'Are you sure you want to delete this activity?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setList((cur) => cur.filter((n) => n.id !== item.id));
          const okRes = await deleteNotificationServer(item.id);
          if (!okRes) onRefresh();
        },
      },
    ]);
  };

  const renderRightActions = (item) => (
    <TouchableOpacity onPress={() => confirmDelete(item)} style={styles.deleteAction}>
      <Ionicons name="trash-outline" size={22} color="#fff" />
    </TouchableOpacity>
  );

  const renderItem = useCallback(
    ({ item }) => {
      const isSelected = selectedIds.has(item.id);

      const content = (
        <TouchableOpacity
          onPress={() => onPressItem(item)}
          onLongPress={() => {
            setSelectionMode(true);
            setSelectedIds(() => new Set([item.id]));
          }}
          activeOpacity={0.7}
          style={[styles.itemWrap, isSelected && styles.itemWrapSelected]}
        >
          <View style={[styles.iconWrap, { backgroundColor: typeTint(item.type) + '22' }]}>
            <Ionicons name={typeIcon(item.type)} size={22} color={typeTint(item.type)} />
            {!item.read && <View style={styles.unreadDot} />}
            {selectionMode && (
              <View style={styles.checkboxOverlay}>
                <Ionicons
                  name={isSelected ? 'checkbox-outline' : 'square-outline'}
                  size={18}
                  color={isSelected ? '#00b14f' : '#9ca3af'}
                />
              </View>
            )}
          </View>

          <View style={styles.itemTextWrap}>
            <View style={styles.itemTopRow}>
              <Text style={[styles.itemTitle, !item.read && styles.itemTitleUnread]} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={styles.time}>{item.displayChip}</Text>
            </View>
            <Text style={styles.itemBody} numberOfLines={2}>
              {item.body}
            </Text>
          </View>
        </TouchableOpacity>
      );

      if (selectionMode || item.source === 'system') return content;
      return <Swipeable renderRightActions={() => renderRightActions(item)}>{content}</Swipeable>;
    },
    [selectionMode, selectedIds, onPressItem]
  );

  const keyExtractor = useCallback((it) => it.id, []);
  const renderSeparator = useCallback(() => <View style={styles.sep} />, []);

  const ListHeader = () => {
    const canMarkAll = unreadCount > 0;
    const selectedCount = selectedIds.size;

    if (selectionMode) {
      return (
        <View style={styles.headerTools}>
          <View style={styles.headerTitleRow}>
            <TouchableOpacity
              onPress={cancelSelection}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-outline" size={22} color="#111827" />
            </TouchableOpacity>
            <Text style={[styles.title, { fontSize: isTablet ? 20 : 16 }]}>{selectedCount} selected</Text>
            <View style={{ flex: 1 }} />
            {selectedCount > 0 && (
              <>
                <TouchableOpacity
                  onPress={anySelectedUnread ? markSelectedRead : undefined}
                  style={[styles.bulkReadBtn, { opacity: anySelectedUnread ? 1 : 0.4, marginRight: 8 }]}
                  activeOpacity={anySelectedUnread ? 0.8 : 1}
                >
                  <Ionicons name="checkmark-done-outline" size={16} color="#fff" />
                  <Text style={styles.bulkReadText}>Mark read</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={deleteSelected} style={styles.bulkDeleteBtn} activeOpacity={0.8}>
                  <Ionicons name="trash-outline" size={16} color="#fff" />
                  <Text style={styles.bulkDeleteText}>Delete</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      );
    }

    return (
      <View style={styles.headerTools}>
        <View style={styles.headerTitleRow}>
          <Text style={[styles.title, { fontSize: isTablet ? 22 : 18 }]}>Activities</Text>
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          onPress={canMarkAll ? markAllRead : undefined}
          style={[styles.actionBtn, { alignSelf: 'flex-start', opacity: canMarkAll ? 1 : 0.5 }]}
          activeOpacity={canMarkAll ? 0.8 : 1}
        >
          <Ionicons name="checkmark-done-outline" size={16} color="#00b14f" />
          <Text style={styles.actionText}>{canMarkAll ? 'Mark all read' : 'All read'}</Text>
        </TouchableOpacity>

        <View style={styles.tabsRow}>
          {FILTER_TABS.map((tab) => {
            const active = tab.key === activeTab;
            return (
              <TouchableOpacity
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={[styles.tabPill, active && styles.tabPillActive]}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]} numberOfLines={1}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  const Empty = () => (
    <View style={styles.emptyWrap}>
      <Ionicons name="time-outline" size={32} color="#9ca3af" />
      <Text style={styles.emptyTitle}>You’re all caught up</Text>
      <Text style={styles.emptyBody}>New activities will appear here.</Text>
    </View>
  );

  const closeActivityModal = () => {
    setSelectedActivity(null);
    setSelectedOrderDetails(null);
    setOrderLoading(false);
  };

  const goToOrderDetailsFromModal = () => {
    if (!selectedActivity || selectedActivity.type !== 'order') return;
    const orderId = selectedActivity.orderIdNumeric ?? selectedActivity.orderCode ?? null;
    if (!orderId || !bizId) return;

    const groupedUrl = buildOrdersGroupedUrl(bizId, ownerType);
    const fallbackOrder = {
      id: String(orderId),
      customer_name: selectedActivity?._order_like?.customer_name || '',
    };

    navigation.navigate(detailsRoute, {
      orderId: String(orderId),
      businessId: bizId,
      ownerType,
      ordersGroupedUrl: groupedUrl,
      order: selectedOrderDetails ? selectedOrderDetails : fallbackOrder,
    });

    closeActivityModal();
  };

  const prettyStatus = (s) => String(s || '').replace(/_/g, ' ');

  // ✅ delivered detection for hiding "Open details"
  const deliveredNow =
    selectedActivity?.type === 'order' &&
    (isDeliveredLike(selectedOrderDetails?.status) ||
      isDeliveredLike(selectedActivity?._order_like?.status) ||
      isDeliveredLike(inferStatusFromText(selectedActivity?.title, selectedActivity?.body)));

  return (
    <View style={styles.wrap}>
      {selectionMode && <ListHeader />}

      <FlatList
        data={filteredList}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ItemSeparatorComponent={renderSeparator}
        ListHeaderComponent={!selectionMode ? ListHeader : null}
        ListEmptyComponent={Empty}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingBottom: 24 }}
        initialNumToRender={15}
        maxToRenderPerBatch={20}
        windowSize={7}
        removeClippedSubviews
      />

      <Modal
        visible={!!selectedActivity}
        transparent
        animationType="fade"
        onRequestClose={closeActivityModal}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Ionicons
                name={typeIcon(selectedActivity?.type)}
                size={22}
                color="#00b14f"
                style={{ marginRight: 6 }}
              />
              <Text style={styles.modalTitle} numberOfLines={2}>
                {selectedActivity?.title}
              </Text>
            </View>

            {!!selectedActivity?._created_at && (
              <Text style={styles.modalTime}>{showAsGiven(selectedActivity._created_at)}</Text>
            )}

            <Text style={styles.modalBody}>{selectedActivity?.body}</Text>

            {selectedActivity?.type === 'order' && (
              <View style={styles.orderBox}>
                <View style={styles.orderRow}>
                  <Text style={styles.orderLabel}>Order</Text>
                  <Text style={styles.orderValue}>
                    {selectedActivity?.orderCode ||
                      (selectedActivity?.orderIdNumeric ? `ORD-${selectedActivity.orderIdNumeric}` : '—')}
                  </Text>
                </View>

                {orderLoading ? (
                  <View style={{ paddingVertical: 10 }}>
                    <Text style={styles.orderMuted}>Loading order details…</Text>
                  </View>
                ) : selectedOrderDetails ? (
                  <>
                    <View style={styles.orderRow}>
                      <Text style={styles.orderLabel}>Status</Text>
                      <Text style={styles.orderValue}>{prettyStatus(selectedOrderDetails.status)}</Text>
                    </View>

                    {!!selectedOrderDetails.customer_name && (
                      <View style={styles.orderRow}>
                        <Text style={styles.orderLabel}>Customer</Text>
                        <Text style={styles.orderValue}>{selectedOrderDetails.customer_name}</Text>
                      </View>
                    )}

                    {Array.isArray(selectedOrderDetails.raw_items) &&
                      selectedOrderDetails.raw_items.length > 0 && (
                        <View style={{ marginTop: 8 }}>
                          <Text style={styles.orderLabel}>Items</Text>
                          <ScrollView style={{ maxHeight: 140, marginTop: 6 }}>
                            {selectedOrderDetails.raw_items.slice(0, 30).map((it, idx) => (
                              <View key={String(it.item_id ?? idx)} style={styles.itemLine}>
                                <Text style={styles.itemLineText} numberOfLines={1}>
                                  {it.quantity} × {it.item_name}
                                </Text>
                              </View>
                            ))}
                          </ScrollView>
                        </View>
                      )}
                  </>
                ) : (
                  <View style={{ paddingVertical: 10 }}>
                    <Text style={styles.orderMuted}>No extra order details found.</Text>
                  </View>
                )}

                <View style={styles.modalButtonsRow}>
                  {/* ✅ HIDE when delivered/completed */}
                  {!deliveredNow && (
                    <TouchableOpacity
                      style={styles.modalGhostBtn}
                      onPress={goToOrderDetailsFromModal}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="open-outline" size={16} color="#00b14f" />
                      <Text style={styles.modalGhostText}>Open details</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={styles.modalCloseBtn}
                    onPress={closeActivityModal}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.modalCloseText}>Close</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {selectedActivity?.type !== 'order' && (
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={closeActivityModal}
                activeOpacity={0.8}
              >
                <Text style={styles.modalCloseText}>Close</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  actionText: { color: '#00b14f', fontWeight: '600' },

  tabsRow: { flexDirection: 'row', marginTop: 12, gap: 8, flexWrap: 'wrap' },
  tabPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  tabPillActive: { backgroundColor: '#00b14f11', borderColor: '#00b14f' },
  tabLabel: { fontSize: 13, color: '#4b5563', fontWeight: '500' },
  tabLabelActive: { color: '#00b14f', fontWeight: '700' },

  sep: { height: 1, backgroundColor: '#e5e7eb', marginLeft: 16 },

  itemWrap: { flexDirection: 'row', backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12 },
  itemWrapSelected: { backgroundColor: '#dcfce7' },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    position: 'relative',
  },
  unreadDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#00b14f',
    borderWidth: 2,
    borderColor: '#fff',
  },
  checkboxOverlay: { position: 'absolute', bottom: -6, right: -6 },
  itemTextWrap: { flex: 1 },
  itemTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  itemTitle: { color: '#111827', fontWeight: '600' },
  itemTitleUnread: { fontWeight: '800' },
  itemBody: { color: '#4b5563', marginTop: 2 },
  time: { color: '#6b7280', fontSize: 12 },

  deleteAction: {
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    width: 70,
    borderRadius: 8,
    marginVertical: 4,
  },

  bulkDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ef4444',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    gap: 4,
  },
  bulkDeleteText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  bulkReadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#00b14f',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    gap: 4,
  },
  bulkReadText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  emptyWrap: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyTitle: { color: '#111827', fontWeight: '700' },
  emptyBody: { color: '#6b7280' },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#111827', flex: 1 },
  modalTime: { fontSize: 12, color: '#6b7280', marginBottom: 8 },
  modalBody: { fontSize: 14, color: '#374151', marginBottom: 12 },

  orderBox: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    borderRadius: 14,
    padding: 12,
    marginTop: 6,
  },
  orderRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginTop: 6 },
  orderLabel: { color: '#6b7280', fontSize: 12, fontWeight: '700' },
  orderValue: { color: '#111827', fontSize: 13, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  orderMuted: { color: '#6b7280', fontSize: 13 },

  itemLine: { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  itemLineText: { color: '#111827', fontSize: 13, fontWeight: '600' },

  modalButtonsRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 12, alignItems: 'center' },
  modalGhostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#00b14f',
    backgroundColor: '#00b14f11',
  },
  modalGhostText: { color: '#00b14f', fontWeight: '800', fontSize: 13 },

  modalCloseBtn: { alignSelf: 'flex-end', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: '#00b14f' },
  modalCloseText: { color: '#ffffff', fontWeight: '700', fontSize: 13 },
});
