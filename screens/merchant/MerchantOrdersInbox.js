// screens/merchant/MerchantOrdersInbox.js
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { ORDERS_BASE_URL } from '@env';
import { onMerchantNotify, ackNotificationDelivered } from '../../utils/merchantSocket';

const currency = (n) =>
  `Nu. ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function fetchOrderSummary(orderId) {
  // GET /orders/:order_id ⇒ { success, data:[{user:{...}, orders:[{ total_amount, ... }]}] }
  const url = `${ORDERS_BASE_URL.replace(/\/+$/, '')}/orders/${encodeURIComponent(orderId)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const text = await res.text();
  try {
    const json = text ? JSON.parse(text) : null;
    const group = json?.data?.[0]?.orders?.[0];
    return {
      ok: res.ok,
      total_amount: group?.total_amount ?? null,
      user_id: json?.data?.[0]?.user?.user_id ?? null,
      raw: json,
    };
  } catch {
    return { ok: res.ok, total_amount: null, user_id: null, raw: text };
  }
}

async function updateOrderStatus({ orderId, status, reason, user_id }) {
  const url = `${ORDERS_BASE_URL.replace(/\/+$/, '')}/orders/${encodeURIComponent(orderId)}/status`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ status, reason, user_id }),
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch {}
  return { ok: res.ok, data: parsed ?? text, statusCode: res.status };
}

export default function MerchantOrdersInbox() {
  const navigation = useNavigation();
  const [items, setItems] = useState([]);           // queue of incoming notifications
  const [loadingIds, setLoadingIds] = useState({}); // per-item spinners while fetching totals
  const [acting, setActing] = useState({});         // per-item action spinners

  // Subscribe to socket notify
  useEffect(() => {
    const off = onMerchantNotify(async (payload) => {
      // payload: { id, type, orderId, createdAt, data:{title, body} }
      const base = {
        id: payload.id,
        orderId: payload.orderId,
        title: payload.data?.title || 'New order',
        body: payload.data?.body || '',
        createdAt: payload.createdAt || Date.now(),
        total_amount: null,
        user_id: null,
      };
      // Show immediately
      setItems((prev) => {
        // avoid duplicates
        if (prev.some((p) => p.id === base.id)) return prev;
        return [base, ...prev];
      });

      // ACK delivery immediately (let backend mark delivered_at)
      if (payload.id) ackNotificationDelivered(payload.id);

      // fetch total & user_id
      setLoadingIds((s) => ({ ...s, [base.id]: true }));
      const meta = await fetchOrderSummary(payload.orderId);
      setLoadingIds((s) => {
        const { [base.id]: _, ...rest } = s;
        return rest;
      });
      setItems((prev) =>
        prev.map((p) =>
          p.id === base.id
            ? { ...p, total_amount: meta.total_amount, user_id: meta.user_id }
            : p
        )
      );
    });

    return () => off && off();
  }, []);

  const onAccept = useCallback(async (row) => {
    if (!row?.orderId) return;
    // requires reason + user_id in your controller
    const reason = 'Order accepted';
    const user_id = row.user_id;
    if (!user_id) {
      Alert.alert('Missing user', 'Unable to update status: user_id not found.');
      return;
    }
    try {
      setActing((s) => ({ ...s, [row.id]: true }));
      const res = await updateOrderStatus({
        orderId: row.orderId,
        status: 'CONFIRMED',
        reason,
        user_id,
      });
      setActing((s) => {
        const { [row.id]: _, ...rest } = s;
        return rest;
      });
      if (!res.ok) {
        Alert.alert('Failed', typeof res.data === 'string' ? res.data : 'Could not confirm order.');
        return;
      }
      // remove from inbox on success
      setItems((prev) => prev.filter((p) => p.id !== row.id));
      Alert.alert('Confirmed', `Order ${row.orderId} confirmed.`);
    } catch (e) {
      setActing((s) => {
        const { [row.id]: _, ...rest } = s;
        return rest;
      });
      Alert.alert('Error', String(e?.message || e));
    }
  }, []);

  const onReject = useCallback((row) => {
    if (!row?.orderId) return;
    if (!row?.user_id) {
      Alert.alert('Missing user', 'Unable to update status: user_id not found.');
      return;
    }
    Alert.prompt?.(
      'Reject order',
      'Add a reason (optional):',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async (reasonText) => {
            const reason = String(reasonText || 'Order rejected');
            try {
              setActing((s) => ({ ...s, [row.id]: true }));
              const res = await updateOrderStatus({
                orderId: row.orderId,
                status: 'REJECTED',
                reason,
                user_id: row.user_id,
              });
              setActing((s) => {
                const { [row.id]: _, ...rest } = s;
                return rest;
              });
              if (!res.ok) {
                Alert.alert('Failed', typeof res.data === 'string' ? res.data : 'Could not reject order.');
                return;
              }
              setItems((prev) => prev.filter((p) => p.id !== row.id));
              Alert.alert('Rejected', `Order ${row.orderId} rejected.`);
            } catch (e) {
              setActing((s) => {
                const { [row.id]: _, ...rest } = s;
                return rest;
              });
              Alert.alert('Error', String(e?.message || e));
            }
          }
        }
      ],
      'plain-text'
    ) ||
    // Fallback for Android where Alert.prompt isn’t supported:
    Alert.alert(
      'Reject order?',
      'This order will be rejected.',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            try {
              setActing((s) => ({ ...s, [row.id]: true }));
              const res = await updateOrderStatus({
                orderId: row.orderId,
                status: 'REJECTED',
                reason: 'Order rejected',
                user_id: row.user_id,
              });
              setActing((s) => {
                const { [row.id]: _, ...rest } = s;
                return rest;
              });
              if (!res.ok) {
                Alert.alert('Failed', typeof res.data === 'string' ? res.data : 'Could not reject order.');
                return;
              }
              setItems((prev) => prev.filter((p) => p.id !== row.id));
              Alert.alert('Rejected', `Order ${row.orderId} rejected.`);
            } catch (e) {
              setActing((s) => {
                const { [row.id]: _, ...rest } = s;
                return rest;
              });
              Alert.alert('Error', String(e?.message || e));
            }
          }
        }
      ]
    );
  }, []);

  const renderItem = ({ item }) => {
    const busy = !!acting[item.id];
    const fetchingMeta = !!loadingIds[item.id];
    return (
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.title} numberOfLines={1}>
            {item.title || 'New order'}
          </Text>
          <Text style={styles.time}>
            {new Date(item.createdAt).toLocaleTimeString()}
          </Text>
        </View>
        <Text style={styles.orderId}>Order ID: {item.orderId}</Text>
        {!!item.body && <Text style={styles.body}>{item.body}</Text>}

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          {fetchingMeta ? (
            <ActivityIndicator size="small" />
          ) : (
            <Text style={styles.totalVal}>
              {item.total_amount != null ? currency(item.total_amount) : '—'}
            </Text>
          )}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.btn, styles.reject]}
            onPress={() => onReject(item)}
            disabled={busy}
            activeOpacity={0.85}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnTxt}>Reject</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.accept]}
            onPress={() => onAccept(item)}
            disabled={busy}
            activeOpacity={0.85}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnTxt}>Accept</Text>}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Orders Inbox</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 6 }}>
          <Ionicons name="close" size={22} color="#111" />
        </TouchableOpacity>
      </View>

      {items.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="notifications-off-outline" size={28} color="#9ca3af" />
          <Text style={styles.emptyTxt}>No new orders yet</Text>
          <Text style={styles.emptySub}>You’ll see new orders here in real time.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => String(it.id)}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#fff' },
  header: {
    paddingTop: 52, paddingBottom: 12, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eee'
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111' },

  card: {
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 14, padding: 14, backgroundColor: '#fff',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 15, fontWeight: '800', color: '#111', flex: 1, paddingRight: 8 },
  time: { color: '#6b7280', fontSize: 12 },
  orderId: { marginTop: 6, fontWeight: '700', color: '#374151' },
  body: { marginTop: 6, color: '#4b5563' },

  totalRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  totalLabel: { color: '#6b7280', fontWeight: '700' },
  totalVal: { color: '#111', fontWeight: '800' },

  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  btn: { flex: 1, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  reject: { backgroundColor: '#ef4444' },
  accept: { backgroundColor: '#10b981' },
  btnTxt: { color: '#fff', fontWeight: '800' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyTxt: { marginTop: 6, fontWeight: '800', color: '#374151' },
  emptySub: { marginTop: 2, color: '#6b7280' },
});
