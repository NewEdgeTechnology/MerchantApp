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
} from 'react-native';
import CheckBox from 'expo-checkbox';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import { LOGIN_USERNAME_MERCHANT_ENDPOINT as ENV_LOGIN_USERNAME_MERCHANT_ENDPOINT } from '@env';

const NEXT_ROUTE = 'FoodMenuSetupScreen';

const KEY_SAVED_USERNAME = 'saved_username';
const KEY_SAVED_PASSWORD = 'saved_password';
const KEY_LAST_LOGIN_USERNAME = 'last_login_username';
const KEY_AUTH_TOKEN = 'auth_token';

const LoginScreen = () => {
  const navigation = useNavigation();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [savePassword, setSavePassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isUsernameFocused, setIsUsernameFocused] = useState(false);
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);
  const [loading, setLoading] = useState(false);

  const endpoint =
    (ENV_LOGIN_USERNAME_MERCHANT_ENDPOINT || '').trim() ||
    'http://192.168.131.19:8080/api/merchant/login-username';

  const canSubmit = username.trim().length > 0 && password.length > 0 && !loading;

  // ---------- helpers ----------
  const persistSavedCreds = async (u, p) => {
    // if checkbox is on AND we have values → store; otherwise remove
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
          setSavePassword(true); // show as checked if we loaded anything
        } else {
          // fall back to last username (optional)
          const lastU = await SecureStore.getItemAsync(KEY_LAST_LOGIN_USERNAME);
          if (lastU) setUsername(lastU);
        }
      } catch {}
    })();
  }, []);

  // Keep SecureStore in sync while typing if checkbox is checked
  useEffect(() => {
    if (!savePassword) return;
    const t = setTimeout(() => {
      persistSavedCreds(username.trim(), password);
    }, 250); // tiny debounce
    return () => clearTimeout(t);
  }, [username, password, savePassword]);

  const handleToggleSave = async (val) => {
    setSavePassword(val);
    // Immediately reflect the toggle in storage
    if (val) {
      await persistSavedCreds(username.trim(), password);
    } else {
      await persistSavedCreds('', '');
    }
  };

  const handleLogin = async () => {
    if (!canSubmit) return;
    setLoading(true);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_name: username.trim(),
          password: password,
        }),
      });

      // Read once; support JSON or plain text
      const raw = await res.text();
      let data = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch { /* not JSON */ }

      const msg = (data?.message ?? data?.error ?? raw ?? '').toString().trim();

      const looksLikeSuccess =
        res.ok && (
          data?.success === true ||
          typeof data?.token === 'string' ||
          (data?.status && String(data.status).toLowerCase() === 'ok') ||
          /login\s*successful/i.test(msg)
        );

      if (!looksLikeSuccess) {
        const errText = msg || `Request failed with ${res.status}`;
        throw new Error(errText);
      }

      if (data?.token) {
        await SecureStore.setItemAsync(KEY_AUTH_TOKEN, String(data.token));
      }
      await SecureStore.setItemAsync(KEY_LAST_LOGIN_USERNAME, username.trim());

      // Save or clear based on checkbox
      await persistSavedCreds(username.trim(), password);

      navigation.replace(NEXT_ROUTE, { user: data?.merchant || null });
    } catch (err) {
      const msg = err?.message?.toString() ?? 'Login failed';
      Alert.alert('Login failed', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'android' ? 'padding' : 'height'}
    >
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

          {/* Footer */}
          <View style={styles.footer}>
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
              activeOpacity={0.8}
            >
              <Text style={canSubmit ? styles.loginButtonText : styles.loginButtonTextDisabled}>
                Log In
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.loginPhoneButton}
              onPress={() => !loading && navigation.navigate('MobileLoginScreen')}
              activeOpacity={0.8}
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
  footer: { marginBottom: 15 },
  loadingOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
});
