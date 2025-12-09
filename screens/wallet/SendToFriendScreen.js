import React, { useEffect, useState, useCallback, useRef } from 'react';
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
  Keyboard,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { HAS_TPIN_ENDPOINT as ENV_HAS_TPIN } from '@env';

const { width } = Dimensions.get('window');
const money = (n, c = 'Nu') => `${c}. ${Number(n ?? 0).toFixed(2)}`;

// Grab-like palette (same as Wallet/AddMoney/Withdraw)
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
const AUTH_GRACE_SEC = 180; // 3 minutes
const KEY_WALLET_AUTH_GRACE = 'wallet_auth_grace_until';

async function setAuthGrace(seconds = AUTH_GRACE_SEC) {
  const until = Date.now() + seconds * 1000;
  try {
    await SecureStore.setItemAsync(KEY_WALLET_AUTH_GRACE, String(until));
  } catch {}
  return until;
}
async function setAuthGraceUntil(untilTs) {
  try {
    await SecureStore.setItemAsync(KEY_WALLET_AUTH_GRACE, String(untilTs));
  } catch {}
  return untilTs;
}
async function getAuthGraceUntil() {
  try {
    const v = await SecureStore.getItemAsync(KEY_WALLET_AUTH_GRACE);
    return Number(v || 0);
  } catch {
    return 0;
  }
}
async function isAuthGraceActive() {
  const until = await getAuthGraceUntil();
  return until && Date.now() < until;
}

// Build URL for HAS_TPIN endpoint
// ENV_HAS_TPIN should be like: https://grab.newedge.bt/wallet/wallet/{user_id}/has-tpin
function buildHasTpinUrl(userId) {
  const raw = String(ENV_HAS_TPIN || '').trim();
  if (!raw || !userId) return null;

  if (raw.includes('{user_id}')) {
    return raw.replace('{user_id}', String(userId));
  }
  const sep = raw.includes('?') ? '&' : '?';
  return `${raw}${sep}user_id=${encodeURIComponent(String(userId))}`;
}

export default function SendToFriendScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();

  // Sender
  const [userId, setUserId] = useState(
    route?.params?.userId ? String(route?.params?.userId) : ''
  );
  const [senderWalletId, setSenderWalletId] = useState(
    route?.params?.senderWalletId ?? route?.params?.walletId ?? null
  );

  // Receiver (friend)
  const [recipient, setRecipient] = useState(route?.params?.recipient ?? ''); // Wallet ID of recipient
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  // For keyboard-aware scrolling
  const scrollRef = useRef(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const headerTopPad = Math.max(insets.top, 8) + 18;
  const primary = G.grab;

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
      return () => {
        alive = false;
      };
    }, [])
  );

  // Resolve userId from secure storage if not passed
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
          if (id) {
            setUserId(String(id));
            return;
          }
        } catch {}
      }
    })();
  }, [userId]);

  // Keyboard listeners to scroll to bottom when keyboard opens
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      setKeyboardHeight(e.endCoordinates?.height || 0);
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollToEnd({ animated: true });
        }
      }, 150);
    });

    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const setPreset = useCallback((v) => setAmount(String(v)), []);

  const validate = useCallback(() => {
    const n = Number(amount);
    const rec = String(recipient).trim();

    if (!rec || rec.length < 4) return 'Enter a valid Wallet ID of your friend.';
    if (!amount || Number.isNaN(n)) return 'Enter a valid amount.';
    if (n <= 0) return 'Amount must be greater than 0.';
    if (!userId) return 'Missing user session. Please sign in again.';
    return null;
  }, [recipient, amount, userId]);

  function buildPayload() {
    const n = Number(amount);
    const rec = String(recipient).trim();

    const payload = {
      user_id: Number(userId),
      amount: n,
      to_wallet_id: rec, // receiver wallet id
      note: note?.trim() || undefined,
    };

    return payload;
  }

  // Check TPIN status using has_tpin (true/false)
  async function checkHasTpin(uid) {
    const url = buildHasTpinUrl(uid);
    if (!url) {
      throw new Error('HAS_TPIN_ENDPOINT missing or invalid.');
    }

    const res = await fetch(url, { method: 'GET' });
    const contentType = res.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const data = isJson ? await res.json() : null;

    // Expected:
    // { "success": true, "user_id": 13, "has_tpin": false }
    if (!res.ok || !data || data.success !== true) {
      return { hasTpin: false };
    }

    return { hasTpin: data.has_tpin === true };
  }

  async function handleSend() {
    const err = validate();
    if (err) {
      Alert.alert('Send Money', err);
      return;
    }

    setLoading(true);
    try {
      const payload = buildPayload();

      // Secure: sender wallet must come from navigation (WalletScreen)
      const finalSenderWalletId =
        senderWalletId ??
        route?.params?.senderWalletId ??
        route?.params?.walletId ??
        null;

      if (!finalSenderWalletId) {
        Alert.alert(
          'Wallet',
          'Could not determine your Wallet ID. Please open Wallet once and try again.'
        );
        return;
      }

      // Check if user has TPIN using has_tpin flag
      const { hasTpin } = await checkHasTpin(userId);
      const authGraceUntil = await getAuthGraceUntil();

      if (hasTpin) {
        navigation.navigate('TPinScreen', {
          payload,
          recipient,
          amount,
          sender_wallet_id: finalSenderWalletId,
          from: 'SendToFriendScreen',
          skipBiometric: true,
          authGraceUntil,
        });
      } else {
        navigation.navigate('CreateTPinScreen', {
          walletId: finalSenderWalletId,
          skipBiometric: true,
          authGraceUntil,
        });
      }
    } catch (e) {
      Alert.alert('Send Money', e?.message || 'Failed to check TPIN status.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      {/* Header */}
      <View style={[styles.headerBar, { paddingTop: headerTopPad }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={22} color={G.slate} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Send to Friend</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: 18,
            paddingBottom: 24 + insets.bottom + keyboardHeight,
          }}
        >
          <View style={styles.infoCard}>
            <View style={styles.iconWrap}>
              <Ionicons name="paper-plane-outline" size={28} color={G.grab} />
            </View>
            <Text style={styles.title}>Send money instantly</Text>
            <Text style={styles.sub}>
              Enter your friend’s Wallet ID and an amount to transfer from your Wallet.
            </Text>
          </View>

          {/* Recipient Wallet ID */}
          <View style={styles.field}>
            <Text style={styles.label}>Recipient Wallet ID</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., NET0000002"
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
              Ask your friend to share their Wallet ID (shown in their Wallet screen).
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
                <TouchableOpacity
                  key={v}
                  style={styles.presetBtn}
                  onPress={() => setPreset(v)}
                >
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

          <TouchableOpacity
            disabled={loading}
            onPress={handleSend}
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
                <Ionicons
                  name="paper-plane-outline"
                  size={18}
                  color={G.white}
                  style={{ marginRight: 8 }}
                />
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
  sub: { marginTop: 6, color: G.sub, lineHeight: 20 },

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
  hint: { fontSize: 12, color: G.sub, marginTop: 6 },

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
  presetText: { fontWeight: '700', color: G.slate },

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
