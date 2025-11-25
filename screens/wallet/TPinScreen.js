// screens/food/TPinScreen.js

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
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import {
  SEND_TO_FRIEND_ENDPOINT as ENV_SEND,
} from '@env';
import WalletScreen from './WalletScreen';

const { width } = Dimensions.get('window');
const money = (n, c = 'Nu') => `${c}. ${Number(n ?? 0).toFixed(2)}`;

// ─────────── Auth grace (same helper as SendToFriendScreen) ───────────
const AUTH_GRACE_SEC = 180; // 3 minutes
const KEY_WALLET_AUTH_GRACE = 'wallet_auth_grace_until';

async function setAuthGrace(seconds = AUTH_GRACE_SEC) {
  const until = Date.now() + seconds * 1000;
  try { await SecureStore.setItemAsync(KEY_WALLET_AUTH_GRACE, String(until)); } catch { }
  return until;
}

async function setAuthGraceUntil(untilTs) {
  try { await SecureStore.setItemAsync(KEY_WALLET_AUTH_GRACE, String(untilTs)); } catch { }
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

export default function TPinScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();

  // From previous screen:
  const payloadFromRoute = route?.params?.payload || {};
  const recipient = route?.params?.recipient || '';
  const amount = Number(route?.params?.amount || payloadFromRoute?.amount || 0);
  const primary = '#f97316';

  // Sender's wallet ID (from WalletScreen → SendToFriendScreen → TPinScreen)
  const senderWalletId =
    route?.params?.sender_wallet_id ||
    payloadFromRoute?.sender_wallet_id ||
    route?.params?.walletId ||
    payloadFromRoute?.wallet_id ||
    null;

  const [userId, setUserId] = useState(route?.params?.userId ?? '');
  const [loading, setLoading] = useState(false);
  const [tpin, setTpin] = useState('');

  const headerTopPad = Math.max(insets.top, 8) + 18;

  // ── Respect auth grace (same pattern as SendToFriendScreen) ──
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
          await setAuthGrace(90);
        }
      }
    })();
  }, [route?.params]);

  // Resolve userId silently if not passed
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
        } catch { }
      }
    })();
  }, [userId]);

  // ─────────── helpers ───────────
  function buildPayloadWithTPin() {
    const base = payloadFromRoute || {};

    const senderId =
      senderWalletId ||
      base.sender_wallet_id ||
      base.from_wallet_id ||
      base.wallet_id ||
      null;

    const recipientId =
      base.recipient_wallet_id ||
      base.to_wallet_id ||
      base.toWalletId ||
      recipient;

    const amt = amount || base.amount;

    const payload = {
      sender_wallet_id: senderId,
      recipient_wallet_id: recipientId,
      amount: amt,          // plain number (no "Nu")
      note: base.note,
      t_pin: tpin,          // API expects `t_pin`
    };

    // If backend also needs user_id, include it (harmless extra field)
    const uid = Number(userId || base.user_id || 0);
    if (uid > 0) payload.user_id = uid;

    return payload;
  }

  // ─────────── actions ───────────

  const handleVerifyAndSend = useCallback(async () => {
    if (!senderWalletId && !payloadFromRoute?.sender_wallet_id) {
      Alert.alert('Wallet', 'Missing sender wallet. Please open Wallet again.');
      return;
    }

    const pin = String(tpin || '').trim();
    if (!pin || pin.length < 4) {
      Alert.alert('Wallet TPIN', 'Enter your 4-digit Wallet TPIN.');
      return;
    }

    const url = String(ENV_SEND || '').trim();
    if (!url) {
      Alert.alert('Wallet', 'SEND_TO_FRIEND_ENDPOINT missing in .env');
      return;
    }

    const finalPayload = buildPayloadWithTPin();

    setLoading(true);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalPayload),
      });

      const isJson = (res.headers.get('content-type') || '').includes('application/json');
      const data = isJson ? await res.json() : await res.text();

      if (!res.ok) {
        const msg = (isJson && (data?.message || data?.error)) || String(data);
        throw new Error(msg || 'Transfer failed.');
      }

      Alert.alert('Success', `Sent ${money(amount)} to ${recipient}.`, [
        {
          text: 'OK',
          onPress: () => {
            navigation.navigate(WalletScreen); // close TPIN screen
          },
        },
      ]);
    } catch (e) {
      Alert.alert('Send Money', e.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }, [tpin, amount, recipient, navigation, senderWalletId, payloadFromRoute, userId]);

  const goToChangeTPin = () => {
    navigation.navigate('ChangeTPinScreen', {
      userId: userId || null,
      walletId: senderWalletId || payloadFromRoute?.wallet_id || route?.params?.walletId || null,
    });
  };

  const goToForgotTPin = () => {
    const inferredWalletId =
      senderWalletId ||
      payloadFromRoute?.sender_wallet_id ||
      payloadFromRoute?.wallet_id ||
      route?.params?.walletId ||
      null;

    if (!inferredWalletId) {
      Alert.alert('Wallet', 'Missing wallet ID. Please open Wallet again.');
      return;
    }

    navigation.navigate('ForgotTPinScreen', {
      walletId: inferredWalletId,
      userId: userId || null,
    });
  };

  const titleByMode = 'Confirm with Wallet TPIN';
  const subByMode = 'Enter your Wallet TPIN to confirm this transfer.';

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      {/* Header */}
      <View style={[styles.headerBar, { paddingTop: headerTopPad }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={22} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Wallet TPIN</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 24 + insets.bottom }}>
          {/* Summary card */}
          <View style={styles.infoCard}>
            <View style={styles.iconWrap}>
              <Ionicons name="lock-closed-outline" size={28} color="#0ea5e9" />
            </View>
            <Text style={styles.title}>{titleByMode}</Text>
            <Text style={styles.sub}>{subByMode}</Text>

            {/* Transfer summary (if we came from SendToFriend flow) */}
            {recipient ? (
              <View style={styles.summaryBox}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Recipient Wallet ID</Text>
                  <Text style={styles.summaryValue}>{recipient}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Amount</Text>
                  <Text style={styles.summaryAmount}>{money(amount)}</Text>
                </View>
              </View>
            ) : null}
          </View>

          {/* Verify Block */}
          <View style={styles.field}>
            <Text style={styles.label}>Wallet TPIN</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your TPIN"
              placeholderTextColor="#94a3b8"
              value={tpin}
              onChangeText={setTpin}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
              returnKeyType="done"
            />
            <Text style={styles.hint}>
              This is the 4-digit TPIN you set for your Wallet.
            </Text>
          </View>

          <TouchableOpacity
            disabled={loading}
            onPress={handleVerifyAndSend}
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
                <Ionicons
                  name="checkmark-circle-outline"
                  size={18}
                  color="#fff"
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.primaryBtnTextFilled}>CONFIRM & SEND</Text>
              </View>
            )}
          </TouchableOpacity>

          <View style={styles.linksRow}>
            <TouchableOpacity onPress={goToChangeTPin} style={styles.linkBtn}>
              <Text style={styles.linkText}>Change TPIN</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={goToForgotTPin} style={styles.linkBtn}>
              <Text style={styles.linkText}>Forgot TPIN?</Text>
            </TouchableOpacity>
          </View>
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
    color: '#0f172a',
  },

  infoCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    backgroundColor: '#ffffff',
    marginBottom: 14,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#dbeafe',
    marginBottom: 8,
  },
  title: { fontSize: width > 400 ? 18 : 16, fontWeight: '800', color: '#0f172a' },
  sub: { marginTop: 6, color: '#64748b', lineHeight: 20 },

  summaryBox: {
    marginTop: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 12,
    backgroundColor: '#f9fafb',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  summaryLabel: { fontSize: 12, color: '#64748b' },
  summaryValue: { fontSize: 13, fontWeight: '600', color: '#0f172a' },
  summaryAmount: { fontSize: 15, fontWeight: '800', color: '#0f172a' },

  field: { marginTop: 16 },
  label: { fontSize: 13, fontWeight: '700', color: '#0f172a', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#0f172a',
  },
  hint: { fontSize: 12, color: '#64748b', marginTop: 6 },

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
    color: '#fff',
  },

  linksRow: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  linkBtn: {
    paddingVertical: 4,
  },
  linkText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0ea5e9',
  },
});
