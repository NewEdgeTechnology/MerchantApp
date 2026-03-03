// screens/food/GrabMerchantHomeScreen.js
import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  Platform,
  useWindowDimensions,
  AppState,
  DeviceEventEmitter,
  Image,
  ActivityIndicator,
  BackHandler,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRoute, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  LOGIN_USERNAME_MERCHANT_ENDPOINT,
  PROFILE_ENDPOINT,
  BUSINESS_DETAILS,
  MERCHANT_LOGO,
  ITEM_ENDPOINT as MART_ITEM_ENDPOINT,
  DISPLAY_ITEM_ENDPOINT as MART_DISPLAY_ITEM_ENDPOINT,
  PROFILE_IMAGE as PROFILE_IMAGE_ENDPOINT,
  PROMOS_ENDPOINT,
  PROMOS_FOOD_ENDPOINT,
  PROMOS_MART_ENDPOINT,
  MEDIA_BASE_URL,
  STATUS_COUNT_ENDPOINT as ENV_STATUS_COUNT_ENDPOINT,

  // ✅ UPDATED: use TOTAL_SALES_ENDPOINT (remove SALES_TODAY_ENDPOINT)
  TOTAL_SALES_ENDPOINT,
} from "@env";

import HomeTab from "./HomeTab";
import OrdersTab from "./OrderTab";
import FoodAddMenuTab from "./AddMenuTab";
import MartAddItemTab from "../mart/AddItemTab";
import NotificationsTab from "./NotificationsTab";
import MerchantBottomBar from "./MerchantBottomBar";
import PromosTab from "./PromoTab";
import PayoutTab from "./PayoutTab";
import SalesAnalyticsScreen from "./SalesAnalyticsScreen";

/* ───────────────────────── Constants / Keys ───────────────────────── */
const KEY_MERCHANT_LOGIN = "merchant_login";
const KEY_AUTH_TOKEN = "auth_token";
const KEY_REFRESH_TOKEN = "refresh_token_v1";
const KEY_USER_ID = "user_id_v1";
const KEY_BUSINESS_ID = "business_id_v1";
const KEY_LAST_CTX = "last_ctx_payload";
const menusKey = (bid, kind) => `menus_by_business_${bid}_${kind || "food"}`;

const DEFAULT_AVATAR =
  "https://images.unsplash.com/photo-1612198182421-3f5dff0c9b40?q=80&w=400&auto=format&fit=crop";
const DEFAULT_NAME = "Your Business";

const DEFAULT_DEV_ORIGIN = Platform.select({
  android: "http://10.0.2.2:3000",
  ios: "http://localhost:3000",
  default: "http://localhost:3000",
});


// ✅ slower refresh to avoid rate limits
const HEADER_REFRESH_MS = 45000;

const normalizeOwnerType = (v) => {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "2" || s === "mart") return "mart";
  if (s === "1" || s === "food") return "food";
  return s || "food";
};
const maybeApplyKind = (incoming, set) => {
  const raw = incoming ?? "";
  if (String(raw).trim() === "") return;
  set(normalizeOwnerType(raw));
};

function normalizeHost(url) {
  if (!url) return "";
  try {
    const u = new URL(url);
    if (
      Platform.OS === "android" &&
      (u.hostname === "localhost" || u.hostname === "127.0.0.1")
    ) {
      u.hostname = "10.0.2.2";
    }
    return u.toString();
  } catch {
    return url;
  }
}

async function fetchJSON(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch { }
    if (!res.ok) {
      const msg =
        (json && (json.message || json.error)) ||
        text ||
        `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return json;
  } finally {
    clearTimeout(tid);
  }
}

const getBaseOrigin = () => {
  try {
    if (
      typeof globalThis.URL === "function" &&
      LOGIN_USERNAME_MERCHANT_ENDPOINT
    ) {
      return new globalThis.URL(LOGIN_USERNAME_MERCHANT_ENDPOINT).origin;
    }
  } catch { }
  return DEFAULT_DEV_ORIGIN;
};
const candidateProfileUrls = () => {
  const base = normalizeHost(getBaseOrigin());
  return [
    `${base}/api/merchant/me`,
    `${base}/api/merchant/profile`,
    `${base}/api/profile/me`,
  ];
};

/* ───────────────────────── ENV-ONLY image URL helpers ───────────────────────── */
const BASE_MERCHANT = String(MERCHANT_LOGO || MEDIA_BASE_URL || "").replace(
  /\/+$/,
  ""
);
const BASE_PROFILE = String(
  PROFILE_IMAGE_ENDPOINT || MEDIA_BASE_URL || ""
).replace(/\/+$/, "");

const makeEnvImageUrl = (input, kind = "merchant") => {
  if (!input) return null;
  const raw = String(input).trim();
  const base = kind === "profile" ? BASE_PROFILE : BASE_MERCHANT;
  if (!base) return null;

  try {
    if (/^https?:\/\//i.test(raw)) {
      const u = new URL(raw);
      const path = u.pathname.startsWith("/") ? u.pathname : `/${u.pathname}`;
      const qs = u.search || "";
      return `${base}${path}${qs}`;
    }
    const path = raw.startsWith("/") ? raw : `/${raw}`;
    return `${base}${path}`;
  } catch {
    const path = raw.startsWith("/") ? raw : `/${raw}`;
    return `${base}${path}`;
  }
};

const money = (n, c = "Nu") => `${c} ${Number(n ?? 0).toFixed(2)}`;

// ✅ Updated: prefer KEY_AUTH_TOKEN first, fallback merchant_login token shapes
async function getAuthHeader() {
  try {
    const direct = await SecureStore.getItemAsync(KEY_AUTH_TOKEN);
    if (direct) return { Authorization: `Bearer ${direct}` };

    const raw = await SecureStore.getItemAsync(KEY_MERCHANT_LOGIN);
    let token = null;
    if (raw) {
      const parsed = JSON.parse(raw);
      token =
        parsed?.token?.access_token ||
        parsed?.token ||
        parsed?.data?.token?.access_token ||
        parsed?.data?.token ||
        null;
    }
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

/* ───────────────────── KPI helpers ───────────────────── */
const UP = (s) => String(s || "").toUpperCase();

const DEFAULT_KPIS = {
  salesToday: 0,
  salesCurrency: "Nu",
  activeOrders: 0,
  cancellations: 0,
  acceptanceRate: 0,
  perStatus: {},
  totalsByStatus: {},
  lastUpdatedAt: null,
};

const ACTIVE_FOOD = ["PENDING", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY"];
const ACTIVE_MART = ["PENDING", "CONFIRMED", "READY", "OUT_FOR_DELIVERY"];
const CANCEL_SET = new Set(["CANCELLED", "CANCELED", "REJECTED", "DECLINED"]);

/* KPI URLs */
const buildStatusCountsUrl = (businessId) => {
  const tpl = (ENV_STATUS_COUNT_ENDPOINT || "").trim();
  if (!tpl) return "";
  const id = encodeURIComponent(String(businessId));

  let url = tpl
    .replace("{business_id}", id)
    .replace("{businessId}", id)
    .replace(":business_id", id)
    .replace(":businessId", id);

  if (url === tpl) {
    const sep = tpl.includes("?") ? "&" : "?";
    url = `${tpl}${sep}business_id=${id}`;
  }
  return url;
};

// ✅ TOTAL sales endpoint url builder
const buildTotalSalesUrl = (businessId) => {
  const tpl = (TOTAL_SALES_ENDPOINT || "").trim();
  if (!tpl) return "";
  const id = encodeURIComponent(String(businessId));

  let url = tpl
    .replace("{business_id}", id)
    .replace("{businessId}", id)
    .replace(":business_id", id)
    .replace(":businessId", id);

  if (url === tpl) {
    const sep = tpl.includes("?") ? "&" : "?";
    url = `${tpl}${sep}business_id=${id}`;
  }
  return url;
};

/* ✅ DO NOT touch salesToday / salesCurrency here, only counts */
function kpisFromStatusCounts(counts = {}, ownerType = "food") {
  const entries = Object.entries(counts || {});
  const perStatus = {};
  for (const [k, v] of entries) perStatus[UP(k)] = Number(v || 0);

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

  const cancelledToday = Number(counts?.order_declined_today || 0);
  const accepted = Math.max(0, total - cancels);
  const acceptanceRate = total > 0 ? Math.round((accepted / total) * 100) : 0;

  return {
    activeOrders,
    cancellations: cancelledToday,
    acceptanceRate,
    perStatus,
    totalsByStatus: {},
    lastUpdatedAt: new Date().toISOString(),
  };
}

/* ───────────────────────── Header (kept mounted) ───────────────────────── */
const HeaderBar = React.memo(function HeaderBar({
  isTablet,
  insets,
  avatarSize,
  showWelcome,
  activeTab,

  userId,
  businessId,
  merchantName,
  merchantLogo,
  profileAvatar,
  businessAddress,
  businessLicense,
  ownerType,
  authContext,
  authToken,
  serviceConfig,
  deliveryOption,

  logoVersion,
  addBuster,
}) {
  const nav = useNavigation();
  const [loadingLogo, setLoadingLogo] = useState(false);
  const loadedUrisRef = useRef(new Set());

  const params = useMemo(
    () => ({
      user_id: userId,
      business_id: businessId,
      business_name: merchantName,
      business_logo: merchantLogo,
      profile_image: profileAvatar,
      business_address: businessAddress,
      business_license: businessLicense,
      owner_type: normalizeOwnerType(ownerType),
      ownerType: normalizeOwnerType(ownerType),
      authContext,
      auth_token: authToken,
      serviceConfig,
      delivery_option: deliveryOption,
      deliveryOption,
    }),
    [
      userId,
      businessId,
      merchantName,
      merchantLogo,
      profileAvatar,
      businessAddress,
      businessLicense,
      ownerType,
      authContext,
      authToken,
      serviceConfig,
      deliveryOption,
    ]
  );

  const safeNav = useCallback(
    (target, fallback) => {
      try {
        nav.navigate(target, params);
      } catch {
        if (fallback) {
          try {
            nav.navigate(fallback, params);
          } catch { }
        }
      }
    },
    [nav, params]
  );

  const goToAccountSettings = useCallback(
    () => safeNav("AccountSettings", "ProfileBusinessDetails"),
    [safeNav]
  );
  const goToProfileBusinessDetails = useCallback(
    () => safeNav("ProfileBusinessDetails"),
    [safeNav]
  );

  const logoUri = useMemo(() => {
    const u = addBuster(merchantLogo, logoVersion) || DEFAULT_AVATAR;
    return u;
  }, [merchantLogo, logoVersion, addBuster]);

  const shouldShowSpinner = useMemo(() => {
    if (!logoUri) return false;
    return loadingLogo && !loadedUrisRef.current.has(logoUri);
  }, [loadingLogo, logoUri]);

  const onLogoLoadStart = useCallback(() => {
    if (!logoUri) return;
    if (loadedUrisRef.current.has(logoUri)) return;
    setLoadingLogo(true);
  }, [logoUri]);

  const onLogoLoadEnd = useCallback(() => {
    if (logoUri) loadedUrisRef.current.add(logoUri);
    setLoadingLogo(false);
  }, [logoUri]);

  const onLogoError = useCallback(() => {
    setLoadingLogo(false);
  }, []);

  return (
    <LinearGradient
      colors={["#00b14f", "#4de6de"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        paddingTop: (isTablet ? 24 : 18) + (insets.top || 0),
        paddingBottom: isTablet ? 16 : 12,
        paddingHorizontal: isTablet ? 24 : 18,
      }}
    >
      {showWelcome && activeTab === "Home" && <Text style={styles.hi}>Welcome</Text>}

      <View style={styles.headerRow}>
        <View style={styles.inlineRow}>
          <TouchableOpacity
            onPress={goToProfileBusinessDetails}
            activeOpacity={0.85}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ position: "relative" }}
          >
            <Image
              source={{ uri: logoUri }}
              style={[styles.avatar, { width: avatarSize, height: avatarSize }]}
              onLoadStart={onLogoLoadStart}
              onLoadEnd={onLogoLoadEnd}
              onError={onLogoError}
            />
            {shouldShowSpinner && (
              <ActivityIndicator
                style={{
                  position: "absolute",
                  left: avatarSize / 2 - 12,
                  top: avatarSize / 2 - 12,
                }}
                size="small"
                color="#00b14f"
              />
            )}
          </TouchableOpacity>

          <Text
            style={[styles.merchantName, { marginLeft: 6 }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {merchantName || DEFAULT_NAME}
          </Text>
        </View>

        <View style={styles.inlineRow}>
          <TouchableOpacity
            onPress={goToAccountSettings}
            activeOpacity={0.85}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Image
              source={{ uri: profileAvatar || DEFAULT_AVATAR }}
              style={[styles.profileCircle, { width: avatarSize, height: avatarSize }]}
              onError={() => { }}
            />
          </TouchableOpacity>
        </View>
      </View>

      {!!businessAddress && (
        <View style={{ marginTop: 10, alignItems: "center", width: "100%" }}>
          <View style={styles.addressChip}>
            <Ionicons name="location-outline" size={16} color="#00b14f" />
            <Text style={styles.addressText} numberOfLines={1} ellipsizeMode="tail">
              {businessAddress}
            </Text>
          </View>
        </View>
      )}
    </LinearGradient>
  );
});

export default function GrabMerchantHomeScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const isTablet = width >= 768;
  const isLargePhone = width >= 400 && width < 768;

  const bottomInset = insets.bottom || 0;
  const softKeyPad = Platform.OS === "android" ? Math.max(bottomInset, 8) : bottomInset;
  const bottomBarBase = isTablet ? 84 : 76;
  const bottomBarHeight = bottomBarBase + softKeyPad;
  const avatarSize = isTablet ? 56 : isLargePhone ? 48 : 44;

  const [merchantName, setMerchantName] = useState(DEFAULT_NAME);
  const [merchantLogo, setMerchantLogo] = useState(null);
  const [profileAvatar, setProfileAvatar] = useState(null);
  const [businessAddress, setBusinessAddress] = useState("");
  const [businessLicense, setBusinessLicense] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const [menus, setMenus] = useState([]);
  const [unreadActivities, setUnreadActivities] = useState(0);

  const initialOpenTab = route?.params?.openTab || "Home";
  const initialBid = route?.params?.businessId || route?.params?.business_id || null;

  // ✅ IMPORTANT: initialize ownerType from params (fixes food/mart mismatch -> items not showing)
  const initialOwnerType = normalizeOwnerType(
    route?.params?.owner_type ?? route?.params?.ownerType ?? "food"
  );

  const [activeTab, setActiveTab] = useState(initialOpenTab);
  const [businessId, setBusinessId] = useState(initialBid);
  const [ownerType, setOwnerType] = useState(initialOwnerType);

  const ownerKind = useMemo(() => normalizeOwnerType(ownerType), [ownerType]);
  const isFood = ownerKind === "food";

  const [userId, setUserId] = useState(
    route?.params?.user_id ? String(route.params.user_id) : ""
  );
  const [authContext, setAuthContext] = useState(route?.params?.authContext || null);

  // ✅ accept auth_token from params too (MobileLoginScreen passes it)
  const [authToken, setAuthToken] = useState(
    route?.params?.auth_token ? String(route.params.auth_token) : null
  );

  const [logoVersion, setLogoVersion] = useState(0);
  const addBuster = (u, v) => {
    if (!u) return u;
    if (!v) return u;
    const sep = u.includes("?") ? "&" : "?";
    return `${u}${sep}v=${v}`;
  };

  const [kpis, setKpis] = useState(DEFAULT_KPIS);

  const [deliveryOption, setDeliveryOption] = useState(
    (route?.params?.delivery_option || route?.params?.deliveryOption || "")
      ? String(route.params.delivery_option || route.params.deliveryOption).toUpperCase()
      : null
  );

  const serviceConfig = useMemo(() => {
    const base = getBaseOrigin();

    const resolvedFoodPromos = normalizeHost(
      PROMOS_FOOD_ENDPOINT || PROMOS_ENDPOINT || `${base}/api/food/promos`
    );
    const resolvedMartPromos = normalizeHost(
      PROMOS_MART_ENDPOINT || PROMOS_ENDPOINT || `${base}/api/mart/promos`
    );

    if (isFood) {
      return {
        kind: "food",
        base,
        menus: `${base}/api/food/menus`,
        orders: `${base}/api/food/orders`,
        promos: resolvedFoodPromos,
        payouts: `${base}/api/food/payouts`,
        notifications: `${base}/api/food/notifications`,
        menusList: `${base}/api/food/menus`,
        menusWrite: `${base}/api/food/menus`,
      };
    }

    const listUrl = normalizeHost(
      MART_DISPLAY_ITEM_ENDPOINT || `${base}/api/mart-menu/business`
    );
    const writeUrl = normalizeHost(MART_ITEM_ENDPOINT || `${base}/api/mart-menu`);

    return {
      kind: "mart",
      base,
      menus: listUrl,
      itemsList: listUrl,
      itemsWrite: writeUrl,
      orders: `${base}/api/mart/orders`,
      promos: resolvedMartPromos,
      payouts: `${base}/api/mart/payouts`,
      notifications: `${base}/api/mart/notifications`,
    };
  }, [isFood]);

  useEffect(() => {
    navigation.setParams({
      businessId,
      business_id: businessId,
      owner_type: ownerKind,
      ownerType: ownerKind,
      user_id: userId,
      authContext,
      auth_token: authToken,
      business_name: merchantName,
      business_logo: merchantLogo,
      business_address: businessAddress,
      business_license: businessLicense,
      serviceConfig,
      delivery_option: deliveryOption,
      deliveryOption,
    });
  }, [
    navigation,
    businessId,
    ownerKind,
    userId,
    authContext,
    authToken,
    merchantName,
    merchantLogo,
    businessAddress,
    businessLicense,
    serviceConfig,
    deliveryOption,
  ]);

  const buildProfileUrl = useCallback((uid) => {
    if (!uid || !PROFILE_ENDPOINT) return "";
    const base = normalizeHost((PROFILE_ENDPOINT || "").trim()).replace(/\/+$/, "");
    return `${base}/${encodeURIComponent(String(uid))}`;
  }, []);

  const buildBusinessUrl = useCallback((bid) => {
    const rawBid = bid != null ? String(bid).trim() : "";
    const tpl = (BUSINESS_DETAILS || "").trim();
    if (!rawBid || !tpl) return "";

    const id = encodeURIComponent(rawBid);

    let url = tpl
      .replace("{business_id}", id)
      .replace("{businessId}", id)
      .replace(":business_id", id)
      .replace(":businessId", id);

    if (url === tpl) {
      const base = tpl.replace(/\/+$/, "");
      url = `${base}/${id}`;
    }

    return url;
  }, []);

  const headerSnapRef = useRef({ name: null, addr: null, logo: null, profile: null });

  const applyHeaderIfChanged = useCallback((payload = {}) => {
    const next = {
      name: payload.business_name ?? payload.name ?? null,
      addr: payload.business_address ?? payload.address ?? payload.location ?? null,
      logo: payload.business_logo ?? payload.logo_url ?? null,
      profile:
        payload.profile_image ??
        payload.avatar ??
        payload.profile_photo ??
        payload.photo_url ??
        null,
    };

    let bumped = false;

    if (next.name && next.name !== headerSnapRef.current.name) {
      setMerchantName(String(next.name));
      headerSnapRef.current.name = next.name;
    }
    if (typeof next.addr === "string" && next.addr !== headerSnapRef.current.addr) {
      setBusinessAddress(String(next.addr));
      headerSnapRef.current.addr = next.addr;
    }
    if (next.logo) {
      const resolved = makeEnvImageUrl(String(next.logo), "merchant");
      if (resolved && resolved !== headerSnapRef.current.logo) {
        setMerchantLogo(resolved);
        headerSnapRef.current.logo = resolved;
        bumped = true;
      }
    }
    if (next.profile) {
      const resolvedP = makeEnvImageUrl(String(next.profile), "profile");
      if (resolvedP && resolvedP !== headerSnapRef.current.profile) {
        setProfileAvatar(resolvedP);
        headerSnapRef.current.profile = resolvedP;
      }
    }

    if (bumped) setLogoVersion((v) => v + 1);
  }, []);

  /* ──────────────── ✅ Profile request limiter (prevents 429) ──────────────── */
  const profileReqRef = useRef({
    inFlight: false,
    lastAt: 0,
    timer: null,
    lastUid: null,
    backoffUntil: 0,
  });

  const PROFILE_COOLDOWN_MS = 25000;
  const PROFILE_DEBOUNCE_MS = 700;
  const STORAGE_KEY_LAST_UNREAD = "@notifications_unread_count_v1";

  const notifOpenAtRef = useRef(0);
  const unreadDebounceRef = useRef(null);

  useEffect(() => {
    // preload last known unread so badge does not jump to 0 on first render
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY_LAST_UNREAD);
        const n = Number(raw ?? 0);
        if (Number.isFinite(n) && n > 0) setUnreadActivities(n);
      } catch { }
    })();
  }, []);

  useEffect(() => {
    const subUnread = DeviceEventEmitter.addListener("notifications-unread-count", (payload) => {
      const incoming = Number(payload?.count ?? 0);
      const next = Number.isFinite(incoming) ? Math.max(0, incoming) : 0;

      // during the first ~1.2s after opening Activities:
      // ignore any lower value (prevents 35 -> 12 -> 35 flicker)
      const justOpened = Date.now() - (notifOpenAtRef.current || 0) < 1200;
      if (justOpened) {
        // IMPORTANT: compare with the latest state value
        // ignore drops that happen during screen boot/fetch
        if (next < unreadActivities) return;
      }

      // debounce
      if (unreadDebounceRef.current) clearTimeout(unreadDebounceRef.current);
      unreadDebounceRef.current = setTimeout(() => {
        setUnreadActivities((prev) => (prev === next ? prev : next));
      }, 120);
    });

    return () => {
      subUnread.remove();
      if (unreadDebounceRef.current) clearTimeout(unreadDebounceRef.current);
      unreadDebounceRef.current = null;
    };
  }, [unreadActivities]);

  useEffect(() => {
    return () => {
      if (profileReqRef.current.timer) clearTimeout(profileReqRef.current.timer);
      profileReqRef.current.timer = null;
    };
  }, []);

  // ✅ UPDATED: Fetch necessary data from SecureStore first (user_id_v1, business_id_v1, auth_token, merchant_login)
  const loadFromStore = useCallback(async () => {
    try {
      const [rawMerchant, storedUid, storedBid, storedToken] = await Promise.all([
        SecureStore.getItemAsync(KEY_MERCHANT_LOGIN),
        SecureStore.getItemAsync(KEY_USER_ID),
        SecureStore.getItemAsync(KEY_BUSINESS_ID),
        SecureStore.getItemAsync(KEY_AUTH_TOKEN),
      ]);

      if (!userId && storedUid) setUserId(String(storedUid));
      if (!businessId && storedBid) setBusinessId(String(storedBid));
      if (!authToken && storedToken) setAuthToken(String(storedToken));

      if (!rawMerchant) return;

      let blob = {};
      try {
        blob = JSON.parse(rawMerchant);
      } catch { }

      const user =
        blob?.user ??
        blob?.merchant ??
        blob?.data?.user ??
        blob?.data?.merchant ??
        blob;

      const idCandidates = [
        user?.user_id,
        user?.id,
        blob?.user_id,
        blob?.id,
        blob?.merchant?.user_id,
        blob?.merchant?.id,
      ].filter((v) => v !== undefined && v !== null && v !== "");

      if (!userId && idCandidates.length) setUserId(String(idCandidates[0]));

      const bidCandidate =
        user?.business_id ||
        user?.businessId ||
        blob?.business_id ||
        blob?.businessId ||
        user?.id ||
        blob?.id ||
        null;
      if (!businessId && bidCandidate) setBusinessId(String(bidCandidate));

      // ✅ IMPORTANT: apply stored owner_type (works with MobileLoginScreen small payload too)
      maybeApplyKind(
        user?.owner_type ?? user?.ownerType ?? blob?.owner_type ?? blob?.ownerType,
        setOwnerType
      );

      const storedDelivery = (
        blob?.delivery_option ||
        user?.delivery_option ||
        user?.deliveryOption ||
        ""
      )
        ?.toString()
        ?.toUpperCase();
      if (storedDelivery && !deliveryOption) setDeliveryOption(storedDelivery);

      applyHeaderIfChanged({
        business_name: blob?.business_name ?? user?.business_name ?? user?.businessName,
        business_address:
          user?.business_address ??
          user?.businessAddress ??
          user?.address ??
          user?.location ??
          blob?.business_address ??
          blob?.businessAddress ??
          blob?.address,
        business_logo:
          blob?.business_logo ??
          user?.business_logo ??
          user?.businessLogo ??
          user?.logo_url ??
          user?.logo,
        profile_image:
          blob?.profile_image ??
          user?.profile_image ??
          user?.profileImage ??
          user?.avatar ??
          user?.profile_photo ??
          user?.photo_url,
      });

      const licenseCandidate =
        blob?.business_license ||
        user?.business_license ||
        user?.business_license_number ||
        blob?.business_license_number ||
        "";
      if (licenseCandidate) setBusinessLicense(String(licenseCandidate));

      const tokenCandidate =
        blob?.token?.access_token ||
        blob?.token ||
        blob?.data?.token?.access_token ||
        blob?.data?.token ||
        null;

      if (tokenCandidate && !authToken) setAuthToken(String(tokenCandidate));
    } catch { }
  }, [userId, businessId, authToken, deliveryOption, applyHeaderIfChanged]);

  // ✅ rate-safe loadFromBackend(uid, {force})
  const loadFromBackend = useCallback(
    async (uid, { force = false } = {}) => {
      const _uid = String(uid || "").trim();
      if (!_uid) return;

      const now = Date.now();
      const r = profileReqRef.current;

      if (!force) {
        if (r.inFlight) return;
        if (r.backoffUntil && now < r.backoffUntil) return;
        if (r.lastUid === _uid && now - r.lastAt < PROFILE_COOLDOWN_MS) return;
      }

      if (r.timer) clearTimeout(r.timer);
      r.timer = setTimeout(async () => {
        const rr = profileReqRef.current;
        const now2 = Date.now();

        if (!force) {
          if (rr.inFlight) return;
          if (rr.backoffUntil && now2 < rr.backoffUntil) return;
          if (rr.lastUid === _uid && now2 - rr.lastAt < PROFILE_COOLDOWN_MS) return;
        }

        rr.inFlight = true;
        rr.lastUid = _uid;

        const url = buildProfileUrl(_uid);
        if (!url) {
          rr.inFlight = false;
          return;
        }

        try {
          const data = await fetchJSON(url, { method: "GET" });
          applyHeaderIfChanged(data);
          maybeApplyKind(data?.owner_type, setOwnerType);

          const bid = data?.business_id ?? data?.businessId ?? data?.id ?? null;
          if (bid) setBusinessId(String(bid));

          const license = data?.business_license || data?.business_license_number || "";
          if (license) setBusinessLicense(String(license));

          if (data?.delivery_option && !deliveryOption) {
            setDeliveryOption(String(data.delivery_option).toUpperCase());
          }

          try {
            const raw = await SecureStore.getItemAsync(KEY_MERCHANT_LOGIN);
            let blob = {};
            try {
              blob = raw ? JSON.parse(raw) : {};
            } catch { }
            const providedKind =
              data?.owner_type != null && String(data.owner_type).trim() !== ""
                ? normalizeOwnerType(data.owner_type)
                : null;

            const merged = {
              ...blob,
              business_license: license || blob?.business_license,
              business_name: data?.business_name ?? blob?.business_name,
              business_address:
                (data?.business_address ?? data?.address ?? data?.location) ??
                blob?.business_address,
              business_logo: data?.business_logo ?? blob?.business_logo,
              owner_type: providedKind ?? (blob?.owner_type ?? ownerKind),
              business_id:
                (data?.business_id ?? data?.businessId ?? data?.id) ??
                blob?.business_id,
              user_id: data?.user_id ?? blob?.user_id,
              delivery_option: (data?.delivery_option || blob?.delivery_option || "")
                .toString()
                .toUpperCase(),
              user: {
                ...(blob.user || {}),
                business_license: license || blob?.user?.business_license,
                business_name: data?.business_name ?? blob?.user?.business_name,
                business_address:
                  (data?.business_address ?? data?.address ?? data?.location) ??
                  blob?.user?.business_address,
                business_logo: data?.business_logo ?? blob?.user?.business_logo,
                owner_type: providedKind ?? (blob?.user?.owner_type ?? ownerKind),
                business_id:
                  (data?.business_id ?? data?.businessId ?? data?.id) ??
                  blob?.user?.business_id,
                user_id: data?.user_id ?? blob?.user?.user_id,
                delivery_option: (data?.delivery_option || blob?.user?.delivery_option || "")
                  .toString()
                  .toUpperCase(),
              },
            };
            await SecureStore.setItemAsync(KEY_MERCHANT_LOGIN, JSON.stringify(merged));

            if (data?.user_id != null) {
              await SecureStore.setItemAsync(KEY_USER_ID, String(data.user_id));
            }
            if (data?.business_id != null || data?.businessId != null) {
              const bid2 = String(data?.business_id ?? data?.businessId);
              await SecureStore.setItemAsync(KEY_BUSINESS_ID, bid2);
              await SecureStore.setItemAsync("business_id", bid2);
              await SecureStore.setItemAsync("businessId", bid2);
            }
          } catch { }

          rr.lastAt = Date.now();
          rr.backoffUntil = 0;
        } catch (e) {
          const msg = String(e?.message || "");
          if (msg.toLowerCase().includes("too many")) {
            rr.backoffUntil = Date.now() + 60000;
          }
          if (e?.name === "AbortError" || e?.message === "Aborted") return;
          if (__DEV__) console.log("[Home] profile fetch failed:", e?.message);
        } finally {
          profileReqRef.current.inFlight = false;
        }
      }, PROFILE_DEBOUNCE_MS);
    },
    [buildProfileUrl, applyHeaderIfChanged, deliveryOption, ownerKind]
  );

  const loadBusinessFromBackend = useCallback(
    async (bid) => {
      const url = buildBusinessUrl(bid);
      if (!url) return;
      try {
        const data = await fetchJSON(url, { method: "GET" });

        applyHeaderIfChanged({
          business_name: data?.business_name ?? data?.name,
          business_address: data?.business_address ?? data?.address ?? data?.location,
          business_logo: data?.business_logo,
        });

        try {
          const raw = await SecureStore.getItemAsync(KEY_MERCHANT_LOGIN);
          const blob = raw ? JSON.parse(raw) : {};
          const merged = {
            ...blob,
            business_name: (data?.business_name ?? data?.name) ?? blob?.business_name,
            business_address:
              (data?.business_address ?? data?.address ?? data?.location) ??
              blob?.business_address,
            business_logo: data?.business_logo ?? blob?.business_logo,
            business_id: bid ?? blob?.business_id,
            user: {
              ...(blob.user || {}),
              business_name: (data?.business_name ?? data?.name) ?? blob?.user?.business_name,
              business_address:
                (data?.business_address ?? data?.address ?? data?.location) ??
                blob?.user?.business_address,
              business_logo: data?.business_logo ?? blob?.user?.business_logo,
              business_id: bid ?? blob?.user?.business_id,
            },
          };
          await SecureStore.setItemAsync(KEY_MERCHANT_LOGIN, JSON.stringify(merged));

          if (bid != null && String(bid).trim()) {
            await SecureStore.setItemAsync(KEY_BUSINESS_ID, String(bid));
            await SecureStore.setItemAsync("business_id", String(bid));
            await SecureStore.setItemAsync("businessId", String(bid));
          }
        } catch { }
      } catch (e) {
        if (e?.name === "AbortError" || e?.message === "Aborted") return;
        if (__DEV__) console.log("[Home] loadBusinessFromBackend failed:", e?.message);
      }
    },
    [buildBusinessUrl, applyHeaderIfChanged]
  );

  const refreshFromServerMe = useCallback(
    async () => {
      try {
        const token = await SecureStore.getItemAsync(KEY_AUTH_TOKEN);
        if (!token) return;

        if (token && !authToken) setAuthToken(String(token));

        for (const url of candidateProfileUrls()) {
          try {
            const res = await fetch(url, {
              headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
            });
            if (!res.ok) continue;
            const data = await res.json();
            const user = data?.user ?? data;

            applyHeaderIfChanged({
              business_name: user?.business_name,
              business_address: user?.business_address ?? user?.address ?? user?.location,
              business_logo: user?.logo_url ?? user?.business_logo,
              profile_image:
                user?.profile_photo ??
                user?.avatar ??
                user?.profile_image ??
                user?.photo_url,
            });

            maybeApplyKind(user?.owner_type, setOwnerType);

            const bid =
              user?.business_id ||
              user?.businessId ||
              user?.id ||
              data?.business_id ||
              null;
            if (bid) setBusinessId(String(bid));

            if (user?.delivery_option && !deliveryOption) {
              setDeliveryOption(String(user.delivery_option).toUpperCase());
            }

            try {
              if (user?.user_id != null) {
                await SecureStore.setItemAsync(KEY_USER_ID, String(user.user_id));
              }
              if (bid != null) {
                await SecureStore.setItemAsync(KEY_BUSINESS_ID, String(bid));
                await SecureStore.setItemAsync("business_id", String(bid));
                await SecureStore.setItemAsync("businessId", String(bid));
              }
            } catch { }

            break;
          } catch (e) {
            if (__DEV__) console.log("[Home] /me fetch failed for", url, e?.message);
          }
        }
      } catch (e) {
        if (__DEV__) console.log("[Home] refreshFromServerMe unexpected:", e?.message);
      }
    },
    [applyHeaderIfChanged, deliveryOption, authToken]
  );

  const fetchKpis = useCallback(async (bid, kind) => {
    const business = String(bid || "").trim();
    if (!business) return;

    try {
      const headers = {
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
        ...(await getAuthHeader()),
      };

      const url = buildStatusCountsUrl(business);
      if (!url) return;

      const payload = await fetchJSON(url, { headers });
      const next = kpisFromStatusCounts(payload, kind);
      setKpis((prev) => ({ ...prev, ...next }));
    } catch (e) {
      if (e?.name === "AbortError" || e?.message === "Aborted") return;
      if (__DEV__) console.log("[KPI] status-count fetch failed:", e?.message);
    }
  }, []);

  // ✅ calculate salesToday from TOTAL_SALES_ENDPOINT rows for "today"
  const fetchSalesToday = useCallback(async (bid) => {
    const business = String(bid || "").trim();
    if (!business) return;

    try {
      const headers = {
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
        ...(await getAuthHeader()),
      };

      const url = buildTotalSalesUrl(business);
      if (!url) return;

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

      setKpis((prev) => ({
        ...prev,
        salesToday: Number(totalToday || 0),
        salesCurrency: prev.salesCurrency || "Nu",
        lastUpdatedAt: new Date().toISOString(),
      }));
    } catch (e) {
      if (e?.name === "AbortError" || e?.message === "Aborted") return;
      if (__DEV__) console.log("[KPI] total-sales fetch failed:", e?.message);
    }
  }, []);

  // ✅ prevent initial effect from double-running
  const bootRef = useRef(false);

  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;

    (async () => {
      await loadFromStore();

      const storedUid = await SecureStore.getItemAsync(KEY_USER_ID);
      const storedBid = await SecureStore.getItemAsync(KEY_BUSINESS_ID);

      if (!userId && storedUid) setUserId(String(storedUid));
      if (!businessId && storedBid) setBusinessId(String(storedBid));

      const uid = route?.params?.user_id || storedUid || userId;
      const bid = route?.params?.businessId || route?.params?.business_id || storedBid || businessId;

      if (uid) {
        await loadFromBackend(String(uid), { force: true });
      } else {
        await refreshFromServerMe();
      }

      if (bid) {
        await loadBusinessFromBackend(String(bid));
        await fetchKpis(String(bid), ownerKind);
        await fetchSalesToday(String(bid));
      }

      if (route?.params?.authContext) setAuthContext(route.params.authContext);

      if ((route?.params?.delivery_option || route?.params?.deliveryOption) && !deliveryOption) {
        setDeliveryOption(
          String(route.params.delivery_option || route.params.deliveryOption).toUpperCase()
        );
      }

      // ✅ if auth_token comes from params but state is still null
      if (!authToken && route?.params?.auth_token) setAuthToken(String(route.params.auth_token));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener("focus", async () => {
      await loadFromStore();
      const uid = route?.params?.user_id || (await SecureStore.getItemAsync(KEY_USER_ID)) || userId;
      const bid =
        route?.params?.businessId ||
        route?.params?.business_id ||
        (await SecureStore.getItemAsync(KEY_BUSINESS_ID)) ||
        businessId;

      if (uid) await loadFromBackend(String(uid));
      if (bid) {
        await loadBusinessFromBackend(String(bid));
        await fetchKpis(String(bid), ownerKind);
        await fetchSalesToday(String(bid));
      }
    });
    return unsub;
  }, [
    navigation,
    userId,
    route?.params?.user_id,
    businessId,
    ownerKind,
    loadFromStore,
    loadFromBackend,
    loadBusinessFromBackend,
    fetchKpis,
    fetchSalesToday,
  ]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", async (s) => {
      if (s === "active") {
        await loadFromStore();
        const uid = route?.params?.user_id || (await SecureStore.getItemAsync(KEY_USER_ID)) || userId;
        const bid =
          route?.params?.businessId ||
          route?.params?.business_id ||
          (await SecureStore.getItemAsync(KEY_BUSINESS_ID)) ||
          businessId;

        if (uid) await loadFromBackend(String(uid));
        if (bid) {
          await loadBusinessFromBackend(String(bid));
          await fetchKpis(String(bid), ownerKind);
          await fetchSalesToday(String(bid));
        }
      }
    });
    return () => sub.remove();
  }, [
    userId,
    route?.params?.user_id,
    businessId,
    ownerKind,
    loadFromBackend,
    loadFromStore,
    loadBusinessFromBackend,
    fetchKpis,
    fetchSalesToday,
  ]);

  useEffect(() => {
    let timer = null;
    let isActive = true;

    const start = () => {
      if (timer) clearInterval(timer);
      timer = setInterval(async () => {
        if (!isActive) return;

        const bid = (await SecureStore.getItemAsync(KEY_BUSINESS_ID)) || businessId;
        const uid = route?.params?.user_id || (await SecureStore.getItemAsync(KEY_USER_ID)) || userId;

        if (bid) {
          await loadBusinessFromBackend(String(bid));
          await fetchKpis(String(bid), ownerKind);
          await fetchSalesToday(String(bid));
        }
        if (uid) await loadFromBackend(String(uid));
      }, HEADER_REFRESH_MS);
    };

    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    const onFocus = () => {
      isActive = true;
      start();
    };
    const onBlur = () => {
      isActive = false;
      stop();
    };

    const unsubFocus = navigation.addListener("focus", onFocus);
    const unsubBlur = navigation.addListener("blur", onBlur);

    if (navigation.isFocused?.()) onFocus();

    return () => {
      stop();
      unsubFocus();
      unsubBlur();
    };
  }, [
    navigation,
    businessId,
    userId,
    route?.params?.user_id,
    ownerKind,
    loadBusinessFromBackend,
    loadFromBackend,
    fetchKpis,
    fetchSalesToday,
  ]);

  const loadMenusFromStorage = useCallback(async (bid, kind) => {
    if (!bid) return;
    try {
      const raw = await SecureStore.getItemAsync(menusKey(bid, kind));
      const arr = raw ? JSON.parse(raw) : [];
      setMenus(Array.isArray(arr) ? arr : []);
    } catch {
      setMenus([]);
    }
  }, []);

  useEffect(() => {
    if (businessId) loadMenusFromStorage(businessId, ownerKind);
  }, [businessId, ownerKind, loadMenusFromStorage]);

  const belongsToCurrentContext = useCallback(
    (incoming = {}) => {
      const incKind = normalizeOwnerType(incoming.owner_type ?? incoming.kind);
      const incBid = incoming.business_id ?? incoming.businessId ?? null;
      if (incoming.hasOwnProperty("owner_type") || incoming.hasOwnProperty("kind")) {
        if (incKind && incKind !== ownerKind) return false;
      }
      if (incoming.hasOwnProperty("business_id") || incoming.hasOwnProperty("businessId")) {
        if (incBid && String(incBid) !== String(businessId)) return false;
      }
      return true;
    },
    [ownerKind, businessId]
  );

  // ✅ reliable "open tab" router
  const openTab = useCallback(
    (key, params = {}) => {
      const target = String(key || "").trim();
      if (!target) return;

      const norm =
        target === "Payouts" || target === "Payout" || target === "PayoutTab"
          ? "PayoutTab"
          : target;

      if (norm === "PayoutTab") setActiveTab("PayoutTab");
      else if (norm === "Promos") setActiveTab("Promos");
      else if (norm === "Orders") setActiveTab("Orders");
      else if (norm === "Sales") setActiveTab("Sales");
      else if (norm === "Activities" || norm === "Notifications") {
        notifOpenAtRef.current = Date.now(); // mark open time to ignore transient 0
        setActiveTab("Notifications");
      }
      else if (norm === "Home") setActiveTab("Home");
      else if (norm === "AddMenuTab" || norm === "Add Menu") setActiveTab("Add Menu");
      else setActiveTab(target);

      if (params.user_id || params.userId) setUserId(String(params.user_id || params.userId));

      if (params.businessId || params.business_id)
        setBusinessId(String(params.businessId || params.business_id));

      if (params.business_name) setMerchantName(String(params.business_name));
      if (params.business_logo && belongsToCurrentContext(params)) {
        applyHeaderIfChanged({ business_logo: params.business_logo });
      }

      // ✅ accept both owner_type + ownerType
      if (
        (params.owner_type != null && String(params.owner_type).trim() !== "") ||
        (params.ownerType != null && String(params.ownerType).trim() !== "")
      ) {
        maybeApplyKind(params.owner_type ?? params.ownerType, setOwnerType);
      }

      if (params.authContext) setAuthContext(params.authContext);
      if (params.auth_token && !authToken) setAuthToken(String(params.auth_token));

      if (params.delivery_option || params.deliveryOption) {
        setDeliveryOption(String(params.delivery_option || params.deliveryOption).toUpperCase());
      }
    },
    [belongsToCurrentContext, applyHeaderIfChanged, authToken]
  );

  useEffect(() => {
    const sub1 = DeviceEventEmitter.addListener("merchant-updated", async () => {
      await loadFromStore();
      const uid = route?.params?.user_id || (await SecureStore.getItemAsync(KEY_USER_ID)) || userId;
      const bid = (await SecureStore.getItemAsync(KEY_BUSINESS_ID)) || businessId;

      if (uid) await loadFromBackend(String(uid));
      if (bid) {
        await loadBusinessFromBackend(String(bid));
        await fetchKpis(String(bid), ownerKind);
        await fetchSalesToday(String(bid));
      }
    });

    const sub2 = DeviceEventEmitter.addListener("menus-updated", async (payload) => {
      const bid = payload?.businessId || payload?.business_id || businessId;
      const kind = normalizeOwnerType(payload?.owner_type || payload?.ownerType || ownerKind);
      if (bid) await loadMenusFromStorage(bid, kind);
    });

    const sub3 = DeviceEventEmitter.addListener("open-tab", async (payload) => {
      const key = payload?.key;
      const params = payload?.params || {};
      if (key) openTab(key, params);

      try {
        await SecureStore.setItemAsync(KEY_LAST_CTX, JSON.stringify(params));
      } catch { }

      const bid = params.businessId || params.business_id || businessId;
      const kind = normalizeOwnerType(params.owner_type ?? params.ownerType ?? ownerKind);
      if (bid) {
        await fetchKpis(String(bid), kind);
        await fetchSalesToday(String(bid));
      }
    });

    const sub4 = DeviceEventEmitter.addListener("profile-updated", async (payload) => {
      try {
        if (payload?.profile_image) applyHeaderIfChanged({ profile_image: payload.profile_image });
        if (payload?.business_logo && belongsToCurrentContext(payload)) {
          applyHeaderIfChanged({ business_logo: payload.business_logo });
        }
        if (payload?.business_name) applyHeaderIfChanged({ business_name: payload.business_name });
        if (payload?.business_address || payload?.address || payload?.location) {
          applyHeaderIfChanged({
            business_address: payload?.business_address ?? payload?.address ?? payload?.location,
          });
        }
        if (payload?.owner_type || payload?.ownerType) {
          maybeApplyKind(payload.owner_type ?? payload.ownerType, setOwnerType);
        }
        if (payload?.delivery_option || payload?.deliveryOption) {
          setDeliveryOption(String(payload.delivery_option || payload.deliveryOption).toUpperCase());
        }
      } catch { }

      const uid = route?.params?.user_id || (await SecureStore.getItemAsync(KEY_USER_ID)) || userId;
      const bid = (await SecureStore.getItemAsync(KEY_BUSINESS_ID)) || businessId;

      if (uid) await loadFromBackend(String(uid));
      if (bid) {
        await loadBusinessFromBackend(String(bid));
        await fetchKpis(String(bid), ownerKind);
        await fetchSalesToday(String(bid));
      }
    });

    const sub5 = DeviceEventEmitter.addListener("order-updated", async () => {
      const bid = (await SecureStore.getItemAsync(KEY_BUSINESS_ID)) || businessId;
      if (bid) {
        await fetchKpis(String(bid), ownerKind);
        await fetchSalesToday(String(bid));
      }
    });

    const sub6 = DeviceEventEmitter.addListener("order-placed", async () => {
      const bid = (await SecureStore.getItemAsync(KEY_BUSINESS_ID)) || businessId;
      if (bid) {
        await fetchKpis(String(bid), ownerKind);
        await fetchSalesToday(String(bid));
      }
    });

    return () => {
      sub1.remove();
      sub2.remove();
      sub3.remove();
      sub4.remove();
      sub5.remove();
      sub6.remove();
    };
  }, [
    businessId,
    ownerKind,
    loadMenusFromStorage,
    loadFromBackend,
    loadFromStore,
    route?.params?.user_id,
    userId,
    belongsToCurrentContext,
    loadBusinessFromBackend,
    applyHeaderIfChanged,
    fetchKpis,
    fetchSalesToday,
    openTab,
  ]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);

    await loadFromStore();

    const uid = route?.params?.user_id || (await SecureStore.getItemAsync(KEY_USER_ID)) || userId;
    const bid = (await SecureStore.getItemAsync(KEY_BUSINESS_ID)) || businessId;

    if (uid) await loadFromBackend(String(uid));
    if (bid) await loadMenusFromStorage(bid, ownerKind);
    if (bid) await loadBusinessFromBackend(String(bid));
    if (bid) {
      await fetchKpis(String(bid), ownerKind);
      await fetchSalesToday(String(bid));
    }

    setRefreshing(false);
    setLogoVersion((v) => v + 1);
  }, [
    userId,
    route?.params?.user_id,
    businessId,
    ownerKind,
    loadMenusFromStorage,
    loadFromBackend,
    loadFromStore,
    loadBusinessFromBackend,
    fetchKpis,
    fetchSalesToday,
  ]);

  useEffect(() => {
    if (activeTab !== "Home" && showWelcome) setShowWelcome(false);
  }, [activeTab, showWelcome]);

  useEffect(() => {
    const onBack = () => {
      if (activeTab !== "Home") {
        setActiveTab("Home");
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener("hardwareBackPress", onBack);
    return () => sub.remove();
  }, [activeTab]);

  useEffect(() => {
    const p = route?.params;
    if (!p?.openTab) return;

    openTab(String(p.openTab), p);
    navigation.setParams({ openTab: undefined, nonce: undefined });
  }, [
    route?.params?.nonce,
    route?.params?.openTab,
    route?.params?.businessId,
    route?.params?.business_id,
    route?.params?.business_name,
    route?.params?.business_logo,
    route?.params?.owner_type,
    route?.params?.ownerType,
    route?.params?.authContext,
    route?.params?.auth_token,
    route?.params?.delivery_option,
    route?.params?.deliveryOption,
    navigation,
    openTab,
  ]);

  const NAV_ITEMS = useMemo(
    () => [
      { key: "Home", label: "Home", icon: "home-outline" },
      { key: "Orders", label: "Orders", icon: "receipt-outline" },
      { key: "Add Menu", label: isFood ? "Add Menu" : "Add Item", icon: "add" },
      { key: "Notifications", label: "Activities", icon: "time-outline", badge: unreadActivities },
      { key: "Sales", label: "Sales", icon: "stats-chart-outline" },
    ],
    [isFood, unreadActivities]
  );

  const AddTabComponent = isFood ? FoodAddMenuTab : MartAddItemTab;

  const kpiCtxParams = useCallback(
    () => ({
      user_id: userId,
      userId,
      business_id: businessId,
      businessId,
      owner_type: ownerKind,
      ownerType: ownerKind,
      business_name: merchantName,
      business_logo: merchantLogo,
      business_address: businessAddress,
      business_license: businessLicense,
      authContext,
      auth_token: authToken,
      delivery_option: deliveryOption,
      deliveryOption,
    }),
    [
      userId,
      businessId,
      ownerKind,
      merchantName,
      merchantLogo,
      businessAddress,
      businessLicense,
      authContext,
      authToken,
      deliveryOption,
    ]
  );

  const onQuickAction = useCallback(
    (key, extra = {}) => {
      openTab(key, { ...kpiCtxParams(), ...(extra || {}) });
    },
    [openTab, kpiCtxParams]
  );

  const onPressSalesKpi = useCallback(() => {
    openTab("Sales", kpiCtxParams());
  }, [openTab, kpiCtxParams]);

  const onPressOrdersKpi = useCallback(() => {
    openTab("Orders", kpiCtxParams());
  }, [openTab, kpiCtxParams]);

  const onPressMessages = useCallback(() => {
    const ctx = kpiCtxParams();
    navigation.navigate("MessageScreen", {
      ...ctx,
      business_id: ctx?.business_id ?? businessId,
      businessId: ctx?.businessId ?? businessId,
      serviceConfig,
    });
  }, [navigation, kpiCtxParams, serviceConfig, businessId]);

  const contentPaddingBottom = bottomBarHeight + (activeTab === "Home" ? 20 : 0);

  // ✅ HIDE message FAB on OrdersTab and SalesAnalyticsScreen
  const showMessageFab = activeTab !== "Orders" && activeTab !== "Sales";

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right"]}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      <View style={[styles.tabWrap, { paddingBottom: contentPaddingBottom }]}>
        <HeaderBar
          isTablet={isTablet}
          insets={insets}
          avatarSize={avatarSize}
          showWelcome={showWelcome}
          activeTab={activeTab}
          userId={userId}
          businessId={businessId}
          merchantName={merchantName}
          merchantLogo={merchantLogo}
          profileAvatar={profileAvatar}
          businessAddress={businessAddress}
          businessLicense={businessLicense}
          ownerType={ownerKind}
          authContext={authContext}
          authToken={authToken}
          serviceConfig={serviceConfig}
          deliveryOption={deliveryOption}
          logoVersion={logoVersion}
          addBuster={addBuster}
        />

        {activeTab === "Home" && (
          <HomeTab
            isTablet={isTablet}
            kpis={kpis}
            money={money}
            onPressNav={openTab}
            onPressSalesKpi={onPressSalesKpi}
            onPressOrdersKpi={onPressOrdersKpi}
            businessId={businessId}
            menus={menus}
            context={authContext}
            userId={userId}
            ownerType={ownerKind}
            businessName={merchantName}
            logoUrl={merchantLogo}
            address={businessAddress}
            businessLicense={businessLicense}
            serviceConfig={serviceConfig}
            delivery_option={deliveryOption}
            onRefresh={onRefresh}
            refreshing={refreshing}
            onQuickAction={onQuickAction}
          />
        )}

        {activeTab === "Promos" && (
          <PromosTab
            isTablet={isTablet}
            businessId={businessId}
            context={authContext}
            ownerType={ownerKind}
            serviceConfig={serviceConfig}
            delivery_option={deliveryOption}
          />
        )}

        {activeTab === "Orders" && (
          <OrdersTab
            key={`orders_${businessId}_${ownerKind}`}
            isTablet={isTablet}
            money={money}
            businessId={businessId}
            ownerType={ownerKind}
            serviceConfig={serviceConfig}
            delivery_option={deliveryOption}
          />
        )}

        {activeTab === "Add Menu" && (
          <AddTabComponent
            key={`add_${businessId}_${ownerKind}`} // ✅ ensures correct tab swaps food<->mart
            isTablet={isTablet}
            businessId={businessId}
            ownerType={ownerKind}
            businessName={merchantName}
            logoUrl={merchantLogo}
            address={businessAddress}
            userId={userId}
            context={authContext}
            serviceConfig={serviceConfig}
            delivery_option={deliveryOption}
          />
        )}

        {activeTab === "Notifications" && (
          <NotificationsTab
            isTablet={isTablet}
            businessId={businessId}
            context={authContext}
            ownerType={ownerKind}
            serviceConfig={serviceConfig}
            delivery_option={deliveryOption}
          />
        )}

        {activeTab === "PayoutTab" && (
          <PayoutTab
            isTablet={isTablet}
            user_id={userId}
            userId={userId}
            businessId={businessId}
            ownerType={ownerKind}
            context={authContext}
            serviceConfig={serviceConfig}
            delivery_option={deliveryOption}
          />
        )}

        {activeTab === "Sales" && (
          <SalesAnalyticsScreen
            business_id={businessId}
            businessId={businessId}
            owner_type={ownerKind}
            ownerType={ownerKind}
            user_id={userId}
            authContext={authContext}
            auth_token={authToken}
          />
        )}
      </View>

      {showMessageFab && (
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={onPressMessages}
          style={[
            styles.messageFab,
            {
              bottom: bottomBarHeight + 16,
              right: 16,
            },
          ]}
        >
          <Ionicons name="chatbubble-ellipses" size={22} color="#fff" />
        </TouchableOpacity>
      )}

      <MerchantBottomBar
        items={NAV_ITEMS}
        activeKey={activeTab}
        onChange={openTab}
        isTablet={isTablet}
      />
    </SafeAreaView>
  );
}

/* ───────────────────────── Styles ───────────────────────── */
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#00b14f" },
  container: { backgroundColor: "#f6f7f8" },
  profileCircle: { borderRadius: 9999, backgroundColor: "#fff" },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  inlineRow: { flexDirection: "row", alignItems: "center" },
  hi: {
    fontSize: 20,
    color: "#e8fff6",
    opacity: 0.9,
    fontWeight: "900",
    marginBottom: 2,
  },
  merchantName: { color: "white", fontWeight: "700" },
  avatar: { borderRadius: 12, backgroundColor: "#fff" },
  addressText: { color: "#2d2d2d", fontSize: 13, fontWeight: "700", maxWidth: 260 },
  tabWrap: { flex: 1, backgroundColor: "#f6f7f8" },
  fab: {
    position: "absolute",
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#00b14f",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  fabText: { color: "#fff", fontWeight: "700" },
  addressChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: "100%",
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },

  // ✅ Floating message bubble
  messageFab: {
    position: "absolute",
    width: 54,
    height: 54,
    borderRadius: 999,
    backgroundColor: "#00b14f",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
    zIndex: 999,
  },
});
