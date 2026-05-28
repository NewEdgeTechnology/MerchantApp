// ResetPasswordNumber.js
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
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { BRAND, FONT, RADIUS, SHADOW } from "../styles/tabdey_brand";
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
    const digits = text.replace(/\D/g, "").slice(0, 8);
    setPhoneNumber(digits);
  };

  const prefix = useMemo(() => phoneNumber.slice(0, 2), [phoneNumber]);
  const isValidPrefix = useMemo(
    () => ALLOWED_PREFIXES.includes(prefix),
    [prefix],
  );

  const isValidPhone = useMemo(
    () => phoneNumber.length === 8 && isValidPrefix,
    [phoneNumber, isValidPrefix],
  );

  const handleClear = () => setPhoneNumber("");

  const sendOtp = async () => {
    if (!isValidPhone || loading) return;

    const endpoint = String(SEND_OTP_FPW_SMS_ENDPOINT || "").trim();

    if (!endpoint) {
      Alert.alert(
        "Config missing",
        "SEND_OTP_FPW_SMS_ENDPOINT is not set in .env",
      );
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
          data?.message ||
          data?.error ||
          data?.msg ||
          `Failed to send OTP (HTTP ${res.status})`;

        Alert.alert("OTP not sent", msg);
        return;
      }

      const otpId =
        data?.otp_id ??
        data?.otpId ??
        data?.data?.otp_id ??
        data?.data?.otpId ??
        null;

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

            <Text style={styles.headerTitle}>Reset</Text>

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
            <Text style={styles.title}>Reset password</Text>
            <Text style={styles.subtitle}>
              Enter your registered mobile number. We’ll send you an OTP to
              reset your password.
            </Text>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.label}>Mobile number</Text>

            <View
              style={[
                styles.phoneRow,
                {
                  borderColor: isFocused ? BRAND.purple : BRAND.greyBorder,
                  opacity: loading ? 0.7 : 1,
                },
              ]}
            >
              <View style={styles.countrySelector}>
                <Text style={styles.countryCode}>+975</Text>
              </View>

              <TextInput
                style={styles.input}
                placeholder="Enter mobile number"
                placeholderTextColor="#9CA3AF"
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
                <TouchableOpacity
                  onPress={handleClear}
                  style={styles.clearButton}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close-circle" size={20} color={BRAND.grey} />
                </TouchableOpacity>
              )}
            </View>

            <Text style={styles.tip}>Format: 77/17/16 XXXXXX (8 digits)</Text>

            {phoneNumber.length >= 2 && !isValidPrefix && (
              <Text style={styles.warningText}>
                Please enter a valid Bhutanese number starting with 77, 17, or
                16.
              </Text>
            )}

            <TouchableOpacity
              onPress={() => navigation.navigate("ForgotPassword")}
              activeOpacity={0.86}
              disabled={loading}
            >
              <Text style={[styles.link, { opacity: loading ? 0.5 : 1 }]}>
                Use email instead
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={
              isValidPhone && !loading
                ? styles.submitButton
                : styles.submitButtonDisabled
            }
            onPress={sendOtp}
            disabled={!isValidPhone || loading}
            activeOpacity={0.9}
          >
            {loading ? (
              <ActivityIndicator color={BRAND.white} />
            ) : (
              <Text
                style={
                  isValidPhone
                    ? styles.submitButtonText
                    : styles.submitTextDisabled
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

export default ResetPasswordNumber;

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

  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    height: 56,
    borderWidth: 1.2,
    borderRadius: 18,
    backgroundColor: "#FCFCFC",
    paddingHorizontal: 12,
  },

  countrySelector: {
    paddingRight: 12,
    marginRight: 10,
    borderRightWidth: 1,
    borderRightColor: BRAND.greyBorder,
  },

  countryCode: {
    fontFamily: FONT.body,
    fontSize: 15,
    fontWeight: "700",
    color: BRAND.black,
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

  tip: {
    fontFamily: FONT.body,
    marginTop: 8,
    fontSize: 12,
    color: BRAND.grey,
  },

  warningText: {
    fontFamily: FONT.body,
    color: BRAND.red,
    fontSize: 13,
    marginTop: 8,
    fontWeight: "600",
  },

  link: {
    color: BRAND.purple,
    fontSize: 13,
    marginTop: 14,
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