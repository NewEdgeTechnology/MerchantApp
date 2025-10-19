// ForgotOTPVerify.js (env-only endpoints)
import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Platform,
  KeyboardAvoidingView, StatusBar, ScrollView, ActivityIndicator, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CommonActions, StackActions, useNavigation, useRoute } from '@react-navigation/native';
import {
  FORGOT_VERIFY_OTP_ENDPOINT,
  FORGOT_SEND_OTP_ENDPOINT,
  FORGOT_RESET_PASSWORD_ENDPOINT,
} from '@env';

/* ---------------- helpers ---------------- */

// tiny helper for safe JSON parse
async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  let json = {};
  try { json = raw ? JSON.parse(raw) : {}; } catch (_) {}
  return { res, json, raw };
}

// mask email for UI display (keep first 2 chars of local part, mask the rest)
const maskEmail = (email = '', keepStart = 2) => {
  const e = String(email).trim();
  if (!e || !e.includes('@')) return '';
  const [local, domain] = e.split('@');
  const shown = (local || '').slice(0, keepStart);
  const maskedLocal = shown + ((local || '').length > keepStart ? '**' : '*');
  return `${maskedLocal}@${domain || ''}`;
};

// RESET-FREE redirection to LoginScreen
const goToLoginSafe = (navigation, email) => {
  const params = { initialEmail: email, prefillEmail: email };
  const loginRoute = 'LoginScreen';

  // 1) Replace within current stack (if available)
  try {
    navigation.replace(loginRoute, params);
    return;
  } catch (_) {}

  // 2) Direct navigate in current navigator
  try {
    navigation.dispatch(CommonActions.navigate({ name: loginRoute, params }));
    return;
  } catch (_) {}

  // 3) Nested navigate: AuthStack -> LoginScreen (rename 'AuthStack' if your stack name differs)
  try {
    navigation.dispatch(
      CommonActions.navigate({
        name: 'AuthStack',
        params: {},
        action: CommonActions.navigate({ name: loginRoute, params }),
      })
    );
    return;
  } catch (_) {}

  // 4) Pop to top then navigate to LoginScreen
  try {
    navigation.dispatch(StackActions.popToTop());
    navigation.dispatch(CommonActions.navigate({ name: loginRoute, params }));
  } catch (_) {
    // final no-op
  }
};

export default function ForgotOTPVerify() {
  const navigation = useNavigation();
  const route = useRoute();

  const email = route?.params?.email || '';
  const masked = maskEmail(email, 2);

  // step: 1 = OTP, 2 = set new pwd
  const [step, setStep] = useState(1);

  // OTP
  const [otp, setOtp] = useState('');
  const [otpFocused, setOtpFocused] = useState(false);

  // Password
  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isFocused1, setIsFocused1] = useState(false);
  const [isFocused2, setIsFocused2] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // shared
  const [loading, setLoading] = useState(false);

  // resend cooldown
  const RESEND_COOLDOWN = 60;
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);
  const [resendLoading, setResendLoading] = useState(false);

  useEffect(() => {
    setCooldown(RESEND_COOLDOWN);
    const t = setInterval(() => setCooldown(s => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);

  const resendLabel = useMemo(() => {
    if (cooldown > 0) return `Resend OTP in ${cooldown}s`;
    if (resendLoading) return 'Sending...';
    return 'Resend OTP';
  }, [cooldown, resendLoading]);

  // validations
  const isValidOtp = (v) => /^\d{4,8}$/.test((v || '').trim());
  const otpValid = isValidOtp(otp);
  const pwdValid = pwd.length >= 6 && pwd === confirm;

  const handleBack = () => {
    if (step === 2) { setStep(1); return; }
    navigation.goBack();
  };

  // ---------- VERIFY OTP (uses FORGOT_VERIFY_OTP_ENDPOINT from .env) ----------
  const verifyOtp = async () => {
    if (!email || !otpValid || loading) return;
    if (!FORGOT_VERIFY_OTP_ENDPOINT) {
      Alert.alert('Config error', 'FORGOT_VERIFY_OTP_ENDPOINT missing in .env');
      return;
    }

    setLoading(true);
    const safeEmail = email.trim();
    const otpTrim = otp.trim();

    try {
      // Try numeric first; then string to preserve leading zeros
      let { res, json, raw } = await postJson(FORGOT_VERIFY_OTP_ENDPOINT, { email: safeEmail, otp: Number(otpTrim) });

      if (!res.ok) {
        const retry = await postJson(FORGOT_VERIFY_OTP_ENDPOINT, { email: safeEmail, otp: otpTrim });
        res = retry.res; json = retry.json; raw = retry.raw;
      }

      if (!res.ok) {
        console.log('[verify-otp] URL:', FORGOT_VERIFY_OTP_ENDPOINT);
        console.log('[verify-otp] Sent variants:', { email: safeEmail, otpNum: Number(otpTrim), otpStr: otpTrim });
        console.log('[verify-otp] Status:', res.status, 'JSON:', json, 'Raw:', raw?.slice(0, 250));
        Alert.alert('Failed', json?.message || 'Invalid OTP. Try again.');
        return;
      }

      Alert.alert('Verified', 'OTP verified successfully.');
      setStep(2);
    } catch (e) {
      console.error('verify-otp error:', e);
      Alert.alert('Error', 'Could not verify OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ---------- RESEND OTP (uses FORGOT_SEND_OTP_ENDPOINT from .env) ----------
  const resendOtp = async () => {
    if (cooldown > 0 || resendLoading) return;
    if (!FORGOT_SEND_OTP_ENDPOINT) {
      Alert.alert('Config error', 'FORGOT_SEND_OTP_ENDPOINT missing in .env');
      return;
    }

    setResendLoading(true);
    try {
      const { res, json, raw } = await postJson(FORGOT_SEND_OTP_ENDPOINT, { email: email.trim() });

      if (!res.ok) {
        console.log('[resend-otp] URL:', FORGOT_SEND_OTP_ENDPOINT, 'Status:', res.status, 'JSON:', json, 'Raw:', raw?.slice(0, 250));
        const msg = json?.message || json?.error || raw?.slice(0, 160) || `Failed (HTTP ${res.status})`;
        Alert.alert('Failed', typeof msg === 'string' ? msg : 'Could not resend OTP');
        return;
      }

      Alert.alert('Sent', 'A new OTP has been sent to your email.');
      setCooldown(RESEND_COOLDOWN);
    } catch (e) {
      console.error('resend-otp error:', e);
      Alert.alert('Error', 'Could not resend OTP. Please try again.');
    } finally {
      setResendLoading(false);
    }
  };

  // ---------- RESET PASSWORD (uses FORGOT_RESET_PASSWORD_ENDPOINT from .env) ----------
  const submitNewPassword = async () => {
    if (!pwdValid || loading) return;
    if (!FORGOT_RESET_PASSWORD_ENDPOINT) {
      Alert.alert('Config error', 'FORGOT_RESET_PASSWORD_ENDPOINT missing in .env');
      return;
    }

    setLoading(true);
    try {
      const { res, json, raw } = await postJson(FORGOT_RESET_PASSWORD_ENDPOINT, {
        email: email.trim(),     // full email for API
        newPassword: pwd,
      });

      if (!res.ok) {
        console.log('[reset-password] URL:', FORGOT_RESET_PASSWORD_ENDPOINT, 'Status:', res.status, 'JSON:', json, 'Raw:', raw?.slice(0, 250));
        Alert.alert('Failed', json?.message || 'Could not reset password.');
        return;
      }

      const successMsg = json?.message || 'Your password has been reset. Please log in.';
      Alert.alert('Success', successMsg, [
        { text: 'OK', onPress: () => goToLoginSafe(navigation, email) },
      ]);
    } catch (e) {
      console.error('reset-password error:', e);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ---------- RENDER ----------
  return (
    <SafeAreaView style={styles.container} edges={['top', 'right', 'left', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 10}
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={handleBack} style={styles.iconButton} accessibilityLabel="Go back">
              <Ionicons name="arrow-back" size={24} color="#1A1D1F" />
            </TouchableOpacity>
            <View style={{ width: 40 }} />
          </View>

          {/* Body */}
          <View style={styles.content}>
            {step === 1 ? (
              <>
                <Text style={styles.title}>Enter OTP</Text>
                <Text style={styles.subtitle}>
                  We sent a one-time code to{' '}
                  <Text style={{ fontWeight: '700', color: '#1A1D1F' }}>{masked}</Text>.
                </Text>

                <Text style={styles.label}>OTP code</Text>
                <View style={[styles.inputWrapper, { borderColor: otpFocused ? '#00b14f' : '#E5E7EB', borderWidth: 1.5 }]}>
                  <TextInput
                    style={styles.input}
                    value={otp}
                    onChangeText={setOtp}
                    onFocus={() => setOtpFocused(true)}
                    onBlur={() => setOtpFocused(false)}
                    placeholder="Enter your OTP"
                    keyboardType="number-pad"
                    maxLength={8}
                    returnKeyType="done"
                    onSubmitEditing={() => otpValid && !loading && verifyOtp()}
                  />
                </View>

                <TouchableOpacity
                  style={otpValid && !loading ? styles.submitButton : styles.submitButtonDisabled}
                  onPress={verifyOtp}
                  disabled={!otpValid || loading}
                >
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>Verify</Text>}
                </TouchableOpacity>

                {/* Resend OTP + timer */}
                <TouchableOpacity
                  onPress={resendOtp}
                  disabled={cooldown > 0 || resendLoading}
                  style={{ marginTop: 10, alignSelf: 'center', opacity: (cooldown > 0 || resendLoading) ? 0.6 : 1 }}
                >
                  <Text style={{ color: '#007bff', fontWeight: '600' }}>{resendLabel}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.title}>Set new password</Text>
                <Text style={styles.subtitle}>
                  Create a strong password for{' '}
                  <Text style={{ fontWeight: '700', color: '#1A1D1F' }}>{masked}</Text>.
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
                    onSubmitEditing={() => pwdValid && !loading && submitNewPassword()}
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
                  style={pwdValid && !loading ? styles.submitButton : styles.submitButtonDisabled}
                  onPress={submitNewPassword}
                  disabled={!pwdValid || loading}
                >
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>Update Password</Text>}
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* ---------------- styles ---------------- */
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
