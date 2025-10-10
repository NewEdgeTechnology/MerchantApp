// services/marts/OrdersTab.js
// Mart Orders list tab — same API contract as Food.
// Wrapped payload: { success, data:[ { user, orders:[...] } ] } OR legacy flat rows.
// Reuses the same ORDER endpoint; optionally appends owner_type=mart.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  DeviceEventEmitter,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { ORDER_ENDPOINT as ENV_ORDER_ENDPOINT } from '@env';

/* ---------------- constants ---------------- */
// Base labels (full Food flow). We'll dynamically drop PREPARING for Mart.
const BASE_STATUS_LABELS = [
  { key: 'PENDING', label: 'Pending' },
  { key: 'CONFIRMED', label: 'Confirmed' },
  { key: 'PREPARING', label: 'Preparing' }, // <- hide for ownerType='mart'
  { key: 'READY', label: 'Ready' },
  { key: 'OUT_FOR_DELIVERY', label: 'Out for delivery' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'CANCELLED', label: 'Cancelled' },
];

/* ---------------- UI ---------------- */
const OrderItem = ({ item, isTablet, money, onPress }) => (
  <Pressable
    onPress={() => onPress?.(item)}
    style={styles.orderCard}
    android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
  >
    <View style={styles.orderRow}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons
          name={item.type === 'Delivery' ? 'bicycle-outline' : 'bag-outline'}
          size={isTablet ? 18 : 16}
          color="#0f172a"
        />
        <Text style={[styles.orderId, { fontSize: isTablet ? 15 : 14 }]}>{item.id}</Text>
        <Text style={[styles.orderTime, { fontSize: isTablet ? 13 : 12 }]}>• {item.time}</Text>
      </View>
      <Text style={[styles.orderTotal, { fontSize: isTablet ? 16 : 15 }]}>{money(item.total, 'Nu')}</Text>
    </View>

    {(item.customer_name || item.customer_phone || item.customer_email) ? (
      <View style={styles.metaRow}>
        <Ionicons name="person-outline" size={16} color="#64748b" />
        <Text style={styles.customerText} numberOfLines={1}>
          {item.customer_name || 'Customer'}
          {item.customer_phone ? ` • ${item.customer_phone}` : ''}
          {!item.customer_phone && item.customer_email ? ` • ${item.customer_email}` : ''}
        </Text>
      </View>
    ) : null}

    <Text style={[styles.orderItems, { fontSize: isTablet ? 14 : 13 }]} numberOfLines={2}>
      {item.items}
    </Text>

    {/* 🔹 Show restaurant note + which item it belongs to */}
    {!!item.note_for_restaurant?.trim?.() && (
      <View style={styles.noteRow}>
        <Ionicons name="chatbubble-ellipses-outline" size={14} color="#0f766e" />
        <View style={{ flex: 1 }}>
          <Text style={styles.noteText} numberOfLines={3}>
            {item.note_for_restaurant.trim()}
          </Text>
          {!!item.note_target?.trim?.() && (
            <Text style={styles.noteMeta} numberOfLines={1}>
              for {item.note_target.trim()}
            </Text>
          )}
        </View>
      </View>
    )}
  </Pressable>
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

// pull a note string from common item-level fields
const getItemNote = (it = {}) =>
  it.note_for_restaurant ||
  it.note ||
  it.special_request ||
  it.instructions ||
  it.customization ||
  it.item_note || // legacy
  '';

const groupOrders = (rows = []) => {
  const byId = new Map();
  for (const r of rows) {
    const id = r.order_id ?? r.id ?? 'UNKNOWN';
    const g =
      byId.get(id) ||
      {
        id,
        created_at: r.created_at,
        type: r.fulfillment_type || 'Pickup',
        totals: [],
        itemsArr: [],
        business_name: r.business_name,
        payment_method: r.payment_method,
        status: r.status,
        // 🔹 capture order-level note once per order (legacy flat rows)
        note_for_restaurant: null,
        // 🔹 which item carried the note (legacy)
        note_target: null,
      };

    g.totals.push(safeNum(r.total_amount));
    const qty = safeNum(r.quantity) || 1;
    const nm = r.item_name || 'Item';
    g.itemsArr.push(`${nm} ×${qty}`);

    // keep earliest created_at
    if (!g.created_at || (r.created_at && new Date(r.created_at) < new Date(g.created_at))) {
      g.created_at = r.created_at;
    }
    if (r.fulfillment_type === 'Delivery') g.type = 'Delivery';

    // order-level note (first one wins)
    if (!g.note_for_restaurant) {
      g.note_for_restaurant =
        r.note_for_restaurant ||
        r.restaurant_note ||
        r.note_for_store ||
        r.note ||
        null;
    }

    // item-level note on this row?
    const itemLevelNote =
      r.item_note ||
      r.item_instructions ||
      r.item_customization ||
      r.special_request ||
      r.item_note_for_restaurant ||
      '';
    if (!g.note_target && (itemLevelNote && String(itemLevelNote).trim())) {
      g.note_target = r.item_name || 'Item';
      // If no order-level note yet, fall back to the item note as the main note text
      if (!g.note_for_restaurant) {
        g.note_for_restaurant = itemLevelNote;
      }
    }

    byId.set(id, g);
  }

  const list = Array.from(byId.values()).map((g) => {
    const total = g.totals.length > 0 ? g.totals.reduce((a, b) => a + b, 0) / g.totals.length : 0;
    const createdISO = g.created_at || null;
    return {
      id: String(g.id),
      type: g.type,
      time: createdISO ? fmtTime(createdISO) : '',
      created_at: createdISO,
      items: g.itemsArr.join(', '),
      total,
      status: g.status,
      payment_method: g.payment_method,
      business_name: g.business_name,
      customer_id: null,
      customer_name: '',
      customer_email: '',
      customer_phone: '',
      raw_items: [],
      delivery_address: '',
      // 🔹 expose it on the list items so UI can show it
      note_for_restaurant: g.note_for_restaurant || '',
      note_target: g.note_target || '',
      priority: 0,
      discount_amount: 0,
    };
  });

  return list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
};

const buildOrdersUrl = (base, businessId, { appendOwnerType = false, ownerType = 'mart' } = {}) => {
  if (!base || !businessId) return null;
  const b = String(base).trim().replace(/\/+$/, '');
  const id = encodeURIComponent(String(businessId));
  let replaced = b
    .replace(/\{\s*businessId\s*\}/g, id)
    .replace(/\{\s*business_id\s*\}/gi, id)
    .replace(/:businessId/g, id)
    .replace(/:business_id/gi, id);
  if (replaced === b) {
    if (/\/business$/i.test(b)) replaced = `${b}/${id}`;
    else if (!b.endsWith(`/${id}`)) {
      const sep = b.includes('?') ? '&' : '?';
      replaced = `${b}${sep}business_id=${id}`;
    }
  }
  if (appendOwnerType) {
    const sep2 = replaced.includes('?') ? '&' : '?';
    replaced = `${replaced}${sep2}owner_type=${encodeURIComponent(ownerType)}`;
  }
  return replaced;
};

const parseJSON = async (res) => {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
};

const normalizeOrdersFromApi = (payload) => {
  try {
    if (Array.isArray(payload)) return groupOrders(payload);
    const blocks = Array.isArray(payload?.data) ? payload.data : [];
    const list = [];
    for (const block of blocks) {
      const u = block?.user || {};
      const orders = Array.isArray(block?.orders) ? block.orders : [];
      for (const o of orders) {
        const createdISO = o.created_at || null;

        // find first item with a specific item-level note
        let noteTarget = '';
        if (Array.isArray(o.items)) {
          const withNote = o.items.find((it) => getItemNote(it)?.trim?.());
          if (withNote) noteTarget = withNote.item_name || withNote.name || '';
        }

        const itemsStr = (o.items || [])
          .map((it) => `${it.item_name ?? 'Item'} ×${Number(it.quantity ?? 1)}`)
          .join(', ');

        const businessName =
          (o.items && o.items[0] && o.items[0].business_name) ||
          o.business_name ||
          '';

        list.push({
          id: String(o.order_id),
          type: o.fulfillment_type || 'Pickup',
          time: createdISO ? fmtTime(createdISO) : '',
          created_at: createdISO,
          items: itemsStr,
          total: Number(o.total_amount ?? 0),
          status: o.status,
          payment_method: o.payment_method,
          business_name: businessName,
          delivery_address: o.delivery_address || '',
          // 🔹 already present for wrapped payloads
          note_for_restaurant: o.note_for_restaurant || '',
          note_target: noteTarget, // ⬅️ which item the note is about
          priority: Number(o.priority ?? 0),
          discount_amount: Number(o.discount_amount ?? 0),
          raw_items: Array.isArray(o.items) ? o.items : [],
          customer_id: u.user_id ?? null,
          customer_name: u.name || '',
          customer_email: u.email || '',
          customer_phone: u.phone || '',
        });
      }
    }
    return list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  } catch {
    return [];
  }
};

/* ======================= Component ======================= */
export default function MartOrdersTab({
  isTablet,
  money,
  orders: ordersProp,
  businessId,
  orderEndpoint,
  appendOwnerType = true,
  ownerType = 'mart',  // <- drive UI (chips) with this
  detailsRoute = 'OrderDetails',
}) {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState(ordersProp || []);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [kbHeight, setKbHeight] = useState(0);
  const [selectedStatus, setSelectedStatus] = useState(null); // null = All
  const abortRef = useRef(null);

  // 🔑 Dynamically compute status chips: hide PREPARING for Mart, keep for Food
  const STATUS_LABELS = useMemo(() => {
    const isMart = String(ownerType || '').toLowerCase() === 'mart';
    return isMart
      ? BASE_STATUS_LABELS.filter(s => s.key !== 'PREPARING')
      : BASE_STATUS_LABELS;
  }, [ownerType]);

  // If a now-hidden status was selected (e.g., PREPARING when ownerType switched to mart), reset filter
  useEffect(() => {
    if (selectedStatus && !STATUS_LABELS.some(s => s.key === selectedStatus)) {
      setSelectedStatus(null);
    }
  }, [STATUS_LABELS, selectedStatus]);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'android' ? 'keyboardDidShow' : 'keyboardWillShow',
      (e) => setKbHeight(e.endCoordinates?.height || 0)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'android' ? 'keyboardDidHide' : 'keyboardWillHide',
      () => setKbHeight(0)
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const fetchOrders = useCallback(
    async (opts = { silent: false }) => {
      if (!businessId) {
        setError('Missing businessId');
        return;
      }
      const base = (orderEndpoint ?? ENV_ORDER_ENDPOINT) || '';
      const url = buildOrdersUrl(base, businessId, { appendOwnerType, ownerType });
      if (!url) {
        setError('Invalid ORDER_ENDPOINT or businessId');
        return;
      }
      if (!opts.silent) setLoading(true);
      setError(null);
      try {
        abortRef.current?.abort?.();
        const controller = new AbortController();
        abortRef.current = controller;
        const res = await fetch(url, {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        if (!res.ok) {
          const json = await parseJSON(res);
          const msg = (json && (json.message || json.error)) || `HTTP ${res.status}`;
          throw new Error(msg);
        }
        const json = await parseJSON(res);
        const list = normalizeOrdersFromApi(json);
        setOrders(list);
      } catch (e) {
        setError(String(e?.message || e) || 'Failed to load orders');
      } finally {
        if (!opts.silent) setLoading(false);
      }
    },
    [businessId, orderEndpoint, appendOwnerType, ownerType]
  );

  useEffect(() => {
    if (ordersProp && ordersProp.length) setOrders(ordersProp);
    else fetchOrders();
  }, [ordersProp, fetchOrders]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('order-updated', ({ id, patch }) => {
      setOrders((prev) => prev.map((o) => (String(o.id) === String(id) ? { ...o, ...patch } : o)));
    });
    return () => sub?.remove?.();
  }, []);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('order-placed', (payload) => {
      try {
        const o = payload?.order;
        if (!o) return;
        const createdISO = o.created_at || new Date().toISOString();

        // find first item with a specific item-level note (for live placed orders)
        let liveNoteTarget = '';
        if (Array.isArray(o.items)) {
          const withNote = o.items.find((it) => getItemNote(it)?.trim?.());
          if (withNote) liveNoteTarget = withNote.item_name || withNote.name || '';
        }

        const normalized = {
          id: String(o.order_id || o.id),
          type: o.fulfillment_type === 'Delivery' ? 'Delivery' : 'Pickup',
          created_at: createdISO,
          time: fmtTime(createdISO),
          items: (o.items || []).map((it) => `${it.item_name ?? 'Item'} ×${Number(it.quantity ?? 1)}`).join(', '),
          total: safeNum(o.total_amount ?? o.total),
          status: o.status || 'PENDING',
          payment_method: o.payment_method || 'COD',
          business_name: (o.items && o.items[0] && o.items[0].business_name) || o.business_name || 'Mart',
          customer_id: o.user?.user_id ?? null,
          customer_name: o.user?.name || '',
          customer_email: o.user?.email || '',
          customer_phone: o.user?.phone || '',
          raw_items: Array.isArray(o.items) ? o.items : [],
          delivery_address: o.delivery_address || '',
          note_for_restaurant: o.note_for_restaurant || '',
          note_target: liveNoteTarget,
          priority: Number(o.priority ?? 0),
          discount_amount: Number(o.discount_amount ?? 0),
        };
        setOrders((prev) => {
          const without = prev.filter((x) => String(x.id) !== String(normalized.id));
          return [normalized, ...without];
        });
      } catch {}
    });
    return () => sub?.remove?.();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchOrders({ silent: true });
    } finally {
      setRefreshing(false);
    }
  }, [fetchOrders]);

  const openOrder = useCallback(
    (o) => {
      Keyboard.dismiss();
      // Pass ownerType through so OrderDetails can adapt its sequence too.
      navigation.navigate(detailsRoute, { orderId: o.id, businessId, order: o, ownerType });
    },
    [navigation, businessId, detailsRoute, ownerType]
  );

  const statusCounts = useMemo(() => {
    return orders.reduce((acc, o) => {
      const k = String(o.status || '').toUpperCase();
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});
  }, [orders]);

  const filtered = useMemo(() => {
    let base = orders;
    if (selectedStatus) {
      base = base.filter((o) => String(o.status || '').toUpperCase() === selectedStatus);
    }
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter((o) => {
      const hay = [
        o.id,
        o.items,
        o.status,
        o.type,
        o.payment_method,
        o.business_name,
        o.time,
        o.customer_name,
        o.customer_phone,
        o.customer_email,
        o.note_for_restaurant,
        o.note_target,
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [orders, query, selectedStatus]);

  const content = useMemo(() => {
    if (loading && orders.length === 0) {
      return (
        <View style={{ paddingVertical: 24, alignItems: 'center' }}>
          <ActivityIndicator />
          <Text style={{ marginTop: 8, color: '#6b7280' }}>Loading orders…</Text>
        </View>
      );
    }
    if (error && orders.length === 0) {
      return (
        <View style={{ paddingVertical: 24 }}>
          <Text style={{ color: '#b91c1c', fontWeight: '600' }}>Failed to load orders</Text>
          <Text style={{ color: '#6b7280', marginTop: 4 }}>{error}</Text>
        </View>
      );
    }
    return (
      <FlatList
        contentContainerStyle={{ paddingBottom: 24 + kbHeight }}
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <OrderItem isTablet={isTablet} money={money} item={item} onPress={openOrder} />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
      />
    );
  }, [loading, error, orders, filtered, isTablet, money, refreshing, onRefresh, openOrder, kbHeight]);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ flex: 1, paddingHorizontal: 16 }}>
        {/* Title + Status Tabs together in one horizontal scroll */}
        <View style={{ marginTop: 12, marginBottom: 8 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ alignItems: 'center', paddingVertical: 8, gap: 8 }}
          >
            {/* Title uses the same font as chips */}
            <Text style={styles.headerInlineText}>
              All orders ({String(ownerType || '').toLowerCase() === 'mart' ? 'Mart' : 'Food'})
            </Text>

            {STATUS_LABELS.map((s) => {
              const active = selectedStatus === s.key;
              const count = statusCounts[s.key] || 0;
              return (
                <Pressable
                  key={s.key}
                  onPress={() => setSelectedStatus(active ? null : s.key)} // deselect → All
                  style={[styles.statusChip, active && styles.statusChipActive]}
                  android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
                >
                  <Text style={[styles.statusChipText, active && styles.statusChipTextActive]}>
                    {s.label}
                  </Text>
                  {count > 0 ? (
                    <View style={[styles.badge, active && styles.badgeActive]}>
                      <Text style={[styles.badgeText, active && styles.badgeTextActive]}>
                        {count}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Search bar */}
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={18} color="#64748b" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search orders (id, item, status, customer, note…)"
            placeholderTextColor="#94a3b8"
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {query ? (
            <Pressable
              onPress={() => setQuery('')}
              style={styles.clearBtn}
              android_ripple={{ color: 'rgba(0,0,0,0.06)', borderless: true }}
            >
              <Ionicons name="close-circle" size={18} color="#94a3b8" />
            </Pressable>
          ) : null}
        </View>

        {content}
      </View>
    </KeyboardAvoidingView>
  );
}

/* ---------------- styles ---------------- */
const styles = StyleSheet.create({
  // Title font same as chips
  headerInlineText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    marginRight: 2,
  },

  // status chips
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  statusChipActive: {
    backgroundColor: '#16a34a1A', // light green tint
    borderColor: '#16a34a',
  },
  statusChipText: { color: '#0f172a', fontWeight: '700', fontSize: 14 }, // font unified
  statusChipTextActive: { color: '#065f46' },

  badge: {
    minWidth: 16,
    height: 16,
    paddingHorizontal: 6,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e2e8f0',
    marginLeft: 6,
  },
  badgeActive: {
    backgroundColor: '#16a34a',
  },
  badgeText: { color: '#0f172a', fontSize: 12, fontWeight: '700' },
  badgeTextActive: { color: 'white' },

  // search
  searchWrap: {
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#16a34a',
  },
  searchInput: { flex: 1, color: '#0f172a', paddingVertical: 0 },
  clearBtn: { padding: 4, borderRadius: 999 },

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
  orderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  orderId: { fontWeight: '700', color: '#111827' },
  orderTime: { color: '#6b7280', fontWeight: '500' },
  orderTotal: { fontWeight: '700', color: '#0f172a' },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  customerText: { color: '#64748b', fontWeight: '500', flexShrink: 1 },

  orderItems: { marginTop: 6, color: '#475569', fontWeight: '500' },

  // 🔹 note bubble
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#ecfeff',      // teal-50
    borderWidth: 1,
    borderColor: '#99f6e4',          // teal-200
  },
  noteText: { flex: 1, color: '#115e59', fontWeight: '600' },
  noteMeta: { marginTop: 4, color: '#0f766e', fontWeight: '700' },
});
