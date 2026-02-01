// screens/food/NearbyOrdersScreen.js
// ✅ FOOD version (no Mart tab fallback)
// ✅ Uses UNIQUE FOOD cluster route name: "FoodNearbyClusterOrdersScreen"
// ✅ Fetches orders directly from ORDER_ENDPOINT (no reliance on paramOrders shape)
// ✅ FIX: extracts coords from YOUR payload: order.deliver_to.lat/lng (and also legacy fields)
// ✅ FIX: extracts address from order.deliver_to.address (and also legacy fields)
// ✅ FIX: "tight" clustering (complete-linkage) + grid pre-bucketing (prevents far merge)
// ✅ FIX: unique cluster label per card (no duplicate place names on same screen)
// ✅ Default thresholdKm = 2
// ✅ NEW: ONE global "Track orders" button (ready-for-delivery pill style)
// ✅ FIX: If no IN-PROGRESS trackable orders -> Track button is unclickable (disabled + dimmed)
// ✅ FIX: Remove orders from this screen if status is DECLINED/REJECTED/DENIED OR fulfillment_type is PICKUP

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  BackHandler,
  RefreshControl,
} from "react-native";
import { useNavigation, useRoute, useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { ORDER_ENDPOINT as ENV_ORDER_ENDPOINT, BUSINESS_DETAILS } from "@env";

/* ---------------- status normalizer ---------------- */
const normalizeStatusForCluster = (v) => {
  const s = String(v || "").trim().toUpperCase();
  if (!s) return "PENDING";
  if (s === "ON ROAD" || s === "ON_ROAD" || s === "ONROAD") return "OUT_FOR_DELIVERY";
  if (s === "OUT FOR DELIVERY") return "OUT_FOR_DELIVERY";
  if (s === "DELIVERED") return "COMPLETED"; // legacy mapping
  return s;
};

/** ✅ Cluster should show ALL statuses EXCEPT pending + delivered/completed */
const shouldIncludeInCluster = (statusRaw) => {
  const s = normalizeStatusForCluster(statusRaw);
  if (!s) return false;
  if (s === "PENDING") return false;
  if (s === "DELIVERED") return false;
  if (s === "COMPLETED") return false;
  if (s === "COMPLETE") return false;
  return true;
};

/** ✅ Track list should include only IN-PROGRESS statuses (so 0 disables button) */
const isTrackableStatus = (statusRaw) => {
  const s = normalizeStatusForCluster(statusRaw);
  return (
    s === "ASSIGNED" ||
    s === "RIDER_ASSIGNED" ||
    s === "DRIVER_ASSIGNED" ||
    s === "OUT_FOR_DELIVERY"
  );
};

/* ✅ status/fulfillment filters for this screen */
const isDeclinedStatus = (statusRaw) => {
  const s = String(statusRaw || "").trim().toUpperCase();
  return (
    s === "DECLINED" ||
    s === "REJECTED" ||
    s === "DENIED" ||
    s === "ORDER_DECLINED" ||
    s === "MERCHANT_DECLINED"
  );
};

const isPickupFulfillment = (fulfillmentTypeRaw) => {
  const t = String(fulfillmentTypeRaw || "").trim().toUpperCase();
  return (
    t === "PICKUP" ||
    t === "SELF_PICKUP" ||
    t === "SELF PICKUP" ||
    t === "TAKEAWAY" ||
    t === "TAKE AWAY"
  );
};

/** ✅ EXCLUDE from this screen if (declined OR pickup) */
const shouldExcludeFromScreen = (rawOrder) => {
  if (!rawOrder || typeof rawOrder !== "object") return false;

  const rawStatus = rawOrder.status || rawOrder.order_status || "";
  const fulfillmentType =
    rawOrder.fulfillment_type ??
    rawOrder.fulfillmentType ??
    rawOrder.fulfillment ??
    rawOrder.fulfillment_type_name ??
    "";

  return isDeclinedStatus(rawStatus) || isPickupFulfillment(fulfillmentType);
};

/* ---------------- coords helpers ---------------- */
const extractCoords = (order = {}) => {
  const base = order?.raw && typeof order.raw === "object" ? order.raw : order;

  const deliverTo =
    base?.deliver_to && typeof base.deliver_to === "object" ? base.deliver_to : null;

  const deliverTo2 =
    base?.deliverTo && typeof base.deliverTo === "object" ? base.deliverTo : null;

  const addrObj =
    base?.delivery_address && typeof base.delivery_address === "object"
      ? base.delivery_address
      : null;

  const cand = [
    deliverTo && {
      lat: deliverTo.lat ?? deliverTo.latitude,
      lng: deliverTo.lng ?? deliverTo.longitude ?? deliverTo.lon,
    },
    deliverTo2 && {
      lat: deliverTo2.lat ?? deliverTo2.latitude,
      lng: deliverTo2.lng ?? deliverTo2.longitude ?? deliverTo2.lon,
    },
    addrObj && {
      lat: addrObj.lat ?? addrObj.latitude,
      lng: addrObj.lng ?? addrObj.longitude ?? addrObj.lon,
    },
    { lat: base.delivery_lat, lng: base.delivery_lng },
    { lat: base.delivery_latitude, lng: base.delivery_longitude },
    { lat: base.deliveryLatitude, lng: base.deliveryLongitude },
    { lat: base.lat, lng: base.lng },
  ];

  for (const x of cand) {
    if (!x) continue;
    const lat = Number(x.lat);
    const lng = Number(x.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  return null;
};

const distanceKm = (a, b) => {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

/* ---------------- address / naming helpers ---------------- */
const normalizeAddressField = (v) => {
  if (!v) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "object") {
    if (typeof v.address === "string" && v.address.trim()) return v.address.trim();
    if (typeof v.label === "string" && v.label.trim()) return v.label.trim();
    if (typeof v.formatted === "string" && v.formatted.trim()) return v.formatted.trim();
  }
  return null;
};

const isNumericish = (s) => /^[0-9\s-]+$/.test(s);
const isPlusCodeish = (s) => /^[A-Z0-9+ ]+$/.test(s || "") && String(s).includes("+");

const pick2ndOr1stPlace = (addressLike) => {
  const raw = normalizeAddressField(addressLike) || "";
  const line = raw.split("\n")[0] || "";
  const parts = line
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !isNumericish(p) && !isPlusCodeish(p));

  if (!parts.length) return "Nearby orders";
  if (parts[1]) return parts[1].length > 40 ? parts[1].slice(0, 37) + "..." : parts[1];
  return parts[0].length > 40 ? parts[0].slice(0, 37) + "..." : parts[0];
};

/* ---------------- decoration helper ---------------- */
const decorateOrdersFromApiPayload = (apiJson) => {
  const list = [];
  const groups = Array.isArray(apiJson?.data) ? apiJson.data : [];

  for (const g of groups) {
    const orders = Array.isArray(g?.orders) ? g.orders : [];
    for (const o of orders) {
      // ✅ EXCLUDE: status declined OR fulfillment pickup
      if (shouldExcludeFromScreen(o)) continue;

      const rawStatus = o.status || o.order_status || "";
      const fulfillmentType =
        o.fulfillment_type ?? o.fulfillmentType ?? o.fulfillment ?? o.fulfillment_type_name ?? "";

      const addr =
        normalizeAddressField(o?.deliver_to?.address) ||
        normalizeAddressField(o?.deliverTo?.address) ||
        normalizeAddressField(o?.delivery_address) ||
        normalizeAddressField(o?.dropoff_address) ||
        normalizeAddressField(o?.shipping_address) ||
        normalizeAddressField(o?.address) ||
        "";

      const coords = extractCoords(o);
      const statusNorm = normalizeStatusForCluster(rawStatus);

      list.push({
        id: String(o.order_id ?? o.id ?? o.order_code ?? ""),
        raw: o,
        coords,
        delivery_address: addr,
        status: rawStatus,
        statusNorm,
        fulfillment_type: fulfillmentType,
      });
    }
  }

  return list;
};

/* ---------------- ENV URL helpers ---------------- */
const buildBusinessDetailsUrl = (bizId) => {
  const rawId = bizId != null ? String(bizId).trim() : "";
  const tpl = (BUSINESS_DETAILS || "").trim();
  if (!rawId || !tpl) return null;

  const enc = encodeURIComponent(rawId);
  let url = tpl
    .replace("{business_id}", enc)
    .replace("{businessId}", enc)
    .replace(":business_id", enc)
    .replace(":businessId", enc);

  if (url === tpl) url = `${tpl.replace(/\/+$/, "")}/${enc}`;
  return url;
};

const buildOrdersUrl = (bizId, ownerType, overrideBase) => {
  const rawId = bizId != null ? String(bizId).trim() : "";
  const tpl = (overrideBase || ENV_ORDER_ENDPOINT || "").trim();
  if (!rawId || !tpl) return null;

  const encId = encodeURIComponent(rawId);
  const encOwner = ownerType ? encodeURIComponent(String(ownerType)) : null;

  let url = tpl
    .replace("{business_id}", encId)
    .replace("{businessId}", encId)
    .replace(":business_id", encId)
    .replace(":businessId", encId);

  if (url === tpl) {
    const sep = url.includes("?") ? "&" : "?";
    url = `${url}${sep}business_id=${encId}`;
  }

  if (encOwner) {
    const sep2 = url.includes("?") ? "&" : "?";
    url = `${url}${sep2}owner_type=${encOwner}`;
  }

  return url;
};

/* ---------------- clustering (GRID + tight complete-linkage) ---------------- */
const clusterOrdersByRadius = (ordersList, radiusKm) => {
  const coordsOnly = [];
  const noCoords = [];

  for (const o of ordersList || []) {
    const c =
      o?.coords &&
      Number.isFinite(Number(o.coords.lat)) &&
      Number.isFinite(Number(o.coords.lng))
        ? { lat: Number(o.coords.lat), lng: Number(o.coords.lng) }
        : null;

    if (!c) noCoords.push(o);
    else coordsOnly.push({ o, c });
  }

  const kmPerDegLat = 111;
  const latStep = Math.max(radiusKm / kmPerDegLat, 0.00001);

  const keyFor = (c) => {
    const lat = c.lat;
    const lng = c.lng;
    const cos = Math.cos((lat * Math.PI) / 180) || 1;
    const lngStep = Math.max(radiusKm / (kmPerDegLat * cos), 0.00001);

    const a = Math.floor(lat / latStep);
    const b = Math.floor(lng / lngStep);
    return `${a}:${b}`;
  };

  const buckets = new Map();
  for (const it of coordsOnly) {
    const k = keyFor(it.c);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(it);
  }

  const out = [];
  let idx = 0;

  const buildClusterObj = (members) => {
    let latSum = 0;
    let lngSum = 0;
    for (const m of members) {
      latSum += m.c.lat;
      lngSum += m.c.lng;
    }
    const centerCoords =
      members.length > 0
        ? { lat: latSum / members.length, lng: lngSum / members.length }
        : null;

    idx += 1;
    return {
      id: `cluster-${idx}`,
      orders: members.map((m) => m.o),
      centerCoords,
      isNoCoords: false,
      count: members.length,
    };
  };

  for (const [, bucket] of buckets) {
    const clusters = [];

    for (const item of bucket) {
      let placed = false;

      for (const cl of clusters) {
        let ok = true;
        for (const m of cl.members) {
          if (distanceKm(item.c, m.c) > radiusKm) {
            ok = false;
            break;
          }
        }
        if (ok) {
          cl.members.push(item);
          placed = true;
          break;
        }
      }

      if (!placed) clusters.push({ members: [item] });
    }

    for (const cl of clusters) out.push(buildClusterObj(cl.members));
  }

  if (noCoords.length) {
    out.push({
      id: "no-coords",
      orders: noCoords,
      centerCoords: null,
      isNoCoords: true,
      count: noCoords.length,
    });
  }

  return out;
};

/* ---------------- unique label helper ---------------- */
const labelForCluster = (cluster) => {
  const first = cluster?.orders?.[0]?.raw;
  const addr =
    first?.deliver_to?.address ||
    first?.deliverTo?.address ||
    cluster?.orders?.[0]?.delivery_address ||
    "Nearby orders";
  return pick2ndOr1stPlace(addr);
};

const applyUniqueLabels = (clusters) => {
  const used = new Map();
  return (clusters || []).map((c) => {
    const base = c.isNoCoords ? "Orders without location" : labelForCluster(c);
    const prev = used.get(base) || 0;
    const next = prev + 1;
    used.set(base, next);

    return {
      ...c,
      label: next === 1 ? base : `${base} #${next}`,
    };
  });
};

/* ---------------- screen ---------------- */
function NearbyOrdersScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();

  const businessIdFromParams = route?.params?.businessId;

  const ownerType = route?.params?.ownerType || route?.params?.owner_type || "food";
  const orderEndpointFromParams = route?.params?.orderEndpoint;
  const detailsRoute = route?.params?.detailsRoute || "OrderDetails";
  const thresholdKm = Number(route?.params?.thresholdKm ?? 2);

  // ✅ which screen shows batch/track list
  const batchListScreen = route?.params?.batchListScreen || "BatchRidesScreen";

  const [deliveryOption, setDeliveryOption] = useState(null);
  const [bizId, setBizId] = useState(businessIdFromParams || null);

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const abortRef = useRef(null);

  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else {
      const parent = navigation.getParent?.();
      const fallback = "OrdersTab";
      if (parent) parent.navigate(fallback);
      else navigation.navigate(fallback);
    }
    return true;
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", handleBack);
      return () => sub.remove();
    }, [handleBack])
  );

  const applyBizDetails = useCallback(
    (biz) => {
      if (!biz || typeof biz !== "object") return;

      if (!bizId && biz.business_id) setBizId(biz.business_id);

      const optRaw = biz.delivery_option ?? biz.deliveryOption ?? null;
      const opt = optRaw ? String(optRaw).toUpperCase().trim() : null;
      if (opt) setDeliveryOption(opt);
    },
    [bizId]
  );

  const fetchBusinessDetailsFromApi = useCallback(async () => {
    try {
      if (!bizId) return;

      const url = buildBusinessDetailsUrl(bizId);
      if (!url) return;

      const headers = { Accept: "application/json" };
      const token = await SecureStore.getItemAsync("auth_token");
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(url, { method: "GET", headers });
      const text = await res.text();

      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }

      if (!res.ok) return;

      const biz = json?.data || json;
      applyBizDetails(biz);
      await SecureStore.setItemAsync("business_details", JSON.stringify(biz));
    } catch (e) {
      console.log("[NearbyOrders][FOOD] BUSINESS_DETAILS fetch error:", e?.message || e);
    }
  }, [bizId, applyBizDetails]);

  useEffect(() => {
    (async () => {
      try {
        const blob = await SecureStore.getItemAsync("business_details");
        if (blob) applyBizDetails(JSON.parse(blob));
      } catch {}
      await fetchBusinessDetailsFromApi();
    })();
  }, [applyBizDetails, fetchBusinessDetailsFromApi]);

  const buildUrl = useCallback(() => {
    return buildOrdersUrl(bizId, ownerType, orderEndpointFromParams);
  }, [bizId, ownerType, orderEndpointFromParams]);

  const fetchOrders = useCallback(async () => {
    if (!bizId) return;

    try {
      setLoading(true);

      abortRef.current?.abort?.();
      const controller = new AbortController();
      abortRef.current = controller;

      const url = buildUrl();
      if (!url) {
        setLoading(false);
        return;
      }

      const headers = { Accept: "application/json" };
      const token = await SecureStore.getItemAsync("auth_token");
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(url, { signal: controller.signal, headers });
      const text = await res.text();

      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }

      const decorated = decorateOrdersFromApiPayload(json);
      setOrders(decorated);
    } catch (e) {
      console.warn("[NearbyOrders][FOOD] fetch error", e?.message || e);
    } finally {
      setLoading(false);
    }
  }, [bizId, buildUrl]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useFocusEffect(
    useCallback(() => {
      fetchBusinessDetailsFromApi();
      fetchOrders();
    }, [fetchBusinessDetailsFromApi, fetchOrders])
  );

  const onRefresh = useCallback(async () => {
    if (!bizId) return;
    setRefreshing(true);
    try {
      await Promise.all([fetchBusinessDetailsFromApi(), fetchOrders()]);
    } finally {
      setRefreshing(false);
    }
  }, [bizId, fetchBusinessDetailsFromApi, fetchOrders]);

  const clusterEligibleOrders = useMemo(
    () =>
      (orders || [])
        .filter((o) => !shouldExcludeFromScreen(o?.raw))
        .filter((o) => shouldIncludeInCluster(o.statusNorm || o.status)),
    [orders]
  );

  const clusters = useMemo(() => {
    const threshold = Number.isFinite(thresholdKm) && thresholdKm > 0 ? thresholdKm : 2;

    const rawClusters = clusterOrdersByRadius(clusterEligibleOrders || [], threshold);
    const labeled = applyUniqueLabels(rawClusters);

    labeled.sort((a, b) => (b.orders?.length || 0) - (a.orders?.length || 0));
    return labeled;
  }, [clusterEligibleOrders, thresholdKm]);

  /* ✅ ONE global track list (IN-PROGRESS only) */
  const trackableAll = useMemo(() => {
    const src = Array.isArray(orders) ? orders : [];
    return src
      .filter((o) => !shouldExcludeFromScreen(o?.raw))
      .filter((o) => isTrackableStatus(o?.statusNorm || o?.status));
  }, [orders]);

  const trackCount = trackableAll.length;
  const trackDisabled = trackCount === 0;

  const onTrackAllPress = useCallback(() => {
    if (trackDisabled) return;

    navigation.navigate(batchListScreen, {
      businessId: bizId,
      bizId: bizId,
      merchant_id: bizId,

      label: "Track orders",
      orders: trackableAll,

      ownerType,
      delivery_option: deliveryOption,
      deliveryOption: deliveryOption,
    });
  }, [trackDisabled, navigation, batchListScreen, bizId, trackableAll, ownerType, deliveryOption]);

  const headerTopPad = Math.max(insets.top, 8) + 18;
  const bottomFabPad = Math.max(insets.bottom, 0) + 18;

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right", "bottom"]}>
      <View style={[styles.headerBar, { paddingTop: headerTopPad }]}>
        <TouchableOpacity onPress={handleBack} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#0f172a" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Nearby Orders</Text>

        <View style={{ width: 40 }} />
      </View>

      {loading && orders.length === 0 ? (
        <View style={styles.centerBox}>
          <ActivityIndicator />
        </View>
      ) : clusters.length === 0 ? (
        <View style={styles.centerBox}>
          <Text style={{ color: "#6b7280" }}>
            No nearby orders found (excluding Pending / Completed).
          </Text>
        </View>
      ) : (
        <FlatList
          data={clusters}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{
            padding: 16,
            paddingBottom: 90 + bottomFabPad,
          }}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => {
            const { label, orders: clusterOrders, centerCoords } = item;
            const order_ids = (clusterOrders || []).map((o) => o?.id).filter(Boolean);

            const firstAddr =
              clusterOrders?.[0]?.raw?.deliver_to?.address ||
              clusterOrders?.[0]?.raw?.deliverTo?.address ||
              clusterOrders?.[0]?.delivery_address ||
              "—";

            return (
              <TouchableOpacity
                style={styles.clusterCard}
                activeOpacity={0.9}
                onPress={() => {
                  navigation.navigate("FoodNearbyClusterOrdersScreen", {
                    label,

                    merchant_id: bizId,
                    business_id: bizId,
                    merchantId: bizId,
                    businessId: bizId,

                    order_ids,
                    orderIds: order_ids,
                    order_ids_array: order_ids,

                    ownerType,
                    detailsRoute,
                    thresholdKm,
                    centerCoords,
                    orders: clusterOrders,

                    delivery_option: deliveryOption,
                    deliveryOption: deliveryOption,
                  });
                }}
              >
                <View style={styles.clusterHeader}>
                  <Ionicons name="location-outline" size={18} color="#0f172a" />
                  <Text style={styles.clusterTitle} numberOfLines={1}>
                    {label}
                  </Text>
                </View>

                <Text style={styles.clusterSub} numberOfLines={2}>
                  {firstAddr}
                </Text>

                <View style={styles.clusterBadge}>
                  <Text style={styles.clusterBadgeText}>{clusterOrders.length} orders</Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* ✅ ONE global Track button */}
      <View style={[styles.fabWrapper, { paddingBottom: bottomFabPad }]}>
        <TouchableOpacity
          style={[styles.fab, trackDisabled && { opacity: 0.4 }]}
          activeOpacity={trackDisabled ? 1 : 0.85}
          onPress={onTrackAllPress}
          disabled={trackDisabled}
        >
          <Ionicons name="bicycle" size={18} color="#fff" />
          <Text
            style={styles.fabText}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
          >
            Track orders{trackCount ? ` (${trackCount})` : ""}
          </Text>
        </TouchableOpacity>
      </View>
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

  centerBox: { flex: 1, justifyContent: "center", alignItems: "center" },

  clusterCard: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  clusterHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  clusterTitle: {
    marginLeft: 8,
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
    flexShrink: 1,
  },

  clusterSub: {
    marginTop: 6,
    fontSize: 12,
    color: "#64748b",
  },

  clusterBadge: {
    marginTop: 10,
    alignSelf: "flex-start",
    backgroundColor: "#dcfce7",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  clusterBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#16a34a",
  },

  fabWrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    backgroundColor: "transparent",
  },
  fab: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 15,
    borderRadius: 999,
    backgroundColor: "#16a34a",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  fabText: {
    marginLeft: 8,
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
    flexShrink: 1,
  },
});

export default NearbyOrdersScreen;
