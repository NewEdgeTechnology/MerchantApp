// components/OrderNotifyOverlay.js
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Animated, Easing, Platform, Pressable, StyleSheet, Text, View,
  DeviceEventEmitter, Alert, Dimensions
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import * as SecureStore from 'expo-secure-store';
import { UPDATE_ORDER_STATUS_ENDPOINT as ENV_STATUS_ENDPOINT } from '@env';

const STATUS_BASE = (ENV_STATUS_ENDPOINT || '').trim().replace(/\/+$/, '');
const currency = (n) => `Nu ${Number(n || 0).toFixed(2)}`;

/* ── responsive helpers (style-only) ─────────────────────────────────────── */
const { width: W } = Dimensions.get('window');
const base = 390; // iPhone 12 width as guideline
const s = (n) => Math.max(10, Math.round((W / base) * n));

/**
 * Helper: try to navigate in a best-effort way WITHOUT requiring useNavigation().
 * - Prefers `navigation` prop if provided.
 * - Else tries `global.__nav?.navigate(...)` if your app sets a global navigator.
 * - Always emits 'open-order-details' for any external listener as a fallback.
 */
function safeNavigateToOrderDetails(orderId, navigation) {
  let navigated = false;

  if (navigation && typeof navigation.navigate === 'function') {
    try {
      navigation.navigate('OrderDetails', { id: orderId });
      navigated = true;
    } catch {}
  }

  if (!navigated && global && global.__nav && typeof global.__nav.navigate === 'function') {
    try {
      global.__nav.navigate('OrderDetails', { id: orderId });
      navigated = true;
    } catch {}
  }

  // Broadcast regardless so root screens can listen and handle custom routes.
  DeviceEventEmitter.emit('open-order-details', { id: orderId });

  return navigated;
}

export default function OrderNotifyOverlay({ navigation }) {
  const [data, setData] = useState(null); // { id, orderId, title, body, total, status? }
  const slide = useRef(new Animated.Value(-260)).current;

  const show = useCallback(() => {
    Animated.timing(slide, {
      toValue: 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true
    }).start();
  }, [slide]);

  const hide = useCallback((cb) => {
    Animated.timing(slide, {
      toValue: -260, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: true
    }).start(({ finished }) => {
      if (finished) setData(null);
      cb && cb();
    });
  }, [slide]);

  // Normalize status to uppercase string or null
  const normalizeStatus = (v) => {
    if (!v || typeof v !== 'string') return null;
    return v.trim().toUpperCase();
  };

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('merchant-notify', (payload) => {
      const { id, orderId, data: inner } = payload || {};
      const title = inner?.title || 'New order';
      const body  = inner?.body  || '';

      // Try to extract status from payload variations or from the body text
      let status =
        normalizeStatus(payload?.status) ||
        normalizeStatus(inner?.status) ||
        normalizeStatus(inner?.meta?.status) ||
        (/(?:\b|_)(COMPLETED)(?:\b|_)/i.test(body) ? 'COMPLETED' : null);

      let total = null;
      const m = body.match(/Nu\W*([\d]+(?:\.[\d]+)?)/i);
      if (m) total = Number(m[1]);

      setData({ id, orderId, title, body, total, status });
      show();
      DeviceEventEmitter.emit('merchant-notify-ack', { id });
    });

    return () => sub?.remove?.();
  }, [show]);

  // If order status updates while the overlay is visible, sync it
  useEffect(() => {
    if (!data?.orderId) return;
    const sub = DeviceEventEmitter.addListener('order-updated', (evt) => {
      if (!evt || evt.id !== data.orderId) return;
      const nextStatus = normalizeStatus(evt.patch?.status);
      if (nextStatus) {
        setData((prev) => prev ? { ...prev, status: nextStatus } : prev);
      }
    });
    return () => sub?.remove?.();
  }, [data?.orderId]);

  const buildStatusUrl = (orderId) => {
    if (!STATUS_BASE) return null;
    const id = encodeURIComponent(String(orderId));
    let url = STATUS_BASE
      .replace(/\{\s*order_id\s*\}/gi, id)
      .replace(/:order_id/gi, id);
    if (url === STATUS_BASE && !/\/status$/i.test(url)) url = `${STATUS_BASE}/${id}/status`;
    return url;
  };

  const updateStatus = async (orderId, status, reason) => {
    const url = buildStatusUrl(orderId);
    if (!url) { Alert.alert('Missing config', 'UPDATE_ORDER_STATUS_ENDPOINT is not set in .env'); return false; }
    try {
      const token = await SecureStore.getItemAsync('auth_token');
      const res = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ status, reason }),
      });

      const txt = await res.text();
      let json = null; try { json = txt ? JSON.parse(txt) : null; } catch {}

      if (!res.ok) {
        const msg = (json && (json.message || json.error)) || `HTTP ${res.status}`;
        Alert.alert('Failed', msg || 'Unable to update status'); return false;
      }

      DeviceEventEmitter.emit('merchant-status-emit', { orderId, status, reason });
      DeviceEventEmitter.emit('order-updated', { id: orderId, patch: { status } });
      return true;
    } catch (e) {
      Alert.alert('Error', String(e?.message || e)); return false;
    }
  };

  const openDetails = useCallback(() => {
    const id = data?.orderId;
    if (!id) return;
    hide(() => {
      safeNavigateToOrderDetails(id, navigation);
    });
  }, [data?.orderId, hide, navigation]);

  if (!data) return null;

  const isCompleted = (data.status || '').toUpperCase() === 'COMPLETED';

  return (
    <Animated.View style={[styles.wrap, { transform: [{ translateY: slide }] }]}>
      <View style={styles.card}>
        {/* Tappable region to open order details */}
        <Pressable
          onPress={openDetails}
          android_ripple={{ color: '#e2e8f0' }}
          style={styles.touchArea}
        >
          <View style={styles.headerRow}>
            <Icon name="notifications-outline" size={s(18)} color="#065f46" />
            <Text style={styles.title} numberOfLines={1}>{data.title}</Text>
          </View>

          <Text style={styles.body} numberOfLines={2}>{data.body}</Text>

          <View style={styles.metaRow}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Order: {data.orderId}</Text>
            </View>
            {Number.isFinite(data.total) ? (
              <View style={[styles.badge, styles.badgeMoney]}>
                <Text style={[styles.badgeText, styles.badgeMoneyText]}>
                  Total: {currency(data.total)}
                </Text>
              </View>
            ) : null}
            {!!data.status && (
              <View style={[styles.badge, data.status === 'COMPLETED' ? styles.badgeDone : null]}>
                <Text style={[styles.badgeText, data.status === 'COMPLETED' ? styles.badgeDoneText : null]}>
                  {data.status}
                </Text>
              </View>
            )}
          </View>
        </Pressable>

        {/* Action buttons */}
        <View style={styles.btnRow}>
          {/* Hide Accept when COMPLETED */}
          {!isCompleted && (
            <Pressable
              style={[styles.btn, styles.accept]}
              android_ripple={{ color: '#bbf7d0' }}
              onPress={() => hide(() => updateStatus(data.orderId, 'CONFIRMED', 'Merchant confirmed'))}
            >
              <Icon name="checkmark" size={s(16)} color="#fff" />
              <Text style={styles.btnTextLight}>Accept</Text>
            </Pressable>
          )}

          <Pressable style={styles.dismiss} onPress={() => hide()}>
            <Icon name="chevron-up" size={s(18)} color="#475569" />
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  /* container pinned to top, full-bleed horizontally */
  wrap: {
    position: 'absolute',
    left: 0, right: 0, top: 0,
    paddingTop: Platform.select({ ios: s(56), android: s(26), default: s(26) }),
    paddingBottom: s(8),
    paddingHorizontal: 0, // full width: no horizontal inset
    zIndex: 9999,
    alignItems: 'center',
    pointerEvents: 'box-none',
  },

  /* full-width card (height unchanged) */
  card: {
    width: '100%',
    alignSelf: 'stretch',
    backgroundColor: '#ffffff',
    borderRadius: 0, // edge-to-edge banner style
    paddingHorizontal: s(14),
    paddingVertical: s(12),
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: s(14),
    shadowOffset: { width: 0, height: s(8) },
    elevation: 10,
  },

  touchArea: { paddingBottom: s(6) },

  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: s(6) },
  title: { marginLeft: s(6), fontWeight: '800', color: '#064e3b', fontSize: s(16), lineHeight: s(20) },
  body: { color: '#0f172a', marginBottom: s(10), fontSize: s(14), lineHeight: s(19) },

  /* meta shown as readable chips */
  metaRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: s(8), marginBottom: s(12), flexWrap: 'wrap',
  },
  badge: { paddingHorizontal: s(10), paddingVertical: s(6), borderRadius: s(999), backgroundColor: '#f1f5f9' },
  badgeMoney: { backgroundColor: '#ecfdf5' },
  badgeMoneyText: { color: '#065f46' },

  // Completed status chip
  badgeDone: { backgroundColor: '#ecfdf5' },
  badgeDoneText: { color: '#065f46' },

  badgeText: { fontWeight: '700', color: '#334155', fontSize: s(13) },

  /* buttons become big, high-contrast, and wrap on small screens */
  btnRow: {
    flexDirection: 'row', alignItems: 'center', gap: s(10), flexWrap: 'wrap', justifyContent: 'space-between'
  },
  btn: {
    flexGrow: 1, flexBasis: '47%',
    height: s(46),
    borderRadius: s(12),
    paddingHorizontal: s(12),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: s(8),
  },
  accept: { backgroundColor: '#10b981' },
  reject: { backgroundColor: '#ef4444' },
  btnTextLight: { color: '#ffffff', fontWeight: '800', fontSize: s(14) },

  /* compact dismiss chip */
  dismiss: {
    height: s(44),
    paddingHorizontal: s(14),
    borderRadius: s(12),
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
