// screens/food/SalesAnalyticsScreen.js
import React, { useMemo, useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  StatusBar,
  Platform,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  Modal,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as SecureStore from "expo-secure-store";
import { useRoute, useFocusEffect } from "@react-navigation/native";
import {
  Svg,
  Polyline,
  Circle,
  Defs,
  LinearGradient,
  Stop,
  Rect,
} from "react-native-svg";

/* ===========================
   CONFIG
   =========================== */

// ✅ Endpoint you provided
const TOTAL_SALES_URL = (businessId) =>
  `https://grab.newedge.bt/merchant/api/merchant-earnings/business/${encodeURIComponent(
    businessId
  )}`;

const CACHE_TTL = 60 * 1000;

/* ===========================
   THEME (no external import)
   =========================== */
const COLORS = {
  GRAB_GREEN: "#00B14F",
  DARK: "#0F172A",
  MID: "#64748B",
  MUTED: "#94A3B8",
};
const BORDER = "#E5E7EB";
const FILL = "#F9FAFB";

/* ===========================
   DATE HELPERS (Mon week)
   =========================== */
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const endOfDay = (d) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);

const startOfWeek = (d) => {
  const day = (d.getDay() + 6) % 7; // Mon=0..Sun=6
  const s = new Date(d);
  s.setDate(d.getDate() - day);
  return startOfDay(s);
};
const endOfWeek = (d) => {
  const s = startOfWeek(d);
  const e = new Date(s);
  e.setDate(s.getDate() + 6);
  return endOfDay(e);
};

const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth = (d) =>
  endOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0));

/** Local YYYY-MM-DD (no UTC conversion) */
const toYMDLocal = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const fmtShort = (d) =>
  d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
const fmtLong = (d) =>
  d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const rangeText = (tab, date) => {
  if (tab === "Day") return fmtLong(date);
  if (tab === "Week") {
    const s = startOfWeek(date);
    const e = endOfWeek(date);
    return `${fmtShort(s)} – ${fmtLong(e)}`;
  }
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
};

const parseRowDate = (row) => {
  const d = new Date(row?.date);
  return Number.isFinite(d?.getTime?.()) ? d : null;
};

/* ===========================
   AUTH (token + user)
   =========================== */
async function getAccessTokenFromSecureStore() {
  // ✅ aligns with your app keys: merchant_login -> token.access_token OR token
  const tryMerchantLogin = async () => {
    try {
      const raw = await SecureStore.getItemAsync("merchant_login");
      if (!raw) return "";
      const parsed = JSON.parse(raw);
      const token =
        parsed?.token?.access_token ||
        parsed?.token ||
        parsed?.access_token ||
        null;
      return token ? String(token).trim() : "";
    } catch {
      return "";
    }
  };

  const t0 = await tryMerchantLogin();
  if (t0 && t0.length > 10) return t0;

  const keysToTry = [
    "auth_token",
    "AUTH_TOKEN",
    "accessToken",
    "ACCESS_TOKEN",
    "token",
    "authToken",
    "jwt",
    "JWT",
  ];
  for (const k of keysToTry) {
    try {
      const v = await SecureStore.getItemAsync(k);
      if (v && String(v).trim().length > 10) return String(v).trim();
    } catch {}
  }
  return "";
}

async function getUserInfoFallback() {
  // ✅ tries many keys so you don't depend on ../utils/authToken
  const keys = [
    "merchant_login", // IMPORTANT: contains business_id in your app
    "userInfo",
    "USER_INFO",
    "user",
    "USER",
    "profile",
    "PROFILE",
    "auth_user",
    "AUTH_USER",
    "last_ctx_payload",
    "LAST_CTX_PAYLOAD",
  ];

  for (const k of keys) {
    try {
      const raw = await SecureStore.getItemAsync(k);
      if (!raw) continue;
      const obj = JSON.parse(raw);
      if (obj && typeof obj === "object") return obj;
    } catch {}
  }
  return null;
}

/* ===========================
   SVG LINE CHART (like EarningsScreen)
   =========================== */
const LineChart = ({
  data = [],
  height = 160,
  padding = 16,
  color = COLORS.GRAB_GREEN,
  legendLabel = "Sales",
}) => {
  const width = Math.max(280, Dimensions.get("window").width - 32);
  const H = height;
  const PAD = padding;

  const top = 10,
    bottom = 22;

  const values = (data || []).map((d) => Number(d?.value || 0));
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);

  const innerW = width - PAD * 2;
  const innerH = H - top - bottom;

  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;

  const toY = (v) => {
    const ratio = (v - min) / (max - min || 1);
    return top + (1 - ratio) * innerH;
  };

  const points = data.map((d, i) => {
    const x = PAD + i * stepX;
    const y = toY(Number(d.value || 0));
    return { x, y, label: d.label, value: Number(d.value || 0) };
  });

  const polyPoints = points.map((p) => `${p.x},${p.y}`).join(" ");

  const areaPoints =
    points.length > 0
      ? `${PAD},${top + innerH} ${polyPoints} ${
          PAD + (points.length - 1) * stepX
        },${top + innerH}`
      : "";

  return (
    <View style={styles.chartCard}>
      <Svg height={H} width={width}>
        <Rect x="0" y="0" width={width} height={H} fill="#fff" />

        <Defs>
          <LinearGradient id="gradSales" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="0.25" />
            <Stop offset="1" stopColor={color} stopOpacity="0" />
          </LinearGradient>
        </Defs>

        {points.length >= 2 && (
          <Polyline points={areaPoints} fill="url(#gradSales)" stroke="none" />
        )}

        {points.length >= 2 && (
          <Polyline
            points={polyPoints}
            fill="none"
            stroke={color}
            strokeWidth="2.5"
          />
        )}

        {points.map((p, idx) => (
          <Circle
            key={`dot-${idx}`}
            cx={p.x}
            cy={p.y}
            r="3.5"
            fill="#fff"
            stroke={color}
            strokeWidth="2"
          />
        ))}
      </Svg>

      <View style={[styles.xLabelsRow, { width }]}>
        {points.map((p, i) => (
          <Text
            key={`lbl-${i}`}
            numberOfLines={1}
            style={[styles.xLabel, { left: p.x - 20 }]}
          >
            {String(p.label)}
          </Text>
        ))}
      </View>

      <View style={styles.legendRow}>
        <View style={[styles.legendDot, { backgroundColor: color }]} />
        <Text style={styles.legendText}>{legendLabel}</Text>
      </View>
    </View>
  );
};

/* ===========================
   CLIENT-SIDE BUCKETING
   =========================== */
function buildDayChart(ordersInRange) {
  const sorted = [...ordersInRange].sort((a, b) => (a?.ts || 0) - (b?.ts || 0));
  const last = sorted.slice(-8);
  return last.map((o, idx) => ({
    label: String(idx + 1),
    value: Number(o.amount || 0),
  }));
}

function buildWeekChart(ordersInRange, anchorDate) {
  const s = startOfWeek(anchorDate);
  const buckets = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(s);
    d.setDate(s.getDate() + i);
    buckets.push({
      key: toYMDLocal(d),
      total: 0,
    });
  }

  const map = new Map(buckets.map((b) => [b.key, b]));
  for (const o of ordersInRange) {
    const key = toYMDLocal(new Date(o.ts));
    const b = map.get(key);
    if (b) b.total += Number(o.amount || 0);
  }

  const dow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return buckets.map((b, i) => ({
    label: dow[i],
    value: Math.round(b.total * 100) / 100,
  }));
}

function buildMonthChart(ordersInRange, anchorDate) {
  const e = endOfMonth(anchorDate);
  const days = new Date(e.getFullYear(), e.getMonth() + 1, 0).getDate();
  const buckets = Array.from({ length: days }, (_, i) => ({
    day: i + 1,
    total: 0,
  }));

  const month = anchorDate.getMonth();
  const year = anchorDate.getFullYear();

  for (const o of ordersInRange) {
    const d = new Date(o.ts);
    if (d.getFullYear() !== year || d.getMonth() !== month) continue;
    const idx = d.getDate() - 1;
    if (idx >= 0 && idx < buckets.length) buckets[idx].total += Number(o.amount || 0);
  }

  const target = 8;
  const step = Math.max(1, Math.ceil(buckets.length / target));
  const sampled = [];
  for (let i = 0; i < buckets.length; i += step) sampled.push(buckets[i]);
  if (sampled[sampled.length - 1]?.day !== buckets[buckets.length - 1]?.day) {
    sampled.push(buckets[buckets.length - 1]);
  }

  return sampled.map((b) => ({
    label: String(b.day),
    value: Math.round(b.total * 100) / 100,
  }));
}

/* ===========================
   SCREEN
   =========================== */
export default function SalesAnalyticsScreen(props) {
  const route = useRoute();

  const [tab, setTab] = useState("Day"); // Day | Week | Month
  const [anchorDate, setAnchorDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [summary, setSummary] = useState({
    total_amount: 0,
    orders_count: 0,
    rows_count: 0,
  });

  const [orders, setOrders] = useState([]);
  const [chart, setChart] = useState([]);
  const [showInfo, setShowInfo] = useState(false);

  const cacheRef = useRef(new Map());
  const androidPad = Platform.OS === "android" ? StatusBar.currentHeight || 0 : 0;

  const formatNu = (n) => {
    const x = Number(n || 0);
    if (!Number.isFinite(x)) return "0.00";
    return x.toFixed(2);
  };

  const { start, end } = useMemo(() => {
    if (tab === "Week") {
      return { start: startOfWeek(anchorDate), end: endOfWeek(anchorDate) };
    }
    if (tab === "Month") {
      return { start: startOfMonth(anchorDate), end: endOfMonth(anchorDate) };
    }
    return { start: startOfDay(anchorDate), end: endOfDay(anchorDate) };
  }, [tab, anchorDate]);

  // ✅ UPDATED: supports props (tab embedding) + route params + SecureStore
  const resolveBusinessId = useCallback(async () => {
    const p = route?.params || {};

    const fromProps =
      props?.business_id ??
      props?.businessId ??
      props?.business?.business_id ??
      props?.business?.id ??
      null;

    if (fromProps != null && String(fromProps).trim() !== "") return Number(fromProps);

    const direct =
      p.business_id ??
      p.businessId ??
      p?.business?.business_id ??
      p?.business?.id ??
      null;

    if (direct != null && String(direct).trim() !== "") return Number(direct);

    const user = await getUserInfoFallback();
    const userObj = user?.user ?? user; // merchant_login keeps user under user
    const fromUser =
      userObj?.business_id ??
      userObj?.businessId ??
      userObj?.business?.business_id ??
      userObj?.business?.id ??
      null;

    if (fromUser != null && String(fromUser).trim() !== "") return Number(fromUser);

    throw new Error("No business id (pass business_id in route params or props)");
  }, [route?.params, props]);

  const deriveForRange = useCallback(
    (allOrders, rangeStart, rangeEnd) => {
      const sTs = rangeStart.getTime();
      const eTs = rangeEnd.getTime();

      const inRange = (allOrders || [])
        .filter((o) => typeof o?.ts === "number" && o.ts >= sTs && o.ts <= eTs)
        .sort((a, b) => b.ts - a.ts);

      const total = inRange.reduce((acc, o) => acc + Number(o.amount || 0), 0);

      let nextChart = [];
      if (tab === "Day") nextChart = buildDayChart(inRange);
      else if (tab === "Week") nextChart = buildWeekChart(inRange, anchorDate);
      else nextChart = buildMonthChart(inRange, anchorDate);

      return {
        summary: {
          total_amount: Math.round(total * 100) / 100,
          orders_count: inRange.length,
          rows_count: inRange.length,
        },
        orders: inRange,
        chart: nextChart,
      };
    },
    [tab, anchorDate]
  );

  const fetchAllSales = useCallback(
    async (force = false) => {
      try {
        setError("");
        setLoading(true);

        const business_id = await resolveBusinessId();
        const key = `biz:${business_id}:all`;

        if (!force) {
          const cached = cacheRef.current.get(key);
          if (cached && Date.now() - cached.ts < CACHE_TTL) {
            const derived = deriveForRange(cached.allOrders, start, end);
            setSummary(derived.summary);
            setOrders(derived.orders);
            setChart(derived.chart);
            setLoading(false);
            return;
          }
        }

        const url = TOTAL_SALES_URL(business_id);
        console.log("[sales] GET", url);

        const token = await getAccessTokenFromSecureStore();
        const res = await fetch(url, {
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });

        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          throw new Error(json?.message || json?.error || `HTTP ${res.status}`);
        }

        const rows = Array.isArray(json?.rows) ? json.rows : [];
        const allOrders = rows
          .map((r, idx) => {
            const d = parseRowDate(r);
            const amt = Number(r?.total_amount || 0);
            return {
              id: String(r?.order_id || `ROW-${idx}`),
              amount: Number.isFinite(amt) ? amt : 0,
              when: d ? d.toLocaleString() : String(r?.date || ""),
              ts: d ? d.getTime() : 0,
              raw: r,
            };
          })
          .filter((o) => o.ts > 0);

        cacheRef.current.set(key, { allOrders, ts: Date.now() });

        const derived = deriveForRange(allOrders, start, end);
        setSummary(derived.summary);
        setOrders(derived.orders);
        setChart(derived.chart);
      } catch (e) {
        console.warn("[sales] fetch failed:", e?.message);
        setError("Couldn’t load sales. Pull to retry.");
      } finally {
        setLoading(false);
      }
    },
    [resolveBusinessId, deriveForRange, start, end]
  );

  useEffect(() => {
    fetchAllSales(false);
  }, [fetchAllSales]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const business_id = await resolveBusinessId();
          const key = `biz:${business_id}:all`;
          const cached = cacheRef.current.get(key);
          if (cached?.allOrders) {
            const derived = deriveForRange(cached.allOrders, start, end);
            setSummary(derived.summary);
            setOrders(derived.orders);
            setChart(derived.chart);
          }
        } catch {}
      })();
    }, [resolveBusinessId, deriveForRange, start, end])
  );

  const onRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      await fetchAllSales(true);
    } finally {
      setRefreshing(false);
    }
  }, [fetchAllSales]);

  const shiftLeft = () => {
    const d = new Date(anchorDate);
    if (tab === "Day") d.setDate(d.getDate() - 1);
    else if (tab === "Week") d.setDate(d.getDate() - 7);
    else d.setMonth(d.getMonth() - 1);
    setAnchorDate(d);
  };

  const shiftRight = () => {
    const d = new Date(anchorDate);
    if (tab === "Day") d.setDate(d.getDate() + 1);
    else if (tab === "Week") d.setDate(d.getDate() + 7);
    else d.setMonth(d.getMonth() + 1);
    setAnchorDate(d);
  };

  const onPick = (event, picked) => {
    if (Platform.OS === "android") {
      if (event?.type === "dismissed") {
        setShowPicker(false);
        return;
      }
      setShowPicker(false);
    }
    if (picked) setAnchorDate(picked);
  };

  // re-derive when changing tab/date (from cache if exists)
  useEffect(() => {
    (async () => {
      try {
        const business_id = await resolveBusinessId();
        const key = `biz:${business_id}:all`;
        const cached = cacheRef.current.get(key);
        if (cached?.allOrders) {
          const derived = deriveForRange(cached.allOrders, start, end);
          setSummary(derived.summary);
          setOrders(derived.orders);
          setChart(derived.chart);
        } else {
          fetchAllSales(false);
        }
      } catch {
        fetchAllSales(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, anchorDate]);

  const renderOrder = ({ item }) => (
    <View style={styles.tripRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.tripRoute} numberOfLines={2}>
          {String(item.id)}
        </Text>
        <Text style={styles.tripMeta} numberOfLines={2}>
          {String(item.when || "—")}
        </Text>
      </View>
      <Text style={styles.tripAmt}>Nu {formatNu(item.amount)}</Text>
    </View>
  );

  return (
    <View style={[styles.safe, { paddingTop: androidPad }]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Sales Analytics</Text>

        <Pressable
          onPress={() => setShowInfo(true)}
          hitSlop={8}
          android_ripple={{ color: "#E5E7EB", borderless: true }}
          style={{ padding: 4 }}
        >
          <Ionicons
            name="information-circle-outline"
            size={24}
            color={COLORS.MID}
          />
        </Pressable>
      </View>

      {/* Tabs */}
      <View style={styles.tabsRow}>
        {["Day", "Week", "Month"].map((t) => {
          const active = tab === t;
          return (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              android_ripple={{ color: "#E5E7EB" }}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {t}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Date range row */}
      <View style={styles.rangeRow}>
        <Pressable
          onPress={shiftLeft}
          style={styles.iconBtn}
          android_ripple={{ color: "#E5E7EB" }}
        >
          <Ionicons name="chevron-back" size={18} color={COLORS.DARK} />
        </Pressable>

        <Pressable
          onPress={() => setShowPicker(true)}
          style={styles.rangeCenter}
          android_ripple={{ color: "#E5E7EB" }}
        >
          <Ionicons name="calendar-outline" size={16} color={COLORS.MID} />
          <Text style={styles.rangeText}>{rangeText(tab, anchorDate)}</Text>
        </Pressable>

        <Pressable
          onPress={shiftRight}
          style={styles.iconBtn}
          android_ripple={{ color: "#E5E7EB" }}
        >
          <Ionicons name="chevron-forward" size={18} color={COLORS.DARK} />
        </Pressable>
      </View>

      {/* Calendar card */}
      {showPicker && (
        <View style={styles.pickerWrap}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>Select date</Text>
            <Pressable
              onPress={() => setShowPicker(false)}
              hitSlop={8}
              android_ripple={{ color: "#E5E7EB", borderless: true }}
              style={{ padding: 4 }}
            >
              <Ionicons name="close" size={18} color={COLORS.MID} />
            </Pressable>
          </View>

          <DateTimePicker
            value={anchorDate}
            mode="date"
            display={Platform.OS === "ios" ? "inline" : "calendar"}
            onChange={onPick}
          />
        </View>
      )}

      {/* Summary */}
      <View style={styles.summaryStrip}>
        <View style={styles.summaryBlock}>
          <Text style={styles.summaryLabel}>
            {tab === "Day" ? "Today" : tab === "Week" ? "This week" : "This month"}
          </Text>
          <Text style={styles.summaryValue}>
            Nu {formatNu(summary.total_amount ?? 0)}
          </Text>
        </View>

        <View style={styles.vDivider} />

        <View style={styles.summaryBlock}>
          <Text style={styles.summaryLabel}>Orders</Text>
          <Text style={styles.summaryValue}>{summary.orders_count ?? 0}</Text>
        </View>

        <View style={styles.vDivider} />

        <View style={styles.summaryBlock}>
          <Text style={styles.summaryLabel}>Rows</Text>
          <Text style={styles.summaryValue}>{summary.rows_count ?? 0}</Text>
        </View>
      </View>

      {/* Line chart (SVG like EarningsScreen) */}
      <View style={{ marginTop: 12, marginHorizontal: 16 }}>
        {loading && chart.length === 0 ? (
          <View
            style={{
              alignItems: "center",
              justifyContent: "center",
              height: 120,
              width: "100%",
              backgroundColor: "#fff",
              borderWidth: 1,
              borderColor: BORDER,
              borderRadius: 10,
            }}
          >
            <ActivityIndicator color={COLORS.GRAB_GREEN} />
          </View>
        ) : (
          <LineChart data={chart} height={160} legendLabel="Sales" />
        )}
      </View>

      {!!error && (
        <Text
          style={{
            color: "#EF4444",
            fontSize: 11,
            marginTop: 6,
            marginLeft: 16,
          }}
        >
          {error}
        </Text>
      )}

      {/* Orders */}
      <Text style={styles.sectionTitle}>Orders</Text>
      <FlatList
        data={orders}
        keyExtractor={(i) => String(i.id)}
        renderItem={renderOrder}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 80 }}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.GRAB_GREEN}
            colors={[COLORS.GRAB_GREEN]}
          />
        }
        ListEmptyComponent={
          !loading && (
            <View style={{ alignItems: "center", marginTop: 24 }}>
              <Text style={{ color: COLORS.MUTED, fontSize: 12, fontWeight: "700" }}>
                No orders in this range
              </Text>
            </View>
          )
        }
      />

      {/* ===================== INFO MODAL ===================== */}
      <Modal
        visible={showInfo}
        transparent
        animationType="fade"
        onRequestClose={() => setShowInfo(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>How sales analytics works</Text>
              <Pressable onPress={() => setShowInfo(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={COLORS.MID} />
              </Pressable>
            </View>

            <ScrollView
              style={{ maxHeight: 420 }}
              contentContainerStyle={{ paddingBottom: 8 }}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.modalPara}>
                This screen shows your <Text style={styles.bold}>total sales</Text>{" "}
                for the selected period (Day / Week / Month).
              </Text>

              <View style={styles.hr} />

              <View style={styles.bullet}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bulletText}>
                  <Text style={styles.bold}>Total</Text>: sum of order amounts in the
                  selected range.
                </Text>
              </View>

              <View style={styles.bullet}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bulletText}>
                  <Text style={styles.bold}>Orders</Text>: number of orders found
                  within the range.
                </Text>
              </View>

              <View style={styles.bullet}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bulletText}>
                  <Text style={styles.bold}>Chart</Text>: Day shows last few orders;
                  Week groups by day (Mon–Sun); Month groups across the month.
                </Text>
              </View>

              <View style={styles.hr} />

              <Text style={styles.modalPara}>
                Pull down to refresh and fetch the latest data from the server.
              </Text>
            </ScrollView>

            <Pressable style={styles.primaryBtn} onPress={() => setShowInfo(false)}>
              <Text style={styles.primaryBtnText}>Got it</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      {/* =================== /INFO MODAL =================== */}
    </View>
  );
}

/* ===========================
   STYLES
   =========================== */
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },

  headerRow: {
    paddingTop: Platform.OS === "ios" ? 56 : 12,
    paddingBottom: 10,
    paddingHorizontal: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: { color: COLORS.DARK, fontWeight: "600", fontSize: 18 },

  tabsRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  tab: {
    flex: 1,
    height: 34,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 4,
    backgroundColor: "#fff",
  },
  tabActive: {
    backgroundColor: COLORS.GRAB_GREEN,
    borderColor: COLORS.GRAB_GREEN,
  },
  tabText: { color: COLORS.MID, fontWeight: "800", fontSize: 11 },
  tabTextActive: { color: "#fff" },

  rangeRow: {
    marginHorizontal: 16,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  rangeCenter: {
    flex: 1,
    marginHorizontal: 8,
    height: 34,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  rangeText: { fontSize: 12, color: COLORS.DARK, fontWeight: "800" },

  pickerWrap: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: "hidden",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
  pickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
    borderBottomWidth: 2,
    borderBottomColor: "#F3F4F6",
    width: "100%",
  },
  pickerTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.MID,
  },

  summaryStrip: {
    marginHorizontal: 16,
    backgroundColor: FILL,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  summaryBlock: { flex: 1 },
  summaryLabel: { color: COLORS.MUTED, fontSize: 11, fontWeight: "600" },
  summaryValue: {
    color: COLORS.DARK,
    fontSize: 14,
    fontWeight: "900",
    marginTop: 2,
  },
  vDivider: {
    width: 1,
    height: 26,
    backgroundColor: BORDER,
    marginHorizontal: 10,
  },

  chartCard: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 0,
    overflow: "hidden",
  },
  xLabelsRow: {
    position: "relative",
    height: 20,
    marginTop: -2,
  },
  xLabel: {
    position: "absolute",
    width: 40,
    textAlign: "center",
    fontSize: 10,
    color: COLORS.MUTED,
    fontWeight: "700",
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingBottom: 8,
    paddingTop: 2,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 6,
  },
  legendText: {
    fontSize: 11,
    color: COLORS.MID,
    fontWeight: "800",
  },

  sectionTitle: {
    marginTop: 14,
    marginBottom: 6,
    marginLeft: 16,
    color: COLORS.MID,
    fontWeight: "800",
    fontSize: 14,
  },
  tripRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
  },
  tripRoute: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.DARK,
    marginRight: 5,
  },
  tripMeta: { fontSize: 11, color: COLORS.MUTED, marginTop: 2 },
  tripAmt: { fontSize: 13, fontWeight: "800", color: COLORS.DARK },
  separator: { height: 1, backgroundColor: "#F3F4F6" },

  // Modal shared
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.28)",
    justifyContent: "center",
    padding: 18,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  modalTitle: { fontSize: 16, fontWeight: "900", color: COLORS.DARK },
  modalPara: { fontSize: 12, color: COLORS.DARK, marginTop: 6 },
  bullet: { flexDirection: "row", alignItems: "flex-start", marginTop: 6 },
  bulletDot: {
    width: 16,
    textAlign: "center",
    color: COLORS.MID,
    marginTop: -2,
  },
  bulletText: { flex: 1, fontSize: 12, color: COLORS.DARK },
  bold: { fontWeight: "900" },
  hr: { height: 1, backgroundColor: BORDER, marginVertical: 10 },
  primaryBtn: {
    marginTop: 10,
    backgroundColor: COLORS.GRAB_GREEN,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "900" },
});
