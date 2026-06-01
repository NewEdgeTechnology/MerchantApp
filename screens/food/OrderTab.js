// services/marts/OrdersTab.js
// Mart / Food Orders list tab — grouped orders + upcoming scheduled orders.
// - Upcoming: no filters shown (no search, no date dropdown).
// - Normal: status tabs + search + date dropdown (All / Today / Yesterday / calendar).
// - Counts per status respect date filter (except Upcoming).
// ✅ FIX: If backend sends ON ROAD / ON_ROAD / ONROAD, UI auto-maps to OUT_FOR_DELIVERY everywhere.
// ✅ UPDATE: Scheduled orders now show schedule time using scheduled_at_local / scheduled_at_utc from API.
// ✅ UPDATE: Order "total" now matches OrderDetails display total (EXCLUDES platform_fee; includes delivery + merchant_delivery - discount).
// ✅ FIX: Totals computed robustly from nested totals + item line totals (supports string prices like "BTN. 20")
// ✅ UPDATE: Hide Delivered/Completed orders everywhere (DELIVERED/DELIVERED_* -> COMPLETED -> filtered out)
// ✅ NEW: Accept/Decline for scheduled orders using dedicated endpoints from .env.
// ✅ FIX: Parse scheduled order status from API ("ACCEPTED" -> SCHEDULED_ACCEPTED, "REJECTED" -> SCHEDULED_REJECTED).
// ✅ NEW: Show rejection reason for rejected scheduled orders.

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
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  DeviceEventEmitter,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  Pressable,
  BackHandler, // ← Add this if missing
} from "react-native";
import {
  useNavigation,
  useRoute,
  useFocusEffect,
} from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import DateTimePicker from "@react-native-community/datetimepicker";
import { BRAND, FONT, RADIUS, SHADOW } from "../styles/tabdey_brand";
import {
  ORDER_ENDPOINT as ENV_ORDER_ENDPOINT,
  SCHEDULED_ORDER_ENDPOINT as ENV_SCHEDULED_ORDER_ENDPOINT,
  ACCEPT_SCHEDULED_ORDER_ENDPOINT as ENV_ACCEPT_SCHEDULED,
  REJECT_SCHEDULED_ORDER_ENDPOINT as ENV_REJECT_SCHEDULED,
} from "@env";

const BASE_STATUS_LABELS = [
  { key: "PENDING", label: "Pending" },
  { key: "CONFIRMED", label: "Confirmed" },
  { key: "READY", label: "Ready" },
  { key: "OUT_FOR_DELIVERY", label: "Out for delivery" },
  // { key: 'COMPLETED', label: 'Completed' }, // hidden
  { key: "DECLINED", label: "Declined" },
];

const STATUS_THEME = {
  PENDING: {
    fg: "#0ea5e9",
    bg: "#e0f2fe",
    bd: "#bae6fd",
    icon: "time-outline",
  },
  CONFIRMED: {
    fg: "#BRAND.purple",
    bg: "#ecfdf5",
    bd: "#bbf7d0",
    icon: "checkmark-circle-outline",
  },
  READY: { fg: "#2563eb", bg: "#dbeafe", bd: "#bfdbfe", icon: "cube-outline" },
  OUT_FOR_DELIVERY: {
    fg: "#f59e0b",
    bg: "#fef3c7",
    bd: "#fde68a",
    icon: "bicycle-outline",
  },
  COMPLETED: {
    fg: "#047857",
    bg: "#ecfdf5",
    bd: "#bbf7d0",
    icon: "checkmark-done-outline",
  },
  DECLINED: {
    fg: "#b91c1c",
    bg: "#fee2e2",
    bd: "#fecaca",
    icon: "close-circle-outline",
  },
  SCHEDULED: {
    fg: "#0ea5e9",
    bg: "#eff6ff",
    bd: "#dbeafe",
    icon: "calendar-outline",
  },
  SCHEDULED_ACCEPTED: {
    fg: "#BRAND.purple",
    bg: "#ecfdf5",
    bd: "#bbf7d0",
    icon: "checkmark-circle-outline",
  },
  SCHEDULED_REJECTED: {
    fg: "#b91c1c",
    bg: "#fee2e2",
    bd: "#fecaca",
    icon: "close-circle-outline",
  },
};

const FULFILL_THEME = {
  DELIVERY: {
    fg: "#0ea5e9",
    bg: "#e0f2fe",
    bd: "#bae6fd",
    icon: "bicycle-outline",
    label: "Delivery",
  },
  PICKUP: {
    fg: "#7c3aed",
    bg: "#f5f3ff",
    bd: "#ddd6fe",
    icon: "bag-outline",
    label: "Pickup",
  },
};

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/* ---------------- helpers ---------------- */
const normalizeStatusKey = (s) => {
  const k = String(s || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  if (k === "ON_ROAD" || k === "ONROAD") return "OUT_FOR_DELIVERY";
  if (
    k === "DELIVERED" ||
    k === "DELIVERED_TO_CUSTOMER" ||
    k === "DELIVERED_TO_CLIENT"
  )
    return "COMPLETED";
  if (k === "COMPLETED") return "COMPLETED";
  return k;
};

const HIDE_STATUSES = new Set(["COMPLETED"]);

const showAsGiven = (s) => {
  if (!s) return "";
  const d = String(s);
  const isoish = d.includes("T") ? d : d.replace(" ", "T");
  const y = isoish.slice(0, 4),
    m = isoish.slice(5, 7),
    dd = isoish.slice(8, 10);
  const hh = isoish.slice(11, 13),
    mm = isoish.slice(14, 16);
  const mon = MONTH_NAMES[(+m || 1) - 1] || m;
  if (!y || !m || !dd || !hh || !mm) return d;
  return `${mon} ${dd}, ${hh}:${mm}`;
};

const parseForSort = (v) => {
  if (!v) return 0;
  const s = String(v).trim();
  let n = Date.parse(s.includes("T") ? s : s.replace(" ", "T"));
  if (Number.isFinite(n)) return n;
  const m = s.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4}),\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/,
  );
  if (m) {
    const [, dd, mm, yyyy, hh, min, ss] = m;
    const date = new Date(
      Number(yyyy),
      Number(mm) - 1,
      Number(dd),
      Number(hh),
      Number(min),
      ss ? Number(ss) : 0,
    );
    if (!Number.isNaN(date.getTime())) return date.getTime();
  }
  return 0;
};

const pad2 = (n) => (n < 10 ? `0${n}` : String(n));
const dateKeyFromDateObj = (d) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const dateKeyFromTs = (v) => {
  const t = parseForSort(v);
  if (!t) return null;
  const d = new Date(t);
  return dateKeyFromDateObj(d);
};
const labelForDateKey = (key, todayKey, yesterdayKey) => {
  if (key === todayKey) return "Today";
  if (key === yesterdayKey) return "Yesterday";
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return key;
  const date = new Date(y, m - 1, d);
  return `${MONTH_NAMES[date.getMonth()]} ${d}`;
};

const getItemNote = (it = {}) =>
  it.note_for_restaurant ||
  it.note ||
  it.special_request ||
  it.instructions ||
  it.customization ||
  it.item_note ||
  "";
const pickAddress = (o = {}) => {
  const cand = [
    o?.delivery_address,
    o?.deliver_to?.address,
    o?.deliver_to?.label,
    o?.deliver_to?.formatted,
    o?.dropoff_address,
    o?.shipping_address,
    o?.address,
    o?.customer_address,
    o?.deliver_to,
  ];
  for (const v of cand) {
    if (!v) continue;
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "object") {
      if (typeof v.address === "string" && v.address.trim())
        return v.address.trim();
      if (typeof v.label === "string" && v.label.trim()) return v.label.trim();
      if (typeof v.formatted === "string" && v.formatted.trim())
        return v.formatted.trim();
    }
  }
  return "";
};

/* =========================== money parsing + totals =========================== */
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
    if (n != null) return n;
  }
  return null;
};
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
  return getItemQty(it) * getItemUnitPrice(it);
};
const sumItemsTotal = (items = []) =>
  (items || []).reduce((sum, it) => sum + getItemLineTotal(it), 0);
const getTotalsSnapshot = (o = {}) => {
  const t =
    o?.totals || o?.total_breakdown || o?.breakdown || o?.pricing || null;
  const b =
    o?.totals_for_business ||
    o?.totalsForBusiness ||
    o?.business_totals ||
    o?.businessTotals ||
    null;
  const platform_fee = pickMoney(
    o?.platform_fee,
    o?.platformFee,
    t?.platform_fee,
    t?.platformFee,
    b?.platform_fee,
    b?.platformFee,
  );
  const discount_amount = pickMoney(
    o?.discount_amount,
    o?.discountAmount,
    o?.discount,
    t?.discount_amount,
    t?.discountAmount,
    t?.discount,
    b?.discount_amount,
    b?.discountAmount,
    b?.discount,
  );
  const delivery_fee = pickMoney(
    o?.delivery_fee,
    o?.deliveryFee,
    t?.delivery_fee,
    t?.deliveryFee,
    b?.delivery_fee,
    b?.deliveryFee,
  );
  const merchant_delivery_fee = pickMoney(
    o?.merchant_delivery_fee,
    o?.merchantDeliveryFee,
    t?.merchant_delivery_fee,
    t?.merchantDeliveryFee,
    b?.merchant_delivery_fee,
    b?.merchantDeliveryFee,
  );
  const total_amount = pickMoney(
    o?.total_amount,
    o?.totalAmount,
    o?.total,
    t?.total_amount,
    t?.totalAmount,
    t?.total,
    b?.total_amount,
    b?.totalAmount,
    b?.total,
  );
  return {
    platform_fee,
    discount_amount,
    delivery_fee,
    merchant_delivery_fee,
    total_amount,
  };
};
const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const computeDisplayTotal = ({ items, totals }) => {
  const snap = totals || {};
  const df = snap.delivery_fee ?? 0;
  const mdf = snap.merchant_delivery_fee ?? 0;
  const disc = snap.discount_amount ?? 0;
  const pf = snap.platform_fee ?? null;
  const grand = snap.total_amount ?? null;
  const hasItems = Array.isArray(items) && items.length > 0;
  const itemsTotal = hasItems ? sumItemsTotal(items) : null;
  if (hasItems && itemsTotal != null) {
    return round2(
      Number(itemsTotal || 0) +
        Number(df || 0) +
        Number(mdf || 0) -
        Number(disc || 0),
    );
  }
  if (grand != null) {
    return round2(Number(grand || 0) - Number(pf || 0));
  }
  return 0;
};

/* ---------------- small UI atoms ---------------- */
const StatusPill = ({ status }) => {
  const key = normalizeStatusKey(status);
  const t = STATUS_THEME[key] || STATUS_THEME.PENDING;
  return (
    <View style={[styles.pill, { backgroundColor: t.bg, borderColor: t.bd }]}>
      <Ionicons name={t.icon} size={12} color={t.fg} />
      <Text style={[styles.pillText, { color: t.fg }]} numberOfLines={1}>
        {key
          .replaceAll("_", " ")
          .toLowerCase()
          .replace(/(^|\s)\S/g, (s) => s.toUpperCase())}
      </Text>
    </View>
  );
};

const FulfillmentPill = ({ type }) => {
  const key =
    String(type || "").toUpperCase() === "DELIVERY" ? "DELIVERY" : "PICKUP";
  const t = FULFILL_THEME[key];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg, borderColor: t.bd }]}>
      <Ionicons name={t.icon} size={12} color={t.fg} />
      <Text style={[styles.pillText, { color: t.fg }]} numberOfLines={1}>
        {t.label}
      </Text>
    </View>
  );
};

const ItemPreview = ({ items, raw }) => {
  if (Array.isArray(raw) && raw.length) {
    const [a, b] = raw;
    const t1 = a ? `${a.item_name ?? "Item"} ×${Number(a.quantity ?? 1)}` : "";
    const t2 = b ? `${b.item_name ?? "Item"} ×${Number(b.quantity ?? 1)}` : "";
    const more = raw.length > 2 ? ` +${raw.length - 2} more` : "";
    return (
      <Text style={styles.orderItems} numberOfLines={2}>
        {t1}
        {t2 ? `, ${t2}` : ""}
        {more}
      </Text>
    );
  }
  if (items)
    return (
      <Text style={styles.orderItems} numberOfLines={2}>
        {items}
      </Text>
    );
  return null;
};

// ======================= IMPROVED ORDER ITEM LAYOUT =======================
const OrderItem = ({
  item,
  isTablet,
  money,
  onPress,
  isUpcoming,
  onAccept,
  onDecline,
  actionLoadingId,
}) => {
  const isDelivery = item.type === "Delivery";
  const statusKey = normalizeStatusKey(item.status);
  const isScheduled = statusKey === "SCHEDULED";
  const isAccepted = statusKey === "SCHEDULED_ACCEPTED";
  const isRejected = statusKey === "SCHEDULED_REJECTED";
  const moneyFmt =
    money || ((n, c = "BTN") => `${c} ${Number(n || 0).toFixed(2)}`);
  const scheduledPretty = item?.created_at
    ? `Scheduled • ${showAsGiven(item.created_at)}`
    : "Scheduled";
  const scheduledText =
    item?.time && String(item.time).trim()
      ? String(item.time)
      : scheduledPretty;
  const isLoading = actionLoadingId === item.id;

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={() => onPress?.(item)}
      style={styles.card}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      {/* Top row: icon + order ID + total */}
      <View style={styles.row1}>
        <View style={styles.row1Left}>
          <Ionicons
            name={isDelivery ? "bicycle-outline" : "bag-outline"}
            size={18}
            color="#0f172a"
          />
          <Text style={[styles.orderId, { fontSize: isTablet ? 15 : 14 }]}>
            {item.id}
          </Text>
        </View>
        <Text style={[styles.orderTotal, { fontSize: isTablet ? 18 : 17 }]}>
          {moneyFmt(item.total, "BTN")}
        </Text>
      </View>

      {/* Scheduled time line (for all scheduled orders) */}
      {(isScheduled || isAccepted || isRejected) && (
        <Text style={styles.scheduledTime} numberOfLines={2}>
          {scheduledText}
        </Text>
      )}

      {/* Pills row – wraps automatically */}
      <View style={styles.row2}>
        <FulfillmentPill type={item.type} />
        <StatusPill status={item.status} />
        {!!item.payment_method && (
          <View style={styles.payWrap}>
            <Ionicons name="card-outline" size={14} color="#64748b" />
            <Text style={styles.payText} numberOfLines={1}>
              {item.payment_method}
            </Text>
          </View>
        )}
      </View>

      {/* Rejection reason (if rejected) */}
      {isRejected && item.rejection_reason && (
        <View style={styles.rejectionRow}>
          <Ionicons name="alert-circle-outline" size={14} color="#b91c1c" />
          <Text style={styles.rejectionText} numberOfLines={3}>
            RDeclined: {item.rejection_reason}
          </Text>
        </View>
      )}

      {/* Items preview */}
      <ItemPreview items={item.items} raw={item.raw_items} />

      {/* Customer info */}
      {(item.customer_name || item.customer_phone || item.customer_email) && (
        <View style={styles.metaRow}>
          <Ionicons name="person-outline" size={16} color="#64748b" />
          <Text style={styles.customerText} numberOfLines={1}>
            {item.customer_name || "Customer"}
            {item.customer_phone ? ` • ${item.customer_phone}` : ""}
            {!item.customer_phone && item.customer_email
              ? ` • ${item.customer_email}`
              : ""}
          </Text>
        </View>
      )}

      {/* Delivery address */}
      {!!item.delivery_address?.trim?.() && (
        <View style={styles.metaRow}>
          <Ionicons name="location-outline" size={16} color="#64748b" />
          <Text style={styles.customerText} numberOfLines={2}>
            {item.delivery_address.trim()}
          </Text>
        </View>
      )}

      {/* Special note */}
      {!!item.note_for_restaurant?.trim?.() && (
        <View style={styles.noteRow}>
          <Ionicons
            name="chatbubble-ellipses-outline"
            size={14}
            color="#0f766e"
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.noteText} numberOfLines={3}>
              {item.note_for_restaurant.trim()}
            </Text>
            {!!item.note_target?.trim?.() && (
              <Text style={styles.noteMeta} numberOfLines={1}>
                for {item.note_target.trim()}
              </Text>
            )}
          </View>
        </View>
      )}

      {/* Action buttons for pending scheduled orders (not accepted, not rejected) */}
      {isUpcoming && !isAccepted && !isRejected && (
        <View style={styles.actionButtonsRow}>
          <TouchableOpacity
            style={[styles.actionButton, styles.acceptButton]}
            onPress={() => onAccept?.(item)}
            disabled={isLoading}
            activeOpacity={0.7}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons
                  name="checkmark-circle-outline"
                  size={18}
                  color="#fff"
                />
                <Text style={styles.actionButtonText}>Accept</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.declineButton]}
            onPress={() => onDecline?.(item)}
            disabled={isLoading}
            activeOpacity={0.7}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="close-circle-outline" size={18} color="#fff" />
                <Text style={styles.actionButtonText}>Decline</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Accepted badge for scheduled orders */}
      {isUpcoming && isAccepted && (
        <View style={styles.acceptedBadge}>
          <Ionicons name="checkmark-circle" size={16} color="#BRAND.purple" />
          <Text style={styles.acceptedText}>
            Accepted – will move when scheduled time arrives
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
};
// ======================= END OF IMPROVED ORDER ITEM =======================

/* ---------------- grouping & normalization ---------------- */
const groupOrders = (rows = []) => {
  const byId = new Map();
  for (const r of rows) {
    const id = r.order_id ?? r.id ?? "UNKNOWN";
    const g = byId.get(id) || {
      id,
      created_at: null,
      type: r.fulfillment_type || "Pickup",
      itemsArr: [],
      raw_items: [],
      business_name: r.business_name,
      payment_method: r.payment_method,
      status: normalizeStatusKey(r.status),
      note_for_restaurant: null,
      note_target: null,
      delivery_address: "",
      items_total: 0,
      platform_fee: null,
      discount_amount: null,
      delivery_fee: null,
      merchant_delivery_fee: null,
      total_amount: null,
    };
    if (r.status) g.status = normalizeStatusKey(r.status);
    const qty = getItemQty(r) || 1;
    const nm = r.item_name || "Item";
    g.itemsArr.push(`${nm} ×${qty}`);
    g.raw_items.push({ item_name: nm, quantity: qty });
    g.items_total += getItemLineTotal(r);
    const snap = getTotalsSnapshot(r);
    if (g.platform_fee == null && snap.platform_fee != null)
      g.platform_fee = snap.platform_fee;
    if (g.discount_amount == null && snap.discount_amount != null)
      g.discount_amount = snap.discount_amount;
    if (g.delivery_fee == null && snap.delivery_fee != null)
      g.delivery_fee = snap.delivery_fee;
    if (g.merchant_delivery_fee == null && snap.merchant_delivery_fee != null)
      g.merchant_delivery_fee = snap.merchant_delivery_fee;
    if (g.total_amount == null && snap.total_amount != null)
      g.total_amount = snap.total_amount;
    const rowCreated =
      r.created_at ||
      r.createdAt ||
      r.placed_at ||
      r.order_time ||
      r.createdOn ||
      null;
    const prev = g.created_at ? parseForSort(g.created_at) : 0;
    const cur = rowCreated ? parseForSort(rowCreated) : 0;
    if (!prev || (cur && cur < prev)) g.created_at = rowCreated || g.created_at;
    if (r.fulfillment_type === "Delivery") g.type = "Delivery";
    if (!g.delivery_address) g.delivery_address = pickAddress(r) || "";
    if (!g.note_for_restaurant)
      g.note_for_restaurant =
        r.note_for_restaurant ||
        r.restaurant_note ||
        r.note_for_store ||
        r.note ||
        null;
    const itemLevelNote = getItemNote(r) || "";
    if (!g.note_target && itemLevelNote && String(itemLevelNote).trim()) {
      g.note_target = r.item_name || "Item";
      if (!g.note_for_restaurant) g.note_for_restaurant = itemLevelNote;
    }
    byId.set(id, g);
  }
  const list = Array.from(byId.values()).map((g) => {
    const createdISO = g.created_at || null;
    const totals = {
      platform_fee: g.platform_fee,
      discount_amount: g.discount_amount ?? 0,
      delivery_fee: g.delivery_fee ?? 0,
      merchant_delivery_fee: g.merchant_delivery_fee ?? 0,
      total_amount: g.total_amount,
    };
    const total = computeDisplayTotal({
      items: [{ subtotal: g.items_total }],
      totals: { ...totals, total_amount: totals.total_amount ?? null },
    });
    return {
      id: String(g.id),
      type: g.type,
      time: showAsGiven(createdISO),
      created_at: createdISO,
      items: g.itemsArr.join(", "),
      total,
      status: normalizeStatusKey(g.status),
      payment_method: g.payment_method,
      business_name: g.business_name,
      customer_id: null,
      customer_name: "",
      customer_email: "",
      customer_phone: "",
      raw_items: g.raw_items,
      delivery_address: g.delivery_address || "",
      note_for_restaurant: g.note_for_restaurant || "",
      note_target: g.note_target || "",
      priority: 0,
      discount_amount: Number(g.discount_amount ?? 0),
    };
  });
  return list
    .filter((o) => !HIDE_STATUSES.has(normalizeStatusKey(o.status)))
    .sort((a, b) => parseForSort(b.created_at) - parseForSort(a.created_at));
};

const buildOrdersUrl = (
  base,
  businessId,
  { appendOwnerType = false, ownerType = "mart" } = {},
) => {
  if (!base || !businessId) return null;
  const b = String(base).trim().replace(/\/+$/, "");
  const id = encodeURIComponent(String(businessId));
  let replaced = b
    .replace(/\{\s*businessId\s*\}/g, id)
    .replace(/\{\s*business_id\s*\}/gi, id)
    .replace(/:businessId/g, id)
    .replace(/:business_id/gi, id);
  if (replaced === b) {
    if (/\/business$/i.test(b)) replaced = `${b}/${id}`;
    else if (!b.endsWith(`/${id}`)) {
      const sep = b.includes("?") ? "&" : "?";
      replaced = `${b}${sep}business_id=${id}`;
    }
  }
  if (appendOwnerType) {
    const sep2 = replaced.includes("?") ? "&" : "?";
    replaced = `${replaced}${sep2}owner_type=${encodeURIComponent(ownerType)}`;
  }
  return replaced;
};

const buildScheduledUrl = (base, businessId) => {
  if (!base || !businessId) return null;
  const b = String(base).trim().replace(/\/+$/, "");
  const id = encodeURIComponent(String(businessId));
  let replaced = b
    .replace(/\{\s*businessId\s*\}/gi, id)
    .replace(/\{\s*business_id\s*\}/gi, id)
    .replace(/\{\s*business_Id\s*\}/g, id)
    .replace(/:businessId/gi, id)
    .replace(/:business_id/gi, id)
    .replace(/:business_Id/g, id);
  if (replaced === b) {
    if (/\/business$/i.test(b)) replaced = `${b}/${id}`;
    else if (!b.endsWith(`/${id}`)) {
      const sep = b.includes("?") ? "&" : "?";
      replaced = `${b}${sep}business_id=${id}`;
    }
  }
  return replaced;
};

const parseJSON = async (res) => {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
};

const normalizeOrdersFromApi = (payload) => {
  try {
    if (Array.isArray(payload))
      return groupOrders(payload).filter(
        (o) => !HIDE_STATUSES.has(normalizeStatusKey(o.status)),
      );
    const blocks = Array.isArray(payload?.data) ? payload.data : [];
    const list = [];
    for (const block of blocks) {
      const u = block?.user || {};
      const orders = Array.isArray(block?.orders) ? block.orders : [];
      for (const o of orders) {
        const createdISO =
          o.created_at || o.createdAt || o.placed_at || o.order_time || null;
        let noteTarget = "";
        if (Array.isArray(o.items)) {
          const withNote = o.items.find((it) =>
            (
              it?.note_for_restaurant ||
              it?.note ||
              it?.special_request ||
              it?.instructions ||
              it?.customization ||
              it?.item_note
            )?.trim?.(),
          );
          if (withNote) noteTarget = withNote.item_name || withNote.name || "";
        }
        const itemsArr = Array.isArray(o.items) ? o.items : [];
        const itemsStr = itemsArr
          .map((it) => `${it.item_name ?? "Item"} ×${Number(it.quantity ?? 1)}`)
          .join(", ");
        const businessName =
          (o.items && o.items[0] && o.items[0].business_name) ||
          o.business_name ||
          o.business?.business_name ||
          "";
        const deliveryAddr = pickAddress(o);
        const snap = getTotalsSnapshot(o);
        const displayTotal = computeDisplayTotal({
          items: itemsArr,
          totals: snap,
        });
        const statusKey = normalizeStatusKey(o.status);
        if (HIDE_STATUSES.has(statusKey)) continue;
        list.push({
          id: String(o.order_id ?? o.id),
          type: o.fulfillment_type === "Delivery" ? "Delivery" : "Pickup",
          time: showAsGiven(createdISO),
          created_at: createdISO,
          items: itemsStr,
          total: displayTotal,
          status: statusKey,
          payment_method: o.payment_method,
          business_name: businessName,
          delivery_address: deliveryAddr || "",
          note_for_restaurant: o.note_for_restaurant || "",
          note_target: noteTarget,
          priority: Number(o.priority ?? 0),
          discount_amount: Number(snap.discount_amount ?? 0),
          raw_items: itemsArr,
          customer_id: u.user_id ?? null,
          customer_name: u.name || "",
          customer_email: u.email || "",
          customer_phone: u.phone || "",
        });
      }
    }
    return list
      .filter((o) => !HIDE_STATUSES.has(normalizeStatusKey(o.status)))
      .sort((a, b) => parseForSort(b.created_at) - parseForSort(a.created_at));
  } catch {
    return [];
  }
};

// ✅ Updated to read status from order_payload – REJECTED now maps to SCHEDULED_REJECTED and includes rejection reason
const normalizeScheduledForBiz = (payload, bizId) => {
  try {
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    const list = [];
    for (const job of rows) {
      const payloadOrder = job.order_payload || {};
      const apiStatus = payloadOrder.status;

      const allItems = Array.isArray(payloadOrder.items)
        ? payloadOrder.items
        : [];
      const itemsForBiz = bizId
        ? allItems.filter((it) => String(it.business_id) === String(bizId))
        : allItems;
      if (!itemsForBiz.length) continue;
      const sentAt =
        job.created_at ||
        job.createdAt ||
        payloadOrder.created_at ||
        payloadOrder.createdAt ||
        null;
      const itemsStr = itemsForBiz
        .map((it) => `${it.item_name ?? "Item"} ×${Number(it.quantity ?? 1)}`)
        .join(", ");
      const businessName = itemsForBiz[0]?.business_name || "";
      let noteTarget = "";
      const withNote = itemsForBiz.find((it) =>
        (
          it?.note_for_restaurant ||
          it?.note ||
          it?.special_request ||
          it?.instructions ||
          it?.customization ||
          it?.item_note
        )?.trim?.(),
      );
      if (withNote) noteTarget = withNote.item_name || withNote.name || "";

      const scheduledLocal =
        job.scheduled_at_local ||
        payloadOrder.scheduled_at_local ||
        payloadOrder.scheduled_at ||
        null;
      const scheduledUtc =
        job.scheduled_at_utc ||
        payloadOrder.scheduled_at_utc ||
        job.scheduled_at ||
        null;
      const scheduledAt = scheduledLocal || scheduledUtc || null;
      const pretty = scheduledAt ? showAsGiven(scheduledAt) : "";
      const timeLabel =
        payloadOrder.scheduled_label ||
        payloadOrder.scheduled_time_label ||
        payloadOrder.scheduledTimeLabel ||
        payloadOrder.scheduled_at_label ||
        (pretty ? `Scheduled • ${pretty}` : "Scheduled");

      const customer_name =
        job.name || payloadOrder.customer_name || payloadOrder.name || "";
      const customer_phone =
        payloadOrder.customer_phone || payloadOrder.phone || "";
      const scheduledAddr =
        payloadOrder?.delivery_address?.address ||
        payloadOrder?.deliver_to?.address ||
        payloadOrder?.delivery_address ||
        payloadOrder?.deliver_to?.label ||
        payloadOrder?.deliver_to?.formatted ||
        payloadOrder?.deliver_to ||
        "";
      const snap = getTotalsSnapshot(payloadOrder);
      const displayTotal = computeDisplayTotal({
        items: itemsForBiz,
        totals: snap,
      });

      // Map API status to internal status
      let orderStatus = "SCHEDULED";
      if (apiStatus === "ACCEPTED") orderStatus = "SCHEDULED_ACCEPTED";
      if (apiStatus === "REJECTED") orderStatus = "SCHEDULED_REJECTED";

      list.push({
        id: String(job.job_id || job.id),
        type:
          payloadOrder.fulfillment_type === "Delivery" ? "Delivery" : "Pickup",
        created_at: scheduledAt,
        sent_at: sentAt,
        scheduled_at_local: scheduledLocal || null,
        scheduled_at_utc: scheduledUtc || null,
        time: timeLabel,
        items: itemsStr,
        total: displayTotal,
        status: orderStatus,
        payment_method: payloadOrder.payment_method,
        business_name: businessName,
        delivery_address: String(scheduledAddr || ""),
        note_for_restaurant: payloadOrder.note_for_restaurant || "",
        note_target: noteTarget,
        priority: payloadOrder.priority ? 1 : 0,
        discount_amount: Number(
          snap.discount_amount ?? payloadOrder.discount_amount ?? 0,
        ),
        raw_items: itemsForBiz,
        customer_id: job.user_id ?? payloadOrder.user_id ?? null,
        customer_name,
        customer_email: "",
        customer_phone,
        accepted_at: payloadOrder.accepted_at || null,
        rejection_reason: payloadOrder.rejection_reason || null,
      });
    }
    return list.sort((a, b) => {
      const aStatus = normalizeStatusKey(a.status);
      const bStatus = normalizeStatusKey(b.status);

      const aPending = aStatus === "SCHEDULED";
      const bPending = bStatus === "SCHEDULED";

      if (aPending && bPending) {
        return parseForSort(b.sent_at) - parseForSort(a.sent_at);
      }

      if (aPending && !bPending) return -1;
      if (!aPending && bPending) return 1;

      return parseForSort(a.created_at) - parseForSort(b.created_at);
    });
  } catch {
    return [];
  }
};

/* ======================= Component ======================= */
export default function MartOrdersTab({
  isTablet,
  money,
  orders: ordersProp,
  businessId,
  orderEndpoint,
  appendOwnerType = true,
  ownerType: ownerTypeProp = "mart",
  detailsRoute = "OrderDetails",
  delivery_option: deliveryOptionProp,
  acceptScheduledEndpoint: propAcceptEndpoint, // optional override
  rejectScheduledEndpoint: propRejectEndpoint, // optional override
  onAcceptScheduled, // optional custom accept handler
  onDeclineScheduled, // optional custom decline handler
}) {
  const navigation = useNavigation();
  const route = useRoute();

  const [bizId, setBizId] = useState(
    businessId || route?.params?.businessId || null,
  );
  const initialOwnerType =
    route?.params?.owner_type ||
    route?.params?.ownerType ||
    ownerTypeProp ||
    "mart";
  const [ownerType, setOwnerType] = useState(String(initialOwnerType));
  const [deliveryOption, setDeliveryOption] = useState(
    route?.params?.delivery_option ||
      route?.params?.deliveryOption ||
      deliveryOptionProp ||
      null
      ? String(
          route?.params?.delivery_option ||
            route?.params?.deliveryOption ||
            deliveryOptionProp,
        ).toUpperCase()
      : null,
  );

  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState(
    Array.isArray(ordersProp)
      ? ordersProp.filter(
          (o) => !HIDE_STATUSES.has(normalizeStatusKey(o?.status)),
        )
      : [],
  );
  const [error, setError] = useState(null);
  const [scheduledOrders, setScheduledOrders] = useState([]);
  const [scheduledLoading, setScheduledLoading] = useState(false);
  const [scheduledError, setScheduledError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [kbHeight, setKbHeight] = useState(0);
  const [activeDateKey, setActiveDateKey] = useState("");
  const [showDateDropdown, setShowDateDropdown] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [tempCalendarDate, setTempCalendarDate] = useState(new Date());
  const [activeChip, setActiveChip] = useState("ALL");
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [declineModalVisible, setDeclineModalVisible] = useState(false);
  const [declineReasonInput, setDeclineReasonInput] = useState("");
  const [pendingDeclineOrder, setPendingDeclineOrder] = useState(null);

  const abortRef = useRef(null);

  // ✅ Hardware back button - redirect to GrabMerchantHomeScreen
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        navigation.navigate("GrabMerchantHomeScreen");
        return true;
      };
      const backHandler = BackHandler.addEventListener(
        "hardwareBackPress",
        onBackPress,
      );
      return () => backHandler.remove();
    }, [navigation]),
  );

  const today = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }, []);
  const yesterday = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }, []);
  const todayKey = useMemo(() => dateKeyFromDateObj(today), [today]);
  const yesterdayKey = useMemo(
    () => dateKeyFromDateObj(yesterday),
    [yesterday],
  );

  const STATUS_LABELS = useMemo(() => {
    const isMart = String(ownerType || "").toLowerCase() === "mart";
    return isMart
      ? BASE_STATUS_LABELS.filter((s) => s.key !== "PREPARING")
      : BASE_STATUS_LABELS;
  }, [ownerType]);

  // Use environment variables as defaults
  const acceptEndpoint = propAcceptEndpoint || ENV_ACCEPT_SCHEDULED;
  const rejectEndpoint = propRejectEndpoint || ENV_REJECT_SCHEDULED;

  useEffect(() => {
    const fromRoute =
      route?.params?.owner_type || route?.params?.ownerType || null;
    if (fromRoute && String(fromRoute) !== String(ownerType))
      setOwnerType(String(fromRoute));
  }, [route, ownerType]);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === "android" ? "keyboardDidShow" : "keyboardWillShow",
      (e) => setKbHeight(e.endCoordinates?.height || 0),
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === "android" ? "keyboardDidHide" : "keyboardWillHide",
      () => setKbHeight(0),
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        if (!bizId) {
          try {
            const blob = await SecureStore.getItemAsync("business_details");
            let id = null;
            if (blob) {
              try {
                const parsed = JSON.parse(blob);
                id = parsed?.business_id ?? parsed?.id ?? null;
                if (!deliveryOption && parsed?.delivery_option)
                  setDeliveryOption(
                    String(parsed.delivery_option).toUpperCase(),
                  );
                if (!ownerType && parsed?.owner_type)
                  setOwnerType(String(parsed.owner_type));
              } catch {}
            }
            if (!id) {
              const single = await SecureStore.getItemAsync("business_id");
              if (single) id = Number(single);
            }
            if (alive && id) setBizId(id);
          } catch {}
        }
        try {
          const raw = await SecureStore.getItemAsync("merchant_login");
          if (raw) {
            const parsed = JSON.parse(raw);
            const opt =
              parsed?.delivery_option ||
              parsed?.user?.delivery_option ||
              parsed?.user?.deliveryOption ||
              null;
            const oType =
              parsed?.owner_type ||
              parsed?.user?.owner_type ||
              parsed?.user?.ownerType ||
              null;
            if (opt && alive && !deliveryOption)
              setDeliveryOption(String(opt).toUpperCase());
            if (oType && alive && !ownerType) setOwnerType(String(oType));
          }
        } catch {}
      })();
      return () => {
        alive = false;
      };
    }, [bizId, deliveryOption, ownerType]),
  );

  const buildUrl = useCallback(() => {
    const base = (orderEndpoint ?? ENV_ORDER_ENDPOINT) || "";
    return buildOrdersUrl(base, bizId, { appendOwnerType, ownerType });
  }, [bizId, orderEndpoint, appendOwnerType, ownerType]);
  const buildScheduledApiUrl = useCallback(() => {
    const base = ENV_SCHEDULED_ORDER_ENDPOINT || "";
    return buildScheduledUrl(base, bizId);
  }, [bizId]);

  const fetchOrders = useCallback(
    async (opts = { silent: false }) => {
      if (!bizId) {
        setError("Missing businessId");
        return;
      }
      const url = buildUrl();
      if (!url) {
        setError("Invalid ORDER_ENDPOINT or businessId");
        return;
      }
      if (!opts.silent) setLoading(true);
      setError(null);
      try {
        abortRef.current?.abort?.();
        const controller = new AbortController();
        abortRef.current = controller;
        const token = await SecureStore.getItemAsync("auth_token");
        const headers = { Accept: "application/json" };
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch(url, { headers, signal: controller.signal });
        if (!res.ok) {
          const json = await parseJSON(res);
          const msg =
            (json && (json.message || json.error)) || `HTTP ${res.status}`;
          throw new Error(msg);
        }
        const json = await parseJSON(res);
        const list = normalizeOrdersFromApi(json).filter(
          (o) => !HIDE_STATUSES.has(normalizeStatusKey(o?.status)),
        );
        setOrders(list);
      } catch (e) {
        setError(String(e?.message || e) || "Failed to load orders");
      } finally {
        if (!opts.silent) setLoading(false);
      }
    },
    [bizId, buildUrl],
  );

  const fetchScheduledOrders = useCallback(
    async (opts = { silent: false }) => {
      if (!bizId) {
        setScheduledError("Missing businessId for scheduled orders");
        return;
      }
      const url = buildScheduledApiUrl();
      if (!url) {
        setScheduledError("Invalid SCHEDULED_ORDER_ENDPOINT or businessId");
        return;
      }
      if (!opts.silent) setScheduledLoading(true);
      setScheduledError(null);
      try {
        const token = await SecureStore.getItemAsync("auth_token");
        const headers = { Accept: "application/json" };
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch(url, { headers });
        if (!res.ok) {
          const json = await parseJSON(res);
          const msg =
            (json && (json.message || json.error)) || `HTTP ${res.status}`;
          throw new Error(msg);
        }
        const json = await parseJSON(res);
        const list = normalizeScheduledForBiz(json, bizId);
        setScheduledOrders(list);
      } catch (e) {
        setScheduledError(
          String(e?.message || e) || "Failed to load scheduled orders",
        );
      } finally {
        if (!opts.silent) setScheduledLoading(false);
      }
    },
    [bizId, buildScheduledApiUrl],
  );

  useEffect(() => {
    if (ordersProp && ordersProp.length)
      setOrders(
        ordersProp.filter(
          (o) => !HIDE_STATUSES.has(normalizeStatusKey(o?.status)),
        ),
      );
    else fetchOrders();
  }, [ordersProp, fetchOrders]);
  useEffect(() => {
    if (bizId) fetchScheduledOrders({ silent: true });
  }, [bizId, fetchScheduledOrders]);
  useEffect(() => {
    if (activeChip === "UPCOMING" && scheduledOrders.length === 0 && bizId)
      fetchScheduledOrders();
  }, [activeChip, scheduledOrders.length, bizId, fetchScheduledOrders]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      "order-updated",
      ({ id, patch }) => {
        const nextStatus = patch?.status
          ? normalizeStatusKey(patch.status)
          : null;
        if (nextStatus && HIDE_STATUSES.has(nextStatus)) {
          setOrders((prev) => prev.filter((o) => String(o.id) !== String(id)));
          return;
        }
        const fixedPatch = {
          ...patch,
          ...(nextStatus ? { status: nextStatus } : null),
        };
        setOrders((prev) =>
          prev.map((o) =>
            String(o.id) === String(id) ? { ...o, ...fixedPatch } : o,
          ),
        );
      },
    );
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("order-placed", (payload) => {
      try {
        const o = payload?.order;
        if (!o) return;
        const createdISO =
          o.created_at ||
          o.createdAt ||
          o.placed_at ||
          o.order_time ||
          new Date().toISOString();
        let liveNoteTarget = "";
        if (Array.isArray(o.items)) {
          const withNote = o.items.find((it) =>
            (
              it?.note_for_restaurant ||
              it?.note ||
              it?.special_request ||
              it?.instructions ||
              it?.customization ||
              it?.item_note
            )?.trim?.(),
          );
          if (withNote)
            liveNoteTarget = withNote.item_name || withNote.name || "";
        }
        const itemsArr = Array.isArray(o.items) ? o.items : [];
        const snap = getTotalsSnapshot(o);
        const displayTotal = computeDisplayTotal({
          items: itemsArr,
          totals: snap,
        });
        const normalizedStatus = normalizeStatusKey(o.status || "PENDING");
        if (HIDE_STATUSES.has(normalizedStatus)) return;
        const normalized = {
          id: String(o.order_id || o.id),
          type: o.fulfillment_type === "Delivery" ? "Delivery" : "Pickup",
          created_at: createdISO,
          time: showAsGiven(createdISO),
          items: (itemsArr || [])
            .map(
              (it) => `${it.item_name ?? "Item"} ×${Number(it.quantity ?? 1)}`,
            )
            .join(", "),
          total: displayTotal,
          status: normalizedStatus,
          payment_method: o.payment_method || "COD",
          business_name:
            (itemsArr && itemsArr[0] && itemsArr[0].business_name) ||
            o.business_name ||
            o.business?.business_name ||
            "Mart",
          customer_id: o.user?.user_id ?? null,
          customer_name: o.user?.name || "",
          customer_email: o.user?.email || "",
          customer_phone: o.user?.phone || "",
          raw_items: itemsArr,
          delivery_address: pickAddress(o) || "",
          note_for_restaurant: o.note_for_restaurant || "",
          note_target: liveNoteTarget,
          priority: Number(o.priority ?? 0),
          discount_amount: Number(snap.discount_amount ?? 0),
        };
        setOrders((prev) => {
          const without = prev.filter(
            (x) => String(x.id) !== String(normalized.id),
          );
          return [normalized, ...without]
            .filter((x) => !HIDE_STATUSES.has(normalizeStatusKey(x?.status)))
            .sort(
              (a, b) => parseForSort(b.created_at) - parseForSort(a.created_at),
            );
        });
      } catch {}
    });
    return () => sub?.remove?.();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (activeChip === "UPCOMING")
        await fetchScheduledOrders({ silent: true });
      else await fetchOrders({ silent: true });
    } finally {
      setRefreshing(false);
    }
  }, [fetchOrders, fetchScheduledOrders, activeChip]);

  const openOrder = useCallback(
    (o) => {
      Keyboard.dismiss();
      navigation.navigate(detailsRoute, {
        orderId: o.id,
        businessId: bizId,
        order: o,
        ownerType,
        delivery_option: deliveryOption,
        isScheduled: normalizeStatusKey(o.status) === "SCHEDULED",
      });
    },
    [navigation, bizId, detailsRoute, ownerType, deliveryOption],
  );

  const dateFilteredOrders = useMemo(() => {
    if (!activeDateKey) return orders;
    return orders.filter((o) => {
      const key = dateKeyFromTs(o.created_at || o.time || "");
      return key === activeDateKey;
    });
  }, [orders, activeDateKey]);
  const statusCounts = useMemo(
    () =>
      dateFilteredOrders.reduce((acc, o) => {
        const k = normalizeStatusKey(o.status);
        acc[k] = (acc[k] || 0) + 1;
        return acc;
      }, {}),
    [dateFilteredOrders],
  );
  const upcomingCount = scheduledOrders.length;
  const totalCount = dateFilteredOrders.length;

  const filtered = useMemo(() => {
    const source =
      activeChip === "UPCOMING" ? scheduledOrders : dateFilteredOrders;
    let base = source;
    if (activeChip !== "ALL" && activeChip !== "UPCOMING")
      base = base.filter((o) => normalizeStatusKey(o.status) === activeChip);
    const q = activeChip === "UPCOMING" ? "" : query.trim().toLowerCase();
    if (q)
      base = base.filter((o) => {
        const hay = [
          o.id,
          o.items,
          o.status,
          o.type,
          o.payment_method,
          o.business_name,
          o.time,
          o.customer_name,
          o.customer_phone,
          o.customer_email,
          o.note_for_restaurant,
          o.note_target,
          o.delivery_address,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    return base.filter(
      (o) => !HIDE_STATUSES.has(normalizeStatusKey(o?.status)),
    );
  }, [dateFilteredOrders, scheduledOrders, query, activeChip]);

  const handleAccept = useCallback(
    async (order) => {
      Alert.alert(
        "Accept Scheduled Order",
        `Do you want to accept order ${order.id}? It will stay in Upcoming until its scheduled time.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Accept",
            style: "default",
            onPress: async () => {
              setActionLoadingId(order.id);
              try {
                if (onAcceptScheduled) {
                  await onAcceptScheduled(order.id, order);
                } else {
                  if (!acceptEndpoint)
                    throw new Error("Accept endpoint not configured");
                  let url = acceptEndpoint.replace(
                    "{jobId}",
                    encodeURIComponent(String(order.id)),
                  );
                  if (!url.startsWith("http")) {
                    throw new Error(`Accept URL is not absolute: ${url}`);
                  }
                  console.log("[Accept] URL:", url);
                  const token = await SecureStore.getItemAsync("auth_token");
                  const res = await fetch(url, {
                    method: "PATCH",
                    headers: {
                      "Content-Type": "application/json",
                      ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                    body: JSON.stringify({ status: "ACCEPTED" }),
                  });
                  if (!res.ok) {
                    const text = await res.text();
                    throw new Error(`Failed to accept: ${res.status} ${text}`);
                  }
                }
                // Optimistic UI update
                setScheduledOrders((prev) =>
                  prev.map((o) =>
                    o.id === order.id
                      ? { ...o, status: "SCHEDULED_ACCEPTED" }
                      : o,
                  ),
                );
                Alert.alert(
                  "Accepted",
                  `Order ${order.id} will be processed at its scheduled time.`,
                );
              } catch (err) {
                Alert.alert("Error", err.message || "Could not accept order");
              } finally {
                setActionLoadingId(null);
              }
            },
          },
        ],
        { cancelable: true },
      );
    },
    [acceptEndpoint, onAcceptScheduled],
  );

  const openDeclineModal = useCallback((order) => {
    setPendingDeclineOrder(order);
    setDeclineReasonInput("");
    setDeclineModalVisible(true);
  }, []);

  const confirmDecline = useCallback(async () => {
    if (!pendingDeclineOrder) return;
    const reason = declineReasonInput.trim() || "Item not available";
    setActionLoadingId(pendingDeclineOrder.id);
    setDeclineModalVisible(false);
    try {
      if (onDeclineScheduled) {
        await onDeclineScheduled(
          pendingDeclineOrder.id,
          pendingDeclineOrder,
          reason,
        );
      } else {
        if (!rejectEndpoint) throw new Error("Reject endpoint not configured");
        let url = rejectEndpoint.replace(
          "{jobId}",
          encodeURIComponent(String(pendingDeclineOrder.id)),
        );
        if (!url.startsWith("http")) {
          throw new Error(`Reject URL is not absolute: ${url}`);
        }
        console.log("[Reject] URL:", url);
        const token = await SecureStore.getItemAsync("auth_token");
        const res = await fetch(url, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ status: "REJECTED", reason }),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Failed to reject: ${res.status} ${text}`);
        }
      }
      // Optimistic remove – but the API will now return REJECTED status, so on refresh it will appear as rejected
      setScheduledOrders((prev) =>
        prev.filter((o) => o.id !== pendingDeclineOrder.id),
      );
      Alert.alert(
        "Declined",
        `Order ${pendingDeclineOrder.id} has been declined.\nReason: ${reason}`,
      );
    } catch (err) {
      Alert.alert("Error", err.message || "Could not decline order");
    } finally {
      setActionLoadingId(null);
      setPendingDeclineOrder(null);
    }
  }, [
    pendingDeclineOrder,
    declineReasonInput,
    rejectEndpoint,
    onDeclineScheduled,
  ]);

  const renderItem = useCallback(
    ({ item }) => (
      <OrderItem
        isTablet={isTablet}
        money={money}
        item={item}
        onPress={openOrder}
        isUpcoming={activeChip === "UPCOMING"}
        onAccept={handleAccept}
        onDecline={openDeclineModal}
        actionLoadingId={actionLoadingId}
      />
    ),
    [
      isTablet,
      money,
      openOrder,
      activeChip,
      handleAccept,
      openDeclineModal,
      actionLoadingId,
    ],
  );

  const content = useMemo(() => {
    const isUpcoming = activeChip === "UPCOMING";
    const effectiveOrders = isUpcoming ? scheduledOrders : dateFilteredOrders;
    const isLoading = isUpcoming ? scheduledLoading : loading;
    const err = isUpcoming ? scheduledError : error;
    if (isLoading && effectiveOrders.length === 0)
      return (
        <View style={{ paddingVertical: 24, alignItems: "center" }}>
          <ActivityIndicator />
          <Text style={{ marginTop: 8, color: "#6b7280" }}>
            Loading orders…
          </Text>
        </View>
      );
    if (err && effectiveOrders.length === 0)
      return (
        <View style={{ paddingVertical: 24, alignItems: "center" }}>
          <Ionicons name="alert-circle-outline" size={24} color="#b91c1c" />
          <Text style={{ color: "#b91c1c", fontWeight: "700", marginTop: 6 }}>
            Failed to load
          </Text>
          <Text style={{ color: "#6b7280", marginTop: 4, textAlign: "center" }}>
            {err}
          </Text>
        </View>
      );
    if (!isLoading && filtered.length === 0)
      return (
        <View style={{ paddingVertical: 36, alignItems: "center" }}>
          <Ionicons name="file-tray-outline" size={36} color="#94a3b8" />
          <Text style={{ color: "#334155", fontWeight: "800", marginTop: 8 }}>
            No orders
          </Text>
          <Text style={{ color: "#64748b", marginTop: 4 }}>
            Pull down to refresh or change filters.
          </Text>
        </View>
      );
    return (
      <FlatList
        contentContainerStyle={{ paddingBottom: 24 + kbHeight }}
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="always"
        removeClippedSubviews={false}
      />
    );
  }, [
    activeChip,
    dateFilteredOrders,
    scheduledOrders,
    filtered,
    kbHeight,
    refreshing,
    onRefresh,
    renderItem,
    loading,
    error,
    scheduledLoading,
    scheduledError,
  ]);

  const currentDateLabel = useMemo(() => {
    if (!activeDateKey) return "All dates";
    return labelForDateKey(activeDateKey, todayKey, yesterdayKey);
  }, [activeDateKey, todayKey, yesterdayKey]);
  const applyCalendarDate = useCallback(() => {
    const key = dateKeyFromDateObj(tempCalendarDate);
    setActiveDateKey(key);
    setShowCalendar(false);
    setShowDateDropdown(false);
  }, [tempCalendarDate]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      pointerEvents="box-none"
    >
      <View style={{ flex: 1, paddingHorizontal: 16 }} pointerEvents="box-none">
        <View
          style={{ marginTop: 12, marginBottom: 8 }}
          pointerEvents="box-none"
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              alignItems: "center",
              paddingVertical: 8,
              gap: 8,
            }}
          >
            <TouchableOpacity
              onPress={() => setActiveChip("ALL")}
              style={[
                styles.statusChip,
                activeChip === "ALL" && styles.statusChipActive,
              ]}
              activeOpacity={0.7}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Text
                style={[
                  styles.statusChipText,
                  activeChip === "ALL" && styles.statusChipTextActive,
                ]}
              >
                All
              </Text>
              <View
                style={[
                  styles.badge,
                  activeChip === "ALL" && styles.badgeActive,
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    activeChip === "ALL" && styles.badgeTextActive,
                  ]}
                >
                  {totalCount}
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setActiveChip("UPCOMING")}
              style={[
                styles.statusChip,
                activeChip === "UPCOMING" && styles.statusChipActive,
              ]}
              activeOpacity={0.7}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Text
                style={[
                  styles.statusChipText,
                  activeChip === "UPCOMING" && styles.statusChipTextActive,
                ]}
              >
                Upcoming
              </Text>
              <View
                style={[
                  styles.badge,
                  activeChip === "UPCOMING" && styles.badgeActive,
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    activeChip === "UPCOMING" && styles.badgeTextActive,
                  ]}
                >
                  {upcomingCount}
                </Text>
              </View>
            </TouchableOpacity>
            {STATUS_LABELS.map((s) => {
              const active = activeChip === s.key;
              const count = statusCounts[s.key] || 0;
              return (
                <TouchableOpacity
                  key={s.key}
                  onPress={() => setActiveChip(s.key)}
                  style={[styles.statusChip, active && styles.statusChipActive]}
                  activeOpacity={0.7}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text
                    style={[
                      styles.statusChipText,
                      active && styles.statusChipTextActive,
                    ]}
                  >
                    {s.label}
                  </Text>
                  {count > 0 ? (
                    <View style={[styles.badge, active && styles.badgeActive]}>
                      <Text
                        style={[
                          styles.badgeText,
                          active && styles.badgeTextActive,
                        ]}
                      >
                        {count}
                      </Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {activeChip !== "UPCOMING" && (
          <>
            <View style={styles.searchRow} pointerEvents="auto">
              <View style={[styles.searchWrap, { flex: 1 }]}>
                <Ionicons name="search-outline" size={18} color="#64748b" />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search orders (id, item, status, customer, note…)"
                  placeholderTextColor="#94a3b8"
                  value={query}
                  onChangeText={setQuery}
                  autoCorrect={false}
                  autoCapitalize="none"
                  returnKeyType="search"
                />
                {query ? (
                  <TouchableOpacity
                    onPress={() => setQuery("")}
                    style={styles.clearBtn}
                    activeOpacity={0.7}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Ionicons name="close-circle" size={18} color="#94a3b8" />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
            <View style={styles.dateRow}>
              <Text style={styles.dateRowLabel}>Filter by date</Text>
              <TouchableOpacity
                style={styles.dateDropdown}
                onPress={() => {
                  setShowDateDropdown(true);
                  setShowCalendar(false);
                  setTempCalendarDate(new Date());
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.dateDropdownText} numberOfLines={1}>
                  {currentDateLabel}
                </Text>
                <Ionicons name="chevron-down" size={16} color="#0f172a" />
              </TouchableOpacity>
            </View>
          </>
        )}

        {activeChip === "UPCOMING" && filtered.length > 2 && (
  <View style={styles.scrollHint}>
    <Ionicons name="chevron-down-circle-outline" size={16} color="#0f766e" />
    <Text style={styles.scrollHintText}>
      {filtered.length} scheduled orders • Scroll down to see more
    </Text>
  </View>
)}

{content}

        <Modal
          visible={showDateDropdown}
          transparent
          animationType="fade"
          onRequestClose={() => {
            setShowCalendar(false);
            setShowDateDropdown(false);
          }}
        >
          <View style={styles.modalOverlay}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => {
                setShowCalendar(false);
                setShowDateDropdown(false);
              }}
            />
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Select date</Text>
              <ScrollView style={{ maxHeight: 260 }}>
                <TouchableOpacity
                  style={[
                    styles.modalOption,
                    activeDateKey === "" && styles.modalOptionActive,
                  ]}
                  onPress={() => {
                    setActiveDateKey("");
                    setShowCalendar(false);
                    setShowDateDropdown(false);
                  }}
                >
                  <Text
                    style={[
                      styles.modalOptionText,
                      activeDateKey === "" && styles.modalOptionTextActive,
                    ]}
                  >
                    All dates
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalOption,
                    activeDateKey === todayKey && styles.modalOptionActive,
                  ]}
                  onPress={() => {
                    setActiveDateKey(todayKey);
                    setShowCalendar(false);
                    setShowDateDropdown(false);
                  }}
                >
                  <Text
                    style={[
                      styles.modalOptionText,
                      activeDateKey === todayKey &&
                        styles.modalOptionTextActive,
                    ]}
                  >
                    Today
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalOption,
                    activeDateKey === yesterdayKey && styles.modalOptionActive,
                  ]}
                  onPress={() => {
                    setActiveDateKey(yesterdayKey);
                    setShowCalendar(false);
                    setShowDateDropdown(false);
                  }}
                >
                  <Text
                    style={[
                      styles.modalOptionText,
                      activeDateKey === yesterdayKey &&
                        styles.modalOptionTextActive,
                    ]}
                  >
                    Yesterday
                  </Text>
                </TouchableOpacity>
                <View style={{ marginTop: 8 }}>
                  <TouchableOpacity
                    style={styles.calendarBtn}
                    onPress={() => setShowCalendar(true)}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name="calendar-outline"
                      size={16}
                      color="#0f172a"
                    />
                    <Text style={styles.calendarBtnText}>
                      Pick from calendar
                    </Text>
                  </TouchableOpacity>
                </View>
                {showCalendar && (
                  <View style={{ marginTop: 8 }}>
                    <DateTimePicker
                      value={tempCalendarDate}
                      mode="date"
                      display={Platform.OS === "ios" ? "inline" : "calendar"}
                      onChange={(event, selectedDate) => {
                        if (Platform.OS === "android") {
                          if (event.type === "set" && selectedDate) {
                            const key = dateKeyFromDateObj(selectedDate);
                            setActiveDateKey(key);
                          }
                          setShowCalendar(false);
                          setShowDateDropdown(false);
                        } else {
                          if (selectedDate) setTempCalendarDate(selectedDate);
                        }
                      }}
                    />
                    {Platform.OS === "ios" && (
                      <View style={styles.iosCalendarActions}>
                        <TouchableOpacity
                          onPress={() => setShowCalendar(false)}
                          style={[
                            styles.iosCalendarBtn,
                            { backgroundColor: "#e5e7eb" },
                          ]}
                        >
                          <Text
                            style={[
                              styles.iosCalendarBtnText,
                              { color: "#111827" },
                            ]}
                          >
                            Cancel
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={applyCalendarDate}
                          style={[
                            styles.iosCalendarBtn,
                            { backgroundColor: "#BRAND.purple" },
                          ]}
                        >
                          <Text
                            style={[
                              styles.iosCalendarBtnText,
                              { color: "#fff" },
                            ]}
                          >
                            Apply
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Decline Reason Modal */}
        <Modal
          visible={declineModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setDeclineModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setDeclineModalVisible(false)}
            />
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Decline Scheduled Order</Text>
              <Text style={{ marginBottom: 8, color: "#334155" }}>
                Please provide a reason for declining:
              </Text>
              <TextInput
                style={[styles.searchWrap, { marginBottom: 16 }]}
                value={declineReasonInput}
                onChangeText={setDeclineReasonInput}
                placeholder="e.g., Item not available"
                placeholderTextColor="#94a3b8"
                autoFocus
              />
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "flex-end",
                  gap: 12,
                }}
              >
                <TouchableOpacity
                  onPress={() => setDeclineModalVisible(false)}
                  style={{ paddingHorizontal: 16, paddingVertical: 8 }}
                >
                  <Text style={{ color: BRAND.grey, fontWeight: "600" }}>
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={confirmDecline}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    backgroundColor: BRAND.red,
                    borderRadius: 8,
                  }}
                >
                  <Text style={{ color: BRAND.white, fontWeight: "700" }}>
                    Decline
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Grouped Orders FAB hidden in Upcoming tab */}
        {activeChip !== "UPCOMING" && (
          <TouchableOpacity
            style={styles.fab}
            onPress={() =>
              navigation.navigate("NearbyOrdersScreen", {
                businessId: bizId,
                ownerType,
                orderEndpoint: orderEndpoint ?? ENV_ORDER_ENDPOINT,
                detailsRoute,
                thresholdKm: 5,
                orders:
                  activeChip === "UPCOMING"
                    ? scheduledOrders.filter((o) => o.type === "Delivery")
                    : dateFilteredOrders.filter((o) => o.type === "Delivery"),
              })
            }
            activeOpacity={0.9}
          >
            <Ionicons
              name="albums-outline"
              size={isTablet ? 24 : 22}
              color={BRAND.purple}
            />
            <Text style={styles.fabLabel}>Grouped Orders</Text>
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  headerInlineText: {
    fontSize: 14,
    fontWeight: "800",
    color: BRAND.black,
    marginRight: 2,
  },

  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
    backgroundColor: BRAND.white,
    borderWidth: 1,
    borderColor: "#F3E8FF",
    // ...SHADOW.sm,
  },
  statusChipActive: {
    backgroundColor: BRAND.purple,
    borderColor: BRAND.purple,
  },
  statusChipText: {
    color: BRAND.black,
    fontFamily: FONT.body,
    fontWeight: "800",
    fontSize: 13,
  },
  statusChipTextActive: {
    color: BRAND.white,
  },

  badge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 6,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F4E9FF",
    marginLeft: 6,
  },
  badgeActive: {
    backgroundColor: BRAND.white,
  },
  badgeText: {
    color: BRAND.purple,
    fontSize: 11,
    fontWeight: "900",
  },
  badgeTextActive: {
    color: BRAND.purple,
  },

  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: BRAND.white,
    borderWidth: 1,
    borderColor: "#F3E8FF",
    // ...SHADOW.sm,
  },
  searchInput: {
    flex: 1,
    color: BRAND.black,
    paddingVertical: 0,
    fontFamily: FONT.body,
    fontWeight: "700",
  },
  clearBtn: {
    padding: 4,
    borderRadius: 999,
  },

  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    justifyContent: "space-between",
  },
  dateRowLabel: {
    fontSize: 12,
    color: BRAND.grey,
    fontWeight: "800",
    fontFamily: FONT.body,
  },
  dateDropdown: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: "#F3E8FF",
    backgroundColor: BRAND.white,
    maxWidth: "60%",
    // ...SHADOW.sm,
  },
  dateDropdownText: {
    fontSize: 12,
    fontWeight: "900",
    color: BRAND.black,
    marginRight: 4,
    fontFamily: FONT.body,
  },

  card: {
    backgroundColor: BRAND.white,
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: "#F3E8FF",
    // ...SHADOW.sm,
  },
  scheduledTime: {
    marginTop: 6,
    marginBottom: 6,
    color: BRAND.purple,
    fontWeight: "900",
    fontSize: 13,
    fontFamily: FONT.body,
  },
  row1: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  row1Left: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  orderId: {
    fontWeight: "900",
    color: BRAND.black,
    fontFamily: FONT.header,
  },
  orderTime: {
    color: BRAND.grey,
    fontWeight: "700",
  },
  orderTotal: {
    fontWeight: "900",
    color: BRAND.purple,
    fontFamily: FONT.header,
  },

  row2: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
    marginBottom: 8,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
  },
  pillText: {
    fontWeight: "900",
    fontSize: 12,
    fontFamily: FONT.body,
  },

  payWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginLeft: "auto",
    backgroundColor: "#FBF7FF",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
  },
  payText: {
    color: BRAND.grey,
    fontWeight: "800",
    fontSize: 12,
  },

  orderItems: {
    marginTop: 8,
    color: "#334155",
    fontWeight: "700",
    lineHeight: 19,
  },

  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
  },
  customerText: {
    color: BRAND.grey,
    fontWeight: "700",
    flexShrink: 1,
  },

  noteRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: "#F4E9FF",
    borderWidth: 1,
    borderColor: "#F3E8FF",
  },
  noteText: {
    flex: 1,
    color: BRAND.purple,
    fontWeight: "800",
  },
  noteMeta: {
    marginTop: 4,
    color: BRAND.grey,
    fontWeight: "800",
  },

  rejectionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    marginBottom: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "#FFE7EE",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#FFD4DD",
  },
  rejectionText: {
    flex: 1,
    color: BRAND.red,
    fontWeight: "800",
    fontSize: 12,
  },

  fab: {
    position: "absolute",
    right: 20,
    bottom: 24,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: RADIUS.pill,
    backgroundColor: "#F3E4FF",
    // ...SHADOW.md,
  },
  fabLabel: {
    color: BRAND.purple,
    fontWeight: "900",
    marginLeft: 8,
    fontSize: 14,
    fontFamily: FONT.body,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.35)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "86%",
    maxWidth: 380,
    backgroundColor: BRAND.white,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: "#F3E8FF",
    // ...SHADOW.md,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: BRAND.black,
    marginBottom: 10,
    fontFamily: FONT.header,
  },
  modalOption: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
  },
  modalOptionActive: {
    backgroundColor: "#F4E9FF",
  },
  modalOptionText: {
    fontSize: 13,
    color: BRAND.black,
    fontWeight: "800",
  },
  modalOptionTextActive: {
    color: BRAND.purple,
  },

  calendarBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#F3E8FF",
    backgroundColor: "#FBF7FF",
  },
  calendarBtnText: {
    fontSize: 13,
    fontWeight: "900",
    color: BRAND.black,
  },

  iosCalendarActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 8,
    gap: 10,
  },
  iosCalendarBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: RADIUS.pill,
  },
  iosCalendarBtnText: {
    fontSize: 13,
    fontWeight: "900",
  },

  actionButtonsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: RADIUS.pill,
    gap: 8,
  },
  acceptButton: {
    backgroundColor: "#BRAND.purple",
  },
  declineButton: {
    backgroundColor: BRAND.red,
  },
  actionButtonText: {
    color: BRAND.white,
    fontWeight: "900",
    fontSize: 14,
  },

  acceptedBadge: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    paddingVertical: 9,
    paddingHorizontal: 12,
    backgroundColor: "#ecfdf5",
    borderRadius: RADIUS.pill,
    gap: 6,
  },
  acceptedText: {
    color: "#BRAND.purple",
    fontWeight: "800",
    fontSize: 12,
  },

  scrollHint: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginBottom: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: RADIUS.pill,
    backgroundColor: "#F4E9FF",
    borderWidth: 1,
    borderColor: "#F3E8FF",
  },
  scrollHintText: {
    color: BRAND.purple,
    fontSize: 12,
    fontWeight: "900",
  },
});
