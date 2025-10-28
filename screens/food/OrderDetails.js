// screens/food/OrderDetails.js
// Sequence rail + two-button actions (Accept/Decline when pending; Next when later)
// Now with real nearby drivers fetched from ENV_NEARBY_DRIVERS when READY + platform delivery
// Also fetches per-driver ratings from DIVER_RATING_ENDPOINT and displays: driver name, vehicle type, and rating.
// UPDATE: Hydrate from grouped orders endpoint when launched from Notifications.

import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Alert, Modal,
  TextInput, ActivityIndicator,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { DeviceEventEmitter } from 'react-native';
import {
  UPDATE_ORDER_STATUS_ENDPOINT as ENV_UPDATE_ORDER,
  NEARBY_DRIVERS_ENDPOINT as ENV_NEARBY_DRIVERS,
  DIVER_RATING_ENDPOINT as ENV_DRIVER_RATING,
} from '@env';

/* ---------------- Money + utils ---------------- */
const money = (n, c = 'Nu') => `${c} ${Number(n ?? 0).toFixed(2)}`;
const norm = (s = '') => String(s).toLowerCase().trim();
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const findStepIndex = (status, seq) => seq.indexOf((status || '').toUpperCase());
const fmtStamp = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/* ---------------- Status config (BACKEND KEYS, FRIENDLY LABELS) ---------------- */
const STATUS_META = {
  PENDING:           { label: 'Pending',   color: '#0ea5e9', bg: '#e0f2fe', border: '#bae6fd', icon: 'time-outline' },
  CONFIRMED:         { label: 'Accepted',  color: '#16a34a', bg: '#ecfdf5', border: '#bbf7d0', icon: 'checkmark-circle-outline' },
  READY:             { label: 'Ready',     color: '#2563eb', bg: '#dbeafe', border: '#bfdbfe', icon: 'cube-outline' },
  OUT_FOR_DELIVERY:  { label: 'Out for delivery', color: '#f59e0b', bg: '#fef3c7', border: '#fde68a', icon: 'bicycle-outline' },
  COMPLETED:         { label: 'Delivered', color: '#047857', bg: '#ecfdf5', border: '#bbf7d0', icon: 'checkmark-done-outline' },
  DECLINED:          { label: 'Declined',  color: '#b91c1c', bg: '#fee2e2', border: '#fecaca', icon: 'close-circle-outline' },
};
const TERMINAL_NEGATIVE = new Set(['DECLINED']);
const TERMINAL_SUCCESS  = new Set(['COMPLETED']);

/* ---------------- Order code + endpoints ---------------- */
const normalizeOrderCode = (raw) => {
  if (!raw) return null;
  const s = String(raw).trim();
  const digits = (s.match(/\d+/) || [])[0];
  if (!digits) return s.toUpperCase();
  return `ORD-${digits}`;
};
const sameOrder = (a, b) => {
  if (!a || !b) return false;
  const A = normalizeOrderCode(a);
  const B = normalizeOrderCode(b);
  if (!A || !B) return false;
  return A.replace(/\D/g, '') === B.replace(/\D/g, '');
};

const buildUpdateUrl = (base, orderCode) => {
  const clean = String(base || '').trim().replace(/\/+$/, '');
  if (!clean || !orderCode) return null;

  let url = clean
    .replace(/\{\s*order_id\s*\}/gi, orderCode)
    .replace(/\{\s*order\s*\}/gi, orderCode)
    .replace(/:order_id/gi, orderCode)
    .replace(/:order/gi, orderCode);

  if (url !== clean) {
    if (!/\/status(?:\?|$)/i.test(url)) url = `${url}/status`;
    return url;
  }
  return `${clean}/${orderCode}/status`;
};

/* ---------------- API calls ---------------- */
async function updateStatusApi({ endpoint, orderCode, payload, token }) {
  const url = buildUpdateUrl(endpoint, orderCode);
  if (!url) throw new Error('Invalid update endpoint');

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }
  if (!res.ok) throw new Error(json?.message || json?.error || `HTTP ${res.status}`);
  return json;
}

/* ---------------- Nearby drivers ---------------- */
const expandNearbyUrl = (baseUrl, { cityId, lat, lng, radiusKm, limit }) => {
  const clean = String(baseUrl || '').trim();
  if (!clean) return null;

  let u = clean
    .replace(/\{city\}/gi, encodeURIComponent(cityId ?? 'thimphu'))
    .replace(/\{cityId\}/gi, encodeURIComponent(cityId ?? 'thimphu'))
    .replace(/\{lat\}/gi, encodeURIComponent(lat ?? '27.4775469'))
    .replace(/\{lng\}/gi, encodeURIComponent(lng ?? '89.6387255'))
    .replace(/\{radius\}/gi, encodeURIComponent(radiusKm ?? '5'))
    .replace(/\{radiusKm\}/gi, encodeURIComponent(radiusKm ?? '5'))
    .replace(/\{limit\}/gi, encodeURIComponent(limit ?? '20'));

  try {
    const url = new URL(u);
    if (!url.searchParams.get('cityId') && cityId) url.searchParams.set('cityId', cityId);
    if (!url.searchParams.get('lat') && lat != null) url.searchParams.set('lat', String(lat));
    if (!url.searchParams.get('lng') && lng != null) url.searchParams.set('lng', String(lng));
    if (!url.searchParams.get('radiusKm') && radiusKm != null) url.searchParams.set('radiusKm', String(radiusKm));
    if (!url.searchParams.get('limit') && limit != null) url.searchParams.set('limit', String(limit));
    return url.toString();
  } catch {
    return u;
  }
};

/* ---------------- Driver rating endpoint helpers ---------------- */
const buildDriverRatingUrl = (baseUrl, driverId) => {
  if (!baseUrl || !driverId) return null;
  let u = String(baseUrl).trim();
  u = u
    .replace(/\{driver_id\}/gi, encodeURIComponent(driverId))
    .replace(/:driver_id/gi, encodeURIComponent(driverId));
  try {
    const url = new URL(u);
    if (!url.searchParams.get('driver_id')) url.searchParams.set('driver_id', String(driverId));
    if (!url.searchParams.get('limit')) url.searchParams.set('limit', '20');
    if (!url.searchParams.get('offset')) url.searchParams.set('offset', '0');
    return url.toString();
  } catch {
    return u;
  }
};

const computeAverageRating = (payload) => {
  let arr = [];
  if (!payload) return null;
  if (Array.isArray(payload)) arr = payload;
  else if (Array.isArray(payload?.data)) arr = payload.data;
  else if (Array.isArray(payload?.ratings)) arr = payload.ratings;
  else if (Array.isArray(payload?.items)) arr = payload.items;

  const vals = arr
    .map((r) => r?.rating ?? r?.score ?? r?.stars ?? r?.value ?? null)
    .filter((v) => v != null)
    .map(Number)
    .filter((n) => !Number.isNaN(n));

  if (!vals.length) return null;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.round(avg * 10) / 10;
};

/* ---------------- Tiny UI atoms ---------------- */
const Chip = ({ label, color, bg, border, icon }) => (
  <View style={[styles.pill, { backgroundColor: bg, borderColor: border }]}>
    <Ionicons name={icon} size={14} color={color} />
    <Text style={[styles.pillText, { color }]} numberOfLines={1}>{label}</Text>
  </View>
);

const Step = ({ label, ringColor, fill, icon, time, onPress, disabled, dimmed }) => {
  const border = ringColor || '#cbd5e1';
  const bg = fill ? border : '#fff';
  const iconColor = fill ? '#fff' : border;
  return (
    <Pressable style={styles.stepWrap} onPress={onPress} disabled={disabled}>
      <View style={[styles.stepDot, { borderColor: border, backgroundColor: bg }]}>
        <Ionicons name={icon} size={14} color={iconColor} />
      </View>
      <Text style={[styles.stepLabel, { color: dimmed ? '#94a3b8' : '#334155' }]} numberOfLines={1}>
        {label}
      </Text>
      {time ? <Text style={styles.stepTime}>{time}</Text> : null}
    </Pressable>
  );
};

const Row = ({ icon, text }) => (
  <View style={styles.row}>
    <Ionicons name={icon} size={16} color="#64748b" />
    <Text style={styles.rowText} numberOfLines={2}>{text}</Text>
  </View>
);

const RowTitle = ({ title }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
    <Text style={styles.blockTitle}>{title}</Text>
  </View>
);

/* ======================= Screen ======================= */
export default function OrderDetails() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();

  const params = route?.params ?? {};
  const orderProp = params.order ?? null;
  const routeOrderId = params.orderId ?? null; // may be "ORD-..." or just digits
  const ordersGroupedUrl = params.ordersGroupedUrl ?? null; // 👈 from Notifications
  const businessId = params.businessId ?? null;

  const [order, setOrder] = useState(orderProp || {});
  const [updating, setUpdating] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState('');

  // Detect owner type robustly (route param takes priority)
  const ownerTypeRaw =
    (params.ownerType ?? params.ownertype ?? params.owner_type ??
      order?.ownerType ?? order?.owner_type ?? '').toString().toLowerCase();
  const isMartOwner = ownerTypeRaw === 'mart'; // Food = default when false

  /* ---------- Fulfillment / delivery mode detection ---------- */
  const isSelfFulfillment = useMemo(() => {
    const candidates = [
      params.fulfillment_type, params.fulfillmentType,
      order?.fulfillment_type, order?.fulfillmentType,
      order?.delivery_option, order?.delivery_type, order?.type,
    ].map((v) => norm(v ?? ''));
    return candidates.some((s) =>
      s === 'self' ||
      s === 'self-delivery' || s === 'self_delivery' || s === 'selfdelivery' ||
      s === 'self-pickup'   || s === 'self_pickup'   || s === 'selfpickup' ||
      s === 'pickup'
    );
  }, [params.fulfillment_type, params.fulfillmentType, order?.fulfillment_type, order?.fulfillmentType, order?.delivery_option, order?.delivery_type, order?.type]);

  const deliveryMode = useMemo(() => {
    if (isSelfFulfillment) return 'self';
    const s = norm(order?.delivery_option ?? order?.delivery_type ?? order?.type ?? '');
    if (s.includes('grab') || s.includes('platform')) return 'grab';
    if (s.includes('delivery')) return 'grab';
    return s || '';
  }, [order, isSelfFulfillment]);

  const isPlatformDelivery = deliveryMode === 'grab';

  // 🔁 Dynamic sequence:
  const STATUS_SEQUENCE = useMemo(() => {
    if (isSelfFulfillment) {
      return ['PENDING', 'CONFIRMED', 'READY'];
    }
    if (isMartOwner) {
      return ['PENDING', 'CONFIRMED', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED'];
    }
    return ['PENDING', 'CONFIRMED','READY', 'OUT_FOR_DELIVERY', 'COMPLETED'];
  }, [isMartOwner, isSelfFulfillment]);

  const nextFor = useCallback(
    (curr) => {
      const s = (curr || '').toUpperCase();
      if (TERMINAL_NEGATIVE.has(s) || TERMINAL_SUCCESS.has(s)) return null;

      if (!isSelfFulfillment && isMartOwner && s === 'CONFIRMED') return 'READY';

      if (isSelfFulfillment) {
        if (s === 'PENDING') return 'CONFIRMED';
        if (s === 'CONFIRMED') return 'READY';
        return null;
      }

      if (s === 'READY' && isPlatformDelivery) return null;

      const idx = STATUS_SEQUENCE.indexOf(s);
      if (idx === -1) {
        if (s === 'PENDING') return 'CONFIRMED';
        return STATUS_SEQUENCE[0] || null;
      }
      return STATUS_SEQUENCE[idx + 1] || null;
    },
    [STATUS_SEQUENCE, isMartOwner, isPlatformDelivery, isSelfFulfillment]
  );

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('order-updated', ({ id, patch }) => {
      if (String(id) === String(routeOrderId)) setOrder((prev) => ({ ...prev, ...patch }));
    });
    return () => sub?.remove?.();
  }, [routeOrderId]);

  const status = (order?.status || 'PENDING').toUpperCase();
  const meta = STATUS_META[status] || STATUS_META.PENDING;

  const isTerminalNegative = TERMINAL_NEGATIVE.has(status);
  const isTerminalSuccess  = TERMINAL_SUCCESS.has(status);

  const stepIndex = findStepIndex(status, STATUS_SEQUENCE);
  const lastIndex = STATUS_SEQUENCE.length - 1;
  const progressIndex = clamp(stepIndex === -1 ? 0 : stepIndex, 0, lastIndex);

  const progressPct = isTerminalNegative
    ? 0
    : isTerminalSuccess
    ? 100
    : ((progressIndex + 1) / STATUS_SEQUENCE.length) * 100;

  const stamps = useMemo(() => {
    const s = order?.status_timestamps || {};
    const out = {};
    STATUS_SEQUENCE.forEach((k) => { out[k] = fmtStamp(s[k]); });
    return out;
  }, [order?.status_timestamps, STATUS_SEQUENCE]);

  // 🔹 Restaurant note (supports multiple common field names)
  const restaurantNote = useMemo(() => {
    const n =
      order?.note_for_restaurant ??
      order?.restaurant_note ??
      order?.note_for_store ??
      order?.note ??
      '';
    return String(n || '').trim();
  }, [order]);

  const DEFAULT_REASON = {
    CONFIRMED: 'Order accepted by merchant',
    READY: 'Order is ready',
    OUT_FOR_DELIVERY: 'Order handed over for delivery',
    COMPLETED: 'Order delivered',
  };

  /* ---------- HYDRATE FROM GROUPED ENDPOINT (fix for Notifications) ---------- */
  const hydrateFromGrouped = useCallback(async () => {
    try {
      if (!ordersGroupedUrl || !routeOrderId) return;

      // Don’t re-fetch if we already have items/name/payment filled
      const hasCore =
        (order?.raw_items && order.raw_items.length) ||
        order?.payment_method ||
        order?.customer_name ||
        order?.delivery_address;

      if (hasCore) return;

      const token = await SecureStore.getItemAsync('auth_token');
      const res = await fetch(ordersGroupedUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const text = await res.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch {}
      if (!res.ok) throw new Error(json?.message || json?.error || `HTTP ${res.status}`);

      // Accept multiple shapes:
      // 1) { success, data:[ { user, orders:[...] }, ... ] }
      // 2) { data:[ ...flatOrders ] }
      // 3) [ ...flatOrders ]
      const groups = Array.isArray(json?.data) ? json.data
                   : Array.isArray(json) ? json
                   : [];

      // Flatten to orders[]
      let allOrders = [];
      for (const g of groups) {
        if (Array.isArray(g?.orders)) allOrders = allOrders.concat(g.orders);
        else if (g?.id || g?.order_id || g?.order_code) allOrders.push(g);
      }

      // Find by id/code
      const match = allOrders.find((o) =>
        sameOrder(o?.id ?? o?.order_id ?? o?.order_code, routeOrderId)
      );
      if (!match) return;

      // Normalize minimal fields we render
      const normalized = {
        ...match,
        id: String(match?.id ?? match?.order_id ?? match?.order_code ?? routeOrderId),
        order_code: normalizeOrderCode(match?.order_code ?? match?.id ?? routeOrderId),
        customer_name: match?.customer_name ?? match?.user_name ?? match?.user?.user_name ?? '',
        // phone intentionally omitted per requirement
        payment_method: match?.payment_method ?? match?.payment ?? '',
        delivery_address: match?.delivery_address ?? match?.address ?? '',
        raw_items: Array.isArray(match?.raw_items) ? match.raw_items
                  : Array.isArray(match?.items) ? match.items
                  : [],
        total: match?.total ?? match?.total_amount ?? 0,
        status: (match?.status ?? order?.status ?? 'PENDING').toUpperCase(),
        type: match?.type ?? match?.delivery_option ?? match?.fulfillment_type ?? order?.type ?? '',
        status_timestamps: match?.status_timestamps ?? order?.status_timestamps ?? {},
      };

      setOrder((prev) => ({ ...prev, ...normalized }));
    } catch (e) {
      // silent fail; UI will still show minimal card
      console.warn('[OrderDetails] hydrate error:', e?.message);
    }
  }, [ordersGroupedUrl, routeOrderId, order?.raw_items, order?.payment_method, order?.customer_name, order?.delivery_address, order?.status, order?.type, order?.status_timestamps]);

  useEffect(() => { hydrateFromGrouped(); }, [hydrateFromGrouped]);

  /* ---------- update handlers ---------- */
  const doUpdate = useCallback(async (newStatus, opts = {}) => {
    try {
      let payload;

      if (newStatus === 'DECLINED') {
        const r = String(opts?.reason ?? '').trim();
        if (r.length < 3) {
          setDeclineOpen(true);
          Alert.alert('Reason required', 'Please provide at least 3 characters explaining why the order is declined.');
          return;
        }
        payload = { status: 'DECLINED', reason: `Merchant declined: ${r}` };
      } else {
        payload = { status: newStatus };
        if (DEFAULT_REASON[newStatus]) payload.reason = DEFAULT_REASON[newStatus];
      }

      setUpdating(true);
      const token = await SecureStore.getItemAsync('auth_token');

      const raw = order?.order_code || order?.id || routeOrderId;
      const orderCode = normalizeOrderCode(raw);

      await updateStatusApi({
        endpoint: ENV_UPDATE_ORDER || '',
        orderCode,
        payload,
        token,
      });

      const patch = { status: newStatus };
      setOrder((prev) => ({ ...prev, ...patch }));
      DeviceEventEmitter.emit('order-updated', { id: routeOrderId || order?.id, patch });
    } catch (e) {
      Alert.alert('Update failed', String(e?.message || e));
    } finally {
      setUpdating(false);
    }
  }, [routeOrderId, order?.id, order?.order_code]);

  const next = nextFor(status);
  const primaryLabel = status === 'PENDING'
    ? 'Accept'
    : next
    ? STATUS_META[next]?.label || 'Next'
    : null;

  const onPrimaryAction = useCallback(() => {
    if (!next || updating) return;
    doUpdate(next);
  }, [next, updating, doUpdate]);

  const onDecline = () => setDeclineOpen(true);

  const confirmDecline = () => {
    const r = String(declineReason).trim();
    if (r.length < 3) {
      Alert.alert('Reason required', 'Please type a brief reason (min 3 characters).');
      return;
    }
    setDeclineOpen(false);
    doUpdate('DECLINED', { reason: r });
    setDeclineReason('');
  };

  const canDecline = String(declineReason).trim().length >= 3;

  const headerTopPad = Math.max(insets.top, 8) + 18;

  /* ─────────────── Nearby drivers (REAL API) + ratings ─────────────── */
  const [drivers, setDrivers] = useState([]);
  const [loadingDrivers, setLoadingDrivers] = useState(false);
  const [driversError, setDriversError] = useState('');
  const [offerPendingDriver, setOfferPendingDriver] = useState(null);
  const [waitingDriverAccept, setWaitingDriverAccept] = useState(false);
  const acceptTimerRef = useRef(null);

  const refCoords = useMemo(() => {
    const lat =
      order?.delivery_lat ??
      order?.lat ??
      order?.destination?.lat ??
      order?.geo?.lat ??
      27.4775469;
    const lng =
      order?.delivery_lng ??
      order?.lng ??
      order?.destination?.lng ??
      order?.geo?.lng ??
      89.6387255;
    const cityId =
      order?.city_id ??
      order?.city ??
      'thimphu';
    return { lat: Number(lat), lng: Number(lng), cityId: String(cityId || 'thimphu').toLowerCase() };
  }, [order]);

  const buildNearby = useCallback(() => {
    return expandNearbyUrl(ENV_NEARBY_DRIVERS, {
      cityId: refCoords.cityId,
      lat: refCoords.lat,
      lng: refCoords.lng,
      radiusKm: 5,
      limit: 20,
    });
  }, [refCoords]);

  const fetchDriverRating = useCallback(async (driverId) => {
    try {
      if (!ENV_DRIVER_RATING) return null;
      const url = buildDriverRatingUrl(ENV_DRIVER_RATING, driverId);
      if (!url) return null;

      const resp = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
      const text = await resp.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }
      if (!resp.ok) throw new Error(json?.message || json?.error || `HTTP ${resp.status}`);
      return computeAverageRating(json);
    } catch (e) {
      console.warn('[Driver rating] failed for driver', driverId, e?.message);
      return null;
    }
  }, []);

  const fetchNearbyDrivers = useCallback(async () => {
    if (!(status === 'READY' && isPlatformDelivery)) return;
    const url = buildNearby();
    if (!url) {
      setDriversError('NEARBY_DRIVERS_ENDPOINT not configured');
      return;
    }
    setDriversError('');
    setLoadingDrivers(true);
    try {
      const resp = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
      const text = await resp.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }

      if (!resp.ok) throw new Error(json?.message || json?.error || `HTTP ${resp.status}`);

      let arr = [];
      if (Array.isArray(json?.drivers)) arr = json.drivers;
      else if (Array.isArray(json?.data)) arr = json.data;
      else if (Array.isArray(json)) arr = json;
      else throw new Error('Unexpected driver API response');

      const normalized = arr.map((d, i) => {
        const driverNode = d.driver || {};
        const userNode = d.user || {};
        return {
          id: d.id ?? driverNode.id ?? userNode.id ?? i,
          driver_id: driverNode.id ?? d.driver_id ?? null,
          name: userNode.user_name ?? userNode.name ?? d.name ?? 'Driver',
          vehicle_type: driverNode.vehicle_type ?? d.vehicle_type ?? d.vehicle ?? 'Bike',
          distance_km: d.distance_km ?? d.distance ?? null,
          rating: null,
        };
      });

      const top = normalized.slice(0, 12);
      const ratings = await Promise.all(
        top.map(async (d) => {
          const idForRating = d.driver_id || d.id;
          const avg = idForRating ? await fetchDriverRating(idForRating) : null;
          return avg;
        })
      );

      top.forEach((d, idx) => { d.rating = ratings[idx]; });

      const merged = top.concat(normalized.slice(12));
      setDrivers(merged);
    } catch (e) {
      setDrivers([]);
      setDriversError(String(e?.message || e));
    } finally {
      setLoadingDrivers(false);
    }
  }, [status, isPlatformDelivery, buildNearby, fetchDriverRating]);

  useEffect(() => {
    if (status === 'READY' && isPlatformDelivery) {
      fetchNearbyDrivers();
    } else {
      setDrivers([]);
      setOfferPendingDriver(null);
      setWaitingDriverAccept(false);
    }
  }, [status, isPlatformDelivery, refCoords.cityId, refCoords.lat, refCoords.lng, fetchNearbyDrivers]);

  const offerToDriver = useCallback((driverId) => {
    setOfferPendingDriver(driverId);
    setWaitingDriverAccept(true);

    if (acceptTimerRef.current) clearTimeout(acceptTimerRef.current);
    const ms = 3000 + Math.floor(Math.random() * 3000);
    acceptTimerRef.current = setTimeout(() => {
      setWaitingDriverAccept(false);
      setOfferPendingDriver(null);

      const patch = { status: 'OUT_FOR_DELIVERY', assigned_driver: driverId };
      setOrder((prev) => ({ ...prev, ...patch }));
      DeviceEventEmitter.emit('order-updated', { id: routeOrderId || order?.id, patch });
    }, ms);
  }, [order?.id, routeOrderId]);

  useEffect(() => {
    return () => {
      if (acceptTimerRef.current) clearTimeout(acceptTimerRef.current);
    };
  }, []);

  /* ---------------- UI ---------------- */
  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      {/* Header — centered title */}
      <View style={[styles.headerBar, { paddingTop: Math.max(insets.top, 8) + 18 }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color="#0f172a" />
        </Pressable>
        <Text style={styles.headerTitle}>Order details</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        {/* Card */}
        <View style={styles.card}>
          {/* Top row: id + current status chip */}
          <View style={styles.idRow}>
            <Text style={styles.orderId}>#{order?.id || routeOrderId}</Text>
            <Chip
              label={STATUS_META[status]?.label}
              color={meta.color}
              bg={meta.bg}
              border={meta.border}
              icon={meta.icon}
            />
          </View>

          {/* Progress */}
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
          </View>

          {/* Steps row */}
          <View style={styles.stepsRow}>
            {STATUS_SEQUENCE.map((k, i) => {
              const isActiveStep = k === status;
              const done = isTerminalSuccess ? true : !isTerminalNegative && i <= progressIndex;
              const fill = done;

              let ring = '#cbd5e1';
              if (isTerminalNegative) ring = isActiveStep ? (STATUS_META.DECLINED.color) : '#cbd5e1';
              else if (isTerminalSuccess) ring = '#16a34a';
              else ring = (done || isActiveStep) ? '#16a34a' : '#cbd5e1';

              const dimmed = !isActiveStep && !(done || isTerminalSuccess);
              const icon = STATUS_META[k]?.icon || 'ellipse-outline';

              return (
                <Step
                  key={k}
                  label={STATUS_META[k].label}
                  icon={icon}
                  ringColor={ring}
                  fill={fill}
                  dimmed={dimmed}
                  onPress={() => {}}
                  disabled
                />
              );
            })}
          </View>

          {/* Terminal info (only for Declined) */}
          {isTerminalNegative ? (
            <View style={styles.terminalRow}>
              <Ionicons name="information-circle-outline" size={16} color={STATUS_META.DECLINED.color} />
              <Text style={[styles.terminalText, { color: STATUS_META.DECLINED.color }]}>
                Flow ended: {STATUS_META.DECLINED.label}
              </Text>
            </View>
          ) : null}

          {/* Meta */}
          <View style={{ marginTop: 12, gap: 8 }}>
            <Row icon="person-outline" text={`${order.customer_name || '—'}`} />
            <Row icon="bicycle-outline" text={`Type: ${order.type || order.delivery_option || order.fulfillment_type || '—'}`} />
            <Row icon="card-outline" text={`Payment: ${order.payment_method || '—'}`} />
            <Row icon="navigate-outline" text={order.delivery_address || '—'} />
          </View>

          {/* 🔹 Restaurant note bubble (only if present) */}
          {!!restaurantNote && (
            <View style={styles.noteBox}>
              <Ionicons name="chatbubble-ellipses-outline" size={14} color="#0f766e" />
              <Text style={styles.noteText} numberOfLines={6}>{restaurantNote}</Text>
            </View>
          )}
        </View>

        {/* Update actions */}
        <Text style={styles.sectionTitle}>Update status</Text>
        {isTerminalNegative || isTerminalSuccess ? (
          <Text style={styles.terminalNote}>No further actions.</Text>
        ) : (
          <View style={styles.actionsRow}>
            {status === 'PENDING' ? (
              <>
                <Pressable
                  onPress={() => doUpdate('CONFIRMED')}
                  disabled={updating}
                  style={({ pressed }) => [styles.primaryBtn, { opacity: updating || pressed ? 0.85 : 1 }]}
                >
                  <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                  <Text style={styles.primaryBtnText}>Accept</Text>
                </Pressable>

                <Pressable
                  onPress={onDecline}
                  disabled={updating}
                  style={({ pressed }) => [styles.secondaryBtn, { borderColor: '#ef4444', opacity: updating || pressed ? 0.85 : 1 }]}
                >
                  <Ionicons name="close-circle-outline" size={18} color="#b91c1c" />
                  <Text style={[styles.secondaryBtnText, { color: '#991b1b' }]}>Decline</Text>
                </Pressable>
              </>
            ) : (
              <>
                {(status !== 'READY' || !isPlatformDelivery) && !isSelfFulfillment && primaryLabel ? (
                  <Pressable
                    onPress={onPrimaryAction}
                    disabled={updating}
                    style={({ pressed }) => [styles.primaryBtn, { opacity: updating || pressed ? 0.85 : 1 }]}
                  >
                    <Ionicons name="arrow-forward-circle" size={18} color="#fff" />
                    <Text style={styles.primaryBtnText}>{primaryLabel}</Text>
                  </Pressable>
                ) : (
                  <>
                    {status === 'READY' && isPlatformDelivery && !isSelfFulfillment ? (
                      <Text style={{ color: '#64748b', fontWeight: '600' }}>
                        Assign a driver below to continue…
                      </Text>
                    ) : null}
                    {isSelfFulfillment && status === 'READY' ? (
                      <Text style={{ color: '#64748b', fontWeight: '600' }}>
                        Ready for Self-Pickup.
                      </Text>
                    ) : null}
                  </>
                )}
              </>
            )}
          </View>
        )}

        {/* 🔸 Nearby Driver assignment panel */}
        {status === 'READY' && isPlatformDelivery && !isSelfFulfillment && (
          <View style={styles.block}>
            <RowTitle title="Nearby drivers" />
            <View style={{ marginTop: 8 }} />

            {loadingDrivers ? (
              <View style={{ paddingVertical: 12, alignItems: 'center', gap: 8 }}>
                <ActivityIndicator />
                <Text style={{ color: '#64748b', fontWeight: '600' }}>Loading drivers…</Text>
              </View>
            ) : driversError ? (
              <View style={{ paddingVertical: 12 }}>
                <Text style={{ color: '#b91c1c', fontWeight: '700' }}>{driversError}</Text>
                <View style={{ height: 8 }} />
                <Pressable
                  onPress={fetchNearbyDrivers}
                  style={({ pressed }) => [styles.secondaryBtn, { borderColor: '#CBD5E1', opacity: pressed ? 0.85 : 1, alignSelf: 'flex-start' }]}
                >
                  <Ionicons name="refresh" size={18} color="#334155" />
                  <Text style={[styles.secondaryBtnText, { color: '#334155' }]}>Retry</Text>
                </Pressable>
              </View>
            ) : drivers.length === 0 ? (
              <View style={{ paddingVertical: 12 }}>
                <Text style={{ color: '#64748b', fontWeight: '600' }}>No drivers nearby yet.</Text>
                <View style={{ height: 8 }} />
                <Pressable
                  onPress={fetchNearbyDrivers}
                  style={({ pressed }) => [styles.secondaryBtn, { borderColor: '#CBD5E1', opacity: pressed ? 0.85 : 1, alignSelf: 'flex-start' }]}
                >
                  <Ionicons name="refresh" size={18} color="#334155" />
                  <Text style={[styles.secondaryBtnText, { color: '#334155' }]}>Refresh</Text>
                </Pressable>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                {drivers.map((d) => (
                  <View key={String(d.id)} style={styles.driverRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.driverName} numberOfLines={1}>{d.name}</Text>
                      <Text style={styles.driverMeta} numberOfLines={1}>
                        {d.rating != null ? `★ ${Number(d.rating).toFixed(1)} • ` : '★ — • '}
                        {d.vehicle_type || '—'}
                        {d.distance_km != null ? ` • ${Number(d.distance_km).toFixed(1)} km` : ''}
                      </Text>
                    </View>

                    {waitingDriverAccept && offerPendingDriver === d.id ? (
                      <View style={styles.waitingTag}>
                        <ActivityIndicator size="small" />
                        <Text style={styles.waitingText}>Waiting…</Text>
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => offerToDriver(d.id)}
                        style={({ pressed }) => [styles.offerBtn, { opacity: pressed ? 0.9 : 1 }]}
                      >
                        <Ionicons name="send-outline" size={16} color="#fff" />
                        <Text style={styles.offerBtnText}>Offer delivery</Text>
                      </Pressable>
                    )}
                  </View>
                ))}

                {waitingDriverAccept ? (
                  <View style={styles.infoHint}>
                    <Ionicons name="alert-circle-outline" size={16} color="#2563eb" />
                    <Text style={styles.infoHintText}>
                      Waiting for driver to accept. We’ll move to “Out for delivery” automatically on acceptance.
                    </Text>
                  </View>
                ) : (
                  <Pressable
                    onPress={fetchNearbyDrivers}
                    style={({ pressed }) => [styles.secondaryBtn, { borderColor: '#CBD5E1', opacity: pressed ? 0.85 : 1, alignSelf: 'flex-start' }]}
                  >
                    <Ionicons name="refresh" size={18} color="#334155" />
                    <Text style={[styles.secondaryBtnText, { color: '#334155' }]}>Refresh list</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        )}

        {/* Items */}
        <View style={styles.block}>
          <RowTitle title="Items" />
          {(order?.raw_items || []).map((it, idx) => (
            <View key={`${it.item_id || idx}`} style={styles.itemRow}>
              <Text style={styles.itemName} numberOfLines={1}>{it.item_name || 'Item'}</Text>
              <Text style={styles.itemQty}>×{Number(it.quantity ?? 1)}</Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={styles.block}>
          <View style={styles.totRow}>
            <Text style={styles.totLabel}>Items</Text>
            <Text style={styles.totValue}>{(order?.raw_items?.length || 0)}</Text>
          </View>
          <View style={styles.totRow}>
            <Text style={styles.totLabelStrong}>Total</Text>
            <Text style={styles.totValueStrong}>{money(order?.total ?? order?.total_amount ?? 0)}</Text>
          </View>
        </View>
      </ScrollView>

      {/* Decline modal */}
      <Modal visible={declineOpen} transparent animationType="fade" onRequestClose={() => setDeclineOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Decline order</Text>
            <Text style={styles.modalSub}>
              A reason is required:
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Reason (min 3 characters)"
              value={declineReason}
              onChangeText={setDeclineReason}
              multiline
            />
            <Text style={{ fontSize: 11, color: canDecline ? '#16a34a' : '#ef4444', marginTop: 6 }}>
              {canDecline ? 'Looks good.' : 'Please enter at least 3 characters.'}
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
              <Pressable
                style={[styles.dialogBtn, { backgroundColor: '#f1f5f9' }]}
                onPress={() => { setDeclineOpen(false); }}
              >
                <Text style={[styles.dialogBtnText, { color: '#0f172a' }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.dialogBtn,
                  { backgroundColor: canDecline ? '#ef4444' : '#fecaca', opacity: pressed ? 0.85 : 1 },
                ]}
                onPress={confirmDecline}
                disabled={!canDecline}
              >
                <Text style={[styles.dialogBtnText, { color: canDecline ? '#fff' : '#7f1d1d' }]}>Decline</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* ---------------- styles ---------------- */
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },

  headerBar: {
    minHeight: 52,
    paddingHorizontal: 12,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomColor: '#e5e7eb',
    borderBottomWidth: 1,
    backgroundColor: '#fff',
  },
  backBtn: { height: 40, width: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: '#0f172a' },

  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  idRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  orderId: { fontWeight: '800', color: '#0f172a', fontSize: 16 },

  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1,
    maxWidth: '60%',
  },
  pillText: { fontWeight: '800' },

  progressTrack: {
    height: 4, backgroundColor: '#e2e8f0', borderRadius: 999,
    overflow: 'hidden', marginTop: 10,
  },
  progressFill: { height: 4, backgroundColor: '#16a34a' },

  stepsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingHorizontal: 2,
  },
  stepWrap: { width: 52, alignItems: 'center' },
  stepDot: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff',
  },
  stepLabel: { marginTop: 4, fontSize: 10.5, fontWeight: '700', textAlign: 'center', color: '#334155' },
  stepTime: { marginTop: 1, fontSize: 10, color: '#64748b' },

  terminalRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  terminalText: { fontWeight: '700' },

  sectionTitle: { marginTop: 14, marginBottom: 8, fontWeight: '700', color: '#0f172a' },
  terminalNote: { color: '#64748b', marginBottom: 10 },

  noteBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#ecfeff',
    borderWidth: 1,
    borderColor: '#99f6e4',
  },
  noteText: { flex: 1, color: '#115e59', fontWeight: '600' },

  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#16a34a', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
  },
  primaryBtnText: { color: '#fff', fontWeight: '800' },

  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 10, borderWidth: 1,
  },
  secondaryBtnText: { fontWeight: '800' },

  block: { backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#e2e8f0', marginTop: 12 },
  blockTitle: { fontWeight: '800', color: '#0f172a' },

  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowText: { color: '#475569', fontWeight: '600', flex: 1 },

  itemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  itemName: { color: '#0f172a', fontWeight: '600', flexShrink: 1, paddingRight: 8 },
  itemQty: { color: '#64748b', fontWeight: '700' },

  totRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  totLabel: { color: '#64748b', fontWeight: '700' },
  totValue: { color: '#0f172a', fontWeight: '700' },
  totLabelStrong: { color: '#0f172a', fontWeight: '800' },
  totValueStrong: { color: '#0f172a', fontWeight: '900' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: '#fff', padding: 16, borderRadius: 16, width: '100%' },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  modalSub: { fontSize: 12, color: '#64748b', marginTop: 4 },
  input: {
    borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 8, minHeight: 44, marginTop: 10,
    color: '#0f172a',
  },
  dialogBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  dialogBtnText: { fontWeight: '800' },

  // Driver UI
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 10,
  },
  driverName: { color: '#0f172a', fontWeight: '800' },
  driverMeta: { color: '#475569', fontWeight: '600', marginTop: 2 },
  offerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2563eb',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  offerBtnText: { color: '#fff', fontWeight: '800' },
  waitingTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  waitingText: { color: '#1d4ed8', fontWeight: '800' },
  infoHint: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: '#eef2ff', borderColor: '#c7d2fe', borderWidth: 1, padding: 10, borderRadius: 10 },
  infoHintText: { color: '#3730a3', fontWeight: '700', flex: 1 },
});
