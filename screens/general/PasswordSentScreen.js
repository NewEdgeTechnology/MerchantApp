// PasswordSentScreen.js ✅ styled to match ResetPasswordScreen.js header/layout
import React, { useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  StatusBar,
  ScrollView,
  ActivityIndicator,
  Alert,
  TextInput,
  Keyboard,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { SEND_OTP_FPW_SMS_ENDPOINT, VERIFY_OTP_FPW_SMS_ENDPOINT } from "@env";

const NEXT_AFTER_VERIFY_SCREEN = "SetNewPasswordScreen";

const safeJson = async (res) => {
  try {
    return await res.json();
  } catch {
    return null;
  }
};

const onlyDigits = (s = "") => String(s || "").replace(/\D/g, "");

const maskPhone = (fullPhone = "") => {
  const s = String(fullPhone || "");
  if (s.length <= 6) return s;
  const keepStart = s.startsWith("+975") ? 4 : 2;
  const start = s.slice(0, keepStart);
  const end = s.slice(-2);
  return `${start}******${end}`;
};

const PasswordSentScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();

  const { phoneNumber = "", fullPhone = "", otpId = null, raw = null } = route.params || {};

  const finalPhone = useMemo(
    () => String(fullPhone || `+975${phoneNumber}`).trim(),
    [fullPhone, phoneNumber]
  );
  const displayPhone = useMemo(() => maskPhone(finalPhone), [finalPhone]);

  const [otp, setOtp] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const inputRef = useRef(null);

  const resendOtp = async () => {
    const endpoint = String(SEND_OTP_FPW_SMS_ENDPOINT || "").trim();
    if (!endpoint) {
      Alert.alert("Config missing", "SEND_OTP_FPW_SMS_ENDPOINT is not set in .env");
      return;
    }
    if (!finalPhone) {
      Alert.alert("Missing number", "Phone number not found.");
      return;
    }

    setSending(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: finalPhone,
          phone_number: finalPhone,
          mobile: finalPhone,
          country_code: "+975",
          local_phone: phoneNumber,
        }),
      });

      const data = await safeJson(res);

      if (!res.ok) {
        const msg =
          (data && (data.message || data.error || data.msg)) ||
          `Failed to resend OTP (HTTP ${res.status})`;
        Alert.alert("OTP not sent", msg);
        return;
      }

      Alert.alert("OTP Sent", data?.message || "OTP has been sent via SMS.");
      setOtp("");
      setTimeout(() => inputRef.current?.focus?.(), 200);
    } catch (e) {
      Alert.alert("Network error", e?.message || "Please try again.");
    } finally {
      setSending(false);
    }
  };

  const busy = sending || verifying;
  const canVerify = useMemo(() => onlyDigits(otp).length >= 4, [otp]);

  const verifyOtp = async () => {
    const endpoint = String(VERIFY_OTP_FPW_SMS_ENDPOINT || "").trim();
    if (!endpoint) {
      Alert.alert("Config missing", "VERIFY_OTP_FPW_SMS_ENDPOINT is not set in .env");
      return;
    }
    const code = onlyDigits(otp);

    if (!finalPhone) return Alert.alert("Missing number", "Phone number not found.");
    if (code.length < 4) return Alert.alert("Invalid OTP", "Please enter the OTP.");

    setVerifying(true);
    Keyboard.dismiss();

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: finalPhone,
          phone_number: finalPhone,
          mobile: finalPhone,
          otp: code,
          code,
          otp_id: otpId,
        }),
      });

      const data = await safeJson(res);

      if (!res.ok) {
        const msg =
          (data && (data.message || data.error || data.msg)) ||
          `OTP verification failed (HTTP ${res.status})`;
        Alert.alert("Invalid OTP", msg);
        return;
      }

      Alert.alert("Verified", data?.message || "OTP verified successfully.");

      navigation.navigate(NEXT_AFTER_VERIFY_SCREEN, {
        phoneNumber,
        fullPhone: finalPhone,
        otp: code,
        otpId,
        verifyRaw: data,
      });
    } catch (e) {
      Alert.alert("Network error", e?.message || "Please try again.");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "right", "left", "bottom"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 10}
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          {/* Header ✅ same as ResetPasswordScreen.js */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.iconButton}
              accessibilityLabel="Go back"
              disabled={busy}
            >
              <Ionicons name="arrow-back" size={24} color="#1A1D1F" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => navigation.navigate("HelpScreen")}
              style={styles.iconButton}
              accessibilityLabel="Help"
              disabled={busy}
            >
              <Ionicons name="help-circle-outline" size={24} color="#1A1D1F" />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <View style={styles.content}>
            <Text style={styles.title}>Enter OTP</Text>
            <Text style={styles.subtitle}>
              We sent a verification code to <Text style={styles.bold}>{displayPhone}</Text>.
            </Text>

            {!!raw?.message && <Text style={styles.serverMsg}>{String(raw.message)}</Text>}

            <View
              style={[
                styles.inputWrapper,
                { borderColor: "#E5E7EB", borderWidth: 1.5, opacity: busy ? 0.75 : 1 },
              ]}
            >
              <TextInput
                ref={inputRef}
                style={styles.otpInput}
                placeholder="Enter OTP"
                keyboardType="number-pad"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChangeText={(t) => setOtp(onlyDigits(t).slice(0, 6))}
                editable={!busy}
                returnKeyType="done"
                onSubmitEditing={verifyOtp}
              />

              {otp.length > 0 && !busy && (
                <TouchableOpacity onPress={() => setOtp("")} style={styles.clearButton}>
                  <Ionicons name="close-circle" size={20} color="#aaa" />
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity onPress={resendOtp} disabled={busy} style={styles.linkBtn}>
              {sending ? (
                <ActivityIndicator size="small" color="#00b14f" />
              ) : (
                <Text style={styles.link}>Resend OTP</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Bottom ✅ same button style */}
        <View style={styles.bottomSticky}>
          <TouchableOpacity
            style={canVerify && !busy ? styles.submitButton : styles.submitButtonDisabled}
            onPress={verifyOtp}
            disabled={!canVerify || busy}
          >
            {verifying ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={canVerify && !busy ? styles.submitButtonText : styles.submitTextDisabled}>
                Verify
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.goBack()} disabled={busy}>
            <Text style={[styles.link, { textAlign: "center", marginTop: 10, opacity: busy ? 0.5 : 0.9 }]}>
              Change number
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default PasswordSentScreen;

const styles = StyleSheet.create({
  // ✅ matches ResetPasswordScreen.js container/header spacing
  container: { flex: 1, backgroundColor: "#f8f9fa", paddingHorizontal: 12 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  iconButton: { padding: 8, justifyContent: "center", alignItems: "center" },

  content: { flex: 1, paddingHorizontal: 8, marginTop: -5 },

  title: { fontSize: 26, fontWeight: "700", color: "#1A1D1F", marginBottom: 12, lineHeight: 38 },
  subtitle: { fontSize: 15, color: "#666", marginBottom: 16, lineHeight: 22 },
  bold: { fontWeight: "700", color: "#1A1D1F" },
  serverMsg: { fontSize: 13, color: "#00b14f", marginTop: -6, marginBottom: 10 },

  // ✅ same input wrapper style as ResetPasswordScreen.js
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    paddingHorizontal: 15,
    paddingVertical: 5,
    borderRadius: 12,
    marginBottom: 12,
  },
  otpInput: { flex: 1, fontSize: 16, color: "#1A1D1F", fontWeight: "400", letterSpacing: 2 },
  clearButton: { paddingLeft: 10 },

  linkBtn: { alignSelf: "flex-start" },
  link: { color: "#007bff", fontSize: 14, fontWeight: "bold", opacity: 0.9 },

  bottomSticky: {
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === "android" ? 20 : 20,
    borderRadius: 15,
    marginBottom: 8,
  },
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
  submitTextDisabled: { color: "#aaa", fontSize: 16, fontWeight: "600" },
});
