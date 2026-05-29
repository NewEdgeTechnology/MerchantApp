// screens/food/SalesAnalyticsScreen.js - FINAL WORKING VERSION
import React, {
  useMemo,
  useState,
  useRef,
  useEffect,
  useCallback,
} from "react";
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
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as SecureStore from "expo-secure-store";
import { useRoute, useFocusEffect } from "@react-navigation/native";
import { BRAND, FONT, RADIUS, SHADOW } from "../styles/tabdey_brand";
import {
  Svg,
  Polyline,
  Circle,
  Defs,
  LinearGradient,
  Stop,
  Rect,
} from "react-native-svg";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as XLSX from "xlsx";
import { TOTAL_SALES_ENDPOINT } from "@env";

/* ===========================
   CONFIG
   =========================== */

const getTotalSalesUrl = (businessId) => {
  return TOTAL_SALES_ENDPOINT.replace("{business_id}", businessId);
};

const CACHE_TTL = 60 * 1000;

const COLORS = {
  GRAB_GREEN: BRAND.purple,
  DARK: BRAND.black,
  MID: BRAND.grey,
  MUTED: "#94A3B8",
};
const BORDER = "#F3E8FF";
const FILL = "#FBF7FF";

/* ===========================
   DATE HELPERS
   =========================== */
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const endOfDay = (d) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);

const startOfWeek = (d) => {
  const day = (d.getDay() + 6) % 7;
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
   AUTH
   =========================== */
async function getAccessTokenFromSecureStore() {
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
  const keys = [
    "merchant_login",
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
   SVG LINE CHART
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
    if (idx >= 0 && idx < buckets.length)
      buckets[idx].total += Number(o.amount || 0);
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

  const [tab, setTab] = useState("Day");
  const [anchorDate, setAnchorDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState({
    total_amount: 0,
    orders_count: 0,
    rows_count: 0,
  });
  const [orders, setOrders] = useState([]);
  const [chart, setChart] = useState([]);
  const [showInfo, setShowInfo] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  const cacheRef = useRef(new Map());

  const formatNu = (n) => {
    const x = Number(n || 0);
    if (!Number.isFinite(x)) return "0.00";
    return x.toFixed(2);
  };

  const { start, end } = useMemo(() => {
    if (tab === "Week")
      return { start: startOfWeek(anchorDate), end: endOfWeek(anchorDate) };
    if (tab === "Month")
      return { start: startOfMonth(anchorDate), end: endOfMonth(anchorDate) };
    return { start: startOfDay(anchorDate), end: endOfDay(anchorDate) };
  }, [tab, anchorDate]);

  const resolveBusinessId = useCallback(async () => {
    const p = route?.params || {};
    const fromProps =
      props?.business_id ??
      props?.businessId ??
      props?.business?.business_id ??
      props?.business?.id ??
      null;
    if (fromProps != null && String(fromProps).trim() !== "")
      return Number(fromProps);
    const direct =
      p.business_id ??
      p.businessId ??
      p?.business?.business_id ??
      p?.business?.id ??
      null;
    if (direct != null && String(direct).trim() !== "") return Number(direct);
    const user = await getUserInfoFallback();
    const userObj = user?.user ?? user;
    const fromUser =
      userObj?.business_id ??
      userObj?.businessId ??
      userObj?.business?.business_id ??
      userObj?.business?.id ??
      null;
    if (fromUser != null && String(fromUser).trim() !== "")
      return Number(fromUser);
    throw new Error("No business id");
  }, [route?.params, props]);

  const deriveForRange = useCallback(
    (allOrders, rangeStart, rangeEnd) => {
      const sTs = rangeStart.getTime();
      const eTs = rangeEnd.getTime();
      const inRange = (allOrders || [])
        .filter((o) => o?.ts && o.ts >= sTs && o.ts <= eTs)
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
    [tab, anchorDate],
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
        const url = getTotalSalesUrl(business_id);
        const token = await getAccessTokenFromSecureStore();
        const res = await fetch(url, {
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success)
          throw new Error(json?.message || json?.error || `HTTP ${res.status}`);

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
        setError("Couldn't load sales. Pull to retry.");
      } finally {
        setLoading(false);
      }
    },
    [resolveBusinessId, deriveForRange, start, end],
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
    }, [resolveBusinessId, deriveForRange, start, end]),
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
    if (Platform.OS === "android" && event?.type === "dismissed") {
      setShowPicker(false);
      return;
    }
    setShowPicker(false);
    if (picked) setAnchorDate(picked);
  };

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
  }, [tab, anchorDate]);

  // Generate Excel data
  const generateExcelData = () => {
    const periodRange = rangeText(tab, anchorDate);
    const periodType = tab;

    // Calculate totals
    const dailyTotals = new Map();
    orders.forEach((order) => {
      const date = new Date(order.ts);
      const dateKey = date.toLocaleDateString();
      const current = dailyTotals.get(dateKey) || { amount: 0, count: 0 };
      current.amount += order.amount;
      current.count += 1;
      dailyTotals.set(dateKey, current);
    });

    let totalSales = 0;
    let totalOrders = 0;
    const dailyBreakdown = [];

    Array.from(dailyTotals.entries())
      .sort((a, b) => new Date(a[0]) - new Date(b[0]))
      .forEach(([date, data]) => {
        dailyBreakdown.push({
          Date: date,
          "Order Count": data.count,
          "Total Amount (BTN)": data.amount.toFixed(2),
          "Average Order (BTN)": (data.amount / data.count).toFixed(2),
        });
        totalSales += data.amount;
        totalOrders += data.count;
      });

    // Create workbook
    const workbook = XLSX.utils.book_new();

    // SUMMARY SHEET
    const summarySheetData = [
      ["SALES ANALYTICS REPORT"],
      [""],
      [`Report Period: ${periodRange}`],
      [`Report Type: ${periodType}`],
      [`Generated: ${new Date().toLocaleString()}`],
      [""],
      ["SUMMARY"],
      [`Total Sales: BTN ${totalSales.toFixed(2)}`],
      [`Total Orders: ${totalOrders}`],
      [`Average Order Value: BTN ${(totalSales / totalOrders).toFixed(2)}`],
      [""],
      ["DAILY BREAKDOWN"],
      [""],
      ["Date", "Order Count", "Total Amount (BTN)", "Average Order (BTN)"],
    ];

    dailyBreakdown.forEach((day) => {
      summarySheetData.push([
        day.Date,
        day["Order Count"],
        day["Total Amount (BTN)"],
        day["Average Order (BTN)"],
      ]);
    });

    summarySheetData.push([""]);
    summarySheetData.push([
      "TOTAL",
      totalOrders,
      `BTN ${totalSales.toFixed(2)}`,
      `BTN ${(totalSales / totalOrders).toFixed(2)}`,
    ]);

    const wsSummary = XLSX.utils.aoa_to_sheet(summarySheetData);
    wsSummary["!cols"] = [{ wch: 15 }, { wch: 12 }, { wch: 18 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(workbook, wsSummary, "Summary");

    // ORDER DETAILS SHEET
    const ordersSheetData = [
      ["ORDER DETAILS REPORT"],
      [""],
      [`Period: ${periodRange}`],
      [`Generated: ${new Date().toLocaleString()}`],
      [""],
      ["#", "Order ID", "Date", "Time", "Amount (BTN)", "Status"],
    ];

    orders.forEach((order, index) => {
      const date = new Date(order.ts);
      ordersSheetData.push([
        (index + 1).toString(),
        order.id,
        date.toLocaleDateString(),
        date.toLocaleTimeString(),
        order.amount.toFixed(2),
        order.raw?.status || "Completed",
      ]);
    });

    ordersSheetData.push([""]);
    ordersSheetData.push([
      "TOTAL",
      "",
      "",
      "",
      `BTN ${totalSales.toFixed(2)}`,
      "",
    ]);

    const wsOrders = XLSX.utils.aoa_to_sheet(ordersSheetData);
    wsOrders["!cols"] = [
      { wch: 5 },
      { wch: 15 },
      { wch: 12 },
      { wch: 10 },
      { wch: 15 },
      { wch: 12 },
    ];
    XLSX.utils.book_append_sheet(workbook, wsOrders, "Order Details");

    // CHART DATA SHEET
    const chartSheetData = [
      [`${periodType} BREAKDOWN CHART DATA`],
      [""],
      ["Period", "Sales Amount (BTN)"],
    ];

    chart.forEach((point) => {
      chartSheetData.push([point.label, point.value.toFixed(2)]);
    });

    const wsChart = XLSX.utils.aoa_to_sheet(chartSheetData);
    wsChart["!cols"] = [{ wch: 10 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(workbook, wsChart, "Chart Data");

    return {
      workbook,
      fileName: `sales_report_${tab}_${toYMDLocal(anchorDate)}.xlsx`,
    };
  };

  // EXPORT FUNCTION USING NEW EXPO FILESYSTEM API
  const exportAndShare = async () => {
    if (orders.length === 0) {
      Alert.alert(
        "No Data",
        "No orders available to export for the selected period.",
      );
      return;
    }

    setExporting(true);
    setShowExportMenu(false);

    try {
      const { workbook, fileName } = generateExcelData();

      // Write Excel file to base64 string
      const wbout = XLSX.write(workbook, { type: "base64", bookType: "xlsx" });

      // Create a new file in the document directory using the new API
      const file = new File(Paths.document, fileName);

      // Convert base64 string to Uint8Array
      const binaryString = atob(wbout);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Write the file using the new API
      await file.write(bytes);

      // Check if sharing is available
      const isSharingAvailable = await Sharing.isAvailableAsync();

      if (isSharingAvailable) {
        await Sharing.shareAsync(file.uri, {
          mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          dialogTitle: "Export Sales Report",
          UTI: "com.microsoft.excel.xlsx", // For iOS
        });
      } else {
        Alert.alert(
          "File Saved",
          `File saved to: ${file.uri}\n\nYou can find it in your device's file manager.`,
        );
      }
    } catch (error) {
      console.error("Export error:", error);
      Alert.alert(
        "Export Failed",
        "Failed to export data.\n\nError: " + error.message,
      );
    } finally {
      setExporting(false);
    }
  };

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
      <Text style={styles.tripAmt}>BTN {formatNu(item.amount)}</Text>
    </View>
  );

  return (
    <View style={[styles.safe]}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Sales Analytics</Text>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <Pressable
            onPress={() => setShowExportMenu(true)}
            hitSlop={8}
            style={{ padding: 4 }}
          >
            <Ionicons
              name="download-outline"
              size={24}
              color={COLORS.GRAB_GREEN}
            />
          </Pressable>
          <Pressable
            onPress={() => setShowInfo(true)}
            hitSlop={8}
            style={{ padding: 4 }}
          >
            <Ionicons
              name="information-circle-outline"
              size={24}
              color={COLORS.MID}
            />
          </Pressable>
        </View>
      </View>

      <View style={styles.tabsRow}>
        {["Day", "Week", "Month"].map((t) => {
          const active = tab === t;
          return (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {t}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.rangeRow}>
        <Pressable onPress={shiftLeft} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={18} color={COLORS.DARK} />
        </Pressable>
        <Pressable
          onPress={() => setShowPicker(true)}
          style={styles.rangeCenter}
        >
          <Ionicons name="calendar-outline" size={16} color={COLORS.MID} />
          <Text style={styles.rangeText}>{rangeText(tab, anchorDate)}</Text>
        </Pressable>
        <Pressable onPress={shiftRight} style={styles.iconBtn}>
          <Ionicons name="chevron-forward" size={18} color={COLORS.DARK} />
        </Pressable>
      </View>

      {showPicker && (
        <View style={styles.pickerWrap}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>Select date</Text>
            <Pressable
              onPress={() => setShowPicker(false)}
              hitSlop={8}
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

      <View style={styles.summaryStrip}>
        <View style={styles.summaryBlock}>
          <Text style={styles.summaryLabel}>
            {tab === "Day"
              ? "Today"
              : tab === "Week"
                ? "This week"
                : "This month"}
          </Text>
          <Text style={styles.summaryValue}>
            BTN {formatNu(summary.total_amount ?? 0)}
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

      <FlatList
        data={orders}
        keyExtractor={(i) => String(i.id)}
        renderItem={renderOrder}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 80 }}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.GRAB_GREEN}
            colors={[COLORS.GRAB_GREEN]}
          />
        }
        ListHeaderComponent={
          <>
            <View style={{ marginTop: 12 }}>
              {loading && chart.length === 0 ? (
                <View
                  style={{
                    alignItems: "center",
                    justifyContent: "center",
                    height: 120,
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
                }}
              >
                {error}
              </Text>
            )}

            <Text style={[styles.sectionTitle, { marginLeft: 2 }]}>Orders</Text>
          </>
        }
        ListEmptyComponent={
          !loading && (
            <View style={{ alignItems: "center", marginTop: 24 }}>
              <Text
                style={{ color: COLORS.MUTED, fontSize: 12, fontWeight: "700" }}
              >
                No orders in this range
              </Text>
            </View>
          )
        }
      />

      {/* Export Menu Modal */}
      <Modal
        visible={showExportMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowExportMenu(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Export Report</Text>
              <Pressable onPress={() => setShowExportMenu(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={COLORS.MID} />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 420 }}>
              <Pressable
                style={styles.exportOption}
                onPress={exportAndShare}
                disabled={exporting}
              >
                <Ionicons
                  name="share-social-outline"
                  size={24}
                  color={COLORS.GRAB_GREEN}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.exportOptionTitle}>
                    Export & Share Excel Report
                  </Text>
                  <Text style={styles.exportOptionDesc}>
                    Generate Excel file and share via Email, WhatsApp, or save
                    to device
                  </Text>
                </View>
              </Pressable>

              {exporting && (
                <View style={{ alignItems: "center", marginTop: 16 }}>
                  <ActivityIndicator color={COLORS.GRAB_GREEN} />
                  <Text style={{ marginTop: 8, color: COLORS.MID }}>
                    Generating report...
                  </Text>
                </View>
              )}
            </ScrollView>
            <Pressable
              style={[
                styles.primaryBtn,
                { backgroundColor: COLORS.MID, marginTop: 10 },
              ]}
              onPress={() => setShowExportMenu(false)}
            >
              <Text style={styles.primaryBtnText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Info Modal */}
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
            <ScrollView style={{ maxHeight: 420 }}>
              <Text style={styles.modalPara}>
                This screen shows your{" "}
                <Text style={styles.bold}>total sales</Text> for the selected
                period (Day / Week / Month).
              </Text>
              <View style={styles.hr} />
              <View style={styles.bullet}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bulletText}>
                  <Text style={styles.bold}>Total</Text>: sum of order amounts
                  in the selected range.
                </Text>
              </View>
              <View style={styles.bullet}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bulletText}>
                  <Text style={styles.bold}>Orders</Text>: number of orders
                  found within the range.
                </Text>
              </View>
              <View style={styles.bullet}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bulletText}>
                  <Text style={styles.bold}>Chart</Text>: Day shows last few
                  orders; Week groups by day (Mon–Sun); Month groups across the
                  month.
                </Text>
              </View>
              <View style={styles.hr} />
              <Text style={styles.modalPara}>
                <Text style={styles.bold}>Export:</Text> Click the share button
                to generate an Excel report that you can:
              </Text>
              <View style={styles.bullet}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bulletText}>
                  Send via Email or WhatsApp
                </Text>
              </View>
              <View style={styles.bullet}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bulletText}>
                  Save to Google Drive / iCloud
                </Text>
              </View>
              <View style={styles.bullet}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bulletText}>
                  Save to device storage (using "Save to Files" option)
                </Text>
              </View>
              <View style={styles.hr} />
              <Text style={styles.modalPara}>
                Pull down to refresh and fetch the latest data from the server.
              </Text>
            </ScrollView>
            <Pressable
              style={styles.primaryBtn}
              onPress={() => setShowInfo(false)}
            >
              <Text style={styles.primaryBtnText}>Got it</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#FBF7FF",
  },

  headerRow: {
    paddingTop: Platform.OS === "ios" ? 56 : 12,
    paddingBottom: 12,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  headerTitle: {
    color: BRAND.black,
    fontFamily: FONT.header,
    fontWeight: "900",
    fontSize: 21,
  },

  tabsRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    marginBottom: 10,
    gap: 8,
  },

  tab: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: "#F3E8FF",
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BRAND.white,
  },

  tabActive: {
    backgroundColor: BRAND.purple,
    borderColor: BRAND.purple,
  },

  tabText: {
    color: BRAND.grey,
    fontWeight: "900",
    fontSize: 12,
    fontFamily: FONT.body,
  },

  tabTextActive: {
    color: BRAND.white,
  },

  rangeRow: {
    marginHorizontal: 16,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
  },

  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: "#F3E8FF",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BRAND.white,
    ...SHADOW.sm,
  },

  rangeCenter: {
    flex: 1,
    marginHorizontal: 8,
    height: 38,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: "#F3E8FF",
    backgroundColor: BRAND.white,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    ...SHADOW.sm,
  },

  rangeText: {
    fontSize: 12,
    color: BRAND.black,
    fontWeight: "900",
    fontFamily: FONT.body,
  },

  pickerWrap: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: BRAND.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#F3E8FF",
    overflow: "hidden",
  },

  pickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F3E8FF",
  },

  pickerTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: BRAND.grey,
  },

  summaryStrip: {
    marginHorizontal: 16,
    backgroundColor: BRAND.white,
    borderRadius: 22,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#F3E8FF",
    ...SHADOW.sm,
  },

  summaryBlock: {
    flex: 1,
  },

  summaryLabel: {
    color: BRAND.grey,
    fontSize: 11,
    fontWeight: "800",
    fontFamily: FONT.body,
  },

  summaryValue: {
    color: BRAND.purple,
    fontSize: 15,
    fontWeight: "900",
    marginTop: 3,
    fontFamily: FONT.header,
  },

  vDivider: {
    width: 1,
    height: 30,
    backgroundColor: "#F3E8FF",
    marginHorizontal: 10,
  },

  chartCard: {
    backgroundColor: BRAND.white,
    borderWidth: 1,
    borderColor: "#F3E8FF",
    borderRadius: 22,
    paddingVertical: 8,
    overflow: "hidden",
    ...SHADOW.sm,
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
    fontWeight: "800",
  },

  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
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
    color: BRAND.grey,
    fontWeight: "900",
  },

  sectionTitle: {
    marginTop: 16,
    marginBottom: 8,
    marginLeft: 0,
    color: BRAND.black,
    fontWeight: "900",
    fontSize: 15,
    fontFamily: FONT.header,
  },

  tripRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: BRAND.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#F3E8FF",
  },

  tripRoute: {
    fontSize: 13,
    fontWeight: "900",
    color: BRAND.black,
    marginRight: 5,
  },

  tripMeta: {
    fontSize: 11,
    color: BRAND.grey,
    marginTop: 3,
    fontWeight: "700",
  },

  tripAmt: {
    fontSize: 13,
    fontWeight: "900",
    color: BRAND.purple,
  },

  separator: {
    height: 10,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "center",
    padding: 18,
  },

  modalCard: {
    backgroundColor: BRAND.white,
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: "#F3E8FF",
    ...SHADOW.md,
  },

  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },

  modalTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: BRAND.black,
    fontFamily: FONT.header,
  },

  modalPara: {
    fontSize: 13,
    color: BRAND.black,
    marginTop: 6,
    lineHeight: 19,
  },

  bullet: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 7,
  },

  bulletDot: {
    width: 16,
    textAlign: "center",
    color: BRAND.purple,
    marginTop: -2,
    fontWeight: "900",
  },

  bulletText: {
    flex: 1,
    fontSize: 13,
    color: BRAND.black,
    lineHeight: 19,
  },

  bold: {
    fontWeight: "900",
  },

  hr: {
    height: 1,
    backgroundColor: "#F3E8FF",
    marginVertical: 12,
  },

  primaryBtn: {
    marginTop: 12,
    backgroundColor: BRAND.purple,
    borderRadius: RADIUS.pill,
    paddingVertical: 13,
    alignItems: "center",
    ...SHADOW.sm,
  },

  primaryBtnText: {
    color: BRAND.white,
    fontWeight: "900",
  },

  exportOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    marginVertical: 5,
    gap: 12,
    borderWidth: 1,
    borderColor: "#F3E8FF",
    borderRadius: 18,
    backgroundColor: "#FBF7FF",
  },

  exportOptionTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: BRAND.black,
  },

  exportOptionDesc: {
    fontSize: 12,
    color: BRAND.grey,
    marginTop: 3,
    fontWeight: "600",
  },
});
