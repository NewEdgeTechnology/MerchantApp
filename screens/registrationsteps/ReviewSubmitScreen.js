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
import Ionicons from "react-native-vector-icons/Ionicons";
import HeaderWithSteps from "./HeaderWithSteps";
import { SEND_OTP_ENDPOINT } from "@env";

// ✨ Explicit edit targets
const EDIT_SIGNUP_ROUTE = "SignupScreen";
const EDIT_PHONE_ROUTE = "PhoneNumberScreen";
const EDIT_BUSINESS_ROUTE = "MerchantRegistrationScreen";
const EDIT_BANK_ROUTE = "BankPaymentInfoScreen";
const EDIT_DELIVERY_ROUTE = "DeliveryOptionsScreen";

// ⬇️ redirect to email OTP screen after submit
const NEXT_ROUTE = "EmailOtpVerificationScreen";

/* ---------------- Normalizers ---------------- */

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

// Delivery option normalization
const DELIVERY_ENUMS = ["self", "grab", "both"];
const normalizeDeliveryOption = (val) => {
  if (val == null) return null;
  if (typeof val === "object") {
    const raw = val.value ?? val.id ?? val.key ?? val.code ?? val.type ?? null;
    if (raw != null) return normalizeDeliveryOption(raw);
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
  norm === "self" ? "Self Delivery" :
  norm === "grab" ? "Grab Delivery" :
  norm === "both" ? "Both" : "—";

/* ---------- File helpers (logo/license/QR presence) ---------- */
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
    return (
      v.uri?.trim?.() ||
      v.url?.trim?.() ||
      v.path?.trim?.() ||
      v.file?.uri?.trim?.() ||
      v.file?.url?.trim?.() ||
      v.file?.path?.trim?.() ||
      ""
    );
  }
  return "";
};

const isUploaded = (v) => {
  const picked = firstNonEmpty(
    v,
    typeof v === "object" ? v?.uri : null,
    typeof v === "object" ? v?.url : null,
    typeof v === "object" ? v?.path : null
  );
  const uri = extractUriLike(picked);
  return !!uri;
};

/* ---------------- Component ---------------- */

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
    return String(incomingOwnerType ?? merchant?.owner_type ?? serviceType ?? "food")
      .trim()
      .toLowerCase();
  }, [incomingOwnerType, merchant?.owner_type, serviceType]);

  const deliveryOption = useMemo(
    () => normalizeDeliveryOption(incomingDelivery),
    [incomingDelivery]
  );

  const [agreeTerms, setAgreeTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showAccountNumber, setShowAccountNumber] = useState(false);

  const normalizedCategoryIds = normalizeCategoryIds(merchant?.category);

  const displayCategory =
    normalizedCategoryIds.length && Array.isArray(merchant?.categories)
      ? normalizedCategoryIds
          .map((id) => {
            const found = merchant.categories.find((c) => String(c.id) === String(id));
            return found ? found.name : id;
          })
          .join(", ")
      : normalizedCategoryIds.join(", ");

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
  };

  // 🔍 resolve possible logo/license shapes/keys
  const businessLogoRaw = firstNonEmpty(
    merchant?.business_logo,
    merchant?.logo,
    merchant?.businessLogo,
    merchant?.merchant_logo,
    merchant?.logo_uri,
    merchant?.logo_url,
    merchant?.documents?.logo
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
    merchant?.documents?.license
  );

  const businessLogoUploaded = isUploaded(businessLogoRaw);
  const businessLicenseUploaded = isUploaded(businessLicenseRaw);

  const bank = merchant?.bank ?? {
    account_name: "",
    account_number: "",
    bank_name: "",
    bank_qr: null,
  };

  const maskedAccount = useMemo(() => maskAccount(bank?.account_number), [bank?.account_number]);

  const handleSubmit = async () => {
    if (!agreeTerms) {
      Alert.alert("Accept terms", "Please accept Terms & Conditions and Privacy Policy to continue.");
      return;
    }
    if (!business.email) {
      Alert.alert("Missing email", "Please add your email in Signup first.");
      return;
    }

    try {
      setSubmitting(true);

      // ✅ Send OTP only once here
      const res = await fetch(SEND_OTP_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: business.email }),
      });

      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const data = await res.json();
          msg = data?.message || data?.error || msg;
        } catch (_e) {}
        throw new Error(msg);
      }

      const review = {
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
          bank,
          business_logo: businessLogoRaw ?? null,
          business_license: businessLicenseRaw ?? null,
        },
      };

      // ✅ Navigate to OTP screen but prevent double sending
      navigation.navigate(NEXT_ROUTE, {
        ...(route.params ?? {}),
        email: business.email,
        otpType: "email_verification",
        skipAutoSend: true, // 👈 prevent resend on mount
        serviceType,
        owner_type: effectiveOwnerType,
        deliveryOption,
        initialCategory: business.category,
        merchant: {
          ...(merchant ?? {}),
          category: business.category,
          owner_type: effectiveOwnerType,
          delivery_option: deliveryOption,
        },
        review,
      });
    } catch (e) {
      Alert.alert("Submit failed", e?.message || "Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Jump to edit routes
  const jumpTo = (routeName) => {
    const common = {
      ...(route.params ?? {}),
      merchant: {
        ...(merchant ?? {}),
        category: business.category,
        owner_type: effectiveOwnerType,
        delivery_option: deliveryOption,
      },
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
      navigation.navigate(routeName, { ...common, initialPhone: business.phone });
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
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <HeaderWithSteps step="Step 6 of 7" />
      <View style={styles.fixedTitle}>
        <Text style={styles.h1}>Review &amp; Submit</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.lead}>
          Please review your details before submitting. You can edit any section if needed.
        </Text>

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
                    {showPassword ? business.password : maskPassword(business.password)}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setShowPassword((v) => !v)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
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
            ["License number", business.regNo || "—"],
            ["Address", business.address || "—"],
            [
              "Coordinates",
              business.latitude && business.longitude
                ? `${Number(business.latitude).toFixed(5)}, ${Number(business.longitude).toFixed(5)}`
                : "—",
            ],
            // 👇 New: show uploaded flags like Bank QR
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
                  >
                    <Ionicons
                      name={showAccountNumber ? "eye-off-outline" : "eye-outline"}
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
            ["Bank QR", bank?.bank_qr?.uri || bank?.bank_qr?.url || bank?.bank_qr?.path ? "Uploaded" : "—"],
          ]}
        />

        {/* Agreement */}
        <View style={styles.agreeWrap}>
          <TouchableOpacity
            style={[styles.checkbox, agreeTerms && styles.checkboxChecked]}
            onPress={() => setAgreeTerms((v) => !v)}
            activeOpacity={0.9}
          >
            {agreeTerms ? <Ionicons name="checkmark" size={16} color="#000" /> : null}
          </TouchableOpacity>
          <Text style={styles.agreeText}>
            I accept the{" "}
            <Text style={styles.link} onPress={() => Alert.alert("Terms & Conditions", "Open Terms screen in your app.")}>
              Terms &amp; Conditions
            </Text>{" "}
            and{" "}
            <Text style={styles.link} onPress={() => Alert.alert("Privacy Policy", "Open Privacy screen in your app.")}>
              Privacy Policy
            </Text>
            .
          </Text>
        </View>
      </ScrollView>

      {/* Submit */}
      <View style={styles.submitContainer}>
        <TouchableOpacity
          onPress={handleSubmit}
          style={agreeTerms ? styles.btnPrimary : styles.btnPrimaryDisabled}
          disabled={!agreeTerms || submitting}
          activeOpacity={0.9}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={agreeTerms ? styles.btnPrimaryText : styles.btnPrimaryTextDisabled}>
              Submit
            </Text>
          )}
        </TouchableOpacity>
        <Text style={styles.subNote}>Your account will enter verification after submission.</Text>
      </View>
    </SafeAreaView>
  );
}

/* ---------- Helper Components ---------- */
function Section({ title, rows, onEdit }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{title}</Text>
        <TouchableOpacity onPress={onEdit} activeOpacity={0.9}>
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
  return "•".repeat(Math.min(Math.max(pw.length, 6), 12));
}

/* ---------- Styles ---------- */
const styles = StyleSheet.create({
  fixedTitle: { backgroundColor: "#fff", paddingHorizontal: 20, borderBottomColor: "#fff" },
  h1: { fontSize: 22, fontWeight: "bold", color: "#1A1D1F", marginBottom: 16 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 130 },
  lead: { fontSize: 13, color: "#6b7280", marginBottom: 10 },
  card: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 14, backgroundColor: "#fff", padding: 14, marginTop: 12 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#111827" },
  editBtn: { fontSize: 13, fontWeight: "700", color: "#00b14f" },
  row: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#F3F4F6", paddingVertical: 8, gap: 10 },
  rowLabel: { width: 130, fontSize: 13, color: "#6B7280" },
  rowValue: { flex: 1, fontSize: 14, color: "#111827", fontWeight: "600" },
  secretRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", flex: 1, gap: 10 },
  secretText: { flex: 1, fontSize: 14, color: "#111827", fontWeight: "600" },
  submitContainer: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "#fff", padding: 16, borderTopWidth: 1, borderTopColor: "#e5e7eb" },
  btnPrimary: { backgroundColor: "#00b14f", paddingVertical: 14, borderRadius: 30, alignItems: "center", justifyContent: "center", elevation: 8 },
  btnPrimaryDisabled: { backgroundColor: "#eee", paddingVertical: 14, borderRadius: 30, alignItems: "center", justifyContent: "center" },
  btnPrimaryText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  btnPrimaryTextDisabled: { color: "#aaa", fontSize: 16, fontWeight: "600" },
  subNote: { textAlign: "center", fontSize: 12, color: "#6B7280" },
  agreeWrap: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: "#000", alignItems: "center", justifyContent: "center" },
  checkboxChecked: { backgroundColor: "#EAF8EE" },
  agreeText: { flex: 1, color: "#374151", fontSize: 13 },
  link: { color: "#417fa2ff", fontWeight: "700" },
});
