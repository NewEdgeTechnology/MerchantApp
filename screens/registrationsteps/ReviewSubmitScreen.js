// screens/registrationsteps/ReviewSubmitScreen.js
import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import Ionicons from "react-native-vector-icons/Ionicons";
import HeaderWithSteps from "./HeaderWithSteps";
import { SEND_OTP_ENDPOINT } from "@env";

// ✨ Explicit edit targets
const EDIT_SIGNUP_ROUTE = "SignupScreen"; // Email + Password
const EDIT_PHONE_ROUTE = "PhoneNumberScreen"; // Phone
const EDIT_BUSINESS_ROUTE = "MerchantRegistrationScreen"; // Business Details
const EDIT_BANK_ROUTE = "BankPaymentInfoScreen"; // Bank (Step 4)
const EDIT_DELIVERY_ROUTE = "DeliveryOptionsScreen"; // Delivery (Step 5)

// ⬇️ redirect to email OTP screen after submit
const NEXT_ROUTE = "EmailOtpVerificationScreen";

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

export default function ReviewSubmitScreen() {
  const navigation = useNavigation();
  const route = useRoute();

  const {
    serviceType = "food",
    deliveryOption = null,
    merchant = {},
    // 👇 may be forwarded by earlier screens
    owner_type: incomingOwnerType = null,
  } = route.params ?? {};

  const effectiveOwnerType = useMemo(() => {
    return String(incomingOwnerType ?? merchant?.owner_type ?? serviceType ?? "food")
      .trim()
      .toLowerCase();
  }, [incomingOwnerType, merchant?.owner_type, serviceType]);

  const [agreeTerms, setAgreeTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // legal overlay state
  const [showLegal, setShowLegal] = useState(false);
  const [legalDoc, setLegalDoc] = useState("terms"); // "terms" | "privacy"

  // 🔒 toggles for sensitive values
  const [showPassword, setShowPassword] = useState(false);
  const [showAccountNumber, setShowAccountNumber] = useState(false);

  // ✅ Normalize to **IDs** for downstream API
  const normalizedCategoryIds = normalizeCategoryIds(merchant?.category);

  // For display, map IDs → names if list is present
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
    category: normalizedCategoryIds, // keep **IDs** array internally
    regNo: merchant?.registration_no ?? "",
    address: merchant?.address ?? "",
    latitude: merchant?.latitude ?? null,
    longitude: merchant?.longitude ?? null,
    // Contact & auth
    email: merchant?.email ?? "",
    phone: merchant?.phone ?? "",
    password: merchant?.password ?? "",
  };

  const bank = merchant?.bank ?? {
    account_name: "",
    account_number: "",
    bank_name: "",
    bank_card_front: null,
    bank_card_back: null,
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

      // ✅ Send OTP using endpoint from .env
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

      // 🔐 Build a single canonical payload to forward EVERYTHING to the next page
      const review = {
        serviceType,
        owner_type: effectiveOwnerType,
        deliveryOption,
        agreeTerms: true,
        displayCategory,
        normalizedCategoryIds: business.category,
        business, // full normalized business block
        bank,     // full bank block
        // keep a normalized merchant for later steps/submit
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
          bank, // embed full bank data here as well
        },
      };

      // ➡️ Navigate to the OTP verification screen with ALL data
      navigation.navigate(NEXT_ROUTE, {
        ...(route.params ?? {}),   // preserve any incoming data
        email: business.email,     // explicit for OTP screen
        otpType: "email_verification",
        serviceType,
        owner_type: effectiveOwnerType,
        deliveryOption,
        // legacy keys used by some downstream screens
        initialCategory: business.category,
        merchant: {
          ...(merchant ?? {}),
          category: business.category,
          owner_type: effectiveOwnerType,
        },
        // NEW: a single object carrying the entire review state
        review,
      });
    } catch (e) {
      Alert.alert("Submit failed", e?.message || "Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // 👉 Jump to a step for editing with prefilled values + come back to Review
  const jumpTo = (routeName) => {
    const common = {
      ...(route.params ?? {}),
      // ✅ always pass normalized **IDs** and owner_type
      merchant: {
        ...(merchant ?? {}),
        category: business.category,
        owner_type: effectiveOwnerType,
      },
      initialCategory: business.category,
      deliveryOption,
      serviceType, // keep for compatibility
      owner_type: effectiveOwnerType, // expose at root for next screens
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
        initialCategory: business.category, // ✅ array of IDs
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
        initialBankCardFront: bank?.bank_card_front ?? null,
        initialBankCardBack: bank?.bank_card_back ?? null,
        initialQrCodeImage: bank?.bank_qr ?? null,
      });
      return;
    }

    if (routeName === EDIT_DELIVERY_ROUTE) {
      navigation.navigate(routeName, {
        ...common,
        initialDeliveryOption: deliveryOption ?? null,
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

        {/* ✨ Contact & Login (email/password) */}
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

        {/* ✨ Phone number */}
        <Section
          title="Phone Number"
          onEdit={() => jumpTo(EDIT_PHONE_ROUTE)}
          rows={[["Phone", business.phone || "—"]]}
        />

        {/* Business Details */}
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
          ]}
        />

        {/* Delivery */}
        <Section
          title="Delivery Option"
          onEdit={() => jumpTo(EDIT_DELIVERY_ROUTE)}
          rows={[["Selected option", deliveryOption || "—"]]}
        />

        {/* Bank & Payment */}
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
            ["Card (front)", bank?.bank_card_front?.uri ? "Uploaded" : "—"],
            ["Card (back)", bank?.bank_card_back?.uri ? "Uploaded" : "—"],
            ["Bank QR", bank?.bank_qr?.uri ? "Uploaded" : "—"],
          ]}
        />

        {/* Agreements */}
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
            <Text
              style={styles.link}
              onPress={() => {
                setLegalDoc("terms");
                setShowLegal(true);
              }}
            >
              Terms &amp; Conditions
            </Text>{" "}
            and{" "}
            <Text
              style={styles.link}
              onPress={() => {
                setLegalDoc("privacy");
                setShowLegal(true);
              }}
            >
              Privacy Policy
            </Text>
            .
          </Text>
        </View>
      </ScrollView>

      {/* Sticky CTA */}
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

      {/* In-file Legal Overlay */}
      <Modal
        visible={showLegal}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowLegal(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
          <View style={styles.legalHeader}>
            <Text style={styles.legalHeaderTitle}>
              {legalDoc === "privacy" ? "Privacy Policy" : "Terms & Conditions"}
            </Text>
            <TouchableOpacity
              onPress={() => setShowLegal(false)}
              hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}
            >
              <Text style={styles.legalClose}>Close</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.legalContent}>
            {legalDoc === "privacy" ? <PrivacyContent /> : <TermsContent />}
            <View style={{ height: 24 }} />
          </ScrollView>

          <View style={styles.legalFooter}>
            <TouchableOpacity style={styles.btnPrimary} onPress={() => setShowLegal(false)}>
              <Text style={styles.btnPrimaryText}>Done</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

/* ---------- Components & helpers ---------- */

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

/* ---------- Inline Legal Content ---------- */

function TermsContent() {
  return (
    <View>
      <Text style={styles.h2}>Introduction</Text>
      <Text style={styles.p}>
        These Terms &amp; Conditions (“Terms”) govern your use of our app and services
        (“Services”). By creating an account or using the Services, you agree to these Terms.
      </Text>

      <Text style={styles.h2}>Eligibility</Text>
      <Text style={styles.p}>
        You must be legally capable of entering into contracts within your jurisdiction. You are
        responsible for ensuring the information you provide is accurate and complete.
      </Text>

      <Text style={styles.h2}>Account &amp; Registration</Text>
      <Text style={styles.p}>
        Keep your login credentials confidential and notify us promptly of any unauthorized access.
        You are responsible for all activity under your account.
      </Text>

      <Text style={styles.h2}>Merchant Responsibilities</Text>
      <Text style={styles.p}>
        Comply with applicable laws and regulations, including licensing, tax, food safety, and
        delivery standards. You are responsible for your products/services, pricing, and
        fulfillment.
      </Text>

      <Text style={styles.h2}>Payments</Text>
      <Text style={styles.p}>
        Payouts are processed to the bank account you provide. You authorize us and our payment
        partners to process, hold, and disburse funds. Fees and settlement timelines may vary.
      </Text>

      <Text style={styles.h2}>Delivery Options</Text>
      <Text style={styles.p}>
        For Self Delivery, you handle your own logistics and liabilities. For Grab Delivery or Both,
        you agree to the relevant third-party terms and pricing that may apply.
      </Text>

      <Text style={styles.h2}>Prohibited Activities</Text>
      <Text style={styles.p}>
        Don’t misuse the Services: no unlawful activity, IP infringement, deceptive/harmful content,
        interference, or unauthorized data access.
      </Text>

      <Text style={styles.h2}>Intellectual Property</Text>
      <Text style={styles.p}>
        The app, logos, content, and technology are owned by us or our licensors. You get a
        limited, non-exclusive, non-transferable license to use the Services.
      </Text>

      <Text style={styles.h2}>Suspension &amp; Termination</Text>
      <Text style={styles.p}>
        We may suspend/terminate access for policy violations or risk/security reasons and remove
        content that violates laws or our policies.
      </Text>

      <Text style={styles.h2}>Limitation of Liability</Text>
      <Text style={styles.p}>
        To the fullest extent permitted by law, we’re not liable for indirect, incidental, special,
        or consequential damages, or for lost profits, data, or goodwill.
      </Text>

      <Text style={styles.h2}>Indemnity</Text>
      <Text style={styles.p}>
        You agree to indemnify and hold us harmless from claims arising out of your use of the
        Services, your content, or your violation of these Terms/laws.
      </Text>

      <Text style={styles.h2}>Changes to the Terms</Text>
      <Text style={styles.p}>
        We may update these Terms from time to time. We’ll notify you of material changes.
        Continued use after changes means acceptance.
      </Text>

      <Text style={styles.h2}>Governing Law</Text>
      <Text style={styles.p}>
        These Terms are governed by the laws of your operating jurisdiction unless otherwise
        required by mandatory local law.
      </Text>

      <Text style={styles.h2}>Contact</Text>
      <Text style={styles.p}>For questions, contact support@example.com.</Text>
    </View>
  );
}

function PrivacyContent() {
  return (
    <View>
      <Text style={styles.h2}>Overview</Text>
      <Text style={styles.p}>
        This Privacy Policy explains how we collect, use, and protect your information when you use
        our Services. By using the Services, you consent to this Policy.
      </Text>

      <Text style={styles.h2}>Information We Collect</Text>
      <Text style={styles.p}>
        We collect information you provide (e.g., name, email, business details, bank info for
        payouts) and data generated during use (device info, logs, usage analytics).
      </Text>

      <Text style={styles.h3}>Images &amp; Documents</Text>
      <Text style={styles.p}>
        When you upload logos, licenses, bank cards, or QR codes, we store them to verify your
        merchant account and to facilitate payouts and compliance checks.
      </Text>

      <Text style={styles.h2}>How We Use Information</Text>
      <Text style={styles.p}>
        To operate and improve the Services, verify merchants, process payouts, provide support,
        monitor for fraud/misuse, and comply with legal obligations.
      </Text>

      <Text style={styles.h2}>Sharing &amp; Disclosure</Text>
      <Text style={styles.p}>
        We may share information with payment/delivery partners, service providers, and authorities
        where required by law. We do not sell personal data.
      </Text>

      <Text style={styles.h2}>Data Retention</Text>
      <Text style={styles.p}>
        We retain information as long as needed to provide the Services, comply with legal
        obligations, resolve disputes, and enforce agreements.
      </Text>

      <Text style={styles.h2}>Security</Text>
      <Text style={styles.p}>
        We use technical and organizational measures to protect your information, but no method of
        transmission or storage is 100% secure.
      </Text>

      <Text style={styles.h2}>Your Rights</Text>
      <Text style={styles.p}>
        Depending on your location, you may request access, correction, or deletion of your data.
        Contact privacy@example.com for requests.
      </Text>

      <Text style={styles.h2}>International Transfers</Text>
      <Text style={styles.p}>
        Your information may be processed in countries with different data protection laws. We
        implement safeguards where required.
      </Text>

      <Text style={styles.h2}>Children</Text>
      <Text style={styles.p}>
        Our Services aren’t intended for children, and we don’t knowingly collect children’s data.
      </Text>

      <Text style={styles.h2}>Changes to this Policy</Text>
      <Text style={styles.p}>
        We may update this Policy periodically. Material changes will be notified in-app or by
        email. Continued use after changes constitutes acceptance.
      </Text>

      <Text style={styles.h2}>Contact</Text>
      <Text style={styles.p}>For privacy questions, contact privacy@example.com.</Text>
    </View>
  );
}

/* ---------- Styles ---------- */
const styles = StyleSheet.create({
  fixedTitle: {
    backgroundColor: "#fff",
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#fff",
  },
  h1: { fontSize: 22, fontWeight: "bold", color: "#1A1D1F", marginBottom: 16 },

  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 130,
    backgroundColor: "#fff",
  },
  lead: { fontSize: 13, color: "#6b7280", marginBottom: 10 },

  card: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 14,
    backgroundColor: "#fff",
    padding: 14,
    marginTop: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#111827" },
  editBtn: { fontSize: 13, fontWeight: "700", color: "#00b14f" },

  row: {
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  rowLabel: { width: 130, fontSize: 13, color: "#6B7280" },
  rowValue: { flex: 1, fontSize: 14, color: "#111827", fontWeight: "600" },

  secretRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    flex: 1,
  },
  secretText: { flex: 1, fontSize: 14, color: "#111827", fontWeight: "600" },

  submitContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 110,
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
    marginBottom: 8,
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
    marginBottom: 8,
  },
  btnPrimaryText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  btnPrimaryTextDisabled: { color: "#aaa", fontSize: 16, fontWeight: "600" },
  subNote: { textAlign: "center", fontSize: 12, color: "#6B7280" },

  agreeWrap: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: { backgroundColor: "#EAF8EE" },
  agreeText: { flex: 1, color: "#374151", fontSize: 13 },
  link: { color: "#417fa2ff", fontWeight: "700" },

  legalHeader: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
  },
  legalHeaderTitle: { fontSize: 18, fontWeight: "700", color: "#111827" },
  legalClose: { fontSize: 14, fontWeight: "700", color: "#ef4444" },
  legalContent: { paddingHorizontal: 20, paddingTop: 12, backgroundColor: "#fff" },
  legalFooter: { padding: 24, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#eee" },

  h2: { fontSize: 16, fontWeight: "700", color: "#111827", marginTop: 10, marginBottom: 6 },
  h3: { fontSize: 14, fontWeight: "700", color: "#111827", marginTop: 8, marginBottom: 4 },
  p: { fontSize: 13, color: "#374151", lineHeight: 20, marginBottom: 6 },
});
