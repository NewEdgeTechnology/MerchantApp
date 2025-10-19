// ResetPasswordScreen.js (uses ONLY FORGOT_SEND_OTP_ENDPOINT from .env)
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Platform,
  KeyboardAvoidingView, StatusBar, ScrollView, ActivityIndicator, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { FORGOT_SEND_OTP_ENDPOINT } from '@env';

// Helper: safe fetch + JSON parse (avoids crashes if backend returns HTML)
async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  let json = {};
  try { json = raw ? JSON.parse(raw) : {}; } catch (_) {}
  return { res, raw, json };
}

const ResetPasswordScreen = () => {
  const navigation = useNavigation();
  const [email, setEmail] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [loading, setLoading] = useState(false);

  const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
  const valid = isValidEmail(email);

  const handleClear = () => setEmail('');

  const sendEmailOtp = async () => {
    if (!valid || loading) return;
    setLoading(true);

    // Read from .env only
    const endpoint = (FORGOT_SEND_OTP_ENDPOINT || '').trim();

    if (!endpoint) {
      Alert.alert('Config error', 'FORGOT_SEND_OTP_ENDPOINT is missing in your .env');
      setLoading(false);
      return;
    }

    const payload = { email: email.trim(), username: email.trim() };

    try {
      const { res, raw, json } = await postJson(endpoint, payload);
      // console.log('[forgot/send-otp]', endpoint, '=>', res.status);

      if (res.ok) {
        Alert.alert('Success', 'We sent a reset OTP to your email.');
        navigation.replace('ForgotOTPVerify', { email: email.trim() });
        return;
      }

      // Not OK: show message if provided, else a short fallback
      const msg = json?.message || json?.error || (raw?.slice(0, 160) || `Failed (HTTP ${res.status})`);
      Alert.alert('Failed', typeof msg === 'string' ? msg : 'Failed to send OTP');
    } catch (e) {
      console.error('send-otp error:', e);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top','right','left','bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 10}
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton} accessibilityLabel="Go back">
              <Ionicons name="arrow-back" size={24} color="#1A1D1F" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('HelpScreen')} style={styles.iconButton} accessibilityLabel="Help">
              <Ionicons name="help-circle-outline" size={24} color="#1A1D1F" />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <View style={styles.content}>
            <Text style={styles.title}>Reset password</Text>
            <Text style={styles.subtitle}>
              We’ll email you a temporary password and a link to set a new password.
            </Text>

            <Text style={styles.label}>Enter your email</Text>
            <View style={[styles.inputWrapper, { borderColor: isFocused ? '#00b14f' : '#E5E7EB', borderWidth: 1.5 }]}>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder="example@email.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={() => { if (valid && !loading) sendEmailOtp(); }}
              />
              {email.length > 0 && (
                <TouchableOpacity
                  onPress={handleClear}
                  style={styles.clearButton}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close-circle" size={20} color="#aaa" />
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity onPress={() => navigation.navigate('ResetPasswordNumber')}>
              <Text style={styles.link}>Use mobile number instead</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        <View style={styles.bottomSticky}>
          <TouchableOpacity
            style={valid && !loading ? styles.submitButton : styles.submitButtonDisabled}
            onPress={sendEmailOtp}
            disabled={!valid || loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={valid ? styles.submitButtonText : styles.submitTextDisabled}>Next</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default ResetPasswordScreen;

// …styles unchanged…
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa', paddingHorizontal: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  iconButton: { padding: 8, justifyContent: 'center', alignItems: 'center' },
  content: { flex: 1, paddingHorizontal: 8, marginTop: -5 },
  title: { fontSize: 26, fontWeight: '700', color: '#1A1D1F', marginBottom: 25, lineHeight: 38 },
  subtitle: { fontSize: 15, color: '#666', marginBottom: 24 },
  label: { fontSize: 14, marginBottom: 6, color: '#333' },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', paddingHorizontal: 15, paddingVertical: 5, borderRadius: 12, marginBottom: 12 },
  input: { flex: 1, fontSize: 16, color: '#1A1D1F', fontWeight: '400' },
  clearButton: { paddingLeft: 10 },
  link: { color: '#007bff', fontSize: 14, marginTop: 10, fontWeight: 'bold', opacity: 0.9 },
  bottomSticky: { paddingHorizontal: 24, paddingBottom: Platform.OS === 'android' ? 20 : 20, borderRadius: 15, marginBottom: 8 },
  submitButton: { backgroundColor: '#00b14f', paddingVertical: 16, borderRadius: 30, alignItems: 'center', justifyContent: 'center', width: '100%', marginTop: 10 },
  submitButtonDisabled: { backgroundColor: '#eee', paddingVertical: 16, borderRadius: 30, alignItems: 'center', justifyContent: 'center', width: '100%', marginTop: 10 },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  submitTextDisabled: { color: '#aaa', fontSize: 16, fontWeight: '600' },
});
