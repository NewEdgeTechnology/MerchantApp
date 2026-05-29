// AccountSettings.js — keeps ALL your existing functions and logout flow,
// ✅ plus: deletes EVERYTHING from SecureStore (best-effort) + clears AsyncStorage

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ScrollView,
  Image as RNImage,
  Alert,
  DeviceEventEmitter,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useNavigation, useRoute } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
// ✅ Use legacy API to avoid deprecation warnings in SDK 54+
import * as FileSystem from "expo-file-system/legacy";
import { BRAND, FONT, RADIUS, SHADOW } from "../styles/tabdey_brand";

import {
  PROFILE_ENDPOINT,
  PROFILE_IMAGE as PROFILE_IMAGE_ENDPOINT,
  LOGOUT_ENDPOINT as ENV_LOGOUT_ENDPOINT,
} from "@env";

const { width } = Dimensions.get("window");
const KEY_MERCHANT_LOGIN = "merchant_login";
const DEFAULT_AVATAR =
  "https://images.unsplash.com/photo-1612198182421-3f5dff0c9b40?q=80&w=400&auto=format&fit=crop";

const DEFAULT_DEV_ORIGIN = Platform.select({
  android: "http://10.0.2.2:3000",
  ios: "http://localhost:3000",
  default: "http://localhost:3000",
});
const isLocalOrData = (u = "") =>
  /^data:image\//i.test(u) || /^file:\/\//i.test(u) || /^content:\/\//i.test(u);

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

function withVersion(url, version) {
  if (!url || !version) return url;
  try {
    const u = new URL(url);
    u.searchParams.set("v", String(version));
    return u.toString();
  } catch {
    return url.includes("?") ? `${url}&v=${version}` : `${url}?v=${version}`;
  }
}

const makeAbsolute = (maybeRelative, base = PROFILE_IMAGE_ENDPOINT) => {
  if (!maybeRelative) return null;
  const s = String(maybeRelative);
  if (/^https?:\/\//i.test(s)) return s;
  const b = (base || "").replace(/\/+$/, "");
  const p = s.startsWith("/") ? s.slice(1) : s;
  return `${b}/${p}`;
};

async function fetchJSON(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {}
    if (!res.ok) {
      const msg =
        (json && (json.message || json.error)) || text || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return json;
  } finally {
    clearTimeout(tid);
  }
}

const SECURE_KEYS = [
  KEY_MERCHANT_LOGIN,
  "auth_token",
  "refresh_token",
  "user_profile",
  "session",
];

/* ---------------- NEW: best-effort wipe everything ---------------- */

/**
 * Tries to list all keys (works in dev client / bare). If not supported,
 * wipes a large known-key set + registry key (if you use it) + anything in SECURE_KEYS.
 */
async function wipeAllSecureStore() {
  const known = new Set([
    ...SECURE_KEYS,
    // your current app keys
    "auth_token",
    "refresh_token_v1",
    "refresh_token",
    "access_token_time",
    "refresh_token_time",
    "merchant_login",
    "user_id_v1",
    "business_id_v1",
    "business_id",
    "businessId",
    "saved_email_v2",
    "saved_password",
    "last_login_email_v2",
    "last_login_username",
    "saved_username",
    "security_biometric_login",
    "biometric_enabled_v1",
    "__securestore_registry__", // if you implemented registry fallback
  ]);

  try {
    if (typeof SecureStore.getAllKeysAsync === "function") {
      const keys = await SecureStore.getAllKeysAsync();
      (keys || []).forEach((k) => known.add(k));
      console.log("🔐 Logout: SecureStore keys discovered:", keys);
    } else {
      console.log(
        "🔐 Logout: SecureStore.getAllKeysAsync not available, wiping known keys only.",
      );
    }
  } catch (e) {
    console.warn("🔐 Logout: getAllKeysAsync failed:", e);
  }

  const keysArr = Array.from(known).filter(Boolean);

  console.log("🧹 Logout: wiping SecureStore keys count:", keysArr.length);

  await Promise.allSettled(
    keysArr.map(async (k) => {
      try {
        await SecureStore.deleteItemAsync(String(k));
      } catch {}
    }),
  );

  // extra: verify (best effort)
  try {
    const leftUserId = await SecureStore.getItemAsync("user_id_v1");
    const leftToken = await SecureStore.getItemAsync("auth_token");
    console.log("✅ Logout: post-wipe check:", {
      user_id_v1: leftUserId,
      auth_token: leftToken ? "<<still exists>>" : null,
    });
  } catch {}
}

async function clearCredentialStores() {
  // ✅ keep your existing behavior
  try {
    await Promise.allSettled(
      SECURE_KEYS.map((k) => SecureStore.deleteItemAsync(k)),
    );
  } catch {}
  try {
    await AsyncStorage.clear();
  } catch {}
}

async function clearImageCacheAsync() {
  try {
    const dirs = [
      `${FileSystem.cacheDirectory}ImagePicker/`,
      `${FileSystem.cacheDirectory}Image/`,
      `${FileSystem.cacheDirectory}ExpoImage/`,
    ];
    for (const dir of dirs) {
      const info = await FileSystem.getInfoAsync(dir);
      if (info.exists) await FileSystem.deleteAsync(dir, { idempotent: true });
    }
  } catch {}
}

function resetLocalState(setters) {
  const { setName, setImageUri, setImgVersion, setBiz, setBusinessLicense } =
    setters;
  setName("Pema Chozom");
  setImageUri(null);
  setImgVersion(null);
  setBiz({
    business_name: "",
    business_license_number: "",
    business_logo: "",
    delivery_option: "",
    address: "",
    latitude: "",
    longitude: "",
  });
  setBusinessLicense("");
  DeviceEventEmitter.emit("logged-out");
}

function getExistingMerchantSocket() {
  try {
    const mod = require("../realtime/merchantSocket");
    return (
      mod?.getMerchantSocket?.() ||
      mod?.socket ||
      global?.merchantSocket ||
      null
    );
  } catch {
    return global?.merchantSocket || null;
  }
}

async function disconnectSocketGracefully({ userId, businessId }) {
  try {
    const sock = getExistingMerchantSocket();
    if (!sock) return;

    if (sock?.connected) {
      try {
        sock.emit?.("merchant:logout", { userId, businessId });
        await new Promise((r) => setTimeout(r, 120));
      } catch {}
    }

    try {
      sock.removeAllListeners?.();
    } catch {}
    try {
      sock.disconnect?.();
    } catch {}
    try {
      sock.close?.();
    } catch {}
  } catch {
  } finally {
    try {
      if (global?.merchantSocket) global.merchantSocket = null;
    } catch {}
  }
}

function resolveLogoutUrlFromEnv(userId) {
  const raw = (ENV_LOGOUT_ENDPOINT || "").trim();
  if (!raw) return null;
  const id = encodeURIComponent(String(userId ?? "").trim());
  if (!id) return null;
  return raw.replace("{user_id}", id);
}

async function attemptServerLogout({ explicitEndpoint, userId }) {
  const endpoint = explicitEndpoint || resolveLogoutUrlFromEnv(userId) || null;
  if (!endpoint) return;

  const refresh =
    (await SecureStore.getItemAsync("refresh_token_v1")) ||
    (await SecureStore.getItemAsync("refresh_token"));

  const access = await SecureStore.getItemAsync("auth_token");

  const baseHeaders = { "Content-Type": "application/json" };
  if (access) baseHeaders["Authorization"] = `Bearer ${access}`;

  try {
    await fetchJSON(endpoint, {
      method: "POST",
      headers: baseHeaders,
      body: JSON.stringify({ refresh_token: refresh || undefined }),
    });
  } catch {
    try {
      await fetchJSON(endpoint, { method: "GET", headers: baseHeaders });
    } catch {}
  }
}
const SettingsRow = ({ icon, title, onPress, last = false }) => (
  <TouchableOpacity
    style={[styles.settingsRow, last && styles.settingsRowLast]}
    onPress={onPress}
    activeOpacity={0.8}
  >
    <View style={styles.rowIcon}>
      <Ionicons name={icon} size={20} color={BRAND.purple} />
    </View>

    <Text style={styles.rowTitle}>{title}</Text>

    <Ionicons name="chevron-forward" size={21} color={BRAND.grey} />
  </TouchableOpacity>
);

const AccountSettings = () => {
  const route = useRoute();
  const navigation = useNavigation();

  const [name, setName] = useState("Pema Chozom");

  const [imageUri, setImageUri] = useState(null);
  const [imgError, setImgError] = useState(null);
  const [imgVersion, setImgVersion] = useState(null);

  const [userId, setUserId] = useState(
    route?.params?.user_id ? String(route.params.user_id) : "",
  );
  const [businessId, setBusinessId] = useState(
    route?.params?.business_id ? String(route.params.business_id) : "",
  );
  const [authContext, setAuthContext] = useState(
    route?.params?.authContext || null,
  );

  const [biz, setBiz] = useState({
    business_name: route?.params?.business_name || "",
    business_license_number: "",
    business_logo: route?.params?.business_logo || "",
    delivery_option: "",
    address: route?.params?.business_address || "",
    latitude: "",
    longitude: "",
  });

  const [businessLicense, setBusinessLicense] = useState(
    route?.params?.business_license || "",
  );

  const buildProfileUrl = useCallback((uid) => {
    if (!uid || !PROFILE_ENDPOINT) return "";
    const base = normalizeHost((PROFILE_ENDPOINT || "").trim()).replace(
      /\/+$/,
      "",
    );
    return `${base}/${encodeURIComponent(String(uid))}`;
  }, []);

  const setAvatarFrom = useCallback(async (raw, version = null) => {
    if (!raw) {
      setImageUri(DEFAULT_AVATAR);
      setImgError(null);
      return;
    }
    try {
      const abs = isLocalOrData(raw)
        ? raw
        : makeAbsolute(String(raw), PROFILE_IMAGE_ENDPOINT);
      const final = isLocalOrData(abs) ? abs : withVersion(abs, version);
      setImageUri(final || DEFAULT_AVATAR);
      setImgError(null);
      if (version) setImgVersion(String(version));
    } catch {
      setImageUri(DEFAULT_AVATAR);
      setImgError(null);
    }
  }, []);

  useEffect(() => {
    if (imageUri && /^https?:\/\//i.test(imageUri)) {
      RNImage.prefetch(imageUri).catch(() => {});
    }
  }, [imageUri]);

  const loadFromStore = useCallback(async () => {
    try {
      const raw = await SecureStore.getItemAsync(KEY_MERCHANT_LOGIN);
      if (!raw) return;
      const blob = JSON.parse(raw);

      let token =
        (blob?.token && typeof blob.token === "string" && blob.token) ||
        (blob?.token?.access_token ?? null);

      if (!token) {
        const stored = await SecureStore.getItemAsync("auth_token");
        if (stored && String(stored).trim()) token = String(stored).trim();
      }

      setAuthContext((prev) => ({
        ...(prev || {}),
        token: token || null,
        raw: blob,
        user: blob.user || blob,
      }));

      const idCandidates = [
        blob?.user?.user_id,
        blob?.user?.id,
        blob?.user_id,
        blob?.id,
        blob?.merchant?.user_id,
        blob?.merchant?.id,
      ].filter((v) => v !== undefined && v !== null && v !== "");
      if (!userId && idCandidates.length) setUserId(String(idCandidates[0]));

      const bidCandidate =
        blob?.business_id ||
        blob?.user?.business_id ||
        blob?.merchant?.business_id ||
        blob?.user?.id ||
        blob?.id ||
        null;
      if (!businessId && bidCandidate) setBusinessId(String(bidCandidate));

      const nameCandidate =
        blob?.display_name ||
        blob?.username ||
        blob?.user_name ||
        blob?.user?.display_name ||
        blob?.user?.user_name ||
        blob?.user?.name;
      if (nameCandidate) setName(String(nameCandidate));

      const imgCandidate =
        blob?.profile_image ||
        blob?.user?.profile_image ||
        blob?.avatar ||
        blob?.user?.avatar ||
        blob?.business_logo ||
        blob?.user?.business_logo;

      const vCandidate =
        blob?.profile_image_version ||
        blob?.user?.profile_image_version ||
        blob?.user?.updated_at ||
        blob?.updated_at ||
        null;

      if (imgCandidate) await setAvatarFrom(imgCandidate, vCandidate);

      const bizSource =
        blob?.merchant_business_details ||
        blob?.business ||
        blob?.merchant ||
        blob?.business_details ||
        {};
      setBiz((prev) => ({
        ...prev,
        business_name: bizSource?.business_name ?? prev.business_name,
        business_license_number: bizSource?.business_license_number ?? "",
        business_logo: bizSource?.business_logo ?? prev.business_logo,
        delivery_option: bizSource?.delivery_option ?? "",
        address: bizSource?.address ?? prev.address,
        latitude: bizSource?.latitude ?? "",
        longitude: bizSource?.longitude ?? "",
      }));

      const licenseCandidate =
        blob?.business_license ||
        blob?.business_license_number ||
        blob?.merchant_business_details?.business_license_number ||
        blob?.merchant?.business_license_number ||
        "";
      if (licenseCandidate) setBusinessLicense(String(licenseCandidate));
    } catch {}
  }, [userId, businessId, setAvatarFrom]);

  const loadFromBackend = useCallback(
    async (uid) => {
      const url = buildProfileUrl(uid);
      if (!url) return;
      try {
        const data = await fetchJSON(url, { method: "GET" });

        if (data?.user_name) setName(String(data.user_name));

        const version =
          data?.profile_image_version ||
          data?.updated_at ||
          data?.user_updated_at ||
          null;

        if (data?.profile_image) {
          await setAvatarFrom(String(data.profile_image), version);
        }

        const bid = data?.business_id ?? data?.id ?? null;
        if (bid && !businessId) setBusinessId(String(bid));

        const license =
          data?.business_license || data?.business_license_number || "";
        if (license) setBusinessLicense(String(license));

        const mergedBiz = {
          business_name: data?.business_name ?? biz.business_name,
          business_license_number:
            data?.business_license_number ?? biz.business_license_number,
          business_logo: data?.business_logo ?? biz.business_logo,
          delivery_option: data?.delivery_option ?? biz.delivery_option,
          address: data?.address ?? biz.address,
          latitude: data?.latitude ?? biz.latitude,
          longitude: data?.longitude ?? biz.longitude,
        };
        setBiz(mergedBiz);

        try {
          const raw = await SecureStore.getItemAsync(KEY_MERCHANT_LOGIN);
          let blob = {};
          try {
            blob = raw ? JSON.parse(raw) : {};
          } catch {}
          const merged = {
            ...blob,
            user_id: data?.user_id ?? blob.user_id,
            user_name: data?.user_name ?? blob.user_name,
            profile_image: data?.profile_image ?? blob.profile_image,
            profile_image_version: version ?? blob.profile_image_version,
            updated_at: data?.updated_at ?? blob.updated_at,
            business_id: bid ?? blob?.business_id,
            user: {
              ...(blob.user || {}),
              user_id: data?.user_id ?? blob?.user?.user_id,
              user_name: data?.user_name ?? blob?.user?.user_name,
              display_name: data?.user_name ?? blob?.user?.display_name,
              profile_image: data?.profile_image ?? blob?.user?.profile_image,
              profile_image_version:
                version ?? blob?.user?.profile_image_version,
              business_id: bid ?? blob?.user?.business_id,
              updated_at: data?.user_updated_at ?? blob?.user?.updated_at,
            },
            merchant_business_details: {
              ...(blob.merchant_business_details || {}),
              business_name: mergedBiz.business_name,
              business_license_number: mergedBiz.business_license_number,
              business_logo: mergedBiz.business_logo,
              delivery_option: mergedBiz.delivery_option,
              address: mergedBiz.address,
              latitude: mergedBiz.latitude,
              longitude: mergedBiz.longitude,
            },
          };
          await SecureStore.setItemAsync(
            KEY_MERCHANT_LOGIN,
            JSON.stringify(merged),
          );
        } catch {}
      } catch {}
    },
    [buildProfileUrl, biz, businessId, setAvatarFrom],
  );

  useEffect(() => {
    if (route?.params?.authContext) {
      setAuthContext((prev) => ({
        ...(prev || {}),
        ...route.params.authContext,
      }));
    }
  }, [route?.params?.authContext]);

  useEffect(() => {
    (async () => {
      if (!userId) await loadFromStore();
      if (userId) await loadFromBackend(userId);
    })();
  }, [userId, loadFromStore, loadFromBackend]);

  useEffect(() => {
    const unsub = navigation.addListener("focus", async () => {
      await loadFromStore();
      if (userId) await loadFromBackend(userId);
    });
    return unsub;
  }, [navigation, userId, loadFromStore, loadFromBackend]);

  useEffect(() => {
    const subA = DeviceEventEmitter.addListener(
      "profile-updated",
      async (payload) => {
        if (payload?.name) setName(String(payload.name));
        const v = payload?.profile_image_version || imgVersion || null;
        if (payload?.profile_image)
          await setAvatarFrom(payload.profile_image, v);
        if (userId) await loadFromBackend(userId);
      },
    );
    const subB = DeviceEventEmitter.addListener(
      "business-updated",
      async (payload) => {
        if (payload && typeof payload === "object")
          setBiz((prev) => ({ ...prev, ...payload }));
        if (userId) await loadFromBackend(userId);
      },
    );
    return () => {
      subA.remove();
      subB.remove();
    };
  }, [userId, loadFromBackend, setAvatarFrom, imgVersion]);

  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Permission required",
        "We need permission to access your gallery.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (!result.cancelled && !result.canceled) {
      const uri = result?.assets?.[0]?.uri || result?.uri;
      if (uri) await setAvatarFrom(uri, null);
    }
  };

  const goToPersonalInformation = () => {
    navigation.navigate("PersonalInformation", {
      user_id: userId,
      business_id: businessId,
      username: name,
      business_name: biz.business_name || name,
      business_logo: biz.business_logo || imageUri || "",
      business_license: businessLicense,
      profile_image_url: imageUri || "",
      authContext,
    });
  };
  const goToBusinessDetails = () => {
    navigation.navigate("ProfileBusinessDetails", {
      user_id: userId,
      business_id: businessId,
      ...biz,
      business_license: businessLicense,
      authContext,
    });
  };

  const goToFeedback = useCallback(async () => {
    const rawBid = route?.params?.business_id ?? businessId;
    const bidStr = String(rawBid ?? "").trim();
    const bidNum = /^\d+$/.test(bidStr) ? parseInt(bidStr, 10) : NaN;

    if (!Number.isInteger(bidNum) || bidNum <= 0) {
      Alert.alert("Feedback", "Business ID is missing or invalid.");
      return;
    }

    let ownerType =
      route?.params?.owner_type ||
      authContext?.owner_type ||
      authContext?.user?.owner_type ||
      authContext?.raw?.owner_type ||
      null;

    if (!ownerType) {
      try {
        const raw = await SecureStore.getItemAsync(KEY_MERCHANT_LOGIN);
        const blob = raw ? JSON.parse(raw) : null;
        ownerType =
          blob?.owner_type ||
          blob?.user?.owner_type ||
          blob?.merchant?.owner_type ||
          null;
      } catch {}
    }

    navigation.navigate("FeedbackScreen", {
      business_id: bidNum,
      business_name: biz?.business_name || name || "",
      owner_type: ownerType,
      authContext,
      auth_token: authContext?.token || null,
    });
  }, [
    navigation,
    route?.params?.business_id,
    route?.params?.owner_type,
    businessId,
    biz?.business_name,
    name,
    authContext,
  ]);

  const handleLogoutNow = useCallback(async () => {
    console.log("🚪 Logout: started");

    try {
      if (authContext?.onBeforeLogout) {
        try {
          await authContext.onBeforeLogout();
        } catch {}
      }

      const explicitEndpoint =
        authContext?.logoutEndpoint || route?.params?.logoutEndpoint || null;

      // ✅ keep your existing server logout / socket disconnect / clears
      console.log("🌐 Logout: attempt server logout");
      await attemptServerLogout({ explicitEndpoint, userId });

      console.log("🔌 Logout: disconnect merchant socket");
      await disconnectSocketGracefully({ userId, businessId });

      console.log("🧹 Logout: clear known credential stores (existing)");
      await clearCredentialStores();

      // ✅ NEW: wipe everything from SecureStore too
      console.log("🧨 Logout: wipe ALL SecureStore (best-effort)");
      await wipeAllSecureStore();

      console.log("🧽 Logout: clear image caches");
      await clearImageCacheAsync();

      console.log("♻️ Logout: reset local state + emit logged-out");
      resetLocalState({
        setName,
        setImageUri,
        setImgVersion,
        setBiz,
        setBusinessLicense,
      });

      if (authContext?.onAfterLogout) {
        try {
          await authContext.onAfterLogout();
        } catch {}
      }

      console.log("✅ Logout: finished");
    } finally {
      navigation.reset({ index: 0, routes: [{ name: "MobileLoginScreen" }] });
    }
  }, [authContext, route?.params, userId, businessId, navigation]);

  const logOut = useCallback(() => {
    Alert.alert("Log out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: handleLogoutNow },
    ]);
  }, [handleLogoutNow]);

  return (
    <SafeAreaView
      style={styles.safe}
      edges={["top", "left", "right", "bottom"]}
    >
      <View style={styles.topGlow} />
      <View style={[styles.headerBar]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={22} color={BRAND.black} />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Account Settings</Text>

        <View style={styles.backBtnPlaceholder} />
      </View>
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.profileCard}>
          <TouchableOpacity
            style={styles.profileIconContainer}
            activeOpacity={0.8}
            onPress={goToPersonalInformation}
            onLongPress={pickImage}
          >
            {imageUri ? (
              <RNImage
                source={{ uri: imageUri }}
                style={styles.profileImage}
                onError={() => {
                  setImageUri(DEFAULT_AVATAR);
                  setImgError(null);
                }}
              />
            ) : (
              <Ionicons
                name="person-circle-outline"
                size={82}
                color={BRAND.purple}
              />
            )}

            <View style={styles.cameraBadge}>
              <Ionicons name="camera-outline" size={15} color={BRAND.white} />
            </View>
          </TouchableOpacity>

          <View style={styles.profileInfo}>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            <Text style={styles.subText} numberOfLines={1}>
              {biz.business_name || "TabDey Merchant"}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.editButton}
            onPress={goToPersonalInformation}
          >
            <Ionicons name="create-outline" size={18} color={BRAND.white} />
          </TouchableOpacity>
        </View>

        <View style={styles.menuCard}>
          <SettingsRow
            icon="person-outline"
            title="Personal Information"
            onPress={goToPersonalInformation}
          />

          <SettingsRow
            icon="storefront-outline"
            title="Business Details"
            onPress={goToBusinessDetails}
          />

          <SettingsRow
            icon="lock-closed-outline"
            title="Password Management"
            onPress={() =>
              navigation.navigate("PasswordManagement", { authContext })
            }
          />

          <SettingsRow
            icon="wallet-outline"
            title="Wallet"
            onPress={() => navigation.navigate("Wallet", { authContext })}
          />

          <SettingsRow
            icon="star-outline"
            title="Feedback and Rating"
            onPress={goToFeedback}
            last
          />
        </View>

        <TouchableOpacity
          style={styles.logoutButton}
          onPress={logOut}
          activeOpacity={0.85}
        >
          <Ionicons name="log-out-outline" size={21} color={BRAND.red} />
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#FBF7FF",
  }, 
  topGlow: {
    position: "absolute",
    top: -120,
    right: -90,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: BRAND.purpleLight,
    opacity: 0.38,
  },

  scrollContainer: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 36,
  },

  headerBar: {
    minHeight: 54,
    paddingHorizontal: 18,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "transparent",
  },

  backBtn: {
    width: 42,
    height: 42,
    borderRadius: RADIUS.full,
    backgroundColor: BRAND.white,
    alignItems: "center",
    justifyContent: "center",
    ...SHADOW.sm,
  },

  backBtnPlaceholder: {
    width: 42,
    height: 42,
  },

   headerTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: FONT.header,
    fontSize: 20,
    fontWeight: "900",
    color: BRAND.black,
  },

  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: BRAND.white,
    borderRadius: 26,
    padding: 16,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#F3E8FF",
    // ...SHADOW.md,
  },

  profileIconContainer: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: "#F4E9FF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: BRAND.purpleLight,
  },

  profileImage: {
    width: 78,
    height: 78,
    borderRadius: 39,
  },

  cameraBadge: {
    position: "absolute",
    right: -2,
    bottom: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: BRAND.purple,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: BRAND.white,
  },

  profileInfo: {
    flex: 1,
    marginLeft: 14,
  },

  name: {
    fontFamily: FONT.header,
    fontSize: width > 400 ? 21 : 19,
    fontWeight: "900",
    color: BRAND.black,
  },

  subText: {
    fontFamily: FONT.body,
    fontSize: 13,
    fontWeight: "600",
    color: BRAND.grey,
    marginTop: 5,
  },

  editButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: BRAND.purple,
    alignItems: "center",
    justifyContent: "center",
    ...SHADOW.sm,
  },

  menuCard: {
    backgroundColor: BRAND.white,
    borderRadius: 24,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#F3E8FF",
    // ...SHADOW.sm,
  },

  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F1E8F8",
  },

  settingsRowLast: {
    borderBottomWidth: 0,
  },

  rowIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: "#F4E9FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  rowTitle: {
    flex: 1,
    fontFamily: FONT.body,
    fontSize: width > 400 ? 16 : 15,
    fontWeight: "800",
    color: BRAND.black,
  },

  logoutButton: {
    marginTop: 22,
    backgroundColor: BRAND.white,
    borderRadius: RADIUS.pill,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    borderWidth: 1.5,
    borderColor: "#FFE1E6",
    // ...SHADOW.sm,
  },

  logoutText: {
    fontFamily: FONT.body,
    fontSize: 16,
    fontWeight: "900",
    color: BRAND.red,
  },
});

export default AccountSettings;
