// screens/NotificationsTab.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

const STORAGE_KEY = '@notifications_v1';
  
const seedNotifications = () => ([
  {
    id: 'n-1005',
    title: 'Order #10234 delivered',
    body: 'Your order was completed successfully. Great job keeping up!',
    time: '2m',
    type: 'success', // success | order | warning | payout | system | promo
    read: false,
  },
  {
    id: 'n-1004',
    title: 'New order #10235',
    body: '2× Chicken Rice, 1× Iced Tea • Total Nu 27.50',
    time: '5m',
    type: 'order',
    read: false,
  },
  {
    id: 'n-1003',
    title: 'Payout initiated',
    body: 'Nu 1,240.00 will arrive in your bank within 1–2 business days.',
    time: '1h',
    type: 'payout',
    read: true,
  },
  {
    id: 'n-1002',
    title: 'Menu item low stock',
    body: 'Beef Burger is running low. Consider updating availability.',
    time: '2h',
    type: 'warning',
    read: true,
  },
  {
    id: 'n-1001',
    title: 'Welcome to Merchant!',
    body: 'Set up your menu and start accepting orders.',
    time: '1d',
    type: 'system',
    read: true,
  },
]);

const typeIcon = (type) => {
  switch (type) {
    case 'order':   return 'receipt-outline';
    case 'success': return 'checkmark-circle-outline';
    case 'warning': return 'alert-circle-outline';
    case 'payout':  return 'card-outline';
    case 'promo':   return 'pricetags-outline';
    default:        return 'notifications-outline';
  }
};

const typeTint = (type) => {
  switch (type) {
    case 'order':   return '#2563eb';
    case 'success': return '#10b981';
    case 'warning': return '#f59e0b';
    case 'payout':  return '#14b8a6';
    case 'promo':   return '#a855f7';
    default:        return '#0ea5e9';
  }
};

export default function NotificationsTab({ isTablet = false }) {
  const [list, setList] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // first load
  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          setList(Array.isArray(parsed) ? parsed : seedNotifications());
        } catch {
          setList(seedNotifications());
        }
      } else {
        const seeded = seedNotifications();
        setList(seeded);
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      }
    })();
  }, []);

  const persist = useCallback(async (next) => {
    setList(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch { /* no-op */ }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // here you could call your backend for fresh notifications
    // we’ll just simulate a quick refresh
    await new Promise((r) => setTimeout(r, 600));
    setRefreshing(false);
  }, []);

  const onEndReached = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    // simulate pagination
    await new Promise((r) => setTimeout(r, 600));
    setLoadingMore(false);
  }, [loadingMore]);

  const unreadCount = useMemo(() => list.filter((n) => !n.read).length, [list]);

  const markAllRead = useCallback(() => {
    const next = list.map((n) => ({ ...n, read: true }));
    persist(next);
  }, [list, persist]);

  const clearAll = useCallback(() => {
    persist([]);
  }, [persist]);

  const toggleRead = useCallback((id) => {
    const next = list.map((n) => (n.id === id ? { ...n, read: !n.read } : n));
    persist(next);
  }, [list, persist]);

  const renderItem = ({ item }) => (
    <TouchableOpacity onPress={() => toggleRead(item.id)} activeOpacity={0.7} style={styles.itemWrap}>
      <View style={[styles.iconWrap, { backgroundColor: typeTint(item.type) + '22' }]}>
        <Ionicons name={typeIcon(item.type)} size={22} color={typeTint(item.type)} />
      </View>
      <View style={styles.itemTextWrap}>
        <View style={styles.itemTopRow}>
          <Text style={[styles.itemTitle, !item.read && styles.itemTitleUnread]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.time}>{item.time}</Text>
        </View>
        <Text style={styles.itemBody} numberOfLines={2}>{item.body}</Text>
        {!item.read && <View style={styles.unreadDot} />}
      </View>
    </TouchableOpacity>
  );

  const ListHeader = () => (
    <View style={styles.headerTools}>
      <View style={styles.headerTitleRow}>
        <Text style={[styles.title, { fontSize: isTablet ? 22 : 18 }]}>Notifications</Text>
        {unreadCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unreadCount}</Text>
          </View>
        )}
      </View>
      <View style={styles.actionsRow}>
        <TouchableOpacity onPress={markAllRead} style={styles.actionBtn}>
          <Ionicons name="checkmark-done-outline" size={16} color="#00b14f" />
          <Text style={styles.actionText}>Mark all read</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={clearAll} style={styles.actionBtn}>
          <Ionicons name="trash-outline" size={16} color="#ef4444" />
          <Text style={[styles.actionText, { color: '#ef4444' }]}>Clear all</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const Empty = () => (
    <View style={styles.emptyWrap}>
      <Ionicons name="notifications-off-outline" size={32} color="#9ca3af" />
      <Text style={styles.emptyTitle}>You’re all caught up</Text>
      <Text style={styles.emptyBody}>New notifications will appear here.</Text>
    </View>
  );

  return (
    <View style={styles.wrap}>
      <FlatList
        data={list}
        keyExtractor={(it) => it.id}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={Empty}
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        onEndReachedThreshold={0.3}
        onEndReached={onEndReached}
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footerLoad}>
              <ActivityIndicator />
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#f6f7f8' },

  headerTools: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#f6f7f8',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  title: { fontWeight: '700', color: '#111827' },
  badge: {
    backgroundColor: '#00b14f',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: { color: '#fff', fontWeight: '700', fontSize: 12 },

  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  actionText: { color: '#00b14f', fontWeight: '600' },

  sep: { height: 1, backgroundColor: '#e5e7eb', marginLeft: 16 },

  itemWrap: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  itemTextWrap: { flex: 1, justifyContent: 'center' },
  itemTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemTitle: { color: '#111827', fontWeight: '600' },
  itemTitleUnread: { fontWeight: '800' },
  itemBody: { color: '#4b5563', marginTop: 2 },
  time: { color: '#6b7280', marginLeft: 8, fontSize: 12 },

  unreadDot: {
    position: 'absolute',
    right: 0,
    top: 4,
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#00b14f',
  },

  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  emptyTitle: { color: '#111827', fontWeight: '700' },
  emptyBody: { color: '#6b7280' },
});
