// screens/food/TwoFactorPromptScreen.js
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator,
  Alert, KeyboardAvoidingView, Platform
} from 'react-native';
import { useNavigation, useRoute, CommonActions } from '@react-navigation/native';
import { Ionicons, Feather } from '@expo/vector-icons';

// TODO: inject your auth header (bearer) and API base
const API_BASE = '<YOUR_API_BASE>'; // e.g., https://api.example.com
const authHeaders = () => ({ Authorization: 'Bearer <token>', 'Content-Type': 'application/json' });

export default function TwoFactorPromptScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const nextRoute = route.params?.next || 'GrabMerchantHomeScreen';

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);

  const methods = useMemo(() => {
    const list = [];
    if (status?.email?.enabled) list.push({ key: 'email', label: `Email (${status.email.masked || ''})` });
    if (status?.sms?.enabled)   list.push({ key: 'sms',   label: `SMS (${status.sms.masked || ''})` });
    return list;
  }, [status]);

  const [method, setMethod] = useState(null);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [code, setCode] = useState('');
  const [errorText, setErrorText] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(0);
  const codeRef = useRef(null);

  // Load available methods
  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/2fa/status`, { headers: authHeaders() });
      if (!r.ok) throw new Error('Failed to fetch 2FA status');
      const j = await r.json();
      setStatus(j);
      // pick default or first available
      const defaultKey = j?.default_method;
      if (defaultKey && j[defaultKey]?.enabled) setMethod(defaultKey);
      else if (j?.email?.enabled) setMethod('email');
      else if (j?.sms?.enabled) setMethod('sms');
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not load 2FA methods');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // handle resend timer
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setInterval(() => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [secondsLeft]);

  const sendCode = async () => {
    if (!method) return;
    setSending(true);
    setErrorText('');
    try {
      const r = await fetch(`${API_BASE}/2fa/${method}/send`, {
        method: 'POST',
        headers: authHeaders(),
      });
      const body = await (async () => {
        try { return await r.json(); } catch { return {}; }
      })();
      if (!r.ok) throw new Error(body?.error || `Failed to send ${method.toUpperCase()} code`);
      // start cooldown timer (prefer server hint)
      const serverCooldown = Number(body?.retry_after_seconds || 0);
      setSecondsLeft(serverCooldown > 0 ? serverCooldown : 30);
      // focus code field
      setTimeout(() => codeRef.current?.focus?.(), 100);
      Alert.alert('Code sent', `Check your ${method === 'email' ? 'email inbox' : 'phone'} for the code.`);
    } catch (e) {
      setErrorText(e.message || 'Failed to send code');
    } finally {
      setSending(false);
    }
  };

  const verifyCode = async () => {
    if (!method || !code) return;
    setVerifying(true);
    setErrorText('');
    try {
      const r = await fetch(`${API_BASE}/2fa/${method}/verify`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ code: code.trim() }),
      });
      const body = await (async () => {
        try { return await r.json(); } catch { return {}; }
      })();
      if (!r.ok) {
        const msg = body?.error || 'Invalid or expired code';
        setErrorText(msg);
        return;
      }

      // If your backend returns an upgraded token, store it here:
      // if (body.access_token) await SecureStore.setItemAsync('auth_token', body.access_token);

      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: nextRoute, params: { openTab: 'Home', nonce: Date.now() } }],
        })
      );
    } catch (e) {
      setErrorText(e.message || 'Verification failed');
    } finally {
      setVerifying(false);
    }
  };

  const canResend = secondsLeft <= 0 && !sending && !verifying;
  const canVerify = code.trim().length >= 6 && !verifying;

  if (loading) {
    return (
      <View style={S.center}>
        <ActivityIndicator />
        <Text style={{ marginTop: 8, color: '#6b7280' }}>Loading 2FA…</Text>
      </View>
    );
  }

  if (!methods.length) {
    return (
      <View style={S.center}>
        <Text style={{ fontWeight: '700' }}>No 2FA methods enabled</Text>
        <Text style={{ color: '#6b7280', marginTop: 6, textAlign: 'center', paddingHorizontal: 24 }}>
          Please enable Email or SMS 2FA in Security & Privacy settings.
        </Text>
        <TouchableOpacity style={[S.btn, { marginTop: 16 }]} onPress={() => navigation.goBack()}>
          <Text style={S.btnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#fff' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.iconBtn}>
          <Icon name="arrow-back" size={22} color="#0f172a" />
        </TouchableOpacity>
        <Text style={S.headerTitle}>Two-Factor Verification</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={{ padding: 16 }}>
        <Text style={S.label}>Choose where to receive your code</Text>

        {/* Method selector */}
        <View style={S.segment}>
          {methods.map((m) => (
            <TouchableOpacity
              key={m.key}
              style={[S.segmentItem, method === m.key && S.segmentItemActive]}
              onPress={() => { setMethod(m.key); setCode(''); setErrorText(''); }}
              disabled={sending || verifying}
            >
              <Text style={[S.segmentText, method === m.key && S.segmentTextActive]}>{m.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Send / Resend */}
        <TouchableOpacity
          style={[S.btn, (!canResend) && { opacity: 0.6 }]}
          disabled={!canResend}
          onPress={sendCode}
        >
          <Text style={S.btnText}>{secondsLeft > 0 ? `Resend in ${secondsLeft}s` : 'Send code'}</Text>
        </TouchableOpacity>

        {/* Code input */}
        <Text style={[S.label, { marginTop: 16 }]}>Enter 6-digit code</Text>
        <View style={S.inputWrap}>
          <TextInput
            ref={codeRef}
            style={S.input}
            keyboardType="number-pad"
            placeholder="••••••"
            value={code}
            onChangeText={setCode}
            maxLength={6}
            editable={!verifying}
            returnKeyType="done"
            onSubmitEditing={() => canVerify && verifyCode()}
          />
        </View>

        {!!errorText && <Text style={S.error}>{errorText}</Text>}

        {/* Verify */}
        <TouchableOpacity
          style={[S.btnPrimary, (!canVerify) && { opacity: 0.6 }]}
          disabled={!canVerify}
          onPress={verifyCode}
        >
          {verifying ? <ActivityIndicator color="#fff" /> : <Text style={S.btnPrimaryText}>Verify</Text>}
        </TouchableOpacity>

        {/* Backup/other methods (optional links) */}
        <View style={{ marginTop: 14, alignItems: 'center' }}>
          <TouchableOpacity onPress={() => Alert.alert('Backup code', 'Handle backup code entry on a separate screen.')}>
            <Text style={S.link}>Use a backup code</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const S = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  header: {
    minHeight: 52, paddingHorizontal: 12, paddingBottom: 8,
    flexDirection: 'row', alignItems: 'center',
    borderBottomWidth: 1, borderBottomColor: '#e5e7eb', backgroundColor: '#fff',
  },
  iconBtn: { height: 40, width: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: '#0f172a' },

  label: { fontSize: 13, color: '#64748b', marginBottom: 8 },
  segment: { flexDirection: 'row', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, overflow: 'hidden', marginBottom: 12 },
  segmentItem: { flex: 1, paddingVertical: 12, alignItems: 'center', backgroundColor: '#f8fafc' },
  segmentItemActive: { backgroundColor: '#e9fcf6', borderColor: '#16a34a' },
  segmentText: { fontWeight: '600', color: '#0f172a' },
  segmentTextActive: { color: '#065f46' },

  btn: { marginTop: 4, backgroundColor: '#f1f5f9', borderColor: '#e5e7eb', borderWidth: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  btnText: { color: '#0f172a', fontWeight: '700' },

  inputWrap: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, height: 48, justifyContent: 'center' },
  input: { fontSize: 16, letterSpacing: 4 },

  error: { color: '#DC2626', fontSize: 13, fontWeight: '600', marginTop: 8 },

  btnPrimary: { backgroundColor: '#16a34a', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 14 },
  btnPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  link: { color: '#007AFF', fontWeight: '600' },
});
