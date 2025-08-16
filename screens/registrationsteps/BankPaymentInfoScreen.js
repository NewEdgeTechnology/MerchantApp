import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import HeaderWithSteps from "./HeaderWithSteps";

export default function BankPaymentInfoScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();

  // Pull through anything we might need to preserve during edit → review round-trips
  const {
    merchant,
    serviceType = "food",
    deliveryOption = null,           // for preselecting later screen when editing
    initialDeliveryOption = null,    // alt name supported
    returnTo = null,                 // e.g., "ReviewSubmitScreen" when editing
    // 👇 NEW: accept owner_type if provided by previous screens
    owner_type = null,
  } = route.params ?? {};

  // 👇 NEW: derive an effective owner type (food/mart/...)
  const effectiveOwnerType = String(
    owner_type ?? merchant?.owner_type ?? serviceType ?? "food"
  )
    .trim()
    .toLowerCase();

  const existingBank = merchant?.bank ?? {};

  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [bankName, setBankName] = useState("");

  // Bank card images (front/back)
  const [bankCardFront, setBankCardFront] = useState(null);
  const [bankCardBack, setBankCardBack] = useState(null);

  // Bank QR image
  const [qrCodeImage, setQrCodeImage] = useState(null);
  const [pickingQR, setPickingQR] = useState(false);

  // Prefill state if merchant.bank exists (supports both edit and resume flows)
  useEffect(() => {
    if (existingBank) {
      if (existingBank.account_name) setAccountName(existingBank.account_name);
      if (existingBank.account_number) setAccountNumber(String(existingBank.account_number));
      if (existingBank.bank_name) setBankName(existingBank.bank_name);

      // Coerce possible incoming image values to { uri, name, mimeType, size }
      const normalizeImg = (img, fallbackName) => {
        if (!img) return null;
        if (typeof img === "string") {
          return { uri: img, name: fallbackName, mimeType: "image/jpeg", size: 0 };
        }
        return {
          uri: img.uri ?? "",
          name: img.name ?? fallbackName,
          mimeType: img.mimeType ?? "image/jpeg",
          size: img.size ?? 0,
        };
      };

      if (existingBank.bank_card_front) {
        setBankCardFront(normalizeImg(existingBank.bank_card_front, "bank-card-front.jpg"));
      }
      if (existingBank.bank_card_back) {
        setBankCardBack(normalizeImg(existingBank.bank_card_back, "bank-card-back.jpg"));
      }
      if (existingBank.bank_qr) {
        setQrCodeImage(normalizeImg(existingBank.bank_qr, "bank-qr.jpg"));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  // keyboard tracking → overlay sticky bar with uniform spacing
  const [kbHeight, setKbHeight] = useState(0);
  useEffect(() => {
    const onShow = (e) => setKbHeight(e.endCoordinates?.height ?? 0);
    const onHide = () => setKbHeight(0);

    const showSub =
      Platform.OS === "ios"
        ? Keyboard.addListener("keyboardWillShow", onShow)
        : Keyboard.addListener("keyboardDidShow", onShow);
    const hideSub =
      Platform.OS === "ios"
        ? Keyboard.addListener("keyboardWillHide", onHide)
        : Keyboard.addListener("keyboardDidHide", onHide);

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // keep spacing uniform across keyboards & devices
  const bottomSpace = Math.max(kbHeight, insets.bottom, 16);

  const validate = () => {
    if (!accountName.trim()) return false;
    if (!accountNumber.trim()) return false;
    if (!bankName.trim()) return false;
    if (!bankCardFront?.uri) return false; // require front image
    if (!bankCardBack?.uri) return false;  // require back image
    if (!qrCodeImage?.uri) return false;   // require QR
    return true;
  };

  // --- pickers
  const pickBankCardFront = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Allow photo access to upload the bank card.");
        return;
      }
      const img = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
      });
      if (!img.canceled) {
        const a = img.assets?.[0];
        setBankCardFront({
          name: a?.fileName ?? "bank-card-front.jpg",
          uri: a?.uri,
          mimeType: a?.mimeType ?? "image/jpeg",
          size: a?.fileSize ?? 0,
        });
      }
    } catch (e) {
      Alert.alert("Front card upload failed", e?.message || "Try again.");
    }
  };

  const pickBankCardBack = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Allow photo access to upload the bank card.");
        return;
      }
      const img = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
      });
      if (!img.canceled) {
        const a = img.assets?.[0];
        setBankCardBack({
          name: a?.fileName ?? "bank-card-back.jpg",
          uri: a?.uri,
          mimeType: a?.mimeType ?? "image/jpeg",
          size: a?.fileSize ?? 0,
        });
      }
    } catch (e) {
      Alert.alert("Back card upload failed", e?.message || "Try again.");
    }
  };

  const onPickQrCodeImage = async () => {
    try {
      setPickingQR(true);
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Allow photo access to upload the QR code.");
        return;
      }
      const img = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
      });
      if (!img.canceled) {
        const a = img.assets?.[0];
        setQrCodeImage({
          name: a?.fileName ?? "bank-qr.jpg",
          uri: a?.uri,
          mimeType: a?.mimeType ?? "image/jpeg",
          size: a?.fileSize ?? 0,
        });
      }
    } catch (e) {
      Alert.alert("QR upload failed", e?.message || "Try again.");
    } finally {
      setPickingQR(false);
    }
  };

  const removeFront = () => setBankCardFront(null);
  const removeBack = () => setBankCardBack(null);
  const removeQR = () => setQrCodeImage(null);

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

  const onSubmit = () => {
    if (!validate()) {
      Alert.alert("Missing info", "Please complete all required fields.");
      return;
    }

    // normalize whatever category we already have → array of IDs
    const normalizedCategoryIds = normalizeCategoryIds(
      (route.params?.merchant && route.params?.merchant.category) ??
        route.params?.initialCategory ??
        route.params?.category ??
        []
    );

    const payload = {
      ...merchant,
      // ensure category is carried inside merchant as an array of IDs
      category: normalizedCategoryIds,
      categories: merchant?.categories ?? route.params?.merchant?.categories ?? [],
      bank: {
        account_name: accountName.trim(),
        account_number: accountNumber.trim(),
        bank_name: bankName.trim(),
        bank_card_front: bankCardFront, // { uri, name, mimeType, size }
        bank_card_back: bankCardBack,   // { uri, name, mimeType, size }
        bank_qr: qrCodeImage,           // { uri, name, mimeType, size }
      },
      serviceType,
      // 👇 NEW: persist the effective owner type into the merchant snapshot
      owner_type: effectiveOwnerType,
    };

    // IMPORTANT: spread FIRST, then override with the updated merchant payload
    navigation.navigate("DeliveryOptionsScreen", {
      ...(route.params ?? {}), // keep everything coming in
      merchant: payload,       // ensure the new bank data + category + owner_type wins
      // also pass business type at root for easy access by other screens
      initialCategory: normalizedCategoryIds,
      category: normalizedCategoryIds,
      serviceType,
      // 👇 NEW: forward owner type explicitly at the root as well
      owner_type: effectiveOwnerType,
      // keep any existing choice to preselect on next screen (if present)
      initialDeliveryOption: deliveryOption ?? initialDeliveryOption ?? null,
      // if we came here from Review, let DeliveryOptions send us back there after saving
      returnTo, // e.g., "ReviewSubmitScreen"
    });
  };

  const isFormValid = validate();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <HeaderWithSteps step="Step 4 of 7" />

      {/* Fixed page title, same pattern as MerchantExtrasScreen */}
      <View style={styles.fixedTitle}>
        <Text style={styles.h1}>Bank & Payment Information</Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={{ flex: 1 }}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            // constant padding; sticky bar overlays for consistent spacing
            contentContainerStyle={[styles.container, { paddingBottom: 120 }]}
          >
            {/* Title moved out of ScrollView into fixed header */}

            <Field
              label={<Text>Bank Account Name <Text style={{ color: "red" }}>*</Text></Text>}
              placeholder="Enter account holder name"
              value={accountName}
              onChangeText={setAccountName}
              autoCapitalize="words"
            />

            <Field
              label={<Text>Bank Account Number <Text style={{ color: "red" }}>*</Text></Text>}
              placeholder="Enter account number"
              value={accountNumber}
              onChangeText={(text) => setAccountNumber(text.replace(/[^0-9]/g, ""))}
              // keyboardType="number-pad"
            />

            <Field
              label={<Text>Bank Name <Text style={{ color: "red" }}>*</Text></Text>}
              placeholder="Enter bank name"
              value={bankName}
              onChangeText={setBankName}
              autoCapitalize="words"
            />

            {/* Bank Card Front & Back (Images) */}
            <Text style={styles.label}>
              Upload Bank Card Both Back and Front <Text style={{ color: "red" }}>*</Text>
            </Text>

            {/* Front */}
            <View style={styles.row}>
              <TouchableOpacity style={styles.btnSecondary} onPress={pickBankCardFront}>
                <Text style={styles.btnSecondaryText}>Choose Front Image</Text>
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                {bankCardFront ? (
                  <View>
                    <Text numberOfLines={1} style={styles.fileName}>{bankCardFront.name}</Text>
                    <Text style={styles.metaText}>
                      {(bankCardFront.mimeType || "image")} · {formatSize(bankCardFront.size)}
                    </Text>

                    <View style={styles.previewWrap}>
                      <Image source={{ uri: bankCardFront.uri }} style={styles.previewImage} />
                      <TouchableOpacity style={styles.crossBtn} onPress={removeFront}>
                        <Text style={styles.crossText}>×</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <Text numberOfLines={1} style={styles.fileName}>No front image selected</Text>
                )}
              </View>
            </View>

            {/* Back */}
            <View style={styles.row}>
              <TouchableOpacity style={styles.btnSecondary} onPress={pickBankCardBack}>
                <Text style={styles.btnSecondaryText}>Choose Back Image</Text>
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                {bankCardBack ? (
                  <View>
                    <Text numberOfLines={1} style={styles.fileName}>{bankCardBack.name}</Text>
                    <Text style={styles.metaText}>
                      {(bankCardBack.mimeType || "image")} · {formatSize(bankCardBack.size)}
                    </Text>

                    <View style={styles.previewWrap}>
                      <Image source={{ uri: bankCardBack.uri }} style={styles.previewImage} />
                      <TouchableOpacity style={styles.crossBtn} onPress={removeBack}>
                        <Text style={styles.crossText}>×</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <Text numberOfLines={1} style={styles.fileName}>No back image selected</Text>
                )}
              </View>
            </View>

            {/* QR Code */}
            <Text style={styles.label}>
              Upload Bank QR Code <Text style={{ color: "red" }}>*</Text>
            </Text>
            {!qrCodeImage ? (
              <View style={styles.logoCard}>
                <Text style={styles.logoCardIcon}>＋</Text>
                <Text style={styles.logoCardTitle}>Add Bank QR</Text>
                <Text style={styles.logoCardHint}>Upload a clear, square QR image.</Text>
                <View style={styles.logoActionsRow}>
                  <TouchableOpacity
                    style={[styles.actionBtn, pickingQR && styles.btnDisabled]}
                    onPress={onPickQrCodeImage}
                    disabled={pickingQR}
                  >
                    {pickingQR ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionBtnText}>Choose Image</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.logoSelectedWrap}>
                <View style={styles.logoPreviewLargeWrap}>
                  <Image source={{ uri: qrCodeImage.uri }} style={styles.logoPreviewLarge} />
                  <TouchableOpacity style={styles.crossBtnLarge} onPress={removeQR}>
                    <Text style={styles.crossText}>×</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ marginTop: 8 }}>
                  <Text numberOfLines={1} style={styles.fileName}>{qrCodeImage.name}</Text>
                  <Text style={styles.metaText}>
                    {formatSize(qrCodeImage.size)} · {qrCodeImage.mimeType || "image"}
                  </Text>
                </View>
                <View style={styles.logoActionsRow}>
                  <TouchableOpacity
                    style={[styles.actionBtn, pickingQR && styles.btnDisabled]}
                    onPress={onPickQrCodeImage}
                    disabled={pickingQR}
                  >
                    {pickingQR ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionBtnText}>Change</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Sticky action bar that follows keyboard/safe-area with consistent spacing */}
          <View pointerEvents="box-none" style={[styles.fabWrap, { bottom: kbHeight }]}>
            <View style={styles.submitContainer}>
              <TouchableOpacity
                style={isFormValid ? styles.btnPrimary : styles.btnPrimaryDisabled}
                onPress={onSubmit}
                disabled={!isFormValid}
              >
                <Text style={isFormValid ? styles.btnPrimaryText : styles.btnPrimaryTextDisabled}>
                  Save & Continue
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, value, onChangeText, placeholder, keyboardType, autoCapitalize }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrapper}>
        <TextInput
          style={styles.inputField}
          placeholder={placeholder}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          placeholderTextColor="#9aa0a6"
          returnKeyType="next"
        />
      </View>
    </View>
  );
}

function formatSize(bytes = 0) {
  if (!bytes || bytes <= 0) return "—";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

const styles = StyleSheet.create({
  // NEW: fixed header title like MerchantExtrasScreen
  fixedTitle: {
    backgroundColor: "#fff",
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#fff",
  },

  container: {
    paddingHorizontal: 20,
    backgroundColor: "#fff",
  },
  h1: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#1A1D1F",
    marginBottom: 16,
  },
  label: { fontSize: 14, marginBottom: 6, color: "#333" },
  fileName: { fontSize: 13, color: "#374151" },
  metaText: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  removeText: { marginTop: 4, fontSize: 12, color: "#ef4444", fontWeight: "600" },

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

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
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

  logoCard: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#d1d5db",
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: "center",
    marginBottom: 16,
    backgroundColor: "#fafafa",
  },
  logoCardIcon: { fontSize: 32, color: "#9ca3af" },
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

  logoSelectedWrap: { marginBottom: 16, alignItems: "center" },
  logoPreviewLargeWrap: {
    width: 160,
    height: 160,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden",
    backgroundColor: "#fff",
    position: "relative",
  },
  logoPreviewLarge: { width: "100%", height: "100%", resizeMode: "cover" },

  // small preview wrapper for card images
  previewWrap: {
    width: 120,
    height: 72,
    marginTop: 6,
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    position: "relative",
    backgroundColor: "#fff",
  },
  previewImage: { width: "100%", height: "100%", resizeMode: "cover" },

  // cross buttons
  crossBtn: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(17,24,39,0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
  crossBtnLarge: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(17,24,39,0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
  crossText: { color: "#fff", fontSize: 16, lineHeight: 16, fontWeight: "700" },

  // sticky bar that overlays and follows keyboard/safe-area
  fabWrap: { position: "absolute", left: 0, right: 0 },
  submitContainer: {
    height: 100,
    backgroundColor: "#fff",
    padding: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  btnPrimary: {
    backgroundColor: "#00b14f",
    paddingVertical: 14,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  btnPrimaryDisabled: {
    backgroundColor: "#eee",
    paddingVertical: 14,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  btnPrimaryText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  btnPrimaryTextDisabled: { color: "#aaa", fontSize: 16, fontWeight: "600" },
});
