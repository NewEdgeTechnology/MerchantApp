// screens/message/MessageScreen.js
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
  Image,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { getUserInfo } from "../../utils/authToken";

import { connectPassengerSocket, loadChatHistory } from "../../utils/passengerSocket";
import * as SecureStore from "expo-secure-store";

import {
  RIDE_SOCKET_ENDPOINT,
  GET_BATCH_RIDE_ID_ENDPOINT,
  DRIVER_DETAILS_ENDPOINT,
} from "@env";

// ✅ business-based chat list
import { listMerchantConversations } from "../../utils/chatApi";

/* ───────────── helpers ───────────── */
const BASE_ORIGIN = (() => {
  try {
    return new URL(String(RIDE_SOCKET_ENDPOINT || "")).origin;
  } catch {
    const m = String(RIDE_SOCKET_ENDPOINT || "").match(/^https?:\/\/[^/]+/i);
    return m ? m[0] : "";
  }
})();

const CUSTOMER_PROFILE_BASE = "https://grab.newedge.bt/driver";

const trim = (v) => String(v || "").trim();
const pickFirst = (...vals) => {
  for (const v of vals) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return null;
};

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
function formatChatTime(ts) {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return "";
  const ms = n < 1e12 ? n * 1000 : n;
  try {
    return new Date(ms).toLocaleString(undefined, {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

const resolveCustomerProfileUrl = (raw) => {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (/^data:image\//i.test(s)) return s;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^\/\//.test(s)) return `https:${s}`;

  const base = CUSTOMER_PROFILE_BASE.replace(/\/+$/, "");
  const rel = s.replace(/^\/+/, "");
  return `${base}/${rel}`;
};

async function getBusinessIdFromSecureStore() {
  const keys = [
    "business_id_v1",
    "business_id",
    "businessId",
    "merchant_business_id",
    "merchantBusinessId",
    "selected_business_id",
    "selectedBusinessId",
  ];

  for (const k of keys) {
    try {
      const v = await SecureStore.getItemAsync(k);
      if (v && String(v).trim()) return String(v).trim();
    } catch {}
  }

  // try merchant_login JSON if present
  try {
    const saved = await SecureStore.getItemAsync("merchant_login");
    if (saved) {
      const j = JSON.parse(saved);
      const bid =
        j?.business_id ||
        j?.user?.business_id ||
        j?.user?.businessId ||
        j?.businessId ||
        j?.id ||
        j?.user?.id ||
        null;
      if (bid != null) return String(bid);
    }
  } catch {}

  return "";
}

/**
 * ✅ THIS is the real fix for: "Missing merchant user id for the chat room"
 * Use SecureStore first (same as OrderDetails), then fallback to getUserInfo().
 */
async function getMerchantUserIdFromSecureStore() {
  const keys = [
    "user_id_v1",
    "user_id",
    "merchant_user_id",
    "merchantUserId",
    "merchant_id",
    "merchantId",
    "id",
  ];

  for (const k of keys) {
    try {
      const v = await SecureStore.getItemAsync(k);
      if (v && String(v).trim()) return String(v).trim();
    } catch {}
  }

  // try merchant_login JSON
  try {
    const saved = await SecureStore.getItemAsync("merchant_login");
    if (saved) {
      const j = JSON.parse(saved);
      const uid =
        j?.user_id ||
        j?.id ||
        j?.user?.id ||
        j?.user?.user_id ||
        j?.merchant_user_id ||
        j?.merchant_id ||
        null;
      if (uid != null) return String(uid);
    }
  } catch {}

  // fallback: getUserInfo
  try {
    const u = await getUserInfo();
    const uid =
      u?.user_id ??
      u?.userId ??
      u?.id ??
      u?.user?.id ??
      u?.user?.user_id ??
      null;
    if (uid != null) return String(uid);
  } catch {}

  return "";
}

/* --- driver name lookup --- */
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

/* --- ensure socket connected --- */
async function ensureSocketConnected(timeoutMs = 1200) {
  try {
    const u = await getUserInfo();
    const id = String(u?.user_id || "").trim();
    if (!id) return false;

    const s = connectPassengerSocket(id);
    if (s?.connected) return true;

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

        if (s?.once) s.once("connect", onConnect);
        else {
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
        const ts = last?.created_at || last?.ts || null;

        if (text) return finish({ text, ts });
        return finish(null);
      });
    } catch {
      clearTimeout(t);
      finish(null);
    }
  });
}

/* ===================== Screen ===================== */
export default function MessageScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState("customer"); // 'driver' | 'customer'

  const routeBusinessId = useMemo(() => {
    const p = route?.params || {};
    const bid = p.business_id ?? p.businessId ?? null;
    return bid != null ? String(bid) : "";
  }, [route?.params]);

  const [businessId, setBusinessId] = useState(routeBusinessId);

  useEffect(() => {
    if (routeBusinessId && routeBusinessId !== businessId) {
      setBusinessId(routeBusinessId);
    }
  }, [routeBusinessId, businessId]);

  // Driver tab state
  const [driverThreads, setDriverThreads] = useState([]);
  const [driverLoading, setDriverLoading] = useState(false);
  const [driverRefreshing, setDriverRefreshing] = useState(false);

  // Customer tab state
  const [customerThreads, setCustomerThreads] = useState([]);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerRefreshing, setCustomerRefreshing] = useState(false);

  const isDriverTab = activeTab === "driver";
  const data = isDriverTab ? driverThreads : customerThreads;

  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // resolve businessId if missing
  useEffect(() => {
    (async () => {
      if (trim(businessId)) return;

      // try SecureStore first (more reliable)
      const bidFromStore = await getBusinessIdFromSecureStore();
      if (bidFromStore && aliveRef.current) {
        setBusinessId(bidFromStore);
        return;
      }

      // fallback: getUserInfo
      try {
        const u = await getUserInfo();
        const bid =
          u?.business_id ??
          u?.businessId ??
          u?.merchant_business_id ??
          u?.merchant_business?.id ??
          u?.user?.business_id ??
          null;
        if (bid != null && aliveRef.current) setBusinessId(String(bid));
      } catch {}
    })();
  }, [businessId]);

  /* ===================== DRIVER TAB (unchanged) ===================== */
  const fetchDriverBatches = useCallback(
    async ({ refreshing = false } = {}) => {
      const bid = trim(businessId);
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
    [businessId],
  );

  useEffect(() => {
    if (!isDriverTab) return;
    if (!trim(businessId)) return;
    fetchDriverBatches({ refreshing: false });
  }, [isDriverTab, businessId, fetchDriverBatches]);

  /* ===================== CUSTOMER TAB (FIXED) ===================== */
  const fetchCustomerConversations = useCallback(async ({ refreshing = false } = {}) => {
    if (refreshing) setCustomerRefreshing(true);
    else setCustomerLoading(true);

    try {
      // ✅ always use SecureStore business id for merchant chat list
      const bid = await getBusinessIdFromSecureStore();
      if (!bid) throw new Error("Business id not found in SecureStore");

      // keep state in sync
      if (aliveRef.current && bid !== businessId) setBusinessId(bid);

      // token optional
      const info = (await getUserInfo?.()) || {};
      const token =
        pickFirst(
          info.accessToken,
          info.access_token,
          info.token,
          info.jwt,
          info?.user?.token,
          info?.user?.accessToken,
        ) || null;

      const res = await listMerchantConversations({ businessId: bid, token });

      // ✅ robust rows extraction
      const rawRows =
        res?.rows ??
        res?.data?.rows ??
        res?.data?.data ??
        res?.data ??
        [];

      const arr = Array.isArray(rawRows) ? rawRows : [];

      const mapped = arr
        .map((r, idx) => {
          const conversationId =
            String(r?.conversation_id ?? r?.conversationId ?? r?.id ?? "").trim();
          if (!conversationId) return null;

          const lastType = String(r?.last_message_type || r?.lastMessageType || "").toUpperCase();
          const lastBody = String(r?.last_message_body || r?.lastMessageBody || r?.last_message || "").trim();
          const lastText = lastType === "IMAGE" ? "📷 Photo" : lastBody;

          const lastAtRaw =
            r?.last_message_at ??
            r?.lastMessageAt ??
            r?.updated_at ??
            r?.updatedAt ??
            r?.created_at ??
            r?.createdAt ??
            0;

          const lastAtNum = Number(lastAtRaw);
          const lastAt = Number.isFinite(lastAtNum)
            ? (lastAtNum < 1e12 ? lastAtNum * 1000 : lastAtNum)
            : 0;

          const customerName =
            r?.customer_name ??
            r?.customerName ??
            r?.customer?.name ??
            r?.user_name ??
            r?.userName ??
            "Customer";

          const profileRaw =
            r?.customer_profile_image ??
            r?.customerProfileImage ??
            r?.customer_profile ??
            r?.customerProfile ??
            r?.profile_image ??
            r?.profileImage ??
            r?.avatar ??
            r?.customer_avatar ??
            r?.customer?.profile_image ??
            r?.customer?.avatar ??
            "";

          return {
            id: conversationId || `c_${idx}`,
            conversationId,
            orderId: String(r?.order_id ?? r?.orderId ?? "").trim(),
            customerId: r?.customer_id ?? r?.customerId ?? r?.user_id ?? r?.userId ?? null,
            business_id: r?.business_id ?? r?.businessId ?? bid,
            customerName: String(customerName),
            customer_profile_image: String(profileRaw || ""),
            lastMessage: lastText || "Tap to open chat",
            lastAt,
            unread: Number(r?.unread_count ?? r?.unread ?? 0),
            _sort: lastAt || 0,
          };
        })
        .filter(Boolean);

      mapped.sort((a, b) => b._sort - a._sort);
      if (aliveRef.current) setCustomerThreads(mapped);
    } catch (e) {
      if (aliveRef.current) {
        setCustomerThreads([]);
        Alert.alert("Could not load customer chats", String(e?.message || e));
      }
    } finally {
      if (aliveRef.current) {
        setCustomerLoading(false);
        setCustomerRefreshing(false);
      }
    }
  }, [businessId]);

  useEffect(() => {
    if (isDriverTab) return;
    if (!trim(businessId)) return;
    fetchCustomerConversations({ refreshing: false });
  }, [isDriverTab, businessId, fetchCustomerConversations]);

  /* ===================== UI Render ===================== */
  const renderItem = ({ item }) => {
    // DRIVER row
    if (isDriverTab) {
      const orderLine = `Orders: ${
        Array.isArray(item.orderIds) && item.orderIds.length ? item.orderIds.join(", ") : "-"
      }`;

      return (
        <TouchableOpacity
          style={styles.threadRow}
          activeOpacity={0.85}
          onPress={() => {
            navigation.navigate("Chat", {
              requestId: item.rideId,
              rideId: item.rideId,
              driverUserId: item.driverId,
              driverName: item.name,
              business_id: businessId,
              businessId: businessId,
              batch_id: item.batchId,
              order_ids: item.orderIds,
              type: "driver",
              name: item.name,
            });
          }}
        >
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{item.name?.charAt(0)?.toUpperCase() || "?"}</Text>
          </View>

          <View style={styles.threadTextWrap}>
            <View style={styles.threadTopRow}>
              <Text style={styles.threadName} numberOfLines={1}>{item.name}</Text>
              {!!item.time ? <Text style={styles.threadTime}>{item.time}</Text> : null}
            </View>

            <Text style={styles.threadOrder} numberOfLines={1}>
              Batch: <Text style={styles.threadOrderBold}>{item.batchId || "-"}</Text>
              {"  "}• Ride: <Text style={styles.threadOrderBold}>{item.rideId}</Text>
            </Text>

            <Text style={styles.threadLastMsg} numberOfLines={1}>{orderLine}</Text>

            {!!item.lastMessage ? (
              <Text style={[styles.threadLastMsg, { marginTop: 2 }]} numberOfLines={1}>
                {item.lastMessage}
              </Text>
            ) : null}
          </View>

          <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
        </TouchableOpacity>
      );
    }

    // ✅ CUSTOMER chat row
    const time = formatChatTime(item.lastAt);
    const avatarUrl = resolveCustomerProfileUrl(item.customer_profile_image);

    return (
      <TouchableOpacity
        style={styles.threadRow}
        activeOpacity={0.85}
        onPress={async () => {
          try {
            const bid = trim(businessId) || (await getBusinessIdFromSecureStore());
            if (!bid) throw new Error("Missing business id");

            const merchantUserId = await getMerchantUserIdFromSecureStore();
            if (!merchantUserId) {
              throw new Error("Missing merchant user id for chat room (SecureStore user_id_v1/user_id not found)");
            }

            navigation.navigate("MerchantChatRoomScreen", {
              conversationId: item.conversationId,
              orderId: item.orderId,
              userType: "MERCHANT",
              userId: String(merchantUserId),
              businessId: String(bid),
              meta: {
                customerName: item.customerName,
                customer_profile_image: item.customer_profile_image || "", // ✅ used by ChatRoomScreen header
                customerProfileImage: item.customer_profile_image || "",   // ✅ extra alias (safe)
                customerId: item.customerId,
                businessId: bid,
              },
            });
          } catch (e) {
            Alert.alert("Chat", e?.message || "Unable to open chat");
          }
        }}
      >
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
        ) : (
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>
              {item.customerName?.charAt(0)?.toUpperCase() || "C"}
            </Text>
          </View>
        )}

        <View style={styles.threadTextWrap}>
          <View style={styles.threadTopRow}>
            <Text style={styles.threadName} numberOfLines={1}>{item.customerName}</Text>
            {!!time ? <Text style={styles.threadTime}>{time}</Text> : null}
          </View>

          <Text style={styles.threadOrder} numberOfLines={1}>
            Order ID: <Text style={styles.threadOrderBold}>{item.orderId || "-"}</Text>
          </Text>

          <Text style={styles.threadLastMsg} numberOfLines={1}>
            {item.lastMessage}
          </Text>
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
        ) : !isDriverTab && customerLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#00b14f" />
            <Text style={styles.loadingText}>Loading customer chats…</Text>
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
            keyExtractor={(it) => String(it.id)}
            renderItem={renderItem}
            contentContainerStyle={{ paddingVertical: 10 }}
            refreshControl={
              isDriverTab ? (
                <RefreshControl
                  refreshing={driverRefreshing}
                  onRefresh={() => fetchDriverBatches({ refreshing: true })}
                  tintColor="#00b14f"
                />
              ) : (
                <RefreshControl
                  refreshing={customerRefreshing}
                  onRefresh={() => fetchCustomerConversations({ refreshing: true })}
                  tintColor="#00b14f"
                />
              )
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
  avatarImg: {
    width: 40,
    height: 40,
    borderRadius: 999,
    marginRight: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#fff",
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
