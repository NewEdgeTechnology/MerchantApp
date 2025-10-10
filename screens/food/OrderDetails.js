// screens/food/OrderDetails.js
// Sequence rail + two-button actions (Accept/Reject when pending; Next when later)

import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Alert, Modal, TextInput, ActivityIndicator,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { UPDATE_ORDER_STATUS_ENDPOINT as ENV_UPDATE_ORDER } from '@env';
import { DeviceEventEmitter } from 'react-native';

const money = (n, c = 'Nu') => `${c} ${Number(n ?? 0).toFixed(2)}`;
const norm = (s='') => String(s).toLowerCase().trim();

/* ---------------- Status config (BACKEND KEYS, FRIENDLY LABELS) ---------------- */
const STATUS_META = {
  PENDING:           { label: 'Pending',   color: '#0ea5e9', bg: '#e0f2fe', border: '#bae6fd', icon: 'time-outline' },
  CONFIRMED:         { label: 'Accepted',  color: '#16a34a', bg: '#ecfdf5', border: '#bbf7d0', icon: 'checkmark-circle-outline' },
  PREPARING:         { label: 'Preparing', color: '#6366f1', bg: '#eef2ff', border: '#c7d2fe', icon: 'restaurant-outline' },
  READY:             { label: 'Ready',     color: '#2563eb', bg: '#dbeafe', border: '#bfdbfe', icon: 'cube-outline' },
  OUT_FOR_DELIVERY:  { label: 'Out for delivery', color: '#f59e0b', bg: '#fef3c7', border: '#fde68a', icon: 'bicycle-outline' },
  COMPLETED:         { label: 'Delivered', color: '#047857', bg: '#ecfdf5', border: '#bbf7d0', icon: 'checkmark-done-outline' },
  CANCELLED:         { label: 'Rejected',  color: '#b91c1c', bg: '#fee2e2', border: '#fecaca', icon: 'close-circle-outline' },
};

const TERMINAL_NEGATIVE = new Set(['CANCELLED']);
const TERMINAL_SUCCESS  = new Set(['COMPLETED']);

/* ---------------- helpers ---------------- */
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const findStepIndex = (status, seq) => seq.indexOf((status || '').toUpperCase());
const fmtStamp = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};

// Accepts "ORD-64049678" or "64049678" → "ORD-64049678"
const normalizeOrderCode = (raw) => {
  if (!raw) return null;
  const s = String(raw).trim();
  const digits = (s.match(/\d+/) || [])[0];
  if (!digits) return s;
  return `ORD-${digits}`;
};

// Build URL like: <ENV_UPDATE_ORDER>/<ORD-XXXX>/status
const buildUpdateUrl = (base, orderCode) => {
  const clean = String(base || '').trim().replace(/\/+$/, '');
  if (!clean || !orderCode) return null;

  let url = clean
    .replace(/\{\s*order_id\s*\}/gi, orderCode)
    .replace(/\{\s*order\s*\}/gi, orderCode)
    .replace(/:order_id/gi, orderCode)
    .replace(/:order/gi, orderCode);

  if (url !== clean) {
    if (!/\/status(?:\?|$)/i.test(url)) url = `${url}/status`;
    return url;
  }
  return `${clean}/${orderCode}/status`;
};

/* ---------------- API ---------------- */
async function updateStatusApi({ endpoint, orderCode, payload, token }) {
  const url = buildUpdateUrl(endpoint, orderCode);
  if (!url) throw new Error('Invalid update endpoint');

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  if (!res.ok) throw new Error(json?.message || json?.error || `HTTP ${res.status}`);
  return json;
}

/* ---------------- tiny UI atoms ---------------- */
const Chip = ({ label, color, bg, border, icon }) => (
  <View style={[styles.pill, { backgroundColor: bg, borderColor: border }]}>
    <Ionicons name={icon} size={14} color={color} />
    <Text style={[styles.pillText, { color }]} numberOfLines={1}>{label}</Text>
  </View>
);

const Step = ({ label, ringColor, fill, icon, time, onPress, disabled, dimmed }) => {
  const border = ringColor || '#cbd5e1';
  const bg = fill ? border : '#fff';
  const iconColor = fill ? '#fff' : border;
  return (
    <Pressable style={styles.stepWrap} onPress={onPress} disabled={disabled}>
      <View style={[styles.stepDot, { borderColor: border, backgroundColor: bg }]}>
        <Ionicons name={icon} size={14} color={iconColor} />
      </View>
      <Text style={[styles.stepLabel, { color: dimmed ? '#94a3b8' : '#334155' }]} numberOfLines={1}>
        {label}
      </Text>
      {time ? <Text style={styles.stepTime}>{time}</Text> : null}
    </Pressable>
  );
};

/* ======================= Screen ======================= */
export default function OrderDetails() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();

  const params = route?.params ?? {};
  const orderProp = params.order ?? null;
  const routeOrderId = params.orderId ?? null; // may be "ORD-..." or just digits

  const [order, setOrder] = useState(orderProp || {});
  const [updating, setUpdating] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // --- DRIVER (dummy) state ---
  const [drivers, setDrivers] = useState([]);
  const [loadingDrivers, setLoadingDrivers] = useState(false);
  const [offerPendingDriver, setOfferPendingDriver] = useState(null);
  const [waitingDriverAccept, setWaitingDriverAccept] = useState(false);
  const acceptTimerRef = useRef(null);

  // Detect owner type robustly (route param takes priority)
  const ownerTypeRaw =
    (params.ownerType ?? params.ownertype ?? params.owner_type ??
      order?.ownerType ?? order?.owner_type ?? '').toString().toLowerCase();
  const isMartOwner = ownerTypeRaw === 'mart'; // Food = default when false

  // delivery mode detection
  const deliveryMode = useMemo(() => {
    const s = norm(order?.delivery_option ?? order?.delivery_type ?? order?.type ?? '');
    if (!s) return '';
    if (s.includes('self')) return 'self';
    if (s.includes('grab') || s.includes('platform') || s.includes('delivery')) return 'grab';
    return s;
  }, [order]);
  const isPlatformDelivery = deliveryMode === 'grab';

  // Dynamic sequence: remove PREPARING for mart; keep it for food
  const STATUS_SEQUENCE = useMemo(
    () =>
      isMartOwner
        ? ['PENDING', 'CONFIRMED', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED']
        : ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED'],
    [isMartOwner]
  );

  // Compute next step from the dynamic sequence
  const nextFor = useCallback(
    (curr) => {
      const s = (curr || '').toUpperCase();
      if (TERMINAL_NEGATIVE.has(s) || TERMINAL_SUCCESS.has(s)) return null;

      // If backend sends PREPARING but mart flow hides it, jump to READY
      if (isMartOwner && s === 'PREPARING') return 'READY';

      // IMPORTANT: Gate READY → OUT_FOR_DELIVERY behind driver acceptance when platform delivery
      if (s === 'READY' && isPlatformDelivery) return null;

      const idx = STATUS_SEQUENCE.indexOf(s);
      if (idx === -1) {
        if (s === 'PENDING') return 'CONFIRMED';
        return STATUS_SEQUENCE[0] || null;
      }
      return STATUS_SEQUENCE[idx + 1] || null;
    },
    [STATUS_SEQUENCE, isMartOwner, isPlatformDelivery]
  );

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('order-updated', ({ id, patch }) => {
      if (String(id) === String(routeOrderId)) setOrder((prev) => ({ ...prev, ...patch }));
    });
    return () => sub?.remove?.();
  }, [routeOrderId]);

  const status = (order?.status || 'PENDING').toUpperCase();
  const meta = STATUS_META[status] || STATUS_META.PENDING;

  const isTerminalNegative = TERMINAL_NEGATIVE.has(status);
  const isTerminalSuccess  = TERMINAL_SUCCESS.has(status);

  // progress calc
  const stepIndex = findStepIndex(status, STATUS_SEQUENCE);
  const lastIndex = STATUS_SEQUENCE.length - 1;
  const progressIndex = clamp(stepIndex === -1 ? 0 : stepIndex, 0, lastIndex);

  const progressPct = isTerminalNegative
    ? 0
    : isTerminalSuccess
    ? 100
    : ((progressIndex + 1) / STATUS_SEQUENCE.length) * 100;

  const stamps = useMemo(() => {
    const s = order?.status_timestamps || {};
    const out = {};
    STATUS_SEQUENCE.forEach((k) => { out[k] = fmtStamp(s[k]); });
    return out;
  }, [order?.status_timestamps, STATUS_SEQUENCE]);

  // 🔹 Restaurant note (supports multiple common field names)
  const restaurantNote = useMemo(() => {
    const n =
      order?.note_for_restaurant ??
      order?.restaurant_note ??
      order?.note_for_store ??
      order?.note ??
      '';
    return String(n || '').trim();
  }, [order]);

  // Auto-reason strings to satisfy backend validator for non-rejection updates
  const DEFAULT_REASON = {
    CONFIRMED: 'Order accepted by merchant',
    PREPARING: 'Order is being prepared',
    READY: 'Order is ready',
    OUT_FOR_DELIVERY: 'Order handed over for delivery',
    COMPLETED: 'Order delivered',
  };

  const doUpdate = useCallback(async (newStatus, opts = {}) => {
    try {
      let payload;

      if (newStatus === 'CANCELLED') {
        // Only rejection requires a typed reason
        const r = String(opts?.reason ?? '').trim();
        if (r.length < 3) {
          setRejectOpen(true);
          Alert.alert('Reason required', 'Please provide at least 3 characters explaining why the order is rejected.');
          return;
        }
        payload = {
          status: 'CANCELLED',
          reason: `Merchant rejected: ${r}`,
        };
      } else {
        // Accept/Next transitions → no user prompt, but include an auto-reason to pass backend validation
        payload = { status: newStatus };
        if (DEFAULT_REASON[newStatus]) payload.reason = DEFAULT_REASON[newStatus];
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
      setOrder((prev) => ({ ...prev, ...patch }));
      DeviceEventEmitter.emit('order-updated', { id: routeOrderId || order?.id, patch });
    } catch (e) {
      Alert.alert('Update failed', String(e?.message || e));
    } finally {
      setUpdating(false);
    }
  }, [routeOrderId, order?.id, order?.order_code]);

  const next = nextFor(status);
  const primaryLabel = status === 'PENDING'
    ? 'Accept'
    : next
    ? STATUS_META[next]?.label || 'Next'
    : null;

  const onPrimaryAction = useCallback(() => {
    if (!next || updating) return;
    doUpdate(next); // Accept/Next → no reason prompt
  }, [next, updating, doUpdate]);

  const onReject = () => setRejectOpen(true);

  const confirmReject = () => {
    const r = String(rejectReason).trim();
    if (r.length < 3) {
      Alert.alert('Reason required', 'Please type a brief reason (min 3 characters).');
      return;
    }
    setRejectOpen(false);
    doUpdate('CANCELLED', { reason: r });
    setRejectReason('');
  };

  const canReject = String(rejectReason).trim().length >= 3;

  const headerTopPad = Math.max(insets.top, 8) + 18;

  // ─────────────── Dummy driver “API” ───────────────
  const makeDummyDrivers = () => {
    // small randomized list
    const base = [
      { id: 201, name: 'Kezang',   distance_km: 1.2, vehicle_type: 'Bike', rating: 4.9 },
      { id: 202, name: 'Sonam',    distance_km: 2.5, vehicle_type: 'Scooter', rating: 4.5 },
      { id: 203, name: 'Tshering', distance_km: 0.8, vehicle_type: 'Bike', rating: 4.7 },
      { id: 204, name: 'Pelden',   distance_km: 3.1, vehicle_type: 'Car', rating: 4.3 },
    ];
    return base.sort(() => Math.random() - 0.5).slice(0, 3 + Math.floor(Math.random()*2));
  };

  const loadDummyDrivers = useCallback(async () => {
    if (!(status === 'READY' && isPlatformDelivery)) return;
    try {
      setLoadingDrivers(true);
      await new Promise(r => setTimeout(r, 800)); // simulate network
      setDrivers(makeDummyDrivers());
    } finally {
      setLoadingDrivers(false);
    }
  }, [status, isPlatformDelivery]);

  // load dummy drivers when we land on READY
  useEffect(() => {
    if (status === 'READY' && isPlatformDelivery) {
      loadDummyDrivers();
    } else {
      setDrivers([]);
      setOfferPendingDriver(null);
      setWaitingDriverAccept(false);
    }
  }, [status, isPlatformDelivery, loadDummyDrivers]);

  // Offer to driver → simulate acceptance in 3–6 seconds, then flip to OUT_FOR_DELIVERY
  const offerToDriver = useCallback((driverId) => {
    setOfferPendingDriver(driverId);
    setWaitingDriverAccept(true);

    if (acceptTimerRef.current) clearTimeout(acceptTimerRef.current);
    const ms = 3000 + Math.floor(Math.random() * 3000); // 3–6s
    acceptTimerRef.current = setTimeout(() => {
      setWaitingDriverAccept(false);
      setOfferPendingDriver(null);

      // flip locally: READY → OUT_FOR_DELIVERY
      const patch = { status: 'OUT_FOR_DELIVERY', assigned_driver: driverId };
      setOrder((prev) => ({ ...prev, ...patch }));
      DeviceEventEmitter.emit('order-updated', { id: routeOrderId || order?.id, patch });
    }, ms);
  }, [order?.id, routeOrderId]);

  useEffect(() => {
    return () => {
      if (acceptTimerRef.current) clearTimeout(acceptTimerRef.current);
    };
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['left','right','bottom']}>
      {/* Header — centered title like PersonalInformation.js */}
      <View style={[styles.headerBar, { paddingTop: headerTopPad }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color="#0f172a" />
        </Pressable>
        <Text style={styles.headerTitle}>Order details</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        {/* Card */}
        <View style={styles.card}>
          {/* Top row: id + current status chip */}
          <View style={styles.idRow}>
            <Text style={styles.orderId}>#{order?.id || routeOrderId}</Text>
            <Chip
              label={STATUS_META[status]?.label}
              color={meta.color}
              bg={meta.bg}
              border={meta.border}
              icon={meta.icon}
            />
          </View>

          {/* Progress */}
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
          </View>

          {/* Steps row */}
          <View style={styles.stepsRow}>
            {STATUS_SEQUENCE.map((k, i) => {
              const isActiveStep = k === status;
              const done = isTerminalSuccess ? true : !isTerminalNegative && i <= progressIndex;
              const fill = done;

              let ring = '#cbd5e1';
              if (isTerminalNegative) ring = isActiveStep ? (STATUS_META.CANCELLED.color) : '#cbd5e1';
              else if (isTerminalSuccess) ring = '#16a34a';
              else ring = (done || isActiveStep) ? '#16a34a' : '#cbd5e1';

              const dimmed = !isActiveStep && !(done || isTerminalSuccess);
              const icon = STATUS_META[k]?.icon || 'ellipse-outline';

              return (
                <Step
                  key={k}
                  label={STATUS_META[k].label}
                  icon={icon}
                  ringColor={ring}
                  fill={fill}
                  dimmed={dimmed}
                  onPress={() => {}}
                  disabled
                />
              );
            })}
          </View>

          {/* Terminal info (only for Rejected) */}
          {isTerminalNegative ? (
            <View style={styles.terminalRow}>
              <Ionicons name="information-circle-outline" size={16} color={STATUS_META.CANCELLED.color} />
              <Text style={[styles.terminalText, { color: STATUS_META.CANCELLED.color }]}>
                Flow ended: {STATUS_META.CANCELLED.label}
              </Text>
            </View>
          ) : null}

          {/* Meta */}
          <View style={{ marginTop: 12, gap: 8 }}>
            <Row icon="person-outline" text={`${order.customer_name || '—'}${order.customer_phone ? ` • ${order.customer_phone}` : ''}`} />
            <Row icon="bicycle-outline" text={`Type: ${order.type || order.delivery_option || '—'}`} />
            <Row icon="card-outline" text={`Payment: ${order.payment_method || '—'}`} />
            <Row icon="navigate-outline" text={order.delivery_address || '—'} />
          </View>

          {/* 🔹 Restaurant note bubble (only if present) */}
          {!!restaurantNote && (
            <View style={styles.noteBox}>
              <Ionicons name="chatbubble-ellipses-outline" size={14} color="#0f766e" />
              <Text style={styles.noteText} numberOfLines={6}>{restaurantNote}</Text>
            </View>
          )}
        </View>

        {/* Update actions — Accept/Reject only when PENDING; otherwise Next (but READY gated for platform delivery) */}
        <Text style={styles.sectionTitle}>Update status</Text>
        {isTerminalNegative || isTerminalSuccess ? (
          <Text style={styles.terminalNote}>No further actions.</Text>
        ) : (
          <View style={styles.actionsRow}>
            {status === 'PENDING' ? (
              <>
                <Pressable
                  onPress={() => doUpdate('CONFIRMED')}
                  disabled={updating}
                  style={({ pressed }) => [styles.primaryBtn, { opacity: updating || pressed ? 0.85 : 1 }]}
                >
                  <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                  <Text style={styles.primaryBtnText}>Accept</Text>
                </Pressable>

                <Pressable
                  onPress={onReject}
                  disabled={updating}
                  style={({ pressed }) => [styles.secondaryBtn, { borderColor: '#ef4444', opacity: updating || pressed ? 0.85 : 1 }]}
                >
                  <Ionicons name="close-circle-outline" size={18} color="#b91c1c" />
                  <Text style={[styles.secondaryBtnText, { color: '#991b1b' }]}>Reject</Text>
                </Pressable>
              </>
            ) : (
              <>
                {/* On READY + platform delivery: hide manual "Next" */}
                {(status !== 'READY' || !isPlatformDelivery) && primaryLabel ? (
                  <Pressable
                    onPress={onPrimaryAction}
                    disabled={updating}
                    style={({ pressed }) => [styles.primaryBtn, { opacity: updating || pressed ? 0.85 : 1 }]}
                  >
                    <Ionicons name="arrow-forward-circle" size={18} color="#fff" />
                    <Text style={styles.primaryBtnText}>{primaryLabel}</Text>
                  </Pressable>
                ) : (
                  status === 'READY' && isPlatformDelivery ? (
                    <Text style={{ color: '#64748b', fontWeight: '600' }}>
                      Assign a driver below to continue…
                    </Text>
                  ) : null
                )}
              </>
            )}
          </View>
        )}

        {/* 🔸 Dummy Driver assignment panel (only READY + platform delivery) */}
        {status === 'READY' && isPlatformDelivery && (
          <View style={styles.block}>
            <RowTitle title="Nearby drivers" />
            <View style={{ marginTop: 8 }} />
            {loadingDrivers ? (
              <View style={{ paddingVertical: 12, alignItems: 'center', gap: 8 }}>
                <ActivityIndicator />
                <Text style={{ color: '#64748b', fontWeight: '600' }}>Loading drivers…</Text>
              </View>
            ) : drivers.length === 0 ? (
              <View style={{ paddingVertical: 12 }}>
                <Text style={{ color: '#64748b', fontWeight: '600' }}>No drivers nearby yet.</Text>
                <View style={{ height: 8 }} />
                <Pressable
                  onPress={loadDummyDrivers}
                  style={({ pressed }) => [styles.secondaryBtn, { borderColor: '#CBD5E1', opacity: pressed ? 0.85 : 1, alignSelf: 'flex-start' }]}
                >
                  <Ionicons name="refresh" size={18} color="#334155" />
                  <Text style={[styles.secondaryBtnText, { color: '#334155' }]}>Refresh</Text>
                </Pressable>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                {drivers.map((d) => (
                  <View key={String(d.id)} style={styles.driverRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.driverName}>{d.name}</Text>
                      <Text style={styles.driverMeta}>
                        {d.distance_km != null ? `${Number(d.distance_km).toFixed(1)} km • ` : ''}
                        {d.vehicle_type || '—'}
                        {d.rating ? ` • ★ ${Number(d.rating).toFixed(1)}` : ''}
                      </Text>
                    </View>

                    {waitingDriverAccept && offerPendingDriver === d.id ? (
                      <View style={styles.waitingTag}>
                        <ActivityIndicator size="small" />
                        <Text style={styles.waitingText}>Waiting…</Text>
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => offerToDriver(d.id)}
                        style={({ pressed }) => [styles.offerBtn, { opacity: pressed ? 0.9 : 1 }]}
                      >
                        <Ionicons name="send-outline" size={16} color="#fff" />
                        <Text style={styles.offerBtnText}>Offer delivery</Text>
                      </Pressable>
                    )}
                  </View>
                ))}

                {waitingDriverAccept ? (
                  <View style={styles.infoHint}>
                    <Ionicons name="alert-circle-outline" size={16} color="#2563eb" />
                    <Text style={styles.infoHintText}>
                      Waiting for driver to accept. We’ll move to “Out for delivery” automatically on acceptance.
                    </Text>
                  </View>
                ) : (
                  <Pressable
                    onPress={loadDummyDrivers}
                    style={({ pressed }) => [styles.secondaryBtn, { borderColor: '#CBD5E1', opacity: pressed ? 0.85 : 1, alignSelf: 'flex-start' }]}
                  >
                    <Ionicons name="refresh" size={18} color="#334155" />
                    <Text style={[styles.secondaryBtnText, { color: '#334155' }]}>Refresh list</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        )}

        {/* Items */}
        <View style={styles.block}>
          <RowTitle title="Items" />
          {(order?.raw_items || []).map((it, idx) => (
            <View key={`${it.item_id || idx}`} style={styles.itemRow}>
              <Text style={styles.itemName} numberOfLines={1}>{it.item_name || 'Item'}</Text>
              <Text style={styles.itemQty}>×{Number(it.quantity ?? 1)}</Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={styles.block}>
          <View style={styles.totRow}>
            <Text style={styles.totLabel}>Items</Text>
            <Text style={styles.totValue}>{(order?.raw_items?.length || 0)}</Text>
          </View>
          <View style={styles.totRow}>
            <Text style={styles.totLabelStrong}>Total</Text>
            <Text style={styles.totValueStrong}>{money(order?.total ?? order?.total_amount ?? 0)}</Text>
          </View>
        </View>
      </ScrollView>

      {/* Reject modal */}
      <Modal visible={rejectOpen} transparent animationType="fade" onRequestClose={() => setRejectOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Reject order</Text>
            <Text style={styles.modalSub}>
              A reason is required:
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Reason (min 3 characters)"
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
            />
            <Text style={{ fontSize: 11, color: canReject ? '#16a34a' : '#ef4444', marginTop: 6 }}>
              {canReject ? 'Looks good.' : 'Please enter at least 3 characters.'}
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
              <Pressable
                style={[styles.dialogBtn, { backgroundColor: '#f1f5f9' }]}
                onPress={() => { setRejectOpen(false); }}
              >
                <Text style={[styles.dialogBtnText, { color: '#0f172a' }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.dialogBtn,
                  { backgroundColor: canReject ? '#ef4444' : '#fecaca', opacity: pressed ? 0.85 : 1 },
                ]}
                onPress={confirmReject}
                disabled={!canReject}
              >
                <Text style={[styles.dialogBtnText, { color: canReject ? '#fff' : '#7f1d1d' }]}>Reject</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* ---------------- tiny pieces ---------------- */
const Row = ({ icon, text }) => (
  <View style={styles.row}>
    <Ionicons name={icon} size={16} color="#64748b" />
    <Text style={styles.rowText} numberOfLines={2}>{text}</Text>
  </View>
);

const RowTitle = ({ title }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
    <Text style={styles.blockTitle}>{title}</Text>
  </View>
);

/* ---------------- styles ---------------- */
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },

  // Centered header (matches PersonalInformation.js)
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

  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  idRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  orderId: { fontWeight: '800', color: '#0f172a', fontSize: 16 },

  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1,
    maxWidth: '60%',
  },
  pillText: { fontWeight: '800' },

  progressTrack: {
    height: 4, backgroundColor: '#e2e8f0', borderRadius: 999,
    overflow: 'hidden', marginTop: 10,
  },
  progressFill: { height: 4, backgroundColor: '#16a34a' },

  /* Steps */
  stepsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingHorizontal: 2,
  },
  stepWrap: { width: 52, alignItems: 'center' },
  stepDot: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff',
  },
  stepLabel: { marginTop: 4, fontSize: 10.5, fontWeight: '700', textAlign: 'center', color: '#334155' },
  stepTime: { marginTop: 1, fontSize: 10, color: '#64748b' },

  terminalRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  terminalText: { fontWeight: '700' },

  sectionTitle: { marginTop: 14, marginBottom: 8, fontWeight: '700', color: '#0f172a' },
  terminalNote: { color: '#64748b', marginBottom: 10 },

  // 🔹 note bubble
  noteBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#ecfeff',   // teal-50
    borderWidth: 1,
    borderColor: '#99f6e4',       // teal-200
  },
  noteText: { flex: 1, color: '#115e59', fontWeight: '600' },

  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#16a34a', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
  },
  primaryBtnText: { color: '#fff', fontWeight: '800' },

  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 10, borderWidth: 1,
  },
  secondaryBtnText: { fontWeight: '800' },

  block: { backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#e2e8f0', marginTop: 12 },
  blockTitle: { fontWeight: '800', color: '#0f172a' },

  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowText: { color: '#475569', fontWeight: '600', flex: 1 },

  itemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  itemName: { color: '#0f172a', fontWeight: '600', flexShrink: 1, paddingRight: 8 },
  itemQty: { color: '#64748b', fontWeight: '700' },

  totRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  totLabel: { color: '#64748b', fontWeight: '700' },
  totValue: { color: '#0f172a', fontWeight: '700' },
  totLabelStrong: { color: '#0f172a', fontWeight: '800' },
  totValueStrong: { color: '#0f172a', fontWeight: '900' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: '#fff', padding: 16, borderRadius: 16, width: '100%' },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  modalSub: { fontSize: 12, color: '#64748b', marginTop: 4 },
  input: {
    borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 8, minHeight: 44, marginTop: 10,
    color: '#0f172a',
  },
  dialogBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  dialogBtnText: { fontWeight: '800' },

  // Driver UI
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 10,
  },
  driverName: { color: '#0f172a', fontWeight: '800' },
  driverMeta: { color: '#475569', fontWeight: '600', marginTop: 2 },
  offerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2563eb',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  offerBtnText: { color: '#fff', fontWeight: '800' },
  waitingTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  waitingText: { color: '#1d4ed8', fontWeight: '800' },
  infoHint: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: '#eef2ff', borderColor: '#c7d2fe', borderWidth: 1, padding: 10, borderRadius: 10 },
  infoHintText: { color: '#3730a3', fontWeight: '700', flex: 1 },
});
