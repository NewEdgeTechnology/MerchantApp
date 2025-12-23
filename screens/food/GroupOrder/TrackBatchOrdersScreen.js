// services/food/GroupOrder/TrackBatchOrdersScreen.js
// ✅ SAME MAP AS ProfileBusinessDetails (OSM tiles via UrlTile)
// ✅ Preview map clickable but NON-interactive
// ✅ Overlay opens IMMEDIATELY + overlay map FULLY INTERACTIVE (zoom/pan)
// ✅ Fix blank base-map: DO NOT use mapType="none"; use standard + UrlTile shouldReplaceMapContent
// ✅ Fix flicker: fit preview once, fit overlay once on open, throttle driver updates + throttle routing

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
  Modal,
  Pressable,
  ActivityIndicator,
  Platform,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import MapView, { Marker, Polyline, UrlTile, PROVIDER_DEFAULT } from "react-native-maps";
import io from "socket.io-client";
import {
  ORDER_ENDPOINT as ENV_ORDER_ENDPOINT,
  BUSINESS_DETAILS as ENV_BUSINESS_DETAILS,
  RIDE_SOCKET_ENDPOINT as ENV_RIDE_SOCKET,
  OSRM_ROUTING as ENV_OSRM_ROUTING,
} from "@env";

/* ---------------- routing ---------------- */

const OSRM_BASE = String(ENV_OSRM_ROUTING || "https://router.project-osrm.org").replace(/\/+$/, "");

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

const extractOrderDropCoords = (o = {}) => {
  return (
    extractLatLng(o?.deliver_to) ||
    extractLatLng(o?.delivery_address) ||
    extractLatLng(o?.drop) ||
    extractLatLng(o?.coords) ||
    extractLatLng(o)
  );
};

const coordsKey = (arr) =>
  (arr || [])
    .filter(Boolean)
    .map((p) => `${Number(p?.lat).toFixed(6)},${Number(p?.lng).toFixed(6)}`)
    .join("|");

const fetchOSRMRouteGeoJSON = async (points = []) => {
  const valid = (points || [])
    .map((p) => ({ lat: Number(p?.lat), lng: Number(p?.lng) }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (valid.length < 2) return null;

  const coordStr = valid.map((p) => `${p.lng},${p.lat}`).join(";");
  const url = `${OSRM_BASE}/route/v1/driving/${coordStr}?overview=full&geometries=geojson&steps=false`;

  const res = await fetch(url);
  if (!res.ok) return null;

  const json = await res.json();
  const coords = json?.routes?.[0]?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;

  return coords
    .map((c) => ({ latitude: Number(c?.[1]), longitude: Number(c?.[0]) }))
    .filter((c) => Number.isFinite(c.latitude) && Number.isFinite(c.longitude));
};

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
    Alert.alert("No location", "Valid coordinates are not available.");
    return;
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

export default function TrackBatchOrdersScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const route = useRoute();

  const {
    businessId,
    label,
    orders = [],
    selectedMethod,
    batch_id,
    driverDetails,
    driverRating,
    rideMessage,
    socketEndpoint,
  } = route.params || {};

  const [refreshing, setRefreshing] = useState(false);
  const [statusMap, setStatusMap] = useState({});
  const [itemsMap, setItemsMap] = useState({});
  const [loaded, setLoaded] = useState(false);

  const [businessCoords, setBusinessCoords] = useState(null);
  const [driverCoords, setDriverCoords] = useState(null);
  const [lastDriverPing, setLastDriverPing] = useState(null);

  const [drops, setDrops] = useState([]);
  const [overlayOpen, setOverlayOpen] = useState(false);

  // overlay reliability
  const overlaySeedRef = useRef(null);
  const [overlaySeedRegion, setOverlaySeedRegion] = useState(null);
  const [overlayMapKey, setOverlayMapKey] = useState(0);
  const [overlayMapReady, setOverlayMapReady] = useState(false);
  const overlayDidFitOnceRef = useRef(false);

  // routes
  const [routeDriverToBusiness, setRouteDriverToBusiness] = useState(null);
  const [routeBusinessToDrops, setRouteBusinessToDrops] = useState(null);
  const [routingBusy, setRoutingBusy] = useState(false);

  const mapPreviewRef = useRef(null);
  const overlayMapRef = useRef(null);
  const socketRef = useRef(null);

  const headerTopPad = Math.max(insets.top, 8) + 18;

  // flicker fix
  const didFitPreviewRef = useRef(false);

  // throttles
  const lastDriverUpdateMsRef = useRef(0);
  const lastDriverForRouteRef = useRef(null);
  const lastRouteFetchMsRef = useRef(0);

  useEffect(() => {
    const seed = extractLatLng(driverDetails);
    if (seed) setDriverCoords(seed);
  }, [driverDetails]);

  useEffect(() => {
    const pts = [];
    for (const it of orders || []) {
      const base = it?.raw || it || {};
      const p = extractOrderDropCoords(base);
      if (p) pts.push({ ...p, key: getOrderId(base) || `${p.lat},${p.lng}` });
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
    }, [fetchGroupedStatusesItemsAndDrops, fetchBusinessLocation])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchGroupedStatusesItemsAndDrops(), fetchBusinessLocation()]);
    } finally {
      setRefreshing(false);
    }
  }, [fetchGroupedStatusesItemsAndDrops, fetchBusinessLocation]);

  useEffect(() => {
    const endpoint = String(socketEndpoint || ENV_RIDE_SOCKET || "").trim();
    if (!endpoint) return;

    const socket = io(endpoint, {
      transports: ["websocket"],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 50,
      reconnectionDelay: 600,
    });

    socketRef.current = socket;

    try {
      if (batch_id != null) socket.emit("joinBatchRoom", { batch_id });
      if (businessId != null) socket.emit("joinBusinessRoom", { business_id: businessId });
    } catch {}

    const onDriverLocation = (payload) => {
      const now = Date.now();
      if (now - lastDriverUpdateMsRef.current < 800) return;
      lastDriverUpdateMsRef.current = now;

      const coords = extractLatLng(payload);
      if (!coords) return;

      if (driverCoords && haversineMeters(driverCoords, coords) < 5) return;

      setDriverCoords(coords);
      setLastDriverPing(new Date().toISOString());
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
  }, [socketEndpoint, batch_id, businessId, driverCoords]);

  const title = useMemo(() => {
    const c = orders.length;
    const base = c === 1 ? "1 order" : `${c} orders`;
    const method = selectedMethod ? ` · ${selectedMethod}` : "";
    const bid = batch_id != null ? ` · Batch #${batch_id}` : "";
    return `${base}${method}${bid}`;
  }, [orders.length, selectedMethod, batch_id]);

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
    const base = businessCoords || driverCoords || drops?.[0] || null;
    if (!base) return null;
    return {
      latitude: base.lat,
      longitude: base.lng,
      latitudeDelta: businessCoords ? 0.02 : 0.06,
      longitudeDelta: businessCoords ? 0.02 : 0.06,
    };
  }, [businessCoords, driverCoords, drops]);

  const fitPreviewOnce = useCallback(() => {
    if (!mapPreviewRef.current) return;
    if (didFitPreviewRef.current) return;

    const pts = [];
    if (businessCoords) pts.push({ latitude: businessCoords.lat, longitude: businessCoords.lng });
    if (driverCoords) pts.push({ latitude: driverCoords.lat, longitude: driverCoords.lng });
    for (const x of drops || []) pts.push({ latitude: x.lat, longitude: x.lng });

    didFitPreviewRef.current = true;

    if (pts.length >= 2) {
      mapPreviewRef.current.fitToCoordinates(pts, {
        edgePadding: { top: 50, right: 40, bottom: 60, left: 40 },
        animated: false,
      });
    } else if (pts.length === 1) {
      mapPreviewRef.current.animateToRegion(
        {
          latitude: pts[0].latitude,
          longitude: pts[0].longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        },
        0
      );
    }
  }, [businessCoords, driverCoords, drops]);

  useEffect(() => {
    if (!mapInitialRegion) return;
    fitPreviewOnce();
  }, [mapInitialRegion, fitPreviewOnce]);

  const keyBD = useMemo(() => coordsKey([businessCoords, ...(drops || [])]), [businessCoords, drops]);

  useEffect(() => {
    let alive = true;

    const run = async () => {
      const canBD = !!(businessCoords && drops?.length > 0);
      if (!canBD) {
        setRouteBusinessToDrops(null);
        return;
      }

      setRoutingBusy(true);
      try {
        const pts = [businessCoords, ...(drops || [])];
        const r = await fetchOSRMRouteGeoJSON(pts);
        if (alive) setRouteBusinessToDrops(r || null);
      } catch {
        if (alive) setRouteBusinessToDrops(null);
      } finally {
        if (alive) setRoutingBusy(false);
      }
    };

    run();
    return () => {
      alive = false;
    };
  }, [keyBD]);

  useEffect(() => {
    let alive = true;

    const run = async () => {
      if (!(driverCoords && businessCoords)) {
        setRouteDriverToBusiness(null);
        return;
      }

      const now = Date.now();
      if (now - lastRouteFetchMsRef.current < 6000) return;

      const last = lastDriverForRouteRef.current;
      if (last && haversineMeters(last, driverCoords) < 25) return;

      lastRouteFetchMsRef.current = now;
      lastDriverForRouteRef.current = driverCoords;

      setRoutingBusy(true);
      try {
        const r = await fetchOSRMRouteGeoJSON([driverCoords, businessCoords]);
        if (alive) setRouteDriverToBusiness(r || null);
      } catch {
        if (alive) setRouteDriverToBusiness(null);
      } finally {
        if (alive) setRoutingBusy(false);
      }
    };

    run();
    return () => {
      alive = false;
    };
  }, [driverCoords, businessCoords]);

  const openOverlayMap = useCallback(() => {
    if (!businessCoords && !driverCoords && !(drops?.length > 0)) {
      Alert.alert("No location", "No coordinates available yet.");
      return;
    }

    const t = businessCoords || driverCoords || drops?.[0];
    const seed = t
      ? {
          latitude: t.lat,
          longitude: t.lng,
          latitudeDelta: businessCoords ? 0.01 : 0.02,
          longitudeDelta: businessCoords ? 0.01 : 0.02,
        }
      : null;

    overlaySeedRef.current = seed;
    overlayDidFitOnceRef.current = false;

    setOverlaySeedRegion(seed);
    setOverlayMapReady(false);
    setOverlayMapKey((k) => k + 1); // remount for reliable initialRegion
    setOverlayOpen(true);
  }, [businessCoords, driverCoords, drops]);

  const onPressBusinessCallout = useCallback(async () => {
    if (!businessCoords) return;
    await openOSM({ lat: businessCoords.lat, lng: businessCoords.lng, label: "Business" });
  }, [businessCoords]);

  const fitOverlayOnce = useCallback(() => {
    if (!overlayMapRef.current) return;
    if (!overlayOpen) return;
    if (!overlayMapReady) return;
    if (overlayDidFitOnceRef.current) return;

    const pts = [];
    if (businessCoords) pts.push({ latitude: businessCoords.lat, longitude: businessCoords.lng });
    if (driverCoords) pts.push({ latitude: driverCoords.lat, longitude: driverCoords.lng });
    for (const x of drops || []) pts.push({ latitude: x.lat, longitude: x.lng });

    overlayDidFitOnceRef.current = true;

    const seed = overlaySeedRef.current || overlaySeedRegion;
    if (seed) {
      try {
        overlayMapRef.current.animateToRegion(seed, 250);
      } catch {}
    }

    setTimeout(() => {
      try {
        if (pts.length >= 2) {
          overlayMapRef.current.fitToCoordinates(pts, {
            edgePadding: { top: 90, right: 60, bottom: 90, left: 60 },
            animated: true,
          });
        } else if (pts.length === 1) {
          overlayMapRef.current.animateToRegion(
            {
              latitude: pts[0].latitude,
              longitude: pts[0].longitude,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            },
            450
          );
        }
      } catch {}
    }, 260);
  }, [overlayOpen, overlayMapReady, businessCoords, driverCoords, drops, overlaySeedRegion]);

  useEffect(() => {
    fitOverlayOnce();
  }, [fitOverlayOnce]);

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

  const DropMarker = ({ d, idx }) => {
    const status = d?.key ? statusMap[d.key] : null;
    const done = isDelivered(status);

    if (done) {
      return (
        <Marker
          key={d.key || `${d.lat},${d.lng},${idx}`}
          coordinate={{ latitude: d.lat, longitude: d.lng }}
          title={`Drop ${idx + 1}`}
          description="Delivered"
          tracksViewChanges={false}
          anchor={{ x: 0.5, y: 0.8 }}
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
        key={d.key || `${d.lat},${d.lng},${idx}`}
        pinColor="#f59e0b"
        coordinate={{ latitude: d.lat, longitude: d.lng }}
        title={`Drop ${idx + 1}`}
        description={label || "Delivery location"}
        tracksViewChanges={false}
      />
    );
  };

  // ✅ SAME MAP AS ProfileBusinessDetails:
  // - provider default
  // - mapType standard
  // - OSM UrlTile with shouldReplaceMapContent
  const MapContent = ({ mapRef, interactive = false, onReady, initialRegionOverride, mapKey, isOverlay = false }) => (
    <MapView
      key={mapKey}
      ref={mapRef}
      style={{ flex: 1 }}
      provider={PROVIDER_DEFAULT}
      initialRegion={initialRegionOverride || mapInitialRegion}
      mapType="standard"
      toolbarEnabled={false}
      loadingEnabled
      cacheEnabled={Platform.OS === "android" && !isOverlay}
      moveOnMarkerPress={false}
      onMapReady={onReady}
      pointerEvents="auto"
      zoomEnabled={interactive}
      scrollEnabled={interactive}
      rotateEnabled={interactive}
      pitchEnabled={interactive}
      zoomTapEnabled={interactive}
      scrollDuringRotateOrZoomEnabled={interactive}
    >
      <UrlTile
        urlTemplate="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maximumZ={19}
        tileSize={256}
        shouldReplaceMapContent={true}
        zIndex={-1}
      />

      {!!routeDriverToBusiness && (
        <Polyline coordinates={routeDriverToBusiness} strokeWidth={5} strokeColor="#2563eb" />
      )}
      {!!routeBusinessToDrops && (
        <Polyline coordinates={routeBusinessToDrops} strokeWidth={5} strokeColor="#16a34a" lineDashPattern={[10, 8]} />
      )}

      {!!businessCoords && (
        <Marker
          pinColor="#ef4444"
          coordinate={{ latitude: businessCoords.lat, longitude: businessCoords.lng }}
          title="Business"
          description={`Business ID: ${businessId ?? "—"}`}
          tracksViewChanges={false}
          onCalloutPress={onPressBusinessCallout}
        />
      )}

      {!!driverCoords && (
        <Marker
          pinColor="#2563eb"
          coordinate={{ latitude: driverCoords.lat, longitude: driverCoords.lng }}
          title="Driver (Live)"
          description={lastDriverPing ? `Updated: ${lastDriverPing}` : "Live tracking"}
          tracksViewChanges={false}
        />
      )}

      {(drops || []).map((d, idx) => (
        <DropMarker key={d.key || `${d.lat},${d.lng},${idx}`} d={d} idx={idx} />
      ))}
    </MapView>
  );

  const showMap = Boolean(mapInitialRegion);

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right", "bottom"]}>
      {/* ---------------- OVERLAY MAP MODAL ---------------- */}
      <Modal
        visible={overlayOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        hardwareAccelerated
        statusBarTranslucent={false}
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
              <View style={styles.overlayMapOnly} pointerEvents="auto" onLayout={fitOverlayOnce}>
                <MapContent
                  mapRef={overlayMapRef}
                  interactive={true}
                  initialRegionOverride={overlaySeedRef.current || overlaySeedRegion}
                  mapKey={overlayMapKey}
                  isOverlay={true}
                  onReady={() => {
                    setOverlayMapReady(true);
                    const seed = overlaySeedRef.current || overlaySeedRegion;
                    if (seed && overlayMapRef.current) {
                      setTimeout(() => {
                        try {
                          overlayMapRef.current.animateToRegion(seed, 200);
                        } catch {}
                      }, 120);
                    }
                  }}
                />
              </View>
            ) : (
              <View style={styles.noMap}>
                <Ionicons name="map-outline" size={28} color="#9ca3af" />
                <Text style={styles.noMapText}>No coordinates yet</Text>
              </View>
            )}

            <View style={styles.overlayBottom} pointerEvents="auto">
              <View style={styles.legendRow}>
                <Text style={styles.legendText}>
                  <Text style={styles.dotRed}>●</Text> Business · <Text style={styles.dotBlue}>●</Text> Driver ·{" "}
                  <Text style={styles.dotOrange}>●</Text> Drops · <Text style={styles.dotGreen}>●</Text> Delivered ✓
                </Text>

                {routingBusy && (
                  <View style={styles.routingRow}>
                    <ActivityIndicator size="small" />
                    <Text style={styles.legendText}>Routing…</Text>
                  </View>
                )}
              </View>

              <Text style={styles.attribText}>OSM tiles · Routes via OSRM</Text>
            </View>
          </View>
        </SafeAreaView>
      </Modal>

      {/* ---------------- MAIN SCREEN ---------------- */}
      <View style={[styles.headerBar, { paddingTop: headerTopPad }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#0f172a" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Track orders</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.summaryBox}>
        <Text style={styles.summaryMain}>{title}</Text>

        {!!label && (
          <Text style={styles.summarySub} numberOfLines={2}>
            Deliver To: {label}
          </Text>
        )}
        {!!rideMessage && <Text style={styles.summarySub}>{rideMessage}</Text>}

        {showMap ? (
          <Pressable style={styles.mapWrap} onPress={openOverlayMap}>
            <View style={styles.map} pointerEvents="none">
              <MapContent mapRef={mapPreviewRef} interactive={false} isOverlay={false} />
            </View>

            <View style={styles.tapPill} pointerEvents="none">
              <Ionicons name="location-outline" size={14} color="#fff" />
              <Text style={styles.tapPillText}>Tap to show live location</Text>
            </View>

            <View style={styles.mapLegend} pointerEvents="none">
              <Text style={styles.mapLegendText}>
                <Text style={styles.dotRed}>●</Text> Business · <Text style={styles.dotBlue}>●</Text> Driver ·{" "}
                <Text style={styles.dotOrange}>●</Text> Drops · <Text style={styles.dotGreen}>●</Text> Delivered ✓
              </Text>
              <Text style={styles.attribTextSmall}>OSM · OSRM</Text>
            </View>
          </Pressable>
        ) : (
          <Text style={[styles.summarySub, { marginTop: 8 }]}>Map not available yet (no coordinates).</Text>
        )}
      </View>

      {!!driverSummaryText && (
        <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
          <View style={styles.driverCard}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons name="bicycle-outline" size={18} color="#111827" />
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

  mapWrap: {
    marginTop: 10,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#fff",
  },
  map: { height: 180, width: "100%" },
  mapLegend: { paddingVertical: 8, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: "#e5e7eb" },
  mapLegendText: { fontSize: 11, color: "#374151", fontWeight: "900" },
  attribTextSmall: { marginTop: 4, fontSize: 10, color: "#6b7280", fontWeight: "700" },

  tapPill: {
    position: "absolute",
    right: 10,
    bottom: 64,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#16a34a",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  tapPillText: { marginLeft: 6, color: "#fff", fontSize: 12, fontWeight: "900" },

  dotRed: { color: "#ef4444" },
  dotGreen: { color: "#16a34a" },
  dotBlue: { color: "#2563eb" },
  dotOrange: { color: "#f59e0b" },

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
  overlayMapOnly: { flex: 1, backgroundColor: "#fff" },

  noMap: { flex: 1, alignItems: "center", justifyContent: "center" },
  noMapText: { marginTop: 8, fontSize: 12, color: "#6b7280", fontWeight: "800" },

  overlayBottom: { paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: "#e5e7eb" },
  legendRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  legendText: { fontSize: 11, color: "#374151", fontWeight: "900" },
  routingRow: { flexDirection: "row", alignItems: "center" },
  attribText: { marginTop: 6, fontSize: 10, color: "#6b7280", fontWeight: "700" },
});
