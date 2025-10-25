// screens/registrationsteps/EmailOtpVerificationScreen.js
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
import { useSafeAreaInsets, SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import HeaderWithSteps from "./HeaderWithSteps";

// Endpoints from .env
import {
  SEND_OTP_ENDPOINT,
  VERIFY_OTP_ENDPOINT,
  REGISTER_MERCHANT_ENDPOINT,
} from "@env";

const VERIFY_NEXT_ROUTE = "LoginScreen";
const EDIT_SIGNUP_ROUTE = "SignupScreen";

/* ---------------- Debug helpers (SAFE) ---------------- */
const DEBUG_NET = true;
const rid = () => Math.random().toString(36).slice(2, 8);
const log = (...a) => { if (DEBUG_NET) console.log("[OTP]", ...a); };
const logErr = (...a) => { if (DEBUG_NET) console.log("[OTP ERR]", ...a); };

/* ---------------- Normalizers ---------------- */
const normalizeCategoryIds = (v) => {
  if (!v) return [];
  if (Array.isArray(v)) {
    return v
      .map((item) => {
        if (typeof item === "object") {
          const id = item.id ?? item.value ?? item.business_type_id ?? null;
          return id != null ? Number(id) : null;
        }
        const num = Number(String(item).trim());
        return Number.isNaN(num) ? null : num;
      })
      .filter((n) => n != null);
  }
  if (typeof v === "string") {
    return v
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => !Number.isNaN(n));
  }
  if (typeof v === "object") {
    const id = v.id ?? v.value ?? v.business_type_id ?? null;
    const n = Number(id);
    return Number.isNaN(n) ? [] : [n];
  }
  return [];
};

const normalizeOwnerType = (s) => String(s || "").trim().toLowerCase();

const normalizeDeliveryUpper = (val) => {
  if (val == null) return null;
  if (typeof val === "object") {
    const raw = val.value ?? val.id ?? val.code ?? val.type ?? null;
    return normalizeDeliveryUpper(raw);
  }
  const s = String(val).trim().toLowerCase();
  if (/^self/.test(s)) return "SELF";
  if (/^grab/.test(s)) return "GRAB";
  if (/^both|self\s*\+|grab\s*\+/.test(s)) return "BOTH";
  if (s === "self" || s === "grab" || s === "both") return s.toUpperCase();
  return null;
};

// Pass images as URL strings only in JSON mode
const toHttpUrlOrNull = (val) => {
  if (!val) return null;
  if (typeof val === "string") {
    const t = val.trim();
    return /^https?:\/\//i.test(t) ? t : null;
  }
  const uri = val?.uri;
  return typeof uri === "string" && /^https?:\/\//i.test(uri) ? uri : null;
};

/* ---------------- Local-file helpers for multipart ---------------- */
const isLocalFile = (v) => {
  const uri = typeof v === "string" ? v : v?.uri || v?.url || v?.path || null;
  return typeof uri === "string" && /^(file|content):\/\//i.test(uri);
};
const getUri = (v) => (typeof v === "string" ? v : v?.uri || v?.url || v?.path || null);
const guessMime = (uri = "") => {
  const u = uri.toLowerCase();
  if (u.endsWith(".png")) return "image/png";
  if (u.endsWith(".jpg") || u.endsWith(".jpeg")) return "image/jpeg";
  if (u.endsWith(".webp")) return "image/webp";
  if (u.endsWith(".heic") || u.endsWith(".heif")) return "image/jpeg";
  return "application/octet-stream";
};
const buildFilePart = (uri, base = "image") => {
  let type = guessMime(uri);
  const name = (uri.split("?")[0].split("/").pop() || base).replace(/[^a-z0-9._-]/gi, "_");
  return { uri, name: name.includes(".") ? name : `${name}.jpg`, type };
};

/* ---------------- Network helpers ---------------- */
const postJson = async (url, payload, timeoutMs = 20000) => {
  const u = String(url || "").trim();
  if (!u) throw new Error("Endpoint missing");
  const id = rid();
  log(`(req:${id}) POST JSON ->`, u);
  log(`(req:${id}) body:`, payload);
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(u, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-client": "rn-app",
        "x-request-id": id,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const txt = await res.text();
    log(`(req:${id}) status:`, res.status);
    log(`(req:${id}) headers:`, Object.fromEntries(res.headers.entries()));
    log(`(req:${id}) raw:`, txt);
    let data = null;
    try {
      data = txt ? JSON.parse(txt) : null;
    } catch {}
    if (!res.ok) {
      const msg = (data && (data.message || data.error)) || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    if (data && data.success === false && data.message) throw new Error(String(data.message));
    return data ?? {};
  } catch (e) {
    logErr(`(req:${id}) ERROR:`, e?.message);
    throw e;
  } finally {
    clearTimeout(to);
  }
};

const postMultipart = async (url, formData, timeoutMs = 30000) => {
  const u = String(url || "").trim();
  if (!u) throw new Error("Endpoint missing");
  const id = rid();
  log(`(req:${id}) POST MULTIPART ->`, u);
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(u, {
      method: "POST",
      headers: {
        // DO NOT set Content-Type; RN will add multipart boundary
        Accept: "application/json",
        "x-client": "rn-app",
        "x-request-id": id,
      },
      body: formData,
      signal: controller.signal,
    });
    const txt = await res.text();
    log(`(req:${id}) status:`, res.status);
    log(`(req:${id}) raw:`, txt);
    let data = null;
    try {
      data = txt ? JSON.parse(txt) : null;
    } catch {}
    if (!res.ok) {
      const msg = (data && (data.message || data.error)) || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data ?? {};
  } catch (e) {
    logErr(`(req:${id}) ERROR:`, e?.message);
    throw e;
  } finally {
    clearTimeout(to);
  }
};

/* ---------------- Component ---------------- */
export default function EmailOtpVerificationScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();

  const {
    email = "",
    merchant = {},
    serviceType = "food",
    deliveryOption: incomingDelivery = null,
    returnTo = null,
    skipAutoSend = false,
    initialCategory = [],
    owner_type: incomingOwnerType = null,
  } = route.params ?? {};

  // business_type_ids (numbers)
  const businessTypeIds = useMemo(
    () => normalizeCategoryIds(merchant?.category ?? initialCategory),
    [merchant?.category, initialCategory]
  );

  const ownerType = useMemo(
    () => normalizeOwnerType(incomingOwnerType ?? merchant?.owner_type ?? serviceType ?? "food"),
    [incomingOwnerType, merchant?.owner_type, serviceType]
  );

  const deliveryOption = useMemo(
    () => normalizeDeliveryUpper(incomingDelivery ?? merchant?.delivery_option),
    [incomingDelivery, merchant?.delivery_option]
  );

  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // UI niceties
  const [kbHeight, setKbHeight] = useState(0);
  const RESEND_COOLDOWN = 30;
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);
  const inputRef = useRef(null);
  const maskedEmail = useMemo(() => maskEmail(email), [email]);

  useEffect(() => {
    log("SEND_OTP_ENDPOINT:", SEND_OTP_ENDPOINT);
    log("VERIFY_OTP_ENDPOINT:", VERIFY_OTP_ENDPOINT);
    log("REGISTER_MERCHANT_ENDPOINT:", REGISTER_MERCHANT_ENDPOINT);
  }, []);

  // keyboard spacing
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

  // auto send only if not skipped
  useEffect(() => {
    if (!skipAutoSend) {
      sendOtpSilently();
      setCooldown(RESEND_COOLDOWN);
    }
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
  }, [skipAutoSend]);

  /* ---------------- flows ---------------- */
  const sendOtpSilently = async () => {
    log("sendOtpSilently ->", email);
    try {
      await postJson(SEND_OTP_ENDPOINT, { email });
    } catch (e) {
      logErr("sendOtpSilently failed:", e?.message);
      Alert.alert("Couldn’t send code", e?.message || "Please try again.");
    }
  };

  const resendOtp = async () => {
    if (cooldown > 0) return;
    log("resendOtp ->", email);
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
      logErr("resendOtp failed:", e?.message);
      Alert.alert("Failed to resend", e?.message || "Please try again.");
    }
  };

  // Build JSON for non-multipart path (URLs only)
  const buildRegisterJson = () => {
    const bank = merchant?.bank ?? {};
    const json = {
      user_name: merchant?.full_name ?? merchant?.fullName ?? "",
      email: merchant?.email ?? email ?? "",
      phone: merchant?.phone ?? "",
      password: merchant?.password ?? "",
      business_name: merchant?.business_name ?? merchant?.businessName ?? "",
      business_type_ids: businessTypeIds, // REQUIRED array<number>

      // Optional license fields
      ...(merchant?.registration_no
        ? { business_license_number: String(merchant.registration_no) }
        : {}),
      ...(toHttpUrlOrNull(merchant?.license_image ?? merchant?.license)
        ? { license_image: toHttpUrlOrNull(merchant?.license_image ?? merchant?.license) }
        : {}),

      // Coordinates & address (optional)
      ...(merchant?.latitude != null ? { latitude: Number(merchant.latitude) } : {}),
      ...(merchant?.longitude != null ? { longitude: Number(merchant.longitude) } : {}),
      ...(merchant?.address ? { address: String(merchant.address) } : {}),

      // Images as URLs only
      ...(toHttpUrlOrNull(merchant?.logo ?? merchant?.business_logo)
        ? { business_logo: toHttpUrlOrNull(merchant?.logo ?? merchant?.business_logo) }
        : {}),

      delivery_option: deliveryOption ?? undefined, // "SELF" | "GRAB" | "BOTH"
      owner_type: ownerType,                         // "food" | "mart" | ...

      // Bank fields
      ...(bank?.bank_name ? { bank_name: bank.bank_name } : {}),
      ...(bank?.account_name ? { account_holder_name: bank.account_name } : {}),
      ...(bank?.account_number ? { account_number: String(bank.account_number) } : {}),
      ...(toHttpUrlOrNull(bank?.bank_qr ?? bank?.bank_qr_code_image)
        ? { bank_qr_code_image: toHttpUrlOrNull(bank?.bank_qr ?? bank?.bank_qr_code_image) }
        : {}),
    };
    Object.keys(json).forEach((k) => json[k] === undefined && delete json[k]);
    return json;
  };

  // Build FormData for multipart path (local files and/or URLs)
  const buildRegisterFormData = () => {
    const bank = merchant?.bank ?? {};
    const fd = new FormData();

    // text fields
    fd.append("user_name", merchant?.full_name ?? merchant?.fullName ?? "");
    fd.append("email", merchant?.email ?? email ?? "");
    fd.append("phone", merchant?.phone ?? "");
    fd.append("password", merchant?.password ?? "");
    fd.append("business_name", merchant?.business_name ?? merchant?.businessName ?? "");
    if (ownerType) fd.append("owner_type", ownerType);
    if (deliveryOption) fd.append("delivery_option", deliveryOption);
    if (merchant?.registration_no) fd.append("business_license_number", String(merchant.registration_no));
    if (merchant?.latitude != null) fd.append("latitude", String(Number(merchant.latitude)));
    if (merchant?.longitude != null) fd.append("longitude", String(Number(merchant.longitude)));
    if (merchant?.address) fd.append("address", String(merchant.address));
    if (bank?.bank_name) fd.append("bank_name", bank.bank_name);
    if (bank?.account_name) fd.append("account_holder_name", bank.account_name);
    if (bank?.account_number) fd.append("account_number", String(bank.account_number));

    // IMPORTANT: array syntax
    (businessTypeIds || []).forEach((id) => fd.append("business_type_ids[]", String(id)));

    // images: local => file part; https => append as string (server may accept both)
    const logoUri   = getUri(merchant?.logo ?? merchant?.business_logo);
    const licUri    = getUri(merchant?.license_image ?? merchant?.license);
    const bankQrUri = getUri(bank?.bank_qr ?? bank?.bank_qr_code_image);

    if (logoUri) {
      fd.append(
        "business_logo",
        isLocalFile(logoUri) ? buildFilePart(logoUri, "business_logo") : logoUri
      );
    }
    if (licUri) {
      fd.append(
        "license_image",
        isLocalFile(licUri) ? buildFilePart(licUri, "license_image") : licUri
      );
    }
    if (bankQrUri) {
      fd.append(
        "bank_qr_code_image",
        isLocalFile(bankQrUri) ? buildFilePart(bankQrUri, "bank_qr_code_image") : bankQrUri
      );
    }

    return fd;
  };

  const verifyOtpThenRegister = async () => {
    Keyboard.dismiss();
    setError("");

    if (!otp || otp.length !== 6) {
      setError("Enter the 6-digit code.");
      return;
    }
    if (!businessTypeIds.length) {
      setError("Please select at least one business type.");
      Alert.alert("Missing business type", "business_type_ids must be a non-empty array.");
      return;
    }

    try {
      setSubmitting(true);

      // 1) OTP verify
      const verifyBody = { email, otp };
      log("verifyOtpThenRegister ->", verifyBody);
      await postJson(VERIFY_OTP_ENDPOINT, verifyBody);

      // 2) Decide JSON vs MULTIPART
      const logoUri   = getUri(merchant?.logo ?? merchant?.business_logo);
      const licUri    = getUri(merchant?.license_image ?? merchant?.license);
      const bankQrUri = getUri((merchant?.bank ?? {}).bank_qr ?? (merchant?.bank ?? {}).bank_qr_code_image);
      const hasAnyImage = !!(logoUri || licUri || bankQrUri);

      if (hasAnyImage) {
        const fd = buildRegisterFormData();
        await postMultipart(REGISTER_MERCHANT_ENDPOINT, fd);
      } else {
        const regJson = buildRegisterJson();
        log("register JSON ->", regJson);
        await postJson(REGISTER_MERCHANT_ENDPOINT, regJson);
      }

      // 3) Navigate
      log("Registration ok → navigating:", VERIFY_NEXT_ROUTE);
      navigation.navigate(VERIFY_NEXT_ROUTE, {
        ...(route.params ?? {}),
        email,
        status: "submitted",
        email_verified: true,
        returnTo,
      });
    } catch (e) {
      logErr("verifyOtpThenRegister failed:", e?.message);
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

            {/* OTP input with visible caret */}
            <View style={styles.otpWrap}>
              <View style={styles.otpBoxesRow}>
                {Array.from({ length: 6 }).map((_, i) => {
                  const isActive = i === otp.length;
                  const char = otp[i] || "";
                  return (
                    <TouchableOpacity
                      key={i}
                      onPress={() => inputRef.current?.focus()}
                      activeOpacity={0.8}
                      style={[styles.otpBox, isActive && styles.otpBoxActive]}
                    >
                      <Text style={styles.otpBoxChar}>{char ? char : isActive ? "|" : " "}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* hidden real input for autofill + keyboard */}
              <TextInput
                ref={inputRef}
                style={styles.otpHiddenInput}
                value={otp}
                onChangeText={(v) => setOtp(v.replace(/[^0-9]/g, "").slice(0, 6))}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
                returnKeyType="done"
                textContentType="oneTimeCode"
              />
            </View>

            {!!error && (
              <View style={styles.errorWrap}>
                <Ionicons name="warning-outline" size={16} color="#DC2626" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Resend */}
            <View style={styles.resendRow}>
              <Text style={styles.resendHint}>Didn’t get a code?</Text>
              <TouchableOpacity
                onPress={resendOtp}
                disabled={cooldown > 0}
                activeOpacity={cooldown > 0 ? 1 : 0.8}
              >
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
                  initialCategory: businessTypeIds,
                  merchant: {
                    ...(merchant ?? {}),
                    category: businessTypeIds,
                    owner_type: ownerType,
                  },
                  owner_type: ownerType,
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

/* ---------------- helpers + styles ---------------- */
function maskEmail(email = "") {
  const [user = "", domain = ""] = String(email).split("@");
  if (!user || !domain) return email || "";
  const visible = user.slice(0, 2);
  return `${visible}${"•".repeat(Math.max(user.length - 2, 0))}@${domain}`;
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    backgroundColor: "#fff",
  },
  lead: { fontSize: 14, color: "#374151", marginBottom: 14, lineHeight: 20 },
  leadStrong: { fontWeight: "700", color: "#111827" },

  otpWrap: { alignItems: "center", marginTop: 6, marginBottom: 16, width: "100%" },
  otpBoxesRow: { width: "100%", flexDirection: "row", justifyContent: "space-between", gap: 8 },
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
  otpBoxActive: {
    borderColor: "#00b14f",
    shadowColor: "#00b14f",
    shadowOpacity: 0.25,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 3 },
  },
  otpBoxChar: { fontSize: 24, fontWeight: "700", color: "#111827" },

  otpHiddenInput: { position: "absolute", opacity: 0, width: "100%", height: 64 },

  errorWrap: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, marginBottom: 8 },
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
  },
  btnPrimaryText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  btnPrimaryTextDisabled: { color: "#aaa", fontSize: 16, fontWeight: "600" },
});
