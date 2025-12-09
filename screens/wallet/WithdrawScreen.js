// screens/wallet/WithdrawScreen.js

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
import { WITHDRAW_ENDPOINT as ENV_WITHDRAW, WALLET_ENDPOINT as ENV_WALLET } from '@env';

const { width } = Dimensions.get('window');
const money = (n, c = 'Nu') => `${c}. ${Number(n ?? 0).toFixed(2)}`;

// Grab-like palette (same as Wallet/AddMoney)
const G = {
  grab: '#00B14F',
  grab2: '#00C853',
  text: '#0F172A',
  sub: '#6B7280',
  bg: '#F6F7F9',
  line: '#E5E7EB',
  danger: '#EF4444',
  ok: '#10B981',
  warn: '#F59E0B',
  white: '#ffffff',
  slate: '#0F172A',
};

// ─────────── Auth grace (keeps biometrics skipped during short window) ───────────
const AUTH_GRACE_SEC = 180; // 3 minutes (match WalletScreen)
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

export default function WithdrawScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();

  // From route if provided for immediate validation
  const initialBalance = Number(route?.params?.balance ?? 0);

  const [userId, setUserId] = useState(route?.params?.userId ?? '');
  const [walletId, setWalletId] = useState(route?.params?.walletId ?? '');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [balance, setBalance] = useState(isNaN(initialBalance) ? 0 : initialBalance);
  const [loading, setLoading] = useState(false);
  const [loadingBalance, setLoadingBalance] = useState(false);

  const headerTopPad = Math.max(insets.top, 8) + 18;
  const primary = G.grab;

  // Sync walletId from route params
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

      // If there was no param but a grace exists already, keep it; else start one
      if (!(skip && passedUntil > 0)) {
        const active = await isAuthGraceActive();
        if (!active) {
          // Small safety cushion: start a fresh short grace so we never prompt here
          await setAuthGrace(90);
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
        // If less than a minute remains, extend it so user can finish flow comfortably
        if (remaining < 60_000) {
          await setAuthGrace(120); // extend by 2 minutes
        }
      })();
      return () => { alive = false; };
    }, [])
  );

  useEffect(() => {
    (async () => {
      // Get user id if not passed in
      if (!userId) {
        const keysToTry = ['user_login', 'customer_login', 'merchant_login'];
        for (const k of keysToTry) {
          try {
            const raw = await SecureStore.getItemAsync(k);
            if (!raw) continue;
            const parsed = JSON.parse(raw);
            const id = parsed?.user_id ?? parsed?.id;
            if (id) { setUserId(String(id)); break; }
          } catch {}
        }
      }
    })();
  }, [userId]);

  // Optional: fetch real balance if we didn't get one via route
  const fetchBalance = useCallback(async (uid) => {
    try {
      if (!uid) return;
      const raw = String(ENV_WALLET || '').trim();
      if (!raw) return;
      setLoadingBalance(true);
      const url = raw.includes('{user_id}')
        ? raw.replace('{user_id}', String(uid))
        : `${raw}${raw.includes('?') ? '&' : '?'}user_id=${encodeURIComponent(String(uid))}`;
      const res = await fetch(url);
      const isJson = (res.headers.get('content-type') || '').includes('application/json');
      const data = isJson ? await res.json() : await res.text();
      if (!res.ok) return;
      const w = (data?.data ?? data?.wallet ?? data) || {};
      const bal = Number(w?.balance ?? w?.wallet_balance ?? 0);
      if (!isNaN(bal)) setBalance(bal);
    } catch {}
    finally { setLoadingBalance(false); }
  }, []);

  useEffect(() => {
    if (!initialBalance && userId) fetchBalance(userId);
  }, [initialBalance, userId, fetchBalance]);

  const setPreset = useCallback((v) => {
    setAmount(String(v));
  }, []);

  const validateAmount = useCallback(() => {
    const n = Number(amount);
    if (!amount || isNaN(n)) return 'Enter a valid amount';
    if (n <= 0) return 'Amount must be greater than 0';
    // Soft guard if we know the balance
    if (balance > 0 && n > balance) return `Amount exceeds available balance (${money(balance)}).`;
    return null;
  }, [amount, balance]);

  async function handleWithdraw() {
    const err = validateAmount();
    if (err) { Alert.alert('Withdraw', err); return; }
    if (!userId) { Alert.alert('Withdraw', 'Missing user session. Please sign in again.'); return; }

    setLoading(true);
    try {
      const url = String(ENV_WITHDRAW || '').trim();
      if (!url) throw new Error('WITHDRAW_ENDPOINT missing in .env');

      // Backend still uses user_id; walletId is for display only
      const payload = {
        user_id: Number(userId),
        amount: Number(amount),
        note: note?.trim() || undefined,
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const isJson = (res.headers.get('content-type') || '').includes('application/json');
      const data = isJson ? await res.json() : await res.text();

      if (!res.ok) {
        const msg = (isJson && (data?.message || data?.error)) || String(data);
        throw new Error(msg || 'Withdrawal failed.');
      }

      Alert.alert('Success', `Withdrew ${money(amount)} from your wallet.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert('Withdraw', e.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['left','right','bottom']}>
      {/* Header */}
      <View style={[styles.headerBar, { paddingTop: headerTopPad }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color={G.slate} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Withdraw</Text>
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
              <Ionicons name="arrow-down-circle-outline" size={28} color={G.grab} />
            </View>
            <Text style={styles.title}>Withdraw to your bank or mobile wallet</Text>
            <Text style={styles.sub}>
              Enter an amount to withdraw from your Wallet. {loadingBalance ? 'Checking balance…' : ''}
            </Text>
            {Boolean(balance) && (
              <Text style={styles.balanceBadge}>Available: {money(balance)}</Text>
            )}
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

          {/* Optional note / reference */}
          <View style={[styles.field, { marginTop: 10 }]}>
            <Text style={styles.label}>Reference (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Withdraw to BoB account"
              value={note}
              onChangeText={setNote}
              maxLength={60}
            />
          </View>

          <TouchableOpacity
            disabled={loading}
            onPress={handleWithdraw}
            activeOpacity={0.9}
            style={[
              styles.primaryBtnFilled,
              {
                backgroundColor: loading ? G.grab2 : primary,
                opacity: loading ? 0.9 : 1,
              },
            ]}
          >
            {loading ? (
              <ActivityIndicator color={G.white} />
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="card-outline" size={18} color={G.white} style={{ marginRight: 8 }} />
                <Text style={styles.primaryBtnTextFilled}>WITHDRAW</Text>
              </View>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: G.bg },

  // Header
  headerBar: {
    minHeight: 52,
    paddingHorizontal: 12,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomColor: G.line,
    borderBottomWidth: 1,
    backgroundColor: G.white,
  },
  backBtn: {
    height: 40,
    width: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: G.slate,
  },

  infoCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: G.line,
    backgroundColor: G.white,
    marginBottom: 14,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8FFF1',
    borderWidth: 1,
    borderColor: '#D1FAE5',
    marginBottom: 8,
  },
  title: {
    fontSize: width > 400 ? 18 : 16,
    fontWeight: '800',
    color: G.slate,
  },
  sub: {
    marginTop: 6,
    color: G.sub,
    lineHeight: 20,
  },
  balanceBadge: {
    marginTop: 8,
    fontWeight: '800',
    color: G.slate,
  },

  field: { marginTop: 16 },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: G.slate,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: G.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: G.slate,
    backgroundColor: G.white,
  },
  readonlyBox: {
    borderWidth: 1,
    borderColor: G.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: G.sub,
    backgroundColor: '#F9FAFB',
  },
  hint: {
    fontSize: 12,
    color: G.sub,
    marginTop: 6,
  },

  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  presetBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    backgroundColor: G.white,
  },
  presetText: {
    fontWeight: '700',
    color: G.slate,
  },

  primaryBtnFilled: {
    marginTop: 18,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  primaryBtnTextFilled: {
    fontSize: width > 400 ? 16 : 15,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: G.white,
  },
});
