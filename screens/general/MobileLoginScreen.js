import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  SafeAreaView,
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
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LOGIN_MERCHANT_ENDPOINT } from '@env';

// ✅ Helper: enable LayoutAnimation ONLY on Android + Paper, called once in useEffect
function enableAndroidLayoutAnimationOnPaper() {
  if (Platform.OS !== 'android') return;
  // @ts-ignore fabric flag is present on New Architecture
  const isFabric = !!global?.nativeFabricUIManager;
  if (isFabric) return; // skip on Fabric
  if (typeof UIManager?.setLayoutAnimationEnabledExperimental === 'function') {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

// 🇧🇹 Only Bhutan
const COUNTRY = { name: 'Bhutan', code: 'bt', dial: '+975' };

/** Safely parse JSON, but also return the raw text for debugging */
const safeJsonParse = async (res) => {
  const raw = await res.text();
  try {
    return { data: JSON.parse(raw), raw };
  } catch {
    return { data: null, raw };
  }
};

/** POST as JSON and return {res, data, raw} */
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

/** 📏 Simple + stable: bottom offset that follows keyboard height. */
function useKeyboardBottomOffset(gapPx = 60, insetsBottom = 0, baseRest = 12) {
  const [kbHeight, setKbHeight] = useState(0);

  useEffect(() => {
    const onShow = (e) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setKbHeight(e?.endCoordinates?.height ?? 0);
    };
    const onChange = (e) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setKbHeight(e?.endCoordinates?.height ?? 0);
    };
    const onHide = () => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setKbHeight(0);
    };

    const evtShow = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const evtHide = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const evtChange = Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidChangeFrame';

    const s1 = Keyboard.addListener(evtShow, onShow);
    const s2 = Keyboard.addListener(evtHide, onHide);
    const s3 = Keyboard.addListener(evtChange, onChange);

    return () => {
      s1.remove(); s2.remove(); s3.remove();
    };
  }, []);

  return kbHeight > 0 ? kbHeight + gapPx : insetsBottom + baseRest;
}

export default function MobileLoginScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    enableAndroidLayoutAnimationOnPaper();
  }, []);

  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [hasError, setHasError] = useState(true);
  const [touched, setTouched] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');

  const phoneRef = useRef(null);
  const passwordRef = useRef(null);

  // 👇 Constant 60px visual gap above the keyboard
  const bottomOffset = useKeyboardBottomOffset(60, insets.bottom, 12);

  const handlePhoneChange = (text) => {
    setPhoneNumber(text);
    const digits = text.replace(/\D/g, '');
    setHasError(digits.length < 8); // Bhutan mobile length: 8 digits
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
    if (!base) {
      setApiError('LOGIN_MERCHANT_ENDPOINT is not configured.');
      return;
    }

    const payload = {
      phone: `${COUNTRY.dial}${phoneNumber}`,
      password: password.trim(),
    };

    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    try {
      let attemptUrl = base;
      let out = await postJson(attemptUrl, payload, controller.signal);

      if (out.res.ok) {
        setApiError('');
        navigation.replace('MenuServiceSetup');
        return;
      }

      const withSlash = base.endsWith('/') ? base : `${base}/`;
      if (withSlash !== base) {
        attemptUrl = withSlash;
        out = await postJson(attemptUrl, payload, controller.signal);
        if (out.res.ok) {
          setApiError('');
          navigation.replace('MenuServiceSetup');
          return;
        }
      }

      const serverMsg =
        (out?.data && (out.data.message || out.data.error)) ||
        (out?.raw && out.raw.slice(0, 200)) ||
        '(no message)';
      setApiError(`Login failed at:\n- ${base}\n- ${withSlash}\n\nServer said:\n${serverMsg}`);
    } catch (err) {
      if (err.name === 'AbortError') {
        setApiError('Request timed out. Please try again.');
      } else {
        setApiError(`Network error: ${String(err?.message || err)}`);
      }
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />

      {/* Keep KAV but no behavior; we control the bottom bar explicitly */}
      <KeyboardAvoidingView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <View style={styles.inner}>
            <View style={styles.header}>
              <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton} activeOpacity={0.7}>
                <Icon name="arrow-back" size={24} color="#1A1D1F" />
              </TouchableOpacity>

              <View style={{ width: 1, opacity: 0 }} />

              <TouchableOpacity onPress={() => navigation.navigate('HelpScreen')} style={styles.iconButton} activeOpacity={0.7}>
                <Icon name="help-circle-outline" size={24} color="#1A1D1F" />
              </TouchableOpacity>
            </View>

            <View style={styles.content}>
              <Text style={styles.title}>Log in with mobile number</Text>

              <View style={[styles.phoneRow, { zIndex: 2 }]}>
                {/* Fixed dial code (no dropdown, no overlay) */}
                <View style={styles.countrySelector}>
                  <Text style={styles.countryCode}>{COUNTRY.dial}</Text>
                </View>

                <View
                  style={[styles.phoneInputWrapper, hasError && touched && styles.phoneInputError]}
                >
                  <TextInput
                    ref={phoneRef}
                    style={styles.phoneInput}
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
                  {hasError && touched && (
                    <View style={styles.errorIconContainer}>
                      <Text style={styles.errorIcon}>!</Text>
                    </View>
                  )}
                </View>
              </View>

              {hasError && touched && <Text style={styles.errorText}>Invalid number</Text>}

              <View style={[styles.inputContainer, { zIndex: 1 }]}>
                <TextInput
                  ref={passwordRef}
                  style={[styles.passwordInput, { paddingRight: 44 }]}
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
                  style={styles.eyeToggle}
                  hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                >
                  <Icon name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#666" />
                </TouchableOpacity>
              </View>

              {apiError ? <Text style={styles.apiError}>{apiError}</Text> : null}

              {/* Spacer so content never hides under the absolute bottom bar when keyboard is hidden */}
              <View style={{ height: insets.bottom + 88 }} />
            </View>
          </View>
        </ScrollView>

        {/* 🔽 Absolute bottom bar — follows keyboard height with constant 60px gap */}
        <View
          style={[
            styles.bottomSticky,
            { position: 'absolute', left: 0, right: 0, bottom: bottomOffset },
          ]}
        >
          <TouchableOpacity
            style={isButtonEnabled ? styles.continueButton : styles.continueButtonDisabled}
            onPress={handleLogin}
            disabled={!isButtonEnabled}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator size="small" />
            ) : (
              <Text style={isButtonEnabled ? styles.continueButtonText : styles.continueTextDisabled}>
                Log In
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* Styles */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },

  inner: {
    flex: 1,
    padding: 20,
    paddingTop: 40,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  iconButton: { padding: 8 },

  content: { flex: 1 },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1A1D1F',
    marginBottom: 25,
    lineHeight: 38,
  },

  phoneRow: { flexDirection: 'row', marginBottom: 12, gap: 8 },

  // Pill showing the fixed "+975"
  countrySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    height: 50,
  },
  countryCode: { fontSize: 16, fontWeight: '500', color: '#1A1D1F' },

  phoneInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingHorizontal: 15,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    height: 50,
  },
  phoneInputError: { borderColor: '#EF4444', borderWidth: 2, opacity: 0.8 },
  phoneInput: { flex: 1, fontSize: 16, color: '#1A1D1F', fontWeight: '400' },
  errorIconContainer: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: '#EF4444',
    alignItems: 'center', justifyContent: 'center',
  },
  errorIcon: { color: 'white', fontSize: 14, fontWeight: '600' },
  errorText: { color: '#EF4444', fontSize: 14, fontWeight: '500', marginTop: 4 },

  inputContainer: { marginTop: 16 },
  passwordInput: {
    backgroundColor: 'white',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    fontSize: 16,
    color: '#1A1D1F',
    height: 50,
  },
  eyeToggle: {
    position: 'absolute',
    right: 26,
    top: 12,
    padding: 4,
  },

  apiError: { color: '#EF4444', marginTop: 10, fontSize: 14 },

  bottomSticky: {
    paddingHorizontal: 24,
  },

  continueButton: {
    backgroundColor: '#00b14f',
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  continueButtonDisabled: {
    backgroundColor: '#eee',
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  continueButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  continueTextDisabled: { color: '#aaa', fontSize: 16, fontWeight: '600' },
});
