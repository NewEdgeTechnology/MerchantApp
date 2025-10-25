// screens/food/SendToFriendScreen.js

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { SEND_TO_FRIEND_ENDPOINT as ENV_SEND } from '@env';

const { width } = Dimensions.get('window');
const money = (n, c = 'Nu') => `${c}. ${Number(n ?? 0).toFixed(2)}`;

// ─────────── Auth grace (keeps biometrics skipped during short window) ───────────
const AUTH_GRACE_SEC = 180; // 3 minutes
const KEY_WALLET_AUTH_GRACE = 'wallet_auth_grace_until';

async function setAuthGrace(seconds = AUTH_GRACE_SEC) {
  const until = Date.now() + seconds * 1000;
  try { await SecureStore.setItemAsync(KEY_WALLET_AUTH_GRACE, String(until)); } catch {}
  return until;
}
async function setAuthGraceUntil(untilTs) {
  try { await SecureStore.setItemAsync(KEY_WALLET_AUTH_GRACE, String(untilTs)); } catch {}
  return untilTs;
}
async function getAuthGraceUntil() {
  try {
    const v = await SecureStore.getItemAsync(KEY_WALLET_AUTH_GRACE);
    return Number(v || 0);
  } catch { return 0; }
}
async function isAuthGraceActive() {
  const until = await getAuthGraceUntil();
  return until && Date.now() < until;
}

export default function SendToFriendScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();

  const [userId, setUserId] = useState(route?.params?.userId ?? '');
  const [recipient, setRecipient] = useState(route?.params?.recipient ?? '');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  const headerTopPad = Math.max(insets.top, 8) + 18;
  const primary = '#f97316';

  // ── Respect grace from WalletScreen (skipBiometric + authGraceUntil)
  useEffect(() => {
    (async () => {
      const skip = !!route?.params?.skipBiometric;
      const passedUntil = Number(route?.params?.authGraceUntil || 0);

      if (skip && passedUntil > Date.now()) {
        await setAuthGraceUntil(passedUntil);
      }

      if (!(skip && passedUntil > 0)) {
        const active = await isAuthGraceActive();
        if (!active) {
          await setAuthGrace(90); // cushion so no prompt here
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── While this screen is focused, keep the grace "fresh"
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        if (!alive) return;
        const nowGrace = await getAuthGraceUntil();
        const remaining = nowGrace - Date.now();
        if (remaining < 60_000) {
          await setAuthGrace(120); // extend by 2 minutes
        }
      })();
      return () => { alive = false; };
    }, [])
  );

  useEffect(() => {
    (async () => {
      if (userId) return;
      const keysToTry = ['user_login', 'customer_login', 'merchant_login'];
      for (const k of keysToTry) {
        try {
          const raw = await SecureStore.getItemAsync(k);
          if (!raw) continue;
          const parsed = JSON.parse(raw);
          const id = parsed?.user_id ?? parsed?.id;
          if (id) { setUserId(String(id)); return; }
        } catch {}
      }
    })();
  }, [userId]);

  const setPreset = useCallback((v) => setAmount(String(v)), []);

  const validate = useCallback(() => {
    const n = Number(amount);
    if (!recipient || String(recipient).trim().length < 3) return 'Enter a valid recipient (phone or user ID).';
    if (!amount || isNaN(n)) return 'Enter a valid amount.';
    if (n <= 0) return 'Amount must be greater than 0.';
    if (!userId) return 'Missing user session. Please sign in again.';
    return null;
  }, [recipient, amount, userId]);

  function buildPayload() {
    const n = Number(amount);
    const rec = String(recipient).trim();

    const payload = {
      user_id: Number(userId),   // sender
      amount: n,
      note: note?.trim() || undefined,
    };

    if (/^\d+$/.test(rec)) {
      payload.to_user_id = Number(rec);
      payload.to_phone = rec;
    } else {
      payload.to_phone = rec;
    }
    return payload;
  }

  async function handleSend() {
    const err = validate();
    if (err) { Alert.alert('Send Money', err); return; }

    setLoading(true);
    try {
      const url = String(ENV_SEND || '').trim();
      if (!url) throw new Error('SEND_TO_FRIEND_ENDPOINT missing in .env');

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      });

      const isJson = (res.headers.get('content-type') || '').includes('application/json');
      const data = isJson ? await res.json() : await res.text();

      if (!res.ok) {
        const msg = (isJson && (data?.message || data?.error)) || String(data);
        throw new Error(msg || 'Transfer failed.');
      }

      Alert.alert('Success', `Sent ${money(amount)} to ${recipient}.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert('Send Money', e.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['left','right','bottom']}>
      {/* Header */}
      <View style={[styles.headerBar, { paddingTop: headerTopPad }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Send to Friend</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 24 + insets.bottom }}>
          <View style={styles.infoCard}>
            <View style={styles.iconWrap}>
              <Ionicons name="paper-plane-outline" size={28} color="#0ea5e9" />
            </View>
            <Text style={styles.title}>Send money instantly</Text>
            <Text style={styles.sub}>
              Enter your friend’s phone or user ID and an amount to transfer from your Wallet.
            </Text>
          </View>

          {/* Recipient */}
          <View style={styles.field}>
            <Text style={styles.label}>Recipient (phone or user ID)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., 17345678 or 42"
              placeholderTextColor="#94a3b8"
              value={recipient}
              onChangeText={setRecipient}
              keyboardType="default"
              returnKeyType="next"
              maxLength={32}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.hint}>
              You can paste a phone number or their user ID.
            </Text>
          </View>

          {/* Amount */}
          <View style={styles.field}>
            <Text style={styles.label}>Amount (Nu)</Text>
            <TextInput
              style={styles.input}
              placeholder="0.00"
              placeholderTextColor="#94a3b8"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              returnKeyType="done"
              maxLength={10}
            />
            <View style={styles.presetRow}>
              {[50, 100, 200, 500].map((v) => (
                <TouchableOpacity key={v} style={styles.presetBtn} onPress={() => setPreset(v)}>
                  <Text style={styles.presetText}>{money(v)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Note */}
          <View style={[styles.field, { marginTop: 10 }]}>
            <Text style={styles.label}>Note (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="Say thanks or add a reference"
              value={note}
              onChangeText={setNote}
              maxLength={60}
            />
          </View>

          {/* Sender */}
          <View style={[styles.field, { marginTop: 10 }]}>
            <Text style={styles.label}>Your User ID</Text>
            <Text style={styles.readonlyBox}>{userId ? String(userId) : 'Detecting…'}</Text>
          </View>

          <TouchableOpacity
            disabled={loading}
            onPress={handleSend}
            activeOpacity={0.9}
            style={[styles.primaryBtnFilled, { backgroundColor: loading ? '#fb923c' : primary, opacity: loading ? 0.9 : 1 }]}
          >
            {loading ? <ActivityIndicator color="#fff" /> : (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="paper-plane-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.primaryBtnTextFilled}>SEND MONEY</Text>
              </View>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },

  // Header
  headerBar: {
    minHeight: 52,
    paddingHorizontal: 12,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomColor: '#e5e7eb',
    borderBottomWidth: 1,
    backgroundColor: '#fff',
  },
  backBtn: { height: 40, width: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: '#0f172a' },

  infoCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    backgroundColor: '#ffffff',
    marginBottom: 14,
  },
  iconWrap: {
    width: 48, height: 48, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#eff6ff',
    borderWidth: 1, borderColor: '#dbeafe',
    marginBottom: 8,
  },
  title: { fontSize: width > 400 ? 18 : 16, fontWeight: '800', color: '#0f172a' },
  sub: { marginTop: 6, color: '#64748b', lineHeight: 20 },

  field: { marginTop: 16 },
  label: { fontSize: 13, fontWeight: '700', color: '#0f172a', marginBottom: 8 },
  input: {
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 12, fontSize: 16, color: '#0f172a',
  },
  readonlyBox: {
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 12, fontSize: 15, color: '#6b7280',
    backgroundColor: '#f9fafb',
  },
  hint: { fontSize: 12, color: '#64748b', marginTop: 6 },

  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  presetBtn: {
    paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: 12, borderWidth: 1, borderColor: '#f1f5f9', backgroundColor: '#fff',
  },
  presetText: { fontWeight: '700', color: '#0f172a' },

  primaryBtnFilled: {
    marginTop: 18,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  primaryBtnTextFilled: { fontSize: width > 400 ? 16 : 15, fontWeight: '800', letterSpacing: 0.6, color: '#fff' },
});
