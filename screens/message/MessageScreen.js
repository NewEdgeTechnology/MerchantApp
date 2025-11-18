// screens/food/MessageScreen.js
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  StatusBar,
  Pressable,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

/* ───────────── Dummy Data ───────────── */

const CUSTOMER_THREADS = [
  {
    id: 'c1',
    name: 'Sonam Dorji',
    orderId: 'ORD-1023',
    lastMessage: 'Can you make it less spicy?',
    time: '10:24 AM',
  },
  {
    id: 'c2',
    name: 'Pema Choki',
    orderId: 'ORD-1027',
    lastMessage: 'I’m almost there, please keep it warm.',
    time: '09:12 AM',
  },
  {
    id: 'c3',
    name: 'Karma Wangdi',
    orderId: 'ORD-1031',
    lastMessage: 'Add one more coke please.',
    time: 'Yesterday',
  },
];

const DRIVER_THREADS = [
  {
    id: 'd1',
    name: 'Thinley',
    orderId: 'ORD-1023',
    lastMessage: 'Picked up the order from your shop.',
    time: '10:20 AM',
  },
  {
    id: 'd2',
    name: 'Dechen',
    orderId: 'ORD-1019',
    lastMessage: 'Stuck in traffic, will be 5 mins late.',
    time: '09:45 AM',
  },
  {
    id: 'd3',
    name: 'Ugyen',
    orderId: 'ORD-1005',
    lastMessage: 'Delivered, customer has received it.',
    time: 'Yesterday',
  },
];

/* ───────────── Screen ───────────── */

export default function MessageScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState('customer'); // 'driver' | 'customer'

  const isDriverTab = activeTab === 'driver';
  const data = isDriverTab ? DRIVER_THREADS : CUSTOMER_THREADS;

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.threadRow}
      activeOpacity={0.85}
      onPress={() =>
        navigation.navigate('ChatDetailScreen', {
          threadId: item.id,
          type: isDriverTab ? 'driver' : 'customer',
          name: item.name,
          orderId: item.orderId,
        })
      }
    >
      {/* Avatar circle with initial */}
      <View style={styles.avatarCircle}>
        <Text style={styles.avatarText}>
          {item.name?.charAt(0)?.toUpperCase() || '?'}
        </Text>
      </View>

      {/* Texts */}
      <View style={styles.threadTextWrap}>
        <View style={styles.threadTopRow}>
          <Text style={styles.threadName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.threadTime}>{item.time}</Text>
        </View>

        <Text style={styles.threadOrder} numberOfLines={1}>
          Order ID: <Text style={styles.threadOrderBold}>{item.orderId}</Text>
        </Text>

        {!!item.lastMessage && (
          <Text style={styles.threadLastMsg} numberOfLines={1}>
            {item.lastMessage}
          </Text>
        )}
      </View>

      <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

      {/* 🔹 Header styled like MenuScreen */}
      <View style={[styles.header, { paddingTop: (insets.top || 0) + 6 }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.iconBtn}
          android_ripple={{ color: 'rgba(0,0,0,0.08)', borderless: true }}
        >
          <Ionicons name="arrow-back" size={24} color="#0f172a" />
        </Pressable>
        <Text style={styles.headerTitle}>Messages</Text>
        {/* spacer on the right to balance back button */}
        <View style={{ width: 40 }} />
      </View>

      {/* Top tabs */}
      <View style={styles.tabRow}>
        <TabButton
          label="Chat with driver"
          icon="car-outline"
          active={isDriverTab}
          onPress={() => setActiveTab('driver')}
        />
        <TabButton
          label="Chat with customer"
          icon="person-outline"
          active={!isDriverTab}
          onPress={() => setActiveTab('customer')}
        />
      </View>

      {/* List content */}
      <View style={styles.content}>
        {data.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons
              name={isDriverTab ? 'car-outline' : 'person-outline'}
              size={32}
              color="#9CA3AF"
            />
            <Text style={styles.emptyTitle}>No conversations yet</Text>
            <Text style={styles.emptySubtitle}>
              When you have orders, {isDriverTab ? 'drivers' : 'customers'} will appear here
              with their order IDs.
            </Text>
          </View>
        ) : (
          <FlatList
            data={data}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={{ paddingVertical: 10 }}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

/* ───────────── Components ───────────── */

function TabButton({ label, icon, active, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.tabButton, active && styles.tabButtonActive]}
      onPress={onPress}
      activeOpacity={0.9}
    >
      <Ionicons
        name={icon}
        size={18}
        color={active ? '#00b14f' : '#6B7280'}
        style={{ marginRight: 6 }}
      />
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/* ───────────── Styles ───────────── */

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#ffffff',
  },

  // 🔹 Header copied from MenuScreen style
  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },

  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F3F4F6',
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 4,
  },
  tabButtonActive: {
    backgroundColor: '#D1FAE5',
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  tabLabelActive: {
    color: '#065F46',
  },
  content: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 10,
  },
  threadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#065F46',
  },
  threadTextWrap: {
    flex: 1,
  },
  threadTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  threadName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  threadTime: {
    fontSize: 12,
    color: '#9CA3AF',
    marginLeft: 6,
  },
  threadOrder: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  threadOrderBold: {
    fontWeight: '700',
    color: '#111827',
  },
  threadLastMsg: {
    fontSize: 13,
    color: '#4B5563',
    marginTop: 2,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  emptySubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
  },
});

