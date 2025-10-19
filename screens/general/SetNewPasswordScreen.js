// SetNewPasswordScreen.js (uses ONLY FORGOT_RESET_PASSWORD_ENDPOINT from .env)
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Platform,
  KeyboardAvoidingView, StatusBar, ScrollView, ActivityIndicator, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CommonActions, StackActions, useNavigation, useRoute } from '@react-navigation/native';
import { FORGOT_RESET_PASSWORD_ENDPOINT } from '@env';

/* ---------- helpers ---------- */
const maskEmail = (email = '', keepStart = 2) => {
  const e = String(email).trim();
  if (!e || !e.includes('@')) return '';
  const [local, domain] = e.split('@');
  const shown = (local || '').slice(0, keepStart);
  const maskedLocal = shown + ((local || '').length > keepStart ? '**' : '*');
  return `${maskedLocal}@${domain || ''}`;
};

// Find a navigator (self or parent) that declares a given route name
const findNavigatorWithRoute = (nav, routeName) => {
  let cur = nav;
  while (cur) {
    const st = cur.getState?.();
    const names = st?.routeNames;
    if (Array.isArray(names) && names.includes(routeName)) return cur;
    cur = cur.getParent?.();
  }
  return null;
};

// Robust, RESET-FREE redirection to LoginScreen
const goToLoginScreen = (navigation, email) => {
  const routeName = 'LoginScreen';
  const params = { initialEmail: email, prefillEmail: email };

  // 1) Replace in whichever navigator owns LoginScreen
  const navWithLogin = findNavigatorWithRoute(navigation, routeName);
  if (navWithLogin) {
    try {
      navWithLogin.dispatch(StackActions.replace(routeName, params));
      return;
    } catch (_) {}
  }

  // 2) If you have an auth stack, navigate into it then to LoginScreen (rename 'AuthStack' if needed)
  try {
    navigation.dispatch(
      CommonActions.navigate({
        name: 'AuthStack', // <-- change this if your auth stack has a different name
        params: {},
        action: CommonActions.navigate({ name: routeName, params }),
      })
    );
    return;
  } catch (_) {}

  // 3) Fallback: simple navigate on current navigator
  try {
    navigation.dispatch(CommonActions.navigate({ name: routeName, params }));
  } catch (e) {
    console.warn('[SetNewPassword] Could not navigate to LoginScreen:', e?.message);
  }
};

export default function SetNewPasswordScreen() {
  const navigation = useNavigation();
  const route = useRoute();

  const email = route?.params?.email || '';
  const otp = route?.params?.otp || '';
  const resetToken = route?.params?.resetToken || null;

  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isFocused1, setIsFocused1] = useState(false);
  const [isFocused2, setIsFocused2] = useState(false);
  const [loading, setLoading] = useState(false);

  // show/hide toggles
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const valid = pwd.length >= 6 && pwd === confirm;
  const maskedEmail = maskEmail(email, 2);

  // safe fetch + JSON parse (handles HTML/empty responses)
  const postJson = async (url, body) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    const raw = await res.text();
    let json = {};
    try { json = raw ? JSON.parse(raw) : {}; } catch (_) {}
    return { res, json, raw };
  };

  const submitNewPassword = async () => {
    if (!valid || loading) return;

    const endpoint = (FORGOT_RESET_PASSWORD_ENDPOINT || '').trim();
    if (!endpoint) {
      Alert.alert('Config error', 'FORGOT_RESET_PASSWORD_ENDPOINT is missing in your .env');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        email: (email || '').trim(),  // full email to API
        newPassword: pwd,
        // include only if your backend expects them:
        otp,
        token: resetToken,
      };

      const { res, json, raw } = await postJson(endpoint, payload);

      if (!res.ok) {
        const msg = json?.message || json?.error || raw?.slice(0, 160) || `Failed (HTTP ${res.status})`;
        Alert.alert('Failed', typeof msg === 'string' ? msg : 'Could not reset password.');
        return;
      }

      const successMsg = json?.message || 'Your password has been reset. Please log in.';
      Alert.alert('Success', successMsg, [
        { text: 'OK', onPress: () => goToLoginScreen(navigation, email) },
      ]);
    } catch (e) {
      console.error('reset-password error:', e);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'right', 'left', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 10}
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.iconButton}
              accessibilityLabel="Go back"
            >
              <Ionicons name="arrow-back" size={24} color="#1A1D1F" />
            </TouchableOpacity>
            <View style={{ width: 40 }} />
          </View>

          <View style={styles.content}>
            <Text style={styles.title}>Set new password</Text>
            <Text style={styles.subtitle}>
              Create a strong password for{' '}
              <Text style={{ fontWeight: '700', color: '#1A1D1F' }}>{maskedEmail}</Text>
              .
            </Text>

            <Text style={styles.label}>New password</Text>
            <View style={[styles.inputWrapper, { borderColor: isFocused1 ? '#00b14f' : '#E5E7EB', borderWidth: 1.5 }]}>
              <TextInput
                style={styles.input}
                value={pwd}
                onChangeText={setPwd}
                onFocus={() => setIsFocused1(true)}
                onBlur={() => setIsFocused1(false)}
                placeholder="Enter new password"
                secureTextEntry={!showPwd}
                autoCapitalize="none"
                returnKeyType="next"
              />
              <TouchableOpacity
                onPress={() => setShowPwd(v => !v)}
                accessibilityRole="button"
                accessibilityLabel={showPwd ? 'Hide password' : 'Show password'}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.eyeBtn}
              >
                <Ionicons name={showPwd ? 'eye-off' : 'eye'} size={22} color="#666" />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Confirm password</Text>
            <View style={[styles.inputWrapper, { borderColor: isFocused2 ? '#00b14f' : '#E5E7EB', borderWidth: 1.5 }]}>
              <TextInput
                style={styles.input}
                value={confirm}
                onChangeText={setConfirm}
                onFocus={() => setIsFocused2(true)}
                onBlur={() => setIsFocused2(false)}
                placeholder="Re-enter new password"
                secureTextEntry={!showConfirm}
                autoCapitalize="none"
                returnKeyType="done"
                onSubmitEditing={() => valid && !loading && submitNewPassword()}
              />
              <TouchableOpacity
                onPress={() => setShowConfirm(v => !v)}
                accessibilityRole="button"
                accessibilityLabel={showConfirm ? 'Hide password' : 'Show password'}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.eyeBtn}
              >
                <Ionicons name={showConfirm ? 'eye-off' : 'eye'} size={22} color="#666" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={valid && !loading ? styles.submitButton : styles.submitButtonDisabled}
              onPress={submitNewPassword}
              disabled={!valid || loading}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>Update Password</Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa', paddingHorizontal: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  iconButton: { padding: 8, justifyContent: 'center', alignItems: 'center' },
  content: { flex: 1, paddingHorizontal: 8, marginTop: -5 },
  title: { fontSize: 26, fontWeight: '700', color: '#1A1D1F', marginBottom: 16, lineHeight: 34 },
  subtitle: { fontSize: 15, color: '#666', marginBottom: 24 },
  label: { fontSize: 14, marginBottom: 6, color: '#333' },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'white',
    paddingHorizontal: 15, paddingVertical: 5, borderRadius: 12, marginBottom: 12,
  },
  input: { flex: 1, fontSize: 16, color: '#1A1D1F', fontWeight: '400' },
  eyeBtn: { paddingHorizontal: 6, paddingVertical: 6 },
  submitButton: {
    backgroundColor: '#00b14f', paddingVertical: 16, borderRadius: 30,
    alignItems: 'center', justifyContent: 'center', width: '100%', marginTop: 10,
  },
  submitButtonDisabled: {
    backgroundColor: '#eee', paddingVertical: 16, borderRadius: 30,
    alignItems: 'center', justifyContent: 'center', width: '100%', marginTop: 10,
  },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
