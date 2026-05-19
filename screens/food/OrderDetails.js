// screens/food/OrderDetails.js
// ✅ UPDATED: Accept (CONFIRMED) supports REMOVE / REPLACE payloads
// ✅ FIX: Fees preserved using robust extraction
// ✅ FIX: Item totals parse "BTN. 20" etc.
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
// ✅ CHANGE (LATEST):
// - Delivery options only shown after order is CONFIRMED (status === "CONFIRMED" or "READY" or "OUT_FOR_DELIVERY")
// ✅ NEW: Auto-message customer when item marked as unavailable (REMOVE or REPLACE)

import React, {
  useMemo,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
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
  Modal,
  TextInput,
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
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
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
    const raw =
      Math.abs(asNum - intish) < 1e-9 ? String(intish) : String(asNum);
    return raw.replace(/[^A-Za-z0-9._-]/g, "_") || fallback;
  }

  const s = String(v).trim();
  if (!s) return fallback;
  return s.replace(/[^A-Za-z0-9._-]/g, "_") || fallback;
};

/* ✅ SecureStore keys (scoped by businessId) — ride only (batch removed) */
const keyRideId = (businessId) =>
  `orderdetails_last_ride_id_${toSafeKeyPart(businessId)}`;

const normalizeStatus = (v) => {
  const s = String(v || "")
    .trim()
    .toUpperCase();
  if (!s) return "PENDING";

  if (s === "ACCEPTED") return "CONFIRMED";
  if (s === "ACCEPT") return "CONFIRMED";
  if (s === "CONFIRM") return "CONFIRMED";
  if (s === "PREPARING") return "CONFIRMED";
  if (s === "PICKED_UP" || s === "PICKEDUP" || s === "PICKED UP")
    return "PICKEDUP";

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
  ASSIGNED: 1,
  READY: 2,
  PICKED_UP: 2,
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
          "",
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
  } catch {}

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
  } catch {}
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

  const aTotals =
    a.totals || a.total_breakdown || a.breakdown || a.pricing || null;
  const aBizTotals =
    a.totals_for_business ||
    a.totalsForBusiness ||
    a.business_totals ||
    a.businessTotals ||
    null;

  const bTotals =
    b.totals || b.total_breakdown || b.breakdown || b.pricing || null;
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
    b.charges?.platform_fee,
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
    bBizTotals?.total_discount,
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
    b.charges?.delivery_fee,
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
    b.charges?.merchant_delivery_fee,
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
  it?.item_image ??
  it?.image ??
  it?.image_url ??
  it?.photo ??
  it?.thumbnail ??
  null;

const getItemQty = (it) => {
  const q = Number(
    it?.qty ?? it?.quantity ?? it?.quantity_ordered ?? it?.order_qty ?? 1,
  );
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
    it?.price ??
      it?.unit_price ??
      it?.item_price ??
      it?.rate ??
      it?.selling_price ??
      0,
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
    it?.final_amount,
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
    (items || []).map((it) => [
      String(it?._key ?? getItemMenuId(it) ?? ""),
      it,
    ]),
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
      c.status ??
      c.order_status ??
      c.current_status ??
      c.orderStatus ??
      c.job_status ??
      null;
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
    const ov =
      first?.order_id ??
      first?.orderId ??
      first?.order_code ??
      first?.orderCode ??
      null;
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
      const ov =
        first?.order_id ??
        first?.orderId ??
        first?.order_code ??
        first?.orderCode ??
        null;
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
// Simple status buttons for SELF delivery (no driver messages)
const SelfDeliveryStatusButtons = ({
  status,
  updating,
  onReady,
  onOutForDelivery,
  onComplete,
}) => {
  const statusOrder = ["CONFIRMED", "READY", "OUT_FOR_DELIVERY", "COMPLETED"];
  const currentIndex = statusOrder.indexOf(status);
  const nextStatus = statusOrder[currentIndex + 1];

  if (!nextStatus) return null;

  const getButtonConfig = () => {
    switch (nextStatus) {
      case "READY":
        return {
          label: "Mark as Ready",
          color: "#00B14F",
          icon: "checkmark-circle-outline",
        };
      case "OUT_FOR_DELIVERY":
        return {
          label: "Mark as Out for Delivery",
          color: "#FF9800",
          icon: "bicycle-outline",
        };
      case "COMPLETED":
        return {
          label: "Mark as Completed",
          color: "#4CAF50",
          icon: "checkmark-done-circle-outline",
        };
      default:
        return {
          label: "Update Status",
          color: "#00B14F",
          icon: "arrow-forward-outline",
        };
    }
  };

  const config = getButtonConfig();

  return (
    <Pressable
      style={({ pressed }) => ({
        backgroundColor: pressed ? config.color + "CC" : config.color,
        paddingVertical: 14,
        borderRadius: 12,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        opacity: updating ? 0.7 : 1,
      })}
      onPress={() => {
        if (updating) return;
        switch (nextStatus) {
          case "READY":
            onReady();
            break;
          case "OUT_FOR_DELIVERY":
            onOutForDelivery();
            break;
          case "COMPLETED":
            onComplete();
            break;
        }
      }}
      disabled={updating}
    >
      {updating ? (
        <ActivityIndicator color="#FFFFFF" size="small" />
      ) : (
        <>
          <Ionicons name={config.icon} size={20} color="#FFFFFF" />
          <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "600" }}>
            {config.label}
          </Text>
        </>
      )}
    </Pressable>
  );
};
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
  const deliveryOptionFromParamsRaw =
    params.delivery_option ?? params.deliveryOption ?? null;

  // ✅ ensure id + order_code always exist
  const [order, setOrder] = useState(() => {
    const o = orderProp || {};
    const idRaw = o?.id ?? o?.order_id ?? o?.order_code ?? routeOrderId ?? null;
    const codeRaw =
      o?.order_code ?? o?.order_id ?? o?.id ?? routeOrderId ?? null;

    const feeSnap = getOrderTotalsSnapshot(o, null);

    return {
      ...o,
      id: idRaw != null ? String(idRaw) : undefined,
      order_id: o?.order_id ?? (idRaw != null ? String(idRaw) : undefined),
      order_code: codeRaw != null ? normalizeOrderCode(codeRaw) : undefined,
      status: normalizeStatus(o?.status),
      delivery_address: normalizeDeliveryAddress(
        o?.delivery_address ?? o?.address ?? o?.deliver_to,
      ),

      __user: o?.__user ?? o?.user ?? null,

      platform_fee: feeSnap.platform_fee ?? toMoneyNumber(o?.platform_fee) ?? 0,
      discount_amount:
        feeSnap.discount_amount ?? toMoneyNumber(o?.discount_amount) ?? 0,
      delivery_fee:
        feeSnap.delivery_fee ?? toMoneyNumber(o?.delivery_fee) ?? null,
      merchant_delivery_fee:
        feeSnap.merchant_delivery_fee ??
        toMoneyNumber(o?.merchant_delivery_fee) ??
        null,
    };
  });

  /* ---------- Merchant delivery option & location ---------- */
  const [merchantDeliveryOpt, setMerchantDeliveryOpt] = useState("UNKNOWN");
  const [businessId, setBusinessId] = useState(paramBusinessId);
  const [businessCoords, setBusinessCoords] = useState(null);
  const [lastConversationId, setLastConversationId] = useState(null);
  // Conversation cache for auto-messages
  const conversationCacheRef = useRef({});
  // Update the openChatFromOrder function
  const [pickedUpModalVisible, setPickedUpModalVisible] = useState(false);
  const [pickedUpByName, setPickedUpByName] = useState("");
  const getOrCreateOrderConversation = useCallback(
    async ({
      orderCode,
      customer_id,
      business_id,
      merchant_user_id,
      token,
    }) => {
      const cacheKey = String(orderCode);

      if (conversationCacheRef.current?.[cacheKey]) {
        return conversationCacheRef.current[cacheKey];
      }

      const result = await createOrGetOrderConversationFromOrderDetails({
        orderId: orderCode,
        customer_id: Number(customer_id),
        business_id: Number(business_id),
        merchant_user_id: String(merchant_user_id),
        token,
      });

      const conversationId = result?.conversation_id || result?.conversationId;

      if (conversationId) {
        conversationCacheRef.current[cacheKey] = conversationId;
        setLastConversationId(conversationId);
      }

      return conversationId;
    },
    [],
  );
  const openChatFromOrder = useCallback(async () => {
    try {
      const token = await SecureStore.getItemAsync("auth_token");
      if (!token) {
        Alert.alert(
          "Error",
          "Authentication token not found. Please login again.",
        );
        return;
      }

      // Get merchant user ID
      const merchant_user_id =
        (await SecureStore.getItemAsync("user_id_v1")) ||
        (await SecureStore.getItemAsync("user_id"));

      if (!merchant_user_id) {
        Alert.alert("Error", "Merchant user ID not found. Please login again.");
        return;
      }

      // Get business ID
      const business_id =
        businessId ||
        paramBusinessId ||
        order?.business_id ||
        (await (async () => {
          const saved = await SecureStore.getItemAsync("merchant_login");
          if (saved) {
            try {
              const j = JSON.parse(saved);
              return (
                j?.business_id ||
                j?.user?.business_id ||
                j?.user?.businessId ||
                null
              );
            } catch {}
          }
          return null;
        })());

      if (!business_id) {
        Alert.alert(
          "Error",
          "Business ID not found. Please ensure you're logged in as a merchant.",
        );
        return;
      }

      // Get customer ID
      const customer_id =
        order?.__user?.user_id ||
        order?.__user?.id ||
        order?.user?.user_id ||
        order?.user?.id ||
        order?.customer_id ||
        order?.user_id;

      if (!customer_id) {
        Alert.alert("Error", "Customer information not found in this order.");
        return;
      }

      // Get order code
      const orderCode = normalizeOrderCode(
        order?.order_code || order?.id || routeOrderId,
      );
      if (!orderCode) {
        Alert.alert("Error", "Order code not found.");
        return;
      }

      console.log("[CHAT] Opening chat - Details:", {
        orderCode,
        customerId: customer_id,
        businessId: business_id,
        merchantUserId: merchant_user_id,
      });

      const conversationId = await getOrCreateOrderConversation({
        orderCode,
        customer_id,
        business_id,
        merchant_user_id,
        token,
      });

      if (!conversationId) {
        throw new Error("No conversation ID returned from API");
      }

      const customerName =
        order?.__user?.user_name ||
        order?.__user?.name ||
        order?.customer_name ||
        order?.user_name ||
        order?.user?.name ||
        "Customer";

      // Navigate to chat screen
      navigation.navigate("MerchantChatRoomScreen", {
        conversationId: String(conversationId),
        orderId: String(orderCode),
        userType: "MERCHANT",
        userId: String(merchant_user_id),
        businessId: String(business_id),
        customerId: String(customer_id),
        customerName: customerName,
        meta: {
          customerId: String(customer_id),
          customerName: customerName,
          customer_profile_image:
            order?.__user?.profile_image || order?.__user?.profileImage || "",
        },
        source: "order-details",
      });
    } catch (error) {
      console.error("[CHAT] Error:", error);

      // Handle specific error cases
      if (error.message?.includes("Chat not allowed")) {
        Alert.alert(
          "Chat Not Available",
          "The customer hasn't accepted the chat yet. You can try again later or contact support.",
          [{ text: "OK" }],
        );
      } else {
        Alert.alert(
          "Chat Error",
          error.message ||
            "Failed to open chat. Please check your connection and try again.",
        );
      }
    }
  }, [
    navigation,
    order,
    routeOrderId,
    businessId,
    paramBusinessId,
    getOrCreateOrderConversation,
  ]);
  // Chat with customer about a specific item
  const chatWithCustomerAboutItem = useCallback(
    async (item) => {
      // Just reuse the existing chat function - item parameter is optional
      await openChatFromOrder();

      // Optional: You could also send an auto-message about this specific item
      if (item) {
        const itemName = getItemName(item);
        console.log(`[CHAT] Opening chat from item: ${itemName}`);
        // You could optionally pre-fill a message here if your chat screen supports it
      }
    },
    [openChatFromOrder],
  );
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
  const autoMessageSentRef = useRef(false);
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
  useEffect(() => {
    console.log("[ORDER] Status changed to:", status);
    console.log("[ORDER] isTerminalNegative:", isTerminalNegative);
    console.log("[ORDER] isTerminalSuccess:", isTerminalSuccess);
    console.log("[ORDER] isCancelledByCustomer:", isCancelledByCustomer);
    console.log("[ORDER] isSelfSelected:", isSelfSelected);
  }, [
    status,
    isTerminalNegative,
    isTerminalSuccess,
    isCancelledByCustomer,
    isSelfSelected,
  ]);
  // ✅ Nearby list route candidates (GRAB redirects HERE)
  const NEARBY_LIST_ROUTE_CANDIDATES = useMemo(
    () => [
      "NearbyOrdersScreen",
      "FoodNearbyOrdersScreen",
      "NearbyOrders",
      "FoodNearbyOrders",
      "NearbyOrdersList",
    ],
    [],
  );

  const resolvedNearbyListRouteName = useMemo(() => {
    const preferred =
      params.nearbyOrdersRoute ||
      params.nearbyOrdersScreen ||
      params.nearbyListRoute ||
      null;

    return (
      pickExistingRouteName(navigation, [
        preferred,
        ...NEARBY_LIST_ROUTE_CANDIDATES,
      ]) || null
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
        names.find((n) =>
          /^(Orders|OrderTab|OrdersTab|MartOrders|FoodOrders)$/i.test(n),
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
      }),
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
    }, [goBackToOrders]),
  );
  const handleTrackDriver = useCallback(async () => {
    const biz = businessId ?? paramBusinessId ?? order?.business_id;
    if (!biz) {
      Alert.alert("Error", "Business ID not found");
      return;
    }

    if (!rideId) {
      Alert.alert("Error", "No active delivery found for this order");
      return;
    }

    // Get the order code for focusing
    const orderCode = normalizeOrderCode(
      order?.order_code || order?.id || routeOrderId,
    );

    // Navigate to batch tracking screen with focus parameters
    navigation.navigate("BatchRidesScreen", {
      rideId: rideId,
      businessId: biz,
      orderId: order?.id || routeOrderId,
      orderCode: orderCode,
      focusRideId: rideId, // Focus this specific ride/batch
      focusOrderId: orderCode, // Focus the order within the batch
      highlightCard: true, // Enable highlighting
    });
  }, [rideId, businessId, paramBusinessId, order, routeOrderId, navigation]);
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
    [businessId],
  );

  // ✅ restore saved ride_id (batch removed)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const safeBiz = toSafeKeyPart(businessId);
        if (!safeBiz) return;

        const savedRide = await SecureStore.getItemAsync(keyRideId(safeBiz));
        if (
          !cancelled &&
          savedRide &&
          String(savedRide).trim() &&
          !rideIdRef.current
        ) {
          setRideId(String(savedRide).trim());
        }
      } catch (e) {
        console.log(
          "[OrderDetails] restore saved ride error:",
          e?.message || e,
        );
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
          } catch {}
        }
      }

      const bd = await fetchBusinessDetails({ token, business_id: finalBizId });

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
      console.log(
        "[OrderDetails] BUSINESS_DETAILS fetch error:",
        e?.message || e,
      );
    }
  }, [businessId, paramBusinessId]);

  useEffect(() => {
    loadBusinessDetails();
  }, [loadBusinessDetails]);

  // ✅ RESTORE DELIVERY CHOICE - Add this NEW useEffect here
  useEffect(() => {
    const restoreDeliveryChoice = async () => {
      try {
        const biz = businessId || paramBusinessId;
        const orderKey = order?.id || routeOrderId;
        if (biz && orderKey) {
          const savedChoice = await SecureStore.getItemAsync(
            `order_delivery_choice_${biz}_${orderKey}`,
          );
          if (
            savedChoice &&
            (savedChoice === "grab" || savedChoice === "self")
          ) {
            setDeliveryChoice(savedChoice);
            console.log("[DELIVERY] Restored choice:", savedChoice);
          }
        }
      } catch (e) {
        console.log("[DELIVERY] Failed to restore choice:", e);
      }
    };
    restoreDeliveryChoice();
  }, [businessId, paramBusinessId, order?.id, routeOrderId]);
  // ✅ FIXED: Remove driverDetails from dependencies and add fetch guards
  const hasFetchedDriverRef = useRef(false);
  const fetchAttemptCountRef = useRef(0);
  const MAX_FETCH_ATTEMPTS = 5;

  useEffect(() => {
    let isMounted = true;
    let activeFetch = false;
    let intervalId = null;

    const statusesWithDriver = [
      "ASSIGNED",
      "READY",
      "PICKED_UP",
      "OUT_FOR_DELIVERY",
      "COMPLETED",
    ];

    const fetchDriverInfoFromBatch = async () => {
      // ✅ Stop if already fetched successfully
      if (hasFetchedDriverRef.current) return;

      // ✅ Stop if max attempts reached
      if (fetchAttemptCountRef.current >= MAX_FETCH_ATTEMPTS) {
        console.log("[BATCH-RIDE] Max fetch attempts reached, stopping");
        return;
      }

      // Only fetch if status is one of these
      if (!statusesWithDriver.includes(status)) return;

      if (activeFetch) return;

      const bizId = businessId || paramBusinessId || order?.business_id;
      if (!bizId) return;

      const orderId = normalizeOrderCode(
        order?.order_code || order?.id || routeOrderId,
      );
      if (!orderId) return;

      activeFetch = true;
      fetchAttemptCountRef.current++;

      try {
        const token = await SecureStore.getItemAsync("auth_token");
        const GET_BATCH_RIDE_ID_ENDPOINT =
          "https://backend.tabdhey.bt/grablike/api/batch-ride/get-batch-ride-id";

        const url = `${GET_BATCH_RIDE_ID_ENDPOINT}?business_id=${encodeURIComponent(String(bizId))}`;

        const response = await fetch(url, {
          method: "GET",
          headers: {
            Accept: "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });

        const text = await response.text();
        let json = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {}

        if (!response.ok || !json?.ok) {
          throw new Error(json?.message || `HTTP ${response.status}`);
        }

        const batchData = Array.isArray(json?.data) ? json.data : [];

        // Find batch containing this order
        let foundBatch = null;
        for (const batch of batchData) {
          if (
            Array.isArray(batch.order_ids) &&
            batch.order_ids.includes(orderId)
          ) {
            foundBatch = batch;
            break;
          }
        }

        if (!foundBatch) {
          console.log("[BATCH-RIDE] No batch found for order:", orderId);
          activeFetch = false;
          return;
        }

        const ride_id = foundBatch.ride_id;
        const driver_id = foundBatch.driver_id;

        if (!driver_id) {
          console.log("[BATCH-RIDE] No driver_id found in batch");
          activeFetch = false;
          return;
        }

        // Save ride_id
        if (ride_id) {
          saveRideId(ride_id);
        }

        // Set driver accepted
        if (!driverAcceptedRef.current) {
          driverAcceptedRef.current = true;
          setDriverAccepted(true);
        }

        // Fetch driver details
        const DRIVER_DETAILS_ENDPOINT =
          "https://backend.tabdhey.bt/grablike/api/driver_id";
        const driverUrl = `${DRIVER_DETAILS_ENDPOINT}?driverId=${encodeURIComponent(String(driver_id))}`;

        const driverResponse = await fetch(driverUrl, {
          method: "GET",
          headers: {
            Accept: "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });

        const driverText = await driverResponse.text();
        let driverJson = null;
        try {
          driverJson = driverText ? JSON.parse(driverText) : null;
        } catch {}

        if (driverResponse.ok && driverJson?.ok && driverJson?.details) {
          // ✅ Mark as fetched BEFORE setting state to prevent re-trigger
          hasFetchedDriverRef.current = true;
          setDriverDetails(driverJson.details);

          // Fetch driver rating
          const DIVER_RATING_ENDPOINT =
            "https://backend.tabdhey.bt/grablike/api/ratings";
          const ratingUrl = `${DIVER_RATING_ENDPOINT}?driver_id=${encodeURIComponent(String(driver_id))}&limit=20&offset=0`;

          const ratingResponse = await fetch(ratingUrl, {
            method: "GET",
            headers: {
              Accept: "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          });

          const ratingText = await ratingResponse.text();
          let ratingJson = null;
          try {
            ratingJson = ratingText ? JSON.parse(ratingText) : null;
          } catch {}

          if (ratingResponse.ok && ratingJson?.summary) {
            const avg = ratingJson.summary.avg;
            const count = ratingJson.summary.count;
            setDriverRating({ average: avg, count: count });
          }
        }

        // Set ride message
        let message = "";
        switch (status) {
          case "ASSIGNED":
            message = "Driver has been assigned to your order.";
            break;
          case "READY":
            message = "Order is ready. Driver has been notified.";
            break;
          case "OUT_FOR_DELIVERY":
            message = "Driver is on the way with your order.";
            break;
          case "COMPLETED":
            message = "Order has been delivered.";
            break;
          default:
            message = `Driver assigned. Status: ${status}`;
        }
        setRideMessage(message);

        // ✅ Stop polling once we have driver details
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
      } catch (error) {
        console.log(
          "[BATCH-RIDE] Error fetching driver info:",
          error?.message || error,
        );
      } finally {
        activeFetch = false;
      }
    };

    // Run immediately
    fetchDriverInfoFromBatch();

    // Set up polling ONLY if we haven't fetched yet and haven't exceeded attempts
    if (
      statusesWithDriver.includes(status) &&
      !hasFetchedDriverRef.current &&
      fetchAttemptCountRef.current < MAX_FETCH_ATTEMPTS
    ) {
      intervalId = setInterval(() => {
        if (!isMounted) return;
        if (!hasFetchedDriverRef.current) {
          fetchDriverInfoFromBatch();
        } else if (intervalId) {
          clearInterval(intervalId);
        }
      }, 8000);
    }

    return () => {
      isMounted = false;
      if (intervalId) clearInterval(intervalId);
    };
  }, [
    status,
    businessId,
    paramBusinessId,
    order?.business_id,
    order?.order_code,
    order?.id,
    routeOrderId,
    saveRideId,
  ]); // ✅ REMOVED driverDetails from deps
  /* ---------- Normalize fulfillment ---------- */
  const fulfillment = useMemo(
    () => resolveFulfillmentType({ ...order, params }),
    [order, params],
  );
  const isPickupFulfillment = useMemo(
    () => (fulfillment || "").toLowerCase() === "pickup",
    [fulfillment],
  );
  const orderDeliveryHint = useMemo(
    () => resolveDeliveryOptionFromOrder({ ...order, params }),
    [order, params],
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

  const status = normalizeStatus(order?.status || "PENDING");

  // For ASSIGNED status, force GRAB delivery
  const isGrabDeliveryByStatus = status === "ASSIGNED";

  const isBothOption = deliveryOptionInitial === "BOTH";

  const isPlatformDelivery = useMemo(() => {
    // If status is ASSIGNED, it's definitely a GRAB delivery
    if (isGrabDeliveryByStatus) return true;
    if (isBothOption) return isGrabSelected;
    return deliveryOptionInitial === "GRAB";
  }, [
    isBothOption,
    isGrabSelected,
    deliveryOptionInitial,
    isGrabDeliveryByStatus,
  ]);

  const isSelfSelected = useMemo(() => {
    // If status is ASSIGNED, it's NOT self delivery
    if (isGrabDeliveryByStatus) return false;
    return deliveryChoice === "self";
  }, [deliveryChoice, isGrabDeliveryByStatus]);

  const isGrabSelected = useMemo(() => {
    // If status is ASSIGNED, definitely GRAB
    if (isGrabDeliveryByStatus) return true;
    // If order has delivery_option = GRAB, keep it as GRAB
    if (order?.delivery_option === "GRAB") return true;
    // If driver has already accepted, it's definitely GRAB
    if (driverAccepted) return true;
    // Otherwise use the user's choice
    return deliveryChoice === "grab";
  }, [
    deliveryChoice,
    isGrabDeliveryByStatus,
    order?.delivery_option,
    driverAccepted,
  ]);

  const STATUS_SEQUENCE = useMemo(
    () =>
      isPickupFulfillment
        ? ["PENDING", "CONFIRMED", "READY", "PICKEDUP"]
        : ["PENDING", "CONFIRMED", "READY", "OUT_FOR_DELIVERY", "COMPLETED"],
    [isPickupFulfillment],
  );

  const isTerminalNegative = TERMINAL_NEGATIVE.has(status);
  const isTerminalSuccess =
    TERMINAL_SUCCESS.has(status) ||
    (isPickupFulfillment && status === "PICKEDUP"); // REMOVED "READY" from here

  const isDriverAssigned = useMemo(() => {
    // For ASSIGNED status, merchant can still update to READY
    // Don't block merchant from updating when status is ASSIGNED
    if (status === "ASSIGNED") return false;

    // Driver is assigned when accepted for Grab deliveries
    if (!driverAccepted) return false;

    // For Grab/Platform deliveries
    if (isPlatformDelivery || (isBothOption && isGrabSelected)) return true;

    // For Self deliveries, driver is not assigned
    return false;
  }, [
    driverAccepted,
    isPlatformDelivery,
    isBothOption,
    isGrabSelected,
    status,
  ]);
  const shouldBlockAtReady =
    status === "READY" &&
    (isPlatformDelivery || (isBothOption && isGrabSelected)) &&
    !driverAccepted;

  // Add this new variable for showing ready button after driver accepts
  const shouldShowReadyAfterDriverAccept = useMemo(() => {
    return (
      (isPlatformDelivery || (isBothOption && isGrabSelected)) &&
      driverAccepted &&
      status === "CONFIRMED"
    );
  }, [
    isPlatformDelivery,
    isBothOption,
    isGrabSelected,
    driverAccepted,
    status,
  ]);

  const nextFor = useCallback(
    (curr) => {
      const s = normalizeStatus(curr);
      if (TERMINAL_NEGATIVE.has(s) || TERMINAL_SUCCESS.has(s)) return null;
      if (isPickupFulfillment && s === "READY") return null;

      // For delivery orders, PICKEDUP should go to OUT_FOR_DELIVERY
      if (!isPickupFulfillment && s === "PICKEDUP") return "OUT_FOR_DELIVERY";

      // ✅ Once driver accepted, merchant should not update any status
      if (isDriverAssigned) return null;

      if (s === "READY" && shouldBlockAtReady) return null;

      const idx = STATUS_SEQUENCE.indexOf(s);
      if (idx === -1) return "CONFIRMED";
      return STATUS_SEQUENCE[idx + 1] || null;
    },
    [
      STATUS_SEQUENCE,
      shouldBlockAtReady,
      isPickupFulfillment,
      isDriverAssigned,
    ],
  );

  const displayStatusForProgress =
    status === "ASSIGNED"
      ? "CONFIRMED"
      : status === "PICKED_UP"
        ? "READY"
        : status;
  const stepIndex = findStepIndex(displayStatusForProgress, STATUS_SEQUENCE);
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
  const effectiveUnavailableMode = useMemo(() => {
    const owner = String(ownerType || "").toLowerCase();

    if (owner === "food" && ifUnavailableMode === "OTHER") {
      return "REMOVE";
    }

    return ifUnavailableMode;
  }, [ownerType, ifUnavailableMode]);
  const sendAutoMessageForUnavailable = useCallback(
    async (
      item,
      itemTotal,
      newTotal,
      reason = "",
      mode = "REMOVE",
      replacementItem = null,
      shouldNavigateToChat = true,
    ) => {
      try {
        console.log("[AUTO-MESSAGE] Starting to send auto-message for:", mode);
        console.log("[AUTO-MESSAGE] Item details:", {
          name: getItemName(item),
          total: itemTotal,
          newTotal: newTotal,
          reason: reason,
        });

        const token = await SecureStore.getItemAsync("auth_token");
        if (!token) {
          console.error("[AUTO-MESSAGE] No auth token found");
          return false;
        }

        const merchant_user_id =
          (await SecureStore.getItemAsync("user_id_v1")) ||
          (await SecureStore.getItemAsync("user_id"));

        if (!merchant_user_id) {
          console.error("[AUTO-MESSAGE] No merchant user ID");
          return false;
        }

        const business_id = businessId || paramBusinessId || order?.business_id;
        if (!business_id) {
          console.error("[AUTO-MESSAGE] No business ID");
          return false;
        }

        const customer_id =
          order?.customer_id || order?.__user?.user_id || order?.user?.user_id;

        if (!customer_id) {
          console.error("[AUTO-MESSAGE] No customer ID");
          return false;
        }

        const orderCode = normalizeOrderCode(
          order?.order_code || order?.id || routeOrderId,
        );
        if (!orderCode) {
          console.error("[AUTO-MESSAGE] No order code");
          return false;
        }

        const itemName = getItemName(item);
        const qty = getItemQty(item);
        const reasonText = reason ? ` Reason: ${reason}` : "";

        let message = "";

        if (mode === "REMOVE") {
          message = `❌ *${itemName}* (×${qty}) has been REMOVED from your order as it is currently unavailable.${reasonText}\n\n💰 *New order total:* ${money(newTotal, "BTN.")}\n\nWe apologize for any inconvenience caused.`;
        } else if (mode === "REPLACE" && replacementItem) {
          const replacementName = getItemName(replacementItem);
          const replacementPrice = getItemUnitPrice(replacementItem);
          const replacementTotal = replacementPrice * qty;

          message = `🔄 *${itemName}* (×${qty}) is currently out of stock.\n\n`;
          message += `📋 *Suggested replacement:*\n`;
          message += `✅ *${replacementName}*\n`;
          message += `💰 Price: ${money(replacementPrice, "BTN.")} (×${qty}) = ${money(replacementTotal, "BTN.")}\n\n`;
          message += `💬 *How to proceed:*\n`;
          message += `• Reply "YES" to accept this replacement\n`;
          message += `• Tap "Browse Similar Items" below to see more options\n`;
          message += `• Suggest an alternative item\n\n`;
          message += `💰 *New order total:* ${money(newTotal, "BTN.")}${reasonText}\n\n`;
          message += `*Please respond within 10 minutes.*`;
        }

        // ✅ FIX: If message is empty, create a fallback
        if (!message || message.trim() === "") {
          console.warn("[AUTO-MESSAGE] Message was empty, using fallback");
          message = `❌ *${itemName}* (×${qty}) has been REMOVED from your order as it is currently unavailable.${reasonText}\n\n💰 *New order total:* ${money(newTotal, "BTN.")}\n\nWe apologize for any inconvenience caused.`;
        }

        console.log("[AUTO-MESSAGE] Message content length:", message.length);
        console.log(
          "[AUTO-MESSAGE] First 100 chars:",
          message.substring(0, 100),
        );

        const conversationId = await getOrCreateOrderConversation({
          orderCode,
          customer_id,
          business_id,
          merchant_user_id,
          token,
        });

        if (!conversationId) {
          console.error("[AUTO-MESSAGE] Failed to get conversation ID");
          return false;
        }
        setLastConversationId(conversationId);
        console.log("[AUTO-MESSAGE] Got conversation ID:", conversationId);

        // Send the message using fetch
        const sendResponse = await fetch(
          `https://backend.tabdhey.bt/chat/chat/messages/${conversationId}`,
          {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
              "x-business-id": String(business_id),
              "x-user-id": String(merchant_user_id),
              "x-user-type": "MERCHANT",
            },
            body: JSON.stringify({
              body: message,
              message_type: "TEXT",
            }),
          },
        );

        const responseData = await sendResponse.json();

        if (sendResponse.ok) {
          console.log("[AUTO-MESSAGE] Message sent successfully!");
          console.log("[AUTO-MESSAGE] Response:", responseData);
        } else {
          console.error("[AUTO-MESSAGE] Failed to send message:", responseData);
          return false;
        }

        // Only navigate to chat if requested
        if (
          shouldNavigateToChat &&
          navigation &&
          mode !== "REMOVE_WITH_DECLINE"
        ) {
          setTimeout(() => {
            try {
              const customerName =
                order?.customer_name ||
                order?.user_name ||
                order?.__user?.user_name ||
                order?.__user?.name ||
                "Customer";

              navigation.navigate("MerchantChatRoomScreen", {
                conversationId: String(conversationId),
                orderId: String(orderCode),
                userType: "MERCHANT",
                userId: String(merchant_user_id),
                businessId: String(business_id),
                customerId: String(customer_id),
                customerName: customerName,
                meta: {
                  customerId: String(customer_id),
                  customerName: customerName,
                  customer_profile_image: order?.__user?.profile_image || "",
                },
                source: "order-details-auto",
              });
            } catch (navError) {
              console.log("[AUTO-MESSAGE] Navigation error:", navError);
            }
          }, 500);
        }

        return true;
      } catch (err) {
        console.error("[AUTO-MESSAGE] Error:", err);
        Alert.alert(
          "Message Error",
          "Failed to send auto-message to customer. Please try again or contact support.",
        );
        return false;
      }
    },
    [order, routeOrderId, businessId, paramBusinessId, navigation, money],
  );
  const checkAndAutoDeclineIfZeroTotal = useCallback(
    async (newTotal, shouldNavigateToChat = true) => {
      if (newTotal <= 0) {
        console.log("[ORDER] Total became zero, auto-declining order");

        // Auto-decline the order
        const declineSuccess = await updateSingleStatusLikeCluster({
          newStatus: "DECLINED",
          deliveryBy: null,
          reasonText: "All items unavailable - Out of stock",
          extraPayload: {
            cancel_reason: "All items unavailable",
            cancellation_reason: "Out of stock - All items removed",
            total_amount: 0,
            final_total_amount: 0,
          },
          extraPatch: {
            cancel_reason: "All items unavailable",
            total: 0,
            total_amount: 0,
          },
          showSuccessAlert: false, // Don't show auto alert
        });

        if (declineSuccess) {
          // ✅ FORCE status update in state
          setOrder((prev) => ({
            ...prev,
            status: "DECLINED",
          }));

          // ✅ Force refresh to ensure UI updates
          await hydrateFromGrouped();

          // First, try to get the conversation ID to open chat
          let conversationId = null;
          let customerName = "Customer";
          let merchant_user_id = null;
          let business_id = null;
          let customer_id = null;

          try {
            // Try to get existing conversation or create one
            const token = await SecureStore.getItemAsync("auth_token");
            merchant_user_id =
              (await SecureStore.getItemAsync("user_id_v1")) ||
              (await SecureStore.getItemAsync("user_id"));
            business_id = businessId || paramBusinessId || order?.business_id;
            customer_id =
              order?.customer_id ||
              order?.__user?.user_id ||
              order?.user?.user_id;
            const orderCode = normalizeOrderCode(
              order?.order_code || order?.id || routeOrderId,
            );

            if (
              token &&
              merchant_user_id &&
              business_id &&
              customer_id &&
              orderCode
            ) {
              const convResult =
                await createOrGetOrderConversationFromOrderDetails({
                  orderId: orderCode,
                  customer_id: Number(customer_id),
                  business_id: Number(business_id),
                  merchant_user_id: String(merchant_user_id),
                  token: token,
                });
              conversationId =
                convResult?.conversation_id || convResult?.conversationId;
              customerName =
                convResult?.meta?.customerName ||
                order?.__user?.user_name ||
                order?.__user?.name ||
                "Customer";
            }
          } catch (err) {
            console.log(
              "[ORDER] Failed to get conversation for chat option:",
              err,
            );
          }

          Alert.alert(
            "Order Auto-Declined",
            "All items have been removed from this order. The order has been automatically declined due to out of stock.\n\nA message has been sent to the customer.\n\nWhat would you like to do?",
            [
              {
                text: "Stay",
                onPress: () => {
                  console.log("[ORDER] User chose to stay");
                },
                style: "default",
              },
              {
                text: "Go to Chat",
                onPress: async () => {
                  console.log("[ORDER] User chose to go to chat");
                  // ✅ Use the saved conversation ID instead of creating a new one
                  if (
                    lastConversationId &&
                    merchant_user_id &&
                    business_id &&
                    customer_id
                  ) {
                    try {
                      navigation.navigate("MerchantChatRoomScreen", {
                        conversationId: String(lastConversationId),
                        orderId: String(
                          order?.order_code || order?.id || routeOrderId,
                        ),
                        userType: "MERCHANT",
                        userId: String(merchant_user_id),
                        businessId: String(business_id),
                        customerId: String(customer_id),
                        customerName: customerName,
                        meta: {
                          customerId: String(customer_id),
                          customerName: customerName,
                          customer_profile_image:
                            order?.__user?.profile_image || "",
                        },
                        source: "order-details-auto-decline",
                      });
                    } catch (navError) {
                      console.log("[ORDER] Navigation error:", navError);
                      Alert.alert(
                        "Error",
                        "Could not open chat. Please try again.",
                      );
                    }
                  } else {
                    // Fallback to regular chat open
                    await openChatFromOrder();
                  }
                },
              },
            ],
            { cancelable: false },
          );
          return true;
        } else {
          Alert.alert("Error", "Failed to decline order. Please try again.", [
            { text: "OK" },
          ]);
          return false;
        }
      }
      return false;
    },
    [
      updateSingleStatusLikeCluster,
      hydrateFromGrouped, // ✅ Add this dependency
      goBackToOrders,
      businessId,
      paramBusinessId,
      order,
      routeOrderId,
      navigation,
      openChatFromOrder,
      lastConversationId,
    ],
  );
  const handleMarkItemUnavailable = useCallback(
    async (
      key,
      item,
      reason = "",
      replacementItem = null,
      shouldNavigateToChat = true,
      forceRemove = false,
    ) => {
      if (normalizeStatus(status) !== "PENDING") {
        Alert.alert(
          "Cannot modify",
          "Items can only be marked unavailable for pending orders.",
        );
        return false;
      }

      // Prevent duplicate marking
      if (itemUnavailableMap[key]) {
        console.log("[DEBUG] Item already marked unavailable, skipping");
        return false;
      }

      // Reset auto-message sent flag
      // autoMessageSentRef.current = false;
      const actualMode = forceRemove ? "REMOVE" : effectiveUnavailableMode;
      const itemName = getItemName(item);
      const itemPrice = getItemUnitPrice(item);
      const itemQty = getItemQty(item);
      const itemTotal = itemPrice * itemQty;

      // Calculate new total after removal/replacement
      let newSubtotal = 0;
      let remainingItemsCount = 0;

      items.forEach((it) => {
        const itKey = it._key;
        if (itKey === key) {
          // Skip the item being removed
          if (ifUnavailableMode === "REMOVE") return;
          // If we have a replacement, use its price instead
          if (ifUnavailableMode === "REPLACE" && replacementItem) {
            const replacementPrice = getItemUnitPrice(replacementItem);
            const qty = getItemQty(it);
            newSubtotal += replacementPrice * qty;
            remainingItemsCount++;
          }
          return;
        }
        // Check if item is already marked unavailable
        if (ifUnavailableMode === "REMOVE" && itemUnavailableMap[itKey]) return;

        const itPrice = getItemUnitPrice(it);
        const itQty = getItemQty(it);
        newSubtotal += itPrice * itQty;
        remainingItemsCount++;
      });

      // ✅ FIX: Calculate fees properly
      let deliveryFee = feeSnapForUi.delivery_fee ?? 0;
      const merchantDeliveryFee = feeSnapForUi.merchant_delivery_fee ?? 0;
      const discount = feeSnapForUi.discount_amount ?? 0;
      const platformFee = feeSnapForUi.platform_fee ?? 0;

      // ✅ If no items remain, set ALL fees to 0
      let finalTotal = 0;
      let finalDeliveryFee = deliveryFee;

      // ✅ FIX: Use actualMode instead of ifUnavailableMode
      if (remainingItemsCount === 0 && actualMode === "REMOVE") {
        // No items left - total should be 0
        finalTotal = 0;
        finalDeliveryFee = 0;
        console.log(
          "[ORDER] No items remaining, setting total to 0 and fees to 0",
        );
      } else {
        // Calculate normal total
        finalTotal = Math.max(
          0,
          newSubtotal +
            deliveryFee +
            merchantDeliveryFee +
            platformFee -
            discount,
        );
      }

      console.log("[ORDER] finalTotal calculation:", {
        remainingItemsCount,
        actualMode,
        newSubtotal,
        deliveryFee,
        merchantDeliveryFee,
        platformFee,
        discount,
        finalTotal,
      });

      /// ✅ FIX: Use actualMode instead of ifUnavailableMode for auto-decline check
      if (finalTotal === 0 && actualMode === "REMOVE") {
        Alert.alert(
          "Order Empty - Auto Decline",
          `${itemName} is the last item in this order. Removing it will result in an empty order (total BTN. 0).\n\nThe order will be automatically declined due to "Out of Stock".`,
          [
            {
              text: "Cancel",
              style: "cancel",
              onPress: () => {
                setItemUnavailableMap((prev) => {
                  const newMap = { ...prev };
                  delete newMap[key];
                  return newMap;
                });
              },
            },
            {
              text: "Proceed & Decline",
              onPress: async () => {
                // Mark as unavailable
                setItemUnavailableMap((prev) => ({ ...prev, [key]: true }));

                // Send message
                if (!autoMessageSentRef.current) {
                  autoMessageSentRef.current = true;
                  await sendAutoMessageForUnavailable(
                    item,
                    itemTotal,
                    0,
                    "Order empty - all items unavailable",
                    "REMOVE",
                    null,
                    false, // Don't navigate
                  );
                }

                // Decline order
                setTimeout(async () => {
                  try {
                    setUpdating(true);

                    // ✅ IMMEDIATELY update local status to hide buttons
                    setOrder((prev) => ({
                      ...prev,
                      status: "DECLINED",
                    }));

                    const declineSuccess = await updateSingleStatusLikeCluster({
                      newStatus: "DECLINED",
                      deliveryBy: deliveryOptionInitial || null,
                      reasonText:
                        "Out of stock - all ordered items are unavailable",
                      extraPayload: {
                        cancel_reason: "Out of stock - all items unavailable",
                        cancellation_reason:
                          "Out of stock - all items removed from order",
                        total_amount: 0,
                        final_total_amount: 0,
                      },
                      extraPatch: {
                        cancel_reason: "Out of stock - all items unavailable",
                        total: 0,
                        total_amount: 0,
                      },
                      showSuccessAlert: false,
                    });

                    if (declineSuccess) {
                      // ✅ Force refresh from server to sync
                      await hydrateFromGrouped();

                      Alert.alert(
                        "Order Declined",
                        "Order has been declined due to all items being out of stock.\n\nA message has been sent to the customer.\n\nWhat would you like to do?",
                        [
                          {
                            text: "Stay",
                            onPress: () => {
                              console.log("[ORDER] User chose to stay");
                            },
                          },
                          {
                            text: "Go to Chat",
                            onPress: async () => {
                              console.log("[ORDER] User chose to go to chat");
                              await openChatFromOrder();
                            },
                          },
                        ],
                      );
                    }
                  } catch (error) {
                    console.log("[ORDER] Auto-decline error:", error);
                    Alert.alert("Error", "Failed to decline order");
                  } finally {
                    setUpdating(false);
                  }
                }, 1500);
              },
            },
          ],
        );
        return false;
      }

      // Mark as unavailable immediately
      setItemUnavailableMap((prev) => ({ ...prev, [key]: true }));

      // ✅ FIX: Use actualMode instead of ifUnavailableMode
      const mode = actualMode === "REPLACE" ? "REPLACE" : "REMOVE";
      console.log(
        `[ORDER] Sending auto-message with mode: ${mode} (actualMode: ${actualMode}, forceRemove: ${forceRemove})`,
      );
      // Always send message for this item, regardless of count
      // Reset the flag for this specific operation
      const messageSent = await sendAutoMessageForUnavailable(
        item,
        itemTotal,
        finalTotal,
        reason,
        mode, // ✅ Now uses actualMode
        replacementItem,
        shouldNavigateToChat,
      );

      if (messageSent) {
        console.log(`[ORDER] Auto-message sent for item: ${getItemName(item)}`);
      } else {
        console.log(
          `[ORDER] Failed to send auto-message for item: ${getItemName(item)}`,
        );
      }

      if (mode === "REPLACE" && replacementItem) {
        setItemReplacementMap((prev) => ({ ...prev, [key]: replacementItem }));
        console.log(
          `[ORDER] Item ${itemName} replaced with ${getItemName(replacementItem)}.`,
        );

        Alert.alert(
          "Item Replaced",
          `${itemName} has been replaced with ${getItemName(replacementItem)}.\n\nNew total: ${money(finalTotal, "BTN.")}`,
          [{ text: "OK" }],
        );
      } else {
        // ✅ Show different message based on whether it was force removed or not
        const removalType = forceRemove ? "removed" : "marked as unavailable";
        console.log(`[ORDER] Item ${itemName} ${removalType}.`);

        Alert.alert(
          "Item Removed",
          `${itemName} has been ${removalType}.\n\nNew total: ${money(finalTotal, "BTN.")}`,
          [{ text: "OK" }],
        );
      }

      return true;
    },
    [
      status,
      items,
      itemUnavailableMap,
      ifUnavailableMode,
      feeSnapForUi,
      sendAutoMessageForUnavailable,
      updateSingleStatusLikeCluster,
      goBackToOrders,
      deliveryOptionInitial,
      setUpdating,
      money,
    ],
  );

  /* ===========================
      Handle replacement selection with auto-message
      =========================== */
  const handleReplacementWithNotification = useCallback(
    async (itemKey, replacement) => {
      if (!itemKey || !replacement) return;

      // Find the original item
      const originalItem = items.find((it) => it._key === itemKey);
      if (!originalItem) return;

      // Mark as unavailable with replacement
      await handleMarkItemUnavailable(itemKey, originalItem, "", replacement);
    },
    [items, handleMarkItemUnavailable],
  );

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
          encodeURIComponent(String(bizId)),
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
            g.phone ??
            blockUser?.phone ??
            blockUser?.phone_number ??
            blockUser?.mobile ??
            "";

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
        sameOrder(o?.id ?? o?.order_id ?? o?.order_code, routeOrderId),
      );
      if (!match) return;

      const matchStatus = normalizeStatus(match?.status ?? "PENDING");
      const localStatus = normalizeStatus(order?.status ?? "PENDING");

      // ✅ If local status is DECLINED, keep it (don't override with PENDING from server)
      let finalStatus;
      if (localStatus === "DECLINED") {
        finalStatus = "DECLINED";
      } else {
        finalStatus = isHigherOrEqualStatus(localStatus, matchStatus)
          ? localStatus
          : matchStatus;
      }

      const feeSnap = getOrderTotalsSnapshot(match, order);

      const normalizedFromMatch = {
        ...match,
        id: String(
          match?.id ?? match?.order_id ?? match?.order_code ?? routeOrderId,
        ),
        order_id: String(
          match?.order_id ?? match?.id ?? match?.order_code ?? routeOrderId,
        ),
        order_code: normalizeOrderCode(
          match?.order_code ?? match?.id ?? routeOrderId,
        ),

        __user: match?.__user ?? match?.user ?? null,

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
          match?.delivery_address ?? match?.address ?? match?.deliver_to,
        ),
        raw_items: Array.isArray(match?.raw_items)
          ? match.raw_items
          : Array.isArray(match?.items)
            ? match.items
            : [],
        total: match?.total ?? match?.total_amount ?? order?.total ?? 0,
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

        delivery_fee: feeSnap.delivery_fee ?? null,
        merchant_delivery_fee: feeSnap.merchant_delivery_fee ?? null,
        platform_fee: feeSnap.platform_fee ?? 0,
        discount_amount: feeSnap.discount_amount ?? 0,

        totals_for_business:
          match?.totals_for_business ?? order?.totals_for_business ?? null,
        totals: match?.totals ?? order?.totals ?? null,
      };

      setOrder((prevOrderState) => {
        // ✅ Preserve DECLINED status if already set
        const shouldKeepDeclined = prevOrderState?.status === "DECLINED";

        return {
          ...prevOrderState,
          ...normalizedFromMatch,
          status: shouldKeepDeclined
            ? "DECLINED"
            : normalizeStatus(normalizedFromMatch.status),
          delivery_address: normalizeDeliveryAddress(
            normalizedFromMatch?.delivery_address ??
              prevOrderState?.delivery_address ??
              prevOrderState?.address,
          ),
          __user:
            normalizedFromMatch.__user ??
            prevOrderState.__user ??
            prevOrderState.user ??
            null,
        };
      });
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
    }, [hydrateFromGrouped]),
  );

  const debounceHydrateFromGrouped = useCallback(() => {
    if (socketHydrateTimerRef.current)
      clearTimeout(socketHydrateTimerRef.current);
    socketHydrateTimerRef.current = setTimeout(() => {
      socketHydrateTimerRef.current = null;
      hydrateFromGrouped();
    }, 350);
  }, [hydrateFromGrouped]);

  useFocusEffect(
    useCallback(() => {
      if (liveRefreshTimerRef.current)
        clearInterval(liveRefreshTimerRef.current);

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
    }, [
      hydrateFromGrouped,
      isScheduledOrder,
      isTerminalNegative,
      isTerminalSuccess,
    ]),
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
    const addrLat = addr ? (addr.lat ?? addr.latitude) : null;
    const addrLng = addr ? (addr.lng ?? addr.lon ?? addr.longitude) : null;

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
        ? (addr.city ?? addr.town ?? addr.dzongkhag)
        : null) ??
      "thimphu";

    return {
      lat: Number(lat),
      lng: Number(lng),
      cityId: String(cityId || "thimphu").toLowerCase(),
    };
  }, [order]);
  // Add this near your other useEffects (around line 800)
  useEffect(() => {
    autoMessageSentRef.current = false;
  }, [routeOrderId]);
  // ✅ Reset driver fetch refs when order changes - MOVE THIS OUTSIDE
  useEffect(() => {
    hasFetchedDriverRef.current = false;
    fetchAttemptCountRef.current = 0;
  }, [routeOrderId]);

  // ✅ Keep the route calculation useEffect separate
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
  // ✅ REPLACED: Handle similar item selection with auto-message
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      "similar-item-chosen",
      ({ itemKey, replacement }) => {
        if (!itemKey || !replacement) return;

        // Send auto-message for replacement
        handleReplacementWithNotification(itemKey, replacement);
      },
    );
    return () => sub?.remove?.();
  }, [handleReplacementWithNotification]);

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
    [],
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
        if (isHigherOrEqualStatus(prevStatus, norm))
          return { ...prev, ...extraPatch };

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
    [routeOrderId, order?.status, debounceHydrateFromGrouped],
  );

  /* ---------------- Items ---------------- */
  const items = useMemo(() => {
    const raw = Array.isArray(order?.raw_items) ? order.raw_items : [];
    return raw.map((it, idx) => ({
      ...it,
      _key: String(
        it.item_id || it.menu_id || it.id || it.itemId || it.menuId || idx,
      ),
    }));
  }, [order?.raw_items]);

  const originalItemsTotal = useMemo(() => sumItemsTotal(items), [items]);

  const computedItemsTotal = useMemo(() => {
    if (ifUnavailableMode !== "REMOVE" && ifUnavailableMode !== "REPLACE")
      return originalItemsTotal;

    let total = 0;

    items.forEach((it) => {
      const key = it._key;
      const qty = getItemQty(it);
      const oldLineTotal = getItemLineTotal(it);
      const isUnavailable = !!itemUnavailableMap[key];
      const hasReplacement = !!itemReplacementMap[key];

      // For REMOVE mode - skip removed items
      if (ifUnavailableMode === "REMOVE") {
        if (isUnavailable) return;
        total += oldLineTotal;
        return;
      }

      // For REPLACE mode - skip unavailable items without replacement
      if (isUnavailable && !hasReplacement) {
        console.log(
          `[ORDER] Skipping item ${key} - unavailable without replacement`,
        );
        return;
      }

      // If there's a replacement, use replacement price
      const repl = itemReplacementMap[key];
      if (repl) {
        const newUnitPrice =
          toMoneyNumber(repl?.price) ?? getItemUnitPrice(repl);
        total += qty * (Number(newUnitPrice) || 0);
      } else {
        total += oldLineTotal;
      }
    });

    console.log("[ORDER] computedItemsTotal:", total);
    return total;
  }, [
    items,
    ifUnavailableMode,
    itemUnavailableMap,
    itemReplacementMap,
    originalItemsTotal,
  ]);

  const feeSnapForUi = useMemo(
    () => getOrderTotalsSnapshot(order, null),
    [order],
  );

  const displayGrandTotal = useMemo(() => {
    const df = feeSnapForUi.delivery_fee ?? 0;
    const mdf = feeSnapForUi.merchant_delivery_fee ?? 0;
    const disc = feeSnapForUi.discount_amount ?? 0;

    const raw =
      Number(computedItemsTotal || 0) +
      Number(df || 0) +
      Number(mdf || 0) -
      Number(disc || 0);
    return Math.round(raw * 100) / 100;
  }, [computedItemsTotal, feeSnapForUi]);

  const { effectiveTotalLabel, effectiveItemsCount } = useMemo(() => {
    let count = 0;
    items.forEach((it) => {
      const key = it._key;
      const isUnavailable = !!itemUnavailableMap[key];
      const hasReplacement = !!itemReplacementMap?.[key];

      // Skip if item is marked as unavailable without replacement
      if (isUnavailable && !hasReplacement) {
        return;
      }
      count += getItemQty(it);
    });

    console.log("[ORDER] effectiveItemsCount:", count);

    // Calculate total properly
    let totalToShow = displayGrandTotal;
    if (count === 0) {
      totalToShow = 0;
    }

    return {
      effectiveTotalLabel: money(totalToShow),
      effectiveItemsCount: count,
    };
  }, [items, displayGrandTotal, itemUnavailableMap, itemReplacementMap]);
  const handleToggleUnavailable = useCallback(
    (key) => {
      if (normalizeStatus(status) !== "PENDING") return;
      setItemUnavailableMap((prev) => ({ ...prev, [key]: !prev[key] }));
    },
    [status],
  );

  // Update handleOpenSimilarCatalog to indicate we want to navigate to chat after replacement
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
        shouldNavigateToChatAfterReplace: true, // NEW: Will trigger chat after replacement
      });
    },
    [
      ifUnavailableMode,
      navigation,
      businessId,
      paramBusinessId,
      order,
      ownerType,
    ],
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
        ...(extraPayload && typeof extraPayload === "object"
          ? extraPayload
          : {}),
      };

      try {
        setUpdating(true);

        // ✅ Update local state IMMEDIATELY before API call
        const immediatePatch = {
          status: newStatus,
          status_reason: reason,
          ...extraPatch,
        };

        setOrder((prev) => ({
          ...prev,
          ...immediatePatch,
          status: normalizeStatus(immediatePatch.status),
        }));

        await updateStatusApi({
          endpoint: ENV_UPDATE_ORDER || "",
          orderCode,
          payload,
          token,
        });

        const patch = {
          status: newStatus,
          status_reason: reason,
          ...extraPatch,
        };

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
          Alert.alert(
            "Status updated",
            `Order marked as ${String(newStatus).replace(/_/g, " ")}`,
          );
        }

        debounceHydrateFromGrouped();
        return true;
      } catch (e) {
        console.log(
          "[OrderDetails] updateSingleStatusLikeCluster error:",
          e?.message || e,
        );
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
    ],
  );

  /* ===========================
      doUpdate (cluster style)
      =========================== */
  const doUpdate = useCallback(
    async (newStatusRaw, opts = {}, skipUnavailableCheck = false) => {
      // ✅ Prevent actions on declined orders
      if (status === "DECLINED" || isTerminalNegative) {
        Alert.alert("Cannot update", "This order has already been declined.");
        return;
      }
      const currentStatus = normalizeStatus(order?.status || "PENDING");
      const newStatus = normalizeStatus(newStatusRaw);
      // Allow merchant to update from ASSIGNED to READY
      // But block other updates when driver is assigned (except ASSIGNED status)
      if (isDriverAssigned && currentStatus !== "ASSIGNED") {
        Alert.alert(
          "Driver controlled",
          "Driver will update the status for Tabdhey delivery.",
        );
        return;
      }

      const deliveryBy =
        isBothOption && (isSelfSelected || isGrabSelected)
          ? isSelfSelected
            ? "SELF"
            : "GRAB"
          : deliveryOptionInitial || "";

      // PICKEDUP (for pickup orders)
      if (newStatus === "PICKEDUP") {
        // Use the passed name from opts, or fall back to state, or default
        const pickupName =
          opts?.pickupName || pickedUpByName || "Store Manager";
        console.log("[PICKUP] Setting pickedup_by to:", pickupName);

        // Force a complete state update with all fields
        const updatedOrder = {
          ...order,
          status: "PICKEDUP",
          pickedup_by: pickupName,
          picked_up_by: pickupName,
          pickup_by: pickupName,
          status_timestamps: {
            ...(order?.status_timestamps || {}),
            PICKEDUP: new Date().toISOString(),
          },
        };

        console.log(
          "[PICKUP] Updated order object:",
          JSON.stringify(updatedOrder, null, 2),
        );

        // Update the entire order state at once
        setOrder(updatedOrder);

        // Call API in background
        updateSingleStatusLikeCluster({
          newStatus: "PICKEDUP",
          deliveryBy: deliveryBy || null,
          reasonText: `Order picked up by ${pickupName}`,
          extraPayload: {
            pickedup_by: pickupName,
            picked_up_by: pickupName,
            pickup_by: pickupName,
            pickedup_at: new Date().toISOString(),
          },
          extraPatch: {
            pickedup_by: pickupName,
            picked_up_by: pickupName,
            pickup_by: pickupName,
            status: "PICKEDUP",
            status_timestamps: {
              ...(order?.status_timestamps || {}),
              PICKEDUP: new Date().toISOString(),
            },
          },
          showSuccessAlert: false,
        }).catch((err) => {
          console.log("[PICKUP] API error:", err);
        });

        return;
      }
      // DECLINE
      if (newStatus === "DECLINED") {
        const r = String(opts?.reason ?? "").trim();
        if (r.length < 3) {
          setDeclineOpen(true);
          Alert.alert(
            "Reason required",
            "Please provide at least 3 characters explaining why the order is declined.",
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
              {
                text: "Accept",
                onPress: () => doUpdate("CONFIRMED", opts, true),
              },
            ],
          );
          return;
        }

        const prepVal = Number(manualPrepMin);
        if (!Number.isFinite(prepVal) || prepVal <= 0) {
          Alert.alert(
            "Time required",
            "Please enter the time to prepare (in minutes) before accepting the order.",
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

        const final_total_amount =
          Math.round(final_total_amount_raw * 100) / 100;

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
            delivery_option: deliveryBy,
          },
          showSuccessAlert: true,
        });

        return;
      }

      // OTHER STATUSES (including READY)
      // For GRAB deliveries, ensure delivery_option stays as GRAB when updating to READY
      const finalDeliveryBy =
        newStatus === "READY" && isGrabSelected ? "GRAB" : deliveryBy;
      const finalExtraPatch =
        newStatus === "READY" && isGrabSelected
          ? { delivery_option: "GRAB" }
          : {};

      await updateSingleStatusLikeCluster({
        newStatus,
        deliveryBy: finalDeliveryBy || null,
        reasonText: String(opts?.reason || "").trim(),
        extraPayload: {},
        extraPatch: finalExtraPatch,
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
      status, // ✅ ADD THIS - critical for status updates
      isTerminalNegative,
    ],
  );

  const next = nextFor(status);
  const primaryLabel =
    status === "PENDING"
      ? "Accept"
      : next
        ? STATUS_META[next]?.label ||
          (next === "PICKED_UP" ? STATUS_META.READY?.label : null) ||
          "Next"
        : null;

  const onPrimaryAction = useCallback(() => {
    if (!next || updating) return;
    doUpdate(next);
  }, [next, updating, doUpdate]);

  const canDecline = useMemo(
    () => String(declineReason).trim().length >= 3,
    [declineReason],
  );

  const confirmDecline = useCallback(() => {
    const r = String(declineReason).trim();
    if (r.length < 3) {
      Alert.alert(
        "Reason required",
        "Please type a brief reason (min 3 characters).",
      );
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
  }, [
    order?.eta_minutes,
    order?.estimated_arrivial_time,
    manualPrepMin,
    routeInfo,
  ]);

  /* ---------- Driver rating fetch (simplified - now handled by batch effect) ---------- */
  const fetchDriverRating = useCallback(async (driverId) => {
    try {
      const DIVER_RATING_ENDPOINT =
        "https://backend.tabdhey.bt/grablike/api/ratings";
      const ratingUrl = `${DIVER_RATING_ENDPOINT}?driver_id=${encodeURIComponent(String(driverId))}&limit=20&offset=0`;

      const token = await SecureStore.getItemAsync("auth_token");
      const res = await fetch(ratingUrl, {
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

      if (!res.ok) throw new Error(json?.message || `HTTP ${res.status}`);

      if (json?.summary) {
        const avg = json.summary.avg;
        const count = json.summary.count;
        setDriverRating({ average: avg, count });
      }
    } catch (err) {
      console.log(
        "[OrderDetails] Failed to fetch driver rating:",
        err?.message || err,
      );
    }
  }, []);

  /* ---------- Driver details fetch (simplified - now handled by batch effect) ---------- */
  const fetchDriverDetails = useCallback(
    async (driverId) => {
      try {
        const DRIVER_DETAILS_ENDPOINT =
          "https://backend.tabdhey.bt/grablike/api/driver_id";
        const driverUrl = `${DRIVER_DETAILS_ENDPOINT}?driverId=${encodeURIComponent(String(driverId))}`;

        const token = await SecureStore.getItemAsync("auth_token");
        const res = await fetch(driverUrl, {
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

        if (!res.ok) throw new Error(json?.message || `HTTP ${res.status}`);

        if (json?.ok && json?.details) {
          setDriverDetails(json.details);
          await fetchDriverRating(driverId);
        }
      } catch (err) {
        console.log(
          "[OrderDetails] Failed to fetch driver details:",
          err?.message || err,
        );
      }
    },
    [fetchDriverRating],
  );

  const driverSummaryText = useMemo(() => {
    if (!driverDetails) return "";

    const name =
      driverDetails.user_name ??
      driverDetails.name ??
      driverDetails.full_name ??
      "";
    const phone = driverDetails.phone ?? driverDetails.mobile ?? "";

    const avg = driverRating?.average;
    const count = driverRating?.count;

    const ratingPart =
      avg != null
        ? `Rating: ${Number(avg).toFixed(1)}${count != null ? ` (${count})` : ""}`
        : null;

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
      businessId ??
      paramBusinessId ??
      order?.business_id ??
      order?.merchant_id ??
      null;

    if (!biz) return;

    const targetRoute = resolvedNearbyListRouteName;
    if (!targetRoute) return;

    const focusOrderId = normalizeOrderCode(
      order?.order_code || order?.id || routeOrderId,
    );

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
      ownerNav.dispatch(
        CommonActions.navigate({ name: targetRoute, params: payload }),
      );
      return;
    }
    navigation.dispatch(
      CommonActions.navigate({ name: targetRoute, params: payload }),
    );
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
        const thisOrderCode = normalizeKey(
          order?.order_code || order?.id || routeOrderId,
        );

        // match by order id/code
        if (!thisOrderCode) return true;

        const extracted = extractOrderIdFromPayload(payload);
        if (extracted && sameOrder(String(extracted), thisOrderCode))
          return true;

        // scan drops[] for matching order
        const drops =
          payload?.drops ??
          payload?.data?.drops ??
          payload?.payload?.drops ??
          payload?.message?.drops ??
          null;
        if (Array.isArray(drops)) {
          for (const d of drops) {
            const oid =
              d?.order_id ??
              d?.orderId ??
              d?.order_code ??
              d?.orderCode ??
              null;
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

      const norm = normalizeStatus(st);

      // Apply the status immediately to UI
      applySocketStatusToUi(st);

      // Update ride message based on status
      if (norm === "PICKED_UP") {
        setRideMessage("Driver has picked up your order.");
        // Force immediate refresh to update UI
        hydrateFromGrouped();
      } else if (norm === "OUT_FOR_DELIVERY") {
        setRideMessage("Driver is on the way (Out for delivery).");
        hydrateFromGrouped();
      } else if (norm === "COMPLETED") {
        setRideMessage("Order delivered (Delivery complete).");
        hydrateFromGrouped();
      } else if (norm === "ASSIGNED") {
        setRideMessage("Driver has been assigned to your order.");
      } else if (norm === "READY") {
        setRideMessage("Order is ready for pickup.");
      }
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
        } catch {}
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
          const oid = normalizeKey(
            order?.order_code || order?.id || routeOrderId,
          );
          if (oid) socket.emit("joinOrder", { orderId: String(oid) }, () => {});
        } catch {}
      });

      const safe = (fn) => (payload) => {
        if (!payloadMatchesThisOrder(payload)) return;
        fn(payload);
      };

      [
        "deliveryAccepted",
        "delivery:accepted",
        "delivery_accept",
        "accepted",
      ].forEach((ev) => socket.on(ev, safe(handleAccepted)));

      [
        "delivery:driver_arrived",
        "deliveryDriverArrived",
        "delivery:arrived",
        "arrived",
      ].forEach((ev) => socket.on(ev, safe(handleArrived)));

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
    const sub = DeviceEventEmitter.addListener(
      "order-updated",
      ({ id, patch }) => {
        if (String(id) !== String(order?.id || routeOrderId)) return;
        const nextPatch = patch || {};
        if (nextPatch.status)
          nextPatch.status = normalizeStatus(nextPatch.status);
        setOrder((prev) => ({ ...prev, ...nextPatch }));
      },
    );
    return () => sub?.remove?.();
  }, [routeOrderId, order?.id]);

  // Clear conversation cache when order changes
  useEffect(() => {
    return () => {
      conversationCacheRef.current = {};
    };
  }, [routeOrderId]);

  const onSetDeliveryChoice = useCallback(
    async (choice) => {
      const nextChoice = String(choice || "").toLowerCase();
      setDeliveryChoice(nextChoice);

      // ✅ Save to SecureStore to persist
      try {
        const biz = businessId || paramBusinessId;
        const orderKey = order?.id || routeOrderId;
        if (biz && orderKey) {
          await SecureStore.setItemAsync(
            `order_delivery_choice_${biz}_${orderKey}`,
            nextChoice,
          );
          console.log("[DELIVERY] Saved choice:", nextChoice);
        }
      } catch (e) {
        console.log("[DELIVERY] Failed to save choice:", e);
      }

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
    [
      redirectToNearbyOrders,
      businessId,
      paramBusinessId,
      order?.id,
      routeOrderId,
    ],
  );
  const isCancelledByCustomer = useMemo(() => {
    const rawStatus = normalizeStatus(order?.status);
    const reasonRaw =
      order?.status_reason ??
      order?.cancel_reason ??
      order?.cancellation_reason ??
      "";
    const reason = String(reasonRaw || "").toLowerCase();
    const cancelledBy = String(
      order?.cancelled_by || order?.canceled_by || "",
    ).toLowerCase();

    if (
      cancelledBy &&
      (cancelledBy.includes("customer") || cancelledBy.includes("user"))
    )
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

  /* ---------------- UI helpers ---------------- */
  const headerTopPad = Math.max(insets.top, S(8)) + S(18);
  const fulfillmentLower = (fulfillment || "").toLowerCase();

  const shouldShowDeliveryOptions = useMemo(() => {
    // Don't show delivery options for pickup orders
    if (isPickupFulfillment) return false;

    // Don't show delivery options for declined orders
    if (status === "DECLINED") return false;

    // Don't show delivery options once driver has accepted
    if (driverAccepted) return false;

    // Show delivery options when order is CONFIRMED (after merchant accepts)
    // NOT before CONFIRMED (PENDING), and NOT after READY or later
    return status === "CONFIRMED" && !isTerminalNegative && !isTerminalSuccess;
  }, [
    status,
    isTerminalNegative,
    isTerminalSuccess,
    driverAccepted,
    isPickupFulfillment,
  ]);

  // ✅ ADD THIS DEBUG CODE HERE - Right before the return statement
  console.log("[DEBUG] Pickup button conditions:", {
    status,
    isPickupFulfillment,
    fulfillment,
    isTerminalNegative,
    isTerminalSuccess,
    isCancelledByCustomer,
    shouldShowPickupButton: status === "READY" && isPickupFulfillment,
  });

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right", "bottom"]}>
      {/* Header */}
      <View style={[styles.headerBar, { paddingTop: headerTopPad }]}>
        <Pressable
          onPress={goBackToOrders}
          style={styles.backBtn}
          hitSlop={hit(S(8))}
        >
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
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={S(18)}
              color="#00B14F"
            />
          </Pressable>

          <ActivityIndicator animating={refreshing} size="small" />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: S(16), paddingBottom: S(24) }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.card}>
          <View style={styles.idRow}>
            <Text style={styles.orderId}>#{order?.id || routeOrderId}</Text>
            <View>
              <ActivityIndicator
                animating={false}
                size="small"
                color="transparent"
              />
            </View>
          </View>

          <StatusRail
            status={
              status === "ASSIGNED"
                ? "CONFIRMED"
                : status === "PICKED_UP"
                  ? "READY"
                  : status
            }
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
            deliveryOptionDisplay={
              status === "ASSIGNED"
                ? "GRAB"
                : order?.delivery_option === "GRAB"
                  ? "GRAB"
                  : order?.delivery_option === "SELF"
                    ? "SELF"
                    : deliveryChoice === "self"
                      ? "SELF"
                      : "GRAB"
            }
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
            {/* Show delivery method chooser ONLY for CONFIRMED status and NOT for pickup orders */}
            {!isPickupFulfillment && status === "CONFIRMED" && (
              <View style={{ marginTop: S(8) }}>
                <DeliveryMethodChooser
                  status={status}
                  isBothOption={isBothOption}
                  isTerminalNegative={isTerminalNegative}
                  isTerminalSuccess={isTerminalSuccess}
                  isSelfSelected={isSelfSelected}
                  isGrabSelected={isGrabSelected}
                  sendingGrab={false}
                  rideMessage={isSelfSelected ? "" : rideMessage}
                  driverSummaryText={driverSummaryText}
                  driverAccepted={driverAccepted}
                  setDeliveryChoice={onSetDeliveryChoice}
                  stopGrabLoop={() => {}}
                  startGrabLoop={() => {}}
                  showDeliverInGroup={false}
                  onDeliverInGroup={() => {}}
                />
              </View>
            )}

            {/* {console.log("[DEBUG] Driver block conditions:", {
              status,
              isGrabSelected,
              driverDetails: !!driverDetails,
              shouldShow:
                (status === "ASSIGNED" ||
                  status === "READY" ||
                  status === "PICKED_UP" ||
                  status === "OUT_FOR_DELIVERY") &&
                isGrabSelected,
            })} */}
            {/* Driver tracking block - HIDE for pickup orders */}
            {!isPickupFulfillment &&
              ((status === "CONFIRMED" && isGrabSelected && !driverAccepted) ||
                status === "ASSIGNED" ||
                status === "READY" ||
                status === "PICKED_UP" ||
                status === "OUT_FOR_DELIVERY") &&
              isGrabSelected && (
                <View
                  style={{
                    marginTop: S(12),
                    marginBottom: S(8),
                    padding: S(12),
                    backgroundColor: "#F3F4F6",
                    borderRadius: S(12),
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: S(8),
                      marginBottom: S(8),
                    }}
                  >
                    <Ionicons name="car-outline" size={S(18)} color="#6B7280" />
                    <Text
                      style={{
                        fontSize: S(13),
                        fontWeight: "500",
                        color: "#374151",
                      }}
                    >
                      Delivery Status
                    </Text>
                  </View>

                  <Text
                    style={{
                      fontSize: S(14),
                      color: "#1F2937",
                      marginBottom: S(4),
                    }}
                  >
                    Status:{" "}
                    <Text style={{ fontWeight: "600", color: "#00B14F" }}>
                      {status === "ASSIGNED"
                        ? "Driver Assigned"
                        : status === "READY"
                          ? "Ready for Pickup"
                          : status === "PICKED_UP"
                            ? "Picked Up ✓"
                            : status === "OUT_FOR_DELIVERY"
                              ? "Out for Delivery"
                              : status}
                    </Text>
                  </Text>

                  {driverSummaryText && (
                    <Text
                      style={{
                        fontSize: S(12),
                        color: "#6B7280",
                        marginTop: S(4),
                      }}
                    >
                      {driverSummaryText}
                    </Text>
                  )}

                  {rideMessage && (
                    <Text
                      style={{
                        fontSize: S(12),
                        color: "#6B7280",
                        fontStyle: "italic",
                        marginTop: S(4),
                      }}
                    >
                      {rideMessage}
                    </Text>
                  )}

                  {driverArrived && (
                    <View
                      style={{
                        marginTop: S(8),
                        flexDirection: "row",
                        alignItems: "center",
                        gap: S(6),
                      }}
                    >
                      <Ionicons
                        name="location-outline"
                        size={S(14)}
                        color="#10B981"
                      />
                      <Text
                        style={{
                          fontSize: S(12),
                          color: "#10B981",
                          fontWeight: "500",
                        }}
                      >
                        Driver has arrived
                      </Text>
                    </View>
                  )}

                  {/* ✅ TRACK BUTTON - Only show when driver is assigned (has ride_id) */}
                  {rideId &&
                    (status === "ASSIGNED" ||
                      status === "READY" ||
                      status === "PICKED_UP" ||
                      status === "OUT_FOR_DELIVERY") && (
                      <Pressable
                        onPress={() => {
                          // Navigate to batch tracking screen
                          const biz =
                            businessId ?? paramBusinessId ?? order?.business_id;
                          if (!biz) {
                            Alert.alert("Error", "Business ID not found");
                            return;
                          }

                          const orderCode = normalizeOrderCode(
                            order?.order_code || order?.id || routeOrderId,
                          );

                          console.log(
                            "[TRACK] Navigating to BatchRidesScreen with:",
                            {
                              rideId: rideId,
                              businessId: biz,
                              orderCode: orderCode,
                              focusRideId: rideId,
                            },
                          );

                          navigation.navigate("BatchRidesScreen", {
                            rideId: rideId,
                            businessId: biz,
                            orderId: order?.id || routeOrderId,
                            orderCode: orderCode,
                            focusRideId: rideId,
                            focusOrderId: orderCode,
                            highlightCard: true,
                          });
                        }}
                        style={({ pressed }) => ({
                          backgroundColor: pressed ? "#059669" : "#00B14F",
                          paddingVertical: S(10),
                          paddingHorizontal: S(16),
                          borderRadius: S(10),
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: S(8),
                          marginTop: S(12),
                        })}
                      >
                        <Ionicons
                          name="map-outline"
                          size={S(16)}
                          color="#FFFFFF"
                        />
                        <Text
                          style={{
                            color: "#FFFFFF",
                            fontSize: S(14),
                            fontWeight: "600",
                          }}
                        >
                          Track Driver
                        </Text>
                      </Pressable>
                    )}
                </View>
              )}

            {/* Show status update buttons - works for BOTH SELF and GRAB deliveries */}
            {status !== "DECLINED" &&
              status !== "CANCELLED" &&
              status !== "COMPLETED" &&
              !isTerminalNegative &&
              !isTerminalSuccess &&
              !isCancelledByCustomer && (
                <View style={{ marginTop: S(12) }}>
                  <Text style={styles.sectionTitle}>Update status</Text>

                  {/* For PENDING status - Show Accept/Decline buttons */}
                  {status === "PENDING" && (
                    <View style={styles.actionsRow}>
                      <Pressable
                        onPress={() => doUpdate("CONFIRMED")}
                        disabled={updating}
                        style={({ pressed }) => [
                          styles.primaryBtn,
                          { opacity: updating || pressed ? 0.85 : 1 },
                        ]}
                      >
                        <Ionicons
                          name="checkmark-circle-outline"
                          size={18}
                          color="#fff"
                        />
                        <Text style={styles.primaryBtnText}>Accept</Text>
                      </Pressable>

                      <Pressable
                        onPress={() => setDeclineOpen(true)}
                        disabled={updating}
                        style={({ pressed }) => [
                          styles.secondaryBtn,
                          {
                            borderColor: "#ef4444",
                            opacity: updating || pressed ? 0.85 : 1,
                          },
                        ]}
                      >
                        <Ionicons
                          name="close-circle-outline"
                          size={18}
                          color="#b91c1c"
                        />
                        <Text
                          style={[
                            styles.secondaryBtnText,
                            { color: "#991b1b" },
                          ]}
                        >
                          Decline
                        </Text>
                      </Pressable>
                    </View>
                  )}
                  {/* For ASSIGNED status - Show Ready button */}
                  {status === "ASSIGNED" && (
                    <Pressable
                      onPress={() => doUpdate("READY")}
                      disabled={updating}
                      style={({ pressed }) => [
                        styles.primaryBtn,
                        { opacity: updating || pressed ? 0.85 : 1 },
                      ]}
                    >
                      <Ionicons
                        name="checkmark-circle-outline"
                        size={18}
                        color="#fff"
                      />
                      <Text style={styles.primaryBtnText}>Ready</Text>
                    </Pressable>
                  )}
                  {/* For CONFIRMED status - Show Ready button (enabled for both SELF and GRAB after driver accepts) */}
                  {status === "CONFIRMED" && (
                    <Pressable
                      onPress={() => {
                        // For GRAB deliveries, check if driver accepted
                        if (
                          isGrabSelected &&
                          !driverAccepted &&
                          !isSelfSelected
                        ) {
                          Alert.alert(
                            "Waiting for Driver",
                            "Please wait for a driver to accept this order before marking it as ready.\n\nYou'll be notified when a driver accepts.",
                          );
                          return;
                        }
                        doUpdate("READY");
                      }}
                      disabled={
                        updating ||
                        (isGrabSelected && !driverAccepted && !isSelfSelected)
                      }
                      style={({ pressed }) => [
                        styles.primaryBtn,
                        {
                          opacity:
                            updating ||
                            (isGrabSelected &&
                              !driverAccepted &&
                              !isSelfSelected)
                              ? 0.5
                              : pressed
                                ? 0.85
                                : 1,
                          backgroundColor:
                            isGrabSelected && !driverAccepted && !isSelfSelected
                              ? "#9CA3AF"
                              : "#00B14F",
                        },
                      ]}
                    >
                      <Ionicons
                        name="checkmark-circle-outline"
                        size={18}
                        color="#fff"
                      />
                      <Text style={styles.primaryBtnText}>
                        {isGrabSelected && !driverAccepted && !isSelfSelected
                          ? "Waiting for Driver..."
                          : "Ready"}
                      </Text>
                    </Pressable>
                  )}

                  {/* For READY status - Show appropriate button based on fulfillment type */}
                  {status === "READY" && (
                    <>
                      {/* For pickup fulfillment - Show Mark as picked up button */}
                      {isPickupFulfillment && (
                        <Pressable
                          onPress={() => {
                            setPickedUpByName("");
                            setPickedUpModalVisible(true);
                          }}
                          disabled={updating}
                          style={({ pressed }) => [
                            styles.primaryBtn,
                            { opacity: updating || pressed ? 0.85 : 1 },
                          ]}
                        >
                          <Ionicons
                            name="checkmark-done-circle-outline"
                            size={18}
                            color="#fff"
                          />
                          <Text style={styles.primaryBtnText}>
                            Mark as picked up
                          </Text>
                        </Pressable>
                      )}

                      {/* For self delivery - Show Out for Delivery button */}
                      {!isPickupFulfillment && isSelfSelected && (
                        <Pressable
                          onPress={() => doUpdate("OUT_FOR_DELIVERY")}
                          disabled={updating}
                          style={({ pressed }) => [
                            styles.primaryBtn,
                            { opacity: updating || pressed ? 0.85 : 1 },
                          ]}
                        >
                          <Ionicons
                            name="bicycle-outline"
                            size={18}
                            color="#fff"
                          />
                          <Text style={styles.primaryBtnText}>
                            Out for Delivery
                          </Text>
                        </Pressable>
                      )}
                    </>
                  )}

                  {/* For OUT_FOR_DELIVERY status - Show Complete (only for SELF deliveries) */}
                  {status === "OUT_FOR_DELIVERY" && isSelfSelected && (
                    <Pressable
                      onPress={() => doUpdate("COMPLETED")}
                      disabled={updating}
                      style={({ pressed }) => [
                        styles.primaryBtn,
                        { opacity: updating || pressed ? 0.85 : 1 },
                      ]}
                    >
                      <Ionicons
                        name="checkmark-done-circle-outline"
                        size={18}
                        color="#fff"
                      />
                      <Text style={styles.primaryBtnText}>
                        Mark as Complete
                      </Text>
                    </Pressable>
                  )}
                </View>
              )}
          </>
        )}

        <ItemsBlock
          items={items}
          status={status}
          ifUnavailableMode={effectiveUnavailableMode}
          unavailableMap={itemUnavailableMap}
          replacementMap={itemReplacementMap}
          onToggleUnavailable={handleToggleUnavailable}
          onMarkItemUnavailable={handleMarkItemUnavailable}
          onOpenSimilarCatalog={handleOpenSimilarCatalog}
          onChatWithCustomer={openChatFromOrder}
          money={money}
          ownerType={ownerType}
          deliveryFee={feeSnapForUi.delivery_fee || 0}
        />

        <TotalsBlock
          itemsCount={effectiveItemsCount || 0}
          totalLabel={effectiveTotalLabel}
        />
      </ScrollView>

      <DeclineModal
        visible={declineOpen}
        declineReason={declineReason}
        setDeclineReason={setDeclineReason}
        canDecline={canDecline}
        onCancel={() => setDeclineOpen(false)}
        onConfirm={confirmDecline}
      />
      {/* Modal for picking up name */}
      <Modal
        visible={pickedUpModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setPickedUpModalVisible(false)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: "rgba(0,0,0,0.5)",
          }}
        >
          <View
            style={{
              backgroundColor: "white",
              borderRadius: 20,
              padding: 20,
              width: "85%",
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: 18,
                fontWeight: "bold",
                marginBottom: 15,
              }}
            >
              Mark as Picked Up
            </Text>

            <Text
              style={{
                fontSize: 14,
                color: "#666",
                marginBottom: 10,
              }}
            >
              Enter the name of the person picking up:
            </Text>

            <TextInput
              style={{
                width: "100%",
                borderWidth: 1,
                borderColor: "#ccc",
                borderRadius: 10,
                padding: 12,
                fontSize: 16,
                marginBottom: 20,
              }}
              placeholder="Enter name"
              value={pickedUpByName}
              onChangeText={setPickedUpByName}
              autoFocus={true}
            />

            <View
              style={{
                flexDirection: "row",
                gap: 10,
                width: "100%",
              }}
            >
              <Pressable
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 10,
                  backgroundColor: "#ccc",
                  alignItems: "center",
                }}
                onPress={() => {
                  setPickedUpModalVisible(false);
                  setPickedUpByName("");
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "600" }}>Cancel</Text>
              </Pressable>

              <Pressable
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 10,
                  backgroundColor: "#00B14F",
                  alignItems: "center",
                }}
                onPress={() => {
                  const enteredName = pickedUpByName.trim() || "Store Manager"; // Capture and default

                  setPickedUpModalVisible(false); // Close modal immediately

                  // Pass the name as an option to doUpdate
                  doUpdate("PICKEDUP", { pickupName: enteredName })
                    .then(() => {
                      setPickedUpByName(""); // Clear AFTER successful update
                    })
                    .catch((err) => {
                      console.log("[PICKUP] Error:", err);
                      setPickedUpByName(""); // Clear even on error
                      Alert.alert(
                        "Error",
                        "Failed to update status. Please try again.",
                      );
                    });
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "600" }}>
                  Confirm Pickup
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
