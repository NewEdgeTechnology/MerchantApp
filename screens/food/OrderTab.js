// services/marts/OrdersTab.js
// Mart Orders list tab — same API contract as Food.
// Wrapped payload: { success, data:[ { user, orders:[...] } ] } OR legacy flat rows.
// Reuses the same ORDER endpoint; optionally appends owner_type=mart.
// UPDATE: Accepts businessId from route params or SecureStore as fallback.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  DeviceEventEmitter,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { ORDER_ENDPOINT as ENV_ORDER_ENDPOINT } from '@env';

const BASE_STATUS_LABELS = [
  { key: 'PENDING', label: 'Pending' },
  { key: 'CONFIRMED', label: 'Confirmed' },
  { key: 'READY', label: 'Ready' },
  { key: 'OUT_FOR_DELIVERY', label: 'Out for delivery' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'DECLINED', label: 'Declined' },
];

// Color system for status pills (card-only — tabs untouched)
const STATUS_THEME = {
  PENDING:          { fg: '#0ea5e9',  bg: '#e0f2fe',  bd: '#bae6fd', icon: 'time-outline' },
  CONFIRMED:        { fg: '#16a34a',  bg: '#ecfdf5',  bd: '#bbf7d0', icon: 'checkmark-circle-outline' },
  READY:            { fg: '#2563eb',  bg: '#dbeafe',  bd: '#bfdbfe', icon: 'cube-outline' },
  OUT_FOR_DELIVERY: { fg: '#f59e0b',  bg: '#fef3c7',  bd: '#fde68a', icon: 'bicycle-outline' },
  COMPLETED:        { fg: '#047857',  bg: '#ecfdf5',  bd: '#bbf7d0', icon: 'checkmark-done-outline' },
  DECLINED:         { fg: '#b91c1c',  bg: '#fee2e2',  bd: '#fecaca', icon: 'close-circle-outline' },
};

// Color system for fulfillment type pills
const FULFILL_THEME = {
  DELIVERY: { fg: '#0ea5e9', bg: '#e0f2fe', bd: '#bae6fd', icon: 'bicycle-outline', label: 'Delivery' },
  PICKUP:   { fg: '#7c3aed', bg: '#f5f3ff', bd: '#ddd6fe', icon: 'bag-outline',      label: 'Pickup' },
};

/* ---------------- small UI atoms (card only) ---------------- */
const StatusPill = ({ status }) => {
  const key = String(status || '').toUpperCase();
  const t = STATUS_THEME[key] || STATUS_THEME.PENDING;
  return (
    <View style={[styles.pill, { backgroundColor: t.bg, borderColor: t.bd }]}>
      <Ionicons name={t.icon} size={12} color={t.fg} />
      <Text style={[styles.pillText, { color: t.fg }]} numberOfLines={1}>
        {key.replaceAll('_', ' ').toLowerCase().replace(/(^|\s)\S/g, (s) => s.toUpperCase())}
      </Text>
    </View>
  );
};

const FulfillmentPill = ({ type }) => {
  const key = String(type || '').toUpperCase() === 'DELIVERY' ? 'DELIVERY' : 'PICKUP';
  const t = FULFILL_THEME[key];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg, borderColor: t.bd }]}>
      <Ionicons name={t.icon} size={12} color={t.fg} />
      <Text style={[styles.pillText, { color: t.fg }]} numberOfLines={1}>
        {t.label}
      </Text>
    </View>
  );
};

const ItemPreview = ({ items, raw }) => {
  if (Array.isArray(raw) && raw.length) {
    const [a, b] = raw;
    const t1 = a ? `${a.item_name ?? 'Item'} ×${Number(a.quantity ?? 1)}` : '';
    const t2 = b ? `${b.item_name ?? 'Item'} ×${Number(b.quantity ?? 1)}` : '';
    const more = raw.length > 2 ? ` +${raw.length - 2} more` : '';
    return (
      <Text style={styles.orderItems} numberOfLines={2}>
        {t1}{t2 ? `, ${t2}` : ''}{more}
      </Text>
    );
  }
  if (items) return <Text style={styles.orderItems} numberOfLines={2}>{items}</Text>;
  return null;
};

/* ---------------- helpers (dates, numbers) ---------------- */

// Show exactly what backend sent (no timezone conversion)
const showAsGiven = (s) => {
  if (!s) return '';
  const d = String(s);
  const isoish = d.includes('T') ? d : d.replace(' ', 'T');
  const y = isoish.slice(0, 4), m = isoish.slice(5, 7), dd = isoish.slice(8, 10);
  const hh = isoish.slice(11, 13), mm = isoish.slice(14, 16);
  const monNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const mon = monNames[(+m || 1) - 1] || m;
  if (!y || !m || !dd || !hh || !mm) return d;
  return `${mon} ${dd}, ${hh}:${mm}`;
};

const parseForSort = (v) => {
  if (!v) return 0;
  const s = String(v);
  const n = Date.parse(s.includes('T') ? s : s.replace(' ', 'T'));
  return Number.isFinite(n) ? n : 0;
};

const safeNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// pull a note string from common item-level fields (kept if you need later)
const getItemNote = (it = {}) =>
  it.note_for_restaurant ||
  it.note ||
  it.special_request ||
  it.instructions ||
  it.customization ||
  it.item_note ||
  '';

/* ---------------- CARD: OrderItem ---------------- */
const OrderItem = ({ item, isTablet, money, onPress }) => {
  const isDelivery = item.type === 'Delivery';
  const moneyFmt = money || ((n, c = 'Nu') => `${c} ${Number(n || 0).toFixed(2)}`);
  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={() => onPress?.(item)}
      style={styles.card}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel={`Open order ${item.id}`}
    >
      {/* Row 1: ID/time + total */}
      <View style={styles.row1}>
        <View style={styles.row1Left}>
          <Ionicons
            name={isDelivery ? 'bicycle-outline' : 'bag-outline'}
            size={18}
            color="#0f172a"
          />
          <Text style={[styles.orderId, { fontSize: isTablet ? 15 : 14 }]}>{item.id}</Text>
          <Text style={[styles.orderTime, { fontSize: isTablet ? 13 : 12 }]}> • {item.time}</Text>
        </View>
        <Text style={[styles.orderTotal, { fontSize: isTablet ? 18 : 17 }]}>
          {moneyFmt(item.total, 'Nu')}
        </Text>
      </View>

      {/* Row 2: fulfillment + status + payment */}
      <View style={styles.row2}>
        <FulfillmentPill type={item.type} />
        <StatusPill status={item.status} />
        {!!item.payment_method && (
          <View style={styles.payWrap}>
            <Ionicons name="card-outline" size={14} color="#64748b" />
            <Text style={styles.payText} numberOfLines={1}>{item.payment_method}</Text>
          </View>
        )}
      </View>

      {/* Row 3: items preview */}
      <ItemPreview items={item.items} raw={item.raw_items} />

      {/* Row 4: customer */}
      {(item.customer_name || item.customer_phone || item.customer_email) ? (
        <View style={styles.metaRow}>
          <Ionicons name="person-outline" size={16} color="#64748b" />
          <Text style={styles.customerText} numberOfLines={1}>
            {item.customer_name || 'Customer'}
            {!item.customer_phone && item.customer_email ? ` • ${item.customer_email}` : ''}
          </Text>
        </View>
      ) : null}

      {/* Row 5: note bubble */}
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
    </TouchableOpacity>
  );
};

/* ---------------- grouping & normalization ---------------- */
const groupOrders = (rows = []) => {
  const byId = new Map();
  for (const r of rows) {
    const id = r.order_id ?? r.id ?? 'UNKNOWN';
    const g =
      byId.get(id) ||
      {
        id,
        created_at: null,
        type: r.fulfillment_type || 'Pickup',
        totals: [],
        itemsArr: [],
        business_name: r.business_name,
        payment_method: r.payment_method,
        status: r.status,
        note_for_restaurant: null,
        note_target: null,
        raw_items: [],
      };

    g.totals.push(safeNum(r.total_amount));
    const qty = safeNum(r.quantity) || 1;
    const nm = r.item_name || 'Item';
    g.itemsArr.push(`${nm} ×${qty}`);
    g.raw_items.push({ item_name: nm, quantity: qty });

    const rowCreated =
      r.created_at || r.createdAt || r.placed_at || r.order_time || r.createdOn || null;
    const prev = g.created_at ? parseForSort(g.created_at) : 0;
    const cur  = rowCreated ? parseForSort(rowCreated) : 0;
    if (!prev || (cur && cur < prev)) g.created_at = rowCreated || g.created_at;

    if (r.fulfillment_type === 'Delivery') g.type = 'Delivery';

    if (!g.note_for_restaurant) {
      g.note_for_restaurant =
        r.note_for_restaurant ||
        r.restaurant_note ||
        r.note_for_store ||
        r.note ||
        null;
    }

    const itemLevelNote = getItemNote(r) || '';
    if (!g.note_target && (itemLevelNote && String(itemLevelNote).trim())) {
      g.note_target = r.item_name || 'Item';
      if (!g.note_for_restaurant) g.note_for_restaurant = itemLevelNote;
    }

    byId.set(id, g);
  }

  const list = Array.from(byId.values()).map((g) => {
    const total = g.totals.length > 0 ? g.totals.reduce((a, b) => a + b, 0) / g.totals.length : 0;
    const createdISO = g.created_at || null;

    return {
      id: String(g.id),
      type: g.type,
      time: showAsGiven(createdISO),
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
      raw_items: g.raw_items,
      delivery_address: '',
      note_for_restaurant: g.note_for_restaurant || '',
      note_target: g.note_target || '',
      priority: 0,
      discount_amount: 0,
    };
  });

  return list.sort((a, b) => parseForSort(b.created_at) - parseForSort(a.created_at));
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
  try { return text ? JSON.parse(text) : null; } catch { return null; }
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
        const createdISO = o.created_at || o.createdAt || o.placed_at || o.order_time || null;

        let noteTarget = '';
        if (Array.isArray(o.items)) {
          const withNote = o.items.find((it) =>
            (it?.note_for_restaurant ||
              it?.note ||
              it?.special_request ||
              it?.instructions ||
              it?.customization ||
              it?.item_note)?.trim?.()
          );
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
          id: String(o.order_id ?? o.id),
          type: o.fulfillment_type === 'Delivery' ? 'Delivery' : 'Pickup',
          time: showAsGiven(createdISO),
          created_at: createdISO,
          items: itemsStr,
          total: Number(o.total_amount ?? 0),
          status: o.status,
          payment_method: o.payment_method,
          business_name: businessName,
          delivery_address: o.delivery_address || '',
          note_for_restaurant: o.note_for_restaurant || '',
          note_target: noteTarget,
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
    return list.sort((a, b) => parseForSort(b.created_at) - parseForSort(a.created_at));
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
  ownerType = 'mart',
  detailsRoute = 'OrderDetails',
  delivery_option: deliveryOptionProp,             // NEW (accept from parent)
}) {
  const navigation = useNavigation();
  const route = useRoute();

  // Resolve business id from prop -> params -> SecureStore
  const [bizId, setBizId] = useState(
    businessId || route?.params?.businessId || null
  );

  // NEW: delivery option state (SELF | GRAB | BOTH…)
  const [deliveryOption, setDeliveryOption] = useState(                    // NEW
    (route?.params?.delivery_option || route?.params?.deliveryOption ||   // NEW
     deliveryOptionProp || null)                                          // NEW
      ? String(route?.params?.delivery_option || route?.params?.deliveryOption || deliveryOptionProp).toUpperCase()
      : null
  );                                                                       // NEW

  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState(ordersProp || []);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [kbHeight, setKbHeight] = useState(0);
  const [selectedStatus, setSelectedStatus] = useState(null); // null = All
  const abortRef = useRef(null);

  const STATUS_LABELS = useMemo(() => {
    const isMart = String(ownerType || '').toLowerCase() === 'mart';
    return isMart ? BASE_STATUS_LABELS.filter(s => s.key !== 'PREPARING') : BASE_STATUS_LABELS;
  }, [ownerType]);

  useEffect(() => {
    if (selectedStatus && !STATUS_LABELS.some(s => s.key === selectedStatus)) {
      setSelectedStatus(null);
    }
  }, [STATUS_LABELS, selectedStatus]);

  // Keyboard padding
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

  // Hydrate bizId and delivery_option from secure storage on focus if missing
  useFocusEffect(                                                    // NEW (expanded)
    useCallback(() => {
      let alive = true;
      (async () => {
        // business id fallback
        if (!bizId) {
          try {
            const blob = await SecureStore.getItemAsync('business_details');
            let id = null;
            if (blob) {
              try {
                const parsed = JSON.parse(blob);
                id = parsed?.business_id ?? parsed?.id ?? null;
                // also try delivery_option if not set
                if (!deliveryOption && parsed?.delivery_option) {
                  setDeliveryOption(String(parsed.delivery_option).toUpperCase());
                }
              } catch {}
            }
            if (!id) {
              const single = await SecureStore.getItemAsync('business_id');
              if (single) id = Number(single);
            }
            if (alive && id) setBizId(id);
          } catch {}
        }
        // also probe merchant_login for delivery_option if still missing
        if (!deliveryOption) {
          try {
            const raw = await SecureStore.getItemAsync('merchant_login');
            if (raw) {
              const parsed = JSON.parse(raw);
              const opt =
                parsed?.delivery_option ||
                parsed?.user?.delivery_option ||
                parsed?.user?.deliveryOption ||
                null;
              if (opt && alive) setDeliveryOption(String(opt).toUpperCase());
            }
          } catch {}
        }
      })();
      return () => { alive = false; };
    }, [bizId, deliveryOption])
  );

  const buildUrl = useCallback(() => {
    const base = (orderEndpoint ?? ENV_ORDER_ENDPOINT) || '';
    return buildOrdersUrl(base, bizId, { appendOwnerType, ownerType });
  }, [bizId, orderEndpoint, appendOwnerType, ownerType]);

  const fetchOrders = useCallback(
    async (opts = { silent: false }) => {
      if (!bizId) {
        setError('Missing businessId');
        return;
      }
      const url = buildUrl();
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
    [bizId, buildUrl]
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
        const createdISO = o.created_at || o.createdAt || o.placed_at || o.order_time || new Date().toISOString();

        let liveNoteTarget = '';
        if (Array.isArray(o.items)) {
          const withNote = o.items.find((it) =>
            (it?.note_for_restaurant ||
              it?.note ||
              it?.special_request ||
              it?.instructions ||
              it?.customization ||
              it?.item_note)?.trim?.()
          );
          if (withNote) liveNoteTarget = withNote.item_name || withNote.name || '';
        }

        const normalized = {
          id: String(o.order_id || o.id),
          type: o.fulfillment_type === 'Delivery' ? 'Delivery' : 'Pickup',
          created_at: createdISO,
          time: showAsGiven(createdISO),
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
          return [normalized, ...without].sort((a, b) => parseForSort(b.created_at) - parseForSort(a.created_at));
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
      try {
        const state = navigation.getState?.();
        const routeExists = !!state?.routeNames?.includes?.(detailsRoute);
        if (!routeExists) {
          Alert.alert(
            'Order screen not found',
            `No screen named "${detailsRoute}". Please register it in your navigator.`,
          );
          return;
        }
      } catch {}
      navigation.navigate(detailsRoute, {
        orderId: o.id,
        businessId: bizId,
        order: o,
        ownerType,
        delivery_option: deliveryOption,    // NEW: pass along
      });
    },
    [navigation, bizId, detailsRoute, ownerType, deliveryOption] // NEW dep
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

  const renderItem = useCallback(
    ({ item }) => (
      <OrderItem
        isTablet={isTablet}
        money={money}
        item={item}
        onPress={openOrder}
      />
    ),
    [isTablet, money, openOrder]
  );

  const totalCount = orders.length;

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
        <View style={{ paddingVertical: 24, alignItems: 'center' }}>
          <Ionicons name="alert-circle-outline" size={24} color="#b91c1c" />
          <Text style={{ color: '#b91c1c', fontWeight: '700', marginTop: 6 }}>Failed to load</Text>
          <Text style={{ color: '#6b7280', marginTop: 4, textAlign: 'center' }}>{error}</Text>
        </View>
      );
    }
    if (!loading && filtered.length === 0) {
      return (
        <View style={{ paddingVertical: 36, alignItems: 'center' }}>
          <Ionicons name="file-tray-outline" size={36} color="#94a3b8" />
          <Text style={{ color: '#334155', fontWeight: '800', marginTop: 8 }}>No orders</Text>
          <Text style={{ color: '#64748b', marginTop: 4 }}>Pull down to refresh or change filters.</Text>
        </View>
      );
    }
    return (
      <FlatList
        contentContainerStyle={{ paddingBottom: 24 + kbHeight }}
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="always"
        removeClippedSubviews={false}
      />
    );
  }, [loading, error, orders, filtered, kbHeight, refreshing, onRefresh, renderItem]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      pointerEvents="box-none"
    >
      <View style={{ flex: 1, paddingHorizontal: 16 }} pointerEvents="box-none">
        {/* Title + Status Tabs */}
        <View style={{ marginTop: 12, marginBottom: 8 }} pointerEvents="box-none">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ alignItems: 'center', paddingVertical: 8, gap: 8 }}
          >
            <TouchableOpacity
              onPress={() => setSelectedStatus(null)}
              style={[styles.statusChip, selectedStatus === null && styles.statusChipActive]}
              activeOpacity={0.7}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Text style={[styles.statusChipText, selectedStatus === null && styles.statusChipTextActive]}>
                All
              </Text>
              <View style={[styles.badge, selectedStatus === null && styles.badgeActive]}>
                <Text style={[styles.badgeText, selectedStatus === null && styles.badgeTextActive]}>
                  {totalCount}
                </Text>
              </View>
            </TouchableOpacity>

            {BASE_STATUS_LABELS
              .filter(s => STATUS_LABELS.some(t => t.key === s.key))
              .map((s) => {
              const active = selectedStatus === s.key;
              const count = statusCounts[s.key] || 0;
              return (
                <TouchableOpacity
                  key={s.key}
                  onPress={() => setSelectedStatus(active ? null : s.key)}
                  style={[styles.statusChip, active && styles.statusChipActive]}
                  activeOpacity={0.7}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
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
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Search bar */}
        <View style={styles.searchWrap} pointerEvents="auto">
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
            <TouchableOpacity
              onPress={() => setQuery('')}
              style={styles.clearBtn}
              activeOpacity={0.7}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons name="close-circle" size={18} color="#94a3b8" />
            </TouchableOpacity>
          ) : null}
        </View>

        {content}
      </View>
    </KeyboardAvoidingView>
  );
}

/* ---------------- styles ---------------- */
const styles = StyleSheet.create({
  headerInlineText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    marginRight: 2,
  },

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
    backgroundColor: '#16a34a1A',
    borderColor: '#16a34a',
  },
  statusChipText: { color: '#0f172a', fontWeight: '700', fontSize: 14 },
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
  badgeActive: { backgroundColor: '#16a34a' },
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

  /* card + internals */
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },

  // row 1
  row1: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row1Left: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  orderId: { fontWeight: '900', color: '#0f172a' },
  orderTime: { color: '#64748b', fontWeight: '600' },
  orderTotal: { fontWeight: '900', color: '#0f172a' },

  // row 2
  row2: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
    borderWidth: 1, maxWidth: '70%',
  },
  pillText: { fontWeight: '800', fontSize: 12 },

  payWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 'auto' },
  payText: { color: '#64748b', fontWeight: '700' },

  // items
  orderItems: { marginTop: 8, color: '#334155', fontWeight: '600' },

  // customer
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  customerText: { color: '#64748b', fontWeight: '600', flexShrink: 1 },

  // note bubble
  noteRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 8,
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12,
    backgroundColor: '#ecfeff', borderWidth: 1, borderColor: '#99f6e4',
  },
  noteText: { flex: 1, color: '#115e59', fontWeight: '600' },
  noteMeta: { marginTop: 4, color: '#0f766e', fontWeight: '700' },
});
