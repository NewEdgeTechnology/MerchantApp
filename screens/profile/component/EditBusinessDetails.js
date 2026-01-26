// screens/profile/component/EditBusinessDetails.js
// ✅ ADD: min_amount_for_fd field (state + UI + payload + change detection)
// ✅ Delivery option is dropdown (GRAB/BOTH/SELF)

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  Image,
  RefreshControl,
  Modal,
  Pressable,
  Dimensions,
  KeyboardAvoidingView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import * as ImagePicker from "expo-image-picker";
import { useNavigation, useRoute } from "@react-navigation/native";
import { BUSINESS_DETAILS, MERCHANT_LOGO } from "@env";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

// Must match backend multer field names
const LOGO_FIELD = "business_logo";
const LICENSE_FIELD = "license_image";

// Must match your login storage keys
const KEY_AUTH_TOKEN = "auth_token";
const KEY_MERCHANT_LOGIN = "merchant_login";

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
  return t.replace("{business_id}", String(businessId)).replace(":business_id", String(businessId));
};

const isNilish = (v) => {
  if (v === null || v === undefined) return true;
  const s = String(v).trim().toLowerCase();
  return s === "" || s === "null" || s === "undefined";
};

const safeText = (v, fallback = "") => (isNilish(v) ? fallback : String(v));

// backend expects HH:mm:ss
const normalizeTime = (t) => {
  const s = String(t || "").trim();
  if (!s) return null;
  if (/^\d{2}:\d{2}$/.test(s)) return s + ":00";
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s;
  return s;
};

const guessMime = (uri) => {
  const u = String(uri || "").toLowerCase();
  if (u.endsWith(".png")) return "image/png";
  if (u.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
};

const filenameFromUri = (uri, fallback) => {
  const u = String(uri || "");
  const last = u.split("?")[0].split("#")[0].split("/").pop();
  return last && last.includes(".") ? last : fallback;
};

const stripBearer = (t) => String(t || "").replace(/^Bearer\s+/i, "").trim();
const tryParseJson = (v) => {
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
};
const pickFirstString = (...vals) => {
  for (const v of vals) {
    if (!v) continue;
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
};

// ✅ Strong token extractor for merchant_login/auth_token
async function getAccessTokenFromLogin() {
  // 1) merchant_login payload
  try {
    const raw = await SecureStore.getItemAsync(KEY_MERCHANT_LOGIN);
    if (raw) {
      const parsed = tryParseJson(raw);

      const tokenNode =
        parsed?.token ??
        parsed?.data?.token ??
        parsed?.auth ??
        parsed?.jwt ??
        parsed?.access_token ??
        parsed?.accessToken ??
        parsed?.token ??
        parsed?.jwt;

      const tokenMaybeParsed =
        typeof tokenNode === "string" ? tryParseJson(tokenNode) || tokenNode : tokenNode;

      const candidate = pickFirstString(
        tokenMaybeParsed?.access_token,
        tokenMaybeParsed?.accessToken,
        tokenMaybeParsed?.token,
        tokenMaybeParsed?.jwt,
        typeof tokenMaybeParsed === "string" ? tokenMaybeParsed : null,
        parsed?.access_token,
        parsed?.accessToken,
        parsed?.token,
        parsed?.jwt
      );

      if (candidate) return stripBearer(candidate);
    }
  } catch {}

  // 2) auth_token fallback (string or JSON)
  try {
    const raw = await SecureStore.getItemAsync(KEY_AUTH_TOKEN);
    if (raw) {
      const parsed = tryParseJson(raw);
      const candidate = pickFirstString(
        parsed?.access_token,
        parsed?.accessToken,
        parsed?.token,
        typeof raw === "string" ? raw : null
      );
      if (candidate) return stripBearer(candidate);
    }
  } catch {}

  // 3) fallback common keys
  const keysToTry = ["access_token", "ACCESS_TOKEN", "token", "authToken", "AUTH_TOKEN"];
  for (const k of keysToTry) {
    try {
      const raw = await SecureStore.getItemAsync(k);
      if (!raw) continue;
      const parsed = tryParseJson(raw);
      const candidate = pickFirstString(
        parsed?.access_token,
        parsed?.accessToken,
        parsed?.token,
        typeof raw === "string" ? raw : null
      );
      if (candidate) return stripBearer(candidate);
    } catch {}
  }

  return null;
}

/* ---------------- picker helpers ---------------- */

async function pickFromGallery() {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert("Permission required", "Please allow photo access to choose an image.");
    return null;
  }
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    quality: 0.85,
  });
  if (res.canceled) return null;
  return res.assets?.[0] || null;
}

async function pickFromCamera() {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    Alert.alert("Permission required", "Please allow camera access to take a photo.");
    return null;
  }
  const res = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    quality: 0.85,
  });
  if (res.canceled) return null;
  return res.assets?.[0] || null;
}

/* ---------------- small UI atoms ---------------- */

const Label = ({ children }) => <Text style={styles.label}>{children}</Text>;

const Input = (props) => (
  <View style={styles.inputWrap}>
    <TextInput
      {...props}
      placeholderTextColor="#9AA0A6"
      style={[styles.input, props.multiline ? styles.inputMultiline : null]}
    />
  </View>
);

const SelectRow = ({ value, onPress }) => (
  <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={styles.selectRow}>
    <Text style={styles.selectValue}>{value || "Select"}</Text>
    <Ionicons name="chevron-down" size={18} color="#111" />
  </TouchableOpacity>
);

export default function EditBusinessDetails() {
  const navigation = useNavigation();
  const route = useRoute();

  const businessId = route?.params?.business_id ?? route?.params?.businessId ?? null;
  const initial = route?.params?.initial ?? null;

  const detailsUrl = useMemo(() => buildDetailsUrl(BUSINESS_DETAILS, businessId), [businessId]);

  const [loading, setLoading] = useState(!initial);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [details, setDetails] = useState(initial);

  // form state
  const [business_name, setBusinessName] = useState(safeText(initial?.business_name));
  const [address, setAddress] = useState(safeText(initial?.address));
  const [latitude, setLatitude] = useState(safeText(initial?.latitude));
  const [longitude, setLongitude] = useState(safeText(initial?.longitude));
  const [opening_time, setOpeningTime] = useState(safeText(initial?.opening_time).slice(0, 5));
  const [closing_time, setClosingTime] = useState(safeText(initial?.closing_time).slice(0, 5));

  const [delivery_option, setDeliveryOption] = useState(
    safeText(initial?.delivery_option, "BOTH").toUpperCase()
  );
  const [holidays, setHolidays] = useState(safeText(initial?.holidays));

  // ✅ ADD: min_amount_for_fd
  const [min_amount_for_fd, setMinAmountForFD] = useState(
    safeText(initial?.min_amount_for_fd)
  );

  const [complementary, setComplementary] = useState(safeText(initial?.complementary));
  const [complementary_details, setComplementaryDetails] = useState(safeText(initial?.complementary_details));
  const [special_celebration, setSpecialCelebration] = useState(safeText(initial?.special_celebration));
  const [special_celebration_discount_percentage, setCelebrationDiscount] = useState(
    safeText(initial?.special_celebration_discount_percentage)
  );

  // images
  const [pickedLogo, setPickedLogo] = useState(null);
  const [pickedLicense, setPickedLicense] = useState(null);

  // image viewer modal
  const [imgModalOpen, setImgModalOpen] = useState(false);
  const [imgModalUri, setImgModalUri] = useState("");
  const [imgModalTitle, setImgModalTitle] = useState("");

  // source chooser
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [sourceTarget, setSourceTarget] = useState(null); // "logo" | "license"

  // delivery dropdown modal
  const [deliveryModalOpen, setDeliveryModalOpen] = useState(false);

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
  const openSourceModal = useCallback((target) => {
    setSourceTarget(target);
    setSourceModalOpen(true);
  }, []);
  const closeSourceModal = useCallback(() => {
    setSourceModalOpen(false);
    setSourceTarget(null);
  }, []);

  const displayLogoUrl = useMemo(() => {
    if (pickedLogo?.uri) return pickedLogo.uri;
    const p = details?.business_logo;
    if (isNilish(p)) return "";
    return isHttpUrl(p) ? p : joinUrl(MERCHANT_LOGO, p);
  }, [pickedLogo, details]);

  const displayLicenseUrl = useMemo(() => {
    if (pickedLicense?.uri) return pickedLicense.uri;
    const p = details?.license_image;
    if (isNilish(p)) return "";
    return isHttpUrl(p) ? p : joinUrl(MERCHANT_LOGO, p);
  }, [pickedLicense, details]);

  const loadDetails = useCallback(
    async ({ isRefresh = false } = {}) => {
      try {
        if (!detailsUrl) throw new Error("BUSINESS_DETAILS missing in @env");
        if (!businessId) throw new Error("business_id is required");

        isRefresh ? setRefreshing(true) : setLoading(true);

        const accessToken = await getAccessTokenFromLogin();
        if (!accessToken) throw new Error("Access token not found. Please login again.");

        const res = await fetch(detailsUrl, {
          method: "GET",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
        });

        const json = await res.json().catch(() => null);
        if (!res.ok) {
          const msg = json?.message || json?.error || `Request failed (${res.status})`;
          throw new Error(msg);
        }

        const data = json?.data ?? json;
        setDetails(data);

        setBusinessName(safeText(data?.business_name));
        setAddress(safeText(data?.address));
        setLatitude(safeText(data?.latitude));
        setLongitude(safeText(data?.longitude));
        setOpeningTime(safeText(data?.opening_time).slice(0, 5));
        setClosingTime(safeText(data?.closing_time).slice(0, 5));
        setDeliveryOption(safeText(data?.delivery_option, "BOTH").toUpperCase());
        setHolidays(safeText(data?.holidays));

        // ✅ ADD: min_amount_for_fd
        setMinAmountForFD(safeText(data?.min_amount_for_fd));

        setComplementary(safeText(data?.complementary));
        setComplementaryDetails(safeText(data?.complementary_details));
        setSpecialCelebration(safeText(data?.special_celebration));
        setCelebrationDiscount(safeText(data?.special_celebration_discount_percentage));
      } catch (e) {
        Alert.alert("Error", String(e?.message || e));
      } finally {
        isRefresh ? setRefreshing(false) : setLoading(false);
      }
    },
    [detailsUrl, businessId]
  );

  useEffect(() => {
    if (!initial) loadDetails();
  }, [initial, loadDetails]);

  const onRefresh = useCallback(() => loadDetails({ isRefresh: true }), [loadDetails]);

  const chooseFromGallery = useCallback(async () => {
    try {
      const asset = await pickFromGallery();
      if (!asset?.uri) return;
      if (sourceTarget === "logo") setPickedLogo(asset);
      if (sourceTarget === "license") setPickedLicense(asset);
    } catch (e) {
      Alert.alert("Pick image failed", String(e?.message || e));
    } finally {
      closeSourceModal();
    }
  }, [sourceTarget, closeSourceModal]);

  const chooseFromCamera = useCallback(async () => {
    try {
      const asset = await pickFromCamera();
      if (!asset?.uri) return;
      if (sourceTarget === "logo") setPickedLogo(asset);
      if (sourceTarget === "license") setPickedLicense(asset);
    } catch (e) {
      Alert.alert("Camera failed", String(e?.message || e));
    } finally {
      closeSourceModal();
    }
  }, [sourceTarget, closeSourceModal]);

  const validate = useCallback(() => {
    if (!business_name.trim()) return "Business name is required";
    if (!delivery_option.trim()) return "Delivery option is required";
    if (latitude && !Number.isFinite(Number(latitude))) return "Latitude must be a number";
    if (longitude && !Number.isFinite(Number(longitude))) return "Longitude must be a number";

    // ✅ validate min_amount_for_fd if provided
    if (min_amount_for_fd && !Number.isFinite(Number(min_amount_for_fd))) {
      return "Min amount for FD must be a number";
    }

    if (special_celebration && !special_celebration_discount_percentage) {
      return "Discount % is required when Special Celebration is provided";
    }
    if (special_celebration_discount_percentage && !Number.isFinite(Number(special_celebration_discount_percentage))) {
      return "Discount % must be a number";
    }
    return "";
  }, [
    business_name,
    delivery_option,
    latitude,
    longitude,
    min_amount_for_fd,
    special_celebration,
    special_celebration_discount_percentage,
  ]);

  // backend-supported keys
  const BACKEND_KEYS = useMemo(
    () => [
      "business_name",
      "latitude",
      "longitude",
      "address",
      "delivery_option",
      "complementary",
      "complementary_details",
      "opening_time",
      "closing_time",
      "holidays",
      "special_celebration",
      "special_celebration_discount_percentage",
      "min_amount_for_fd", // ✅ ADD
    ],
    []
  );

  const buildPayload = useCallback(() => {
    const payload = {
      business_name: business_name.trim(),
      latitude: latitude.trim() || null,
      longitude: longitude.trim() || null,
      address: address.trim() || null,
      delivery_option: delivery_option.trim().toUpperCase() || null,
      complementary: complementary.trim() || null,
      complementary_details: complementary_details.trim() || null,
      opening_time: normalizeTime(opening_time),
      closing_time: normalizeTime(closing_time),
      holidays: holidays.trim() || null,
      special_celebration: special_celebration.trim() || null,
      special_celebration_discount_percentage: special_celebration_discount_percentage.trim() || null,
      min_amount_for_fd: min_amount_for_fd.trim() || null, // ✅ ADD
    };

    if (!payload.special_celebration) {
      payload.special_celebration_discount_percentage = null;
    }
    return payload;
  }, [
    business_name,
    latitude,
    longitude,
    address,
    delivery_option,
    complementary,
    complementary_details,
    opening_time,
    closing_time,
    holidays,
    special_celebration,
    special_celebration_discount_percentage,
    min_amount_for_fd,
  ]);

  const valueForCompare = (key, obj) => {
    const v = obj?.[key];

    if (key === "opening_time" || key === "closing_time") {
      const t = safeText(v);
      if (/^\d{2}:\d{2}:\d{2}$/.test(t)) return t;
      if (/^\d{2}:\d{2}$/.test(t)) return t + ":00";
      return t || "";
    }

    if (v === null || v === undefined) return "";
    return String(v);
  };

  const save = useCallback(async () => {
    const err = validate();
    if (err) {
      Alert.alert("Fix this", err);
      return;
    }
    if (!detailsUrl) {
      Alert.alert("Missing", "BUSINESS_DETAILS is missing in @env");
      return;
    }

    setSaving(true);
    try {
      const accessToken = await getAccessTokenFromLogin();
      if (!accessToken) throw new Error("Access token not found. Please login again.");

      const hasFiles = !!pickedLogo?.uri || !!pickedLicense?.uri;
      const payload = buildPayload();

      const base = details || initial || {};
      const supportedChanged = BACKEND_KEYS.some((k) => valueForCompare(k, base) !== valueForCompare(k, payload));

      if (!supportedChanged && !hasFiles) {
        setSaving(false);
        Alert.alert("Nothing to update", "No changes detected.");
        return;
      }

      let res;

      if (hasFiles) {
        const form = new FormData();

        BACKEND_KEYS.forEach((k) => {
          const v = payload[k];
          if (v === undefined) return;
          if (v === null) return;
          form.append(k, String(v));
        });

        if (pickedLogo?.uri) {
          form.append(LOGO_FIELD, {
            uri: pickedLogo.uri,
            name: filenameFromUri(pickedLogo.uri, "logo.jpg"),
            type: guessMime(pickedLogo.uri),
          });
        }
        if (pickedLicense?.uri) {
          form.append(LICENSE_FIELD, {
            uri: pickedLicense.uri,
            name: filenameFromUri(pickedLicense.uri, "license.jpg"),
            type: guessMime(pickedLicense.uri),
          });
        }

        res = await fetch(detailsUrl, {
          method: "PUT",
          headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` },
          body: form,
        });
      } else {
        const jsonPayload = {};
        BACKEND_KEYS.forEach((k) => {
          jsonPayload[k] = payload[k] ?? null;
        });

        res = await fetch(detailsUrl, {
          method: "PUT",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(jsonPayload),
        });
      }

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = json?.message || json?.error || `Update failed (${res.status})`;
        if (res.status === 401 || /expired|invalid/i.test(msg)) {
          throw new Error("Invalid or expired token. Please logout and login again.");
        }
        throw new Error(msg);
      }

      Alert.alert("Saved", "Business details updated successfully.");
      navigation.goBack();
    } catch (e) {
      Alert.alert("Save failed", String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }, [validate, detailsUrl, pickedLogo, pickedLicense, buildPayload, details, initial, navigation, BACKEND_KEYS]);

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

  return (
    <SafeAreaView style={styles.safe}>
      {/* Delivery dropdown modal */}
      <Modal
        visible={deliveryModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDeliveryModalOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setDeliveryModalOpen(false)}>
          <Pressable style={styles.sourceCard} onPress={() => {}}>
            <Text style={styles.sourceTitle}>Delivery Option</Text>

            {["GRAB", "BOTH", "SELF"].map((opt) => (
              <TouchableOpacity
                key={opt}
                style={styles.deliveryBtn}
                onPress={() => {
                  setDeliveryOption(opt);
                  setDeliveryModalOpen(false);
                }}
              >
                <Text style={styles.sourceBtnText}>{opt}</Text>
                {delivery_option === opt ? <Ionicons name="checkmark" size={18} color="#111" /> : null}
              </TouchableOpacity>
            ))}

            <TouchableOpacity style={styles.sourceCancel} onPress={() => setDeliveryModalOpen(false)}>
              <Text style={styles.sourceCancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Image viewer modal */}
      <Modal visible={imgModalOpen} transparent animationType="fade" onRequestClose={closeImageModal}>
        <Pressable style={styles.modalBackdrop} onPress={closeImageModal}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={1}>{imgModalTitle}</Text>
              <TouchableOpacity onPress={closeImageModal} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={20} color="#111" />
              </TouchableOpacity>
            </View>
            <Image source={{ uri: imgModalUri }} style={styles.modalImage} resizeMode="contain" />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Source chooser modal */}
      <Modal visible={sourceModalOpen} transparent animationType="fade" onRequestClose={closeSourceModal}>
        <Pressable style={styles.modalBackdrop} onPress={closeSourceModal}>
          <Pressable style={styles.sourceCard} onPress={() => {}}>
            <Text style={styles.sourceTitle}>Choose image source</Text>

            <TouchableOpacity style={styles.sourceBtn} onPress={chooseFromCamera}>
              <Ionicons name="camera-outline" size={18} color="#111" />
              <Text style={styles.sourceBtnText}>Camera</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.sourceBtn} onPress={chooseFromGallery}>
              <Ionicons name="images-outline" size={18} color="#111" />
              <Text style={styles.sourceBtnText}>Gallery</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.sourceCancel} onPress={closeSourceModal}>
              <Text style={styles.sourceCancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.topBtn}>
          <Ionicons name="arrow-back" size={22} color="#111" />
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <Text style={styles.topTitle}>Edit Business</Text>
          <Text style={styles.topSub} numberOfLines={1}>{safeText(details?.business_name, "—")}</Text>
        </View>

        <TouchableOpacity onPress={onRefresh} style={styles.topBtn}>
          <Ionicons name="refresh" size={22} color="#111" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
          {/* Images */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Images</Text>

            <Text style={styles.label}>Business Logo</Text>
            <View style={styles.imageRow}>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => displayLogoUrl && openImageModal("Business Logo", displayLogoUrl)}
                style={styles.imageBox}
              >
                {displayLogoUrl ? (
                  <Image source={{ uri: displayLogoUrl }} style={styles.image} resizeMode="cover" />
                ) : (
                  <View style={styles.imageEmpty}>
                    <Ionicons name="image-outline" size={22} color="#666" />
                    <Text style={styles.emptyText}>No logo</Text>
                  </View>
                )}
              </TouchableOpacity>

              <View style={{ flex: 1, gap: 8 }}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => openSourceModal("logo")}>
                  <Ionicons name="cloud-upload-outline" size={18} color="#111" />
                  <Text style={styles.actionText}>Change</Text>
                </TouchableOpacity>

                {pickedLogo?.uri ? (
                  <TouchableOpacity style={styles.actionBtnSoft} onPress={() => setPickedLogo(null)}>
                    <Ionicons name="close-circle-outline" size={18} color="#111" />
                    <Text style={styles.actionText}>Remove selected</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>

            <View style={styles.divider} />

            <Text style={styles.label}>License Image</Text>
            <View style={styles.imageRow}>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => displayLicenseUrl && openImageModal("License Image", displayLicenseUrl)}
                style={styles.imageBox}
              >
                {displayLicenseUrl ? (
                  <Image source={{ uri: displayLicenseUrl }} style={styles.image} resizeMode="cover" />
                ) : (
                  <View style={styles.imageEmpty}>
                    <Ionicons name="document-outline" size={22} color="#666" />
                    <Text style={styles.emptyText}>No license</Text>
                  </View>
                )}
              </TouchableOpacity>

              <View style={{ flex: 1, gap: 8 }}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => openSourceModal("license")}>
                  <Ionicons name="cloud-upload-outline" size={18} color="#111" />
                  <Text style={styles.actionText}>Change</Text>
                </TouchableOpacity>

                {displayLicenseUrl ? (
                  <TouchableOpacity style={styles.actionBtnSoft} onPress={() => openImageModal("License Image", displayLicenseUrl)}>
                    <Ionicons name="eye-outline" size={18} color="#111" />
                    <Text style={styles.actionText}>View</Text>
                  </TouchableOpacity>
                ) : null}

                {pickedLicense?.uri ? (
                  <TouchableOpacity style={styles.actionBtnSoft} onPress={() => setPickedLicense(null)}>
                    <Ionicons name="close-circle-outline" size={18} color="#111" />
                    <Text style={styles.actionText}>Remove selected</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </View>

          {/* Basic */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Basic Info</Text>

            <Label>Business Name</Label>
            <Input value={business_name} onChangeText={setBusinessName} placeholder="Business name" />

            <Label>Delivery Option</Label>
            <SelectRow value={delivery_option} onPress={() => setDeliveryModalOpen(true)} />

            {/* ✅ ADD: Min amount input */}
            <Label>Min amount for FD</Label>
            <Input
              value={min_amount_for_fd}
              onChangeText={setMinAmountForFD}
              placeholder="e.g. 6000.00"
              keyboardType="numeric"
            />
          </View>

          {/* Location */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Location</Text>

            <Label>Address</Label>
            <Input value={address} onChangeText={setAddress} placeholder="Address" multiline />

            <View style={styles.grid2}>
              <View style={{ flex: 1 }}>
                <Label>Latitude</Label>
                <Input value={latitude} onChangeText={setLatitude} placeholder="27.47..." keyboardType="numeric" />
              </View>
              <View style={{ flex: 1 }}>
                <Label>Longitude</Label>
                <Input value={longitude} onChangeText={setLongitude} placeholder="89.63..." keyboardType="numeric" />
              </View>
            </View>
          </View>

          {/* Operations */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Operations</Text>

            <View style={styles.grid2}>
              <View style={{ flex: 1 }}>
                <Label>Opening Time (HH:mm)</Label>
                <Input value={opening_time} onChangeText={setOpeningTime} placeholder="02:00" />
              </View>
              <View style={{ flex: 1 }}>
                <Label>Closing Time (HH:mm)</Label>
                <Input value={closing_time} onChangeText={setClosingTime} placeholder="22:00" />
              </View>
            </View>

            <Label>Holidays</Label>
            <Input value={holidays} onChangeText={setHolidays} placeholder="e.g. Sunday / null" />
          </View>

          {/* Promotions */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Promotions</Text>

            <Label>Special Celebration</Label>
            <Input value={special_celebration} onChangeText={setSpecialCelebration} placeholder="e.g. New Year" />

            <Label>Discount %</Label>
            <Input value={special_celebration_discount_percentage} onChangeText={setCelebrationDiscount} placeholder="10" keyboardType="numeric" />

            <Label>Complementary</Label>
            <Input value={complementary} onChangeText={setComplementary} placeholder="e.g. Free gift" />

            <Label>Complementary Details</Label>
            <Input value={complementary_details} onChangeText={setComplementaryDetails} placeholder="Explain the complementary offer" multiline />
          </View>

          {/* Save */}
          <TouchableOpacity style={[styles.saveBtn, saving ? { opacity: 0.7 } : null]} onPress={save} disabled={saving}>
            {saving ? (
              <ActivityIndicator />
            ) : (
              <>
                <Ionicons name="save-outline" size={18} color="#FFF" />
                <Text style={styles.saveText}>Save Changes</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={{ height: 18 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* ---------------- styles (UNCHANGED + small additions) ---------------- */

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F6F7FB" },

  topBar: { paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 10 },
  topBtn: {
    width: 40, height: 40, borderRadius: 14, backgroundColor: "#FFF",
    alignItems: "center", justifyContent: "center",
    ...Platform.select({
      android: { elevation: 2 },
      ios: { shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
    }),
  },
  topTitle: { fontSize: 15, fontWeight: "900", color: "#111" },
  topSub: { marginTop: 2, fontSize: 12, color: "#666" },

  content: { padding: 14, paddingBottom: 28, gap: 12 },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  muted: { marginTop: 10, fontSize: 12, color: "#666" },

  card: {
    backgroundColor: "#FFF", borderRadius: 22, padding: 14,
    ...Platform.select({
      android: { elevation: 2 },
      ios: { shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } },
    }),
  },
  cardTitle: { fontSize: 14, fontWeight: "950", color: "#111", marginBottom: 10 },

  label: { fontSize: 12, color: "#666", fontWeight: "800", marginTop: 10, marginBottom: 6 },

  inputWrap: { backgroundColor: "#F6F7FB", borderRadius: 14, borderWidth: 1, borderColor: "#E7E9F0" },
  input: { paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: "#111", fontWeight: "800" },
  inputMultiline: { minHeight: 90, textAlignVertical: "top" },

  grid2: { flexDirection: "row", gap: 10, marginTop: 4 },

  imageRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  imageBox: { width: 160, height: 120, borderRadius: 18, backgroundColor: "#EEE", overflow: "hidden" },
  image: { width: "100%", height: "100%" },
  imageEmpty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#F6F7FB" },
  emptyText: { fontSize: 12, color: "#666", fontWeight: "800" },

  actionBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14,
    backgroundColor: "#F6F7FB", borderWidth: 1, borderColor: "#E7E9F0",
  },
  actionBtnSoft: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14,
    backgroundColor: "#FFF", borderWidth: 1, borderColor: "#E7E9F0",
  },
  actionText: { fontSize: 12, fontWeight: "900", color: "#111" },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: "#EEE", marginVertical: 12 },

  saveBtn: {
    marginTop: 6, backgroundColor: "#111", borderRadius: 18,
    paddingVertical: 14, alignItems: "center", justifyContent: "center",
    flexDirection: "row", gap: 10,
  },
  saveText: { color: "#FFF", fontWeight: "950", fontSize: 13 },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", padding: 16 },
  modalCard: { width: Math.min(SCREEN_W - 32, 420), maxHeight: SCREEN_H * 0.78, backgroundColor: "#FFF", borderRadius: 18, overflow: "hidden" },
  modalHeader: {
    paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row",
    alignItems: "center", justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#EEE",
  },
  modalTitle: { fontSize: 13, fontWeight: "950", color: "#111", flex: 1, marginRight: 10 },
  modalCloseBtn: { width: 34, height: 34, borderRadius: 12, backgroundColor: "#F6F7FB", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#E7E9F0" },
  modalImage: { width: "100%", height: SCREEN_H * 0.55, backgroundColor: "#111" },

  sourceCard: { width: Math.min(SCREEN_W - 32, 360), backgroundColor: "#FFF", borderRadius: 18, padding: 14 },
  sourceTitle: { fontSize: 14, fontWeight: "950", color: "#111", marginBottom: 10 },
  sourceBtn: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 12, paddingHorizontal: 12, borderRadius: 14,
    backgroundColor: "#F6F7FB", borderWidth: 1, borderColor: "#E7E9F0",
    marginBottom: 10,
  },
  sourceBtnText: { fontSize: 13, fontWeight: "900", color: "#111" },
  sourceCancel: { paddingVertical: 10, alignItems: "center" },
  sourceCancelText: { fontSize: 13, fontWeight: "900", color: "#111" },

  selectRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "#F6F7FB",
    borderWidth: 1,
    borderColor: "#E7E9F0",
  },
  selectValue: { fontSize: 13, fontWeight: "900", color: "#111" },

  deliveryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "#F6F7FB",
    borderWidth: 1,
    borderColor: "#E7E9F0",
    marginBottom: 10,
  },
});
