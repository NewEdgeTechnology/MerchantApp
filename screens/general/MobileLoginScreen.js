// screens/general/MobileLoginScreen.js
// ✅ Updated (NO masking / NO dots):
// - Phone input always shows digits as typed (no ••••••••)
// - Still validates 77/17/16 + 8 digits
// - Same header style + paddingTop: 40
// - Format tip shown BELOW the input
// - Placeholder: "Enter mobile number"
// - Redirects to GrabMerchantHomeScreen (reset) like LoginScreen

import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  StatusBar,
  TextInput,
  ScrollView,
  Keyboard,
  ActivityIndicator,
  KeyboardAvoidingView,
  Alert,
  Modal,
  LayoutAnimation,
  UIManager,
  DeviceEventEmitter as RNDeviceEventEmitter,
} from "react-native";
import Icon from "react-native-vector-icons/Ionicons";
import { useNavigation, CommonActions, StackActions } from "@react-navigation/native";
import * as SecureStore from "expo-secure-store";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LOGIN_MERCHANT_ENDPOINT } from "@env";
import { connectMerchantSocket } from "../realtime/merchantSocket";

/* ===== Safe emitter (no-op if unavailable) ===== */
const SafeDeviceEventEmitter =
  RNDeviceEventEmitter && typeof RNDeviceEventEmitter.emit === "function"
    ? RNDeviceEventEmitter
    : { emit: () => {} };

/* ───────── Navigation helpers (same as LoginScreen) ───────── */
const WELCOME_ROUTE = "WelcomeScreen";
const AUTH_STACK = "AuthStack";
const routeExists = (nav, name) => {
  try {
    return !!nav?.getState?.()?.routeNames?.includes(name);
  } catch {
    return false;
  }
};
const tryResetTo = (nav, name) => {
  if (!nav) return false;
  if (routeExists(nav, name)) {
    nav.dispatch(CommonActions.reset({ index: 0, routes: [{ name }] }));
    return true;
  }
  return tryResetTo(nav.getParent?.(), name);
};
const goToWelcome = (navigation) => {
  if (tryResetTo(navigation, WELCOME_ROUTE)) return;
  if (routeExists(navigation, AUTH_STACK)) {
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: AUTH_STACK, state: { index: 0, routes: [{ name: WELCOME_ROUTE }] } }],
      })
    );
    return;
  }
  try {
    navigation.dispatch(StackActions.replace(WELCOME_ROUTE));
    return;
  } catch {}
  navigation.navigate(WELCOME_ROUTE);
};

/* ---------------- enable LayoutAnimation (Android only) ---------------- */
function enableAndroidLayoutAnimationOnPaper() {
  if (Platform.OS !== "android") return;
  const isFabric = !!global?.nativeFabricUIManager;
  if (isFabric) return;
  if (typeof UIManager?.setLayoutAnimationEnabledExperimental === "function") {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

/* ---------------- constants ---------------- */
const COUNTRY = { name: "Bhutan", code: "bt", dial: "+975" };
const ALLOWED_PREFIXES = ["77", "17", "16"];

/* ---------------- helpers ---------------- */
const digitsOnly = (t = "") => String(t || "").replace(/\D/g, "");

const safeJsonParse = async (res) => {
  const raw = await res.text();
  try {
    return { data: JSON.parse(raw), raw };
  } catch {
    return { data: null, raw };
  }
};
const postJson = async (url, body, signal) => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const parsed = await safeJsonParse(res);
  return { res, ...parsed };
};

function useKeyboardGap(minGap = 8) {
  const [gap, setGap] = useState(minGap);
  useEffect(() => {
    const onShow = (e) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      const h = e?.endCoordinates?.height ?? 0;
      setGap(Math.max(minGap, h + 8));
    };
    const onHide = () => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setGap(minGap);
    };
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const s1 = Keyboard.addListener(showEvt, onShow);
    const s2 = Keyboard.addListener(hideEvt, onHide);
    return () => {
      s1.remove();
      s2.remove();
    };
  }, [minGap]);
  return gap;
}

export default function MobileLoginScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const bottomGap = useKeyboardGap(8);

  useEffect(() => {
    enableAndroidLayoutAnimationOnPaper();
  }, []);

  // ✅ Keep only REAL digits (no masking)
  const [phoneDigits, setPhoneDigits] = useState("");

  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const [errorText, setErrorText] = useState("");

  const phoneRef = useRef(null);
  const passwordRef = useRef(null);

  const hasPhoneError = useMemo(() => {
    const digits = phoneDigits;
    const prefix = digits.slice(0, 2);
    const okPrefix = ALLOWED_PREFIXES.includes(prefix);
    return !(digits.length === 8 && okPrefix);
  }, [phoneDigits]);

  const canSubmit = !hasPhoneError && password.trim().length >= 6 && !loading;

  const handlePhoneChange = (text) => {
    setTouched(true);
    const digits = digitsOnly(text).slice(0, 8);
    setPhoneDigits(digits);
    setErrorText("");
  };

  const navigateHome = (extras = {}) => {
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [
          {
            name: "GrabMerchantHomeScreen",
            params: { openTab: "Home", nonce: Date.now(), ...extras },
          },
        ],
      })
    );
  };

  const handleLogin = async () => {
    setTouched(true);
    setErrorText("");

    const base = (LOGIN_MERCHANT_ENDPOINT || "").trim();
    if (!base) {
      Alert.alert("Configuration error", "LOGIN_MERCHANT_ENDPOINT is not configured in .env");
      return;
    }

    const digits = phoneDigits;
    const prefix = digits.slice(0, 2);
    const okPrefix = ALLOWED_PREFIXES.includes(prefix);

    if (!(digits.length === 8 && okPrefix) || password.trim().length < 6) {
      const msg = "Please enter a valid mobile number (77/17/16 + 8 digits) and a password (min 6 chars).";
      setErrorText(msg);
      return;
    }

    const payload = { phone: `${COUNTRY.dial}${digits}`, password: password.trim() };

    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    try {
      const out = await postJson(base, payload, controller.signal);

      if (!out.res.ok) {
        const msg = "Invalid phone or password.";
        setErrorText(msg);
        Alert.alert("Login failed", msg);
        return;
      }

      const data = out.data || {};
      const tokenStr =
        typeof data?.token === "string"
          ? data.token
          : data?.token?.access_token || data?.access_token || "";

      if (tokenStr) {
        try {
          await SecureStore.setItemAsync("auth_token", String(tokenStr));
        } catch {}
      }

      const userInfo = data?.merchant || data?.user || data?.data?.merchant || data?.data?.user || data || {};
      const user_id = userInfo?.user_id ?? userInfo?.id ?? data?.user_id ?? data?.id ?? null;

      const business_id = userInfo?.business_id ?? userInfo?.businessId ?? data?.business_id ?? data?.id ?? "";
      const business_name = userInfo?.business_name ?? userInfo?.businessName ?? data?.business_name ?? "";
      const business_logo = userInfo?.business_logo ?? userInfo?.businessLogo ?? userInfo?.logo ?? "";
      const business_address = userInfo?.business_address ?? userInfo?.businessAddress ?? userInfo?.address ?? "";

      const userPayload = {
        user_id,
        business_id,
        business_name,
        business_logo,
        business_address,
        phone: `${COUNTRY.dial}${digits}`,
        token: data?.token || null,
      };
      try {
        await SecureStore.setItemAsync("merchant_login", JSON.stringify(userPayload));
      } catch {}

      SafeDeviceEventEmitter.emit("profile-updated", { business_name, business_logo });

      try {
        connectMerchantSocket({ user_id, business_id });
      } catch {}

      navigateHome({
        business_name,
        business_logo,
        business_address,
        business_id,
        auth_token: tokenStr,
      });
    } catch (e) {
      const msg =
        e?.name === "AbortError" ? "Request timeout. Please try again." : "Network error. Please try again.";
      setErrorText(msg);
      Alert.alert("Login failed", msg);
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      <View style={styles.inner}>
        {loading && (
          <Modal transparent>
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#00b14f" />
            </View>
          </Modal>
        )}

        {/* HEADER — same as LoginScreen */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => goToWelcome(navigation)}
            style={styles.iconButton}
            activeOpacity={0.7}
            disabled={loading}
          >
            <Icon name="arrow-back" size={24} color="#1A1D1F" />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Log In</Text>

          <TouchableOpacity
            onPress={() => navigation.navigate("HelpScreen")}
            style={styles.iconButton}
            activeOpacity={0.7}
            disabled={loading}
          >
            <Icon name="help-circle-outline" size={24} color="#1A1D1F" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="always">
          <View style={styles.form}>
            <Text style={styles.title}>Log in with mobile number</Text>

            <Text style={styles.label}>Mobile number</Text>

            <View style={styles.phoneRow}>
              <View style={styles.countrySelector}>
                <Text style={styles.countryCode}>{COUNTRY.dial}</Text>
              </View>

              <View style={[styles.inputWrapper, hasPhoneError && touched && styles.inputError]}>
                <TextInput
                  ref={phoneRef}
                  style={styles.inputField}
                  value={phoneDigits}              // ✅ always show digits (no dots)
                  onChangeText={handlePhoneChange}
                  placeholder="Enter mobile number"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="number-pad"
                  inputMode="numeric"
                  maxLength={8}
                  onFocus={() => setTouched(true)}
                  returnKeyType="next"
                  blurOnSubmit={false}
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  editable={!loading}
                />
              </View>
            </View>

            {/* ✅ Format tip BELOW the input */}
            <Text style={styles.tip}>Format: 77/17/16 XXXXXX (8 digits)</Text>

            {/* {hasPhoneError && touched && ( */}
              {/* <Text style={styles.inlineError}>Enter 8 digits starting with 77, 17, or 16</Text> */}
            {/* )} */}

            <Text style={[styles.label, { marginTop: 14 }]}>Password</Text>
            <View style={styles.passwordContainer}>
              <TextInput
                ref={passwordRef}
                style={styles.passwordInput}
                value={password}
                onChangeText={(t) => {
                  setPassword(t);
                  setErrorText("");
                }}
                placeholder="Enter password"
                placeholderTextColor="#9CA3AF"
                secureTextEntry={!showPassword}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
                editable={!loading}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity onPress={() => setShowPassword((s) => !s)} style={styles.eyeIcon} disabled={loading}>
                <Icon name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#666" />
              </TouchableOpacity>
            </View>

            {!!errorText && <Text style={styles.inlineError}>{errorText}</Text>}

            <View style={{ height: 40 }} />
          </View>
        </ScrollView>

        {/* Footer — like LoginScreen */}
        <View style={[styles.footer, { paddingBottom: Math.max(bottomGap, insets.bottom + 8) }]}>
          <Text style={styles.forgotText}>
            Forgot your{" "}
            <Text style={styles.link} onPress={() => !loading && navigation.navigate("ForgotPassword")}>
              password
            </Text>
            ?
          </Text>

          <TouchableOpacity
            style={canSubmit ? styles.loginButton : styles.loginButtonDisabled}
            disabled={!canSubmit}
            onPress={handleLogin}
            activeOpacity={0.85}
          >
            <Text style={canSubmit ? styles.loginButtonText : styles.loginButtonTextDisabled}>Log In</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.loginPhoneButton}
            onPress={() => !loading && navigation.navigate("LoginScreen")}
            activeOpacity={0.85}
            disabled={loading}
          >
            <Text style={styles.loginPhoneText}>Log In with Email</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  inner: { flex: 1, padding: 20, paddingTop: 40 },

  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  iconButton: { padding: 8 },

  // Keeping your original marginRight to preserve your current layout
  headerTitle: { fontSize: 22, fontWeight: "600", color: "#1A1D1F", marginRight: 180 },

  form: { flexGrow: 1, padding: 8 },
  title: { fontSize: 18, fontWeight: "500", color: "#1A1D1F", marginBottom: 15 },

  label: { marginBottom: 6, fontSize: 14, color: "#333" },
  tip: { marginTop: -4, marginBottom: 10, fontSize: 12, color: "#6B7280" },

  phoneRow: { flexDirection: "row", marginBottom: 6, gap: 8 },
  countrySelector: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#ccc",
    height: 50,
  },
  countryCode: { fontSize: 14, fontWeight: "500", color: "#1A1D1F" },

  inputWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 10,
    height: 50,
    borderColor: "#ccc",
    backgroundColor: "#fff",
  },
  inputError: { borderColor: "#EF4444" },
  inputField: { flex: 1, fontSize: 14, paddingVertical: 10, color: "#1A1D1F" },

  passwordContainer: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 15,
    alignItems: "center",
    paddingHorizontal: 10,
    paddingRight: 14,
    marginBottom: 8,
    height: 50,
    borderColor: "#ccc",
    backgroundColor: "#fff",
    marginTop: 2,
  },
  passwordInput: { flex: 1, fontSize: 14, paddingVertical: 10, paddingRight: 8, color: "#1A1D1F" },
  eyeIcon: { padding: 4 },

  inlineError: { color: "#DC2626", fontSize: 13, fontWeight: "600", marginTop: 6, marginBottom: 8 },

  forgotText: { textAlign: "center", fontSize: 14, color: "#333", opacity: 0.7, marginBottom: 16 },
  link: { color: "#007AFF", fontWeight: "500", opacity: 0.8 },

  footer: { marginBottom: 15, paddingHorizontal: 8 },
  loginButton: { backgroundColor: "#00b14f", paddingVertical: 14, borderRadius: 25, alignItems: "center", marginBottom: 10 },
  loginButtonText: { color: "#fff", fontSize: 16, fontWeight: "500" },
  loginButtonDisabled: { backgroundColor: "#eee", paddingVertical: 14, borderRadius: 25, alignItems: "center", marginBottom: 10 },
  loginButtonTextDisabled: { color: "#aaa", fontSize: 16, fontWeight: "500" },
  loginPhoneButton: { backgroundColor: "#e9fcf6", paddingVertical: 14, borderRadius: 25, alignItems: "center" },
  loginPhoneText: { color: "#004d3f", fontSize: 16, fontWeight: "600" },

  loadingOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)", justifyContent: "center", alignItems: "center" },
});
