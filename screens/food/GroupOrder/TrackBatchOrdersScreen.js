// services/food/GroupOrder/TrackBatchOrdersScreen.js
// ✅ UPDATED - Shows order items + Mark as Ready button

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
  UPDATE_ORDER_STATUS_ENDPOINT,
} from "@env";

import {
  initSocket,
  setCurrentRide,
  onDriverLocation as listenToDriverLocation,
} from "./socket";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const COLORS = {
  BUSINESS: "#e71414", // red
  DRIVER: "#2563eb", // blue
  CUSTOMER: "#00b14f", // green
};
const makePinSvg = (color) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
      <path d="M24 2C15.2 2 8 9.2 8 18c0 11.5 16 28 16 28s16-16.5 16-28C40 9.2 32.8 2 24 2z" fill="${color}"/>
      <circle cx="24" cy="18" r="6" fill="white"/>
    </svg>
  `)}`;
class OSMViewErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.mapErrorContainer}>
          <Ionicons name="map-outline" size={48} color="#ef4444" />
          <Text style={styles.mapErrorText}>Map failed to load</Text>
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

// ============ HELPERS ============
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

const getItemName = (it) =>
  it?.item_name ?? it?.name ?? it?.product_name ?? it?.title ?? "Item";

const getItemQty = (it) => {
  const q = Number(it?.qty ?? it?.quantity ?? it?.item_qty ?? 1);
  return Number.isFinite(q) && q > 0 ? q : 1;
};

const extractLatLng = (obj) => {
  if (!obj) return null;
  const cand = [
    { lat: obj.lat, lng: obj.lng },
    { lat: obj.latitude, lng: obj.longitude },
    { lat: obj.current_lat, lng: obj.current_lng },
    { lat: obj.driver_lat, lng: obj.driver_lng },
    { lat: obj?.coords?.lat, lng: obj?.coords?.lng },
    { lat: obj?.location?.lat, lng: obj?.location?.lng },
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
  return `${tmpl.replace(/\/+$/, "")}/${encodeURIComponent(businessId)}`;
};

const buildBusinessDetailsUrl = (businessId) => {
  if (!businessId) return null;
  const tmpl = String(ENV_BUSINESS_DETAILS || "").trim();
  if (!tmpl) return null;
  if (tmpl.includes("{businessId}"))
    return tmpl.replace("{businessId}", encodeURIComponent(businessId));
  return `${tmpl.replace(/\/+$/, "")}/${encodeURIComponent(businessId)}`;
};

const buildDriverDetailsUrl = (driverId) => {
  const id = safeStr(driverId);
  if (!id) return null;
  const tmpl = String(ENV_DRIVER_DETAILS_ENDPOINT || "").trim();
  if (!tmpl) return null;
  if (tmpl.includes("{driverId}"))
    return tmpl.replace("{driverId}", encodeURIComponent(id));
  const base = tmpl.replace(/\/+$/, "");
  const join = base.includes("?") ? "&" : "?";
  return `${base}${join}driverId=${encodeURIComponent(id)}`;
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

const groupDropsByDistance = (orders = [], distanceMeters = 12) => {
  const groups = [];
  for (const o of orders || []) {
    const base = o?.raw || o || {};
    const coords = extractOrderDropCoords(base);
    if (!coords) continue;
    const orderId = getOrderId(base) || getOrderId(o) || "";
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
  const maxDiff = Math.max(maxLat - minLat, maxLng - minLng);
  if (maxDiff < 0.01) return 16;
  if (maxDiff < 0.05) return 14;
  if (maxDiff < 0.1) return 12;
  if (maxDiff < 0.5) return 10;
  return 9;
};

// ============ MAIN COMPONENT ============
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

  // IDs
  const [batchId, setBatchId] = useState(() => params?.batch_id || null);
  const [deliveryRideId, setDeliveryRideId] = useState(
    () => params?.ride_id || null,
  );
  const [restoredIds, setRestoredIds] = useState(false);

  // Driver
  const [driverInfo, setDriverInfo] = useState(driverDetailsFromParams || null);
  const [driverRating, setDriverRating] = useState(
    driverRatingFromParams || null,
  );
  const [driverId, setDriverId] = useState(
    () => driver_id || driverIdParam || null,
  );

  // Order status update loading state
  const [updatingOrderId, setUpdatingOrderId] = useState(null);

  const lastDriverDetailsFetchMsRef = useRef(0);
  const lastDriverUpdateMsRef = useRef(0);
  const lastMapCenterHashRef = useRef("");
  const lastMarkersHashRef = useRef("");
  const socketInitializedRef = useRef(false);
  const routeComputedRef = useRef(false);
  const hasFetchedInitialData = useRef(false);
  const hasLoadedBatchOrders = useRef(false);
  const didFitOnceRef = useRef(false);
  const [mapKey, setMapKey] = useState(Date.now());

  // Batch orders
  const batchOrderIds = useMemo(
    () =>
      Array.isArray(batchOrderIdsFromParams)
        ? batchOrderIdsFromParams.map(safeStr).filter(Boolean)
        : [],
    [batchOrderIdsFromParams],
  );

  const [batchOrders, setBatchOrders] = useState(() => {
    const passed = Array.isArray(passedOrdersRaw) ? passedOrdersRaw : [];
    if (batchOrderIds.length) {
      return passed.filter((o) => batchOrderIds.includes(getOrderId(o)));
    }
    return [];
  });
  const [batchOrdersLoading, setBatchOrdersLoading] = useState(false);

  // Map state
  const [refreshing, setRefreshing] = useState(false);
  const [statusMap, setStatusMap] = useState({});
  const [itemsMap, setItemsMap] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [businessCoords, setBusinessCoords] = useState(null);
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [mapError, setMapError] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const [showLoader, setShowLoader] = useState(false); // CHANGED: Start with false to show map immediately
  const [mapInitAttempts, setMapInitAttempts] = useState(0);
  const [driversByRideId, setDriversByRideId] = useState({});
  const [routeDriverToBiz, setRouteDriverToBiz] = useState([]);
  const [routeBizToCustomers, setRouteBizToCustomers] = useState([]);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [expandedMap, setExpandedMap] = useState({});

  const mapRef = useRef(null);
  const overlayMapRef = useRef(null);
  const unsubscribeRef = useRef(null);
  const lastRouteKeyRef = useRef("");
  const lastRouteAtMsRef = useRef(0);
  const lastMarkerPressTsRef = useRef(0);

  // ============ MARK ORDER AS READY ============
  const markOrderAsReady = useCallback(
    async (orderId, orderCode) => {
      if (updatingOrderId) return;

      setUpdatingOrderId(orderId);

      try {
        const token = await SecureStore.getItemAsync("auth_token");
        if (!token) {
          Alert.alert("Error", "Authentication token not found");
          return;
        }

        const endpoint = String(UPDATE_ORDER_STATUS_ENDPOINT || "").trim();
        if (!endpoint) {
          Alert.alert("Error", "Update order endpoint not configured");
          return;
        }

        // Replace {order_id} with actual order code
        const url = endpoint.replace(
          "{order_id}",
          encodeURIComponent(orderCode),
        );

        const payload = {
          status: "READY",
          status_reason: "Order is ready for pickup/delivery",
          reason: "Order is ready for pickup/delivery",
        };

        console.log("[MARK READY] Updating order:", orderCode, "to READY");

        const response = await fetch(url, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });

        const text = await response.text();
        let json = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {}

        if (!response.ok) {
          throw new Error(
            json?.message || json?.error || `HTTP ${response.status}`,
          );
        }

        Alert.alert("Success", `Order #${orderCode} marked as READY`);

        // Update local status
        setStatusMap((prev) => ({ ...prev, [orderId]: "READY" }));

        // Refresh orders to get updated status
        await fetchGroupedStatusesItems();
      } catch (error) {
        console.error("[MARK READY] Error:", error);
        Alert.alert("Error", error.message || "Failed to update order status");
      } finally {
        setUpdatingOrderId(null);
      }
    },
    [updatingOrderId, fetchGroupedStatusesItems],
  );

  // ============ LOAD BATCH ORDERS ============
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
    if (batchOrders.length) return;
    setBatchOrdersLoading(true);
    try {
      const all = await fetchAllGroupedOrdersFlat();
      if (!all.length) return;
      const picked = all.filter((o) => {
        const id = getOrderId(o);
        return id && batchOrderIds.includes(id);
      });
      if (picked.length) setBatchOrders(picked);
    } finally {
      setBatchOrdersLoading(false);
    }
  }, [
    businessId,
    batchOrderIds,
    batchId,
    batchOrders.length,
    fetchAllGroupedOrdersFlat,
  ]);

  useEffect(() => {
    if (!hasLoadedBatchOrders.current && batchOrderIds.length) {
      hasLoadedBatchOrders.current = true;
      loadBatchOrders();
    }
  }, [batchOrderIds, loadBatchOrders]);

  // ============ FETCH STATUSES & BUSINESS ============
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
              const status = o.status || o.order_status || o.current_status;
              if (status) nextStatusMap[id] = status;
              if (Array.isArray(o.items)) nextItemsMap[id] = o.items;
            }
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
    if (businessCoords) return;
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
        extractLatLng(base?.location);
      if (coords) {
        console.log("Business coordinates found:", coords);
        setBusinessCoords(coords);
      }
      setLoadingLocation(false);
    } catch (error) {
      console.error("Error fetching business location:", error);
      setLoadingLocation(false);
    }
  }, [businessId, businessCoords]);

  const fetchDriverDetailsById = useCallback(async (id) => {
    const driverIdClean = safeStr(id);
    if (!driverIdClean) return;
    const url = buildDriverDetailsUrl(driverIdClean);
    if (!url) return;
    const now = Date.now();
    if (now - lastDriverDetailsFetchMsRef.current < 10000) return;
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
      const details = json?.details || json?.data || json || null;
      if (details && typeof details === "object") {
        setDriverInfo((prev) => ({
          ...(prev || {}),
          user_name: details.user_name || details.name || prev?.user_name,
          phone: details.phone || prev?.phone,
        }));
      }
    } catch (e) {
      console.log("[DRIVER] error:", e?.message);
    }
  }, []);

  // ============ INITIAL DATA FETCH ============
  useEffect(() => {
    if (!hasFetchedInitialData.current) {
      hasFetchedInitialData.current = true;
      fetchGroupedStatusesItems();
      fetchBusinessLocation();
      if (driverId) fetchDriverDetailsById(driverId);
    }
  }, [
    fetchGroupedStatusesItems,
    fetchBusinessLocation,
    driverId,
    fetchDriverDetailsById,
  ]);

  // ============ SOCKET SETUP (ONCE) ============
  useEffect(() => {
    if (socketInitializedRef.current) return;
    if (!deliveryRideId) return;

    socketInitializedRef.current = true;
    const socket = initSocket({});
    if (!socket) {
      socketInitializedRef.current = false;
      return;
    }

    setCurrentRide(String(deliveryRideId));
    const join = () =>
      socket.emit("joinRide", { rideId: String(deliveryRideId) }, () => {});
    socket.connected ? join() : socket.once("connect", join);

    const unsubscribe = listenToDriverLocation((locationData) => {
      const now = Date.now();
      if (now - lastDriverUpdateMsRef.current < 1000) return;
      lastDriverUpdateMsRef.current = now;

      const coords = extractLatLng(locationData);
      if (!coords) return;

      const rid = locationData?.ride_id || deliveryRideId;
      setDriversByRideId((prev) => {
        const prevEntry = prev?.[rid];
        if (prevEntry?.coords && haversineMeters(prevEntry.coords, coords) < 5)
          return prev;
        return {
          ...prev,
          [rid]: { coords, lastPing: new Date().toISOString() },
        };
      });
    });
    unsubscribeRef.current = unsubscribe;

    return () => {
      if (unsubscribeRef.current) unsubscribeRef.current();
      socketInitializedRef.current = false;
    };
  }, [deliveryRideId]);

  // ============ DERIVED DATA ============
  const effectiveRideIds = useMemo(() => {
    const set = new Set();
    if (deliveryRideId) set.add(deliveryRideId);
    if (Array.isArray(rideIds))
      rideIds.forEach((r) => {
        if (r) set.add(String(r));
      });
    return Array.from(set);
  }, [deliveryRideId, rideIds]);

  const groupedDropPoints = useMemo(
    () => groupDropsByDistance(batchOrders, 12),
    [batchOrders],
  );

  const { initialMapCenter, initialZoom } = useMemo(() => {
    const points = [];
    if (businessCoords) points.push(businessCoords);
    Object.values(driversByRideId).forEach((d) => {
      if (d?.coords) points.push(d.coords);
    });
    groupedDropPoints.forEach((g) => {
      if (g.lat && g.lng) points.push({ lat: g.lat, lng: g.lng });
    });

    if (points.length === 0) {
      return {
        initialMapCenter: { latitude: 27.4728, longitude: 89.639 },
        initialZoom: 12,
      };
    }

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
    return { initialMapCenter: center, initialZoom: zoom };
  }, [businessCoords, driversByRideId, groupedDropPoints]);

  // ============ MARKERS ============
  const driverName = useMemo(() => {
    const d = driverInfo || {};
    return (
      safeStr(d?.user_name || d?.name || driverNameFromParams || "") || "Driver"
    );
  }, [driverInfo, driverNameFromParams]);

  const markers = useMemo(() => {
    const list = [];
    if (businessCoords) {
      list.push({
        id: "business",
        coordinate: {
          latitude: businessCoords.lat,
          longitude: businessCoords.lng,
        },
        title: "Business",
        icon: { uri: makePinSvg(COLORS.BUSINESS), size: 42 },
        popupData: {
          type: "business",
          title: "Business Location",
          details: "Your pickup point",
        },
      });
    }
    Object.keys(driversByRideId).forEach((rid) => {
      const c = driversByRideId[rid]?.coords;
      if (c) {
        list.push({
          id: `driver-${rid}`,
          coordinate: { latitude: c.lat, longitude: c.lng },
          title: "Driver",
          icon: { uri: makePinSvg(COLORS.DRIVER), size: 42 },
          popupData: {
            type: "driver",
            title: "Driver",
            details: `ID: ${driverId || "N/A"}`,
          },
        });
      }
    });
    groupedDropPoints.slice(0, 15).forEach((g) => {
      list.push({
        id: `cust-${g.key}`,
        coordinate: { latitude: g.lat, longitude: g.lng },
        title: `${g.count} Orders`,
        icon: { uri: makePinSvg(COLORS.CUSTOMER), size: 42 },
        popupData: {
          type: "customer",
          title: "Orders",
          details: `${g.count} customers`,
          groupKey: g.key,
          orderIds: g.orderIds,
        },
      });
    });
    return list;
  }, [businessCoords, driversByRideId, groupedDropPoints, driverId]);

  // ============ ROUTES ============
  const computeMultiRoutes = useCallback(async () => {
    const firstDriverKey = Object.keys(driversByRideId || {})[0];
    const driver = firstDriverKey
      ? driversByRideId[firstDriverKey]?.coords
      : null;
    const biz = businessCoords;
    if (!driver || !biz) return;

    const key = JSON.stringify({ driver, biz });
    const now = Date.now();
    if (
      key === lastRouteKeyRef.current &&
      now - lastRouteAtMsRef.current < 10000
    )
      return;
    lastRouteKeyRef.current = key;
    lastRouteAtMsRef.current = now;

    setRouteLoading(true);
    try {
      setRouteDriverToBiz([
        { latitude: driver.lat, longitude: driver.lng },
        { latitude: biz.lat, longitude: biz.lng },
      ]);
    } finally {
      setRouteLoading(false);
    }
  }, [driversByRideId, businessCoords]);

  useEffect(() => {
    if (!businessCoords || routeLoading || routeComputedRef.current) return;
    routeComputedRef.current = true;
    const timer = setTimeout(() => computeMultiRoutes(), 500); // CHANGED: Reduced from 2000ms to 500ms
    return () => clearTimeout(timer);
  }, [businessCoords, computeMultiRoutes, routeLoading]);

  const polylines = useMemo(() => {
    const lines = [];
    if (routeDriverToBiz?.length > 1) {
      lines.push({
        id: "driver-biz",
        coordinates: routeDriverToBiz,
        strokeColor: "#2563eb",
        strokeWidth: 4,
      });
    }
    return lines;
  }, [routeDriverToBiz]);

  // ============ FIT MAP ============
  const fitAll = useCallback(() => {
    if (!mapRef.current) return;
    const points = [];
    if (businessCoords)
      points.push({
        latitude: businessCoords.lat,
        longitude: businessCoords.lng,
      });
    Object.values(driversByRideId).forEach((d) => {
      if (d?.coords)
        points.push({ latitude: d.coords.lat, longitude: d.coords.lng });
    });
    groupedDropPoints.forEach((g) => {
      if (g.lat && g.lng) points.push({ latitude: g.lat, longitude: g.lng });
    });
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
    const center = {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
    };
    const maxDelta = Math.max(maxLat - minLat, maxLng - minLng);
    let zoom = 12;
    if (maxDelta < 0.01) zoom = 16;
    else if (maxDelta < 0.05) zoom = 14;
    else if (maxDelta < 0.1) zoom = 12;
    else if (maxDelta < 0.5) zoom = 10;
    else zoom = 8;
    mapRef.current.animateCamera?.({
      latitude: center.latitude,
      longitude: center.longitude,
      zoom,
    });
  }, [businessCoords, driversByRideId, groupedDropPoints]);

  // ============ RENDER ORDER ROW WITH STATUS-BASED READY BUTTON ============
  const renderOrderItems = (items) => {
    if (!items || !items.length) return null;
    return items.slice(0, 10).map((it, idx) => {
      const name = getItemName(it);
      const qty = getItemQty(it);
      return (
        <View key={idx} style={styles.itemRow}>
          <Text style={styles.itemName} numberOfLines={2}>
            {name}
          </Text>
          <Text style={styles.itemQty}>x{qty}</Text>
        </View>
      );
    });
  };

  const renderRow = ({ item }) => {
    const id = getOrderId(item) || item.id;
    const orderCode = item.order_code || item.id || id;
    const statusRaw = (loaded && id ? statusMap[id] : "") || "";
    const normalizedStatus = statusRaw
      ? String(statusRaw).toUpperCase()
      : loaded
        ? "PENDING"
        : "...";

    // Normalize status for comparison
    let displayStatus = normalizedStatus;
    let showReadyButton = false;

    // Check if we should show the "Mark as Ready" button
    // Show ONLY when status is ASSIGNED or CONFIRMED (before READY/PICKED_UP)
    if (normalizedStatus === "ASSIGNED") {
      showReadyButton = true;
    }

    // If status is already READY, PICKED_UP, OUT_FOR_DELIVERY, or COMPLETED, no button
    const isReadyOrLater = [
      "READY",
      "PICKED_UP",
      "PICKEDUP",
      "OUT_FOR_DELIVERY",
      "COMPLETED",
      "DELIVERED",
    ].includes(normalizedStatus);

    // Display labels
    let statusLabel = displayStatus;
    let statusStyle = {};
    let isReady = normalizedStatus === "READY";

    if (normalizedStatus === "ASSIGNED") {
      statusLabel = "DRIVER ASSIGNED";
      statusStyle = { backgroundColor: "#e0e7ff", borderColor: "#c7d2fe" };
    } else if (normalizedStatus === "CONFIRMED") {
      statusLabel = "CONFIRMED";
      statusStyle = { backgroundColor: "#dcfce7", borderColor: "#86efac" };
    } else if (isReady) {
      statusLabel = "READY ✓";
      statusStyle = { backgroundColor: "#dcfce7", borderColor: "#86efac" };
    } else if (
      normalizedStatus === "PICKED_UP" ||
      normalizedStatus === "PICKEDUP"
    ) {
      statusLabel = "PICKED UP ✓";
      statusStyle = { backgroundColor: "#d1fae5", borderColor: "#a7f3d0" };
    } else if (normalizedStatus === "OUT_FOR_DELIVERY") {
      statusLabel = "OUT FOR DELIVERY";
      statusStyle = { backgroundColor: "#fef3c7", borderColor: "#fcd34d" };
    } else if (
      normalizedStatus === "COMPLETED" ||
      normalizedStatus === "DELIVERED"
    ) {
      statusLabel = "DELIVERED ✓";
      statusStyle = { backgroundColor: "#d1fae5", borderColor: "#a7f3d0" };
    } else if (normalizedStatus === "PENDING") {
      statusLabel = "PENDING";
      statusStyle = { backgroundColor: "#f3f4f6", borderColor: "#d1d5db" };
    }

    const name =
      item.customer_name ?? item.user_name ?? item.customer?.name ?? "";
    const items = (id && itemsMap[id]) || item.items || [];

    return (
      <View style={styles.orderCard}>
        <View style={styles.orderHeader}>
          <View>
            <Text style={styles.orderId}>#{orderCode}</Text>
            {!!name && <Text style={styles.orderName}>{name}</Text>}
          </View>
          <View style={[styles.statusPill, statusStyle]}>
            <Text
              style={[styles.statusPillText, isReady && styles.statusReadyText]}
            >
              {statusLabel}
            </Text>
          </View>
        </View>

        {items.length > 0 && (
          <View style={styles.itemsContainer}>
            <Text style={styles.itemsTitle}>Items ({items.length})</Text>
            {renderOrderItems(items)}
          </View>
        )}

        {/* Show "Mark as Ready" button ONLY for ASSIGNED or CONFIRMED status */}
        {showReadyButton && !isReadyOrLater && (
          <TouchableOpacity
            style={styles.readyButton}
            onPress={() => markOrderAsReady(id, orderCode)}
            disabled={updatingOrderId === id}
          >
            {updatingOrderId === id ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Ionicons
                  name="checkmark-circle-outline"
                  size={18}
                  color="#ffffff"
                />
                <Text style={styles.readyButtonText}>Mark as Ready</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Show "Ready" badge for READY status */}
        {normalizedStatus === "READY" && (
          <View style={styles.readyBadge}>
            <Ionicons name="checkmark-circle" size={16} color="#16a34a" />
            <Text style={styles.readyBadgeText}>
              Order is ready for pickup/delivery
            </Text>
          </View>
        )}

        {/* Show "Picked Up" badge for PICKED_UP status */}
        {(normalizedStatus === "PICKED_UP" ||
          normalizedStatus === "PICKEDUP") && (
          <View style={[styles.readyBadge, { backgroundColor: "#d1fae5" }]}>
            <Ionicons name="bicycle" size={16} color="#16a34a" />
            <Text style={[styles.readyBadgeText, { color: "#16a34a" }]}>
              Driver has picked up the order
            </Text>
          </View>
        )}

        {/* Show "Delivered" badge for COMPLETED status */}
        {(normalizedStatus === "COMPLETED" ||
          normalizedStatus === "DELIVERED") && (
          <View style={[styles.readyBadge, { backgroundColor: "#d1fae5" }]}>
            <Ionicons name="checkmark-done-circle" size={16} color="#16a34a" />
            <Text style={[styles.readyBadgeText, { color: "#16a34a" }]}>
              Order delivered successfully
            </Text>
          </View>
        )}
      </View>
    );
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        fetchGroupedStatusesItems(),
        fetchBusinessLocation(),
        loadBatchOrders(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [fetchGroupedStatusesItems, fetchBusinessLocation, loadBatchOrders]);

  const openGroupModal = useCallback((group) => {
    setSelectedGroup(group);
    setLocationModalOpen(true);
  }, []);

  const closeGroupModal = useCallback(() => {
    setLocationModalOpen(false);
    setSelectedGroup(null);
  }, []);

  const openOverlay = () => setOverlayOpen(true);
  const fitOverlay = () => {};

  const onCallDriver = useCallback(async () => {
    const phone = driverInfo?.phone || "";
    if (!phone) return Alert.alert("No phone", "Driver phone not available");
    await Linking.openURL(`tel:${phone}`);
  }, [driverInfo]);

  const onChatDriver = useCallback(() => {
    if (!deliveryRideId || !driverId)
      return Alert.alert("Chat", "Ride/Driver ID missing");
    navigation.navigate("Chat", {
      rideId: deliveryRideId,
      driverUserId: driverId,
      driverName,
      me: { role: "merchant", id: businessId },
    });
  }, [deliveryRideId, driverId, driverName, businessId, navigation]);

  const driverPhoneText = driverInfo?.phone || "";
  const chatDisabled = !driverId || !deliveryRideId;
  const deliveredByText = `Delivered by ${driverName}${driverId ? ` (${driverId})` : ""}`;
  const title = `${batchOrders.length} order${batchOrders.length !== 1 ? "s" : ""}${selectedMethod ? ` · ${selectedMethod}` : ""}${batchId ? ` · Batch #${batchId}` : ""}`;

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
              <Text style={styles.modalTitle}>Orders at this location</Text>
              <Pressable onPress={closeGroupModal}>
                <Ionicons name="close" size={18} color="#0f172a" />
              </Pressable>
            </View>
            <Text style={styles.modalEmpty}>Tap an order to view details</Text>
            <TouchableOpacity onPress={closeGroupModal}>
              <Text
                style={{ color: "#16a34a", textAlign: "center", marginTop: 16 }}
              >
                Close
              </Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
      <Modal
        visible={overlayOpen}
        animationType="slide"
        onRequestClose={() => setOverlayOpen(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
          <View style={styles.fullMapHeader}>
            <Text style={styles.headerTitle}>Full Map</Text>

            <TouchableOpacity onPress={() => setOverlayOpen(false)}>
              <Ionicons name="close" size={24} color="#0f172a" />
            </TouchableOpacity>
          </View>

          <OSMView
            ref={overlayMapRef}
            style={{ flex: 1 }}
            initialCenter={initialMapCenter}
            initialZoom={initialZoom}
            markers={markers}
            polylines={polylines}
            styleUrl="https://tiles.openfreemap.org/styles/liberty"
          />
        </SafeAreaView>
      </Modal>
      {/* HEADER */}
      <View style={[styles.headerBar, { paddingTop: headerTopPad }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={22} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Track orders</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* SUMMARY */}
      <View style={styles.summaryBox}>
        <Text style={styles.summaryMain}>{title}</Text>
        {!!label && <Text style={styles.summarySub}>Deliver To: {label}</Text>}
        {!!rideMessage && <Text style={styles.summarySub}>{rideMessage}</Text>}
        <Text style={styles.summarySub}>
          Batch: {batchId || "—"} · Ride: {effectiveRideIds.join(", ") || "—"}
        </Text>
      </View>

      {/* MAP CARD */}
      <View style={styles.mapCard}>
        <View style={styles.mapWrap}>
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
              console.log("Map ready");
              setShowLoader(false);
              if (!didFitOnceRef.current) {
                didFitOnceRef.current = true;
                setTimeout(() => fitAll(), 100); // CHANGED: Reduced from 500ms to 100ms
              }
            }}
            onError={() => setMapError(true)}
            onPress={openOverlay}
          />
          {showLoader && (
            <View style={styles.mapLoadingOverlay}>
              <ActivityIndicator size="large" color="#16a34a" />
              <Text style={styles.mapLoadingText}>Loading map...</Text>
            </View>
          )}
          <View style={styles.mapActions}>
            <TouchableOpacity style={styles.fitBtn} onPress={fitAll}>
              <Ionicons name="scan-outline" size={16} color="#fff" />
              <Text style={styles.fitBtnText}>Fit All</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.fullBtn} onPress={openOverlay}>
              <Ionicons name="expand-outline" size={16} color="#fff" />
              <Text style={styles.fitBtnText}>Full Map</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* DRIVER CARD */}
      <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
        <View style={styles.driverCard}>
          <View style={styles.driverHeaderRow}>
            <Ionicons name="car-outline" size={18} color="#111827" />
            <Text style={styles.driverTitle}>Driver</Text>
            <TouchableOpacity onPress={onRefresh}>
              <Ionicons name="refresh" size={18} color="#111827" />
            </TouchableOpacity>
          </View>
          <Text style={styles.driverText}>{deliveredByText}</Text>
          <View style={{ flexDirection: "row", marginTop: 10 }}>
            <TouchableOpacity
              style={[
                styles.callBtn,
                !driverPhoneText && styles.callBtnDisabled,
              ]}
              onPress={onCallDriver}
              disabled={!driverPhoneText}
            >
              <Ionicons name="call-outline" size={16} color="#fff" />
              <Text style={styles.callBtnText}>Call driver</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.chatBtn, chatDisabled && styles.chatBtnDisabled]}
              onPress={onChatDriver}
              disabled={chatDisabled}
            >
              <Ionicons name="chatbubbles-outline" size={16} color="#fff" />
              <Text style={styles.chatBtnText}>Chat driver</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ORDER LIST */}
      <View style={styles.listHeader}>
        <Text style={styles.listHeaderText}>Orders in this batch</Text>
      </View>

      <FlatList
        data={batchOrders}
        keyExtractor={(it, idx) => String(getOrderId(it) || it?.id || idx)}
        renderItem={renderRow}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={{ paddingTop: 20 }}>
            <Text style={{ color: "#6b7280", textAlign: "center" }}>
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
    height: 260,
    position: "relative",
  },
  map: { flex: 1 },
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
  mapErrorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  mapErrorText: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
  mapRetryBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: "#16a34a",
    borderRadius: 8,
  },
  mapRetryText: { color: "#fff", fontWeight: "600" },
  mapActions: { position: "absolute", right: 10, bottom: 14, zIndex: 5 },
  fitBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#16a34a",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  fitBtnText: { marginLeft: 6, color: "#fff", fontSize: 11, fontWeight: "900" },
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
    gap: 6,
    justifyContent: "space-between",
  },
  driverTitle: { fontSize: 13, fontWeight: "800", color: "#111827", flex: 1 },
  driverText: { marginTop: 6, fontSize: 12, color: "#374151" },
  callBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#16a34a",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    marginRight: 10,
  },
  callBtnDisabled: { backgroundColor: "#9ca3af" },
  callBtnText: {
    marginLeft: 6,
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },
  chatBtn: {
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
  listHeader: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  listHeaderText: { fontSize: 13, fontWeight: "700", color: "#0f172a" },
  // Add these to the styles object
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#d1d5db",
  },
  statusPillText: { fontSize: 10, fontWeight: "700", color: "#374151" },
  statusReadyText: { color: "#16a34a" },
  // Order card styles
  orderCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 14,
    marginBottom: 12,
  },
  orderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  orderId: { fontSize: 14, fontWeight: "800", color: "#0f172a" },
  orderName: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: "#fef3c7",
    borderWidth: 1,
    borderColor: "#fcd34d",
  },
  statusReadyPill: {
    backgroundColor: "#dcfce7",
    borderColor: "#86efac",
  },
  statusPillText: { fontSize: 10, fontWeight: "700", color: "#d97706" },
  statusReadyText: { color: "#16a34a" },

  itemsContainer: { marginTop: 8, marginBottom: 12 },
  itemsTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: "#6b7280",
    marginBottom: 6,
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  itemName: { flex: 1, fontSize: 12, color: "#374151", paddingRight: 8 },
  itemQty: { fontSize: 12, fontWeight: "600", color: "#111827" },

  readyButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#16a34a",
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 8,
    gap: 8,
  },
  readyButtonText: { color: "#fff", fontSize: 13, fontWeight: "600" },

  readyBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#dcfce7",
    paddingVertical: 8,
    borderRadius: 10,
    marginTop: 8,
    gap: 6,
  },
  readyBadgeText: { color: "#16a34a", fontSize: 12, fontWeight: "600" },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  modalCard: { backgroundColor: "#fff", borderRadius: 16, padding: 16 },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  modalTitle: { fontSize: 16, fontWeight: "700", color: "#0f172a" },
  modalEmpty: {
    fontSize: 12,
    color: "#6b7280",
    textAlign: "center",
    paddingVertical: 20,
  },
  fullBtn: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2563eb",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
  },

  fullMapHeader: {
    height: 56,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
});
