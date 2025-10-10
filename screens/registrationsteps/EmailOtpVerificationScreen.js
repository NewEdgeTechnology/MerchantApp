import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "react-native-vector-icons/Ionicons";
import HeaderWithSteps from "./HeaderWithSteps";
import { SafeAreaView } from 'react-native-safe-area-context';
// .env:
// SEND_OTP_ENDPOINT=...
// VERIFY_OTP_ENDPOINT=...
// REGISTER_MERCHANT_ENDPOINT=...
import {
  SEND_OTP_ENDPOINT as ENV_SEND_OTP_ENDPOINT,
  VERIFY_OTP_ENDPOINT as ENV_VERIFY_OTP_ENDPOINT,
  REGISTER_MERCHANT_ENDPOINT as ENV_REGISTER_MERCHANT_ENDPOINT,
} from "@env";

const VERIFY_NEXT_ROUTE = "LoginScreen";
const EDIT_SIGNUP_ROUTE = "SignupScreen";

// ✅ normalize business type(s) from prior steps
const normalizeCategoryArray = (v) => {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof v === "string") return v.split(",").map((s) => s.trim()).filter(Boolean);
  if (typeof v === "object") {
    const s = String(v.value ?? v.label ?? "").trim();
    return s ? [s] : [];
  }
  return [];
};

export default function EmailOtpVerificationScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();

  const {
    email = "",
    merchant = {}, // aggregated object from previous steps
    serviceType = "food",
    deliveryOption = null,
    returnTo = null,
    SEND_OTP_ENDPOINT: OVERRIDE_SEND,
    VERIFY_OTP_ENDPOINT: OVERRIDE_VERIFY,
    REGISTER_MERCHANT_ENDPOINT: OVERRIDE_REGISTER,
    // might also receive initialCategory from previous screens
    initialCategory = [],
    // may be forwarded by previous screens
    owner_type: incomingOwnerType = null,
  } = route.params ?? {};

  // Keep business types normalized throughout this screen
  const normalizedCategories = useMemo(
    () => normalizeCategoryArray(merchant?.category ?? initialCategory),
    [merchant?.category, initialCategory]
  );

  // 👇 derive owner type consistently (food/mart/...)
  const effectiveOwnerType = useMemo(() => {
    return String(incomingOwnerType ?? merchant?.owner_type ?? serviceType ?? "food")
      .trim()
      .toLowerCase();
  }, [incomingOwnerType, merchant?.owner_type, serviceType]);

  const SEND_OTP_ENDPOINT = OVERRIDE_SEND || ENV_SEND_OTP_ENDPOINT;
  const VERIFY_OTP_ENDPOINT = OVERRIDE_VERIFY || ENV_VERIFY_OTP_ENDPOINT;
  const REGISTER_MERCHANT_ENDPOINT = OVERRIDE_REGISTER || ENV_REGISTER_MERCHANT_ENDPOINT;

  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const RESEND_COOLDOWN = 30;
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);

  const inputRef = useRef(null);
  const maskedEmail = useMemo(() => maskEmail(email), [email]);

  // keyboard spacing
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
  const bottomSpace = Math.max(kbHeight, insets.bottom, 16);

  // auto-send OTP + countdown
  useEffect(() => {
    sendOtpSilently();
    setCooldown(RESEND_COOLDOWN);
    const timer = setInterval(() => {
      setCooldown((s) => {
        if (s <= 1) {
          clearInterval(timer);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  /* ---------------- helpers ---------------- */
  const postJson = async (url, payload, timeoutMs = 15000) => {
    if (!url) throw new Error("Endpoint missing");
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const txt = await res.text();
      let data = null;
      try {
        data = txt ? JSON.parse(txt) : null;
      } catch {}
      if (!res.ok) {
        const msg = (data && (data.message || data.error)) || `HTTP ${res.status}`;
        throw new Error(msg);
      }
      return data;
    } finally {
      clearTimeout(to);
    }
  };

  // multipart/form-data sender (DO NOT set Content-Type manually)
  const postForm = async (url, formData, timeoutMs = 30000) => {
    if (!url) throw new Error("Endpoint missing");
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      const txt = await res.text();
      let data = null;
      try {
        data = txt ? JSON.parse(txt) : null;
      } catch {}
      if (!res.ok) {
        const msg = (data && (data.message || data.error)) || `HTTP ${res.status}`;
        throw new Error(msg);
      }
      return data;
    } finally {
      clearTimeout(to);
    }
  };

  const sendOtpSilently = async () => {
    try {
      await postJson(SEND_OTP_ENDPOINT, { email });
    } catch (e) {
      Alert.alert("Couldn’t send code", e?.message || "Please try again.");
    }
  };

  const resendOtp = async () => {
    if (cooldown > 0) return;
    try {
      setCooldown(RESEND_COOLDOWN);
      const t = setInterval(() => {
        setCooldown((s) => {
          if (s <= 1) {
            clearInterval(t);
            return 0;
          }
          return s - 1;
        });
      }, 1000);
      await postJson(SEND_OTP_ENDPOINT, { email });
      Alert.alert("Code sent", `We sent a new code to ${maskedEmail}.`);
    } catch (e) {
      setCooldown(0);
      Alert.alert("Failed to resend", e?.message || "Please try again.");
    }
  };

  /* ---------- register form-data (text + images with your pattern) ---------- */
  const guessMimeFromFilename = (name) => {
    if (!name) return "image/jpeg";
    const ext = name.split(".").pop()?.toLowerCase();
    if (ext === "png") return "image/png";
    if (ext === "webp") return "image/webp";
    if (ext === "gif") return "image/gif";
    return "image/jpeg";
  };

  const appendImageLike = (form, key, value, fallbackName) => {
    // If value is a string (probably already a URL), just send as text
    if (typeof value === "string") {
      form.append(key, value);
      return;
    }
    // Expect RN asset { uri }
    const uri = value?.uri;
    if (!uri) {
      form.append(key, ""); // nothing to send
      return;
    }

    // Only attach as file if it's a local path (not http/https)
    if (uri && !uri.startsWith("http")) {
      const filename = uri.split("/").pop() || fallbackName || "image.jpg";
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : guessMimeFromFilename(filename);
      form.append(key, { uri, name: filename, type });
    } else {
      // remote URL → backend may accept plain string
      form.append(key, uri);
    }
  };

  const buildRegisterFormData = () => {
    const bank = merchant?.bank ?? {};
    const form = new FormData();

    // Text fields (exact keys expected by your API)
    form.append("user_name", merchant?.full_name ?? merchant?.fullName ?? "");
    form.append("email", merchant?.email ?? email ?? "");
    form.append("phone", merchant?.phone ?? "");
    form.append("password", merchant?.password ?? "");

    form.append("business_name", merchant?.business_name ?? merchant?.businessName ?? "");

    // ✅ owner_type (food/mart/...)
    form.append("owner_type", effectiveOwnerType);

    // ✅ UPDATED: Serialize multi-select business types as an ARRAY OF IDS
    // normalizedCategories can be ["2","5","8"] or [2,5,8]; coerce to numeric strings and append.
    const ids = Array.isArray(normalizedCategories)
      ? normalizedCategories.map((c) => Number(String(c).trim())).filter((n) => !Number.isNaN(n))
      : [];
    if (ids.length) {
      ids.forEach((id) => {
        // append multiple entries with the same key to represent an array
        form.append("business_type_ids[]", String(id));
      });
    } else {
      // backend-friendly empty state
      form.append("business_type_ids[]", "");
    }

    form.append(
      "business_license_number",
      merchant?.registration_no ?? merchant?.license_no ?? ""
    );

    const lat =
      merchant?.latitude !== undefined && merchant?.latitude !== null
        ? String(Number(merchant.latitude))
        : "";
    const lng =
      merchant?.longitude !== undefined && merchant?.longitude !== null
        ? String(Number(merchant.longitude))
        : "";
    form.append("latitude", lat);
    form.append("longitude", lng);
    form.append("address", merchant?.address ?? "");
    form.append("delivery_option", (deliveryOption ?? "SELF").toString());

    form.append("bank_name", bank?.bank_name ?? "");
    form.append("account_holder_name", bank?.account_name ?? "");
    form.append("account_number", bank?.account_number ?? "");

    // Image fields
    appendImageLike(form, "license_image", merchant?.license_image, "license.jpg");
    appendImageLike(form, "business_logo", merchant?.logo ?? merchant?.business_logo, "logo.jpg");
    appendImageLike(form, "bank_card_front_image", bank?.bank_card_front, "bank-card-front.jpg");
    appendImageLike(form, "bank_card_back_image", bank?.bank_card_back, "bank-card-back.jpg");
    appendImageLike(form, "bank_qr_code_image", bank?.bank_qr, "bank-qr.jpg");

    return form;
  };

  // Verify OTP → then register (multipart for images)
  const verifyOtpThenRegister = async () => {
    Keyboard.dismiss();
    setError("");
    if (!otp || otp.length !== 6) {
      setError("Enter the 6-digit code.");
      return;
    }

    try {
      setSubmitting(true);

      // 1) Verify OTP
      const otpNum = Number(otp);
      const verifyBody = { email, otp: isNaN(otpNum) ? otp : otpNum };
      await postJson(VERIFY_OTP_ENDPOINT, verifyBody);

      // 2) Register with multipart/form-data (images included)
      const formData = buildRegisterFormData();
      await postForm(REGISTER_MERCHANT_ENDPOINT, formData);

      // 3) Navigate forward — keep categories normalized in params too
      navigation.navigate(VERIFY_NEXT_ROUTE, {
        ...(route.params ?? {}),
        email,
        // ensure downstream screens still see normalized business type(s) + owner_type
        merchant: {
          ...(merchant ?? {}),
          category: normalizedCategories,
          owner_type: effectiveOwnerType,
        },
        initialCategory: normalizedCategories,
        serviceType, // keep for compatibility
        owner_type: effectiveOwnerType, // expose at root
        deliveryOption,
        returnTo,
        status: "submitted",
        email_verified: true,
      });
    } catch (e) {
      setError(e?.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const isValid = otp.length === 6;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <HeaderWithSteps step="Step 7 of 7" title="Verify Email" onBack={() => navigation.goBack()} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={[styles.container, { paddingBottom: 120 + bottomSpace }]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            <Text style={styles.lead}>
              Enter the 6-digit code we sent to <Text style={styles.leadStrong}>{maskedEmail}</Text>.
            </Text>

            {/* OTP input (tap to focus) */}
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => inputRef.current?.focus()}
              style={styles.otpWrap}
            >
              <TextInput
                ref={inputRef}
                style={styles.otpInput}
                value={otp}
                onChangeText={(v) => setOtp(v.replace(/[^0-9]/g, "").slice(0, 6))}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
                returnKeyType="done"
                placeholder="••••••"
                placeholderTextColor="#9CA3AF"
                textAlign="center"
              />
              <View style={styles.otpBoxesOverlay} pointerEvents="none">
                {Array.from({ length: 6 }).map((_, i) => (
                  <View key={i} style={styles.otpBox}>
                    <Text style={styles.otpBoxChar}>{otp[i] ? otp[i] : " "}</Text>
                  </View>
                ))}
              </View>
            </TouchableOpacity>

            {!!error && (
              <View style={styles.errorWrap}>
                <Ionicons name="warning-outline" size={16} color="#DC2626" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Resend */}
            <View style={styles.resendRow}>
              <Text style={styles.resendHint}>Didn’t get a code?</Text>
              <TouchableOpacity onPress={resendOtp} disabled={cooldown > 0} activeOpacity={cooldown > 0 ? 1 : 0.8}>
                <Text style={[styles.resendLink, cooldown > 0 && { color: "#9CA3AF" }]}>
                  {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend"}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Edit email shortcut */}
            <TouchableOpacity
              style={styles.editEmail}
              onPress={() =>
                navigation.navigate(EDIT_SIGNUP_ROUTE, {
                  ...(route.params ?? {}),
                  initialEmail: email,
                  // keep normalized categories when bouncing back
                  initialCategory: normalizedCategories,
                  merchant: {
                    ...(merchant ?? {}),
                    category: normalizedCategories,
                    owner_type: effectiveOwnerType,
                  },
                  owner_type: effectiveOwnerType, // expose at root too
                  returnTo: "ReviewSubmitScreen",
                })
              }
            >
              <Ionicons name="mail-outline" size={16} color="#417fa2" />
              <Text style={styles.editEmailText}>Use a different email</Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Bottom sticky action */}
          <View pointerEvents="box-none" style={[styles.fabWrap, { bottom: bottomSpace }]}>
            <View style={styles.submitContainer}>
              <TouchableOpacity
                onPress={verifyOtpThenRegister}
                disabled={!isValid || submitting}
                style={!isValid || submitting ? styles.btnPrimaryDisabled : styles.btnPrimary}
                activeOpacity={0.9}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={!isValid ? styles.btnPrimaryTextDisabled : styles.btnPrimaryText}>
                    Verify
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* ---------- helpers ---------- */
function maskEmail(email = "") {
  const [user = "", domain = ""] = String(email).split("@");
  if (!user || !domain) return email || "";
  const visible = user.slice(0, 2);
  return `${visible}${"•".repeat(Math.max(user.length - 2, 0))}@${domain}`;
}

/* ---------- styles ---------- */
const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    backgroundColor: "#fff",
  },
  lead: { fontSize: 14, color: "#374151", marginBottom: 14, lineHeight: 20 },
  leadStrong: { fontWeight: "700", color: "#111827" },

  otpWrap: {
    alignItems: "center",
    marginTop: 6,
    marginBottom: 16,
  },
  otpInput: {
    position: "absolute",
    width: "100%",
    height: 64,
    opacity: 0,
  },
  otpBoxesOverlay: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  otpBox: {
    flex: 1,
    height: 64,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#d0d5dd",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  otpBoxChar: { fontSize: 24, fontWeight: "700", color: "#111827" },

  errorWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
    marginBottom: 8,
  },
  errorText: { color: "#DC2626", fontSize: 13, fontWeight: "600" },

  resendRow: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    justifyContent: "center",
  },
  resendHint: { color: "#6B7280", fontSize: 13 },
  resendLink: { color: "#417fa2", fontWeight: "700", fontSize: 13 },

  editEmail: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    justifyContent: "center",
  },
  editEmailText: { color: "#417fa2", fontWeight: "700", fontSize: 13 },

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
    marginBottom: 10,
  },
  btnPrimaryText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  btnPrimaryTextDisabled: { color: "#aaa", fontSize: 16, fontWeight: "600" },
});
