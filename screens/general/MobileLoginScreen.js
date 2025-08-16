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
  Modal,
  TouchableWithoutFeedback,
  Image,
  Dimensions,
  FlatList,
  ActivityIndicator,
  Keyboard,
  LayoutAnimation,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { LOGIN_MERCHANT_ENDPOINT } from '@env';

const { height } = Dimensions.get('window');
const SHEET_HEIGHT = Math.round(height / 2);

const COUNTRY_OPTIONS = [
  { name: 'Bhutan', code: 'bt', dial: '+975' },
  { name: 'Singapore', code: 'sg', dial: '+65' },
  { name: 'Malaysia', code: 'my', dial: '+60' },
  { name: 'Indonesia', code: 'id', dial: '+62' },
  { name: 'Philippines', code: 'ph', dial: '+63' },
  { name: 'Thailand', code: 'th', dial: '+66' },
  { name: 'Vietnam', code: 'vn', dial: '+84' },
  { name: 'Myanmar', code: 'mm', dial: '+95' },
  { name: 'Cambodia', code: 'kh', dial: '+855' },
];

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

/** Small hook to keep a consistent bottom spacing when keyboard shows */
function useKeyboardPadding(defaultPadding = 20) {
  const [pad, setPad] = useState(defaultPadding);

  useEffect(() => {
    const onShow = (e) => {
      // Animate to feel smoother
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      const kbHeight = e.endCoordinates?.height ?? 0;
      // Keep some air between the button and the keyboard
      setPad(Math.max(defaultPadding, kbHeight + 12));
    };
    const onHide = () => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setPad(defaultPadding);
    };

    const subShow =
      Platform.OS === 'ios'
        ? Keyboard.addListener('keyboardWillShow', onShow)
        : Keyboard.addListener('keyboardDidShow', onShow);

    const subHide =
      Platform.OS === 'ios'
        ? Keyboard.addListener('keyboardWillHide', onHide)
        : Keyboard.addListener('keyboardDidHide', onHide);

    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, [defaultPadding]);

  return pad;
}

export default function MobileLoginScreen() {
  const navigation = useNavigation();

  const [country, setCountry] = useState(COUNTRY_OPTIONS[0]); // Default Bhutan (change to [4] for Philippines)
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [hasError, setHasError] = useState(true);
  const [touched, setTouched] = useState(false);
  const [codeVisible, setCodeVisible] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');

  // 👉 Refs so we control focus transitions (prevents accidental jumps)
  const phoneRef = useRef(null);
  const passwordRef = useRef(null);

  // 👉 Dynamic bottom padding for consistent spacing
  const bottomPadding = useKeyboardPadding(Platform.OS === 'android' ? 34 : 20);

  const handlePhoneChange = (text) => {
    setPhoneNumber(text);
    setHasError(!(text.length >= 8)); // Simple validation
  };

  const isButtonEnabled = !hasError && password.trim().length >= 6 && !loading;

  const renderCodeItem = ({ item }) => {
    const isActive = item.dial === country.dial;
    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.8}
        onPress={() => {
          setCountry(item);
          setCodeVisible(false);
        }}
      >
        <View style={styles.left}>
          <Image
            source={{ uri: `https://flagcdn.com/w40/${item.code}.png` }}
            style={styles.flag}
          />
          <Text style={[styles.name, isActive && styles.nameActive]}>
            {item.name} ({item.dial})
          </Text>
        </View>
        {isActive && <Icon name="checkmark" size={22} color="#000" style={styles.tickIcon} />}
      </TouchableOpacity>
    );
  };

  const handleLogin = async () => {
    setTouched(true);
    setApiError('');

    if (hasError || password.trim().length < 6) {
      setApiError('Please enter a valid phone and a password (min 6 chars).');
      return;
    }

    let base = LOGIN_MERCHANT_ENDPOINT;
    if (!base) {
      setApiError('LOGIN_MERCHANT_ENDPOINT is not configured.');
      return;
    }

    const payload = {
      phone: `${country.dial}${phoneNumber}`, // e.g., +63XXXXXXXXXX (no spaces)
      password: password.trim(),
    };

    setLoading(true);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    try {
      // Attempt 1: as-is
      let attemptUrl = base;
      let out = await postJson(attemptUrl, payload, controller.signal);

      if (out.res.ok) {
        setApiError('');
        navigation.replace('MenuServiceSetup');
        return;
      }

      // Attempt 2: with trailing slash
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

      // If both failed -> surface clearest message
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

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        // If you have a custom header, set an offset here
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.inner}>
            {/* Header — matches LoginScreen spacing */}
            <View style={styles.header}>
              <TouchableOpacity
                onPress={() => navigation.goBack()}
                style={styles.iconButton}
                activeOpacity={0.7}
              >
                <Icon name="arrow-back" size={24} color="#1A1D1F" />
              </TouchableOpacity>

              <View style={{ width: 1, opacity: 0 }} />

              <TouchableOpacity
                onPress={() => navigation.navigate('HelpScreen')}
                style={styles.iconButton}
                activeOpacity={0.7}
              >
                <Icon name="help-circle-outline" size={24} color="#1A1D1F" />
              </TouchableOpacity>
            </View>

            {/* Content */}
            <View style={styles.content}>
              <Text style={styles.title}>Log in with mobile number</Text>

              {/* Phone Input with Country Selector */}
              <View style={[styles.phoneRow, { zIndex: 2 }]}>
                <TouchableOpacity
                  style={styles.countrySelector}
                  onPress={() => setCodeVisible(true)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.countryCode}>{country.dial}</Text>
                  <Icon name="chevron-down" size={16} color="#666" />
                </TouchableOpacity>

                <View
                  style={[
                    styles.phoneInputWrapper,
                    hasError && touched && styles.phoneInputError,
                  ]}
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
                    // Only go to password when pressing Next on keyboard:
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

              {/* Password Input with eye toggle */}
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
                  <Icon
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color="#666"
                  />
                </TouchableOpacity>
              </View>

              {/* API error (if any) */}
              {apiError ? <Text style={styles.apiError}>{apiError}</Text> : null}

              {/* Add a little filler so content can scroll above the button if needed */}
              <View style={{ height: 12 }} />
            </View>
          </View>
        </ScrollView>

        {/* Bottom Section with Button (auto-pads with keyboard) */}
        <View style={[styles.bottomSticky, { paddingBottom: bottomPadding }]}>
          <TouchableOpacity
            style={isButtonEnabled ? styles.continueButton : styles.continueButtonDisabled}
            onPress={handleLogin}
            disabled={!isButtonEnabled}
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

      {/* Country Overlay */}
      <Modal
        visible={codeVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setCodeVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setCodeVisible(false)}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>

        <View style={styles.sheet}>
          <SafeAreaView style={{ flex: 1 }}>
            <Text style={styles.sheetTitle}>Select your country</Text>
            <FlatList
              style={{ flex: 1 }}
              data={COUNTRY_OPTIONS}
              keyExtractor={(item) => item.code}
              renderItem={renderCodeItem}
              ItemSeparatorComponent={() => <View style={styles.sep} />}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 8 }}
              keyboardShouldPersistTaps="handled"
            />
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* Styles */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },

  // Match LoginScreen: inner padding controls top spacing
  inner: {
    flex: 1,
    padding: 20,
    paddingTop: 40,
  },

  // Match LoginScreen header spacing exactly
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  iconButton: { padding: 8 },

  // Content (inner already has padding)
  content: { flex: 1 },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1A1D1F',
    marginBottom: 25,
    lineHeight: 38,
  },

  phoneRow: { flexDirection: 'row', marginBottom: 12, gap: 8 },
  countrySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    gap: 8,
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

  apiError: {
    color: '#EF4444',
    marginTop: 10,
    fontSize: 14,
  },

  // Bottom area now adapts to keyboard with extra padding set in code
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

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    height: SHEET_HEIGHT,
    backgroundColor: '#fff',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 18,
    elevation: 10,
  },
  sheetTitle: { fontSize: 22, fontWeight: '700', marginBottom: 16, color: '#111' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14 },
  left: { flexDirection: 'row', alignItems: 'center' },
  flag: { width: 26, height: 18, borderWidth: 1, borderColor: '#ddd', borderRadius: 3, marginRight: 12 },
  name: { fontSize: 16, color: '#1a1d1f' },
  nameActive: { fontWeight: '700' },
  tickIcon: { marginRight: 2 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: '#eee' },
});
