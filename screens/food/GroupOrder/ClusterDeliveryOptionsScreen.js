// services/food/GroupOrder/ClusterDeliveryOptionsScreen.js
// ✅ Added: socket.on("delivery:driver_arrived") + UI banner + alert
// ✅ Added: socket.on("deliveryDriverLocation") -> live driver coords stored + logged
// ✅ Added: "Track live map" button (after driver accepted) -> navigates to TrackBatchOrdersScreen
// ✅ FIX: prevent 400 "At least one valid drop with lat/lng is required"
// ✅ FIX: buildBatchPayload pulls lat/lng + totals from grouped API via orderLookup map
// ✅ FIX: removed duplicate state declarations + stale closure safe refs
// ✅ NEW: joinOrder() ONLY for orders inside this cluster/batch + filter deliveryDriverLocation to this cluster only
// ✅ NEW: LOGS to confirm merchant actually joined order rooms (emit + ack + socket.id + joinedOrderIdsRef)
// ✅ UPDATE: accept live payloads that don't include orderId/batchId AFTER driverAccepted (to avoid ignoring valid pings)
// ✅ NEW: TrackBatchOrdersScreen params include batch_id + ride_id
// ✅ NEW: Save batch_id + ride_id in SecureStore (restore on reopen)
//
// ✅ NEW (your request):
// - If driver updates status to "ON ROAD", treat it as "OUT_FOR_DELIVERY"
// - Immediately reflect UI: status pills + list title + bulkPhase -> OUT_FOR_DELIVERY
// - This is UI marking (does NOT call update API automatically)
//
// ✅ FIX (your current issue):
// - passenger_id was missing because grouped API stores customer user_id under block.user (saved into orderLookup[id].__user)
// - buildBatchPayload now derives passenger_id from orderLookup.__user first, then falls back to order fields
//
// ✅ UPDATE (your request now):
// - Hide "Mark all as Out for delivery" and "Mark all as delivered" buttons when selected delivery option is GRAB
//   (SELF-only bulk buttons)

import React, { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  DeviceEventEmitter,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import io from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';
import {
  BUSINESS_DETAILS,
  BATCH_ORDER_BROADCAST_ENDPOINT as ENV_SEND_REQUEST_DRIVER,
  RIDE_SOCKET_ENDPOINT as ENV_RIDE_SOCKET,
  DRIVER_DETAILS_ENDPOINT as ENV_DRIVER_DETAILS,
  DIVER_RATING_ENDPOINT as ENV_DRIVER_RATING, // (keeping your env name)
  UPDATE_ORDER_STATUS_ENDPOINT as ENV_UPDATE_ORDER,
  ORDER_ENDPOINT as ENV_ORDER_ENDPOINT,
} from '@env';
import { normalizeOrderCode, updateStatusApi } from '../../../screens/food/OrderDetails/orderDetailsUtils';

/* ---------------- helpers ---------------- */

const logJson = (label, obj) => {
  try {
    // console.log(label, JSON.stringify(obj, null, 2));
  } catch (e) {
    console.log(label, obj);
  }
};

const logText = (label, txt) => {
  const s = txt == null ? '' : String(txt);
  // console.log(label, s.length > 1200 ? `${s.slice(0, 1200)}... (truncated)` : s);
};

const getOrderId = (order = {}) => {
  const base = order.raw || order;
  const cand = [base.order_id, base.id, base.orderId, base.order_no, base.orderNo, base.order_code];
  for (const v of cand) {
    if (v != null && String(v).trim().length > 0) return String(v).trim();
  }
  return null;
};

const safeNum = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const safePhone = (v) => {
  if (v == null) return '';
  if (typeof v === 'object') {
    const pick = v.phone ?? v.mobile ?? v.number ?? v.value ?? '';
    v = pick;
  }
  let s = String(v).trim();
  if (!s) return '';
  s = s.replace(/[^\d+]/g, '');
  if (s.includes('+')) {
    const firstPlus = s.indexOf('+');
    s = '+' + s.slice(firstPlus + 1).replace(/[+]/g, '');
  }
  return s;
};

/* ✅ ON ROAD => OUT_FOR_DELIVERY normalizer */
const normalizeStatus = (raw) => {
  if (!raw) return null;
  const s = String(raw).toUpperCase().trim();

  if (
    s === 'ON ROAD' ||
    s === 'ON_ROAD' ||
    s === 'ONROAD' ||
    s === 'OUT FOR DELIVERY' ||
    s === 'OUT_FOR_DELIVERY' ||
    s === 'OUT_FOR_DEL' ||
    s === 'DELIVERING'
  ) {
    return 'OUT_FOR_DELIVERY';
  }

  if (s === 'ACCEPT') return 'ACCEPTED';
  return s;
};

/* ✅ used for UI display */
const statusLabel = (raw) => {
  const s = normalizeStatus(raw);
  if (!s) return '';
  return String(s).replace(/_/g, ' ');
};

const toRad = (deg) => (deg * Math.PI) / 180;
const computeHaversineKm = (a, b) => {
  if (!a || !b) return null;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const x = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * c;
};

const DEFAULT_REASON = {
  OUT_FOR_DELIVERY: 'Order handed over for delivery',
  COMPLETED: 'Order delivered',
};

// ORDER_ENDPOINT template
const buildGroupedOrdersUrl = (businessId) => {
  if (!businessId) return null;
  const tmpl = String(ENV_ORDER_ENDPOINT || '').trim();
  if (!tmpl) return null;

  if (tmpl.includes('{businessId}')) return tmpl.replace('{businessId}', encodeURIComponent(businessId));
  if (tmpl.includes(':businessId')) return tmpl.replace(':businessId', encodeURIComponent(businessId));
  if (tmpl.includes(':business_id')) return tmpl.replace(':business_id', encodeURIComponent(businessId));

  return `${tmpl.replace(/\/+$/, '')}/${encodeURIComponent(businessId)}`;
};

// BUSINESS_DETAILS template
const buildBusinessDetailsUrl = (businessId) => {
  const rawBid = businessId != null ? String(businessId).trim() : '';
  const tpl = (BUSINESS_DETAILS || '').trim();
  if (!rawBid || !tpl) return null;

  const id = encodeURIComponent(rawBid);

  let url = tpl
    .replace('{business_id}', id)
    .replace('{businessId}', id)
    .replace(':business_id', id)
    .replace(':businessId', id);

  if (url === tpl) url = `${tpl.replace(/\/+$/, '')}/${id}`;
  return url;
};

/* --- batch parsing helpers (works with many backend shapes) --- */
const pickBatchId = (batchResponse, routeBatchId, firstOrder) => {
  const fromResp =
    batchResponse?.batch_id ??
    batchResponse?.data?.batch_id ??
    batchResponse?.batchId ??
    batchResponse?.data?.batchId ??
    null;

  return routeBatchId ?? fromResp ?? firstOrder?.batch_id ?? firstOrder?.batchId ?? null;
};

const pickBatchOrderIds = (batchResponse) => {
  const arr =
    batchResponse?.order_ids ??
    batchResponse?.data?.order_ids ??
    batchResponse?.orders ??
    batchResponse?.data?.orders ??
    batchResponse?.data?.orderIds ??
    batchResponse?.orderIds ??
    null;

  if (!Array.isArray(arr)) return [];
  return arr.map((x) => String(x)).filter(Boolean);
};

const extractDropCoords = (o) => {
  const base = o?.raw || o || {};

  const deliveryAddressObj =
    base?.delivery_address && typeof base.delivery_address === 'object' ? base.delivery_address : null;

  const deliverToObj = base?.deliver_to && typeof base.deliver_to === 'object' ? base.deliver_to : null;

  const otherAddrObj =
    base?.dropoff_address && typeof base.dropoff_address === 'object'
      ? base.dropoff_address
      : base?.shipping_address && typeof base.shipping_address === 'object'
        ? base.shipping_address
        : null;

  const candidates = [
    deliverToObj && {
      lat: deliverToObj.lat ?? deliverToObj.latitude,
      lng: deliverToObj.lng ?? deliverToObj.lon ?? deliverToObj.longitude,
    },
    deliveryAddressObj && {
      lat: deliveryAddressObj.lat ?? deliveryAddressObj.latitude,
      lng: deliveryAddressObj.lng ?? deliveryAddressObj.lon ?? deliveryAddressObj.longitude,
    },
    otherAddrObj && {
      lat: otherAddrObj.lat ?? otherAddrObj.latitude,
      lng: otherAddrObj.lng ?? otherAddrObj.lon ?? otherAddrObj.longitude,
    },
    {
      lat: base.delivery_lat ?? base.deliveryLatitude ?? base.delivery_latitude ?? base.lat ?? base.latitude,
      lng:
        base.delivery_lng ??
        base.deliveryLongitude ??
        base.delivery_longitude ??
        base.delivery_lon ??
        base.lng ??
        base.lon ??
        base.longitude ??
        base.long,
    },
    base.coords && { lat: base.coords.lat, lng: base.coords.lng },
  ];

  for (const c of candidates) {
    if (!c) continue;
    const lat = Number(c.lat);
    const lng = Number(c.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  return null;
};

const pickAddressText = (base) => {
  if (!base) return '';
  if (typeof base.delivery_address === 'string') return base.delivery_address;
  if (base.delivery_address && typeof base.delivery_address === 'object' && base.delivery_address.address) {
    return base.delivery_address.address;
  }
  if (base.deliver_to && typeof base.deliver_to === 'object' && base.deliver_to.address) {
    return base.deliver_to.address;
  }
  return '';
};

const computeClusterCenter = (points = []) => {
  const valid = (points || [])
    .map((p) => ({ lat: Number(p?.lat), lng: Number(p?.lng) }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (!valid.length) return null;
  const sum = valid.reduce((acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }), { lat: 0, lng: 0 });
  return { lat: sum.lat / valid.length, lng: sum.lng / valid.length };
};

const extractDriverCoords = (payload) => {
  if (!payload) return null;
  const cand = [
    { lat: payload.lat, lng: payload.lng },
    { lat: payload.latitude, lng: payload.longitude },
    { lat: payload.current_lat, lng: payload.current_lng },
    { lat: payload.driver_lat, lng: payload.driver_lng },
    { lat: payload?.location?.lat, lng: payload?.location?.lng },
    { lat: payload?.location?.latitude, lng: payload?.location?.longitude },
    { lat: payload?.coords?.lat, lng: payload?.coords?.lng },
    { lat: payload?.coords?.latitude, lng: payload?.coords?.longitude },
  ];
  for (const c of cand) {
    const la = Number(c.lat);
    const lo = Number(c.lng);
    if (Number.isFinite(la) && Number.isFinite(lo)) return { lat: la, lng: lo };
  }
  return null;
};

/* ✅ UPDATED: extract more possible order id fields + nested payloads */
const extractOrderIdFromLoc = (payload) => {
  if (!payload) return null;

  let v =
    payload.order_id ??
    payload.orderId ??
    payload.order_code ??
    payload.orderCode ??
    payload.order_no ??
    payload.orderNo ??
    payload.job_id ??
    payload.jobId ??
    payload.delivery_order_id ??
    payload.deliveryOrderId ??
    payload.delivery_job_id ??
    payload.deliveryJobId ??
    null;

  if (v != null) return String(v);

  const containers = [payload.data, payload.payload, payload.message, payload.meta, payload.location, payload.order];
  for (const c of containers) {
    if (!c) continue;
    v =
      c.order_id ??
      c.orderId ??
      c.order_code ??
      c.orderCode ??
      c.order_no ??
      c.orderNo ??
      c.job_id ??
      c.jobId ??
      c.delivery_order_id ??
      c.deliveryOrderId ??
      c.delivery_job_id ??
      c.deliveryJobId ??
      null;
    if (v != null) return String(v);
  }

  const deepOrderId = payload?.order?.id ?? payload?.data?.order?.id ?? null;
  if (deepOrderId != null) return String(deepOrderId);

  return null;
};

/* ✅ UPDATED: extract more possible batch id fields + nested payloads */
const extractBatchIdFromLoc = (payload) => {
  if (!payload) return null;

  let v =
    payload.batch_id ??
    payload.batchId ??
    payload.delivery_batch_id ??
    payload.deliveryBatchId ??
    payload.group_batch_id ??
    payload.groupBatchId ??
    payload.batch ??
    payload.batch?.id ??
    null;

  if (v != null) return String(v);

  const containers = [payload.data, payload.payload, payload.message, payload.meta, payload.batch];
  for (const c of containers) {
    if (!c) continue;
    v =
      c.batch_id ??
      c.batchId ??
      c.delivery_batch_id ??
      c.deliveryBatchId ??
      c.group_batch_id ??
      c.groupBatchId ??
      c.batch ??
      c.batch?.id ??
      null;
    if (v != null) return String(v);
  }

  return null;
};

/* ✅ NEW: extract ride id fields (accept many shapes) */
const pickRideId = (payload) =>
  payload?.ride_id ??
  payload?.rideId ??
  payload?.delivery_ride_id ??
  payload?.deliveryRideId ??
  payload?.ride ??
  payload?.ride?.id ??
  payload?.data?.ride_id ??
  payload?.data?.rideId ??
  payload?.data?.delivery_ride_id ??
  payload?.data?.deliveryRideId ??
  payload?.payload?.ride_id ??
  payload?.payload?.rideId ??
  payload?.message?.ride_id ??
  payload?.message?.rideId ??
  null;

/* ✅ SecureStore keys (scoped by businessId) */
const keyBatchId = (businessId) => `cluster:last_batch_id:${String(businessId || '0')}`;
const keyRideId = (businessId) => `cluster:last_ride_id:${String(businessId || '0')}`;

/* ✅ NEW: extract status from any socket payload (driver update) */
const extractStatusFromPayload = (payload) => {
  if (!payload) return null;

  const direct =
    payload.status ?? payload.order_status ?? payload.current_status ?? payload.orderStatus ?? payload.job_status ?? null;
  if (direct) return direct;

  const containers = [payload.data, payload.payload, payload.message, payload.meta, payload.order];
  for (const c of containers) {
    if (!c) continue;
    const v = c.status ?? c.order_status ?? c.current_status ?? c.orderStatus ?? c.job_status ?? null;
    if (v) return v;
  }

  return null;
};

export default function ClusterDeliveryOptionsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const route = useRoute();

  const {
    label,
    readyOrders = [],
    businessId,
    ownerType,
    delivery_option,
    batch_id: routeBatchId,
    batchResponse,
    batch_order_ids: batchOrderIdsFromParams,
  } = route.params || {};

  const initialBatchOrderIds = useMemo(() => {
    const idsFromParam = Array.isArray(batchOrderIdsFromParams)
      ? batchOrderIdsFromParams.map((x) => String(x)).filter(Boolean)
      : [];
    const idsFromResp = pickBatchOrderIds(batchResponse);
    const fallback = (readyOrders || []).map((o) => String(getOrderId(o) || o?.id || '')).filter(Boolean);
    const finalIds = idsFromParam.length ? idsFromParam : idsFromResp.length ? idsFromResp : fallback;
    return Array.from(new Set(finalIds));
  }, [batchOrderIdsFromParams, batchResponse, readyOrders]);

  const batchOrderIdSet = useMemo(() => new Set(initialBatchOrderIds), [initialBatchOrderIds]);

  const [ordersOnScreen, setOrdersOnScreen] = useState(() => {
    const input = Array.isArray(readyOrders) ? readyOrders : [];
    if (!initialBatchOrderIds.length) return input;
    return input.filter((o) => {
      const id = String(getOrderId(o) || o?.id || '');
      return id && batchOrderIdSet.has(id);
    });
  });

  useEffect(() => {
    const input = Array.isArray(readyOrders) ? readyOrders : [];
    if (!initialBatchOrderIds.length) {
      setOrdersOnScreen(input);
      return;
    }
    setOrdersOnScreen(
      input.filter((o) => {
        const id = String(getOrderId(o) || o?.id || '');
        return id && batchOrderIdSet.has(id);
      })
    );
  }, [readyOrders, initialBatchOrderIds, batchOrderIdSet]);

  const readyCount = ordersOnScreen.length;

  const [refreshing, setRefreshing] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [bulkPhase, setBulkPhase] = useState('READY'); // READY -> OUT_FOR_DELIVERY -> COMPLETED
  const bulkPhaseRef = useRef('READY');
  useEffect(() => {
    bulkPhaseRef.current = bulkPhase;
  }, [bulkPhase]);

  const [bulkUpdating, setBulkUpdating] = useState(false);

  const [storeDeliveryOption, setStoreDeliveryOption] = useState(null);
  const [businessCoords, setBusinessCoords] = useState(null);

  const [statusMap, setStatusMap] = useState({});
  const [statusesLoaded, setStatusesLoaded] = useState(false);
  const [itemsMap, setItemsMap] = useState({});

  const [orderLookup, setOrderLookup] = useState({});
  const orderLookupRef = useRef({});
  useEffect(() => {
    orderLookupRef.current = orderLookup;
  }, [orderLookup]);

  const [expandedOrderIds, setExpandedOrderIds] = useState({});
  const toggleExpanded = useCallback((id) => {
    if (!id) return;
    setExpandedOrderIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const deliveryOptionFromParamsRaw = delivery_option ? String(delivery_option).toUpperCase() : null;

  const [driverArrived, setDriverArrived] = useState(false);
  const [driverArrivedMsg, setDriverArrivedMsg] = useState('');

  const [driverDetails, setDriverDetails] = useState(null);
  const [driverRating, setDriverRating] = useState(null);
  const [rideMessage, setRideMessage] = useState('');
  const [driverAccepted, setDriverAccepted] = useState(false);

  const [driverLiveCoords, setDriverLiveCoords] = useState(null);
  const [lastDriverPing, setLastDriverPing] = useState(null);

  const driverDetailsRef = useRef(null);
  useEffect(() => {
    driverDetailsRef.current = driverDetails;
  }, [driverDetails]);

  const [sendingGrab, setSendingGrab] = useState(false);
  const [canResendGrab, setCanResendGrab] = useState(false);
  const resendTimerRef = useRef(null);

  const socketRef = useRef(null);
  const driverAcceptedRef = useRef(false);

  /* ✅ NEW: ride id state + ref */
  const [rideId, setRideId] = useState(null);
  const rideIdRef = useRef(null);
  useEffect(() => {
    rideIdRef.current = rideId;
  }, [rideId]);

  /* ✅ NEW: stable batch id we pass/save */
  const resolvedBatchId = useMemo(() => {
    const first = ordersOnScreen?.[0]?.raw || ordersOnScreen?.[0] || null;
    const id = pickBatchId(batchResponse, routeBatchId, first);
    return id != null && String(id).trim().length ? String(id) : null;
  }, [batchResponse, routeBatchId, ordersOnScreen]);

  const clearResendTimer = useCallback(() => {
    if (resendTimerRef.current) {
      clearTimeout(resendTimerRef.current);
      resendTimerRef.current = null;
    }
  }, []);

  const armResendAfterOneMinute = useCallback(() => {
    clearResendTimer();
    setCanResendGrab(false);
    resendTimerRef.current = setTimeout(() => {
      if (!driverAcceptedRef.current) setCanResendGrab(true);
    }, 60000);
  }, [clearResendTimer]);

  // ✅ cluster-only join/filter refs
  const batchOrderIdsRef = useRef(new Set());
  const joinedOrderIdsRef = useRef(new Set());
  const joinedBatchRoomRef = useRef(null);

  useEffect(() => {
    const ids = (ordersOnScreen || [])
      .map((o) => String(getOrderId(o?.raw || o) || o?.id || ''))
      .filter(Boolean);
    batchOrderIdsRef.current = new Set(ids);
  }, [ordersOnScreen]);

  /* ✅ NEW: if any order becomes OUT_FOR_DELIVERY (including ON ROAD), move bulkPhase to OUT_FOR_DELIVERY */
  const bumpPhaseIfOnRoad = useCallback((statusNorm) => {
    if (statusNorm !== 'OUT_FOR_DELIVERY') return;
    if (bulkPhaseRef.current === 'READY') {
      setBulkPhase('OUT_FOR_DELIVERY');
    }
  }, []);

  /* ✅ NEW: apply a status update into UI for a single orderId (no API call) */
  const applyStatusToUi = useCallback(
    (orderId, newStatusRaw) => {
      const norm = normalizeStatus(newStatusRaw);
      if (!orderId || !norm) return;

      bumpPhaseIfOnRoad(norm);

      setStatusMap((prev) => ({ ...prev, [String(orderId)]: norm }));

      setOrdersOnScreen((prev) =>
        prev.map((order) => {
          const base = order.raw || order || {};
          const id = getOrderId(order) || getOrderId(base) || base.order_code || base.id;
          if (!id || String(id) !== String(orderId)) return order;

          const patchedRaw = {
            ...base,
            status: norm,
            order_status: norm,
            current_status: norm,
            orderStatus: norm,
          };

          return {
            ...order,
            status: norm,
            order_status: norm,
            current_status: norm,
            orderStatus: norm,
            raw: patchedRaw,
          };
        })
      );
    },
    [bumpPhaseIfOnRoad]
  );

  /* ✅ NEW: listen for global order-updated events (driver status updates coming from other screens/sockets) */
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('order-updated', ({ id, patch }) => {
      if (!id) return;

      const orderId = String(id);
      if (batchOrderIdsRef.current?.size && !batchOrderIdsRef.current.has(orderId)) {
        // ignore updates not for this batch
        return;
      }

      const newStatus =
        patch?.status ?? patch?.order_status ?? patch?.current_status ?? patch?.orderStatus ?? patch?.job_status ?? null;

      if (!newStatus) return;

      // ✅ ON ROAD => OUT_FOR_DELIVERY + reflect immediately
      applyStatusToUi(orderId, newStatus);
    });

    return () => sub?.remove?.();
  }, [applyStatusToUi]);

  /* ✅ NEW: restore saved batch_id / ride_id when screen opens */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!businessId) return;

        if (!rideIdRef.current) {
          const savedRide = await SecureStore.getItemAsync(keyRideId(businessId));
          if (!cancelled && savedRide && String(savedRide).trim()) {
            setRideId(String(savedRide).trim());
          }
        }

        if (resolvedBatchId) {
          await SecureStore.setItemAsync(keyBatchId(businessId), String(resolvedBatchId));
        } else {
          const savedBatch = await SecureStore.getItemAsync(keyBatchId(businessId));
          logText('[SecureStore] saved batch id:', savedBatch);
        }
      } catch (e) {
        console.log('[SecureStore] restore error:', e?.message || e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [businessId, resolvedBatchId]);

  const saveRideId = useCallback(
    async (rid) => {
      try {
        if (!businessId) return;
        const v = rid != null ? String(rid).trim() : '';
        if (!v) return;
        setRideId(v);
        await SecureStore.setItemAsync(keyRideId(businessId), v);
      } catch (e) {
        console.log('[SecureStore] saveRideId error:', e?.message || e);
      }
    },
    [businessId]
  );

  const saveBatchId = useCallback(
    async (bid) => {
      try {
        if (!businessId) return;
        const v = bid != null ? String(bid).trim() : '';
        if (!v) return;
        await SecureStore.setItemAsync(keyBatchId(businessId), v);
      } catch (e) {
        console.log('[SecureStore] saveBatchId error:', e?.message || e);
      }
    },
    [businessId]
  );

  useEffect(() => {
    if (resolvedBatchId) saveBatchId(resolvedBatchId);
  }, [resolvedBatchId, saveBatchId]);

  /* ---------- fetch BUSINESS_DETAILS ---------- */
  const fetchBusinessDetails = useCallback(async () => {
    if (!businessId) return;
    try {
      const url = buildBusinessDetailsUrl(businessId);
      if (!url) return;

      const res = await fetch(url);
      if (!res.ok) return;

      const data = await res.json();
      logJson('[BIZ] BUSINESS_DETAILS json:', data);

      const biz = data?.business || data;

      const optRaw = biz?.delivery_option;
      if (optRaw) setStoreDeliveryOption(String(optRaw).toUpperCase());

      const latRaw = biz?.latitude ?? biz?.lat ?? biz?.business_latitude ?? biz?.business_lat ?? null;
      const lngRaw = biz?.longitude ?? biz?.lng ?? biz?.business_longitude ?? biz?.business_lng ?? null;

      const latNum = latRaw != null ? Number(latRaw) : NaN;
      const lngNum = lngRaw != null ? Number(lngRaw) : NaN;

      if (Number.isFinite(latNum) && Number.isFinite(lngNum)) {
        setBusinessCoords({ lat: latNum, lng: lngNum });
      }
    } catch (err) {
      console.warn('Error fetching BUSINESS_DETAILS:', err?.message || err);
    }
  }, [businessId]);

  useEffect(() => {
    fetchBusinessDetails();
  }, [fetchBusinessDetails]);

  /* ---------- fetch grouped statuses + items + lookup (FILTER to batch orders only) ---------- */
  const fetchGroupedStatusesAndItems = useCallback(async () => {
    const url = buildGroupedOrdersUrl(businessId);
    if (!url) {
      setStatusesLoaded(true);
      return;
    }

    try {
      const res = await fetch(url);

      if (!res.ok) {
        setStatusesLoaded(true);
        return;
      }

      const json = await res.json();
      logJson('[ORDERS] grouped json:', json);

      if (!json) {
        setStatusesLoaded(true);
        return;
      }

      const nextStatusMap = {};
      const nextItemsMap = {};
      const nextLookup = {};

      const rawData = Array.isArray(json?.data) ? json.data : json;

      if (Array.isArray(rawData)) {
        for (const block of rawData) {
          const blockUser = block?.user || null;

          if (block && Array.isArray(block.orders)) {
            for (const o of block.orders) {
              const id = getOrderId(o);
              if (!id) continue;

              if (batchOrderIdSet.size && !batchOrderIdSet.has(String(id))) continue;

              const st = o.status || o.order_status || o.current_status || o.orderStatus;
              const statusNorm = normalizeStatus(st);
              if (statusNorm) nextStatusMap[id] = statusNorm;

              if (Array.isArray(o.items)) nextItemsMap[id] = o.items;

              nextLookup[id] = { ...o, __user: blockUser };
            }
          }

          if (block && Array.isArray(block?.data?.orders)) {
            for (const o of block.data.orders) {
              const id = getOrderId(o);
              if (!id) continue;
              if (batchOrderIdSet.size && !batchOrderIdSet.has(String(id))) continue;

              const st = o.status || o.order_status || o.current_status || o.orderStatus;
              const statusNorm = normalizeStatus(st);
              if (statusNorm) nextStatusMap[id] = statusNorm;

              if (Array.isArray(o.items)) nextItemsMap[id] = o.items;

              nextLookup[id] = { ...o, __user: blockUser };
            }
          }
        }
      }

      // ✅ If backend already says ON ROAD, flip UI phase + pills
      const anyOutForDelivery = Object.values(nextStatusMap).some((s) => normalizeStatus(s) === 'OUT_FOR_DELIVERY');
      if (anyOutForDelivery) bumpPhaseIfOnRoad('OUT_FOR_DELIVERY');

      setStatusMap(nextStatusMap);
      setItemsMap(nextItemsMap);
      setOrderLookup(nextLookup);
      setStatusesLoaded(true);

      // ✅ patch local orders array too (so render doesn't depend only on map)
      if (anyOutForDelivery) {
        setOrdersOnScreen((prev) =>
          prev.map((order) => {
            const base = order.raw || order || {};
            const id = getOrderId(order) || getOrderId(base) || base.order_code || base.id;
            const mapped = id ? nextStatusMap[String(id)] : null;
            if (!mapped) return order;
            const norm = normalizeStatus(mapped);
            const patchedRaw = { ...base, status: norm, order_status: norm, current_status: norm, orderStatus: norm };
            return { ...order, status: norm, order_status: norm, current_status: norm, orderStatus: norm, raw: patchedRaw };
          })
        );
      }
    } catch (err) {
      console.log('[ORDERS] grouped fetch error:', err?.message || err);
      setStatusesLoaded(true);
    }
  }, [businessId, batchOrderIdSet, bumpPhaseIfOnRoad]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await fetchGroupedStatusesAndItems();
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchGroupedStatusesAndItems]);

  useFocusEffect(
    useCallback(() => {
      fetchBusinessDetails();
      fetchGroupedStatusesAndItems();
    }, [fetchBusinessDetails, fetchGroupedStatusesAndItems])
  );

  const onRefresh = useCallback(async () => {
    if (bulkUpdating) return;
    setRefreshing(true);
    try {
      await Promise.all([fetchBusinessDetails(), fetchGroupedStatusesAndItems()]);
    } finally {
      setRefreshing(false);
    }
  }, [bulkUpdating, fetchBusinessDetails, fetchGroupedStatusesAndItems]);

  /* ---------- delivery option resolution ---------- */
  const orderDeliveryHint = useMemo(() => {
    if (!ordersOnScreen?.length) return '';
    const base = ordersOnScreen[0]?.raw || ordersOnScreen[0] || {};
    const raw =
      base.delivery_option ??
      base.deliveryOption ??
      base.delivery_by ??
      base.deliveryBy ??
      base.delivery_type ??
      base.fulfillment_type ??
      '';
    if (!raw) return '';
    const up = String(raw).toUpperCase();
    if (up === 'SELF' || up === 'GRAB' || up === 'BOTH') return up;
    return '';
  }, [ordersOnScreen]);

  const deliveryOptionInitial = useMemo(() => {
    if (deliveryOptionFromParamsRaw) return deliveryOptionFromParamsRaw;
    const m = storeDeliveryOption;
    if (m && m !== 'UNKNOWN') return m;
    return orderDeliveryHint || '';
  }, [deliveryOptionFromParamsRaw, storeDeliveryOption, orderDeliveryHint]);

  const opt = (deliveryOptionInitial || '').toUpperCase();
  const storeOpt = (storeDeliveryOption || '').toUpperCase();

  const refCoords = useMemo(() => {
    if (!ordersOnScreen?.length) {
      return { lat: 27.4775469, lng: 89.6387255, cityId: 'thimphu' };
    }

    const base = ordersOnScreen[0]?.raw || ordersOnScreen[0] || {};
    const deliverTo = base?.deliver_to && typeof base.deliver_to === 'object' ? base.deliver_to : null;
    const addrObj = base?.delivery_address && typeof base.delivery_address === 'object' ? base.delivery_address : null;

    const lat =
      (deliverTo ? deliverTo.lat ?? deliverTo.latitude : null) ??
      (addrObj ? addrObj.lat ?? addrObj.latitude : null) ??
      base?.delivery_lat ??
      base?.lat ??
      27.4775469;

    const lng =
      (deliverTo ? deliverTo.lng ?? deliverTo.lon ?? deliverTo.longitude : null) ??
      (addrObj ? addrObj.lng ?? addrObj.lon ?? addrObj.longitude : null) ??
      base?.delivery_lng ??
      base?.lng ??
      89.6387255;

    const cityId =
      base?.city_id ??
      base?.city ??
      (deliverTo && (deliverTo.city ?? deliverTo.town ?? deliverTo.dzongkhag)) ??
      (addrObj && (addrObj.city ?? addrObj.town ?? addrObj.dzongkhag)) ??
      'thimphu';

    return { lat: Number(lat), lng: Number(lng), cityId: String(cityId || 'thimphu').toLowerCase() };
  }, [ordersOnScreen]);

  const clusterCenter = useMemo(() => {
    const ids = (ordersOnScreen || []).map((o) => String(getOrderId(o?.raw || o) || o?.id || '')).filter(Boolean);
    const m = orderLookupRef.current || {};
    const points = [];

    for (const id of ids) {
      const info =
        m[id] ||
        (ordersOnScreen.find((x) => String(getOrderId(x?.raw || x) || x?.id || '') === id)?.raw || {});
      const c = extractDropCoords(info);
      if (c) points.push(c);
    }

    const center = computeClusterCenter(points);
    return center;
  }, [ordersOnScreen, orderLookup]);

  const [routeInfo, setRouteInfo] = useState(null);

  useEffect(() => {
    if (!businessCoords) {
      setRouteInfo(null);
      return;
    }

    const from = businessCoords;
    const to = { lat: refCoords.lat, lng: refCoords.lng };

    if (
      !Number.isFinite(from.lat) ||
      !Number.isFinite(from.lng) ||
      !Number.isFinite(to.lat) ||
      !Number.isFinite(to.lng)
    ) {
      setRouteInfo(null);
      return;
    }

    try {
      const distanceKm = computeHaversineKm(from, to);
      if (distanceKm == null) return setRouteInfo(null);

      const avgSpeedKmh = 20;
      const etaMin = distanceKm > 0 ? (distanceKm / avgSpeedKmh) * 60 : 0;
      setRouteInfo({ distanceKm, etaMin });
    } catch {
      setRouteInfo(null);
    }
  }, [businessCoords, refCoords.lat, refCoords.lng]);

  const fetchDriverRating = useCallback(async (driverId) => {
    try {
      if (!ENV_DRIVER_RATING) return;

      let base = (ENV_DRIVER_RATING || '').trim();
      if (!base) return;

      let finalUrl = base;
      if (base.includes('{driver_id}')) {
        finalUrl = base.replace('{driver_id}', encodeURIComponent(String(driverId)));
      } else {
        const sep = base.includes('?') ? '&' : '?';
        finalUrl = `${base}${sep}driver_id=${encodeURIComponent(String(driverId))}`;
      }

      const res = await fetch(finalUrl, { method: 'GET', headers: { Accept: 'application/json' } });
      const text = await res.text();

      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {}
      if (!res.ok) throw new Error(json?.message || json?.error || `HTTP ${res.status}`);

      let avg = null;
      let count = null;
      const d = json?.summary || json?.details || json?.data || json;

      if (Array.isArray(d) && d.length > 0) {
        const first = d[0];
        avg = first.avg_rating ?? first.average_rating ?? first.rating ?? null;
        count = first.total_ratings ?? first.count ?? first.rating_count ?? null;
      } else if (d && typeof d === 'object') {
        avg = d.avg_rating ?? d.average_rating ?? d.rating ?? null;
        count = d.total_ratings ?? d.count ?? d.rating_count ?? null;
      }

      setDriverRating({ average: avg, count });
    } catch (err) {
      console.log('[Cluster] Failed to fetch driver rating:', err?.message || err);
    }
  }, []);

  const fetchDriverDetails = useCallback(
    async (driverId) => {
      try {
        if (!ENV_DRIVER_DETAILS) return;

        let base = (ENV_DRIVER_DETAILS || '').trim();
        if (!base) return;

        let finalUrl = base;
        if (base.includes('{driverId}')) {
          finalUrl = base.replace('{driverId}', encodeURIComponent(String(driverId)));
        } else {
          const sep = base.includes('?') ? '&' : '?';
          finalUrl = `${base}${sep}driverId=${encodeURIComponent(String(driverId))}`;
        }

        const res = await fetch(finalUrl, { method: 'GET', headers: { Accept: 'application/json' } });
        const text = await res.text();

        let json = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {}
        if (!res.ok) throw new Error(json?.message || json?.error || `HTTP ${res.status}`);

        const drv = json?.details || json?.data || json?.driver || json;
        setDriverDetails(drv);

        await fetchDriverRating(driverId);
      } catch (err) {
        console.log('[Cluster] Failed to fetch driver details:', err?.message || err);
      }
    },
    [fetchDriverRating]
  );

  const bulkUpdateStatus = useCallback(
    async (newStatus = 'OUT_FOR_DELIVERY', deliveryBy = null) => {
      try {
        if (!ENV_UPDATE_ORDER) return false;
        if (!ordersOnScreen?.length) return false;

        const token = await SecureStore.getItemAsync('auth_token');
        if (!token) {
          Alert.alert('Not logged in', 'Missing auth token for updating orders.');
          return false;
        }

        const reason = DEFAULT_REASON[newStatus] || `Status updated to ${newStatus}`;
        const payloadBase = { status: newStatus, status_reason: reason, reason };
        if (deliveryBy) payloadBase.delivery_option = deliveryBy;

        let anySuccess = false;
        const updatedIds = [];

        for (const rawOrder of ordersOnScreen) {
          const base = rawOrder.raw || rawOrder || {};
          const rawCode = base.order_code || base.order_id || base.id || getOrderId(base);
          if (!rawCode) continue;

          const orderCode = normalizeOrderCode(rawCode);

          try {
            await updateStatusApi({
              endpoint: ENV_UPDATE_ORDER || '',
              orderCode,
              payload: payloadBase,
              token,
            });
            anySuccess = true;

            const idForEmit = getOrderId(base) || orderCode;
            if (idForEmit != null) updatedIds.push(String(idForEmit));

            DeviceEventEmitter.emit('order-updated', {
              id: idForEmit,
              patch: { status: newStatus, status_reason: reason, delivery_option: deliveryBy },
            });
          } catch (err) {
            console.log('[Cluster] Failed to update', orderCode, err?.message || err);
          }
        }

        if (anySuccess) {
          if (updatedIds.length) {
            setOrdersOnScreen((prev) =>
              prev.map((order) => {
                const base = order.raw || order || {};
                const localId = getOrderId(order) || getOrderId(base) || base.order_code || base.id;
                if (!localId || !updatedIds.includes(String(localId))) return order;

                const patchedRaw = { ...base, status: newStatus, order_status: newStatus };
                return { ...order, status: newStatus, order_status: newStatus, raw: patchedRaw };
              })
            );

            setStatusMap((prev) => {
              const next = { ...prev };
              updatedIds.forEach((id) => (next[id] = newStatus));
              return next;
            });
            setStatusesLoaded(true);
          }

          Alert.alert(
            'Status updated',
            `All orders on this screen marked as ${newStatus.replace(/_/g, ' ')}${deliveryBy ? ` (${deliveryBy})` : ''}.`
          );
        } else {
          Alert.alert('No orders updated', 'Unable to update any orders. Please try again.');
        }

        return anySuccess;
      } catch (err) {
        Alert.alert('Update failed', String(err?.message || err));
        return false;
      }
    },
    [ordersOnScreen]
  );

  const buildBatchPayload = useCallback(async () => {
    if (!ordersOnScreen?.length) throw new Error('No orders in this batch');

    const firstOrder = ordersOnScreen[0] || {};
    const first = firstOrder?.raw || firstOrder || {};

    // ✅ FIX: passenger_id must come from grouped user (block.user) saved into orderLookup[id].__user
    const firstRawId = getOrderId(first) || getOrderId(firstOrder) || first.order_code || first.id || '';
    const firstNormId = normalizeOrderCode(firstRawId);
    const firstId =
      firstNormId && String(firstNormId).trim().length ? String(firstNormId).trim() : String(firstRawId).trim();

    const firstLookup = (orderLookupRef.current || {})[firstId] || null;

    const passengerId =
      firstLookup?.__user?.user_id ??
      firstLookup?.__user?.id ??
      firstLookup?.__user?.userId ??
      firstLookup?.user_id ??
      firstLookup?.customer_id ??
      firstLookup?.userId ??
      firstLookup?.customerId ??
      first?.user_id ??
      first?.customer_id ??
      first?.userId ??
      first?.customerId ??
      null;

    const pickupLat = businessCoords?.lat ?? 27.4728;
    const pickupLng = businessCoords?.lng ?? 89.639;

    const distanceM =
      routeInfo?.distanceKm != null && Number.isFinite(routeInfo.distanceKm)
        ? Math.max(0, Math.round(routeInfo.distanceKm * 1000))
        : 5000;

    const durationS =
      routeInfo?.etaMin != null && Number.isFinite(routeInfo.etaMin)
        ? Math.max(0, Math.round(routeInfo.etaMin * 60))
        : 1200;

    const getLookup = (rawId, normId) => {
      const m = orderLookupRef.current || {};
      return (rawId && m[String(rawId)]) || (normId && m[String(normId)]) || null;
    };

    const dropsAll = (ordersOnScreen || []).map((o) => {
      const base = o.raw || o || {};
      const rawId = getOrderId(base) || getOrderId(o) || base.order_code || base.id || '';
      const normalized = normalizeOrderCode(rawId);
      const id = normalized && String(normalized).trim().length ? String(normalized).trim() : String(rawId).trim();

      const lookup = getLookup(rawId, normalized);
      const info = lookup || base;

      const coord = extractDropCoords(info);
      const lat = coord ? coord.lat : null;
      const lng = coord ? coord.lng : null;

      const paymentRaw = String((info.payment_method ?? base.payment_method ?? '')).toUpperCase();
      const isCOD = paymentRaw === 'COD' || paymentRaw.includes('CASH');

      const totals = info.totals && typeof info.totals === 'object' ? info.totals : null;

      const amount = safeNum(
        totals?.total_amount ?? info.total_amount ?? base.total_amount ?? info.amount ?? base.amount ?? 0,
        0
      );
      const deliveryFee = safeNum(
        totals?.delivery_fee ??
          info.delivery_fee ??
          base.delivery_fee ??
          info.delivery_charges ??
          base.delivery_charges ??
          0,
        0
      );
      const platformFee = safeNum(totals?.platform_fee ?? info.platform_fee ?? base.platform_fee ?? 0, 0);
      const merchantDeliveryFee = safeNum(
        totals?.merchant_delivery_fee ?? info.merchant_delivery_fee ?? base.merchant_delivery_fee ?? 0,
        0
      );

      const dropUserId =
        info?.__user?.user_id ??
        info?.__user?.id ??
        info?.user_id ??
        base?.user_id ??
        info?.customer_id ??
        base?.customer_id ??
        null;

      return {
        order_id: id,
        user_id: dropUserId,
        address: pickAddressText(info) || pickAddressText(base),
        lat,
        lng,
        customer_name:
          info.customer_name ??
          info.user_name ??
          info.full_name ??
          base.customer_name ??
          base.user_name ??
          base.full_name ??
          info?.__user?.name ??
          info?.__user?.user_name ??
          info?.__user?.full_name ??
          '',
        customer_phone:
          info.customer_phone ??
          info.phone ??
          info.mobile ??
          base.customer_phone ??
          base.phone ??
          base.mobile ??
          info?.__user?.phone ??
          info?.__user?.mobile ??
          null,
        amount: Number(amount.toFixed(2)),
        delivery_fee: Number(deliveryFee.toFixed(2)),
        platform_fee: Number(platformFee.toFixed(2)),
        merchant_delivery_fee: Number(merchantDeliveryFee.toFixed(2)),
        payment_method: paymentRaw || 'WALLET',
        cash_to_collect: isCOD ? Number(amount.toFixed(2)) : 0,
      };
    });

    const drops = (dropsAll || []).filter((d) => d && Number.isFinite(Number(d.lat)) && Number.isFinite(Number(d.lng)));

    if (!drops.length) {
      logJson('[BATCH] drops (NO valid coords):', dropsAll);
      throw new Error('At least one valid drop with lat/lng is required');
    }

    const validDropsForFare = drops.filter((d) => d && Number.isFinite(Number(d.delivery_fee)));
    const sumDeliveryFee = validDropsForFare.reduce((acc, d) => acc + safeNum(d.delivery_fee, 0), 0);
    const avgDeliveryFee =
      validDropsForFare.length > 0 ? sumDeliveryFee / validDropsForFare.length : safeNum(first.delivery_fee ?? 0, 0);

    const batchId = pickBatchId(batchResponse, routeBatchId, first);
    if (batchId != null) saveBatchId(batchId);

    const payload = {
      passenger_id: passengerId,
      merchant_id: Number(businessId),
      cityId: refCoords.cityId || 'thimphu',
      serviceType: 'delivery',
      service_code: 'D',

      pickup: [pickupLat, pickupLng],
      pickup_place: first.business_name ?? first.store_name ?? first.restaurant?.name ?? 'Merchant shop',
      dropoff_place: 'Multiple customers',

      distance_m: distanceM,
      duration_s: durationS,
      fare: Number(avgDeliveryFee.toFixed(2)),
      currency: 'BTN',
      payment_method: { type: 'MIXED' },
      offer_code: null,

      job_type: 'BATCH',
      batch_id: batchId != null ? Number(batchId) : undefined,

      drops,
      owner_type: ownerType || undefined,
    };

    logJson('[BATCH] build payload:', payload);
    return payload;
  }, [
    ordersOnScreen,
    businessId,
    businessCoords,
    routeInfo,
    refCoords.cityId,
    ownerType,
    batchResponse,
    routeBatchId,
    saveBatchId,
  ]);

  const sendGrabDeliveryRequest = useCallback(async () => {
    try {
      if (!ENV_SEND_REQUEST_DRIVER) {
        Alert.alert('Grab delivery not configured', 'BATCH_ORDER_BROADCAST_ENDPOINT is missing.');
        return;
      }
      if (!businessId) {
        Alert.alert('Missing merchant', 'No businessId found for this cluster.');
        return;
      }
      if (!ordersOnScreen?.length) {
        Alert.alert('No orders', 'There are no READY orders in this batch.');
        return;
      }

      setSendingGrab(true);
      setRideMessage('Sending batch request to nearby drivers…');
      setCanResendGrab(false);

      setDriverArrived(false);
      setDriverArrivedMsg('');

      const payload = await buildBatchPayload();

      if (!payload?.passenger_id) {
        setRideMessage('');
        Alert.alert('Missing passenger id', 'passenger_id (customer user_id) not found in the order payload.');
        return;
      }

      const res = await fetch(ENV_SEND_REQUEST_DRIVER, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const text = await res.text();

      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {}

      if (!res.ok) {
        throw new Error(json?.message || json?.error || text || `HTTP ${res.status}`);
      }

      const respBatchId = pickBatchId(json, routeBatchId, ordersOnScreen?.[0]?.raw || ordersOnScreen?.[0]);
      if (respBatchId != null) saveBatchId(respBatchId);

      setRideMessage('Batch request sent. Waiting for a driver to accept…');
      armResendAfterOneMinute();
    } catch (e) {
      setRideMessage('');
      Alert.alert('Grab delivery failed', String(e?.message || e));
    } finally {
      setSendingGrab(false);
    }
  }, [businessId, ordersOnScreen, buildBatchPayload, armResendAfterOneMinute, routeBatchId, saveBatchId]);

  /* ---------- SOCKET: CONNECT + LISTEN (cluster-only filter) ---------- */
  useEffect(() => {
    if (!ENV_RIDE_SOCKET) return;
    if (!businessId) return;

    const socket = io(ENV_RIDE_SOCKET, {
      transports: ['websocket'],
      query: { merchantId: String(businessId), role: 'merchant' },
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[SOCKET] connected. socket.id:', socket.id);
    });

    socket.on('connect_error', (err) => {
      console.log('[SOCKET] connect_error:', err?.message || err);
    });

    const acceptHandler = (payload) => {
      logJson('[SOCKET] deliveryAccepted payload:', payload);

      driverAcceptedRef.current = true;
      setDriverAccepted(true);
      clearResendTimer();
      setCanResendGrab(false);

      const driverId =
        payload?.driver_id ?? payload?.driverId ?? payload?.driver?.id ?? payload?.driver?.driver_id ?? null;

      if (driverId != null) fetchDriverDetails(driverId);

      const rid = pickRideId(payload);
      if (rid != null) saveRideId(rid);

      const bid = extractBatchIdFromLoc(payload) ?? pickBatchId(payload, routeBatchId, null);
      if (bid != null) saveBatchId(bid);

      setRideMessage('Driver accepted the batch delivery request.');
      Alert.alert('Driver accepted', 'Driver accepted the batch delivery request.');
    };

    const arrivedHandler = (payload) => {
      logJson('[SOCKET] delivery:driver_arrived payload:', payload);

      setDriverArrived(true);

      const msg = payload?.message || payload?.status_message || payload?.note || 'Driver has arrived at the venue.';
      setDriverArrivedMsg(msg);
      setRideMessage(msg);

      const driverId =
        payload?.driver_id ?? payload?.driverId ?? payload?.driver?.id ?? payload?.driver?.driver_id ?? null;

      if (driverId != null && !driverDetailsRef.current) fetchDriverDetails(driverId);

      Alert.alert('Driver arrived', msg);
    };

    const liveHandler = (payload) => {
      const locOrderId = extractOrderIdFromLoc(payload);
      const locBatchId = extractBatchIdFromLoc(payload);

      const myBatchId =
        resolvedBatchId != null ? String(resolvedBatchId) : routeBatchId != null ? String(routeBatchId) : null;

      if (locBatchId && myBatchId && String(locBatchId) !== String(myBatchId)) {
        return;
      }

      const rid = pickRideId(payload);
      if (rid != null && !rideIdRef.current) saveRideId(rid);

      // ✅ NEW: if driver sends status updates here, apply to UI
      const st = extractStatusFromPayload(payload);
      const stNorm = normalizeStatus(st);

      if (locOrderId) {
        const setIds = batchOrderIdsRef.current;
        if (setIds?.size && !setIds.has(String(locOrderId))) return;

        if (stNorm) {
          applyStatusToUi(String(locOrderId), stNorm); // ON ROAD -> OUT_FOR_DELIVERY
        }
      } else {
        const hasCoords = !!extractDriverCoords(payload);
        const allowNoIds = !!driverAcceptedRef.current && hasCoords;

        if (!locBatchId && !allowNoIds) return;

        // If no order id but has batch id + status, apply status to all cluster orders
        if (stNorm && (locBatchId || driverAcceptedRef.current)) {
          const ids = Array.from(batchOrderIdsRef.current || []);
          ids.forEach((oid) => applyStatusToUi(String(oid), stNorm));
        }
      }

      const c = extractDriverCoords(payload);
      if (!c) return;

      setDriverLiveCoords(c);
      setLastDriverPing(new Date().toISOString());
    };

    socket.on('deliveryAccepted', acceptHandler);
    socket.on('delivery:driver_arrived', arrivedHandler);
    socket.on('deliveryDriverLocation', liveHandler);

    return () => {
      try {
        socket.off('deliveryAccepted', acceptHandler);
        socket.off('delivery:driver_arrived', arrivedHandler);
        socket.off('deliveryDriverLocation', liveHandler);
        socket.disconnect();
      } catch {}

      clearResendTimer();
      driverAcceptedRef.current = false;

      joinedOrderIdsRef.current = new Set();
      joinedBatchRoomRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    businessId,
    clearResendTimer,
    fetchDriverDetails,
    ENV_RIDE_SOCKET,
    routeBatchId,
    resolvedBatchId,
    saveRideId,
    saveBatchId,
    applyStatusToUi,
  ]);

  /* ---------- JOIN rooms: joinOrder per cluster orderId ---------- */
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    try {
      socket.emit('joinBusinessRoom', { business_id: businessId }, (ack) => {});
    } catch {}

    const myBatchId =
      resolvedBatchId != null ? String(resolvedBatchId) : routeBatchId != null ? String(routeBatchId) : null;

    if (myBatchId && joinedBatchRoomRef.current !== myBatchId) {
      try {
        socket.emit('joinBatchRoom', { batch_id: myBatchId }, (ack) => {});
        joinedBatchRoomRef.current = myBatchId;
      } catch {}
    }

    const ids = Array.from(batchOrderIdsRef.current || []);
    ids.forEach((orderId) => {
      if (!orderId) return;
      if (joinedOrderIdsRef.current.has(orderId)) return;

      socket.emit('joinOrder', { orderId }, (ack) => {});
      joinedOrderIdsRef.current.add(orderId);
    });
  }, [businessId, routeBatchId, resolvedBatchId, ordersOnScreen]);

  /* ---------- driver summary ---------- */
  const driverSummaryText = useMemo(() => {
    if (!driverDetails) return '';

    const name = driverDetails.user_name ?? driverDetails.name ?? driverDetails.full_name ?? '';
    const phone = driverDetails.phone ?? driverDetails.mobile ?? '';

    const avg = driverRating?.average;
    const count = driverRating?.count;

    const ratingPart =
      avg != null ? `Rating: ${Number(avg).toFixed(1)}${count != null ? ` (${count})` : ''}` : null;

    const parts = [];
    if (name) parts.push(name);
    if (phone) parts.push(safePhone(phone));
    if (ratingPart) parts.push(ratingPart);

    return parts.join(' · ');
  }, [driverDetails, driverRating]);

  const onSelectSelf = () => {
    setSelectedMethod('SELF');
    setRideMessage('');
    setDriverDetails(null);
    setDriverRating(null);
    setDriverAccepted(false);
    driverAcceptedRef.current = false;
    clearResendTimer();
    setCanResendGrab(false);

    setDriverArrived(false);
    setDriverArrivedMsg('');

    setDriverLiveCoords(null);
    setLastDriverPing(null);
  };

  const onSelectGrab = () => {
    setSelectedMethod('GRAB');
    setDriverDetails(null);
    setDriverRating(null);
    setDriverAccepted(false);
    driverAcceptedRef.current = false;

    setDriverArrived(false);
    setDriverArrivedMsg('');

    setLastDriverPing(null);

    sendGrabDeliveryRequest();
  };

  const onBulkOutForDeliveryPress = async () => {
    if (!selectedMethod) {
      Alert.alert('Choose delivery method', 'Please select Self delivery or Grab delivery first.');
      return;
    }
    if (selectedMethod === 'GRAB' && bulkPhase === 'READY' && !driverAccepted) {
      Alert.alert(
        'Driver not assigned yet',
        'Please wait until a driver accepts the batch request before marking orders Out for delivery.'
      );
      return;
    }

    const deliveryBy = selectedMethod === 'GRAB' ? 'GRAB' : 'SELF';
    const targetStatus = 'OUT_FOR_DELIVERY';

    setBulkUpdating(true);
    const ok = await bulkUpdateStatus(targetStatus, deliveryBy);
    setBulkUpdating(false);

    if (ok) setBulkPhase(targetStatus);
  };

  const onBulkDeliveredPress = async () => {
    const deliveryBy = 'SELF';
    const targetStatus = 'COMPLETED';

    setBulkUpdating(true);
    const ok = await bulkUpdateStatus(targetStatus, deliveryBy);
    setBulkUpdating(false);

    if (ok) setBulkPhase(targetStatus);
  };

  const onTrackLiveMap = useCallback(() => {
    if (!businessId) return Alert.alert('Missing merchant', 'businessId is missing.');
    if (!ordersOnScreen?.length) return Alert.alert('No orders', 'No orders found for this batch.');

    const finalBatchId =
      resolvedBatchId ??
      (routeBatchId != null ? String(routeBatchId) : null) ??
      pickBatchId(batchResponse, routeBatchId, ordersOnScreen?.[0]?.raw || ordersOnScreen?.[0]);

    navigation.navigate('TrackBatchOrdersScreen', {
      businessId,
      label,
      orders: ordersOnScreen,
      selectedMethod: 'GRAB',

      batch_id:
        finalBatchId != null
          ? Number.isFinite(Number(finalBatchId))
            ? Number(finalBatchId)
            : String(finalBatchId)
          : null,
      ride_id: rideIdRef.current || rideId || null,

      driverDetails,
      driverRating,
      rideMessage: rideMessage || (driverAccepted ? 'Driver accepted.' : ''),
      centerCoords: clusterCenter ? { lat: clusterCenter.lat, lng: clusterCenter.lng } : null,
      driverLiveCoords: driverLiveCoords ? { lat: driverLiveCoords.lat, lng: driverLiveCoords.lng } : null,
      businessCoords: businessCoords ? { lat: businessCoords.lat, lng: businessCoords.lng } : null,
    });
  }, [
    navigation,
    businessId,
    label,
    ordersOnScreen,
    routeBatchId,
    resolvedBatchId,
    batchResponse,
    driverDetails,
    driverRating,
    rideMessage,
    clusterCenter,
    driverLiveCoords,
    businessCoords,
    driverAccepted,
    rideId,
  ]);

  const renderOrder = ({ item }) => {
    const base = item.raw || item || {};
    const id = getOrderId(item) || item.id;

    const name = base.customer_name ?? item.customer_name ?? base.user_name ?? base.full_name ?? '';

    // ✅ prefer statusMap (already normalized), fallback to base fields
    const fromMap = statusesLoaded && id ? statusMap[String(id)] : undefined;
    const raw =
      fromMap ??
      base.status ??
      base.order_status ??
      base.current_status ??
      base.orderStatus ??
      null;

    const norm = normalizeStatus(raw);

    // ✅ final label + "..." when not loaded
    const finalLabel = statusesLoaded
      ? statusLabel(norm || (bulkPhase === 'OUT_FOR_DELIVERY' ? 'OUT_FOR_DELIVERY' : bulkPhase))
      : '...';

    const itemsFromMap = id && itemsMap[id] ? itemsMap[id] : null;
    const itemsBase = Array.isArray(base.items) ? base.items : null;
    const items = itemsFromMap || itemsBase || [];
    const hasItems = Array.isArray(items) && items.length > 0;

    let itemCount = base.total_items ?? base.items_count ?? base.item_count ?? base.total_quantity ?? base.quantity ?? null;

    if ((itemCount == null || Number(itemCount) === 0) && hasItems) {
      const sum = items.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0);
      itemCount = sum || items.length;
    }

    const isExpanded = !!expandedOrderIds[id];

    return (
      <View style={styles.orderRow}>
        <View style={styles.orderRowTop}>
          <Text style={styles.orderId}>#{id}</Text>
          {!!finalLabel && (
            <View style={styles.statusPill}>
              <Text style={styles.statusPillText}>{finalLabel}</Text>
            </View>
          )}
        </View>

        {!!name && (
          <Text style={styles.orderName} numberOfLines={1}>
            {name}
          </Text>
        )}

        {itemCount != null && (
          <Text style={styles.orderMeta} numberOfLines={1}>
            {itemCount} item{Number(itemCount) === 1 ? '' : 's'}
          </Text>
        )}

        {hasItems && (
          <View style={styles.itemsSection}>
            <TouchableOpacity style={styles.itemsToggleRow} activeOpacity={0.7} onPress={() => toggleExpanded(id)}>
              <Text style={styles.itemsToggleText}>{isExpanded ? 'Hide items' : `View items (${items.length})`}</Text>
              <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color="#4b5563" />
            </TouchableOpacity>

            {isExpanded && (
              <View style={styles.itemsList}>
                {items.map((it, index) => {
                  const itemName = it.item_name ?? it.name ?? it.menu_name ?? `Item ${index + 1}`;
                  const qty = it.quantity ?? 1;

                  return (
                    <View key={index} style={styles.itemRow}>
                      <Text style={styles.itemName} numberOfLines={2}>
                        {itemName}
                      </Text>
                      <Text style={styles.itemQty}>x{qty}</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  const headerTopPad = Math.max(insets.top, 8) + 18;

  const showSelf = !opt || opt === 'BOTH' || opt === 'SELF';
  const showGrab = !opt || opt === 'BOTH' || opt === 'GRAB';

  const showTrackBtn = selectedMethod === 'GRAB' && driverAccepted;

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <View style={[styles.headerBar, { paddingTop: headerTopPad }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#0f172a" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Delivery options</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.summaryBox}>
        <Text style={styles.summaryMain}>
          {readyCount === 0
            ? 'No orders'
            : bulkPhase === 'READY'
              ? `${readyCount === 1 ? '1 order' : `${readyCount} orders`} ready for delivery`
              : bulkPhase === 'OUT_FOR_DELIVERY'
                ? `${readyCount === 1 ? '1 order' : `${readyCount} orders`} out for delivery`
                : `${readyCount === 1 ? '1 order' : `${readyCount} orders`} delivered`}
        </Text>

        {!!label && (
          <Text style={styles.summarySub} numberOfLines={2}>
            Deliver To: {label}
          </Text>
        )}

        {!!opt && opt !== storeOpt && <Text style={styles.summarySub}>Resolved delivery option: {opt}</Text>}

        {!!initialBatchOrderIds.length && <Text style={styles.summarySub}>Batch orders: {initialBatchOrderIds.length}</Text>}

        {!!resolvedBatchId && <Text style={styles.summarySub}>Batch ID: {resolvedBatchId}</Text>}
        {!!(rideIdRef.current || rideId) && <Text style={styles.summarySub}>Ride ID: {rideIdRef.current || rideId}</Text>}

        {!!driverLiveCoords && (
          <Text style={styles.summarySub}>
            Driver live: {driverLiveCoords.lat.toFixed(5)}, {driverLiveCoords.lng.toFixed(5)}{' '}
            {lastDriverPing ? '· updated' : ''}
          </Text>
        )}
      </View>

      <View style={styles.optionsRow}>
        {showSelf && (
          <TouchableOpacity
            style={[styles.optionCard, selectedMethod === 'SELF' && { borderColor: '#16a34a', borderWidth: 2 }]}
            activeOpacity={0.8}
            onPress={onSelectSelf}
          >
            <Ionicons name="person-outline" size={28} color="#16a34a" />
            <Text style={styles.optionTitle}>Self delivery</Text>
            <Text style={styles.optionHint}>Your own rider will deliver all ready orders.</Text>
          </TouchableOpacity>
        )}

        {showGrab && (
          <TouchableOpacity
            style={[styles.optionCard, selectedMethod === 'GRAB' && { borderColor: '#16a34a', borderWidth: 2 }]}
            activeOpacity={0.8}
            onPress={onSelectGrab}
          >
            <Ionicons name="bicycle-outline" size={28} color="#2563eb" />
            <Text style={styles.optionTitle}>Grab delivery</Text>
            <Text style={styles.optionHint}>Broadcast batch request to Grab riders for all ready orders.</Text>

            {sendingGrab && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                <ActivityIndicator />
                <Text style={[styles.optionHint, { marginLeft: 8 }]}>Sending…</Text>
              </View>
            )}

            {!sendingGrab && selectedMethod === 'GRAB' && !driverAccepted && canResendGrab && (
              <TouchableOpacity style={styles.resendBtn} activeOpacity={0.85} onPress={sendGrabDeliveryRequest}>
                <Text style={styles.resendBtnText}>Send request again</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        )}
      </View>
{/* 
      {showTrackBtn && (
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.trackBtn} activeOpacity={0.85} onPress={onTrackLiveMap}>
            <Ionicons name="map-outline" size={16} color="#ffffff" />
            <Text style={styles.trackBtnText}>Track live map</Text>
          </TouchableOpacity>
        </View>
      )} */}

      {/* ✅ SELF ONLY: bulk buttons hidden when selectedMethod === 'GRAB' */}
      {readyCount > 0 && bulkPhase === 'READY' && selectedMethod === 'SELF' && (
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.actionBtnPrimary, bulkUpdating && { opacity: 0.5 }]}
            activeOpacity={!bulkUpdating ? 0.8 : 1}
            onPress={!bulkUpdating ? onBulkOutForDeliveryPress : undefined}
          >
            <Text style={styles.actionBtnPrimaryText}>Mark all as Out for delivery</Text>
          </TouchableOpacity>
        </View>
      )}

      {readyCount > 0 && bulkPhase === 'OUT_FOR_DELIVERY' && selectedMethod === 'SELF' && (
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.actionBtnPrimary, bulkUpdating && { opacity: 0.5 }]}
            activeOpacity={!bulkUpdating ? 0.8 : 1}
            onPress={!bulkUpdating ? onBulkDeliveredPress : undefined}
          >
            <Text style={styles.actionBtnPrimaryText}>Mark all as delivered</Text>
          </TouchableOpacity>
        </View>
      )}

      {selectedMethod === 'GRAB' && driverArrived ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <View style={[styles.messageCard, { borderColor: '#bbf7d0', backgroundColor: '#ecfdf3' }]}>
            <Text style={[styles.driverText, { marginTop: 0, color: '#166534' }]}>Driver arrived</Text>
            <Text style={[styles.messageText, { color: '#166534' }]}>
              {driverArrivedMsg || 'Driver has arrived at the venue.'}
            </Text>
          </View>
        </View>
      ) : null}

      {selectedMethod === 'GRAB' && (rideMessage || driverSummaryText) && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <View style={styles.messageCard}>
            {!!rideMessage && <Text style={styles.messageText}>{rideMessage}</Text>}
            {!!driverSummaryText && <Text style={styles.driverText}>{driverSummaryText}</Text>}
          </View>
        </View>
      )}

      <View style={styles.listHeader}>
        <Text style={styles.listHeaderText}>
          {bulkPhase === 'READY'
            ? 'Ready orders in this batch'
            : bulkPhase === 'OUT_FOR_DELIVERY'
              ? 'Orders out for delivery'
              : 'Delivered orders in this batch'}
        </Text>
      </View>

      <FlatList
        data={ordersOnScreen}
        keyExtractor={(item) => String(getOrderId(item) || item.id)}
        renderItem={renderOrder}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={{ paddingHorizontal: 16, paddingVertical: 20 }}>
            <Text style={{ color: '#64748b' }}>
              No batch orders found to show here. Make sure your batch create API returns order_ids (or pass batch_order_ids
              in navigation).
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

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
  backBtn: {
    height: 40,
    width: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
  },

  summaryBox: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  summaryMain: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  summarySub: { marginTop: 2, fontSize: 12, color: '#6b7280' },

  optionsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 12,
  },
  optionCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingVertical: 12,
    paddingHorizontal: 10,
    backgroundColor: '#ffffff',
  },
  optionTitle: { marginTop: 6, fontSize: 14, fontWeight: '700', color: '#0f172a' },
  optionHint: { marginTop: 4, fontSize: 11, color: '#6b7280' },

  resendBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: '#eef2ff',
    borderWidth: 1,
    borderColor: '#c7d2fe',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  resendBtnText: { fontSize: 11, fontWeight: '700', color: '#1d4ed8' },

  actionsRow: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },

  trackBtn: {
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  trackBtnText: { marginLeft: 8, color: '#ffffff', fontSize: 13, fontWeight: '800' },

  actionBtnPrimary: {
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnPrimaryText: { color: '#ffffff', fontSize: 13, fontWeight: '700' },

  messageCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f9fafb',
  },
  messageText: { fontSize: 12, color: '#4b5563' },
  driverText: { marginTop: 4, fontSize: 13, fontWeight: '600', color: '#111827' },

  listHeader: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  listHeaderText: { fontSize: 13, fontWeight: '600', color: '#0f172a' },

  orderRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  orderRowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  orderId: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#ecfdf3',
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  statusPillText: { fontSize: 10, fontWeight: '600', color: '#166534' },
  orderName: { marginTop: 2, fontSize: 12, color: '#6b7280' },
  orderMeta: { marginTop: 2, fontSize: 11, color: '#4b5563' },

  itemsSection: { marginTop: 4 },
  itemsToggleRow: {
    marginTop: 4,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemsToggleText: { fontSize: 11, color: '#2563eb', fontWeight: '500' },
  itemsList: {
    marginTop: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  itemName: { flex: 1, fontSize: 11, color: '#374151', paddingRight: 8 },
  itemQty: { fontSize: 11, fontWeight: '600', color: '#111827' },
});
