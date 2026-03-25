// screens/food/OrderDetails.js
// ✅ UPDATED: Accept (CONFIRMED) supports REMOVE / REPLACE payloads
// ✅ FIX: Fees preserved using robust extraction
// ✅ FIX: Item totals parse "Nu. 20" etc.
// ✅ UPDATED: TotalsBlock shows GRAND TOTAL
// ✅ UPDATED: Status updates use ClusterDeliveryOptionsScreen-style payload acceptance (allow missing ids AFTER driverAccepted)
// ✅ FIX: useFocusEffect async usage (do not return Promise)
// ✅ FIX: driver accept/status updates now show + update like ClusterDeliveryOptionsScreen (NO batch matching)
// ✅ FIX: SecureStore key sanitizer (NO ":" and only [A-Za-z0-9._-])
// ✅ Keeps: status normalization, grouped hydrate protection, socket fast-status apply, deliver-in-group route fix, pull-to-refresh
// ✅ CHANGE (REQUESTED):
// - ALL batch code removed: GROUP_NEARBY_ORDER_ENDPOINT, batchId/batchOrderIds, saveBatchId/keyBatchId,
//   createBatchForThisOrder/ensureBatchForGrab, joinBatchRoom, batch matching, any batch_id usage.
// ✅ CHANGE (REQUESTED NOW):
// - Remove Deliver in group completely.
// - When user selects GRAB, directly redirect to NearbyOrdersScreen (cluster list).
// - No alert popup. No "Use Deliver in group" message.

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
  useWindowDimensions,
} from "react-native";
import {
  useRoute,
  useNavigation,
  useFocusEffect,
  CommonActions,
} from "@react-navigation/native";

// ✅ Chat helper (adjust path if needed)
import { createOrGetOrderConversationFromOrderDetails } from "../../utils/chatApi";

import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as SecureStore from "expo-secure-store";
import io from "socket.io-client";

import {
  UPDATE_ORDER_STATUS_ENDPOINT as ENV_UPDATE_ORDER,
  ORDER_ENDPOINT as ENV_ORDER_ENDPOINT,
  RIDE_LOCAL_ENDPOINT as ENV_RIDE_SOCKET,
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

/* ---------------- responsive helpers ----------------
   - baseline width: 375 (iPhone X-ish)
   - keeps UI consistent but responsive across phones/tablets
----------------------------------------------------- */
const makeScaler = (screenWidth) => {
  const base = 375;
  const ratio = screenWidth > 0 ? screenWidth / base : 1;

  // keep scaling sane on tablets
  const clampedRatio = Math.max(0.88, Math.min(1.25, ratio));

  const s = (n) => {
    const v = Number(n) || 0;
    return Math.round(v * clampedRatio);
  };

  return s;
};

const hit = (n) => ({ top: n, bottom: n, left: n, right: n });

/* ---------------- debug helpers ---------------- */
const logJson = (label, obj) => {
  try {
    console.log(label, JSON.stringify(obj, null, 2));
  } catch (e) {
    console.log(label, obj);
  }
};

/* ===========================
   ✅ SecureStore key sanitizer
   - keys must contain only [A-Za-z0-9._-]
   - also avoid ":" completely
   =========================== */
const toSafeKeyPart = (v, fallback = "0") => {
  if (v == null) return fallback;

  const asNum = Number(v);
  if (Number.isFinite(asNum)) {
    const intish = Math.trunc(asNum);
    const raw = Math.abs(asNum - intish) < 1e-9 ? String(intish) : String(asNum);
    return raw.replace(/[^A-Za-z0-9._-]/g, "_") || fallback;
  }

  const s = String(v).trim();
  if (!s) return fallback;
  return s.replace(/[^A-Za-z0-9._-]/g, "_") || fallback;
};

/* ✅ SecureStore keys (scoped by businessId) — ride only (batch removed) */
const keyRideId = (businessId) =>
  `orderdetails_last_ride_id_${toSafeKeyPart(businessId)}`;

/* ===========================
   status normalizer
   =========================== */
const normalizeStatus = (v) => {
  const s = String(v || "").trim().toUpperCase();
  if (!s) return "PENDING";

  if (s === "ACCEPTED") return "CONFIRMED";
  if (s === "ACCEPT") return "CONFIRMED";
  if (s === "CONFIRM") return "CONFIRMED";
  if (s === "PREPARING") return "CONFIRMED";

  // driver updates
  if (s === "ON ROAD" || s === "ON_ROAD" || s === "ONROAD")
    return "OUT_FOR_DELIVERY";
  if (s === "OUT FOR DELIVERY" || s === "OUT_FOR_DELIVERY")
    return "OUT_FOR_DELIVERY";
  if (s === "OUT_FOR_DEL" || s === "OUT FOR DEL") return "OUT_FOR_DELIVERY";
  if (s === "DELIVERING") return "OUT_FOR_DELIVERY";

  // delivered variants
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
      address: String(
        v.address ??
        v.full_address ??
        v.location ??
        v.formatted ??
        v.label ??
        ""
      ).trim(),
      lat: v.lat ?? v.latitude ?? null,
      lng: v.lng ?? v.lon ?? v.longitude ?? null,
      city: v.city ?? v.town ?? v.dzongkhag ?? null,
    };
  }

  return { address: String(v).trim(), lat: null, lng: null, city: null };
};

/* ===========================
   find route name exists
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
  } catch { }

  for (const raw of candidates.map(clean).filter(Boolean)) {
    for (const n of chain) {
      if (existsIn(n, raw)) return raw;
    }
  }
  return null;
};

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
  } catch { }
  return null;
};

/* ===========================
   money parser + totals extraction
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

const pickMoney = (...vals) => {
  for (const v of vals) {
    const n = toMoneyNumber(v);
    if (n != null) return n; // includes 0
  }
  return null;
};

const getOrderTotalsSnapshot = (src = {}, fallback = {}) => {
  const a = src || {};
  const b = fallback || {};

  const aTotals = a.totals || a.total_breakdown || a.breakdown || a.pricing || null;
  const aBizTotals =
    a.totals_for_business ||
    a.totalsForBusiness ||
    a.business_totals ||
    a.businessTotals ||
    null;

  const bTotals = b.totals || b.total_breakdown || b.breakdown || b.pricing || null;
  const bBizTotals =
    b.totals_for_business ||
    b.totalsForBusiness ||
    b.business_totals ||
    b.businessTotals ||
    null;

  const platform_fee = pickMoney(
    a.platform_fee,
    a.platformFee,
    aTotals?.platform_fee,
    aTotals?.platformFee,
    aBizTotals?.platform_fee,
    aBizTotals?.platformFee,
    a.fees?.platform_fee,
    a.charges?.platform_fee,
    b.platform_fee,
    b.platformFee,
    bTotals?.platform_fee,
    bTotals?.platformFee,
    bBizTotals?.platform_fee,
    bBizTotals?.platformFee,
    b.fees?.platform_fee,
    b.charges?.platform_fee
  );

  const discount_amount = pickMoney(
    a.discount_amount,
    a.discountAmount,
    a.discount,
    aTotals?.discount_amount,
    aTotals?.discountAmount,
    aTotals?.discount,
    aBizTotals?.discount_amount,
    aBizTotals?.discountAmount,
    aBizTotals?.discount,
    aTotals?.total_discount,
    aBizTotals?.total_discount,
    b.discount_amount,
    b.discountAmount,
    b.discount,
    bTotals?.discount_amount,
    bTotals?.discountAmount,
    bTotals?.discount,
    bBizTotals?.discount_amount,
    bBizTotals?.discountAmount,
    bBizTotals?.discount,
    bTotals?.total_discount,
    bBizTotals?.total_discount
  );

  const delivery_fee = pickMoney(
    a.delivery_fee,
    a.deliveryFee,
    aTotals?.delivery_fee,
    aTotals?.deliveryFee,
    aBizTotals?.delivery_fee,
    aBizTotals?.deliveryFee,
    a.fees?.delivery_fee,
    a.charges?.delivery_fee,
    b.delivery_fee,
    b.deliveryFee,
    bTotals?.delivery_fee,
    bTotals?.deliveryFee,
    bBizTotals?.delivery_fee,
    bBizTotals?.deliveryFee,
    b.fees?.delivery_fee,
    b.charges?.delivery_fee
  );

  const merchant_delivery_fee = pickMoney(
    a.merchant_delivery_fee,
    a.merchantDeliveryFee,
    aTotals?.merchant_delivery_fee,
    aTotals?.merchantDeliveryFee,
    aBizTotals?.merchant_delivery_fee,
    aBizTotals?.merchantDeliveryFee,
    a.fees?.merchant_delivery_fee,
    a.charges?.merchant_delivery_fee,
    b.merchant_delivery_fee,
    b.merchantDeliveryFee,
    bTotals?.merchant_delivery_fee,
    bTotals?.merchantDeliveryFee,
    bBizTotals?.merchant_delivery_fee,
    bBizTotals?.merchantDeliveryFee,
    b.fees?.merchant_delivery_fee,
    b.charges?.merchant_delivery_fee
  );

  return { platform_fee, discount_amount, delivery_fee, merchant_delivery_fee };
};

/* ===========================
   item helpers
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
  it?.item_name ??
  it?.name ??
  it?.title ??
  it?.menu_name ??
  it?.product_name ??
  "";

const getItemImage = (it) =>
  it?.item_image ?? it?.image ?? it?.image_url ?? it?.photo ?? it?.thumbnail ?? null;

const getItemQty = (it) => {
  const q = Number(it?.qty ?? it?.quantity ?? it?.quantity_ordered ?? it?.order_qty ?? 1);
  return Number.isFinite(q) && q > 0 ? q : 1;
};

const getItemUnitPrice = (it) => {
  const p =
    toMoneyNumber(it?.unit_price) ??
    toMoneyNumber(it?.price) ??
    toMoneyNumber(it?.item_price) ??
    toMoneyNumber(it?.rate) ??
    toMoneyNumber(it?.selling_price) ??
    toMoneyNumber(it?.unitPrice) ??
    null;

  if (p != null) return p;

  const n = Number(
    it?.price ?? it?.unit_price ?? it?.item_price ?? it?.rate ?? it?.selling_price ?? 0
  );
  return Number.isFinite(n) ? n : 0;
};

const getItemLineTotal = (it) => {
  const direct = pickMoney(
    it?.subtotal,
    it?.sub_total,
    it?.line_total,
    it?.lineTotal,
    it?.total,
    it?.amount,
    it?.final_amount
  );
  if (direct != null) return direct;

  const qty = getItemQty(it);
  const unit = getItemUnitPrice(it);
  return qty * unit;
};

const sumItemsTotal = (itemsArr = []) =>
  (itemsArr || []).reduce((sum, it) => sum + getItemLineTotal(it), 0);

/* ===========================
   unavailable changes
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

  const itemByKey = new Map(
    (items || []).map((it) => [String(it?._key ?? getItemMenuId(it) ?? ""), it])
  );

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
   socket payload helpers (NO batch)
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

  const drops =
    payload?.drops ??
    payload?.data?.drops ??
    payload?.payload?.drops ??
    payload?.message?.drops ??
    null;
  if (Array.isArray(drops) && drops.length) {
    const d0 = drops[0];
    const v =
      d0?.status ??
      d0?.order_status ??
      d0?.current_status ??
      d0?.orderStatus ??
      d0?.job_status ??
      null;
    if (v) return v;
  }

  return null;
};

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

  const drops =
    payload.drops ??
    payload?.data?.drops ??
    payload?.payload?.drops ??
    payload?.message?.drops ??
    null;
  if (Array.isArray(drops) && drops.length) {
    const first = drops[0];
    const ov = first?.order_id ?? first?.orderId ?? first?.order_code ?? first?.orderCode ?? null;
    if (ov != null) return String(ov);
  }

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

    const cdrops = c.drops ?? null;
    if (Array.isArray(cdrops) && cdrops.length) {
      const first = cdrops[0];
      const ov = first?.order_id ?? first?.orderId ?? first?.order_code ?? first?.orderCode ?? null;
      if (ov != null) return String(ov);
    }
  }

  const deep = payload?.order?.id ?? payload?.data?.order?.id ?? null;
  if (deep != null) return String(deep);

  return null;
};

const extractDriverCoords = (payload) => {
  if (!payload) return null;
  const cand = [
    { lat: payload.lat, lng: payload.lng },
    { lat: payload.latitude, lng: payload.longitude },
    { lat: payload.current_lat, lng: payload.current_lng },
    { lat: payload.driver_lat, lng: payload.driver_lng },
    { lat: payload?.location?.lat, lng: payload?.location?.lng },
    { lat: payload?.location?.latitude, lng: payload?.location?.longitude },
    { lat: payload?.coords?.lat, lng: payload?.coords?.lng },
    { lat: payload?.coords?.latitude, lng: payload?.coords?.longitude },
  ];
  for (const c of cand) {
    const la = Number(c.lat);
    const lo = Number(c.lng);
    if (Number.isFinite(la) && Number.isFinite(lo)) return { lat: la, lng: lo };
  }
  return null;
};

const pickRideId = (payload) =>
  payload?.ride_id ??
  payload?.rideId ??
  payload?.delivery_ride_id ??
  payload?.deliveryRideId ??
  payload?.ride ??
  payload?.ride?.id ??
  payload?.data?.ride_id ??
  payload?.data?.rideId ??
  payload?.data?.delivery_ride_id ??
  payload?.data?.deliveryRideId ??
  payload?.payload?.ride_id ??
  payload?.payload?.rideId ??
  payload?.message?.ride_id ??
  payload?.message?.rideId ??
  null;

export default function OrderDetails() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();

  const { width: screenW } = useWindowDimensions();
  const S = useMemo(() => makeScaler(screenW), [screenW]);

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

  // ✅ ensure id + order_code always exist
  const [order, setOrder] = useState(() => {
    const o = orderProp || {};
    const idRaw = o?.id ?? o?.order_id ?? o?.order_code ?? routeOrderId ?? null;
    const codeRaw = o?.order_code ?? o?.order_id ?? o?.id ?? routeOrderId ?? null;

    const feeSnap = getOrderTotalsSnapshot(o, null);

    return {
      ...o,
      id: idRaw != null ? String(idRaw) : undefined,
      order_id: o?.order_id ?? (idRaw != null ? String(idRaw) : undefined),
      order_code: codeRaw != null ? normalizeOrderCode(codeRaw) : undefined,
      status: normalizeStatus(o?.status),
      delivery_address: normalizeDeliveryAddress(
        o?.delivery_address ?? o?.address ?? o?.deliver_to
      ),

      __user: o?.__user ?? o?.user ?? null,

      platform_fee: feeSnap.platform_fee ?? toMoneyNumber(o?.platform_fee) ?? 0,
      discount_amount: feeSnap.discount_amount ?? toMoneyNumber(o?.discount_amount) ?? 0,
      delivery_fee: feeSnap.delivery_fee ?? toMoneyNumber(o?.delivery_fee) ?? null,
      merchant_delivery_fee:
        feeSnap.merchant_delivery_fee ?? toMoneyNumber(o?.merchant_delivery_fee) ?? null,
    };
  });

  /* ---------- Merchant delivery option & location ---------- */
  const [merchantDeliveryOpt, setMerchantDeliveryOpt] = useState("UNKNOWN");
  const [businessId, setBusinessId] = useState(paramBusinessId);
  const [businessCoords, setBusinessCoords] = useState(null);

  // ✅ open chat from order
  const openChatFromOrder = useCallback(async () => {
    try {
      const token = await SecureStore.getItemAsync("auth_token");

      const merchant_user_id =
        (await SecureStore.getItemAsync("user_id_v1")) ||
        (await SecureStore.getItemAsync("user_id")) ||
        null;

      if (!merchant_user_id) {
        Alert.alert("Chat", "Merchant user_id not found in SecureStore.");
        return;
      }

      const business_id =
        (await SecureStore.getItemAsync("business_id_v1")) ||
        (await SecureStore.getItemAsync("business_id")) ||
        (await SecureStore.getItemAsync("businessId")) ||
        businessId ||
        paramBusinessId ||
        order?.business_id ||
        null;

      if (!business_id) {
        Alert.alert("Chat", "Business id not found.");
        return;
      }

      const customer_id =
        order?.__user?.user_id ??
        order?.__user?.id ??
        order?.user?.user_id ??
        order?.user?.id ??
        order?.user_id ??
        order?.customer_id ??
        null;

      if (!customer_id) {
        Alert.alert("Chat", "Customer id not found in this order payload.");
        return;
      }

      const orderIdForChat =
        order?.order_code || order?.order_id || order?.id || routeOrderId;

      if (!orderIdForChat) {
        Alert.alert("Chat", "Order id/code missing.");
        return;
      }

      const resp = await createOrGetOrderConversationFromOrderDetails({
        orderId: orderIdForChat,
        customer_id,
        business_id,
        merchant_user_id,
        token,
      });

      const conversationId =
        resp?.conversation_id ?? resp?.data?.conversation_id ?? resp?.conversationId ?? null;

      if (!conversationId) throw new Error("No conversation_id returned");

      navigation.navigate("MerchantChatRoomScreen", {
        conversationId: String(conversationId),
        orderId: String(orderIdForChat),
        userType: "MERCHANT",
        userId: String(merchant_user_id),
        businessId: String(business_id),
        meta: {
          customerId: String(customer_id),
          customerName:
            order?.customer_name ||
            order?.user_name ||
            order?.__user?.user_name ||
            order?.__user?.name ||
            "",
          customer_profile_image:
            order?.__user?.profile_image ||
            order?.__user?.profileImage ||
            order?.__user?.avatar ||
            order?.user?.profile_image ||
            order?.user?.profileImage ||
            order?.user?.avatar ||
            "",
        },
        source: "order-details",
      });
    } catch (e) {
      Alert.alert("Chat", e?.message || "Failed to open chat");
    }
  }, [navigation, order, routeOrderId, businessId, paramBusinessId]);

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

  // fast status confirmation + polling refs
  const liveRefreshTimerRef = useRef(null);
  const socketHydrateTimerRef = useRef(null);
  const lastSocketAppliedStatusRef = useRef(null);

  const LIVE_REFRESH_MS = 4000;

  // ✅ ride_id state (batch removed)
  const [rideId, setRideId] = useState(null);
  const rideIdRef = useRef(null);
  useEffect(() => {
    rideIdRef.current = rideId;
  }, [rideId]);

  const driverAcceptedRef = useRef(false);
  useEffect(() => {
    driverAcceptedRef.current = !!driverAccepted;
  }, [driverAccepted]);

  // ✅ Nearby list route candidates (GRAB redirects HERE)
  const NEARBY_LIST_ROUTE_CANDIDATES = useMemo(
    () => [
      "NearbyOrdersScreen",
      "FoodNearbyOrdersScreen",
      "NearbyOrders",
      "FoodNearbyOrders",
      "NearbyOrdersList",
    ],
    []
  );

  const resolvedNearbyListRouteName = useMemo(() => {
    const preferred =
      params.nearbyOrdersRoute ||
      params.nearbyOrdersScreen ||
      params.nearbyListRoute ||
      null;

    return (
      pickExistingRouteName(navigation, [preferred, ...NEARBY_LIST_ROUTE_CANDIDATES]) || null
    );
  }, [
    navigation,
    params.nearbyOrdersRoute,
    params.nearbyOrdersScreen,
    params.nearbyListRoute,
    NEARBY_LIST_ROUTE_CANDIDATES,
  ]);

  useEffect(() => {
    setItemUnavailableMap({});
    setItemReplacementMap({});
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
    } catch { }
    navigation.dispatch(CommonActions.navigate({ name: "MainTabs", params: { screen: "Orders" } }));
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

  const saveRideId = useCallback(
    async (rid, bizOverride = null) => {
      try {
        const biz = bizOverride ?? businessId;
        const safeBiz = toSafeKeyPart(biz);
        if (!safeBiz) return;

        const v = rid != null ? String(rid).trim() : "";
        if (!v) return;

        setRideId(v);
        await SecureStore.setItemAsync(keyRideId(safeBiz), v);
      } catch (e) {
        console.log("[OrderDetails] saveRideId error:", e?.message || e);
      }
    },
    [businessId]
  );

  // ✅ restore saved ride_id (batch removed)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const safeBiz = toSafeKeyPart(businessId);
        if (!safeBiz) return;

        const savedRide = await SecureStore.getItemAsync(keyRideId(safeBiz));
        if (!cancelled && savedRide && String(savedRide).trim() && !rideIdRef.current) {
          setRideId(String(savedRide).trim());
        }
      } catch (e) {
        console.log("[OrderDetails] restore saved ride error:", e?.message || e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [businessId]);

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
          } catch { }
        }
      }

      const bd = await fetchBusinessDetails({ token, business_id: finalBizId });

      if (bd) {
        const opt = bd?.delivery_option ?? bd?.deliveryOption;
        const nOpt = opt ? String(opt).toUpperCase() : "UNKNOWN";
        setMerchantDeliveryOpt(nOpt);

        const latRaw = bd.latitude ?? bd.lat ?? bd.business_latitude ?? bd.business_lat ?? null;
        const lngRaw = bd.longitude ?? bd.lng ?? bd.business_longitude ?? bd.business_lng ?? null;

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
  }, [loadBusinessDetails]);

  /* ---------- Normalize fulfillment ---------- */
  const fulfillment = useMemo(() => resolveFulfillmentType({ ...order, params }), [order, params]);
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

  const status = normalizeStatus(order?.status || "PENDING");

  const isPlatformDelivery = useMemo(() => {
    if (isBothOption) return isGrabSelected;
    return deliveryOptionInitial === "GRAB";
  }, [isBothOption, isGrabSelected, deliveryOptionInitial]);

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

  // ✅ LOCK merchant updates AFTER driver accepts (Grab / platform delivery)
  const isDriverAssigned = useMemo(() => {
    if (!driverAccepted) return false;
    return isPlatformDelivery || (isBothOption && isGrabSelected);
  }, [driverAccepted, isPlatformDelivery, isBothOption, isGrabSelected]);

  const shouldBlockAtReady =
    status === "READY" &&
    (isPlatformDelivery || (isBothOption && isGrabSelected)) &&
    !driverAccepted;

  const nextFor = useCallback(
    (curr) => {
      const s = normalizeStatus(curr);
      if (TERMINAL_NEGATIVE.has(s) || TERMINAL_SUCCESS.has(s)) return null;
      if (isPickupFulfillment && s === "READY") return null;

      // ✅ Once driver accepted, merchant should not update any status
      if (isDriverAssigned) return null;

      if (s === "READY" && shouldBlockAtReady) return null;

      const idx = STATUS_SEQUENCE.indexOf(s);
      if (idx === -1) return "CONFIRMED";
      return STATUS_SEQUENCE[idx + 1] || null;
    },
    [STATUS_SEQUENCE, shouldBlockAtReady, isPickupFulfillment, isDriverAssigned]
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
        } catch { }
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
      } catch { }
      if (!res.ok) throw new Error(json?.message || json?.error || `HTTP ${res.status}`);

      const groups = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];

      // ✅ IMPORTANT: keep block.user as __user (cluster style)
      let allOrders = [];
      for (const g of groups) {
        if (Array.isArray(g?.orders)) {
          const blockUser = g.user || g.customer || g.user_details || null;
          const userName =
            g.customer_name ??
            g.name ??
            blockUser?.name ??
            blockUser?.user_name ??
            blockUser?.full_name ??
            "";
          const userPhone =
            g.phone ?? blockUser?.phone ?? blockUser?.phone_number ?? blockUser?.mobile ?? "";

          for (const o of g.orders) {
            allOrders.push({
              ...o,
              __user: blockUser,
              user: o.user || blockUser || o.user,
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
      const finalStatus = isHigherOrEqualStatus(localStatus, matchStatus) ? localStatus : matchStatus;

      const feeSnap = getOrderTotalsSnapshot(match, order);

      const normalizedFromMatch = {
        ...match,
        id: String(match?.id ?? match?.order_id ?? match?.order_code ?? routeOrderId),
        order_id: String(match?.order_id ?? match?.id ?? match?.order_code ?? routeOrderId),
        order_code: normalizeOrderCode(match?.order_code ?? match?.id ?? routeOrderId),

        __user: match?.__user ?? match?.user ?? null,

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
        total: match?.total ?? match?.total_amount ?? order?.total ?? 0,
        status: finalStatus,
        type: match?.type ?? match?.fulfillment_type ?? match?.delivery_type ?? order?.type ?? "",
        delivery_option: match?.delivery_option ?? match?.delivery_by ?? order?.delivery_option ?? "",
        status_timestamps: match?.status_timestamps ?? order?.status_timestamps ?? {},
        if_unavailable: match?.if_unavailable ?? order?.if_unavailable ?? "",
        estimated_arrivial_time:
          match?.estimated_arrivial_time ?? match?.eta_minutes ?? order?.estimated_arrivial_time ?? null,

        delivery_fee: feeSnap.delivery_fee ?? null,
        merchant_delivery_fee: feeSnap.merchant_delivery_fee ?? null,
        platform_fee: feeSnap.platform_fee ?? 0,
        discount_amount: feeSnap.discount_amount ?? 0,

        totals_for_business: match?.totals_for_business ?? order?.totals_for_business ?? null,
        totals: match?.totals ?? order?.totals ?? null,
      };

      setOrder((prev) => ({
        ...prev,
        ...normalizedFromMatch,
        status: normalizeStatus(normalizedFromMatch.status),
        delivery_address: normalizeDeliveryAddress(
          normalizedFromMatch?.delivery_address ?? prev?.delivery_address ?? prev?.address
        ),
        __user: normalizedFromMatch.__user ?? prev.__user ?? prev.user ?? null,
      }));
    } catch (e) {
      console.warn("[OrderDetails] hydrate error:", e?.message);
    }
  }, [ordersGroupedUrl, routeOrderId, order?.status, businessId, paramBusinessId, isScheduledOrder]);

  // ✅ FIX: do not return Promise from useFocusEffect
  useFocusEffect(
    useCallback(() => {
      hydrateFromGrouped();
      return undefined;
    }, [hydrateFromGrouped])
  );

  const debounceHydrateFromGrouped = useCallback(() => {
    if (socketHydrateTimerRef.current) clearTimeout(socketHydrateTimerRef.current);
    socketHydrateTimerRef.current = setTimeout(() => {
      socketHydrateTimerRef.current = null;
      hydrateFromGrouped();
    }, 350);
  }, [hydrateFromGrouped]);

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
      (typeof addr === "object" ? addr.city ?? addr.town ?? addr.dzongkhag : null) ??
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

  /* ===========================
     Cluster-style reasons
     =========================== */
  const DEFAULT_REASON = useMemo(
    () => ({
      CONFIRMED: "Order accepted by merchant",
      READY: "Order is ready",
      OUT_FOR_DELIVERY: "Order handed over for delivery",
      COMPLETED: "Order delivered",
      DECLINED: "Order declined by merchant",
    }),
    []
  );

  /* ===========================
     FAST apply status from socket into UI + confirm via grouped
     =========================== */
  const applySocketStatusToUi = useCallback(
    (incomingStatusRaw, extraPatch = {}) => {
      const norm = normalizeStatus(incomingStatusRaw);
      if (!norm) return;

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
        if (isHigherOrEqualStatus(prevStatus, norm)) return { ...prev, ...extraPatch };

        const patch = { ...extraPatch, status: norm };
        const next = { ...prev, ...patch };

        DeviceEventEmitter.emit("order-updated", {
          id: String(next?.id || routeOrderId),
          patch: { ...patch, status: norm },
        });

        return next;
      });

      lastSocketAppliedStatusRef.current = norm;
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

  const originalItemsTotal = useMemo(() => sumItemsTotal(items), [items]);

  const computedItemsTotal = useMemo(() => {
    if (ifUnavailableMode !== "REMOVE" && ifUnavailableMode !== "REPLACE") return originalItemsTotal;

    let total = 0;

    items.forEach((it) => {
      const key = it._key;
      const qty = getItemQty(it);
      const oldLineTotal = getItemLineTotal(it);

      if (ifUnavailableMode === "REMOVE") {
        const isRemoved = !!itemUnavailableMap[key];
        if (isRemoved) return;
        total += oldLineTotal;
        return;
      }

      const repl = itemReplacementMap[key];
      if (repl) {
        const newUnitPrice = toMoneyNumber(repl?.price) ?? getItemUnitPrice(repl);
        total += qty * (Number(newUnitPrice) || 0);
      } else {
        total += oldLineTotal;
      }
    });

    return total;
  }, [items, ifUnavailableMode, itemUnavailableMap, itemReplacementMap, originalItemsTotal]);

  const feeSnapForUi = useMemo(() => getOrderTotalsSnapshot(order, null), [order]);

  const displayGrandTotal = useMemo(() => {
    const df = feeSnapForUi.delivery_fee ?? 0;
    const mdf = feeSnapForUi.merchant_delivery_fee ?? 0;
    const disc = feeSnapForUi.discount_amount ?? 0;

    const raw =
      Number(computedItemsTotal || 0) + Number(df || 0) + Number(mdf || 0) - Number(disc || 0);
    return Math.round(raw * 100) / 100;
  }, [computedItemsTotal, feeSnapForUi]);

  const { effectiveTotalLabel, effectiveItemsCount } = useMemo(() => {
    const count = items.reduce((sum, it) => sum + getItemQty(it), 0);
    return { effectiveTotalLabel: money(displayGrandTotal), effectiveItemsCount: count };
  }, [items, displayGrandTotal]);

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
     Cluster-style status updater (ONE order)
     =========================== */
  const updateSingleStatusLikeCluster = useCallback(
    async ({
      newStatus,
      deliveryBy = null,
      reasonText = "",
      extraPayload = {},
      extraPatch = {},
      showSuccessAlert = false,
    }) => {
      if (!ENV_UPDATE_ORDER) return false;

      const token = await SecureStore.getItemAsync("auth_token");
      if (!token) {
        Alert.alert("Not logged in", "Missing auth token for updating orders.");
        return false;
      }

      const rawCode = order?.order_code || order?.id || routeOrderId;
      const orderCode = normalizeOrderCode(rawCode);

      const reason =
        String(reasonText || "").trim() ||
        DEFAULT_REASON[newStatus] ||
        `Status updated to ${String(newStatus || "").replace(/_/g, " ")}`;

      const payload = {
        status: newStatus,
        status_reason: reason,
        reason,
        ...(deliveryBy ? { delivery_option: deliveryBy } : {}),
        ...(extraPayload && typeof extraPayload === "object" ? extraPayload : {}),
      };

      try {
        setUpdating(true);

        await updateStatusApi({
          endpoint: ENV_UPDATE_ORDER || "",
          orderCode,
          payload,
          token,
        });

        const patch = { status: newStatus, status_reason: reason, ...extraPatch };

        setOrder((prev) => ({
          ...prev,
          ...patch,
          status: normalizeStatus(patch.status),
        }));

        DeviceEventEmitter.emit("order-updated", {
          id: String(order?.id || routeOrderId),
          patch: { ...patch, status: normalizeStatus(patch.status) },
        });

        if (showSuccessAlert) {
          Alert.alert("Status updated", `Order marked as ${String(newStatus).replace(/_/g, " ")}`);
        }

        debounceHydrateFromGrouped();
        return true;
      } catch (e) {
        console.log("[OrderDetails] updateSingleStatusLikeCluster error:", e?.message || e);
        Alert.alert("Update failed", String(e?.message || e));
        hydrateFromGrouped();
        return false;
      } finally {
        setUpdating(false);
      }
    },
    [
      order?.order_code,
      order?.id,
      routeOrderId,
      DEFAULT_REASON,
      debounceHydrateFromGrouped,
      hydrateFromGrouped,
    ]
  );

  /* ===========================
     doUpdate (cluster style)
     =========================== */
  const doUpdate = useCallback(
    async (newStatusRaw, opts = {}, skipUnavailableCheck = false) => {
      const currentStatus = normalizeStatus(order?.status || "PENDING");
      const newStatus = normalizeStatus(newStatusRaw);

      if (isDriverAssigned) {
        Alert.alert("Driver controlled", "Driver will update the status for Grab delivery.");
        return;
      }

      const deliveryBy =
        isBothOption && (isSelfSelected || isGrabSelected)
          ? isSelfSelected
            ? "SELF"
            : "GRAB"
          : deliveryOptionInitial || "";

      // DECLINE
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

        await updateSingleStatusLikeCluster({
          newStatus: "DECLINED",
          deliveryBy: deliveryBy || null,
          reasonText: r,
          extraPayload: { cancel_reason: r, cancellation_reason: r },
          extraPatch: { cancel_reason: r, cancellation_reason: r },
          showSuccessAlert: true,
        });
        return;
      }

      // ACCEPT (CONFIRMED) with REMOVE/REPLACE extras
      if (newStatus === "CONFIRMED" && currentStatus === "PENDING") {
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

        const prepVal = Number(manualPrepMin);
        if (!Number.isFinite(prepVal) || prepVal <= 0) {
          Alert.alert(
            "Time required",
            "Please enter the time to prepare (in minutes) before accepting the order."
          );
          return;
        }

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

        const modeUpper = String(ifUnavailableMode || "").toUpperCase();
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

        const reasonText =
          String(opts?.reason || "").trim() ||
          (modeUpper === "REMOVE" && hasChanges
            ? "Some items unavailable"
            : modeUpper === "REPLACE" && hasChanges
              ? "Replaced unavailable item"
              : DEFAULT_REASON.CONFIRMED);

        const feeSnap = getOrderTotalsSnapshot(order, null);

        const final_platform_fee = feeSnap.platform_fee ?? 0;
        const final_discount_amount = feeSnap.discount_amount ?? 0;
        const final_delivery_fee = feeSnap.delivery_fee ?? 0;
        const final_merchant_delivery_fee = feeSnap.merchant_delivery_fee ?? 0;

        const final_total_amount_raw =
          Number(computedItemsTotal || 0) +
          Number(final_platform_fee || 0) +
          Number(final_delivery_fee || 0) +
          Number(final_merchant_delivery_fee || 0) -
          Number(final_discount_amount || 0);

        const final_total_amount = Math.round(final_total_amount_raw * 100) / 100;

        await updateSingleStatusLikeCluster({
          newStatus: "CONFIRMED",
          deliveryBy: deliveryBy || null,
          reasonText,
          extraPayload: {
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
          },
          extraPatch: {
            estimated_arrivial_time: Math.round(prepVal),
            platform_fee: final_platform_fee,
            discount_amount: final_discount_amount,
            delivery_fee: final_delivery_fee,
            merchant_delivery_fee: final_merchant_delivery_fee,
            total: final_total_amount,
            total_amount: final_total_amount,
          },
          showSuccessAlert: true,
        });

        return;
      }

      // OTHER STATUSES
      await updateSingleStatusLikeCluster({
        newStatus,
        deliveryBy: deliveryBy || null,
        reasonText: String(opts?.reason || "").trim(),
        extraPayload: {},
        extraPatch: {},
        showSuccessAlert: true,
      });
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
      isBothOption,
      isSelfSelected,
      isGrabSelected,
      deliveryOptionInitial,
      isDriverAssigned,
      updateSingleStatusLikeCluster,
      DEFAULT_REASON,
    ]
  );

  const next = nextFor(status);
  const primaryLabel =
    status === "PENDING" ? "Accept" : next ? STATUS_META[next]?.label || "Next" : null;

  const onPrimaryAction = useCallback(() => {
    if (!next || updating) return;
    doUpdate(next);
  }, [next, updating, doUpdate]);

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
      } catch { }

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
        } catch { }

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

  /* ===========================
     ✅ CHANGE: GRAB selection navigates immediately to NearbyOrdersScreen
     - No deliver in group
     - No popup/alert
     =========================== */
  const redirectToNearbyOrders = useCallback(async () => {
    const biz =
      businessId ?? paramBusinessId ?? order?.business_id ?? order?.merchant_id ?? null;

    if (!biz) return;

    const targetRoute = resolvedNearbyListRouteName;
    if (!targetRoute) return;

    const focusOrderId = normalizeOrderCode(order?.order_code || order?.id || routeOrderId);

    const payload = {
      businessId: biz,
      business_id: biz,
      merchant_id: biz,
      bizId: biz,

      ownerType: ownerType ?? "food",

      orderEndpoint: ordersGroupedUrl ?? ENV_ORDER_ENDPOINT ?? null,
      ordersGroupedUrl: ordersGroupedUrl ?? ENV_ORDER_ENDPOINT ?? null,

      detailsRoute: "OrderDetails",
      thresholdKm: params.thresholdKm ?? 2,

      fromOrderDetails: true,
      focusOrderId,
      delivery_option: "GRAB",
      deliveryOption: "GRAB",
    };

    const ownerNav = findNavigatorOwningRoute(navigation, targetRoute);
    if (ownerNav && ownerNav !== navigation) {
      ownerNav.dispatch(CommonActions.navigate({ name: targetRoute, params: payload }));
      return;
    }
    navigation.dispatch(CommonActions.navigate({ name: targetRoute, params: payload }));
  }, [
    businessId,
    paramBusinessId,
    order?.business_id,
    order?.merchant_id,
    order?.order_code,
    order?.id,
    routeOrderId,
    ownerType,
    ordersGroupedUrl,
    params.thresholdKm,
    ENV_ORDER_ENDPOINT,
    resolvedNearbyListRouteName,
    navigation,
  ]);

  /* ===========================
     SOCKET: accept + arrived + status updates (NO batch matching)
     =========================== */
  useEffect(() => {
    if (!ENV_RIDE_SOCKET) return;

    let socket;
    let isMounted = true;

    const normalizeKey = (x) => normalizeOrderCode(x ?? "");

    const payloadMatchesThisOrder = (payload) => {
      try {
        const thisOrderCode = normalizeKey(order?.order_code || order?.id || routeOrderId);

        // match by order id/code
        if (!thisOrderCode) return true;

        const extracted = extractOrderIdFromPayload(payload);
        if (extracted && sameOrder(String(extracted), thisOrderCode)) return true;

        // scan drops[] for matching order
        const drops =
          payload?.drops ??
          payload?.data?.drops ??
          payload?.payload?.drops ??
          payload?.message?.drops ??
          null;
        if (Array.isArray(drops)) {
          for (const d of drops) {
            const oid = d?.order_id ?? d?.orderId ?? d?.order_code ?? d?.orderCode ?? null;
            if (oid && sameOrder(String(oid), thisOrderCode)) return true;
          }
        }

        // ✅ allow "no ids" AFTER accepted if payload has coords/status
        if (driverAcceptedRef.current) {
          const hasCoords = !!extractDriverCoords(payload);
          const hasStatus = !!extractStatusFromPayload(payload);
          if (hasCoords || hasStatus) return true;
        }

        return false;
      } catch {
        return true;
      }
    };

    const extractDriverId = (payload) =>
      payload?.driver_id ??
      payload?.driverId ??
      payload?.driver?.id ??
      payload?.driver?.driver_id ??
      payload?.data?.driver_id ??
      payload?.data?.driverId ??
      payload?.data?.driver?.id ??
      null;

    const handleAccepted = async (payload) => {
      driverAcceptedRef.current = true;
      setDriverAccepted(true);

      // save ride_id (batch removed)
      const rid = pickRideId(payload);
      if (rid != null) saveRideId(rid);

      const driverId = extractDriverId(payload);
      if (driverId != null) fetchDriverDetails(driverId);

      const st = extractStatusFromPayload(payload);
      if (st) applySocketStatusToUi(st);

      const stNorm = normalizeStatus(st || order?.status || "READY");
      const stLabel = STATUS_META[stNorm]?.label || stNorm.replace(/_/g, " ");

      const msg = `Driver has accepted. Current status: ${stLabel}`;
      setRideMessage(msg);
      Alert.alert("Driver accepted", msg);
    };

    const handleArrived = async (payload) => {
      setDriverArrived(true);

      const msg =
        payload?.message ||
        payload?.status_message ||
        payload?.note ||
        "Driver has arrived at customer location.";
      setRideMessage(msg);
      Alert.alert("Driver arrived", msg);

      const driverId = extractDriverId(payload);
      if (driverId != null && !driverDetails) fetchDriverDetails(driverId);

      const st = extractStatusFromPayload(payload);
      if (st) applySocketStatusToUi(st);
    };

    const handleStatus = (payload) => {
      const st = extractStatusFromPayload(payload);
      if (!st) return;

      applySocketStatusToUi(st);

      const norm = normalizeStatus(st);
      if (norm === "OUT_FOR_DELIVERY") setRideMessage("Driver is on the way (Out for delivery).");
      else if (norm === "COMPLETED") setRideMessage("Order delivered (Delivery complete).");
    };

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
        } catch { }
      }

      if (!merchantId || !isMounted) return;

      socket = io(ENV_RIDE_SOCKET, {
        transports: ["websocket"],
        query: {
          merchantId: String(merchantId),
          merchant_id: String(merchantId),
          businessId: String(merchantId),
          business_id: String(merchantId),
          role: "merchant",
        },
        auth: { merchantId: String(merchantId), role: "merchant" },
      });

      socketRef.current = socket;

      socket.on("connect", () => {
        if (!isMounted) return;

        // join order room
        try {
          const oid = normalizeKey(order?.order_code || order?.id || routeOrderId);
          if (oid) socket.emit("joinOrder", { orderId: String(oid) }, () => { });
        } catch { }
      });

      const safe = (fn) => (payload) => {
        if (!payloadMatchesThisOrder(payload)) return;
        fn(payload);
      };

      ["deliveryAccepted", "delivery:accepted", "delivery_accept", "accepted"].forEach((ev) =>
        socket.on(ev, safe(handleAccepted))
      );

      ["delivery:driver_arrived", "deliveryDriverArrived", "delivery:arrived", "arrived"].forEach((ev) =>
        socket.on(ev, safe(handleArrived))
      );

      [
        "deliveryStatusUpdate",
        "delivery:status",
        "delivery:status_update",
        "deliveryUpdated",
        "delivery:updated",
        "deliveryJobStatus",
        "jobStatusUpdate",
        "deliveryDriverLocation",
      ].forEach((ev) => socket.on(ev, safe(handleStatus)));

      // fallback: catch-all
      socket.onAny((eventName, payload) => {
        if (!payloadMatchesThisOrder(payload)) return;

        const en = String(eventName || "").toLowerCase();
        const driverId = extractDriverId(payload);

        if (en.includes("accept") && driverId != null) {
          handleAccepted(payload);
          return;
        }
        if (en.includes("arriv")) {
          handleArrived(payload);
          return;
        }

        const st = extractStatusFromPayload(payload);
        if (st) handleStatus(payload);
      });
    })();

    return () => {
      isMounted = false;
      if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
      }
    };
  }, [
    ENV_RIDE_SOCKET,
    order?.order_code,
    order?.id,
    routeOrderId,
    businessId,
    paramBusinessId,
    driverDetails,
    fetchDriverDetails,
    applySocketStatusToUi,
    saveRideId,
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
     ✅ CHANGE: When user selects GRAB, do NOT broadcast.
     Instead: redirect immediately to NearbyOrdersScreen
     =========================== */
  const onSetDeliveryChoice = useCallback(
    async (choice) => {
      const nextChoice = String(choice || "").toLowerCase();
      setDeliveryChoice(nextChoice);

      // reset when switching away from grab
      if (nextChoice !== "grab") {
        setRideMessage("");
        setDriverAccepted(false);
        driverAcceptedRef.current = false;
        setDriverArrived(false);
        return;
      }

      // GRAB selected: reset states then redirect
      setDriverAccepted(false);
      driverAcceptedRef.current = false;
      setDriverArrived(false);
      setRideMessage("");

      await redirectToNearbyOrders();
    },
    [redirectToNearbyOrders]
  );

  const isCancelledByCustomer = useMemo(() => {
    const rawStatus = normalizeStatus(order?.status);
    const reasonRaw =
      order?.status_reason ?? order?.cancel_reason ?? order?.cancellation_reason ?? "";
    const reason = String(reasonRaw || "").toLowerCase();
    const cancelledBy = String(order?.cancelled_by || order?.canceled_by || "").toLowerCase();

    if (cancelledBy && (cancelledBy.includes("customer") || cancelledBy.includes("user"))) return true;

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

  /* ---------------- UI helpers ---------------- */
  const headerTopPad = Math.max(insets.top, S(8)) + S(18);
  const fulfillmentLower = (fulfillment || "").toLowerCase();

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right", "bottom"]}>
      {/* Header */}
      <View style={[styles.headerBar, { paddingTop: headerTopPad }]}>
        <Pressable onPress={goBackToOrders} style={styles.backBtn} hitSlop={hit(S(8))}>
          <Ionicons name="arrow-back" size={S(22)} color="#0f172a" />
        </Pressable>

        <Text style={styles.headerTitle}>Order details</Text>

        <View
          style={{
            width: S(80),
            flexDirection: "row",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: S(10),
          }}
        >
          <Pressable
            onPress={openChatFromOrder}
            style={{
              width: S(36),
              height: S(36),
              borderRadius: S(12),
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: "#D1FAE5",
              backgroundColor: "#F0FDF4",
            }}
            hitSlop={hit(S(8))}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={S(18)} color="#00B14F" />
          </Pressable>

          <ActivityIndicator animating={refreshing} size="small" />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: S(16), paddingBottom: S(24) }}
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
            <View style={{ marginTop: S(8) }}>
              <DeliveryMethodChooser
                status={status}
                isBothOption={isBothOption}
                isTerminalNegative={isTerminalNegative}
                isTerminalSuccess={isTerminalSuccess}
                isSelfSelected={isSelfSelected}
                isGrabSelected={isGrabSelected}
                sendingGrab={false}
                rideMessage={rideMessage}
                driverSummaryText={driverSummaryText}
                driverAccepted={driverAccepted}
                setDeliveryChoice={onSetDeliveryChoice}
                stopGrabLoop={() => { }}
                startGrabLoop={() => { }} // ✅ no popup
                // ✅ deliver-in-group removed
                showDeliverInGroup={false}
                onDeliverInGroup={() => { }}
              />
            </View>

            {/* ✅ Show "Update status" ONLY for SELF */}
            {isSelfSelected && (
              <View style={{ marginTop: S(12) }}>
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
                  onDecline={() => setDeclineOpen(true)}
                  driverAccepted={driverAccepted}
                />
              </View>
            )}

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
