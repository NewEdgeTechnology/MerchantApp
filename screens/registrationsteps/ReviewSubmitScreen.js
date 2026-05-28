// screens/registrationsteps/ReviewSubmitScreen.js
import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import HeaderWithSteps from "./HeaderWithSteps";
import { BRAND, FONT, RADIUS, SHADOW } from "../styles/tabdey_brand";
import { SEND_OTP_ENDPOINT, SEND_OTP_REGISTER_SMS_ENDPOINT } from "@env";

/* ───────────────────────── Routes ───────────────────────── */
const EDIT_SIGNUP_ROUTE = "SignupScreen";
const EDIT_PHONE_ROUTE = "PhoneNumberScreen";
const EDIT_BUSINESS_ROUTE = "MerchantRegistrationScreen";
const EDIT_BANK_ROUTE = "BankPaymentInfoScreen";
const EDIT_DELIVERY_ROUTE = "DeliveryOptionsScreen";
const NEXT_ROUTE = "EmailOtpVerificationScreen";

// ✅ NEW: Terms / Privacy screens
const TERMS_ROUTE = "TermsOfServiceScreen";
const PRIVACY_ROUTE = "PrivacyPolicyScreen";

/* ─────────────────────── Normalizers ─────────────────────── */
const normalizeCategoryIds = (v) => {
  if (!v) return [];
  if (Array.isArray(v)) {
    return v
      .map((item) => {
        if (item && typeof item === "object") {
          const id =
            item.id ??
            item.value ??
            item.business_type_id ??
            item.businessTypeId ??
            null;
          return id != null ? String(id).trim() : "";
        }
        return String(item ?? "").trim();
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
    const id =
      v.id ?? v.value ?? v.business_type_id ?? v.businessTypeId ?? null;
    return id != null && String(id).trim() ? [String(id).trim()] : [];
  }
  return [];
};

const DELIVERY_ENUMS = ["self", "grab", "both"];
const normalizeDeliveryOption = (val) => {
  if (val == null) return null;
  if (typeof val === "object") {
    const raw = val.value ?? val.id ?? val.key ?? val.code ?? val.type ?? null;
    if (raw != null) return normalizeDeliveryOption(raw);
    return null;
  }
  if (typeof val === "number") {
    const by0 = { 0: "self", 1: "grab", 2: "both" }[val];
    const by1 = { 1: "self", 2: "grab", 3: "both" }[val];
    return by0 || by1 || null;
  }
  const s = String(val).toLowerCase().trim();
  if (DELIVERY_ENUMS.includes(s)) return s;
  if (/^self/.test(s)) return "self";
  if (/^grab/.test(s)) return "grab";
  if (/^both|^self\s*\+\s*grab|^grab\s*\+\s*self/.test(s)) return "both";
  return null;
};

const deliveryDisplay = (norm) =>
  norm === "self"
    ? "Self Delivery"
    : norm === "grab"
      ? "Grab Delivery"
      : norm === "both"
        ? "Both"
        : "—";

/* ─────────────── File presence helpers (uri-ish) ─────────────── */
const firstNonEmpty = (...vals) =>
  vals.find((v) => {
    if (v == null) return false;
    if (typeof v === "string") return v.trim().length > 0;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "object") return true;
    return false;
  });

const extractUriLike = (v) => {
  if (!v) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "object") {
    const s =
      (typeof v.uri === "string" && v.uri.trim()) ||
      (typeof v.url === "string" && v.url.trim()) ||
      (typeof v.path === "string" && v.path.trim()) ||
      (typeof v.file?.uri === "string" && v.file.uri.trim()) ||
      (typeof v.file?.url === "string" && v.file.url.trim()) ||
      (typeof v.file?.path === "string" && v.file.path.trim()) ||
      "";
    return s;
  }
  return "";
};

const isUploaded = (v) => {
  const picked = firstNonEmpty(
    v,
    typeof v === "object" ? v?.uri : null,
    typeof v === "object" ? v?.url : null,
    typeof v === "object" ? v?.path : null,
  );
  const uri = extractUriLike(picked);
  return !!uri;
};

// ✅ CID/ID card normalizer (digits only, max 11)
const normalizeCid11 = (v) =>
  String(v || "")
    .replace(/[^0-9]/g, "")
    .slice(0, 11);

/* ─────────────────── Verify Choice Modal ─────────────────── */
function VerifyChoiceModal({ visible, onClose, onSms, onEmail, emailEnabled }) {
  if (!visible) return null;

  return (
    <View style={modalStyles.overlay}>
      <View style={modalStyles.card}>
        <View style={modalStyles.headerRow}>
          <Text style={modalStyles.title}>Verify your account</Text>

          <TouchableOpacity
            onPress={onClose}
            activeOpacity={1}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={modalStyles.closeBtn}
          >
            <Ionicons name="close" size={20} color="#111827" />
          </TouchableOpacity>
        </View>

        <Text style={modalStyles.subtitle}>
          Choose how you want to receive the OTP.
        </Text>

        {/* SMS FIRST (neutral) */}
        <TouchableOpacity
          style={modalStyles.neutralBtn}
          onPress={onSms}
          activeOpacity={1}
        >
          <View style={modalStyles.btnRow}>
            <Text style={modalStyles.neutralText}>SEND SMS</Text>
            <View style={modalStyles.badge}>
              <Text style={modalStyles.badgeText}>RECOMMENDED</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Email second */}
        <TouchableOpacity
          style={[modalStyles.grayBtn, !emailEnabled && { opacity: 0.5 }]}
          onPress={onEmail}
          activeOpacity={1}
          disabled={!emailEnabled}
        >
          <Text style={modalStyles.grayText}>SEND EMAIL (OPTIONAL)</Text>
        </TouchableOpacity>

        {!emailEnabled ? (
          <Text style={modalStyles.hint}>
            Add email in Signup + ensure SEND_OTP_ENDPOINT exists to use email
            OTP.
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const modalStyles = StyleSheet.create({
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  title: { fontSize: 18, fontWeight: "800", color: "#111827" },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
  },
  subtitle: {
    fontSize: 13,
    color: "#6B7280",
    marginBottom: 14,
    lineHeight: 18,
  },
  neutralBtn: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
  },
  btnRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  neutralText: {
    color: "#111827",
    fontWeight: "900",
    fontSize: 13,
    letterSpacing: 1,
  },
  badge: {
    backgroundColor: "#EAF8EE",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#BFE9CC",
  },
  badgeText: {
    color: "#0A7B35",
    fontWeight: "900",
    fontSize: 10,
    letterSpacing: 0.6,
  },
  grayBtn: {
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  grayText: {
    color: "#111827",
    fontWeight: "900",
    fontSize: 13,
    letterSpacing: 1,
  },
  hint: {
    marginTop: 10,
    textAlign: "center",
    fontSize: 12,
    color: "#6B7280",
  },
});

/* ───────────────────────── Component ───────────────────────── */
export default function ReviewSubmitScreen() {
  const navigation = useNavigation();
  const route = useRoute();

  const {
    serviceType = "food",
    deliveryOption: incomingDelivery = null,
    merchant = {},
    owner_type: incomingOwnerType = null,
  } = route.params ?? {};

  const effectiveOwnerType = useMemo(() => {
    return String(
      incomingOwnerType ?? merchant?.owner_type ?? serviceType ?? "food",
    )
      .trim()
      .toLowerCase();
  }, [incomingOwnerType, merchant?.owner_type, serviceType]);

  const deliveryOption = useMemo(
    () => normalizeDeliveryOption(incomingDelivery),
    [incomingDelivery],
  );

  const [agreeTerms, setAgreeTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showAccountNumber, setShowAccountNumber] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);

  const normalizedCategoryIds = normalizeCategoryIds(merchant?.category);

  const displayCategory =
    normalizedCategoryIds.length && Array.isArray(merchant?.categories)
      ? normalizedCategoryIds
          .map((id) => {
            const found = merchant.categories.find(
              (c) => String(c.id) === String(id),
            );
            return found ? (found.name ?? found.category_name ?? id) : id;
          })
          .join(", ")
      : normalizedCategoryIds.join(", ");

  // ✅ read cid/idcard from merchant
  const cid = useMemo(() => {
    const raw =
      merchant?.cid ??
      merchant?.id_card_number ??
      merchant?.idCardNo ??
      merchant?.id_card_no ??
      null;
    return normalizeCid11(raw);
  }, [
    merchant?.cid,
    merchant?.id_card_number,
    merchant?.idCardNo,
    merchant?.id_card_no,
  ]);

  const business = {
    fullName: merchant?.full_name ?? "",
    businessName: merchant?.business_name ?? "",
    category: normalizedCategoryIds,
    regNo: merchant?.registration_no ?? "",
    address: merchant?.address ?? "",
    latitude: merchant?.latitude ?? null,
    longitude: merchant?.longitude ?? null,
    email: merchant?.email ?? "",
    phone: merchant?.phone ?? "",
    password: merchant?.password ?? "",
    cid,
  };

  const emailEnabled =
    !!String(business.email || "").trim() &&
    !!String(SEND_OTP_ENDPOINT || "").trim();

  const businessLogoRaw = firstNonEmpty(
    merchant?.business_logo,
    merchant?.logo,
    merchant?.businessLogo,
    merchant?.merchant_logo,
    merchant?.logo_uri,
    merchant?.logo_url,
    merchant?.documents?.logo,
  );
  const businessLicenseRaw = firstNonEmpty(
    merchant?.business_license,
    merchant?.license,
    merchant?.license_image,
    merchant?.trade_license,
    merchant?.businessLicense,
    merchant?.tradeLicense,
    merchant?.license_uri,
    merchant?.license_url,
    merchant?.documents?.license,
  );

  const businessLogoUploaded = isUploaded(businessLogoRaw);
  const businessLicenseUploaded = isUploaded(businessLicenseRaw);

  const bank = merchant?.bank ?? {
    account_name: "",
    account_number: "",
    bank_name: "",
    bank_qr: null,
  };

  const maskedAccount = useMemo(
    () => maskAccount(bank?.account_number),
    [bank?.account_number],
  );

  const buildReview = () => ({
    serviceType,
    owner_type: effectiveOwnerType,
    deliveryOption,
    agreeTerms: true,
    displayCategory,
    normalizedCategoryIds: business.category,
    business,
    bank,
    files: {
      business_logo: extractUriLike(businessLogoRaw) || null,
      business_license: extractUriLike(businessLicenseRaw) || null,
      bank_qr: extractUriLike(bank?.bank_qr) || null,
    },
    merchantNormalized: {
      ...(merchant ?? {}),
      category: business.category,
      owner_type: effectiveOwnerType,
      registration_no: business.regNo,
      address: business.address,
      latitude: business.latitude,
      longitude: business.longitude,
      full_name: business.fullName,
      business_name: business.businessName,
      email: business.email,
      phone: business.phone,
      password: business.password,
      delivery_option: deliveryOption,
      cid: business.cid || undefined,
      id_card_number: business.cid || undefined,
      bank,
      business_logo: businessLogoRaw ?? null,
      business_license: businessLicenseRaw ?? null,
    },
  });

  const handleSubmit = () => {
    if (!agreeTerms) {
      Alert.alert(
        "Accept terms",
        "Please accept Terms & Conditions and Privacy Policy to continue.",
      );
      return;
    }

    const phone = String(business.phone || "").trim();
    if (!phone) {
      Alert.alert("Missing phone", "Please add your phone number first.");
      return;
    }

    if (!business.cid || business.cid.length !== 11) {
      Alert.alert("Missing CID", "CID must be exactly 11 digits.");
      return;
    }

    setShowVerifyModal(true);
  };

  const goToOtpScreen = ({ channel }) => {
    const email = String(business.email || "").trim();
    const phone = String(business.phone || "").trim();
    const review = buildReview();

    navigation.navigate(NEXT_ROUTE, {
      ...(route.params ?? {}),
      otpChannel: channel,
      phone,
      email: email || null,

      idCardNo: business.cid,

      skipAutoSend: false,
      otpType: channel === "sms" ? "register_sms" : "email_verification",
      serviceType,
      owner_type: effectiveOwnerType,
      deliveryOption,
      initialCategory: business.category,

      merchant: {
        ...(merchant ?? {}),
        category: business.category,
        owner_type: effectiveOwnerType,
        delivery_option: deliveryOption,
        phone,
        email,
        cid: business.cid,
        id_card_number: business.cid,
      },
      review,
    });
  };

  const closeVerifyModal = () => setShowVerifyModal(false);

  const onChooseSms = () => {
    closeVerifyModal();
    goToOtpScreen({ channel: "sms" });
  };

  const onChooseEmail = () => {
    closeVerifyModal();
    goToOtpScreen({ channel: "email" });
  };

  const jumpTo = (routeName) => {
    const common = {
      ...(route.params ?? {}),
      merchant: {
        ...(merchant ?? {}),
        category: business.category,
        owner_type: effectiveOwnerType,
        delivery_option: deliveryOption,
        cid: business.cid || undefined,
        id_card_number: business.cid || undefined,
      },
      idCardNo: business.cid,
      initialCategory: business.category,
      deliveryOption,
      serviceType,
      owner_type: effectiveOwnerType,
      returnTo: "ReviewSubmitScreen",
    };

    if (routeName === EDIT_SIGNUP_ROUTE) {
      navigation.navigate(routeName, {
        ...common,
        initialEmail: business.email,
        initialPassword: business.password,
      });
      return;
    }
    if (routeName === EDIT_PHONE_ROUTE) {
      navigation.navigate(routeName, {
        ...common,
        initialPhone: business.phone,
      });
      return;
    }
    if (routeName === EDIT_BUSINESS_ROUTE) {
      navigation.navigate(routeName, {
        ...common,
        initialFullName: business.fullName,
        initialBusinessName: business.businessName,
        initialCategory: business.category,
        initialEmail: business.email,
        initialPhone: business.phone,
        initialPassword: business.password,
        initialAddress: business.address,
        initialLatitude: business.latitude,
        initialLongitude: business.longitude,
        initialRegNo: business.regNo,
      });
      return;
    }
    if (routeName === EDIT_BANK_ROUTE) {
      navigation.navigate(routeName, {
        ...common,
        initialAccountName: bank?.account_name ?? "",
        initialAccountNumber: bank?.account_number ?? "",
        initialBankName: bank?.bank_name ?? "",
        initialQrCodeImage: bank?.bank_qr ?? null,
      });
      return;
    }
    if (routeName === EDIT_DELIVERY_ROUTE) {
      navigation.navigate(routeName, {
        ...common,
        initialDeliveryOption: deliveryOption,
      });
      return;
    }

    navigation.navigate(routeName, common);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right", "bottom"]}>
      <View style={styles.topGlow} />

      <View style={styles.page}>
        <HeaderWithSteps step="Step 6 of 7" />

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroCard}>
            <Text style={styles.brandLabel}>TÀBDEY MERCHANT</Text>
            <Text style={styles.h1}>Review &amp; submit</Text>
            <Text style={styles.subtitle}>
              Please check your details before submitting your merchant
              registration.
            </Text>
          </View>

          <Section
            title="Signup (Email & Password)"
            onEdit={() => jumpTo(EDIT_SIGNUP_ROUTE)}
            rows={[
              ["Email", business.email || "—"],
              [
                "Password",
                business.password ? (
                  <View style={styles.secretRow}>
                    <Text style={styles.secretText}>
                      {showPassword
                        ? business.password
                        : maskPassword(business.password)}
                    </Text>
                    <TouchableOpacity
                      onPress={() => setShowPassword((v) => !v)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      activeOpacity={1}
                    >
                      <Ionicons
                        name={showPassword ? "eye-off-outline" : "eye-outline"}
                        size={18}
                        color="#6B7280"
                      />
                    </TouchableOpacity>
                  </View>
                ) : (
                  "—"
                ),
              ],
            ]}
          />

          <Section
            title="Phone Number"
            onEdit={() => jumpTo(EDIT_PHONE_ROUTE)}
            rows={[["Phone", business.phone || "—"]]}
          />

          <Section
            title="Business Details"
            onEdit={() => jumpTo(EDIT_BUSINESS_ROUTE)}
            rows={[
              ["Full name", business.fullName || "—"],
              ["Business name", business.businessName || "—"],
              ["Category", displayCategory || "—"],
              ["CID", business.cid || "—"],
              ["License number", business.regNo || "—"],
              ["Address", business.address || "—"],
              [
                "Coordinates",
                business.latitude && business.longitude
                  ? `${Number(business.latitude).toFixed(5)}, ${Number(
                      business.longitude,
                    ).toFixed(5)}`
                  : "—",
              ],
              ["Business logo", businessLogoUploaded ? "Uploaded" : "—"],
              ["Business license", businessLicenseUploaded ? "Uploaded" : "—"],
            ]}
          />

          <Section
            title="Delivery Option"
            onEdit={() => jumpTo(EDIT_DELIVERY_ROUTE)}
            rows={[["Selected option", deliveryDisplay(deliveryOption)]]}
          />

          <Section
            title="Bank & Payment"
            onEdit={() => jumpTo(EDIT_BANK_ROUTE)}
            rows={[
              ["Account name", bank?.account_name || "—"],
              [
                "Account number",
                bank?.account_number ? (
                  <View style={styles.secretRow}>
                    <Text style={styles.secretText}>
                      {showAccountNumber ? bank?.account_number : maskedAccount}
                    </Text>
                    <TouchableOpacity
                      onPress={() => setShowAccountNumber((v) => !v)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      activeOpacity={1}
                    >
                      <Ionicons
                        name={
                          showAccountNumber ? "eye-off-outline" : "eye-outline"
                        }
                        size={18}
                        color="#6B7280"
                      />
                    </TouchableOpacity>
                  </View>
                ) : (
                  "—"
                ),
              ],
              ["Bank name", bank?.bank_name || "—"],
              [
                "Bank QR",
                bank?.bank_qr?.uri || bank?.bank_qr?.url || bank?.bank_qr?.path
                  ? "Uploaded"
                  : "—",
              ],
            ]}
          />

          {/* Agreement */}
          <View style={styles.agreeWrap}>
            <TouchableOpacity
              style={[styles.checkbox, agreeTerms && styles.checkboxChecked]}
              onPress={() => setAgreeTerms((v) => !v)}
              activeOpacity={1}
            >
              {agreeTerms ? (
                <Ionicons name="checkmark" size={16} color="#000" />
              ) : null}
            </TouchableOpacity>

            {/* ✅ UPDATED: open actual screens */}
            <Text style={styles.agreeText}>
              I accept the{" "}
              <Text
                style={styles.link}
                onPress={() => navigation.navigate(TERMS_ROUTE)}
              >
                Terms &amp; Conditions
              </Text>{" "}
              and{" "}
              <Text
                style={styles.link}
                onPress={() => navigation.navigate(PRIVACY_ROUTE)}
              >
                Privacy Policy
              </Text>
              .
            </Text>
          </View>
          {/* Submit */}
          <View style={styles.submitWrap}>
            <TouchableOpacity
              onPress={handleSubmit}
              style={agreeTerms ? styles.btnPrimary : styles.btnPrimaryDisabled}
              disabled={!agreeTerms || submitting}
              activeOpacity={0.9}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text
                  style={
                    agreeTerms
                      ? styles.btnPrimaryText
                      : styles.btnPrimaryTextDisabled
                  }
                >
                  Submit
                </Text>
              )}
            </TouchableOpacity>

            <Text style={styles.subNote}>
              Your account will enter verification after submission.
            </Text>
          </View>

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </View>

      <VerifyChoiceModal
        visible={showVerifyModal}
        onClose={() => setShowVerifyModal(false)}
        onSms={onChooseSms}
        onEmail={onChooseEmail}
        emailEnabled={emailEnabled}
      />
    </SafeAreaView>
  );
}

/* ─────────────────── Helper Components ─────────────────── */
function Section({ title, rows, onEdit }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{title}</Text>
        <TouchableOpacity onPress={onEdit} activeOpacity={1}>
          <Text style={styles.editBtn}>Edit</Text>
        </TouchableOpacity>
      </View>

      {rows.map(([label, value], idx) => (
        <View key={`${label}-${idx}`} style={styles.row}>
          <Text style={styles.rowLabel}>{label}</Text>
          {typeof value === "string" ? (
            <Text style={styles.rowValue} numberOfLines={2}>
              {value}
            </Text>
          ) : (
            <View style={{ flex: 1 }}>{value}</View>
          )}
        </View>
      ))}
    </View>
  );
}

function maskAccount(acc = "") {
  const digits = String(acc).replace(/\s+/g, "");
  if (!digits) return "";
  if (digits.length <= 4) return "••••";
  const tail = digits.slice(-4);
  return `•••• •••• •••• ${tail}`.replace(/\s+/g, " ").trim();
}

function maskPassword(pw = "") {
  if (!pw) return "";
  const len = Math.min(Math.max(pw.length, 6), 12);
  return "•".repeat(len);
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
    paddingHorizontal: 22,
    paddingTop: 42,
  },

  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  bottomSpacer: {
    height: 10,
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

  card: {
    borderWidth: 1,
    borderColor: BRAND.greyBorder,
    borderRadius: 22,
    backgroundColor: BRAND.white,
    padding: 16,
    marginTop: 14,
    ...SHADOW.sm,
  },

  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },

  cardTitle: {
    fontFamily: FONT.body,
    fontSize: 16,
    fontWeight: "800",
    color: BRAND.black,
    flex: 1,
    paddingRight: 10,
  },

  editBtn: {
    fontFamily: FONT.body,
    fontSize: 13,
    fontWeight: "800",
    color: BRAND.purple,
    backgroundColor: "#F4ECFF",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
  },

  row: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#F3EEF8",
    paddingVertical: 10,
    gap: 10,
  },

  rowLabel: {
    width: 125,
    fontFamily: FONT.body,
    fontSize: 12,
    color: BRAND.grey,
    fontWeight: "600",
  },

  rowValue: {
    flex: 1,
    fontFamily: FONT.body,
    fontSize: 13,
    color: BRAND.black,
    fontWeight: "700",
    lineHeight: 19,
  },

  secretRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flex: 1,
    gap: 10,
  },

  secretText: {
    flex: 1,
    fontFamily: FONT.body,
    fontSize: 13,
    color: BRAND.black,
    fontWeight: "700",
  },

  agreeWrap: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 16,
    backgroundColor: BRAND.white,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: BRAND.greyBorder,
    ...SHADOW.sm,
  },

  checkbox: {
    width: 23,
    height: 23,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: BRAND.purple,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BRAND.white,
    marginTop: 1,
  },

  checkboxChecked: {
    backgroundColor: "#F4ECFF",
  },

  agreeText: {
    flex: 1,
    color: BRAND.black,
    fontSize: 13,
    fontFamily: FONT.body,
    lineHeight: 19,
  },

  link: {
    color: BRAND.purple,
    fontWeight: "800",
  },
  submitWrap: {
    marginTop: 22,
  },
  btnPrimary: {
    backgroundColor: BRAND.purple,
    paddingVertical: 16,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    ...SHADOW.md,
  },

  btnPrimaryDisabled: {
    backgroundColor: BRAND.greyLight,
    paddingVertical: 16,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
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

  subNote: {
    textAlign: "center",
    fontSize: 12,
    color: BRAND.grey,
    fontFamily: FONT.body,
    marginTop: 8,
  },
});
