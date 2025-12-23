// screens/food/NearbyOrdersScreen.js

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

/* ---------------- status helper ---------------- */
/** ✅ Cluster should show ALL statuses EXCEPT pending + delivered/completed */
const shouldIncludeInCluster = (status) => {
  const s = String(status || "").toUpperCase().trim();
  if (!s) return false;

  if (s === "PENDING") return false;
  if (s === "DELIVERED") return false;
  if (s === "COMPLETED") return false;
  if (s === "COMPLETE") return false;

  return true;
};

/* ---------------- coords helpers ---------------- */

const extractCoords = (order = {}) => {
  const cand = [
    order.delivery_address && {
      lat: order.delivery_address.lat,
      lng: order.delivery_address.lng,
    },
    { lat: order.delivery_lat, lng: order.delivery_lng },
    { lat: order.delivery_latitude, lng: order.delivery_longitude },
    { lat: order.deliveryLatitude, lng: order.deliveryLongitude },
    { lat: order.lat, lng: order.lng },
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

/* ---------------- helpers: normalize address & place ---------------- */

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

const toPlaceKey = (place) => {
  if (!place) return "unknown";
  return place.trim().toLowerCase();
};

const isNumericish = (s) => /^[0-9\s-]+$/.test(s);
const isPlusCodeish = (s) => /^[A-Z0-9+ ]+$/.test(s || "") && String(s).includes("+");

const deriveLocationKeyFromAddress = (address) => {
  if (!address || typeof address !== "string") return null;

  const line = address.split("\n")[0];
  const parts = line
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  if (!parts.length) return null;

  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    const low = p.toLowerCase();

    if (!p) continue;
    if (low === "bhutan") continue;
    if (isNumericish(p)) continue;
    if (isPlusCodeish(p)) continue;

    return low;
  }

  return null;
};

const getGeneralPlaceName = (order, fallback) => {
  const rawCandidates = [
    order?.general_place,
    order?.label,
    order?.area_name,
    order?.delivery_address,
    order?.dropoff_address,
    order?.shipping_address,
    order?.address,
    order?.customer_address,
  ];

  const candidates = rawCandidates
    .map(normalizeAddressField)
    .filter((x) => typeof x === "string" && x.length > 0);

  if (!candidates.length) return fallback;

  const raw = String(candidates[0]);
  const line = raw.split("\n")[0];

  const parts = line
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  if (!parts.length) return fallback;

  let main = "";

  if (parts[2] && !isNumericish(parts[2]) && !isPlusCodeish(parts[2])) {
    main = parts[2];
  } else if (parts[1] && !isNumericish(parts[1]) && !isPlusCodeish(parts[1])) {
    main = parts[1];
  } else {
    main = parts[0];
  }

  if (!main) return fallback;
  return main.length > 40 ? main.slice(0, 37) + "..." : main;
};

/* ---------------- decoration helper ---------------- */

const decorateOrdersFromSource = (source) => {
  const list = [];
  if (!Array.isArray(source)) return list;

  const pushDecorated = (o) => {
    if (!o) return;

    const addr =
      normalizeAddressField(o.delivery_address) ||
      normalizeAddressField(o.dropoff_address) ||
      normalizeAddressField(o.shipping_address) ||
      normalizeAddressField(o.address) ||
      normalizeAddressField(o.customer_address) ||
      "";

    const general_place = getGeneralPlaceName({ ...o, delivery_address: addr }, "Unknown Area");

    const coords = extractCoords(o);
    const placeKey = toPlaceKey(general_place);

    const rawStatus = o.status || o.order_status || "";
    const statusNorm = String(rawStatus || "").toUpperCase().trim();

    list.push({
      id: String(o.order_id ?? o.id),
      raw: o,
      general_place,
      placeKey,
      coords,
      delivery_address: addr,
      customer_name: o.customer_name,
      status: rawStatus,
      statusNorm,
    });
  };

  for (const entry of source) {
    if (entry && Array.isArray(entry.orders)) {
      for (const o of entry.orders) pushDecorated(o);
    } else {
      pushDecorated(entry);
    }
  }

  return list;
};

/* ---------------- place-name helpers for cluster naming ---------------- */

const BAN_GLOBAL = new Set(["bhutan"]);

const extractPlaceCandidates = (order = {}, extraBanSet = new Set()) => {
  const base = order.raw || order;
  const out = [];
  const seen = new Set();

  const pushFrom = (val) => {
    if (!val || typeof val !== "string") return;
    const firstLine = val.split("\n")[0];
    const parts = firstLine
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);

    for (const part of parts) {
      const low = part.toLowerCase();
      if (!part) continue;
      if (part.length < 2) continue;
      if (isNumericish(part)) continue;
      if (isPlusCodeish(part)) continue;
      if (BAN_GLOBAL.has(low)) continue;
      if (extraBanSet.has(low)) continue;
      if (seen.has(low)) continue;
      seen.add(low);
      out.push(part);
    }
  };

  const dAddr = order.delivery_address ?? base.delivery_address;
  if (typeof dAddr === "string") pushFrom(dAddr);
  else if (dAddr && typeof dAddr === "object") {
    if (typeof dAddr.address === "string") pushFrom(dAddr.address);
    if (typeof dAddr.label === "string") pushFrom(dAddr.label);
    if (typeof dAddr.formatted === "string") pushFrom(dAddr.formatted);
  }

  if (order.general_place) pushFrom(order.general_place);
  if (base.general_place) pushFrom(base.general_place);
  if (base.area_name) pushFrom(base.area_name);
  if (order.address) pushFrom(order.address);
  if (base.address) pushFrom(base.address);

  return out;
};

const bumpNameCounts = (nameCounts, order, extraBanSet) => {
  const names = extractPlaceCandidates(order, extraBanSet || new Set());
  for (const name of names) {
    const prev = nameCounts.get(name) || 0;
    nameCounts.set(name, prev + 1);
  }
};

const chooseClusterTitle = (nameCounts, fallbackLabel, { isNoCoords = false, banSet = new Set() } = {}) => {
  let entries = Array.from(nameCounts.entries());

  entries = entries.filter(([name]) => {
    const low = String(name).toLowerCase();
    if (!name) return false;
    if (isNumericish(name)) return false;
    if (isPlusCodeish(name)) return false;
    if (BAN_GLOBAL.has(low)) return false;
    if (banSet.has(low)) return false;
    return true;
  });

  if (!entries.length) {
    return isNoCoords ? "Orders without location" : fallbackLabel || "Nearby orders";
  }

  const common = entries.filter(([, count]) => count >= 2);
  const listToUse = (common.length ? common : entries).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  });

  const namesOnly = listToUse.slice(0, 3).map(([name]) => name);
  if (!namesOnly.length) return isNoCoords ? "Orders without location" : fallbackLabel || "Nearby orders";
  if (namesOnly.length === 1) return namesOnly[0];
  return namesOnly.join(" · ");
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

/* ---------------- NEW: proper clustering (DBSCAN-ish) ---------------- */
/**
 * Fixes “not grouping properly” when using 1-pass centroid assignment.
 * This uses single-linkage connectivity: if A within 3km of B and B within 3km of C,
 * all 3 become one cluster even if A to C slightly > 3km.
 */
const clusterOrdersByRadius = (ordersList, radiusKm) => {
  const coordsIdx = [];
  const noCoords = [];

  for (let i = 0; i < (ordersList || []).length; i++) {
    const o = ordersList[i];
    const c =
      o?.coords &&
      Number.isFinite(Number(o.coords.lat)) &&
      Number.isFinite(Number(o.coords.lng))
        ? { lat: Number(o.coords.lat), lng: Number(o.coords.lng) }
        : null;

    if (!c) noCoords.push(o);
    else coordsIdx.push({ o, c });
  }

  // BFS over graph edges (i-j if distance <= radius)
  const visited = new Array(coordsIdx.length).fill(false);
  const clusters = [];

  for (let i = 0; i < coordsIdx.length; i++) {
    if (visited[i]) continue;

    visited[i] = true;
    const queue = [i];
    const members = [];

    while (queue.length) {
      const cur = queue.shift();
      const { o, c } = coordsIdx[cur];
      members.push({ o, c });

      for (let j = 0; j < coordsIdx.length; j++) {
        if (visited[j]) continue;
        const d = distanceKm(c, coordsIdx[j].c);
        if (d <= radiusKm) {
          visited[j] = true;
          queue.push(j);
        }
      }
    }

    // compute centroid for display / navigation
    let latSum = 0;
    let lngSum = 0;
    for (const m of members) {
      latSum += m.c.lat;
      lngSum += m.c.lng;
    }
    const centerCoords =
      members.length > 0 ? { lat: latSum / members.length, lng: lngSum / members.length } : null;

    clusters.push({
      id: `cluster-${clusters.length + 1}`,
      orders: members.map((m) => m.o),
      centerCoords,
      isNoCoords: false,
      count: members.length,
      nameCounts: new Map(),
    });
  }

  // no-coords bucket
  if (noCoords.length) {
    clusters.push({
      id: "no-coords",
      orders: noCoords,
      centerCoords: null,
      isNoCoords: true,
      count: noCoords.length,
      nameCounts: new Map(),
    });
  }

  return clusters;
};

/* ---------------- screen ---------------- */

function NearbyOrdersScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();

  const paramOrders = route?.params?.orders;
  const businessIdFromParams = route?.params?.businessId;
  const ownerType = route?.params?.ownerType || route?.params?.owner_type || "mart";
  const orderEndpointFromParams = route?.params?.orderEndpoint;
  const detailsRoute = route?.params?.detailsRoute || "OrderDetails";

  // ✅ default is now 3km (your requirement)
  const thresholdKm = Number(route?.params?.thresholdKm ?? 3);

  // ✅ delivery_option now comes from BUSINESS_DETAILS (SecureStore + API), not from route params
  const [deliveryOption, setDeliveryOption] = useState(null);

  const [bizId, setBizId] = useState(businessIdFromParams || null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [merchantLocationKey, setMerchantLocationKey] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const abortRef = useRef(null);

  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else {
      const parent = navigation.getParent?.();
      if (parent) parent.navigate("MartOrdersTab");
      else navigation.navigate("MartOrdersTab");
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

      // ✅ delivery_option: BOTH | SELF | GRAB
      const optRaw = biz.delivery_option ?? biz.deliveryOption ?? null;
      const opt = optRaw ? String(optRaw).toUpperCase().trim() : null;
      if (opt) setDeliveryOption(opt);

      // ✅ location key from address
      const addr = biz.address || biz.business_address || biz.location || "";
      if (addr && !merchantLocationKey) {
        const locKey = deriveLocationKeyFromAddress(addr);
        if (locKey) setMerchantLocationKey(locKey);
      }
    },
    [bizId, merchantLocationKey]
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
      console.log("[NearbyOrders] BUSINESS_DETAILS fetch error:", e?.message || e);
    }
  }, [bizId, applyBizDetails]);

  useEffect(() => {
    (async () => {
      try {
        const blob = await SecureStore.getItemAsync("business_details");
        if (blob) {
          const j = JSON.parse(blob);
          applyBizDetails(j);
        }
      } catch {}
      await fetchBusinessDetailsFromApi();
    })();
  }, [applyBizDetails, fetchBusinessDetailsFromApi]);

  useEffect(() => {
    if (!paramOrders) return;

    let source = [];
    if (Array.isArray(paramOrders)) source = paramOrders;
    else if (Array.isArray(paramOrders.data)) source = paramOrders.data;

    const decorated = decorateOrdersFromSource(source);
    if (decorated.length > 0) setOrders(decorated);
  }, [paramOrders]);

  const buildUrl = useCallback(() => {
    return buildOrdersUrl(bizId, ownerType, orderEndpointFromParams);
  }, [bizId, ownerType, orderEndpointFromParams]);

  const fetchOrders = useCallback(async () => {
    if (paramOrders) return;
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

      const res = await fetch(url, { signal: controller.signal });
      const json = await res.json();

      const blocks = Array.isArray(json?.data) ? json.data : [];
      const decorated = decorateOrdersFromSource(blocks);
      setOrders(decorated);
    } catch (e) {
      console.warn("NearbyOrders fetch error", e?.message);
    } finally {
      setLoading(false);
    }
  }, [bizId, buildUrl, paramOrders]);

  useEffect(() => {
    if (!paramOrders) fetchOrders();
  }, [fetchOrders, paramOrders]);

  const onRefresh = useCallback(async () => {
    if (paramOrders) return;
    if (!bizId) return;

    setRefreshing(true);
    try {
      await Promise.all([fetchBusinessDetailsFromApi(), fetchOrders()]);
    } finally {
      setRefreshing(false);
    }
  }, [paramOrders, bizId, fetchBusinessDetailsFromApi, fetchOrders]);

  useFocusEffect(
    useCallback(() => {
      if (!paramOrders) {
        fetchBusinessDetailsFromApi();
        fetchOrders();
      }
    }, [paramOrders, fetchBusinessDetailsFromApi, fetchOrders])
  );

  /** ✅ include all except pending + delivered/completed */
  const clusterEligibleOrders = useMemo(
    () => (orders || []).filter((o) => shouldIncludeInCluster(o.statusNorm || o.status)),
    [orders]
  );

  const clusters = useMemo(() => {
    const threshold = Number.isFinite(thresholdKm) && thresholdKm > 0 ? thresholdKm : 3;

    const banSet = new Set(BAN_GLOBAL);
    if (merchantLocationKey) banSet.add(merchantLocationKey);

    // ✅ use fixed connectivity clustering instead of centroid single-pass
    const res = clusterOrdersByRadius(clusterEligibleOrders || [], threshold);

    // build titles
    for (const c of res) {
      for (const o of c.orders || []) bumpNameCounts(c.nameCounts, o, banSet);
    }

    const usedBaseTitles = new Map();
    for (const c of res) {
      const fallbackLabel = c.isNoCoords ? "Orders without location" : "Nearby orders";
      const baseTitle = chooseClusterTitle(c.nameCounts, fallbackLabel, {
        isNoCoords: c.isNoCoords,
        banSet,
      });

      const prevCount = usedBaseTitles.get(baseTitle) || 0;
      usedBaseTitles.set(baseTitle, prevCount + 1);

      c.label = prevCount > 0 ? `${baseTitle} #${prevCount + 1}` : baseTitle;
    }

    res.sort((a, b) => (b.orders?.length || 0) - (a.orders?.length || 0));
    return res;
  }, [clusterEligibleOrders, thresholdKm, merchantLocationKey]);

  const headerTopPad = Math.max(insets.top, 8) + 18;

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
            No nearby orders found (excluding Pending / Delivered).
          </Text>
        </View>
      ) : (
        <FlatList
          data={clusters}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: 16 }}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => {
            const { label, orders: clusterOrders, centerCoords } = item;
            const order_ids = (clusterOrders || []).map((o) => o?.id).filter(Boolean);

            return (
              <TouchableOpacity
                style={styles.clusterCard}
                onPress={() => {
                  navigation.navigate("NearbyClusterOrdersScreen", {
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

                <View style={styles.clusterBadge}>
                  <Text style={styles.clusterBadgeText}>{clusterOrders.length} orders</Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
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
  clusterBadge: {
    marginTop: 8,
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
});

export default NearbyOrdersScreen;
export { NearbyOrdersScreen };
