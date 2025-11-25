// screens/wallet/AddMoneyScreen.js

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
import { ADD_MONEY_ENDPOINT as ENV_ADD_MONEY } from '@env';

const { width } = Dimensions.get('window');
const money = (n, c = 'Nu') => `${c}. ${Number(n ?? 0).toFixed(2)}`;

// ─────────── Auth grace (keeps biometrics skipped during short window) ───────────
const AUTH_GRACE_SEC = 180; // match WalletScreen/WithdrawScreen (3 minutes)
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

export default function AddMoneyScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();

  const [userId, setUserId] = useState(route?.params?.userId ?? '');
  const [walletId, setWalletId] = useState(route?.params?.walletId ?? ''); // ⬅️ NEW
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);

  const headerTopPad = Math.max(insets.top, 8) + 18;
  const primary = '#f97316';

  // Sync walletId from params if it changes
  useEffect(() => {
    if (route?.params?.walletId) {
      setWalletId(String(route.params.walletId));
    }
  }, [route?.params?.walletId]);

  // ── Respect grace from WalletScreen (skipBiometric + authGraceUntil)
  useEffect(() => {
    (async () => {
      const skip = !!route?.params?.skipBiometric;
      const passedUntil = Number(route?.params?.authGraceUntil || 0);

      // If Wallet passed a valid grace, persist it so any global guards also skip
      if (skip && passedUntil > Date.now()) {
        await setAuthGraceUntil(passedUntil);
      }

      // If no param or expired, ensure at least a short grace so we never prompt here
      if (!(skip && passedUntil > 0)) {
        const active = await isAuthGraceActive();
        if (!active) {
          await setAuthGrace(90); // quick cushion
        }
      }
    })();
    // run once on mount
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

  // Auto-detect user_id from login if not passed
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

  const setPreset = useCallback((v) => {
    setAmount(String(v));
  }, []);

  const validateAmount = useCallback(() => {
    const n = Number(amount);
    if (!amount || isNaN(n)) return 'Enter a valid amount';
    if (n <= 0) return 'Amount must be greater than 0';
    return null;
  }, [amount]);

  async function handleAddMoney() {
    const err = validateAmount();
    if (err) { Alert.alert('Add Money', err); return; }
    if (!userId) { Alert.alert('Add Money', 'Missing user session. Please sign in again.'); return; }

    setLoading(true);
    try {
      const url = String(ENV_ADD_MONEY || '').trim();
      // if (!url) throw new Error('ADD_MONEY_ENDPOINT missing in .env');
      if (!url) throw new Error('Server configuration error.');
      // Backend is still using user_id; walletId is just for display
      const payload = { user_id: Number(userId), amount: Number(amount) };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const isJson = (res.headers.get('content-type') || '').includes('application/json');
      const data = isJson ? await res.json() : await res.text();

      if (!res.ok) {
        const msg = (isJson && (data?.message || data?.error)) || String(data);
        throw new Error(msg || 'Payment initialization failed.');
      }

      Alert.alert('Success', `Added ${money(amount)} to your wallet.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert('Add Money', e.message || 'Something went wrong.');
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
        <Text style={styles.headerTitle}>Add Money</Text>
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
              <Ionicons name="cash-outline" size={28} color="#16a34a" />
            </View>
            <Text style={styles.title}>Top up your wallet</Text>
            <Text style={styles.sub}>
              Use quick presets or enter a custom amount. Money becomes available instantly after success.
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
              {[50, 100, 200, 500, 1000].map((v) => (
                <TouchableOpacity key={v} style={styles.presetBtn} onPress={() => setPreset(v)}>
                  <Text style={styles.presetText}>{money(v)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.hint}>Minimum 1.00 Nu</Text>
          </View>

          {/* Wallet ID (readonly) */}
          <View style={[styles.field, { marginTop: 10 }]}>
            <Text style={styles.label}>Wallet ID</Text>
            <Text style={styles.readonlyBox}>
              {walletId ? String(walletId) : 'Linked to your account'}
            </Text>
          </View>

          <TouchableOpacity
            disabled={loading}
            onPress={handleAddMoney}
            activeOpacity={0.9}
            style={[
              styles.primaryBtnFilled,
              { backgroundColor: loading ? '#fb923c' : primary, opacity: loading ? 0.9 : 1 },
            ]}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="add-circle-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.primaryBtnTextFilled}>ADD MONEY</Text>
              </View>
            )}
          </TouchableOpacity>

          <Text style={styles.smallNote}>
            By continuing, you authorize this top-up to your Wallet.
          </Text>
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
    backgroundColor: '#f0fdf4',
    borderWidth: 1, borderColor: '#dcfce7',
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

  smallNote: { marginTop: 10, color: '#64748b', fontSize: 12, textAlign: 'center' },
});
