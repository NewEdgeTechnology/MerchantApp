// screens/food/OrderDetails.js
// ✅ FIX: If backend returns "ON ROAD" / "ON_ROAD" it will be normalized to "OUT_FOR_DELIVERY"
// ✅ FIX: OrderDetails will not show old status (eg PENDING) when list already shows Out For Delivery
// ✅ FIX: hydrateFromGrouped will normalize status and won't downgrade an already-updated local status
// ✅ FIX: after pressing Out for delivery, UI updates immediately + emits order-updated with normalized status
//
// ✅ FIX (your issue): Deliver in group was opening MART NearbyClusterOrdersScreen because of route-name collision.
// - Use a UNIQUE FOOD route name: "FoodNearbyClusterOrdersScreen"
// - resolveClusterContext defaults to FoodNearbyClusterOrdersScreen
// - candidates prefer FoodNearbyClusterOrdersScreen first
//
// ✅ NEW (your request): When redirected from OrderDetails, NearbyClusterOrdersScreen UI should look the SAME
// as when coming from NearbyOrdersScreen (list of orders, tabs, counts, etc.).
// - If OrderDetails does NOT have clusterCtx.orders, it will FETCH grouped orders and build nearby clusters
//   based on lat/lng, then navigate with { orders, label, addrPreview, centerCoords } so UI shows properly.

import React, { useMemo, useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  BackHandler,
  DeviceEventEmitter,
} from "react-native";
import {
  useRoute,
  useNavigation,
  useFocusEffect,
  CommonActions,
} from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as SecureStore from "expo-secure-store";
import io from "socket.io-client";
import {
  UPDATE_ORDER_STATUS_ENDPOINT as ENV_UPDATE_ORDER,
  ORDER_ENDPOINT as ENV_ORDER_ENDPOINT,
  SEND_REQUEST_DRIVER_ENDPOINT as ENV_SEND_REQUEST_DRIVER,
  RIDE_SOCKET_ENDPOINT as ENV_RIDE_SOCKET,
  DRIVER_DETAILS_ENDPOINT as ENV_DRIVER_DETAILS,
  DIVER_RATING_ENDPOINT as ENV_DRIVER_RATING,
} from "@env";

import {
  money,
  clamp,
  findStepIndex,
  STATUS_META,
  TERMINAL_NEGATIVE,
  TERMINAL_SUCCESS,
  IF_UNAVAILABLE_LABELS,
  normalizeOrderCode,
  sameOrder,
  resolveDeliveryOptionFromOrder,
  resolveFulfillmentType,
  fetchBusinessDetails,
  updateStatusApi,
  computeHaversineKm,
} from "./OrderDetails/orderDetailsUtils";

import { styles } from "./OrderDetails/orderDetailsStyles";
import StatusRail from "./OrderDetails/StatusRail";
import MetaSection from "./OrderDetails/MetaSection";
import DeliveryMethodChooser from "./OrderDetails/DeliveryMethodChooser";
import UpdateStatusActions from "./OrderDetails/UpdateStatusActions";
import ItemsBlock from "./OrderDetails/ItemsBlock";
import TotalsBlock from "./OrderDetails/TotalsBlock";
import DeclineModal from "./OrderDetails/DeclineModal";

/* ===========================
   ✅ status normalizer
   =========================== */
const normalizeStatus = (v) => {
  const s = String(v || "").trim().toUpperCase();
  if (!s) return "PENDING";

  if (s === "ACCEPTED") return "CONFIRMED";
  if (s === "CONFIRM") return "CONFIRMED";
  if (s === "PREPARING") return "CONFIRMED";

  // ✅ your case
  if (s === "ON ROAD" || s === "ON_ROAD" || s === "ONROAD") return "OUT_FOR_DELIVERY";
  if (s === "OUT FOR DELIVERY") return "OUT_FOR_DELIVERY";

  return s;
};

const STATUS_RANK = {
  PENDING: 0,
  CONFIRMED: 1,
  READY: 2,
  OUT_FOR_DELIVERY: 3,
  COMPLETED: 4,
};

const isHigherOrEqualStatus = (a, b) => {
  const ra = STATUS_RANK[normalizeStatus(a)] ?? -1;
  const rb = STATUS_RANK[normalizeStatus(b)] ?? -1;
  return ra >= rb;
};

/* ===========================
   normalize delivery_address
   =========================== */
const normalizeDeliveryAddress = (v) => {
  if (!v) return { address: "", lat: null, lng: null, city: null };

  if (typeof v === "object") {
    return {
      address: String(v.address ?? v.full_address ?? v.location ?? "").trim(),
      lat: v.lat ?? v.latitude ?? null,
      lng: v.lng ?? v.lon ?? v.longitude ?? null,
      city: v.city ?? v.town ?? v.dzongkhag ?? null,
    };
  }

  return { address: String(v).trim(), lat: null, lng: null, city: null };
};

/* ===========================
   resolve cluster context (safe)
   =========================== */
const resolveClusterContext = (params = {}, order = {}, routeOrderId) => {
  const orderIdKey =
    order?.id ?? order?.order_id ?? order?.order_code ?? routeOrderId;

  const direct =
    params.clusterParams ||
    params.cluster_context ||
    params.clusterContext ||
    params.cluster ||
    null;

  if (direct && typeof direct === "object") {
    return {
      screenName:
        direct.screenName ||
        params.clusterScreenName ||
        "FoodNearbyClusterOrdersScreen",
      ...direct,

      orderId: direct.orderId ?? orderIdKey,
      orderCode: direct.orderCode ?? order?.order_code ?? orderIdKey,

      businessId:
        direct.businessId ??
        params.businessId ??
        params.business_id ??
        order?.business_id ??
        order?.merchant_id ??
        null,

      ownerType: direct.ownerType ?? params.ownerType ?? params.owner_type ?? null,

      ordersGroupedUrl:
        direct.ordersGroupedUrl ??
        params.ordersGroupedUrl ??
        params.groupedUrl ??
        params.ordersGroupedURL ??
        null,

      cluster_id:
        direct.cluster_id ??
        direct.clusterId ??
        params.cluster_id ??
        params.clusterId ??
        params.group_id ??
        params.groupId ??
        null,

      orders:
        (direct.orders ??
          direct.clusterOrders ??
          params.clusterOrders ??
          params.ordersInCluster ??
          params.orders) ?? null,

      group:
        direct.group ??
        params.group ??
        params.clusterGroup ??
        params.groupData ??
        null,
    };
  }

  const maybeOrders =
    params.clusterOrders || params.ordersInCluster || params.orders || null;
  const maybeClusterId =
    params.cluster_id ||
    params.clusterId ||
    params.group_id ||
    params.groupId ||
    null;

  if (maybeOrders || maybeClusterId) {
    return {
      screenName: params.clusterScreenName || "FoodNearbyClusterOrdersScreen",
      businessId:
        params.businessId ??
        params.business_id ??
        order?.business_id ??
        order?.merchant_id ??
        null,
      ownerType: params.ownerType ?? params.owner_type ?? null,
      ordersGroupedUrl: params.ordersGroupedUrl ?? params.groupedUrl ?? null,
      cluster_id: maybeClusterId,
      orders: maybeOrders,
      orderId: orderIdKey,
      orderCode: order?.order_code ?? orderIdKey,
    };
  }

  return null;
};

/* ===========================
   find a screen that exists in the navigator chain
   =========================== */
const pickExistingRouteName = (nav, candidates = []) => {
  const clean = (x) => String(x || "").trim();
  const existsIn = (n, name) => {
    try {
      const names = n?.getState?.()?.routeNames || [];
      return names.includes(name);
    } catch {
      return false;
    }
  };

  const chain = [];
  try {
    let n = nav;
    while (n) {
      chain.push(n);
      n = n.getParent?.();
    }
  } catch {}

  for (const raw of candidates.map(clean).filter(Boolean)) {
    for (const n of chain) {
      if (existsIn(n, raw)) return raw;
    }
  }
  return null;
};

/* ===========================
   find the navigator instance that owns a routeName
   =========================== */
const findNavigatorOwningRoute = (nav, routeName) => {
  const existsIn = (n, name) => {
    try {
      const names = n?.getState?.()?.routeNames || [];
      return names.includes(name);
    } catch {
      return false;
    }
  };

  try {
    let n = nav;
    while (n) {
      if (existsIn(n, routeName)) return n;
      n = n.getParent?.();
    }
  } catch {}
  return null;
};

/* ===========================
   ✅ NEW: build clusters from orders using lat/lng
   - this is what makes the UI show list + counts even when coming from OrderDetails
   =========================== */
const buildClustersFromOrders = (orders = [], thresholdKm = 5) => {
  const pickCoords = (o = {}) => {
    const da = o.delivery_address || o.address || o.deliver_to || null;
    const cand = [
      { lat: o.delivery_lat, lng: o.delivery_lng },
      { lat: o.delivery_latitude, lng: o.delivery_longitude },
      { lat: o.deliveryLatitude, lng: o.deliveryLongitude },
      { lat: o.lat, lng: o.lng },
      { lat: o.latitude, lng: o.longitude },
      { lat: o.deliver_to?.lat, lng: o.deliver_to?.lng },
      { lat: o.delivery_address?.lat, lng: o.delivery_address?.lng },
      { lat: da?.lat, lng: da?.lng },
      { lat: da?.latitude, lng: da?.longitude },
    ];
    for (const c of cand) {
      const lat = Number(c.lat);
      const lng = Number(c.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }
    return null;
  };

  const getAddr = (o = {}) => {
    const rawAddr = o.delivery_address ?? o.raw?.delivery_address;
    if (typeof rawAddr === "string" && rawAddr.trim()) return rawAddr.trim();
    if (rawAddr && typeof rawAddr === "object") {
      if (typeof rawAddr.address === "string" && rawAddr.address.trim()) return rawAddr.address.trim();
      if (typeof rawAddr.formatted === "string" && rawAddr.formatted.trim()) return rawAddr.formatted.trim();
      if (typeof rawAddr.label === "string" && rawAddr.label.trim()) return rawAddr.label.trim();
    }
    if (typeof o.address === "string" && o.address.trim()) return o.address.trim();
    if (typeof o.general_place === "string" && o.general_place.trim()) return o.general_place.trim();
    if (typeof o.deliver_to?.address === "string" && o.deliver_to.address.trim()) return o.deliver_to.address.trim();
    return "";
  };

  const clusters = [];
  const normalized = (orders || []).map((o) => ({
    raw: o,
    coords: pickCoords(o),
    addr: getAddr(o),
  }));

  for (const it of normalized) {
    if (!it.coords) continue;

    let placed = false;
    for (const c of clusters) {
      const d = computeHaversineKm(c.centerCoords, it.coords);
      if (d != null && d <= thresholdKm) {
        c.orders.push(it.raw);
        const n = c.orders.length;
        c.centerCoords = {
          lat: (c.centerCoords.lat * (n - 1) + it.coords.lat) / n,
          lng: (c.centerCoords.lng * (n - 1) + it.coords.lng) / n,
        };
        if (!c.addrPreview && it.addr) c.addrPreview = it.addr;
        placed = true;
        break;
      }
    }

    if (!placed) {
      clusters.push({
        label: it.addr ? it.addr.split(",")[0].trim() : "Nearby cluster",
        addrPreview: it.addr || "",
        centerCoords: { ...it.coords },
        orders: [it.raw],
        thresholdKm,
      });
    }
  }

  // fallback: if coords missing everywhere, still create a single cluster
  if (!clusters.length && (orders || []).length) {
    clusters.push({
      label: "Nearby cluster",
      addrPreview: getAddr(orders[0]) || "",
      centerCoords: null,
      orders: orders,
      thresholdKm,
    });
  }

  clusters.sort((a, b) => (b.orders?.length || 0) - (a.orders?.length || 0));
  return clusters;
};

export default function OrderDetails() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();

  const params = route?.params ?? {};
  const orderProp = params.order ?? null;
  const routeOrderId = params.orderId ?? null;
  const ordersGroupedUrl = params.ordersGroupedUrl ?? null;
  const paramBusinessId = params.businessId ?? null;

  const isScheduledOrder =
    params.isScheduled === true ||
    params.is_scheduled === true ||
    normalizeStatus(orderProp?.status) === "SCHEDULED" ||
    (routeOrderId && String(routeOrderId).startsWith("SCH-"));

  const ownerType = params.ownerType ?? params.owner_type ?? null;

  const deliveryOptionFromParamsRaw =
    params.delivery_option ?? params.deliveryOption ?? null;

  const [order, setOrder] = useState(() => {
    const o = orderProp || {};
    return {
      ...o,
      status: normalizeStatus(o?.status),
      delivery_address: normalizeDeliveryAddress(
        o?.delivery_address ?? o?.address ?? o?.deliver_to
      ),
    };
  });

  const [updating, setUpdating] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [rideMessage, setRideMessage] = useState("");
  const [driverAccepted, setDriverAccepted] = useState(false);
  const [driverArrived, setDriverArrived] = useState(false);

  const [driverDetails, setDriverDetails] = useState(null);
  const [driverRating, setDriverRating] = useState(null);

  const [itemUnavailableMap, setItemUnavailableMap] = useState({});
  const [itemReplacementMap, setItemReplacementMap] = useState({});

  const socketRef = useRef(null);
  const autoDeclinedRef = useRef(false);

  // cluster context (or null)
  const clusterCtx = useMemo(
    () => resolveClusterContext(params, order, routeOrderId),
    [params, order, routeOrderId]
  );

  // ✅ Prefer FOOD unique route name first
  const CLUSTER_ROUTE_CANDIDATES = useMemo(
    () => [
      "FoodNearbyClusterOrdersScreen",
      "NearbyClusterOrdersScreen",
      "NearbyClusterOrders",
      "NearbyOrdersCluster",
    ],
    []
  );

  const resolvedClusterRouteName = useMemo(() => {
    const preferred = clusterCtx?.screenName || params.clusterScreenName;
    return (
      pickExistingRouteName(navigation, [preferred, ...CLUSTER_ROUTE_CANDIDATES]) ||
      null
    );
  }, [navigation, clusterCtx?.screenName, params.clusterScreenName, CLUSTER_ROUTE_CANDIDATES]);

  useEffect(() => {
    setItemUnavailableMap({});
    setItemReplacementMap({});
    autoDeclinedRef.current = false;
    setDriverArrived(false);
  }, [routeOrderId]);

  /* ---------- Back handling ---------- */
  const goBackToOrders = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    try {
      const parent = navigation.getParent?.();
      const names = parent?.getState?.()?.routeNames ?? [];
      const target =
        names.find((n) =>
          /^(Orders|OrderTab|OrdersTab|MartOrders|FoodOrders)$/i.test(n)
        ) || names.find((n) => /Order/i.test(n));
      if (parent && target) {
        parent.navigate(target);
        return;
      }
    } catch {}
    navigation.dispatch(
      CommonActions.navigate({
        name: "MainTabs",
        params: { screen: "Orders" },
      })
    );
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        goBackToOrders();
        return true;
      };
      const sub = BackHandler.addEventListener("hardwareBackPress", onBack);
      return () => sub.remove();
    }, [goBackToOrders])
  );

  /* ---------- Merchant delivery option & location ---------- */
  const [merchantDeliveryOpt, setMerchantDeliveryOpt] = useState("UNKNOWN");
  const [businessId, setBusinessId] = useState(paramBusinessId);
  const [businessCoords, setBusinessCoords] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const token = await SecureStore.getItemAsync("auth_token");
        let finalBizId = businessId || paramBusinessId;

        if (!finalBizId) {
          const saved = await SecureStore.getItemAsync("merchant_login");
          if (saved) {
            try {
              const j = JSON.parse(saved);
              finalBizId =
                j?.business_id ||
                j?.user?.business_id ||
                j?.user?.businessId ||
                j?.id ||
                j?.user?.id ||
                null;
              if (finalBizId) setBusinessId(finalBizId);
            } catch {}
          }
        }

        const bd = await fetchBusinessDetails({
          token,
          business_id: finalBizId,
        });

        if (bd) {
          const opt = bd?.delivery_option ?? bd?.deliveryOption;
          const nOpt = opt ? String(opt).toUpperCase() : "UNKNOWN";
          setMerchantDeliveryOpt(nOpt);

          const latRaw =
            bd.latitude ??
            bd.lat ??
            bd.business_latitude ??
            bd.business_lat ??
            null;
          const lngRaw =
            bd.longitude ??
            bd.lng ??
            bd.business_longitude ??
            bd.business_lng ??
            null;

          const latNum = latRaw != null ? Number(latRaw) : NaN;
          const lngNum = lngRaw != null ? Number(lngRaw) : NaN;

          if (!Number.isNaN(latNum) && !Number.isNaN(lngNum)) {
            setBusinessCoords({ lat: latNum, lng: lngNum });
          }
        }
      } catch (e) {
        console.log("[OrderDetails] BUSINESS_DETAILS fetch error:", e?.message || e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- Normalize fulfillment ---------- */
  const fulfillment = useMemo(
    () => resolveFulfillmentType({ ...order, params }),
    [order, params]
  );

  const isPickupFulfillment = useMemo(
    () => (fulfillment || "").toLowerCase() === "pickup",
    [fulfillment]
  );

  const orderDeliveryHint = useMemo(
    () => resolveDeliveryOptionFromOrder({ ...order, params }),
    [order, params]
  );

  const deliveryOptionInitial = useMemo(() => {
    if (deliveryOptionFromParamsRaw)
      return String(deliveryOptionFromParamsRaw).toUpperCase();
    const m = merchantDeliveryOpt;
    if (m !== "UNKNOWN") return m;
    return orderDeliveryHint || "";
  }, [deliveryOptionFromParamsRaw, merchantDeliveryOpt, orderDeliveryHint]);

  const [deliveryChoice, setDeliveryChoice] = useState(() => {
    const p = String(deliveryOptionFromParamsRaw || "").toUpperCase();
    if (p === "GRAB") return "grab";
    return "self";
  });

  const isBothOption = deliveryOptionInitial === "BOTH";
  const isSelfSelected = deliveryChoice === "self";
  const isGrabSelected = deliveryChoice === "grab";

  // ✅ always use normalized status
  const status = normalizeStatus(order?.status || "PENDING");

  const isPlatformDelivery = useMemo(() => {
    if (isBothOption) return isGrabSelected;
    return deliveryOptionInitial === "GRAB";
  }, [isBothOption, isGrabSelected, deliveryOptionInitial]);

  const deliveryOptionDisplay = useMemo(() => {
    if (isBothOption) {
      if (status === "READY") {
        if (isSelfSelected) return "BOTH (SELF chosen)";
        if (isGrabSelected) return "BOTH (GRAB chosen)";
        return "BOTH (choose at READY)";
      }
      return "BOTH";
    }
    return deliveryOptionInitial || "";
  }, [isBothOption, isSelfSelected, isGrabSelected, deliveryOptionInitial, status]);

  /* ---------- Sequence ---------- */
  const STATUS_SEQUENCE = useMemo(
    () =>
      isPickupFulfillment
        ? ["PENDING", "CONFIRMED", "READY"]
        : ["PENDING", "CONFIRMED", "READY", "OUT_FOR_DELIVERY", "COMPLETED"],
    [isPickupFulfillment]
  );

  const isTerminalNegative = TERMINAL_NEGATIVE.has(status);
  const isTerminalSuccess =
    TERMINAL_SUCCESS.has(status) || (isPickupFulfillment && status === "READY");

  const isCancelledByCustomer = useMemo(() => {
    const rawStatus = normalizeStatus(order?.status);
    const reasonRaw =
      order?.status_reason ??
      order?.cancel_reason ??
      order?.cancellation_reason ??
      "";
    const reason = String(reasonRaw || "").toLowerCase();
    const cancelledBy = String(
      order?.cancelled_by || order?.canceled_by || ""
    ).toLowerCase();

    if (cancelledBy && (cancelledBy.includes("customer") || cancelledBy.includes("user")))
      return true;

    if (rawStatus.includes("CANCEL")) {
      if (!reason) return true;
      if (reason.includes("customer") || reason.includes("user")) return true;
    }

    if (rawStatus === "DECLINED") {
      if (
        reason.includes("customer cancelled") ||
        reason.includes("customer canceled") ||
        reason.includes("cancelled by customer") ||
        reason.includes("canceled by customer") ||
        reason.includes("user cancelled") ||
        reason.includes("user canceled")
      )
        return true;
    }

    return false;
  }, [
    order?.status,
    order?.status_reason,
    order?.cancel_reason,
    order?.cancellation_reason,
    order?.cancelled_by,
    order?.canceled_by,
  ]);

  const shouldBlockAtReady =
    status === "READY" &&
    (isPlatformDelivery || (isBothOption && isGrabSelected)) &&
    !driverAccepted;

  const nextFor = useCallback(
    (curr) => {
      const s = normalizeStatus(curr);
      if (TERMINAL_NEGATIVE.has(s) || TERMINAL_SUCCESS.has(s)) return null;
      if (isPickupFulfillment && s === "READY") return null;
      if (s === "READY" && shouldBlockAtReady) return null;

      const idx = STATUS_SEQUENCE.indexOf(s);
      if (idx === -1) return "CONFIRMED";
      return STATUS_SEQUENCE[idx + 1] || null;
    },
    [STATUS_SEQUENCE, shouldBlockAtReady, isPickupFulfillment]
  );

  const stepIndex = findStepIndex(status, STATUS_SEQUENCE);
  const lastIndex = STATUS_SEQUENCE.length - 1;
  const progressIndex = clamp(stepIndex === -1 ? 0 : stepIndex, 0, lastIndex);
  const progressPct = isTerminalNegative
    ? 0
    : isTerminalSuccess
    ? 100
    : ((progressIndex + 1) / STATUS_SEQUENCE.length) * 100;

  const restaurantNote = useMemo(() => {
    const n =
      order?.note_for_restaurant ??
      order?.restaurant_note ??
      order?.note_for_store ??
      order?.note ??
      "";
    return String(n || "").trim();
  }, [order]);

  const ifUnavailableDisplay = useMemo(() => {
    const raw = order?.if_unavailable;
    if (!raw) return "";
    const key = String(raw).trim().toLowerCase();
    if (IF_UNAVAILABLE_LABELS[key]) return IF_UNAVAILABLE_LABELS[key];
    return String(raw).replace(/_/g, " ");
  }, [order?.if_unavailable]);

  const estimatedArrivalDisplay = useMemo(() => {
    const raw = order?.estimated_arrivial_time;
    if (raw == null) return "";
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return `~${Math.round(n)} min`;
    const s = String(raw).trim();
    if (!s) return "";
    return s;
  }, [order?.estimated_arrivial_time]);

  const ifUnavailableMode = useMemo(() => {
    const raw = order?.if_unavailable;
    const s = String(raw || "").toLowerCase();

    if (s.includes("replace") || s.includes("similar")) return "REPLACE";
    if (s.includes("remove") || s.includes("refund")) return "REMOVE";

    return "OTHER";
  }, [order?.if_unavailable]);

  /* ---------- Hydrate from grouped endpoint (live orders ONLY) ---------- */
  const hydrateFromGrouped = useCallback(async () => {
    try {
      if (!routeOrderId) return;
      if (isScheduledOrder) return;

      const baseRaw = (ordersGroupedUrl || ENV_ORDER_ENDPOINT || "").trim();
      if (!baseRaw) return;

      let bizId = businessId || paramBusinessId;

      if (!bizId && baseRaw.includes("{businessId}")) {
        try {
          const saved = await SecureStore.getItemAsync("merchant_login");
          if (saved) {
            const j = JSON.parse(saved);
            bizId =
              j?.business_id ||
              j?.user?.business_id ||
              j?.user?.businessId ||
              j?.id ||
              j?.user?.id ||
              null;
            if (bizId && !businessId) setBusinessId(bizId);
          }
        } catch {}
      }

      let groupedUrlFinal = baseRaw;
      if (bizId)
        groupedUrlFinal = groupedUrlFinal.replace(
          /\{businessId\}/gi,
          encodeURIComponent(String(bizId))
        );

      const token = await SecureStore.getItemAsync("auth_token");
      const res = await fetch(groupedUrlFinal, {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const text = await res.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {}
      if (!res.ok)
        throw new Error(json?.message || json?.error || `HTTP ${res.status}`);

      const groups = Array.isArray(json?.data)
        ? json.data
        : Array.isArray(json)
        ? json
        : [];

      let allOrders = [];
      for (const g of groups) {
        if (Array.isArray(g?.orders)) {
          const user = g.user || g.customer || g.user_details || {};
          const userName =
            g.customer_name ??
            g.name ??
            user.name ??
            user.user_name ??
            user.full_name ??
            "";
          const userPhone =
            g.phone ?? user.phone ?? user.phone_number ?? user.mobile ?? "";

          for (const o of g.orders) {
            allOrders.push({
              ...o,
              user: o.user || user,
              customer_name: o.customer_name ?? userName,
              customer_phone: o.customer_phone ?? userPhone,
              user_name: o.user_name ?? userName,
            });
          }
        } else if (g && (g.id || g.order_id || g.order_code)) {
          allOrders.push(g);
        }
      }

      const match = allOrders.find((o) =>
        sameOrder(o?.id ?? o?.order_id ?? o?.order_code, routeOrderId)
      );
      if (!match) return;

      const matchStatus = normalizeStatus(match?.status ?? "PENDING");
      const localStatus = normalizeStatus(order?.status ?? "PENDING");

      // ✅ do NOT downgrade local status if it is already ahead
      const finalStatus = isHigherOrEqualStatus(localStatus, matchStatus)
        ? localStatus
        : matchStatus;

      const normalizedFromMatch = {
        ...match,
        id: String(match?.id ?? match?.order_id ?? match?.order_code ?? routeOrderId),
        order_code: normalizeOrderCode(match?.order_code ?? match?.id ?? routeOrderId),
        customer_name:
          match?.customer_name ??
          match?.user_name ??
          match?.user?.user_name ??
          match?.user?.name ??
          "",
        customer_phone:
          match?.customer_phone ?? match?.phone ?? match?.user?.phone ?? "",
        payment_method: match?.payment_method ?? match?.payment ?? "",
        delivery_address: normalizeDeliveryAddress(
          match?.delivery_address ?? match?.address ?? match?.deliver_to
        ),
        raw_items: Array.isArray(match?.raw_items)
          ? match.raw_items
          : Array.isArray(match?.items)
          ? match.items
          : [],
        total: match?.total ?? match?.total_amount ?? 0,
        status: finalStatus,
        type:
          match?.type ??
          match?.fulfillment_type ??
          match?.delivery_type ??
          order?.type ??
          "",
        delivery_option:
          match?.delivery_option ??
          match?.delivery_by ??
          order?.delivery_option ??
          "",
        status_timestamps:
          match?.status_timestamps ?? order?.status_timestamps ?? {},
        if_unavailable: match?.if_unavailable ?? order?.if_unavailable ?? "",
        estimated_arrivial_time:
          match?.estimated_arrivial_time ??
          match?.eta_minutes ??
          order?.estimated_arrivial_time ??
          null,
        delivery_fee:
          match?.delivery_fee ?? match?.deliveryFee ?? order?.delivery_fee ?? null,
        merchant_delivery_fee:
          match?.merchant_delivery_fee ??
          match?.merchantDeliveryFee ??
          order?.merchant_delivery_fee ??
          null,
        platform_fee: match?.platform_fee ?? order?.platform_fee ?? 0,
        discount_amount: match?.discount_amount ?? order?.discount_amount ?? 0,
        totals_for_business:
          match?.totals_for_business ?? order?.totals_for_business ?? null,
      };

      setOrder((prev) => ({
        ...prev,
        ...normalizedFromMatch,
        status: normalizeStatus(normalizedFromMatch.status),
        delivery_address: normalizeDeliveryAddress(
          normalizedFromMatch?.delivery_address ?? prev?.delivery_address ?? prev?.address
        ),
      }));
    } catch (e) {
      console.warn("[OrderDetails] hydrate error:", e?.message);
    }
  }, [
    ordersGroupedUrl,
    routeOrderId,
    order?.status,
    businessId,
    paramBusinessId,
    isScheduledOrder,
  ]);

  useFocusEffect(
    useCallback(() => {
      hydrateFromGrouped();
    }, [hydrateFromGrouped])
  );

  /* ---------- Distance & ETA (device) ---------- */
  const [routeInfo, setRouteInfo] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState("");
  const [manualPrepMin, setManualPrepMin] = useState("");

  const refCoords = useMemo(() => {
    const addr = order?.delivery_address;
    const addrLat = addr ? addr.lat ?? addr.latitude : null;
    const addrLng = addr ? addr.lng ?? addr.lon ?? addr.longitude : null;

    const lat =
      (addrLat != null ? addrLat : null) ??
      order?.delivery_lat ??
      order?.lat ??
      order?.destination?.lat ??
      order?.geo?.lat ??
      27.4775469;

    const lng =
      (addrLng != null ? addrLng : null) ??
      order?.delivery_lng ??
      order?.lng ??
      order?.destination?.lng ??
      order?.geo?.lng ??
      89.6387255;

    const cityId =
      order?.city_id ??
      order?.city ??
      (typeof addr === "object"
        ? addr.city ?? addr.town ?? addr.dzongkhag
        : null) ??
      "thimphu";

    return {
      lat: Number(lat),
      lng: Number(lng),
      cityId: String(cityId || "thimphu").toLowerCase(),
    };
  }, [order]);

  useEffect(() => {
    if ((fulfillment || "").toLowerCase() !== "delivery") {
      setRouteInfo(null);
      setRouteError("");
      return;
    }
    if (!businessCoords) return;

    const from = businessCoords;
    const to = { lat: refCoords.lat, lng: refCoords.lng };

    if (
      !Number.isFinite(from.lat) ||
      !Number.isFinite(from.lng) ||
      !Number.isFinite(to.lat) ||
      !Number.isFinite(to.lng)
    ) {
      setRouteInfo(null);
      setRouteError("");
      return;
    }

    try {
      setRouteLoading(true);
      setRouteError("");

      const distanceKm = computeHaversineKm(from, to);
      if (distanceKm == null) {
        setRouteInfo(null);
        setRouteError("Failed to compute distance");
      } else {
        const avgSpeedKmh = 20;
        const etaMin = distanceKm > 0 ? (distanceKm / avgSpeedKmh) * 60 : 0;
        setRouteInfo({ distanceKm, etaMin });
      }
    } catch {
      setRouteInfo(null);
      setRouteError("Failed to compute distance");
    } finally {
      setRouteLoading(false);
    }
  }, [businessCoords, refCoords.lat, refCoords.lng, fulfillment]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      "similar-item-chosen",
      ({ itemKey, replacement }) => {
        if (!itemKey || !replacement) return;
        setItemReplacementMap((prev) => ({
          ...prev,
          [String(itemKey)]: replacement,
        }));
      }
    );
    return () => sub?.remove?.();
  }, []);

  const DEFAULT_REASON = {
    CONFIRMED: "Order accepted by merchant",
    READY: "Order is ready",
    OUT_FOR_DELIVERY: "Order handed over for delivery",
    COMPLETED: "Order delivered",
  };

  const doUpdate = useCallback(
    async (newStatusRaw, opts = {}, skipUnavailableCheck = false) => {
      try {
        const currentStatus = normalizeStatus(order?.status || "PENDING");
        const newStatus = normalizeStatus(newStatusRaw);

        const fLower = (fulfillment || "").toLowerCase();
        const needsPrep = fLower === "delivery" || fLower === "pickup";

        if (
          newStatus === "CONFIRMED" &&
          currentStatus === "PENDING" &&
          !skipUnavailableCheck
        ) {
          Alert.alert(
            "Check unavailable items",
            "Before accepting, please make sure any unavailable items are marked as unavailable in the list below.",
            [
              { text: "Go back", style: "cancel" },
              {
                text: "Accept anyway",
                onPress: () => doUpdate(newStatus, opts, true),
              },
            ]
          );
          return;
        }

        if (newStatus === "DECLINED") {
          const r = String(opts?.reason ?? "").trim();
          if (r.length < 3) {
            setDeclineOpen(true);
            Alert.alert(
              "Reason required",
              "Please provide at least 3 characters explaining why the order is declined."
            );
            return;
          }

          const statusReason = r;

          const payload = {
            status: "DECLINED",
            status_reason: statusReason,
            reason: statusReason,
            cancel_reason: statusReason,
            cancellation_reason: statusReason,
          };

          setUpdating(true);
          const token = await SecureStore.getItemAsync("auth_token");
          const raw = order?.order_code || order?.id || routeOrderId;
          const orderCode = normalizeOrderCode(raw);

          await updateStatusApi({
            endpoint: ENV_UPDATE_ORDER || "",
            orderCode,
            payload,
            token,
          });

          const patch = {
            status: "DECLINED",
            status_reason: statusReason,
            cancel_reason: statusReason,
            cancellation_reason: statusReason,
          };

          setOrder((prev) => ({ ...prev, ...patch, status: normalizeStatus(patch.status) }));
          DeviceEventEmitter.emit("order-updated", {
            id: String(order?.id || routeOrderId),
            patch: { ...patch, status: normalizeStatus(patch.status) },
          });
          return;
        }

        if (
          needsPrep &&
          currentStatus === "PENDING" &&
          newStatus === "CONFIRMED"
        ) {
          const prepVal = Number(manualPrepMin);
          if (!Number.isFinite(prepVal) || prepVal <= 0) {
            Alert.alert(
              "Time required",
              "Please enter the time to prepare (in minutes) before accepting the order."
            );
            return;
          }
        }

        let payload = { status: newStatus };

        if (DEFAULT_REASON[newStatus]) {
          const r = DEFAULT_REASON[newStatus];
          payload.status_reason = r;
          payload.reason = r;
        }

        const deliveryBy =
          isBothOption && (isSelfSelected || isGrabSelected)
            ? isSelfSelected
              ? "SELF"
              : "GRAB"
            : deliveryOptionInitial || "";
        if (deliveryBy) payload.delivery_option = deliveryBy;

        const prepVal = Number(manualPrepMin);
        const hasPrep = Number.isFinite(prepVal) && prepVal > 0;
        const deliveryVal = routeInfo?.etaMin ?? null;
        const hasDelivery =
          fLower === "delivery" &&
          deliveryVal != null &&
          Number.isFinite(deliveryVal);

        let computedEta = null;
        if (hasPrep || hasDelivery) {
          const total = (hasPrep ? prepVal : 0) + (hasDelivery ? deliveryVal : 0);
          const totalRounded = Math.round(total);
          if (totalRounded > 0) computedEta = totalRounded;
        }

        if (newStatus === "CONFIRMED") {
          if (computedEta != null) payload.estimated_minutes = computedEta;

          const total = Number(order?.total ?? order?.total_amount ?? 0);
          const platformFee = Number(
            order?.platform_fee ?? order?.totals_for_business?.fee_share ?? 0
          );
          const discount = Number(order?.discount_amount ?? 0);

          if (Number.isFinite(total)) payload.final_total_amount = total;
          if (Number.isFinite(platformFee))
            payload.final_platform_fee = platformFee;
          if (Number.isFinite(discount))
            payload.final_discount_amount = discount;
        }

        // ✅ optimistic UI update immediately
        const optimisticPatch = { status: newStatus };
        if (payload.status_reason) optimisticPatch.status_reason = payload.status_reason;
        if (payload.delivery_option) optimisticPatch.delivery_option = payload.delivery_option;
        if (computedEta != null) optimisticPatch.estimated_arrivial_time = computedEta;

        setOrder((prev) => ({ ...prev, ...optimisticPatch, status: normalizeStatus(newStatus) }));
        DeviceEventEmitter.emit("order-updated", {
          id: String(order?.id || routeOrderId),
          patch: { ...optimisticPatch, status: normalizeStatus(newStatus) },
        });

        setUpdating(true);
        const token = await SecureStore.getItemAsync("auth_token");
        const raw = order?.order_code || order?.id || routeOrderId;
        const orderCode = normalizeOrderCode(raw);

        await updateStatusApi({
          endpoint: ENV_UPDATE_ORDER || "",
          orderCode,
          payload,
          token,
        });
      } catch (e) {
        Alert.alert("Update failed", String(e?.message || e));
        hydrateFromGrouped();
      } finally {
        setUpdating(false);
      }
    },
    [
      routeOrderId,
      order?.id,
      order?.order_code,
      order?.status,
      order?.total,
      order?.total_amount,
      order?.platform_fee,
      order?.discount_amount,
      order?.totals_for_business,
      isBothOption,
      isSelfSelected,
      isGrabSelected,
      deliveryOptionInitial,
      manualPrepMin,
      routeInfo,
      fulfillment,
      hydrateFromGrouped,
    ]
  );

  const next = nextFor(status);
  const primaryLabel =
    status === "PENDING"
      ? "Accept"
      : next
      ? STATUS_META[next]?.label || "Next"
      : null;

  const onPrimaryAction = useCallback(() => {
    if (!next || updating) return;
    doUpdate(next);
  }, [next, updating, doUpdate]);

  const onDecline = useCallback(() => setDeclineOpen(true), []);
  const canDecline = useMemo(
    () => String(declineReason).trim().length >= 3,
    [declineReason]
  );
  const confirmDecline = useCallback(() => {
    const r = String(declineReason).trim();
    if (r.length < 3) {
      Alert.alert("Reason required", "Please type a brief reason (min 3 characters).");
      return;
    }
    setDeclineOpen(false);
    doUpdate("DECLINED", { reason: r });
    setDeclineReason("");
  }, [declineReason, doUpdate]);

  const etaText = useMemo(() => {
    if (routeLoading) return "Distance & ETA: calculating…";

    const prepVal = Number(manualPrepMin);
    const hasPrep = Number.isFinite(prepVal) && prepVal > 0;
    const distanceKm = routeInfo?.distanceKm;
    const deliveryVal = routeInfo?.etaMin;
    const hasDelivery = deliveryVal != null && Number.isFinite(deliveryVal);

    const parts = [];

    if (hasDelivery && distanceKm != null) {
      parts.push(`Distance: ${distanceKm.toFixed(1)} km`);
      parts.push(`Delivery time ~${Math.round(deliveryVal)} min`);
    } else if (hasDelivery) {
      parts.push(`Delivery time ~${Math.round(deliveryVal)} min`);
    } else if (routeError) {
      parts.push("Distance & ETA not available");
    } else {
      parts.push("Distance & ETA: —");
    }

    if (hasPrep) {
      const total = prepVal + (hasDelivery ? deliveryVal : 0);
      parts.push(`Total time ~${Math.round(total)} min`);
    }

    return parts.join("\n");
  }, [routeLoading, routeInfo, routeError, manualPrepMin]);

  const etaShortText = useMemo(() => {
    const rawEta = order?.eta_minutes ?? order?.estimated_arrivial_time ?? null;

    const etaFromOrder = (() => {
      if (rawEta == null) return null;
      const n = Number(rawEta);
      if (Number.isFinite(n) && n > 0) return Math.round(n);
      const s = String(rawEta).trim();
      if (!s) return null;
      if (/min/i.test(s)) return s;
      return null;
    })();

    if (typeof etaFromOrder === "string") return `ETA ${etaFromOrder}`;
    if (typeof etaFromOrder === "number") return `ETA ~${etaFromOrder} min`;

    const prepVal = Number(manualPrepMin);
    const hasPrep = Number.isFinite(prepVal) && prepVal > 0;
    const deliveryVal = routeInfo?.etaMin ?? null;
    const hasDelivery = deliveryVal != null && Number.isFinite(deliveryVal);

    const total = (hasPrep ? prepVal : 0) + (hasDelivery ? deliveryVal : 0);

    if (total > 0) return `ETA ~${Math.round(total)} min`;
    if (hasDelivery) return `ETA ~${Math.round(deliveryVal)} min`;

    return "ETA not available";
  }, [order?.eta_minutes, order?.estimated_arrivial_time, manualPrepMin, routeInfo]);

  /* ---------- Driver rating fetch ---------- */
  const fetchDriverRating = useCallback(async (driverId) => {
    try {
      let base = (ENV_DRIVER_RATING || "").trim();
      if (!base) return;

      let finalUrl = base;
      if (base.includes("{driver_id}")) {
        finalUrl = base.replace("{driver_id}", encodeURIComponent(String(driverId)));
      } else {
        const sep = base.includes("?") ? "&" : "?";
        finalUrl = `${base}${sep}driver_id=${encodeURIComponent(String(driverId))}`;
      }

      const res = await fetch(finalUrl, {
        method: "GET",
        headers: { Accept: "application/json" },
      });

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
      } else if (d && typeof d === "object") {
        avg = d.avg_rating ?? d.average_rating ?? d.rating ?? null;
        count = d.total_ratings ?? d.count ?? d.rating_count ?? null;
      }

      setDriverRating({ average: avg, count });
    } catch (err) {
      console.log("[OrderDetails] Failed to fetch driver rating:", err?.message || err);
    }
  }, []);

  /* ---------- Driver details fetch ---------- */
  const fetchDriverDetails = useCallback(
    async (driverId) => {
      try {
        let base = (ENV_DRIVER_DETAILS || "").trim();
        if (!base) return;

        let finalUrl = base;
        if (base.includes("{driverId}")) {
          finalUrl = base.replace("{driverId}", encodeURIComponent(String(driverId)));
        } else {
          const sep = base.includes("?") ? "&" : "?";
          finalUrl = `${base}${sep}driverId=${encodeURIComponent(String(driverId))}`;
        }

        const res = await fetch(finalUrl, {
          method: "GET",
          headers: { Accept: "application/json" },
        });

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
        console.log("[OrderDetails] Failed to fetch driver details:", err?.message || err);
      }
    },
    [fetchDriverRating]
  );

  /* ---------- Grab broadcast-delivery + socket deliveryAccepted ---------- */
  const [sendingGrab, setSendingGrab] = useState(false);

  const searchingGrabRef = useRef(false);
  const retryPromptTimeoutRef = useRef(null);
  const retryCountdownIntervalRef = useRef(null);
  const [retryInSec, setRetryInSec] = useState(0);

  const driverAcceptedRef = useRef(false);

  const stopGrabLoop = useCallback(() => {
    searchingGrabRef.current = false;
    driverAcceptedRef.current = false;
    setRetryInSec(0);

    if (retryPromptTimeoutRef.current) {
      clearTimeout(retryPromptTimeoutRef.current);
      retryPromptTimeoutRef.current = null;
    }
    if (retryCountdownIntervalRef.current) {
      clearInterval(retryCountdownIntervalRef.current);
      retryCountdownIntervalRef.current = null;
    }
  }, []);

  const scheduleRetryAsk = useCallback((sendGrabDeliveryRequestFn) => {
    if (retryPromptTimeoutRef.current) {
      clearTimeout(retryPromptTimeoutRef.current);
      retryPromptTimeoutRef.current = null;
    }
    if (retryCountdownIntervalRef.current) {
      clearInterval(retryCountdownIntervalRef.current);
      retryCountdownIntervalRef.current = null;
    }

    setRetryInSec(60);
    retryCountdownIntervalRef.current = setInterval(() => {
      setRetryInSec((prev) => {
        const nextVal = (Number.isFinite(prev) ? prev : 0) - 1;
        if (nextVal <= 0) {
          if (retryCountdownIntervalRef.current) {
            clearInterval(retryCountdownIntervalRef.current);
            retryCountdownIntervalRef.current = null;
          }
          return 0;
        }
        return nextVal;
      });
    }, 1000);

    retryPromptTimeoutRef.current = setTimeout(() => {
      retryPromptTimeoutRef.current = null;

      if (!searchingGrabRef.current) return;
      if (driverAcceptedRef.current) return;

      Alert.alert("No driver yet", "Do you want to send the delivery request again?", [
        {
          text: "Not now",
          style: "cancel",
          onPress: () =>
            setRideMessage("Waiting for a driver… (you can send again anytime)"),
        },
        {
          text: "Send again",
          onPress: async () => {
            if (!searchingGrabRef.current || driverAcceptedRef.current) return;
            await sendGrabDeliveryRequestFn();
            scheduleRetryAsk(sendGrabDeliveryRequestFn);
          },
        },
      ]);
    }, 60000);
  }, []);

  const getOrderForFare = useCallback(async () => {
    const hasFeeNow =
      order?.delivery_fee != null || order?.merchant_delivery_fee != null;
    if (hasFeeNow) return order;

    try {
      const baseRaw = (ordersGroupedUrl || ENV_ORDER_ENDPOINT || "").trim();
      if (!baseRaw) return order;

      let bizId = businessId || paramBusinessId;

      if (!bizId && baseRaw.includes("{businessId}")) {
        try {
          const saved = await SecureStore.getItemAsync("merchant_login");
          if (saved) {
            const j = JSON.parse(saved);
            bizId =
              j?.business_id ||
              j?.user?.business_id ||
              j?.user?.businessId ||
              j?.id ||
              j?.user?.id ||
              null;
          }
        } catch {}
      }

      let groupedUrlFinal = baseRaw;
      if (bizId)
        groupedUrlFinal = groupedUrlFinal.replace(
          /\{businessId\}/gi,
          encodeURIComponent(String(bizId))
        );

      const token = await SecureStore.getItemAsync("auth_token");
      const res = await fetch(groupedUrlFinal, {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const text = await res.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {}

      if (!res.ok) throw new Error(json?.message || json?.error || `HTTP ${res.status}`);

      const groups = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];

      let allOrders = [];
      for (const g of groups) {
        if (Array.isArray(g?.orders)) {
          for (const o of g.orders) allOrders.push(o);
        } else if (g && (g.id || g.order_id || g.order_code)) {
          allOrders.push(g);
        }
      }

      const key = order?.order_code ?? order?.order_id ?? routeOrderId ?? order?.id;

      const match = allOrders.find((o) =>
        sameOrder(o?.id ?? o?.order_id ?? o?.order_code, key)
      );
      if (!match) return order;

      const patch = {
        delivery_fee: match?.delivery_fee ?? match?.deliveryFee ?? order?.delivery_fee ?? null,
        merchant_delivery_fee:
          match?.merchant_delivery_fee ??
          match?.merchantDeliveryFee ??
          order?.merchant_delivery_fee ??
          null,
        platform_fee: match?.platform_fee ?? order?.platform_fee ?? 0,
        discount_amount: match?.discount_amount ?? order?.discount_amount ?? 0,
        totals_for_business: match?.totals_for_business ?? order?.totals_for_business ?? null,
        total_amount: match?.total_amount ?? match?.total ?? order?.total_amount ?? order?.total ?? 0,
        delivery_address: normalizeDeliveryAddress(
          match?.delivery_address ?? match?.address ?? match?.deliver_to ?? order?.delivery_address
        ),
      };

      const merged = { ...order, ...patch };
      setOrder((prev) => ({ ...prev, ...patch }));
      return merged;
    } catch (e) {
      console.log("[OrderDetails] getOrderForFare error:", e?.message || e);
      return order;
    }
  }, [order, ordersGroupedUrl, businessId, paramBusinessId, routeOrderId]);

  const sendGrabDeliveryRequest = useCallback(async () => {
    try {
      if (!ENV_SEND_REQUEST_DRIVER) {
        Alert.alert(
          "Grab delivery not configured",
          "SEND_REQUEST_DRIVER_ENDPOINT is missing in environment variables."
        );
        return;
      }

      setSendingGrab(true);
      setRideMessage("Searching for nearby drivers…");

      const ordForFare = await getOrderForFare();

      const pickupLat = businessCoords?.lat ?? 27.4775205;
      const pickupLng = businessCoords?.lng ?? 89.6387601;

      const dropLat = Number.isFinite(refCoords.lat) ? refCoords.lat : 27.47395;
      const dropLng = Number.isFinite(refCoords.lng) ? refCoords.lng : 89.64321;

      const distanceM =
        routeInfo?.distanceKm != null && Number.isFinite(routeInfo.distanceKm)
          ? Math.round(routeInfo.distanceKm * 1000)
          : 2200;

      const durationS =
        routeInfo?.etaMin != null && Number.isFinite(routeInfo.etaMin)
          ? Math.round(routeInfo.etaMin * 60)
          : 480;

      const deliveryFeeRaw =
        ordForFare?.delivery_fee != null ? Number(ordForFare.delivery_fee) : null;
      const merchantDeliveryFeeRaw =
        ordForFare?.merchant_delivery_fee != null
          ? Number(ordForFare.merchant_delivery_fee)
          : null;

      let baseFare = 0;
      if (deliveryFeeRaw != null && Number.isFinite(deliveryFeeRaw) && deliveryFeeRaw > 0) {
        baseFare = deliveryFeeRaw;
      } else if (
        merchantDeliveryFeeRaw != null &&
        Number.isFinite(merchantDeliveryFeeRaw) &&
        merchantDeliveryFeeRaw > 0
      ) {
        baseFare = merchantDeliveryFeeRaw;
      }

      const fare = baseFare;
      const fareCents = Math.round(baseFare * 100);

      let passengerId = ordForFare?.user_id ?? ordForFare?.customer_id ?? null;
      try {
        const saved = await SecureStore.getItemAsync("merchant_login");
        if (saved) {
          const j = JSON.parse(saved);
          passengerId = j?.user_id ?? j?.id ?? j?.user?.id ?? passengerId;
        }
      } catch (err) {
        console.log("[OrderDetails] Failed to read merchant_login for wallet user:", err);
      }
      if (!passengerId) passengerId = 0;

      const payload = {
        passenger_id: Number(passengerId),
        merchant_id: businessId ? Number(businessId) : undefined,
        cityId: refCoords.cityId || "thimphu",
        service_code: "D",
        serviceType: "delivery_bike",
        pickup: [pickupLat, pickupLng],
        dropoff: [dropLat, dropLng],
        pickup_place: ordForFare?.business_name ?? ordForFare?.store_name,
        dropoff_place: ordForFare?.delivery_address?.address ?? "",
        distance_m: distanceM,
        duration_s: durationS,
        base_fare: baseFare,
        fare,
        fare_cents: fareCents,
        currency: "BTN",
        payment_method: { type: "WALLET" },
        offer_code: null,
        waypoints: [],
        owner_type: ownerType || undefined,
      };

      const res = await fetch(ENV_SEND_REQUEST_DRIVER, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
    } catch (e) {
      console.log("[OrderDetails] sendGrabDeliveryRequest ERROR:", e?.message || e);
      Alert.alert("Grab delivery failed", String(e?.message || e));
    } finally {
      setSendingGrab(false);
    }
  }, [businessCoords, refCoords, routeInfo, businessId, ownerType, getOrderForFare]);

  const startGrabLoop = useCallback(async () => {
    driverAcceptedRef.current = false;
    setDriverAccepted(false);
    searchingGrabRef.current = true;

    setRideMessage("Searching for nearby drivers…");
    await sendGrabDeliveryRequest();

    scheduleRetryAsk(sendGrabDeliveryRequest);
  }, [sendGrabDeliveryRequest, scheduleRetryAsk]);

  useEffect(() => {
    if (status !== "READY" || isTerminalNegative || isTerminalSuccess) stopGrabLoop();
  }, [status, isTerminalNegative, isTerminalSuccess, stopGrabLoop]);

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
    if (phone) parts.push(`+975${String(phone).replace(/^\+?975/, "")}`);
    if (ratingPart) parts.push(ratingPart);

    return parts.join(" · ");
  }, [driverDetails, driverRating]);

  useEffect(() => {
    if (!ENV_RIDE_SOCKET) return;

    let socket;
    let acceptedHandler;
    let arrivedHandler;

    (async () => {
      let merchantId = businessId || paramBusinessId;

      if (!merchantId) {
        try {
          const saved = await SecureStore.getItemAsync("merchant_login");
          if (saved) {
            const j = JSON.parse(saved);
            merchantId =
              j?.business_id ||
              j?.user?.business_id ||
              j?.user?.businessId ||
              j?.id ||
              j?.user?.id ||
              null;
          }
        } catch (err) {
          console.log("[OrderDetails] Failed to read merchant_login from SecureStore:", err);
        }
      }

      if (!merchantId) {
        console.log("[OrderDetails] No merchantId found, NOT connecting ride socket");
        return;
      }

      socket = io(ENV_RIDE_SOCKET, {
        transports: ["websocket"],
        query: { merchantId: String(merchantId), role: "merchant" },
      });
      socketRef.current = socket;

      acceptedHandler = (payload) => {
        try {
          const thisOrderCode = normalizeOrderCode(order?.order_code || order?.id || routeOrderId);
          const payloadOrder = payload?.order_code || payload?.orderId || payload?.order_id;
          if (payloadOrder && thisOrderCode && !sameOrder(payloadOrder, thisOrderCode)) return;
        } catch {}

        driverAcceptedRef.current = true;
        setDriverAccepted(true);
        stopGrabLoop();

        const driverId =
          payload?.driver_id ?? payload?.driverId ?? payload?.driver?.id ?? payload?.driver?.driver_id ?? null;
        if (driverId != null) fetchDriverDetails(driverId);

        setRideMessage("Driver has accepted the delivery request (first come first basis).");
        Alert.alert("Driver accepted", "Driver has accepted the delivery request (first come first basis).");
      };

      arrivedHandler = (payload) => {
        try {
          const thisOrderCode = normalizeOrderCode(order?.order_code || order?.id || routeOrderId);
          const payloadOrder = payload?.order_code || payload?.orderId || payload?.order_id;
          if (payloadOrder && thisOrderCode && !sameOrder(payloadOrder, thisOrderCode)) return;
        } catch {}

        setDriverArrived(true);

        const msg =
          payload?.message || payload?.status_message || "Driver has arrived at customer location.";
        setRideMessage(msg);
        Alert.alert("Driver arrived", msg);

        const driverId =
          payload?.driver_id ?? payload?.driverId ?? payload?.driver?.id ?? payload?.driver?.driver_id ?? null;
        if (driverId != null && !driverDetails) fetchDriverDetails(driverId);
      };

      socket.on("deliveryAccepted", acceptedHandler);
      socket.on("delivery:driver_arrived", arrivedHandler);
    })();

    return () => {
      if (socket) {
        if (acceptedHandler) socket.off("deliveryAccepted", acceptedHandler);
        if (arrivedHandler) socket.off("delivery:driver_arrived", arrivedHandler);
        socket.disconnect();
      }
      stopGrabLoop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    order?.order_code,
    order?.id,
    routeOrderId,
    businessId,
    paramBusinessId,
    stopGrabLoop,
    fetchDriverDetails,
    driverDetails,
  ]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("order-updated", ({ id, patch }) => {
      if (String(id) !== String(order?.id || routeOrderId)) return;
      const nextPatch = patch || {};
      if (nextPatch.status) nextPatch.status = normalizeStatus(nextPatch.status);
      setOrder((prev) => ({ ...prev, ...nextPatch }));
    });
    return () => sub?.remove?.();
  }, [routeOrderId, order?.id]);

  /* ---------------- Items ---------------- */
  const items = useMemo(() => {
    const raw = Array.isArray(order?.raw_items) ? order.raw_items : [];
    return raw.map((it, idx) => ({
      ...it,
      _key: String(it.item_id || it.id || it.itemId || idx),
    }));
  }, [order?.raw_items]);

  const { effectiveTotalLabel, effectiveItemsCount } = useMemo(() => {
    const sumQtyFromItems = () =>
      items.reduce((sum, it) => {
        const qty = Number(it.qty ?? it.quantity ?? it.quantity_ordered ?? it.order_qty ?? 1);
        return sum + (Number.isFinite(qty) ? qty : 0);
      }, 0);

    if (ifUnavailableMode !== "REMOVE" && ifUnavailableMode !== "REPLACE") {
      const rawTotal = Number(order?.total ?? order?.total_amount ?? 0);
      return { effectiveTotalLabel: money(rawTotal), effectiveItemsCount: sumQtyFromItems() };
    }

    let total = 0;
    let count = 0;

    items.forEach((it) => {
      const key = it._key;
      const isRemoved = !!itemUnavailableMap[key];
      const replacement = itemReplacementMap[key];

      const qty = Number(it.qty ?? it.quantity ?? it.quantity_ordered ?? it.order_qty ?? 1);
      if (!Number.isFinite(qty) || qty <= 0) return;

      if (ifUnavailableMode === "REMOVE" && isRemoved) return;

      const unitPriceOriginal = Number(
        it.price ?? it.unit_price ?? it.item_price ?? it.rate ?? it.selling_price ?? 0
      );

      const unitPriceReplacement =
        replacement && replacement.price != null ? Number(replacement.price) : NaN;

      let unitPriceToUse = unitPriceOriginal;

      if (
        ifUnavailableMode === "REPLACE" &&
        replacement &&
        Number.isFinite(unitPriceReplacement) &&
        unitPriceReplacement >= 0
      ) {
        unitPriceToUse = unitPriceReplacement;
      }

      if (!Number.isFinite(unitPriceToUse)) return;

      total += qty * unitPriceToUse;
      count += qty;
    });

    return { effectiveTotalLabel: money(total), effectiveItemsCount: count };
  }, [items, itemUnavailableMap, itemReplacementMap, ifUnavailableMode, order?.total, order?.total_amount]);

  const handleToggleUnavailable = useCallback(
    (key) => {
      if (normalizeStatus(status) !== "PENDING") return;
      setItemUnavailableMap((prev) => ({ ...prev, [key]: !prev[key] }));
    },
    [status]
  );

  const handleOpenSimilarCatalog = useCallback(
    (item) => {
      if (ifUnavailableMode !== "REPLACE") return;
      if (!item || !item._key) return;

      const bizId =
        businessId ||
        paramBusinessId ||
        order?.business_id ||
        order?.merchant_id ||
        order?.store_id ||
        null;

      navigation.navigate("SimilarItemCatalog", {
        itemKey: item._key,
        itemName: item.item_name || item.name || item.title || "",
        businessId: bizId,
        owner_type: ownerType,
      });
    },
    [ifUnavailableMode, navigation, businessId, paramBusinessId, order, ownerType]
  );

  /* ===========================
     ✅ Deliver in group navigation (FULL UI from OrderDetails)
   =========================== */
  const goToCluster = useCallback(async () => {
    const focusOrderId = normalizeOrderCode(order?.order_code || order?.id || routeOrderId);

    const fallbackParams = {
      businessId: businessId ?? paramBusinessId ?? order?.business_id ?? order?.merchant_id ?? null,
      ownerType: ownerType ?? null,
      ordersGroupedUrl: ordersGroupedUrl ?? ENV_ORDER_ENDPOINT ?? null,
      delivery_option: params.delivery_option ?? params.deliveryOption ?? order?.delivery_option ?? null,
      focusOrderId,
    };

    const targetRoute = resolvedClusterRouteName;

    if (!targetRoute) {
      Alert.alert(
        "Route not registered",
        "FoodNearbyClusterOrdersScreen is not in this navigator chain. Add it to your Stack.Screen route names."
      );
      return;
    }

    // 1) If we already have cluster orders, forward (fast path)
    if (clusterCtx?.orders && Array.isArray(clusterCtx.orders) && clusterCtx.orders.length) {
      const payload = {
        ...clusterCtx,
        businessId: clusterCtx.businessId ?? fallbackParams.businessId,
        ownerType: clusterCtx.ownerType ?? fallbackParams.ownerType,
        ordersGroupedUrl: clusterCtx.ordersGroupedUrl ?? fallbackParams.ordersGroupedUrl,
        delivery_option: clusterCtx.delivery_option ?? fallbackParams.delivery_option,
        focusOrderId,

        // ✅ ensure UI can show like NearbyOrdersScreen
        label: clusterCtx.label || clusterCtx.addrPreview || "Nearby cluster",
        addrPreview: clusterCtx.addrPreview || clusterCtx.label || "",
        centerCoords: clusterCtx.centerCoords || null,
        thresholdKm: clusterCtx.thresholdKm || 5,

        screenName: undefined,
      };

      const ownerNav = findNavigatorOwningRoute(navigation, targetRoute);
      if (ownerNav && ownerNav !== navigation) {
        ownerNav.dispatch(CommonActions.navigate({ name: targetRoute, params: payload }));
        return;
      }
      navigation.dispatch(CommonActions.navigate({ name: targetRoute, params: payload }));
      return;
    }

    // 2) Otherwise: fetch grouped orders, build clusters by lat/lng, open the cluster that contains this order
    try {
      const baseRaw = (ordersGroupedUrl || ENV_ORDER_ENDPOINT || "").trim();
      if (!baseRaw) throw new Error("Grouped orders endpoint missing");

      let bizId = businessId || paramBusinessId;

      if (!bizId && baseRaw.includes("{businessId}")) {
        const saved = await SecureStore.getItemAsync("merchant_login");
        if (saved) {
          try {
            const j = JSON.parse(saved);
            bizId =
              j?.business_id ||
              j?.user?.business_id ||
              j?.user?.businessId ||
              j?.id ||
              j?.user?.id ||
              null;
            if (bizId && !businessId) setBusinessId(bizId);
          } catch {}
        }
      }

      let groupedUrlFinal = baseRaw;
      if (bizId) {
        groupedUrlFinal = groupedUrlFinal.replace(/\{businessId\}/gi, encodeURIComponent(String(bizId)));
      }

      const token = await SecureStore.getItemAsync("auth_token");
      const res = await fetch(groupedUrlFinal, {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const text = await res.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {}

      if (!res.ok) throw new Error(json?.message || json?.error || `HTTP ${res.status}`);

      const groups = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];

      // flatten (same style you use in hydrateFromGrouped)
      let allOrders = [];
      for (const g of groups) {
        if (Array.isArray(g?.orders)) {
          const user = g.user || g.customer || g.user_details || {};
          const userName =
            g.customer_name ?? g.name ?? user.name ?? user.user_name ?? user.full_name ?? "";
          const userPhone = g.phone ?? user.phone ?? user.phone_number ?? user.mobile ?? "";

          for (const o of g.orders) {
            allOrders.push({
              ...o,
              user: o.user || user,
              customer_name: o.customer_name ?? userName,
              customer_phone: o.customer_phone ?? userPhone,
              user_name: o.user_name ?? userName,
              status: normalizeStatus(o?.status),
            });
          }
        } else if (g && (g.id || g.order_id || g.order_code)) {
          allOrders.push({ ...g, status: normalizeStatus(g?.status) });
        }
      }

      const thresholdKm = 5;
      const clusters = buildClustersFromOrders(allOrders, thresholdKm);

      // pick cluster containing this order
      let chosen = clusters[0] || null;
      for (const c of clusters) {
        const found = (c.orders || []).some((o) => {
          const oid = o?.id ?? o?.order_id ?? o?.order_code;
          return sameOrder(oid, focusOrderId);
        });
        if (found) {
          chosen = c;
          break;
        }
      }

      const payload = {
        label: chosen?.label || "Nearby cluster",
        addrPreview: chosen?.addrPreview || "",
        orders: chosen?.orders || allOrders,
        thresholdKm: chosen?.thresholdKm || thresholdKm,
        centerCoords: chosen?.centerCoords || null,

        businessId: bizId ?? fallbackParams.businessId,
        ownerType: ownerType ?? fallbackParams.ownerType,
        delivery_option: fallbackParams.delivery_option,
        ordersGroupedUrl: groupedUrlFinal || fallbackParams.ordersGroupedUrl,

        focusOrderId,
        detailsRoute: "OrderDetails",
        nextTrackScreen: "TrackBatchOrdersScreen",

        // keep context when opening details from cluster
        clusterParams: {
          screenName: targetRoute,
          label: chosen?.label || "Nearby cluster",
          addrPreview: chosen?.addrPreview || "",
          orders: chosen?.orders || allOrders,
          thresholdKm: chosen?.thresholdKm || thresholdKm,
          centerCoords: chosen?.centerCoords || null,
          businessId: bizId ?? fallbackParams.businessId,
          ownerType: ownerType ?? fallbackParams.ownerType,
          delivery_option: fallbackParams.delivery_option,
          ordersGroupedUrl: groupedUrlFinal || fallbackParams.ordersGroupedUrl,
          detailsRoute: "OrderDetails",
          nextTrackScreen: "TrackBatchOrdersScreen",
        },
      };

      const ownerNav = findNavigatorOwningRoute(navigation, targetRoute);
      if (ownerNav && ownerNav !== navigation) {
        ownerNav.dispatch(CommonActions.navigate({ name: targetRoute, params: payload }));
        return;
      }
      navigation.dispatch(CommonActions.navigate({ name: targetRoute, params: payload }));
    } catch (e) {
      // final fallback: still open screen (it may show 0 if Nearby screen cannot fetch itself)
      const payload = {
        ...fallbackParams,
        label: "Nearby cluster",
        addrPreview: "",
        orders: [],
        thresholdKm: 5,
        centerCoords: null,
        nextTrackScreen: "TrackBatchOrdersScreen",
      };

      const ownerNav = findNavigatorOwningRoute(navigation, targetRoute);
      if (ownerNav && ownerNav !== navigation) {
        ownerNav.dispatch(CommonActions.navigate({ name: targetRoute, params: payload }));
        return;
      }
      navigation.dispatch(CommonActions.navigate({ name: targetRoute, params: payload }));
    }
  }, [
    navigation,
    resolvedClusterRouteName,
    clusterCtx,
    order?.order_code,
    order?.id,
    routeOrderId,
    businessId,
    paramBusinessId,
    order?.business_id,
    order?.merchant_id,
    ownerType,
    ordersGroupedUrl,
    params.delivery_option,
    params.deliveryOption,
    order?.delivery_option,
  ]);

  /* ---------------- UI helpers ---------------- */
  const headerTopPad = Math.max(insets.top, 8) + 18;
  const fulfillmentLower = (fulfillment || "").toLowerCase();

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right", "bottom"]}>
      {/* Header */}
      <View style={[styles.headerBar, { paddingTop: headerTopPad }]}>
        <Pressable onPress={goBackToOrders} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color="#0f172a" />
        </Pressable>
        <Text style={styles.headerTitle}>Order details</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        <View style={styles.card}>
          <View style={styles.idRow}>
            <Text style={styles.orderId}>#{order?.id || routeOrderId}</Text>
            <View>
              <ActivityIndicator animating={false} size="small" color="transparent" />
            </View>
          </View>

          <StatusRail
            status={status}
            statusSequence={STATUS_SEQUENCE}
            isTerminalNegative={isTerminalNegative}
            isTerminalSuccess={isTerminalSuccess}
            progressPct={progressPct}
            progressIndex={progressIndex}
          />

          <MetaSection
            order={order}
            status={status}
            fulfillment={fulfillment}
            fulfillmentLower={fulfillmentLower}
            deliveryOptionDisplay={deliveryOptionDisplay}
            ifUnavailableDisplay={ifUnavailableDisplay}
            estimatedArrivalDisplay={estimatedArrivalDisplay}
            etaText={etaText}
            etaShortText={etaShortText}
            manualPrepMin={manualPrepMin}
            setManualPrepMin={setManualPrepMin}
            restaurantNote={restaurantNote}
            driverDetails={driverDetails}
            driverRating={driverRating}
          />
        </View>

        {!isScheduledOrder && (
          <>
            <View style={{ marginTop: 8 }}>
              <DeliveryMethodChooser
                status={status}
                isBothOption={isBothOption}
                isTerminalNegative={isTerminalNegative}
                isTerminalSuccess={isTerminalSuccess}
                isSelfSelected={isSelfSelected}
                isGrabSelected={isGrabSelected}
                sendingGrab={sendingGrab}
                rideMessage={
                  retryInSec > 0 && rideMessage
                    ? `${rideMessage}\nRetry option in ${retryInSec}s`
                    : rideMessage
                }
                driverSummaryText={driverSummaryText}
                driverAccepted={driverAccepted}
                setDeliveryChoice={setDeliveryChoice}
                stopGrabLoop={stopGrabLoop}
                startGrabLoop={startGrabLoop}
                showDeliverInGroup={status === "READY"}
                onDeliverInGroup={goToCluster}
              />
            </View>

            {status === "READY" && driverArrived ? (
              <View style={[styles.block, { marginTop: 12 }]}>
                <Text style={[styles.segmentHint, { marginTop: 8, fontWeight: "700" }]}>
                  Driver arrived at customer location.
                </Text>
              </View>
            ) : null}

            {status === "READY" &&
              !isBothOption &&
              isPlatformDelivery &&
              (!!rideMessage || !!driverSummaryText) && (
                <View style={[styles.block, { marginTop: 12 }]}>
                  {rideMessage ? (
                    <Text style={[styles.segmentHint, { marginTop: 8 }]}>{rideMessage}</Text>
                  ) : null}
                  {driverSummaryText ? (
                    <Text style={[styles.segmentHint, { marginTop: 4, fontWeight: "600" }]}>
                      {driverSummaryText}
                    </Text>
                  ) : null}
                </View>
              )}

            <View style={{ marginTop: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "stretch", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <UpdateStatusActions
                    status={status}
                    isCancelledByCustomer={isCancelledByCustomer}
                    isTerminalNegative={isTerminalNegative}
                    isTerminalSuccess={isTerminalSuccess}
                    isBothOption={isBothOption}
                    isGrabSelected={isGrabSelected}
                    isPlatformDelivery={isPlatformDelivery}
                    updating={updating}
                    next={next}
                    primaryLabel={primaryLabel}
                    onPrimaryAction={onPrimaryAction}
                    doUpdate={doUpdate}
                    onDecline={onDecline}
                    driverAccepted={driverAccepted}
                  />
                </View>
              </View>
            </View>
          </>
        )}

        <ItemsBlock
          items={items}
          status={status}
          ifUnavailableMode={ifUnavailableMode}
          unavailableMap={itemUnavailableMap}
          replacementMap={itemReplacementMap}
          onToggleUnavailable={handleToggleUnavailable}
          onOpenSimilarCatalog={handleOpenSimilarCatalog}
        />

        <TotalsBlock itemsCount={effectiveItemsCount || 0} totalLabel={effectiveTotalLabel} />
      </ScrollView>

      <DeclineModal
        visible={declineOpen}
        declineReason={declineReason}
        setDeclineReason={setDeclineReason}
        canDecline={canDecline}
        onCancel={() => setDeclineOpen(false)}
        onConfirm={confirmDecline}
      />
    </SafeAreaView>
  );
}
