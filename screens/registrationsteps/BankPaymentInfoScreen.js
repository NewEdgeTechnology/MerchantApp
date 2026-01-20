import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Modal,
  Pressable,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useNavigation, useRoute } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import HeaderWithSteps from "./HeaderWithSteps";

/* ───────── BANKS (logos only; no branches) ─────────
   Account length per your table:
   BDBL 12, BNBL 9, BOBL 9, DPNBL 12, TBank 9, DK 12
*/
const BANKS = [
  {
    code: "bdb",
    name: "Bhutan Development Bank Ltd.",
    accountLength: 12,
    logoSource: require("../../assets/bdb.png"),
  },
  {
    code: "bnb",
    name: "Bhutan National Bank Limited",
    accountLength: 9,
    logoSource: require("../../assets/bnb.png"),
  },
  {
    code: "bob",
    name: "Bank of Bhutan Limited",
    accountLength: 9,
    logoSource: require("../../assets/bob.png"),
  },
  {
    code: "drukpnb",
    name: "Druk PNB",
    accountLength: 12,
    logoSource: require("../../assets/drukpnb.png"),
  },
  {
    code: "tbank",
    name: "T Bank Ltd.",
    accountLength: 9,
    logoSource: require("../../assets/tbank.png"),
  },
  {
    code: "dk",
    name: "DK Limited Bank",
    accountLength: 12,
    logoSource: require("../../assets/dk.png"),
  },
];

export default function BankPaymentInfoScreen() {
  const navigation = useNavigation();
  const route = useRoute();

  const {
    merchant,
    serviceType = "food",
    deliveryOption = null,
    initialDeliveryOption = null,
    returnTo = null,
    owner_type = null,

    // ✅ accept from previous screen (MerchantExtrasScreen)
    idCardNo: incomingIdCardNo = null,
  } = route.params ?? {};

  const effectiveOwnerType = String(
    owner_type ?? merchant?.owner_type ?? serviceType ?? "food"
  )
    .trim()
    .toLowerCase();

  const existingBank = merchant?.bank ?? {};

  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [qrImage, setQrImage] = useState(null);

  // ✅ keep id card number in this screen too (so it’s always available to pass forward)
  const [idCardNo, setIdCardNo] = useState("");

  // Simple modal (no search / no recent)
  const [bankModalVisible, setBankModalVisible] = useState(false);

  // keyboard spacing for sticky bar
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

  // Prefill (edit mode)
  useEffect(() => {
    // ✅ prefill id card from route or merchant
    const fromRoute = incomingIdCardNo != null ? String(incomingIdCardNo) : "";
    const fromMerchant =
      merchant?.id_card_number != null ? String(merchant.id_card_number) : "";

    const cleaned = (fromRoute || fromMerchant).replace(/[^0-9]/g, "").slice(0, 11);
    if (cleaned) setIdCardNo(cleaned);

    if (!existingBank) return;
    const incomingCode =
      existingBank.bank_code ||
      BANKS.find(
        (b) =>
          b.name.toLowerCase() === String(existingBank.bank_name || "").toLowerCase()
      )?.code ||
      "";
    if (incomingCode) setBankCode(incomingCode);
    if (existingBank.account_number) setAccountNumber(String(existingBank.account_number));
    if (existingBank.account_name) setAccountName(existingBank.account_name);

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
    if (existingBank.bank_qr) setQrImage(normalizeImg(existingBank.bank_qr, "bank-qr.jpg"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedBank = useMemo(
    () => BANKS.find((b) => b.code === bankCode) || null,
    [bankCode]
  );

  // Account length validation (per bank)
  const requiredLen = selectedBank?.accountLength ?? null;
  const accountRegex = requiredLen ? new RegExp(`^\\d{${requiredLen}}$`) : /^\d{8,20}$/;
  const accountNumberValid =
    accountNumber.trim().length === 0 ? true : accountRegex.test(accountNumber.trim());

  // ✅ ID card validation (exact 11 digits)
  const idCardValid = /^\d{11}$/.test(idCardNo.trim());

  const validate = () => {
    if (!bankCode) return false;
    if (!accountNumber.trim() || !accountRegex.test(accountNumber.trim())) return false;
    if (!accountName.trim()) return false;
    if (!qrImage?.uri) return false;

    // ✅ require ID card number here too
    if (!idCardValid) return false;

    return true;
  };

  // Submit
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
      return v.split(",").map((s) => s.trim()).filter(Boolean);
    }
    if (typeof v === "object") {
      const id = v.id ?? v.value ?? v.business_type_id ?? null;
      return id != null && String(id).trim() ? [String(id).trim()] : [];
    }
    return [];
  };

  const onSubmit = () => {
    if (!validate()) {
      // more specific messages
      if (!idCardNo.trim()) {
        Alert.alert("Missing info", "Please enter your 11-digit ID card number.");
        return;
      }
      if (!idCardValid) {
        Alert.alert("Invalid ID", "ID card number must be exactly 11 digits.");
        return;
      }
      Alert.alert("Missing info", "Please complete all required fields.");
      return;
    }

    const normalizedCategoryIds = normalizeCategoryIds(
      (route.params?.merchant && route.params?.merchant.category) ??
        route.params?.initialCategory ??
        route.params?.category ??
        []
    );

    const payload = {
      ...merchant,
      // ✅ keep it inside merchant too (so it stays with the object)
      id_card_number: idCardNo.trim(),

      category: normalizedCategoryIds,
      categories: merchant?.categories ?? route.params?.merchant?.categories ?? [],
      bank: {
        bank_name: selectedBank?.name ?? "",
        bank_code: selectedBank?.code ?? "",
        account_number: accountNumber.trim(),
        account_name: accountName.trim(),
        bank_qr: qrImage,
      },
      serviceType,
      owner_type: effectiveOwnerType,
    };

    navigation.navigate("DeliveryOptionsScreen", {
      ...(route.params ?? {}),
      merchant: payload,

      // ✅ pass forward as separate param too
      idCardNo: idCardNo.trim(),

      initialCategory: normalizedCategoryIds,
      category: normalizedCategoryIds,
      serviceType,
      owner_type: effectiveOwnerType,
      initialDeliveryOption: deliveryOption ?? initialDeliveryOption ?? null,
      returnTo,
    });
  };

  const isFormValid = validate();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <HeaderWithSteps step="Step 4 of 7" />
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
            contentContainerStyle={[styles.container, { paddingBottom: 120 }]}
          >
            {/* 1) Bank (simple list dropdown) */}
            <Text style={styles.label}>
              Bank <Text style={{ color: "red" }}>*</Text>
            </Text>
            <Pressable style={styles.selectWrapper} onPress={() => setBankModalVisible(true)}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                {selectedBank?.logoSource ? (
                  <Image source={selectedBank.logoSource} style={styles.logoSm} />
                ) : (
                  <View style={[styles.logoSm, { backgroundColor: "#f3f4f6" }]} />
                )}
                <Text
                  style={[styles.selectText, !selectedBank && { color: "#9aa0a6" }]}
                  numberOfLines={1}
                >
                  {selectedBank?.name || "Select bank"}
                </Text>
              </View>
              {/* Bigger dropdown icon */}
              <View style={styles.dropdownIcon}>
                <Text allowFontScaling={false} style={styles.dropdownIconText}>
                  ▾
                </Text>
              </View>
            </Pressable>
            {!!requiredLen && (
              <Text style={styles.helperText}>Must be exactly {requiredLen} digits.</Text>
            )}

            {/* 2) Account Number */}
            <View style={{ marginBottom: 6 }}>
              <Text style={styles.label}>
                Bank Account Number <Text style={{ color: "red" }}>*</Text>
              </Text>
              <View style={[styles.inputWrapper, !accountNumberValid && styles.inputErrorBorder]}>
                <TextInput
                  style={styles.inputField}
                  placeholder={
                    requiredLen
                      ? `Enter ${requiredLen}-digit account number`
                      : "Enter account number"
                  }
                  value={accountNumber}
                  onChangeText={(t) => setAccountNumber(t.replace(/[^0-9]/g, ""))}
                  keyboardType="number-pad"
                  autoCapitalize="none"
                  placeholderTextColor="#9aa0a6"
                  returnKeyType="next"
                  maxLength={requiredLen || 20}
                />
              </View>
            </View>
            {!accountNumberValid && accountNumber.length > 0 && (
              <Text style={styles.errorText}>
                Account number must be exactly {requiredLen} digits.
              </Text>
            )}

            {/* 3) Account Holder Name */}
            <Field
              label={
                <Text>
                  Account Holder Name <Text style={{ color: "red" }}>*</Text>
                </Text>
              }
              placeholder="Enter account holder name"
              value={accountName}
              onChangeText={setAccountName}
              autoCapitalize="words"
            />

            {/* 4) Bank QR — same style as Business Logo section */}
            <Text style={styles.label}>
              Bank QR Code <Text style={{ color: "red" }}>*</Text>
            </Text>
            <QRUploader value={qrImage} onChange={setQrImage} />
          </ScrollView>

          {/* Sticky action bar */}
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

      {/* ───────── Simple Bank Picker Modal (no search, no recent) ───────── */}
      <Modal
        transparent
        animationType="fade"
        visible={bankModalVisible}
        onRequestClose={() => setBankModalVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setBankModalVisible(false)} />
        <View style={styles.modalSheet}>
          {/* Close × button */}
          <TouchableOpacity
            onPress={() => setBankModalVisible(false)}
            style={styles.modalCloseX}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Close"
          >
            <Text style={styles.modalCloseXText}>×</Text>
          </TouchableOpacity>

          <Text style={styles.modalTitle}>Select Bank</Text>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 440 }}>
            {BANKS.map((b) => {
              const active = bankCode === b.code;
              return (
                <TouchableOpacity
                  key={b.code}
                  style={[styles.bankRow, active && styles.bankRowActive]}
                  onPress={() => {
                    setBankCode(b.code);
                    setBankModalVisible(false);
                  }}
                >
                  <View style={styles.bankRowLeft}>
                    <Image source={b.logoSource} style={styles.logoLg} />
                    <Text
                      style={[styles.bankText, active && { fontWeight: "700" }]}
                      numberOfLines={2}
                    >
                      {b.name}
                    </Text>
                  </View>
                  {active ? <Text style={styles.checkMark}>✓</Text> : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* ---------- Reusable Field ---------- */
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

/* ---------- QR Uploader (matches logo style) ---------- */
function QRUploader({ value, onChange }) {
  const [busy, setBusy] = useState(false);
  const maxBytes = 5 * 1024 * 1024;

  const pickImage = async (fromCamera = false) => {
    try {
      setBusy(true);
      const permission = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== "granted") {
        Alert.alert("Permission needed", "Please allow access.");
        return;
      }
      const img = fromCamera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.9,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.9,
          });
      if (!img.canceled) {
        const a = img.assets?.[0];
        if (a?.fileSize && a.fileSize > maxBytes) {
          Alert.alert("Too large", "File must be under 5MB.");
          return;
        }
        onChange({
          name: a?.fileName ?? "bank-qr.jpg",
          uri: a?.uri,
          mimeType: a?.mimeType ?? "image/jpeg",
          size: a?.fileSize ?? 0,
        });
      }
    } catch (e) {
      Alert.alert("Upload failed", e?.message || "Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!value) {
    return (
      <View style={styles.logoCard}>
        <Text style={[styles.logoCardIcon, { color: "#9ca3af" }]}>＋</Text>
        <Text style={styles.logoCardTitle}>Add Bank QR</Text>
        <Text style={styles.logoCardHint}>Square image works best (1:1). Max 5MB.</Text>
        <View style={styles.logoActionsRow}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => pickImage(false)}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.actionBtnText}>Choose Image</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtnGhost}
            onPress={() => pickImage(true)}
            disabled={busy}
          >
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
          {(value.size / 1024).toFixed(1)} KB · {value.mimeType || "image"}
        </Text>
      </View>
      <View style={styles.logoActionsRow}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => pickImage(false)}
          disabled={busy}
        >
          <Text style={styles.actionBtnText}>Change</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionBtnGhost}
          onPress={() => onChange(null)}
          disabled={busy}
        >
          <Text style={styles.actionBtnGhostText}>Remove</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* ---------- Styles ---------- */
const styles = StyleSheet.create({
  fixedTitle: { backgroundColor: "#fff", paddingHorizontal: 20 },
  container: { paddingHorizontal: 20, backgroundColor: "#fff" },
  h1: { fontSize: 22, fontWeight: "bold", color: "#1A1D1F", marginBottom: 16 },

  label: { fontSize: 14, marginBottom: 6, color: "#333" },
  helperText: { fontSize: 12, color: "#6b7280", marginBottom: 8 },

  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    height: 50,
    borderWidth: 1.5,
    borderRadius: 15,
    borderColor: "#ccc",
    paddingHorizontal: 10,
    backgroundColor: "#fff",
  },
  inputField: { flex: 1, fontSize: 14, color: "#111827", paddingVertical: 10 },
  inputErrorBorder: { borderColor: "#ef4444" },
  errorText: { color: "#ef4444", fontSize: 12, marginBottom: 8 },

  /* Select (simple) */
  selectWrapper: {
    height: 50,
    borderWidth: 1.5,
    borderRadius: 15,
    borderColor: "#ccc",
    paddingHorizontal: 12,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  selectText: { fontSize: 14, color: "#111827", flex: 1, paddingRight: 10 },

  // Bigger dropdown icon (fix for tiny triangle)
  dropdownIcon: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  dropdownIconText: {
    fontSize: 24,
    lineHeight: 24,
    color: "#6b7280",
  },

  /* Logos / QR card */
  logoSm: { width: 24, height: 24, borderRadius: 6, resizeMode: "contain" },
  logoLg: {
    width: 42,
    height: 42,
    borderRadius: 10,
    resizeMode: "contain",
    backgroundColor: "#fff",
  },

  fileName: { fontSize: 13, color: "#374151" },
  metaText: { fontSize: 12, color: "#6b7280", marginTop: 2 },

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
  logoCardIcon: { fontSize: 32, lineHeight: 32 },
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
  },
  logoPreviewLarge: { width: "100%", height: "100%", resizeMode: "cover" },

  /* Sticky submit bar */
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

  /* Modal (simple list) */
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  modalSheet: {
    position: "absolute",
    left: 20,
    right: 20,
    top: 100,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  modalTitle: { color: "#111827", fontSize: 16, fontWeight: "700", marginBottom: 10 },

  /* Floating close × on overlay */
  modalCloseX: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(17,24,39,0.85)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  modalCloseXText: {
    color: "#fff",
    fontSize: 18,
    lineHeight: 18,
    fontWeight: "700",
  },

  bankRow: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  bankRowActive: { backgroundColor: "#f9fafb" },
  bankRowLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  bankText: { color: "#111827", fontSize: 14, flex: 1, paddingRight: 8 },
  checkMark: { fontSize: 16, color: "#00b14f", fontWeight: "700" },
});
