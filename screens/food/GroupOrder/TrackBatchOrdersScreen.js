// services/food/GroupOrder/TrackBatchOrdersScreen.js
// ✅ FIXED VERSION FOR APK - Working marker popups with Alert dialogs
// ✅ Differentiated markers: Business (Red colored marker), Driver (PNG), Customers (PNG)
// ✅ Added console logs for locations and marker colors

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Linking,
  Alert,
  Modal,
  Pressable,
  ActivityIndicator,
  Dimensions,
  Platform,
  Image,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import {
  useNavigation,
  useRoute,
  useFocusEffect,
} from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { OSMView } from "expo-osm-sdk";
import * as SecureStore from "expo-secure-store";
import {
  ORDER_ENDPOINT as ENV_ORDER_ENDPOINT,
  BUSINESS_DETAILS as ENV_BUSINESS_DETAILS,
  DELIVERY_RIDE_ID_ENDPOINT as ENV_DELIVERY_RIDE_ID_ENDPOINT,
  DRIVER_DETAILS_ENDPOINT as ENV_DRIVER_DETAILS_ENDPOINT,
} from "@env";

import {
  initSocket,
  setCurrentRide,
  onDriverLocation as listenToDriverLocation,
} from "./socket";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

// Import custom marker images for driver and customer only
const DRIVER_MARKER = require("../../../assets/driver.png");
const CUSTOMER_MARKER = require("../../../assets/customer.png");

// Color constants for business marker
const COLORS = {
  BUSINESS: "#e71414",
};

/* ============================================================
   ERROR BOUNDARY COMPONENT
============================================================ */
class OSMViewErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("OSMView crashed:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.mapErrorContainer}>
          <Ionicons name="map-outline" size={48} color="#ef4444" />
          <Text style={styles.mapErrorText}>Map failed to load</Text>
          <Text style={styles.mapErrorSubtext}>Tap to retry</Text>
          <TouchableOpacity
            style={styles.mapRetryBtn}
            onPress={() => this.setState({ hasError: false })}
          >
            <Text style={styles.mapRetryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

/* ============================================================
   HELPERS
============================================================ */
const safeStr = (v) => (v == null ? "" : String(v)).trim();

const getOrderId = (order = {}) => {
  const base = order.raw || order;
  const cand = [
    base.order_id,
    base.id,
    base.orderId,
    base.order_no,
    base.orderNo,
    base.order_code,
  ];
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
  const strip = (s) =>
    String(s)
      .replace(/^ORD[-_]?/i, "")
      .replace(/^FOOD[-_]?/i, "");
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
  if (tmpl.includes("{businessId}"))
    return tmpl.replace("{businessId}", encodeURIComponent(businessId));
  if (tmpl.includes(":businessId"))
    return tmpl.replace(":businessId", encodeURIComponent(businessId));
  if (tmpl.includes(":business_id"))
    return tmpl.replace(":business_id", encodeURIComponent(businessId));
  return `${tmpl.replace(/\/+$/, "")}/${encodeURIComponent(businessId)}`;
};

const buildBusinessDetailsUrl = (businessId) => {
  if (!businessId) return null;
  const tmpl = String(ENV_BUSINESS_DETAILS || "").trim();
  if (!tmpl) return null;
  if (tmpl.includes("{businessId}"))
    return tmpl.replace("{businessId}", encodeURIComponent(businessId));
  if (tmpl.includes(":businessId"))
    return tmpl.replace(":businessId", encodeURIComponent(businessId));
  if (tmpl.includes(":business_id"))
    return tmpl.replace(":business_id", encodeURIComponent(businessId));
  if (tmpl.includes("{business_id}"))
    return tmpl.replace("{business_id}", encodeURIComponent(businessId));
  return `${tmpl.replace(/\/+$/, "")}/${encodeURIComponent(businessId)}`;
};

const buildDeliveryRideUrl = (batchId) => {
  if (!batchId) return null;
  const tmpl = String(ENV_DELIVERY_RIDE_ID_ENDPOINT || "").trim();
  if (!tmpl) return null;
  if (tmpl.includes("{batch_id}"))
    return tmpl.replace("{batch_id}", encodeURIComponent(String(batchId)));
  if (tmpl.includes("{batchId}"))
    return tmpl.replace("{batchId}", encodeURIComponent(String(batchId)));
  const base = tmpl.replace(/\/+$/, "");
  const join = base.includes("?") ? "&" : "?";
  return `${base}${join}delivery_batch_id=${encodeURIComponent(String(batchId))}`;
};

const buildDriverDetailsUrl = (driverId) => {
  const id = safeStr(driverId);
  if (!id) return null;
  const tmpl = String(ENV_DRIVER_DETAILS_ENDPOINT || "").trim();
  if (!tmpl) return null;
  if (tmpl.includes("{driverId}"))
    return tmpl.replace("{driverId}", encodeURIComponent(id));
  if (tmpl.includes(":driverId"))
    return tmpl.replace(":driverId", encodeURIComponent(id));
  const base = tmpl.replace(/\/+$/, "");
  const join = base.includes("?") ? "&" : "?";
  return `${base}${join}driverId=${encodeURIComponent(id)}`;
};

const isDelivered = (status) => {
  const s = String(status || "")
    .toUpperCase()
    .trim();
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
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
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
  const cand = [
    params?.ride_id,
    params?.rideId,
    params?.delivery_ride_id,
    params?.deliveryRideId,
    params?.ride?.id,
  ];
  for (const v of cand) {
    if (v != null && String(v).trim().length > 0) return String(v).trim();
  }
  return "";
};

/* ---- OSRM routing ---- */
const OSRM_ROUTE_BASE = "https://router.project-osrm.org/route/v1/driving";

const fetchOsrmRoute2 = async (a, b, timeoutMs = 5000) => {
  const url = `${OSRM_ROUTE_BASE}/${a.lng},${a.lat};${b.lng},${b.lat}?geometries=geojson&overview=full`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal });
    const json = await res.json();
    const line = json?.routes?.[0]?.geometry?.coordinates;
    if (!Array.isArray(line) || line.length < 2) return [];
    return line.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));
  } catch (error) {
    console.log("OSRM route fetch timeout or error:", error.message);
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
};

/* ---- Items helpers ---- */
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
      it?.variant_name,
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
      it?.units,
  );
  return Number.isFinite(n) && n > 0 ? n : 1;
};

const pickItemPrice = (it) => {
  const n = Number(
    it?.price ??
      it?.unit_price ??
      it?.unitPrice ??
      it?.selling_price ??
      it?.amount ??
      it?.rate ??
      it?.mrp,
  );
  return Number.isFinite(n) ? n : null;
};

const formatMoney = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return `${n.toFixed(2)}`;
};

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

/* ---- Location grouping ---- */
const groupDropsByDistance = (orders = [], distanceMeters = 12) => {
  const groups = [];
  for (const o of orders || []) {
    const base = o?.raw || o || {};
    const coords = extractOrderDropCoords(base);
    if (!coords) continue;
    const orderId =
      getOrderId(base) || getOrderId(o) || safeStr(base?.id) || "";
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

/* ---- SecureStore keys ---- */
const sanitizeKeyPart = (v) => {
  const s = v == null ? "" : String(v).trim();
  return s.replace(/[^a-zA-Z0-9._-]/g, "_") || "global";
};

const keyBatchId = (b) => `cluster_last_batch_id_${sanitizeKeyPart(b)}`;
const keyRideId = (b) => `cluster_last_ride_id_${sanitizeKeyPart(b)}`;
const keyDriver = (b) => `cluster_last_driver_${sanitizeKeyPart(b)}`;
const keyDriverRating = (b) =>
  `cluster_last_driver_rating_${sanitizeKeyPart(b)}`;
const keyMapCenter = (b) => `map_center_${sanitizeKeyPart(b)}`;

/* ============================================================
   Zoom heuristic
============================================================ */
const computeZoomForPoints = (points = []) => {
  if (points.length < 2) return 14;
  let minLat = Infinity,
    maxLat = -Infinity;
  let minLng = Infinity,
    maxLng = -Infinity;
  for (const p of points) {
    const lat = p.lat ?? p.latitude;
    const lng = p.lng ?? p.longitude;
    if (lat && lng) {
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
    }
  }
  const latDiff = maxLat - minLat;
  const lngDiff = maxLng - minLng;
  const maxDiff = Math.max(latDiff, lngDiff);
  if (maxDiff < 0.01) return 15;
  if (maxDiff < 0.05) return 13;
  if (maxDiff < 0.1) return 11;
  if (maxDiff < 0.5) return 10;
  return 9;
};

/* ============================================================
   COMPONENT
============================================================ */
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
    rideIds = [],
    batch_order_ids: batchOrderIdsFromParams,
    driver_id,
    driverId: driverIdParam,
    driverName: driverNameFromParams,
  } = params;

  const headerTopPad = Math.max(insets.top, 8) + 18;

  /* ---------- IDs ---------- */
  const [batchId, setBatchId] = useState(() =>
    normalizeBatchIdFromParams(params),
  );
  const [deliveryRideId, setDeliveryRideId] = useState(() =>
    normalizeRideIdFromParams(params),
  );
  const [restoredIds, setRestoredIds] = useState(false);

  /* ---------- Driver ---------- */
  const [driverInfo, setDriverInfo] = useState(driverDetailsFromParams || null);
  const [driverRating, setDriverRating] = useState(
    driverRatingFromParams || null,
  );

  const initialDriverId = useMemo(() => {
    const p = safeStr(driver_id || driverIdParam);
    if (p) return p;
    const fromDetails = extractDriverId(driverDetailsFromParams);
    if (fromDetails) return fromDetails;
    return safeStr(extractDriverId(params));
  }, [driver_id, driverIdParam, driverDetailsFromParams, params]);

  const [driverId, setDriverId] = useState(initialDriverId);
  const lastDriverDetailsFetchMsRef = useRef(0);

  useEffect(() => {
    if (driverRatingFromParams) setDriverRating(driverRatingFromParams);
  }, [driverRatingFromParams]);
  useEffect(() => {
    const pid = safeStr(driver_id || driverIdParam);
    if (pid) setDriverId(pid);
  }, [driver_id, driverIdParam]);
  useEffect(() => {
    const dn = safeStr(driverNameFromParams);
    if (!dn) return;
    setDriverInfo((prev) => ({
      ...(prev || {}),
      user_name: safeStr(prev?.user_name ?? prev?.name) || dn,
    }));
  }, [driverNameFromParams]);
  useEffect(() => {
    if (driverDetailsFromParams) {
      setDriverInfo((prev) => ({
        ...(prev || {}),
        ...(driverDetailsFromParams || {}),
      }));
      const extracted = extractDriverId(driverDetailsFromParams);
      if (!safeStr(driver_id || driverIdParam) && extracted)
        setDriverId(extracted);
    }
  }, [driverDetailsFromParams, driver_id, driverIdParam]);

  /* ---------- Batch order ids ---------- */
  const batchOrderIds = useMemo(
    () => normalizeOrderIdsList(batchOrderIdsFromParams),
    [batchOrderIdsFromParams],
  );

  const [batchOrders, setBatchOrders] = useState(() => {
    const passedOrders = Array.isArray(passedOrdersRaw) ? passedOrdersRaw : [];
    if (
      Array.isArray(batchOrderIdsFromParams) &&
      batchOrderIdsFromParams.length
    )
      return filterOrdersByBatchIds(passedOrders, batchOrderIdsFromParams);
    const initialBid = normalizeBatchIdFromParams(params);
    if (initialBid) return filterOrdersByBatchField(passedOrders, initialBid);
    return [];
  });
  const [batchOrdersLoading, setBatchOrdersLoading] = useState(false);

  /* ---------- SecureStore restore ---------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [
          savedBatch,
          savedRide,
          savedDriverJson,
          savedDriverRatingJson,
          savedMapCenter,
        ] = await Promise.all([
          SecureStore.getItemAsync(keyBatchId(businessId)),
          SecureStore.getItemAsync(keyRideId(businessId)),
          SecureStore.getItemAsync(keyDriver(businessId)),
          SecureStore.getItemAsync(keyDriverRating(businessId)),
          SecureStore.getItemAsync(keyMapCenter(businessId)),
        ]);
        if (cancelled) return;
        if (!batchId && savedBatch?.trim()) setBatchId(savedBatch.trim());
        if (!deliveryRideId && savedRide?.trim())
          setDeliveryRideId(savedRide.trim());
        const hasExplicitDriverParam = Boolean(
          safeStr(driver_id || driverIdParam),
        );
        if (!driverInfo && savedDriverJson) {
          try {
            const parsed = JSON.parse(savedDriverJson);
            if (parsed && typeof parsed === "object") {
              setDriverInfo(parsed);
              const id = extractDriverId(parsed);
              if (!hasExplicitDriverParam && !safeStr(driverId) && id)
                setDriverId(id);
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
  }, [businessId]);

  /* ---------- SecureStore save ---------- */
  useEffect(() => {
    (async () => {
      try {
        if (batchId)
          await SecureStore.setItemAsync(
            keyBatchId(businessId),
            String(batchId),
          );
        if (deliveryRideId)
          await SecureStore.setItemAsync(
            keyRideId(businessId),
            String(deliveryRideId),
          );
        if (driverInfo)
          await SecureStore.setItemAsync(
            keyDriver(businessId),
            JSON.stringify(driverInfo),
          );
        if (driverRating)
          await SecureStore.setItemAsync(
            keyDriverRating(businessId),
            JSON.stringify(driverRating),
          );
      } catch (e) {
        console.log("[SecureStore] save error:", e?.message || e);
      }
    })();
  }, [businessId, batchId, deliveryRideId, driverInfo, driverRating]);

  /* ---------- Fetch ride id ---------- */
  const fetchDeliveryRideId = useCallback(async () => {
    if (!batchId || deliveryRideId) return;
    const url = buildDeliveryRideUrl(batchId);
    if (!url) return;
    try {
      const res = await fetch(url);
      const text = await res.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {}
      if (!res.ok) return;
      const rid = pickRideIdFromResponse(json);
      if (rid) setDeliveryRideId(rid);
    } catch (e) {
      console.log("[MERCHANT][RIDE_ID] error:", e?.message || e);
    }
  }, [batchId, deliveryRideId]);

  useEffect(() => {
    if (restoredIds) fetchDeliveryRideId();
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

  /* ---------- Map & route state ---------- */
  const [refreshing, setRefreshing] = useState(false);
  const [statusMap, setStatusMap] = useState({});
  const [itemsMap, setItemsMap] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [businessCoords, setBusinessCoords] = useState(null);
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [locationError, setLocationError] = useState(null);
  const [mapError, setMapError] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const [showLoader, setShowLoader] = useState(true);
  const [mapInitAttempts, setMapInitAttempts] = useState(0);
  const [mapKey, setMapKey] = useState(Date.now());

  const [driversByRideId, setDriversByRideId] = useState({});
  const [routeDriverToBiz, setRouteDriverToBiz] = useState([]);
  const [routeBizToCustomers, setRouteBizToCustomers] = useState([]);

  const lastRouteKeyRef = useRef("");
  const lastRouteAtMsRef = useRef(0);

  const [overlayOpen, setOverlayOpen] = useState(false);
  const overlayMapRef = useRef(null);
  const overlayDidFitOnceRef = useRef(false);

  const mapRef = useRef(null);
  const unsubscribeRef = useRef(null);
  const initializedRef = useRef(false);

  const lastDriverUpdateMsRef = useRef(0);
  const didFitOnceRef = useRef(false);
  const lastMarkerPressTsRef = useRef(0);
  const [cachedMapCenter, setCachedMapCenter] = useState(null);

  // Force hide loader after 5 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      if (showLoader) {
        console.log("Force hiding loader after timeout");
        setShowLoader(false);
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  // Retry map initialization
  useEffect(() => {
    if (mapInitAttempts < 3 && showLoader && mapInitAttempts > 0) {
      const retryTimer = setTimeout(() => {
        console.log(
          `Retrying map initialization (attempt ${mapInitAttempts + 1})`,
        );
        setMapKey(Date.now());
      }, 2000);
      return () => clearTimeout(retryTimer);
    }
  }, [mapInitAttempts, showLoader]);

  // Network connectivity check
  useEffect(() => {
    const checkNetworkConnectivity = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(
          "https://tiles.openfreemap.org/styles/liberty",
          {
            signal: controller.signal,
            method: "HEAD",
          },
        );

        clearTimeout(timeoutId);

        if (!response.ok) {
          console.warn("Cannot reach OpenFreemap servers");
        } else {
          console.log("OpenFreemap servers reachable");
        }
      } catch (error) {
        console.error("Network connectivity check failed:", error);
      }
    };

    checkNetworkConnectivity();
  }, []);

  /* ---------- Seed initial driver coords ---------- */
  useEffect(() => {
    const seed = extractLatLng(driverInfo);
    if (!seed) return;
    setDriversByRideId((prev) => {
      const rid = String(
        deliveryRideId || effectiveRideIds?.[0] || "driver",
      ).trim();
      const next = { ...(prev || {}) };
      next[rid] = {
        coords: seed,
        lastPing: new Date().toISOString(),
        batchId: batchId || null,
      };
      return next;
    });
    console.log(`[LOCATION][DRIVER] Coords: ${seed.lat}, ${seed.lng}`);
  }, [driverInfo, deliveryRideId, effectiveRideIds, batchId]);

  /* ---------- Batch orders loading ---------- */
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
          } else if (
            block &&
            (block.id || block.order_id || block.order_code)
          ) {
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
      let picked = batchOrderIds.length
        ? filterOrdersByBatchIds(all, batchOrderIds)
        : filterOrdersByBatchField(all, batchId);
      if (picked.length) setBatchOrders(picked);
    } finally {
      setBatchOrdersLoading(false);
    }
  }, [
    businessId,
    batchOrderIds,
    batchId,
    batchOrders,
    fetchAllGroupedOrdersFlat,
  ]);

  useEffect(() => {
    loadBatchOrders();
  }, [loadBatchOrders]);

  /* ---------- Fetch statuses/items ---------- */
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
              const status =
                o.status || o.order_status || o.current_status || o.orderStatus;
              if (status) nextStatusMap[id] = status;
              if (Array.isArray(o.items)) nextItemsMap[id] = o.items;
            }
          } else if (block) {
            const id = getOrderId(block);
            const status =
              block.status ||
              block.order_status ||
              block.current_status ||
              block.orderStatus;
            if (id && status) nextStatusMap[id] = status;
            if (id && Array.isArray(block.items))
              nextItemsMap[id] = block.items;
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
    if (!url) {
      setLoadingLocation(false);
      return;
    }
    try {
      const token = await SecureStore.getItemAsync("auth_token");
      const headers = { Accept: "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(url, { headers });
      if (!res.ok) {
        setLoadingLocation(false);
        return;
      }
      const json = await res.json();
      const base = json?.data || json || {};
      const coords =
        extractLatLng(base) ||
        extractLatLng(base?.business) ||
        extractLatLng(base?.restaurant) ||
        extractLatLng(base?.shop) ||
        extractLatLng(base?.location);
      if (coords) {
        console.log("Business coordinates found:", coords);
        console.log(
          `[LOCATION][BUSINESS] Coords: ${coords.lat}, ${coords.lng} | Marker Color: ${COLORS.BUSINESS}`,
        );
        setBusinessCoords(coords);
      } else {
        console.log("No business coordinates found");
      }
      setLoadingLocation(false);
    } catch (error) {
      console.error("Error fetching business location:", error);
      setLocationError(error.message);
      setLoadingLocation(false);
    }
  }, [businessId]);

  const fetchDriverDetailsById = useCallback(
    async (id, opts = { force: false }) => {
      const driverIdClean = safeStr(id);
      if (!driverIdClean) return;
      const url = buildDriverDetailsUrl(driverIdClean);
      if (!url) return;
      const now = Date.now();
      if (!opts?.force && now - lastDriverDetailsFetchMsRef.current < 10_000)
        return;
      lastDriverDetailsFetchMsRef.current = now;
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
        if (!res.ok) return;
        const details =
          json?.details || json?.data?.details || json?.data || json || null;
        if (!details || typeof details !== "object") return;
        setDriverInfo((prev) => {
          const next = { ...(prev || {}) };
          if (details.user_id) next.user_id = details.user_id;
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
        console.log("[MERCHANT][DRIVER] error:", e?.message || e);
      }
    },
    [],
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
      if (driverId) fetchDriverDetailsById(driverId);
    }, [
      fetchGroupedStatusesItems,
      fetchBusinessLocation,
      restoredIds,
      fetchDeliveryRideId,
      loadBatchOrders,
      driverId,
      fetchDriverDetailsById,
    ]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        fetchGroupedStatusesItems(),
        fetchBusinessLocation(),
        fetchDeliveryRideId(),
      ]);
      if (driverId) await fetchDriverDetailsById(driverId, { force: true });
      setBatchOrders([]);
      await loadBatchOrders();
    } finally {
      setRefreshing(false);
    }
  }, [
    fetchGroupedStatusesItems,
    fetchBusinessLocation,
    fetchDeliveryRideId,
    loadBatchOrders,
    driverId,
    fetchDriverDetailsById,
  ]);

  /* ---------- SOCKET ---------- */
  const onDriverLocation = useCallback(
    (p) => {
      const now = Date.now();
      if (now - lastDriverUpdateMsRef.current < 800) return;
      lastDriverUpdateMsRef.current = now;

      const coords =
        p?.lat && p?.lng
          ? { lat: p.lat, lng: p.lng }
          : p?.latitude && p?.longitude
            ? { lat: p.latitude, lng: p.longitude }
            : p?.driver_lat && p?.driver_lng
              ? { lat: p.driver_lat, lng: p.driver_lng }
              : extractLatLng(p);
      if (!coords) return;

      const ridFromPayload =
        p?.ride_id ||
        p?.rideId ||
        p?.delivery_ride_id ||
        p?.room ||
        p?.request_id;
      const rid = String(
        ridFromPayload || effectiveRideIds[0] || "driver",
      ).trim();

      const pid = p?.driver_id || p?.driverId || p?.driver?.id || "";
      if (pid) {
        setDriverId(pid);
        const missingName =
          !safeStr(driverInfo?.user_name) && !safeStr(driverInfo?.name);
        if (missingName) fetchDriverDetailsById(pid, { force: true });
      }

      const maybeDriver = {
        user_name: p?.driver_name || p?.driverName,
        phone: p?.driver_phone || p?.driverPhone,
        ...(coords && { lat: coords.lat, lng: coords.lng }),
      };
      if (maybeDriver.user_name || maybeDriver.phone) {
        setDriverInfo((prev) => ({ ...(prev || {}), ...maybeDriver }));
      }

      setDriversByRideId((prev) => {
        const prevEntry = prev?.[rid];
        if (prevEntry?.coords && haversineMeters(prevEntry.coords, coords) < 5)
          return prev;
        const next = { ...(prev || {}) };
        next[rid] = {
          coords,
          lastPing: new Date().toISOString(),
          batchId: batchId || null,
        };
        return next;
      });
      console.log(
        `[LOCATION][DRIVER] Update via socket: ${coords.lat}, ${coords.lng}`,
      );
    },
    [effectiveRideIds, batchId, fetchDriverDetailsById, driverInfo],
  );

  useEffect(() => {
    if (initializedRef.current || !restoredIds || !effectiveRideIds.length)
      return;
    initializedRef.current = true;
    const socket = initSocket({});
    if (!socket) return;
    if (effectiveRideIds[0]) setCurrentRide(effectiveRideIds[0]);
    effectiveRideIds.forEach((rid) => {
      const join = () =>
        socket.emit("joinRide", { rideId: String(rid) }, () => {});
      socket.connected ? join() : socket.once("connect", join);
    });
    const unsubscribe = listenToDriverLocation((locationData) =>
      onDriverLocation(locationData),
    );
    unsubscribeRef.current = unsubscribe;
    return () => {
      if (unsubscribeRef.current) unsubscribeRef.current();
      initializedRef.current = false;
    };
  }, [restoredIds, effectiveRideIds, onDriverLocation]);

  /* ---------- Derived ---------- */
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
    return (
      safeStr(
        d?.user_name ??
          d?.name ??
          d?.full_name ??
          d?.fullName ??
          driverNameFromParams ??
          "",
      ) || "Driver"
    );
  }, [driverInfo, driverNameFromParams]);

  const driverPhoneText = useMemo(() => {
    const p =
      driverInfo?.phone ?? driverInfo?.mobile ?? driverInfo?.contact ?? "";
    return safePhone(p);
  }, [driverInfo]);

  const deliveredByText = useMemo(() => {
    const idPart = safeStr(driverId);
    const namePart = safeStr(driverName) || "Driver";
    return idPart
      ? `Delivered by ${namePart} (${idPart})`
      : `Delivered by ${namePart}`;
  }, [driverName, driverId]);

  const onCallDriver = useCallback(async () => {
    if (!driverPhoneText)
      return Alert.alert("No phone", "Driver phone number not available yet.");
    try {
      await Linking.openURL(`tel:${driverPhoneText}`);
    } catch {
      Alert.alert("Cannot call", "Your device cannot place calls.");
    }
  }, [driverPhoneText]);

  const onChatDriver = useCallback(() => {
    const rid = safeStr(deliveryRideId || effectiveRideIds?.[0] || "");
    if (!rid) return Alert.alert("Chat", "Ride ID is not available yet.");
    const did = safeStr(driverId);
    if (!did) return Alert.alert("Chat", "Driver ID is not available yet.");
    const mid = safeStr(businessId);
    if (!mid) return Alert.alert("Chat", "Merchant ID is missing.");
    const dname = safeStr(driverName) || "Driver";
    navigation.navigate("Chat", {
      requestId: String(rid),
      rideId: String(rid),
      driverUserId: String(did),
      driverName: String(dname),
      me: { role: "merchant", id: String(mid) },
      type: "driver",
      name: String(dname),
    });
  }, [
    navigation,
    deliveryRideId,
    effectiveRideIds,
    driverId,
    businessId,
    driverName,
  ]);

  const groupedDropPoints = useMemo(
    () => groupDropsByDistance(batchOrders, 12),
    [batchOrders],
  );

  // Calculate map center and zoom
  const { initialMapCenter, initialZoom } = useMemo(() => {
    const points = [];

    if (businessCoords && businessCoords.lat && businessCoords.lng) {
      points.push({ lat: businessCoords.lat, lng: businessCoords.lng });
    }

    Object.values(driversByRideId || {}).forEach((d) => {
      if (d?.coords?.lat && d?.coords?.lng) points.push(d.coords);
    });

    groupedDropPoints.forEach((g) => {
      if (g.lat && g.lng) points.push({ lat: g.lat, lng: g.lng });
    });

    console.log("Map points for center calculation:", points.length);

    if (points.length > 0) {
      let minLat = Infinity,
        maxLat = -Infinity;
      let minLng = Infinity,
        maxLng = -Infinity;
      points.forEach((p) => {
        minLat = Math.min(minLat, p.lat);
        maxLat = Math.max(maxLat, p.lat);
        minLng = Math.min(minLng, p.lng);
        maxLng = Math.max(maxLng, p.lng);
      });

      const center = {
        latitude: (minLat + maxLat) / 2,
        longitude: (minLng + maxLng) / 2,
      };

      const zoom = computeZoomForPoints(points);
      console.log("Computed map center:", center, "zoom:", zoom);
      return { initialMapCenter: center, initialZoom: zoom };
    }

    console.log("Using fallback coordinates (Thimphu)");
    return {
      initialMapCenter: { latitude: 27.4728, longitude: 89.639 },
      initialZoom: 12,
    };
  }, [businessCoords, driversByRideId, groupedDropPoints]);

  /* ============================================================
     Fit helper
  ============================================================ */
  const fitToPoints = useCallback(
    async (ref) => {
      if (!ref?.current) return;

      const points = [];

      if (businessCoords && businessCoords.lat && businessCoords.lng) {
        points.push({
          latitude: businessCoords.lat,
          longitude: businessCoords.lng,
        });
      }

      for (const rid of Object.keys(driversByRideId || {})) {
        const c = driversByRideId?.[rid]?.coords;
        if (c?.lat && c?.lng) {
          points.push({ latitude: c.lat, longitude: c.lng });
        }
      }

      for (const g of groupedDropPoints) {
        if (g.lat && g.lng) {
          points.push({ latitude: g.lat, longitude: g.lng });
        }
      }

      if (points.length === 0) return;

      let minLat = Infinity,
        maxLat = -Infinity;
      let minLng = Infinity,
        maxLng = -Infinity;
      points.forEach((p) => {
        minLat = Math.min(minLat, p.latitude);
        maxLat = Math.max(maxLat, p.latitude);
        minLng = Math.min(minLng, p.longitude);
        maxLng = Math.max(maxLng, p.longitude);
      });

      const centerLat = (minLat + maxLat) / 2;
      const centerLng = (minLng + maxLng) / 2;
      const maxDelta = Math.max(maxLat - minLat, maxLng - minLng);

      let zoom = 12;
      if (maxDelta < 0.01) zoom = 16;
      else if (maxDelta < 0.05) zoom = 14;
      else if (maxDelta < 0.1) zoom = 12;
      else if (maxDelta < 0.5) zoom = 10;
      else zoom = 8;

      try {
        await ref.current.animateCamera({
          latitude: centerLat,
          longitude: centerLng,
          zoom,
        });
      } catch (err) {
        console.log("Fit error:", err);
      }
    },
    [businessCoords, driversByRideId, groupedDropPoints],
  );

  const fitAll = useCallback(() => fitToPoints(mapRef), [fitToPoints]);
  const fitOverlay = useCallback(
    () => fitToPoints(overlayMapRef),
    [fitToPoints],
  );

  const openOverlay = useCallback(() => {
    if (Date.now() - lastMarkerPressTsRef.current < 300) return;
    overlayDidFitOnceRef.current = false;
    setOverlayOpen(true);
  }, []);

  const computeMultiRoutes = useCallback(async () => {
    const firstDriverKey = Object.keys(driversByRideId || {})[0];
    const driver = firstDriverKey
      ? driversByRideId?.[firstDriverKey]?.coords
      : null;

    const biz = businessCoords;

    const targets = (groupedDropPoints || []).filter((g) => {
      return !g.orderIds?.every((oid) => isDelivered(statusMap?.[oid]));
    });

    const key = JSON.stringify({
      driver,
      biz,
      targets: targets.map((t) => [t.lat, t.lng]),
    });

    const now = Date.now();

    if (
      key === lastRouteKeyRef.current &&
      now - lastRouteAtMsRef.current < 10000
    ) {
      return;
    }

    lastRouteKeyRef.current = key;
    lastRouteAtMsRef.current = now;

    setRouteLoading(true);

    try {
      if (driver && biz) {
        const coords = await fetchOsrmRoute2(driver, biz, 5000);
        if (coords.length) {
          setRouteDriverToBiz(coords);
        } else {
          setRouteDriverToBiz([
            { latitude: driver.lat, longitude: driver.lng },
            { latitude: biz.lat, longitude: biz.lng },
          ]);
        }
      }

      if (biz && targets.length) {
        const limitedTargets = targets.slice(0, 5);
        const results = await Promise.all(
          limitedTargets.map(async (t) => {
            const coords = await fetchOsrmRoute2(
              biz,
              {
                lat: t.lat,
                lng: t.lng,
              },
              5000,
            );
            if (coords.length) {
              return { key: t.key, coords };
            }
            return {
              key: t.key,
              coords: [
                { latitude: biz.lat, longitude: biz.lng },
                { latitude: t.lat, longitude: t.lng },
              ],
            };
          }),
        );
        setRouteBizToCustomers(results);
      }
    } finally {
      setRouteLoading(false);
    }
  }, [driversByRideId, businessCoords, groupedDropPoints, statusMap]);

  useEffect(() => {
    if (businessCoords && !routeLoading) {
      const timer = setTimeout(() => {
        computeMultiRoutes();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [businessCoords, computeMultiRoutes]);

  /* ---------- Expandable items ---------- */
  const [expandedMap, setExpandedMap] = useState({});
  const toggleExpanded = useCallback((orderId) => {
    const id = String(orderId || "");
    if (!id) return;
    setExpandedMap((prev) => ({ ...(prev || {}), [id]: !prev?.[id] }));
  }, []);

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
      const st = statusMap?.[oid];
      const label = st ? String(st).toUpperCase().replace(/_/g, " ") : "—";
      return { orderId: oid, status: label, delivered: isDelivered(st) };
    });
  }, [selectedGroup, statusMap]);

  /* ============================================================
     MARKER POPUP HANDLER FOR APK
  ============================================================ */
  const handleMarkerPress = useCallback(
    (markerId, markerData) => {
      console.log(
        "Marker pressed:",
        markerId,
        markerData?.popupData?.type || markerData?.type,
      );

      if (!markerData) {
        Alert.alert("Location", "Tap for more details", [{ text: "OK" }]);
        return;
      }

      // Check for popupData (APK compatible)
      const popup = markerData.popupData || markerData;

      if (popup.type === "business") {
        Alert.alert(
          popup.title || "Business Location",
          popup.details ||
            "Your business pickup point.\nAll deliveries start from here.",
          [{ text: "OK" }],
        );
      } else if (popup.type === "driver") {
        Alert.alert(
          popup.title || "Driver Information",
          popup.details ||
            `Driver: ${driverName || "N/A"}\nID: ${driverId || "N/A"}`,
          [
            { text: "Cancel", style: "cancel" },
            {
              text: popup.button1Text || "Call Driver",
              onPress: () => {
                if (popup.button1Action === "call") onCallDriver();
                else onCallDriver();
              },
            },
            {
              text: popup.button2Text || "Chat",
              onPress: () => {
                if (popup.button2Action === "chat") onChatDriver();
                else onChatDriver();
              },
            },
          ],
        );
      } else if (popup.type === "customer") {
        if (
          popup.button1Action === "viewOrders" &&
          popup.orderIds?.length > 1
        ) {
          // Find the group and show the modal
          const group = groupedDropPoints.find((g) => g.key === popup.groupKey);
          if (group) {
            openGroupModal(group);
          } else {
            Alert.alert(popup.title || "Orders", popup.details, [
              { text: "OK" },
            ]);
          }
        } else {
          Alert.alert(popup.title || "Order Details", popup.details, [
            { text: "OK" },
          ]);
        }
      } else {
        // Fallback
        Alert.alert(
          markerData.title || "Location",
          markerData.description || "Tap for more details",
          [{ text: "OK" }],
        );
      }
    },
    [
      driverName,
      driverId,
      onCallDriver,
      onChatDriver,
      groupedDropPoints,
      openGroupModal,
    ],
  );

  const markers = useMemo(() => {
    const list = [];

    // Business marker - Regular marker with color (not PNG) - RED (#e71414)
    if (businessCoords && businessCoords.lat && businessCoords.lng) {
      console.log(
        `[MARKER][BUSINESS] Adding marker at ${businessCoords.lat}, ${businessCoords.lng} with color ${COLORS.BUSINESS}`,
      );
      list.push({
        id: "business",
        coordinate: {
          latitude: businessCoords.lat,
          longitude: businessCoords.lng,
        },
        title: "Business",
        description: `${businessCoords.lat.toFixed(6)}, ${businessCoords.lng.toFixed(6)}`,
        icon: {
          color: COLORS.BUSINESS,
          size: 45,
        },
        zIndex: 20,
        popupData: {
          type: "business",
          title: "🏪 Business Location",
          details: `Your business pickup point\n\nCoordinates: ${businessCoords.lat.toFixed(6)}, ${businessCoords.lng.toFixed(6)}\nAll deliveries start from here.`,
          buttonText: "OK",
        },
      });
    }

    // Driver markers - PNG image
    Object.keys(driversByRideId || {}).forEach((rid) => {
      const c = driversByRideId[rid]?.coords;
      if (c?.lat && c?.lng) {
        console.log(
          `[MARKER][DRIVER] Adding marker for ride ${rid} at ${c.lat}, ${c.lng} with PNG image`,
        );
        list.push({
          id: `driver-${rid}`,
          coordinate: { latitude: c.lat, longitude: c.lng },
          title: "Driver",
          description: `${driverId || "N/A"}`,
          icon: {
            uri: Image.resolveAssetSource(DRIVER_MARKER).uri,
            size: 50,
          },
          zIndex: 15,
          popupData: {
            type: "driver",
            title: "🚗 Driver Information",
            details: `Driver Name: ${driverName || "N/A"}\nDriver ID: ${driverId || "N/A"}\nRide ID: ${rid}`,
            button1Text: "📞 Call Driver",
            button1Action: "call",
            button2Text: "💬 Chat",
            button2Action: "chat",
          },
        });
      }
    });

    // Customer markers - PNG image
    groupedDropPoints.slice(0, 15).forEach((g, idx) => {
      if (g.lat && g.lng) {
        console.log(
          `[MARKER][CUSTOMER] Adding marker group ${g.key} at ${g.lat}, ${g.lng} with PNG image (${g.count} orders)`,
        );
        list.push({
          id: `cust-${g.key}`,
          coordinate: { latitude: g.lat, longitude: g.lng },
          title: `${g.count} Orders`,
          description: `${g.count} customers`,
          icon: {
            uri: Image.resolveAssetSource(CUSTOMER_MARKER).uri,
            size: 45,
          },
          zIndex: 10,
          popupData: {
            type: "customer",
            title: `📦 ${g.count} Orders at this Location`,
            details: `Customer location for these orders. Orders: ${g.orderIds.join(", ")}`,
            button1Text: "View Orders",
            button1Action: "viewOrders",
            groupKey: g.key,
            orderIds: g.orderIds,
          },
        });
      }
    });

    return list;
  }, [
    businessCoords,
    driversByRideId,
    groupedDropPoints,
    driverName,
    driverId,
  ]);

  /* ============================================================
     POLYLINES
  ============================================================ */
  const polylines = useMemo(() => {
    const lines = [];

    if (routeDriverToBiz?.length > 1) {
      lines.push({
        id: "driver-biz",
        coordinates: routeDriverToBiz,
        strokeColor: "#2563eb",
        strokeWidth: 4,
        zIndex: 5,
      });
    }

    routeBizToCustomers.forEach((r) => {
      if (r?.coords?.length > 1) {
        lines.push({
          id: `cust-${r.key}`,
          coordinates: r.coords,
          strokeColor: "#60a5fa",
          strokeWidth: 3,
          zIndex: 5,
        });
      }
    });

    console.log("Polylines created:", lines.length);
    return lines;
  }, [routeDriverToBiz, routeBizToCustomers]);

  /* ---------- Render order row ---------- */
  const renderRow = ({ item }) => {
    const base = item.raw || item || {};
    const id = getOrderId(base) || getOrderId(item) || item.id;

    const statusRaw = (loaded && id ? statusMap[id] : "") || "";
    const statusLabel = statusRaw
      ? String(statusRaw).toUpperCase().replace(/_/g, " ")
      : loaded
        ? "—"
        : "...";

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
          style={({ pressed }) => [
            styles.orderPress,
            pressed ? { opacity: 0.85 } : null,
          ]}
        >
          <View style={styles.orderTop}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={styles.orderId}>#{id}</Text>
              <Ionicons
                name={expanded ? "chevron-up" : "chevron-down"}
                size={18}
                color="#6b7280"
                style={{ marginLeft: 8 }}
              />
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
            {hasItems
              ? `${items.length} item${items.length === 1 ? "" : "s"}`
              : "Items: —"}
          </Text>
        </Pressable>

        {expanded && (
          <View style={styles.itemsDropdown}>
            {hasItems ? (
              items.slice(0, 5).map((it, idx) => {
                const title = pickItemName(it);
                const qty = pickItemQty(it);
                const price = pickItemPrice(it);
                return (
                  <View key={`${id}-it-${idx}`} style={styles.itemRow}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={styles.itemName} numberOfLines={2}>
                        {title}
                      </Text>
                      {price != null ? (
                        <Text style={styles.itemSub}>
                          {formatMoney(price)} x{qty}
                        </Text>
                      ) : (
                        <Text style={styles.itemSub}>x{qty}</Text>
                      )}
                    </View>
                  </View>
                );
              })
            ) : (
              <Text style={styles.noItemsText}>No items</Text>
            )}
          </View>
        )}
      </View>
    );
  };

  const chatDisabled =
    !safeStr(driverId) || !safeStr(deliveryRideId || effectiveRideIds?.[0]);

  /* ============================================================
     RENDER
  ============================================================ */
  return (
    <SafeAreaView style={styles.safe} edges={["left", "right", "bottom"]}>
      {/* LOCATION GROUP MODAL */}
      <Modal
        visible={locationModalOpen}
        transparent
        animationType="fade"
        onRequestClose={closeGroupModal}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeGroupModal}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Orders at this location
                {selectedGroup?.count > 1 ? ` (${selectedGroup.count})` : ""}
              </Text>
              <Pressable onPress={closeGroupModal} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={18} color="#0f172a" />
              </Pressable>
            </View>
            <View style={{ marginTop: 10, maxHeight: 400 }}>
              {selectedGroupRows.length ? (
                selectedGroupRows.map((r) => {
                  const order = batchOrders.find((o) => {
                    const id = getOrderId(o);
                    return id === r.orderId;
                  });
                  const customerName =
                    order?.customer_name || order?.user_name || "Unknown";
                  const items = order?.items || [];
                  const itemCount = items.length;

                  return (
                    <View key={`loc-${r.orderId}`} style={styles.modalRow}>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <View>
                          <Text style={styles.modalOrderId}>#{r.orderId}</Text>
                          <Text
                            style={{
                              fontSize: 11,
                              color: "#6b7280",
                              marginTop: 2,
                            }}
                          >
                            {customerName}
                          </Text>
                        </View>
                        {r.delivered && (
                          <View style={styles.modalDeliveredPill}>
                            <Ionicons
                              name="checkmark-circle"
                              size={14}
                              color="#16a34a"
                            />
                            <Text style={styles.modalDeliveredText}>
                              Delivered
                            </Text>
                          </View>
                        )}
                      </View>
                      <View
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                          marginTop: 8,
                        }}
                      >
                        <Text style={styles.modalStatus}>{r.status}</Text>
                        <Text style={{ fontSize: 11, color: "#6b7280" }}>
                          {itemCount} {itemCount === 1 ? "item" : "items"}
                        </Text>
                      </View>
                    </View>
                  );
                })
              ) : (
                <Text style={styles.modalEmpty}>No orders found.</Text>
              )}
            </View>
            <TouchableOpacity
              style={{ marginTop: 16, alignSelf: "center" }}
              onPress={closeGroupModal}
            >
              <Text style={{ color: "#16a34a", fontWeight: "600" }}>Close</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* FULLSCREEN OVERLAY MAP */}
      <Modal
        visible={overlayOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setOverlayOpen(false)}
      >
        <SafeAreaView
          style={styles.overlaySafe}
          edges={["left", "right", "top", "bottom"]}
        >
          <View style={styles.overlayHeader}>
            <Pressable
              onPress={() => setOverlayOpen(false)}
              style={styles.overlayCloseBtn}
            >
              <Ionicons name="close" size={22} color="#0f172a" />
            </Pressable>
            <Text style={styles.overlayTitle}>Live location</Text>
            <View style={{ width: 40 }} />
          </View>
          <View style={styles.overlayMapWrap}>
            <OSMViewErrorBoundary>
              <OSMView
                ref={overlayMapRef}
                style={{ flex: 1 }}
                initialCenter={initialMapCenter}
                initialZoom={initialZoom}
                markers={markers}
                polylines={polylines}
                styleUrl="https://tiles.openfreemap.org/styles/liberty"
                onMapReady={() => {
                  console.log("Overlay map ready");
                  if (overlayDidFitOnceRef.current) return;
                  overlayDidFitOnceRef.current = true;
                  setTimeout(() => fitOverlay(), 300);
                }}
                onError={(error) => {
                  console.error("Overlay map error:", error);
                }}
                onMarkerPress={(event) => {
                  const markerId =
                    event?.nativeEvent?.markerId ||
                    event?.markerId ||
                    event?.id;
                  const markerData = markers.find((m) => m.id === markerId);
                  if (markerId && markerData) {
                    handleMarkerPress(markerId, markerData);
                  }
                }}
                cacheEnabled={true}
                cacheSize={50}
              />
            </OSMViewErrorBoundary>
            <View style={styles.overlayActions}>
              <TouchableOpacity
                style={styles.fitBtn}
                onPress={fitOverlay}
                activeOpacity={0.85}
              >
                <Ionicons name="scan-outline" size={16} color="#ffffff" />
                <Text style={styles.fitBtnText}>Fit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </Modal>

      {/* HEADER */}
      <View style={[styles.headerBar, { paddingTop: headerTopPad }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
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
          Batch: {batchId || "—"} · Ride:{" "}
          {effectiveRideIds.length ? effectiveRideIds.join(", ") : "—"}
        </Text>
      </View>

      {/* MAP CARD */}
      <View style={styles.mapCard}>
        <View style={styles.mapWrap}>
          {!mapError ? (
            <OSMViewErrorBoundary>
              <OSMView
                key={mapKey}
                ref={mapRef}
                style={styles.map}
                initialCenter={initialMapCenter}
                  initialZoom={initialZoom}
                markers={markers}
                polylines={polylines}
                styleUrl="https://tiles.openfreemap.org/styles/liberty"
                onMapReady={() => {
                  console.log("✅ MAIN MAP READY!");
                  setShowLoader(false);
                  setMapInitAttempts(0);
                  if (didFitOnceRef.current) return;
                  didFitOnceRef.current = true;
                  setTimeout(() => {
                    if (markers.length > 0) {
                      console.log("Fitting map to", markers.length, "markers");
                      fitAll();
                    }
                  }, 500);
                }}
                onError={(error) => {
                  console.error("❌ OSMView error:", error);
                  setMapInitAttempts((prev) => prev + 1);
                  if (mapInitAttempts >= 2) {
                    setShowLoader(false);
                    setMapError(true);
                  }
                }}
                onPress={() => openOverlay()}
                onMarkerPress={(event) => {
                  console.log("Marker press event:", event);
                  const markerId =
                    event?.nativeEvent?.markerId ||
                    event?.markerId ||
                    event?.id;
                  const markerData = markers.find((m) => m.id === markerId);
                  if (markerId && markerData) {
                    handleMarkerPress(markerId, markerData);
                  }
                }}
                cacheEnabled={true}
                cacheSize={100}
                userAgent="YourApp/1.0"
                renderToHardwareTextureAndroid={true}
              />
            </OSMViewErrorBoundary>
          ) : (
            <View style={styles.mapErrorContainer}>
              <Ionicons name="map-outline" size={48} color="#ef4444" />
              <Text style={styles.mapErrorText}>Unable to load map</Text>
              <Text style={styles.mapErrorSubtext}>
                Check your internet connection
              </Text>
              <TouchableOpacity
                style={styles.mapRetryBtn}
                onPress={() => {
                  setMapError(false);
                  setMapInitAttempts(0);
                  setMapKey(Date.now());
                  setShowLoader(true);
                }}
              >
                <Text style={styles.mapRetryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Loading indicator */}
          {showLoader && !mapError && (
            <View style={styles.mapLoadingOverlay}>
              <ActivityIndicator size="large" color="#16a34a" />
              <Text style={styles.mapLoadingText}>Loading map...</Text>
              <Text style={styles.mapLoadingSubtext}>
                {businessCoords
                  ? "📍 Found location"
                  : "Waiting for location..."}
              </Text>
              {mapInitAttempts > 0 && (
                <Text style={styles.mapLoadingSubtext}>
                  Retry attempt {mapInitAttempts}/3
                </Text>
              )}
            </View>
          )}

          <View style={styles.mapActions}>
            <TouchableOpacity
              style={styles.fitBtn}
              onPress={fitAll}
              activeOpacity={0.85}
            >
              <Ionicons name="scan-outline" size={16} color="#ffffff" />
              <Text style={styles.fitBtnText}>Fit All</Text>
            </TouchableOpacity>
            <View style={{ height: 8 }} />
            <TouchableOpacity
              style={styles.expandBtn}
              onPress={openOverlay}
              activeOpacity={0.85}
            >
              <Ionicons name="expand-outline" size={16} color="#ffffff" />
              <Text style={styles.fitBtnText}>Fullscreen</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* DRIVER CARD */}
      <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
        <View style={styles.driverCard}>
          <View style={styles.driverHeaderRow}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons name="car-outline" size={18} color="#111827" />
              <Text style={styles.driverTitle}>Driver</Text>
            </View>
            <TouchableOpacity
              onPress={onRefresh}
              style={styles.driverRefreshBtn}
              activeOpacity={0.8}
            >
              <Ionicons name="refresh" size={18} color="#111827" />
            </TouchableOpacity>
          </View>
          <Text style={styles.driverText}>{deliveredByText}</Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginTop: 10,
            }}
          >
            <TouchableOpacity
              style={[
                styles.callBtn,
                !driverPhoneText ? styles.callBtnDisabled : null,
              ]}
              activeOpacity={0.85}
              onPress={onCallDriver}
              disabled={!driverPhoneText}
            >
              <Ionicons name="call-outline" size={16} color="#ffffff" />
              <Text style={styles.callBtnText}>Call driver</Text>
            </TouchableOpacity>
            <View style={{ width: 10 }} />
            <TouchableOpacity
              style={[
                styles.chatBtn,
                chatDisabled ? styles.chatBtnDisabled : null,
              ]}
              activeOpacity={0.85}
              onPress={onChatDriver}
              disabled={chatDisabled}
            >
              <Ionicons name="chatbubbles-outline" size={16} color="#ffffff" />
              <Text style={styles.chatBtnText}>Chat driver</Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }} />
            <TouchableOpacity
              style={styles.moreBtn}
              activeOpacity={0.85}
              onPress={onRefresh}
            >
              <Ionicons name="ellipsis-vertical" size={18} color="#6b7280" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ORDER LIST */}
      <View style={styles.listHeader}>
        <Text style={styles.listHeaderText}>Orders in this batch</Text>
        {!!batchOrderIds.length && (
          <Text style={styles.attribTextSmall}>
            IDs: {batchOrderIds.length}
          </Text>
        )}
      </View>

      <FlatList
        data={batchOrders}
        keyExtractor={(it, idx) => String(getOrderId(it) || it?.id || idx)}
        renderItem={renderRow}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
            <Text style={{ color: "#6b7280", fontWeight: "700" }}>
              {batchOrdersLoading
                ? "Loading orders…"
                : "No orders found for this batch."}
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

/* ============================================================
   STYLES
============================================================ */
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
  backBtn: {
    height: 40,
    width: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "700",
    color: "#0f172a",
  },

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
    backgroundColor: "#f0f0f0",
    height: 260,
    position: "relative",
  },
  map: { flex: 1, width: "100%", height: "100%" },

  mapLoadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255,255,255,0.95)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  mapLoadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#16a34a",
    fontWeight: "600",
  },
  mapLoadingSubtext: {
    marginTop: 4,
    fontSize: 11,
    color: "#6b7280",
  },
  mapErrorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f9fafb",
  },
  mapErrorText: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
  mapErrorSubtext: {
    marginTop: 4,
    fontSize: 12,
    color: "#6b7280",
  },
  mapRetryBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: "#16a34a",
    borderRadius: 8,
  },
  mapRetryText: {
    color: "#fff",
    fontWeight: "600",
  },

  mapLegend: {
    position: "absolute",
    left: 10,
    bottom: 14,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    zIndex: 5,
    minWidth: 150,
  },
  legendSection: {
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  legendTitle: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#0f172a",
  },
  legendRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  legendDot: { width: 12, height: 12, borderRadius: 6, marginRight: 6 },
  legendText: { fontSize: 10, color: "#374151", fontWeight: "500" },
  legendDivider: {
    height: 1,
    backgroundColor: "#e5e7eb",
    marginVertical: 4,
  },
  legendNote: {
    fontSize: 9,
    color: "#6b7280",
    marginTop: 4,
    textAlign: "center",
    fontStyle: "italic",
  },

  mapActions: { position: "absolute", right: 10, bottom: 14, zIndex: 5 },
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
  fitBtnText: { marginLeft: 6, color: "#fff", fontSize: 11, fontWeight: "900" },

  attribTextSmall: {
    marginTop: 4,
    fontSize: 10,
    color: "#6b7280",
    fontWeight: "700",
  },

  driverCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 12,
    backgroundColor: "#f9fafb",
  },
  driverHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  driverTitle: {
    marginLeft: 6,
    fontSize: 13,
    fontWeight: "800",
    color: "#111827",
  },
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
  driverText: {
    marginTop: 6,
    fontSize: 12,
    color: "#374151",
    fontWeight: "700",
  },
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
  callBtnText: {
    marginLeft: 6,
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },
  chatBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2563eb",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  chatBtnDisabled: { backgroundColor: "#9ca3af" },
  chatBtnText: {
    marginLeft: 6,
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },
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
  orderRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  orderPress: { paddingVertical: 2 },
  orderTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
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
  orderMeta: {
    marginTop: 2,
    fontSize: 11,
    color: "#4b5563",
    fontWeight: "700",
  },
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
  itemName: { fontSize: 12, color: "#111827", fontWeight: "800", flex: 1 },
  itemSub: { marginTop: 2, fontSize: 10, color: "#6b7280" },
  noItemsText: { fontSize: 12, color: "#6b7280", textAlign: "center" },

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
  overlayCloseBtn: {
    height: 40,
    width: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  overlayTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "900",
    color: "#0f172a",
  },
  overlayMapWrap: { flex: 1, backgroundColor: "#f0f0f0", position: "relative" },
  overlayActions: { position: "absolute", right: 14, top: 70, zIndex: 10 },

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
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
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
  modalStatus: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "900",
    color: "#0f172a",
  },
  modalEmpty: {
    marginTop: 10,
    fontSize: 12,
    color: "#6b7280",
    fontWeight: "800",
  },
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
  modalDeliveredText: {
    marginLeft: 4,
    fontSize: 11,
    fontWeight: "900",
    color: "#16a34a",
  },
});
