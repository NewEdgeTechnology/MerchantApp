// screens/food/OrderDetails.js
// PENDING → CONFIRMED → READY → OUT_FOR_DELIVERY → COMPLETED
// If delivery_option=BOTH, show Self/Grab chooser ONLY at READY.
// - Self at READY: merchant can continue as usual.
// - Grab at READY: send broadcast-delivery request; when socket event "deliveryAccepted"
//   comes, merchant manually taps Out for delivery.

import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, Pressable, Alert, ActivityIndicator, BackHandler,
} from 'react-native';
import { useRoute, useNavigation, useFocusEffect, CommonActions } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { DeviceEventEmitter } from 'react-native';
import io from 'socket.io-client';
import {
  UPDATE_ORDER_STATUS_ENDPOINT as ENV_UPDATE_ORDER,
  ORDER_ENDPOINT as ENV_ORDER_ENDPOINT,
  SEND_REQUEST_DRIVER_ENDPOINT as ENV_SEND_REQUEST_DRIVER,
  RIDE_SOCKET_ENDPOINT as ENV_RIDE_SOCKET,
  DRIVER_DETAILS_ENDPOINT as ENV_DRIVER_DETAILS,
  DIVER_RATING_ENDPOINT as ENV_DRIVER_RATING,
} from '@env';

import {
  money,
  norm,
  clamp,
  findStepIndex,
  fmtStamp,
  STATUS_META,
  TERMINAL_NEGATIVE,
  TERMINAL_SUCCESS,
  IF_UNAVAILABLE_LABELS,
  normalizeOrderCode,
  sameOrder,
  resolveDeliveryOptionFromOrder,
  resolveFulfillmentType,
  fetchBusinessDetails,
  updateStatusApi,
  computeHaversineKm,
} from './OrderDetails/orderDetailsUtils';

import { styles } from './OrderDetails/orderDetailsStyles';
import StatusRail from './OrderDetails/StatusRail';
import MetaSection from './OrderDetails/MetaSection';
import DeliveryMethodChooser from './OrderDetails/DeliveryMethodChooser';
import UpdateStatusActions from './OrderDetails/UpdateStatusActions';
import ItemsBlock from './OrderDetails/ItemsBlock';
import TotalsBlock from './OrderDetails/TotalsBlock';
import DeclineModal from './OrderDetails/DeclineModal';

export default function OrderDetails() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();

  const params = route?.params ?? {};
  const orderProp = params.order ?? null;
  const routeOrderId = params.orderId ?? null;
  const ordersGroupedUrl = params.ordersGroupedUrl ?? null;
  const paramBusinessId = params.businessId ?? null;

  // NEW: detect scheduled orders (from Upcoming tab / SCHEDULED jobs)
  const isScheduledOrder =
    params.isScheduled === true ||
    params.is_scheduled === true ||
    String(orderProp?.status || '').toUpperCase() === 'SCHEDULED' ||
    (routeOrderId && String(routeOrderId).startsWith('SCH-'));

  // NEW: ownerType coming from NearbyClusterOrdersScreen / NearbyOrdersScreen
  const ownerType = params.ownerType ?? params.owner_type ?? null;

  // NEW: delivery_option coming via navigation params
  const deliveryOptionFromParamsRaw =
    params.delivery_option ?? params.deliveryOption ?? null;

  const [order, setOrder] = useState(orderProp || {});
  const [updating, setUpdating] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [rideMessage, setRideMessage] = useState('');
  const [driverAccepted, setDriverAccepted] = useState(false); // driver accepted flag

  const [driverDetails, setDriverDetails] = useState(null);
  const [driverRating, setDriverRating] = useState(null);   // { average, count }

  const socketRef = useRef(null);

  /* ---------- Back handling ---------- */
  const goBackToOrders = useCallback(() => {
    if (navigation.canGoBack()) { navigation.goBack(); return; }
    try {
      const parent = navigation.getParent?.();
      const names = parent?.getState?.()?.routeNames ?? [];
      const target =
        names.find((n) => /^(Orders|OrderTab|OrdersTab|MartOrders|FoodOrders)$/i.test(n)) ||
        names.find((n) => /Order/i.test(n));
      if (parent && target) { parent.navigate(target); return; }
    } catch { }
    navigation.dispatch(CommonActions.navigate({ name: 'MainTabs', params: { screen: 'Orders' } }));
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      const onBack = () => { goBackToOrders(); return true; };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [goBackToOrders])
  );

  /* ---------- Merchant delivery option & location ---------- */
  const [merchantDeliveryOpt, setMerchantDeliveryOpt] = useState('UNKNOWN'); // SELF|GRAB|BOTH|UNKNOWN
  const [businessId, setBusinessId] = useState(paramBusinessId);
  const [businessCoords, setBusinessCoords] = useState(null); // {lat,lng}

  useEffect(() => {
    (async () => {
      try {
        const token = await SecureStore.getItemAsync('auth_token');
        let finalBizId = businessId || paramBusinessId;

        if (!finalBizId) {
          const saved = await SecureStore.getItemAsync('merchant_login');
          if (saved) {
            try {
              const j = JSON.parse(saved);
              finalBizId =
                j?.business_id ||
                j?.user?.business_id ||
                j?.user?.businessId ||
                j?.id ||
                j?.user?.id ||
                null;
              if (finalBizId) setBusinessId(finalBizId);
            } catch { }
          }
        }

        const bd = await fetchBusinessDetails({ token, business_id: finalBizId });
        if (bd) {
          const opt = bd?.delivery_option ?? bd?.deliveryOption;
          const nOpt = opt ? String(opt).toUpperCase() : 'UNKNOWN';
          setMerchantDeliveryOpt(nOpt);

          const latRaw =
            bd.latitude ?? bd.lat ?? bd.business_latitude ?? bd.business_lat ?? null;
          const lngRaw =
            bd.longitude ?? bd.lng ?? bd.business_longitude ?? bd.business_lng ?? null;

          const latNum = latRaw != null ? Number(latRaw) : NaN;
          const lngNum = lngRaw != null ? Number(lngRaw) : NaN;

          if (!Number.isNaN(latNum) && !Number.isNaN(lngNum)) {
            setBusinessCoords({ lat: latNum, lng: lngNum });
          }
        }
      } catch (e) {
        console.log('[OrderDetails] BUSINESS_DETAILS fetch error:', e?.message || e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- Normalize fulfillment ---------- */
  const fulfillment = useMemo(
    () => resolveFulfillmentType({ ...order, params }),
    [order, params],
  );
  const isPickupFulfillment = useMemo(
    () => (fulfillment || '').toLowerCase() === 'pickup',
    [fulfillment]
  );

  const orderDeliveryHint = useMemo(
    () => resolveDeliveryOptionFromOrder({ ...order, params }),
    [order, params]
  );

  const deliveryOptionInitial = useMemo(() => {
    // 1) highest priority – what navigation passed in
    if (deliveryOptionFromParamsRaw) {
      return String(deliveryOptionFromParamsRaw).toUpperCase();
    }
    // 2) merchant's configured delivery option
    const m = merchantDeliveryOpt;
    if (m !== 'UNKNOWN') return m;
    // 3) whatever we can infer from order itself
    return orderDeliveryHint || '';
  }, [deliveryOptionFromParamsRaw, merchantDeliveryOpt, orderDeliveryHint]);

  // Initial delivery choice: if param explicitly says GRAB, start with grab
  const [deliveryChoice, setDeliveryChoice] = useState(() => {
    const p = String(deliveryOptionFromParamsRaw || '').toUpperCase();
    if (p === 'GRAB') return 'grab';
    return 'self';
  });

  const isBothOption = deliveryOptionInitial === 'BOTH';
  const isSelfSelected = deliveryChoice === 'self';
  const isGrabSelected = deliveryChoice === 'grab';

  const status = (order?.status || 'PENDING').toUpperCase();
  const meta = STATUS_META[status] || STATUS_META.PENDING;

  const isSelfFulfillment = useMemo(() => {
    if (isBothOption) return isSelfSelected;
    return deliveryOptionInitial === 'SELF';
  }, [isBothOption, isSelfSelected, deliveryOptionInitial]);

  const isPlatformDelivery = useMemo(() => {
    if (isBothOption) return isGrabSelected;
    return deliveryOptionInitial === 'GRAB';
  }, [isBothOption, isGrabSelected, deliveryOptionInitial]);

  const deliveryOptionDisplay = useMemo(() => {
    if (isBothOption) {
      if (status === 'READY') {
        if (isSelfSelected) return 'BOTH (SELF chosen)';
        if (isGrabSelected) return 'BOTH (GRAB chosen)';
        return 'BOTH (choose at READY)';
      }
      return 'BOTH';
    }
    return deliveryOptionInitial || '';
  }, [isBothOption, isSelfSelected, isGrabSelected, deliveryOptionInitial, status]);

  /* ---------- Sequence ---------- */
  const STATUS_SEQUENCE = useMemo(
    () => (
      isPickupFulfillment
        ? ['PENDING', 'CONFIRMED', 'READY']
        : ['PENDING', 'CONFIRMED', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED']
    ),
    [isPickupFulfillment]
  );

  const isTerminalNegative = TERMINAL_NEGATIVE.has(status);
  const isTerminalSuccess =
    TERMINAL_SUCCESS.has(status) || (isPickupFulfillment && status === 'READY');

  // Detect customer-cancelled orders (no update buttons)
  const isCancelledByCustomer = useMemo(() => {
    const rawStatus = String(order?.status || '').toUpperCase();
    const reasonRaw =
      order?.status_reason ??
      order?.cancel_reason ??
      order?.cancellation_reason ??
      '';
    const reason = String(reasonRaw || '').toLowerCase();
    const cancelledBy = String(order?.cancelled_by || order?.canceled_by || '').toLowerCase();

    if (cancelledBy && (cancelledBy.includes('customer') || cancelledBy.includes('user'))) {
      return true;
    }

    if (rawStatus.includes('CANCEL')) {
      if (!reason) return true;
      if (reason.includes('customer') || reason.includes('user')) return true;
    }

    if (rawStatus === 'DECLINED') {
      if (
        reason.includes('customer cancelled') ||
        reason.includes('customer canceled') ||
        reason.includes('cancelled by customer') ||
        reason.includes('canceled by customer') ||
        reason.includes('user cancelled') ||
        reason.includes('user canceled')
      ) {
        return true;
      }
    }

    return false;
  }, [
    order?.status,
    order?.status_reason,
    order?.cancel_reason,
    order?.cancellation_reason,
    order?.cancelled_by,
    order?.canceled_by,
  ]);

  // Only block at READY for platform delivery until driver has accepted
  const shouldBlockAtReady =
    status === 'READY' &&
    (isPlatformDelivery || (isBothOption && isGrabSelected)) &&
    !driverAccepted;

  const nextFor = useCallback((curr) => {
    const s = (curr || '').toUpperCase();
    if (TERMINAL_NEGATIVE.has(s) || TERMINAL_SUCCESS.has(s)) return null;
    if (isPickupFulfillment && s === 'READY') return null;
    if (s === 'READY' && shouldBlockAtReady) return null;

    const idx = STATUS_SEQUENCE.indexOf(s);
    if (idx === -1) return 'CONFIRMED';
    return STATUS_SEQUENCE[idx + 1] || null;
  }, [STATUS_SEQUENCE, shouldBlockAtReady, isPickupFulfillment]);

  const stepIndex = findStepIndex(status, STATUS_SEQUENCE);
  const lastIndex = STATUS_SEQUENCE.length - 1;
  const progressIndex = clamp(stepIndex === -1 ? 0 : stepIndex, 0, lastIndex);
  const progressPct = isTerminalNegative ? 0
    : isTerminalSuccess ? 100
      : ((progressIndex + 1) / STATUS_SEQUENCE.length) * 100;

  const stamps = useMemo(() => {
    const s = order?.status_timestamps || {};
    const out = {};
    STATUS_SEQUENCE.forEach((k) => { out[k] = fmtStamp(s[k]); });
    return out;
  }, [order?.status_timestamps, STATUS_SEQUENCE]);

  const restaurantNote = useMemo(() => {
    const n =
      order?.note_for_restaurant ??
      order?.restaurant_note ??
      order?.note_for_store ??
      order?.note ??
      '';
    return String(n || '').trim();
  }, [order]);

  const ifUnavailableDisplay = useMemo(() => {
    const raw = order?.if_unavailable;
    if (!raw) return '';
    const key = String(raw).trim().toLowerCase();
    if (IF_UNAVAILABLE_LABELS[key]) return IF_UNAVAILABLE_LABELS[key];
    return String(raw).replace(/_/g, ' ');
  }, [order?.if_unavailable]);

  const estimatedArrivalDisplay = useMemo(() => {
    const raw = order?.estimated_arrivial_time;
    if (raw == null) return '';
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return `~${Math.round(n)} min`;
    const s = String(raw).trim();
    if (!s) return '';
    return s;
  }, [order?.estimated_arrivial_time]);

  /* ---------- Hydrate from grouped endpoint (live orders ONLY) ---------- */
  const hydrateFromGrouped = useCallback(async () => {
    try {
      if (!routeOrderId) return;
      if (isScheduledOrder) return; // <-- scheduled jobs use payload already passed in

      const hasCore =
        (order?.raw_items && order.raw_items.length) ||
        order?.payment_method ||
        order?.customer_name ||
        order?.delivery_address;
      if (hasCore) return;

      const baseRaw = (ordersGroupedUrl || ENV_ORDER_ENDPOINT || '').trim();
      if (!baseRaw) return;

      let bizId = businessId || paramBusinessId;

      if (!bizId && baseRaw.includes('{businessId}')) {
        try {
          const saved = await SecureStore.getItemAsync('merchant_login');
          if (saved) {
            const j = JSON.parse(saved);
            bizId =
              j?.business_id ||
              j?.user?.business_id ||
              j?.user?.businessId ||
              j?.id ||
              j?.user?.id ||
              null;
            if (bizId && !businessId) setBusinessId(bizId);
          }
        } catch { }
      }

      let groupedUrlFinal = baseRaw;
      if (bizId) {
        groupedUrlFinal = groupedUrlFinal.replace(
          /\{businessId\}/gi,
          encodeURIComponent(String(bizId)),
        );
      }

      const token = await SecureStore.getItemAsync('auth_token');
      const res = await fetch(groupedUrlFinal, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const text = await res.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch { }
      if (!res.ok) {
        throw new Error(json?.message || json?.error || `HTTP ${res.status}`);
      }

      const groups = Array.isArray(json?.data) ? json.data
        : Array.isArray(json) ? json
          : [];

      let allOrders = [];

      for (const g of groups) {
        if (Array.isArray(g?.orders)) {
          // attach wrapper user fields to each order
          const user = g.user || g.customer || g.user_details || {};
          const userName =
            g.customer_name ??
            g.name ??
            user.name ??
            user.user_name ??
            user.full_name ??
            '';
          const userPhone =
            g.phone ??
            user.phone ??
            user.phone_number ??
            user.mobile ??
            '';

          for (const o of g.orders) {
            const oWithUser = {
              ...o,
              user: o.user || user,
              customer_name: o.customer_name ?? userName,
              customer_phone: o.customer_phone ?? userPhone,
              user_name: o.user_name ?? userName,
            };
            allOrders.push(oWithUser);
          }
        } else if (g && (g.id || g.order_id || g.order_code)) {
          allOrders.push(g);
        }
      }

      const match = allOrders.find((o) =>
        sameOrder(o?.id ?? o?.order_id ?? o?.order_code, routeOrderId),
      );
      if (!match) return;

      const normalized = {
        ...match,
        id: String(match?.id ?? match?.order_id ?? match?.order_code ?? routeOrderId),
        order_code: normalizeOrderCode(
          match?.order_code ?? match?.id ?? routeOrderId,
        ),
        customer_name:
          match?.customer_name ??
          match?.user_name ??
          match?.user?.user_name ??
          match?.user?.name ??
          '',
        customer_phone:
          match?.customer_phone ??
          match?.phone ??
          match?.user?.phone ??
          '',
        payment_method: match?.payment_method ?? match?.payment ?? '',
        delivery_address: match?.delivery_address ?? match?.address ?? '',
        delivery_lat: match?.delivery_address?.lat ?? match?.delivery_lat ?? null,
        delivery_lng: match?.delivery_address?.lng ?? match?.delivery_lng ?? null,
        raw_items: Array.isArray(match?.raw_items)
          ? match.raw_items
          : Array.isArray(match?.items)
            ? match.items
            : [],
        total: match?.total ?? match?.total_amount ?? 0,
        status: (match?.status ?? order?.status ?? 'PENDING').toUpperCase(),
        type:
          match?.type ??
          match?.fulfillment_type ??
          match?.delivery_type ??
          order?.type ??
          '',
        delivery_option:
          match?.delivery_option ??
          match?.delivery_by ??
          order?.delivery_option ??
          '',
        status_timestamps:
          match?.status_timestamps ?? order?.status_timestamps ?? {},
        if_unavailable: match?.if_unavailable ?? order?.if_unavailable ?? '',
        estimated_arrivial_time:
          match?.estimated_arrivial_time ??
          match?.eta_minutes ??
          order?.estimated_arrivial_time ??
          null,
      };

      setOrder((prev) => ({ ...prev, ...normalized }));
    } catch (e) {
      console.warn('[OrderDetails] hydrate error:', e?.message);
    }
  }, [ordersGroupedUrl, routeOrderId, order, businessId, paramBusinessId, isScheduledOrder]);


  // Re-hydrate on every focus so status is always fresh (for live orders)
  useFocusEffect(
    useCallback(() => {
      hydrateFromGrouped();
    }, [hydrateFromGrouped])
  );

  /* ---------- Distance & ETA (device) ---------- */
  const [routeInfo, setRouteInfo] = useState(null); // { distanceKm, etaMin }
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState('');
  const [manualPrepMin, setManualPrepMin] = useState('');

  const refCoords = useMemo(() => {
    const addr = order?.delivery_address;
    const addrLat = addr ? (addr.lat ?? addr.latitude) : null;
    const addrLng = addr ? (addr.lng ?? addr.lon ?? addr.longitude) : null;

    const lat =
      (addrLat != null ? addrLat : null) ??
      order?.delivery_lat ??
      order?.lat ??
      order?.destination?.lat ??
      order?.geo?.lat ??
      27.4775469;

    const lng =
      (addrLng != null ? addrLng : null) ??
      order?.delivery_lng ??
      order?.lng ??
      order?.destination?.lng ??
      order?.geo?.lng ??
      89.6387255;

    const cityId =
      order?.city_id ??
      order?.city ??
      (typeof addr === 'object' ? (addr.city ?? addr.town ?? addr.dzongkhag) : null) ??
      'thimphu';

    return {
      lat: Number(lat),
      lng: Number(lng),
      cityId: String(cityId || 'thimphu').toLowerCase(),
    };
  }, [order]);

  useEffect(() => {
    if ((fulfillment || '').toLowerCase() !== 'delivery') {
      setRouteInfo(null);
      setRouteError('');
      return;
    }
    if (!businessCoords) return;

    const from = businessCoords;
    const to = { lat: refCoords.lat, lng: refCoords.lng };

    if (
      !Number.isFinite(from.lat) || !Number.isFinite(from.lng) ||
      !Number.isFinite(to.lat) || !Number.isFinite(to.lng)
    ) {
      setRouteInfo(null);
      setRouteError('');
      return;
    }

    try {
      setRouteLoading(true);
      setRouteError('');

      const distanceKm = computeHaversineKm(from, to);
      if (distanceKm == null) {
        setRouteInfo(null);
        setRouteError('Failed to compute distance');
      } else {
        const avgSpeedKmh = 20;
        const etaMin = distanceKm > 0 ? (distanceKm / avgSpeedKmh) * 60 : 0;
        setRouteInfo({ distanceKm, etaMin });
      }
    } catch {
      setRouteInfo(null);
      setRouteError('Failed to compute distance');
    } finally {
      setRouteLoading(false);
    }
  }, [businessCoords, refCoords.lat, refCoords.lng, fulfillment]);

  const DEFAULT_REASON = {
    CONFIRMED: 'Order accepted by merchant',
    READY: 'Order is ready',
    OUT_FOR_DELIVERY: 'Order handed over for delivery',
    COMPLETED: 'Order delivered',
  };

  const doUpdate = useCallback(async (newStatus, opts = {}) => {
    try {
      const currentStatus = (order?.status || 'PENDING').toUpperCase();
      const fLower = (fulfillment || '').toLowerCase();
      const needsPrep = fLower === 'delivery' || fLower === 'pickup';

      if (newStatus === 'DECLINED') {
        const r = String(opts?.reason ?? '').trim();
        if (r.length < 3) {
          setDeclineOpen(true);
          Alert.alert(
            'Reason required',
            'Please provide at least 3 characters explaining why the order is declined.'
          );
          return;
        }

        const statusReason = r;

        const payload = {
          status: 'DECLINED',
          status_reason: statusReason,
          reason: statusReason,
          cancel_reason: statusReason,
          cancellation_reason: statusReason,
        };

        setUpdating(true);
        const token = await SecureStore.getItemAsync('auth_token');
        const raw = order?.order_code || order?.id || routeOrderId;
        const orderCode = normalizeOrderCode(raw);

        await updateStatusApi({
          endpoint: ENV_UPDATE_ORDER || '',
          orderCode,
          payload,
          token,
        });

        const patch = {
          status: 'DECLINED',
          status_reason: statusReason,
          cancel_reason: statusReason,
          cancellation_reason: statusReason,
        };

        setOrder((prev) => ({ ...prev, ...patch }));
        DeviceEventEmitter.emit('order-updated', {
          id: routeOrderId || order?.id,
          patch,
        });
        return;
      }

      if (
        needsPrep &&
        currentStatus === 'PENDING' &&
        newStatus === 'CONFIRMED'
      ) {
        const prepVal = Number(manualPrepMin);
        if (!Number.isFinite(prepVal) || prepVal <= 0) {
          Alert.alert(
            'Time required',
            'Please enter the time to prepare (in minutes) before accepting the order.'
          );
          return;
        }
      }

      let payload = { status: newStatus };

      if (DEFAULT_REASON[newStatus]) {
        const r = DEFAULT_REASON[newStatus];
        payload.status_reason = r;
        payload.reason = r;
      }

      const deliveryBy =
        (isBothOption && (isSelfSelected || isGrabSelected))
          ? (isSelfSelected ? 'SELF' : 'GRAB')
          : (deliveryOptionInitial || '');
      if (deliveryBy) payload.delivery_option = deliveryBy;

      const prepVal = Number(manualPrepMin);
      const hasPrep = Number.isFinite(prepVal) && prepVal > 0;
      const deliveryVal = routeInfo?.etaMin ?? null;
      const hasDelivery =
        fLower === 'delivery' && deliveryVal != null && Number.isFinite(deliveryVal);

      let computedEta = null;
      if (hasPrep || hasDelivery) {
        const total = (hasPrep ? prepVal : 0) + (hasDelivery ? deliveryVal : 0);
        const totalRounded = Math.round(total);
        if (totalRounded > 0) computedEta = totalRounded;
      }

      if (newStatus === 'CONFIRMED') {
        if (computedEta != null) {
          payload.estimated_minutes = computedEta;
        }

        const total = Number(order?.total ?? order?.total_amount ?? 0);
        const platformFee = Number(
          order?.platform_fee ?? order?.totals_for_business?.fee_share ?? 0
        );
        const discount = Number(order?.discount_amount ?? 0);

        if (Number.isFinite(total)) payload.final_total_amount = total;
        if (Number.isFinite(platformFee)) payload.final_platform_fee = platformFee;
        if (Number.isFinite(discount)) payload.final_discount_amount = discount;
      }

      setUpdating(true);
      const token = await SecureStore.getItemAsync('auth_token');
      const raw = order?.order_code || order?.id || routeOrderId;
      const orderCode = normalizeOrderCode(raw);

      await updateStatusApi({
        endpoint: ENV_UPDATE_ORDER || '',
        orderCode,
        payload,
        token,
      });

      const patch = { status: newStatus };
      if (payload.status_reason) patch.status_reason = payload.status_reason;
      if (payload.delivery_option) patch.delivery_option = payload.delivery_option;
      if (computedEta != null) patch.estimated_arrivial_time = computedEta;

      setOrder((prev) => ({ ...prev, ...patch }));
      DeviceEventEmitter.emit('order-updated', {
        id: routeOrderId || order?.id,
        patch,
      });
    } catch (e) {
      Alert.alert('Update failed', String(e?.message || e));
    } finally {
      setUpdating(false);
    }
  }, [
    routeOrderId,
    order?.id,
    order?.order_code,
    order?.status,
    order?.total,
    order?.total_amount,
    order?.platform_fee,
    order?.discount_amount,
    order?.totals_for_business,
    isBothOption,
    isSelfSelected,
    isGrabSelected,
    deliveryOptionInitial,
    manualPrepMin,
    routeInfo,
    fulfillment,
  ]);

  const next = nextFor(status);
  const primaryLabel = status === 'PENDING'
    ? 'Accept'
    : next
      ? STATUS_META[next]?.label || 'Next'
      : null;

  const onPrimaryAction = useCallback(() => {
    if (!next || updating) return;
    doUpdate(next);
  }, [next, updating, doUpdate]);

  const onDecline = useCallback(() => setDeclineOpen(true), []);
  const canDecline = useMemo(() => String(declineReason).trim().length >= 3, [declineReason]);
  const confirmDecline = useCallback(() => {
    const r = String(declineReason).trim();
    if (r.length < 3) {
      Alert.alert('Reason required', 'Please type a brief reason (min 3 characters).');
      return;
    }
    setDeclineOpen(false);
    doUpdate('DECLINED', { reason: r });
    setDeclineReason('');
  }, [declineReason, doUpdate]);

  const etaText = useMemo(() => {
    if (routeLoading) return 'Distance & ETA: calculating…';

    const prepVal = Number(manualPrepMin);
    const hasPrep = Number.isFinite(prepVal) && prepVal > 0;
    const distanceKm = routeInfo?.distanceKm;
    const deliveryVal = routeInfo?.etaMin;
    const hasDelivery = deliveryVal != null && Number.isFinite(deliveryVal);

    const parts = [];

    if (hasDelivery && distanceKm != null) {
      parts.push(`Distance: ${distanceKm.toFixed(1)} km`);
      parts.push(`Delivery time ~${Math.round(deliveryVal)} min`);
    } else if (hasDelivery) {
      parts.push(`Delivery time ~${Math.round(deliveryVal)} min`);
    } else if (routeError) {
      parts.push('Distance & ETA not available');
    } else {
      parts.push('Distance & ETA: —');
    }

    if (hasPrep) {
      const total = prepVal + (hasDelivery ? deliveryVal : 0);
      const totalLine = `Total time ~${Math.round(total)} min`;
      parts.push(totalLine);
    }

    return parts.join('\n');
  }, [routeLoading, routeInfo, routeError, manualPrepMin]);

  const etaShortText = useMemo(() => {
    const rawEta =
      order?.eta_minutes ??
      order?.estimated_arrivial_time ??
      null;

    const etaFromOrder = (() => {
      if (rawEta == null) return null;
      const n = Number(rawEta);
      if (Number.isFinite(n) && n > 0) return Math.round(n);
      const s = String(rawEta).trim();
      if (!s) return null;
      if (/min/i.test(s)) return s;
      return null;
    })();

    if (typeof etaFromOrder === 'string') return `ETA ${etaFromOrder}`;
    if (typeof etaFromOrder === 'number') return `ETA ~${etaFromOrder} min`;

    const prepVal = Number(manualPrepMin);
    const hasPrep = Number.isFinite(prepVal) && prepVal > 0;
    const deliveryVal = routeInfo?.etaMin ?? null;
    const hasDelivery = deliveryVal != null && Number.isFinite(deliveryVal);

    const total = (hasPrep ? prepVal : 0) + (hasDelivery ? deliveryVal : 0);

    if (total > 0) return `ETA ~${Math.round(total)} min`;
    if (hasDelivery) return `ETA ~${Math.round(deliveryVal)} min`;

    return 'ETA not available';
  }, [order?.eta_minutes, order?.estimated_arrivial_time, manualPrepMin, routeInfo]);

  /* ---------- Driver rating fetch ---------- */
  const fetchDriverRating = useCallback(
    async (driverId) => {
      try {
        if (!ENV_DRIVER_RATING) {
          console.log('[OrderDetails] ENV_DRIVER_RATING not set, skipping rating fetch');
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
        try { json = text ? JSON.parse(text) : null; } catch { }

        if (!res.ok) {
          throw new Error(json?.message || json?.error || `HTTP ${res.status}`);
        }

        // Try a few common shapes: data.summary, data, first of data array, etc.
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
        console.log('[OrderDetails] Failed to fetch driver rating:', err?.message || err);
      }
    },
    []
  );

  /* ---------- Driver details fetch using ENV_DRIVER_DETAILS ---------- */
  const fetchDriverDetails = useCallback(
    async (driverId) => {
      try {
        if (!ENV_DRIVER_DETAILS) {
          console.log('[OrderDetails] ENV_DRIVER_DETAILS not set, skipping driver details fetch');
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
        try { json = text ? JSON.parse(text) : null; } catch { }

        if (!res.ok) {
          throw new Error(json?.message || json?.error || `HTTP ${res.status}`);
        }

        const drv =
          json?.details ||
          json?.data ||
          json?.driver ||
          json;

        setDriverDetails(drv);

        // Fetch rating as well
        await fetchDriverRating(driverId);
      } catch (err) {
        console.log('[OrderDetails] Failed to fetch driver details:', err?.message || err);
      }
    },
    [fetchDriverRating]
  );

  /* ---------- Grab broadcast-delivery + socket deliveryAccepted ---------- */
  const [sendingGrab, setSendingGrab] = useState(false);

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

  const sendGrabDeliveryRequest = useCallback(async () => {
    try {
      if (!ENV_SEND_REQUEST_DRIVER) {
        Alert.alert(
          'Grab delivery not configured',
          'SEND_REQUEST_DRIVER_ENDPOINT is missing in environment variables.'
        );
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

      const baseFare = Number(
        order?.delivery_fee ?? order?.merchant_delivery_fee ?? 0
      );

      const fare = Number(order?.total ?? order?.total_amount ?? 70);
      const fareCents = Math.round(baseFare * 100);

      const pmRaw = String(order?.payment_method || '').toUpperCase();
      const paymentType = pmRaw.includes('WALLET') || pmRaw.includes('ONLINE')
        ? 'WALLET'
        : 'CASH_ON_DELIVERY';

      // Ensure payment is successful before continuing
      const paymentSuccess = await handlePaymentDeduction(order?.merchant_id, fare);
      if (!paymentSuccess) {
        Alert.alert('Payment failed', 'Unable to process payment for delivery.');
        return;
      }

      const payload = {
        passenger_id: order?.user_id ?? order?.customer_id ?? 59,
        merchant_id: Number(businessId),
        cityId: refCoords.cityId || 'thimphu',
        service_code: 'D',
        serviceType: 'delivery_bike',
        pickup: [pickupLat, pickupLng],
        dropoff: [dropLat, dropLng],
        pickup_place: order?.business_name ?? order?.store_name,
        dropoff_place: order?.delivery_address?.address ?? '',
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

      // If successful, update merchant's wallet to deduct fare
      await deductFromMerchantWallet(businessId, fare);

    } catch (e) {
      if (grabLoopActiveRef.current && !driverAcceptedRef.current) {
        setRideMessage('Retrying to find nearby drivers…');
      } else {
        Alert.alert('Grab delivery failed', String(e?.message || e));
      }
    } finally {
      setSendingGrab(false);
    }
  }, [businessCoords, refCoords, routeInfo, order, businessId, ownerType]);

  /**
   * Handle the payment deduction for the delivery.
   */
  const handlePaymentDeduction = async (merchantId, fare) => {
    try {
      const token = await SecureStore.getItemAsync('auth_token');
      const res = await fetch(ENV_MERCHANT_WALLET_DEDUCTION_ENDPOINT, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          merchant_id: merchantId,
          amount: fare,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.message || 'Failed to deduct from merchant wallet');
      }
      return true;
    } catch (e) {
      console.log('Payment Deduction Failed:', e?.message || e);
      return false;
    }
  };

  /**
   * Deduct the fare amount from the merchant's wallet.
   */
  const deductFromMerchantWallet = async (merchantId, fare) => {
    try {
      const token = await SecureStore.getItemAsync('auth_token');
      const res = await fetch(ENV_MERCHANT_WALLET_DEDUCTION_ENDPOINT, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          merchant_id: merchantId,
          amount: fare,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.message || 'Failed to deduct from merchant wallet');
      }

      console.log('Merchant wallet successfully updated.');
    } catch (e) {
      console.log('Wallet Deduction Failed:', e?.message || e);
    }
  };

  const scheduleNextGrabRequest = useCallback(() => {
    if (!grabLoopActiveRef.current || driverAcceptedRef.current) return;
    grabLoopTimeoutRef.current = setTimeout(async () => {
      if (!grabLoopActiveRef.current || driverAcceptedRef.current) return;
      await sendGrabDeliveryRequest();
      scheduleNextGrabRequest();
    }, 30000);
  }, [sendGrabDeliveryRequest]);

  const startGrabLoop = useCallback(async () => {
    driverAcceptedRef.current = false;
    setDriverAccepted(false); // reset when starting new search
    grabLoopActiveRef.current = true;
    setRideMessage('Searching for nearby drivers…');
    await sendGrabDeliveryRequest();
    scheduleNextGrabRequest();
  }, [sendGrabDeliveryRequest, scheduleNextGrabRequest]);

  useEffect(() => {
    if (status !== 'READY' || isTerminalNegative || isTerminalSuccess) {
      stopGrabLoop();
    }
  }, [status, isTerminalNegative, isTerminalSuccess, stopGrabLoop]);

  // Summary text: name + phone + rating
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

  // Socket: connect as merchant and listen to deliveryAccepted
  useEffect(() => {
    if (!ENV_RIDE_SOCKET) {
      return;
    }

    let socket;
    let handler;

    (async () => {
      let merchantId = businessId || paramBusinessId;

      if (!merchantId) {
        try {
          const saved = await SecureStore.getItemAsync('merchant_login');
          if (saved) {
            const j = JSON.parse(saved);
            merchantId =
              j?.business_id ||
              j?.user?.business_id ||
              j?.user?.businessId ||
              j?.id ||
              j?.user?.id ||
              null;
          }
        } catch (err) {
          console.log('[OrderDetails] Failed to read merchant_login from SecureStore:', err);
        }
      }

      if (!merchantId) {
        console.log('[OrderDetails] No merchantId found, NOT connecting ride socket');
        return;
      }

      socket = io(ENV_RIDE_SOCKET, {
        transports: ['websocket'],
        query: {
          merchantId: String(merchantId),
          role: 'merchant',
        },
      });
      socketRef.current = socket;

      handler = (payload) => {
        try {
          const thisOrderCode = normalizeOrderCode(
            order?.order_code || order?.id || routeOrderId
          );
          const payloadOrder =
            payload?.order_code || payload?.orderId || payload?.order_id;

          if (payloadOrder && thisOrderCode && !sameOrder(payloadOrder, thisOrderCode)) {
            return;
          }
        } catch (err) {
          console.log(
            '[OrderDetails] deliveryAccepted match error, proceeding anyway:',
            err,
          );
        }

        driverAcceptedRef.current = true;
        setDriverAccepted(true);
        stopGrabLoop();

        // Get driverId from payload and fetch details + rating
        const driverId =
          payload?.driver_id ??
          payload?.driverId ??
          payload?.driver?.id ??
          payload?.driver?.driver_id ??
          null;

        if (driverId != null) {
          fetchDriverDetails(driverId);
        } else {
          console.log('[OrderDetails] No driverId found in deliveryAccepted payload');
        }

        setRideMessage(
          'Driver has accepted the delivery request (first come first basis).',
        );
        Alert.alert(
          'Driver accepted',
          'Driver has accepted the delivery request (first come first basis).',
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.order_code, order?.id, routeOrderId, businessId, paramBusinessId, stopGrabLoop, fetchDriverDetails]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('order-updated', ({ id, patch }) => {
      if (String(id) === String(routeOrderId)) setOrder((prev) => ({ ...prev, ...patch }));
    });
    return () => sub?.remove?.();
  }, [routeOrderId]);

  /* ---------------- UI ---------------- */
  const headerTopPad = Math.max(insets.top, 8) + 18;
  const fulfillmentLower = (fulfillment || '').toLowerCase();
  const items = order?.raw_items || [];
  const totalLabel = money(order?.total ?? order?.total_amount ?? 0);

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      {/* Header */}
      <View style={[styles.headerBar, { paddingTop: headerTopPad }]}>
        <Pressable onPress={goBackToOrders} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color="#0f172a" />
        </Pressable>
        <Text style={styles.headerTitle}>Order details</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        {/* Card */}
        <View style={styles.card}>
          {/* Top row: id + status chip */}
          <View style={styles.idRow}>
            <Text style={styles.orderId}>#{order?.id || routeOrderId}</Text>
            <View>
              <ActivityIndicator animating={false} size="small" color="transparent" />
            </View>
          </View>

          <StatusRail
            status={status}
            statusSequence={STATUS_SEQUENCE}
            isTerminalNegative={isTerminalNegative}
            isTerminalSuccess={isTerminalSuccess}
            progressPct={progressPct}
            progressIndex={progressIndex}
          />

          <MetaSection
            order={order}
            status={status}
            fulfillment={fulfillment}
            fulfillmentLower={fulfillmentLower}
            deliveryOptionDisplay={deliveryOptionDisplay}
            ifUnavailableDisplay={ifUnavailableDisplay}
            estimatedArrivalDisplay={estimatedArrivalDisplay}
            etaText={etaText}
            etaShortText={etaShortText}
            manualPrepMin={manualPrepMin}
            setManualPrepMin={setManualPrepMin}
            restaurantNote={restaurantNote}
            driverDetails={driverDetails}
            driverRating={driverRating}
          />
        </View>

        {/* For scheduled jobs we just show details (no self/grab chooser, no status actions) */}
        {!isScheduledOrder && (
          <>
            <DeliveryMethodChooser
              status={status}
              isBothOption={isBothOption}
              isTerminalNegative={isTerminalNegative}
              isTerminalSuccess={isTerminalSuccess}
              isSelfSelected={isSelfSelected}
              isGrabSelected={isGrabSelected}
              sendingGrab={sendingGrab}
              rideMessage={rideMessage}
              driverSummaryText={driverSummaryText}
              driverAccepted={driverAccepted}
              setDeliveryChoice={setDeliveryChoice}
              stopGrabLoop={stopGrabLoop}
              startGrabLoop={startGrabLoop}
            />

            {status === 'READY' &&
              !isBothOption &&
              isPlatformDelivery &&
              (!!rideMessage || !!driverSummaryText) && (
                <View style={[styles.block, { marginTop: 12 }]}>
                  {rideMessage ? (
                    <Text style={[styles.segmentHint, { marginTop: 8 }]}>
                      {rideMessage}
                    </Text>
                  ) : null}
                  {driverSummaryText ? (
                    <Text
                      style={[
                        styles.segmentHint,
                        { marginTop: 4, fontWeight: '600' },
                      ]}
                    >
                      {driverSummaryText}
                    </Text>
                  ) : null}
                </View>
              )}

            <UpdateStatusActions
              status={status}
              isCancelledByCustomer={isCancelledByCustomer}
              isTerminalNegative={isTerminalNegative}
              isTerminalSuccess={isTerminalSuccess}
              isBothOption={isBothOption}
              isGrabSelected={isGrabSelected}
              isPlatformDelivery={isPlatformDelivery}
              updating={updating}
              next={next}
              primaryLabel={primaryLabel}
              onPrimaryAction={onPrimaryAction}
              doUpdate={doUpdate}
              onDecline={onDecline}
              driverAccepted={driverAccepted}
            />
          </>
        )}

        <ItemsBlock items={items} />
        <TotalsBlock itemsCount={items.length || 0} totalLabel={totalLabel} />
      </ScrollView>

      <DeclineModal
        visible={declineOpen}
        declineReason={declineReason}
        setDeclineReason={setDeclineReason}
        canDecline={canDecline}
        onCancel={() => setDeclineOpen(false)}
        onConfirm={confirmDecline}
      />
    </SafeAreaView>
  );
}
