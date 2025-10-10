// screens/food/WalletScreen.js

import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  FlatList,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');
const money = (n, c = 'Nu') => `${c}. ${Number(n ?? 0).toFixed(2)}`;

const TXN = [
  { id: 't1', type: 'cashback', title: 'Cashback Received', amount: 15, ts: 'Today, 10:12 AM' },
  { id: 't2', type: 'payment',  title: 'Order Paid • Burger Hub', amount: -230, ts: 'Yesterday, 7:41 PM' },
  { id: 't3', type: 'refund',   title: 'Refund Received • SushiGo', amount: 120, ts: 'Sep 10, 3:05 PM' },
];

function iconForType(type) {
  switch (type) {
    case 'cashback': return { name: 'gift-outline', color: '#16a34a' };
    case 'payment':  return { name: 'restaurant-outline', color: '#ef4444' };
    case 'refund':   return { name: 'arrow-undo-outline', color: '#0ea5e9' };
    default:         return { name: 'receipt-outline', color: '#64748b' };
  }
}

function TransactionItem({ item }) {
  const { name, color } = iconForType(item.type);
  const isDebit = item.amount < 0;

  return (
    <View style={styles.txnCard}>
      <View style={[styles.txnIconWrap, { backgroundColor: '#f1f5f9' }]}>
        <Ionicons name={name} size={18} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.txnTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.txnMeta}>{item.ts}</Text>
      </View>
      <Text style={[styles.txnAmount, { color: isDebit ? '#ef4444' : '#16a34a' }]}>
        {isDebit ? `- ${money(Math.abs(item.amount))}` : `+ ${money(item.amount)}`}
      </Text>
    </View>
  );
}

export default function WalletScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  // Header top padding (consistent with PersonalInformation.js)
  const headerTopPad = Math.max(insets.top, 8) + 18;

  // Replace with state from API if needed
  const balance = 450;
  const promoBalance = 50;

  const balanceColor = '#f97316'; // orange

  const actions = useMemo(() => ([
    { key: 'add',      label: 'Add Money',      icon: 'add-circle-outline',     onPress: () => navigation.navigate('AddMoney') },
    { key: 'withdraw', label: 'Withdraw',       icon: 'card-outline',           onPress: () => navigation.navigate('Withdraw') },
    { key: 'send',     label: 'Send to Friend', icon: 'paper-plane-outline',    onPress: () => navigation.navigate('SendToFriend') },
  ]), [navigation]);

  return (
    <SafeAreaView style={styles.safe} edges={['left','right','bottom']}>
      {/* Header */}
      <View style={[styles.headerBar, { paddingTop: headerTopPad }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Wallet</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Body (no deprecated RN SafeAreaView here) */}
      <View style={{ flex: 1 }}>
        <FlatList
          contentContainerStyle={[styles.listPad, { paddingBottom: 24 + insets.bottom }]}
          data={TXN}
          keyExtractor={(it) => it.id}
          ListHeaderComponent={
            <>
              {/* Balance Card */}
              <View style={[styles.card, { backgroundColor: balanceColor }]}>
                <View style={styles.balanceRow}>
                  <Ionicons name="wallet-outline" size={24} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.balanceLabel}>Wallet Balance</Text>
                </View>
                <Text style={styles.balanceValue}>{money(balance)}</Text>
              </View>

              {/* Primary CTA (Add Money) */}
              <TouchableOpacity style={[styles.primaryBtn, { borderColor: balanceColor }]} activeOpacity={0.9}
                onPress={actions[0].onPress}>
                <Text style={[styles.primaryBtnText, { color: balanceColor }]}>ADD MONEY</Text>
              </TouchableOpacity>

              {/* Action Pills */}
              <View style={styles.actionRow}>
                {actions.map((a) => (
                  <TouchableOpacity key={a.key} style={styles.actionPill} onPress={a.onPress} activeOpacity={0.8}>
                    <Ionicons name={a.icon} size={20} color="#f97316" style={{ marginRight: 8 }} />
                    <Text style={styles.actionText}>{a.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Promo Balance */}
              <View style={styles.promoCard}>
                <Ionicons name="pricetag-outline" size={20} color="#f97316" />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.promoTitle}>Promo Credits</Text>
                  <Text style={styles.promoSub}>Usable on eligible orders</Text>
                </View>
                <Text style={styles.promoAmount}>{money(promoBalance)}</Text>
              </View>

              <Text style={styles.sectionTitle}>Recent Transactions</Text>
            </>
          }
          renderItem={({ item }) => <TransactionItem item={item} />}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
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
  backBtn: { height: 40, width: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: '#0f172a' },

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
  balanceLabel: { color: '#fff', opacity: 0.9, fontSize: width > 400 ? 14 : 13, fontWeight: '600' },
  balanceValue: { color: '#fff', marginTop: 6, fontSize: width > 400 ? 28 : 24, fontWeight: '800', letterSpacing: 0.3 },

  // Primary CTA (outlined)
  primaryBtn: {
    marginTop: 14,
    borderWidth: 2,
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryBtnText: { fontSize: width > 400 ? 16 : 15, fontWeight: '800', letterSpacing: 0.6 },

  // Action Pills
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 14, marginBottom: 8 },
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
  actionText: { color: '#0f172a', fontWeight: '600', fontSize: width > 400 ? 15 : 14 },

  // Promo Card
  promoCard: {
    marginTop: 12,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
  },
  promoTitle: { fontWeight: '700', color: '#0f172a', fontSize: width > 400 ? 16 : 15 },
  promoSub: { color: '#64748b', marginTop: 2, fontSize: 12 },
  promoAmount: { fontWeight: '800', color: '#0f172a', fontSize: width > 400 ? 16 : 15 },

  // Section
  sectionTitle: { marginTop: 18, marginBottom: 10, fontWeight: '800', fontSize: width > 400 ? 18 : 16, color: '#0f172a' },

  // Transaction row
  txnCard: {
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
  },
  txnIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12,
  },
  txnTitle: { color: '#0f172a', fontWeight: '700', fontSize: width > 400 ? 15 : 14 },
  txnMeta: { color: '#64748b', fontSize: 12, marginTop: 2 },
  txnAmount: { fontWeight: '800', fontSize: width > 400 ? 15 : 14, marginLeft: 8 },
});
