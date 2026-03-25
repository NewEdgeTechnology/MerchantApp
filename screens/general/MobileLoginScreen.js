// screens/general/MobileLoginScreen.js
// ✅ Updated: NO expo-notifications import
// ✅ NEW: prints stored expo token (if any) or prints stable local device id on login click
// ✅ NEW: Save password checkbox (like LoginScreen)
// ✅ NEW: Saves necessary info in SecureStore (auth_token, refresh_token if present, user_id, business_id, merchant_login,
//         last phone, saved phone/password when checkbox enabled)
// ✅ FIX: include owner_type in merchant_login + navigation params (so food/mart loads correctly)
// ✅ FIX (REQUESTED): show backend message properly when login fails (supports {message} or {error})

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
import {
  useNavigation,
  CommonActions,
  StackActions,
} from "@react-navigation/native";
import CheckBox from "expo-checkbox";
import * as SecureStore from "expo-secure-store";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LOGIN_MERCHANT_ENDPOINT } from "@env";
import { connectMerchantSocket } from "../realtime/merchantSocket";
import { getExpoPushTokenAsync } from "../../utils/getExpoPushTokenAsync";
// import { getStableDeviceId } from "../../utils/deviceId";

/* ===== Safe emitter (no-op if unavailable) ===== */
const SafeDeviceEventEmitter =
  RNDeviceEventEmitter && typeof RNDeviceEventEmitter.emit === "function"
    ? RNDeviceEventEmitter
    : { emit: () => { } };

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
        routes: [
          {
            name: AUTH_STACK,
            state: { index: 0, routes: [{ name: WELCOME_ROUTE }] },
          },
        ],
      })
    );
    return;
  }
  try {
    navigation.dispatch(StackActions.replace(WELCOME_ROUTE));
    return;
  } catch { }
  navigation.navigate(WELCOME_ROUTE);
};

async function getValidExpoPushToken() {
  let token = await getExpoPushTokenAsync();

  // retry if not ready
  if (!token || !token.startsWith("ExponentPushToken")) {
    await new Promise((res) => setTimeout(res, 1000));
    token = await getExpoPushTokenAsync();
  }

  return token;
}
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

/* ---------------- SecureStore keys (aligned with LoginScreen style) ---------------- */
const KEY_AUTH_TOKEN = "auth_token";
const KEY_REFRESH_TOKEN = "refresh_token_v1";
const KEY_MERCHANT_LOGIN = "merchant_login";
const KEY_USER_ID = "user_id_v1";
const KEY_BUSINESS_ID = "business_id_v1";

// Phone-screen remember-me keys
const KEY_SAVED_PHONE = "saved_phone_v1";
const KEY_SAVED_PHONE_PASSWORD = "saved_phone_password_v1";
const KEY_LAST_LOGIN_PHONE = "last_login_phone_v1";

// Existing push/device debug keys
const KEY_EXPO_PUSH_TOKEN = "expo_push_token_v1";
const KEY_LOCAL_DEVICE_ID = "local_device_id_v1";

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
    const showEvt =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const s1 = Keyboard.addListener(showEvt, onShow);
    const s2 = Keyboard.addListener(hideEvt, onHide);
    return () => {
      s1.remove();
      s2.remove();
    };
  }, [minGap]);
  return gap;
}

function uuidv4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function getOrCreateLocalDeviceId() {
  const existing = await SecureStore.getItemAsync(KEY_LOCAL_DEVICE_ID);
  if (existing) return existing;
  const fresh = uuidv4();
  await SecureStore.setItemAsync(KEY_LOCAL_DEVICE_ID, fresh);
  return fresh;
}
async function printPushIdOnLoginClick(pushToken) {
  console.log("[DEVICE] Expo push token (device_id):", pushToken || "");
  return { expo_push_token: pushToken || "", device_id: pushToken || "" };
}

/* ✅ NEW: robust error message extraction */
function extractErrorMessage(out) {
  // out: { res, data, raw }
  const fallback = "Login failed. Please try again.";

  // Prefer parsed JSON body
  if (out?.data && typeof out.data === "object") {
    const msg =
      out.data.message ||
      out.data.error ||
      out.data.msg ||
      out.data?.data?.message ||
      out.data?.data?.error ||
      out.data?.data?.msg ||
      "";
    if (String(msg || "").trim()) return String(msg).trim();
  }

  // Fallback: parse raw text as JSON if possible
  const raw = String(out?.raw || "").trim();
  if (!raw) return fallback;

  try {
    const parsed = JSON.parse(raw);
    const msg = parsed?.message || parsed?.error || parsed?.msg || "";
    if (String(msg || "").trim()) return String(msg).trim();
  } catch {
    // If server returned text/plain, just show it
    return raw || fallback;
  }

  return fallback;
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
  const [pushToken, setPushToken] = useState(null);
  const [deviceId, setDeviceId] = useState("");
  // ✅ remember-me checkbox
  const [savePassword, setSavePassword] = useState(false);

  const phoneRef = useRef(null);
  const passwordRef = useRef(null);

  const hasPhoneError = useMemo(() => {
    const digits = phoneDigits;
    const prefix = digits.slice(0, 2);
    const okPrefix = ALLOWED_PREFIXES.includes(prefix);
    return !(digits.length === 8 && okPrefix);
  }, [phoneDigits]);

  const canSubmit =
    !hasPhoneError && password.trim().length >= 6 && !!deviceId && !loading;
  useEffect(() => {
    const fetchPushToken = async () => {
      const token = await getExpoPushTokenAsync();
      setPushToken(token);
      console.log("Push token on mobile login screen:", token);
    };
    fetchPushToken();
  }, []);
  useEffect(() => {
  (async () => {
    const token = await getValidExpoPushToken();

    setPushToken(token);
    setDeviceId(token);

    console.log("Expo Push Token (used as device_id):", token);
  })();
  }, []);
  // ✅ load saved phone/password or last phone
  useEffect(() => {
    const loadSaved = async () => {
      try {
        const [savedPhone, savedPwd, lastPhone] = await Promise.all([
          SecureStore.getItemAsync(KEY_SAVED_PHONE),
          SecureStore.getItemAsync(KEY_SAVED_PHONE_PASSWORD),
          SecureStore.getItemAsync(KEY_LAST_LOGIN_PHONE),
        ]);

        if (savedPhone || savedPwd) {
          setPhoneDigits(String(savedPhone || ""));
          setPassword(String(savedPwd || ""));
          setSavePassword(!!savedPwd);
        } else if (lastPhone) {
          setPhoneDigits(String(lastPhone || ""));
        }
      } catch { }
    };
    loadSaved();
  }, []);

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
    Alert.alert(
      "Configuration error",
      "LOGIN_MERCHANT_ENDPOINT is not configured in .env"
    );
    return;
  }

  const digits = phoneDigits;
  const prefix = digits.slice(0, 2);
  const okPrefix = ALLOWED_PREFIXES.includes(prefix);

  if (!(digits.length === 8 && okPrefix) || password.trim().length < 6) {
    const msg =
      "Please enter a valid mobile number (77/17/16 + 8 digits) and a password (min 6 chars).";
    setErrorText(msg);
    return;
  }

  // ✅ ALWAYS fetch fresh Expo Push Token here
  const getValidExpoToken = async () => {
    let token = await getExpoPushTokenAsync();

    if (!token || !token.startsWith("ExponentPushToken")) {
      await new Promise((res) => setTimeout(res, 1000));
      token = await getExpoPushTokenAsync();
    }

    return token;
  };

  const deviceId = await getValidExpoToken();

  if (!deviceId) {
    Alert.alert("Error", "Unable to get device token. Please try again.");
    return;
  }

  console.log("LOGIN device_id (Expo):", deviceId);

  const payload = {
    phone: `${COUNTRY.dial}${digits}`,
    password: password.trim(),
    device_id: deviceId,      // ✅ Expo token used as device_id
    push_token: deviceId,     // optional (same value)
  };

  setLoading(true);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const out = await postJson(base, payload, controller.signal);

    if (!out.res.ok) {
      console.log("Login failed response:", out.res.status, out.raw);

      const msg = extractErrorMessage(out);
      setErrorText(msg);
      Alert.alert("Login failed", msg);
      return;
    }

    const data = out.data || {};

    // ✅ token extraction
    const tokenObj = data?.token || data?.data?.token || {};
    const accessToken =
      (typeof data?.token === "string" && data.token) ||
      tokenObj?.access_token ||
      tokenObj?.accessToken ||
      data?.access_token ||
      data?.accessToken ||
      "";

    const refreshToken =
      tokenObj?.refresh_token ||
      tokenObj?.refreshToken ||
      data?.refresh_token ||
      data?.refreshToken ||
      "";

    if (accessToken) {
      await SecureStore.setItemAsync(KEY_AUTH_TOKEN, String(accessToken));
    }
    if (refreshToken) {
      await SecureStore.setItemAsync(KEY_REFRESH_TOKEN, String(refreshToken));
    }

    const userInfo =
      data?.merchant ||
      data?.user ||
      data?.data?.merchant ||
      data?.data?.user ||
      data ||
      {};

    const user_id =
      userInfo?.user_id ?? userInfo?.id ?? data?.user_id ?? data?.id ?? null;

    const business_id =
      userInfo?.business_id ??
      userInfo?.businessId ??
      data?.business_id ??
      data?.id ??
      "";

    const business_name =
      userInfo?.business_name ??
      userInfo?.businessName ??
      data?.business_name ??
      "";

    const business_logo =
      userInfo?.business_logo ?? userInfo?.businessLogo ?? userInfo?.logo ?? "";

    const business_address =
      userInfo?.business_address ??
      userInfo?.businessAddress ??
      userInfo?.address ??
      "";

    const owner_type = String(
      userInfo?.owner_type ??
      userInfo?.ownerType ??
      data?.owner_type ??
      data?.ownerType ??
      "food"
    )
      .trim()
      .toLowerCase();

    // ✅ Save user_id
    if (user_id != null && String(user_id).trim()) {
      await SecureStore.setItemAsync(KEY_USER_ID, String(user_id));
    } else {
      await SecureStore.deleteItemAsync(KEY_USER_ID);
    }

    // ✅ Save business_id
    if (business_id != null && String(business_id).trim()) {
      const bid = String(business_id);
      await SecureStore.setItemAsync(KEY_BUSINESS_ID, bid);
      await SecureStore.setItemAsync("business_id", bid);
      await SecureStore.setItemAsync("businessId", bid);
    } else {
      await SecureStore.deleteItemAsync(KEY_BUSINESS_ID);
      await SecureStore.deleteItemAsync("business_id");
      await SecureStore.deleteItemAsync("businessId");
    }

    // ✅ Save merchant login payload
    const userPayload = {
      user_id,
      business_id,
      business_name,
      business_logo,
      business_address,
      phone: `${COUNTRY.dial}${digits}`,
      device_id: deviceId,   // ✅ Expo token stored
      push_token: deviceId,
      owner_type,
    };

    await SecureStore.setItemAsync(
      KEY_MERCHANT_LOGIN,
      JSON.stringify(userPayload)
    );

    // ✅ store last phone
    await SecureStore.setItemAsync(KEY_LAST_LOGIN_PHONE, String(digits));

    // ✅ remember password
    if (savePassword) {
      await SecureStore.setItemAsync(KEY_SAVED_PHONE, String(digits));
      await SecureStore.setItemAsync(
        KEY_SAVED_PHONE_PASSWORD,
        String(password || "")
      );
    } else {
      await SecureStore.deleteItemAsync(KEY_SAVED_PHONE);
      await SecureStore.deleteItemAsync(KEY_SAVED_PHONE_PASSWORD);
    }

    SafeDeviceEventEmitter.emit("profile-updated", {
      business_name,
      business_logo,
    });

    try {
      connectMerchantSocket({ user_id, business_id });
    } catch {}

    // ✅ Navigate
    navigateHome({
      business_name,
      business_logo,
      business_address,
      business_id,
      auth_token: accessToken,
      user_id: user_id != null ? String(user_id) : "",
      owner_type,
      ownerType: owner_type,
      expo_push_token: deviceId,
      device_id: deviceId,
    });

  } catch (e) {
    const msg =
      e?.name === "AbortError"
        ? "Request timeout. Please try again."
        : "Network error. Please try again.";
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

        <ScrollView
          contentContainerStyle={{ paddingBottom: 24 }}
          keyboardShouldPersistTaps="always"
        >
          <View style={styles.form}>
            <Text style={styles.title}>Log in with mobile number</Text>

            <Text style={styles.label}>Mobile number</Text>

            <View style={styles.phoneRow}>
              <View style={styles.countrySelector}>
                <Text style={styles.countryCode}>{COUNTRY.dial}</Text>
              </View>

              <View
                style={[
                  styles.inputWrapper,
                  hasPhoneError && touched && styles.inputError,
                ]}
              >
                <TextInput
                  ref={phoneRef}
                  style={styles.inputField}
                  value={phoneDigits}
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

            <Text style={styles.tip}>Format: 77/17/16 XXXXXX (8 digits)</Text>

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
              <TouchableOpacity
                onPress={() => setShowPassword((s) => !s)}
                style={styles.eyeIcon}
                disabled={loading}
              >
                <Icon
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color="#666"
                />
              </TouchableOpacity>
            </View>

            {/* ✅ inline error now shows backend message too */}
            {!!errorText && <Text style={styles.inlineError}>{errorText}</Text>}

            {/* ✅ Save password checkbox */}
            <View style={styles.checkboxContainer}>
              <CheckBox
                value={savePassword}
                onValueChange={async (v) => {
                  setSavePassword(v);
                  if (!v) {
                    try {
                      await SecureStore.deleteItemAsync(
                        KEY_SAVED_PHONE_PASSWORD
                      );
                      await SecureStore.deleteItemAsync(KEY_SAVED_PHONE);
                    } catch { }
                  }
                }}
                disabled={loading}
                color={savePassword ? "#00b14f" : undefined}
              />
              <Text style={styles.checkboxLabel}>Save password</Text>
            </View>

            <View style={{ height: 24 }} />
          </View>
        </ScrollView>

        {/* Footer — like LoginScreen */}
        <View
          style={[
            styles.footer,
            { paddingBottom: Math.max(bottomGap, insets.bottom + 8) },
          ]}
        >
          <Text style={styles.forgotText}>
            Forgot your{" "}
            <Text
              style={styles.link}
              onPress={() =>
                !loading && navigation.navigate("ForgotPassword")
              }
            >
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
            <Text
              style={
                canSubmit
                  ? styles.loginButtonText
                  : styles.loginButtonTextDisabled
              }
            >
              Log In
            </Text>
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

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  iconButton: { padding: 8 },
  headerTitle: {
    fontSize: 22,
    fontWeight: "600",
    color: "#1A1D1F",
    marginRight: 180,
  },

  form: { flexGrow: 1, padding: 8 },
  title: {
    fontSize: 18,
    fontWeight: "500",
    color: "#1A1D1F",
    marginBottom: 15,
  },

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
  passwordInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 10,
    paddingRight: 8,
    color: "#1A1D1F",
  },
  eyeIcon: { padding: 4 },

  inlineError: {
    color: "#DC2626",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 6,
    marginBottom: 8,
  },

  checkboxContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    marginBottom: 10,
  },
  checkboxLabel: { marginLeft: 8, fontSize: 14, opacity: 0.7 },

  forgotText: {
    textAlign: "center",
    fontSize: 14,
    color: "#333",
    opacity: 0.7,
    marginBottom: 16,
  },
  link: { color: "#007AFF", fontWeight: "500", opacity: 0.8 },

  footer: { marginBottom: 15, paddingHorizontal: 8 },
  loginButton: {
    backgroundColor: "#00b14f",
    paddingVertical: 14,
    borderRadius: 25,
    alignItems: "center",
    marginBottom: 10,
  },
  loginButtonText: { color: "#fff", fontSize: 16, fontWeight: "500" },
  loginButtonDisabled: {
    backgroundColor: "#eee",
    paddingVertical: 14,
    borderRadius: 25,
    alignItems: "center",
    marginBottom: 10,
  },
  loginButtonTextDisabled: { color: "#aaa", fontSize: 16, fontWeight: "500" },
  loginPhoneButton: {
    backgroundColor: "#e9fcf6",
    paddingVertical: 14,
    borderRadius: 25,
    alignItems: "center",
  },
  loginPhoneText: { color: "#004d3f", fontSize: 16, fontWeight: "600" },

  loadingOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
});
