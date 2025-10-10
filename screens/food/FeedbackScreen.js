// screens/foods/RestaurantFeedbackScreen.js
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, FlatList,
  RefreshControl, ActivityIndicator, Platform
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { FEEDBACK_ENDPOINT } from '@env';

/* ============ helpers (kept) ============ */
function normalizeHost(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    if (Platform.OS === 'android' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) {
      u.hostname = '10.0.2.2';
    }
    return u.toString();
  } catch {
    return url;
  }
}
async function fetchJSON(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch {}
    if (!res.ok) {
      throw new Error((json && (json.error || json.message)) || text || `HTTP ${res.status}`);
    }
    return json;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Navigate with:
 * navigation.navigate('RestaurantFeedback', {
 *   business_id: merchant.business_id,     // REQUIRED
 *   business_name: merchant.business_name, // optional (header)
 * });
 */
export default function RestaurantFeedbackScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const businessId = String(route?.params?.business_id ?? '');
  const businessName = route?.params?.business_name || '';

  const endpoint = useMemo(() => normalizeHost(FEEDBACK_ENDPOINT || ''), []);
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);      // optional if your API supports cursor
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);

  const headerTopPad = Math.max(insets.top, 8) + 18;

  const load = useCallback(async (opts = { reset: false }) => {
    if (!endpoint || !businessId) return;
    try {
      if (opts.reset) {
        setLoading(true);
        setCursor(null);
      } else if (cursor === undefined) {
        // No more pages
        return;
      }

      // Only the essentials: we fetch by business_id; status/tabs removed
      const q = new URLSearchParams();
      q.set('business_id', businessId);
      q.set('limit', '20');
      if (!opts.reset && cursor) q.set('cursor', cursor);

      const url = `${endpoint}?${q.toString()}`;
      const data = await fetchJSON(url);

      // Accept array or {items, nextCursor}
      const listRaw = Array.isArray(data) ? data : (data?.items || []);
      // Normalize ONLY the fields we care about
      const list = listRaw.map((it, idx) => ({
        id: it.id ?? `${it.user_id || 'u'}_${it.menu_id || 'm'}_${idx}`,
        menu_id: it.menu_id,
        user_id: it.user_id,
        rating: it.rating,
        comment: it.comment,
        created_at: it.created_at || it.createdAt || null,
      }));

      const next = Array.isArray(data) ? undefined : (data?.nextCursor ?? undefined);

      setItems(prev => opts.reset ? list : [...prev, ...list]);
      setCursor(next); // undefined means no more
    } catch (e) {
      Alert.alert('Load failed', e?.message || 'Unable to load feedback.');
    } finally {
      setLoading(false);
      setRefreshing(false);
      setInitialLoad(false);
    }
  }, [endpoint, businessId, cursor]);

  useEffect(() => {
    setItems([]);
    setCursor(null);
    setInitialLoad(true);
    load({ reset: true });
  }, [businessId]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load({ reset: true });
  }, [load]);

  const loadMore = useCallback(() => {
    if (!loading && cursor !== undefined) load();
  }, [loading, cursor, load]);

  /* ======== Render ======== */
  const renderItem = ({ item }) => {
    const created = item.created_at ? new Date(item.created_at) : null;
    return (
      <View style={styles.card}>
        {/* Rating */}
        <View style={styles.cardHead}>
          <View style={styles.ratingPill}>
            <Ionicons name="star" size={14} color="#f59e0b" />
            <Text style={styles.ratingText}>{Number(item.rating ?? 0)}/5</Text>
          </View>
          {created ? (
            <Text style={styles.cardTime}>{created.toLocaleString()}</Text>
          ) : null}
        </View>

        {/* Comment */}
        <Text style={styles.cardBody}>{item.comment || ''}</Text>

        {/* Tiny meta */}
        <Text style={styles.cardMeta}>
          menu_id: {String(item.menu_id ?? '')} • user_id: {String(item.user_id ?? '')}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['left','right','bottom']}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: headerTopPad }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.title}>{businessName ? `${businessName} Feedback` : 'Feedback'}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* List (only) */}
      <FlatList
        data={items}
        keyExtractor={(it, idx) => String(it.id ?? idx)}
        contentContainerStyle={styles.listPad}
        renderItem={renderItem}
        ListEmptyComponent={!initialLoad && !loading ? (
          <View style={styles.empty}>
            <Ionicons name="mail-open-outline" size={36} color="#94a3b8" />
            <Text style={styles.emptyText}>No feedback yet.</Text>
          </View>
        ) : null}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        onEndReachedThreshold={0.3}
        onEndReached={loadMore}
        ListFooterComponent={
          loading ? (
            <View style={{ paddingVertical: 16 }}><ActivityIndicator /></View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

/* ============ styles (trimmed) ============ */
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },

  header: {
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
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: '#0f172a' },

  listPad: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10 },

  card: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 12, marginVertical: 6, backgroundColor: '#fff' },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  ratingPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fed7aa' },
  ratingText: { color: '#92400e', fontWeight: '800' },
  cardTime: { color: '#64748b', fontSize: 12 },
  cardBody: { color: '#0f172a', fontSize: 15, marginBottom: 6 },
  cardMeta: { color: '#64748b', fontSize: 12 },

  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 36 },
  emptyText: { color: '#64748b', marginTop: 10, fontWeight: '600' },
});
