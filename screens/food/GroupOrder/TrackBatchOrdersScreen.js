// services/food/GroupOrder/TrackBatchOrdersScreen.js
// ✅ Accepts batch_id + ride_id from params (any shape)
// ✅ If redirected without params, restores batch_id + ride_id from SecureStore (SAFE keys)
// ✅ If ride_id missing but batch_id exists, fetches delivery_ride_id using DELIVERY_RIDE_ID_ENDPOINT
// ✅ Saves latest batch_id + ride_id back to SecureStore
// ✅ Joins ride room(s) and listens deliveryDriverLocation
// ✅ Map interactive + fullscreen overlay
// ✅ Dark CARTO tiles + OSRM routing (driver->business, business->customer)

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
} from "@env";

/* ---------------- helpers ---------------- */

const getOrderId = (order = {}) => {
  const base = order.raw || order;
  const cand = [base.order_id, base.id, base.orderId, base.order_no, base.orderNo, base.order_code];
  for (const v of cand) {
    if (v != null && String(v).trim().length > 0) return String(v).trim();
  }
  return null;
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

const buildOSMUrl = ({ lat, lng, zoom = 16, label = "" }) => {
  const la = Number(lat);
  const lo = Number(lng);
  const z = Number(zoom);
  const q = label ? `&query=${encodeURIComponent(label)}` : "";
  return `https://www.openstreetmap.org/?mlat=${la}&mlon=${lo}${q}#map=${Number.isFinite(z) ? z : 16}/${la}/${lo}`;
};

const openOSM = async ({ lat, lng, label }) => {
  const la = Number(lat);
  const lo = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) {
    return Alert.alert("No location", "Valid coordinates are not available.");
  }
  try {
    await Linking.openURL(buildOSMUrl({ lat: la, lng: lo, zoom: 16, label: label || "" }));
  } catch (e) {
    Alert.alert("Cannot open map", String(e?.message || e));
  }
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

const asMapCoord = (p) => ({ latitude: p.lat, longitude: p.lng });

/* ---------------- SecureStore keys (SAFE) ---------------- */
// SecureStore keys: only alphanumeric, ".", "-", "_" and NOT empty.
const sanitizeKeyPart = (v) => {
  const s = v == null ? "" : String(v).trim();
  const cleaned = s.replace(/[^a-zA-Z0-9._-]/g, "_");
  return cleaned || "global";
};
const keyBatchId = (businessId) => `cluster_last_batch_id_${sanitizeKeyPart(businessId)}`;
const keyRideId = (businessId) => `cluster_last_ride_id_${sanitizeKeyPart(businessId)}`;

/* ---------------- OSM routing (OSRM) ---------------- */

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

export default function TrackBatchOrdersScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const route = useRoute();

  const params = route.params || {};
  const {
    businessId,
    label,
    orders = [],
    selectedMethod,
    driverDetails,
    driverRating,
    rideMessage,
    socketEndpoint,
    rideIds = [],
    // optional: if previous screen passes already:
    batch_order_ids,
  } = params;

  const headerTopPad = Math.max(insets.top, 8) + 18;

  /* ---------------- IDs: params -> securestore -> fetch ---------------- */

  const [batchId, setBatchId] = useState(() => normalizeBatchIdFromParams(params));
  const [deliveryRideId, setDeliveryRideId] = useState(() => normalizeRideIdFromParams(params));
  const [restoredIds, setRestoredIds] = useState(false);

  // ✅ Restore from SecureStore (if this screen opened without params)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const bKey = keyBatchId(businessId);
        const rKey = keyRideId(businessId);

        const [savedBatch, savedRide] = await Promise.all([
          SecureStore.getItemAsync(bKey),
          SecureStore.getItemAsync(rKey),
        ]);

        if (cancelled) return;

        if (!batchId && savedBatch && String(savedBatch).trim()) setBatchId(String(savedBatch).trim());
        if (!deliveryRideId && savedRide && String(savedRide).trim()) setDeliveryRideId(String(savedRide).trim());
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

  // ✅ Save whenever we have ids
  useEffect(() => {
    (async () => {
      try {
        const bKey = keyBatchId(businessId);
        const rKey = keyRideId(businessId);

        if (batchId) await SecureStore.setItemAsync(bKey, String(batchId));
        if (deliveryRideId) await SecureStore.setItemAsync(rKey, String(deliveryRideId));
      } catch (e) {
        console.log("[SecureStore] save error:", e?.message || e);
      }
    })();
  }, [businessId, batchId, deliveryRideId]);

  // ✅ If ride id missing but batch id exists, fetch ride id (AFTER restore)
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

  /* ---------------- state: orders + map data ---------------- */

  const [refreshing, setRefreshing] = useState(false);
  const [statusMap, setStatusMap] = useState({});
  const [itemsMap, setItemsMap] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [businessCoords, setBusinessCoords] = useState(null);

  // driversByRideId: { [rideId]: { coords, lastPing, batchId } }
  const [driversByRideId, setDriversByRideId] = useState({});
  const [drops, setDrops] = useState([]);

  // route segments
  const [routeDriverToBiz, setRouteDriverToBiz] = useState([]);
  const [routeBizToCustomer, setRouteBizToCustomer] = useState([]);

  const lastRouteKeyRef = useRef("");
  const lastRouteAtMsRef = useRef(0);

  // overlay
  const [overlayOpen, setOverlayOpen] = useState(false);
  const overlayMapRef = useRef(null);
  const overlayDidFitOnceRef = useRef(false);

  const mapRef = useRef(null);
  const socketRef = useRef(null);

  const lastDriverUpdateMsRef = useRef(0);
  const didFitOnceRef = useRef(false);
  const lastMarkerPressTsRef = useRef(0);

  // seed initial driver (if provided)
  useEffect(() => {
    const seed = extractLatLng(driverDetails);
    if (!seed) return;

    setDriversByRideId((prev) => {
      const rid = String(deliveryRideId || effectiveRideIds?.[0] || "driver").trim();
      const next = { ...(prev || {}) };
      next[rid] = { coords: seed, lastPing: new Date().toISOString(), batchId: batchId || null };
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverDetails]);

  // build drops from route orders (fallback)
  useEffect(() => {
    const pts = [];
    for (const it of orders || []) {
      const base = it?.raw || it || {};
      const p = extractOrderDropCoords(base);
      if (!p) continue;
      const oid = getOrderId(base) || `${p.lat},${p.lng}`;
      pts.push({ ...p, key: oid });
    }
    if (pts.length) setDrops(pts);
  }, [orders]);

  const fetchGroupedStatusesItemsAndDrops = useCallback(async () => {
    const url = buildGroupedOrdersUrl(businessId);
    if (!url) {
      setLoaded(true);
      return;
    }

    try {
      const res = await fetch(url);
      if (!res.ok) {
        setLoaded(true);
        return;
      }
      const json = await res.json();

      const nextStatusMap = {};
      const nextItemsMap = {};
      const dropPoints = [];

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

              const drop = extractOrderDropCoords(o);
              if (drop) dropPoints.push({ ...drop, key: id });
            }
          }
        }
      }

      if (dropPoints.length) setDrops(dropPoints);

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
      const res = await fetch(url);
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

  useEffect(() => {
    fetchGroupedStatusesItemsAndDrops();
    fetchBusinessLocation();
  }, [fetchGroupedStatusesItemsAndDrops, fetchBusinessLocation]);

  useFocusEffect(
    useCallback(() => {
      fetchGroupedStatusesItemsAndDrops();
      fetchBusinessLocation();
      if (restoredIds) fetchDeliveryRideId();
    }, [fetchGroupedStatusesItemsAndDrops, fetchBusinessLocation, restoredIds, fetchDeliveryRideId])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchGroupedStatusesItemsAndDrops(), fetchBusinessLocation(), fetchDeliveryRideId()]);
    } finally {
      setRefreshing(false);
    }
  }, [fetchGroupedStatusesItemsAndDrops, fetchBusinessLocation, fetchDeliveryRideId]);

  /* ---------------- SOCKET ---------------- */

  useEffect(() => {
    const endpoint = String(socketEndpoint || ENV_RIDE_SOCKET || "").trim();
    if (!endpoint) {
      console.log("[MERCHANT][SOCKET] ❌ No socket endpoint");
      return;
    }

    // ✅ wait until we tried restoring from store (otherwise you get your log)
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
          const ok = ack === true || ack?.success === true || ack?.ok === true || ack?.joined === true;
          console.log("[MERCHANT][JOIN] status:", ok ? "✅ JOINED" : "⚠️ UNKNOWN/FAILED", rid, ack);
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

      setDriversByRideId((prev) => {
        const prevEntry = prev?.[rid];
        if (prevEntry?.coords && haversineMeters(prevEntry.coords, coords) < 5) return prev;

        const next = { ...(prev || {}) };
        next[rid] = { coords, lastPing: new Date().toISOString(), batchId: batchId || null };
        return next;
      });
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
  }, [socketEndpoint, restoredIds, effectiveRideIds.join("|"), batchId]);

  /* ---------------- UI ---------------- */

  const title = useMemo(() => {
    const c = orders.length;
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
  }, [orders.length, selectedMethod, batchId, effectiveRideIds]);

  const driverSummaryText = useMemo(() => {
    if (!driverDetails) return "";
    const name = driverDetails.user_name ?? driverDetails.name ?? driverDetails.full_name ?? "";
    const phone = driverDetails.phone ?? driverDetails.mobile ?? "";

    const avg = driverRating?.average;
    const count = driverRating?.count;
    const ratingPart =
      avg != null ? `Rating: ${Number(avg).toFixed(1)}${count != null ? ` (${count})` : ""}` : null;

    const parts = [];
    if (name) parts.push(name);
    if (phone) parts.push(safePhone(phone));
    if (ratingPart) parts.push(ratingPart);
    return parts.join(" · ");
  }, [driverDetails, driverRating]);

  const onCallDriver = useCallback(async () => {
    const phone = driverDetails?.phone ?? driverDetails?.mobile ?? "";
    const full = safePhone(phone);
    if (!full) return Alert.alert("No phone", "Driver phone number not available.");
    try {
      await Linking.openURL(`tel:${full}`);
    } catch {
      Alert.alert("Cannot call", "Your device cannot place calls.");
    }
  }, [driverDetails]);

  const mapInitialRegion = useMemo(() => {
    const anyDriver = Object.values(driversByRideId || {})[0]?.coords || null;
    const base = businessCoords || anyDriver || drops?.[0] || null;
    if (!base) return null;
    return {
      latitude: base.lat,
      longitude: base.lng,
      latitudeDelta: businessCoords ? 0.02 : 0.06,
      longitudeDelta: businessCoords ? 0.02 : 0.06,
    };
  }, [businessCoords, driversByRideId, drops]);

  const fitToPoints = useCallback(
    (ref) => {
      if (!ref?.current) return;

      const pts = [];
      if (businessCoords) pts.push(asMapCoord(businessCoords));

      for (const rid of Object.keys(driversByRideId || {})) {
        const c = driversByRideId?.[rid]?.coords;
        if (c) pts.push(asMapCoord(c));
      }

      const customer = drops?.[0] || null;
      if (customer) pts.push(asMapCoord(customer));

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
    [businessCoords, driversByRideId, drops]
  );

  const fitAll = useCallback(() => fitToPoints(mapRef), [fitToPoints]);
  const fitOverlay = useCallback(() => fitToPoints(overlayMapRef), [fitToPoints]);

  const openOverlay = useCallback(() => {
    if (!mapInitialRegion) return;
    if (Date.now() - lastMarkerPressTsRef.current < 350) return;
    overlayDidFitOnceRef.current = false;
    setOverlayOpen(true);
  }, [mapInitialRegion]);

  const onPressBusinessCallout = useCallback(async () => {
    if (!businessCoords) return;
    await openOSM({ lat: businessCoords.lat, lng: businessCoords.lng, label: "Business" });
  }, [businessCoords]);

  /* ---------------- ROUTES: driver->business and business->customer ---------------- */

  const pickCustomerDrop = useMemo(() => {
    if (!Array.isArray(drops) || drops.length === 0) return null;

    for (const d of drops) {
      const id = d?.key;
      const st = id ? statusMap?.[id] : null;
      if (!isDelivered(st)) return d;
    }
    return drops[0];
  }, [drops, statusMap]);

  const computeTwoLegRoute = useCallback(async () => {
    const firstDriverKey = Object.keys(driversByRideId || {})[0];
    const driver = firstDriverKey ? driversByRideId?.[firstDriverKey]?.coords : null;
    const biz = businessCoords;
    const customer = pickCustomerDrop ? { lat: pickCustomerDrop.lat, lng: pickCustomerDrop.lng } : null;

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
  }, [driversByRideId, businessCoords, pickCustomerDrop]);

  useEffect(() => {
    computeTwoLegRoute();
  }, [computeTwoLegRoute]);

  /* ---------------- Render helpers ---------------- */

  const DropMarker = ({ d, idx }) => {
    const isSelected =
      pickCustomerDrop &&
      Number(pickCustomerDrop.lat) === Number(d.lat) &&
      Number(pickCustomerDrop.lng) === Number(d.lng) &&
      String(pickCustomerDrop.key || "") === String(d.key || "");

    if (!isSelected) return null;

    const orderId = d?.key || null;
    const status = orderId ? statusMap[orderId] : null;
    const done = isDelivered(status);

    const titleText = orderId ? `Order #${orderId}` : "Customer";
    const descText = done ? "Delivered" : "Customer drop";

    if (done) {
      return (
        <Marker
          key={orderId || `${d.lat},${d.lng},${idx}`}
          coordinate={{ latitude: d.lat, longitude: d.lng }}
          title={titleText}
          description={descText}
          tracksViewChanges={false}
          anchor={{ x: 0.5, y: 0.8 }}
          onPress={() => (lastMarkerPressTsRef.current = Date.now())}
        >
          <View style={styles.tickMarkerOuter}>
            <View style={styles.tickMarkerInner}>
              <Ionicons name="checkmark" size={16} color="#ffffff" />
            </View>
          </View>
        </Marker>
      );
    }

    return (
      <Marker
        key={orderId || `${d.lat},${d.lng},${idx}`}
        pinColor="#f59e0b"
        coordinate={{ latitude: d.lat, longitude: d.lng }}
        title={titleText}
        description={descText}
        tracksViewChanges={false}
        onPress={() => (lastMarkerPressTsRef.current = Date.now())}
      />
    );
  };

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

    return (
      <View style={styles.orderRow}>
        <View style={styles.orderTop}>
          <Text style={styles.orderId}>#{id}</Text>
          <View style={styles.statusPill}>
            <Text style={styles.statusPillText}>{statusLabel}</Text>
          </View>
        </View>

        {!!name && (
          <Text style={styles.orderName} numberOfLines={1}>
            {name}
          </Text>
        )}

        {hasItems && (
          <Text style={styles.orderMeta} numberOfLines={1}>
            {items.length} item{items.length === 1 ? "" : "s"}
          </Text>
        )}
      </View>
    );
  };

  const showMap = Boolean(mapInitialRegion);

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right", "bottom"]}>
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
                  <UrlTile urlTemplate={tileTemplate} maximumZ={20} tileSize={256} shouldReplaceMapContent zIndex={-1} />

                  {!!routeDriverToBiz?.length && routeDriverToBiz.length >= 2 && (
                    <Polyline
                      coordinates={routeDriverToBiz}
                      strokeWidth={4}
                      strokeColor="#2563eb"
                      lineCap="round"
                      lineJoin="round"
                    />
                  )}

                  {!!routeBizToCustomer?.length && routeBizToCustomer.length >= 2 && (
                    <Polyline
                      coordinates={routeBizToCustomer}
                      strokeWidth={4}
                      strokeColor="#60a5fa"
                      lineCap="round"
                      lineJoin="round"
                    />
                  )}

                  {!!businessCoords && (
                    <Marker
                      pinColor="#ef4444"
                      coordinate={{ latitude: businessCoords.lat, longitude: businessCoords.lng }}
                      title="Business"
                      description={`Business ID: ${businessId ?? "—"}`}
                      tracksViewChanges={false}
                      onCalloutPress={onPressBusinessCallout}
                      onPress={() => (lastMarkerPressTsRef.current = Date.now())}
                    />
                  )}

                  {Object.keys(driversByRideId || {}).map((rid) => {
                    const entry = driversByRideId?.[rid];
                    if (!entry?.coords) return null;
                    return (
                      <Marker
                        key={`overlay-driver-${rid}`}
                        coordinate={{ latitude: entry.coords.lat, longitude: entry.coords.lng }}
                        title="Driver (Live)"
                        description={`Ride #${rid}${entry?.lastPing ? ` · ${entry.lastPing}` : ""}`}
                        tracksViewChanges={false}
                        onPress={() => {
                          lastMarkerPressTsRef.current = Date.now();
                        }}
                        anchor={{ x: 0.5, y: 0.5 }}
                      >
                        <View style={styles.carMarker}>
                          <Ionicons name="car" size={16} color="#ffffff" />
                        </View>
                      </Marker>
                    );
                  })}

                  {(drops || []).map((d, idx) => (
                    <DropMarker key={`overlay-${d.key || `${d.lat},${d.lng},${idx}`}`} d={d} idx={idx} />
                  ))}
                </MapView>

                <View style={styles.overlayActions}>
                  <TouchableOpacity style={styles.fitBtn} onPress={fitOverlay} activeOpacity={0.85}>
                    <Ionicons name="scan-outline" size={16} color="#ffffff" />
                    <Text style={styles.fitBtnText}>Fit</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.overlayLegend}>
                  <Text style={styles.mapLegendText}>
                    <Text style={styles.dotRed}>●</Text> Business · <Text style={styles.dotCar}>●</Text> Driver ·{" "}
                    <Text style={styles.dotBlue}>●</Text> Route · <Text style={styles.dotOrange}>●</Text> Customer ·{" "}
                    <Text style={styles.dotGreen}>●</Text> Delivered ✓
                  </Text>
                  <Text style={styles.attribTextSmall}>
                    Batch: {batchId || "—"} · Ride(s): {effectiveRideIds.length ? effectiveRideIds.join(", ") : "—"}
                  </Text>
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
      </View>

      {/* MAP SHOWN DIRECTLY + TAP OPENS OVERLAY */}
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
              <UrlTile urlTemplate={tileTemplate} maximumZ={20} tileSize={256} shouldReplaceMapContent zIndex={-1} />

              {!!routeDriverToBiz?.length && routeDriverToBiz.length >= 2 && (
                <Polyline
                  coordinates={routeDriverToBiz}
                  strokeWidth={4}
                  strokeColor="#2563eb"
                  lineCap="round"
                  lineJoin="round"
                />
              )}
              {!!routeBizToCustomer?.length && routeBizToCustomer.length >= 2 && (
                <Polyline
                  coordinates={routeBizToCustomer}
                  strokeWidth={4}
                  strokeColor="#60a5fa"
                  lineCap="round"
                  lineJoin="round"
                />
              )}

              {!!businessCoords && (
                <Marker
                  pinColor="#ef4444"
                  coordinate={{ latitude: businessCoords.lat, longitude: businessCoords.lng }}
                  title="Business"
                  description={`Business ID: ${businessId ?? "—"}`}
                  tracksViewChanges={false}
                  onCalloutPress={onPressBusinessCallout}
                  onPress={() => (lastMarkerPressTsRef.current = Date.now())}
                />
              )}

              {Object.keys(driversByRideId || {}).map((rid) => {
                const entry = driversByRideId?.[rid];
                if (!entry?.coords) return null;
                return (
                  <Marker
                    key={`driver-${rid}`}
                    coordinate={{ latitude: entry.coords.lat, longitude: entry.coords.lng }}
                    title="Driver (Live)"
                    description={`Ride #${rid}${entry?.lastPing ? ` · ${entry.lastPing}` : ""}`}
                    tracksViewChanges={false}
                    onPress={() => (lastMarkerPressTsRef.current = Date.now())}
                    anchor={{ x: 0.5, y: 0.5 }}
                  >
                    <View style={styles.carMarker}>
                      <Ionicons name="car" size={16} color="#ffffff" />
                    </View>
                  </Marker>
                );
              })}

              {(drops || []).map((d, idx) => (
                <DropMarker key={d.key || `${d.lat},${d.lng},${idx}`} d={d} idx={idx} />
              ))}
            </MapView>

            <View style={styles.mapLegend}>
              <Text style={styles.mapLegendText}>
                <Text style={styles.dotRed}>●</Text> Business · <Text style={styles.dotCar}>●</Text> Driver ·{" "}
                <Text style={styles.dotBlue}>●</Text> Route · <Text style={styles.dotOrange}>●</Text> Customer ·{" "}
                <Text style={styles.dotGreen}>●</Text> Delivered ✓
              </Text>
              <Text style={styles.attribTextSmall}>Tap map to open full screen</Text>
            </View>

            <View style={styles.mapActions}>
              <TouchableOpacity style={styles.fitBtn} onPress={fitAll} activeOpacity={0.85}>
                <Ionicons name="scan-outline" size={16} color="#ffffff" />
                <Text style={styles.fitBtnText}>Fit</Text>
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

      {!!driverSummaryText && (
        <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
          <View style={styles.driverCard}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons name="car-outline" size={18} color="#111827" />
              <Text style={styles.driverTitle}>Driver</Text>
            </View>

            <Text style={styles.driverText}>{driverSummaryText}</Text>

            <TouchableOpacity style={styles.callBtn} activeOpacity={0.85} onPress={onCallDriver}>
              <Ionicons name="call-outline" size={16} color="#ffffff" />
              <Text style={styles.callBtnText}>Call driver</Text>
            </TouchableOpacity>

            <Text style={styles.liveHint}>
              Live update event: <Text style={styles.liveHintStrong}>deliveryDriverLocation</Text>
            </Text>
          </View>
        </View>
      )}

      <View style={styles.listHeader}>
        <Text style={styles.listHeaderText}>Orders</Text>
      </View>

      <FlatList
        data={orders}
        keyExtractor={(it) => String(getOrderId(it) || it?.id || Math.random())}
        renderItem={renderRow}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
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

  mapLegend: { paddingVertical: 8, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: "#e5e7eb" },
  mapLegendText: { fontSize: 11, color: "#374151", fontWeight: "900" },
  attribTextSmall: { marginTop: 4, fontSize: 10, color: "#6b7280", fontWeight: "700" },

  mapActions: { position: "absolute", right: 10, bottom: 54 },
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
  fitBtnText: { marginLeft: 6, color: "#fff", fontSize: 12, fontWeight: "900" },

  dotRed: { color: "#ef4444" },
  dotGreen: { color: "#16a34a" },
  dotOrange: { color: "#f59e0b" },
  dotCar: { color: "#0f172a" },
  dotBlue: { color: "#2563eb" },

  carMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#ffffff",
  },

  driverCard: { borderRadius: 14, borderWidth: 1, borderColor: "#e5e7eb", padding: 12, backgroundColor: "#f9fafb" },
  driverTitle: { marginLeft: 6, fontSize: 13, fontWeight: "800", color: "#111827" },
  driverText: { marginTop: 6, fontSize: 12, color: "#374151", fontWeight: "600" },

  callBtn: {
    marginTop: 10,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#16a34a",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  callBtnText: { marginLeft: 6, color: "#fff", fontSize: 12, fontWeight: "800" },

  liveHint: { marginTop: 8, fontSize: 11, color: "#6b7280", fontWeight: "800" },
  liveHintStrong: { color: "#111827", fontWeight: "900" },

  listHeader: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  listHeaderText: { fontSize: 13, fontWeight: "700", color: "#0f172a" },

  orderRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
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
  orderMeta: { marginTop: 2, fontSize: 11, color: "#4b5563" },

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

  // overlay styles
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
  overlayLegend: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  noMapFull: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
});
