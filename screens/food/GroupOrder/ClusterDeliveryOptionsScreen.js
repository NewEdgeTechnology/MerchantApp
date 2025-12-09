// services/food/GroupOrder/ClusterDeliveryOptionsScreen.js
// Simple page to choose how to deliver all READY orders in a cluster.

import React, {
  useMemo,
  useEffect,
  useState,
  useCallback,
  useRef,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  DeviceEventEmitter,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import io from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';
import {
  BUSINESS_DETAILS,
  SEND_REQUEST_DRIVER_ENDPOINT as ENV_SEND_REQUEST_DRIVER,
  RIDE_SOCKET_ENDPOINT as ENV_RIDE_SOCKET,
  DRIVER_DETAILS_ENDPOINT as ENV_DRIVER_DETAILS,
  DIVER_RATING_ENDPOINT as ENV_DRIVER_RATING,
  UPDATE_ORDER_STATUS_ENDPOINT as ENV_UPDATE_ORDER,
  ORDER_ENDPOINT as ENV_ORDER_ENDPOINT,
} from '@env';
import {
  normalizeOrderCode,
  updateStatusApi,
} from '../../../screens/food/OrderDetails/orderDetailsUtils';

/* ---------------- helpers ---------------- */

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

const toRad = (deg) => (deg * Math.PI) / 180;
const computeHaversineKm = (a, b) => {
  if (!a || !b) return null;
  const R = 6371; // km
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const x =
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * c;
};

const DEFAULT_REASON = {
  OUT_FOR_DELIVERY: 'Order handed over for delivery',
  COMPLETED: 'Order delivered',
};

// build URL from ORDER_ENDPOINT=https://grab.newedge.bt/orders/orders/business/{businessId}/grouped
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
  // fallback
  return `${tmpl.replace(/\/+$/, '')}/${encodeURIComponent(businessId)}`;
};

/* ✅ BUSINESS_DETAILS helper (placeholder-aware) */
const buildBusinessDetailsUrl = (businessId) => {
  const rawBid = businessId != null ? String(businessId).trim() : '';
  const tpl = (BUSINESS_DETAILS || '').trim();

  if (!rawBid || !tpl) return null;

  const id = encodeURIComponent(rawBid);

  // Try to replace placeholders on the raw template
  let url = tpl
    .replace('{business_id}', id)
    .replace('{businessId}', id)
    .replace(':business_id', id)
    .replace(':businessId', id);

  // If no placeholder was present, append /id
  if (url === tpl) {
    url = `${tpl.replace(/\/+$/, '')}/${id}`;
  }

  return url;
};

export default function ClusterDeliveryOptionsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const route = useRoute();

  const {
    label,
    readyOrders = [],
    businessId,
    ownerType,
    delivery_option, // highest priority from route
  } = route.params || {};

  // local copy of orders on this screen
  const [ordersOnScreen, setOrdersOnScreen] = useState(readyOrders || []);
  const readyCount = ordersOnScreen.length;

  // Selected UI focus: 'SELF' | 'GRAB'
  const [selectedMethod, setSelectedMethod] = useState(null);

  // Phase: 'READY' -> 'OUT_FOR_DELIVERY' -> 'COMPLETED'
  const [bulkPhase, setBulkPhase] = useState('READY');
  const [bulkUpdating, setBulkUpdating] = useState(false);

  // Store's configured delivery_option from BUSINESS_DETAILS
  const [storeDeliveryOption, setStoreDeliveryOption] = useState(null);
  const [businessCoords, setBusinessCoords] = useState(null); // {lat,lng}

  // map: orderId -> latest status (from grouped ORDER_ENDPOINT and local updates)
  const [statusMap, setStatusMap] = useState({});
  const [statusesLoaded, setStatusesLoaded] = useState(false);

  // map: orderId -> items[] (from grouped ORDER_ENDPOINT)
  const [itemsMap, setItemsMap] = useState({});

  // per-order dropdown expansion
  const [expandedOrderIds, setExpandedOrderIds] = useState({});

  const toggleExpanded = useCallback((id) => {
    if (!id) return;
    setExpandedOrderIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }, []);

  const deliveryOptionFromParamsRaw = delivery_option
    ? String(delivery_option).toUpperCase()
    : null;

  /* ---------- fetch delivery_option + coords from BUSINESS_DETAILS ---------- */
  useEffect(() => {
    if (!businessId) return;

    const fetchBusinessDetails = async () => {
      try {
        const url = buildBusinessDetailsUrl(businessId);
        if (!url) {
          console.warn('BUSINESS_DETAILS not configured properly');
          return;
        }

        const res = await fetch(url);
        if (!res.ok) {
          console.warn('BUSINESS_DETAILS fetch failed', res.status);
          return;
        }
        const data = await res.json();

        const biz = data?.business || data;
        const optRaw = biz?.delivery_option;
        if (optRaw) {
          setStoreDeliveryOption(String(optRaw).toUpperCase());
        }

        const latRaw =
          biz?.latitude ??
          biz?.lat ??
          biz?.business_latitude ??
          biz?.business_lat ??
          null;
        const lngRaw =
          biz?.longitude ??
          biz?.lng ??
          biz?.business_longitude ??
          biz?.business_lng ??
          null;

        const latNum = latRaw != null ? Number(latRaw) : NaN;
        const lngNum = lngRaw != null ? Number(lngRaw) : NaN;

        if (Number.isFinite(latNum) && Number.isFinite(lngNum)) {
          setBusinessCoords({ lat: latNum, lng: lngNum });
        }
      } catch (err) {
        console.warn('Error fetching BUSINESS_DETAILS:', err?.message || err);
      }
    };

    fetchBusinessDetails();
  }, [businessId]);

  /* ---------- fetch latest statuses + items from grouped ORDER_ENDPOINT ---------- */
  useEffect(() => {
    const url = buildGroupedOrdersUrl(businessId);
    if (!url) {
      setStatusesLoaded(true);
      return;
    }

    let cancelled = false;

    const loadStatuses = async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) {
          console.log('[Cluster] grouped ORDER_ENDPOINT fetch failed', res.status);
          setStatusesLoaded(true);
          return;
        }
        const json = await res.json();
        if (cancelled || !json) return;

        const nextStatusMap = {};
        const nextItemsMap = {};

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
                  nextStatusMap[id] = status;
                }

                if (Array.isArray(o.items)) {
                  nextItemsMap[id] = o.items;
                }
              }
            }
          }
        }

        setStatusMap(nextStatusMap);
        setItemsMap(nextItemsMap);
        setStatusesLoaded(true);
      } catch (err) {
        console.log('[Cluster] grouped ORDER_ENDPOINT fetch error', err);
        setStatusesLoaded(true);
      }
    };

    loadStatuses();

    return () => {
      cancelled = true;
    };
  }, [businessId]);

  /* ---------- per-order delivery hint ---------- */
  const orderDeliveryHint = useMemo(() => {
    if (!ordersOnScreen || ordersOnScreen.length === 0) return '';

    const base = ordersOnScreen[0]?.raw || ordersOnScreen[0] || {};

    const raw =
      base.delivery_option ??
      base.deliveryOption ??
      base.delivery_by ??
      base.deliveryBy ??
      base.delivery_type ??
      base.fulfillment_type ??
      '';

    if (!raw) return '';

    const up = String(raw).toUpperCase();
    if (up === 'SELF' || up === 'GRAB' || up === 'BOTH') return up;
    return '';
  }, [ordersOnScreen]);

  /* ---------- final delivery option resolution ---------- */
  const deliveryOptionInitial = useMemo(() => {
    if (deliveryOptionFromParamsRaw) {
      return deliveryOptionFromParamsRaw;
    }
    const m = storeDeliveryOption;
    if (m && m !== 'UNKNOWN') return m;
    return orderDeliveryHint || '';
  }, [deliveryOptionFromParamsRaw, storeDeliveryOption, orderDeliveryHint]);

  const opt = (deliveryOptionInitial || '').toUpperCase();
  const storeOpt = (storeDeliveryOption || '').toUpperCase();

  /* ---------- reference coords from first order ---------- */
  const refCoords = useMemo(() => {
    if (!ordersOnScreen || ordersOnScreen.length === 0) {
      return {
        lat: 27.4775469,
        lng: 89.6387255,
        cityId: 'thimphu',
      };
    }

    const base = ordersOnScreen[0]?.raw || ordersOnScreen[0];

    const addr = base?.delivery_address;
    const addrLat = addr ? (addr.lat ?? addr.latitude) : null;
    const addrLng = addr ? (addr.lng ?? addr.lon ?? addr.longitude) : null;

    const lat =
      (addrLat != null ? addrLat : null) ??
      base?.delivery_lat ??
      base?.lat ??
      27.4775469;
    const lng =
      (addrLng != null ? addrLng : null) ??
      base?.delivery_lng ??
      base?.lng ??
      89.6387255;

    const cityId =
      base?.city_id ??
      base?.city ??
      (addr && (addr.city ?? addr.town ?? addr.dzongkhag)) ??
      'thimphu';

    return {
      lat: Number(lat),
      lng: Number(lng),
      cityId: String(cityId || 'thimphu').toLowerCase(),
    };
  }, [ordersOnScreen]);

  /* ---------- rough distance & ETA ---------- */
  const [routeInfo, setRouteInfo] = useState(null); // { distanceKm, etaMin }

  useEffect(() => {
    if (!businessCoords) {
      setRouteInfo(null);
      return;
    }

    const from = businessCoords;
    const to = { lat: refCoords.lat, lng: refCoords.lng };

    if (
      !Number.isFinite(from.lat) ||
      !Number.isFinite(from.lng) ||
      !Number.isFinite(to.lat) ||
      !Number.isFinite(to.lng)
    ) {
      setRouteInfo(null);
      return;
    }

    try {
      const distanceKm = computeHaversineKm(from, to);
      if (distanceKm == null) {
        setRouteInfo(null);
      } else {
        const avgSpeedKmh = 20;
        const etaMin = distanceKm > 0 ? (distanceKm / avgSpeedKmh) * 60 : 0;
        setRouteInfo({ distanceKm, etaMin });
      }
    } catch {
      setRouteInfo(null);
    }
  }, [businessCoords, refCoords.lat, refCoords.lng]);

  /* ---------- driver details + rating ---------- */

  const [driverDetails, setDriverDetails] = useState(null);
  const [driverRating, setDriverRating] = useState(null); // { average, count }
  const [rideMessage, setRideMessage] = useState('');
  const [driverAccepted, setDriverAccepted] = useState(false);
  const [sendingGrab, setSendingGrab] = useState(false);

  const socketRef = useRef(null);
  const grabLoopActiveRef = useRef(false);
  const grabLoopTimeoutRef = useRef(null);
  const driverAcceptedRef = useRef(false);

  const stopGrabLoop = useCallback(() => {
    grabLoopActiveRef.current = false;
    driverAcceptedRef.current = false;
    if (grabLoopTimeoutRef.current) {
      clearTimeout(grabLoopTimeoutRef.current);
      grabLoopTimeoutRef.current = null;
    }
  }, []);

  const fetchDriverRating = useCallback(async (driverId) => {
    try {
      if (!ENV_DRIVER_RATING) {
        console.log('[Cluster] ENV_DRIVER_RATING not set, skipping rating fetch');
        return;
      }

      let base = (ENV_DRIVER_RATING || '').trim();
      if (!base) return;

      let finalUrl = base;
      if (base.includes('{driver_id}')) {
        finalUrl = base.replace('{driver_id}', encodeURIComponent(String(driverId)));
      } else {
        const sep = base.includes('?') ? '&' : '?';
        finalUrl = `${base}${sep}driver_id=${encodeURIComponent(String(driverId))}`;
      }

      const res = await fetch(finalUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      const text = await res.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {}

      if (!res.ok) {
        throw new Error(json?.message || json?.error || `HTTP ${res.status}`);
      }

      let avg = null;
      let count = null;
      const d = json?.summary || json?.details || json?.data || json;

      if (Array.isArray(d) && d.length > 0) {
        const first = d[0];
        avg = first.avg_rating ?? first.average_rating ?? first.rating ?? null;
        count = first.total_ratings ?? first.count ?? first.rating_count ?? null;
      } else if (d && typeof d === 'object') {
        avg = d.avg_rating ?? d.average_rating ?? d.rating ?? null;
        count = d.total_ratings ?? d.count ?? d.rating_count ?? null;
      }

      setDriverRating({ average: avg, count });
    } catch (err) {
      console.log('[Cluster] Failed to fetch driver rating:', err?.message || err);
    }
  }, []);

  const fetchDriverDetails = useCallback(
    async (driverId) => {
      try {
        if (!ENV_DRIVER_DETAILS) {
          console.log('[Cluster] ENV_DRIVER_DETAILS not set, skipping driver details fetch');
          return;
        }

        let base = (ENV_DRIVER_DETAILS || '').trim();
        if (!base) return;

        let finalUrl = base;
        if (base.includes('{driverId}')) {
          finalUrl = base.replace('{driverId}', encodeURIComponent(String(driverId)));
        } else {
          const sep = base.includes('?') ? '&' : '?';
          finalUrl = `${base}${sep}driverId=${encodeURIComponent(String(driverId))}`;
        }

        const res = await fetch(finalUrl, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
        });

        const text = await res.text();
        let json = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {}

        if (!res.ok) {
          throw new Error(json?.message || json?.error || `HTTP ${res.status}`);
        }

        const drv = json?.details || json?.data || json?.driver || json;
        setDriverDetails(drv);

        await fetchDriverRating(driverId);
      } catch (err) {
        console.log('[Cluster] Failed to fetch driver details:', err?.message || err);
      }
    },
    [fetchDriverRating]
  );

  /* ---------- bulk status update for all orders on this screen ---------- */
  const bulkUpdateStatus = useCallback(
    async (newStatus = 'OUT_FOR_DELIVERY', deliveryBy = null) => {
      try {
        if (!ENV_UPDATE_ORDER) {
          console.log('[Cluster] ENV_UPDATE_ORDER not set, skipping bulk update');
          return false;
        }

        if (!ordersOnScreen || ordersOnScreen.length === 0) {
          console.log('[Cluster] No orders to update');
          return false;
        }

        const token = await SecureStore.getItemAsync('auth_token');
        if (!token) {
          Alert.alert('Not logged in', 'Missing auth token for updating orders.');
          return false;
        }

        const reason =
          DEFAULT_REASON[newStatus] || `Status updated to ${newStatus}`;

        const payloadBase = {
          status: newStatus,
          status_reason: reason,
          reason,
        };

        if (deliveryBy) {
          payloadBase.delivery_option = deliveryBy; // SELF or GRAB
        }

        let anySuccess = false;
        const updatedIds = [];

        for (const rawOrder of ordersOnScreen) {
          const base = rawOrder.raw || rawOrder || {};
          const rawCode =
            base.order_code ||
            base.order_id ||
            base.id ||
            getOrderId(base);

          if (!rawCode) {
            console.log('[Cluster] Skipping order without code/id', base);
            continue;
          }

          const orderCode = normalizeOrderCode(rawCode);

          try {
            await updateStatusApi({
              endpoint: ENV_UPDATE_ORDER || '',
              orderCode,
              payload: payloadBase,
              token,
            });
            anySuccess = true;

            const idForEmit = getOrderId(base) || orderCode;
            if (idForEmit != null) {
              updatedIds.push(String(idForEmit));
            }

            // notify other screens
            DeviceEventEmitter.emit('order-updated', {
              id: idForEmit,
              patch: {
                status: newStatus,
                status_reason: reason,
                delivery_option: deliveryBy,
              },
            });
          } catch (err) {
            console.log(
              '[Cluster] Failed to update order',
              orderCode,
              ':',
              err?.message || err
            );
          }
        }

        if (anySuccess) {
          // patch local orders
          if (updatedIds.length > 0) {
            setOrdersOnScreen((prev) =>
              prev.map((order) => {
                const base = order.raw || order || {};
                const localId =
                  getOrderId(order) ||
                  getOrderId(base) ||
                  base.order_code ||
                  base.id;

                if (!localId || !updatedIds.includes(String(localId))) {
                  return order;
                }

                const patchedRaw = {
                  ...base,
                  status: newStatus,
                  order_status: newStatus,
                };

                return {
                  ...order,
                  status: newStatus,
                  order_status: newStatus,
                  raw: patchedRaw,
                };
              })
            );

            // and patch statusMap so UI uses it immediately
            setStatusMap((prev) => {
              const next = { ...prev };
              updatedIds.forEach((id) => {
                next[id] = newStatus;
              });
              return next;
            });
            setStatusesLoaded(true);
          }

          Alert.alert(
            'Status updated',
            `All orders on this screen marked as ${newStatus.replace(/_/g, ' ')}${
              deliveryBy ? ` (${deliveryBy})` : ''
            }.`
          );
        } else {
          Alert.alert(
            'No orders updated',
            'Unable to update any orders. Please try again.'
          );
        }

        return anySuccess;
      } catch (err) {
        console.log('[Cluster] bulkUpdateStatus error:', err?.message || err);
        Alert.alert('Update failed', String(err?.message || err));
        return false;
      }
    },
    [ordersOnScreen]
  );

  /* ---------- Grab request ---------- */
  const sendGrabDeliveryRequest = useCallback(async () => {
    try {
      if (!ENV_SEND_REQUEST_DRIVER) {
        Alert.alert(
          'Grab delivery not configured',
          'SEND_REQUEST_DRIVER_ENDPOINT is missing in environment variables.'
        );
        return;
      }

      if (!businessId) {
        Alert.alert('Missing merchant', 'No businessId found for this cluster.');
        return;
      }

      if (!ordersOnScreen || ordersOnScreen.length === 0) {
        Alert.alert('No orders', 'There are no READY orders in this batch.');
        return;
      }

      setSendingGrab(true);
      setRideMessage('Searching for nearby drivers…');

      const pickupLat = businessCoords?.lat ?? 27.472012;
      const pickupLng = businessCoords?.lng ?? 89.639882;

      const dropLat = Number.isFinite(refCoords.lat) ? refCoords.lat : 27.47395;
      const dropLng = Number.isFinite(refCoords.lng) ? refCoords.lng : 89.64321;

      const distanceM = (() => {
        if (routeInfo?.distanceKm != null && Number.isFinite(routeInfo.distanceKm)) {
          return Math.round(routeInfo.distanceKm * 1000);
        }
        return 2200;
      })();

      const durationS = (() => {
        if (routeInfo?.etaMin != null && Number.isFinite(routeInfo.etaMin)) {
          return Math.round(routeInfo.etaMin * 60);
        }
        return 480;
      })();

      const first = ordersOnScreen[0]?.raw || ordersOnScreen[0] || {};
      const baseFare = Number(
        first.delivery_fee ??
          first.delivery_charges ??
          40
      );

      const pmRaw = String(first.payment_method || '').toUpperCase();
      const paymentType =
        pmRaw.includes('WALLET') || pmRaw.includes('ONLINE')
          ? 'WALLET'
          : 'CASH_ON_DELIVERY';

      const passengerId =
        first.user_id ?? first.customer_id ?? first.passenger_id ?? 59;

      const fareCents = Math.round(baseFare * 100);

      const payload = {
        passenger_id: passengerId,
        merchant_id: Number(businessId),
        cityId: refCoords.cityId || 'thimphu',
        service_code: 'D',
        serviceType: 'delivery_bike',
        pickup: [pickupLat, pickupLng],
        dropoff: [dropLat, dropLng],
        pickup_place: first.business_name ?? first.store_name ?? 'Store',
        dropoff_place: first.delivery_address?.address ?? '',
        distance_m: distanceM,
        duration_s: durationS,
        base_fare: baseFare,
        fare: baseFare,
        fare_cents: fareCents,
        currency: 'BTN',
        payment_method: { type: paymentType },
        offer_code: null,
        waypoints: [],
        owner_type: ownerType || undefined,
      };

      const res = await fetch(ENV_SEND_REQUEST_DRIVER, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
    } catch (e) {
      if (grabLoopActiveRef.current && !driverAcceptedRef.current) {
        setRideMessage('Retrying to find nearby drivers…');
      } else {
        Alert.alert('Grab delivery failed', String(e?.message || e));
      }
    } finally {
      setSendingGrab(false);
    }
  }, [businessCoords, refCoords, routeInfo, ordersOnScreen, businessId, ownerType]);

  const scheduleNextGrabRequest = useCallback(() => {
    if (!grabLoopActiveRef.current || driverAcceptedRef.current) return;
    grabLoopTimeoutRef.current = setTimeout(async () => {
      if (!grabLoopActiveRef.current || driverAcceptedRef.current) return;
      await sendGrabDeliveryRequest();
      scheduleNextGrabRequest();
    }, 30000);
  }, [sendGrabDeliveryRequest]);

  const startGrabLoop = useCallback(async () => {
    if (!ordersOnScreen || ordersOnScreen.length === 0) {
      Alert.alert('No orders', 'There are no READY orders in this batch.');
      return;
    }
    driverAcceptedRef.current = false;
    setDriverAccepted(false);
    grabLoopActiveRef.current = true;
    setRideMessage('Searching for nearby drivers…');
    await sendGrabDeliveryRequest();
    scheduleNextGrabRequest();
  }, [ordersOnScreen, sendGrabDeliveryRequest, scheduleNextGrabRequest]);

  /* ---------- ride socket: listen to deliveryAccepted ---------- */
  useEffect(() => {
    if (!ENV_RIDE_SOCKET) {
      return;
    }
    if (!businessId) {
      console.log('[Cluster] No businessId, NOT connecting ride socket');
      return;
    }

    let socket;
    let handler;

    (async () => {
      socket = io(ENV_RIDE_SOCKET, {
        transports: ['websocket'],
        query: {
          merchantId: String(businessId),
          role: 'merchant',
        },
      });
      socketRef.current = socket;

      handler = (payload) => {
        driverAcceptedRef.current = true;
        setDriverAccepted(true);
        stopGrabLoop();

        const driverId =
          payload?.driver_id ??
          payload?.driverId ??
          payload?.driver?.id ??
          payload?.driver?.driver_id ??
          null;

        if (driverId != null) {
          fetchDriverDetails(driverId);
        } else {
          console.log('[Cluster] No driverId found in deliveryAccepted payload');
        }

        setRideMessage(
          'Driver has accepted the delivery request (first come first basis).'
        );
        Alert.alert(
          'Driver accepted',
          'Driver has accepted the delivery request (first come first basis).'
        );
      };

      socket.on('deliveryAccepted', handler);
    })();

    return () => {
      if (socket) {
        if (handler) socket.off('deliveryAccepted', handler);
        socket.disconnect();
      }
      stopGrabLoop();
    };
  }, [businessId, stopGrabLoop, fetchDriverDetails]);

  /* ---------- driver summary text ---------- */
  const driverSummaryText = useMemo(() => {
    if (!driverDetails) return '';

    const name =
      driverDetails.user_name ??
      driverDetails.name ??
      driverDetails.full_name ??
      '';

    const phone = driverDetails.phone ?? driverDetails.mobile ?? '';

    const avg = driverRating?.average;
    const count = driverRating?.count;

    const ratingPart =
      avg != null
        ? `Rating: ${Number(avg).toFixed(1)}${count != null ? ` (${count})` : ''}`
        : null;

    const parts = [];
    if (name) parts.push(name);
    if (phone) parts.push(`+975${String(phone).replace(/^\+?975/, '')}`);
    if (ratingPart) parts.push(ratingPart);

    return parts.join(' · ');
  }, [driverDetails, driverRating]);

  /* ---------- UI helpers ---------- */

  const titleSummary = useMemo(() => {
    if (readyCount === 0) return 'No orders';

    const baseCountText =
      readyCount === 1 ? '1 order' : `${readyCount} orders`;

    if (bulkPhase === 'READY') {
      return `${baseCountText} ready for delivery`;
    }
    if (bulkPhase === 'OUT_FOR_DELIVERY') {
      return `${baseCountText} out for delivery`;
    }
    if (bulkPhase === 'COMPLETED') {
      return `${baseCountText} delivered`;
    }
    return `${baseCountText} ready for delivery`;
  }, [readyCount, bulkPhase]);

  const listHeaderLabel = useMemo(() => {
    if (bulkPhase === 'READY') return 'Ready orders in this batch';
    if (bulkPhase === 'OUT_FOR_DELIVERY') return 'Orders out for delivery';
    if (bulkPhase === 'COMPLETED') return 'Delivered orders in this batch';
    return 'Orders in this batch';
  }, [bulkPhase]);

  // Self delivery
  const onSelectSelf = () => {
    setSelectedMethod('SELF');

    stopGrabLoop();
    setSendingGrab(false);
    setRideMessage('');
    setDriverDetails(null);
    setDriverRating(null);
    setDriverAccepted(false);
  };

  // Grab delivery
  const onSelectGrab = () => {
    setSelectedMethod('GRAB');
    startGrabLoop();
  };

  // buttons visibility:
  // - Out for delivery: READY phase, Self OR Grab+driverAccepted
  // - Delivered: OUT_FOR_DELIVERY phase, Self only
  const showOutForDeliveryButton =
    readyCount > 0 &&
    bulkPhase === 'READY' &&
    (
      selectedMethod === 'SELF' ||
      (selectedMethod === 'GRAB' && driverAccepted)
    );

  const showDeliveredButton =
    readyCount > 0 &&
    bulkPhase === 'OUT_FOR_DELIVERY' &&
    selectedMethod === 'SELF';

  const canBulkOutForDelivery = showOutForDeliveryButton && !bulkUpdating;
  const canBulkDelivered = showDeliveredButton && !bulkUpdating;

  const onBulkOutForDeliveryPress = async () => {
    if (!selectedMethod) {
      Alert.alert(
        'Choose delivery method',
        'Please select Self delivery or Grab delivery first.'
      );
      return;
    }

    if (
      selectedMethod === 'GRAB' &&
      bulkPhase === 'READY' &&
      !driverAccepted
    ) {
      Alert.alert(
        'Driver not assigned yet',
        'Please wait until a driver accepts the Grab request before marking orders Out for delivery.'
      );
      return;
    }

    const deliveryBy = selectedMethod === 'GRAB' ? 'GRAB' : 'SELF';
    const targetStatus = 'OUT_FOR_DELIVERY';

    setBulkUpdating(true);
    const ok = await bulkUpdateStatus(targetStatus, deliveryBy);
    setBulkUpdating(false);

    if (ok) {
      setBulkPhase(targetStatus);
    }
  };

  const onBulkDeliveredPress = async () => {
    const deliveryBy = 'SELF';
    const targetStatus = 'COMPLETED';

    setBulkUpdating(true);
    const ok = await bulkUpdateStatus(targetStatus, deliveryBy);
    setBulkUpdating(false);

    if (ok) {
      setBulkPhase(targetStatus);
    }
  };

  const renderOrder = ({ item }) => {
    const base = item.raw || item || {};
    const id = getOrderId(item) || item.id;

    const name =
      base.customer_name ??
      item.customer_name ??
      base.user_name ??
      base.full_name ??
      '';

    const statusFromMap =
      statusesLoaded && id ? statusMap[id] : undefined;

    // status shown only from grouped API / local map; no fallback to stale base.status
    const statusRaw = statusFromMap || '';

    const statusLabel = statusRaw
      ? String(statusRaw).toUpperCase().replace(/_/g, ' ')
      : (statusesLoaded
          ? (
              bulkPhase === 'OUT_FOR_DELIVERY'
                ? 'OUT FOR DELIVERY'
                : bulkPhase === 'COMPLETED'
                  ? 'COMPLETED'
                  : 'READY'
            )
          : '...');

    // items coming from grouped endpoint (itemsMap) first
    const itemsFromMap = id && itemsMap[id] ? itemsMap[id] : null;
    const itemsBase = Array.isArray(base.items) ? base.items : null;
    const items = itemsFromMap || itemsBase || [];
    const hasItems = Array.isArray(items) && items.length > 0;

    let itemCount =
      base.total_items ??
      base.items_count ??
      base.item_count ??
      base.total_quantity ??
      base.quantity ??
      null;

    // if counts not present, compute from items array
    if ((itemCount == null || Number(itemCount) === 0) && hasItems) {
      const sum = items.reduce(
        (acc, it) => acc + (Number(it.quantity) || 0),
        0
      );
      itemCount = sum || items.length;
    }

    const isExpanded = !!expandedOrderIds[id];

    return (
      <View style={styles.orderRow}>
        <View style={styles.orderRowTop}>
          <Text style={styles.orderId}>#{id}</Text>
          {!!statusLabel && (
            <View style={styles.statusPill}>
              <Text style={styles.statusPillText}>{statusLabel}</Text>
            </View>
          )}
        </View>

        {!!name && (
          <Text style={styles.orderName} numberOfLines={1}>
            {name}
          </Text>
        )}

        {itemCount != null && (
          <Text style={styles.orderMeta} numberOfLines={1}>
            {itemCount} item{Number(itemCount) === 1 ? '' : 's'}
          </Text>
        )}

        {hasItems && (
          <View style={styles.itemsSection}>
            <TouchableOpacity
              style={styles.itemsToggleRow}
              activeOpacity={0.7}
              onPress={() => toggleExpanded(id)}
            >
              <Text style={styles.itemsToggleText}>
                {isExpanded
                  ? 'Hide items'
                  : `View items (${items.length})`}
              </Text>
              <Ionicons
                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                size={16}
                color="#4b5563"
              />
            </TouchableOpacity>

            {isExpanded && (
              <View style={styles.itemsList}>
                {items.map((it, index) => {
                  const itemName =
                    it.item_name ??
                    it.name ??
                    it.menu_name ??
                    `Item ${index + 1}`;
                  const qty = it.quantity ?? 1;

                  return (
                    <View key={index} style={styles.itemRow}>
                      <Text
                        style={styles.itemName}
                        numberOfLines={2}
                      >
                        {itemName}
                      </Text>
                      <Text style={styles.itemQty}>
                        x{qty}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  const headerTopPad = Math.max(insets.top, 8) + 18;

  // same display rules as OrderDetails
  const showSelf = (!opt || opt === 'BOTH' || opt === 'SELF');
  const showGrab = (!opt || opt === 'BOTH' || opt === 'GRAB');

  const methodButtonsDisabled = false;

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <View style={[styles.headerBar, { paddingTop: headerTopPad }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={22} color="#0f172a" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Delivery options</Text>

        <View style={{ width: 40 }} />
      </View>

      <View style={styles.summaryBox}>
        <Text style={styles.summaryMain}>{titleSummary}</Text>
        {!!label && (
          <Text style={styles.summarySub} numberOfLines={2}>
            Deliver To: {label}
          </Text>
        )}
        {!!storeOpt && (
          <Text style={styles.summarySub}>
            Store delivery setting: {storeOpt}
          </Text>
        )}
        {!!opt && opt !== storeOpt && (
          <Text style={styles.summarySub}>
            Resolved delivery option: {opt}
          </Text>
        )}
      </View>

      <View style={styles.optionsRow}>
        {showSelf && (
          <TouchableOpacity
            disabled={methodButtonsDisabled}
            style={[
              styles.optionCard,
              selectedMethod === 'SELF' && {
                borderColor: '#16a34a',
                borderWidth: 2,
              },
              methodButtonsDisabled && { opacity: 0.6 },
            ]}
            activeOpacity={methodButtonsDisabled ? 1 : 0.8}
            onPress={methodButtonsDisabled ? undefined : onSelectSelf}
          >
            <Ionicons name="person-outline" size={28} color="#16a34a" />
            <Text style={styles.optionTitle}>Self delivery</Text>
            <Text style={styles.optionHint}>
              Your own rider will deliver all ready orders.
            </Text>
          </TouchableOpacity>
        )}

        {showGrab && (
          <TouchableOpacity
            disabled={methodButtonsDisabled}
            style={[
              styles.optionCard,
              selectedMethod === 'GRAB' && {
                borderColor: '#16a34a',
                borderWidth: 2,
              },
              methodButtonsDisabled && { opacity: 0.6 },
            ]}
            activeOpacity={methodButtonsDisabled ? 1 : 0.8}
            onPress={methodButtonsDisabled ? undefined : onSelectGrab}
          >
            <Ionicons name="bicycle-outline" size={28} color="#2563eb" />
            <Text style={styles.optionTitle}>Grab delivery</Text>
            <Text style={styles.optionHint}>
              Broadcast to Grab riders for all ready orders.
            </Text>
            {sendingGrab && !methodButtonsDisabled && (
              <Text style={[styles.optionHint, { marginTop: 6 }]}>
                Searching for drivers…
              </Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Mark all as Out for delivery (SELF or GRAB+driverAccepted) */}
      {showOutForDeliveryButton && (
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[
              styles.actionBtnPrimary,
              !canBulkOutForDelivery && { opacity: 0.5 },
            ]}
            activeOpacity={canBulkOutForDelivery ? 0.8 : 1}
            onPress={canBulkOutForDelivery ? onBulkOutForDeliveryPress : undefined}
          >
            <Text style={styles.actionBtnPrimaryText}>
              Mark all as Out for delivery
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Mark all as delivered — ONLY for Self delivery */}
      {showDeliveredButton && (
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[
              styles.actionBtnPrimary,
              !canBulkDelivered && { opacity: 0.5 },
            ]}
            activeOpacity={canBulkDelivered ? 0.8 : 1}
            onPress={canBulkDelivered ? onBulkDeliveredPress : undefined}
          >
            <Text style={styles.actionBtnPrimaryText}>
              Mark all as delivered
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {selectedMethod === 'GRAB' &&
        (rideMessage || driverSummaryText) && (
          <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
            <View
              style={{
                borderRadius: 12,
                borderWidth: 1,
                borderColor: '#e5e7eb',
                paddingHorizontal: 12,
                paddingVertical: 8,
                backgroundColor: '#f9fafb',
              }}
            >
              {!!rideMessage && (
                <Text style={{ fontSize: 12, color: '#4b5563' }}>
                  {rideMessage}
                </Text>
              )}
              {!!driverSummaryText && (
                <Text
                  style={{
                    marginTop: 4,
                    fontSize: 13,
                    fontWeight: '600',
                    color: '#111827',
                  }}
                >
                  {driverSummaryText}
                </Text>
              )}
            </View>
          </View>
        )}

      <View style={styles.listHeader}>
        <Text style={styles.listHeaderText}>{listHeaderLabel}</Text>
      </View>

      <FlatList
        data={ordersOnScreen}
        keyExtractor={(item) => String(getOrderId(item) || item.id)}
        renderItem={renderOrder}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
      />
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

  summaryBox: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  summaryMain: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  summarySub: {
    marginTop: 2,
    fontSize: 12,
    color: '#6b7280',
  },

  optionsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 12,
  },
  optionCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingVertical: 12,
    paddingHorizontal: 10,
    backgroundColor: '#ffffff',
  },
  optionTitle: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  optionHint: {
    marginTop: 4,
    fontSize: 11,
    color: '#6b7280',
  },

  actionsRow: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
  actionBtnPrimary: {
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnPrimaryText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },

  listHeader: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  listHeaderText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
  },

  orderRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  orderRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  orderId: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#ecfdf3',
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#166534',
  },
  orderName: {
    marginTop: 2,
    fontSize: 12,
    color: '#6b7280',
  },
  orderMeta: {
    marginTop: 2,
    fontSize: 11,
    color: '#4b5563',
  },

  itemsSection: {
    marginTop: 4,
  },
  itemsToggleRow: {
    marginTop: 4,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemsToggleText: {
    fontSize: 11,
    color: '#2563eb',
    fontWeight: '500',
  },
  itemsList: {
    marginTop: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  itemName: {
    flex: 1,
    fontSize: 11,
    color: '#374151',
    paddingRight: 8,
  },
  itemQty: {
    fontSize: 11,
    fontWeight: '600',
    color: '#111827',
  },
});
