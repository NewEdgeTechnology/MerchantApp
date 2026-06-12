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
import { BRAND, FONT, RADIUS, SHADOW } from "../styles/tabdey_brand";

/* ───────── BANKS (logos only; no branches) ─────────
   Account length per your table:
   BDBL 12, BNBL 9, BOBL 9, DPNBL 12, TBank 9, DK 12
*/
const BANKS = [
  {
    code: "bdb",
    name: "Bhutan Development Bank Ltd.",
    accountLength: 12,
    logoUrl: "https://backend.tabdhey.bt/admin/uploads/logo_and_image/logo_1781242607361_9bbtkp1ykhe.webp",
  },
  {
    code: "bnb",
    name: "Bhutan National Bank Limited",
    accountLength: 9,
    logoUrl: "https://backend.tabdhey.bt/admin/uploads/logo_and_image/logo_1781242625061_ao6jqck79yk.webp",
  },
  {
    code: "bob",
    name: "Bank of Bhutan Limited",
    accountLength: 9,
    logoUrl: "https://backend.tabdhey.bt/admin/uploads/logo_and_image/logo_1781242661159_h58ix4mzvwq.webp",
  },
  {
    code: "drukpnb",
    name: "Druk PNB",
    accountLength: 12,
    logoUrl: "https://backend.tabdhey.bt/admin/uploads/logo_and_image/logo_1781242481264_kbeq81vy6jb.webp",
  },
  {
    code: "tbank",
    name: "T Bank Ltd.",
    accountLength: 9,
    logoUrl: "https://backend.tabdhey.bt/admin/uploads/logo_and_image/logo_1781243867060_4aln975xkj2.webp",
  },
  {
    code: "dk",
    name: "DK Limited Bank",
    accountLength: 12,
    logoUrl: "https://backend.tabdhey.bt/admin/uploads/logo_and_image/logo_1781242674959_pcz9u06cv49.webp",
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
    owner_type ?? merchant?.owner_type ?? serviceType ?? "food",
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
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", () => {
      setKeyboardOpen(true);
    });

    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardOpen(false);
    });

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

    const cleaned = (fromRoute || fromMerchant)
      .replace(/[^0-9]/g, "")
      .slice(0, 11);
    if (cleaned) setIdCardNo(cleaned);

    if (!existingBank) return;
    const incomingCode =
      existingBank.bank_code ||
      BANKS.find(
        (b) =>
          b.name.toLowerCase() ===
          String(existingBank.bank_name || "").toLowerCase(),
      )?.code ||
      "";
    if (incomingCode) setBankCode(incomingCode);
    if (existingBank.account_number)
      setAccountNumber(String(existingBank.account_number));
    if (existingBank.account_name) setAccountName(existingBank.account_name);

    const normalizeImg = (img, fallbackName) => {
      if (!img) return null;
      if (typeof img === "string") {
        return {
          uri: img,
          name: fallbackName,
          mimeType: "image/jpeg",
          size: 0,
        };
      }
      return {
        uri: img.uri ?? "",
        name: img.name ?? fallbackName,
        mimeType: img.mimeType ?? "image/jpeg",
        size: img.size ?? 0,
      };
    };
    if (existingBank.bank_qr)
      setQrImage(normalizeImg(existingBank.bank_qr, "bank-qr.jpg"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedBank = useMemo(
    () => BANKS.find((b) => b.code === bankCode) || null,
    [bankCode],
  );

  // Account length validation (per bank)
  const requiredLen = selectedBank?.accountLength ?? null;
  const accountRegex = requiredLen
    ? new RegExp(`^\\d{${requiredLen}}$`)
    : /^\d{8,20}$/;
  const accountNumberValid =
    accountNumber.trim().length === 0
      ? true
      : accountRegex.test(accountNumber.trim());

  // ✅ ID card validation (exact 11 digits)
  const idCardValid = /^\d{11}$/.test(idCardNo.trim());

  const validate = () => {
    if (!bankCode) return false;
    if (!accountNumber.trim() || !accountRegex.test(accountNumber.trim()))
      return false;
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
      // more specific messages
      if (!idCardNo.trim()) {
        Alert.alert(
          "Missing info",
          "Please enter your 11-digit ID card number.",
        );
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
        [],
    );

    const payload = {
      ...merchant,
      // ✅ keep it inside merchant too (so it stays with the object)
      id_card_number: idCardNo.trim(),

      category: normalizedCategoryIds,
      categories:
        merchant?.categories ?? route.params?.merchant?.categories ?? [],
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
    <SafeAreaView
      style={styles.safeArea}
      edges={["left", "top", "right", "bottom"]}
    >
      <View style={styles.topGlow} />

      <View style={styles.page}>
        <HeaderWithSteps step="Step 4 of 7" />

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.container,
              keyboardOpen && styles.containerKeyboardOpen,
            ]}
            removeClippedSubviews={false}
          >
            <View style={styles.heroCard}>
              <Text style={styles.brandLabel}>TÀBDEY MERCHANT</Text>
              <Text style={styles.h1}>Bank & payment setup</Text>
              <Text style={styles.subtitle}>
                Add your bank account and QR code for receiving merchant
                payments.
              </Text>
            </View>

            <Text style={styles.label}>
              Bank <Text style={{ color: "red" }}>*</Text>
            </Text>

            <Pressable
              style={styles.selectWrapper}
              onPress={() => setBankModalVisible(true)}
            >
              <View style={styles.selectLeft}>
                {selectedBank?.logoUrl ? (
                  <Image
                    source={{ uri: selectedBank.logoUrl }}
                    style={styles.logoSm}
                  />
                ) : (
                  <View
                    style={[styles.logoSm, { backgroundColor: "#f3f4f6" }]}
                  />
                )}

                <Text
                  style={[
                    styles.selectText,
                    !selectedBank && { color: "#9aa0a6" },
                  ]}
                  numberOfLines={1}
                >
                  {selectedBank?.name || "Select bank"}
                </Text>
              </View>

              <View style={styles.dropdownIcon}>
                <Text allowFontScaling={false} style={styles.dropdownIconText}>
                  ▾
                </Text>
              </View>
            </Pressable>

            {!!requiredLen && (
              <Text style={styles.helperText}>
                Must be exactly {requiredLen} digits.
              </Text>
            )}

            <View style={{ marginBottom: 6 }}>
              <Text style={styles.label}>
                Bank Account Number <Text style={{ color: "red" }}>*</Text>
              </Text>

              <View
                style={[
                  styles.inputWrapper,
                  !accountNumberValid && styles.inputErrorBorder,
                ]}
              >
                <TextInput
                  style={styles.inputField}
                  placeholder={
                    requiredLen
                      ? `Enter ${requiredLen}-digit account number`
                      : "Enter account number"
                  }
                  value={accountNumber}
                  onChangeText={(t) =>
                    setAccountNumber(t.replace(/[^0-9]/g, ""))
                  }
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

            <Text style={styles.label}>
              Bank QR Code <Text style={{ color: "red" }}>*</Text>
            </Text>

            <QRUploader value={qrImage} onChange={setQrImage} />

            <TouchableOpacity
              style={
                isFormValid ? styles.btnPrimary : styles.btnPrimaryDisabled
              }
              onPress={onSubmit}
              disabled={!isFormValid}
              activeOpacity={0.86}
            >
              <Text
                style={
                  isFormValid
                    ? styles.btnPrimaryText
                    : styles.btnPrimaryTextDisabled
                }
              >
                Save & Continue
              </Text>
            </TouchableOpacity>

            <View
              style={keyboardOpen ? styles.keyboardSpacer : styles.normalSpacer}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </View>

      <Modal
        transparent
        animationType="fade"
        visible={bankModalVisible}
        onRequestClose={() => setBankModalVisible(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setBankModalVisible(false)}
        />

        <View style={styles.modalSheet}>
          <TouchableOpacity
            onPress={() => setBankModalVisible(false)}
            style={styles.modalCloseX}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Close"
          >
            <Text style={styles.modalCloseXText}>×</Text>
          </TouchableOpacity>

          <Text style={styles.modalTitle}>Select Bank</Text>
          <Text style={styles.modalSubtitle}>
            Choose the bank where merchant payments should be settled.
          </Text>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: 440 }}
          >
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
                    <Image source={{ uri: b.logoUrl }} style={styles.logoLg} />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.bankText,
                          active && { color: BRAND.purple },
                        ]}
                        numberOfLines={2}
                      >
                        {b.name}
                      </Text>
                      <Text style={styles.bankSubText}>
                        {b.accountLength}-digit account number
                      </Text>
                    </View>
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
function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize,
}) {
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
        <Text style={styles.logoCardHint}>
          Square image works best (1:1). Max 5MB.
        </Text>
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

const styles = StyleSheet.create({
  safeArea: {
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
    opacity: 0.45,
  },

  page: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 0,
  },

  container: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  containerKeyboardOpen: {
    paddingBottom: Platform.OS === "ios" ? 90 : 130,
  },

  normalSpacer: {
    height: 24,
  },

  keyboardSpacer: {
    height: Platform.OS === "ios" ? 120 : 220,
  },
  heroCard: {
    backgroundColor: BRAND.white,
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 18,
    marginBottom: 18,
    ...SHADOW.sm,
  },

  brandLabel: {
    fontFamily: FONT.body,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    color: BRAND.purple,
    marginBottom: 10,
  },

  h1: {
    fontFamily: FONT.header,
    fontSize: 26,
    fontWeight: "700",
    color: BRAND.black,
    lineHeight: 32,
    marginBottom: 10,
  },

  subtitle: {
    fontFamily: FONT.body,
    fontSize: 14,
    lineHeight: 21,
    color: BRAND.grey,
  },

  label: {
    fontFamily: FONT.body,
    fontSize: 14,
    marginBottom: 7,
    color: BRAND.black,
    fontWeight: "700",
  },

  helperText: {
    fontFamily: FONT.body,
    fontSize: 12,
    color: BRAND.grey,
    marginBottom: 14,
    marginTop: -4,
  },

  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    height: 56,
    borderWidth: 1.2,
    borderRadius: 18,
    backgroundColor: "#FCFCFC",
    borderColor: BRAND.greyBorder,
    paddingHorizontal: 16,
  },

  inputField: {
    flex: 1,
    fontFamily: FONT.body,
    fontSize: 15,
    color: BRAND.black,
    paddingVertical: 10,
  },

  inputErrorBorder: {
    borderColor: "#ef4444",
  },

  errorText: {
    color: "#ef4444",
    fontSize: 12,
    marginBottom: 10,
    fontFamily: FONT.body,
  },

  selectWrapper: {
    height: 58,
    borderWidth: 1.2,
    borderRadius: 18,
    borderColor: BRAND.greyBorder,
    paddingHorizontal: 14,
    backgroundColor: BRAND.white,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    ...SHADOW.sm,
  },

  selectLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },

  selectText: {
    fontFamily: FONT.body,
    fontSize: 15,
    color: BRAND.black,
    flex: 1,
    paddingRight: 10,
    fontWeight: "600",
  },

  dropdownIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F4ECFF",
    alignItems: "center",
    justifyContent: "center",
  },

  dropdownIconText: {
    fontSize: 24,
    lineHeight: 24,
    color: BRAND.purple,
    fontWeight: "700",
  },

  logoSm: {
    width: 30,
    height: 30,
    borderRadius: 8,
    resizeMode: "contain",
    backgroundColor: BRAND.white,
  },

  logoLg: {
    width: 46,
    height: 46,
    borderRadius: 12,
    resizeMode: "contain",
    backgroundColor: BRAND.white,
  },

  fileName: {
    fontSize: 13,
    color: BRAND.black,
    fontWeight: "600",
    fontFamily: FONT.body,
  },

  metaText: {
    fontSize: 12,
    color: BRAND.grey,
    marginTop: 2,
    fontFamily: FONT.body,
  },

  logoCard: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: BRAND.purple,
    borderRadius: 24,
    paddingVertical: 24,
    paddingHorizontal: 18,
    alignItems: "center",
    marginBottom: 16,
    backgroundColor: "#FCFCFC",
  },

  logoCardIcon: {
    fontSize: 34,
    color: BRAND.purple,
  },

  logoCardTitle: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: "700",
    color: BRAND.black,
    fontFamily: FONT.body,
  },

  logoCardHint: {
    marginTop: 4,
    fontSize: 12,
    color: BRAND.grey,
    fontFamily: FONT.body,
  },

  logoActionsRow: {
    marginTop: 14,
    flexDirection: "row",
    gap: 10,
  },

  actionBtn: {
    backgroundColor: BRAND.purple,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: RADIUS.pill,
  },

  actionBtnText: {
    color: BRAND.white,
    fontWeight: "700",
    fontFamily: FONT.body,
  },

  actionBtnGhost: {
    backgroundColor: BRAND.white,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: RADIUS.pill,
    borderWidth: 1.2,
    borderColor: BRAND.greyBorder,
  },

  actionBtnGhostText: {
    color: BRAND.black,
    fontWeight: "700",
    fontFamily: FONT.body,
  },

  logoSelectedWrap: {
    marginBottom: 16,
    alignItems: "center",
  },

  logoPreviewLargeWrap: {
    width: 150,
    height: 150,
    borderRadius: 30,
    overflow: "hidden",
    backgroundColor: BRAND.white,
    ...SHADOW.sm,
  },

  logoPreviewLarge: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },

  btnPrimary: {
    backgroundColor: BRAND.purple,
    paddingVertical: 16,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    marginTop: 8,
    marginBottom: 16,
    ...SHADOW.md,
  },

  btnPrimaryDisabled: {
    backgroundColor: BRAND.greyLight,
    paddingVertical: 16,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    marginTop: 8,
    marginBottom: 16,
  },

  btnPrimaryText: {
    color: BRAND.white,
    fontSize: 16,
    fontWeight: "700",
    fontFamily: FONT.body,
  },

  btnPrimaryTextDisabled: {
    color: BRAND.grey,
    fontSize: 16,
    fontWeight: "600",
    fontFamily: FONT.body,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
  },

  modalSheet: {
    position: "absolute",
    left: 20,
    right: 20,
    top: 95,
    backgroundColor: BRAND.white,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: "#EFE7F7",
    ...SHADOW.md,
  },

  modalTitle: {
    color: BRAND.black,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
    fontFamily: FONT.header,
  },

  modalSubtitle: {
    color: BRAND.grey,
    fontSize: 12,
    marginBottom: 12,
    fontFamily: FONT.body,
  },

  modalCloseX: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#F4ECFF",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },

  modalCloseXText: {
    color: BRAND.purple,
    fontSize: 20,
    lineHeight: 20,
    fontWeight: "700",
  },

  bankRow: {
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 18,
    marginBottom: 8,
    backgroundColor: "#FCFCFC",
    borderWidth: 1,
    borderColor: BRAND.greyBorder,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },

  bankRowActive: {
    backgroundColor: "#F4ECFF",
    borderColor: BRAND.purple,
  },

  bankRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },

  bankText: {
    color: BRAND.black,
    fontSize: 14,
    flex: 1,
    paddingRight: 8,
    fontWeight: "700",
    fontFamily: FONT.body,
  },

  bankSubText: {
    color: BRAND.grey,
    fontSize: 11,
    marginTop: 3,
    fontFamily: FONT.body,
  },

  checkMark: {
    fontSize: 18,
    color: BRAND.purple,
    fontWeight: "800",
  },
});
