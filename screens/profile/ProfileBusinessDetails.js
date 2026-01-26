// screens/profile/ProfileBusinessDetails.js
// ✅ Keeps all details displayed (Basic + Location + Operations + Promotions + Documents)
// ✅ Adds Edit button -> navigates to "EditBusinessDetails"

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  Linking,
  Modal,
  Pressable,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRoute, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { BUSINESS_DETAILS, MERCHANT_LOGO } from "@env";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

/* ---------------- token helper (SecureStore) ---------------- */

async function getAccessTokenFromSecureStore() {
  const keysToTry = [
    "accessToken",
    "ACCESS_TOKEN",
    "token",
    "authToken",
    "jwt",
    "JWT",
    "userToken",
    "USER_TOKEN",
  ];

  // 1) direct keys
  for (const k of keysToTry) {
    const v = await SecureStore.getItemAsync(k);
    if (v) {
      // sometimes stored like: {"token":"..."} or {"accessToken":"..."}
      try {
        const obj = JSON.parse(v);
        const maybe =
          obj?.accessToken ||
          obj?.token ||
          obj?.jwt ||
          obj?.data?.accessToken ||
          obj?.data?.token;
        if (maybe) return String(maybe).replace(/^Bearer\s+/i, "").trim();
      } catch {
        return String(v).replace(/^Bearer\s+/i, "").trim();
      }
    }
  }

  // 2) common “user/session” blobs
  const blobKeys = ["user", "session", "auth", "profile"];
  for (const k of blobKeys) {
    const v = await SecureStore.getItemAsync(k);
    if (!v) continue;
    try {
      const obj = JSON.parse(v);
      const maybe =
        obj?.accessToken ||
        obj?.token ||
        obj?.jwt ||
        obj?.auth?.accessToken ||
        obj?.auth?.token ||
        obj?.session?.accessToken ||
        obj?.session?.token ||
        obj?.data?.accessToken ||
        obj?.data?.token;
      if (maybe) return String(maybe).replace(/^Bearer\s+/i, "").trim();
    } catch {
      // ignore
    }
  }

  return null;
}

/* ---------------- helpers ---------------- */

const isHttpUrl = (u) => /^https?:\/\//i.test(String(u || ""));

const joinUrl = (base, path) => {
  const b = String(base || "").trim();
  const p = String(path || "").trim();
  if (!b) return p || "";
  if (!p) return b;
  if (b.endsWith("/") && p.startsWith("/")) return b + p.slice(1);
  if (!b.endsWith("/") && !p.startsWith("/")) return b + "/" + p;
  return b + p;
};

const buildDetailsUrl = (template, businessId) => {
  const t = String(template || "").trim();
  if (!t) return "";
  if (businessId == null) return t;
  return t
    .replace("{business_id}", String(businessId))
    .replace(":business_id", String(businessId));
};

const isNilish = (v) => {
  if (v === null || v === undefined) return true;
  const s = String(v).trim().toLowerCase();
  return s === "" || s === "null" || s === "undefined";
};

const safeText = (v, fallback = "—") => (isNilish(v) ? fallback : String(v));

const formatTime = (t) => {
  const s = String(t || "").trim();
  if (!s) return "—";
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s.slice(0, 5);
  return s;
};

const deliveryLabel = (opt) => {
  const v = String(opt || "").toUpperCase().trim();
  if (!v) return "Not set";
  if (v === "BOTH") return "In-house + Grab delivery";
  if (v === "GRAB") return "Grab delivery";
  if (v === "SELF") return "In-house delivery";
  return opt;
};

const moneyNu = (v) => {
  if (isNilish(v)) return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return `Nu. ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
};

const pct = (v) => {
  if (isNilish(v)) return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return `${n}%`;
};

/* ---------------- UI atoms ---------------- */

const Section = ({ title, icon, children }) => (
  <View style={styles.card}>
    <View style={styles.sectionHeader}>
      <View style={styles.sectionIcon}>
        <Ionicons name={icon} size={16} color="#111" />
      </View>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
    <View style={{ height: 10 }} />
    {children}
  </View>
);

const Row = ({ label, value, icon, onPress }) => (
  <TouchableOpacity
    activeOpacity={onPress ? 0.85 : 1}
    onPress={onPress}
    style={styles.row}
  >
    <View style={styles.rowLeft}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={16} color="#111" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue} numberOfLines={2}>
          {value}
        </Text>
      </View>
    </View>
    {onPress ? <Ionicons name="chevron-forward" size={18} color="#888" /> : null}
  </TouchableOpacity>
);

const Badge = ({ text, icon, tone = "neutral" }) => {
  const toneStyle =
    tone === "good"
      ? styles.badgeGood
      : tone === "warn"
      ? styles.badgeWarn
      : styles.badgeNeutral;

  return (
    <View style={[styles.badge, toneStyle]}>
      <Ionicons name={icon} size={14} color="#111" />
      <Text style={styles.badgeText} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
};

/* ---------------- screen ---------------- */

export default function ProfileBusinessDetails() {
  const route = useRoute();
  const navigation = useNavigation();

  const businessIdParam =
    route?.params?.business_id ?? route?.params?.businessId ?? null;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [details, setDetails] = useState(null);

  // image popup
  const [imgModalOpen, setImgModalOpen] = useState(false);
  const [imgModalUri, setImgModalUri] = useState("");
  const [imgModalTitle, setImgModalTitle] = useState("");

  const openImageModal = useCallback((title, uri) => {
    if (!uri) return;
    setImgModalTitle(title || "Image");
    setImgModalUri(uri);
    setImgModalOpen(true);
  }, []);

  const closeImageModal = useCallback(() => {
    setImgModalOpen(false);
    setImgModalUri("");
    setImgModalTitle("");
  }, []);

  const imageUrls = useMemo(() => {
    const logoPath = details?.business_logo;
    const licensePath = details?.license_image;

    const logoUrl = !isNilish(logoPath)
      ? isHttpUrl(logoPath)
        ? logoPath
        : joinUrl(MERCHANT_LOGO, logoPath)
      : "";

    const licenseUrl = !isNilish(licensePath)
      ? isHttpUrl(licensePath)
        ? licensePath
        : joinUrl(MERCHANT_LOGO, licensePath)
      : "";

    return { logoUrl, licenseUrl };
  }, [details]);

  const fetchDetails = useCallback(
    async ({ isRefresh = false } = {}) => {
      try {
        setErrorMsg("");
        isRefresh ? setRefreshing(true) : setLoading(true);

        const url = buildDetailsUrl(BUSINESS_DETAILS, businessIdParam);
        if (!url) throw new Error("BUSINESS_DETAILS is missing in @env");

        const token = await getAccessTokenFromSecureStore();

        const res = await fetch(url, {
          method: "GET",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          
        });

        const json = await res.json().catch(() => null);

        if (!res.ok) {
          const msg =
            json?.message || json?.error || `Request failed (${res.status})`;
          throw new Error(msg);
        }

        setDetails(json?.data ?? json ?? null);
      } catch (e) {
        setDetails(null);
        setErrorMsg(String(e?.message || e));
      } finally {
        isRefresh ? setRefreshing(false) : setLoading(false);
      }
    },
    [businessIdParam]
  );

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  const onRefresh = useCallback(
    () => fetchDetails({ isRefresh: true }),
    [fetchDetails]
  );

  const openMaps = useCallback(async () => {
    const lat = Number(details?.latitude);
    const lng = Number(details?.longitude);
    const addr = safeText(details?.address, "");
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      Alert.alert("Location not available", "Latitude/Longitude is missing.");
      return;
    }
    const label = encodeURIComponent(
      safeText(details?.business_name, "Business")
    );
    const url = Platform.select({
      ios: `maps:0,0?q=${label}@${lat},${lng}`,
      android: `geo:${lat},${lng}?q=${lat},${lng}(${label})`,
      default: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
    });
    try {
      if (url) await Linking.openURL(url);
    } catch {
      Alert.alert("Could not open maps", addr ? addr : `${lat}, ${lng}`);
    }
  }, [details]);

  // ✅ Edit
  const goEdit = useCallback(() => {
    const bid = details?.business_id ?? businessIdParam;
    if (!bid) {
      Alert.alert("Missing business id", "business_id is required to edit.");
      return;
    }
    navigation.navigate("EditBusinessDetails", {
      business_id: bid,
      initial: details,
    });
  }, [navigation, details, businessIdParam]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <Text style={styles.muted}>Loading…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const name = safeText(details?.business_name, "Business");
  const ownerType = safeText(details?.owner_type, "").toLowerCase();
  const typeLabel = ownerType
    ? ownerType.charAt(0).toUpperCase() + ownerType.slice(1)
    : "Merchant";

  const openT = formatTime(details?.opening_time);
  const closeT = formatTime(details?.closing_time);
  const hoursLabel =
    openT !== "—" && closeT !== "—" ? `${openT} – ${closeT}` : "Not set";

  const deliveryOpt = deliveryLabel(details?.delivery_option);
  const fdMin = moneyNu(details?.min_amount_for_fd);

  const hasLicense = !!imageUrls.licenseUrl;
  const hasLogo = !!imageUrls.logoUrl;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Image popup */}
      <Modal
        visible={imgModalOpen}
        transparent
        animationType="fade"
        onRequestClose={closeImageModal}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeImageModal}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={1}>
                {imgModalTitle}
              </Text>
              <TouchableOpacity
                onPress={closeImageModal}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={20} color="#111" />
              </TouchableOpacity>
            </View>

            {!!imgModalUri ? (
              <Image
                source={{ uri: imgModalUri }}
                style={styles.modalImage}
                resizeMode="contain"
              />
            ) : (
              <View style={styles.modalEmpty}>
                <Ionicons name="image-outline" size={22} color="#666" />
                <Text style={styles.modalEmptyText}>No image</Text>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.topBtn}
        >
          <Ionicons name="arrow-back" size={22} color="#111" />
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <Text style={styles.topTitle}>Business Details</Text>
          <Text style={styles.topSub} numberOfLines={1}>
            {name}
          </Text>
        </View>

        {/* ✅ Edit */}
        <TouchableOpacity onPress={goEdit} style={styles.topBtn}>
          <Ionicons name="create-outline" size={22} color="#111" />
        </TouchableOpacity>

        <TouchableOpacity onPress={onRefresh} style={styles.topBtn}>
          <Ionicons name="refresh" size={22} color="#111" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {errorMsg ? (
          <View style={styles.errorCard}>
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle" size={18} color="#B00020" />
              <Text style={styles.errorTitle}>Couldn’t load details</Text>
            </View>
            <Text style={styles.errorText}>{errorMsg}</Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => fetchDetails()}
            >
              <Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.heroLogoWrap}>
              {hasLogo ? (
                <Image
                  source={{ uri: imageUrls.logoUrl }}
                  style={styles.heroLogo}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.heroLogoPlaceholder}>
                  <Ionicons name="storefront-outline" size={26} color="#555" />
                </View>
              )}
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.heroName} numberOfLines={2}>
                {name}
              </Text>
              <View style={styles.badgeRow}>
                <Badge text={typeLabel} icon="business-outline" />
                <Badge
                  text={deliveryOpt}
                  icon="car-outline"
                  tone={
                    String(details?.delivery_option || "").toUpperCase() === "BOTH"
                      ? "good"
                      : "neutral"
                  }
                />
              </View>
            </View>
          </View>

          <View style={styles.heroBottom}>
            <View style={styles.miniCard}>
              <Ionicons name="time-outline" size={18} color="#111" />
              <Text style={styles.miniLabel}>Hours</Text>
              <Text style={styles.miniValue}>{hoursLabel}</Text>
            </View>

            <View style={styles.miniCard}>
              <Ionicons name="cash-outline" size={18} color="#111" />
              <Text style={styles.miniLabel}>Min FD</Text>
              <Text style={styles.miniValue}>{fdMin}</Text>
            </View>
          </View>
        </View>

        {/* ✅ Basic Info (restored) */}
        <Section title="Basic Info" icon="information-circle-outline">
          <Row
            label="Business Name"
            value={safeText(details?.business_name)}
            icon="storefront-outline"
          />
          {/* <Row
            label="License Number"
            value={safeText(details?.business_license_number)}
            icon="document-text-outline"
          /> */}
          <Row
            label="Delivery Option"
            value={deliveryOpt}
            icon="car-outline"
          />
          <Row
            label="Opening Time"
            value={openT}
            icon="time-outline"
          />
          <Row
            label="Closing Time"
            value={closeT}
            icon="time-outline"
          />
          <Row
            label="Min Amount For FD"
            value={fdMin}
            icon="cash-outline"
          />
        </Section>

        {/* Location */}
        <Section title="Location" icon="location-outline">
          <Row
            label="Address"
            value={safeText(details?.address)}
            icon="pin-outline"
            onPress={openMaps}
          />
          <Row
            label="Latitude"
            value={safeText(details?.latitude)}
            icon="navigate-outline"
          />
          <Row
            label="Longitude"
            value={safeText(details?.longitude)}
            icon="navigate-outline"
          />
          <Text style={styles.hint}>Tap address to open in Maps</Text>
        </Section>

        {/* ✅ Operations (restored) */}
        <Section title="Operations" icon="settings-outline">
          <Row
            label="Holidays"
            value={safeText(details?.holidays)}
            icon="calendar-outline"
          />
        </Section>

        {/* ✅ Promotions (restored) */}
        <Section title="Promotions" icon="sparkles-outline">
          <Row
            label="Special Celebration"
            value={safeText(details?.special_celebration)}
            icon="sparkles-outline"
          />
          <Row
            label="Discount"
            value={pct(details?.special_celebration_discount_percentage)}
            icon="percent-outline"
          />
          <Row
            label="Complementary"
            value={safeText(details?.complementary)}
            icon="gift-outline"
          />
          <Row
            label="Complementary Details"
            value={safeText(details?.complementary_details)}
            icon="reader-outline"
          />
        </Section>

        {/* Documents */}
        <Section title="Documents" icon="document-text-outline">
          <View style={styles.docRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.docTitle}>License Image</Text>
              <Text style={styles.docSub}>
                {hasLicense ? "Uploaded" : "Not uploaded"}
              </Text>
            </View>

            {hasLicense ? (
              <TouchableOpacity
                style={styles.viewBtn}
                onPress={() =>
                  openImageModal("License Image", imageUrls.licenseUrl)
                }
              >
                <Ionicons name="eye-outline" size={18} color="#111" />
                <Text style={styles.viewBtnText}>View</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {hasLicense ? (
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() =>
                openImageModal("License Image", imageUrls.licenseUrl)
              }
              style={{ marginTop: 12 }}
            >
              <Image
                source={{ uri: imageUrls.licenseUrl }}
                style={styles.licensePreview}
                resizeMode="cover"
              />
            </TouchableOpacity>
          ) : (
            <View style={styles.emptyDoc}>
              <Ionicons name="document-outline" size={22} color="#666" />
              <Text style={styles.emptyDocText}>No license image uploaded.</Text>
            </View>
          )}
        </Section>

        <View style={{ height: 18 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

/* ---------------- styles (same as your existing) ---------------- */

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F6F7FB" },

  topBar: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  topBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "#FFF",
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      android: { elevation: 2 },
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.06,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
      },
    }),
  },
  topTitle: { fontSize: 15, fontWeight: "900", color: "#111" },
  topSub: { marginTop: 2, fontSize: 12, color: "#666" },

  content: { padding: 14, paddingBottom: 28, gap: 12 },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  muted: { marginTop: 10, fontSize: 12, color: "#666" },

  errorCard: {
    backgroundColor: "#FFF5F5",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#FFD6D6",
  },
  errorRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  errorTitle: { fontSize: 13, fontWeight: "900", color: "#B00020" },
  errorText: { fontSize: 12, color: "#7A1B1B" },
  retryBtn: {
    marginTop: 12,
    alignSelf: "flex-start",
    backgroundColor: "#B00020",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
  },
  retryText: { color: "#FFF", fontWeight: "900", fontSize: 12 },

  hero: {
    backgroundColor: "#FFF",
    borderRadius: 22,
    padding: 14,
    ...Platform.select({
      android: { elevation: 2 },
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.06,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 5 },
      },
    }),
  },
  heroTop: { flexDirection: "row", gap: 12, alignItems: "center" },
  heroLogoWrap: {
    width: 64,
    height: 64,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#F1F3F7",
  },
  heroLogo: { width: "100%", height: "100%" },
  heroLogoPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },

  heroName: { fontSize: 18, fontWeight: "950", color: "#111", marginBottom: 8 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },

  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeText: { fontSize: 12, fontWeight: "800", color: "#111" },
  badgeNeutral: { backgroundColor: "#F6F7FB", borderColor: "#E7E9F0" },
  badgeGood: { backgroundColor: "#F1FFF3", borderColor: "#D6F5DB" },
  badgeWarn: { backgroundColor: "#FFF9E8", borderColor: "#F5E3B5" },

  heroBottom: { flexDirection: "row", gap: 10, marginTop: 14 },
  miniCard: {
    flex: 1,
    backgroundColor: "#F6F7FB",
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E7E9F0",
    gap: 4,
  },
  miniLabel: { fontSize: 12, color: "#666", fontWeight: "700" },
  miniValue: { fontSize: 13, color: "#111", fontWeight: "900" },

  card: {
    backgroundColor: "#FFF",
    borderRadius: 22,
    padding: 14,
    ...Platform.select({
      android: { elevation: 2 },
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.06,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 5 },
      },
    }),
  },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  sectionIcon: {
    width: 30,
    height: 30,
    borderRadius: 12,
    backgroundColor: "#F1F3F7",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: { fontSize: 14, fontWeight: "950", color: "#111" },

  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#EEE",
    gap: 12,
  },
  rowLeft: { flexDirection: "row", gap: 10, alignItems: "center", flex: 1 },
  rowIcon: {
    width: 30,
    height: 30,
    borderRadius: 12,
    backgroundColor: "#F6F7FB",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E7E9F0",
  },
  rowLabel: { fontSize: 12, color: "#666", fontWeight: "800" },
  rowValue: { marginTop: 2, fontSize: 13, color: "#111", fontWeight: "900" },

  hint: { marginTop: 8, fontSize: 12, color: "#777" },

  docRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  docTitle: { fontSize: 13, fontWeight: "950", color: "#111" },
  docSub: { marginTop: 4, fontSize: 12, color: "#666", fontWeight: "700" },

  viewBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 14,
    backgroundColor: "#F6F7FB",
    borderWidth: 1,
    borderColor: "#E7E9F0",
  },
  viewBtnText: { fontSize: 12, fontWeight: "900", color: "#111" },

  licensePreview: {
    width: "100%",
    height: 180,
    borderRadius: 18,
    backgroundColor: "#EEE",
  },
  emptyDoc: {
    marginTop: 12,
    height: 150,
    borderRadius: 18,
    backgroundColor: "#F6F7FB",
    borderWidth: 1,
    borderColor: "#E7E9F0",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  emptyDocText: { fontSize: 12, color: "#666", fontWeight: "800" },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    width: Math.min(SCREEN_W - 32, 420),
    maxHeight: SCREEN_H * 0.78,
    backgroundColor: "#FFF",
    borderRadius: 18,
    overflow: "hidden",
  },
  modalHeader: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#EEE",
  },
  modalTitle: { fontSize: 13, fontWeight: "950", color: "#111", flex: 1, marginRight: 10 },
  modalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "#F6F7FB",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E7E9F0",
  },
  modalImage: { width: "100%", height: SCREEN_H * 0.55, backgroundColor: "#111" },
  modalEmpty: { height: 260, alignItems: "center", justifyContent: "center", gap: 8 },
  modalEmptyText: { fontSize: 12, color: "#666", fontWeight: "800" },
});
