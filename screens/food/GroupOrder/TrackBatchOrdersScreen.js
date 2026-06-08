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
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { OSMView, CustomOverlay } from "expo-osm-sdk";
import * as SecureStore from "expo-secure-store";
import { BRAND, FONT, RADIUS, SHADOW } from "../../styles/tabdey_brand";
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
const PIN_SIZE = Math.max(30, Math.min(38, SCREEN_W * 0.09));

const makePinSvg = (color, label = "") =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="38" height="38" viewBox="0 0 38 38">
      <circle cx="19" cy="19" r="12" fill="${color}" stroke="white" stroke-width="4"/>
      ${
        label
          ? `<text x="19" y="24" text-anchor="middle" font-size="13" font-weight="700" fill="white">${label}</text>`
          : `<circle cx="19" cy="19" r="5" fill="${color}"/>`
      }
    </svg>
  `)}`;

const MapTimelineDot = ({ coordinate, color, label = "" }) => {
  const hasLabel = !!label;

  return (
    <CustomOverlay coordinate={coordinate}>
      <View
        style={{
          width: hasLabel ? 18 : 10,
          height: hasLabel ? 18 : 10,
          borderRadius: hasLabel ? 9 : 5,
          backgroundColor: color,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {hasLabel ? (
          <Text
            style={{
              color: "#fff",
              fontSize: 10,
              fontWeight: "900",
              lineHeight: 12,
            }}
          >
            {label}
          </Text>
        ) : null}
      </View>
    </CustomOverlay>
  );
};

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
    // common formats
    { lat: obj.lat, lng: obj.lng },
    { lat: obj.latitude, lng: obj.longitude },

    // driver formats
    { lat: obj.current_lat, lng: obj.current_lng },
    { lat: obj.driver_lat, lng: obj.driver_lng },
    { lat: obj.driver_latitude, lng: obj.driver_longitude },

    // business formats
    { lat: obj.business_lat, lng: obj.business_lng },
    { lat: obj.business_latitude, lng: obj.business_longitude },
    { lat: obj.location_lat, lng: obj.location_lng },
    { lat: obj.location_latitude, lng: obj.location_longitude },
    { lat: obj.address_lat, lng: obj.address_lng },
    { lat: obj.address_latitude, lng: obj.address_longitude },

    // pickup/drop formats
    { lat: obj.pickup_lat, lng: obj.pickup_lng },
    { lat: obj.pickup_latitude, lng: obj.pickup_longitude },
    { lat: obj.drop_lat, lng: obj.drop_lng },
    { lat: obj.drop_latitude, lng: obj.drop_longitude },
    { lat: obj.delivery_lat, lng: obj.delivery_lng },
    { lat: obj.delivery_latitude, lng: obj.delivery_longitude },

    // nested formats
    { lat: obj?.coords?.lat, lng: obj?.coords?.lng },
    { lat: obj?.coords?.latitude, lng: obj?.coords?.longitude },
    { lat: obj?.location?.lat, lng: obj?.location?.lng },
    { lat: obj?.location?.latitude, lng: obj?.location?.longitude },
    { lat: obj?.address?.lat, lng: obj?.address?.lng },
    { lat: obj?.address?.latitude, lng: obj?.address?.longitude },
  ];

  for (const c of cand) {
    const la = Number(c.lat);
    const lo = Number(c.lng);

    if (Number.isFinite(la) && Number.isFinite(lo)) {
      return { lat: la, lng: lo };
    }
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
  const id = safeStr(businessId);
  if (!id) return null;

  const tmpl = String(ENV_BUSINESS_DETAILS || "").trim();
  if (!tmpl) return null;

  if (tmpl.includes("{businessId}")) {
    return tmpl.replace("{businessId}", encodeURIComponent(id));
  }

  if (tmpl.includes("{business_id}")) {
    return tmpl.replace("{business_id}", encodeURIComponent(id));
  }

  return `${tmpl.replace(/\/+$/, "")}/${encodeURIComponent(id)}`;
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
const fetchOSRMRoute = async (points = []) => {
  const valid = points.filter(
    (p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)),
  );

  if (valid.length < 2) return [];

  const coords = valid.map((p) => `${p.lng},${p.lat}`).join(";");

  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;

  try {
    const res = await fetch(url);
    const json = await res.json();

    const routeCoords = json?.routes?.[0]?.geometry?.coordinates;
    if (!Array.isArray(routeCoords)) return [];

    return routeCoords.map(([lng, lat]) => ({
      latitude: lat,
      longitude: lng,

      // added for OSM polyline compatibility
      lat,
      lng,
    }));
  } catch (e) {
    console.log("[ROUTE] OSRM failed:", e?.message);
    return [];
  }
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

    // important: if batch_order_ids is empty, still use the orders passed from previous screen
    return passed;
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
      let picked = [];

      if (batchOrderIds.length) {
        picked = all.filter((o) => {
          const id = getOrderId(o);
          return id && batchOrderIds.includes(id);
        });
      } else {
        // fallback: if no batch_order_ids came from API, keep currently passed orders
        picked = Array.isArray(passedOrdersRaw) ? passedOrdersRaw : [];
      }

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
    passedOrdersRaw,
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
  const fetchBusinessLocation = useCallback(async () => {
    if (businessCoords) return;

    const url = buildBusinessDetailsUrl(businessId);

    console.log("[BUSINESS] businessId:", businessId);
    console.log("[BUSINESS] url:", url);

    if (!url) {
      setLoadingLocation(false);
      return;
    }

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

      console.log("[BUSINESS] status:", res.status);
      console.log("[BUSINESS] raw response:", text);

      if (!res.ok) {
        setLoadingLocation(false);
        return;
      }

      const base = json?.data || json || {};

      const coords =
        extractLatLng(base) ||
        extractLatLng(base?.business) ||
        extractLatLng(base?.data) ||
        extractLatLng(base?.location) ||
        extractLatLng(base?.business_location) ||
        extractLatLng(base?.address);

      console.log("[BUSINESS] extracted coords:", coords);

      if (coords) {
        setBusinessCoords(coords);
      }

      setLoadingLocation(false);
    } catch (error) {
      console.error("[BUSINESS] error:", error);
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
  useEffect(() => {
    if (businessCoords) return;

    const passed = Array.isArray(passedOrdersRaw) ? passedOrdersRaw : [];
    const first = passed[0]?.raw || passed[0] || {};

    const fallbackCoords =
      extractLatLng(first?.business) ||
      extractLatLng(first?.merchant_business) ||
      extractLatLng(first?.pickup) ||
      extractLatLng(first?.pickup_location) ||
      extractLatLng(first?.restaurant) ||
      extractLatLng(first);

    console.log("[BUSINESS] fallback coords from order:", fallbackCoords);

    if (fallbackCoords) {
      setBusinessCoords(fallbackCoords);
    }
  }, [businessCoords, passedOrdersRaw]);
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
        description: "Your pickup point",
        icon: { uri: makePinSvg(COLORS.BUSINESS), size: PIN_SIZE },
      });
    }

    Object.keys(driversByRideId).forEach((rid) => {
      const c = driversByRideId[rid]?.coords;
      if (c) {
        list.push({
          id: `driver-${rid}`,
          coordinate: {
            latitude: c.lat,
            longitude: c.lng,
          },
          title: "Driver",
          description: `ID: ${driverId || "N/A"}`,
          icon: { uri: makePinSvg(COLORS.DRIVER), size: PIN_SIZE },
        });
      }
    });

    groupedDropPoints.slice(0, 15).forEach((g) => {
      list.push({
        id: `cust-${g.key}`,
        coordinate: {
          latitude: g.lat,
          longitude: g.lng,
        },
        title: `${g.count} Orders`,
        description: `${g.count} customer(s)`,
        icon: {
          uri: makePinSvg(COLORS.CUSTOMER, g.count > 1 ? String(g.count) : ""),
          size: PIN_SIZE,
        },
      });
    });

    return list;
  }, [businessCoords, driversByRideId, groupedDropPoints, driverId]);

  const mapDotMarkers = useMemo(() => {
    const list = [];

    if (businessCoords) {
      list.push({
        id: "business",
        coordinate: {
          latitude: businessCoords.lat,
          longitude: businessCoords.lng,
        },
        color: COLORS.BUSINESS,
        label: "",
      });
    }

    Object.keys(driversByRideId).forEach((rid) => {
      const c = driversByRideId[rid]?.coords;
      if (!c) return;

      list.push({
        id: `driver-${rid}`,
        coordinate: {
          latitude: c.lat,
          longitude: c.lng,
        },
        color: COLORS.DRIVER,
        label: "",
      });
    });

    groupedDropPoints.slice(0, 15).forEach((g) => {
      list.push({
        id: `cust-${g.key}`,
        coordinate: {
          latitude: g.lat,
          longitude: g.lng,
        },
        color: COLORS.CUSTOMER,
        label: g.count > 1 ? String(g.count) : "",
      });
    });

    return list;
  }, [businessCoords, driversByRideId, groupedDropPoints]);

  const computeMultiRoutes = useCallback(async () => {
    const firstDriverKey = Object.keys(driversByRideId || {})[0];
    const driver = firstDriverKey
      ? driversByRideId[firstDriverKey]?.coords
      : null;

    const biz = businessCoords;
    if (!biz) return;

    const drops = groupedDropPoints.slice(0, 15).map((g) => ({
      lat: g.lat,
      lng: g.lng,
    }));

    console.log("[ROUTE] business:", biz);
    console.log("[ROUTE] driver:", driver);
    console.log("[ROUTE] drops:", drops);

    const key = JSON.stringify({ driver, biz, drops });
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
      if (driver) {
        const driverRoute = await fetchOSRMRoute([driver, biz]);

        setRouteDriverToBiz(
          driverRoute.length
            ? driverRoute
            : [
                {
                  latitude: driver.lat,
                  longitude: driver.lng,
                  lat: driver.lat,
                  lng: driver.lng,
                },
                {
                  latitude: biz.lat,
                  longitude: biz.lng,
                  lat: biz.lat,
                  lng: biz.lng,
                },
              ],
        );
      }

      if (drops.length > 0) {
        const customerRoute = await fetchOSRMRoute([biz, ...drops]);

        setRouteBizToCustomers(
          customerRoute.length
            ? customerRoute
            : [
                {
                  latitude: biz.lat,
                  longitude: biz.lng,
                  lat: biz.lat,
                  lng: biz.lng,
                },
                ...drops.map((p) => ({
                  latitude: p.lat,
                  longitude: p.lng,
                  lat: p.lat,
                  lng: p.lng,
                })),
              ],
        );
      }
    } finally {
      setRouteLoading(false);
    }
  }, [driversByRideId, businessCoords, groupedDropPoints]);

  useEffect(() => {
    if (!businessCoords || routeLoading) return;

    const timer = setTimeout(() => {
      computeMultiRoutes();
    }, 500);

    return () => clearTimeout(timer);
  }, [
    businessCoords,
    driversByRideId,
    groupedDropPoints,
    computeMultiRoutes,
    routeLoading,
  ]);

  const polylines = useMemo(() => {
    const lines = [];

    if (routeDriverToBiz?.length > 1) {
      lines.push({
        id: "driver-biz",

        // keep both because different OSMView builds may use different keys
        coordinates: routeDriverToBiz,
        points: routeDriverToBiz,

        strokeColor: COLORS.DRIVER,
        color: COLORS.DRIVER,
        strokeWidth: 5,
        width: 5,
      });
    }

    if (routeBizToCustomers?.length > 1) {
      lines.push({
        id: "biz-customers",

        // keep both because different OSMView builds may use different keys
        coordinates: routeBizToCustomers,
        points: routeBizToCustomers,

        strokeColor: COLORS.CUSTOMER,
        color: COLORS.CUSTOMER,
        strokeWidth: 5,
        width: 5,
      });
    }

    console.log("[MAP] polylines:", JSON.stringify(lines, null, 2));

    return lines;
  }, [routeDriverToBiz, routeBizToCustomers]);

  const toMapRoutePoints = (points = []) =>
    points
      .map((p) => ({
        latitude: Number(p.latitude ?? p.lat),
        longitude: Number(p.longitude ?? p.lng),
      }))
      .filter(
        (p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude),
      );

  const drawRoutesOnMap = useCallback(
    (targetRef) => {
      if (!targetRef?.current) return;

      setTimeout(() => {
        const driverBizPoints = toMapRoutePoints(routeDriverToBiz);
        const bizCustomerPoints = toMapRoutePoints(routeBizToCustomers);

        console.log("[ROUTE] draw driver->business:", driverBizPoints.length);
        console.log(
          "[ROUTE] draw business->customers:",
          bizCustomerPoints.length,
        );

        if (driverBizPoints.length > 1) {
          targetRef.current?.displayRoute?.(driverBizPoints, {
            color: COLORS.DRIVER,
            width: 6,
          });
        }

        if (bizCustomerPoints.length > 1) {
          targetRef.current?.displayRoute?.(bizCustomerPoints, {
            color: COLORS.CUSTOMER,
            width: 6,
          });
        }
      }, 600);
    },
    [routeDriverToBiz, routeBizToCustomers],
  );
  useEffect(() => {
    drawRoutesOnMap(mapRef);
  }, [drawRoutesOnMap]);
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

  const ListHeaderComponent = () => (
    <>
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
          <OSMViewErrorBoundary>
            <OSMView
              key={mapKey}
              ref={mapRef}
              style={styles.map}
              initialCenter={initialMapCenter}
              initialZoom={initialZoom}
              polylines={polylines}
              styleUrl="https://tiles.openfreemap.org/styles/liberty"
              onMapReady={() => {
                console.log("Map ready");
                setShowLoader(false);

                setTimeout(() => {
                  drawRoutesOnMap(mapRef);
                  fitAll();
                }, 800);
              }}
              onError={() => setMapError(true)}
              onPress={openOverlay}
            >
              {mapDotMarkers.map((m) => (
                <MapTimelineDot
                  key={m.id}
                  coordinate={m.coordinate}
                  color={m.color}
                  label={m.label}
                />
              ))}
            </OSMView>
          </OSMViewErrorBoundary>

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

      {/* ORDER LIST TITLE */}
      <View style={styles.listHeader}>
        <Text style={styles.listHeaderText}>Orders in this batch</Text>
      </View>
    </>
  );

  return (
    <SafeAreaView
      style={styles.safe}
      edges={["top", "left", "right", "bottom"]}
    >
      <View style={styles.topGlow} />
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
          <OSMViewErrorBoundary>
            <OSMView
              ref={overlayMapRef}
              style={{ flex: 1 }}
              initialCenter={initialMapCenter}
              initialZoom={initialZoom}
              polylines={polylines}
              styleUrl="https://tiles.openfreemap.org/styles/liberty"
              onMapReady={() => {
                setTimeout(() => {
                  drawRoutesOnMap(overlayMapRef);
                }, 800);
              }}
            >
              {mapDotMarkers.map((m) => (
                <MapTimelineDot
                  key={m.id}
                  coordinate={m.coordinate}
                  color={m.color}
                  label={m.label}
                />
              ))}
            </OSMView>
          </OSMViewErrorBoundary>
        </SafeAreaView>
      </Modal>
      {/* HEADER */}
      <View style={[styles.headerBar]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={22} color={BRAND.black} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Track orders</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={batchOrders}
        keyExtractor={(it, idx) => String(getOrderId(it) || it?.id || idx)}
        renderItem={renderRow}
        ListHeaderComponent={ListHeaderComponent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={{
          paddingBottom: 120,
        }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={{ paddingHorizontal: 18, paddingTop: 20 }}>
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
  safe: { flex: 1, backgroundColor: "#FBF7FF" },
  topGlow: {
    position: "absolute",
    top: -120,
    right: -80,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: BRAND.purpleLight,
    opacity: 0.38,
  },
  headerBar: {
    minHeight: 54,
    paddingHorizontal: 18,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: RADIUS.full,
    backgroundColor: BRAND.white,
    borderWidth: 1,
    borderColor: "#F3E8FF",
    alignItems: "center",
    justifyContent: "center",
    ...SHADOW.sm,
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: FONT.header,
    fontSize: 20,
    fontWeight: "900",
    color: BRAND.black,
  },
  summaryBox: {
    marginHorizontal: 18,
    marginBottom: 12,
    padding: 18,
    backgroundColor: BRAND.white,
    // borderRadius: 24,
    borderWidth: 1,
    borderColor: "#F3E8FF",
    ...SHADOW.sm,
  },
  summaryMain: {
    fontSize: 18,
    fontWeight: "900",
    color: BRAND.black,
  },
  summarySub: {
    marginTop: 5,
    fontSize: 13,
    color: BRAND.gray600,
  },
  mapCard: { paddingHorizontal: 16, paddingTop: 12 },
  mapWrap: {
    borderRadius: 24,
    backgroundColor: BRAND.white,
    borderWidth: 1,
    borderColor: "#F3E8FF",
    ...SHADOW.sm,
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
    backgroundColor: BRAND.purple,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: RADIUS.pill,
    ...SHADOW.sm,
  },
  fitBtnText: { marginLeft: 6, color: "#fff", fontSize: 11, fontWeight: "900" },
  driverCard: {
    borderRadius: 24,
    backgroundColor: BRAND.white,
    borderWidth: 1,
    borderColor: "#F3E8FF",
    padding: 18,
    ...SHADOW.sm,
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
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BRAND.purple,
    paddingVertical: 13,
    borderRadius: RADIUS.pill,
    ...SHADOW.sm,
  },
  callBtnDisabled: { backgroundColor: "#9ca3af" },
  callBtnText: {
    marginLeft: 6,
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },
  chatBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BRAND.magenta,
    paddingVertical: 13,
    borderRadius: RADIUS.pill,
    marginLeft: 10,
    ...SHADOW.sm,
  },
  chatBtnDisabled: { backgroundColor: "#9ca3af" },
  chatBtnText: {
    marginLeft: 6,
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },
  listHeader: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  listHeaderText: {
    fontSize: 15,
    fontWeight: "900",
    color: BRAND.black,
  },
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
  orderCard: {
    backgroundColor: BRAND.white,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#F3E8FF",
    padding: 18,
    marginHorizontal: 18,
    marginBottom: 14,
    ...SHADOW.sm,
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
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
    backgroundColor: "#F4E9FF",
  },
  statusReadyPill: {
    backgroundColor: "#dcfce7",
    borderColor: "#86efac",
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: "900",
    color: BRAND.purple,
  },
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
    backgroundColor: BRAND.purple,
    paddingVertical: 14,
    borderRadius: RADIUS.pill,
    marginTop: 12,
    ...SHADOW.sm,
  },
  readyButtonText: { color: "#fff", fontSize: 13, fontWeight: "600" },

  readyBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F4E9FF",
    paddingVertical: 10,
    borderRadius: 16,
    marginTop: 10,
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
    backgroundColor: BRAND.magenta,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: RADIUS.pill,
    ...SHADOW.sm,
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
