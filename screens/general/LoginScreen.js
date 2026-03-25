// screens/general/LoginScreen.js
// ✅ Updated: Fingerprint/Biometrics removed (no LocalAuthentication import, no biometric state/helpers/UI)
// ✅ Keeps everything else as-is (push token, remember me, save tokens, business_id/user_id storage, sockets, navigation)

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Keyboard,
  ActivityIndicator,
  Alert,
  Modal,
  LayoutAnimation,
  UIManager,
  Pressable,
  AppState,
  DeviceEventEmitter as RNDeviceEventEmitter, // ✅ bundler-safe import
} from "react-native";
import CheckBox from "expo-checkbox";
import Icon from "react-native-vector-icons/Ionicons";
import {
  useNavigation,
  CommonActions,
  StackActions,
  useFocusEffect,
} from "@react-navigation/native";
import * as SecureStore from "expo-secure-store";
import {
  LOGIN_USERNAME_MERCHANT_ENDPOINT as ENV_LOGIN_USERNAME_MERCHANT_ENDPOINT,
  PROFILE_ENDPOINT,
} from "@env";

// Shared socket connector
import { connectMerchantSocket } from "../realtime/merchantSocket";
import { getExpoPushTokenAsync } from "../../utils/getExpoPushTokenAsync";
// import { getStableDeviceId } from "../../utils/deviceId";
/* ===== Safe emitter (no-op if unavailable) ===== */
const SafeDeviceEventEmitter =
  RNDeviceEventEmitter && typeof RNDeviceEventEmitter.emit === "function"
    ? RNDeviceEventEmitter
    : { emit: () => { } }; // avoids “DeviceEventEmitter doesn’t exist” at runtime

/* ===== Keys (email-first, with backward compatibility) ===== */
const KEY_SAVED_EMAIL = "saved_email_v2";
const KEY_LAST_LOGIN_EMAIL = "last_login_email_v2";
const KEY_SAVED_USERNAME = "saved_username"; // legacy (only for migration)
const KEY_SAVED_PASSWORD = "saved_password";
const KEY_LAST_LOGIN_USERNAME = "last_login_username"; // legacy (only for migration)
const KEY_AUTH_TOKEN = "auth_token";
const KEY_MERCHANT_LOGIN = "merchant_login";
const KEY_BIOMETRIC_ENABLED = "security_biometric_login"; // kept for compatibility (not used)
const KEY_BIOMETRIC_ENABLED_LEGACY = "biometric_enabled_v1"; // kept for compatibility (not used)
const KEY_REFRESH_TOKEN = "refresh_token_v1";

// ✅ NEW: store user_id separately
const KEY_USER_ID = "user_id_v1";
const KEY_BUSINESS_ID = "business_id_v1"; // ✅ stable key for business id

const endpoint = (ENV_LOGIN_USERNAME_MERCHANT_ENDPOINT ?? "").trim();

/* ───────── Navigation helpers ───────── */
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
/* ────────────────────────────────────── */

/* ===== Image URL normalization ===== */
const DEFAULT_DEV_ORIGIN = Platform.select({
  android: "http://10.0.2.2:3000",
  ios: "http://localhost:3000",
  default: "http://localhost:3000",
});
const androidLoopback = (absUrl) => {
  if (!absUrl || Platform.OS !== "android") return absUrl;
  try {
    const u = new URL(absUrl);
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1")
      u.hostname = "10.0.2.2";
    return u.toString();
  } catch {
    return absUrl;
  }
};
const collapsePathSlashes = (url) => {
  try {
    const u = new URL(url);
    u.pathname = u.pathname.replace(/\/{2,}/g, "/");
    return u.toString();
  } catch {
    return url;
  }
};
const getImageBaseOrigin = () => {
  const candidates = [
    PROFILE_ENDPOINT,
    ENV_LOGIN_USERNAME_MERCHANT_ENDPOINT,
    DEFAULT_DEV_ORIGIN,
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      return androidLoopback(new URL(c).origin);
    } catch { }
  }
  return DEFAULT_DEV_ORIGIN;
};
const toAbsoluteUrl = (raw) => {
  if (!raw || typeof raw !== "string") return null;
  if (/^https?:\/\//i.test(raw))
    return collapsePathSlashes(androidLoopback(raw));
  const origin = getImageBaseOrigin();
  return collapsePathSlashes(
    androidLoopback(`${origin}${raw.startsWith("/") ? "" : "/"}${raw}`)
  );
};

/** Guard LayoutAnimation on old arch only */
const isNewArch =
  !!global?.nativeFabricUIManager ||
  !!global?.__turboModuleProxy ||
  !!global?.RN$Bridgeless;
if (
  Platform.OS === "android" &&
  !isNewArch &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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

const LoginScreen = () => {
  const navigation = useNavigation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [savePassword, setSavePassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isEmailFocused, setIsEmailFocused] = useState(false);
  const [isPwFocused, setIsPwFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [pushToken, setPushToken] = useState(null);
  const [deviceId, setDeviceId] = useState("");

  // ✅ kept because it was used by remember-me logic
  const [hasSavedSecret, setHasSavedSecret] = useState(false);

  const canSubmit =
    email.length > 0 && password.length > 0 && !!deviceId && !loading;
  const bottomGap = useKeyboardGap(8);

  const emailRef = useRef(null);
  const pwdRef = useRef(null);
  const [pwdSelection, setPwdSelection] = useState({ start: 0, end: 0 });

  useEffect(() => {
    const fetchPushToken = async () => {
      const token = await getExpoPushTokenAsync();
      setPushToken(token);
      console.log("Push token on login screen:", token);
    };
    fetchPushToken();
  }, []);
  useEffect(() => {
  const initDeviceId = async () => {
    const token = await getExpoPushTokenAsync();

    setPushToken(token);     // already used in your screen
    setDeviceId(token);      // ✅ THIS becomes your device_id

    console.log("Expo device_id:", token);
  };

  initDeviceId();
}, []);
  /** Load saved creds (email-first; fallback to legacy username) */
  const loadSavedState = async () => {
    try {
      const [savedEmail, savedPwd, refreshTok] = await Promise.all([
        (async () => {
          const e = await SecureStore.getItemAsync(KEY_SAVED_EMAIL);
          if (e) return e;
          // fallback once for legacy
          const legacyU = await SecureStore.getItemAsync(KEY_SAVED_USERNAME);
          return legacyU || "";
        })(),
        SecureStore.getItemAsync(KEY_SAVED_PASSWORD),
        SecureStore.getItemAsync(KEY_REFRESH_TOKEN),
      ]);

      if (savedEmail || savedPwd) {
        setEmail(String(savedEmail || "").trim().toLowerCase());
        setPassword(savedPwd || "");
        setSavePassword(!!savedPwd);
      } else {
        // last email (or legacy username)
        const lastE =
          (await SecureStore.getItemAsync(KEY_LAST_LOGIN_EMAIL)) ||
          (await SecureStore.getItemAsync(KEY_LAST_LOGIN_USERNAME)) ||
          "";
        if (lastE) setEmail(String(lastE).trim().toLowerCase());
      }

      setHasSavedSecret(!!(savedPwd || refreshTok));
    } catch { }
  };

  useEffect(() => {
    loadSavedState();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      loadSavedState();
      return () => { };
    }, [])
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") loadSavedState();
    });
    return () => sub.remove();
  }, []);

  const getOwnerTypeFrom = (data) => {
    const pick = (...paths) => {
      for (const p of paths) {
        try {
          const v = p();
          if (v !== undefined && v !== null && v !== "") return v;
        } catch { }
      }
      return "";
    };
    let v = pick(
      () => data?.merchant?.owner_type,
      () => data?.merchant?.ownerType,
      () => data?.merchant?.type,
      () => data?.user?.owner_type,
      () => data?.user?.ownerType,
      () => data?.user?.type,
      () => data?.data?.owner_type,
      () => data?.data?.ownerType,
      () => data?.data?.type,
      () => data?.owner_type,
      () => data?.ownerType,
      () => data?.type
    );
    const mapCodeToType = (x) => {
      if (x === 1 || x === "1") return "food";
      if (x === 2 || x === "2") return "mart";
      return String(x || "").toLowerCase();
    };
    return mapCodeToType(v).trim().toLowerCase();
  };

  // Core login routine — EMAIL based
  // ✅ It saves access_token + refresh_token into SecureStore properly.
  const loginWithCredentials = async (emailVal, pwdVal) => {
    const normalized = String(emailVal || "").trim().toLowerCase();
    const variants = [{ val: normalized, _hint: "email" }];

    let tokenStr = "";
    let refreshStr = "";
    let success = null;
    let lastErr = "";

    for (let i = 0; i < variants.length; i++) {
      const { val } = variants[i];

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ email: val, password: pwdVal }),
      });

      const txt = await res.text();
      let data = {};
      try {
        data = txt ? JSON.parse(txt) : {};
      } catch {
        data = {};
      }

      const serverMsg = (data?.message ?? data?.error ?? txt ?? "")
        .toString()
        .trim();

      // ✅ handle your real response shape:
      // { data: { token: { access_token, refresh_token, ... }, message, user }, usedEmail }
      const tokenObj =
        data?.data?.token || data?.token || data?.data?.data?.token || null;

      const access =
        (typeof data?.token === "string" && data.token) ||
        tokenObj?.access_token ||
        tokenObj?.accessToken ||
        data?.access_token ||
        data?.accessToken ||
        "";

      const refresh =
        tokenObj?.refresh_token ||
        tokenObj?.refreshToken ||
        data?.refresh_token ||
        data?.refreshToken ||
        "";

      const ok =
        res.ok &&
        (!!access ||
          data?.success === true ||
          /login\s*successful/i.test(serverMsg) ||
          /successful/i.test(serverMsg));

      if (ok) {
        success = { data, usedEmail: val };
        tokenStr = String(access || "");
        refreshStr = String(refresh || "");

        // ✅ Save tokens to SecureStore
        if (tokenStr) {
          await SecureStore.setItemAsync(KEY_AUTH_TOKEN, tokenStr);
        }
        if (refreshStr) {
          await SecureStore.setItemAsync(KEY_REFRESH_TOKEN, refreshStr);
        }

        // Optional: store token lifetimes if you want
        const accessTime =
          tokenObj?.access_token_time ??
          tokenObj?.accessTokenTime ??
          data?.access_token_time ??
          null;

        const refreshTime =
          tokenObj?.refresh_token_time ??
          tokenObj?.refreshTokenTime ??
          data?.refresh_token_time ??
          null;

        if (accessTime != null) {
          await SecureStore.setItemAsync("access_token_time", String(accessTime));
        }
        if (refreshTime != null) {
          await SecureStore.setItemAsync("refresh_token_time", String(refreshTime));
        }

        break;
      } else {
        lastErr = serverMsg || `HTTP ${res.status}`;
        if (res.status >= 500) break;
      }
    }

    if (!success) throw new Error(lastErr || "Invalid email or password");

    return { success, tokenStr, refreshStr };
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
  if (!endpoint) {
    Alert.alert(
      "Configuration error",
      "LOGIN_USERNAME_MERCHANT_ENDPOINT is not set in your .env file."
    );
    return;
  }

  if (!(email && password)) return;

  setErrorText("");
  setLoading(true);

  try {
    // ✅ ALWAYS fetch fresh Expo token
    const getValidExpoToken = async () => {
      let token = await getExpoPushTokenAsync();

      if (!token || !token.startsWith("ExponentPushToken")) {
        await new Promise((res) => setTimeout(res, 1000));
        token = await getExpoPushTokenAsync();
      }

      return token;
    };

    const expoToken = await getValidExpoToken();

    if (!expoToken) {
      Alert.alert("Error", "Unable to get device token. Please try again.");
      return;
    }

    console.log("LOGIN device_id (Expo):", expoToken);

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        email: String(email || "").trim().toLowerCase(),
        password: String(password || ""),
        device_id: expoToken,   // ✅ FIXED
        push_token: expoToken,  // optional
      }),
    });

    const txt = await res.text();
    let data = {};
    try {
      data = txt ? JSON.parse(txt) : {};
    } catch {
      data = {};
    }

    if (!res.ok) {
      throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
    }

    const tokenObj = data?.token || {};
    const userObj = data?.user || {};

    const accessToken =
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

    const user_id = userObj?.user_id ?? data?.user_id ?? data?.id ?? null;
    const business_id = userObj?.business_id ?? data?.business_id ?? null;

    if (!accessToken) {
      throw new Error("Login succeeded but access_token missing.");
    }

    // ✅ Save tokens
    await SecureStore.setItemAsync(KEY_AUTH_TOKEN, String(accessToken));
    if (refreshToken) {
      await SecureStore.setItemAsync(KEY_REFRESH_TOKEN, String(refreshToken));
    }

    // ✅ Save last email
    const normalizedEmail = String(email || "").trim().toLowerCase();
    await SecureStore.setItemAsync(KEY_LAST_LOGIN_EMAIL, normalizedEmail);

    // ✅ Remember password logic
    if (savePassword) {
      await SecureStore.setItemAsync(KEY_SAVED_EMAIL, normalizedEmail);
      await SecureStore.setItemAsync(KEY_SAVED_PASSWORD, String(password || ""));
      setHasSavedSecret(true);
    } else {
      await SecureStore.deleteItemAsync(KEY_SAVED_PASSWORD);
      await SecureStore.deleteItemAsync(KEY_SAVED_EMAIL);
      const refreshTok = await SecureStore.getItemAsync(KEY_REFRESH_TOKEN);
      setHasSavedSecret(!!refreshTok);
    }

    // ✅ Save IDs
    if (user_id != null && String(user_id).trim()) {
      await SecureStore.setItemAsync(KEY_USER_ID, String(user_id));
    } else {
      await SecureStore.deleteItemAsync(KEY_USER_ID);
    }

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

    // ✅ Save merchant login
    const payload = {
      ...data,
      device_id: expoToken,
      push_token: expoToken,
    };

    await SecureStore.setItemAsync(KEY_MERCHANT_LOGIN, JSON.stringify(payload));

    // ✅ Emit profile update
    try {
      const business_name =
        userObj?.business_name ?? data?.business_name ?? "";

      const rawLogo =
        userObj?.business_logo ??
        userObj?.logo ??
        data?.business_logo ??
        "";

      const business_logo = toAbsoluteUrl(rawLogo) || rawLogo || "";

      SafeDeviceEventEmitter.emit("profile-updated", {
        business_name,
        business_logo,
      });
    } catch {}

    // ✅ Connect socket
    try {
      connectMerchantSocket?.({ user_id, business_id });
    } catch {}

    // ✅ Navigate
    navigateHome({
      business_id: business_id != null ? String(business_id) : "",
      business_name: String(userObj?.business_name || ""),
      business_logo: String(userObj?.business_logo || ""),
      owner_type: String(userObj?.owner_type || ""),
      auth_token: String(accessToken),
      user_id: user_id != null ? String(user_id) : "",
      device_id: expoToken,           // ✅ important
      expo_push_token: expoToken,     // ✅ optional
    });

  } catch (err) {
    Alert.alert("Login failed", String(err?.message || err));
  } finally {
    setLoading(false);
  }
};

  return (
    <KeyboardAvoidingView style={styles.container}>
      <View style={styles.inner}>
        {loading && (
          <Modal transparent>
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#00b14f" />
            </View>
          </Modal>
        )}

        {/* Header */}
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

        {/* Form */}
        <ScrollView
          contentContainerStyle={{ paddingBottom: 24 }}
          keyboardShouldPersistTaps="always"
        >
          <View style={styles.form}>
            <Text style={styles.label}>Email</Text>
            <Text style={styles.tip}>
              Use the email address you used during signup.
            </Text>
            <View
              style={[
                styles.inputWrapper,
                { borderColor: isEmailFocused ? "#00b14f" : "#ccc" },
              ]}
            >
              <TextInput
                ref={emailRef}
                style={styles.inputField}
                placeholder={isEmailFocused ? "" : "e.g. sonam@example.com"}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                value={email}
                editable={!loading}
                onChangeText={(t) => {
                  setEmail(String(t || "").trim().toLowerCase());
                  setErrorText("");
                }}
                onFocus={() => setIsEmailFocused(true)}
                onBlur={() => setIsEmailFocused(false)}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => pwdRef.current?.focus()}
                textContentType="emailAddress"
              />
              {email.length > 0 && !loading && (
                <TouchableOpacity
                  onPress={() => setEmail("")}
                  style={styles.clearButton}
                >
                  <View style={styles.clearCircle}>
                    <Icon name="close" size={14} color="#fff" />
                  </View>
                </TouchableOpacity>
              )}
            </View>

            <Text style={styles.label}>Password</Text>
            <Pressable
              onPress={() => {
                setIsPwFocused(true);
                requestAnimationFrame(() => pwdRef.current?.focus?.());
              }}
              style={({ pressed }) => [
                styles.passwordContainer,
                { borderColor: isPwFocused ? "#00b14f" : "#ccc" },
                isPwFocused && styles.shadowGreen,
                pressed ? { opacity: 0.98 } : null,
              ]}
            >
              <TextInput
                ref={pwdRef}
                key={showPassword ? "pwd-visible" : "pwd-hidden"}
                style={styles.passwordInput}
                placeholder={isPwFocused ? "" : "Enter password"}
                value={password}
                editable={!loading}
                onChangeText={(t) => {
                  setPassword(t);
                  setErrorText("");
                  const pos = pwdSelection?.end ?? t.length;
                  const next = Math.max(0, Math.min(pos, t.length));
                  setPwdSelection({ start: next, end: next });
                }}
                secureTextEntry={!showPassword}
                onFocus={() => setIsPwFocused(true)}
                onBlur={() => setIsPwFocused(false)}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
                disableFullscreenUI
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="password"
                selection={pwdSelection}
                onSelectionChange={(e) => setPwdSelection(e.nativeEvent.selection)}
              />
              <TouchableOpacity
                onPress={() => {
                  const end = pwdSelection?.end ?? password.length;
                  const nextPos = Number.isFinite(end)
                    ? end
                    : (password || "").length;
                  setShowPassword((prev) => !prev);
                  requestAnimationFrame(() => {
                    pwdRef.current?.focus?.();
                    setTimeout(() => {
                      const len = (password || "").length;
                      const pos = Math.min(nextPos, len);
                      setPwdSelection({ start: pos, end: pos });
                    }, 0);
                  });
                }}
                style={styles.eyeIcon}
                disabled={loading}
              >
                <Icon
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color="#666"
                />
              </TouchableOpacity>
            </Pressable>

            {!!errorText && <Text style={styles.inlineError}>{errorText}</Text>}

            <View style={styles.checkboxContainer}>
              <CheckBox
                value={savePassword}
                onValueChange={async (v) => {
                  setSavePassword(v);
                  if (!v) {
                    await SecureStore.deleteItemAsync(KEY_SAVED_PASSWORD);
                    await SecureStore.deleteItemAsync(KEY_SAVED_EMAIL);
                    const refreshTok = await SecureStore.getItemAsync(
                      KEY_REFRESH_TOKEN
                    );
                    setHasSavedSecret(!!refreshTok);
                  }
                }}
                disabled={loading}
                color={savePassword ? "#00b14f" : undefined}
              />
              <Text style={styles.checkboxLabel}>Save password</Text>
            </View>
          </View>
        </ScrollView>

        {/* Footer */}
        <View style={[styles.footer, { paddingBottom: bottomGap }]}>
          <Text style={styles.forgotText}>
            Forgot your{" "}
            <Text
              style={styles.link}
              onPress={() => !loading && navigation.navigate("ForgotPassword")}
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
                canSubmit ? styles.loginButtonText : styles.loginButtonTextDisabled
              }
            >
              Log In
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.loginPhoneButton}
            onPress={() => !loading && navigation.navigate("MobileLoginScreen")}
            activeOpacity={0.85}
            disabled={loading}
          >
            <Text style={styles.loginPhoneText}>Log In with Phone</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

export default LoginScreen;

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
  label: { marginBottom: 6, fontSize: 14, color: "#333" },
  tip: { marginTop: -4, marginBottom: 10, fontSize: 12, color: "#6B7280" },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 10,
    marginBottom: 16,
    height: 50,
  },
  inputField: { flex: 1, fontSize: 14, paddingVertical: 10 },
  clearButton: { paddingLeft: 8 },
  clearCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#000",
    opacity: 0.7,
    justifyContent: "center",
    alignItems: "center",
  },
  passwordContainer: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 15,
    alignItems: "center",
    paddingHorizontal: 10,
    paddingRight: 14,
    marginBottom: 8,
    height: 50,
  },
  passwordInput: { flex: 1, fontSize: 14, paddingVertical: 10, paddingRight: 8 },
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
    marginBottom: 24,
    marginTop: 10,
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
  footer: { marginBottom: 15, paddingHorizontal: 8 },
  loadingOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  shadowGreen: {
    shadowColor: "#00b14f",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
});
