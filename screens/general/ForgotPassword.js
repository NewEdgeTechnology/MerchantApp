// ResetPasswordScreen.js (uses ONLY FORGOT_SEND_OTP_ENDPOINT from .env)
import React, { useState } from "react";
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
import { useNavigation } from "@react-navigation/native";
import { BRAND, FONT, RADIUS, SHADOW } from "../styles/tabdey_brand";
import { FORGOT_SEND_OTP_ENDPOINT } from "@env";

// Helper: safe fetch + JSON parse (avoids crashes if backend returns HTML)
async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  let json = {};
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch (_) {}
  return { res, raw, json };
}

const ResetPasswordScreen = () => {
  const navigation = useNavigation();
  const [email, setEmail] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [loading, setLoading] = useState(false);

  const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
  const valid = isValidEmail(email);

  const handleClear = () => setEmail("");

  const sendEmailOtp = async () => {
    if (!valid || loading) return;
    setLoading(true);

    // Read from .env only
    const endpoint = (FORGOT_SEND_OTP_ENDPOINT || "").trim();

    if (!endpoint) {
      Alert.alert(
        "Config error",
        "FORGOT_SEND_OTP_ENDPOINT is missing in your .env",
      );
      setLoading(false);
      return;
    }

    const payload = { email: email.trim(), username: email.trim() };

    try {
      const { res, raw, json } = await postJson(endpoint, payload);
      // console.log('[forgot/send-otp]', endpoint, '=>', res.status);

      if (res.ok) {
        Alert.alert("Success", "We sent a reset OTP to your email.");
        navigation.replace("ForgotOTPVerify", { email: email.trim() });
        return;
      }

      // Not OK: show message if provided, else a short fallback
      const msg =
        json?.message ||
        json?.error ||
        raw?.slice(0, 160) ||
        `Failed (HTTP ${res.status})`;
      Alert.alert(
        "Failed",
        typeof msg === "string" ? msg : "Failed to send OTP",
      );
    } catch (e) {
      console.error("send-otp error:", e);
      Alert.alert("Error", "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView
      style={styles.container}
      edges={["top", "left", "right", "bottom"]}
    >
      <StatusBar barStyle="dark-content" backgroundColor={BRAND.white} />

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
            >
              <Ionicons name="arrow-back" size={22} color={BRAND.black} />
            </TouchableOpacity>

            <Text style={styles.headerTitle}>Reset</Text>

            <TouchableOpacity
              onPress={() => navigation.navigate("HelpScreen")}
              style={styles.iconButton}
              accessibilityLabel="Help"
              activeOpacity={0.86}
            >
              <Ionicons
                name="help-circle-outline"
                size={22}
                color={BRAND.black}
              />
            </TouchableOpacity>
          </View>

          <View style={styles.heroCard}>
            <Text style={styles.brandLabel}>TÀBDEY MERCHANT</Text>
            <Text style={styles.title}>Reset password</Text>
            <Text style={styles.subtitle}>
              Enter your registered email address. We’ll send you an OTP to
              reset your password.
            </Text>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.label}>Email address</Text>

            <View
              style={[
                styles.inputWrapper,
                {
                  borderColor: isFocused ? BRAND.purple : BRAND.greyBorder,
                },
              ]}
            >
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder="example@email.com"
                placeholderTextColor="#9aa0a6"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={() => {
                  if (valid && !loading) sendEmailOtp();
                }}
              />

              {email.length > 0 && (
                <TouchableOpacity
                  onPress={handleClear}
                  style={styles.clearButton}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close-circle" size={20} color={BRAND.grey} />
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              onPress={() => navigation.navigate("ResetPasswordNumber")}
              activeOpacity={0.86}
            >
              <Text style={styles.link}>Use mobile number instead</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={
              valid && !loading
                ? styles.submitButton
                : styles.submitButtonDisabled
            }
            onPress={sendEmailOtp}
            disabled={!valid || loading}
            activeOpacity={0.9}
          >
            {loading ? (
              <ActivityIndicator color={BRAND.white} />
            ) : (
              <Text
                style={
                  valid ? styles.submitButtonText : styles.submitTextDisabled
                }
              >
                Next
              </Text>
            )}
          </TouchableOpacity>

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default ResetPasswordScreen;

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
    paddingHorizontal: 18,
    paddingTop: 0,
    paddingBottom: 24,
  },

  header: {
    minHeight: 54,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "transparent",
    marginBottom: 12,
  },

  iconButton: {
    width: 42,
    height: 42,
    borderRadius: RADIUS.full,
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

  clearButton: {
    paddingLeft: 10,
  },

  link: {
    color: BRAND.purple,
    fontSize: 13,
    marginTop: 12,
    fontWeight: "800",
    fontFamily: FONT.body,
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
