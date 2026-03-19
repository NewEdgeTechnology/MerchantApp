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
import * as SecureStore from "expo-secure-store";

// ✅ use .env
import {
  DRIVER_DETAILS_ENDPOINT,
  RIDE_LOCAL_ENDPOINT,
  API_BASE_URL,
  PROFILE_IMAGE,
} from "@env";

// ✅ business-based chat list
import { listMerchantConversations } from "../../utils/chatApi";

/* ───────────── helpers ───────────── */
const trim = (v) => String(v || "").trim();
const pickFirst = (...vals) => {
  for (const v of vals) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return null;
};

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

/**
 * ✅ Profile base from env:
 * - Prefer PROFILE_IMAGE (https://grab.newedge.bt/driver/)
 * - Fallback API_BASE_URL (https://grab.newedge.bt)
 */
const CUSTOMER_PROFILE_BASE = String(PROFILE_IMAGE || API_BASE_URL || "").replace(/\/+$/, "");

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
    "business_id",
    "businessId",
    "merchant_business_id", 
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
/**
 * ✅ BASE_ORIGIN now from env:
 * - RIDE_LOCAL_ENDPOINT = https://grab.newedge.bt/grablike
 * fallback API_BASE_URL
 */
const BASE_ORIGIN = String(RIDE_LOCAL_ENDPOINT || API_BASE_URL || "").replace(/\/+$/, "");

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

    // ✅ be tolerant: some APIs don't return j.ok
    if (!res.ok) return null;

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

/* ===================== Screen ===================== */
export default function MessageScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState("customer"); // 'driver' | 'customer'

  const routeMerchantId = useMemo(() => {
    const p = route?.params || {};
    const mid = p.businessId ?? null;
    return mid != null ? String(mid) : "";
  }, [route?.params]);

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

  /* ===================== DRIVER TAB ===================== */
  // ✅ use .env for endpoint instead of hardcoding
  const MERCHANT_DRIVER_CHAT_LIST_ENDPOINT = useMemo(() => {
    const base = String(RIDE_LOCAL_ENDPOINT || "").replace(/\/+$/, "");
    // default to original path if base exists
    return base
      ? `${base}/api/rides/merchant/chat-list`
      : "https://grab.newedge.bt/grablike/api/rides/merchant/chat-list";
  }, []);

  const fetchDriverBatches = useCallback(
    async ({ refreshing = false } = {}) => {
      if (refreshing) setDriverRefreshing(true);
      else setDriverLoading(true);

      try {
        let merchantId = trim(routeMerchantId);
        if (!merchantId) {
          merchantId = await getMerchantUserIdFromSecureStore();
        }
        if (!merchantId) {
          throw new Error("Missing merchant id for driver chat list");
        }

        const url =
          `${MERCHANT_DRIVER_CHAT_LIST_ENDPOINT}?merchant_id=` +
          `${encodeURIComponent(merchantId)}&limit=50`;
        console.log("[MessageScreen] fetching driver chat list from:", url);

        const res = await fetch(url);
        const j = await res.json().catch(() => null);
        console.log("[MessageScreen] fetched driver chat list response:", j);

        const rowsRaw =
          j?.threads ??
          j?.data ??
          j?.rows ??
          j?.chat_list ??
          j?.conversations ??
          [];
        const rows = Array.isArray(rowsRaw) ? rowsRaw : [];

        if (!res.ok || !rows.length) {
          throw new Error(j?.message || `Failed (${res.status})`);
        }

        const enriched = [];
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];

          const rideId = pickFirst(
            r?.request_id,
            r?.requestId,
            r?.ride_id,
            r?.rideId,
            r?.id,
            r?.thread_id
          );
          if (!rideId) continue;

          const driverId = pickFirst(
            r?.driver_id,
            r?.driverId,
            r?.driver_user_id,
            r?.driverUserId,
            r?.peer?.id,
            r?.peer?.user_id,
            r?.peer?.driver_id,
            r?.peer?.driverId
          );

          let driverName =
            pickFirst(
              r?.driver_name,
              r?.driverName,
              r?.driver?.user_name,
              r?.driver?.name,
              r?.peer?.name,
              r?.peer?.user_name
            ) || "Driver";
          if (driverId && driverName === "Driver") {
            const nm = await fetchUserNameById(driverId);
            if (nm) driverName = nm;
          }

          const lastMsgObj = r?.last_message ?? r?.lastMessage ?? null;
          const lastType = String(lastMsgObj?.message_type || lastMsgObj?.type || "").toUpperCase();
          const lastMsgText = pickFirst(
            typeof lastMsgObj === "object"
              ? pickFirst(
                  lastMsgObj?.message,
                  lastMsgObj?.text,
                  lastMsgObj?.body,
                  lastMsgObj?.message_body,
                  lastMsgObj?.messageBody
                )
              : lastMsgObj,
            r?.preview,
            r?.message
          );
          const lastMsg = lastMsgText || (lastType === "IMAGE" ? "📷 Photo" : "") || "Tap to open chat";

          const lastAtRaw = pickFirst(
            r?.last_message_at,
            r?.lastMessageAt,
            r?.updated_at,
            r?.created_at,
            r?.ts,
            lastMsgObj?.created_at,
            lastMsgObj?.ts
          );
          const lastAtNum = Number(lastAtRaw || 0);
          let lastAt = 0;
          if (Number.isFinite(lastAtNum) && lastAtNum > 0) {
            lastAt = lastAtNum < 1e12 ? lastAtNum * 1000 : lastAtNum;
          } else if (lastAtRaw) {
            const parsed = new Date(lastAtRaw);
            const ms = parsed.getTime();
            if (Number.isFinite(ms)) lastAt = ms;
          }

          enriched.push({
            id: `d-${rideId}-${driverId || i}`,
            type: "driver",
            rideId: String(rideId),
            driverId: driverId ? String(driverId) : "",
            name: driverName,
            merchantId: merchantId,
            lastMessage: String(lastMsg),
            lastAt,
            unread: Number(r?.unread_count ?? r?.unread ?? r?.total_unread ?? 0),
            time: lastAt ? formatClock(lastAt) : "",
          });
        }

        enriched.sort((a, b) => (b?.lastAt || 0) - (a?.lastAt || 0));
        if (aliveRef.current) setDriverThreads(enriched);
      } catch (e) {
        if (aliveRef.current) {
          setDriverThreads([]);
          // Alert.alert("Could not load driver chats", String(e?.message || e));
        }
      } finally {
        if (aliveRef.current) {
          setDriverLoading(false);
          setDriverRefreshing(false);
        }
      }
    },
    [routeMerchantId, MERCHANT_DRIVER_CHAT_LIST_ENDPOINT]
  );

  useEffect(() => {
    if (!isDriverTab) return;
    fetchDriverBatches({ refreshing: false });
  }, [isDriverTab, fetchDriverBatches]);

  /* ===================== CUSTOMER TAB ===================== */
  const fetchCustomerConversations = useCallback(
    async ({ refreshing = false } = {}) => {
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
            info?.user?.accessToken
          ) || null;

        const res = await listMerchantConversations({ businessId: bid, token });

        // ✅ robust rows extraction
        const rawRows = res?.rows ?? res?.data?.rows ?? res?.data?.data ?? res?.data ?? [];
        const arr = Array.isArray(rawRows) ? rawRows : [];

        const mapped = arr
          .map((r, idx) => {
            const conversationId = String(r?.conversation_id ?? r?.conversationId ?? r?.id ?? "").trim();
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
              ? lastAtNum < 1e12
                ? lastAtNum * 1000
                : lastAtNum
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
    },
    [businessId]
  );

  useEffect(() => {
    if (isDriverTab) return;
    if (!trim(businessId)) return;
    fetchCustomerConversations({ refreshing: false });
  }, [isDriverTab, businessId, fetchCustomerConversations]);

  /* ===================== UI Render ===================== */
  const renderItem = ({ item }) => {
    // DRIVER row
    if (isDriverTab) {
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
              me: {
                role: "merchant",
                id: String(item.merchantId || ""),
              },
              business_id: businessId,
              businessId: businessId,
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
              <Text style={styles.threadName} numberOfLines={1}>
                {item.name}
              </Text>
              {!!item.time ? <Text style={styles.threadTime}>{item.time}</Text> : null}
            </View>

            <Text style={styles.threadOrder} numberOfLines={1}>
              Ride ID: <Text style={styles.threadOrderBold}>{item.rideId || "-"}</Text>
            </Text>

            <Text style={[styles.threadLastMsg, { marginTop: 2 }]} numberOfLines={1}>
              {item.lastMessage}
            </Text>
          </View>

          <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
        </TouchableOpacity>
      );
    }

    // CUSTOMER chat row
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
                customer_profile_image: item.customer_profile_image || "",
                customerProfileImage: item.customer_profile_image || "",
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
            <Text style={styles.avatarText}>{item.customerName?.charAt(0)?.toUpperCase() || "C"}</Text>
          </View>
        )}

        <View style={styles.threadTextWrap}>
          <View style={styles.threadTopRow}>
            <Text style={styles.threadName} numberOfLines={1}>
              {item.customerName}
            </Text>
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
            <Ionicons name={isDriverTab ? "car-outline" : "person-outline"} size={32} color="#9CA3AF" />
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
    <TouchableOpacity style={[styles.tabButton, active && styles.tabButtonActive]} onPress={onPress} activeOpacity={0.9}>
      <Ionicons name={icon} size={18} color={active ? "#00b14f" : "#6B7280"} style={{ marginRight: 6 }} />
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
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