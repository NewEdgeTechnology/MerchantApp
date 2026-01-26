// screens/food/OrderDetails.js
// ✅ UPDATED: Accept (CONFIRMED) now supports REMOVE / REPLACE payloads exactly like you provided
//   - Sends: estimated_minutes, final_total_amount, final_platform_fee, final_discount_amount,
//           final_delivery_fee, final_merchant_delivery_fee, unavailable_changes { removed[], replaced[] }
// ✅ Keeps: status normalization, grouped hydrate protection, socket fast-status apply, deliver-in-group route fix, pull-to-refresh

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
  RefreshControl,
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

/* ---------------- debug helpers ---------------- */

const logJson = (label, obj) => {
  try {
    console.log(label, JSON.stringify(obj, null, 2));
  } catch (e) {
    console.log(label, obj);
  }
};

const logText = (label, txt) => {
  const s = txt == null ? "" : String(txt);
  console.log(label, s.length > 1200 ? `${s.slice(0, 1200)}... (truncated)` : s);
};

/* ===========================
   ✅ status normalizer
   =========================== */
const normalizeStatus = (v) => {
  const s = String(v || "").trim().toUpperCase();
  if (!s) return "PENDING";

  if (s === "ACCEPTED") return "CONFIRMED";
  if (s === "ACCEPT") return "CONFIRMED";
  if (s === "CONFIRM") return "CONFIRMED";
  if (s === "PREPARING") return "CONFIRMED";

  // ✅ driver updates
  if (s === "ON ROAD" || s === "ON_ROAD" || s === "ONROAD") return "OUT_FOR_DELIVERY";
  if (s === "OUT FOR DELIVERY" || s === "OUT_FOR_DELIVERY") return "OUT_FOR_DELIVERY";
  if (s === "DELIVERING") return "OUT_FOR_DELIVERY";

  // ✅ delivered variants
  if (s === "DELIVERED") return "COMPLETED";
  if (s === "DELIVERY_COMPLETE") return "COMPLETED";
  if (s === "DELIVERY COMPLETE") return "COMPLETED";
  if (s === "DELIVER_COMPLETE") return "COMPLETED";
  if (s === "DELIVER COMPLETE") return "COMPLETED";

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
  const orderIdKey = order?.id ?? order?.order_id ?? order?.order_code ?? routeOrderId;

  const direct =
    params.clusterParams || params.cluster_context || params.clusterContext || params.cluster || null;

  if (direct && typeof direct === "object") {
    return {
      screenName:
        direct.screenName || params.clusterScreenName || "FoodNearbyClusterOrdersScreen",
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
          params.orders) ??
        null,

      group: direct.group ?? params.group ?? params.clusterGroup ?? params.groupData ?? null,
    };
  }

  const maybeOrders = params.clusterOrders || params.ordersInCluster || params.orders || null;
  const maybeClusterId =
    params.cluster_id || params.clusterId || params.group_id || params.groupId || null;

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
   money parser (GLOBAL)
   =========================== */
const toMoneyNumber = (v) => {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;

  const s = String(v).trim();
  if (!s) return null;

  const cleaned = s.replace(/[^0-9.-]/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
};

/* ===========================
   ✅ NEW: stable item field getters for payloads
   =========================== */
const getItemMenuId = (it) =>
  it?.menu_id ??
  it?.menuId ??
  it?.item_id ??
  it?.itemId ??
  it?.id ??
  it?._id ??
  null;

const getItemName = (it) =>
  it?.item_name ?? it?.name ?? it?.title ?? it?.menu_name ?? it?.product_name ?? "";

const getItemImage = (it) =>
  it?.item_image ?? it?.image ?? it?.image_url ?? it?.photo ?? it?.thumbnail ?? null;

const getItemQty = (it) => {
  const q = Number(it?.qty ?? it?.quantity ?? it?.quantity_ordered ?? it?.order_qty ?? 1);
  return Number.isFinite(q) && q > 0 ? q : 1;
};

const getItemUnitPrice = (it) => {
  const p = Number(it?.price ?? it?.unit_price ?? it?.item_price ?? it?.rate ?? it?.selling_price ?? 0);
  return Number.isFinite(p) ? p : 0;
};

const sumItemsTotal = (itemsArr = []) => {
  return (itemsArr || []).reduce((sum, it) => {
    const qty = getItemQty(it);
    const price = getItemUnitPrice(it);
    return sum + qty * price;
  }, 0);
};

/* ===========================
   ✅ NEW: build unavailable_changes payloads (REMOVE / REPLACE)
   - REMOVE:
     unavailable_changes: { removed:[{business_id, menu_id, item_name}], replaced:[] }
   - REPLACE:
     unavailable_changes: { removed:[], replaced:[{old:{...}, new:{...}}] }
   =========================== */
const buildUnavailableChanges = ({
  mode,
  items,
  unavailableMap,
  replacementMap,
  businessId,
  businessName,
}) => {
  const bizIdNum = Number(businessId);
  const business_id = Number.isFinite(bizIdNum) ? bizIdNum : businessId;

  const removed = [];
  const replaced = [];

  const itemByKey = new Map((items || []).map((it) => [String(it?._key ?? getItemMenuId(it) ?? ""), it]));

  if (String(mode).toUpperCase() === "REMOVE") {
    for (const [k, v] of Object.entries(unavailableMap || {})) {
      if (!v) continue;
      const it = itemByKey.get(String(k)) || null;
      if (!it) continue;

      removed.push({
        business_id,
        menu_id: getItemMenuId(it),
        item_name: getItemName(it),
      });
    }
    return { removed, replaced: [] };
  }

  if (String(mode).toUpperCase() === "REPLACE") {
    for (const [k, repl] of Object.entries(replacementMap || {})) {
      if (!repl) continue;
      const it = itemByKey.get(String(k)) || null;
      if (!it) continue;

      const qty = getItemQty(it);

      const newMenuId = getItemMenuId(repl);
      const newName = getItemName(repl);
      const newPrice = toMoneyNumber(repl?.price) ?? getItemUnitPrice(repl);
      const newImage = getItemImage(repl);

      replaced.push({
        old: {
          business_id,
          menu_id: getItemMenuId(it),
          item_name: getItemName(it),
        },
        new: {
          business_id,
          business_name: businessName || "",
          menu_id: newMenuId,
          item_name: newName,
          item_image: newImage,
          quantity: qty,
          price: Number(newPrice) || 0,
          subtotal: (Number(newPrice) || 0) * qty,
        },
      });
    }
    return { removed: [], replaced };
  }

  return { removed: [], replaced: [] };
};

/* ===========================
   ✅ NEW: status extraction from any socket payload
   =========================== */
const extractStatusFromPayload = (payload) => {
  if (!payload) return null;

  const direct =
    payload.status ??
    payload.order_status ??
    payload.current_status ??
    payload.orderStatus ??
    payload.job_status ??
    null;

  if (direct) return direct;

  const containers = [
    payload.data,
    payload.payload,
    payload.message,
    payload.meta,
    payload.order,
    payload.location,
  ];
  for (const c of containers) {
    if (!c) continue;
    const v =
      c.status ?? c.order_status ?? c.current_status ?? c.orderStatus ?? c.job_status ?? null;
    if (v) return v;
  }

  return null;
};

/* ===========================
   ✅ NEW: order id extraction from socket payload (many shapes)
   =========================== */
const extractOrderIdFromPayload = (payload) => {
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

  const containers = [
    payload.data,
    payload.payload,
    payload.message,
    payload.meta,
    payload.location,
    payload.order,
  ];
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

  const deep = payload?.order?.id ?? payload?.data?.order?.id ?? null;
  if (deep != null) return String(deep);

  return null;
};

/* ===========================
   ✅ NEW: build clusters from orders using lat/lng
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
      if (typeof rawAddr.address === "string" && rawAddr.address.trim())
        return rawAddr.address.trim();
      if (typeof rawAddr.formatted === "string" && rawAddr.formatted.trim())
        return rawAddr.formatted.trim();
      if (typeof rawAddr.label === "string" && rawAddr.label.trim())
        return rawAddr.label.trim();
    }
    if (typeof o.address === "string" && o.address.trim()) return o.address.trim();
    if (typeof o.general_place === "string" && o.general_place.trim())
      return o.general_place.trim();
    if (typeof o.deliver_to?.address === "string" && o.deliver_to.address.trim())
      return o.deliver_to.address.trim();
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

  const deliveryOptionFromParamsRaw = params.delivery_option ?? params.deliveryOption ?? null;

  // ✅ ensure id + order_code always exist (important for grouped matching)
  const [order, setOrder] = useState(() => {
    const o = orderProp || {};
    const idRaw = o?.id ?? o?.order_id ?? o?.order_code ?? routeOrderId ?? null;
    const codeRaw = o?.order_code ?? o?.order_id ?? o?.id ?? routeOrderId ?? null;

    return {
      ...o,
      id: idRaw != null ? String(idRaw) : undefined,
      order_id: o?.order_id ?? (idRaw != null ? String(idRaw) : undefined),
      order_code: codeRaw != null ? normalizeOrderCode(codeRaw) : undefined,
      status: normalizeStatus(o?.status),
      delivery_address: normalizeDeliveryAddress(
        o?.delivery_address ?? o?.address ?? o?.deliver_to
      ),
    };
  });

  const [refreshing, setRefreshing] = useState(false);

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

  // ✅ fast status confirmation + polling refs
  const liveRefreshTimerRef = useRef(null);
  const socketHydrateTimerRef = useRef(null);
  const lastSocketAppliedStatusRef = useRef(null);

  const LIVE_REFRESH_MS = 4000;

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
      pickExistingRouteName(navigation, [preferred, ...CLUSTER_ROUTE_CANDIDATES]) || null
    );
  }, [navigation, clusterCtx?.screenName, params.clusterScreenName, CLUSTER_ROUTE_CANDIDATES]);

  useEffect(() => {
    setItemUnavailableMap({});
    setItemReplacementMap({});
    autoDeclinedRef.current = false;
    setDriverArrived(false);
    lastSocketAppliedStatusRef.current = null;

    if (socketHydrateTimerRef.current) {
      clearTimeout(socketHydrateTimerRef.current);
      socketHydrateTimerRef.current = null;
    }
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
        names.find((n) => /^(Orders|OrderTab|OrdersTab|MartOrders|FoodOrders)$/i.test(n)) ||
        names.find((n) => /Order/i.test(n));
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

  // ✅ reusable BUSINESS_DETAILS loader (used by initial load + refresh)
  const loadBusinessDetails = useCallback(async () => {
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

      const bd = await fetchBusinessDetails({ token, business_id: finalBizId });

      if (bd) {
        const opt = bd?.delivery_option ?? bd?.deliveryOption;
        const nOpt = opt ? String(opt).toUpperCase() : "UNKNOWN";
        setMerchantDeliveryOpt(nOpt);

        const latRaw =
          bd.latitude ?? bd.lat ?? bd.business_latitude ?? bd.business_lat ?? null;
        const lngRaw =
          bd.longitude ?? bd.lng ?? bd.business_longitude ?? bd.business_lng ?? null;

        const latNum = latRaw != null ? Number(latRaw) : NaN;
        const lngNum = lngRaw != null ? Number(lngRaw) : NaN;

        if (!Number.isNaN(latNum) && !Number.isNaN(lngNum)) {
          setBusinessCoords({ lat: latNum, lng: lngNum });
        }
      }
    } catch (e) {
      console.log("[OrderDetails] BUSINESS_DETAILS fetch error:", e?.message || e);
    }
  }, [businessId, paramBusinessId]);

  useEffect(() => {
    loadBusinessDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadBusinessDetails]);

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
    if (deliveryOptionFromParamsRaw) return String(deliveryOptionFromParamsRaw).toUpperCase();
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
    const cancelledBy = String(order?.cancelled_by || order?.canceled_by || "").toLowerCase();

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

  const shouldDriverControlAfterReady = useMemo(() => {
    if (isScheduledOrder) return false;
    if (isTerminalNegative || isTerminalSuccess) return false;
    if (status !== "READY") return false;

    // ✅ ONLY after a driver accepts
    if (!driverAccepted) return false;

    return isPlatformDelivery || (isBothOption && isGrabSelected);
  }, [
    isScheduledOrder,
    isTerminalNegative,
    isTerminalSuccess,
    status,
    driverAccepted,
    isPlatformDelivery,
    isBothOption,
    isGrabSelected,
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
      if (shouldDriverControlAfterReady) return null;
      if (s === "READY" && shouldBlockAtReady) return null;

      const idx = STATUS_SEQUENCE.indexOf(s);
      if (idx === -1) return "CONFIRMED";
      return STATUS_SEQUENCE[idx + 1] || null;
    },
    [STATUS_SEQUENCE, shouldBlockAtReady, isPickupFulfillment, shouldDriverControlAfterReady]
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
      if (!res.ok) throw new Error(json?.message || json?.error || `HTTP ${res.status}`);

      const groups = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];

      let allOrders = [];
      for (const g of groups) {
        if (Array.isArray(g?.orders)) {
          const user = g.user || g.customer || g.user_details || {};
          const userName =
            g.customer_name ?? g.name ?? user.name ?? user.user_name ?? user.full_name ?? "";
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

      const finalStatus = isHigherOrEqualStatus(localStatus, matchStatus)
        ? localStatus
        : matchStatus;

      const normalizedFromMatch = {
        ...match,
        id: String(match?.id ?? match?.order_id ?? match?.order_code ?? routeOrderId),
        order_id: String(match?.order_id ?? match?.id ?? match?.order_code ?? routeOrderId),
        order_code: normalizeOrderCode(match?.order_code ?? match?.id ?? routeOrderId),
        customer_name:
          match?.customer_name ??
          match?.user_name ??
          match?.user?.user_name ??
          match?.user?.name ??
          "",
        customer_phone: match?.customer_phone ?? match?.phone ?? match?.user?.phone ?? "",
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
          match?.delivery_option ?? match?.delivery_by ?? order?.delivery_option ?? "",
        status_timestamps: match?.status_timestamps ?? order?.status_timestamps ?? {},
        if_unavailable: match?.if_unavailable ?? order?.if_unavailable ?? "",
        estimated_arrivial_time:
          match?.estimated_arrivial_time ?? match?.eta_minutes ?? order?.estimated_arrivial_time ?? null,
        delivery_fee: match?.delivery_fee ?? match?.deliveryFee ?? order?.delivery_fee ?? null,
        merchant_delivery_fee:
          match?.merchant_delivery_fee ??
          match?.merchantDeliveryFee ??
          order?.merchant_delivery_fee ??
          null,
        platform_fee: match?.platform_fee ?? order?.platform_fee ?? 0,
        discount_amount: match?.discount_amount ?? order?.discount_amount ?? 0,
        totals_for_business: match?.totals_for_business ?? order?.totals_for_business ?? null,
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
  }, [ordersGroupedUrl, routeOrderId, order?.status, businessId, paramBusinessId, isScheduledOrder]);

  useFocusEffect(
    useCallback(() => {
      hydrateFromGrouped();
    }, [hydrateFromGrouped])
  );

  // ✅ debounce grouped hydrate for socket bursts
  const debounceHydrateFromGrouped = useCallback(() => {
    if (socketHydrateTimerRef.current) clearTimeout(socketHydrateTimerRef.current);
    socketHydrateTimerRef.current = setTimeout(() => {
      socketHydrateTimerRef.current = null;
      hydrateFromGrouped();
    }, 350);
  }, [hydrateFromGrouped]);

  // ✅ LIVE AUTO-REFRESH while screen focused (catches missed socket events)
  useFocusEffect(
    useCallback(() => {
      if (liveRefreshTimerRef.current) clearInterval(liveRefreshTimerRef.current);

      if (!isScheduledOrder && !isTerminalNegative && !isTerminalSuccess) {
        hydrateFromGrouped();
      }

      liveRefreshTimerRef.current = setInterval(() => {
        if (isScheduledOrder) return;
        if (isTerminalNegative || isTerminalSuccess) return;
        hydrateFromGrouped();
      }, LIVE_REFRESH_MS);

      return () => {
        if (liveRefreshTimerRef.current) {
          clearInterval(liveRefreshTimerRef.current);
          liveRefreshTimerRef.current = null;
        }
      };
    }, [hydrateFromGrouped, isScheduledOrder, isTerminalNegative, isTerminalSuccess])
  );

  /* ---------- Pull-to-refresh ---------- */
  const onRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([loadBusinessDetails(), hydrateFromGrouped()]);
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, loadBusinessDetails, hydrateFromGrouped]);

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

    return { lat: Number(lat), lng: Number(lng), cityId: String(cityId || "thimphu").toLowerCase() };
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
    const sub = DeviceEventEmitter.addListener("similar-item-chosen", ({ itemKey, replacement }) => {
      if (!itemKey || !replacement) return;
      setItemReplacementMap((prev) => ({ ...prev, [String(itemKey)]: replacement }));
    });
    return () => sub?.remove?.();
  }, []);

  const DEFAULT_REASON = {
    CONFIRMED: "Order accepted by merchant",
    READY: "Order is ready",
    OUT_FOR_DELIVERY: "Order handed over for delivery",
    COMPLETED: "Order delivered",
  };

  /* ===========================
     ✅ FAST apply status from socket into UI + confirm via grouped
     =========================== */
  const applySocketStatusToUi = useCallback(
    (incomingStatusRaw, extraPatch = {}) => {
      const norm = normalizeStatus(incomingStatusRaw);
      if (!norm) return;

      // prevent repeated spam of same status
      if (lastSocketAppliedStatusRef.current === norm) {
        if (extraPatch && Object.keys(extraPatch).length) {
          setOrder((prev) => ({ ...prev, ...extraPatch }));
        }
        return;
      }

      const current = normalizeStatus(order?.status || "PENDING");
      const willAdvance = !isHigherOrEqualStatus(current, norm);

      setOrder((prev) => {
        const prevStatus = normalizeStatus(prev?.status || "PENDING");

        // never downgrade
        if (isHigherOrEqualStatus(prevStatus, norm)) {
          return { ...prev, ...extraPatch };
        }

        const patch = { ...extraPatch, status: norm };
        const next = { ...prev, ...patch };

        DeviceEventEmitter.emit("order-updated", {
          id: String(next?.id || routeOrderId),
          patch: { ...patch, status: norm },
        });

        return next;
      });

      lastSocketAppliedStatusRef.current = norm;

      // confirm quickly from grouped API
      if (willAdvance) debounceHydrateFromGrouped();
    },
    [routeOrderId, order?.status, debounceHydrateFromGrouped]
  );

  /* ---------------- Items ---------------- */
  const items = useMemo(() => {
    const raw = Array.isArray(order?.raw_items) ? order.raw_items : [];
    return raw.map((it, idx) => ({
      ...it,
      _key: String(it.item_id || it.menu_id || it.id || it.itemId || it.menuId || idx),
    }));
  }, [order?.raw_items]);

  // ✅ compute totals for UI + payload
  const originalItemsTotal = useMemo(() => sumItemsTotal(items), [items]);

  const computedItemsTotal = useMemo(() => {
    if (ifUnavailableMode !== "REMOVE" && ifUnavailableMode !== "REPLACE") return originalItemsTotal;

    let total = 0;

    items.forEach((it) => {
      const key = it._key;
      const qty = getItemQty(it);
      const oldUnitPrice = getItemUnitPrice(it);

      if (ifUnavailableMode === "REMOVE") {
        const isRemoved = !!itemUnavailableMap[key];
        if (isRemoved) return;
        total += qty * oldUnitPrice;
        return;
      }

      // REPLACE
      const repl = itemReplacementMap[key];
      if (repl) {
        const newUnitPrice = toMoneyNumber(repl?.price) ?? getItemUnitPrice(repl);
        total += qty * (Number(newUnitPrice) || 0);
      } else {
        total += qty * oldUnitPrice;
      }
    });

    return total;
  }, [items, ifUnavailableMode, itemUnavailableMap, itemReplacementMap, originalItemsTotal]);

  const { effectiveTotalLabel, effectiveItemsCount } = useMemo(() => {
    const count = items.reduce((sum, it) => sum + getItemQty(it), 0);
    return { effectiveTotalLabel: money(computedItemsTotal), effectiveItemsCount: count };
  }, [items, computedItemsTotal]);

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
        itemName: getItemName(item) || "",
        businessId: bizId,
        owner_type: ownerType,
      });
    },
    [ifUnavailableMode, navigation, businessId, paramBusinessId, order, ownerType]
  );

  /* ===========================
     ✅ UPDATED: doUpdate() now sends REMOVE / REPLACE payloads on CONFIRMED
     =========================== */
  const doUpdate = useCallback(
    async (newStatusRaw, opts = {}, skipUnavailableCheck = false) => {
      try {
        const currentStatus = normalizeStatus(order?.status || "PENDING");
        const newStatus = normalizeStatus(newStatusRaw);

        if (shouldDriverControlAfterReady) {
          Alert.alert("Driver controlled", "Driver will update the status for Grab delivery.");
          return;
        }

        // DECLINE (same as before)
        if (newStatus === "DECLINED") {
          const r = String(opts?.reason ?? "").trim();
          if (r.length < 3) {
            setDeclineOpen(true);
            Alert.alert("Reason required", "Please provide at least 3 characters explaining why the order is declined.");
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

          await updateStatusApi({ endpoint: ENV_UPDATE_ORDER || "", orderCode, payload, token });

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

        // ✅ CONFIRMED (ACCEPT) with REMOVE/REPLACE payloads
        if (newStatus === "CONFIRMED" && currentStatus === "PENDING") {
          // optional warning (kept)
          if (!skipUnavailableCheck) {
            Alert.alert(
              "Confirm accept",
              "Before accepting, ensure unavailable items are marked (Remove) or replaced (Replace).",
              [
                { text: "Go back", style: "cancel" },
                { text: "Accept", onPress: () => doUpdate("CONFIRMED", opts, true) },
              ]
            );
            return;
          }

          // prep minutes required (kept)
          const prepVal = Number(manualPrepMin);
          if (!Number.isFinite(prepVal) || prepVal <= 0) {
            Alert.alert("Time required", "Please enter the time to prepare (in minutes) before accepting the order.");
            return;
          }

          // business info for payload
          const bizId =
            businessId ||
            paramBusinessId ||
            order?.business_id ||
            order?.merchant_id ||
            order?.store_id ||
            null;

          const bizName =
            order?.business_name ||
            order?.store_name ||
            order?.merchant_name ||
            params?.business_name ||
            "";

          // determine mode for payload: REMOVE / REPLACE (only when that mode is active)
          const modeUpper = String(ifUnavailableMode || "").toUpperCase();

          // build unavailable_changes only for REMOVE/REPLACE modes; otherwise keep empty arrays
          const unavailable_changes =
            modeUpper === "REMOVE" || modeUpper === "REPLACE"
              ? buildUnavailableChanges({
                  mode: modeUpper,
                  items,
                  unavailableMap: itemUnavailableMap,
                  replacementMap: itemReplacementMap,
                  businessId: bizId,
                  businessName: bizName,
                })
              : { removed: [], replaced: [] };

          const hasChanges =
            (unavailable_changes.removed?.length || 0) > 0 ||
            (unavailable_changes.replaced?.length || 0) > 0;

          // reason text exactly like your examples
          const reasonText =
            String(opts?.reason || "").trim() ||
            (modeUpper === "REMOVE" && hasChanges
              ? "Some items unavailable"
              : modeUpper === "REPLACE" && hasChanges
              ? "Replaced unavailable item"
              : "Order accepted by merchant");

          // compute final totals like your payload (keep existing fees, adjust total by items delta)
          const baseTotal = toMoneyNumber(order?.total_amount ?? order?.total ?? 0) ?? 0;
          const deltaItems = Number(computedItemsTotal) - Number(originalItemsTotal);
          const final_total_amount = Math.round((baseTotal + deltaItems) * 100) / 100;

          const final_platform_fee = toMoneyNumber(order?.platform_fee ?? 0) ?? 0;
          const final_discount_amount = toMoneyNumber(order?.discount_amount ?? 0) ?? 0;
          const final_delivery_fee = toMoneyNumber(order?.delivery_fee ?? 0) ?? 0;
          const final_merchant_delivery_fee =
            toMoneyNumber(order?.merchant_delivery_fee ?? 0) ?? 0;

          // delivery_option (kept so backend knows which option merchant selected)
          const deliveryBy =
            isBothOption && (isSelfSelected || isGrabSelected)
              ? isSelfSelected
                ? "SELF"
                : "GRAB"
              : deliveryOptionInitial || "";

          // ✅ Payload EXACTLY matching your structure (plus delivery_option if available)
          const payload = {
            status: "CONFIRMED",
            reason: reasonText,
            estimated_minutes: Math.round(prepVal),
            final_total_amount,
            final_platform_fee,
            final_discount_amount,
            final_delivery_fee,
            final_merchant_delivery_fee,
            unavailable_changes: {
              removed: unavailable_changes.removed || [],
              replaced: unavailable_changes.replaced || [],
            },
            ...(deliveryBy ? { delivery_option: deliveryBy } : {}),
          };

          // ✅ optimistic patch for UI
          setOrder((prev) => ({
            ...prev,
            status: "CONFIRMED",
            status_reason: reasonText,
            estimated_arrivial_time: Math.round(prepVal),
          }));
          DeviceEventEmitter.emit("order-updated", {
            id: String(order?.id || routeOrderId),
            patch: { status: "CONFIRMED", status_reason: reasonText },
          });

          setUpdating(true);
          const token = await SecureStore.getItemAsync("auth_token");
          const raw = order?.order_code || order?.id || routeOrderId;
          const orderCode = normalizeOrderCode(raw);

          logJson("[OrderDetails] CONFIRMED payload:", payload);

          await updateStatusApi({
            endpoint: ENV_UPDATE_ORDER || "",
            orderCode,
            payload,
            token,
          });

          // after API update, re-hydrate quickly
          debounceHydrateFromGrouped();
          return;
        }

        // ✅ other statuses (READY / OUT_FOR_DELIVERY / COMPLETED etc.) keep existing behavior
        let payload = { status: newStatus };

        // keep delivery option for non-confirmed as well
        const deliveryBy =
          isBothOption && (isSelfSelected || isGrabSelected)
            ? isSelfSelected
              ? "SELF"
              : "GRAB"
            : deliveryOptionInitial || "";
        if (deliveryBy) payload.delivery_option = deliveryBy;

        // optional reason defaults
        if (DEFAULT_REASON[newStatus]) {
          payload.status_reason = DEFAULT_REASON[newStatus];
          payload.reason = DEFAULT_REASON[newStatus];
        }

        // optimistic UI
        setOrder((prev) => ({ ...prev, status: newStatus }));
        DeviceEventEmitter.emit("order-updated", {
          id: String(order?.id || routeOrderId),
          patch: { status: newStatus },
        });

        setUpdating(true);
        const token = await SecureStore.getItemAsync("auth_token");
        const raw = order?.order_code || order?.id || routeOrderId;
        const orderCode = normalizeOrderCode(raw);

        await updateStatusApi({ endpoint: ENV_UPDATE_ORDER || "", orderCode, payload, token });

        debounceHydrateFromGrouped();
      } catch (e) {
        Alert.alert("Update failed", String(e?.message || e));
        hydrateFromGrouped();
      } finally {
        setUpdating(false);
      }
    },
    [
      order,
      routeOrderId,
      manualPrepMin,
      businessId,
      paramBusinessId,
      params?.business_name,
      ifUnavailableMode,
      items,
      itemUnavailableMap,
      itemReplacementMap,
      computedItemsTotal,
      originalItemsTotal,
      isBothOption,
      isSelfSelected,
      isGrabSelected,
      deliveryOptionInitial,
      shouldDriverControlAfterReady,
      hydrateFromGrouped,
      debounceHydrateFromGrouped,
    ]
  );

  const next = nextFor(status);
  const primaryLabel =
    status === "PENDING" ? "Accept" : next ? STATUS_META[next]?.label || "Next" : null;

  const onPrimaryAction = useCallback(() => {
    if (!next || updating) return;
    doUpdate(next);
  }, [next, updating, doUpdate]);

  const onDecline = useCallback(() => setDeclineOpen(true), []);
  const canDecline = useMemo(() => String(declineReason).trim().length >= 3, [declineReason]);
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

      const res = await fetch(finalUrl, { method: "GET", headers: { Accept: "application/json" } });

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

        const res = await fetch(finalUrl, { method: "GET", headers: { Accept: "application/json" } });

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

  /* ---------- Grab broadcast-delivery + socket deliveryAccepted (kept as-is) ---------- */
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

  const scheduleRetryAsk = useCallback(
    (sendGrabDeliveryRequestFn) => {
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
            onPress: () => setRideMessage("Waiting for a driver… (you can send again anytime)"),
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
    },
    []
  );

  const getOrderForFare = useCallback(async () => {
    const hasFeeNow = order?.delivery_fee != null || order?.merchant_delivery_fee != null;
    if (hasFeeNow) return order;
    return order;
  }, [order]);

  const sendGrabDeliveryRequest = useCallback(async () => {
    try {
      if (!ENV_SEND_REQUEST_DRIVER) {
        Alert.alert("Grab delivery not configured", "SEND_REQUEST_DRIVER_ENDPOINT is missing in environment variables.");
        return null;
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

      const deliveryFeeRaw = toMoneyNumber(
        ordForFare?.totals?.delivery_fee ?? ordForFare?.delivery_fee ?? ordForFare?.deliveryFee
      );

      const merchantDeliveryFeeRaw = toMoneyNumber(
        ordForFare?.totals?.merchant_delivery_fee ??
          ordForFare?.merchant_delivery_fee ??
          ordForFare?.merchantDeliveryFee
      );

      let baseFare = 0;
      if (deliveryFeeRaw != null && Number.isFinite(deliveryFeeRaw) && deliveryFeeRaw > 0) baseFare = deliveryFeeRaw;
      else if (
        merchantDeliveryFeeRaw != null &&
        Number.isFinite(merchantDeliveryFeeRaw) &&
        merchantDeliveryFeeRaw > 0
      )
        baseFare = merchantDeliveryFeeRaw;

      const fare = baseFare;
      const fareCents = Math.round(baseFare * 100);

      let passengerId = ordForFare?.user_id ?? ordForFare?.customer_id ?? null;
      try {
        const saved = await SecureStore.getItemAsync("merchant_login");
        if (saved) {
          const j = JSON.parse(saved);
          passengerId = j?.user_id ?? j?.id ?? j?.user?.id ?? passengerId;
        }
      } catch {}
      if (!passengerId) passengerId = 0;

      const payload = {
        passenger_id: Number(passengerId),
        merchant_id: businessId != null ? String(businessId) : undefined,
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
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {}

      if (!res.ok) throw new Error(json?.message || json?.error || text || `HTTP ${res.status}`);

      return json;
    } catch (e) {
      console.log("[OrderDetails] sendGrabDeliveryRequest ERROR:", e?.message || e);
      Alert.alert("Grab delivery failed", String(e?.message || e));
      return null;
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

    const name =
      driverDetails.user_name ?? driverDetails.name ?? driverDetails.full_name ?? "";
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

  /* ===========================
     ✅ SOCKET: accept + arrived + STATUS updates (kept)
     =========================== */
  useEffect(() => {
    if (!ENV_RIDE_SOCKET) return;

    let socket;
    let acceptedHandler;
    let arrivedHandler;
    let statusHandler;

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
        } catch {}
      }

      if (!merchantId) return;

      socket = io(ENV_RIDE_SOCKET, {
        transports: ["websocket"],
        query: { merchantId: String(merchantId), role: "merchant" },
      });
      socketRef.current = socket;

      const matchesThisOrder = (payload) => {
        try {
          const thisOrderCode = normalizeOrderCode(order?.order_code || order?.id || routeOrderId);
          const payloadOrder =
            payload?.order_code ||
            payload?.orderId ||
            payload?.order_id ||
            extractOrderIdFromPayload(payload);

          if (payloadOrder && thisOrderCode && !sameOrder(payloadOrder, thisOrderCode)) return false;
          return true;
        } catch {
          return true;
        }
      };

      acceptedHandler = (payload) => {
        if (!matchesThisOrder(payload)) return;

        driverAcceptedRef.current = true;
        setDriverAccepted(true);
        stopGrabLoop();

        const driverId =
          payload?.driver_id ?? payload?.driverId ?? payload?.driver?.id ?? payload?.driver?.driver_id ?? null;
        if (driverId != null) fetchDriverDetails(driverId);

        const st = extractStatusFromPayload(payload);
        if (st) applySocketStatusToUi(st);

        setRideMessage("Driver has accepted the delivery request");
        Alert.alert("Driver accepted", "Driver has accepted the delivery request");
      };

      arrivedHandler = (payload) => {
        if (!matchesThisOrder(payload)) return;

        setDriverArrived(true);

        const msg =
          payload?.message ||
          payload?.status_message ||
          "Driver has arrived at customer location.";
        setRideMessage(msg);
        Alert.alert("Driver arrived", msg);

        const driverId =
          payload?.driver_id ?? payload?.driverId ?? payload?.driver?.id ?? payload?.driver?.driver_id ?? null;
        if (driverId != null && !driverDetails) fetchDriverDetails(driverId);

        const st = extractStatusFromPayload(payload);
        if (st) applySocketStatusToUi(st);
      };

      statusHandler = (payload) => {
        if (!matchesThisOrder(payload)) return;

        const payloadOrderId = extractOrderIdFromPayload(payload);
        if (!payloadOrderId && !driverAcceptedRef.current) return;

        const st = extractStatusFromPayload(payload);
        if (!st) return;

        applySocketStatusToUi(st);

        const norm = normalizeStatus(st);
        if (norm === "OUT_FOR_DELIVERY") setRideMessage("Driver is on the way (Out for delivery).");
        else if (norm === "COMPLETED") setRideMessage("Order delivered (Delivery complete).");
      };

      socket.on("deliveryAccepted", acceptedHandler);
      socket.on("delivery:driver_arrived", arrivedHandler);
      socket.on("deliveryDriverLocation", statusHandler);
    })();

    return () => {
      if (socket) {
        if (acceptedHandler) socket.off("deliveryAccepted", acceptedHandler);
        if (arrivedHandler) socket.off("delivery:driver_arrived", arrivedHandler);
        if (statusHandler) socket.off("deliveryDriverLocation", statusHandler);
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
    applySocketStatusToUi,
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

  /* ===========================
     ✅ Deliver in group navigation (kept)
   =========================== */
  const goToCluster = useCallback(async () => {
    const focusOrderId = normalizeOrderCode(order?.order_code || order?.id || routeOrderId);
    const resolvedUserId =
      order?.user_id ??
      order?.user?.user_id ??
      order?.user?.id ??
      order?.customer_id ??
      order?.customer?.id ??
      order?.userId ??
      params.user_id ??
      params.userId ??
      null;

    const fallbackParams = {
      businessId: businessId ?? paramBusinessId ?? order?.business_id ?? order?.merchant_id ?? null,
      ownerType: ownerType ?? null,
      ordersGroupedUrl: ordersGroupedUrl ?? ENV_ORDER_ENDPOINT ?? null,
      delivery_option:
        params.delivery_option ?? params.deliveryOption ?? order?.delivery_option ?? null,
      focusOrderId,
      user_id: resolvedUserId,
    };

    const targetRoute = resolvedClusterRouteName;

    if (!targetRoute) {
      Alert.alert(
        "Route not registered",
        "FoodNearbyClusterOrdersScreen is not in this navigator chain. Add it to your Stack.Screen route names."
      );
      return;
    }

    const ownerNav = findNavigatorOwningRoute(navigation, targetRoute);
    const navTo = (payload) => {
      if (ownerNav && ownerNav !== navigation) {
        ownerNav.dispatch(CommonActions.navigate({ name: targetRoute, params: payload }));
        return;
      }
      navigation.dispatch(CommonActions.navigate({ name: targetRoute, params: payload }));
    };

    if (clusterCtx?.orders && Array.isArray(clusterCtx.orders) && clusterCtx.orders.length) {
      navTo({
        ...clusterCtx,
        businessId: clusterCtx.businessId ?? fallbackParams.businessId,
        ownerType: clusterCtx.ownerType ?? fallbackParams.ownerType,
        ordersGroupedUrl: clusterCtx.ordersGroupedUrl ?? fallbackParams.ordersGroupedUrl,
        delivery_option: clusterCtx.delivery_option ?? fallbackParams.delivery_option,
        focusOrderId,
        user_id: clusterCtx.user_id ?? clusterCtx.userId ?? resolvedUserId,
        label: clusterCtx.label || clusterCtx.addrPreview || "Nearby cluster",
        addrPreview: clusterCtx.addrPreview || clusterCtx.label || "",
      });
      return;
    }

    // fallback fetch grouped
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
          for (const o of g.orders) allOrders.push({ ...o, status: normalizeStatus(o?.status) });
        } else if (g && (g.id || g.order_id || g.order_code)) {
          allOrders.push({ ...g, status: normalizeStatus(g?.status) });
        }
      }

      const clusters = buildClustersFromOrders(allOrders, 5);
      const chosen = clusters[0] || { orders: allOrders, label: "Nearby cluster", addrPreview: "" };

      navTo({
        label: chosen?.label || "Nearby cluster",
        addrPreview: chosen?.addrPreview || "",
        orders: chosen?.orders || allOrders,
        thresholdKm: chosen?.thresholdKm || 5,
        centerCoords: chosen?.centerCoords || null,
        businessId: bizId ?? fallbackParams.businessId,
        ownerType: ownerType ?? fallbackParams.ownerType,
        delivery_option: fallbackParams.delivery_option,
        ordersGroupedUrl: groupedUrlFinal || fallbackParams.ordersGroupedUrl,
        focusOrderId,
        detailsRoute: "OrderDetails",
        nextTrackScreen: "TrackBatchOrdersScreen",
      });
    } catch (e) {
      navTo({
        ...fallbackParams,
        label: "Nearby cluster",
        addrPreview: "",
        orders: [],
        thresholdKm: 5,
        centerCoords: null,
        nextTrackScreen: "TrackBatchOrdersScreen",
      });
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
    ownerType,
    ordersGroupedUrl,
    params,
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
        <View style={{ width: 40, alignItems: "flex-end", justifyContent: "center" }}>
          <ActivityIndicator animating={refreshing} size="small" />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
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
                  retryInSec > 0 && rideMessage ? `${rideMessage}\nRetry option in ${retryInSec}s` : rideMessage
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

            <View style={{ marginTop: 12 }}>
              {!shouldDriverControlAfterReady ? (
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
              ) : (
                <View style={[styles.block, { marginTop: 12 }]}>
                  <Text style={[styles.segmentHint, { fontWeight: "700" }]}>
                    Driver will update order status automatically.
                  </Text>
                  <Text style={[styles.segmentHint, { marginTop: 6 }]}>
                    Current status: {STATUS_META[status]?.label || status.replace(/_/g, " ")}
                  </Text>
                  {!!rideMessage ? (
                    <Text style={[styles.segmentHint, { marginTop: 6 }]}>{rideMessage}</Text>
                  ) : null}
                </View>
              )}
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
