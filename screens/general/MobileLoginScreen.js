// screens/general/MobileLoginScreen.js
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  StatusBar,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  ActivityIndicator,
  Keyboard,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation, CommonActions, StackActions } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LOGIN_MERCHANT_ENDPOINT } from '@env';

/* ───────── Header navigation helpers (identical to LoginScreen) ───────── */
const WELCOME_ROUTE = 'WelcomeScreen';
const AUTH_STACK = 'AuthStack';
const routeExists = (nav, name) => {
  try { return !!nav?.getState?.()?.routeNames?.includes(name); } catch { return false; }
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
  try { navigation.dispatch(StackActions.replace(WELCOME_ROUTE)); return; } catch {}
  navigation.navigate(WELCOME_ROUTE);
};

/* ---------------- enable LayoutAnimation (Android only) ---------------- */
function enableAndroidLayoutAnimationOnPaper() {
  if (Platform.OS !== 'android') return;
  const isFabric = !!global?.nativeFabricUIManager;
  if (isFabric) return;
  if (typeof UIManager?.setLayoutAnimationEnabledExperimental === 'function') {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

/* ---------------- constants ---------------- */
const COUNTRY = { name: 'Bhutan', code: 'bt', dial: '+975' };

/* ---------------- helpers ---------------- */
const safeJsonParse = async (res) => {
  const raw = await res.text();
  try { return { data: JSON.parse(raw), raw }; } catch { return { data: null, raw }; }
};
const postJson = async (url, body, signal) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  const parsed = await safeJsonParse(res);
  return { res, ...parsed };
};
function useKeyboardBottomOffset(gapPx = 60, insetsBottom = 0, baseRest = 12) {
  const [kbHeight, setKbHeight] = useState(0);
  useEffect(() => {
    const onShow = (e) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setKbHeight(e?.endCoordinates?.height ?? 0);
    };
    const onHide = () => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setKbHeight(0);
    };
    const s1 = Keyboard.addListener('keyboardDidShow', onShow);
    const s2 = Keyboard.addListener('keyboardDidHide', onHide);
    return () => { s1.remove(); s2.remove(); };
  }, []);
  return kbHeight > 0 ? kbHeight + gapPx : insetsBottom + baseRest;
}

/* ---------------- main component ---------------- */
export default function MobileLoginScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  useEffect(() => { enableAndroidLayoutAnimationOnPaper(); }, []);

  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [hasError, setHasError] = useState(true);
  const [touched, setTouched] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');

  const phoneRef = useRef(null);
  const passwordRef = useRef(null);
  const bottomOffset = useKeyboardBottomOffset(60, insets.bottom, 12);

  const handlePhoneChange = (text) => {
    setPhoneNumber(text);
    const digits = text.replace(/\D/g, '');
    setHasError(digits.length < 8);
  };
  const isButtonEnabled = !hasError && password.trim().length >= 6 && !loading;

  const handleLogin = async () => {
    setTouched(true);
    setApiError('');
    if (hasError || password.trim().length < 6) {
      setApiError('Please enter a valid phone and a password (min 6 chars).');
      return;
    }
    const base = LOGIN_MERCHANT_ENDPOINT;
    if (!base) { setApiError('LOGIN_MERCHANT_ENDPOINT is not configured.'); return; }

    const payload = { phone: `${COUNTRY.dial}${phoneNumber}`, password: password.trim() };

    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const out = await postJson(base, payload, controller.signal);
      if (out.res.ok) navigation.replace('MenuServiceSetup');
      else setApiError('Invalid phone or password.');
    } catch (e) {
      setApiError('Network error. Please try again.');
    } finally { clearTimeout(timer); setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <KeyboardAvoidingView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          {/* inner padding EXACTLY like LoginScreen */}
          <View style={styles.inner}>
            {/* HEADER — EXACT COPY of LoginScreen header */}
            <View style={styles.header}>
              <TouchableOpacity
                onPress={() => goToWelcome(navigation)}
                style={styles.iconButton}
                activeOpacity={0.7}
                disabled={loading}
              >
                <Icon name="arrow-back" size={24} color="#1A1D1F" />
              </TouchableOpacity>
              
              <TouchableOpacity
                onPress={() => navigation.navigate('HelpScreen')}
                style={styles.iconButton}
                activeOpacity={0.7}
                disabled={loading}
              >
                <Icon name="help-circle-outline" size={24} color="#1A1D1F" />
              </TouchableOpacity>
            </View>

            {/* BODY */}
            <View style={styles.form}>
              <Text style={styles.title}>Log in with mobile number</Text>

              <View style={styles.phoneRow}>
                <View style={styles.countrySelector}>
                  <Text style={styles.countryCode}>{COUNTRY.dial}</Text>
                </View>
                <View style={[styles.inputWrapper, hasError && touched && styles.inputError]}>
                  <TextInput
                    ref={phoneRef}
                    style={styles.inputField}
                    value={phoneNumber}
                    onChangeText={handlePhoneChange}
                    placeholder="Enter mobile number"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="phone-pad"
                    onFocus={() => setTouched(true)}
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onSubmitEditing={() => passwordRef.current?.focus()}
                  />
                </View>
              </View>

              {hasError && touched && <Text style={styles.inlineError}>Invalid number</Text>}

              <View style={styles.passwordContainer}>
                <TextInput
                  ref={passwordRef}
                  style={styles.passwordInput}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter password"
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry={!showPassword}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword((s) => !s)}
                  style={styles.eyeIcon}
                  hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                >
                  <Icon name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#666" />
                </TouchableOpacity>
              </View>

              {apiError ? <Text style={styles.inlineError}>{apiError}</Text> : null}
              <View style={{ height: 80 }} />
            </View>
          </View>
        </ScrollView>

        {/* FOOTER — same CTA styling */}
        <View style={[styles.footer, { paddingBottom: bottomOffset }]}>
          <TouchableOpacity
            style={isButtonEnabled ? styles.loginButton : styles.loginButtonDisabled}
            disabled={!isButtonEnabled}
            onPress={handleLogin}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={isButtonEnabled ? styles.loginButtonText : styles.loginButtonTextDisabled}>Log In</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.loginPhoneButton}
            onPress={() => navigation.navigate('LoginScreen')}
            activeOpacity={0.85}
            disabled={loading}
          >
            <Text style={styles.loginPhoneText}>Log In with Email</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* ---------------- styles (header EXACTLY matches LoginScreen) ---------------- */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  inner: { flex: 1, padding: 20, paddingTop: 4 }, // same as LoginScreen

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  iconButton: { padding: 8 },
  headerTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#1A1D1F',
    marginRight: 180, // same offset trick used in LoginScreen to center title
  },

  /* body */
  form: { flex: 1 },
  title: { fontSize: 18, fontWeight: '500', color: '#1A1D1F', marginBottom: 15 },

  phoneRow: { flexDirection: 'row', marginBottom: 12, gap: 8 },
  countrySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#ccc',
    height: 50,
  },
  countryCode: { fontSize: 14, fontWeight: '500', color: '#1A1D1F' },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 10,
    height: 50,
    borderColor: '#ccc',
    backgroundColor: '#fff',
  },
  inputError: { borderColor: '#EF4444' },
  inputField: { flex: 1, fontSize: 14, paddingVertical: 10, color: '#1A1D1F' },

  passwordContainer: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 15,
    alignItems: 'center',
    paddingHorizontal: 10,
    height: 50,
    borderColor: '#ccc',
    backgroundColor: '#fff',
    marginTop: 10,
  },
  passwordInput: { flex: 1, fontSize: 14, paddingVertical: 10, paddingRight: 8, color: '#1A1D1F' },
  eyeIcon: { padding: 4 },

  inlineError: { color: '#DC2626', fontSize: 13, fontWeight: '600', marginTop: 6, marginBottom: 8 },

  /* footer (same CTA look as email login) */
  footer: { paddingHorizontal: 8 },
  loginButton: {
    backgroundColor: '#00b14f',
    paddingVertical: 14,
    borderRadius: 25,
    alignItems: 'center',
    marginBottom: 10,
  },
  loginButtonDisabled: {
    backgroundColor: '#eee',
    paddingVertical: 14,
    borderRadius: 25,
    alignItems: 'center',
    marginBottom: 10,
  },
  loginButtonText: { color: '#fff', fontSize: 16, fontWeight: '500' },
  loginButtonTextDisabled: { color: '#aaa', fontSize: 16, fontWeight: '500' },
  loginPhoneButton: {
    backgroundColor: '#e9fcf6',
    paddingVertical: 14,
    borderRadius: 25,
    alignItems: 'center',
  },
  loginPhoneText: { color: '#004d3f', fontSize: 16, fontWeight: '600' },
});
