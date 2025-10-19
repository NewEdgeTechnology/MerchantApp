// components/OrderNotifyOverlay.js
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Animated, Easing, Platform, Pressable, StyleSheet, Text, View,
  DeviceEventEmitter, Alert
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import * as SecureStore from 'expo-secure-store';
import { UPDATE_ORDER_STATUS_ENDPOINT as ENV_STATUS_ENDPOINT } from '@env';

const STATUS_BASE = (ENV_STATUS_ENDPOINT || '').trim().replace(/\/+$/, '');
const currency = (n) => `Nu ${Number(n || 0).toFixed(2)}`;

export default function OrderNotifyOverlay() {
  const [data, setData] = useState(null); // { id, orderId, title, body, total }
  const slide = useRef(new Animated.Value(-220)).current;

  const show = useCallback(() => {
    Animated.timing(slide, {
      toValue: 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true
    }).start();
  }, [slide]);

  const hide = useCallback((cb) => {
    Animated.timing(slide, {
      toValue: -220, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: true
    }).start(({ finished }) => {
      if (finished) setData(null);
      cb && cb();
    });
  }, [slide]);

  // listen for realtime "notify" and show popup
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('merchant-notify', (payload) => {
      // payload: { id, type, orderId, createdAt, data:{title, body} }
      const { id, orderId, data: inner } = payload || {};
      const title = inner?.title || 'New order';
      const body  = inner?.body  || '';

      // parse total from "Nu 55.00"
      let total = null;
      const m = body.match(/Nu\W*([\d]+(?:\.[\d]+)?)/i);
      if (m) total = Number(m[1]);

      setData({ id, orderId, title, body, total });
      show();

      // tell backend we displayed (delivered_at)
      DeviceEventEmitter.emit('merchant-notify-ack', { id });
    });

    return () => sub?.remove?.();
  }, [show]);

  const buildStatusUrl = (orderId) => {
    if (!STATUS_BASE) return null;
    const id = encodeURIComponent(String(orderId));
    let url = STATUS_BASE
      .replace(/\{\s*order_id\s*\}/gi, id)
      .replace(/:order_id/gi, id);
    if (url === STATUS_BASE && !/\/status$/i.test(url)) {
      url = `${STATUS_BASE}/${id}/status`;
    }
    return url;
  };

  const updateStatus = async (orderId, status, reason) => {
    const url = buildStatusUrl(orderId);
    if (!url) {
      Alert.alert('Missing config', 'UPDATE_ORDER_STATUS_ENDPOINT is not set in .env');
      return false;
    }

    try {
      const token = await SecureStore.getItemAsync('auth_token'); // saved at login
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
      let json = null;
      try { json = txt ? JSON.parse(txt) : null; } catch {}

      if (!res.ok) {
        const msg = (json && (json.message || json.error)) || `HTTP ${res.status}`;
        console.log('[MERCHANT] ❌ status update failed:', { orderId, status, reason, msg });
        Alert.alert('Failed', msg || 'Unable to update status');
        return false;
      }

      // success → forward socket emit using the bridge
      console.log(`[MERCHANT] ✅ status updated on server: ${orderId} → ${status}`);
      const payload = { orderId, status, reason };
      console.log('[MERCHANT] ↪ forwarding order:status to socket layer:', payload);
      DeviceEventEmitter.emit('merchant-status-emit', payload);

      // optimistic UI for lists
      DeviceEventEmitter.emit('order-updated', { id: orderId, patch: { status } });
      return true;
    } catch (e) {
      console.log('[MERCHANT] updateStatus error:', e?.message || e);
      Alert.alert('Error', String(e?.message || e));
      return false;
    }
  };

  if (!data) return null;

  return (
    <Animated.View style={[styles.wrap, { transform: [{ translateY: slide }] }]}>
      <View style={styles.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
          <Icon name="notifications-outline" size={18} color="#065f46" />
          <Text style={styles.title} numberOfLines={1}>{data.title}</Text>
        </View>

        <Text style={styles.body} numberOfLines={2}>{data.body}</Text>

        <View style={styles.row}>
          <Text style={styles.meta}>Order: {data.orderId}</Text>
          {Number.isFinite(data.total) ? (
            <Text style={styles.meta}>Total: {currency(data.total)}</Text>
          ) : null}
        </View>

        <View style={styles.btnRow}>
          <Pressable
            style={[styles.btn, styles.reject]}
            onPress={() => hide(() => updateStatus(data.orderId, 'CANCELLED', 'Merchant rejected'))}
          >
            <Icon name="close" size={14} color="#991b1b" />
            <Text style={[styles.btnText, { color: '#991b1b' }]}>Reject</Text>
          </Pressable>

          <Pressable
            style={[styles.btn, styles.accept]}
            onPress={() => hide(() => updateStatus(data.orderId, 'CONFIRMED', 'Merchant confirmed'))}
          >
            <Icon name="checkmark" size={14} color="#065f46" />
            <Text style={[styles.btnText, { color: '#065f46' }]}>Accept</Text>
          </Pressable>

          <Pressable style={styles.dismiss} onPress={() => hide()}>
            <Icon name="chevron-up" size={16} color="#64748b" />
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0, right: 0, top: 0,
    paddingHorizontal: 12,
    paddingTop: Platform.select({ ios: 48, android: 24, default: 24 }),
    paddingBottom: 8,
    zIndex: 9999,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#d1fae5',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  title: { marginLeft: 6, fontWeight: '800', color: '#064e3b' },
  body: { color: '#0f172a', marginBottom: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  meta: { color: '#334155', fontWeight: '700' },
  btnRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  accept: { borderColor: '#bbf7d0', backgroundColor: '#ecfdf5' },
  reject: { borderColor: '#fecaca', backgroundColor: '#fff1f2' },
  btnText: { fontWeight: '800' },
  dismiss: { padding: 8, borderRadius: 10, backgroundColor: '#f1f5f9' },
});
