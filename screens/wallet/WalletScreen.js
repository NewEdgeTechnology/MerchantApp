// screens/food/WalletScreen.js

import React, { useMemo, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  FlatList,
  ActivityIndicator,
  Alert,
  DeviceEventEmitter,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Clipboard from 'expo-clipboard';
import {
  WALLET_ENDPOINT as ENV_WALLET,
  TANSACTION_HISTORY_ENDPOINT as ENV_WALLET_TXN,
} from '@env';

const { width } = Dimensions.get('window');
const money = (n, c = '') => `${c} ${Number(n ?? 0).toFixed(1)}`;

// Masked money helper (stars + real decimals)
const maskedMoney = (n, c = 'Nu') => {
  const amt = Number(n ?? 0);
  const decimals = Math.abs(amt).toFixed(2).split('.')[1] || '00';
  return `${c}. ****.${decimals}`;
};

// ───────────────── Auth grace (no re-prompt during short window) ───────────────
const AUTH_GRACE_SEC = 180; // 3 minutes
const KEY_WALLET_AUTH_GRACE = 'wallet_auth_grace_until';

async function setAuthGrace(seconds = AUTH_GRACE_SEC) {
  const until = Date.now() + seconds * 1000;
  try {
    await SecureStore.setItemAsync(KEY_WALLET_AUTH_GRACE, String(until));
  } catch {}
  return until;
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
async function clearAuthGrace() {
  try {
    await SecureStore.deleteItemAsync(KEY_WALLET_AUTH_GRACE);
  } catch {}
}

// kept, though not used by table rows (in case you re-use later)
function iconForType(type) {
  switch (type) {
    case 'cashback': return { name: 'gift-outline', color: '#16a34a' };
    case 'payment':  return { name: 'restaurant-outline', color: '#ef4444' };
    case 'refund':   return { name: 'arrow-undo-outline', color: '#0ea5e9' };
    default:         return { name: 'receipt-outline', color: '#64748b' };
  }
}

// ───────────────── Table-style row component ───────────────
function TransactionItem({ item }) {
  const isDebit = item.drcr === 'DR' || item.amount < 0;

  return (
    <View style={styles.tableRow}>
      {/* Date */}
      <Text
        style={[styles.tableCellText, { flex: 1.1 }]}
        numberOfLines={1}
      >
        {item.dateShort}
      </Text>

      {/* Journal No. */}
      <Text
        style={[styles.tableCellText, { flex: 1.5, textAlign: 'center' }]}
        numberOfLines={1}
      >
        {item.journal}
      </Text>

      {/* Amount */}
      <Text
        style={[styles.tableCellText, { flex: 1.1, textAlign: 'right' }]}
        numberOfLines={1}
      >
        {money(Math.abs(item.amount))}
      </Text>

      {/* Dr/Cr */}
      <Text
        style={[
          styles.tableCellText,
          {
            width: 50,
            textAlign: 'right',
            fontWeight: '700',
            color: isDebit ? '#ef4444' : '#16a34a',
          },
        ]}
        numberOfLines={1}
      >
        {item.drcr}
      </Text>
    </View>
  );
}

export default function WalletScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [hasWallet, setHasWallet] = useState(false);
  const [balance, setBalance] = useState(0);
  const [promoBalance, setPromoBalance] = useState(0); // not shown yet but kept
  const [txns, setTxns] = useState([]);
  const [locked, setLocked] = useState(true);
  const [walletId, setWalletId] = useState(null);
  const [showBalance, setShowBalance] = useState(false);

  const headerTopPad = Math.max(insets.top, 8) + 18;
  const balanceColor = '#f97316';

  // Navigate helper that ensures grace is active before leaving
  const goWithGrace = useCallback(
    async (screen, params = {}) => {
      const authGraceUntil = await setAuthGrace();
      navigation.navigate(screen, {
        ...params,
        skipBiometric: true,
        authGraceUntil,
      });
    },
    [navigation]
  );

  // Action pills
  const actions = useMemo(
    () => [
      {
        key: 'withdraw',
        label: 'Withdraw',
        icon: 'card-outline',
        onPress: () => goWithGrace('WithdrawScreen', { walletId }),
      },
      {
        key: 'send',
        label: 'Send to Friend',
        icon: 'paper-plane-outline',
        onPress: () => goWithGrace('SendToFriendScreen', { walletId }),
      },
    ],
    [goWithGrace, walletId]
  );

  const resolveLogin = useCallback(async () => {
    const keysToTry = ['user_login', 'customer_login', 'merchant_login'];
    for (const k of keysToTry) {
      try {
        const raw = await SecureStore.getItemAsync(k);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        if (parsed && (parsed.user_id || parsed.id)) {
          return { ...parsed, user_id: parsed.user_id ?? parsed.id, _source: k };
        }
      } catch {}
    }
    return null;
  }, []);

  const authenticate = useCallback(async () => {
    if (await isAuthGraceActive()) {
      setLocked(false);
      return true;
    }

    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();

      const runPrompt = async () => {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Unlock Wallet',
          fallbackLabel: 'Use device passcode',
          cancelLabel: 'Cancel',
          disableDeviceFallback: false,
        });
        if (result.success) {
          setLocked(false);
          await setAuthGrace();
          return true;
        }
        setLocked(true);
        return false;
      };

      if (!hasHardware || !enrolled) {
        const ok = await runPrompt();
        return ok;
      }

      const ok = await runPrompt();
      return ok;
    } catch {
      setLocked(true);
      return false;
    }
  }, []);

  const buildWalletUrl = useCallback((userId) => {
    const raw = String(ENV_WALLET || '').trim();
    if (!raw) return null;
    if (raw.includes('{user_id}')) {
      return raw.replace('{user_id}', String(userId));
    }
    const sep = raw.includes('?') ? '&' : '?';
    return `${raw}${sep}user_id=${encodeURIComponent(String(userId))}`;
  }, []);

  const buildTxnUrl = useCallback((walletIdParam) => {
    const raw = String(ENV_WALLET_TXN || '').trim();
    if (!raw || !walletIdParam) return null;
    if (raw.includes('{wallet_id}')) {
      return raw.replace('{wallet_id}', String(walletIdParam));
    }
    const sep = raw.includes('?') ? '&' : '?';
    return `${raw}${sep}wallet_id=${encodeURIComponent(String(walletIdParam))}`;
  }, []);

  const parseWalletPayload = (payload) => {
    const w = payload?.data ?? payload ?? {};
    const bal = Number.parseFloat(String(w?.amount ?? 0)) || 0;
    const promo = Number.parseFloat(String(w?.promo_balance ?? 0)) || 0;
    const status = String(w?.status ?? '').toUpperCase();
    const id = w?.wallet_id ?? w?.id;
    return { bal, promo, status, id };
  };

  // Map transactions from history endpoint to UI list (table-style)
  const mapHistoryTxns = (payload) => {
    const list = Array.isArray(payload?.data)
      ? payload?.data
      : Array.isArray(payload)
      ? payload
      : payload?.transactions || [];
    if (!Array.isArray(list) || list.length === 0) return [];

    return list.slice(0, 100).map((t, idx) => {
      const rawAmt = t?.amount ?? t?.amt ?? 0;
      let amt = Number.parseFloat(String(rawAmt)) || 0;

      const dir = String(
        t?.direction ?? t?.tran_type ?? t?.dr_cr ?? t?.type ?? ''
      ).toUpperCase();

      if (dir.includes('DR') || dir.includes('DEBIT')) {
        amt = -Math.abs(amt);
      } else if (dir.includes('CR') || dir.includes('CREDIT')) {
        amt = Math.abs(amt);
      }

      const drcr = dir.includes('CR') ? 'CR' : 'DR';

      const lowerType = String(t?.type ?? dir ?? '').toLowerCase();
      let uiType = 'receipt';
      if (
        lowerType.includes('cashback') ||
        lowerType.includes('reward') ||
        lowerType.includes('promo')
      ) {
        uiType = 'cashback';
      } else if (lowerType.includes('refund')) {
        uiType = 'refund';
      } else if (amt < 0) {
        uiType = 'payment';
      }

      // keep original title logic
      const title =
        t?.title ||
        t?.remarks ||
        t?.description ||
        (amt < 0 ? 'Payment' : 'Received');

      const tsRaw =
        t?.created_at_local ||
        t?.created_at ||
        t?.timestamp ||
        t?.ts ||
        '';

      // Short date like 04/11/25
      let dateShort = '';
      if (tsRaw) {
        const datePart = tsRaw.split('T')[0].split(' ')[0];
        const parts = datePart.split('-');
        if (parts.length === 3) {
          const [y, m, d] = parts;
          dateShort = `${d}/${m}/${String(y).slice(-2)}`;
        } else {
          dateShort = tsRaw;
        }
      }

      const rawJournal =
        t?.journal_code ??
        t?.journal_no ??
        t?.journalNo ??
        t?.journal_number ??
        t?.journalNumber ??
        t?.journal ??
        t?.journalId ??
        t?.journal_id ??
        null;

      const journal =
        rawJournal !== undefined && rawJournal !== null
          ? String(rawJournal)
          : null;

      return {
        id: String(
          t?.id ?? t?.txn_id ?? t?.transaction_id ?? t?.transactionId ?? idx
        ),
        type: uiType,
        title,
        amount: amt,
        ts: tsRaw,
        dateShort,
        drcr,
        journal,
      };
    });
  };

  const fetchHistory = useCallback(
    async (walletIdParam) => {
      try {
        const url = buildTxnUrl(walletIdParam);
        if (!url) return null;

        const res = await fetch(url);
        const isJson = (res.headers.get('content-type') || '').includes(
          'application/json'
        );
        const payload = isJson ? await res.json() : await res.text();

        if (!res.ok) {
          const msg =
            (isJson && (payload?.message || payload?.error)) ||
            String(payload);
          throw new Error(msg || 'Failed to load transactions');
        }

        const mapped = mapHistoryTxns(payload);
        setTxns(mapped);
        return mapped;
      } catch (e) {
        console.log('Wallet history error:', e?.message);
        setTxns([]);
        return null;
      }
    },
    [buildTxnUrl]
  );

  const hydrate = useCallback(async () => {
    setLoading(true);
    try {
      const u = await resolveLogin();
      setUser(u);

      let walletFlag = !!(
        u &&
        (u.has_wallet || u.wallet_id || u.wallet_status === 'ACTIVE')
      );

      if (u?.user_id) {
        const url = buildWalletUrl(u.user_id);
        if (!url) throw new Error('WALLET_ENDPOINT missing in .env');

        const res = await fetch(url);
        const isJson = (res.headers.get('content-type') || '').includes(
          'application/json'
        );
        const payload = isJson ? await res.json() : await res.text();

        if (!res.ok) {
          if (res.status !== 404) {
            const msg =
              (isJson && (payload?.message || payload?.error)) ||
              String(payload);
            throw new Error(msg || 'Wallet fetch failed');
          }
        } else {
          const w = parseWalletPayload(payload);
          setBalance(w.bal);
          setPromoBalance(w.promo);
          setWalletId(w.id || null);
          if (w.status === 'ACTIVE' || w.id) walletFlag = true;

          if (w?.id) {
            await fetchHistory(w.id);
          } else {
            setTxns([]);
          }
        }
      }

      setHasWallet(walletFlag);

      if (!walletFlag) {
        setBalance(0);
        setPromoBalance(0);
        setTxns([]);
        setWalletId(null);
      }
    } catch (e) {
      Alert.alert('Wallet', e?.message || 'Failed to load wallet info.');
      setTxns([]);
      setWalletId(null);
    } finally {
      setLoading(false);
    }
  }, [resolveLogin, buildWalletUrl, fetchHistory]);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      (async () => {
        if (!mounted) return;
        if (await isAuthGraceActive()) {
          setLocked(false);
        } else {
          await authenticate();
        }
      })();
      return () => {
        mounted = false;
      };
    }, [authenticate])
  );

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      (async () => {
        if (mounted) await hydrate();
      })();
      return () => {
        mounted = false;
      };
    }, [hydrate])
  );

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('app:logout', async () => {
      await clearAuthGrace();
      setLocked(true);
      setUser(null);
      setHasWallet(false);
      setBalance(0);
      setPromoBalance(0);
      setTxns([]);
      setWalletId(null);
    });
    return () => sub.remove();
  }, []);

  const EmptyState = () => (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <View style={[styles.headerBar, { paddingTop: headerTopPad }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={22} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Wallet</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.emptyWrap}>
        <View style={styles.emptyIcon}>
          <Ionicons name="wallet-outline" size={36} color="#f97316" />
        </View>
        <Text style={styles.emptyTitle}>
          {user ? 'No Wallet Yet' : 'You are not signed in'}
        </Text>
        <Text style={styles.emptySub}>
          {user
            ? 'Create your Wallet to start paying, sending, and earning cashback.'
            : 'Please sign in first. If you already have an account, sign in and then create your wallet.'}
        </Text>

        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() =>
            navigation.navigate('CreateWalletScreen', {
              userId: user?.user_id ?? null,
            })
          }
          style={[styles.primaryBtnFilled, { backgroundColor: '#f97316' }]}
        >
          <Text style={styles.primaryBtnTextFilled}>CREATE WALLET</Text>
        </TouchableOpacity>

        {!user && (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => navigation.navigate('LoginScreen')}
            style={styles.secondaryBtn}
          >
            <Text style={styles.secondaryBtnText}>SIGN IN</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );

  const onCopyWalletId = useCallback(async () => {
    if (!walletId) return;
    try {
      await Clipboard.setStringAsync(String(walletId));
      Alert.alert('Copied', 'Wallet ID copied to clipboard.');
    } catch {}
  }, [walletId]);

  if (locked) {
    return (
      <SafeAreaView
        style={[styles.safe, { alignItems: 'center', justifyContent: 'center' }]}
        edges={['left', 'right', 'bottom']}
      >
        <View style={styles.lockWrap}>
          <View style={styles.lockIcon}>
            <Ionicons name="lock-closed-outline" size={36} color="#f97316" />
          </View>
          <Text style={styles.lockTitle}>Wallet Locked</Text>
          <Text style={styles.lockSub}>
            Use fingerprint or device passcode to continue.
          </Text>
          <TouchableOpacity
            onPress={authenticate}
            activeOpacity={0.9}
            style={[
              styles.primaryBtnFilled,
              { backgroundColor: '#f97316', marginTop: 16 },
            ]}
          >
            <Text style={styles.primaryBtnTextFilled}>UNLOCK</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            activeOpacity={0.8}
            style={styles.secondaryBtn}
          >
            <Text style={styles.secondaryBtnText}>GO BACK</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.safe, { alignItems: 'center', justifyContent: 'center' }]}
        edges={['left', 'right', 'bottom']}
      >
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  if (!user || !hasWallet) return <EmptyState />;

  const ListEmpty = () => (
    <View style={{ alignItems: 'center', paddingVertical: 16 }}>
      <Text style={{ color: '#64748b' }}>No transactions yet.</Text>
    </View>
  );

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
        <Text style={styles.headerTitle}>Wallet</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Body */}
      <View style={{ flex: 1 }}>
        <FlatList
          contentContainerStyle={[
            styles.listPad,
            { paddingBottom: 24 + insets.bottom },
          ]}
          data={txns}
          keyExtractor={(it, idx) => String(it?.id ?? idx)}
          ListHeaderComponent={
            <>
              {/* Balance Card */}
              <View style={[styles.card, { backgroundColor: balanceColor }]}>
                <View
                  style={[
                    styles.balanceRow,
                    { justifyContent: 'space-between' },
                  ]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons
                      name="wallet-outline"
                      size={24}
                      color="#fff"
                      style={{ marginRight: 6 }}
                    />
                    <Text style={styles.balanceLabel}>Wallet Balance</Text>
                  </View>

                  {!!walletId && (
                    <View style={styles.walletIdWrap}>
                      <Text numberOfLines={1} style={styles.walletIdText}>
                        {String(walletId)}
                      </Text>
                      <TouchableOpacity
                        onPress={onCopyWalletId}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons
                          name="copy-outline"
                          size={16}
                          color="#fff"
                        />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>

                <View
                  style={[
                    styles.balanceRow,
                    { justifyContent: 'space-between', marginTop: 6 },
                  ]}
                >
                  <Text style={styles.balanceValue}>
                    {showBalance ? money(balance) : maskedMoney(balance)}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setShowBalance((prev) => !prev)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons
                      name={showBalance ? 'eye-outline' : 'eye-off-outline'}
                      size={22}
                      color="#fff"
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Add Money */}
              <TouchableOpacity
                style={[styles.primaryBtn, { borderColor: balanceColor }]}
                activeOpacity={0.9}
                onPress={() => goWithGrace('AddMoneyScreen', { walletId })}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons
                    name="add-circle-outline"
                    size={18}
                    color={balanceColor}
                    style={{ marginRight: 8 }}
                  />
                  <Text
                    style={[
                      styles.primaryBtnText,
                      { color: balanceColor },
                    ]}
                  >
                    ADD MONEY
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Action Pills */}
              <View style={styles.actionRow}>
                {actions.map((a) => (
                  <TouchableOpacity
                    key={a.key}
                    style={styles.actionPill}
                    onPress={a.onPress}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={a.icon}
                      size={20}
                      color="#f97316"
                      style={{ marginRight: 8 }}
                    />
                    <Text style={styles.actionText}>{a.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.sectionTitle}>Recent Transactions</Text>

              {/* Table header row */}
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.tableHeaderText, { flex: 1.1 }]}>
                  Date
                </Text>
                <Text
                  style={[
                    styles.tableHeaderText,
                    { flex: 1.5, textAlign: 'center' },
                  ]}
                >
                  Journal No.
                </Text>
                <Text
                  style={[
                    styles.tableHeaderText,
                    { flex: 1.1, textAlign: 'right' },
                  ]}
                >
                  Amount (Nu)
                </Text>
                <Text
                  style={[
                    styles.tableHeaderText,
                    { width: 50, textAlign: 'right' },
                  ]}
                >
                  Dr/Cr
                </Text>
              </View>
            </>
          }
          renderItem={({ item }) => <TransactionItem item={item} />}
          // tableRow already has its own bottom border; no extra separator
          ItemSeparatorComponent={null}
          ListEmptyComponent={<ListEmpty />}
          ListFooterComponent={<View style={{ height: insets.bottom }} />}
          showsVerticalScrollIndicator={false}
        />
      </View>
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
    width: 50,
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

  listPad: { padding: 18 },

  // Balance Card
  card: {
    borderRadius: 16,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  balanceRow: { flexDirection: 'row', alignItems: 'center' },
  balanceLabel: {
    color: '#fff',
    opacity: 0.9,
    fontSize: width > 400 ? 14 : 13,
    fontWeight: '600',
  },
  balanceValue: {
    color: '#fff',
    fontSize: width > 400 ? 28 : 24,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  // Wallet ID pill
  walletIdWrap: {
    maxWidth: '58%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  walletIdText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 0.3,
    maxWidth: '85%',
  },

  // Primary CTA (outlined)
  primaryBtn: {
    marginTop: 14,
    borderWidth: 2,
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryBtnText: {
    fontSize: width > 400 ? 16 : 15,
    fontWeight: '800',
    letterSpacing: 0.6,
  },

  // Filled primary (empty state / lock)
  primaryBtnFilled: {
    marginTop: 14,
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

  // Secondary
  secondaryBtn: {
    marginTop: 10,
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    width: 94,
    alignSelf: 'center',
  },
  secondaryBtnText: {
    color: '#0f172a',
    fontWeight: '700',
    justifyContent: 'center',
    width: 90,
    textAlign: 'center',
  },

  // Action Pills
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    marginBottom: 8,
  },
  actionPill: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#f4f4f5',
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionText: {
    color: '#0f172a',
    fontWeight: '600',
    fontSize: width > 400 ? 15 : 14,
  },

  // Section
  sectionTitle: {
    marginTop: 18,
    marginBottom: 10,
    fontWeight: '800',
    fontSize: width > 400 ? 18 : 16,
    color: '#0f172a',
  },

  // Table-style transaction list
  tableHeaderRow: {
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    flexDirection: 'row',
    alignItems: 'center',
  },
  tableHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
  },
  tableRow: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  tableCellText: {
    fontSize: 13,
    color: '#0f172a',
  },

  // Empty state
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: '#fff7ed',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#ffedd5',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  emptySub: {
    textAlign: 'center',
    marginTop: 6,
    color: '#64748b',
    lineHeight: 20,
  },

  // Lock overlay
  lockWrap: { alignItems: 'center', padding: 24 },
  lockIcon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: '#fff7ed',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#ffedd5',
    marginBottom: 12,
  },
  lockTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  lockSub: {
    textAlign: 'center',
    marginTop: 6,
    color: '#64748b',
    lineHeight: 20,
  },
});
