// ResetPasswordNumber.js  ✅ header style updated to match ResetPasswordScreen.js (email one)
import React, { useMemo, useState } from "react";
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
  Image,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { SEND_OTP_FPW_SMS_ENDPOINT } from "@env";

const ALLOWED_PREFIXES = ["77", "17", "16"];

const safeJson = async (res) => {
  try {
    return await res.json();
  } catch {
    return null;
  }
};

const ResetPasswordNumber = () => {
  const navigation = useNavigation();

  const [phoneNumber, setPhoneNumber] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleChange = (text) => {
    let digits = text.replace(/\D/g, "").slice(0, 8);
    setPhoneNumber(digits);
  };

  const prefix = useMemo(() => phoneNumber.slice(0, 2), [phoneNumber]);
  const isValidPrefix = useMemo(() => ALLOWED_PREFIXES.includes(prefix), [prefix]);
  const isValidPhone = useMemo(
    () => phoneNumber.length === 8 && isValidPrefix,
    [phoneNumber, isValidPrefix]
  );

  const handleClear = () => setPhoneNumber("");

  const sendOtp = async () => {
    if (!isValidPhone || loading) return;

    const endpoint = String(SEND_OTP_FPW_SMS_ENDPOINT || "").trim();
    if (!endpoint) {
      Alert.alert("Config missing", "SEND_OTP_FPW_SMS_ENDPOINT is not set in .env");
      return;
    }

    const fullPhone = `+975${phoneNumber}`;
    setLoading(true);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          phone: fullPhone,
          phone_number: fullPhone,
          mobile: fullPhone,
          country_code: "+975",
          local_phone: phoneNumber,
        }),
      });

      const data = await safeJson(res);

      if (!res.ok) {
        const msg =
          (data && (data.message || data.error || data.msg)) ||
          `Failed to send OTP (HTTP ${res.status})`;
        Alert.alert("OTP not sent", msg);
        return;
      }

      const otpId =
        data?.otp_id ?? data?.otpId ?? data?.data?.otp_id ?? data?.data?.otpId ?? null;

      navigation.navigate("PasswordSentScreen", {
        phoneNumber,
        fullPhone,
        otpId,
        raw: data,
      });
    } catch (e) {
      Alert.alert("Network error", e?.message || "Please try again.");
    } finally {
      setLoading(false);
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
          {/* Header (same style as ResetPasswordScreen.js) */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.iconButton}
              accessibilityLabel="Go back"
              disabled={loading}
            >
              <Ionicons name="arrow-back" size={24} color="#1A1D1F" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => navigation.navigate("HelpScreen")}
              style={styles.iconButton}
              accessibilityLabel="Help"
              disabled={loading}
            >
              <Ionicons name="help-circle-outline" size={24} color="#1A1D1F" />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <View style={styles.content}>
            <Text style={styles.title}>Reset password</Text>
            <Text style={styles.subtitle}>Enter your registered mobile number</Text>

            {/* Phone Input */}
            <View
              style={[
                styles.inputWrapper,
                { borderColor: isFocused ? "#00b14f" : "#E5E7EB", borderWidth: 1.5, opacity: loading ? 0.7 : 1 },
              ]}
            >
              <View style={styles.flagContainer}>
                <View style={styles.flagBox}>
                  <Image source={{ uri: "https://flagcdn.com/w40/bt.png" }} style={styles.flag} />
                </View>
                <Text style={styles.dialCode}>+975</Text>
              </View>

              <TextInput
                style={styles.input}
                placeholder="Enter phone number"
                keyboardType="number-pad"
                inputMode="numeric"
                maxLength={8}
                value={phoneNumber}
                onChangeText={handleChange}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                editable={!loading}
                returnKeyType="done"
                onSubmitEditing={() => {
                  if (isValidPhone && !loading) sendOtp();
                }}
              />

              {phoneNumber.length > 0 && !loading && (
                <TouchableOpacity onPress={handleClear} style={styles.clearButton}>
                  <Ionicons name="close-circle" size={20} color="#aaa" />
                </TouchableOpacity>
              )}
            </View>

            {phoneNumber.length >= 2 && !isValidPrefix && (
              <Text style={styles.warningText}>
                Please enter a valid Bhutanese number (starts with 77, 17, or 16)
              </Text>
            )}

            <TouchableOpacity onPress={() => navigation.navigate("ForgotPassword")} disabled={loading}>
              <Text style={[styles.link, { opacity: loading ? 0.5 : 0.9 }]}>Use email instead</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Bottom */}
        <View style={styles.bottomSticky}>
          <TouchableOpacity
            style={isValidPhone && !loading ? styles.submitButton : styles.submitButtonDisabled}
            onPress={sendOtp}
            disabled={!isValidPhone || loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={isValidPhone ? styles.submitButtonText : styles.submitTextDisabled}>Next</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default ResetPasswordNumber;

const styles = StyleSheet.create({
  // ✅ container/header/content spacing now matches ResetPasswordScreen.js
  container: { flex: 1, backgroundColor: "#f8f9fa", paddingHorizontal: 12 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  iconButton: { padding: 8, justifyContent: "center", alignItems: "center" },

  content: { flex: 1, paddingHorizontal: 8, marginTop: -5 },

  title: { fontSize: 26, fontWeight: "700", color: "#1A1D1F", marginBottom: 15, lineHeight: 38 },
  subtitle: { fontSize: 15, color: "#666", marginBottom: 24 },

  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    paddingHorizontal: 15,
    paddingVertical: 5,
    borderRadius: 12,
    marginBottom: 12,
    justifyContent: "space-between",
  },
  warningText: {
    color: "#d9534f",
    fontSize: 13,
    marginBottom: 10,
    marginLeft: 5,
  },

  flagContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 10,
  },
  flagBox: {
    width: 30,
    height: 23,
    marginRight: 12,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "#ccc",
    overflow: "hidden",
  },
  flag: { width: "100%", height: "100%", resizeMode: "cover" },
  dialCode: { fontSize: 16, fontWeight: "400" },

  input: { flex: 1, fontSize: 16, color: "#1A1D1F", fontWeight: "400" },
  clearButton: { paddingLeft: 10 },

  link: { color: "#007bff", fontSize: 14, marginTop: 10, fontWeight: "bold" },

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
