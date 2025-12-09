// services/marts/NearbyClusterOrdersScreen.js
// Shows the list of orders for a single nearby cluster (from NearbyOrdersScreen)

import React, {
  useCallback,
  useMemo,
  useEffect,
  useState,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  DeviceEventEmitter,   // listen for order-updated
  Alert,                // ✅ for confirmation dialog
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  ORDER_ENDPOINT as ENV_ORDER_ENDPOINT,
  STATUS_COUNT_ENDPOINT as ENV_STATUS_COUNT,
} from '@env';

/* ---------------- helpers: coords ---------------- */

// orders coming from NearbyOrdersScreen are "decorated":
// { id, raw, coords, general_place, ... }
const extractCoords = (order = {}) => {
  if (
    order.coords &&
    Number.isFinite(Number(order.coords.lat)) &&
    Number.isFinite(Number(order.coords.lng))
  ) {
    return {
      lat: Number(order.coords.lat),
      lng: Number(order.coords.lng),
    };
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
  ];

  for (const c of candidates) {
    const lat = Number(c.lat);
    const lng = Number(c.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }
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

  if (typeof rawAddr === 'string' && rawAddr.trim().length > 0) {
    return rawAddr.trim();
  }

  if (rawAddr && typeof rawAddr === 'object') {
    if (typeof rawAddr.address === 'string' && rawAddr.address.trim().length > 0) {
      return rawAddr.address.trim();
    }
    if (typeof rawAddr.formatted === 'string' && rawAddr.formatted.trim().length > 0) {
      return rawAddr.formatted.trim();
    }
    if (typeof rawAddr.label === 'string' && rawAddr.label.trim().length > 0) {
      return rawAddr.label.trim();
    }
  }

  const base = order.raw || order;

  if (typeof base.address === 'string' && base.address.trim().length > 0) {
    return base.address.trim();
  }

  if (typeof base.general_place === 'string' && base.general_place.trim().length > 0) {
    return base.general_place.trim();
  }

  return '';
};

/* ---------------- helpers: ids + endpoint ---------------- */

const getOrderId = (order = {}) => {
  const base = order.raw || order;
  const cand = [
    base.order_id,
    base.id,
    base.orderId,
    base.order_no,
    base.orderNo,
  ];
  for (const v of cand) {
    if (v != null && String(v).trim().length > 0) {
      return String(v).trim();
    }
  }
  return null;
};

const buildGroupedOrdersUrl = (businessId) => {
  if (!businessId) return null;
  const tmpl = String(ENV_ORDER_ENDPOINT || '').trim();
  if (!tmpl) return null;

  if (tmpl.includes('{businessId}')) {
    return tmpl.replace('{businessId}', encodeURIComponent(businessId));
  }
  if (tmpl.includes(':businessId')) {
    return tmpl.replace(':businessId', encodeURIComponent(businessId));
  }
  if (tmpl.includes(':business_id')) {
    return tmpl.replace(':business_id', encodeURIComponent(businessId));
  }

  // fallback – append businessId
  return `${tmpl.replace(/\/+$/, '')}/${encodeURIComponent(businessId)}`;
};

const buildStatusCountUrl = (businessId) => {
  if (!businessId) return null;
  const tmpl = String(ENV_STATUS_COUNT || '').trim();
  if (!tmpl) return null;

  let url = tmpl;
  url = url.replace('{business_id}', encodeURIComponent(businessId));
  url = url.replace('{businessId}', encodeURIComponent(businessId));
  url = url.replace(':business_id', encodeURIComponent(businessId));
  url = url.replace(':businessId', encodeURIComponent(businessId));

  return url;
};

/* small helper: latest status (normalized) for an order */
const getLatestStatusNorm = (order, statusMap) => {
  const id = getOrderId(order);
  const fromMap = id ? statusMap[id] : null;
  const raw =
    fromMap ||
    order.status ||
    order.raw?.status ||
    null;

  if (!raw) return null;
  return String(raw).toUpperCase().trim();
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
  } = route.params || {};

  // local copy so we COULD mutate later if needed
  const [clusterOrders] = useState(orders || []);

  // map: orderId -> latest status from /orders/orders/business/{businessId}/grouped
  const [statusMap, setStatusMap] = useState({});

  // store-wide status counts (we only care about OUT_FOR_DELIVERY)
  const [statusCounts, setStatusCounts] = useState(null);

  /* ----- fetch latest statuses using ORDER_ENDPOINT (cluster orders) ----- */

  useEffect(() => {
    const url = buildGroupedOrdersUrl(businessId);
    if (!url) return;

    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) {
          console.log('NearbyClusterOrdersScreen status fetch failed', res.status);
          return;
        }
        const json = await res.json();
        if (cancelled || !json) return;

        const nextMap = {};

        // Support { success, data: [ { user, orders:[...] } ] } OR flat arrays
        const rawData = Array.isArray(json?.data) ? json.data : json;

        if (Array.isArray(rawData)) {
          for (const block of rawData) {
            if (block && Array.isArray(block.orders)) {
              for (const o of block.orders) {
                const id = getOrderId(o);
                if (!id) continue;
                const status =
                  o.status ||
                  o.order_status ||
                  o.current_status ||
                  o.orderStatus;
                if (status) {
                  nextMap[id] = status;
                }
              }
            } else {
              const id = getOrderId(block);
              if (!id) continue;
              const status =
                block.status ||
                block.order_status ||
                block.current_status ||
                block.orderStatus;
              if (status) {
                nextMap[id] = status;
              }
            }
          }
        }

        setStatusMap(nextMap);
      } catch (err) {
        console.log('NearbyClusterOrdersScreen status fetch error', err);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [businessId]);

  /* ----- fetch store-wide status counts using STATUS_COUNT_ENDPOINT ----- */

  useEffect(() => {
    const url = buildStatusCountUrl(businessId);
    if (!url) return;

    let cancelled = false;

    const loadCounts = async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) {
          console.log('STATUS_COUNT fetch failed', res.status);
          return;
        }
        const json = await res.json();
        if (cancelled || !json) return;

        setStatusCounts(json);
      } catch (err) {
        console.log('STATUS_COUNT fetch error', err);
      }
    };

    loadCounts();

    return () => {
      cancelled = true;
    };
  }, [businessId]);

  /* ----- listen for in-app updates from OrderDetails (DeviceEventEmitter) ----- */

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('order-updated', ({ id, patch }) => {
      if (!id) return;
      const key = String(id);

      const newStatus =
        patch?.status ||
        patch?.order_status ||
        patch?.current_status ||
        null;

      if (!newStatus) return;

      setStatusMap((prev) => ({
        ...prev,
        [key]: newStatus,
      }));
    });

    return () => sub?.remove?.();
  }, []);

  /* ----- center of this cluster (passed from NearbyOrdersScreen) ----- */

  const centerCoords = useMemo(() => {
    if (
      centerCoordsFromParams &&
      Number.isFinite(Number(centerCoordsFromParams.lat)) &&
      Number.isFinite(Number(centerCoordsFromParams.lng))
    ) {
      return {
        lat: Number(centerCoordsFromParams.lat),
        lng: Number(centerCoordsFromParams.lng),
      };
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

    return {
      lat: sum.lat / coordsList.length,
      lng: sum.lng / coordsList.length,
    };
  }, [clusterOrders, centerCoordsFromParams]);

  const clusterAddress = useMemo(() => {
    if (addrPreview && String(addrPreview).trim().length > 0) {
      return String(addrPreview).trim();
    }

    for (const o of clusterOrders) {
      const addrText = getOrderAddressText(o);
      if (addrText) return addrText;
    }

    return null;
  }, [addrPreview, clusterOrders]);

  // We already did distance-based clustering in NearbyOrdersScreen,
  // so here we just display all orders for this cluster.
  const filteredOrders = useMemo(() => clusterOrders, [clusterOrders]);

  // ✅ cluster-level READY orders
  const readyOrders = useMemo(
    () =>
      filteredOrders.filter((o) => getLatestStatusNorm(o, statusMap) === 'READY'),
    [filteredOrders, statusMap]
  );

  // (still computed if you need later, but not used for the pill now)
  const outForDeliveryOrders = useMemo(
    () =>
      filteredOrders.filter((o) => {
        const s = getLatestStatusNorm(o, statusMap);
        return (
          s === 'OUT_FOR_DELIVERY' ||
          s === 'OUT_FOR_DEL' ||
          s === 'DELIVERING'
        );
      }),
    [filteredOrders, statusMap]
  );

  // 🔴 FIX: when navigating, pass merged order with latest status from statusMap
  const openOrderDetails = useCallback(
    (order) => {
      const baseOrder = order.raw || order; // full API order
      const orderId = getOrderId(order) || getOrderId(baseOrder);

      // status override from statusMap (if we have it)
      const statusFromMap = orderId ? statusMap[orderId] : undefined;

      // build a merged order object with freshest status across common keys
      const mergedOrder = {
        ...baseOrder,
        status:
          statusFromMap ??
          baseOrder.status ??
          baseOrder.order_status ??
          baseOrder.current_status ??
          baseOrder.orderStatus,
        order_status:
          statusFromMap ??
          baseOrder.order_status ??
          baseOrder.status ??
          baseOrder.current_status ??
          baseOrder.orderStatus,
        current_status:
          statusFromMap ??
          baseOrder.current_status ??
          baseOrder.status ??
          baseOrder.order_status ??
          baseOrder.orderStatus,
        orderStatus:
          statusFromMap ??
          baseOrder.orderStatus ??
          baseOrder.status ??
          baseOrder.order_status ??
          baseOrder.current_status,
      };

      try {
        const state = navigation.getState?.();
        const routeExists = !!state?.routeNames?.includes?.(detailsRoute);
        if (!routeExists) {
          alert(
            `No screen named "${detailsRoute}". Please register it in your navigator.`
          );
          return;
        }
      } catch {}

      navigation.navigate(detailsRoute, {
        orderId,
        order: mergedOrder, // ✅ send merged order with latest status
        businessId,
        ownerType,
        delivery_option,
      });
    },
    [navigation, businessId, ownerType, delivery_option, detailsRoute, statusMap]
  );

  // ✅ floating button handler
  const onReadyForDeliveryPress = useCallback(() => {
    const count = readyOrders.length;

    if (count === 0) {
      Alert.alert(
        'No ready orders',
        'There are no orders in READY status in this cluster yet.'
      );
      return;
    }

    Alert.alert(
      'Deliver all ready orders?',
      `There ${count === 1 ? 'is' : 'are'} ${count} Order${count === 1 ? '' : 's'} ready.\nDeliver all now?`,
      [
        {
          text: 'No',
          style: 'cancel',
        },
        {
          text: 'Yes',
          onPress: () => {
            navigation.navigate('ClusterDeliveryOptionsScreen', {
              label,
              businessId,
              ownerType,
              delivery_option,
              centerCoords: centerCoordsFromParams || centerCoords,
              readyOrders,
            });
          },
        },
      ],
      { cancelable: true }
    );
  }, [
    readyOrders,
    navigation,
    label,
    businessId,
    ownerType,
    delivery_option,
    centerCoordsFromParams,
    centerCoords,
  ]);

  const renderRow = ({ item }) => {
    const coords = extractCoords(item);
    let distanceLabel = null;

    if (coords && centerCoords) {
      const d = distanceKm(centerCoords, coords);
      distanceLabel = `${d.toFixed(2)} km`;
    }

    const addressText = getOrderAddressText(item);
    const orderId = getOrderId(item);
    const latestStatusRaw =
      (orderId && statusMap[orderId]) ||
      item.status ||
      item.raw?.status;

    const latestStatusNorm = latestStatusRaw
      ? String(latestStatusRaw).toUpperCase().trim()
      : null;

    const latestStatus = latestStatusRaw
      ? String(latestStatusRaw).replaceAll('_', ' ')
      : null;

    return (
      <TouchableOpacity
        style={styles.orderRow}
        activeOpacity={0.7}
        onPress={() => openOrderDetails(item)}
      >
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
          {latestStatusNorm === 'READY' ? (
            <View style={styles.readyChip}>
              <Ionicons name="checkmark-circle" size={16} color="#16a34a" />
              <Text style={styles.readyChipText}>Ready</Text>
            </View>
          ) : (
            !!latestStatus && (
              <Text style={styles.orderStatusText}>{latestStatus}</Text>
            )
          )}

          {distanceLabel && (
            <Text style={styles.orderDistanceText}>{distanceLabel}</Text>
          )}
          <Ionicons
            name="chevron-forward"
            size={18}
            color="#94a3b8"
            style={{ marginLeft: 4 }}
          />
        </View>
      </TouchableOpacity>
    );
  };

  const headerTopPad = Math.max(insets.top, 8) + 18;

  const readyCount = readyOrders.length;

  // store-wide OUT_FOR_DELIVERY from status-counts endpoint
  const storeOutForDelivery =
    statusCounts && typeof statusCounts.OUT_FOR_DELIVERY === 'number'
      ? statusCounts.OUT_FOR_DELIVERY
      : null;

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      {/* header: same pattern as NearbyOrdersScreen */}
      <View style={[styles.headerBar, { paddingTop: headerTopPad }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
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
          <Text
            style={styles.headerSubtitle}
            numberOfLines={1}
          >
            {clusterAddress}
          </Text>
        )}
      </View>

      {/* summary row for counts:
          Ready = cluster only
          Out for delivery = store-wide OUT_FOR_DELIVERY */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryPill}>
          <Text style={styles.summaryLabel}>Ready</Text>
          <Text style={styles.summaryCount}>{readyCount}</Text>
        </View>

        <View style={styles.summaryPill}>
          <Text style={styles.summaryLabel}>Out for delivery</Text>
          <Text style={styles.summaryCount}>
            {storeOutForDelivery != null ? storeOutForDelivery : '-'}
          </Text>
        </View>
      </View>

      <FlatList
        data={filteredOrders}
        keyExtractor={(o) => String(getOrderId(o) || o.id)}
        renderItem={renderRow}
        ItemSeparatorComponent={null}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 80, // leave space for FAB
          gap: 10,
        }}
      />

      {/* Floating "Ready for delivery" button */}
      <View style={styles.fabWrapper}>
        <TouchableOpacity
          style={[
            styles.fab,
            readyCount === 0 && { opacity: 0.4 },
          ]}
          activeOpacity={readyCount === 0 ? 1 : 0.8}
          onPress={onReadyForDeliveryPress}
          disabled={readyCount === 0}
        >
          <Ionicons name="bicycle" size={18} color="#fff" />
          <Text style={styles.fabText}>
            Ready for delivery{readyCount > 0 ? ` (${readyCount})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#fff',
  },

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
  headerSubtitleMain: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: '#64748b',
  },

  // summary row styles (non-clickable pills)
  summaryRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  summaryPill: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 4,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  summaryLabel: {
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '600',
  },
  summaryCount: {
    marginLeft: 6,
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
  },

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
  orderIdText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
  },
  orderCustomerText: {
    marginTop: 2,
    fontSize: 13,
    color: '#475569',
  },
  orderAddressText: {
    marginTop: 2,
    fontSize: 12,
    color: '#64748b',
  },
  orderRight: {
    marginLeft: 8,
    alignItems: 'flex-end',
  },
  orderStatusText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
  },
  orderDistanceText: {
    marginTop: 2,
    fontSize: 11,
    color: '#94a3b8',
  },

  // READY chip styles
  readyChip: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  readyChipText: {
    marginLeft: 4,
    fontSize: 12,
    fontWeight: '700',
    color: '#16a34a',
  },

  fabWrapper: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },

  // Floating action button
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
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
  },
});
