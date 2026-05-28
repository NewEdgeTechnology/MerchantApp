// screens/registrationsteps/EmailOtpVerificationScreen.js
// ✅ Updated to send BOTH: cid + id_card_number (backend wants cid)
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
import {
  useSafeAreaInsets,
  SafeAreaView,
} from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import HeaderWithSteps from "./HeaderWithSteps";
import { BRAND, FONT, RADIUS, SHADOW } from "../styles/tabdey_brand";

import {
  SEND_OTP_ENDPOINT,
  VERIFY_OTP_ENDPOINT,
  REGISTER_MERCHANT_ENDPOINT,
  SEND_OTP_REGISTER_SMS_ENDPOINT,
  VERIFY_OTP_REGISTER_SMS_ENDPOINT,
} from "@env";

const VERIFY_NEXT_ROUTE = "MobileLoginScreen";
const EDIT_SIGNUP_ROUTE = "SignupScreen";

/* ---------------- Debug helpers (SAFE) ---------------- */
const DEBUG_NET = true;
const rid = () => Math.random().toString(36).slice(2, 8);
const log = (...a) => DEBUG_NET && console.log("[OTP]", ...a);
const logErr = (...a) => DEBUG_NET && console.log("[OTP ERR]", ...a);

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

const normalizeOwnerType = (s) =>
  String(s || "")
    .trim()
    .toLowerCase();

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

// ✅ CID/ID Card (digits only, max 11)
const normalizeCid11 = (v) =>
  String(v || "")
    .replace(/[^0-9]/g, "")
    .slice(0, 11);

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
const getUri = (v) =>
  typeof v === "string" ? v : v?.uri || v?.url || v?.path || null;
const guessMime = (uri = "") => {
  const u = uri.toLowerCase();
  if (u.endsWith(".png")) return "image/png";
  if (u.endsWith(".jpg") || u.endsWith(".jpeg")) return "image/jpeg";
  if (u.endsWith(".webp")) return "image/webp";
  if (u.endsWith(".heic") || u.endsWith(".heif")) return "image/jpeg";
  return "application/octet-stream";
};
const buildFilePart = (uri, base = "image") => {
  const type = guessMime(uri);
  const name = (uri.split("?")[0].split("/").pop() || base).replace(
    /[^a-z0-9._-]/gi,
    "_",
  );
  return { uri, name: name.includes(".") ? name : `${name}.jpg`, type };
};

/* ---------------- Network helpers ---------------- */
const postJson = async (url, payload, timeoutMs = 20000) => {
  const u = String(url || "").trim();
  if (!u) throw new Error("Endpoint missing");
  const id = rid();
  log(`(req:${id}) POST JSON ->`, u);

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
    log(`(req:${id}) raw:`, txt);

    let data = null;
    try {
      data = txt ? JSON.parse(txt) : null;
    } catch {}

    if (!res.ok) {
      const msg =
        (data && (data.message || data.error)) || txt || `HTTP ${res.status}`;
      throw new Error(String(msg).slice(0, 500));
    }

    if (data && data.success === false && data.message) {
      throw new Error(String(data.message));
    }

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
  console.log("Multipart FormData:", formData);

  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(u, {
      method: "POST",
      headers: {
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
      const msg =
        (data && (data.message || data.error)) || txt || `HTTP ${res.status}`;
      throw new Error(String(msg).slice(0, 500));
    }

    return data ?? {};
  } catch (e) {
    logErr(`(req:${id}) ERROR:`, e?.message);
    throw e;
  } finally {
    clearTimeout(to);
  }
};

/* ---------------- OTP Channel resolver ---------------- */
const normalizeOtpChannel = (v) => {
  const s = String(v || "")
    .trim()
    .toLowerCase();
  if (s === "sms" || s === "phone" || s === "mobile") return "sms";
  if (s === "email" || s === "mail") return "email";
  return "sms";
};

/* ---------------- Component ---------------- */
export default function EmailOtpVerificationScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();

  const {
    email = "",
    phone = "",

    otpChannel: incomingOtpChannel = "sms",
    otp_channel = null,
    verifyBy = null,
    method = null,

    // ✅ accept cid from previous screen
    idCardNo: incomingIdCardNo = null,

    merchant = {},
    serviceType = "food",
    deliveryOption: incomingDelivery = null,
    returnTo = null,
    skipAutoSend = false,
    initialCategory = [],
    owner_type: incomingOwnerType = null,
  } = route.params ?? {};

  const otpChannel = useMemo(
    () =>
      normalizeOtpChannel(
        incomingOtpChannel ?? otp_channel ?? verifyBy ?? method,
      ),
    [incomingOtpChannel, otp_channel, verifyBy, method],
  );

  const effectivePhone = useMemo(
    () => String(phone || merchant?.phone || "").trim(),
    [phone, merchant?.phone],
  );

  const businessTypeIds = useMemo(
    () => normalizeCategoryIds(merchant?.category ?? initialCategory),
    [merchant?.category, initialCategory],
  );

  const ownerType = useMemo(
    () =>
      normalizeOwnerType(
        incomingOwnerType ?? merchant?.owner_type ?? serviceType ?? "food",
      ),
    [incomingOwnerType, merchant?.owner_type, serviceType],
  );

  const deliveryOption = useMemo(
    () => normalizeDeliveryUpper(incomingDelivery ?? merchant?.delivery_option),
    [incomingDelivery, merchant?.delivery_option],
  );

  // ✅ final cid used for register (backend wants `cid`)
  const cid = useMemo(() => {
    const raw =
      incomingIdCardNo ??
      merchant?.cid ??
      merchant?.id_card_number ??
      merchant?.idCardNo ??
      merchant?.id_card_no ??
      null;
    return normalizeCid11(raw);
  }, [
    incomingIdCardNo,
    merchant?.cid,
    merchant?.id_card_number,
    merchant?.idCardNo,
    merchant?.id_card_no,
  ]);

  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [kbHeight, setKbHeight] = useState(0);
  const RESEND_COOLDOWN = 30;
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);
  const inputRef = useRef(null);

  const maskedEmail = useMemo(() => maskEmail(email), [email]);
  const maskedPhone = useMemo(
    () => maskPhone(effectivePhone),
    [effectivePhone],
  );

  const sendEndpoint =
    otpChannel === "sms" ? SEND_OTP_REGISTER_SMS_ENDPOINT : SEND_OTP_ENDPOINT;
  const verifyEndpoint =
    otpChannel === "sms"
      ? VERIFY_OTP_REGISTER_SMS_ENDPOINT
      : VERIFY_OTP_ENDPOINT;

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
  }, [skipAutoSend, otpChannel]);

  const sendOtpSilently = async () => {
    try {
      if (!String(sendEndpoint || "").trim()) {
        throw new Error("Send OTP endpoint is missing in .env");
      }

      if (otpChannel === "sms") {
        if (!effectivePhone) throw new Error("Phone number missing.");
        await postJson(sendEndpoint, {
          phone: effectivePhone,
          mobile: effectivePhone,
          msisdn: effectivePhone,
          type: "register_sms",
        });
        return;
      }

      if (!String(email || "").trim()) throw new Error("Email missing.");
      await postJson(sendEndpoint, {
        email: String(email).trim(),
        to: String(email).trim(),
        type: "email_verification",
      });
    } catch (e) {
      logErr("sendOtpSilently failed:", e?.message);
      Alert.alert("Couldn’t send code", e?.message || "Please try again.");
    }
  };

  const resendOtp = async () => {
    if (cooldown > 0) return;

    try {
      if (!String(sendEndpoint || "").trim()) {
        throw new Error("Send OTP endpoint is missing in .env");
      }

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

      if (otpChannel === "sms") {
        if (!effectivePhone) throw new Error("Phone number missing.");
        await postJson(sendEndpoint, {
          phone: effectivePhone,
          mobile: effectivePhone,
          msisdn: effectivePhone,
          type: "register_sms",
        });
        Alert.alert("Code sent", `We sent a new code to ${maskedPhone}.`);
        return;
      }

      if (!String(email || "").trim()) throw new Error("Email missing.");
      await postJson(sendEndpoint, {
        email: String(email).trim(),
        to: String(email).trim(),
        type: "email_verification",
      });
      Alert.alert("Code sent", `We sent a new code to ${maskedEmail}.`);
    } catch (e) {
      setCooldown(0);
      logErr("resendOtp failed:", e?.message);
      Alert.alert("Failed to resend", e?.message || "Please try again.");
    }
  };

  const buildRegisterJson = () => {
    const bank = merchant?.bank ?? {};
    const json = {
      user_name: merchant?.full_name ?? merchant?.fullName ?? "",
      email: merchant?.email ?? email ?? "",
      phone: merchant?.phone ?? effectivePhone ?? "",
      password: merchant?.password ?? "",
      business_name: merchant?.business_name ?? merchant?.businessName ?? "",
      business_type_ids: businessTypeIds,

      // ✅ BACKEND NEEDS cid
      ...(cid ? { cid } : {}),
      // ✅ keep also id_card_number (some APIs use this)
      ...(cid ? { id_card_number: cid } : {}),

      ...(merchant?.registration_no
        ? { business_license_number: String(merchant.registration_no) }
        : {}),
      ...(toHttpUrlOrNull(merchant?.license_image ?? merchant?.license)
        ? {
            license_image: toHttpUrlOrNull(
              merchant?.license_image ?? merchant?.license,
            ),
          }
        : {}),

      ...(merchant?.latitude != null
        ? { latitude: Number(merchant.latitude) }
        : {}),
      ...(merchant?.longitude != null
        ? { longitude: Number(merchant.longitude) }
        : {}),
      ...(merchant?.address ? { address: String(merchant.address) } : {}),

      ...(toHttpUrlOrNull(merchant?.logo ?? merchant?.business_logo)
        ? {
            business_logo: toHttpUrlOrNull(
              merchant?.logo ?? merchant?.business_logo,
            ),
          }
        : {}),

      delivery_option: deliveryOption ?? undefined,
      owner_type: ownerType,

      ...(bank?.bank_name ? { bank_name: bank.bank_name } : {}),
      ...(bank?.account_name ? { account_holder_name: bank.account_name } : {}),
      ...(bank?.account_number
        ? { account_number: String(bank.account_number) }
        : {}),
      ...(toHttpUrlOrNull(bank?.bank_qr ?? bank?.bank_qr_code_image)
        ? {
            bank_qr_code_image: toHttpUrlOrNull(
              bank?.bank_qr ?? bank?.bank_qr_code_image,
            ),
          }
        : {}),
    };

    Object.keys(json).forEach((k) => json[k] === undefined && delete json[k]);
    return json;
  };

  const buildRegisterFormData = () => {
    const bank = merchant?.bank ?? {};
    const fd = new FormData();

    fd.append("user_name", merchant?.full_name ?? merchant?.fullName ?? "");
    fd.append("email", merchant?.email ?? email ?? "");
    fd.append("phone", merchant?.phone ?? effectivePhone ?? "");
    fd.append("password", merchant?.password ?? "");
    fd.append(
      "business_name",
      merchant?.business_name ?? merchant?.businessName ?? "",
    );

    // ✅ BACKEND NEEDS cid
    if (cid) fd.append("cid", cid);
    // ✅ keep also id_card_number
    if (cid) fd.append("id_card_number", cid);

    if (ownerType) fd.append("owner_type", ownerType);
    if (deliveryOption) fd.append("delivery_option", deliveryOption);
    if (merchant?.registration_no)
      fd.append("business_license_number", String(merchant.registration_no));
    if (merchant?.latitude != null)
      fd.append("latitude", String(Number(merchant.latitude)));
    if (merchant?.longitude != null)
      fd.append("longitude", String(Number(merchant.longitude)));
    if (merchant?.address) fd.append("address", String(merchant.address));
    if (bank?.bank_name) fd.append("bank_name", bank.bank_name);
    if (bank?.account_name) fd.append("account_holder_name", bank.account_name);
    if (bank?.account_number)
      fd.append("account_number", String(bank.account_number));

    (businessTypeIds || []).forEach((id) =>
      fd.append("business_type_ids[]", String(id)),
    );

    const logoUri = getUri(merchant?.logo ?? merchant?.business_logo);
    const licUri = getUri(merchant?.license_image ?? merchant?.license);
    const bankQrUri = getUri(
      (merchant?.bank ?? {}).bank_qr ??
        (merchant?.bank ?? {}).bank_qr_code_image,
    );

    if (logoUri) {
      fd.append(
        "business_logo",
        isLocalFile(logoUri)
          ? buildFilePart(logoUri, "business_logo")
          : logoUri,
      );
    }
    if (licUri) {
      fd.append(
        "license_image",
        isLocalFile(licUri) ? buildFilePart(licUri, "license_image") : licUri,
      );
    }
    if (bankQrUri) {
      fd.append(
        "bank_qr_code_image",
        isLocalFile(bankQrUri)
          ? buildFilePart(bankQrUri, "bank_qr_code_image")
          : bankQrUri,
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

    // ✅ enforce cid here (exactly 11 digits)
    if (!cid || cid.length !== 11) {
      setError("CID must be exactly 11 digits.");
      Alert.alert("Missing CID", "CID must be exactly 11 digits.");
      return;
    }

    if (!businessTypeIds.length) {
      setError("Please select at least one business type.");
      Alert.alert(
        "Missing business type",
        "business_type_ids must be a non-empty array.",
      );
      return;
    }

    try {
      setSubmitting(true);

      if (!String(verifyEndpoint || "").trim()) {
        throw new Error("Verify OTP endpoint is missing in .env");
      }

      if (otpChannel === "sms") {
        if (!effectivePhone) throw new Error("Phone number missing.");
        await postJson(verifyEndpoint, {
          phone: effectivePhone,
          mobile: effectivePhone,
          msisdn: effectivePhone,
          otp,
          type: "register_sms",
        });
      } else {
        if (!String(email || "").trim()) throw new Error("Email missing.");
        await postJson(verifyEndpoint, {
          email: String(email).trim(),
          otp,
          type: "email_verification",
        });
      }

      if (!String(REGISTER_MERCHANT_ENDPOINT || "").trim()) {
        throw new Error("REGISTER_MERCHANT_ENDPOINT is missing in .env");
      }

      const logoUri = getUri(merchant?.logo ?? merchant?.business_logo);
      const licUri = getUri(merchant?.license_image ?? merchant?.license);
      const bankQrUri = getUri(
        (merchant?.bank ?? {}).bank_qr ??
          (merchant?.bank ?? {}).bank_qr_code_image,
      );
      const hasAnyImage = !!(logoUri || licUri || bankQrUri);

      if (hasAnyImage) {
        const fd = buildRegisterFormData();
        await postMultipart(REGISTER_MERCHANT_ENDPOINT, fd);
      } else {
        const regJson = buildRegisterJson();
        await postJson(REGISTER_MERCHANT_ENDPOINT, regJson);
      }

      navigation.navigate(VERIFY_NEXT_ROUTE, {
        ...(route.params ?? {}),
        email: email || null,
        phone: effectivePhone || null,
        idCardNo: cid,
        status: "submitted",
        otpChannel,
        verified: otpChannel,
        returnTo,
      });
    } catch (e) {
  console.log("========= MERCHANT REGISTER ERROR =========");
  console.log("Error message:", e?.message);
  console.log("Full error:", e);
  console.log("REGISTER_MERCHANT_ENDPOINT:", REGISTER_MERCHANT_ENDPOINT);
  console.log("merchant logo:", merchant?.logo);
  console.log("merchant business_logo:", merchant?.business_logo);
  console.log("merchant license:", merchant?.license);
  console.log("merchant license_image:", merchant?.license_image);
  console.log("bank qr:", merchant?.bank?.bank_qr);
  console.log("bank qr code image:", merchant?.bank?.bank_qr_code_image);
  console.log("==========================================");

  logErr("verifyOtpThenRegister failed:", e?.message);
  setError(e?.message || "Something went wrong. Please try again.");
} finally {
      setSubmitting(false);
    }
  };

  const isValid = otp.length === 6;
  const title = otpChannel === "sms" ? "Verify Phone" : "Verify Email";
  const target = otpChannel === "sms" ? maskedPhone : maskedEmail;

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right", "bottom"]}>
      <View style={styles.topGlow} />

      <View style={styles.page}>
        <HeaderWithSteps
          step="Step 7 of 7"
          title={title}
          onBack={() => navigation.goBack()}
        />

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={[
              styles.container,
              { paddingBottom: 60 + bottomSpace },
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.heroCard}>
              <Text style={styles.brandLabel}>TÀBDEY MERCHANT</Text>
              <Text style={styles.h1}>{title}</Text>
              <Text style={styles.subtitle}>
                Enter the 6-digit code sent to{" "}
                <Text style={styles.subtitleStrong}>{target}</Text>.
              </Text>
            </View>

            <View style={styles.otpCard}>
              <Text style={styles.otpTitle}>Verification code</Text>

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
                        <Text style={styles.otpBoxChar}>
                          {char ? char : isActive ? "|" : " "}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <TextInput
                  ref={inputRef}
                  style={styles.otpHiddenInput}
                  value={otp}
                  onChangeText={(v) =>
                    setOtp(v.replace(/[^0-9]/g, "").slice(0, 6))
                  }
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

              <View style={styles.resendRow}>
                <Text style={styles.resendHint}>Didn’t get a code?</Text>
                <TouchableOpacity
                  onPress={resendOtp}
                  disabled={cooldown > 0}
                  activeOpacity={cooldown > 0 ? 1 : 0.8}
                >
                  <Text
                    style={[
                      styles.resendLink,
                      cooldown > 0 && styles.resendDisabled,
                    ]}
                  >
                    {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend"}
                  </Text>
                </TouchableOpacity>
              </View>

              {otpChannel === "email" ? (
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
                        cid,
                        id_card_number: cid,
                      },
                      idCardNo: cid,
                      owner_type: ownerType,
                      returnTo: "ReviewSubmitScreen",
                    })
                  }
                >
                  <Ionicons
                    name="mail-outline"
                    size={16}
                    color={BRAND.purple}
                  />
                  <Text style={styles.editEmailText}>
                    Use a different email
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <TouchableOpacity
              onPress={verifyOtpThenRegister}
              disabled={!isValid || submitting}
              style={
                !isValid || submitting
                  ? styles.btnPrimaryDisabled
                  : styles.btnPrimary
              }
              activeOpacity={0.9}
            >
              {submitting ? (
                <ActivityIndicator color={BRAND.white} />
              ) : (
                <Text
                  style={
                    !isValid || submitting
                      ? styles.btnPrimaryTextDisabled
                      : styles.btnPrimaryText
                  }
                >
                  Verify
                </Text>
              )}
            </TouchableOpacity>

            <View style={styles.bottomSpacer} />
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
}

function maskEmail(email = "") {
  const [user = "", domain = ""] = String(email).split("@");
  if (!user || !domain) return email || "";
  const visible = user.slice(0, 2);
  return `${visible}${"•".repeat(Math.max(user.length - 2, 0))}@${domain}`;
}
function maskPhone(phone = "") {
  const p = String(phone || "").replace(/\s+/g, "");
  if (!p) return "";
  if (p.length <= 4) return "••••";
  return `••••••${p.slice(-4)}`;
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

  container: {
    flexGrow: 1,
    paddingTop: 0,
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

  subtitleStrong: {
    color: BRAND.black,
    fontWeight: "800",
  },

  otpCard: {
    backgroundColor: BRAND.white,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: BRAND.greyBorder,
    ...SHADOW.sm,
  },

  otpTitle: {
    fontFamily: FONT.body,
    fontSize: 15,
    fontWeight: "800",
    color: BRAND.black,
    marginBottom: 14,
  },

  otpWrap: {
    alignItems: "center",
    marginBottom: 16,
    width: "100%",
  },

  otpBoxesRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 7,
  },

  otpBox: {
    flex: 1,
    height: 58,
    borderRadius: 16,
    borderWidth: 1.3,
    borderColor: BRAND.greyBorder,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FCFCFC",
  },

  otpBoxActive: {
    borderColor: BRAND.purple,
    backgroundColor: "#F4ECFF",
    shadowColor: BRAND.purple,
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },

  otpBoxChar: {
    fontFamily: FONT.body,
    fontSize: 24,
    fontWeight: "800",
    color: BRAND.black,
  },

  otpHiddenInput: {
    position: "absolute",
    opacity: 0,
    width: "100%",
    height: 64,
  },

  errorWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
    marginBottom: 8,
    backgroundColor: "#FEF2F2",
    borderRadius: 14,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },

  errorText: {
    flex: 1,
    color: "#DC2626",
    fontSize: 13,
    fontWeight: "700",
    fontFamily: FONT.body,
  },

  resendRow: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    justifyContent: "center",
  },

  resendHint: {
    color: BRAND.grey,
    fontSize: 13,
    fontFamily: FONT.body,
  },

  resendLink: {
    color: BRAND.purple,
    fontWeight: "800",
    fontSize: 13,
    fontFamily: FONT.body,
  },

  resendDisabled: {
    color: "#9CA3AF",
  },

  editEmail: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    justifyContent: "center",
  },

  editEmailText: {
    color: BRAND.purple,
    fontWeight: "800",
    fontSize: 13,
    fontFamily: FONT.body,
  },

  btnPrimary: {
    backgroundColor: BRAND.purple,
    paddingVertical: 16,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    marginTop: 24,
    ...SHADOW.md,
  },

  btnPrimaryDisabled: {
    backgroundColor: BRAND.greyLight,
    paddingVertical: 16,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    marginTop: 24,
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

  bottomSpacer: {
    height: 80,
  },
});
