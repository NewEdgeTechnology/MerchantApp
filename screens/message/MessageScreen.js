// screens/food/MessageScreen.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  StatusBar,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { getUserInfo } from "../../utils/authToken";
import {
  connectPassengerSocket,
  loadChatHistory,
} from "../../utils/passengerSocket";
import {
  RIDE_SOCKET_ENDPOINT,
  GET_BATCH_RIDE_ID_ENDPOINT,
  DRIVER_DETAILS_ENDPOINT,
} from "@env";

/* ───────────── Dummy Data (Customer tab kept) ───────────── */
const CUSTOMER_THREADS = [
  {
    id: "c1",
    name: "Sonam Dorji",
    orderId: "ORD-1023",
    lastMessage: "Can you make it less spicy?",
    time: "10:24 AM",
  },
  {
    id: "c2",
    name: "Pema Choki",
    orderId: "ORD-1027",
    lastMessage: "I’m almost there, please keep it warm.",
    time: "09:12 AM",
  },
  {
    id: "c3",
    name: "Karma Wangdi",
    orderId: "ORD-1031",
    lastMessage: "Add one more coke please.",
    time: "Yesterday",
  },
];

/* ───────────── helpers ───────────── */
const BASE_ORIGIN = (() => {
  try {
    return new URL(String(RIDE_SOCKET_ENDPOINT || "")).origin;
  } catch {
    const m = String(RIDE_SOCKET_ENDPOINT || "").match(/^https?:\/\/[^/]+/i);
    return m ? m[0] : "";
  }
})();

function fillTemplateUrl(template, params = {}) {
  let out = String(template || "");
  Object.keys(params).forEach((k) => {
    out = out.replaceAll(`{${k}}`, encodeURIComponent(String(params[k] ?? "")));
  });
  return out;
}

function safeNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function formatClock(ts) {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function pickImageUrl(m = {}) {
  const arr = Array.isArray(m.attachments) ? m.attachments : [];
  const img = arr.find(
    (x) =>
      (x?.type && String(x.type).toLowerCase().startsWith("image")) ||
      (x?.mime && String(x.mime).toLowerCase().startsWith("image"))
  );
  if (img?.url) return String(img.url);
  if (m?.image_url) return String(m.image_url);
  return null;
}

/* --- driver name lookup (uses DRIVER_DETAILS_ENDPOINT; falls back to /api/driver_id) --- */
const _nameCache = new Map();
async function fetchUserNameById(userId) {
  const key = String(userId || "").trim();
  if (!key) return null;
  if (_nameCache.has(key)) return _nameCache.get(key);

  try {
    const tpl = String(DRIVER_DETAILS_ENDPOINT || "").trim();

    const url = tpl
      ? tpl
          .replace("{driverId}", encodeURIComponent(key))
          .replace(":driverId", encodeURIComponent(key))
          .replace("{driver_id}", encodeURIComponent(key))
          .replace(":driver_id", encodeURIComponent(key))
      : `${BASE_ORIGIN}/api/driver_id?driverId=${encodeURIComponent(key)}`;

    const res = await fetch(url);
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.ok) return null;

    const raw =
      j?.details?.user_name ??
      j?.details?.name ??
      j?.user_name ??
      j?.name ??
      null;

    const name = typeof raw === "string" ? raw.trim() : null;
    if (name) {
      _nameCache.set(key, name);
      return name;
    }
  } catch {}
  return null;
}

/* --- ensure socket connected (NO getPassengerSocket dependency) --- */
async function ensureSocketConnected(timeoutMs = 1200) {
  try {
    const u = await getUserInfo();
    const id = String(u?.user_id || "").trim();
    if (!id) return false;

    const s = connectPassengerSocket(id); // ✅ returns socket
    if (s?.connected) return true;

    // wait for connect (or timeout)
    return await new Promise((resolve) => {
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        resolve(!!ok);
      };

      const t = setTimeout(() => finish(false), timeoutMs);

      try {
        const onConnect = () => {
          clearTimeout(t);
          try {
            s?.off?.("connect", onConnect);
          } catch {}
          finish(true);
        };

        // if socket API exists, attach once
        if (s?.once) s.once("connect", onConnect);
        else {
          // no event api; fallback wait a bit
          setTimeout(() => {
            clearTimeout(t);
            finish(!!s?.connected);
          }, 350);
        }
      } catch {
        clearTimeout(t);
        finish(false);
      }
    });
  } catch {
    return false;
  }
}

function loadLatestMessagePreview(rideId, timeoutMs = 2500) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (val) => {
      if (done) return;
      done = true;
      resolve(val);
    };

    const t = setTimeout(() => finish(null), timeoutMs);

    try {
      loadChatHistory({ request_id: Number(rideId), limit: 5 }, (ack) => {
        clearTimeout(t);
        if (!ack?.ok || !Array.isArray(ack?.messages)) return finish(null);

        const arr = ack.messages;
        const last = arr[arr.length - 1] || arr[0] || null;
        if (!last) return finish(null);

        const text = String(last?.message ?? last?.text ?? "").trim();
        const hasImg = !!pickImageUrl(last);
        const ts = last?.created_at || last?.ts || null;

        if (text) return finish({ text, ts });
        if (hasImg) return finish({ text: "📷 Photo", ts });
        return finish(null);
      });
    } catch {
      clearTimeout(t);
      finish(null);
    }
  });
}

/* ───────────── Screen ───────────── */
export default function MessageScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState("customer"); // 'driver' | 'customer'

  // ✅ accept business id from route (both keys supported)
  const routeBusinessId = useMemo(() => {
    const p = route?.params || {};
    const bid = p.business_id ?? p.businessId ?? null;
    return bid != null ? String(bid) : "";
  }, [route?.params]);

  const [businessId, setBusinessId] = useState(routeBusinessId);

  // ✅ keep state synced if you navigate here again with different business id
  useEffect(() => {
    if (routeBusinessId && routeBusinessId !== businessId) {
      setBusinessId(routeBusinessId);
    }
  }, [routeBusinessId, businessId]);

  const [driverThreads, setDriverThreads] = useState([]);
  const [driverLoading, setDriverLoading] = useState(false);
  const [driverRefreshing, setDriverRefreshing] = useState(false);

  const isDriverTab = activeTab === "driver";
  const data = isDriverTab ? driverThreads : CUSTOMER_THREADS;

  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // resolve business_id if not passed
  useEffect(() => {
    (async () => {
      if (String(businessId || "").trim()) return;
      try {
        const u = await getUserInfo();
        const bid =
          u?.business_id ??
          u?.businessId ??
          u?.merchant_business_id ??
          u?.merchant_business?.id ??
          null;
        if (bid != null && aliveRef.current) setBusinessId(String(bid));
      } catch {}
    })();
  }, [businessId]);

  const fetchDriverBatches = useCallback(
    async ({ refreshing = false } = {}) => {
      const bid = String(businessId || "").trim();
      if (!bid) return;

      if (refreshing) setDriverRefreshing(true);
      else setDriverLoading(true);

      try {
        const tpl = String(GET_BATCH_RIDE_ID_ENDPOINT || "").trim();
        if (!tpl) throw new Error("GET_BATCH_RIDE_ID_ENDPOINT missing in env");

        const url = fillTemplateUrl(tpl, { business_id: bid });

        const res = await fetch(url);
        const j = await res.json().catch(() => null);

        if (!res.ok || !j?.ok || !Array.isArray(j?.data)) {
          throw new Error(j?.message || `Failed (${res.status})`);
        }

        const rows = j.data
          .map((r) => ({
            batch_id: String(r?.batch_id ?? ""),
            ride_id: String(r?.ride_id ?? ""),
            driver_id: r?.driver_id != null ? String(r.driver_id) : "",
            order_ids: Array.isArray(r?.order_ids) ? r.order_ids : [],
            _batchN: safeNum(r?.batch_id) ?? -1,
            _rideN: safeNum(r?.ride_id) ?? -1,
          }))
          .filter((r) => r.ride_id);

        rows.sort((a, b) => {
          if (b._batchN !== a._batchN) return b._batchN - a._batchN;
          return b._rideN - a._rideN;
        });

        const connected = await ensureSocketConnected();

        const enriched = [];
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];

          let driverName = "Driver";
          if (r.driver_id) {
            const nm = await fetchUserNameById(r.driver_id);
            if (nm) driverName = nm;
          }

          let latest = null;
          if (connected && r.ride_id) {
            latest = await loadLatestMessagePreview(r.ride_id);
          }

          enriched.push({
            id: `b-${r.batch_id || r.ride_id}-${r.ride_id}`,
            type: "driver",
            batchId: r.batch_id,
            rideId: r.ride_id,
            driverId: r.driver_id,
            name: driverName,
            orderIds: r.order_ids,
            lastMessage:
              latest?.text ||
              (r.order_ids?.length ? "Batch orders ready" : "Tap to open chat"),
            time: latest?.ts
              ? formatClock(latest.ts)
              : r.batch_id
              ? `Batch #${r.batch_id}`
              : "",
          });
        }

        if (aliveRef.current) setDriverThreads(enriched);
      } catch (e) {
        if (aliveRef.current) {
          setDriverThreads([]);
          Alert.alert("Could not load driver chats", String(e?.message || e));
        }
      } finally {
        if (aliveRef.current) {
          setDriverLoading(false);
          setDriverRefreshing(false);
        }
      }
    },
    [businessId]
  );

  useEffect(() => {
    if (!isDriverTab) return;
    if (!String(businessId || "").trim()) return;
    fetchDriverBatches({ refreshing: false });
  }, [isDriverTab, businessId, fetchDriverBatches]);

  const renderItem = ({ item }) => {
    const isDriver = isDriverTab;

    const orderLine = isDriver
      ? `Orders: ${
          Array.isArray(item.orderIds) && item.orderIds.length
            ? item.orderIds.join(", ")
            : "-"
        }`
      : `Order ID: ${item.orderId}`;

    return (
      <TouchableOpacity
        style={styles.threadRow}
        activeOpacity={0.85}
        onPress={() => {
          if (isDriver) {
            navigation.navigate("Chat", {
              requestId: item.rideId,
              rideId: item.rideId,

              driverUserId: item.driverId,
              driverName: item.name,

              // ✅ ALWAYS pass business id forward
              business_id: businessId,
              businessId: businessId,

              batch_id: item.batchId,
              order_ids: item.orderIds,
              type: "driver",
              name: item.name,
            });
          } else {
            navigation.navigate("Chat", {
              threadId: item.id,
              type: "customer",
              name: item.name,
              orderId: item.orderId,

              business_id: businessId,
              businessId: businessId,
            });
          }
        }}
      >
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>
            {item.name?.charAt(0)?.toUpperCase() || "?"}
          </Text>
        </View>

        <View style={styles.threadTextWrap}>
          <View style={styles.threadTopRow}>
            <Text style={styles.threadName} numberOfLines={1}>
              {item.name}
            </Text>
            {!!item.time ? (
              <Text style={styles.threadTime}>{item.time}</Text>
            ) : null}
          </View>

          <Text style={styles.threadOrder} numberOfLines={1}>
            {isDriver ? (
              <>
                Batch:{" "}
                <Text style={styles.threadOrderBold}>{item.batchId || "-"}</Text>
                {"  "}• Ride:{" "}
                <Text style={styles.threadOrderBold}>{item.rideId}</Text>
              </>
            ) : (
              <>
                Order ID:{" "}
                <Text style={styles.threadOrderBold}>{item.orderId}</Text>
              </>
            )}
          </Text>

          <Text style={styles.threadLastMsg} numberOfLines={1}>
            {isDriver ? orderLine : item.lastMessage}
          </Text>

          {!!item.lastMessage && isDriver ? (
            <Text
              style={[styles.threadLastMsg, { marginTop: 2 }]}
              numberOfLines={1}
            >
              {item.lastMessage}
            </Text>
          ) : null}
        </View>

        <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right"]}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

      <View style={[styles.header, { paddingTop: (insets.top || 0) + 6 }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.iconBtn}
          android_ripple={{ color: "rgba(0,0,0,0.08)", borderless: true }}
        >
          <Ionicons name="arrow-back" size={24} color="#0f172a" />
        </Pressable>
        <Text style={styles.headerTitle}>Messages</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.tabRow}>
        <TabButton
          label="Chat with driver"
          icon="car-outline"
          active={isDriverTab}
          onPress={() => setActiveTab("driver")}
        />
        <TabButton
          label="Chat with customer"
          icon="person-outline"
          active={!isDriverTab}
          onPress={() => setActiveTab("customer")}
        />
      </View>

      <View style={styles.content}>
        {isDriverTab && driverLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#00b14f" />
            <Text style={styles.loadingText}>Loading driver chats…</Text>
          </View>
        ) : data.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons
              name={isDriverTab ? "car-outline" : "person-outline"}
              size={32}
              color="#9CA3AF"
            />
            <Text style={styles.emptyTitle}>No conversations yet</Text>
            <Text style={styles.emptySubtitle}>
              When you have orders, {isDriverTab ? "batches/drivers" : "customers"} will appear here.
            </Text>
          </View>
        ) : (
          <FlatList
            data={data}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={{ paddingVertical: 10 }}
            refreshControl={
              isDriverTab ? (
                <RefreshControl
                  refreshing={driverRefreshing}
                  onRefresh={() => fetchDriverBatches({ refreshing: true })}
                  tintColor="#00b14f"
                />
              ) : null
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

/* ───────────── Components ───────────── */
function TabButton({ label, icon, active, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.tabButton, active && styles.tabButtonActive]}
      onPress={onPress}
      activeOpacity={0.9}
    >
      <Ionicons
        name={icon}
        size={18}
        color={active ? "#00b14f" : "#6B7280"}
        style={{ marginRight: 6 }}
      />
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/* ───────────── Styles ───────────── */
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#ffffff" },

  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
  },

  tabRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#F3F4F6",
  },
  tabButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#E5E7EB",
    marginHorizontal: 4,
  },
  tabButtonActive: { backgroundColor: "#D1FAE5" },
  tabLabel: { fontSize: 13, fontWeight: "600", color: "#6B7280" },
  tabLabelActive: { color: "#065F46" },

  content: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    paddingHorizontal: 10,
  },

  loadingBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
  },

  threadRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  avatarText: { fontSize: 16, fontWeight: "700", color: "#065F46" },
  threadTextWrap: { flex: 1 },
  threadTopRow: { flexDirection: "row", alignItems: "center" },
  threadName: { flex: 1, fontSize: 15, fontWeight: "700", color: "#111827" },
  threadTime: { fontSize: 12, color: "#9CA3AF", marginLeft: 6 },
  threadOrder: { fontSize: 13, color: "#6B7280", marginTop: 2 },
  threadOrderBold: { fontWeight: "700", color: "#111827" },
  threadLastMsg: { fontSize: 13, color: "#4B5563", marginTop: 2 },

  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  emptyTitle: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  emptySubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
  },
});
