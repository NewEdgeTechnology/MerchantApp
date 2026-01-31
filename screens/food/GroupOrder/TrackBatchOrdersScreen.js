// services/food/GroupOrder/TrackBatchOrdersScreen.js
// ✅ FULL UPDATED
// ✅ FIX: Overlay (expanded map) markers no longer disappear (tracksViewChanges kept ON for overlay markers)
// ✅ FIX: Main markers still optimized (tracksViewChanges briefly true then off)
// ✅ FIX: Tapping map DOES NOT open Chrome
// ✅ NEW: Customer markers grouped by same location (distance-based) with count badge
// ✅ NEW: Tap customer marker -> in-app modal lists ALL order IDs at that location (and status)
// ✅ UPDATE: Driver marker callout shows Driver Name + Phone
// ✅ UPDATE: Removed bottom legend (route/delivered legend) from maps
// ✅ NEW: Fetch driver details using apiDRIVER_DETAILS_ENDPOINT=http://192.168.131.194:4000/api/driver_id?driverId={driverId}

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Linking,
  Alert,
  Platform,
  Modal,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import MapView, { Marker, UrlTile, PROVIDER_DEFAULT, Polyline } from "react-native-maps";
import io from "socket.io-client";
import * as SecureStore from "expo-secure-store";
import {
  ORDER_ENDPOINT as ENV_ORDER_ENDPOINT,
  BUSINESS_DETAILS as ENV_BUSINESS_DETAILS,
  RIDE_SOCKET_ENDPOINT as ENV_RIDE_SOCKET,
  DELIVERY_RIDE_ID_ENDPOINT as ENV_DELIVERY_RIDE_ID_ENDPOINT,
  DRIVER_DETAILS_ENDPOINT as ENV_DRIVER_DETAILS_ENDPOINT, // ✅ NEW
} from "@env";

/* ---------------- helpers ---------------- */

const safeStr = (v) => (v == null ? "" : String(v)).trim();

const getOrderId = (order = {}) => {
  const base = order.raw || order;
  const cand = [base.order_id, base.id, base.orderId, base.order_no, base.orderNo, base.order_code];
  for (const v of cand) {
    if (v != null && String(v).trim().length > 0) return String(v).trim();
  }
  return null;
};

const getNumericOrderId = (order = {}) => {
  const base = order.raw || order;
  const cand = [
    base.order_db_id,
    base.db_id,
    base.order_table_id,
    base.numeric_order_id,
    base.order_numeric_id,
    base.orderIdNumeric,
    base.order_id_numeric,
    base.id,
  ];
  for (const v of cand) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return Math.trunc(n);
  }
  return null;
};

const getAllOrderKeys = (order = {}) => {
  const base = order.raw || order;
  const keys = [];

  const code = getOrderId(base);
  if (code) keys.push(String(code));

  const numeric = getNumericOrderId(base);
  if (numeric) keys.push(String(numeric));

  const extra = [
    base.order_id,
    base.id,
    base.order_code,
    base.order_no,
    base.orderNo,
    base.order_db_id,
    base.db_id,
    base.order_table_id,
    base.numeric_order_id,
    base.order_numeric_id,
    base.orderIdNumeric,
    base.order_id_numeric,
  ];

  for (const v of extra) {
    const s = safeStr(v);
    if (s) keys.push(s);
  }

  return [...new Set(keys)];
};

const sameOrderKey = (a, b) => {
  const A = safeStr(a);
  const B = safeStr(b);
  if (!A || !B) return false;
  if (A === B) return true;

  const na = Number(A);
  const nb = Number(B);
  if (Number.isFinite(na) && Number.isFinite(nb) && na === nb) return true;

  const strip = (s) => String(s).replace(/^ORD[-_]?/i, "").replace(/^FOOD[-_]?/i, "");
  return strip(A) === strip(B);
};

const normalizeOrderIdsList = (arr) => {
  if (!Array.isArray(arr)) return [];
  return arr.map((x) => safeStr(x)).filter(Boolean);
};

const filterOrdersByBatchIds = (allOrders = [], batchOrderIds = []) => {
  const ids = normalizeOrderIdsList(batchOrderIds);
  if (!ids.length) return [];
  const idSet = new Set(ids);

  return (Array.isArray(allOrders) ? allOrders : []).filter((o) => {
    const keys = getAllOrderKeys(o);
    for (const k of keys) {
      for (const id of idSet) {
        if (sameOrderKey(k, id)) return true;
      }
    }
    return false;
  });
};

const filterOrdersByBatchField = (allOrders = [], batchId) => {
  const bid = safeStr(batchId);
  if (!bid) return [];
  return (Array.isArray(allOrders) ? allOrders : []).filter((o) => {
    const base = o?.raw || o || {};
    const b =
      base?.batch_id ??
      base?.delivery_batch_id ??
      base?.batchId ??
      base?.deliveryBatchId ??
      base?.raw?.batch_id ??
      null;
    return b != null && safeStr(b) === bid;
  });
};

const safePhone = (v) => {
  const s = v == null ? "" : String(v).trim();
  if (!s) return "";
  if (s.startsWith("+")) return s;
  if (s.startsWith("975")) return `+${s}`;
  return `+975${s.replace(/^0+/, "")}`;
};

const extractLatLng = (obj) => {
  if (!obj) return null;
  const cand = [
    { lat: obj.lat, lng: obj.lng },
    { lat: obj.latitude, lng: obj.longitude },
    { lat: obj.current_lat, lng: obj.current_lng },
    { lat: obj.driver_lat, lng: obj.driver_lng },
    { lat: obj?.coords?.lat, lng: obj?.coords?.lng },
    { lat: obj?.coords?.latitude, lng: obj?.coords?.longitude },
    { lat: obj?.location?.lat, lng: obj?.location?.lng },
    { lat: obj?.location?.latitude, lng: obj?.location?.longitude },
  ];
  for (const c of cand) {
    const la = Number(c.lat);
    const lo = Number(c.lng);
    if (Number.isFinite(la) && Number.isFinite(lo)) return { lat: la, lng: lo };
  }
  return null;
};

const extractOrderDropCoords = (o = {}) =>
  extractLatLng(o?.deliver_to) ||
  extractLatLng(o?.delivery_address) ||
  extractLatLng(o?.drop) ||
  extractLatLng(o?.coords) ||
  extractLatLng(o);

const buildGroupedOrdersUrl = (businessId) => {
  if (!businessId) return null;
  const tmpl = String(ENV_ORDER_ENDPOINT || "").trim();
  if (!tmpl) return null;

  if (tmpl.includes("{businessId}")) return tmpl.replace("{businessId}", encodeURIComponent(businessId));
  if (tmpl.includes(":businessId")) return tmpl.replace(":businessId", encodeURIComponent(businessId));
  if (tmpl.includes(":business_id")) return tmpl.replace(":business_id", encodeURIComponent(businessId));

  return `${tmpl.replace(/\/+$/, "")}/${encodeURIComponent(businessId)}`;
};

const buildBusinessDetailsUrl = (businessId) => {
  if (!businessId) return null;
  const tmpl = String(ENV_BUSINESS_DETAILS || "").trim();
  if (!tmpl) return null;

  if (tmpl.includes("{businessId}")) return tmpl.replace("{businessId}", encodeURIComponent(businessId));
  if (tmpl.includes(":businessId")) return tmpl.replace(":businessId", encodeURIComponent(businessId));
  if (tmpl.includes(":business_id")) return tmpl.replace(":business_id", encodeURIComponent(businessId));
  if (tmpl.includes("{business_id}")) return tmpl.replace("{business_id}", encodeURIComponent(businessId));

  return `${tmpl.replace(/\/+$/, "")}/${encodeURIComponent(businessId)}`;
};

const buildDeliveryRideUrl = (batchId) => {
  if (!batchId) return null;
  const tmpl = String(ENV_DELIVERY_RIDE_ID_ENDPOINT || "").trim();
  if (!tmpl) return null;

  if (tmpl.includes("{batch_id}")) return tmpl.replace("{batch_id}", encodeURIComponent(String(batchId)));
  if (tmpl.includes("{batchId}")) return tmpl.replace("{batchId}", encodeURIComponent(String(batchId)));

  const base = tmpl.replace(/\/+$/, "");
  const join = base.includes("?") ? "&" : "?";
  return `${base}${join}delivery_batch_id=${encodeURIComponent(String(batchId))}`;
};

// ✅ NEW: driver details endpoint builder
const buildDriverDetailsUrl = (driverId) => {
  const id = safeStr(driverId);
  if (!id) return null;
  const tmpl = String(ENV_DRIVER_DETAILS_ENDPOINT || "").trim();
  if (!tmpl) return null;

  if (tmpl.includes("{driverId}")) return tmpl.replace("{driverId}", encodeURIComponent(id));
  if (tmpl.includes(":driverId")) return tmpl.replace(":driverId", encodeURIComponent(id));

  const base = tmpl.replace(/\/+$/, "");
  const join = base.includes("?") ? "&" : "?";
  return `${base}${join}driverId=${encodeURIComponent(id)}`;
};

const isDelivered = (status) => {
  const s = String(status || "").toUpperCase().trim();
  return s === "DELIVERED" || s === "COMPLETED" || s === "COMPLETE";
};

const haversineMeters = (a, b) => {
  if (!a || !b) return Infinity;
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const lat1 = toRad(Number(a.lat));
  const lat2 = toRad(Number(b.lat));
  const dLat = toRad(Number(b.lat) - Number(a.lat));
  const dLon = toRad(Number(b.lng) - Number(a.lng));
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * c;
};

const pickRideIdFromResponse = (json) => {
  const base = json?.data ?? json ?? {};
  const cand = [
    base.delivery_ride_id,
    base.ride_id,
    base.rideId,
    base?.ride?.id,
    base?.ride?.ride_id,
    base?.result?.delivery_ride_id,
  ];
  for (const v of cand) {
    if (v != null && String(v).trim().length > 0) return String(v).trim();
  }
  return "";
};

const pickRideIdFromPayload = (p) => {
  const cand = [p?.rideId, p?.ride_id, p?.delivery_ride_id, p?.deliveryRideId, p?.room, p?.roomId];
  for (const v of cand) {
    if (v != null && String(v).trim().length > 0) return String(v).trim();
  }
  return "";
};

const normalizeBatchIdFromParams = (params) => {
  const cand = [
    params?.batch_id,
    params?.batchId,
    params?.delivery_batch_id,
    params?.deliveryBatchId,
    params?.batch?.id,
    params?.batch?.batch_id,
  ];
  for (const v of cand) {
    if (v != null && String(v).trim().length > 0) return String(v).trim();
  }
  return "";
};

const normalizeRideIdFromParams = (params) => {
  const cand = [params?.ride_id, params?.rideId, params?.delivery_ride_id, params?.deliveryRideId, params?.ride?.id];
  for (const v of cand) {
    if (v != null && String(v).trim().length > 0) return String(v).trim();
  }
  return "";
};

const asMapCoord = (p) => ({ latitude: p.lat, longitude: p.lng });

/* ---------------- SecureStore keys (SAFE) ---------------- */

const sanitizeKeyPart = (v) => {
  const s = v == null ? "" : String(v).trim();
  const cleaned = s.replace(/[^a-zA-Z0-9._-]/g, "_");
  return cleaned || "global";
};

const keyBatchId = (businessId) => `cluster_last_batch_id_${sanitizeKeyPart(businessId)}`;
const keyRideId = (businessId) => `cluster_last_ride_id_${sanitizeKeyPart(businessId)}`;
const keyDriver = (businessId) => `cluster_last_driver_${sanitizeKeyPart(businessId)}`;
const keyDriverRating = (businessId) => `cluster_last_driver_rating_${sanitizeKeyPart(businessId)}`;

/* ---------------- OSRM routing ---------------- */

const OSRM_ROUTE_BASE = "https://router.project-osrm.org/route/v1/driving";
const tileTemplate = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

const fetchOsrmRoute2 = async (a, b) => {
  const url = `${OSRM_ROUTE_BASE}/${a.lng},${a.lat};${b.lng},${b.lat}?geometries=geojson&overview=full`;
  const res = await fetch(url);
  const json = await res.json();
  const line = json?.routes?.[0]?.geometry?.coordinates;
  if (!Array.isArray(line) || line.length < 2) return [];
  return line.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));
};

/* ---------------- Items helpers ---------------- */

const pickItemName = (it) =>
  safeStr(
    it?.item_name ??
      it?.name ??
      it?.product_name ??
      it?.title ??
      it?.item?.name ??
      it?.product?.name ??
      it?.food_name ??
      it?.menu_name ??
      it?.variant_name
  ) || "Item";

const pickItemQty = (it) => {
  const n = Number(
    it?.qty ??
      it?.quantity ??
      it?.count ??
      it?.item_qty ??
      it?.itemQuantity ??
      it?.order_qty ??
      it?.cart_qty ??
      it?.units
  );
  return Number.isFinite(n) && n > 0 ? n : 1;
};

const pickItemPrice = (it) => {
  const n = Number(it?.price ?? it?.unit_price ?? it?.unitPrice ?? it?.selling_price ?? it?.amount ?? it?.rate ?? it?.mrp);
  return Number.isFinite(n) ? n : null;
};

const formatMoney = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return `${n.toFixed(2)}`;
};

const extractDriverInfoFromPayload = (p) => {
  if (!p) return null;
  const name =
    p?.driver_name ??
    p?.driverName ??
    p?.user_name ??
    p?.userName ??
    p?.name ??
    p?.full_name ??
    p?.fullName ??
    "";
  const phone = p?.driver_phone ?? p?.driverPhone ?? p?.phone ?? p?.mobile ?? p?.contact ?? "";
  const coords = extractLatLng(p) || extractLatLng(p?.driver) || extractLatLng(p?.location);
  const out = {};
  if (name) out.user_name = name;
  if (phone) out.phone = phone;
  if (coords) {
    out.lat = coords.lat;
    out.lng = coords.lng;
  }
  return Object.keys(out).length ? out : null;
};

// ✅ NEW: extract driverId from payload/params/driverInfo
const extractDriverId = (p) => {
  if (!p) return "";
  const cand = [
    p?.driverId,
    p?.driver_id,
    p?.driver?.id,
    p?.driver?.driver_id,
    p?.driver?.user_id,
    p?.driver_user_id,
    p?.user_id,
    p?.id,
  ];
  for (const v of cand) {
    const s = safeStr(v);
    if (s) return s;
  }
  return "";
};

/* ---------------- Location grouping ---------------- */

const groupDropsByDistance = (orders = [], distanceMeters = 12) => {
  const groups = [];
  for (const o of orders || []) {
    const base = o?.raw || o || {};
    const coords = extractOrderDropCoords(base);
    if (!coords) continue;

    const orderId = getOrderId(base) || getOrderId(o) || safeStr(base?.id) || "";
    if (!orderId) continue;

    let placed = false;
    for (const g of groups) {
      const d = haversineMeters({ lat: g.lat, lng: g.lng }, coords);
      if (d <= distanceMeters) {
        g.orderIds.push(orderId);
        g.orders.push(o);
        placed = true;
        break;
      }
    }

    if (!placed) {
      groups.push({
        lat: coords.lat,
        lng: coords.lng,
        orderIds: [orderId],
        orders: [o],
      });
    }
  }

  return groups.map((g, idx) => ({
    ...g,
    key: `${g.lat.toFixed(5)},${g.lng.toFixed(5)}_${idx}`,
    count: g.orderIds.length,
  }));
};

export default function TrackBatchOrdersScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const route = useRoute();

  const params = route.params || {};
  const {
    businessId,
    label,
    orders: passedOrdersRaw = [],
    selectedMethod,
    driverDetails: driverDetailsFromParams,
    driverRating: driverRatingFromParams,
    rideMessage,
    socketEndpoint,
    rideIds = [],
    batch_order_ids: batchOrderIdsFromParams,
  } = params;

  const headerTopPad = Math.max(insets.top, 8) + 18;

  /* ---------------- IDs: params -> securestore -> fetch ---------------- */

  const [batchId, setBatchId] = useState(() => normalizeBatchIdFromParams(params));
  const [deliveryRideId, setDeliveryRideId] = useState(() => normalizeRideIdFromParams(params));
  const [restoredIds, setRestoredIds] = useState(false);

  /* ---------------- Driver details ---------------- */

  const [driverInfo, setDriverInfo] = useState(driverDetailsFromParams || null);
  const [driverRating, setDriverRating] = useState(driverRatingFromParams || null);

  // ✅ NEW: driverId state + throttling for details fetch
  const [driverId, setDriverId] = useState(() => extractDriverId(driverDetailsFromParams) || extractDriverId(params) || "");
  const lastDriverDetailsFetchMsRef = useRef(0);

  useEffect(() => {
    if (driverDetailsFromParams) setDriverInfo(driverDetailsFromParams);
    const id = extractDriverId(driverDetailsFromParams);
    if (id) setDriverId(id);
  }, [driverDetailsFromParams]);

  useEffect(() => {
    if (driverRatingFromParams) setDriverRating(driverRatingFromParams);
  }, [driverRatingFromParams]);

  /* ---------------- batch order ids ---------------- */

  const batchOrderIds = useMemo(() => normalizeOrderIdsList(batchOrderIdsFromParams), [batchOrderIdsFromParams]);

  /* ---------------- orders for this batch (BATCH ONLY) ---------------- */

  const [batchOrders, setBatchOrders] = useState(() => {
    const passedOrders = Array.isArray(passedOrdersRaw) ? passedOrdersRaw : [];

    if (Array.isArray(batchOrderIdsFromParams) && batchOrderIdsFromParams.length) {
      return filterOrdersByBatchIds(passedOrders, batchOrderIdsFromParams);
    }

    const initialBid = normalizeBatchIdFromParams(params);
    if (initialBid) return filterOrdersByBatchField(passedOrders, initialBid);

    return [];
  });

  const [batchOrdersLoading, setBatchOrdersLoading] = useState(false);

  /* ---------------- Restore from SecureStore ---------------- */

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const bKey = keyBatchId(businessId);
        const rKey = keyRideId(businessId);
        const dKey = keyDriver(businessId);
        const drKey = keyDriverRating(businessId);

        const [savedBatch, savedRide, savedDriverJson, savedDriverRatingJson] = await Promise.all([
          SecureStore.getItemAsync(bKey),
          SecureStore.getItemAsync(rKey),
          SecureStore.getItemAsync(dKey),
          SecureStore.getItemAsync(drKey),
        ]);

        if (cancelled) return;

        if (!batchId && savedBatch && String(savedBatch).trim()) setBatchId(String(savedBatch).trim());
        if (!deliveryRideId && savedRide && String(savedRide).trim()) setDeliveryRideId(String(savedRide).trim());

        if (!driverInfo && savedDriverJson) {
          try {
            const parsed = JSON.parse(savedDriverJson);
            if (parsed && typeof parsed === "object") {
              setDriverInfo(parsed);
              const id = extractDriverId(parsed);
              if (id) setDriverId(id);
            }
          } catch {}
        }
        if (!driverRating && savedDriverRatingJson) {
          try {
            const parsed = JSON.parse(savedDriverRatingJson);
            if (parsed && typeof parsed === "object") setDriverRating(parsed);
          } catch {}
        }
      } catch (e) {
        console.log("[SecureStore] restore error:", e?.message || e);
      } finally {
        if (!cancelled) setRestoredIds(true);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  /* ---------------- Save whenever we have ids + driver ---------------- */

  useEffect(() => {
    (async () => {
      try {
        const bKey = keyBatchId(businessId);
        const rKey = keyRideId(businessId);
        const dKey = keyDriver(businessId);
        const drKey = keyDriverRating(businessId);

        if (batchId) await SecureStore.setItemAsync(bKey, String(batchId));
        if (deliveryRideId) await SecureStore.setItemAsync(rKey, String(deliveryRideId));

        if (driverInfo) {
          try {
            await SecureStore.setItemAsync(dKey, JSON.stringify(driverInfo));
          } catch {}
        }
        if (driverRating) {
          try {
            await SecureStore.setItemAsync(drKey, JSON.stringify(driverRating));
          } catch {}
        }
      } catch (e) {
        console.log("[SecureStore] save error:", e?.message || e);
      }
    })();
  }, [businessId, batchId, deliveryRideId, driverInfo, driverRating]);

  /* ---------------- If ride id missing but batch id exists, fetch ride id ---------------- */

  const fetchDeliveryRideId = useCallback(async () => {
    if (!batchId) {
      console.log("[MERCHANT][RIDE_ID] ⚠️ batch_id missing, will use rideIds if provided");
      return;
    }
    if (deliveryRideId) return;

    const url = buildDeliveryRideUrl(batchId);
    if (!url) {
      console.log("[MERCHANT][RIDE_ID] ❌ DELIVERY_RIDE_ID_ENDPOINT missing in .env");
      return;
    }

    console.log("[MERCHANT][RIDE_ID] ▶️ fetching delivery ride id:", url);

    try {
      const res = await fetch(url);
      const text = await res.text();

      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }

      if (!res.ok) {
        console.log("[MERCHANT][RIDE_ID] ❌ fetch failed:", res.status, text);
        return;
      }

      const rid = pickRideIdFromResponse(json);
      if (rid) {
        console.log("[MERCHANT][RIDE_ID] ✅ delivery_ride_id:", rid);
        setDeliveryRideId(rid);
      } else {
        console.log("[MERCHANT][RIDE_ID] ⚠️ ride id not found in response:", json);
      }
    } catch (e) {
      console.log("[MERCHANT][RIDE_ID] ❌ error:", e?.message || e);
    }
  }, [batchId, deliveryRideId]);

  useEffect(() => {
    if (!restoredIds) return;
    fetchDeliveryRideId();
  }, [restoredIds, fetchDeliveryRideId]);

  const effectiveRideIds = useMemo(() => {
    const set = new Set();
    const a = String(deliveryRideId || "").trim();
    if (a) set.add(a);

    if (Array.isArray(rideIds)) {
      for (const r of rideIds) {
        const s = String(r || "").trim();
        if (s) set.add(s);
      }
    }
    return Array.from(set);
  }, [deliveryRideId, rideIds]);

  /* ---------------- state: map + status/items ---------------- */

  const [refreshing, setRefreshing] = useState(false);
  const [statusMap, setStatusMap] = useState({});
  const [itemsMap, setItemsMap] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [businessCoords, setBusinessCoords] = useState(null);

  const [driversByRideId, setDriversByRideId] = useState({});
  const [routeDriverToBiz, setRouteDriverToBiz] = useState([]);
  const [routeBizToCustomer, setRouteBizToCustomer] = useState([]);

  const lastRouteKeyRef = useRef("");
  const lastRouteAtMsRef = useRef(0);

  const [overlayOpen, setOverlayOpen] = useState(false);
  const overlayMapRef = useRef(null);
  const overlayDidFitOnceRef = useRef(false);

  const mapRef = useRef(null);
  const socketRef = useRef(null);

  const lastDriverUpdateMsRef = useRef(0);
  const didFitOnceRef = useRef(false);
  const lastMarkerPressTsRef = useRef(0);

  // ✅ Main map: briefly true then off
  const [trackMarkerViewsMain, setTrackMarkerViewsMain] = useState(true);

  useEffect(() => {
    setTrackMarkerViewsMain(true);
    const t = setTimeout(() => setTrackMarkerViewsMain(false), 1400);
    return () => clearTimeout(t);
  }, [Object.keys(driversByRideId || {}).length, businessCoords?.lat, businessCoords?.lng]);

  /* ---------------- seed initial driver coords (if available) ---------------- */

  useEffect(() => {
    const seed = extractLatLng(driverInfo);
    if (!seed) return;

    setDriversByRideId((prev) => {
      const rid = String(deliveryRideId || effectiveRideIds?.[0] || "driver").trim();
      const next = { ...(prev || {}) };
      next[rid] = { coords: seed, lastPing: new Date().toISOString(), batchId: batchId || null };
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverInfo]);

  /* ---------------- ensure batchOrders always "batch only" ---------------- */

  useEffect(() => {
    const passedOrders = Array.isArray(passedOrdersRaw) ? passedOrdersRaw : [];

    if (batchOrderIds.length) {
      setBatchOrders(filterOrdersByBatchIds(passedOrders, batchOrderIds));
      return;
    }

    if (batchId) {
      setBatchOrders(filterOrdersByBatchField(passedOrders, batchId));
      return;
    }

    setBatchOrders([]);
  }, [passedOrdersRaw, batchOrderIds.join("|"), batchId]);

  /* ---------------- load batch orders (if not available) ---------------- */

  const fetchAllGroupedOrdersFlat = useCallback(async () => {
    const url = buildGroupedOrdersUrl(businessId);
    if (!url) return [];

    try {
      const token = await SecureStore.getItemAsync("auth_token");
      const headers = { Accept: "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(url, { headers });
      const text = await res.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {}

      if (!res.ok) return [];

      const rawData = Array.isArray(json?.data) ? json.data : json;
      const collected = [];

      if (Array.isArray(rawData)) {
        for (const block of rawData) {
          if (block && Array.isArray(block.orders)) {
            for (const o of block.orders) collected.push(o);
          } else if (block && (block.id || block.order_id || block.order_code)) {
            collected.push(block);
          }
        }
      }

      return collected;
    } catch {
      return [];
    }
  }, [businessId]);

  const loadBatchOrders = useCallback(async () => {
    if (!businessId) return;
    if (!batchOrderIds.length && !batchId) return;

    if (Array.isArray(batchOrders) && batchOrders.length) return;

    setBatchOrdersLoading(true);
    try {
      const all = await fetchAllGroupedOrdersFlat();
      if (!all.length) return;

      let picked = [];
      if (batchOrderIds.length) picked = filterOrdersByBatchIds(all, batchOrderIds);
      else picked = filterOrdersByBatchField(all, batchId);

      if (picked.length) setBatchOrders(picked);
    } finally {
      setBatchOrdersLoading(false);
    }
  }, [businessId, batchOrderIds, batchId, batchOrders, fetchAllGroupedOrdersFlat]);

  useEffect(() => {
    loadBatchOrders();
  }, [loadBatchOrders]);

  useEffect(() => {
    if (!restoredIds) return;
    if (!businessId) return;
    if (!batchId && !batchOrderIds.length) return;
    if (batchOrdersLoading) return;
    if (Array.isArray(batchOrders) && batchOrders.length > 0) return;

    const t = setInterval(() => {
      loadBatchOrders();
    }, 6000);

    return () => clearInterval(t);
  }, [restoredIds, businessId, batchId, batchOrderIds.length, batchOrders?.length, batchOrdersLoading, loadBatchOrders]);

  /* ---------------- grouped fetch (status/items only) ---------------- */

  const fetchGroupedStatusesItems = useCallback(async () => {
    const url = buildGroupedOrdersUrl(businessId);
    if (!url) {
      setLoaded(true);
      return;
    }

    try {
      const token = await SecureStore.getItemAsync("auth_token");
      const headers = { Accept: "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(url, { headers });
      if (!res.ok) {
        setLoaded(true);
        return;
      }
      const json = await res.json();

      const nextStatusMap = {};
      const nextItemsMap = {};

      const rawData = Array.isArray(json?.data) ? json.data : json;
      if (Array.isArray(rawData)) {
        for (const block of rawData) {
          if (block && Array.isArray(block.orders)) {
            for (const o of block.orders) {
              const id = getOrderId(o);
              if (!id) continue;

              const status = o.status || o.order_status || o.current_status || o.orderStatus;
              if (status) nextStatusMap[id] = status;
              if (Array.isArray(o.items)) nextItemsMap[id] = o.items;
            }
          } else if (block) {
            const id = getOrderId(block);
            const status = block.status || block.order_status || block.current_status || block.orderStatus;
            if (id && status) nextStatusMap[id] = status;
            if (id && Array.isArray(block.items)) nextItemsMap[id] = block.items;
          }
        }
      }

      setStatusMap(nextStatusMap);
      setItemsMap(nextItemsMap);
      setLoaded(true);
    } catch {
      setLoaded(true);
    }
  }, [businessId]);

  const fetchBusinessLocation = useCallback(async () => {
    const url = buildBusinessDetailsUrl(businessId);
    if (!url) return;

    try {
      const token = await SecureStore.getItemAsync("auth_token");
      const headers = { Accept: "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(url, { headers });
      if (!res.ok) return;
      const json = await res.json();

      const base = json?.data || json || {};
      const coords =
        extractLatLng(base) ||
        extractLatLng(base?.business) ||
        extractLatLng(base?.restaurant) ||
        extractLatLng(base?.shop) ||
        extractLatLng(base?.location);

      if (coords) setBusinessCoords(coords);
    } catch {}
  }, [businessId]);

  // ✅ NEW: fetch driver details by driverId
  const fetchDriverDetailsById = useCallback(
    async (id, opts = { force: false }) => {
      const driverIdClean = safeStr(id);
      if (!driverIdClean) return;

      const url = buildDriverDetailsUrl(driverIdClean);
      if (!url) {
        console.log("[MERCHANT][DRIVER] ❌ DRIVER_DETAILS_ENDPOINT missing in .env");
        return;
      }

      const now = Date.now();
      const minGap = 10_000;
      if (!opts?.force && now - lastDriverDetailsFetchMsRef.current < minGap) return;
      lastDriverDetailsFetchMsRef.current = now;

      try {
        const token = await SecureStore.getItemAsync("auth_token");
        const headers = { Accept: "application/json" };
        if (token) headers.Authorization = `Bearer ${token}`;

        console.log("[MERCHANT][DRIVER] ▶️ fetching driver details:", url);
        const res = await fetch(url, { headers });
        const text = await res.text();

        let json = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {
          json = null;
        }

        if (!res.ok) {
          console.log("[MERCHANT][DRIVER] ❌ fetch failed:", res.status, text);
          return;
        }

        const details = json?.details || json?.data?.details || json?.data || json || null;
        if (!details || typeof details !== "object") {
          console.log("[MERCHANT][DRIVER] ⚠️ details missing:", json);
          return;
        }

        setDriverInfo((prev) => {
          const next = { ...(prev || {}) };
          // normalize fields based on your response payload
          if (details.user_id != null) next.user_id = details.user_id;
          if (details.user_name) next.user_name = details.user_name;
          if (details.phone) next.phone = details.phone;
          if (details.email) next.email = details.email;
          if (details.profile_image) next.profile_image = details.profile_image;
          if (details.role) next.role = details.role;
          return next;
        });

        const extracted = extractDriverId(details);
        if (extracted) setDriverId(extracted);
      } catch (e) {
        console.log("[MERCHANT][DRIVER] ❌ error:", e?.message || e);
      }
    },
    [setDriverInfo]
  );

  useEffect(() => {
    fetchGroupedStatusesItems();
    fetchBusinessLocation();
  }, [fetchGroupedStatusesItems, fetchBusinessLocation]);

  useEffect(() => {
    if (!restoredIds) return;
    if (driverId) fetchDriverDetailsById(driverId);
  }, [restoredIds, driverId, fetchDriverDetailsById]);

  useFocusEffect(
    useCallback(() => {
      fetchGroupedStatusesItems();
      fetchBusinessLocation();
      if (restoredIds) fetchDeliveryRideId();
      loadBatchOrders();

      // ✅ refresh driver details on focus (lightly throttled)
      if (driverId) fetchDriverDetailsById(driverId);
    }, [
      fetchGroupedStatusesItems,
      fetchBusinessLocation,
      restoredIds,
      fetchDeliveryRideId,
      loadBatchOrders,
      driverId,
      fetchDriverDetailsById,
    ])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchGroupedStatusesItems(), fetchBusinessLocation(), fetchDeliveryRideId()]);
      if (driverId) await fetchDriverDetailsById(driverId, { force: true });
      setBatchOrders([]);
      await loadBatchOrders();
    } finally {
      setRefreshing(false);
    }
  }, [fetchGroupedStatusesItems, fetchBusinessLocation, fetchDeliveryRideId, loadBatchOrders, driverId, fetchDriverDetailsById]);

  /* ---------------- SOCKET ---------------- */

  useEffect(() => {
    const endpoint = String(socketEndpoint || ENV_RIDE_SOCKET || "").trim();
    if (!endpoint) {
      console.log("[MERCHANT][SOCKET] ❌ No socket endpoint");
      return;
    }

    if (!restoredIds) return;

    if (!effectiveRideIds.length) {
      console.log("[MERCHANT][JOIN] ⏳ waiting for delivery_ride_id / rideIds (batch_id:", batchId || "—", ")");
      return;
    }

    const socket = io(endpoint, {
      transports: ["websocket"],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 50,
      reconnectionDelay: 600,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("[MERCHANT][SOCKET] ✅ connected:", socket.id);

      for (const rid of effectiveRideIds) {
        console.log("[MERCHANT][JOIN] ▶️ emitting joinRide:", { rideId: String(rid) });

        socket.emit("joinRide", { rideId: String(rid) }, (ack) => {
          console.log("[MERCHANT][JOIN] ✅ joinRide ack:", rid, ack);
        });
      }
    });

    socket.on("disconnect", (reason) => console.log("[MERCHANT][SOCKET] 🔌 disconnected:", reason));
    socket.on("connect_error", (e) => console.log("[MERCHANT][SOCKET] ❌ connect_error:", e?.message || e));

    const onDriverLocation = (p) => {
      const now = Date.now();
      if (now - lastDriverUpdateMsRef.current < 800) return;
      lastDriverUpdateMsRef.current = now;

      const coords = extractLatLng(p);
      if (!coords) return;

      const ridFromPayload = pickRideIdFromPayload(p);
      const rid = String(ridFromPayload || effectiveRideIds[0] || "driver").trim();

      // ✅ NEW: capture driverId & fetch details
      const pid = extractDriverId(p) || extractDriverId(p?.driver) || "";
      if (pid) {
        setDriverId(pid);
        // fetch on first sight or if missing name/phone (throttled)
        const missingBasics = !safeStr(driverInfo?.user_name) && !safeStr(driverInfo?.name) && !safeStr(driverInfo?.phone);
        fetchDriverDetailsById(pid, { force: missingBasics });
      }

      const maybeDriver = extractDriverInfoFromPayload(p);
      if (maybeDriver) {
        setDriverInfo((prev) => ({ ...(prev || {}), ...maybeDriver }));
      }

      setDriversByRideId((prev) => {
        const prevEntry = prev?.[rid];
        if (prevEntry?.coords && haversineMeters(prevEntry.coords, coords) < 5) return prev;

        const next = { ...(prev || {}) };
        next[rid] = { coords, lastPing: new Date().toISOString(), batchId: batchId || null };
        return next;
      });

      // retrigger main marker tracking (overlay markers are always tracking)
      setTrackMarkerViewsMain(true);
      setTimeout(() => setTrackMarkerViewsMain(false), 1400);
    };

    socket.on("deliveryDriverLocation", onDriverLocation);

    return () => {
      try {
        socket.off("deliveryDriverLocation", onDriverLocation);
        socket.disconnect();
      } catch {}
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socketEndpoint, restoredIds, effectiveRideIds.join("|"), batchId, fetchDriverDetailsById, driverInfo]);

  /* ---------------- UI derived ---------------- */

  const title = useMemo(() => {
    const c = batchOrders.length;
    const base = c === 1 ? "1 order" : `${c} orders`;
    const method = selectedMethod ? ` · ${selectedMethod}` : "";
    const bid = batchId ? ` · Batch #${batchId}` : "";
    const rid =
      effectiveRideIds.length === 1
        ? ` · Ride #${effectiveRideIds[0]}`
        : effectiveRideIds.length > 1
        ? ` · ${effectiveRideIds.length} rides`
        : "";
    return `${base}${method}${bid}${rid}`;
  }, [batchOrders.length, selectedMethod, batchId, effectiveRideIds]);

  const driverName = useMemo(() => {
    const d = driverInfo || {};
    return safeStr(d?.user_name ?? d?.name ?? d?.full_name ?? d?.fullName ?? "") || "Driver";
  }, [driverInfo]);

  const driverPhoneText = useMemo(() => {
    const p = driverInfo?.phone ?? driverInfo?.mobile ?? driverInfo?.contact ?? "";
    return safePhone(p);
  }, [driverInfo]);

  const driverSummaryText = useMemo(() => {
    const avg = driverRating?.average;
    const count = driverRating?.count;
    const ratingPart = avg != null ? ` · ${Number(avg).toFixed(1)}${count != null ? ` (${count})` : ""}` : "";
    const phonePart = driverPhoneText ? ` · ${driverPhoneText}` : "";
    const idPart = driverId ? ` · ID: ${driverId}` : "";
    return `${driverName}${phonePart}${ratingPart}${idPart}`.trim();
  }, [driverName, driverPhoneText, driverRating, driverId]);

  const onCallDriver = useCallback(async () => {
    if (!driverPhoneText) return Alert.alert("No phone", "Driver phone number not available yet.");
    try {
      await Linking.openURL(`tel:${driverPhoneText}`);
    } catch {
      Alert.alert("Cannot call", "Your device cannot place calls.");
    }
  }, [driverPhoneText]);

  const mapInitialRegion = useMemo(() => {
    const anyDriver = Object.values(driversByRideId || {})[0]?.coords || null;
    const base = businessCoords || anyDriver || null;
    if (!base) return null;
    return {
      latitude: base.lat,
      longitude: base.lng,
      latitudeDelta: businessCoords ? 0.02 : 0.06,
      longitudeDelta: businessCoords ? 0.02 : 0.06,
    };
  }, [businessCoords, driversByRideId]);

  const showMap = Boolean(mapInitialRegion);

  /* ---------------- Grouped customer points ---------------- */

  const groupedDropPoints = useMemo(() => groupDropsByDistance(batchOrders, 12), [batchOrders]);

  /* ---------------- Fit helpers (includes grouped customers) ---------------- */

  const fitToPoints = useCallback(
    (ref) => {
      if (!ref?.current) return;

      const pts = [];
      if (businessCoords) pts.push(asMapCoord(businessCoords));

      for (const rid of Object.keys(driversByRideId || {})) {
        const c = driversByRideId?.[rid]?.coords;
        if (c) pts.push(asMapCoord(c));
      }

      for (const g of groupedDropPoints) {
        pts.push({ latitude: g.lat, longitude: g.lng });
      }

      if (!pts.length) return;

      if (pts.length >= 2) {
        ref.current.fitToCoordinates(pts, {
          edgePadding: { top: 90, right: 60, bottom: 110, left: 60 },
          animated: true,
        });
      } else {
        ref.current.animateToRegion(
          { latitude: pts[0].latitude, longitude: pts[0].longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 },
          250
        );
      }
    },
    [businessCoords, driversByRideId, groupedDropPoints]
  );

  const fitAll = useCallback(() => fitToPoints(mapRef), [fitToPoints]);
  const fitOverlay = useCallback(() => fitToPoints(overlayMapRef), [fitToPoints]);

  const openOverlay = useCallback(() => {
    if (!mapInitialRegion) return;
    if (Date.now() - lastMarkerPressTsRef.current < 300) return;
    overlayDidFitOnceRef.current = false;
    setOverlayOpen(true);
  }, [mapInitialRegion]);

  /* ---------------- ROUTES: driver->business and business->customer ---------------- */

  const pickCustomerGroupForRoute = useMemo(() => {
    if (!groupedDropPoints.length) return null;
    for (const g of groupedDropPoints) {
      let anyUndelivered = false;
      for (const oid of g.orderIds) {
        const st = statusMap?.[oid];
        if (!isDelivered(st)) {
          anyUndelivered = true;
          break;
        }
      }
      if (anyUndelivered) return g;
    }
    return groupedDropPoints[0];
  }, [groupedDropPoints, statusMap]);

  const computeTwoLegRoute = useCallback(async () => {
    const firstDriverKey = Object.keys(driversByRideId || {})[0];
    const driver = firstDriverKey ? driversByRideId?.[firstDriverKey]?.coords : null;
    const biz = businessCoords;
    const customer = pickCustomerGroupForRoute ? { lat: pickCustomerGroupForRoute.lat, lng: pickCustomerGroupForRoute.lng } : null;

    const key = [
      driver ? `${driver.lat.toFixed(5)},${driver.lng.toFixed(5)}` : "no-driver",
      biz ? `${biz.lat.toFixed(5)},${biz.lng.toFixed(5)}` : "no-biz",
      customer ? `${customer.lat.toFixed(5)},${customer.lng.toFixed(5)}` : "no-customer",
    ].join("|");

    const now = Date.now();
    const changed = key !== lastRouteKeyRef.current;
    if (!changed && now - lastRouteAtMsRef.current < 6000) return;

    lastRouteKeyRef.current = key;
    lastRouteAtMsRef.current = now;

    if (!driver || !biz) setRouteDriverToBiz([]);
    if (!biz || !customer) setRouteBizToCustomer([]);

    if (driver && biz) {
      try {
        const coords = await fetchOsrmRoute2(driver, biz);
        setRouteDriverToBiz(coords);
      } catch {
        setRouteDriverToBiz([
          { latitude: driver.lat, longitude: driver.lng },
          { latitude: biz.lat, longitude: biz.lng },
        ]);
      }
    }

    if (biz && customer) {
      try {
        const coords = await fetchOsrmRoute2(biz, customer);
        setRouteBizToCustomer(coords);
      } catch {
        setRouteBizToCustomer([
          { latitude: biz.lat, longitude: biz.lng },
          { latitude: customer.lat, longitude: customer.lng },
        ]);
      }
    }
  }, [driversByRideId, businessCoords, pickCustomerGroupForRoute]);

  useEffect(() => {
    computeTwoLegRoute();
  }, [computeTwoLegRoute]);

  /* ---------------- Expandable items dropdown ---------------- */

  const [expandedMap, setExpandedMap] = useState({});
  const toggleExpanded = useCallback((orderId) => {
    const id = String(orderId || "");
    if (!id) return;
    setExpandedMap((prev) => ({ ...(prev || {}), [id]: !prev?.[id] }));
  }, []);

  /* ---------------- Marker -> Orders modal (group) ---------------- */

  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);

  const openGroupModal = useCallback((group) => {
    if (!group) return;
    lastMarkerPressTsRef.current = Date.now();
    setSelectedGroup(group);
    setLocationModalOpen(true);
  }, []);

  const closeGroupModal = useCallback(() => {
    setLocationModalOpen(false);
    setSelectedGroup(null);
  }, []);

  const selectedGroupRows = useMemo(() => {
    const g = selectedGroup;
    if (!g?.orderIds?.length) return [];
    return g.orderIds.map((oid) => {
      const st = statusMap?.[oid] || "";
      const label = st ? String(st).toUpperCase().replace(/_/g, " ") : "—";
      return { orderId: oid, status: label, delivered: isDelivered(st) };
    });
  }, [selectedGroup, statusMap]);

  /* ---------------- Marker Components ---------------- */

  const DriverMarker = ({ rid, entry, overlay }) => {
    if (!entry?.coords) return null;

    const titleText = `${driverName} (Live)`;
    const descText = driverPhoneText ? `${driverPhoneText}` : "Phone not available";

    // ✅ Overlay markers: keep tracksViewChanges ON so they won't disappear in Modal on Android
    const tvc = overlay ? true : trackMarkerViewsMain;

    return (
      <Marker
        key={`${overlay ? "overlay" : "main"}-driver-${rid}`}
        coordinate={{ latitude: entry.coords.lat, longitude: entry.coords.lng }}
        title={titleText}
        description={descText}
        tracksViewChanges={tvc}
        onPress={() => (lastMarkerPressTsRef.current = Date.now())}
        anchor={{ x: 0.5, y: 0.5 }}
        zIndex={60}
      >
        <View style={styles.driverMarkerOuter} collapsable={false} renderToHardwareTextureAndroid needsOffscreenAlphaCompositing>
          <Ionicons name="car" size={16} color="#ffffff" />
        </View>
      </Marker>
    );
  };

  const CustomerGroupMarker = ({ g, overlay }) => {
    const deliveredAll =
      Array.isArray(g?.orderIds) &&
      g.orderIds.length > 0 &&
      g.orderIds.every((oid) => isDelivered(statusMap?.[oid]));

    const count = g?.count || 1;

    // ✅ Overlay markers: keep tracksViewChanges ON so they won't disappear in Modal on Android
    const tvc = overlay ? true : trackMarkerViewsMain;

    return (
      <Marker
        key={`${overlay ? "overlay" : "main"}-cust-${g.key}`}
        coordinate={{ latitude: g.lat, longitude: g.lng }}
        title={count > 1 ? `Customer (${count} orders)` : "Customer"}
        description={count > 1 ? `Orders: ${g.orderIds.join(", ")}` : `Order #${g.orderIds?.[0] || "—"}`}
        tracksViewChanges={tvc}
        onPress={() => openGroupModal(g)}
        anchor={{ x: 0.5, y: 0.9 }}
        zIndex={50}
      >
        {deliveredAll ? (
          <View style={styles.tickMarkerOuter} collapsable={false} renderToHardwareTextureAndroid needsOffscreenAlphaCompositing>
            <View style={styles.tickMarkerInner}>
              <Ionicons name="checkmark" size={16} color="#ffffff" />
            </View>
            {count > 1 && (
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{count}</Text>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.customerMarkerOuter} collapsable={false} renderToHardwareTextureAndroid needsOffscreenAlphaCompositing>
            <View style={styles.customerMarkerInner} />
            {count > 1 && (
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{count}</Text>
              </View>
            )}
          </View>
        )}
      </Marker>
    );
  };

  /* ---------------- Render order list row ---------------- */

  const renderRow = ({ item }) => {
    const base = item.raw || item || {};
    const id = getOrderId(base) || getOrderId(item) || item.id;

    const statusRaw = (loaded && id ? statusMap[id] : "") || "";
    const statusLabel = statusRaw ? String(statusRaw).toUpperCase().replace(/_/g, " ") : loaded ? "—" : "...";

    const name = base.customer_name ?? base.user_name ?? base.full_name ?? "";

    const itemsFromMap = id && itemsMap[id] ? itemsMap[id] : null;
    const itemsBase = Array.isArray(base.items) ? base.items : null;
    const items = itemsFromMap || itemsBase || [];
    const hasItems = Array.isArray(items) && items.length > 0;

    const expanded = !!expandedMap?.[String(id || "")];

    return (
      <View style={styles.orderRow}>
        <Pressable
          onPress={() => toggleExpanded(id)}
          style={({ pressed }) => [styles.orderPress, pressed ? { opacity: 0.85 } : null]}
        >
          <View style={styles.orderTop}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={styles.orderId}>#{id}</Text>
              <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color="#6b7280" style={{ marginLeft: 8 }} />
            </View>

            <View style={styles.statusPill}>
              <Text style={styles.statusPillText}>{statusLabel}</Text>
            </View>
          </View>

          {!!name && (
            <Text style={styles.orderName} numberOfLines={1}>
              {name}
            </Text>
          )}

          <Text style={styles.orderMeta} numberOfLines={1}>
            {hasItems ? `${items.length} item${items.length === 1 ? "" : "s"}` : "Items: —"}
          </Text>
        </Pressable>

        {expanded && (
          <View style={styles.itemsDropdown}>
            {hasItems ? (
              <>
                {items.map((it, idx) => {
                  const title = pickItemName(it);
                  const qty = pickItemQty(it);
                  const price = pickItemPrice(it);
                  const lineTotal = price != null ? price * qty : null;

                  return (
                    <View key={`${id}-it-${idx}`} style={styles.itemRow}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={styles.itemName} numberOfLines={2}>
                          {title}
                        </Text>
                        {price != null ? (
                          <Text style={styles.itemSub}>
                            Price: {formatMoney(price)} {lineTotal != null ? `· Total: ${formatMoney(lineTotal)}` : ""}
                          </Text>
                        ) : (
                          <Text style={styles.itemSub}>Price: —</Text>
                        )}
                      </View>
                      <View style={styles.qtyPill}>
                        <Text style={styles.qtyText}>x{qty}</Text>
                      </View>
                    </View>
                  );
                })}
              </>
            ) : (
              <Text style={styles.noItemsText}>No item details found for this order.</Text>
            )}
          </View>
        )}
      </View>
    );
  };

  const driverCardText = driverSummaryText || "Driver details not available yet.";

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right", "bottom"]}>
      {/* LOCATION -> ORDERS MODAL */}
      <Modal visible={locationModalOpen} transparent animationType="fade" onRequestClose={closeGroupModal}>
        <Pressable style={styles.modalBackdrop} onPress={closeGroupModal}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Orders at this location {selectedGroup?.count > 1 ? `(${selectedGroup.count})` : ""}
              </Text>
              <Pressable onPress={closeGroupModal} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={18} color="#0f172a" />
              </Pressable>
            </View>

            <View style={{ marginTop: 10 }}>
              {selectedGroupRows.length ? (
                selectedGroupRows.map((r) => (
                  <View key={`loc-${r.orderId}`} style={styles.modalRow}>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <Text style={styles.modalOrderId}>#{r.orderId}</Text>
                      {r.delivered ? (
                        <View style={styles.modalDeliveredPill}>
                          <Ionicons name="checkmark" size={14} color="#16a34a" />
                          <Text style={styles.modalDeliveredText}>Delivered</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.modalStatus}>{r.status}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.modalEmpty}>No orders found.</Text>
              )}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* FULLSCREEN OVERLAY MAP */}
      <Modal
        visible={overlayOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        hardwareAccelerated
        onRequestClose={() => setOverlayOpen(false)}
      >
        <SafeAreaView style={styles.overlaySafe} edges={["left", "right", "top", "bottom"]}>
          <View style={styles.overlayHeader}>
            <Pressable onPress={() => setOverlayOpen(false)} style={styles.overlayCloseBtn}>
              <Ionicons name="close" size={22} color="#0f172a" />
            </Pressable>
            <Text style={styles.overlayTitle}>Live location</Text>
            <View style={{ width: 40 }} />
          </View>

          <View style={styles.overlayMapWrap}>
            {showMap ? (
              <View style={{ flex: 1 }}>
                <MapView
                  ref={overlayMapRef}
                  style={{ flex: 1 }}
                  provider={PROVIDER_DEFAULT}
                  initialRegion={mapInitialRegion}
                  mapType="standard"
                  toolbarEnabled={false}
                  loadingEnabled
                  cacheEnabled={false}
                  moveOnMarkerPress={false}
                  zoomEnabled
                  scrollEnabled
                  rotateEnabled
                  pitchEnabled
                  zoomTapEnabled
                  scrollDuringRotateOrZoomEnabled
                  onMapReady={() => {
                    if (overlayDidFitOnceRef.current) return;
                    overlayDidFitOnceRef.current = true;
                    setTimeout(() => {
                      try {
                        fitOverlay();
                      } catch {}
                    }, 180);
                  }}
                >
                  <UrlTile urlTemplate={tileTemplate} maximumZ={20} tileSize={256} shouldReplaceMapContent zIndex={0} />

                  {!!routeDriverToBiz?.length && routeDriverToBiz.length >= 2 && (
                    <Polyline coordinates={routeDriverToBiz} strokeWidth={4} strokeColor="#2563eb" lineCap="round" lineJoin="round" />
                  )}

                  {!!routeBizToCustomer?.length && routeBizToCustomer.length >= 2 && (
                    <Polyline coordinates={routeBizToCustomer} strokeWidth={4} strokeColor="#60a5fa" lineCap="round" lineJoin="round" />
                  )}

                  {!!businessCoords && (
                    <Marker
                      pinColor="#ef4444"
                      coordinate={{ latitude: businessCoords.lat, longitude: businessCoords.lng }}
                      title="Business"
                      description={`Business ID: ${businessId ?? "—"}`}
                      tracksViewChanges={true}
                      onPress={() => (lastMarkerPressTsRef.current = Date.now())}
                      zIndex={40}
                    />
                  )}

                  {/* ✅ Driver marker (overlay - never disappears) */}
                  {Object.keys(driversByRideId || {}).map((rid) => {
                    const entry = driversByRideId?.[rid];
                    return <DriverMarker key={`ov-d-${rid}`} rid={rid} entry={entry} overlay />;
                  })}

                  {/* ✅ Grouped customer markers (overlay - never disappears) */}
                  {groupedDropPoints.map((g) => (
                    <CustomerGroupMarker key={`ov-g-${g.key}`} g={g} overlay />
                  ))}
                </MapView>

                <View style={styles.overlayActions}>
                  <TouchableOpacity style={styles.fitBtn} onPress={fitOverlay} activeOpacity={0.85}>
                    <Ionicons name="scan-outline" size={16} color="#ffffff" />
                    <Text style={styles.fitBtnText}>Fit</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.noMapFull}>
                <Ionicons name="map-outline" size={28} color="#9ca3af" />
                <Text style={styles.noMapText}>No coordinates yet</Text>
              </View>
            )}
          </View>
        </SafeAreaView>
      </Modal>

      {/* HEADER */}
      <View style={[styles.headerBar, { paddingTop: headerTopPad }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#0f172a" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Track orders</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* SUMMARY */}
      <View style={styles.summaryBox}>
        <Text style={styles.summaryMain}>{title}</Text>

        {!!label && (
          <Text style={styles.summarySub} numberOfLines={2}>
            Deliver To: {label}
          </Text>
        )}

        {!!rideMessage && <Text style={styles.summarySub}>{rideMessage}</Text>}

        <Text style={styles.summarySub}>
          Restored: {restoredIds ? "Yes" : "No"} · Batch: {batchId || "—"} · Ride:{" "}
          {effectiveRideIds.length ? effectiveRideIds.join(", ") : "—"}
        </Text>

        {batchOrdersLoading && (
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}>
            <ActivityIndicator size="small" />
            <Text style={[styles.summarySub, { marginTop: 0, marginLeft: 8 }]}>Loading batch orders…</Text>
          </View>
        )}
      </View>

      {/* MAP SHOWN DIRECTLY + BUTTON OPENS OVERLAY */}
      <View style={styles.mapCard}>
        {showMap ? (
          <View style={styles.mapWrap}>
            <MapView
              ref={mapRef}
              style={styles.map}
              provider={PROVIDER_DEFAULT}
              initialRegion={mapInitialRegion}
              mapType="standard"
              toolbarEnabled={false}
              loadingEnabled
              cacheEnabled={Platform.OS === "android"}
              moveOnMarkerPress={false}
              onMapReady={() => {
                if (didFitOnceRef.current) return;
                didFitOnceRef.current = true;

                setTrackMarkerViewsMain(true);
                setTimeout(() => setTrackMarkerViewsMain(false), 1400);

                setTimeout(() => {
                  try {
                    fitAll();
                  } catch {}
                }, 180);
              }}
              zoomEnabled
              scrollEnabled
              rotateEnabled
              pitchEnabled
              zoomTapEnabled
              scrollDuringRotateOrZoomEnabled
              onPress={() => openOverlay()}
            >
              <UrlTile urlTemplate={tileTemplate} maximumZ={20} tileSize={256} shouldReplaceMapContent zIndex={0} />

              {!!routeDriverToBiz?.length && routeDriverToBiz.length >= 2 && (
                <Polyline coordinates={routeDriverToBiz} strokeWidth={4} strokeColor="#2563eb" lineCap="round" lineJoin="round" />
              )}
              {!!routeBizToCustomer?.length && routeBizToCustomer.length >= 2 && (
                <Polyline coordinates={routeBizToCustomer} strokeWidth={4} strokeColor="#60a5fa" lineCap="round" lineJoin="round" />
              )}

              {!!businessCoords && (
                <Marker
                  pinColor="#ef4444"
                  coordinate={{ latitude: businessCoords.lat, longitude: businessCoords.lng }}
                  title="Business"
                  description={`Business ID: ${businessId ?? "—"}`}
                  tracksViewChanges={trackMarkerViewsMain}
                  onPress={() => (lastMarkerPressTsRef.current = Date.now())}
                  zIndex={40}
                />
              )}

              {/* ✅ Driver marker */}
              {Object.keys(driversByRideId || {}).map((rid) => {
                const entry = driversByRideId?.[rid];
                return <DriverMarker key={`main-d-${rid}`} rid={rid} entry={entry} overlay={false} />;
              })}

              {/* ✅ Grouped customer markers */}
              {groupedDropPoints.map((g) => (
                <CustomerGroupMarker key={`main-g-${g.key}`} g={g} overlay={false} />
              ))}
            </MapView>

            <View style={styles.mapActions}>
              <TouchableOpacity style={styles.fitBtn} onPress={fitAll} activeOpacity={0.85}>
                <Ionicons name="scan-outline" size={16} color="#ffffff" />
                <Text style={styles.fitBtnText}>Fit</Text>
              </TouchableOpacity>

              <View style={{ height: 8 }} />

              <TouchableOpacity style={styles.expandBtn} onPress={openOverlay} activeOpacity={0.85}>
                <Ionicons name="expand-outline" size={16} color="#ffffff" />
                <Text style={styles.fitBtnText}>Open</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.noMap}>
            <Ionicons name="map-outline" size={28} color="#9ca3af" />
            <Text style={styles.noMapText}>No coordinates yet</Text>
          </View>
        )}
      </View>

      {/* DRIVER CARD */}
      <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
        <View style={styles.driverCard}>
          <View style={styles.driverHeaderRow}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons name="car-outline" size={18} color="#111827" />
              <Text style={styles.driverTitle}>Driver</Text>
            </View>

            <TouchableOpacity onPress={onRefresh} style={styles.driverRefreshBtn} activeOpacity={0.8}>
              <Ionicons name="refresh" size={18} color="#111827" />
            </TouchableOpacity>
          </View>

          <Text style={styles.driverText}>{driverCardText}</Text>

          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10 }}>
            <TouchableOpacity
              style={[styles.callBtn, !driverPhoneText ? styles.callBtnDisabled : null]}
              activeOpacity={0.85}
              onPress={onCallDriver}
              disabled={!driverPhoneText}
            >
              <Ionicons name="call-outline" size={16} color="#ffffff" />
              <Text style={styles.callBtnText}>Call driver</Text>
            </TouchableOpacity>

            <View style={{ flex: 1 }} />

            <TouchableOpacity style={styles.moreBtn} activeOpacity={0.85} onPress={onRefresh}>
              <Ionicons name="ellipsis-vertical" size={18} color="#6b7280" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.listHeader}>
        <Text style={styles.listHeaderText}>Orders in this batch</Text>
        {!!batchOrderIds.length && <Text style={styles.attribTextSmall}>IDs: {batchOrderIds.length}</Text>}
      </View>

      <FlatList
        data={batchOrders}
        keyExtractor={(it, idx) => String(getOrderId(it) || it?.id || idx)}
        renderItem={renderRow}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
            <Text style={{ color: "#6b7280", fontWeight: "700" }}>
              {batchOrdersLoading ? "Loading orders…" : "No orders found for this batch."}
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },

  headerBar: {
    minHeight: 52,
    paddingHorizontal: 12,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    borderBottomColor: "#e5e7eb",
    borderBottomWidth: 1,
    backgroundColor: "#fff",
  },
  backBtn: { height: 40, width: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700", color: "#0f172a" },

  summaryBox: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
  },
  summaryMain: { fontSize: 14, fontWeight: "800", color: "#0f172a" },
  summarySub: { marginTop: 3, fontSize: 12, color: "#6b7280" },

  mapCard: { paddingHorizontal: 16, paddingTop: 12 },
  mapWrap: {
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#fff",
  },
  map: { height: 260, width: "100%" },

  attribTextSmall: { marginTop: 4, fontSize: 10, color: "#6b7280", fontWeight: "700" },

  mapActions: { position: "absolute", right: 10, bottom: 14 },
  fitBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#16a34a",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  expandBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0f172a",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  fitBtnText: { marginLeft: 6, color: "#fff", fontSize: 12, fontWeight: "900" },

  driverMarkerOuter: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#ffffff",
  },

  customerMarkerOuter: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(245,158,11,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  customerMarkerInner: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#f59e0b",
    borderWidth: 2,
    borderColor: "#ffffff",
  },

  countBadge: {
    position: "absolute",
    right: -4,
    top: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#111827",
    borderWidth: 2,
    borderColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  countBadgeText: { color: "#ffffff", fontSize: 10, fontWeight: "900" },

  driverCard: { borderRadius: 14, borderWidth: 1, borderColor: "#e5e7eb", padding: 12, backgroundColor: "#f9fafb" },
  driverHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  driverTitle: { marginLeft: 6, fontSize: 13, fontWeight: "800", color: "#111827" },
  driverRefreshBtn: {
    height: 34,
    width: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  driverText: { marginTop: 6, fontSize: 12, color: "#374151", fontWeight: "600" },

  callBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#16a34a",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  callBtnDisabled: { backgroundColor: "#9ca3af" },
  callBtnText: { marginLeft: 6, color: "#fff", fontSize: 12, fontWeight: "800" },
  moreBtn: {
    height: 34,
    width: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },

  listHeader: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  listHeaderText: { fontSize: 13, fontWeight: "700", color: "#0f172a" },

  orderRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  orderPress: { paddingVertical: 2 },
  orderTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  orderId: { fontSize: 13, fontWeight: "800", color: "#0f172a" },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "#ecfdf3",
    borderWidth: 1,
    borderColor: "#bbf7d0",
  },
  statusPillText: { fontSize: 10, fontWeight: "700", color: "#166534" },
  orderName: { marginTop: 3, fontSize: 12, color: "#6b7280" },
  orderMeta: { marginTop: 2, fontSize: 11, color: "#4b5563", fontWeight: "700" },

  itemsDropdown: {
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  itemName: { fontSize: 12, color: "#111827", fontWeight: "800" },
  itemSub: { marginTop: 3, fontSize: 11, color: "#6b7280", fontWeight: "700" },
  qtyPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  qtyText: { fontSize: 11, fontWeight: "900", color: "#111827" },
  noItemsText: { fontSize: 12, color: "#6b7280", fontWeight: "800" },

  tickMarkerOuter: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(22,163,74,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  tickMarkerInner: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#16a34a",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#ffffff",
  },

  noMap: {
    height: 260,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  noMapText: { marginTop: 8, fontSize: 12, color: "#6b7280", fontWeight: "800" },

  overlaySafe: { flex: 1, backgroundColor: "#fff" },
  overlayHeader: {
    height: 54,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    backgroundColor: "#fff",
  },
  overlayCloseBtn: { height: 40, width: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  overlayTitle: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "900", color: "#0f172a" },
  overlayMapWrap: { flex: 1, backgroundColor: "#fff" },
  overlayActions: { position: "absolute", right: 14, top: 70 },
  noMapFull: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },

  // Orders-at-location modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 14,
  },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { fontSize: 14, fontWeight: "900", color: "#0f172a" },
  modalCloseBtn: {
    height: 32,
    width: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  modalRow: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  modalOrderId: { fontSize: 13, fontWeight: "900", color: "#111827" },
  modalStatus: { marginTop: 4, fontSize: 11, fontWeight: "900", color: "#0f172a" },
  modalEmpty: { marginTop: 10, fontSize: 12, color: "#6b7280", fontWeight: "800" },
  modalDeliveredPill: {
    marginLeft: 8,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "#ecfdf3",
    borderWidth: 1,
    borderColor: "#bbf7d0",
  },
  modalDeliveredText: { marginLeft: 4, fontSize: 11, fontWeight: "900", color: "#16a34a" },
});
