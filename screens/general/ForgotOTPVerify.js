// ForgotOTPVerify.js
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
import { BRAND, FONT, RADIUS, SHADOW } from "../styles/tabdey_brand";
import { FORGOT_VERIFY_OTP_ENDPOINT, FORGOT_SEND_OTP_ENDPOINT } from "@env";

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

  const [otp, setOtp] = useState("");
  const [otpFocused, setOtpFocused] = useState(false);
  const [loading, setLoading] = useState(false);

  const RESEND_COOLDOWN = 60;
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);
  const [resendLoading, setResendLoading] = useState(false);

  useEffect(() => {
    setCooldown(RESEND_COOLDOWN);
    const t = setInterval(() => {
      setCooldown((s) => (s > 0 ? s - 1 : 0));
    }, 1000);

    return () => clearInterval(t);
  }, []);

  const resendLabel = useMemo(() => {
    if (cooldown > 0) return `Resend OTP in ${cooldown}s`;
    if (resendLoading) return "Sending...";
    return "Resend OTP";
  }, [cooldown, resendLoading]);

  const isValidOtp = (v) => /^\d{4,8}$/.test((v || "").trim());
  const otpValid = isValidOtp(otp);

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
      let { res, json, raw } = await postJson(endpoint, {
        email: safeEmail,
        otp: Number(otpTrim),
      });

      if (!res.ok) {
        const retry = await postJson(endpoint, {
          email: safeEmail,
          otp: otpTrim,
        });

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
          raw?.slice(0, 250),
        );

        Alert.alert("Failed", json?.message || "Invalid OTP. Try again.");
        return;
      }

      Alert.alert("Verified", "OTP verified successfully.", [
        {
          text: "Continue",
          onPress: () => {
            try {
              navigation.replace("SetNewPasswordScreen", {
                email: safeEmail,
              });
            } catch (_) {
              navigation.navigate("SetNewPasswordScreen", {
                email: safeEmail,
              });
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

  const resendOtp = async () => {
    if (cooldown > 0 || resendLoading) return;

    const endpoint = String(FORGOT_SEND_OTP_ENDPOINT || "").trim();

    if (!endpoint) {
      Alert.alert("Config error", "FORGOT_SEND_OTP_ENDPOINT missing in .env");
      return;
    }

    setResendLoading(true);

    try {
      const { res, json, raw } = await postJson(endpoint, {
        email: email.trim(),
      });

      if (!res.ok) {
        console.log(
          "[resend-otp] URL:",
          endpoint,
          "Status:",
          res.status,
          "JSON:",
          json,
          "Raw:",
          raw?.slice(0, 250),
        );

        const msg =
          json?.message ||
          json?.error ||
          raw?.slice(0, 160) ||
          `Failed (HTTP ${res.status})`;

        Alert.alert(
          "Failed",
          typeof msg === "string" ? msg : "Could not resend OTP",
        );
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

  return (
    <SafeAreaView style={styles.container} edges={["left", "right", "bottom"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FBF7FF" />
      <View style={styles.topGlow} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 10}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.iconButton}
              accessibilityLabel="Go back"
              activeOpacity={0.86}
              disabled={loading}
            >
              <Ionicons name="arrow-back" size={24} color="#1A1D1F" />
            </TouchableOpacity>

            <Text style={styles.headerTitle}>Verify</Text>

            <TouchableOpacity
              onPress={() => navigation.navigate("HelpScreen")}
              style={styles.iconButton}
              accessibilityLabel="Help"
              activeOpacity={0.86}
              disabled={loading}
            >
              <Ionicons
                name="help-circle-outline"
                size={24}
                color="#1A1D1F"
              />
            </TouchableOpacity>
          </View>

          <View style={styles.heroCard}>
            <Text style={styles.brandLabel}>TÀBDEY MERCHANT</Text>
            <Text style={styles.title}>Enter OTP</Text>
            <Text style={styles.subtitle}>
              We sent a one-time code to{" "}
              <Text style={styles.boldText}>{masked}</Text>.
            </Text>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.label}>OTP code</Text>

            <View
              style={[
                styles.inputWrapper,
                {
                  borderColor: otpFocused ? BRAND.purple : BRAND.greyBorder,
                  opacity: loading ? 0.7 : 1,
                },
              ]}
            >
              <TextInput
                style={styles.input}
                value={otp}
                onChangeText={(v) =>
                  setOtp(String(v || "").replace(/\D/g, "").slice(0, 8))
                }
                onFocus={() => setOtpFocused(true)}
                onBlur={() => setOtpFocused(false)}
                placeholder="Enter your OTP"
                placeholderTextColor="#9CA3AF"
                keyboardType="number-pad"
                maxLength={8}
                returnKeyType="done"
                editable={!loading}
                onSubmitEditing={() => otpValid && !loading && verifyOtp()}
              />
            </View>

            <TouchableOpacity
              onPress={resendOtp}
              disabled={cooldown > 0 || resendLoading}
              activeOpacity={0.86}
            >
              <Text
                style={[
                  styles.resendText,
                  {
                    opacity: cooldown > 0 || resendLoading ? 0.55 : 1,
                  },
                ]}
              >
                {resendLabel}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={
              otpValid && !loading
                ? styles.submitButton
                : styles.submitButtonDisabled
            }
            onPress={verifyOtp}
            disabled={!otpValid || loading}
            activeOpacity={0.9}
          >
            {loading ? (
              <ActivityIndicator color={BRAND.white} />
            ) : (
              <Text
                style={
                  otpValid ? styles.submitButtonText : styles.submitTextDisabled
                }
              >
                Verify
              </Text>
            )}
          </TouchableOpacity>

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
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

  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 42,
    paddingBottom: 24,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 26,
  },

  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: BRAND.white,
    justifyContent: "center",
    alignItems: "center",
    ...SHADOW.sm,
  },

  headerTitle: {
    fontFamily: FONT.header,
    fontSize: 22,
    fontWeight: "700",
    color: BRAND.black,
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

  title: {
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

  boldText: {
    fontFamily: FONT.body,
    fontWeight: "700",
    color: BRAND.black,
  },

  formCard: {
    backgroundColor: BRAND.white,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: BRAND.greyBorder,
    ...SHADOW.sm,
  },

  label: {
    fontFamily: FONT.body,
    fontSize: 14,
    marginBottom: 7,
    color: BRAND.black,
    fontWeight: "700",
  },

  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    height: 56,
    borderWidth: 1.2,
    borderRadius: 18,
    backgroundColor: "#FCFCFC",
    paddingHorizontal: 16,
  },

  input: {
    flex: 1,
    fontFamily: FONT.body,
    fontSize: 15,
    color: BRAND.black,
    paddingVertical: 10,
  },

  resendText: {
    color: BRAND.purple,
    fontSize: 13,
    marginTop: 14,
    fontWeight: "800",
    fontFamily: FONT.body,
    textAlign: "center",
  },

  submitButton: {
    backgroundColor: BRAND.purple,
    paddingVertical: 16,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    marginTop: 24,
    ...SHADOW.md,
  },

  submitButtonDisabled: {
    backgroundColor: BRAND.greyLight,
    paddingVertical: 16,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    marginTop: 24,
  },

  submitButtonText: {
    color: BRAND.white,
    fontSize: 16,
    fontWeight: "700",
    fontFamily: FONT.body,
  },

  submitTextDisabled: {
    color: BRAND.grey,
    fontSize: 16,
    fontWeight: "600",
    fontFamily: FONT.body,
  },

  bottomSpacer: {
    height: 50,
  },
});