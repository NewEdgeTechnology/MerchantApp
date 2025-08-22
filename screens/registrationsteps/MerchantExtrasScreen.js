import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  SafeAreaView,
  Keyboard,
  Image,
  ActivityIndicator,
  Modal,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import MapView, { Marker } from "react-native-maps";
import { useNavigation, useRoute } from "@react-navigation/native";
import HeaderWithSteps from "./HeaderWithSteps";

const NEXT_ROUTE = "BankPaymentInfoScreen";

export default function MerchantExtrasScreen() {
  const navigation = useNavigation();
  const route = useRoute();

  // received from previous page
  const {
    merchant: incomingMerchant = null,

    // business basics from previous page (Step: Business Details)
    initialFullName = "",
    initialBusinessName = "",
    initialCategory = "", // can be string, comma-separated, array of IDs, or array of objects

    // optional prefill when editing from Review
    initialAddress = "",
    initialRegNo = "",
    initialPickedCoord = null, // { latitude, longitude }
    initialLogo = null,
    initialLicenseFile = null,

    // delivery + flow control
    deliveryOption = null,
    returnTo = null,

    // contact that might have been sent loosely (older flow)
    phoneNumber = null,

    // keep whatever serviceType the funnel is using, fallback to "food"
    serviceType = "food",

    owner_type = null,
  } = route.params ?? {};

  const effectiveOwnerType = String(
    owner_type ?? incomingMerchant?.owner_type ?? serviceType ?? "food"
  )
    .trim()      
    .toLowerCase();

  // files
  const [licenseFile, setLicenseFile] = useState(null); // OPTIONAL
  const [logo, setLogo] = useState(null); // REQUIRED

  // address + map
  const [address, setAddress] = useState("");
  const [locationModalVisible, setLocationModalVisible] = useState(false);
  const [pickedCoord, setPickedCoord] = useState(null); // { latitude, longitude }
  const [mapRegion, setMapRegion] = useState({
    latitude: 27.4728,
    longitude: 89.639,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  });

  // Business License number
  const [regNo, setRegNo] = useState("");

  const [focusedField, setFocusedField] = useState(null);
  const [pickingLicense, setPickingLicense] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ---- Prefill from merchant, or fall back to initial* params when editing ----
  useEffect(() => {
    // Prefer values from merchant snapshot if present
    if (incomingMerchant) {
      if (incomingMerchant.registration_no) setRegNo(String(incomingMerchant.registration_no));
      if (incomingMerchant.address) setAddress(incomingMerchant.address);

      const lat = incomingMerchant.latitude ?? null;
      const lng = incomingMerchant.longitude ?? null;
      if (typeof lat === "number" && typeof lng === "number") {
        const coord = { latitude: lat, longitude: lng };
        setPickedCoord(coord);
        setMapRegion((r) => ({ ...r, latitude: lat, longitude: lng }));
      }

      const normalizeImg = (img, fallback) => {
        if (!img) return null;
        if (typeof img === "string")
          return { uri: img, name: fallback, mimeType: "image/jpeg", size: 0 };
        return {
          uri: img.uri ?? "",
          name: img.name ?? fallback,
          mimeType: img.mimeType ?? "image/jpeg",
          size: img.size ?? 0,
        };
      };
      if (incomingMerchant.logo) setLogo(normalizeImg(incomingMerchant.logo, "logo.jpg"));
      if (incomingMerchant.license) setLicenseFile(normalizeImg(incomingMerchant.license, "license"));
    }

    // Fallbacks from initial* if merchant didn’t carry them
    if (!incomingMerchant?.address && initialAddress) setAddress(initialAddress);
    if (!incomingMerchant?.registration_no && initialRegNo) setRegNo(String(initialRegNo));
    if (!incomingMerchant?.latitude && !incomingMerchant?.longitude && initialPickedCoord) {
      setPickedCoord(initialPickedCoord);
      setMapRegion((r) => ({
        ...r,
        latitude: initialPickedCoord.latitude,
        longitude: initialPickedCoord.longitude,
      }));
    }
    if (!incomingMerchant?.logo && initialLogo) setLogo(initialLogo);
    if (!incomingMerchant?.license && initialLicenseFile) setLicenseFile(initialLicenseFile);
  }, [
    incomingMerchant,
    initialAddress,
    initialRegNo,
    initialPickedCoord,
    initialLogo,
    initialLicenseFile,
  ]);

  // keyboard-aware bottom bar
  const [kbHeight, setKbHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", (e) => {
      setKbHeight(e.endCoordinates?.height ?? 0);
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => setKbHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const validate = () => {
    if (!toSafeString(address).trim()) return false;
    if (!logo?.uri) return false;
    if (!toSafeString(regNo).trim()) return false;
    return true;
  };

  // ===== Upload: License (Image only) — OPTIONAL
  const onPickLicense = async () => {
    try {
      setPickingLicense(true);
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Allow photo access to upload your business license.");
        return;
      }
      const img = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.9,
      });
      if (!img.canceled) {
        const a = img.assets?.[0];
        setLicenseFile({
          name: a?.fileName ?? "license.jpg",
          uri: a?.uri,
          mimeType: a?.mimeType ?? "image/jpeg",
          size: a?.fileSize ?? 0,
        });
      }
    } catch (e) {
      Alert.alert("Upload failed", e?.message || "Try again.");
    } finally {
      setPickingLicense(false);
    }
  };

  const onRemoveLicense = () => setLicenseFile(null);

  // ===== Map picking =====
  const openMapPicker = () => setLocationModalVisible(true);
  const closeMapPicker = () => setLocationModalVisible(false);

  const onMapLongPress = useCallback((e) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setPickedCoord({ latitude, longitude });
  }, []);

  const confirmPickedLocation = () => {
    if (!pickedCoord) {
      Alert.alert("Pick a location", "Long-press on the map to drop a pin.");
      return;
    }
    const label = `Located at: ${pickedCoord.latitude.toFixed(5)}, ${pickedCoord.longitude.toFixed(5)}`;
    setAddress(label);
    setMapRegion((r) => ({
      ...r,
      latitude: pickedCoord.latitude,
      longitude: pickedCoord.longitude,
    }));
    closeMapPicker();
  };

  // ===== Submit → Redirect to BankPaymentInfoScreen =====
  const onSubmit = async () => {
    if (!validate()) {
      if (!logo?.uri) {
        Alert.alert("Missing required field", "Please upload your business logo.");
        return;
      }
      if (!toSafeString(address).trim()) {
        Alert.alert("Missing address", "Please add your business address.");
        return;
      }
      if (!toSafeString(regNo).trim()) {
        Alert.alert("Missing license number", "Please enter your Business License number.");
        return;
      }
      return;
    }

    try {
      setSubmitting(true);

      // ✅ Normalize business type(s) to an array of IDS (strings)
      const normalizedCategoryIds = normalizeCategoryIds(
        (incomingMerchant && incomingMerchant.category) ?? initialCategory
      );

      // Merge with latest values while keeping previously captured info
      const mergedMerchant = {
        ...(incomingMerchant ?? {}),

        // keep email / password if they already exist
        email: incomingMerchant?.email ?? undefined,
        password: incomingMerchant?.password ?? undefined,

        // ensure phone is carried over even if it came as a loose param
        phone: incomingMerchant?.phone ?? phoneNumber ?? undefined,

        // overwrite with latest values from this screen + page 1 basics
        full_name: toSafeString(incomingMerchant?.full_name ?? initialFullName).trim(),
        business_name: toSafeString(incomingMerchant?.business_name ?? initialBusinessName).trim(),

        // ✅ pass selected business type(s) as an array of IDS
        category: normalizedCategoryIds,
        categories: incomingMerchant?.categories ?? route.params?.merchant?.categories ?? [],

        registration_no: toSafeString(regNo).trim(),
        address: toSafeString(address).trim(),
        latitude: pickedCoord?.latitude ?? null,
        longitude: pickedCoord?.longitude ?? null,

        logo, // { uri, name, mimeType, size }
        license: licenseFile, // may be null

        owner_type: effectiveOwnerType,
      };

      navigation.navigate(NEXT_ROUTE, {
        ...(route.params ?? {}),                       // keep everything (returnTo, etc.)
        merchant: mergedMerchant,                      // ✅ latest merged snapshot
        serviceType: serviceType ?? "food",            // preserve incoming serviceType
        owner_type: effectiveOwnerType,                // 👈 forward it explicitly as well
        initialDeliveryOption: deliveryOption ?? null, // preselect later
        returnTo,                                      // so later steps can bounce back to Review
        // Also pass along initialCategory as array of IDs for downstream screens
        initialCategory: normalizedCategoryIds,
      });
    } catch (e) {
      Alert.alert("Error", e?.message || "Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const isFormValid = validate();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      {/* If this is truly Step 4 in your flow, feel free to change this label */}
      <HeaderWithSteps step="Step 3 of 7" />

      <View style={styles.fixedTitle}>
        <Text style={styles.h1}>Business Details</Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={[styles.container, { paddingBottom: 120 + kbHeight }]}
            keyboardShouldPersistTaps="handled"
          >
            {/* ===== Business location (map) ===== */}
            <Text style={[styles.label, { marginTop: 6 }]}>Business location (map) — optional</Text>
            <View style={{ marginBottom: 8 }}>
              <TouchableOpacity style={styles.btnSecondary} onPress={openMapPicker}>
                <Text style={styles.btnSecondaryText}>Select on full map</Text>
              </TouchableOpacity>
            </View>

            {pickedCoord ? (
              <>
                <View style={styles.mapPreviewWrapperLarge}>
                  <MapView style={styles.mapPreview} region={mapRegion} pointerEvents="none">
                    <Marker coordinate={pickedCoord} />
                  </MapView>
                  <TouchableOpacity
                    accessible
                    accessibilityRole="button"
                    accessibilityLabel="Edit location on full map"
                    activeOpacity={0.9}
                    style={styles.previewOverlay}
                    onPress={openMapPicker}
                  >
                    <Text style={styles.previewOverlayText}>Tap to edit on map</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.coordsBlock}>
                  <Text style={styles.coordsLabel}>Latitude</Text>
                  <Text style={styles.coordsValue}>{pickedCoord.latitude.toFixed(6)}</Text>
                  <Text style={[styles.coordsLabel, { marginTop: 6 }]}>Longitude</Text>
                  <Text style={styles.coordsValue}>{pickedCoord.longitude.toFixed(6)}</Text>
                </View>
              </>
            ) : (
              <Text style={styles.fileName}>
                No location selected yet. Tap “Select on full map” to drop a pin.
              </Text>
            )}

            {/* ===== Business Address (text) ===== */}
            <Field
              label={
                <Text>
                  Business address <Text style={{ color: "red" }}>*</Text>
                </Text>
              }
              placeholder="Street, city, region"
              value={address}
              onChangeText={setAddress}
              onFocus={() => setFocusedField("address")}
              onBlur={() => setFocusedField(null)}
              isFocused={focusedField === "address"}
              hint={pickedCoord ? "Auto-filled from map; you can edit." : undefined}
            />

            {/* ===== Logo Upload (REQUIRED) ===== */}
            <Text style={styles.label}>
              Business logo <Text style={{ color: "red" }}>*</Text>
            </Text>
            <LogoUploader value={logo} onChange={setLogo} />

            {/* ===== Business License number ===== */}
            <Field
              label={
                <Text>
                  Business License number <Text style={{ color: "red" }}>*</Text>
                </Text>
              }
              placeholder="e.g., BRN-12345"
              value={regNo}
              onChangeText={setRegNo}
              onFocus={() => setFocusedField("regNo")}
              onBlur={() => setFocusedField(null)}
              isFocused={focusedField === "regNo"}
            />

            {/* ===== License Upload (OPTIONAL) ===== */}
            <Text style={styles.label}>Business license / registration document (optional)</Text>
            <View style={styles.row}>
              <TouchableOpacity
                style={[styles.btnSecondary, pickingLicense && styles.btnDisabled]}
                onPress={onPickLicense}
                disabled={pickingLicense}
              >
                {pickingLicense ? (
                  <ActivityIndicator />
                ) : (
                  <Text style={styles.btnSecondaryText}>Choose File</Text>
                )}
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                {licenseFile ? (
                  <View>
                    <Text style={styles.fileName} numberOfLines={1}>
                      {licenseFile.name}
                    </Text>
                    <Text style={styles.metaText}>
                      {(licenseFile.mimeType || "file")} · {formatSize(licenseFile.size)}
                    </Text>
                    <TouchableOpacity onPress={onRemoveLicense}>
                      <Text style={styles.removeText}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text numberOfLines={1} style={styles.fileName}>
                    No file selected
                  </Text>
                )}
              </View>
            </View>
          </ScrollView>

          {/* Bottom bar: Submit (on page 2) */}
          <View pointerEvents="box-none" style={[styles.fabWrap, { bottom: kbHeight }]}>
            <View style={styles.submitContainer}>
              <TouchableOpacity
                style={isFormValid && !submitting ? styles.btnPrimary : styles.btnPrimaryDisabled}
                onPress={onSubmit}
                disabled={!isFormValid || submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={isFormValid ? styles.btnPrimaryText : styles.btnPrimaryTextDisabled}>
                    Submit
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* ===== Map Picker Modal ===== */}
      <Modal
        visible={locationModalVisible}
        onRequestClose={closeMapPicker}
        animationType="slide"
        presentationStyle="fullScreen"
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Location</Text>
            <TouchableOpacity onPress={closeMapPicker}>
              <Text style={styles.modalClose}>Close</Text>
            </TouchableOpacity>
          </View>

          <MapView
            style={{ flex: 1 }}
            initialRegion={mapRegion}
            onRegionChangeComplete={setMapRegion}
            onLongPress={onMapLongPress}
          >
            {pickedCoord && (
              <Marker
                coordinate={pickedCoord}
                draggable
                onDragEnd={(e) => setPickedCoord(e.nativeEvent.coordinate)}
              />
            )}
          </MapView>

          <View style={styles.modalFooter}>
            <Text style={styles.modalHint}>
              Long‑press to drop a pin. Drag to adjust. Press Confirm when done.
            </Text>
            <TouchableOpacity style={styles.btnPrimary} onPress={confirmPickedLocation}>
              <Text style={styles.btnPrimaryText}>Confirm</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

/** ---------------- Logo Uploader Component ---------------- */
function LogoUploader({ value, onChange }) {
  const [busy, setBusy] = useState(false);
  const maxBytes = 5 * 1024 * 1024; // 5MB

  const pickFromGallery = async () => {
    try {
      setBusy(true);
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Allow photo access to upload a logo.");
        return;
      }
      const img = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });
      if (!img.canceled) {
        const a = img.assets?.[0];
        if (a?.fileSize && a.fileSize > maxBytes) {
          Alert.alert("Too large", "Logo must be under 5MB.");
          return;
        }
        onChange({
          name: a?.fileName ?? "logo.jpg",
          uri: a?.uri,
          mimeType: a?.mimeType ?? "image/jpeg",
          size: a?.fileSize ?? 0,
        });
      }
    } catch (e) {
      Alert.alert("Logo upload failed", e?.message || "Try again.");
    } finally {
      setBusy(false);
    }
  };

  const takePhoto = async () => {
    try {
      setBusy(true);
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Allow camera access to take a logo photo.");
        return;
      }
      const img = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });
      if (!img.canceled) {
        const a = img.assets?.[0];
        if (a?.fileSize && a.fileSize > maxBytes) {
          Alert.alert("Too large", "Logo must be under 5MB.");
          return;
        }
        onChange({
          name: a?.fileName ?? "logo.jpg",
          uri: a?.uri,
          mimeType: a?.mimeType ?? "image/jpeg",
          size: a?.fileSize ?? 0,
        });
      }
    } catch (e) {
      Alert.alert("Camera error", e?.message || "Try again.");
    } finally {
      setBusy(false);
    }
  };

  const remove = () => onChange(null);

  if (!value) {
    return (
      <View style={styles.logoCard}>
        <Text style={styles.logoCardIcon}>＋</Text>
        <Text style={styles.logoCardTitle}>Upload logo</Text>
        <Text style={styles.logoCardHint}>Square image works best (1:1). Max 5MB.</Text>

        <View style={styles.logoActionsRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={pickFromGallery} disabled={busy}>
            {busy ? <ActivityIndicator /> : <Text style={styles.actionBtnText}>Choose Image</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtnGhost} onPress={takePhoto} disabled={busy}>
            <Text style={styles.actionBtnGhostText}>Take Photo</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.logoSelectedWrap}>
      <View style={styles.logoPreviewLargeWrap}>
        <Image source={{ uri: value.uri }} style={styles.logoPreviewLarge} />
      </View>
      <View style={{ marginTop: 8 }}>
        <Text numberOfLines={1} style={styles.fileName}>
          {value.name}
        </Text>
        <Text style={styles.metaText}>
          {formatSize(value.size)} · {value.mimeType || "image"}
        </Text>
      </View>

      <View style={styles.logoActionsRow}>
        <TouchableOpacity style={styles.actionBtn} onPress={pickFromGallery} disabled={busy}>
          {busy ? <ActivityIndicator /> : <Text style={styles.actionBtnText}>Change</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtnGhost} onPress={remove} disabled={busy}>
          <Text style={styles.actionBtnGhostText}>Remove</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/** ---------------- Field ---------------- */
function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize,
  onFocus,
  onBlur,
  isFocused,
  hint,
}) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputWrapper, { borderColor: isFocused ? "#00b14f" : "#ccc" }]}>
        <TextInput
          style={styles.inputField}
          placeholder={placeholder}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          placeholderTextColor="#9aa0a6"
          onFocus={onFocus}
          onBlur={onBlur}
          returnKeyType="next"
        />
      </View>
      {!!hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

// === helpers ===
function formatSize(bytes = 0) {
  if (!bytes || bytes <= 0) return "—";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}
function guessMimeFromName(name = "") {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".heic")) return "image/heic";
  return null;
}

// --- value normalizers so .trim() is always safe ---
const toSafeString = (v) => {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (Array.isArray(v)) return v.join(",");
  if (typeof v === "object") return String(v.label ?? v.value ?? "");
  return "";
};

// ✅ Normalize category to an array of **IDs** (strings)
const normalizeCategoryIds = (v) => {
  if (!v) return [];
  if (Array.isArray(v)) {
    return v
      .map((item) => {
        if (typeof item === "object") {
          const id = item.id ?? item.value ?? item.business_type_id ?? null;
          return id != null ? String(id).trim() : "";
        }
        return String(item).trim();
      })
      .filter(Boolean);
  }
  if (typeof v === "string") {
    // supports CSV of IDs: "2,5,8"
    return v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (typeof v === "object") {
    const id = v.id ?? v.value ?? v.business_type_id ?? null;
    return id != null && String(id).trim() ? [String(id).trim()] : [];
  }
  return [];
};

/* ===== Styles ===== */
const styles = StyleSheet.create({
  /* Header */
  fixedTitle: {
    backgroundColor: "#fff",
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#fff",
  },
  h1: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#1A1D1F",
  },

  /* Layout */
  container: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  section: {
    marginTop: 6,
    marginBottom: 8,
    fontSize: 16,
    fontWeight: "700",
  },

  /* Typography */
  label: { fontSize: 14, marginBottom: 6, color: "#333" },
  fileName: { fontSize: 13, color: "#374151" },
  metaText: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  removeText: { marginTop: 4, fontSize: 12, color: "#ef4444", fontWeight: "600" },
  hint: { marginTop: 6, fontSize: 12, color: "#DC2626" },

  /* Inputs */
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    height: 50,
    borderWidth: 1.5,
    borderRadius: 15,
    backgroundColor: "#fff",
    borderColor: "#ccc",
    paddingHorizontal: 10,
  },
  inputField: { flex: 1, fontSize: 14, paddingVertical: 10 },

  /* Rows / Buttons (secondary) */
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  btnSecondary: {
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  btnSecondaryText: { fontWeight: "700" },
  btnDisabled: { opacity: 0.6 },

  /* Map preview */
  mapPreviewWrapperLarge: {
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "ccc",
    height: 180,
    marginBottom: 8,
    position: "relative",
  },
  mapPreview: { flex: 1 },
  previewOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 8,
    backgroundColor: "rgba(0,0,0,0.0)",
  },
  previewOverlayText: {
    fontSize: 12,
    fontWeight: "700",
    backgroundColor: "rgba(17,24,39,0.6)",
    color: "#fff",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
  },

  /* Coords block */
  coordsBlock: { paddingVertical: 6 },
  coordsLabel: { fontSize: 12, color: "#6B7280" },
  coordsValue: { fontSize: 14, color: "#111827", fontWeight: "600" },

  /* ---------- Logo Uploader styles ---------- */
  logoCard: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#d1d5db",
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: "center",
    marginBottom: 12,
    backgroundColor: "#fafafa",
  },
  logoCardIcon: { fontSize: 32, lineHeight: 32, color: "#9ca3af" },
  logoCardTitle: { marginTop: 8, fontSize: 15, fontWeight: "700", color: "#111827" },
  logoCardHint: { marginTop: 4, fontSize: 12, color: "#6b7280" },
  logoActionsRow: { marginTop: 12, flexDirection: "row", gap: 10 },
  actionBtn: {
    backgroundColor: "#00b14f",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  actionBtnText: { color: "#fff", fontWeight: "700" },
  actionBtnGhost: {
    backgroundColor: "#f3f4f6",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  actionBtnGhostText: { color: "#111827", fontWeight: "700" },

  logoSelectedWrap: { marginBottom: 12, alignItems: "center" },
  logoPreviewLargeWrap: {
    width: 128,
    height: 128,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden",
    backgroundColor: "#fff",
  },
  logoPreviewLarge: { width: "100%", height: "100%", resizeMode: "cover" },

  /* Floating bottom bar + Submit */
  fabWrap: { position: "absolute", left: 0, right: 0 },
  submitContainer: {
    height: 100,
    backgroundColor: "#fff",
    padding: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: -2 },
    elevation: 6,
  },

  btnPrimary: {
    backgroundColor: "#00b14f",
    paddingVertical: 14,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    marginTop: 6,
    marginBottom: 10,
    elevation: 15,
    shadowColor: "#00b14f",
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  btnPrimaryDisabled: {
    backgroundColor: "#eee",
    paddingVertical: 14,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    marginTop: 6,
    marginBottom: 6,
  },
  btnPrimaryText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  btnPrimaryTextDisabled: { color: "#aaa", fontSize: 16, fontWeight: "600" },

  /* Map modal */
  modalHeader: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#111827" },
  modalClose: { fontSize: 14, fontWeight: "600", color: "#ef4444" },
  modalFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    backgroundColor: "#fff",
  },
  modalHint: { fontSize: 12, color: "#6B7280", marginBottom: 8 },
});
