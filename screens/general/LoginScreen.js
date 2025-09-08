// screens/general/LoginScreen.js
import React, { useState, useEffect, useRef } from 'react';
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
  DeviceEventEmitter,
  Pressable,
} from 'react-native';
import CheckBox from 'expo-checkbox';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { CommonActions } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import {
  LOGIN_USERNAME_MERCHANT_ENDPOINT as ENV_LOGIN_USERNAME_MERCHANT_ENDPOINT,
  PROFILE_ENDPOINT,
} from '@env';

const KEY_SAVED_USERNAME = 'saved_username';
const KEY_SAVED_PASSWORD = 'saved_password';
const KEY_LAST_LOGIN_USERNAME = 'last_login_username';
const KEY_AUTH_TOKEN = 'auth_token';
const KEY_MERCHANT_LOGIN = 'merchant_login';

const endpoint = (ENV_LOGIN_USERNAME_MERCHANT_ENDPOINT ?? '').trim();

// ===== Helpers for image URL normalization (match AccountSettings / Home) =====
const DEFAULT_DEV_ORIGIN = Platform.select({
  android: 'http://10.0.2.2:3000',
  ios: 'http://localhost:3000',
  default: 'http://localhost:3000',
});
const androidLoopback = (absUrl) => {
  if (!absUrl || Platform.OS !== 'android') return absUrl;
  try {
    const u = new URL(absUrl);
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') u.hostname = '10.0.2.2';
    return u.toString();
  } catch { return absUrl; }
};
const collapsePathSlashes = (url) => {
  try {
    const u = new URL(url);
    u.pathname = u.pathname.replace(/\/{2,}/g, '/');
    return u.toString();
  } catch { return url; }
};
// Prefer PROFILE_ENDPOINT, then login base, then dev
const getImageBaseOrigin = () => {
  const candidates = [PROFILE_ENDPOINT, ENV_LOGIN_USERNAME_MERCHANT_ENDPOINT, DEFAULT_DEV_ORIGIN].filter(Boolean);
  for (const c of candidates) {
    try { return androidLoopback(new URL(c).origin); } catch {}
  }
  return DEFAULT_DEV_ORIGIN;
};
const toAbsoluteUrl = (raw) => {
  if (!raw || typeof raw !== 'string') return null;
  if (/^https?:\/\//i.test(raw)) return collapsePathSlashes(androidLoopback(raw));
  const origin = getImageBaseOrigin();
  return collapsePathSlashes(androidLoopback(`${origin}${raw.startsWith('/') ? '' : '/'}${raw}`));
};
// ============================================================================

/** NEW: Guard the experimental toggle on Old Architecture only */
const isNewArch =
  !!global?.nativeFabricUIManager ||
  !!global?.__turboModuleProxy ||
  !!global?.RN$Bridgeless;

if (Platform.OS === 'android' && !isNewArch && UIManager.setLayoutAnimationEnabledExperimental) {
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
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s1 = Keyboard.addListener(showEvt, onShow);
    const s2 = Keyboard.addListener(hideEvt, onHide);
    return () => { s1.remove(); s2.remove(); };
  }, [minGap]);
  return gap;
}

const LoginScreen = () => {
  const navigation = useNavigation();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [savePassword, setSavePassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isUsernameFocused, setIsUsernameFocused] = useState(false);
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);
  const [loading, setLoading] = useState(false);

  const canSubmit = username.trim().length > 0 && password.length > 0 && !loading;
  const bottomGap = useKeyboardGap(8);

  // Focus refs
  const usernameRef = useRef(null);
  const pwdRef = useRef(null);

  // caret control to prevent jumping
  const [pwdSelection, setPwdSelection] = useState({ start: 0, end: 0 });

  const persistSavedCreds = async (u, p) => {
    if (savePassword && u && p) {
      await SecureStore.setItemAsync(KEY_SAVED_USERNAME, u);
      await SecureStore.setItemAsync(KEY_SAVED_PASSWORD, p);
    } else {
      await SecureStore.deleteItemAsync(KEY_SAVED_USERNAME);
      await SecureStore.deleteItemAsync(KEY_SAVED_PASSWORD);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const [u, p] = await Promise.all([
          SecureStore.getItemAsync(KEY_SAVED_USERNAME),
          SecureStore.getItemAsync(KEY_SAVED_PASSWORD),
        ]);
        if (u || p) {
          setUsername(u || '');
          setPassword(p || '');
          setSavePassword(true);
        } else {
          const lastU = await SecureStore.getItemAsync(KEY_LAST_LOGIN_USERNAME);
          if (lastU) setUsername(lastU);
        }
      } catch {}
    })();
  }, []);

  useEffect(() => {
    if (!savePassword) return;
    const t = setTimeout(() => {
      persistSavedCreds(username.trim(), password);
    }, 250);
    return () => clearTimeout(t);
  }, [username, password, savePassword]);

  const handleToggleSave = async (val) => {
    setSavePassword(val);
    if (val) await persistSavedCreds(username.trim(), password);
    else await persistSavedCreds('', '');
  };

  const getOwnerType = (data) => {
    const pick = (...paths) => {
      for (const p of paths) { try { const v = p(); if (v !== undefined && v !== null && v !== '') return v; } catch {} }
      return '';
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
      if (x === 1 || x === '1') return 'food';
      if (x === 2 || x === '2') return 'mart';
      return String(x || '').toLowerCase();
    };
    return mapCodeToType(v).trim().toLowerCase();
  };

  const handleLogin = async () => {
    if (!canSubmit) return;
    if (!endpoint) {
      Alert.alert('Configuration error', 'LOGIN_USERNAME_MERCHANT_ENDPOINT is not set in your .env file.');
      return;
    }

    setLoading(true);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_name: username.trim(), password }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const raw = await res.text();
      let data = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch (e) { console.log('❌ JSON parse error:', e); }

      const msg = (data?.message ?? data?.error ?? raw ?? '').toString().trim();

      const looksLikeSuccess =
        res.ok &&
        (data?.success === true ||
          typeof data?.token === 'string' ||
          (data?.token && typeof data?.token?.access_token === 'string') ||
          (data?.status && String(data.status).toLowerCase() === 'ok') ||
          /login\s*successful/i.test(msg));

      if (!looksLikeSuccess) {
        const errText = msg || `Request failed with ${res.status}`;
        throw new Error(errText);
      }

      let tokenStr = '';
      if (data?.token) {
        tokenStr = typeof data.token === 'string' ? data.token : (data.token?.access_token ?? '');
        if (tokenStr) await SecureStore.setItemAsync(KEY_AUTH_TOKEN, String(tokenStr));
      }

      await SecureStore.setItemAsync(KEY_LAST_LOGIN_USERNAME, username.trim());
      await persistSavedCreds(username.trim(), password);

      let profile = null;
      if (tokenStr) {
        try {
          const meBase = PROFILE_ENDPOINT?.replace(/\/+$/, '') || '';
          const candidates = [`${meBase}/me`, `${meBase}/api/merchant/me`, `${meBase}/api/profile/me`].filter(Boolean);
          for (const url of candidates) {
            try {
              const r = await fetch(url, { headers: { Accept: 'application/json', Authorization: `Bearer ${tokenStr}` } });
              if (!r.ok) continue;
              profile = await r.json();
              break;
            } catch {}
          }
        } catch {}
      }

      const ownerType = getOwnerType(data);
      const userInfo = data?.merchant || data?.user || {};

      const user_id =
        profile?.user_id ?? data?.user_id ?? userInfo?.user_id ?? data?.id ?? userInfo?.id ?? null;

      const business_name =
        profile?.business_name ?? userInfo?.business_name ?? userInfo?.businessName ?? '';

      const rawBusinessLogo =
        profile?.business_logo ?? userInfo?.business_logo ?? userInfo?.businessLogo ?? userInfo?.logo ?? '';

      const rawProfileImage =
        profile?.profile_image ?? userInfo?.profile_image ?? userInfo?.avatar ?? '';

      const business_logo = rawBusinessLogo ? toAbsoluteUrl(rawBusinessLogo) : '';
      const profile_image = rawProfileImage ? toAbsoluteUrl(rawProfileImage) : '';

      const business_address =
        profile?.business_address ?? userInfo?.business_address ?? userInfo?.businessAddress ??
        userInfo?.address ?? userInfo?.location ?? data?.business_address ?? data?.address ?? '';

      const email =
        profile?.email ?? userInfo?.email ?? userInfo?.owner_email ?? userInfo?.contact_email ??
        userInfo?.contact?.email ?? data?.email ?? data?.user?.email ?? data?.merchant?.email ?? '';

      const phone =
        profile?.phone ?? userInfo?.phone ?? userInfo?.phone_number ?? userInfo?.mobile ??
        userInfo?.contact_phone ?? userInfo?.contact?.phone ?? userInfo?.contact?.mobile ??
        data?.phone ?? data?.user?.phone ?? data?.merchant?.phone ?? '';

      const business_id =
        profile?.business_id ?? userInfo?.business_id ?? userInfo?.businessId ??
        userInfo?.id ?? data?.business_id ?? data?.id ?? '';

      const business_license =
        profile?.business_license_number ??
        userInfo?.business_license_number ??
        userInfo?.license_number ??
        userInfo?.license ??
        data?.business_license_number ??
        data?.license_number ??
        data?.license ??
        '';

      const userPayload = {
        user_id,
        user: userInfo,
        business_name,
        business_id,
        business_logo,
        business_address,
        business_license,
        username: username.trim(),
        email,
        phone,
        token: data?.token || null,
        owner_type: ownerType || null,
        profile_image,
      };

      try { await SecureStore.setItemAsync(KEY_MERCHANT_LOGIN, JSON.stringify(userPayload)); } catch (e) {
        console.log('⚠️ Failed to persist merchant_login:', e?.message);
      }

      DeviceEventEmitter.emit('profile-updated', { profile_image, business_name });

      const routeParams = {
        openTab: 'Home',
        nonce: Date.now(),
        business_name,
        business_logo,
        profile_image,
        business_address,
        business_id,
        owner_type: ownerType,
        authContext: { token: tokenStr || null, profile: profile || null, rawLogin: data, userPayload },
      };

      if (ownerType === 'mart') {
        navigation.dispatch(
          CommonActions.reset({
            index: 0,
            routes: [{ name: 'MartServiceSetupScreen', params: routeParams }],
          })
        );
        return;
      }
      if (ownerType === 'food') {
        navigation.dispatch(
          CommonActions.reset({
            index: 0,
            routes: [{ name: 'GrabMerchantHomeScreen', params: routeParams }],
          })
        );
        return;
      }

      Alert.alert('Cannot route', `Owner type missing or unknown.\nGot: ${JSON.stringify(ownerType)}\nPlease check the API response.`);
      console.log('⚠️ No owner_type match; full payload:', data);
    } catch (err) {
      const msg = err?.name === 'AbortError' ? 'Request timed out. Please try again.' : err?.message?.toString() ?? 'Login failed';
      Alert.alert('Login failed', msg);
    } finally { setLoading(false); }
  };

  // Toggle visibility without jumping caret, and keep focus on password
  const handleTogglePasswordVisibility = () => {
    const end = (pwdSelection?.end ?? password.length);
    const nextPos = Number.isFinite(end) ? end : (password || '').length;

    setShowPassword((prev) => !prev);

    requestAnimationFrame(() => {
      pwdRef.current?.focus?.();
      setTimeout(() => {
        const len = (password || '').length;
        const pos = Math.min(nextPos, len);
        setPwdSelection({ start: pos, end: pos });
      }, 0);
    });
  };

  return (
    <KeyboardAvoidingView style={styles.container}>
      {/* Removed outer TouchableWithoutFeedback to prevent focus hijack */}
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
            onPress={() => navigation.goBack()}
            style={styles.iconButton}
            activeOpacity={0.7}
            disabled={loading}
          >
            <Icon name="arrow-back" size={24} color="#1A1D1F" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Log In</Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('HelpScreen')}
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
            <Text style={styles.label}>Enter your username</Text>
            <View
              style={[
                styles.inputWrapper,
                { borderColor: isUsernameFocused ? '#00b14f' : '#ccc' },
              ]}
            >
              <TextInput
                ref={usernameRef}
                style={styles.inputField}
                placeholder={isUsernameFocused ? '' : 'Enter your username'}
                autoCapitalize="none"
                autoCorrect={false}
                value={username}
                editable={!loading}
                onChangeText={setUsername}
                onFocus={() => setIsUsernameFocused(true)}
                onBlur={() => setIsUsernameFocused(false)}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => pwdRef.current?.focus()}
              />
              {username.length > 0 && !loading && (
                <TouchableOpacity onPress={() => setUsername('')} style={styles.clearButton}>
                  <View style={styles.clearCircle}>
                    <Icon name="close" size={14} color="#fff" />
                  </View>
                </TouchableOpacity>
              )}
            </View>

            <Text style={styles.label}>Password</Text>

            {/* Pressable row: focuses password on any tap in the row, without blocking eye */}
            <Pressable
              onPress={() => {
                setIsPasswordFocused(true);
                requestAnimationFrame(() => pwdRef.current?.focus?.());
              }}
              style={({ pressed }) => ([
                styles.passwordContainer,
                { borderColor: isPasswordFocused ? '#00b14f' : '#ccc' },
                isPasswordFocused && styles.shadowGreen,
                pressed ? { opacity: 0.98 } : null,
              ])}
            >
              <TextInput
                ref={pwdRef}
                key={showPassword ? 'pwd-visible' : 'pwd-hidden'}  // reliable secureTextEntry flip on Android
                style={styles.passwordInput}
                placeholder={isPasswordFocused ? '' : 'Enter password'}
                value={password}
                editable={!loading}
                onChangeText={(t) => {
                  setPassword(t);
                  const pos = (pwdSelection?.end ?? t.length);
                  const next = Math.min(pos, t.length);
                  setPwdSelection({ start: next, end: next });
                }}
                secureTextEntry={!showPassword}
                onFocus={() => setIsPasswordFocused(true)}
                onBlur={() => setIsPasswordFocused(false)}
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
                onPress={handleTogglePasswordVisibility}
                style={styles.eyeIcon}
                disabled={loading}
              >
                <Icon name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#666" />
              </TouchableOpacity>
            </Pressable>

            <View style={styles.checkboxContainer}>
              <CheckBox
                value={savePassword}
                onValueChange={async (val) => {
                  setSavePassword(val);
                  if (val) {
                    await SecureStore.setItemAsync(KEY_SAVED_USERNAME, username.trim());
                    await SecureStore.setItemAsync(KEY_SAVED_PASSWORD, password);
                  } else {
                    await SecureStore.deleteItemAsync(KEY_SAVED_USERNAME);
                    await SecureStore.deleteItemAsync(KEY_SAVED_PASSWORD);
                  }
                }}
                disabled={loading}
                color={savePassword ? '#00b14f' : undefined}
              />
              <Text style={styles.checkboxLabel}>Save password</Text>
            </View>
          </View>
        </ScrollView>

        {/* Footer */}
        <View style={[styles.footer, { paddingBottom: bottomGap }]}>
          <Text style={styles.forgotText}>
            Forgot your{' '}
            <Text style={styles.link} onPress={() => !loading && navigation.navigate('ForgotUsername')}>
              username
            </Text>{' '}
            or{' '}
            <Text style={styles.link} onPress={() => !loading && navigation.navigate('ForgotPassword')}>
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
            <Text style={canSubmit ? styles.loginButtonText : styles.loginButtonTextDisabled}>
              Log In
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.loginPhoneButton}
            onPress={() => !loading && navigation.navigate('MobileLoginScreen')}
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
  container: { flex: 1, backgroundColor: '#fff' },
  inner: { flex: 1, padding: 20, paddingTop: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  iconButton: { padding: 8 },
  headerTitle: { fontSize: 22, fontWeight: '600', color: '#1A1D1F', marginRight: 180 },
  form: { flexGrow: 1, padding: 8 },
  label: { marginBottom: 6, fontSize: 14, color: '#333' },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 10,
    marginBottom: 16,
    height: 50,
  },
  inputField: { flex: 1, fontSize: 14, paddingVertical: 10 },
  clearButton: { paddingLeft: 8 },
  clearCircle: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#000', opacity: 0.7, justifyContent: 'center', alignItems: 'center' },
  passwordContainer: { flexDirection: 'row', borderWidth: 1, borderRadius: 15, alignItems: 'center', paddingHorizontal: 10, paddingRight: 14, marginBottom: 16, height: 50 },
  passwordInput: { flex: 1, fontSize: 14, paddingVertical: 10, paddingRight: 8 },
  eyeIcon: { padding: 4 },
  checkboxContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, marginTop: 10 },
  checkboxLabel: { marginLeft: 8, fontSize: 14, opacity: 0.7 },
  forgotText: { textAlign: 'center', fontSize: 14, color: '#333', opacity: 0.7, marginBottom: 16 },
  link: { color: '#007AFF', fontWeight: '500', opacity: 0.8 },
  loginButton: { backgroundColor: '#00b14f', paddingVertical: 14, borderRadius: 25, alignItems: 'center', marginBottom: 10 },
  loginButtonText: { color: '#fff', fontSize: 16, fontWeight: '500' },
  loginButtonDisabled: { backgroundColor: '#eee', paddingVertical: 14, borderRadius: 25, alignItems: 'center', marginBottom: 10 },
  loginButtonTextDisabled: { color: '#aaa', fontSize: 16, fontWeight: '500' },
  loginPhoneButton: { backgroundColor: '#e9fcf6', paddingVertical: 14, borderRadius: 25, alignItems: 'center' },
  loginPhoneText: { color: '#004d3f', fontSize: 16, fontWeight: '600' },
  footer: { marginBottom: 15, paddingHorizontal: 8 },
  loadingOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
  shadowGreen: { shadowColor: '#00b14f', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
});
