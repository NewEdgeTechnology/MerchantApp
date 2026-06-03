// components/OrderNotifyOverlay.js
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  DeviceEventEmitter,
  Alert,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import * as SecureStore from 'expo-secure-store';

import {
  BRAND,
  FONT,
  RADIUS,
  SHADOW,
} from '../screens/styles/tabdey_brand';

import {
  NOTIFICATION_READ_ENDPOINT as ENV_NOTIF_READ_ENDPOINT,
  ORDER_ENDPOINT as ENV_ORDER_ENDPOINT,
} from '@env';

const ORDER_BASE = (ENV_ORDER_ENDPOINT || '').trim().replace(/\/+$/, '');
const READ_ONE_BASE = (ENV_NOTIF_READ_ENDPOINT || '').trim().replace(/\/+$/, '');

const { width: W } = Dimensions.get('window');
const base = 390;
const s = (n) => Math.max(10, Math.round((W / base) * n));

const currency = (n) => `Nu ${Number(n || 0).toFixed(2)}`;
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

/* ---------- navigation helper ---------- */
function safeNavigateToOrderDetails(orderId, navigation, extraParams = {}) {
  const params = { orderId: String(orderId), ...extraParams };
  const nav = navigation || global?.__nav;

  try {
    nav?.navigate?.('OrderDetails', params);
  } catch {}

  DeviceEventEmitter.emit('open-order-details', params);
  return true;
}

/* ---------- URL builders ---------- */
const buildReadOneUrl = (notificationId) =>
  READ_ONE_BASE
    ? READ_ONE_BASE.replace('{notificationId}', String(notificationId))
    : null;

const buildOrdersGroupedUrl = (businessId, ownerType) => {
  if (!ORDER_BASE || !businessId) return null;

  let url = ORDER_BASE
    .replace('{businessId}', String(businessId))
    .replace('{business_id}', String(businessId));

  try {
    const u = new URL(url);

    if (
      String(ownerType).toLowerCase() === 'mart' &&
      !u.searchParams.get('owner_type')
    ) {
      u.searchParams.set('owner_type', 'mart');
    }

    return u.toString();
  } catch {
    if (
      String(ownerType).toLowerCase() === 'mart' &&
      !/[?&]owner_type=/.test(url)
    ) {
      url += (url.includes('?') ? '&' : '?') + 'owner_type=mart';
    }

    return url;
  }
};

/* ---------- hydration helpers ---------- */
const sameId = (a, b) =>
  String(a ?? '').replace(/^ORD[-_]?/i, '') ===
  String(b ?? '').replace(/^ORD[-_]?/i, '');

const coalesce = (...vals) => {
  for (const v of vals) {
    if (v != null && v !== '') return v;
  }
  return null;
};

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
  const groupedUrl = buildOrdersGroupedUrl(businessId, ownerType);
  if (!groupedUrl) return null;

  try {
    const token = await getToken();

    const res = await fetch(groupedUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

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
        for (const o of g.orders) {
          flattened.push({ row: o, user: g.user || {} });
        }
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
  } catch {
    return false;
  }
}

/* ============================= Component ============================= */
export default function OrderNotifyOverlay({ navigation }) {
  const [data, setData] = useState(null);
  const [markedRead, setMarkedRead] = useState(false);

  const slide = useRef(new Animated.Value(-360)).current;
  const autoHideRef = useRef(null);
  const isVisibleRef = useRef(false);

  const clearAutoHide = () => {
    if (autoHideRef.current) {
      clearTimeout(autoHideRef.current);
      autoHideRef.current = null;
    }
  };

  const hide = useCallback(
    (cb) => {
      clearAutoHide();

      Animated.timing(slide, {
        toValue: -360,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          isVisibleRef.current = false;
          setData(null);
        }

        cb && cb();
      });
    },
    [slide]
  );

  const scheduleAutoHide = useCallback(() => {
    clearAutoHide();

    autoHideRef.current = setTimeout(() => {
      hide();
    }, AUTO_HIDE_MS);
  }, [hide]);

  const show = useCallback(() => {
    if (!isVisibleRef.current) {
      Animated.timing(slide, {
        toValue: 0,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        isVisibleRef.current = true;
      });
    }

    scheduleAutoHide();
  }, [slide, scheduleAutoHide]);

  const normalizeStatus = (v) =>
    typeof v === 'string' ? v.trim().toUpperCase() : null;

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('merchant-notify', (payload) => {
      const { id, orderId, data: inner } = payload || {};

      const title = inner?.title || 'New order';
      const body = inner?.body || '';

      const status =
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

      setMarkedRead(false);
      setData({
        id,
        orderId: String(orderId),
        title,
        body,
        total,
        status,
        ownerType,
      });

      show();

      DeviceEventEmitter.emit('merchant-notify-ack', { id });
    });

    return () => sub?.remove?.();
  }, [show]);

  useEffect(() => {
    if (!data?.orderId) return;

    const sub = DeviceEventEmitter.addListener('order-updated', (evt) => {
      if (!evt || String(evt.id) !== String(data.orderId)) return;

      const nextStatus = normalizeStatus(evt.patch?.status);

      if (nextStatus) {
        setData((prev) => (prev ? { ...prev, status: nextStatus } : prev));
      }
    });

    return () => sub?.remove?.();
  }, [data?.orderId]);

  const openDetails = useCallback(async () => {
    if (!data?.orderId) return;

    const businessId = await resolveBusinessId();
    const groupedUrl = buildOrdersGroupedUrl(businessId, data?.ownerType);

    const hydrated = await fetchOrderHydrated({
      businessId,
      ownerType: data?.ownerType,
      orderId: data.orderId,
    });

    hide(() => {
      const ok = safeNavigateToOrderDetails(data.orderId, navigation, {
        fromOverlay: true,
        ownerType: data?.ownerType,
        status: data?.status,
        ordersGroupedUrl: groupedUrl,
        order: hydrated ? hydrated : { id: String(data.orderId) },
      });

      if (!ok) {
        Alert.alert(
          'Navigation',
          'Could not open Order Details. Ensure route name is "OrderDetails".'
        );
      }
    });
  }, [data?.orderId, data?.ownerType, data?.status, navigation, hide]);

  const onMarkRead = useCallback(async () => {
    if (!data?.id) return;

    const ok = await markOneReadServer(data.id);

    setMarkedRead(true);

    DeviceEventEmitter.emit('notification-read', {
      id: data.id,
      ok,
    });
  }, [data?.id]);

  useEffect(() => {
    return () => clearAutoHide();
  }, []);

  if (!data) return null;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.overlayRoot,
        {
          transform: [{ translateY: slide }],
        },
      ]}
    >
      <SafeAreaView pointerEvents="box-none" style={styles.safeArea}>
        <View style={styles.card}>
          <Pressable
            onPress={openDetails}
            android_ripple={{ color: '#F7AEF8' }}
            style={styles.touchArea}
          >
            <View style={styles.headerRow}>
              <View style={styles.iconCircle}>
                <Icon
                  name="notifications-outline"
                  size={s(18)}
                  color={BRAND.purple}
                />
              </View>

              <Text style={styles.title} numberOfLines={1}>
                {data.title}
              </Text>
            </View>

            <Text style={styles.body} numberOfLines={2}>
              {data.body}
            </Text>

            <View style={styles.metaRow}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>Order: {data.orderId}</Text>
              </View>

              {Number.isFinite(data.total) && (
                <View style={[styles.badge, styles.badgeMoney]}>
                  <Text style={[styles.badgeText, styles.badgeMoneyText]}>
                    Total: {currency(data.total)}
                  </Text>
                </View>
              )}

              {!!data.status && (
                <View style={[styles.badge, styles.badgeStatus]}>
                  <Text style={[styles.badgeText, styles.badgeStatusText]}>
                    {data.status}
                  </Text>
                </View>
              )}

              {!!data.ownerType && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {String(data.ownerType).toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
          </Pressable>

          <View style={styles.btnRow}>
            <Pressable
              style={({ pressed }) => [
                styles.btnSm,
                styles.btnGhost,
                pressed && styles.pressed,
              ]}
              onPress={onMarkRead}
            >
              <Icon
                name={markedRead ? 'checkmark-done-outline' : 'checkmark-outline'}
                size={s(15)}
                color={markedRead ? BRAND.magenta : BRAND.black}
              />

              <Text
                style={[
                  styles.btnGhostText,
                  markedRead && styles.markedText,
                ]}
              >
                {markedRead ? 'Marked read' : 'Mark as read'}
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.btnSm,
                styles.btnPrimary,
                pressed && styles.pressed,
              ]}
              android_ripple={{ color: BRAND.purpleLight }}
              onPress={openDetails}
            >
              <Icon name="open-outline" size={s(15)} color={BRAND.white} />

              <Text style={styles.btnPrimaryText}>View details</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.dismiss,
                pressed && styles.pressed,
              ]}
              onPress={() => hide()}
            >
              <Icon
                name="chevron-up"
                size={s(18)}
                color={BRAND.purple}
              />
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </Animated.View>
  );
}

/* ---------------- styles ---------------- */
const styles = StyleSheet.create({
  overlayRoot: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999999,
    elevation: 999999,
    pointerEvents: 'box-none',
  },

  safeArea: {
    width: '100%',
    alignItems: 'center',
    pointerEvents: 'box-none',
  },

  card: {
    width: '100%',
    backgroundColor: BRAND.white,
    paddingHorizontal: s(22),
    paddingTop: Platform.OS === 'ios' ? s(8) : s(10),
    paddingBottom: s(14),
    borderBottomLeftRadius: RADIUS.lg,
    borderBottomRightRadius: RADIUS.lg,
    borderBottomWidth: 1,
    borderColor: '#F0E2FF',
    ...SHADOW.md,
  },

  touchArea: {
    paddingBottom: s(8),
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: s(7),
  },

  iconCircle: {
    width: s(32),
    height: s(32),
    borderRadius: RADIUS.full,
    backgroundColor: '#F8E8FF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  title: {
    flex: 1,
    marginLeft: s(12),
    fontFamily: FONT.header,
    fontWeight: '700',
    color: BRAND.black,
    fontSize: s(16),
    lineHeight: s(22),
  },

  body: {
    fontFamily: FONT.body,
    color: BRAND.black,
    marginBottom: s(11),
    fontSize: s(14),
    lineHeight: s(20),
    opacity: 0.88,
  },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(8),
    marginBottom: s(4),
    flexWrap: 'wrap',
  },

  badge: {
    paddingHorizontal: s(12),
    paddingVertical: s(7),
    borderRadius: RADIUS.full,
    backgroundColor: '#F7F3FA',
    borderWidth: 1,
    borderColor: '#EFE0FF',
  },

  badgeMoney: {
    backgroundColor: '#FFF4FB',
    borderColor: '#F7D3EC',
  },

  badgeStatus: {
    backgroundColor: '#F4E7FF',
    borderColor: '#E0B9FF',
  },

  badgeText: {
    fontFamily: FONT.body,
    fontWeight: '700',
    color: BRAND.black,
    fontSize: s(12),
  },

  badgeMoneyText: {
    color: BRAND.magenta,
  },

  badgeStatusText: {
    color: BRAND.purple,
  },

  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(10),
    flexWrap: 'wrap',
  },

  btnSm: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: s(6),
    minHeight: s(40),
    paddingHorizontal: s(14),
    borderRadius: RADIUS.md,
  },

  btnGhost: {
    backgroundColor: BRAND.white,
    borderWidth: 1.3,
    borderColor: '#E7D4F7',
  },

  btnGhostText: {
    fontFamily: FONT.body,
    color: BRAND.black,
    fontWeight: '700',
    fontSize: s(13),
  },

  markedText: {
    color: BRAND.magenta,
    fontWeight: '800',
  },

  btnPrimary: {
    backgroundColor: BRAND.purple,
  },

  btnPrimaryText: {
    fontFamily: FONT.body,
    color: BRAND.white,
    fontWeight: '800',
    fontSize: s(13),
  },

  dismiss: {
    height: s(40),
    minWidth: s(46),
    paddingHorizontal: s(12),
    borderRadius: RADIUS.md,
    backgroundColor: '#F4E7FF',
    borderWidth: 1,
    borderColor: '#E0B9FF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
});