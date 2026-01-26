// services/marts/OrdersTab.js
// Mart / Food Orders list tab — grouped orders + upcoming scheduled orders.
// - Upcoming: no filters shown (no search, no date dropdown).
// - Normal: status tabs + search + date dropdown (All / Today / Yesterday / calendar).
// - Counts per status respect date filter (except Upcoming).
// ✅ FIX: If backend sends ON ROAD / ON_ROAD / ONROAD, UI auto-maps to OUT_FOR_DELIVERY everywhere.
// ✅ UPDATE: Scheduled orders now show schedule time using scheduled_at_local / scheduled_at_utc from API.
// ✅ UPDATE: Order "total" now matches OrderDetails display total (EXCLUDES platform_fee; includes delivery + merchant_delivery - discount).
// ✅ FIX: Totals computed robustly from nested totals + item line totals (supports string prices like "Nu. 20")

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
  Modal,
  Pressable,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  ORDER_ENDPOINT as ENV_ORDER_ENDPOINT,
  SCHEDULED_ORDER_ENDPOINT as ENV_SCHEDULED_ORDER_ENDPOINT,
} from '@env';

const BASE_STATUS_LABELS = [
  { key: 'PENDING', label: 'Pending' },
  { key: 'CONFIRMED', label: 'Confirmed' },
  { key: 'READY', label: 'Ready' },
  { key: 'OUT_FOR_DELIVERY', label: 'Out for delivery' },
  // { key: 'COMPLETED', label: 'Completed' },
  { key: 'DECLINED', label: 'Declined' },
];

const STATUS_THEME = {
  PENDING: { fg: '#0ea5e9', bg: '#e0f2fe', bd: '#bae6fd', icon: 'time-outline' },
  CONFIRMED: { fg: '#16a34a', bg: '#ecfdf5', bd: '#bbf7d0', icon: 'checkmark-circle-outline' },
  READY: { fg: '#2563eb', bg: '#dbeafe', bd: '#bfdbfe', icon: 'cube-outline' },
  OUT_FOR_DELIVERY: { fg: '#f59e0b', bg: '#fef3c7', bd: '#fde68a', icon: 'bicycle-outline' },
  COMPLETED: { fg: '#047857', bg: '#ecfdf5', bd: '#bbf7d0', icon: 'checkmark-done-outline' },
  DECLINED: { fg: '#b91c1c', bg: '#fee2e2', bd: '#fecaca', icon: 'close-circle-outline' },
  SCHEDULED: { fg: '#0ea5e9', bg: '#eff6ff', bd: '#dbeafe', icon: 'calendar-outline' },
};

const FULFILL_THEME = {
  DELIVERY: { fg: '#0ea5e9', bg: '#e0f2fe', bd: '#bae6fd', icon: 'bicycle-outline', label: 'Delivery' },
  PICKUP: { fg: '#7c3aed', bg: '#f5f3ff', bd: '#ddd6fe', icon: 'bag-outline', label: 'Pickup' },
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* ---------------- helpers ---------------- */
// ✅ normalize status keys from backend into UI keys
const normalizeStatusKey = (s) => {
  const k = String(s || '').trim().toUpperCase().replace(/\s+/g, '_');
  if (k === 'ON_ROAD' || k === 'ONROAD') return 'OUT_FOR_DELIVERY';
  return k;
};

const showAsGiven = (s) => {
  if (!s) return '';
  const d = String(s);

  // supports:
  // - "2026-01-17T12:30:00+06:00"
  // - "2026-01-17T06:30:00.000Z"
  // - "2026-01-17 12:30:00"
  const isoish = d.includes('T') ? d : d.replace(' ', 'T');

  const y = isoish.slice(0, 4),
    m = isoish.slice(5, 7),
    dd = isoish.slice(8, 10);
  const hh = isoish.slice(11, 13),
    mm = isoish.slice(14, 16);

  const mon = MONTH_NAMES[(+m || 1) - 1] || m;
  if (!y || !m || !dd || !hh || !mm) return d;
  return `${mon} ${dd}, ${hh}:${mm}`;
};

const parseForSort = (v) => {
  if (!v) return 0;
  const s = String(v).trim();

  let n = Date.parse(s.includes('T') ? s : s.replace(' ', 'T'));
  if (Number.isFinite(n)) return n;

  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    const [, dd, mm, yyyy, hh, min, ss] = m;
    const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min), ss ? Number(ss) : 0);
    if (!Number.isNaN(date.getTime())) return date.getTime();
  }
  return 0;
};

const safeNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const pad2 = (n) => (n < 10 ? `0${n}` : String(n));
const dateKeyFromDateObj = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const dateKeyFromTs = (v) => {
  const t = parseForSort(v);
  if (!t) return null;
  const d = new Date(t);
  return dateKeyFromDateObj(d);
};

const labelForDateKey = (key, todayKey, yesterdayKey) => {
  if (key === todayKey) return 'Today';
  if (key === yesterdayKey) return 'Yesterday';
  const [y, m, d] = key.split('-').map(Number);
  if (!y || !m || !d) return key;
  const date = new Date(y, m - 1, d);
  return `${MONTH_NAMES[date.getMonth()]} ${d}`;
};

const getItemNote = (it = {}) =>
  it.note_for_restaurant ||
  it.note ||
  it.special_request ||
  it.instructions ||
  it.customization ||
  it.item_note ||
  '';

/* ✅ address extractor that supports deliver_to */
const pickAddress = (o = {}) => {
  const cand = [
    o?.delivery_address,
    o?.deliver_to?.address,
    o?.deliver_to?.label,
    o?.deliver_to?.formatted,
    o?.dropoff_address,
    o?.shipping_address,
    o?.address,
    o?.customer_address,
    o?.deliver_to, // sometimes a string
  ];

  for (const v of cand) {
    if (!v) continue;
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'object') {
      if (typeof v.address === 'string' && v.address.trim()) return v.address.trim();
      if (typeof v.label === 'string' && v.label.trim()) return v.label.trim();
      if (typeof v.formatted === 'string' && v.formatted.trim()) return v.formatted.trim();
    }
  }
  return '';
};

/* ===========================
   ✅ money parsing + totals (match OrderDetails)
   =========================== */
const toMoneyNumber = (v) => {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (!s) return null;
  const cleaned = s.replace(/[^0-9.-]/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
};

const pickMoney = (...vals) => {
  for (const v of vals) {
    const n = toMoneyNumber(v);
    if (n != null) return n; // includes 0
  }
  return null;
};

const getItemQty = (it) => {
  const q = Number(it?.qty ?? it?.quantity ?? it?.quantity_ordered ?? it?.order_qty ?? 1);
  return Number.isFinite(q) && q > 0 ? q : 1;
};

const getItemUnitPrice = (it) => {
  const p =
    toMoneyNumber(it?.unit_price) ??
    toMoneyNumber(it?.price) ??
    toMoneyNumber(it?.item_price) ??
    toMoneyNumber(it?.rate) ??
    toMoneyNumber(it?.selling_price) ??
    toMoneyNumber(it?.unitPrice) ??
    null;

  if (p != null) return p;
  const n = Number(it?.price ?? it?.unit_price ?? it?.item_price ?? it?.rate ?? it?.selling_price ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const getItemLineTotal = (it) => {
  const direct = pickMoney(
    it?.subtotal,
    it?.sub_total,
    it?.line_total,
    it?.lineTotal,
    it?.total,
    it?.amount,
    it?.final_amount
  );
  if (direct != null) return direct;
  return getItemQty(it) * getItemUnitPrice(it);
};

const sumItemsTotal = (items = []) => {
  return (items || []).reduce((sum, it) => sum + getItemLineTotal(it), 0);
};

const getTotalsSnapshot = (o = {}) => {
  const t = o?.totals || o?.total_breakdown || o?.breakdown || o?.pricing || null;
  const b =
    o?.totals_for_business ||
    o?.totalsForBusiness ||
    o?.business_totals ||
    o?.businessTotals ||
    null;

  const platform_fee = pickMoney(o?.platform_fee, o?.platformFee, t?.platform_fee, t?.platformFee, b?.platform_fee, b?.platformFee);
  const discount_amount = pickMoney(o?.discount_amount, o?.discountAmount, o?.discount, t?.discount_amount, t?.discountAmount, t?.discount, b?.discount_amount, b?.discountAmount, b?.discount);
  const delivery_fee = pickMoney(o?.delivery_fee, o?.deliveryFee, t?.delivery_fee, t?.deliveryFee, b?.delivery_fee, b?.deliveryFee);
  const merchant_delivery_fee = pickMoney(o?.merchant_delivery_fee, o?.merchantDeliveryFee, t?.merchant_delivery_fee, t?.merchantDeliveryFee, b?.merchant_delivery_fee, b?.merchantDeliveryFee);

  const total_amount = pickMoney(o?.total_amount, o?.totalAmount, o?.total, t?.total_amount, t?.totalAmount, t?.total, b?.total_amount, b?.totalAmount, b?.total);

  return { platform_fee, discount_amount, delivery_fee, merchant_delivery_fee, total_amount };
};

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

const computeDisplayTotal = ({ items, totals }) => {
  const snap = totals || {};
  const df = snap.delivery_fee ?? 0;
  const mdf = snap.merchant_delivery_fee ?? 0;
  const disc = snap.discount_amount ?? 0;
  const pf = snap.platform_fee ?? null;
  const grand = snap.total_amount ?? null;

  const hasItems = Array.isArray(items) && items.length > 0;
  const itemsTotal = hasItems ? sumItemsTotal(items) : null;

  if (hasItems && itemsTotal != null) {
    return round2(Number(itemsTotal || 0) + Number(df || 0) + Number(mdf || 0) - Number(disc || 0));
  }

  if (grand != null) {
    // fallback when item totals are missing: subtract platform fee if known
    return round2(Number(grand || 0) - Number(pf || 0));
  }

  return 0;
};

/* ---------------- small UI atoms ---------------- */
const StatusPill = ({ status }) => {
  const key = normalizeStatusKey(status);
  const t = STATUS_THEME[key] || STATUS_THEME.PENDING;
  return (
    <View style={[styles.pill, { backgroundColor: t.bg, borderColor: t.bd }]}>
      <Ionicons name={t.icon} size={12} color={t.fg} />
      <Text style={[styles.pillText, { color: t.fg }]} numberOfLines={1}>
        {key
          .replaceAll('_', ' ')
          .toLowerCase()
          .replace(/(^|\s)\S/g, (s) => s.toUpperCase())}
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
        {t1}
        {t2 ? `, ${t2}` : ''}
        {more}
      </Text>
    );
  }
  if (items) return <Text style={styles.orderItems} numberOfLines={2}>{items}</Text>;
  return null;
};

const OrderItem = ({ item, isTablet, money, onPress }) => {
  const isDelivery = item.type === 'Delivery';
  const isScheduled = normalizeStatusKey(item.status) === 'SCHEDULED';
  const moneyFmt = money || ((n, c = 'Nu') => `${c} ${Number(n || 0).toFixed(2)}`);

  // ✅ scheduled label safety (always show scheduled time)
  const scheduledPretty = item?.created_at ? `Scheduled • ${showAsGiven(item.created_at)}` : 'Scheduled';
  const scheduledText = item?.time && String(item.time).trim() ? String(item.time) : scheduledPretty;

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={() => onPress?.(item)}
      style={styles.card}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <View style={styles.row1}>
        <View style={styles.row1Left}>
          <Ionicons name={isDelivery ? 'bicycle-outline' : 'bag-outline'} size={18} color="#0f172a" />
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[styles.orderId, { fontSize: isTablet ? 15 : 14 }]}>{item.id}</Text>
              {!isScheduled && !!item.time && (
                <Text style={[styles.orderTime, { fontSize: isTablet ? 13 : 12 }]}>
                  {' '}• {item.time}
                </Text>
              )}
            </View>

            {isScheduled && (
              <Text style={[styles.scheduledTime, { fontSize: isTablet ? 14 : 13 }]} numberOfLines={2}>
                {scheduledText}
              </Text>
            )}
          </View>
        </View>

        {/* ✅ total now matches OrderDetails display total */}
        <Text style={[styles.orderTotal, { fontSize: isTablet ? 18 : 17 }]}>{moneyFmt(item.total, 'Nu')}</Text>
      </View>

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

      <ItemPreview items={item.items} raw={item.raw_items} />

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

      {!!item.delivery_address?.trim?.() && (
        <View style={styles.metaRow}>
          <Ionicons name="location-outline" size={16} color="#64748b" />
          <Text style={styles.customerText} numberOfLines={2}>{item.delivery_address.trim()}</Text>
        </View>
      )}

      {!!item.note_for_restaurant?.trim?.() && (
        <View style={styles.noteRow}>
          <Ionicons name="chatbubble-ellipses-outline" size={14} color="#0f766e" />
          <View style={{ flex: 1 }}>
            <Text style={styles.noteText} numberOfLines={3}>{item.note_for_restaurant.trim()}</Text>
            {!!item.note_target?.trim?.() && (
              <Text style={styles.noteMeta} numberOfLines={1}>for {item.note_target.trim()}</Text>
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
        itemsArr: [],
        raw_items: [],
        business_name: r.business_name,
        payment_method: r.payment_method,
        status: normalizeStatusKey(r.status),
        note_for_restaurant: null,
        note_target: null,
        delivery_address: '',

        // totals components
        items_total: 0,
        platform_fee: null,
        discount_amount: null,
        delivery_fee: null,
        merchant_delivery_fee: null,
        total_amount: null,
      };

    if (r.status) g.status = normalizeStatusKey(r.status);

    const qty = getItemQty(r) || 1;
    const nm = r.item_name || 'Item';
    g.itemsArr.push(`${nm} ×${qty}`);
    g.raw_items.push({ item_name: nm, quantity: qty });

    // items total
    g.items_total += getItemLineTotal(r);

    // fee/totals (first non-null wins)
    const snap = getTotalsSnapshot(r);
    if (g.platform_fee == null && snap.platform_fee != null) g.platform_fee = snap.platform_fee;
    if (g.discount_amount == null && snap.discount_amount != null) g.discount_amount = snap.discount_amount;
    if (g.delivery_fee == null && snap.delivery_fee != null) g.delivery_fee = snap.delivery_fee;
    if (g.merchant_delivery_fee == null && snap.merchant_delivery_fee != null) g.merchant_delivery_fee = snap.merchant_delivery_fee;
    if (g.total_amount == null && snap.total_amount != null) g.total_amount = snap.total_amount;

    const rowCreated = r.created_at || r.createdAt || r.placed_at || r.order_time || r.createdOn || null;
    const prev = g.created_at ? parseForSort(g.created_at) : 0;
    const cur = rowCreated ? parseForSort(rowCreated) : 0;
    if (!prev || (cur && cur < prev)) g.created_at = rowCreated || g.created_at;

    if (r.fulfillment_type === 'Delivery') g.type = 'Delivery';
    if (!g.delivery_address) g.delivery_address = pickAddress(r) || '';

    if (!g.note_for_restaurant) {
      g.note_for_restaurant = r.note_for_restaurant || r.restaurant_note || r.note_for_store || r.note || null;
    }

    const itemLevelNote = getItemNote(r) || '';
    if (!g.note_target && itemLevelNote && String(itemLevelNote).trim()) {
      g.note_target = r.item_name || 'Item';
      if (!g.note_for_restaurant) g.note_for_restaurant = itemLevelNote;
    }

    byId.set(id, g);
  }

  const list = Array.from(byId.values()).map((g) => {
    const createdISO = g.created_at || null;

    const totals = {
      platform_fee: g.platform_fee,
      discount_amount: g.discount_amount ?? 0,
      delivery_fee: g.delivery_fee ?? 0,
      merchant_delivery_fee: g.merchant_delivery_fee ?? 0,
      total_amount: g.total_amount,
    };

    // ✅ total matches OrderDetails display total
    const total = computeDisplayTotal({
      items: [{ subtotal: g.items_total }], // provide itemsTotal without needing full items list
      totals: { ...totals, total_amount: totals.total_amount ?? null },
    });

    return {
      id: String(g.id),
      type: g.type,
      time: showAsGiven(createdISO),
      created_at: createdISO,
      items: g.itemsArr.join(', '),
      total,
      status: normalizeStatusKey(g.status),
      payment_method: g.payment_method,
      business_name: g.business_name,
      customer_id: null,
      customer_name: '',
      customer_email: '',
      customer_phone: '',
      raw_items: g.raw_items,
      delivery_address: g.delivery_address || '',
      note_for_restaurant: g.note_for_restaurant || '',
      note_target: g.note_target || '',
      priority: 0,
      discount_amount: Number(g.discount_amount ?? 0),
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

const buildScheduledUrl = (base, businessId) => {
  if (!base || !businessId) return null;
  const b = String(base).trim().replace(/\/+$/, '');
  const id = encodeURIComponent(String(businessId));

  let replaced = b
    .replace(/\{\s*businessId\s*\}/gi, id)
    .replace(/\{\s*business_id\s*\}/gi, id)
    .replace(/\{\s*business_Id\s*\}/g, id)
    .replace(/:businessId/gi, id)
    .replace(/:business_id/gi, id)
    .replace(/:business_Id/g, id);

  if (replaced === b) {
    if (/\/business$/i.test(b)) replaced = `${b}/${id}`;
    else if (!b.endsWith(`/${id}`)) {
      const sep = b.includes('?') ? '&' : '?';
      replaced = `${b}${sep}business_id=${id}`;
    }
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
        const createdISO = o.created_at || o.createdAt || o.placed_at || o.order_time || null;

        let noteTarget = '';
        if (Array.isArray(o.items)) {
          const withNote = o.items.find((it) =>
            (
              it?.note_for_restaurant ||
              it?.note ||
              it?.special_request ||
              it?.instructions ||
              it?.customization ||
              it?.item_note
            )?.trim?.()
          );
          if (withNote) noteTarget = withNote.item_name || withNote.name || '';
        }

        const itemsArr = Array.isArray(o.items) ? o.items : [];
        const itemsStr = itemsArr
          .map((it) => `${it.item_name ?? 'Item'} ×${Number(it.quantity ?? 1)}`)
          .join(', ');

        const businessName =
          (o.items && o.items[0] && o.items[0].business_name) ||
          o.business_name ||
          o.business?.business_name ||
          '';

        const deliveryAddr = pickAddress(o);

        const snap = getTotalsSnapshot(o);

        // ✅ total matches OrderDetails display total
        const displayTotal = computeDisplayTotal({ items: itemsArr, totals: snap });

        list.push({
          id: String(o.order_id ?? o.id),
          type: o.fulfillment_type === 'Delivery' ? 'Delivery' : 'Pickup',
          time: showAsGiven(createdISO),
          created_at: createdISO,
          items: itemsStr,
          total: displayTotal,
          status: normalizeStatusKey(o.status),
          payment_method: o.payment_method,
          business_name: businessName,
          delivery_address: deliveryAddr || '',
          note_for_restaurant: o.note_for_restaurant || '',
          note_target: noteTarget,
          priority: Number(o.priority ?? 0),
          discount_amount: Number(snap.discount_amount ?? 0),
          raw_items: itemsArr,
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

// ✅ UPDATED: uses scheduled_at_local / scheduled_at_utc from API and builds label "Scheduled • Jan 17, 12:30"
const normalizeScheduledForBiz = (payload, bizId) => {
  try {
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    const list = [];

    for (const job of rows) {
      const payloadOrder = job.order_payload || {};
      const allItems = Array.isArray(payloadOrder.items) ? payloadOrder.items : [];

      const itemsForBiz = bizId
        ? allItems.filter((it) => String(it.business_id) === String(bizId))
        : allItems;

      if (!itemsForBiz.length) continue;

      const itemsStr = itemsForBiz
        .map((it) => `${it.item_name ?? 'Item'} ×${Number(it.quantity ?? 1)}`)
        .join(', ');

      const businessName = itemsForBiz[0]?.business_name || '';

      let noteTarget = '';
      const withNote = itemsForBiz.find((it) =>
        (
          it?.note_for_restaurant ||
          it?.note ||
          it?.special_request ||
          it?.instructions ||
          it?.customization ||
          it?.item_note
        )?.trim?.()
      );
      if (withNote) noteTarget = withNote.item_name || withNote.name || '';

      // ✅ prefer local schedule time (your API has scheduled_at_local)
      const scheduledLocal =
        job.scheduled_at_local ||
        payloadOrder.scheduled_at_local ||
        payloadOrder.scheduled_at ||
        null;

      const scheduledUtc =
        job.scheduled_at_utc ||
        payloadOrder.scheduled_at_utc ||
        job.scheduled_at ||
        null;

      const scheduledAt = scheduledLocal || scheduledUtc || null;

      const pretty = scheduledAt ? showAsGiven(scheduledAt) : '';
      const timeLabel =
        payloadOrder.scheduled_label ||
        payloadOrder.scheduled_time_label ||
        payloadOrder.scheduledTimeLabel ||
        payloadOrder.scheduled_at_label ||
        (pretty ? `Scheduled • ${pretty}` : 'Scheduled');

      const customer_name = job.name || payloadOrder.customer_name || payloadOrder.name || '';
      const customer_phone = payloadOrder.customer_phone || payloadOrder.phone || '';

      const scheduledAddr =
        payloadOrder?.delivery_address?.address ||
        payloadOrder?.deliver_to?.address ||
        payloadOrder?.delivery_address ||
        payloadOrder?.deliver_to?.label ||
        payloadOrder?.deliver_to?.formatted ||
        payloadOrder?.deliver_to ||
        '';

      const snap = getTotalsSnapshot(payloadOrder);
      const displayTotal = computeDisplayTotal({ items: itemsForBiz, totals: snap });

      list.push({
        id: String(job.job_id || job.id),
        type: payloadOrder.fulfillment_type === 'Delivery' ? 'Delivery' : 'Pickup',

        // used for sorting + fallback label
        created_at: scheduledAt,

        // optional fields (handy for debugging)
        scheduled_at_local: scheduledLocal || null,
        scheduled_at_utc: scheduledUtc || null,

        // ✅ card prints this
        time: timeLabel,

        items: itemsStr,
        total: displayTotal,
        status: 'SCHEDULED',
        payment_method: payloadOrder.payment_method,
        business_name: businessName,
        delivery_address: String(scheduledAddr || ''),
        note_for_restaurant: payloadOrder.note_for_restaurant || '',
        note_target: noteTarget,
        priority: payloadOrder.priority ? 1 : 0,
        discount_amount: Number(snap.discount_amount ?? payloadOrder.discount_amount ?? 0),
        raw_items: itemsForBiz,
        customer_id: job.user_id ?? payloadOrder.user_id ?? null,
        customer_name,
        customer_email: '',
        customer_phone,
      });
    }

    // scheduled orders: soonest first
    return list.sort((a, b) => parseForSort(a.created_at) - parseForSort(b.created_at));
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
  ownerType: ownerTypeProp = 'mart',
  detailsRoute = 'OrderDetails',
  delivery_option: deliveryOptionProp,
}) {
  const navigation = useNavigation();
  const route = useRoute();

  const [bizId, setBizId] = useState(businessId || route?.params?.businessId || null);

  const initialOwnerType = route?.params?.owner_type || route?.params?.ownerType || ownerTypeProp || 'mart';
  const [ownerType, setOwnerType] = useState(String(initialOwnerType));

  const [deliveryOption, setDeliveryOption] = useState(
    (route?.params?.delivery_option || route?.params?.deliveryOption || deliveryOptionProp || null)
      ? String(route?.params?.delivery_option || route?.params?.deliveryOption || deliveryOptionProp).toUpperCase()
      : null
  );

  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState(ordersProp || []);
  const [error, setError] = useState(null);

  const [scheduledOrders, setScheduledOrders] = useState([]);
  const [scheduledLoading, setScheduledLoading] = useState(false);
  const [scheduledError, setScheduledError] = useState(null);

  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [kbHeight, setKbHeight] = useState(0);

  const [activeDateKey, setActiveDateKey] = useState(''); // All dates
  const [showDateDropdown, setShowDateDropdown] = useState(false);

  const [showCalendar, setShowCalendar] = useState(false);
  const [tempCalendarDate, setTempCalendarDate] = useState(new Date());

  const [activeChip, setActiveChip] = useState('ALL');

  const abortRef = useRef(null);

  const today = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }, []);
  const yesterday = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }, []);
  const todayKey = useMemo(() => dateKeyFromDateObj(today), [today]);
  const yesterdayKey = useMemo(() => dateKeyFromDateObj(yesterday), [yesterday]);

  const STATUS_LABELS = useMemo(() => {
    const isMart = String(ownerType || '').toLowerCase() === 'mart';
    return isMart ? BASE_STATUS_LABELS.filter((s) => s.key !== 'PREPARING') : BASE_STATUS_LABELS;
  }, [ownerType]);

  useEffect(() => {
    const fromRoute = route?.params?.owner_type || route?.params?.ownerType || null;
    if (fromRoute && String(fromRoute) !== String(ownerType)) setOwnerType(String(fromRoute));
  }, [route, ownerType]);

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

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        if (!bizId) {
          try {
            const blob = await SecureStore.getItemAsync('business_details');
            let id = null;
            if (blob) {
              try {
                const parsed = JSON.parse(blob);
                id = parsed?.business_id ?? parsed?.id ?? null;

                if (!deliveryOption && parsed?.delivery_option) {
                  setDeliveryOption(String(parsed.delivery_option).toUpperCase());
                }

                if (!ownerType && parsed?.owner_type) setOwnerType(String(parsed.owner_type));
              } catch {}
            }
            if (!id) {
              const single = await SecureStore.getItemAsync('business_id');
              if (single) id = Number(single);
            }
            if (alive && id) setBizId(id);
          } catch {}
        }
        try {
          const raw = await SecureStore.getItemAsync('merchant_login');
          if (raw) {
            const parsed = JSON.parse(raw);
            const opt = parsed?.delivery_option || parsed?.user?.delivery_option || parsed?.user?.deliveryOption || null;
            const oType = parsed?.owner_type || parsed?.user?.owner_type || parsed?.user?.ownerType || null;

            if (opt && alive && !deliveryOption) setDeliveryOption(String(opt).toUpperCase());
            if (oType && alive && !ownerType) setOwnerType(String(oType));
          }
        } catch {}
      })();
      return () => {
        alive = false;
      };
    }, [bizId, deliveryOption, ownerType])
  );

  const buildUrl = useCallback(() => {
    const base = (orderEndpoint ?? ENV_ORDER_ENDPOINT) || '';
    return buildOrdersUrl(base, bizId, { appendOwnerType, ownerType });
  }, [bizId, orderEndpoint, appendOwnerType, ownerType]);

  const buildScheduledApiUrl = useCallback(() => {
    const base = ENV_SCHEDULED_ORDER_ENDPOINT || '';
    return buildScheduledUrl(base, bizId);
  }, [bizId]);

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

        const token = await SecureStore.getItemAsync('auth_token');
        const headers = { Accept: 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;

        const res = await fetch(url, { headers, signal: controller.signal });
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

  const fetchScheduledOrders = useCallback(
    async (opts = { silent: false }) => {
      if (!bizId) {
        setScheduledError('Missing businessId for scheduled orders');
        return;
      }
      const url = buildScheduledApiUrl();
      if (!url) {
        setScheduledError('Invalid SCHEDULED_ORDER_ENDPOINT or businessId');
        return;
      }
      if (!opts.silent) setScheduledLoading(true);
      setScheduledError(null);
      try {
        const token = await SecureStore.getItemAsync('auth_token');
        const headers = { Accept: 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;

        const res = await fetch(url, { headers });
        if (!res.ok) {
          const json = await parseJSON(res);
          const msg = (json && (json.message || json.error)) || `HTTP ${res.status}`;
          throw new Error(msg);
        }
        const json = await parseJSON(res);
        const list = normalizeScheduledForBiz(json, bizId);
        setScheduledOrders(list);
      } catch (e) {
        setScheduledError(String(e?.message || e) || 'Failed to load scheduled orders');
      } finally {
        if (!opts.silent) setScheduledLoading(false);
      }
    },
    [bizId, buildScheduledApiUrl]
  );

  // Initial fetch
  useEffect(() => {
    if (ordersProp && ordersProp.length) setOrders(ordersProp);
    else fetchOrders();
  }, [ordersProp, fetchOrders]);

  // Prefetch upcoming so count shows quickly
  useEffect(() => {
    if (bizId) fetchScheduledOrders({ silent: true });
  }, [bizId, fetchScheduledOrders]);

  // If user switches to Upcoming and nothing yet, refetch
  useEffect(() => {
    if (activeChip === 'UPCOMING' && scheduledOrders.length === 0 && bizId) fetchScheduledOrders();
  }, [activeChip, scheduledOrders.length, bizId, fetchScheduledOrders]);

  // ✅ IMPORTANT: auto-normalize status patches so ON ROAD becomes OUT_FOR_DELIVERY immediately
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('order-updated', ({ id, patch }) => {
      const fixedPatch = {
        ...patch,
        ...(patch?.status ? { status: normalizeStatusKey(patch.status) } : null),
      };
      setOrders((prev) => prev.map((o) => (String(o.id) === String(id) ? { ...o, ...fixedPatch } : o)));
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('order-placed', (payload) => {
      try {
        const o = payload?.order;
        if (!o) return;
        const createdISO =
          o.created_at || o.createdAt || o.placed_at || o.order_time || new Date().toISOString();

        let liveNoteTarget = '';
        if (Array.isArray(o.items)) {
          const withNote = o.items.find((it) =>
            (
              it?.note_for_restaurant ||
              it?.note ||
              it?.special_request ||
              it?.instructions ||
              it?.customization ||
              it?.item_note
            )?.trim?.()
          );
          if (withNote) liveNoteTarget = withNote.item_name || withNote.name || '';
        }

        const itemsArr = Array.isArray(o.items) ? o.items : [];
        const snap = getTotalsSnapshot(o);
        const displayTotal = computeDisplayTotal({ items: itemsArr, totals: snap });

        const normalized = {
          id: String(o.order_id || o.id),
          type: o.fulfillment_type === 'Delivery' ? 'Delivery' : 'Pickup',
          created_at: createdISO,
          time: showAsGiven(createdISO),
          items: (itemsArr || [])
            .map((it) => `${it.item_name ?? 'Item'} ×${Number(it.quantity ?? 1)}`)
            .join(', '),
          total: displayTotal,
          status: normalizeStatusKey(o.status || 'PENDING'),
          payment_method: o.payment_method || 'COD',
          business_name:
            (itemsArr && itemsArr[0] && itemsArr[0].business_name) ||
            o.business_name ||
            o.business?.business_name ||
            'Mart',
          customer_id: o.user?.user_id ?? null,
          customer_name: o.user?.name || '',
          customer_email: o.user?.email || '',
          customer_phone: o.user?.phone || '',
          raw_items: itemsArr,
          delivery_address: pickAddress(o) || '',
          note_for_restaurant: o.note_for_restaurant || '',
          note_target: liveNoteTarget,
          priority: Number(o.priority ?? 0),
          discount_amount: Number(snap.discount_amount ?? 0),
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
      if (activeChip === 'UPCOMING') await fetchScheduledOrders({ silent: true });
      else await fetchOrders({ silent: true });
    } finally {
      setRefreshing(false);
    }
  }, [fetchOrders, fetchScheduledOrders, activeChip]);

  const openOrder = useCallback(
    (o) => {
      Keyboard.dismiss();
      try {
        const state = navigation.getState?.();
        const routeExists = !!state?.routeNames?.includes?.(detailsRoute);
        if (!routeExists) {
          Alert.alert('Order screen not found', `No screen named "${detailsRoute}". Please register it in your navigator.`);
          return;
        }
      } catch {}
      navigation.navigate(detailsRoute, {
        orderId: o.id,
        businessId: bizId,
        order: o,
        ownerType,
        delivery_option: deliveryOption,
        isScheduled: normalizeStatusKey(o.status) === 'SCHEDULED',
      });
    },
    [navigation, bizId, detailsRoute, ownerType, deliveryOption]
  );

  /* -------- date filter (All / Today / Yesterday / calendar) -------- */
  const dateFilteredOrders = useMemo(() => {
    if (!activeDateKey) return orders;
    return orders.filter((o) => {
      const key = dateKeyFromTs(o.created_at || o.time || '');
      return key === activeDateKey;
    });
  }, [orders, activeDateKey]);

  // ✅ counts use normalized status so ON ROAD counts under OUT_FOR_DELIVERY
  const statusCounts = useMemo(() => {
    return dateFilteredOrders.reduce((acc, o) => {
      const k = normalizeStatusKey(o.status);
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});
  }, [dateFilteredOrders]);

  const upcomingCount = scheduledOrders.length;
  const totalCount = dateFilteredOrders.length;

  const filtered = useMemo(() => {
    const source = activeChip === 'UPCOMING' ? scheduledOrders : dateFilteredOrders;
    let base = source;

    if (activeChip !== 'ALL' && activeChip !== 'UPCOMING') {
      const statusKey = activeChip;
      base = base.filter((o) => normalizeStatusKey(o.status) === statusKey);
    }

    const q = activeChip === 'UPCOMING' ? '' : query.trim().toLowerCase();
    if (q) {
      base = base.filter((o) => {
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
          o.delivery_address,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      });
    }

    return base;
  }, [dateFilteredOrders, scheduledOrders, query, activeChip]);

  const renderItem = useCallback(
    ({ item }) => <OrderItem isTablet={isTablet} money={money} item={item} onPress={openOrder} />,
    [isTablet, money, openOrder]
  );

  const content = useMemo(() => {
    const isUpcoming = activeChip === 'UPCOMING';
    const effectiveOrders = isUpcoming ? scheduledOrders : dateFilteredOrders;
    const isLoading = isUpcoming ? scheduledLoading : loading;
    const err = isUpcoming ? scheduledError : error;

    if (isLoading && effectiveOrders.length === 0) {
      return (
        <View style={{ paddingVertical: 24, alignItems: 'center' }}>
          <ActivityIndicator />
          <Text style={{ marginTop: 8, color: '#6b7280' }}>Loading orders…</Text>
        </View>
      );
    }
    if (err && effectiveOrders.length === 0) {
      return (
        <View style={{ paddingVertical: 24, alignItems: 'center' }}>
          <Ionicons name="alert-circle-outline" size={24} color="#b91c1c" />
          <Text style={{ color: '#b91c1c', fontWeight: '700', marginTop: 6 }}>Failed to load</Text>
          <Text style={{ color: '#6b7280', marginTop: 4, textAlign: 'center' }}>{err}</Text>
        </View>
      );
    }
    if (!isLoading && filtered.length === 0) {
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
  }, [
    activeChip,
    dateFilteredOrders,
    scheduledOrders,
    filtered,
    kbHeight,
    refreshing,
    onRefresh,
    renderItem,
    loading,
    error,
    scheduledLoading,
    scheduledError,
  ]);

  const currentDateLabel = useMemo(() => {
    if (!activeDateKey) return 'All dates';
    return labelForDateKey(activeDateKey, todayKey, yesterdayKey);
  }, [activeDateKey, todayKey, yesterdayKey]);

  const applyCalendarDate = useCallback(() => {
    const key = dateKeyFromDateObj(tempCalendarDate);
    setActiveDateKey(key);
    setShowCalendar(false);
    setShowDateDropdown(false);
  }, [tempCalendarDate]);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} pointerEvents="box-none">
      <View style={{ flex: 1, paddingHorizontal: 16 }} pointerEvents="box-none">
        {/* Status Tabs */}
        <View style={{ marginTop: 12, marginBottom: 8 }} pointerEvents="box-none">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ alignItems: 'center', paddingVertical: 8, gap: 8 }}
          >
            {/* All chip */}
            <TouchableOpacity
              onPress={() => setActiveChip('ALL')}
              style={[styles.statusChip, activeChip === 'ALL' && styles.statusChipActive]}
              activeOpacity={0.7}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Text style={[styles.statusChipText, activeChip === 'ALL' && styles.statusChipTextActive]}>All</Text>
              <View style={[styles.badge, activeChip === 'ALL' && styles.badgeActive]}>
                <Text style={[styles.badgeText, activeChip === 'ALL' && styles.badgeTextActive]}>{totalCount}</Text>
              </View>
            </TouchableOpacity>

            {/* Upcoming chip */}
            <TouchableOpacity
              onPress={() => setActiveChip('UPCOMING')}
              style={[styles.statusChip, activeChip === 'UPCOMING' && styles.statusChipActive]}
              activeOpacity={0.7}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Text style={[styles.statusChipText, activeChip === 'UPCOMING' && styles.statusChipTextActive]}>Upcoming</Text>
              <View style={[styles.badge, activeChip === 'UPCOMING' && styles.badgeActive]}>
                <Text style={[styles.badgeText, activeChip === 'UPCOMING' && styles.badgeTextActive]}>{upcomingCount}</Text>
              </View>
            </TouchableOpacity>

            {/* Status chips */}
            {STATUS_LABELS.map((s) => {
              const active = activeChip === s.key;
              const count = statusCounts[s.key] || 0;
              return (
                <TouchableOpacity
                  key={s.key}
                  onPress={() => setActiveChip(s.key)}
                  style={[styles.statusChip, active && styles.statusChipActive]}
                  activeOpacity={0.7}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text style={[styles.statusChipText, active && styles.statusChipTextActive]}>{s.label}</Text>
                  {count > 0 ? (
                    <View style={[styles.badge, active && styles.badgeActive]}>
                      <Text style={[styles.badgeText, active && styles.badgeTextActive]}>{count}</Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Search + Date dropdown (hidden for Upcoming) */}
        {activeChip !== 'UPCOMING' && (
          <>
            <View style={styles.searchRow} pointerEvents="auto">
              <View style={[styles.searchWrap, { flex: 1 }]}>
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
            </View>

            {/* Date dropdown */}
            <View style={styles.dateRow}>
              <Text style={styles.dateRowLabel}>Filter by date</Text>
              <TouchableOpacity
                style={styles.dateDropdown}
                onPress={() => {
                  setShowDateDropdown(true);
                  setShowCalendar(false);
                  setTempCalendarDate(new Date());
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.dateDropdownText} numberOfLines={1}>{currentDateLabel}</Text>
                <Ionicons name="chevron-down" size={16} color="#0f172a" />
              </TouchableOpacity>
            </View>
          </>
        )}

        {content}

        {/* Date dropdown modal */}
        <Modal
          visible={showDateDropdown}
          transparent
          animationType="fade"
          onRequestClose={() => {
            setShowCalendar(false);
            setShowDateDropdown(false);
          }}
        >
          <View style={styles.modalOverlay}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => {
                setShowCalendar(false);
                setShowDateDropdown(false);
              }}
            />

            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Select date</Text>

              <ScrollView style={{ maxHeight: 260 }}>
                <TouchableOpacity
                  style={[styles.modalOption, activeDateKey === '' && styles.modalOptionActive]}
                  onPress={() => {
                    setActiveDateKey('');
                    setShowCalendar(false);
                    setShowDateDropdown(false);
                  }}
                >
                  <Text style={[styles.modalOptionText, activeDateKey === '' && styles.modalOptionTextActive]}>All dates</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalOption, activeDateKey === todayKey && styles.modalOptionActive]}
                  onPress={() => {
                    setActiveDateKey(todayKey);
                    setShowCalendar(false);
                    setShowDateDropdown(false);
                  }}
                >
                  <Text style={[styles.modalOptionText, activeDateKey === todayKey && styles.modalOptionTextActive]}>Today</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalOption, activeDateKey === yesterdayKey && styles.modalOptionActive]}
                  onPress={() => {
                    setActiveDateKey(yesterdayKey);
                    setShowCalendar(false);
                    setShowDateDropdown(false);
                  }}
                >
                  <Text style={[styles.modalOptionText, activeDateKey === yesterdayKey && styles.modalOptionTextActive]}>Yesterday</Text>
                </TouchableOpacity>

                <View style={{ marginTop: 8 }}>
                  <TouchableOpacity style={styles.calendarBtn} onPress={() => setShowCalendar(true)} activeOpacity={0.8}>
                    <Ionicons name="calendar-outline" size={16} color="#0f172a" />
                    <Text style={styles.calendarBtnText}>Pick from calendar</Text>
                  </TouchableOpacity>
                </View>

                {showCalendar && (
                  <View style={{ marginTop: 8 }}>
                    <DateTimePicker
                      value={tempCalendarDate}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
                      onChange={(event, selectedDate) => {
                        if (Platform.OS === 'android') {
                          if (event.type === 'set' && selectedDate) {
                            const key = dateKeyFromDateObj(selectedDate);
                            setActiveDateKey(key);
                          }
                          setShowCalendar(false);
                          setShowDateDropdown(false);
                        } else {
                          if (selectedDate) setTempCalendarDate(selectedDate);
                        }
                      }}
                    />

                    {Platform.OS === 'ios' && (
                      <View style={styles.iosCalendarActions}>
                        <TouchableOpacity onPress={() => setShowCalendar(false)} style={[styles.iosCalendarBtn, { backgroundColor: '#e5e7eb' }]}>
                          <Text style={[styles.iosCalendarBtnText, { color: '#111827' }]}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={applyCalendarDate} style={[styles.iosCalendarBtn, { backgroundColor: '#16a34a' }]}>
                          <Text style={[styles.iosCalendarBtnText, { color: '#fff' }]}>Apply</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* FAB */}
        <TouchableOpacity
          style={styles.fab}
          onPress={() =>
            navigation.navigate('NearbyOrdersScreen', {
              businessId: bizId,
              ownerType,
              orderEndpoint: orderEndpoint ?? ENV_ORDER_ENDPOINT,
              detailsRoute,
              thresholdKm: 5,
              orders:
                activeChip === 'UPCOMING'
                  ? scheduledOrders.filter((o) => o.type === 'Delivery')
                  : dateFilteredOrders.filter((o) => o.type === 'Delivery'),
            })
          }
          activeOpacity={0.9}
        >
          <Ionicons name="albums-outline" size={isTablet ? 24 : 22} color="#fff" />
          <Text style={styles.fabLabel}>Grouped Orders</Text>
        </TouchableOpacity>
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
    borderColor: '#16a34a',
  },
  statusChipText: {
    color: '#0f172a',
    fontWeight: '700',
    fontSize: 14,
  },
  statusChipTextActive: {
    color: '#16a34a',
  },

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
  badgeText: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '700',
  },
  badgeTextActive: {
    color: 'white',
  },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  searchWrap: {
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

  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    justifyContent: 'space-between',
  },
  dateRowLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  dateDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    maxWidth: '60%',
  },
  dateDropdownText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
    marginRight: 4,
  },

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
  scheduledTime: {
    marginTop: 2,
    color: '#0f172a',
    fontWeight: '700',
  },
  row1: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  row1Left: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  orderId: { fontWeight: '900', color: '#0f172a' },
  orderTime: { color: '#64748b', fontWeight: '600' },
  orderTotal: { fontWeight: '900', color: '#0f172a' },

  row2: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: '70%',
  },
  pillText: { fontWeight: '800', fontSize: 12 },

  payWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 'auto',
  },
  payText: { color: '#64748b', fontWeight: '700' },

  orderItems: { marginTop: 8, color: '#334155', fontWeight: '600' },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  customerText: {
    color: '#64748b',
    fontWeight: '600',
    flexShrink: 1,
  },

  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#ecfeff',
    borderWidth: 1,
    borderColor: '#99f6e4',
  },
  noteText: { flex: 1, color: '#115e59', fontWeight: '600' },
  noteMeta: { marginTop: 4, color: '#0f766e', fontWeight: '700' },

  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: '#16a34a',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  fabLabel: {
    color: '#fff',
    fontWeight: '700',
    marginLeft: 8,
    fontSize: 14,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '80%',
    maxWidth: 360,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  modalTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 10,
  },
  modalOption: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 8,
  },
  modalOptionActive: {
    backgroundColor: '#ecfdf5',
  },
  modalOptionText: {
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '600',
  },
  modalOptionTextActive: {
    color: '#16a34a',
  },

  calendarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  calendarBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },

  iosCalendarActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
    gap: 10,
  },
  iosCalendarBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  iosCalendarBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
