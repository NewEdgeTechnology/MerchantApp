// SetNewPasswordScreen.js
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
import {
  CommonActions,
  StackActions,
  useNavigation,
  useRoute,
} from "@react-navigation/native";
import { BRAND, FONT, RADIUS, SHADOW } from "../styles/tabdey_brand";
import { FORGOT_RESET_PASSWORD_ENDPOINT } from "@env";

const maskEmail = (email = "", keepStart = 2) => {
  const e = String(email).trim();
  if (!e || !e.includes("@")) return "";
  const [local, domain] = e.split("@");
  const shown = (local || "").slice(0, keepStart);
  return `${shown}${local.length > keepStart ? "**" : "*"}@${domain || ""}`;
};

const findNavigatorWithRoute = (nav, routeName) => {
  let cur = nav;
  while (cur) {
    const names = cur.getState?.()?.routeNames;
    if (Array.isArray(names) && names.includes(routeName)) return cur;
    cur = cur.getParent?.();
  }
  return null;
};

const goToLoginScreen = (navigation, email) => {
  const routeName = "LoginScreen";
  const params = { initialEmail: email, prefillEmail: email };

  const navWithLogin = findNavigatorWithRoute(navigation, routeName);
  if (navWithLogin) {
    try {
      navWithLogin.dispatch(StackActions.replace(routeName, params));
      return;
    } catch (_) {}
  }

  try {
    navigation.dispatch(
      CommonActions.navigate({
        name: "AuthStack",
        action: CommonActions.navigate({ name: routeName, params }),
      }),
    );
    return;
  } catch (_) {}

  navigation.dispatch(CommonActions.navigate({ name: routeName, params }));
};

export default function SetNewPasswordScreen() {
  const navigation = useNavigation();
  const route = useRoute();

  const email = route?.params?.email || "";
  const otp = route?.params?.otp || "";
  const resetToken = route?.params?.resetToken || null;

  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isFocused1, setIsFocused1] = useState(false);
  const [isFocused2, setIsFocused2] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const valid = pwd.length >= 6 && pwd === confirm;
  const maskedEmail = maskEmail(email, 2);

  const postJson = async (url, body) => {
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

    return { res, json, raw };
  };

  const submitNewPassword = async () => {
    if (!valid || loading) return;

    const endpoint = (FORGOT_RESET_PASSWORD_ENDPOINT || "").trim();
    if (!endpoint) {
      Alert.alert(
        "Config error",
        "FORGOT_RESET_PASSWORD_ENDPOINT is missing in your .env",
      );
      return;
    }

    setLoading(true);

    try {
      const payload = {
        email: email.trim(),
        newPassword: pwd,
        otp,
        token: resetToken,
      };

      const { res, json, raw } = await postJson(endpoint, payload);

      if (!res.ok) {
        const msg =
          json?.message ||
          json?.error ||
          raw?.slice(0, 160) ||
          `Failed (HTTP ${res.status})`;

        Alert.alert(
          "Failed",
          typeof msg === "string" ? msg : "Could not reset password.",
        );
        return;
      }

      Alert.alert(
        "Success",
        json?.message || "Your password has been reset. Please log in.",
        [{ text: "OK", onPress: () => goToLoginScreen(navigation, email) }],
      );
    } catch (e) {
      console.error("reset-password error:", e);
      Alert.alert("Error", "Something went wrong. Please try again.");
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
              <Ionicons name="help-circle-outline" size={24} color="#1A1D1F" />
            </TouchableOpacity>
          </View>

          <View style={styles.heroCard}>
            <Text style={styles.brandLabel}>TÀBDEY MERCHANT</Text>
            <Text style={styles.title}>Set new password</Text>
            <Text style={styles.subtitle}>
              Create a strong password for{" "}
              <Text style={styles.boldText}>{maskedEmail}</Text>.
            </Text>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.label}>New password</Text>
            <View
              style={[
                styles.inputWrapper,
                {
                  borderColor: isFocused1 ? BRAND.purple : BRAND.greyBorder,
                  opacity: loading ? 0.7 : 1,
                },
              ]}
            >
              <TextInput
                style={styles.input}
                value={pwd}
                onChangeText={setPwd}
                onFocus={() => setIsFocused1(true)}
                onBlur={() => setIsFocused1(false)}
                placeholder="Enter new password"
                placeholderTextColor="#9CA3AF"
                secureTextEntry={!showPwd}
                autoCapitalize="none"
                returnKeyType="next"
                editable={!loading}
              />

              <TouchableOpacity
                onPress={() => setShowPwd((v) => !v)}
                style={styles.eyeBtn}
                disabled={loading}
              >
                <Ionicons
                  name={showPwd ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color={BRAND.grey}
                />
              </TouchableOpacity>
            </View>

            <Text style={[styles.label, { marginTop: 14 }]}>
              Confirm password
            </Text>
            <View
              style={[
                styles.inputWrapper,
                {
                  borderColor: isFocused2 ? BRAND.purple : BRAND.greyBorder,
                  opacity: loading ? 0.7 : 1,
                },
              ]}
            >
              <TextInput
                style={styles.input}
                value={confirm}
                onChangeText={setConfirm}
                onFocus={() => setIsFocused2(true)}
                onBlur={() => setIsFocused2(false)}
                placeholder="Re-enter new password"
                placeholderTextColor="#9CA3AF"
                secureTextEntry={!showConfirm}
                autoCapitalize="none"
                returnKeyType="done"
                editable={!loading}
                onSubmitEditing={() => valid && !loading && submitNewPassword()}
              />

              <TouchableOpacity
                onPress={() => setShowConfirm((v) => !v)}
                style={styles.eyeBtn}
                disabled={loading}
              >
                <Ionicons
                  name={showConfirm ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color={BRAND.grey}
                />
              </TouchableOpacity>
            </View>

            {confirm.length > 0 && pwd !== confirm && (
              <Text style={styles.warningText}>Passwords do not match.</Text>
            )}

            <Text style={styles.tip}>Password must be at least 6 characters.</Text>
          </View>

          <TouchableOpacity
            style={
              valid && !loading
                ? styles.submitButton
                : styles.submitButtonDisabled
            }
            onPress={submitNewPassword}
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
                Update Password
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
  container: { flex: 1, backgroundColor: "#FBF7FF" },

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

  eyeBtn: { paddingLeft: 10 },

  warningText: {
    fontFamily: FONT.body,
    color: BRAND.red,
    fontSize: 13,
    marginTop: 10,
    fontWeight: "600",
  },

  tip: {
    fontFamily: FONT.body,
    marginTop: 12,
    fontSize: 12,
    color: BRAND.grey,
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

  bottomSpacer: { height: 50 },
});