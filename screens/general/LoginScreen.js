// screens/general/LoginScreen.js
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableWithoutFeedback,
  Keyboard,
  ActivityIndicator,
  Alert,
  Modal,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import CheckBox from 'expo-checkbox';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import { LOGIN_USERNAME_MERCHANT_ENDPOINT as ENV_LOGIN_USERNAME_MERCHANT_ENDPOINT } from '@env';

const KEY_SAVED_USERNAME = 'saved_username';
const KEY_SAVED_PASSWORD = 'saved_password';
const KEY_LAST_LOGIN_USERNAME = 'last_login_username';
const KEY_AUTH_TOKEN = 'auth_token';

const endpoint = (ENV_LOGIN_USERNAME_MERCHANT_ENDPOINT ?? '').trim();

// Enable smooth LayoutAnimation on Android (for keyboard show/hide)
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Tiny keyboard gap hook (keeps ~8px between keyboard and footer button)
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
    return () => {
      s1.remove();
      s2.remove();
    };
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

  // responsive footer spacing
  const bottomGap = useKeyboardGap(8);

  // ---------- helpers ----------
  const persistSavedCreds = async (u, p) => {
    if (savePassword && u && p) {
      await SecureStore.setItemAsync(KEY_SAVED_USERNAME, u);
      await SecureStore.setItemAsync(KEY_SAVED_PASSWORD, p);
    } else {
      await SecureStore.deleteItemAsync(KEY_SAVED_USERNAME);
      await SecureStore.deleteItemAsync(KEY_SAVED_PASSWORD);
    }
  };

  // Load saved creds on mount
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
      } catch { }
    })();
  }, []);

  // Keep SecureStore in sync while typing if checkbox is checked
  useEffect(() => {
    if (!savePassword) return;
    const t = setTimeout(() => {
      persistSavedCreds(username.trim(), password);
    }, 250);
    return () => clearTimeout(t);
  }, [username, password, savePassword]);

  const handleToggleSave = async (val) => {
    setSavePassword(val);
    if (val) {
      await persistSavedCreds(username.trim(), password);
    } else {
      await persistSavedCreds('', '');
    }
  };

  // Normalize/derive owner type from API payload
  const getOwnerType = (data) => {
    const pick = (...paths) => {
      for (const p of paths) {
        try {
          const v = p();
          if (v !== undefined && v !== null && v !== '') return v;
        } catch { }
      }
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

    // map numeric codes if backend sends them (adjust mapping to your API if needed)
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
      Alert.alert(
        'Configuration error',
        'LOGIN_USERNAME_MERCHANT_ENDPOINT is not set in your .env file.'
      );
      return;
    }

    setLoading(true);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_name: username.trim(),
          password: password,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const raw = await res.text();
      let data = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch (e) {
        console.log('❌ JSON parse error:', e);
      }

      // Debug prints so you can see what the API actually sends
      // console.log('🔵 status:', res.status);
      // console.log('🔵 raw:', raw);
      // console.log('🔵 parsed:', data);

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

      // ✅ Save token string (supports both string and object tokens)
      if (data?.token) {
        const tokenStr =
          typeof data.token === 'string'
            ? data.token
            : (data.token?.access_token ?? '');
        if (tokenStr) {
          await SecureStore.setItemAsync(KEY_AUTH_TOKEN, String(tokenStr));
        }
      }

      await SecureStore.setItemAsync(KEY_LAST_LOGIN_USERNAME, username.trim());
      await persistSavedCreds(username.trim(), password);

      // 🔀 Route based on owner type from API
      const ownerType = getOwnerType(data);

      // Extract user (merchant) info and pass business fields
      const userInfo = data?.merchant || data?.user || {};

      const business_name =
        userInfo?.business_name ??
        userInfo?.businessName ??
        '';

      const business_logo =
        userInfo?.business_logo ??
        userInfo?.businessLogo ??
        userInfo?.logo ??
        '';

      // ✅ NEW: robust business address extraction
      const business_address =
        userInfo?.business_address ??
        userInfo?.businessAddress ??
        userInfo?.address ??
        userInfo?.location ??
        data?.business_address ??
        data?.address ??
        '';

      // ✅ robust email & phone extraction
      const email =
        userInfo?.email ??
        userInfo?.owner_email ??
        userInfo?.contact_email ??
        userInfo?.contact?.email ??
        data?.email ??
        data?.user?.email ??
        data?.merchant?.email ??
        '';

      const phone =
        userInfo?.phone ??
        userInfo?.phone_number ??
        userInfo?.mobile ??
        userInfo?.contact_phone ??
        userInfo?.contact?.phone ??
        userInfo?.contact?.mobile ??
        data?.phone ??
        data?.user?.phone ??
        data?.merchant?.phone ??
        '';
      const business_id =
        userInfo?.business_id ??
        userInfo?.businessId ??
        userInfo?.id ??
        data?.business_id ??
        data?.id ??
        '';


      // ✅ assemble payload (now includes business_address)
      const userPayload = {
        user: userInfo,
        business_name,
        business_id,
        business_logo,
        business_address,         // ← added
        username: username.trim(),
        email,
        phone,
      };

      if (ownerType === 'mart') {
        navigation.replace('MartServiceSetupScreen', userPayload);
        return;
      }
      if (ownerType === 'food') {
        navigation.replace('GrabMerchantHomeScreen', userPayload);
        return;
      }

      // No recognized owner type → make it explicit instead of silently going elsewhere
      Alert.alert(
        'Cannot route',
        `Owner type missing or unknown.\nGot: ${JSON.stringify(ownerType)}\nPlease check the API response.`
      );
      console.log('⚠️ No owner_type match; full payload:', data);

    } catch (err) {
      const msg =
        err?.name === 'AbortError'
          ? 'Request timed out. Please try again.'
          : err?.message?.toString() ?? 'Login failed';
      Alert.alert('Login failed', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    // Disable KAV behavior so our keyboard gap hook is the single source of truth
    <KeyboardAvoidingView style={styles.container}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.inner}>
          {/* Loading overlay */}
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
          <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
            <View style={styles.form}>
              <Text style={styles.label}>Enter your username</Text>
              <View
                style={[
                  styles.inputWrapper,
                  { borderColor: isUsernameFocused ? '#00b14f' : '#ccc' },
                ]}
              >
                <TextInput
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
              <View
                style={[
                  styles.passwordContainer,
                  { borderColor: isPasswordFocused ? '#00b14f' : '#ccc' },
                  isPasswordFocused && styles.shadowGreen,
                ]}
              >
                <TextInput
                  style={styles.passwordInput}
                  placeholder={isPasswordFocused ? '' : 'Enter password'}
                  value={password}
                  editable={!loading}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  onFocus={() => setIsPasswordFocused(true)}
                  onBlur={() => setIsPasswordFocused(false)}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeIcon}
                  disabled={loading}
                >
                  <Icon name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#666" />
                </TouchableOpacity>
              </View>

              <View className="checkbox-row" style={styles.checkboxContainer}>
                <CheckBox
                  value={savePassword}
                  onValueChange={handleToggleSave}
                  disabled={loading}
                  color={savePassword ? '#00b14f' : undefined}
                />
                <Text style={styles.checkboxLabel}>Save password</Text>
              </View>
            </View>
          </ScrollView>

          {/* Footer (pads itself to float above keyboard with tiny gap) */}
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
      </TouchableWithoutFeedback>
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
  footer: { marginBottom: 15, paddingHorizontal: 8 }, // paddingBottom set dynamically
  loadingOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
});
