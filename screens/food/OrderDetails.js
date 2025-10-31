// screens/food/OrderDetails.js
// Sequence rail. Self & Grab share the same steps:
// PENDING → CONFIRMED → READY → OUT_FOR_DELIVERY → COMPLETED
// If delivery_option=BOTH, show Self/Grab chooser ONLY at READY.
// - Grab at READY: show nearby drivers with rating, block Next until assigned.
// - Self at READY: allow Next → OUT_FOR_DELIVERY directly.
// Back nav preserves headers/footers. Hydrates from grouped-orders.

import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Alert, Modal,
  TextInput, ActivityIndicator, BackHandler,
} from 'react-native';
import { useRoute, useNavigation, useFocusEffect, CommonActions } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { DeviceEventEmitter } from 'react-native';
import {
  UPDATE_ORDER_STATUS_ENDPOINT as ENV_UPDATE_ORDER,
  NEARBY_DRIVERS_ENDPOINT as ENV_NEARBY_DRIVERS,
  DIVER_RATING_ENDPOINT as ENV_DRIVER_RATING,
  BUSINESS_DETAILS as ENV_BUSINESS_DETAILS,            // ⬅️ NEW
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

/* ---------- stringify helpers (PREVENT RENDER ERROR) ---------- */
const clean = (v) => (v == null ? '' : String(v).trim());
const addressToLine = (val) => {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'object') {
    const parts = [
      clean(val.address || val.line1 || val.street),
      clean(val.area || val.locality || val.block),
      clean(val.city || val.town || val.dzongkhag),
      clean(val.postcode || val.zip),
    ].filter(Boolean);
    if (!parts.length) {
      const lat = val.lat ?? val.latitude;
      const lng = val.lng ?? val.longitude;
      const ll = [lat, lng].filter((n) => n != null).join(', ');
      return ll ? `(${ll})` : '';
    }
    return parts.join(', ');
  }
  return String(val);
};

/* ---------------- Status config ---------------- */
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

/* ---------------- Order code helpers ---------------- */
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

/* ---------------- NORMALIZERS ---------------- */
/** 'SELF' | 'GRAB' | 'BOTH' | 'UNKNOWN' */
const normDelivery = (v) => {
  const s = String(v || '').trim().toUpperCase();
  if (!s) return 'UNKNOWN';
  if (['SELF','SELF_ONLY','PICKUP','PICK_UP','SELF_PICKUP','SELF-DELIVERY','SELF_DELIVERY'].includes(s)) return 'SELF';
  if (['GRAB','GRAB_ONLY','DELIVERY','PLATFORM','PLATFORM_DELIVERY','PLATFORM-DELIVERY'].includes(s)) return 'GRAB';
  if (s === 'BOTH' || s === 'ALL') return 'BOTH';
  if (s === '1' || s === 'TRUE') return 'GRAB';
  if (s === '0' || s === 'FALSE') return 'SELF';
  if (s.includes('GRAB') || s.includes('PLATFORM')) return 'GRAB';
  if (s.includes('SELF')) return 'SELF';
  if (s.includes('BOTH')) return 'BOTH';
  return 'UNKNOWN';
};

/** Returns 'SELF' | 'GRAB' | 'BOTH' | '' from raw order payload */
function resolveDeliveryOptionFromOrder(from) {
  const cands = [
    from?.delivery_option, from?.deliveryOption, from?.delivery_by, from?.deliveryBy,
    from?.courier, from?.courier_type, from?.courierType,
    from?.fulfillment_option, from?.fulfillmentOption,
    from?.owner_delivery_option, from?.ownerDeliveryOption,
    from?.type, from?.delivery_type, from?.fulfillment_type,
    from?.params?.delivery_option, from?.params?.deliveryOption, from?.params?.delivery_by,
  ].map((v) => (v == null ? '' : String(v).trim()));

  for (const val of cands) {
    const n = normDelivery(val);
    if (n !== 'UNKNOWN') return n;
  }
  return '';
}

/** Returns 'Delivery' | 'Pickup' | '' */
function resolveFulfillmentType(from) {
  const cands = [
    from?.fulfillment_type, from?.fulfillmentType, from?.order_type, from?.orderType,
    from?.type, from?.delivery_type, from?.service_type,
  ].map((v) => (v == null ? '' : String(v).trim()));

  for (const val of cands) {
    const s = norm(val);
    if (!s) continue;
    if (['delivery', 'deliver', 'platform_delivery', 'self-delivery'].includes(s)) return 'Delivery';
    if (['pickup', 'self-pickup', 'pick_up', 'takeaway', 'take-away'].includes(s)) return 'Pickup';
  }
  return '';
}

/* ---------------- BUSINESS_DETAILS fetcher ---------------- */
async function fetchBusinessDetails({ token, business_id }) {
  const base = (ENV_BUSINESS_DETAILS || '').trim().replace(/\/+$/, '');
  if (!base) return null;

  const headers = token
    ? { Accept: 'application/json', Authorization: `Bearer ${token}` }
    : { Accept: 'application/json' };

  const candidates = [
    `${base}`,
    business_id ? `${base}/${business_id}` : null,
    business_id ? `${base}?business_id=${encodeURIComponent(String(business_id))}` : null,
  ].filter(Boolean);

  for (const url of candidates) {
    try {
      const r = await fetch(url, { headers });
      const text = await r.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch {}
      if (!r.ok) continue;
      const maybe = data?.data && typeof data.data === 'object' ? data.data : data;
      if (maybe && (maybe.business_id || maybe.business_name || maybe.delivery_option)) {
        // console.log('[OrderDetails] BUSINESS_DETAILS fetched from:', url);
        return maybe;
      }
    } catch (e) {
      // continue
    }
  }
  console.log('[OrderDetails] BUSINESS_DETAILS not available from any candidate URL.');
  return null;
}

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
  try { json = text ? JSON.parse(text) : null; } catch {}
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
  } catch { return u; }
};

/* ---------------- Driver rating helpers ---------------- */
const buildDriverRatingUrl = (baseUrl, driverId) => {
  if (!baseUrl || !driverId) return null;
  let u = String(baseUrl).trim()
    .replace(/\{driver_id\}/gi, encodeURIComponent(driverId))
    .replace(/:driver_id/gi, encodeURIComponent(driverId));
  try {
    const url = new URL(u);
    if (!url.searchParams.get('driver_id')) url.searchParams.set('driver_id', String(driverId));
    if (!url.searchParams.get('limit')) url.searchParams.set('limit', '20');
    if (!url.searchParams.get('offset')) url.searchParams.set('offset', '0');
    return url.toString();
  } catch { return u; }
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

const toText = (val) => {
  if (val == null) return '—';
  if (typeof val === 'object') return addressToLine(val) || '—';
  const s = String(val).trim();
  return s.length ? s : '—';
};

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
    <Text style={styles.rowText} numberOfLines={2}>{toText(text)}</Text>
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
  const routeOrderId = params.orderId ?? null;
  const ordersGroupedUrl = params.ordersGroupedUrl ?? null;
  const paramBusinessId = params.businessId ?? null;

  const [order, setOrder] = useState(orderProp || {});
  const [updating, setUpdating] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState('');

  /* ---------- Back handling (keep header/footer/tab) ---------- */
  const goBackToOrders = useCallback(() => {
    if (navigation.canGoBack()) { navigation.goBack(); return; }
    try {
      const parent = navigation.getParent?.();
      const names = parent?.getState?.()?.routeNames ?? [];
      const target =
        names.find(n => /^(Orders|OrderTab|OrdersTab|MartOrders|FoodOrders)$/i.test(n)) ||
        names.find(n => /Order/i.test(n));
      if (parent && target) { parent.navigate(target); return; }
    } catch {}
    navigation.dispatch(CommonActions.navigate({ name: 'MainTabs', params: { screen: 'Orders' }}));
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      const onBack = () => { goBackToOrders(); return true; };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [goBackToOrders])
  );

  /* ---------- Merchant delivery option (BUSINESS_DETAILS) ---------- */
  const [merchantDeliveryOpt, setMerchantDeliveryOpt] = useState('UNKNOWN'); // SELF|GRAB|BOTH|UNKNOWN
  const [businessId, setBusinessId] = useState(paramBusinessId);

  useEffect(() => {
    (async () => {
      try {
        const token = await SecureStore.getItemAsync('auth_token');
        if (!businessId) {
          const saved = await SecureStore.getItemAsync('merchant_login');
          if (saved) {
            try {
              const j = JSON.parse(saved);
              setBusinessId(j?.business_id || j?.user?.business_id || j?.user?.businessId || j?.id || j?.user?.id || null);
            } catch {}
          }
        }
        const finalBizId = businessId || paramBusinessId;
        const bd = await fetchBusinessDetails({ token, business_id: finalBizId });
        const opt = normDelivery(bd?.delivery_option ?? bd?.deliveryOption);
        setMerchantDeliveryOpt(opt);
        // console.log('[OrderDetails] merchant delivery_option (BUSINESS_DETAILS) →', bd?.delivery_option, 'normalized →', opt);
      } catch (e) {
        console.log('[OrderDetails] BUSINESS_DETAILS fetch error:', e?.message || e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount (token/biz id from secure storage)

  /* ---------- Normalize Fulfillment vs Delivery-by ---------- */
  const fulfillment = useMemo(() => resolveFulfillmentType({ ...order, params }), [order, params]);

  // Order-level hint (fallback)
  const orderDeliveryHint = useMemo(() => resolveDeliveryOptionFromOrder({ ...order, params }), [order, params]);

  // Effective delivery option priority: BUSINESS_DETAILS > order hint > ''
  const deliveryOptionInitial = useMemo(() => {
    const m = merchantDeliveryOpt;
    if (m !== 'UNKNOWN') return m;
    return orderDeliveryHint || '';
  }, [merchantDeliveryOpt, orderDeliveryHint]);

  // When BOTH, merchant chooses at READY. Otherwise auto-choose.
  const [deliveryChoice, setDeliveryChoice] = useState(
    deliveryOptionInitial === 'SELF' ? 'self' :
    deliveryOptionInitial === 'GRAB' ? 'grab' : ''
  );

  useEffect(() => {
    if (!deliveryChoice && (deliveryOptionInitial === 'SELF' || deliveryOptionInitial === 'GRAB')) {
      setDeliveryChoice(deliveryOptionInitial === 'SELF' ? 'self' : 'grab');
    }
  }, [deliveryOptionInitial, deliveryChoice]);

  const isBothOption   = deliveryOptionInitial === 'BOTH';
  const isSelfSelected = (deliveryChoice || '').toLowerCase() === 'self';
  const isGrabSelected = (deliveryChoice || '').toLowerCase() === 'grab';

  const status = (order?.status || 'PENDING').toUpperCase();
  const meta = STATUS_META[status] || STATUS_META.PENDING;

  const isSelfFulfillment = useMemo(() => {
    if (isBothOption) return isSelfSelected;
    return deliveryOptionInitial === 'SELF';
  }, [isBothOption, isSelfSelected, deliveryOptionInitial]);

  const isPlatformDelivery = useMemo(() => {
    if (isBothOption) return isGrabSelected;
    return deliveryOptionInitial === 'GRAB';
  }, [isBothOption, isGrabSelected, deliveryOptionInitial]);

  const deliveryOptionDisplay = useMemo(() => {
    if (isBothOption) {
      if (status === 'READY') {
        if (isSelfSelected) return 'BOTH (SELF chosen)';
        if (isGrabSelected) return 'BOTH (GRAB chosen)';
        return 'BOTH (choose at READY)';
      }
      return 'BOTH';
    }
    return deliveryOptionInitial || '';
  }, [isBothOption, isSelfSelected, isGrabSelected, deliveryOptionInitial, status]);

  /* ---------- Sequence ---------- */
  const STATUS_SEQUENCE = useMemo(
    () => ['PENDING', 'CONFIRMED', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED'],
    []
  );
  const isTerminalNegative = TERMINAL_NEGATIVE.has(status);
  const isTerminalSuccess  = TERMINAL_SUCCESS.has(status);

  // Block NEXT at READY only when Grab is active (BOTH+Grab chosen OR direct Grab)
  const shouldBlockAtReady =
    status === 'READY' && (isPlatformDelivery || (isBothOption && isGrabSelected));

  const nextFor = useCallback((curr) => {
    const s = (curr || '').toUpperCase();
    if (TERMINAL_NEGATIVE.has(s) || TERMINAL_SUCCESS.has(s)) return null;
    if (s === 'READY' && shouldBlockAtReady) return null; // must assign driver
    const idx = STATUS_SEQUENCE.indexOf(s);
    if (idx === -1) return 'CONFIRMED';
    return STATUS_SEQUENCE[idx + 1] || null;
  }, [STATUS_SEQUENCE, shouldBlockAtReady]);

  const stepIndex = findStepIndex(status, STATUS_SEQUENCE);
  const lastIndex = STATUS_SEQUENCE.length - 1;
  const progressIndex = clamp(stepIndex === -1 ? 0 : stepIndex, 0, lastIndex);
  const progressPct = isTerminalNegative ? 0
    : isTerminalSuccess ? 100
    : ((progressIndex + 1) / STATUS_SEQUENCE.length) * 100;

  const stamps = useMemo(() => {
    const s = order?.status_timestamps || {};
    const out = {};
    STATUS_SEQUENCE.forEach((k) => { out[k] = fmtStamp(s[k]); });
    return out;
  }, [order?.status_timestamps, STATUS_SEQUENCE]);

  /* ---------- Note ---------- */
  const restaurantNote = useMemo(() => {
    const n =
      order?.note_for_restaurant ??
      order?.restaurant_note ??
      order?.note_for_store ??
      order?.note ?? '';
    return String(n || '').trim();
  }, [order]);

  /* ---------- Hydrate from grouped endpoint ---------- */
  const hydrateFromGrouped = useCallback(async () => {
    try {
      if (!ordersGroupedUrl || !routeOrderId) return;
      const hasCore =
        (order?.raw_items && order.raw_items.length) ||
        order?.payment_method ||
        order?.customer_name ||
        order?.delivery_address;
      if (hasCore) return;

      const token = await SecureStore.getItemAsync('auth_token');
      const res = await fetch(ordersGroupedUrl, {
        method: 'GET',
        headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      const text = await res.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch {}
      if (!res.ok) throw new Error(json?.message || json?.error || `HTTP ${res.status}`);

      const groups = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
      let allOrders = [];
      for (const g of groups) {
        if (Array.isArray(g?.orders)) allOrders = allOrders.concat(g.orders);
        else if (g?.id || g?.order_id || g?.order_code) allOrders.push(g);
      }
      const match = allOrders.find((o) =>
        sameOrder(o?.id ?? o?.order_id ?? o?.order_code, routeOrderId)
      );
      if (!match) return;

      const normalized = {
        ...match,
        id: String(match?.id ?? match?.order_id ?? match?.order_code ?? routeOrderId),
        order_code: normalizeOrderCode(match?.order_code ?? match?.id ?? routeOrderId),
        customer_name: match?.customer_name ?? match?.user_name ?? match?.user?.user_name ?? '',
        payment_method: match?.payment_method ?? match?.payment ?? '',
        delivery_address: match?.delivery_address ?? match?.address ?? '',
        raw_items: Array.isArray(match?.raw_items) ? match.raw_items
                  : Array.isArray(match?.items) ? match.items
                  : [],
        total: match?.total ?? match?.total_amount ?? 0,
        status: (match?.status ?? order?.status ?? 'PENDING').toUpperCase(),
        type: match?.type ?? match?.fulfillment_type ?? match?.delivery_type ?? order?.type ?? '',
        delivery_option: match?.delivery_option ?? match?.delivery_by ?? order?.delivery_option ?? '',
        status_timestamps: match?.status_timestamps ?? order?.status_timestamps ?? {},
      };
      setOrder((prev) => ({ ...prev, ...normalized }));
    } catch (e) {
      console.warn('[OrderDetails] hydrate error:', e?.message);
    }
  }, [ordersGroupedUrl, routeOrderId, order]);

  useEffect(() => { hydrateFromGrouped(); }, [hydrateFromGrouped]);

  /* ---------- Update handlers ---------- */
  const DEFAULT_REASON = {
    CONFIRMED: 'Order accepted by merchant',
    READY: 'Order is ready',
    OUT_FOR_DELIVERY: 'Order handed over for delivery',
    COMPLETED: 'Order delivered',
  };

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

      // Always send the chosen/active delivery_option
      const deliveryBy =
        (isBothOption && (isSelfSelected || isGrabSelected))
          ? (isSelfSelected ? 'SELF' : 'GRAB')
          : (deliveryOptionInitial || '');
      if (deliveryBy) payload.delivery_option = deliveryBy;

      setUpdating(true);
      const token = await SecureStore.getItemAsync('auth_token');
      const raw = order?.order_code || order?.id || routeOrderId;
      const orderCode = normalizeOrderCode(raw);

      await updateStatusApi({ endpoint: ENV_UPDATE_ORDER || '', orderCode, payload, token });

      const patch = { status: newStatus };
      if (payload.delivery_option) patch.delivery_option = payload.delivery_option;
      setOrder((prev) => ({ ...prev, ...patch }));
      DeviceEventEmitter.emit('order-updated', { id: routeOrderId || order?.id, patch });
    } catch (e) {
      Alert.alert('Update failed', String(e?.message || e));
    } finally {
      setUpdating(false);
    }
  }, [routeOrderId, order?.id, order?.order_code, isBothOption, isSelfSelected, isGrabSelected, deliveryOptionInitial]);

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

  const onDecline = useCallback(() => setDeclineOpen(true), []);
  const canDecline = useMemo(() => String(declineReason).trim().length >= 3, [declineReason]);
  const confirmDecline = useCallback(() => {
    const r = String(declineReason).trim();
    if (r.length < 3) {
      Alert.alert('Reason required', 'Please type a brief reason (min 3 characters).');
      return;
    }
    setDeclineOpen(false);
    doUpdate('DECLINED', { reason: r });
    setDeclineReason('');
  }, [declineReason, doUpdate]);

  /* ---------- Nearby drivers (READY + Grab active) ---------- */
  const [drivers, setDrivers] = useState([]);
  const [loadingDrivers, setLoadingDrivers] = useState(false);
  const [driversError, setDriversError] = useState('');
  const [offerPendingDriver, setOfferPendingDriver] = useState(null);
  const [waitingDriverAccept, setWaitingDriverAccept] = useState(false);
  const acceptTimerRef = useRef(null);

  const refCoords = useMemo(() => {
    const lat = order?.delivery_lat ?? order?.lat ?? order?.destination?.lat ?? order?.geo?.lat ?? 27.4775469;
    const lng = order?.delivery_lng ?? order?.lng ?? order?.destination?.lng ?? order?.geo?.lng ?? 89.6387255;
    const cityId = order?.city_id ?? order?.city ?? 'thimphu';
    return { lat: Number(lat), lng: Number(lng), cityId: String(cityId || 'thimphu').toLowerCase() };
  }, [order]);

  const buildNearby = useCallback(() => expandNearbyUrl(ENV_NEARBY_DRIVERS, {
    cityId: refCoords.cityId, lat: refCoords.lat, lng: refCoords.lng, radiusKm: 5, limit: 20,
  }), [refCoords]);

  const fetchDriverRating = useCallback(async (driverId) => {
    try {
      if (!ENV_DRIVER_RATING) return null;
      const url = buildDriverRatingUrl(ENV_DRIVER_RATING, driverId);
      if (!url) return null;
      const resp = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
      const text = await resp.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch {}
      if (!resp.ok) throw new Error(json?.message || json?.error || `HTTP ${resp.status}`);
      return computeAverageRating(json);
    } catch { return null; }
  }, []);

  const fetchNearbyDrivers = useCallback(async () => {
    const grabActive = (isBothOption && isGrabSelected) || (!isBothOption && deliveryOptionInitial === 'GRAB');
    if (!(status === 'READY' && grabActive)) return;

    const url = buildNearby();
    if (!url) { setDriversError('NEARBY_DRIVERS_ENDPOINT not configured'); return; }

    setDriversError(''); setLoadingDrivers(true);
    try {
      const resp = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
      const text = await resp.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch {}
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
      const ratings = await Promise.all(top.map(async (d) => {
        const idForRating = d.driver_id || d.id;
        return idForRating ? await fetchDriverRating(idForRating) : null;
      }));
      top.forEach((d, idx) => { d.rating = ratings[idx]; });
      const merged = top.concat(normalized.slice(12));
      setDrivers(merged);
    } catch (e) {
      setDrivers([]); setDriversError(String(e?.message || e));
    } finally {
      setLoadingDrivers(false);
    }
  }, [status, isBothOption, isGrabSelected, deliveryOptionInitial, buildNearby, fetchDriverRating]);

  useEffect(() => {
    const grabActive = (isBothOption && isGrabSelected) || (!isBothOption && deliveryOptionInitial === 'GRAB');
    if (status === 'READY' && grabActive) {
      fetchNearbyDrivers();
    } else {
      setDrivers([]);
      setOfferPendingDriver(null);
      setWaitingDriverAccept(false);
    }
  }, [status, isBothOption, isGrabSelected, deliveryOptionInitial, refCoords.cityId, refCoords.lat, refCoords.lng, fetchNearbyDrivers]);

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

  useEffect(() => () => { if (acceptTimerRef.current) clearTimeout(acceptTimerRef.current); }, []);

  /* ---------- Live patch listener ---------- */
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('order-updated', ({ id, patch }) => {
      if (String(id) === String(routeOrderId)) setOrder((prev) => ({ ...prev, ...patch }));
    });
    return () => sub?.remove?.();
  }, [routeOrderId]);

  /* ---------------- UI ---------------- */
  const headerTopPad = Math.max(insets.top, 8) + 18;

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      {/* Header */}
      <View style={[styles.headerBar, { paddingTop: headerTopPad }]}>
        <Pressable onPress={goBackToOrders} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color="#0f172a" />
        </Pressable>
        <Text style={styles.headerTitle}>Order details</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        {/* Card */}
        <View style={styles.card}>
          {/* Top row: id + status chip */}
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

          {/* Steps */}
          <View style={styles.stepsRow}>
            {['PENDING','CONFIRMED','READY','OUT_FOR_DELIVERY','COMPLETED'].map((k, i) => {
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

          {/* Meta */}
          <View style={{ marginTop: 12, gap: 8 }}>
            <Row icon="person-outline" text={order.customer_name || '—'} />
            <Row icon="bicycle-outline" text={`Fulfillment: ${fulfillment || '—'}`} />
            <Row icon="swap-horizontal-outline" text={`Delivery by: ${deliveryOptionDisplay || '—'}`} />
            <Row icon="card-outline" text={`Payment: ${order.payment_method || '—'}`} />
            {/* SAFE: delivery_address can be object or string */}
            <Row icon="navigate-outline" text={order.delivery_address || '—'} />
          </View>

          {/* Restaurant note */}
          {!!restaurantNote && (
            <View style={styles.noteBox}>
              <Ionicons name="chatbubble-ellipses-outline" size={14} color="#0f766e" />
              <Text style={styles.noteText} numberOfLines={6}>{restaurantNote}</Text>
            </View>
          )}
        </View>

        {/* ====== ONLY AT READY & BOTH: choose Self vs Grab ====== */}
        {status === 'READY' && isBothOption && !isTerminalNegative && !isTerminalSuccess && (
          <View style={[styles.block, { marginTop: 12 }]}>
            <RowTitle title="Choose delivery method" />
            <View style={styles.segmentWrap}>
              <Pressable
                onPress={() => setDeliveryChoice('self')}
                style={[styles.segmentBtn, isSelfSelected && styles.segmentBtnActive]}
              >
                <Ionicons name="person-outline" size={16} color={isSelfSelected ? '#fff' : '#0f172a'} />
                <Text style={[styles.segmentText, { color: isSelfSelected ? '#fff' : '#0f172a' }]}>Self</Text>
              </Pressable>
              <Pressable
                onPress={() => setDeliveryChoice('grab')}
                style={[styles.segmentBtn, isGrabSelected && styles.segmentBtnActive]}
              >
                <Ionicons name="bicycle-outline" size={16} color={isGrabSelected ? '#fff' : '#0f172a'} />
                <Text style={[styles.segmentText, { color: isGrabSelected ? '#fff' : '#0f172a' }]}>Grab</Text>
              </Pressable>
            </View>
            <Text style={styles.segmentHint}>
              {isSelfSelected
                ? 'Proceed directly to Out for delivery.'
                : isGrabSelected
                ? 'Assign a driver below to continue.'
                : 'Pick one to continue.'}
            </Text>
          </View>
        )}

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
                  onPress={() => setDeclineOpen(true)}
                  disabled={updating}
                  style={({ pressed }) => [styles.secondaryBtn, { borderColor: '#ef4444', opacity: updating || pressed ? 0.85 : 1 }]}
                >
                  <Ionicons name="close-circle-outline" size={18} color="#b91c1c" />
                  <Text style={[styles.secondaryBtnText, { color: '#991b1b' }]}>Decline</Text>
                </Pressable>
              </>
            ) : (
              <>
                {primaryLabel ? (
                  <Pressable
                    onPress={() => { if (primaryLabel) { const n = next; if (n) onPrimaryAction(); }}}
                    disabled={
                      updating ||
                      (status === 'READY' && (
                        (isBothOption && isGrabSelected) || (!isBothOption && deliveryOptionInitial === 'GRAB')
                      ))
                    }
                    style={({ pressed }) => [styles.primaryBtn, {
                      opacity: (updating ||
                               (status === 'READY' && ((isBothOption && isGrabSelected) || (!isBothOption && deliveryOptionInitial === 'GRAB'))) ||
                               pressed) ? 0.85 : 1
                    }]}
                  >
                    <Ionicons name="arrow-forward-circle" size={18} color="#fff" />
                    <Text style={styles.primaryBtnText}>{primaryLabel}</Text>
                  </Pressable>
                ) : null}

                {status === 'READY' && ((isBothOption && isGrabSelected) || (!isBothOption && deliveryOptionInitial === 'GRAB')) ? (
                  <Text style={{ color: '#64748b', fontWeight: '600' }}>
                    Assign a driver below to continue…
                  </Text>
                ) : null}
              </>
            )}
          </View>
        )}

        {/* Nearby Driver assignment panel — only when READY & Grab active */}
        {status === 'READY' && ((isBothOption && isGrabSelected) || (!isBothOption && deliveryOptionInitial === 'GRAB')) && (
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
                      <Text style={styles.driverName} numberOfLines={1}>{toText(d.name)}</Text>
                      <Text style={styles.driverMeta} numberOfLines={1}>
                        {d.rating != null ? `★ ${Number(d.rating).toFixed(1)} • ` : '★ — • '}
                        {toText(d.vehicle_type || '—')}
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
              <Text style={styles.itemName} numberOfLines={1}>{toText(it.item_name || 'Item')}</Text>
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
            <Text style={styles.modalSub}>A reason is required:</Text>
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
              <Pressable style={[styles.dialogBtn, { backgroundColor: '#f1f5f9' }]} onPress={() => { setDeclineOpen(false); }}>
                <Text style={[styles.dialogBtnText, { color: '#0f172a' }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.dialogBtn, { backgroundColor: canDecline ? '#ef4444' : '#fecaca', opacity: pressed ? 0.85 : 1 }]}
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

  // Meta & note
  noteBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 10,
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12,
    backgroundColor: '#ecfeff', borderWidth: 1, borderColor: '#99f6e4',
  },
  noteText: { flex: 1, color: '#115e59', fontWeight: '600' },

  sectionTitle: { marginTop: 14, marginBottom: 8, fontWeight: '700', color: '#0f172a' },
  terminalNote: { color: '#64748b', marginBottom: 10 },

  // BOTH selector (only at READY)
  segmentWrap: { flexDirection: 'row', gap: 10, marginTop: 10 },
  segmentBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10,
    backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0',
  },
  segmentBtnActive: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  segmentText: { fontWeight: '800' },
  segmentHint: { marginTop: 8, color: '#64748b', fontWeight: '600' },

  // Actions
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

  // Items & totals
  itemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  itemName: { color: '#0f172a', fontWeight: '600', flexShrink: 1, paddingRight: 8 },
  itemQty: { color: '#64748b', fontWeight: '700' },
  totRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  totLabel: { color: '#64748b', fontWeight: '700' },
  totValue: { color: '#0f172a', fontWeight: '700' },
  totLabelStrong: { color: '#0f172a', fontWeight: '800' },
  totValueStrong: { color: '#0f172a', fontWeight: '900' },

  // Modal
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
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderWidth: 1, borderColor: '#e2e8f0',
    borderRadius: 12, paddingHorizontal: 10,
  },
  driverName: { color: '#0f172a', fontWeight: '800' },
  driverMeta: { color: '#475569', fontWeight: '600', marginTop: 2 },
  offerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#2563eb', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
  },
  offerBtnText: { color: '#fff', fontWeight: '800' },
  waitingTag: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe',
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10,
  },
  waitingText: { color: '#1d4ed8', fontWeight: '800' },
  infoHint: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: '#eef2ff', borderColor: '#c7d2fe', borderWidth: 1, padding: 10, borderRadius: 10 },
  infoHintText: { color: '#3730a3', fontWeight: '700', flex: 1 },
});
