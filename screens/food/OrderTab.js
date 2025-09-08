// OrdersTab.js
// Orders list tab body (no footer) — fetches from ORDER_ENDPOINT and groups items by order_id

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { ORDER_ENDPOINT as ENV_ORDER_ENDPOINT } from '@env';

const OrderItem = ({ item, isTablet, money }) => (
  <View style={styles.orderCard}>
    <View style={styles.orderRow}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons
          name={item.type === 'Delivery' ? 'bicycle-outline' : 'bag-outline'}
          size={isTablet ? 18 : 16}
          color="#0f172a"
        />
        <Text style={[styles.orderId, { fontSize: isTablet ? 15 : 14 }]}>
          {item.id}
        </Text>
        <Text style={[styles.orderTime, { fontSize: isTablet ? 13 : 12 }]}>
          • {item.time}
        </Text>
      </View>
      <Text style={[styles.orderTotal, { fontSize: isTablet ? 16 : 15 }]}>
        {money(item.total, 'Nu')}
      </Text>
    </View>
    <Text
      style={[styles.orderItems, { fontSize: isTablet ? 14 : 13 }]}
      numberOfLines={2}
    >
      {item.items}
    </Text>
  </View>
);

/* ---------------- helpers ---------------- */
const safeNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const fmtTime = (iso) => {
  try {
    const d = new Date(iso);
    const m = d.toLocaleString(undefined, { month: 'short' });
    const day = String(d.getDate());
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${m} ${day}, ${hh}:${mm}`;
  } catch {
    return '';
  }
};

const groupOrders = (rows = []) => {
  // Groups API rows by order_id and produces items for UI
  const byId = new Map();
  for (const r of rows) {
    const id = r.order_id ?? r.id ?? 'UNKNOWN';
    const g = byId.get(id) || {
      id,
      created_at: r.created_at,
      type: r.fulfillment_type || 'Pickup',
      totals: [],
      itemsArr: [],
      business_name: r.business_name,
      payment_method: r.payment_method,
      status: r.status,
    };
    g.totals.push(safeNum(r.total_amount));
    const qty = safeNum(r.quantity) || 1;
    const nm = r.item_name || 'Item';
    g.itemsArr.push(`${nm} ×${qty}`);
    // choose earliest created_at as order time (or fallback)
    if (!g.created_at || (r.created_at && new Date(r.created_at) < new Date(g.created_at))) {
      g.created_at = r.created_at;
    }
    // prefer Delivery if any line says Delivery
    if (r.fulfillment_type === 'Delivery') g.type = 'Delivery';
    byId.set(id, g);
  }

  const list = Array.from(byId.values()).map((g) => {
    const total =
      g.totals.length > 0
        ? g.totals.reduce((a, b) => a + b, 0) / g.totals.length
        : 0;
    const createdISO = g.created_at || null;
    return {
      id: g.id,
      type: g.type,
      time: createdISO ? fmtTime(createdISO) : '',
      created_at: createdISO,
      items: g.itemsArr.join(', '),
      total,
      status: g.status,
      payment_method: g.payment_method,
      business_name: g.business_name,
    };
  });

  // sort desc by created_at
  return list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
};

const buildOrdersUrl = (base, businessId) => {
  // Provided shape: http://.../orders/business/business_id...
  // Replace the literal "business_id" token with the actual ID if present; otherwise append it.
  const trimmed = String(base || '').trim();
  if (!trimmed) return null;
  if (trimmed.includes('business_id')) {
    return trimmed.replace(/business_id/g, String(businessId));
  }
  const sep = trimmed.endsWith('/') ? '' : '/';
  return `${trimmed}${sep}${encodeURIComponent(String(businessId))}`;
};

export default function OrdersTab({ isTablet, money, orders: ordersProp, businessId }) {
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState(ordersProp || []);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const abortRef = useRef(null);

  const fetchOrders = useCallback(
    async (opts = { silent: false }) => {
      if (!businessId) {
        // if consumer passes orders via prop, we can skip fetch; otherwise just no-op
        return;
      }
      const url = buildOrdersUrl(ENV_ORDER_ENDPOINT, businessId);
      if (!url) return;

      if (!opts.silent) setLoading(true);
      setError(null);

      try {
        abortRef.current?.abort();
        const ctrl = new AbortController();
        abortRef.current = ctrl;

        const res = await fetch(url, { signal: ctrl.signal });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json = await res.json();

        const grouped = groupOrders(Array.isArray(json) ? json : []);
        setOrders(grouped);
      } catch (e) {
        setError(String(e?.message || e) || 'Failed to load orders');
      } finally {
        if (!opts.silent) setLoading(false);
      }
    },
    [businessId]
  );

  useEffect(() => {
    if (ordersProp && ordersProp.length) {
      setOrders(ordersProp);
    } else {
      fetchOrders();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordersProp, fetchOrders]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchOrders({ silent: true });
    } finally {
      setRefreshing(false);
    }
  }, [fetchOrders]);

  const content = useMemo(() => {
    if (loading && (!orders || orders.length === 0)) {
      return (
        <View style={{ paddingVertical: 24, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator />
          <Text style={{ marginTop: 8, color: '#6b7280' }}>Loading orders…</Text>
        </View>
      );
    }
    if (error && (!orders || orders.length === 0)) {
      return (
        <View style={{ paddingVertical: 24 }}>
          <Text style={{ color: '#b91c1c', fontWeight: '600' }}>Failed to load orders</Text>
          <Text style={{ color: '#6b7280', marginTop: 4 }}>{error}</Text>
        </View>
      );
    }
    return (
      <FlatList
        contentContainerStyle={{ paddingBottom: 24 }}
        data={orders}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <OrderItem isTablet={isTablet} money={money} item={item} />}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      />
    );
  }, [loading, error, orders, isTablet, money, refreshing, onRefresh]);

  return (
    <View style={{ paddingHorizontal: 16 }}>
      <View style={{ marginTop: 12, marginBottom: 8 }}>
        <Text style={[styles.sectionTitle, { fontSize: isTablet ? 18 : 16 }]}>
          All orders
        </Text>
      </View>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontWeight: '700',
    color: '#0f172a', // ✅ matches HomeTab headings
  },
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  orderId: {
    fontWeight: '700',
    color: '#111827', // ✅ same as menu item title
  },
  orderTime: {
    color: '#6b7280', // ✅ matches metadata in HomeTab
    fontWeight: '500',
  },
  orderTotal: {
    fontWeight: '700',
    color: '#0f172a', // ✅ consistent with prices in HomeTab
  },
  orderItems: {
    marginTop: 6,
    color: '#475569', // ✅ same tone as announcement subtitle
    fontWeight: '500',
  },
});