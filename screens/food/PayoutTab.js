// ✅ Drop-in update for PayoutTab.js:
// - Fetch wallet using: WALLET_ENDPOINT=https://grab.newedge.bt/wallet/wallet/getbyuser/{user_id}
// - Your wallet response is: { success:true, data:{ wallet_id:"NET000003", ... } }
// - So walletId must be read from json.data.wallet_id (and fallback to other keys)

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import {
  TANSACTION_HISTORY_ENDPOINT as ENV_WALLET_TXN,
  WALLET_ENDPOINT as ENV_WALLET,
  STATUS_COUNT_ENDPOINT as ENV_STATUS_COUNT_ENDPOINT,
  TOTAL_SALES_ENDPOINT,
} from "@env";

const money = (n) => `Nu ${Number(n ?? 0).toFixed(2)}`;

/* ───────────────────────── helpers ───────────────────────── */

const UP = (s) => String(s || "").toUpperCase();
const ACTIVE_FOOD = ["PENDING", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY"];
const ACTIVE_MART = ["PENDING", "CONFIRMED", "READY", "OUT_FOR_DELIVERY"];
const CANCEL_SET = new Set(["CANCELLED", "CANCELED", "REJECTED", "DECLINED"]);

async function getAuthHeader() {
  try {
    const raw = await SecureStore.getItemAsync("merchant_login");
    let token = null;
    if (raw) {
      const parsed = JSON.parse(raw);
      token = parsed?.token?.access_token || parsed?.token || null;
    }
    if (!token) token = await SecureStore.getItemAsync("auth_token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

async function fetchJSON(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}
  if (!res.ok) {
    const msg = (json && (json.message || json.error)) || text || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

// replaces {x} OR :x (and common aliases)
const buildUrl = (template, replacements = {}) => {
  let out = String(template || "");
  for (const [k, v] of Object.entries(replacements || {})) {
    const val = encodeURIComponent(String(v));
    out = out.replaceAll(`{${k}}`, val);
    out = out.replaceAll(`:${k}`, val);

    if (k === "user_id") {
      out = out.replaceAll("{userId}", val).replaceAll(":userId", val);
    }
    if (k === "wallet_id") {
      out = out.replaceAll("{walletId}", val).replaceAll(":walletId", val);
    }
    if (k === "business_id") {
      out = out.replaceAll("{businessId}", val).replaceAll(":businessId", val);
    }
  }
  return out;
};

const buildStatusCountsUrl = (businessId) => {
  const tpl = String(ENV_STATUS_COUNT_ENDPOINT || "").trim();
  if (!tpl) return "";
  const id = String(businessId);
  let url = buildUrl(tpl, { business_id: id });
  if (url === tpl) {
    const sep = tpl.includes("?") ? "&" : "?";
    url = `${tpl}${sep}business_id=${encodeURIComponent(id)}`;
  }
  return url;
};

const buildTotalSalesUrl = (businessId) => {
  const tpl = String(TOTAL_SALES_ENDPOINT || "").trim();
  if (!tpl) return "";
  const id = String(businessId);
  let url = buildUrl(tpl, { business_id: id });
  if (url === tpl) {
    const sep = tpl.includes("?") ? "&" : "?";
    url = `${tpl}${sep}business_id=${encodeURIComponent(id)}`;
  }
  return url;
};

function kpisFromStatusCounts(counts = {}, ownerType = "food") {
  const perStatus = {};
  for (const [k, v] of Object.entries(counts || {})) perStatus[UP(k)] = Number(v || 0);

  const isMart = String(ownerType).toLowerCase() === "mart";
  const activeSet = new Set(isMart ? ACTIVE_MART : ACTIVE_FOOD);

  let total = 0;
  let cancels = 0;
  let activeOrders = 0;

  for (const [k, vRaw] of Object.entries(perStatus)) {
    const v = Number(vRaw || 0);
    total += v;
    if (CANCEL_SET.has(k)) cancels += v;
    if (activeSet.has(k)) activeOrders += v;
  }

  const accepted = Math.max(0, total - cancels);
  const acceptanceRate = total > 0 ? Math.round((accepted / total) * 100) : 0;

  return { activeOrders, acceptanceRate };
}

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const ordinal = (n) => {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
};
const parseDate = (raw) => {
  if (!raw) return null;
  try {
    const s = String(raw);
    if (s.includes("T")) return new Date(s);
    return new Date(s.replace(" ", "T"));
  } catch {
    return null;
  }
};
const formatDateTime = (d) => {
  if (!d || Number.isNaN(d.getTime())) return { time: "", date: "" };
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const time = `${h}:${m}`;
  const day = d.getDate();
  const monthName = MONTHS[d.getMonth()] || "";
  const year = d.getFullYear();
  const date = `${monthName} ${ordinal(day)} ${year}`;
  return { time, date };
};
const dateKey = (d) => (d && !Number.isNaN(d.getTime()) ? formatDateTime(d).date : "Unknown date");

const niceNote = (note = "") => String(note || "").replace(/\s*\|\s*charge=\d+(\.\d+)?\s*/gi, " ").trim();
const extractOrderId = (note = "") => {
  const m = String(note || "").match(/ORD-\d+/i);
  return m ? m[0].toUpperCase() : "";
};

/* ───────────────────────── component ───────────────────────── */

export default function PayoutTab({
  route,
  isTablet,
  businessId: propBusinessId,
  business_id: propBusinessId2,
  userId: propUserId,
  user_id: propUserId2,
  ownerType: propOwnerType,
  owner_type: propOwnerType2,
}) {
  const routeParams = route?.params ?? {};

  const resolvedBusinessId =
    propBusinessId ?? propBusinessId2 ?? routeParams.businessId ?? routeParams.business_id ?? null;

  const resolvedUserId =
    propUserId ?? propUserId2 ?? routeParams.userId ?? routeParams.user_id ?? null;

  const resolvedOwnerType =
    propOwnerType ?? propOwnerType2 ?? routeParams.ownerType ?? routeParams.owner_type ?? "food";

  const [walletId, setWalletId] = useState(routeParams.walletId ? String(routeParams.walletId) : null);
  const [transactions, setTransactions] = useState([]);

  const [salesToday, setSalesToday] = useState(0);
  const [activeOrders, setActiveOrders] = useState(0);
  const [acceptRate, setAcceptRate] = useState(0);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadAll = useCallback(async () => {
    setError("");
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(await getAuthHeader()),
    };

    // 1) Sales today
    if (resolvedBusinessId) {
      const url = buildTotalSalesUrl(resolvedBusinessId);
      if (url) {
        const payload = await fetchJSON(url, { headers });
        const rows = Array.isArray(payload?.rows) ? payload.rows : [];

        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);

        let totalToday = 0;
        for (const r of rows) {
          const d = r?.date ? new Date(r.date) : null;
          if (!d || Number.isNaN(d.getTime())) continue;
          if (d >= start && d < end) totalToday += Number(r?.total_amount || 0);
        }
        setSalesToday(Number(totalToday || 0));
      }
    }

    // 2) Active + accept rate
    if (resolvedBusinessId) {
      const url = buildStatusCountsUrl(resolvedBusinessId);
      if (url) {
        const counts = await fetchJSON(url, { headers });
        const k = kpisFromStatusCounts(counts, resolvedOwnerType);
        setActiveOrders(Number(k.activeOrders || 0));
        setAcceptRate(Number(k.acceptanceRate || 0));
      }
    }

    // 3) Wallet lookup (✅ YOUR RESPONSE SHAPE)
    let currentWalletId = walletId;

    if (!currentWalletId && resolvedUserId && ENV_WALLET) {
      // WALLET_ENDPOINT=https://grab.newedge.bt/wallet/wallet/getbyuser/{user_id}
      const walletUrl = buildUrl(ENV_WALLET, { user_id: resolvedUserId });

      const wJson = await fetchJSON(walletUrl, { headers });

      // ✅ your payload: { success:true, data:{ wallet_id:"NET000003", ... } }
      const wid =
        wJson?.data?.wallet_id ||
        wJson?.data?.walletId ||
        wJson?.wallet_id ||
        wJson?.walletId ||
        wJson?.wallet?.wallet_id ||
        wJson?.wallet?.id ||
        null;

      if (wid) {
        currentWalletId = String(wid);
        setWalletId(String(wid));
      }
    }

    // 4) Transactions
    if (currentWalletId && ENV_WALLET_TXN) {
      const txnUrl = buildUrl(ENV_WALLET_TXN, { wallet_id: currentWalletId });

      const json = await fetchJSON(txnUrl, { headers });

      // your payload: { success:true, data:[...] }
      const list = Array.isArray(json?.data) ? json.data : [];

      const mapped = list.map((tx, idx) => {
        const rawTs = tx.created_at_local || tx.created_at || "";
        const d = parseDate(rawTs);
        const { time, date } = formatDateTime(d);

        const dir = String(tx.direction || "").toUpperCase();
        const isCredit = dir === "CR";
        const note = niceNote(tx.note || "");
        const oid = extractOrderId(note);

        return {
          id: String(tx.transaction_id || idx),
          direction: dir,
          isCredit,
          amount: Number(tx.amount || 0),
          note,
          orderId: oid,
          from: tx.counterparty_wallet_id || "",
          time,
          date,
          _dt: d ? d.getTime() : 0,
          _dateKey: dateKey(d),
        };
      });

      mapped.sort((a, b) => (b._dt || 0) - (a._dt || 0));
      setTransactions(mapped);
    } else {
      setTransactions([]);
    }
  }, [resolvedBusinessId, resolvedUserId, resolvedOwnerType, walletId]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        await loadAll();
      } catch (e) {
        if (__DEV__) console.log("[PayoutTab] load error:", e?.message);
        if (mounted) setError("Unable to load payouts right now.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [loadAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadAll();
    } catch (e) {
      if (__DEV__) console.log("[PayoutTab] refresh error:", e?.message);
      setError("Unable to refresh payouts right now.");
    } finally {
      setRefreshing(false);
    }
  }, [loadAll]);

  const groupedList = useMemo(() => {
    if (!transactions?.length) return [];
    const out = [];
    let lastKey = null;
    for (const tx of transactions) {
      if (tx._dateKey !== lastKey) {
        lastKey = tx._dateKey;
        out.push({ _type: "header", id: `h_${lastKey}`, title: lastKey });
      }
      out.push({ _type: "tx", ...tx });
    }
    return out;
  }, [transactions]);

  const topStats = useMemo(
    () => [
      { icon: "wallet", title: "Today", value: money(salesToday), subtitle: "Sales", color: "#16a34a" },
      { icon: "cart", title: "Active", value: `${Number(activeOrders || 0)} Orders`, subtitle: "In progress", color: "#2563eb" },
      { icon: "checkmark-circle", title: "Accept", value: `${Number(acceptRate || 0)}%`, subtitle: "Rate", color: "#e11d48" },
    ],
    [salesToday, activeOrders, acceptRate]
  );

  const renderRow = ({ item }) => {
    if (item._type === "header") {
      return (
        <View style={styles.dateHeader}>
          <Text style={styles.dateHeaderText}>{item.title}</Text>
        </View>
      );
    }

    const tx = item;
    const sign = tx.isCredit ? "+ " : "- ";

    return (
      <View style={styles.txCard}>
        <View style={styles.txLeft}>
          <View style={styles.txTopLine}>
            <View style={[styles.badge, tx.isCredit ? styles.badgeCredit : styles.badgeDebit]}>
              <Text style={[styles.badgeText, tx.isCredit ? styles.badgeTextCredit : styles.badgeTextDebit]}>
                {tx.isCredit ? "CREDIT" : "DEBIT"}
              </Text>
            </View>

            {tx.orderId ? (
              <View style={styles.orderChip}>
                <Text style={styles.orderChipText}>{tx.orderId}</Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.noteText} numberOfLines={2}>
            {tx.note || (tx.isCredit ? "Credit" : "Payment")}
          </Text>

          <View style={styles.metaRow}>
            <Ionicons name="time-outline" size={14} color="#6b7280" />
            <Text style={styles.metaText}>{tx.time || "--:--"}</Text>

            {tx.from ? (
              <>
                <View style={styles.dot} />
                <Ionicons name="swap-horizontal-outline" size={14} color="#6b7280" />
                <Text style={styles.metaText} numberOfLines={1}>
                  {tx.from}
                </Text>
              </>
            ) : null}
          </View>
        </View>

        <View style={styles.txRight}>
          <Text style={[styles.amount, tx.isCredit ? styles.amountCredit : styles.amountDebit]}>
            {sign}
            {money(tx.amount)}
          </Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.contentContainer, styles.center]}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 8, color: "#6b7280" }}>Loading payouts…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#f3f4f6" }}>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <FlatList
        data={groupedList}
        keyExtractor={(item) => item.id}
        renderItem={renderRow}
        contentContainerStyle={styles.contentContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <View>
            <View style={styles.statsRow}>
              {topStats.map((s, i) => (
                <View key={i} style={styles.statCard}>
                  <View style={styles.statIconWrap}>
                    <Ionicons name={s.icon} size={22} color={s.color} />
                  </View>
                  <Text style={styles.statTitle}>{s.title}</Text>
                  <Text style={styles.statValue}>{s.value}</Text>
                  <Text style={styles.statSub}>{s.subtitle}</Text>
                </View>
              ))}
            </View>

            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { fontSize: isTablet ? 18 : 16 }]}>
                Payout History
              </Text>
              {/* <Text style={styles.sectionHint}>{walletId ? `Wallet: ${walletId}` : ""}</Text> */}
            </View>

            {!groupedList.length ? (
              <View style={styles.emptyBox}>
                <Ionicons name="receipt-outline" size={22} color="#9ca3af" />
                <Text style={styles.emptyTitle}>No payouts yet</Text>
                <Text style={styles.emptyDesc}>Your wallet transactions will appear here.</Text>
              </View>
            ) : null}
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  contentContainer: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 90,
    backgroundColor: "#f3f4f6",
  },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  errorText: {
    color: "#b91c1c",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
    fontWeight: "700",
  },

  statsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 6,
    marginBottom: 14,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  statIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  statTitle: { fontSize: 12, color: "#6b7280", fontWeight: "800" },
  statValue: { fontSize: 16, color: "#0f172a", fontWeight: "900", marginTop: 2 },
  statSub: { fontSize: 12, color: "#9ca3af", marginTop: 2, fontWeight: "700" },

  sectionHeader: {
    marginTop: 6,
    marginBottom: 6,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  sectionTitle: { fontWeight: "900", color: "#0f172a" },
  sectionHint: { fontSize: 12, color: "#9ca3af", fontWeight: "700" },

  emptyBox: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    marginBottom: 6,
  },
  emptyTitle: { color: "#0f172a", fontWeight: "900", marginTop: 4 },
  emptyDesc: { color: "#6b7280", fontWeight: "700", textAlign: "center" },

  dateHeader: { marginTop: 14, marginBottom: 6 },
  dateHeaderText: { color: "#6b7280", fontWeight: "900", fontSize: 12 },

  txCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },
  txLeft: { flex: 1 },
  txRight: { justifyContent: "center", alignItems: "flex-end" },

  txTopLine: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },

  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  badgeCredit: { backgroundColor: "#dcfce7" },
  badgeDebit: { backgroundColor: "#fee2e2" },
  badgeText: { fontSize: 11, fontWeight: "900" },
  badgeTextCredit: { color: "#166534" },
  badgeTextDebit: { color: "#991b1b" },

  orderChip: { backgroundColor: "#eef2ff", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  orderChipText: { color: "#3730a3", fontWeight: "900", fontSize: 11 },

  noteText: { color: "#0f172a", fontWeight: "800", fontSize: 14, marginBottom: 8 },

  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  metaText: { color: "#6b7280", fontWeight: "700", fontSize: 12 },
  dot: { width: 4, height: 4, borderRadius: 999, backgroundColor: "#cbd5e1" },

  amount: { fontSize: 15, fontWeight: "900" },
  amountCredit: { color: "#16a34a" },
  amountDebit: { color: "#e11d48" },
});
