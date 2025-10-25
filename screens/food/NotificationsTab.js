// screens/NotificationsTab.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import { NOTIFICATIONS_ENDPOINT as ENV_NOTIFS_ENDPOINT } from '@env';

const STORAGE_KEY_READMAP = '@notifications_readmap_v1';

/* ---------------- helpers: business id resolution ---------------- */
const toInt = (v) => {
  const n = Number.parseInt(String(v ?? '').trim(), 10);
  return Number.isFinite(n) ? n : null;
};

// Try, in order:
// 1) route?.params?.business_id
// 2) AsyncStorage 'merchant_login' JSON -> .merchant?.business_id
// 3) SecureStore 'merchant_login' JSON -> .merchant?.business_id
async function resolveBusinessId(routeParams) {
  const fromParams = toInt(routeParams?.business_id ?? routeParams?.businessId);
  if (fromParams != null) return fromParams;

  try {
    const rawAS = await AsyncStorage.getItem('merchant_login');
    if (rawAS) {
      const parsed = JSON.parse(rawAS);
      const id = toInt(
        parsed?.merchant?.business_id ??
        parsed?.merchant?.businessId ??
        parsed?.business_id ??
        parsed?.businessId
      );
      if (id != null) return id;
    }
  } catch {}

  try {
    const rawSS = await SecureStore.getItemAsync('merchant_login');
    if (rawSS) {
      const parsed = JSON.parse(rawSS);
      const id = toInt(
        parsed?.merchant?.business_id ??
        parsed?.merchant?.businessId ??
        parsed?.business_id ??
        parsed?.businessId
      );
      if (id != null) return id;
    }
  } catch {}

  return null;
}

const trimSlashes = (s = '') => String(s).replace(/\/+$/, '');
const NOTIFS_BASE = trimSlashes(String(ENV_NOTIFS_ENDPOINT || ''));

/** Replace `{business_id}` token in the env URL */
const buildNotificationsUrl = (businessId) =>
  NOTIFS_BASE ? NOTIFS_BASE.replace('{business_id}', String(businessId)) : null;

/* ---------------- UI helpers ---------------- */
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

const timeAgo = (isoOrDateLike) => {
  try {
    const t = new Date(isoOrDateLike).getTime();
    if (!Number.isFinite(t)) return '';
    const s = Math.max(1, Math.floor((Date.now() - t) / 1000));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    return `${d}d`;
  } catch { return ''; }
};

/* ---------------- mapping for your API shape ---------------- */
const normalizeType = (raw) => {
  const t = String(raw || '').toLowerCase();
  if (t.startsWith('order')) return 'order';      // "order:create", "order:status", etc.
  if (t.includes('payout')) return 'payout';
  if (t.includes('warn')) return 'warning';
  if (t.includes('success')) return 'success';
  if (t.includes('promo') || t.includes('offer')) return 'promo';
  return 'system';
};

const mapApiNotif = (n, readMap) => {
  const id =
    String(n.notification_id ??
      n.id ??
      n._id ??
      Math.random().toString(36).slice(2));

  const type = normalizeType(n.type);
  const created = n.created_at ?? n.createdAt ?? n.timestamp ?? null;

  const title = n.title ?? 'Notification';
  let body =
    n.body_preview ??
    n.body ??
    n.message ??
    n.description ??
    '';

  // ✅ Friendly rewrite for "completed" status messages
  // Example from your payload: type: "order:status", body_preview: "Status changed to COMPLETED"
  if (String(n.type).toLowerCase() === 'order:status' &&
      String(body).toLowerCase().includes('status changed to completed')) {
    body = 'Order completed successfully.';
  }

  const readServer = n.is_read ?? n.read ?? n.isRead ?? null; // 0/1 or boolean
  const read =
    readServer == null
      ? Boolean(readMap[id])
      : (String(readServer) === '1' || readServer === true);

  return {
    id,
    title: String(title),
    body: String(body),
    time: created ? timeAgo(created) : '',
    type,
    read,
    _created_at: created ?? null,
  };
};

export default function NotificationsTab({ isTablet = false, route }) {
  const [list, setList] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [bizId, setBizId] = useState(null);
  const readMapRef = useRef({});

  /* ---------- load business id then fetch ---------- */
  useEffect(() => {
    (async () => {
      const id = await resolveBusinessId(route?.params ?? {});
      setBizId(id);
    })();
  }, [route?.params]);

  /* ---------- load saved read map ---------- */
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY_READMAP);
        readMapRef.current = raw ? JSON.parse(raw) : {};
      } catch { readMapRef.current = {}; }
    })();
  }, []);

  const saveReadMap = useCallback(async (next) => {
    readMapRef.current = next;
    try {
      await AsyncStorage.setItem(STORAGE_KEY_READMAP, JSON.stringify(next));
    } catch {}
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (bizId == null) { setList([]); return; }
    const url = buildNotificationsUrl(bizId);
    if (!url) { setList([]); return; }

    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      const text = await res.text();
      let data = {};
      try { data = JSON.parse(text); } catch { data = {}; }

      // Your API: { success, count, data: [...] }
      const arr = Array.isArray(data)
        ? data
        : (Array.isArray(data?.data) ? data.data
          : Array.isArray(data?.notifications) ? data.notifications
          : []);

      const mapped = arr.map((n) => mapApiNotif(n, readMapRef.current));

      mapped.sort((a, b) => {
        const ta = a._created_at ? new Date(a._created_at).getTime() : 0;
        const tb = b._created_at ? new Date(b._created_at).getTime() : 0;
        return tb - ta;
      });

      setList(mapped);
    } catch {
      // keep prior list on error
    }
  }, [bizId]);

  // initial + whenever bizId changes
  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchNotifications();
    setRefreshing(false);
  }, [fetchNotifications]);

  const onEndReached = useCallback(async () => {
    // If your API later supports pagination, implement here.
    if (loadingMore) return;
    setLoadingMore(true);
    await new Promise((r) => setTimeout(r, 300)); // placeholder for future pagination
    setLoadingMore(false);
  }, [loadingMore]);

  const unreadCount = useMemo(() => list.filter((n) => !n.read).length, [list]);

  const applyReadOverlay = useCallback((nextList, nextReadMap) =>
    nextList.map((n) => ({ ...n, read: (n.read ?? false) || Boolean(nextReadMap[n.id]) })),
  []);

  const markAllRead = useCallback(() => {
    const nextReadMap = { ...readMapRef.current };
    for (const n of list) nextReadMap[n.id] = true;
    saveReadMap(nextReadMap);
    setList((cur) => applyReadOverlay(cur, nextReadMap));
  }, [list, saveReadMap, applyReadOverlay]);

  const clearAll = useCallback(() => { setList([]); }, []);

  const toggleRead = useCallback((id) => {
    const nextReadMap = { ...readMapRef.current };
    nextReadMap[id] = !Boolean(nextReadMap[id]);
    saveReadMap(nextReadMap);
    setList((cur) => applyReadOverlay(cur, nextReadMap));
  }, [saveReadMap, applyReadOverlay]);

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

  footerLoad: { paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
});
