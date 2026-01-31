// screens/profile/ProfileBusinessDetails.js
// ✅ Keeps all details displayed (Basic + Location + Operations + Promotions + Documents)
// ✅ Adds Edit button -> navigates to "EditBusinessDetails"
// ✅ UI refreshed to match PersonalInformation style (header + typography + cards) — logic untouched

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
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
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

/* ---------------- UI atoms (style-only changes) ---------------- */

const Section = ({ title, icon, children }) => (
  <View style={styles.card}>
    <View style={styles.sectionHeader}>
      <View style={styles.sectionIcon}>
        <Ionicons name={icon} size={16} color="#0f172a" />
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
        <Ionicons name={icon} size={16} color="#0f172a" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue} numberOfLines={2}>
          {value}
        </Text>
      </View>
    </View>
    {onPress ? <Ionicons name="chevron-forward" size={18} color="#94a3b8" /> : null}
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
      <Ionicons name={icon} size={14} color="#0f172a" />
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
  const insets = useSafeAreaInsets();

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

  const headerTopPad = Math.max(insets.top, 8) + 18;

  if (loading) {
    return (
      <View style={styles.centerWrap}>
        <ActivityIndicator size="large" color="#16a34a" />
        <Text style={styles.muted}>Loading…</Text>
      </View>
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
    <SafeAreaView style={styles.safe} edges={["left", "right", "bottom"]}>
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
                activeOpacity={0.8}
              >
                <Ionicons name="close" size={20} color="#0f172a" />
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
                <Ionicons name="image-outline" size={22} color="#64748b" />
                <Text style={styles.modalEmptyText}>No image</Text>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Header (matches PersonalInformation style) */}
      <View style={[styles.headerBar, { paddingTop: headerTopPad }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={22} color="#0f172a" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Business Details</Text>

        <View style={styles.headerRight}>
          <TouchableOpacity onPress={goEdit} style={styles.iconBtn} activeOpacity={0.7}>
            <Ionicons name="create-outline" size={20} color="#0f172a" />
          </TouchableOpacity>
          <TouchableOpacity onPress={onRefresh} style={styles.iconBtn} activeOpacity={0.7}>
            <Ionicons name="refresh" size={20} color="#0f172a" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollInner}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {errorMsg ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Couldn’t load details</Text>
            <Text style={styles.errorText}>{errorMsg}</Text>
            <TouchableOpacity
              style={[styles.saveButton, { marginTop: 12 }]}
              onPress={() => fetchDetails()}
              activeOpacity={0.9}
            >
              <Text style={styles.saveButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Hero (restyled only) */}
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
                  <Ionicons name="storefront-outline" size={26} color="#64748b" />
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
              <View style={styles.miniIcon}>
                <Ionicons name="time-outline" size={16} color="#0f172a" />
              </View>
              <Text style={styles.miniLabel}>Hours</Text>
              <Text style={styles.miniValue}>{hoursLabel}</Text>
            </View>

            <View style={styles.miniCard}>
              <View style={styles.miniIcon}>
                <Ionicons name="cash-outline" size={16} color="#0f172a" />
              </View>
              <Text style={styles.miniLabel}>Min FD</Text>
              <Text style={styles.miniValue}>{fdMin}</Text>
            </View>
          </View>
        </View>

        {/* ✅ Basic Info */}
        <Section title="Basic Info" icon="information-circle-outline">
          <Row
            label="Business Name"
            value={safeText(details?.business_name)}
            icon="storefront-outline"
          />
          <Row label="Delivery Option" value={deliveryOpt} icon="car-outline" />
          <Row label="Opening Time" value={openT} icon="time-outline" />
          <Row label="Closing Time" value={closeT} icon="time-outline" />
          <Row label="Min Amount For FD" value={fdMin} icon="cash-outline" />
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

        {/* ✅ Operations */}
        <Section title="Operations" icon="settings-outline">
          <Row
            label="Holidays"
            value={safeText(details?.holidays)}
            icon="calendar-outline"
          />
        </Section>

        {/* ✅ Promotions */}
        <Section title="Promotions" icon="sparkles-outline">
          <Row
            label="Special Celebration"
            value={safeText(details?.special_celebration)}
            icon="sparkles-outline"
          />
          <Row
            label="Discount"
            value={pct(details?.special_celebration_discount_percentage)}
            icon="pricetag-outline"
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
                onPress={() => openImageModal("License Image", imageUrls.licenseUrl)}
                activeOpacity={0.9}
              >
                <Ionicons name="eye-outline" size={18} color="#0f172a" />
                <Text style={styles.viewBtnText}>View</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {hasLicense ? (
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => openImageModal("License Image", imageUrls.licenseUrl)}
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
              <Ionicons name="document-outline" size={22} color="#64748b" />
              <Text style={styles.emptyDocText}>No license image uploaded.</Text>
            </View>
          )}
        </Section>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

/* ---------------- styles (updated to match PersonalInformation) ---------------- */

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },

  headerBar: {
    minHeight: 52,
    paddingHorizontal: 12,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    borderBottomColor: "#e5e7eb",
    borderBottomWidth: 1,
    backgroundColor: "#fff",
  },
  backBtn: {
    height: 40,
    width: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "700",
    color: "#0f172a",
  },
  headerRight: { width: 90, flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  iconBtn: {
    height: 40,
    width: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  scrollInner: { padding: 18 },

  centerWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: "#fff",
  },
  muted: { marginTop: 10, color: "#475569" },

  errorCard: {
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#b91c1c",
    marginBottom: 6,
  },
  errorText: { color: "#7f1d1d" },

  saveButton: {
    backgroundColor: "#16a34a",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
    elevation: 1,
  },
  saveButtonText: {
    color: "#fff",
    fontSize: SCREEN_W > 400 ? 18 : 16,
    fontWeight: "700",
  },

  hero: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 14,
    backgroundColor: "#fff",
    marginBottom: 16,
  },
  heroTop: { flexDirection: "row", gap: 12, alignItems: "center" },
  heroLogoWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    overflow: "hidden",
    backgroundColor: "#f1f5f9",
    borderWidth: 2,
    borderColor: "#e2e8f0",
  },
  heroLogo: { width: "100%", height: "100%" },
  heroLogoPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  heroName: {
    fontSize: SCREEN_W > 400 ? 18 : 16,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 8,
  },

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
  badgeText: { fontSize: 12, fontWeight: "700", color: "#0f172a" },
  badgeNeutral: { backgroundColor: "#f8fafc", borderColor: "#e2e8f0" },
  badgeGood: { backgroundColor: "#ecfdf5", borderColor: "#bbf7d0" },
  badgeWarn: { backgroundColor: "#fffbeb", borderColor: "#fde68a" },

  heroBottom: { flexDirection: "row", gap: 10, marginTop: 14 },
  miniCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  miniIcon: {
    height: 28,
    width: 28,
    borderRadius: 8,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  miniLabel: { fontSize: 12, color: "#64748b", fontWeight: "700" },
  miniValue: { fontSize: 13, color: "#0f172a", fontWeight: "800" },

  card: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  sectionIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    fontSize: SCREEN_W > 400 ? 16 : 15,
    fontWeight: "800",
    color: "#0f172a",
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
    gap: 12,
  },
  rowLeft: { flexDirection: "row", gap: 10, alignItems: "center", flex: 1 },
  rowIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { fontSize: 12, color: "#64748b", fontWeight: "700" },
  rowValue: { marginTop: 2, fontSize: 13, color: "#0f172a", fontWeight: "700" },

  hint: { marginTop: 8, fontSize: 12, color: "#64748b" },

  docRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  docTitle: { fontSize: 13, fontWeight: "800", color: "#0f172a" },
  docSub: { marginTop: 4, fontSize: 12, color: "#64748b", fontWeight: "700" },

  viewBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  viewBtnText: { fontSize: 12, fontWeight: "800", color: "#0f172a" },

  licensePreview: {
    width: "100%",
    height: 180,
    borderRadius: 12,
    backgroundColor: "#e2e8f0",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  emptyDoc: {
    marginTop: 12,
    height: 150,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  emptyDocText: { fontSize: 12, color: "#64748b", fontWeight: "800" },

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
    backgroundColor: "#fff",
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  modalHeader: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
    backgroundColor: "#fff",
  },
  modalTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0f172a",
    flex: 1,
    marginRight: 10,
  },
  modalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  modalImage: { width: "100%", height: SCREEN_H * 0.55, backgroundColor: "#0f172a" },
  modalEmpty: { height: 260, alignItems: "center", justifyContent: "center", gap: 8 },
  modalEmptyText: { fontSize: 12, color: "#64748b", fontWeight: "800" },
});
