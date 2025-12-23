// services/marts/NearbyClusterOrdersScreen.js
// ✅ STATUS TAB ROW (side-by-side) to filter orders inside a cluster
// ✅ Tabs focus is GREEN
// ✅ Track button ENABLES if ANY cluster order is in trackable range (ASSIGNED/ON ROAD/DELIVERED),
//    even if "lastBatch" is not created in this session.
// ✅ If lastBatch exists, Track prefers batch orders; otherwise it tracks the cluster trackable orders.
// ✅ Track screen gets centerCoords so it can show ONE "Open map" button for the cluster.
//
// ✅ FIX (Deliver in group redirect):
// - Accepts focusOrderId from OrderDetails.
// - If orders were not passed, it will immediately open OrderDetails using focusOrderId
//   (OrderDetails will hydrate from ordersGroupedUrl / ORDER_ENDPOINT).
// - When opening OrderDetails from THIS screen, it passes clusterParams so OrderDetails can
//   reliably navigate back to this screen and keep the cluster context.

import React, { useCallback, useMemo, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  DeviceEventEmitter,
  Alert,
  RefreshControl,
} from 'react-native';
import { useNavigation, useRoute, CommonActions } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import {
  ORDER_ENDPOINT as ENV_ORDER_ENDPOINT,
  GROUP_NEARBY_ORDER_ENDPOINT as ENV_GROUP_NEARBY_ORDER_ENDPOINT,
} from '@env';

/* ---------------- helpers: coords ---------------- */

const extractCoords = (order = {}) => {
  if (
    order.coords &&
    Number.isFinite(Number(order.coords.lat)) &&
    Number.isFinite(Number(order.coords.lng))
  ) {
    return { lat: Number(order.coords.lat), lng: Number(order.coords.lng) };
  }

  const base = order.raw || order;

  const candidates = [
    { lat: base.delivery_lat, lng: base.delivery_lng },
    { lat: base.delivery_latitude, lng: base.delivery_longitude },
    { lat: base.delivery_latitude, lng: base.delivery_lon },
    { lat: base.deliveryLatitude, lng: base.deliveryLongitude },
    { lat: base.lat, lng: base.lng },
    { lat: base.latitude, lng: base.longitude },
    { lat: base.lat, lng: base.long },
    // ✅ also support deliver_to shape (common in your newer payloads)
    { lat: base.deliver_to?.lat, lng: base.deliver_to?.lng },
    { lat: base.delivery_address?.lat, lng: base.delivery_address?.lng },
  ];

  for (const c of candidates) {
    const lat = Number(c.lat);
    const lng = Number(c.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }

  return null;
};

const distanceKm = (a, b) => {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

/* ---------------- helpers: address ---------------- */

const getOrderAddressText = (order = {}) => {
  const rawAddr = order.delivery_address ?? order.raw?.delivery_address;

  if (typeof rawAddr === 'string' && rawAddr.trim().length > 0) return rawAddr.trim();

  if (rawAddr && typeof rawAddr === 'object') {
    if (typeof rawAddr.address === 'string' && rawAddr.address.trim().length > 0)
      return rawAddr.address.trim();
    if (typeof rawAddr.formatted === 'string' && rawAddr.formatted.trim().length > 0)
      return rawAddr.formatted.trim();
    if (typeof rawAddr.label === 'string' && rawAddr.label.trim().length > 0)
      return rawAddr.label.trim();
  }

  const base = order.raw || order;

  if (typeof base.address === 'string' && base.address.trim().length > 0) return base.address.trim();
  if (typeof base.general_place === 'string' && base.general_place.trim().length > 0)
    return base.general_place.trim();

  if (typeof base.deliver_to?.address === 'string' && base.deliver_to.address.trim().length > 0)
    return base.deliver_to.address.trim();

  return '';
};

/* ---------------- helpers: ids + endpoint ---------------- */

const getOrderId = (order = {}) => {
  const base = order.raw || order;
  const cand = [base.order_id, base.id, base.orderId, base.order_no, base.orderNo, base.order_code];
  for (const v of cand) {
    if (v != null && String(v).trim().length > 0) return String(v).trim();
  }
  return null;
};

const getNumericOrderId = (order = {}) => {
  const base = order.raw || order;

  const candidates = [
    base.order_db_id,
    base.db_id,
    base.order_table_id,
    base.numeric_order_id,
    base.order_numeric_id,
    base.orderIdNumeric,
    base.order_id_numeric,
    base.id,
  ];

  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return Math.trunc(n);
  }
  return null;
};

const buildGroupedOrdersUrl = (businessId) => {
  if (!businessId) return null;
  const tmpl = String(ENV_ORDER_ENDPOINT || '').trim();
  if (!tmpl) return null;

  if (tmpl.includes('{businessId}')) return tmpl.replace('{businessId}', encodeURIComponent(businessId));
  if (tmpl.includes(':businessId')) return tmpl.replace(':businessId', encodeURIComponent(businessId));
  if (tmpl.includes(':business_id')) return tmpl.replace(':business_id', encodeURIComponent(businessId));

  return `${tmpl.replace(/\/+$/, '')}/${encodeURIComponent(businessId)}`;
};

/* ---------------- status helpers ---------------- */

const normalizeStatus = (raw) => {
  if (!raw) return null;
  const s = String(raw).toUpperCase().trim();

  if (s === 'OUT_FOR_DEL' || s === 'DELIVERING' || s === 'ON ROAD' || s === 'ON_ROAD')
    return 'OUT_FOR_DELIVERY';
  if (s === 'ACCEPT') return 'ACCEPTED';

  return s;
};

const statusKeyToLabel = (statusKey) => {
  if (!statusKey) return '';
  if (statusKey === 'OUT_FOR_DELIVERY') return 'On Road';
  return String(statusKey)
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
};

const getLatestStatusNorm = (order, statusMap) => {
  const id = getOrderId(order);
  const fromMap = id ? statusMap[id] : null;
  const raw = fromMap || order.status || order.raw?.status || null;
  return normalizeStatus(raw);
};

const isReadyToDeliveredRange = (statusNorm) => {
  const s = String(statusNorm || '').toUpperCase().trim();
  if (!s) return false;

  if (s === 'READY') return true;
  if (s === 'ASSIGNED' || s === 'RIDER_ASSIGNED' || s === 'DRIVER_ASSIGNED') return true;
  if (s === 'OUT_FOR_DELIVERY') return true;
  if (s === 'DELIVERED' || s === 'COMPLETED' || s === 'COMPLETE') return true;

  return false;
};

const isTrackableStatus = (statusNorm) => {
  const s = String(statusNorm || '').toUpperCase().trim();
  return (
    s === 'ASSIGNED' ||
    s === 'RIDER_ASSIGNED' ||
    s === 'DRIVER_ASSIGNED' ||
    s === 'OUT_FOR_DELIVERY' ||
    s === 'DELIVERED' ||
    s === 'COMPLETED' ||
    s === 'COMPLETE'
  );
};

const STATUS_COLORS = {
  READY: '#16a34a',
  ASSIGNED: '#f59e0b',
  RIDER_ASSIGNED: '#f59e0b',
  DRIVER_ASSIGNED: '#f59e0b',
  OUT_FOR_DELIVERY: '#2563eb',
  DELIVERED: '#0ea5e9',
  COMPLETED: '#0ea5e9',
  COMPLETE: '#0ea5e9',
};

/* ---------------- batch helpers ---------------- */

const pickBatchId = (json) =>
  json?.batch_id ?? json?.data?.batch_id ?? json?.batchId ?? json?.data?.batchId ?? null;

const pickBatchOrderIds = (json) => {
  const arr =
    json?.order_ids ??
    json?.data?.order_ids ??
    json?.orderIds ??
    json?.data?.orderIds ??
    json?.orders ??
    json?.data?.orders ??
    null;

  if (!Array.isArray(arr)) return [];
  return arr.map((x) => String(x)).filter(Boolean);
};

const safeText = (t) => (t == null ? '' : String(t));
const logLong = (label, text) => {
  const s = safeText(text);
  console.log(label, s.length > 1500 ? `${s.slice(0, 1500)}... (truncated)` : s);
};

/* ---------------- screen ---------------- */

export default function NearbyClusterOrdersScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();

  const {
    label,
    addrPreview,
    orders = [],
    thresholdKm = 5,
    businessId,
    ownerType,
    delivery_option,
    detailsRoute = 'OrderDetails',
    centerCoords: centerCoordsFromParams,
    nextTrackScreen = 'TrackBatchOrdersScreen',

    // ✅ NEW: used when coming from OrderDetails "Deliver in group"
    focusOrderId, // order_code/order_id to open
    ordersGroupedUrl, // optional (OrderDetails might use it)
  } = route.params || {};

  const [clusterOrders] = useState(Array.isArray(orders) ? orders : []);
  const [statusMap, setStatusMap] = useState({});
  const [creatingBatch, setCreatingBatch] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [lastBatch, setLastBatch] = useState(null); // { batch_id, order_ids: [] }

  // ✅ If screen opened with focusOrderId but without orders, immediately open OrderDetails
  useEffect(() => {
    if (clusterOrders.length) return;
    if (!focusOrderId) return;

    // Go straight to details (OrderDetails will hydrate using ORDER_ENDPOINT / ordersGroupedUrl)
    navigation.dispatch(
      CommonActions.navigate({
        name: detailsRoute,
        params: {
          orderId: String(focusOrderId),
          order: null,
          businessId,
          ownerType,
          delivery_option,
          ordersGroupedUrl: ordersGroupedUrl || null,

          // keep context so "Deliver in group" keeps coming back here
          clusterParams: {
            screenName: route.name,
            label,
            addrPreview,
            orders: [], // none available in this path
            thresholdKm,
            businessId,
            ownerType,
            delivery_option,
            detailsRoute,
            centerCoords: centerCoordsFromParams || null,
            nextTrackScreen,
            ordersGroupedUrl: ordersGroupedUrl || null,
          },
        },
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusterOrders.length, focusOrderId]);

  const centerCoords = useMemo(() => {
    if (
      centerCoordsFromParams &&
      Number.isFinite(Number(centerCoordsFromParams.lat)) &&
      Number.isFinite(Number(centerCoordsFromParams.lng))
    ) {
      return { lat: Number(centerCoordsFromParams.lat), lng: Number(centerCoordsFromParams.lng) };
    }

    const coordsList = [];
    for (const o of clusterOrders) {
      const c = extractCoords(o);
      if (c) coordsList.push(c);
    }
    if (!coordsList.length) return null;

    const sum = coordsList.reduce(
      (acc, cur) => ({ lat: acc.lat + cur.lat, lng: acc.lng + cur.lng }),
      { lat: 0, lng: 0 }
    );

    return { lat: sum.lat / coordsList.length, lng: sum.lng / coordsList.length };
  }, [clusterOrders, centerCoordsFromParams]);

  const clusterAddress = useMemo(() => {
    if (addrPreview && String(addrPreview).trim().length > 0) return String(addrPreview).trim();
    for (const o of clusterOrders) {
      const addrText = getOrderAddressText(o);
      if (addrText) return addrText;
    }
    return null;
  }, [addrPreview, clusterOrders]);

  const allOrders = useMemo(() => clusterOrders, [clusterOrders]);

  const baseListOrders = useMemo(() => {
    return (clusterOrders || []).filter((o) => {
      const s = getLatestStatusNorm(o, statusMap);
      return isReadyToDeliveredRange(s);
    });
  }, [clusterOrders, statusMap]);

  const statusTabs = useMemo(() => {
    const counts = {};
    for (const o of baseListOrders) {
      const s = getLatestStatusNorm(o, statusMap);
      if (!s) continue;
      counts[s] = (counts[s] || 0) + 1;
    }

    const preferred = ['READY', 'ASSIGNED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED', 'COMPLETE'];

    const tabs = [{ key: 'ALL', label: 'All', count: baseListOrders.length }];

    for (const k of preferred) {
      if (counts[k]) tabs.push({ key: k, label: statusKeyToLabel(k), count: counts[k] });
    }

    const extra = Object.keys(counts)
      .filter((k) => !preferred.includes(k))
      .sort((a, b) => a.localeCompare(b));

    for (const k of extra) {
      tabs.push({ key: k, label: statusKeyToLabel(k), count: counts[k] });
    }

    return tabs;
  }, [baseListOrders, statusMap]);

  const filteredOrders = useMemo(() => {
    if (selectedStatus === 'ALL') return baseListOrders;

    return baseListOrders.filter((o) => {
      const s = getLatestStatusNorm(o, statusMap);
      return String(s || '') === String(selectedStatus);
    });
  }, [baseListOrders, selectedStatus, statusMap]);

  const readyOrders = useMemo(
    () => allOrders.filter((o) => getLatestStatusNorm(o, statusMap) === 'READY'),
    [allOrders, statusMap]
  );

  /* ----- fetch latest statuses using ORDER_ENDPOINT ----- */

  const loadStatuses = useCallback(async () => {
    const url = buildGroupedOrdersUrl(businessId);
    if (!url) return;

    try {
      const token = await SecureStore.getItemAsync('auth_token');
      const headers = { Accept: 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(url, { headers });
      if (!res.ok) {
        console.log('NearbyClusterOrdersScreen status fetch failed', res.status);
        return;
      }
      const json = await res.json();
      if (!json) return;

      const nextMap = {};
      const rawData = Array.isArray(json?.data) ? json.data : json;

      if (Array.isArray(rawData)) {
        for (const block of rawData) {
          if (block && Array.isArray(block.orders)) {
            for (const o of block.orders) {
              const id = getOrderId(o);
              if (!id) continue;
              const status = o.status || o.order_status || o.current_status || o.orderStatus;
              if (status) nextMap[id] = status;
            }
          } else {
            const id = getOrderId(block);
            if (!id) continue;
            const status = block.status || block.order_status || block.current_status || block.orderStatus;
            if (status) nextMap[id] = status;
          }
        }
      }

      setStatusMap(nextMap);
    } catch (err) {
      console.log('NearbyClusterOrdersScreen status fetch error', err);
    }
  }, [businessId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await loadStatuses();
    })();
    return () => {
      cancelled = true;
    };
  }, [loadStatuses]);

  const onRefresh = useCallback(async () => {
    if (creatingBatch) return;
    setRefreshing(true);
    try {
      await loadStatuses();
    } finally {
      setRefreshing(false);
    }
  }, [creatingBatch, loadStatuses]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('order-updated', ({ id, patch }) => {
      if (!id) return;
      const key = String(id);
      const newStatus = patch?.status || patch?.order_status || patch?.current_status || null;
      if (!newStatus) return;
      setStatusMap((prev) => ({ ...prev, [key]: newStatus }));
    });

    return () => sub?.remove?.();
  }, []);

  // ✅ cluster context passed into OrderDetails (so Deliver in group always works)
  const buildClusterParamsForDetails = useCallback(
    () => ({
      screenName: route.name,
      label,
      addrPreview: clusterAddress || addrPreview || null,
      orders: clusterOrders,
      thresholdKm,
      businessId,
      ownerType,
      delivery_option,
      detailsRoute,
      centerCoords: centerCoordsFromParams || centerCoords || null,
      nextTrackScreen,
      ordersGroupedUrl: ordersGroupedUrl || null,
    }),
    [
      route.name,
      label,
      clusterAddress,
      addrPreview,
      clusterOrders,
      thresholdKm,
      businessId,
      ownerType,
      delivery_option,
      detailsRoute,
      centerCoordsFromParams,
      centerCoords,
      nextTrackScreen,
      ordersGroupedUrl,
    ]
  );

  const openOrderDetails = useCallback(
    (order) => {
      const baseOrder = order.raw || order;
      const orderId = getOrderId(order) || getOrderId(baseOrder);
      const statusFromMap = orderId ? statusMap[orderId] : undefined;

      const mergedOrder = {
        ...baseOrder,
        status:
          statusFromMap ??
          baseOrder.status ??
          baseOrder.order_status ??
          baseOrder.current_status ??
          baseOrder.orderStatus,
      };

      navigation.navigate(detailsRoute, {
        orderId,
        order: mergedOrder,
        businessId,
        ownerType,
        delivery_option,
        ordersGroupedUrl: ordersGroupedUrl || null,

        // ✅ crucial for Deliver in group back navigation
        clusterParams: buildClusterParamsForDetails(),
      });
    },
    [
      navigation,
      businessId,
      ownerType,
      delivery_option,
      detailsRoute,
      statusMap,
      ordersGroupedUrl,
      buildClusterParamsForDetails,
    ]
  );

  /* ----- create batch & navigate on "Ready for delivery" ----- */

  const createBatchForReadyOrders = useCallback(async () => {
    const url = String(ENV_GROUP_NEARBY_ORDER_ENDPOINT || '').trim();
    if (!url) {
      Alert.alert('Configuration error', 'GROUP_NEARBY_ORDER_ENDPOINT is not configured.');
      return;
    }

    if (!businessId) {
      Alert.alert('Missing business', 'Business ID / merchant ID is missing.');
      return;
    }

    const orderCodes = readyOrders
      .map((o) => getOrderId(o) || o?.id)
      .map((x) => (x == null ? '' : String(x).trim()))
      .filter(Boolean);

    if (!orderCodes.length) {
      Alert.alert('No order IDs', 'Unable to find valid order IDs for the ready orders.');
      return;
    }

    const numericIds = readyOrders.map((o) => getNumericOrderId(o)).filter((x) => x != null);
    const token = await SecureStore.getItemAsync('auth_token');

    const payload = {
      merchant_id: Number.isFinite(Number(businessId)) ? Number(businessId) : businessId,
      business_id: Number.isFinite(Number(businessId)) ? Number(businessId) : businessId,
      order_codes: orderCodes,
      order_ids: orderCodes,
      ...(numericIds.length ? { order_ids_numeric: numericIds } : {}),
      owner_type: ownerType || undefined,
      delivery_option: delivery_option || undefined,
    };

    try {
      setCreatingBatch(true);

      const headers = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      const bodyText = await res.text();
      logLong('[BATCH] response body:', bodyText);

      let bodyJson = null;
      try {
        bodyJson = bodyText ? JSON.parse(bodyText) : null;
      } catch {}

      if (!res.ok) {
        const msg =
          bodyJson?.message ||
          bodyJson?.error ||
          bodyJson?.details ||
          bodyText ||
          `Server returned status ${res.status}.`;
        Alert.alert('Failed to create batch', safeText(msg));
        return;
      }

      const json = bodyJson || null;
      const batchId = pickBatchId(json);
      const batchOrderIds = pickBatchOrderIds(json);

      setLastBatch({
        batch_id: batchId,
        order_ids: batchOrderIds.length ? batchOrderIds : orderCodes,
      });

      navigation.navigate('ClusterDeliveryOptionsScreen', {
        label,
        businessId,
        ownerType,
        delivery_option,
        centerCoords: centerCoordsFromParams || centerCoords,
        readyOrders,
        batch_id: batchId,
        batch_order_ids: batchOrderIds.length ? batchOrderIds : orderCodes,
        batchResponse: json,
      });
    } catch (err) {
      console.log('Batch create error', err);
      Alert.alert('Network error', String(err?.message || err));
    } finally {
      setCreatingBatch(false);
    }
  }, [
    businessId,
    centerCoords,
    centerCoordsFromParams,
    delivery_option,
    label,
    navigation,
    ownerType,
    readyOrders,
  ]);

  const onReadyForDeliveryPress = useCallback(() => {
    const count = readyOrders.length;
    if (count === 0) {
      Alert.alert('No ready orders', 'There are no orders in READY status in this cluster yet.');
      return;
    }

    Alert.alert(
      'Deliver all ready orders?',
      `There ${count === 1 ? 'is' : 'are'} ${count} Order${count === 1 ? '' : 's'} ready.\nCreate delivery batch now?`,
      [
        { text: 'No', style: 'cancel' },
        { text: 'Yes', onPress: createBatchForReadyOrders },
      ],
      { cancelable: true }
    );
  }, [readyOrders, createBatchForReadyOrders]);

  /* ---------------- ✅ Track logic (fixed) ---------------- */

  const batchOrderIdSet = useMemo(() => {
    const ids = lastBatch?.order_ids;
    if (!Array.isArray(ids) || !ids.length) return new Set();
    return new Set(ids.map((x) => String(x)));
  }, [lastBatch]);

  const batchOrdersOnly = useMemo(() => {
    if (!batchOrderIdSet.size) return [];
    return allOrders.filter((o) => {
      const id = String(getOrderId(o) || o?.id || '');
      return id && batchOrderIdSet.has(id);
    });
  }, [allOrders, batchOrderIdSet]);

  const clusterTrackableOrders = useMemo(() => {
    return (allOrders || []).filter((o) => isTrackableStatus(getLatestStatusNorm(o, statusMap)));
  }, [allOrders, statusMap]);

  const ordersToTrack = useMemo(() => {
    if (lastBatch?.order_ids?.length && batchOrdersOnly.length) return batchOrdersOnly;
    return clusterTrackableOrders;
  }, [lastBatch, batchOrdersOnly, clusterTrackableOrders]);

  const trackDisabled = creatingBatch || ordersToTrack.length === 0;

  const onTrackOrdersPress = useCallback(() => {
    if (ordersToTrack.length === 0) {
      Alert.alert('Nothing to track', 'No orders are Assigned / On Road / Delivered yet.');
      return;
    }

    navigation.navigate(nextTrackScreen, {
      businessId,
      label,
      orders: ordersToTrack,
      batch_id: lastBatch?.batch_id,
      batch_order_ids: lastBatch?.order_ids,
      selectedMethod: 'GRAB',
      centerCoords: centerCoordsFromParams || centerCoords,
    });
  }, [
    navigation,
    nextTrackScreen,
    businessId,
    label,
    ordersToTrack,
    lastBatch,
    centerCoords,
    centerCoordsFromParams,
  ]);

  /* ---------------- UI render ---------------- */

  const renderStatusTab = ({ item }) => {
    const active = item.key === selectedStatus;

    const bg = active ? '#16a34a' : '#e2e8f0';
    const txt = active ? '#fff' : '#0f172a';

    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => setSelectedStatus(item.key)}
        style={[styles.statusTab, { backgroundColor: bg }]}
      >
        <Text style={[styles.statusTabText, { color: txt }]} numberOfLines={1}>
          {item.label}
        </Text>
        <View style={[styles.statusTabCountPill, { backgroundColor: active ? '#ffffff22' : '#fff' }]}>
          <Text style={[styles.statusTabCountText, { color: active ? '#fff' : '#0f172a' }]}>
            {item.count}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderRow = ({ item }) => {
    const coords = extractCoords(item);
    let distanceLabel = null;

    if (coords && centerCoords) {
      const d = distanceKm(centerCoords, coords);
      distanceLabel = `${d.toFixed(2)} km`;
    }

    const addressText = getOrderAddressText(item);
    const orderId = getOrderId(item);

    const latestStatusRaw = (orderId && statusMap[orderId]) || item.status || item.raw?.status;
    const latestStatusNorm = normalizeStatus(latestStatusRaw);
    const statusLabel = statusKeyToLabel(latestStatusNorm);

    return (
      <TouchableOpacity style={styles.orderRow} activeOpacity={0.7} onPress={() => openOrderDetails(item)}>
        <View style={{ flex: 1 }}>
          <Text style={styles.orderIdText}>#{orderId || item.id}</Text>

          {!!item.customer_name && (
            <Text style={styles.orderCustomerText} numberOfLines={1}>
              {item.customer_name}
            </Text>
          )}

          {!!addressText && (
            <Text style={styles.orderAddressText} numberOfLines={1}>
              {addressText}
            </Text>
          )}
        </View>

        <View style={styles.orderRight}>
          {!!statusLabel && (
            <View
              style={[
                styles.statusChip,
                { backgroundColor: STATUS_COLORS[latestStatusNorm] || '#64748b' },
              ]}
            >
              <Text style={styles.statusChipText} numberOfLines={1}>
                {statusLabel}
              </Text>
            </View>
          )}

          {distanceLabel && <Text style={styles.orderDistanceText}>{distanceLabel}</Text>}
          <Ionicons name="chevron-forward" size={18} color="#94a3b8" style={{ marginLeft: 4 }} />
        </View>
      </TouchableOpacity>
    );
  };

  const headerTopPad = Math.max(insets.top, 8) + 18;

  const readyCount = readyOrders.length;
  const fabDisabled = readyCount === 0 || creatingBatch;
  const fabLabel = creatingBatch ? 'Creating...' : `Ready for delivery (${readyCount})`;

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <View style={[styles.headerBar, { paddingTop: headerTopPad }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#0f172a" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>{label}</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.subHeader}>
        <Text style={styles.headerSubtitleMain}>
          Nearby orders: {filteredOrders.length}
          {centerCoords ? ` (within ~${thresholdKm} km)` : ''}
        </Text>

        {!!clusterAddress && (
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {clusterAddress}
          </Text>
        )}

        {!!ordersToTrack.length && (
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            Trackable: {ordersToTrack.length}
          </Text>
        )}
      </View>

      <View style={styles.tabsWrap}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={statusTabs}
          keyExtractor={(it) => it.key}
          renderItem={renderStatusTab}
          contentContainerStyle={styles.tabsContent}
        />
      </View>

      <FlatList
        data={filteredOrders}
        keyExtractor={(o, idx) => String(getOrderId(o) || o?.id || idx)}
        renderItem={renderRow}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 10,
          paddingBottom: 90,
          gap: 10,
        }}
      />

      <View style={styles.fabWrapper}>
        <View style={styles.fabRow}>
          <TouchableOpacity
            style={[styles.fab, styles.fabHalf, fabDisabled && { opacity: 0.4 }]}
            activeOpacity={fabDisabled ? 1 : 0.8}
            onPress={onReadyForDeliveryPress}
            disabled={fabDisabled}
          >
            <Ionicons name="bicycle" size={18} color="#fff" />
            <Text style={styles.fabText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
              {fabLabel}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.fab, styles.fabHalf, styles.trackFabBg, trackDisabled && { opacity: 0.4 }]}
            activeOpacity={trackDisabled ? 1 : 0.8}
            onPress={onTrackOrdersPress}
            disabled={trackDisabled}
          >
            <Ionicons name="navigate" size={18} color="#fff" />
            <Text style={styles.fabText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
              Track orders
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },

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

  subHeader: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerSubtitleMain: { fontSize: 13, fontWeight: '600', color: '#0f172a' },
  headerSubtitle: { marginTop: 2, fontSize: 12, color: '#64748b' },

  tabsWrap: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  tabsContent: { paddingHorizontal: 16, gap: 10 },
  statusTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  statusTabText: { fontSize: 12, fontWeight: '800' },
  statusTabCountPill: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  statusTabCountText: { fontSize: 11, fontWeight: '900' },

  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  orderIdText: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  orderCustomerText: { marginTop: 2, fontSize: 13, color: '#475569' },
  orderAddressText: { marginTop: 2, fontSize: 12, color: '#64748b' },

  orderRight: { marginLeft: 8, alignItems: 'flex-end' },
  orderDistanceText: { marginTop: 2, fontSize: 11, color: '#94a3b8' },

  statusChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusChipText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
  },

  fabWrapper: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    backgroundColor: 'transparent',
    paddingHorizontal: 16,
  },
  fabRow: { flexDirection: 'row', alignItems: 'center', gap: 12, width: '100%' },
  fabHalf: { flex: 1, justifyContent: 'center' },

  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 15,
    borderRadius: 999,
    backgroundColor: '#16a34a',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  fabText: {
    marginLeft: 8,
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 1,
  },
  trackFabBg: { backgroundColor: '#0ea5e9' },
});
