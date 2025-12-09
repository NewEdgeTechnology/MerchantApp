// screens/food/PayoutTab.js

import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import {
  TANSACTION_HISTORY_ENDPOINT as ENV_WALLET_TXN,
  WALLET_ENDPOINT as ENV_WALLET,
} from '@env';

const money = (n) => `Nu ${Number(n ?? 0).toFixed(2)}`;

// Replace {placeholders}
const buildUrl = (template, replacements = {}) => {
  let out = String(template || '');
  Object.entries(replacements).forEach(([key, value]) => {
    out = out.replace(`{${key}}`, String(value));
  });
  return out;
};

// Auth header like Home
async function getAuthHeader() {
  try {
    const raw = await SecureStore.getItemAsync('merchant_login');
    let token = null;
    if (raw) {
      const parsed = JSON.parse(raw);
      token = parsed?.token?.access_token || parsed?.token || null;
    }
    if (!token) {
      token = await SecureStore.getItemAsync('auth_token');
    }
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const ordinal = (n) => {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
};
const formatDateTime = (raw) => {
  if (!raw) return { time: '', date: '' };
  let d;
  if (raw.includes('T')) d = new Date(raw);
  else d = new Date(raw.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return { time: raw, date: '' };

  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const time = `${h}:${m}`;
  const day = d.getDate();
  const monthName = MONTHS[d.getMonth()] || '';
  const year = d.getFullYear();
  const date = `${monthName} ${ordinal(day)} ${year}`;
  return { time, date };
};

export default function PayoutsTab({
  route,
  isTablet,
  businessId: propBusinessId,
  userId: propUserId,
  kpis: propKpis,
}) {
  const routeParams = route?.params ?? {};

  // ✅ support kpis both from parent prop AND from route.params.kpis (Notifications → navigate)
  const routeKpis = routeParams.kpis ?? null;
  const kpis = propKpis ?? routeKpis ?? null;

  const resolvedBusinessId =
    propBusinessId ??
    routeParams.businessId ??
    routeParams.business_id ??
    null;

  const resolvedUserId =
    propUserId ??
    routeParams.userId ??
    routeParams.user_id ??
    null;

  const initialWalletId = routeParams.walletId
    ? String(routeParams.walletId)
    : null;

  const [statements, setStatements] = useState([]);
  const [todaySalesFromWallet, setTodaySalesFromWallet] = useState(0);
  const [walletId, setWalletId] = useState(initialWalletId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ✅ use effective KPIs
  const todaySales = kpis?.salesToday ?? todaySalesFromWallet ?? 0;
  const activeOrders = kpis?.activeOrders ?? 0;
  const acceptRate = kpis?.acceptanceRate ?? 0;

  /* ====================== LOAD WALLET + TRANSACTIONS ====================== */

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      try {
        setLoading(true);
        setError('');

        const headers = {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(await getAuthHeader()),
        };

        let currentWalletId = walletId;

        // If we don't already have walletId (from params/state), fetch using user_id
        if (!currentWalletId && resolvedUserId && ENV_WALLET) {
          try {
            const walletUrl = buildUrl(ENV_WALLET, { user_id: resolvedUserId });
            const walletRes = await fetch(walletUrl, { headers });
            const text = await walletRes.text();
            let wJson = null;
            try { wJson = text ? JSON.parse(text) : null; } catch {}
            if (walletRes.ok && wJson) {
              const wid =
                wJson.wallet_id ||
                wJson.walletId ||
                wJson?.wallet?.wallet_id ||
                wJson?.wallet?.id ||
                wJson?.data?.wallet_id ||
                wJson?.data?.id ||
                wJson?.data?.wallet?.wallet_id ||
                null;
              if (wid && isMounted) {
                currentWalletId = String(wid);
                setWalletId(currentWalletId);
              }
            }
          } catch (e) {
            console.log('wallet fetch error:', e);
          }
        }

        // Load transactions for this wallet
        if (currentWalletId && ENV_WALLET_TXN) {
          try {
            const txnUrl = buildUrl(ENV_WALLET_TXN, { wallet_id: currentWalletId });
            const txnRes = await fetch(txnUrl, { headers });
            const text = await txnRes.text();
            let json = null;
            try { json = text ? JSON.parse(text) : null; } catch {}
            if (txnRes.ok && json) {
              const list = Array.isArray(json.data) ? json.data : [];
              const mapped = list.map((tx, idx) => {
                const rawTs = tx.created_at_local || tx.created_at || '';
                const { time, date } = formatDateTime(rawTs);
                const isCredit = tx.direction === 'CR';
                const amountNum = Number(tx.amount || 0);

                // strip “| charge=…” part from reason
                let reason = (tx.note || '').replace(/\s*\|\s*charge=\d+.*/i, '').trim();

                return {
                  id: tx.transaction_id || String(idx),
                  from: tx.counterparty_wallet_id || '',
                  reason,
                  time,
                  date,
                  direction: tx.direction,
                  amount: amountNum,
                };
              });

              // crude today sum (you may refine later if needed)
              const todayStr = new Date().toISOString().slice(0, 10);
              const todayCreditSum = mapped
                .filter(
                  (tx) =>
                    tx.direction === 'CR' &&
                    (tx.date && (tx.date.includes(todayStr) || todayStr.includes(tx.date)))
                )
                .reduce((sum, tx) => sum + tx.amount, 0);

              if (isMounted) {
                setStatements(mapped);
                setTodaySalesFromWallet(todayCreditSum);
              }
            }
          } catch (e) {
            console.log('txn fetch error:', e);
          }
        }
      } catch (err) {
        console.log('PayoutsTab load error', err);
        if (isMounted) setError('Unable to load payouts right now.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    // We just need user + either a walletId (from params/lookup) or ENV_WALLET to resolve it
    if (resolvedUserId && (walletId || ENV_WALLET)) {
      loadData();
    } else {
      setLoading(false);
    }

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedBusinessId, resolvedUserId, walletId]);

  /* ====================== DATA FOR FLATLIST ====================== */

  const data = useMemo(
    () => [
      {
        type: 'stats',
        content: [
          {
            icon: 'wallet',
            title: 'Today',
            value: money(todaySales),
            subtitle: 'Sales',
            color: '#16a34a',
          },
          {
            icon: 'cart',
            title: 'Active',
            value: `${activeOrders} Orders`,
            color: '#3b82f6',
          },
          {
            icon: 'checkmark-circle',
            title: 'Accept',
            value: `${acceptRate}%`,
            subtitle: 'Rate',
            color: '#e11d48',
          },
        ],
      },
      { type: 'history', content: statements },
    ],
    [todaySales, activeOrders, acceptRate, statements]
  );

  /* ====================== RENDER ====================== */

  const renderItem = ({ item }) => {
    if (item.type === 'stats') {
      return (
        <View style={styles.stats}>
          {item.content.map((stat, i) => (
            <View key={i} style={styles.statItem}>
              <Ionicons name={stat.icon} size={24} color={stat.color} />
              <Text style={styles.statTitle}>{stat.title}</Text>
              <Text style={styles.statValue}>{stat.value}</Text>
              {stat.subtitle && (
                <Text style={styles.statSubtitle}>{stat.subtitle}</Text>
              )}
            </View>
          ))}
        </View>
      );
    }

    if (item.type === 'history') {
      return (
        <>
          <View style={styles.historyHeaderRow}>
            <Text
              style={[styles.title, { fontSize: isTablet ? 18 : 16, marginTop: 20 }]}>
              Payout History
            </Text>
          </View>

          {item.content.map((tx) => {
            const isCredit = tx.direction === 'CR';
            const sign = isCredit ? '+ ' : '- ';
            return (
              <View key={tx.id} style={styles.statementItem}>
                {/* Column: Reason, Date, Wallet ID ("From") */}
                <View style={{ flex: 1 }}>
                  {/* Reason */}
                  <Text style={styles.reasonText} numberOfLines={2}>
                    {tx.reason || (isCredit ? 'Credit' : 'Payment')}
                  </Text>

                  {/* Wallet ID ("From") */}
                  {tx.from ? (
                    <Text style={styles.fromText} numberOfLines={1}>
                      From: {tx.from}
                    </Text>
                  ) : null}
                  {/* Date */}
                  <Text style={styles.datetimeText}>
                    {tx.time} - {tx.date}
                  </Text>
                </View>

                {/* Right side: Amount */}
                <View style={{ justifyContent: 'center', marginLeft: 8 }}>
                  <Text
                    style={[
                      styles.amountText,
                      isCredit ? styles.amountCredit : styles.amountDebit,
                    ]}
                  >
                    {sign}
                    {money(tx.amount)}
                  </Text>
                </View>
              </View>
            );
          })}
        </>
      );
    }

    return null;
  };

  if (loading) {
    return (
      <View
        style={[
          styles.contentContainer,
          { flex: 1, justifyContent: 'center', alignItems: 'center' },
        ]}
      >
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 8, color: '#6b7280' }}>
          Loading payouts…
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f3f4f6' }}>
      {error ? (
        <Text
          style={{
            color: '#b91c1c',
            paddingHorizontal: 16,
            paddingTop: 8,
          }}
        >
          {error}
        </Text>
      ) : null}
      <FlatList
        data={data}
        keyExtractor={(item, i) => i.toString()}
        renderItem={renderItem}
        contentContainerStyle={styles.contentContainer}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  contentContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    backgroundColor: '#f3f4f6',
    paddingBottom: 80,
  },
  title: { fontWeight: '700', color: '#0f172a', marginBottom: 8 },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 10,
  },
  statItem: {
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 12,
    flex: 1,
    marginHorizontal: 8,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  statTitle: { fontSize: 12, color: '#4b5563', marginBottom: 4 },
  statValue: { fontSize: 16, fontWeight: '600', color: '#16a34a' },
  statSubtitle: { fontSize: 12, color: '#e11d48', marginTop: 4 },
  historyHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },

  statementItem: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    flexDirection: 'row',
  },
  reasonText: {
    fontSize: 14,
    color: '#0f172a',
    fontWeight: '500',
    marginBottom: 4,  // Spacing between reason and date
  },
  datetimeText: {
    fontSize: 12,
    color: '#9ca3af',
    marginBottom: 4,  // Spacing between date and "From"
  },
  fromText: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 4,
  },
  amountText: {
    fontSize: 16,
    fontWeight: '700',
  },
  amountCredit: {
    color: '#16a34a',
  },
  amountDebit: {
    color: '#e11d48',
  },
});
