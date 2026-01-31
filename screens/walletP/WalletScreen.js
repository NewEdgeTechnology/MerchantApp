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
import { LinearGradient } from 'expo-linear-gradient';
import {
  WALLET_ENDPOINT as ENV_WALLET,
  TANSACTION_HISTORY_ENDPOINT as ENV_WALLET_TXN,
} from '@env';

const { width } = Dimensions.get('window');

// brand-ish palette similar to the second UI
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

// Always show Nu here
const money = (n, c = 'Nu') => `${c}. ${Number(n ?? 0).toFixed(2)}`;

// Masked money helper (stars + real decimals)
const maskedMoney = (n, c = 'Nu') => {
  const amt = Number(n ?? 0);
  const decimals = Math.abs(amt).toFixed(2).split('.')[1] || '00';
  return `${c}. ****.${decimals}`;
};

// ───────────────── date helpers for grouping (UI only) ───────────────
const timeHM = (ts) => {
  const d = typeof ts === 'number' ? new Date(ts) : new Date(ts || Date.now());
  return d.toLocaleTimeString('en-US', {
    timeZone: 'Asia/Thimphu',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const dateMD = (ts) => {
  const d = typeof ts === 'number' ? new Date(ts) : new Date(ts || Date.now());
  return d.toLocaleDateString('en-US', {
    timeZone: 'Asia/Thimphu',
    month: 'short',
    day: 'numeric',
  });
};

const isToday = (ts) => {
  const d = typeof ts === 'number' ? new Date(ts) : new Date(ts || Date.now());
  const t = new Date();
  return (
    d.getFullYear() === t.getFullYear() &&
    d.getMonth() === t.getMonth() &&
    d.getDate() === t.getDate()
  );
};

const isYesterday = (ts) => {
  const x = typeof ts === 'number' ? new Date(ts) : new Date(ts || Date.now());
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return (
    d.getFullYear() === x.getFullYear() &&
    d.getMonth() === x.getMonth() &&
    d.getDate() === x.getDate()
  );
};

const parseWhen = (ts) => {
  if (!ts) return Date.now();
  const d = new Date(ts);
  const v = d.getTime();
  return Number.isNaN(v) ? Date.now() : v;
};

// group txns by day label (Today / Yesterday / MMM d)
function groupByDayFromTxns(list) {
  if (!Array.isArray(list) || list.length === 0) return [];

  const buckets = {};
  list.forEach((t) => {
    const when = parseWhen(t.ts);
    const label = isToday(when)
      ? 'Today'
      : isYesterday(when)
      ? 'Yesterday'
      : dateMD(when);

    const extended = { ...t, when };
    if (!buckets[label]) buckets[label] = [];
    buckets[label].push(extended);
  });

  Object.values(buckets).forEach((arr) =>
    arr.sort((a, b) => (b.when || 0) - (a.when || 0))
  );

  return Object.entries(buckets)
    .sort((a, b) => (b[1]?.[0]?.when || 0) - (a[1]?.[0]?.when || 0))
    .map(([label, items]) => ({ label, items }));
}

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

// kept, though not used by new card rows (in case you re-use later)
function iconForType(type) {
  switch (type) {
    case 'cashback':
      return { name: 'gift-outline', color: '#16a34a' };
    case 'payment':
      return { name: 'restaurant-outline', color: '#ef4444' };
    case 'refund':
      return { name: 'arrow-undo-outline', color: '#0ea5e9' };
    default:
      return { name: 'receipt-outline', color: '#64748b' };
  }
}

// ───────────────── Table-style row component (not used now, kept for logic safety) ───────────────
function TransactionItem({ item }) {
  const isDebit = item.drcr === 'DR' || item.amount < 0;

  return (
    <View style={styles.tableRow}>
      {/* Date */}
      <Text style={[styles.tableCellText, { flex: 1.1 }]} numberOfLines={1}>
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
        {money(Math.abs(item.amount), 'Nu')}
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
  const balanceColor = G.grab; // use grab green for main brand

  // Navigate helper that ensures grace is active before leaving
  const goWithGrace = useCallback(
    async (screen, params = {}) => {
      const authGraceUntil = await setAuthGrace();
      navigation.navigate(screen, {
        ...params,
        skipBiometric: true,
        authGraceUntil,
        walletId, // Pass walletId to the next screen
      });
    },
    [navigation, walletId]
  );

  const actions = useMemo(
    () => [
      {
        key: 'withdraw',
        label: 'Withdraw',
        icon: 'cash-outline',
        onPress: () => goWithGrace('WithdrawScreen', { walletId }),
      },
      {
        key: 'send',
        label: 'Send to Friend',
        icon: 'paper-plane-outline',
        onPress: () =>
          goWithGrace('SendToFriendScreen', {
            walletId, // still pass original
            senderWalletId: walletId, // NEW — ensures sender wallet ID is passed
          }),
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
        status: 'success', // UI-only default status
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

  const onCopyWalletId = useCallback(async () => {
    if (!walletId) return;
    try {
      await Clipboard.setStringAsync(String(walletId));
      Alert.alert('Copied', 'Wallet ID copied to clipboard.');
    } catch {}
  }, [walletId]);

  const groupedTxns = useMemo(() => groupByDayFromTxns(txns), [txns]);

  const EmptyState = () => (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <View style={styles.wrap}>
        <LinearGradient
          colors={['#46e693', '#40d9c2']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.gradientHeader, { paddingTop: headerTopPad }]}
        >
          <View style={styles.headerRow}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.backBtn}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={22} color={G.white} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: G.white, textAlign: 'left' }]}>
              Wallet
            </Text>
            <View style={{ width: 32 }} />
          </View>
        </LinearGradient>

        <View style={{ padding: 16 }}>
          <View style={styles.emptyCard}>
            <Ionicons name="wallet-outline" size={28} color={G.grab} />
            <Text style={styles.emptyTitle}>
              {user ? 'No wallet yet' : 'You are not signed in'}
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
              style={styles.createBtn}
            >
              <Text style={styles.createText}>CREATE WALLET</Text>
            </TouchableOpacity>

            {!user && (
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => navigation.navigate('LoginScreen')}
                style={[styles.secondaryBtn, { marginTop: 16 }]}
              >
                <Text style={styles.secondaryBtnText}>SIGN IN</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </SafeAreaView>
  );

  if (locked) {
    return (
      <SafeAreaView
        style={[styles.safe, { alignItems: 'center', justifyContent: 'center' }]}
        edges={['left', 'right', 'bottom']}
      >
        <View style={styles.lockWrap}>
          <View style={styles.lockIcon}>
            <Ionicons name="lock-closed-outline" size={36} color={balanceColor} />
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
              { backgroundColor: balanceColor, marginTop: 16 },
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
        <ActivityIndicator size="large" color={G.grab} />
        <Text style={{ marginTop: 12, color: G.grab, fontWeight: '600' }}>
          Checking your wallet…
        </Text>
      </SafeAreaView>
    );
  }

  if (!user || !hasWallet) return <EmptyState />;

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <View style={styles.wrap}>
        {/* ===== Header / Balance (grab-like) ===== */}
        <LinearGradient
          colors={['#46e693', '#40d9c2']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.gradientHeader, { paddingTop: headerTopPad }]}
        >
          <View style={styles.headerRow}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.backBtn}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={22} color={G.white} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: G.white, textAlign: 'left' }]}>
              My Wallet
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {!!walletId && (
                <View style={styles.badgeWhite}>
                  <Text style={styles.badgeText}>ACTIVE</Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.balanceCardGradient}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Text style={styles.balanceLabelGradient}>Available Balance</Text>
              <TouchableOpacity
                onPress={() => setShowBalance((prev) => !prev)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name={showBalance ? 'eye-outline' : 'eye-off-outline'}
                  size={18}
                  color={G.white}
                />
              </TouchableOpacity>
            </View>

            <Text style={styles.balanceAmtGradient}>
              {showBalance ? money(balance, 'Nu') : maskedMoney(balance, 'Nu')}
            </Text>

            {!!walletId && (
              <TouchableOpacity
                onPress={onCopyWalletId}
                activeOpacity={0.8}
                style={styles.walletIdRow}
              >
                <Text style={styles.pending}>Wallet ID: {walletId}</Text>
                <Ionicons name="copy-outline" size={14} color={G.white} />
              </TouchableOpacity>
            )}

            {/* Quick Actions (Add Money + Withdraw + Send to Friend) */}
            <View style={styles.quickRow}>
              <QuickAction
                icon="add-circle-outline"
                label="Add Money"
                onPress={() => goWithGrace('AddMoneyScreen', { walletId })}
              />
              {actions.map((a) => (
                <QuickAction
                  key={a.key}
                  icon={a.icon}
                  label={a.label}
                  onPress={a.onPress}
                />
              ))}
            </View>
          </View>
        </LinearGradient>

        {/* ===== Transactions (grouped cards) ===== */}
        <View style={styles.section}>
          <View style={[styles.rowBetween, { marginBottom: 8 }]}>
            <Text style={styles.sectionTitle}>Transactions</Text>
          </View>

          <FlatList
            data={groupedTxns}
            keyExtractor={(g) => g.label}
            contentContainerStyle={{
              paddingBottom: 24 + insets.bottom,
            }}
            renderItem={({ item }) => (
              <View style={{ marginBottom: 16 }}>
                <Text style={styles.dayLabel}>{item.label}</Text>
                {item.items.map((one) => (
                  <TxRow key={one.id} tx={one} />
                ))}
              </View>
            )}
            ListEmptyComponent={
              <Text style={{ color: '#64748B' }}>No transactions yet.</Text>
            }
            showsVerticalScrollIndicator={false}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

/* ===== Subcomponents for grab-like UI (pure UI, no logic change) ===== */
function QuickAction({ icon, label, onPress }) {
  return (
    <TouchableOpacity style={styles.quick} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.quickIcon}>
        <Ionicons name={icon} size={20} color={G.grab} />
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function TxRow({ tx }) {
  const isCR = tx.drcr === 'CR' || tx.amount > 0;
  const amt = `${isCR ? '+' : '-'}${money(Math.abs(tx.amount), 'Nu')}`;
  const status = tx.status || 'success';

  const pillStyle =
    status === 'success'
      ? styles.pillOk
      : status === 'reversed'
      ? styles.pillWarn
      : styles.pillGray;

  const iconName = isCR
    ? 'arrow-down-circle-outline'
    : 'arrow-up-circle-outline';

  return (
    <View style={styles.txRow}>
      <View style={styles.txIconWrap}>
        <Ionicons
          name={iconName}
          size={22}
          color={isCR ? G.ok : G.danger}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.txTitle}>{tx.title || 'Transaction'}</Text>
        {!!tx.journal && (
          <Text style={styles.txNote}>Jrnl No: {tx.journal}</Text>
        )}

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            marginTop: 6,
          }}
        >
          <Text style={styles.txTime}>{timeHM(tx.when)}</Text>
          <View style={[styles.pill, pillStyle]}>
            <Text style={styles.pillText}>{status}</Text>
          </View>
        </View>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.txAmt, isCR ? styles.txCR : styles.txDR]}>{amt}</Text>
        <Text style={styles.txType}>
          {isCR ? 'Credited' : 'Debited'}
        </Text>
      </View>
    </View>
  );
}

/* ===== Styles ===== */
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: G.bg },

  wrap: { flex: 1, backgroundColor: G.bg },

  // Old header kept for secondary screens (e.g. lock) but main wallet uses gradient
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
    width: 32,
    height: 32,
    borderRadius: 16,
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

  // Old balance card (not used in main view now, kept for safety)
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

  // Wallet ID pill (old)
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
    width: 120,
    alignSelf: 'center',
  },
  secondaryBtnText: {
    color: '#0f172a',
    fontWeight: '700',
    justifyContent: 'center',
    width: 110,
    textAlign: 'center',
  },

  // Old action pills (kept)
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

  // Section (old)
  sectionTitleOld: {
    marginTop: 18,
    marginBottom: 10,
    fontWeight: '800',
    fontSize: width > 400 ? 18 : 16,
    color: '#0f172a',
  },

  // Table-style transaction list (old)
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
    color: G.slate,
    marginTop: 4,
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

  // ===== New grab-like styles =====
  gradientHeader: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  badgeWhite: {
    backgroundColor: 'rgba(255,255,255,.2)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeText: { color: G.white, fontWeight: '800', fontSize: 12 },

  balanceCardGradient: {
    marginTop: 14,
    backgroundColor: 'rgba(255,255,255,.16)',
    borderRadius: 16,
    padding: 14,
  },
  balanceLabelGradient: { color: G.white, opacity: 0.95 },
  balanceAmtGradient: {
    color: G.white,
    fontSize: 24,
    fontWeight: '900',
    marginTop: 6,
  },
  pending: { color: G.white, opacity: 0.85, marginTop: 0 },

  walletIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },

  quickRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  quick: { flex: 1, alignItems: 'center' },
  quickIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E8FFF1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: {
    marginTop: 8,
    color: G.white,
    fontWeight: '700',
    fontSize: 12,
    textAlign: 'center',
  },

  section: { paddingHorizontal: 16, paddingTop: 16, flex: 1 },
  sectionTitle: { color: G.slate, fontSize: 16, fontWeight: '800' },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  dayLabel: {
    color: '#64748B',
    fontWeight: '800',
    marginBottom: 8,
    marginTop: 6,
  },
  txRow: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: G.line,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  txIconWrap: { width: 32, alignItems: 'center', paddingTop: 2 },
  txTitle: { color: G.slate, fontWeight: '600' },
  txNote: { color: '#6B7280', marginTop: 2 },
  txTime: { color: '#94A3B8', fontSize: 12 },
  txAmt: { fontWeight: '800' },
  txCR: { color: G.ok },
  txDR: { color: G.danger },
  txType: { color: '#94A3B8', fontSize: 12, marginTop: 4 },

  pill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillText: { fontSize: 11, fontWeight: '600' },
  pillOk: { backgroundColor: '#ECFDF5', borderColor: '#D1FAE5' },
  pillWarn: { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' },
  pillGray: { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB' },

  // New empty card (grab-like)
  emptyCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: G.line,
    borderRadius: 16,
    padding: 18,
    gap: 8,
    alignItems: 'center',
  },
  createBtn: {
    marginTop: 8,
    backgroundColor: G.grab,
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  createText: { color: G.white, fontWeight: '800' },
});
