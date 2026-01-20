// ForgotOTPVerify.js (env-only endpoints) — UPDATED
// ✅ After OTP verification, REDIRECTS to SetNewPassword screen (separate screen)
// ✅ Keeps resend OTP + cooldown logic
// ✅ Removes inline step-2 password UI from this screen

import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  StatusBar,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { FORGOT_VERIFY_OTP_ENDPOINT, FORGOT_SEND_OTP_ENDPOINT } from "@env";

/* ---------------- helpers ---------------- */

// tiny helper for safe JSON parse
async function postJson(url, body) {
  const res = await fetch(String(url || "").trim(), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  let json = {};
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch (_) {}
  return { res, json, raw };
}

// mask email for UI display (keep first 2 chars of local part, mask the rest)
const maskEmail = (email = "", keepStart = 2) => {
  const e = String(email).trim();
  if (!e || !e.includes("@")) return "";
  const [local, domain] = e.split("@");
  const shown = (local || "").slice(0, keepStart);
  const maskedLocal = shown + ((local || "").length > keepStart ? "**" : "*");
  return `${maskedLocal}@${domain || ""}`;
};

export default function ForgotOTPVerify() {
  const navigation = useNavigation();
  const route = useRoute();

  const email = route?.params?.email || "";
  const masked = useMemo(() => maskEmail(email, 2), [email]);

  // OTP
  const [otp, setOtp] = useState("");
  const [otpFocused, setOtpFocused] = useState(false);

  // shared
  const [loading, setLoading] = useState(false);

  // resend cooldown
  const RESEND_COOLDOWN = 60;
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);
  const [resendLoading, setResendLoading] = useState(false);

  useEffect(() => {
    setCooldown(RESEND_COOLDOWN);
    const t = setInterval(() => setCooldown((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resendLabel = useMemo(() => {
    if (cooldown > 0) return `Resend OTP in ${cooldown}s`;
    if (resendLoading) return "Sending...";
    return "Resend OTP";
  }, [cooldown, resendLoading]);

  // validations
  const isValidOtp = (v) => /^\d{4,8}$/.test((v || "").trim());
  const otpValid = isValidOtp(otp);

  const handleBack = () => navigation.goBack();

  // ---------- VERIFY OTP (uses FORGOT_VERIFY_OTP_ENDPOINT from .env) ----------
  const verifyOtp = async () => {
    if (!email || !otpValid || loading) return;

    const endpoint = String(FORGOT_VERIFY_OTP_ENDPOINT || "").trim();
    if (!endpoint) {
      Alert.alert("Config error", "FORGOT_VERIFY_OTP_ENDPOINT missing in .env");
      return;
    }

    setLoading(true);
    const safeEmail = String(email).trim();
    const otpTrim = String(otp).trim();

    try {
      // Try numeric first; then string to preserve leading zeros
      let { res, json, raw } = await postJson(endpoint, {
        email: safeEmail,
        otp: Number(otpTrim),
      });

      if (!res.ok) {
        const retry = await postJson(endpoint, { email: safeEmail, otp: otpTrim });
        res = retry.res;
        json = retry.json;
        raw = retry.raw;
      }

      if (!res.ok) {
        console.log("[verify-otp] URL:", endpoint);
        console.log("[verify-otp] Sent variants:", {
          email: safeEmail,
          otpNum: Number(otpTrim),
          otpStr: otpTrim,
        });
        console.log(
          "[verify-otp] Status:",
          res.status,
          "JSON:",
          json,
          "Raw:",
          raw?.slice(0, 250)
        );
        Alert.alert("Failed", json?.message || "Invalid OTP. Try again.");
        return;
      }

      Alert.alert("Verified", "OTP verified successfully.", [
        {
          text: "Continue",
          onPress: () => {
            // ✅ Redirect to separate screen for setting password
            // Use replace to prevent going back to OTP screen (recommended)
            try {
              navigation.replace("SetNewPasswordScreen", { email: safeEmail });
            } catch (_) {
              navigation.navigate("SetNewPasswordScreen", { email: safeEmail });
            }
          },
        },
      ]);
    } catch (e) {
      console.error("verify-otp error:", e);
      Alert.alert("Error", "Could not verify OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ---------- RESEND OTP (uses FORGOT_SEND_OTP_ENDPOINT from .env) ----------
  const resendOtp = async () => {
    if (cooldown > 0 || resendLoading) return;

    const endpoint = String(FORGOT_SEND_OTP_ENDPOINT || "").trim();
    if (!endpoint) {
      Alert.alert("Config error", "FORGOT_SEND_OTP_ENDPOINT missing in .env");
      return;
    }

    setResendLoading(true);
    try {
      const { res, json, raw } = await postJson(endpoint, { email: email.trim() });

      if (!res.ok) {
        console.log(
          "[resend-otp] URL:",
          endpoint,
          "Status:",
          res.status,
          "JSON:",
          json,
          "Raw:",
          raw?.slice(0, 250)
        );
        const msg =
          json?.message ||
          json?.error ||
          raw?.slice(0, 160) ||
          `Failed (HTTP ${res.status})`;
        Alert.alert("Failed", typeof msg === "string" ? msg : "Could not resend OTP");
        return;
      }

      Alert.alert("Sent", "A new OTP has been sent to your email.");
      setCooldown(RESEND_COOLDOWN);
    } catch (e) {
      console.error("resend-otp error:", e);
      Alert.alert("Error", "Could not resend OTP. Please try again.");
    } finally {
      setResendLoading(false);
    }
  };

  // ---------- RENDER ----------
  return (
    <SafeAreaView style={styles.container} edges={["top", "right", "left", "bottom"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 10}
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={handleBack} style={styles.iconButton} accessibilityLabel="Go back">
              <Ionicons name="arrow-back" size={24} color="#1A1D1F" />
            </TouchableOpacity>
            <View style={{ width: 40 }} />
          </View>

          {/* Body */}
          <View style={styles.content}>
            <Text style={styles.title}>Enter OTP</Text>
            <Text style={styles.subtitle}>
              We sent a one-time code to{" "}
              <Text style={{ fontWeight: "700", color: "#1A1D1F" }}>{masked}</Text>.
            </Text>

            <Text style={styles.label}>OTP code</Text>
            <View
              style={[
                styles.inputWrapper,
                { borderColor: otpFocused ? "#00b14f" : "#E5E7EB", borderWidth: 1.5 },
              ]}
            >
              <TextInput
                style={styles.input}
                value={otp}
                onChangeText={(v) => setOtp(String(v || "").replace(/\D/g, "").slice(0, 8))}
                onFocus={() => setOtpFocused(true)}
                onBlur={() => setOtpFocused(false)}
                placeholder="Enter your OTP"
                keyboardType="number-pad"
                maxLength={8}
                returnKeyType="done"
                onSubmitEditing={() => otpValid && !loading && verifyOtp()}
              />
            </View>

            <TouchableOpacity
              style={otpValid && !loading ? styles.submitButton : styles.submitButtonDisabled}
              onPress={verifyOtp}
              disabled={!otpValid || loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitButtonText}>Verify</Text>
              )}
            </TouchableOpacity>

            {/* Resend OTP + timer */}
            <TouchableOpacity
              onPress={resendOtp}
              disabled={cooldown > 0 || resendLoading}
              style={{
                marginTop: 10,
                alignSelf: "center",
                opacity: cooldown > 0 || resendLoading ? 0.6 : 1,
              }}
            >
              <Text style={{ color: "#007bff", fontWeight: "600" }}>{resendLabel}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* ---------------- styles ---------------- */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8f9fa", paddingHorizontal: 12 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  iconButton: { padding: 8, justifyContent: "center", alignItems: "center" },
  content: { flex: 1, paddingHorizontal: 8, marginTop: -5 },
  title: { fontSize: 26, fontWeight: "700", color: "#1A1D1F", marginBottom: 16, lineHeight: 34 },
  subtitle: { fontSize: 15, color: "#666", marginBottom: 24 },
  label: { fontSize: 14, marginBottom: 6, color: "#333" },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    paddingHorizontal: 15,
    paddingVertical: 5,
    borderRadius: 12,
    marginBottom: 12,
  },
  input: { flex: 1, fontSize: 16, color: "#1A1D1F", fontWeight: "400" },
  submitButton: {
    backgroundColor: "#00b14f",
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    marginTop: 10,
  },
  submitButtonDisabled: {
    backgroundColor: "#eee",
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    marginTop: 10,
  },
  submitButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
