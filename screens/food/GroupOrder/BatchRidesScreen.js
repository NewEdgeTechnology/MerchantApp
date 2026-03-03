// ✅ UPDATED BatchRidesScreen (FULL CODE)
// ✅ CHANGE: Show driver as: Delivered by: Name (18)

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { GET_BATCH_RIDE_ID_ENDPOINT, DRIVER_DETAILS_ENDPOINT } from '@env';

const safeStr = (v) => (v == null ? '' : String(v)).trim();

const pickArray = (json) => {
  const a = json?.data ?? json?.batches ?? json?.batchRides ?? json?.items ?? json?.rows ?? json ?? null;
  return Array.isArray(a) ? a : [];
};

const pickBatchId = (x) => x?.batch_id ?? x?.batchId ?? x?.id ?? x?.batch ?? x?.batchID ?? null;
const pickRideId = (x) => x?.ride_id ?? x?.rideId ?? x?.ride ?? x?.rideID ?? x?.rider_id ?? null;

const pickDriverId = (x) =>
  x?.driver_id ??
  x?.driverId ??
  x?.driver?.id ??
  x?.driver?.driver_id ??
  x?.driver?.user_id ??
  x?.driver_user_id ??
  x?.driverUserId ??
  null;

const pickBatchOrderIds = (x) => {
  const arr = x?.order_ids ?? x?.orderIds ?? x?.orders ?? x?.batch_order_ids ?? x?.batchOrderIds ?? null;
  if (!Array.isArray(arr)) return [];
  return arr.map((v) => safeStr(v)).filter(Boolean);
};

const normalizeBatchOrderIdsMap = (v) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const out = {};
  for (const k of Object.keys(v)) {
    const key = safeStr(k);
    if (!key) continue;
    const arr = Array.isArray(v[k]) ? v[k] : [];
    out[key] = arr.map((x) => safeStr(x)).filter(Boolean);
  }
  return out;
};

const buildBatchRideUrl = (endpoint, businessId) => {
  const base = safeStr(endpoint);
  const bid = safeStr(businessId);
  if (!base) return '';

  const hasPlaceholder =
    base.includes('{business_id}') ||
    base.includes('{businessId}') ||
    /:business_id\b/i.test(base) ||
    /:businessId\b/i.test(base);

  if (bid && hasPlaceholder) {
    return base
      .replace(/\{\s*business_id\s*\}/gi, encodeURIComponent(bid))
      .replace(/\{\s*businessId\s*\}/g, encodeURIComponent(bid))
      .replace(/:business_id\b/gi, encodeURIComponent(bid))
      .replace(/:businessId\b/g, encodeURIComponent(bid));
  }

  if (bid && !/business_id=/i.test(base)) {
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}business_id=${encodeURIComponent(bid)}`;
  }

  return base;
};

const buildDriverDetailsUrl = (endpoint, driverId) => {
  const base = safeStr(endpoint);
  const did = safeStr(driverId);
  if (!base || !did) return '';

  const hasPlaceholder =
    base.includes('{driverId}') ||
    base.includes('{driver_id}') ||
    /:driverId\b/i.test(base) ||
    /:driver_id\b/i.test(base);

  if (hasPlaceholder) {
    return base
      .replace(/\{\s*driverId\s*\}/g, encodeURIComponent(did))
      .replace(/\{\s*driver_id\s*\}/gi, encodeURIComponent(did))
      .replace(/:driverId\b/gi, encodeURIComponent(did))
      .replace(/:driver_id\b/gi, encodeURIComponent(did));
  }

  if (!/driverId=/i.test(base) && !/driver_id=/i.test(base)) {
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}driverId=${encodeURIComponent(did)}`;
  }

  return base;
};

const pickDriverNameFromJson = (json) => {
  const d = json?.details ?? json?.data ?? json?.driver ?? json ?? null;
  if (!d || typeof d !== 'object') return '';
  return safeStr(d.user_name ?? d.name ?? d.full_name ?? d.fullName ?? d.username ?? '');
};

export default function BatchRidesScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();

  const {
    businessId: businessIdParam,
    bizId,
    label,
    orders,
    batch_id,
    batch_order_ids,
    selectedMethod,
    centerCoords,
    ownerType,
    delivery_option,
    lastBatch,
    clusterOrders,
    trackScreen = 'TrackBatchOrdersScreen',
  } = route.params || {};

  const businessId = useMemo(() => businessIdParam ?? bizId ?? null, [businessIdParam, bizId]);
  const batchOrderIdsMap = useMemo(() => normalizeBatchOrderIdsMap(batch_order_ids), [batch_order_ids]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  const endpoint = safeStr(GET_BATCH_RIDE_ID_ENDPOINT);
  const driverEndpoint = safeStr(DRIVER_DETAILS_ENDPOINT);
  const buildUrl = useMemo(() => buildBatchRideUrl(endpoint, businessId), [endpoint, businessId]);

  const [driverNameMap, setDriverNameMap] = useState({}); // { [driverId]: name }
  const driverNameRef = useRef({});
  useEffect(() => {
    driverNameRef.current = driverNameMap;
  }, [driverNameMap]);

  const fetchDriverName = useCallback(
    async (driverId) => {
      const did = safeStr(driverId);
      if (!did) return;
      if (driverNameRef.current?.[did]) return;
      if (!driverEndpoint) return;

      try {
        const token = await SecureStore.getItemAsync('auth_token');
        const headers = { Accept: 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;

        const url = buildDriverDetailsUrl(driverEndpoint, did);
        const res = await fetch(url, { headers });
        const text = await res.text();

        let json = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {}

        if (!res.ok) return;

        const name = pickDriverNameFromJson(json);
        if (!name) return;

        setDriverNameMap((prev) => ({ ...prev, [did]: name }));
      } catch {
        // ignore
      }
    },
    [driverEndpoint]
  );

  const load = useCallback(async () => {
    if (!endpoint) {
      setError('GET_BATCH_RIDE_ID_ENDPOINT is missing in .env');
      setLoading(false);
      return;
    }
    if (!safeStr(businessId)) {
      setError('Missing businessId (business_id) for batch ride list.');
      setLoading(false);
      return;
    }

    setError('');
    setLoading(true);

    try {
      const token = await SecureStore.getItemAsync('auth_token');
      const headers = { Accept: 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(buildUrl, { headers });
      const text = await res.text();

      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {}

      if (!res.ok) {
        const msg = json?.message || json?.error || text || `HTTP ${res.status}`;
        throw new Error(String(msg));
      }

      const arr = pickArray(json);

      const cleanedAll = arr
        .map((x) => {
          const rowBatch = pickBatchId(x);
          const rowRide = pickRideId(x);
          const rowDriver = pickDriverId(x);
          const rowOrders = pickBatchOrderIds(x);

          const batch_id_str = rowBatch != null ? String(rowBatch) : '';
          const ride_id_str = rowRide != null ? String(rowRide) : '';
          const driver_id_str = rowDriver != null ? String(rowDriver) : '';

          let orderCount = -1;
          if (rowOrders.length) orderCount = rowOrders.length;
          else if (batchOrderIdsMap && batch_id_str && Array.isArray(batchOrderIdsMap[batch_id_str])) {
            orderCount = batchOrderIdsMap[batch_id_str].length;
          }

          return {
            raw: x,
            batch_id: batch_id_str,
            ride_id: ride_id_str,
            driver_id: driver_id_str,
            order_ids: rowOrders,
            order_count: orderCount,
          };
        })
        .filter((x) => x.batch_id || x.ride_id);

      const cleaned = cleanedAll.filter((x) => (x.order_count === 0 ? false : true));

      const highlightBatch = safeStr(lastBatch?.batch_id) || safeStr(batch_id) || '';
      if (highlightBatch) {
        cleaned.sort((a, b) => (a.batch_id === highlightBatch ? -1 : b.batch_id === highlightBatch ? 1 : 0));
      }

      setItems(cleaned);

      cleaned.forEach((row) => {
        if (row?.driver_id) fetchDriverName(row.driver_id);
      });
    } catch (e) {
      setError(e?.message || 'Failed to load batch rides.');
    } finally {
      setLoading(false);
    }
  }, [endpoint, businessId, buildUrl, lastBatch?.batch_id, batch_id, batchOrderIdsMap, fetchDriverName]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const headerTopPad = Math.max(insets.top, 8) + 18;

  const openBatchTrack = useCallback(
    (row) => {
      const rowBatchId = safeStr(row?.batch_id) || safeStr(batch_id) || undefined;

      let outgoingBatchOrderIds = undefined;
      if (row?.order_ids?.length) outgoingBatchOrderIds = row.order_ids;
      else if (batchOrderIdsMap && rowBatchId && Array.isArray(batchOrderIdsMap[rowBatchId])) outgoingBatchOrderIds = batchOrderIdsMap[rowBatchId];
      else outgoingBatchOrderIds = batch_order_ids;

      const driverIdStr = safeStr(row?.driver_id) || undefined;
      const driverName = driverIdStr ? driverNameRef.current?.[driverIdStr] || '' : '';

      navigation.navigate(trackScreen, {
        businessId,
        label,
        orders,
        batch_id: rowBatchId,
        batch_order_ids: outgoingBatchOrderIds,
        selectedMethod,
        centerCoords,

        ownerType,
        delivery_option,
        lastBatch,
        clusterOrders,

        ride_id: safeStr(row?.ride_id) || undefined,
        batchRide: row?.raw,

        driver_id: driverIdStr,
        driverId: driverIdStr,
        driverName: driverName || undefined,
      });
    },
    [
      navigation,
      trackScreen,
      businessId,
      label,
      orders,
      batch_id,
      batch_order_ids,
      selectedMethod,
      centerCoords,
      ownerType,
      delivery_option,
      lastBatch,
      clusterOrders,
      batchOrderIdsMap,
    ]
  );

  const renderRow = ({ item }) => {
    const highlightBatch = safeStr(lastBatch?.batch_id) || safeStr(batch_id) || '';
    const highlight = highlightBatch && highlightBatch === item.batch_id;

    const did = safeStr(item.driver_id);
    const name = did ? driverNameMap[did] : '';

    return (
      <TouchableOpacity
        activeOpacity={0.75}
        onPress={() => openBatchTrack(item)}
        style={[styles.row, highlight && styles.rowHighlight]}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>Batch: {item.batch_id || '—'}</Text>
          <Text style={styles.rowSub}>Ride ID: {item.ride_id || '—'}</Text>

          {!!(name || did) && (
            <Text style={styles.rowSub}>
              Delivered by: {name || '—'}{did ? ` (ID: ${did})` : ''}
            </Text>
          )}

          {item.order_count >= 0 && <Text style={styles.rowSub}>Orders: {item.order_count}</Text>}
        </View>

        <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <View style={[styles.header, { paddingTop: headerTopPad }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Batches</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.subHeader}>
        <Text style={styles.subTitle}>
          {label ? `${label} • ` : ''}Total: {items.length}
        </Text>
        {!!businessId && <Text style={styles.subMuted}>Business ID: {String(businessId)}</Text>}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <Text style={styles.muted}>Loading…</Text>
        </View>
      ) : error ? (
        <View style={{ padding: 16 }}>
          <Ionicons name="alert-circle" size={22} color="#ef4444" />
          <Text style={[styles.muted, { marginTop: 8 }]}>{error}</Text>

          <TouchableOpacity
            style={styles.retryBtn}
            activeOpacity={0.85}
            onPress={() => {
              if (!safeStr(businessId)) {
                Alert.alert('Missing businessId', 'Please pass businessId when navigating to BatchRidesScreen.');
                return;
              }
              load();
            }}
          >
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it, idx) => `${it.batch_id || 'x'}:${it.ride_id || 'y'}:${idx}`}
          renderItem={renderRow}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 24 }}
          ListEmptyComponent={<Text style={{ color: '#64748b' }}>No batches found.</Text>}
        />
      )}
    </SafeAreaView>
  );
}

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
    fontWeight: '800',
    color: '#0f172a',
  },

  subHeader: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomColor: '#e5e7eb',
    borderBottomWidth: 1,
  },
  subTitle: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  subMuted: { marginTop: 2, fontSize: 12, color: '#64748b' },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  muted: { color: '#64748b', marginTop: 6 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  rowHighlight: {
    borderColor: '#86efac',
    backgroundColor: '#f0fdf4',
  },
  rowTitle: { fontSize: 14, fontWeight: '900', color: '#0f172a' },
  rowSub: { marginTop: 2, fontSize: 12, color: '#64748b', fontWeight: '700' },

  retryBtn: {
    marginTop: 12,
    backgroundColor: '#16a34a',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  retryText: { color: '#fff', fontWeight: '900' },
});
