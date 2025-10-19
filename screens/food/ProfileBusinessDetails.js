// ProfileBusinessDetails.js — uses MERCHANT_LOGO for business logo URLs; OpenStreetMap tiles
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity,
  Image, Dimensions, Linking, Platform, ActivityIndicator, TextInput,
  KeyboardAvoidingView, Keyboard, Pressable, Modal, Alert
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import MapView, { Marker, UrlTile, PROVIDER_DEFAULT } from 'react-native-maps';
import { BUSINESS_DETAILS, MERCHANT_LOGO } from '@env';

const { width } = Dimensions.get('window');
const THEME_GREEN = '#16a34a';
const KEY_AUTH_TOKEN = 'auth_token';

/* ───────── helpers (trimmed) ───────── */
function normalizeHost(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    if (Platform.OS === 'android' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) {
      u.hostname = '10.0.2.2';
    }
    return u.toString();
  } catch { return url; }
}
async function fetchJSON(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch {}
    if (!res.ok) throw new Error((json && (json.message || json.error)) || text || `HTTP ${res.status}`);
    return json;
  } finally { clearTimeout(tid); }
}
async function putJSON(url, body, headers = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch {}
    if (!res.ok) throw new Error((json && (json.message || json.error)) || text || `HTTP ${res.status}`);
    return json;
  } finally { clearTimeout(tid); }
}
async function putMultipart(url, bodyObj, fileField, file, headers = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const form = new FormData();

    // append non-null/empty values only
    Object.entries(bodyObj || {}).forEach(([k, v]) => {
      if (v === null || v === undefined) return;
      if (Array.isArray(v) || typeof v === 'object') {
        form.append(k, JSON.stringify(v));
      } else {
        const s = String(v);
        if (s.trim() === '') return;
        form.append(k, s);
      }
    });

    if (file?.uri) {
      form.append(fileField, {
        uri: file.uri,
        name: file.name || 'logo.jpg',
        type: file.mimeType || guessMimeFromUri(file.uri) || 'image/jpeg',
      });
    }
    const res = await fetch(url, {
      method: 'PUT',
      headers: { Accept: 'application/json', ...(headers || {}) },
      body: form,
      signal: controller.signal,
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch {}
    if (!res.ok) throw new Error((json && (json.message || json.error)) || text || `HTTP ${res.status}`);
    return json;
  } finally { clearTimeout(tid); }
}
function shapeFromParams(params = {}) {
  const holidays =
    Array.isArray(params.holidays) ? params.holidays
      : params.holidays ? String(params.holidays).split(',').map(s => s.trim()).filter(Boolean)
        : [];
  return {
    business_name: params.business_name ?? '',
    business_license_number: params.business_license_number ?? '',
    license_image: params.license_image ?? params.licenseImage ?? null,
    latitude: typeof params.latitude === 'number' ? params.latitude : Number(params.latitude ?? '') || null,
    longitude: typeof params.longitude === 'number' ? params.longitude : Number(params.longitude ?? '') || null,
    address: params.address ?? '',
    business_logo: params.business_logo ?? params.logo ?? '',
    delivery_option: params.delivery_option ?? 'BOTH',
    complementary: params.complementary ?? '',
    complementary_details: params.complementary_details ?? '',
    opening_time: params.opening_time ?? '',
    closing_time: params.closing_time ?? '',
    holidays,
  };
}
function to12hText(hhmmss) {
  if (!hhmmss) return { text: '', ampm: 'AM' };
  const [hh, mm = '00'] = String(hhmmss).split(':');
  const h = Math.max(0, Math.min(23, Number(h) || Number(hh) || 0)); // robust
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = ((h + 11) % 12) + 1;
  return { text: `${String(h12)}:${String(mm).padStart(2, '0')}`, ampm };
}
function to24h(text, ampm) {
  if (!text) return '';
  const m = String(text).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return text;
  let h = Math.max(1, Math.min(12, Number(m[1] || 0)));
  const min = Math.max(0, Math.min(59, Number(m[2] || 0)));
  if ((ampm || 'AM') === 'PM' && h < 12) h += 12;
  if ((ampm || 'AM') === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00`;
}
function guessMimeFromUri(uri = '') {
  const u = uri.toLowerCase();
  if (u.endsWith('.png')) return 'image/png';
  if (u.endsWith('.jpg') || u.endsWith('.jpeg')) return 'image/jpeg';
  if (u.endsWith('.heic')) return 'image/heic';
  return 'image/jpeg';
}
function haversine(a, b) {
  if (!a || !b) return null;
  const toRad = d => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
async function reverseGeocode({ latitude, longitude }) {
  try {
    const res = await Location.reverseGeocodeAsync({ latitude, longitude });
    const addr = res?.[0];
    if (!addr) return '';
    const parts = [
      addr.name || addr.street || '',
      addr.subregion || '',
      addr.region || '',
      addr.postalCode || '',
      addr.country || '',
    ].filter(Boolean);
    return parts.join(', ');
  } catch { return ''; }
}

// Build absolute URL using MERCHANT_LOGO for logos, and origin of BUSINESS_DETAILS for license image
const makeLogoUrl = (raw) => {
  if (!raw) return '';
  const s = String(raw).trim();
  if (/^https?:\/\//i.test(s)) return normalizeHost(s);
  const b = (MERCHANT_LOGO || '').replace(/\/+$/, '');
  const p = s.replace(/^\/+/, '');
  return b ? `${b}/${p}` : p;
};
const makeFromOrigin = (raw, base) => {
  if (!raw) return '';
  const s = String(raw).trim();
  if (/^https?:\/\//i.test(s)) return normalizeHost(s);
  let origin = '';
  try { origin = new URL(normalizeHost(base)).origin; } catch {}
  const p = s.replace(/^\/+/, '');
  return origin ? `${origin}/${p}` : p;
};

// remove null/undefined/empty-string fields
function pruneNulls(obj) {
  const out = {};
  Object.entries(obj || {}).forEach(([k, v]) => {
    if (v === null || v === undefined) return;
    if (typeof v === 'string' && v.trim() === '') return;
    out[k] = v;
  });
  return out;
}

/* ───────── component ───────── */
export default function ProfileBusinessDetails() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const route = useRoute();

  const businessId =
    route?.params?.business_id ??
    route?.params?.id ??
    route?.params?.business?.id ?? null;

  const authContext = route?.params?.authContext || null;

  const [data, setData] = useState(() => shapeFromParams(route?.params || {}));
  const [form, setForm] = useState(() => shapeFromParams(route?.params || {}));
  const [loading, setLoading] = useState(Boolean(businessId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [lastUrl, setLastUrl] = useState('');

  // keyboard height for footer lifting
  const [kbHeight, setKbHeight] = useState(0);

  // time state
  const initOpen = to12hText(form.opening_time);
  const initClose = to12hText(form.closing_time);
  const [openText, setOpenText] = useState(initOpen.text);
  const [openAmPm, setOpenAmPm] = useState(initOpen.ampm);
  const [closeText, setCloseText] = useState(initClose.text);
  const [closeAmPm, setCloseAmPm] = useState(initClose.ampm);
  const openRef = useRef(null);
  const closeRef = useRef(null);

  // scroll ref to auto-scroll when keyboard opens
  const scrollRef = useRef(null);
  const autoScrollToEnd = useRef(false);

  // Logo file (picked image) + cache bust for preview
  const [logoFile, setLogoFile] = useState(null);
  const [logoBust, setLogoBust] = useState(0); // cache-buster

  // Map picker state
  const [locationModalVisible, setLocationModalVisible] = useState(false);
  const [pickedCoord, setPickedCoord] = useState(
    form?.latitude && form?.longitude ? { latitude: form.latitude, longitude: form.longitude } : null
  );
  const [mapRegion, setMapRegion] = useState({
    latitude: pickedCoord?.latitude ?? 27.4728,
    longitude: pickedCoord?.longitude ?? 89.639,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  });

  // User location for directions
  const [userLoc, setUserLoc] = useState(null);
  const [userAddr, setUserAddr] = useState('');
  const [pinAddr, setPinAddr] = useState('');
  const [gettingLoc, setGettingLoc] = useState(false);
  const mapRef = useRef(null);
  const [mapType, setMapType] = useState('standard');

  // kb listeners
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = (e) => {
      setKbHeight(e?.endCoordinates?.height ?? 0);
      autoScrollToEnd.current = true;
      setTimeout(() => scrollRef.current?.scrollToEnd?.({ animated: true }), 50);
    };
    const onHide = () => { setKbHeight(0); autoScrollToEnd.current = false; };
    const s1 = Keyboard.addListener(showEvt, onShow);
    const s2 = Keyboard.addListener(hideEvt, onHide);
    return () => { s1.remove(); s2.remove(); };
  }, []);

  const endpoint = useMemo(() => {
    if (!businessId) return null;
    const raw = normalizeHost((BUSINESS_DETAILS || '').trim());
    const fallback = 'http://localhost:8080/api/merchant-business';
    const base = raw || fallback;
    if (/business_id\/?$/.test(base)) return base.replace(/business_id\/?$/, String(businessId));
    return `${base.replace(/\/+$/, '')}/${encodeURIComponent(String(businessId))}`;
  }, [businessId]);

  const getAuthHeader = useCallback(async () => {
    let tokenStr = null;
    const t = authContext?.token;
    if (t) tokenStr = typeof t === 'string' ? t : (t?.access_token ?? null);
    if (!tokenStr) {
      try { tokenStr = await SecureStore.getItemAsync(KEY_AUTH_TOKEN); } catch {}
    }
    return tokenStr ? { Authorization: `Bearer ${tokenStr}` } : {};
  }, [authContext?.token]);

  const load = useCallback(async () => {
    if (!endpoint) { setError('Missing business_id or BUSINESS_DETAILS base URL.'); return; }
    setError(''); setLoading(true); setLastUrl(endpoint);
    try {
      const headers = { Accept: 'application/json', ...(await getAuthHeader()) };
      const json = await fetchJSON(endpoint, { method: 'GET', headers }, 30000);
      const payloadRaw = json?.data || json || {};
      const payload = shapeFromParams({
        ...payloadRaw,
        business_logo:
          payloadRaw?.business_logo || payloadRaw?.business?.business_logo || payloadRaw?.logo,
        license_image:
          payloadRaw?.license_image ||
          payloadRaw?.licenseImage ||
          payloadRaw?.business?.license_image ||
          payloadRaw?.files?.license_image ||
          payloadRaw?.documents?.license_image,
      });
      setData(payload);
      setForm(payload);

      // sync time UI
      const o = to12hText(payload.opening_time);
      setOpenText(o.text); setOpenAmPm(o.ampm);
      const c = to12hText(payload.closing_time);
      setCloseText(c.text); setCloseAmPm(c.ampm);

      // map
      if (payload.latitude && payload.longitude) {
        const coord = { latitude: payload.latitude, longitude: payload.longitude };
        setPickedCoord(coord);
        setMapRegion((r) => ({ ...r, latitude: coord.latitude, longitude: coord.longitude }));
        reverseGeocode(coord).then(setPinAddr);
      } else {
        setPinAddr('');
      }
    } catch (e) {
      const msg = (e?.name === 'AbortError')
        ? 'Request timed out. If on a real device, set BUSINESS_DETAILS to your PC’s LAN IP.'
        : (e?.message || 'Failed to load business details.');
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [endpoint, getAuthHeader]);

  useEffect(() => { if (endpoint) load(); }, [endpoint, load]);

  const buildUpdatePayload = useCallback(() => {
    const lat = pickedCoord?.latitude ?? data?.latitude ?? form?.latitude ?? null;
    const lng = pickedCoord?.longitude ?? data?.longitude ?? form?.longitude ?? null;

    return {
      business_name: String(form.business_name ?? ''),
      latitude: Number.isFinite(lat) ? lat : null,
      longitude: Number.isFinite(lng) ? lng : null,
      address: String(form.address ?? ''),
      business_logo: String(form.business_logo ?? ''), // keep existing path when no new file
      delivery_option: String(form.delivery_option ?? 'BOTH'),
      complementary: String(form.complementary ?? ''),
      complementary_details: String(form.complementary_details ?? ''),
      opening_time: to24h(openText, openAmPm) || '',
      closing_time: to24h(closeText, closeAmPm) || '',
      holidays: Array.isArray(form.holidays) ? form.holidays : [],
      business_license_number: String(form.business_license_number ?? ''),
    };
  }, [form, openText, openAmPm, closeText, closeAmPm, pickedCoord, data]);

  const save = useCallback(async () => {
    if (!endpoint) return;

    // basic coord validation
    const lat = pickedCoord?.latitude ?? data?.latitude ?? null;
    const lng = pickedCoord?.longitude ?? data?.longitude ?? null;
    if (!(Number.isFinite(lat) && Number.isFinite(lng))) {
      Alert.alert('Pick a location', 'Please long-press on the map to set latitude & longitude.');
      return;
    }

    setSaving(true);
    try {
      const headers = await getAuthHeader();

      // build + prune payload
      const payloadRaw = buildUpdatePayload();
      const payload = pruneNulls(payloadRaw);

      if (logoFile?.uri) {
        // Don’t send text value for business_logo with file; let backend set it
        delete payload.business_logo;

        const candidates = ['business_logo', 'logo', 'image', 'file'];
        let lastErr = null;
        for (const field of candidates) {
          try {
            await putMultipart(endpoint, payload, field, logoFile, headers, 30000);
            lastErr = null; break;
          } catch (e) {
            lastErr = e;
            if (!/Unexpected field/i.test(String(e?.message || ''))) throw e;
          }
        }
        if (lastErr) throw lastErr;
        // Bust cache so the <Image> refetches the new logo
        setLogoBust(Date.now());
      } else {
        await putJSON(endpoint, payload, headers, 30000);
      }

      await load();
      setEditMode(false);
      setLogoFile(null);
    } catch (e) {
      setError(e?.message || 'Update failed.');
    } finally {
      setSaving(false);
    }
  }, [endpoint, getAuthHeader, buildUpdatePayload, load, logoFile, pickedCoord, data]);

  const cancelEdit = () => { setForm(data); setEditMode(false); setLogoFile(null); };

  // preview urls (logo via MERCHANT_LOGO; license via BUSINESS_DETAILS origin)
  const logoRaw =
    data?.business_logo || route?.params?.business_logo || route?.params?.logo || '';
  const licenseRaw =
    data?.license_image ||
    route?.params?.license_image ||
    route?.params?.business?.license_image ||
    route?.params?.files?.license_image ||
    '';
  const logoUri = useMemo(() => {
    const base = makeLogoUrl(logoRaw);
    if (!base) return '';
    return logoBust ? `${base}${base.includes('?') ? '&' : '?'}v=${logoBust}` : base;
  }, [logoRaw, logoBust]);
  const licenseUri = makeFromOrigin(licenseRaw, BUSINESS_DETAILS);

  const openMapsApp = () => {
    const lat = pickedCoord?.latitude, lng = pickedCoord?.longitude;
    const label = encodeURIComponent(data?.business_name || 'Business');
    if (!lat || !lng) return;
    const scheme = Platform.select({
      ios: `maps://?q=${label}&ll=${lat},${lng}`,
      android: `geo:${lat},${lng}?q=${lat},${lng}(${label})`,
      default: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
    });
    Linking.openURL(scheme).catch(() => { });
  };

  const openTurnByTurn = () => {
    if (!pickedCoord) { Alert.alert('Pick a location', 'Long-press on the map to drop a pin.'); return; }
    const dest = `${pickedCoord.latitude},${pickedCoord.longitude}`;
    const hasOrigin = !!userLoc;
    const origin = hasOrigin ? `${userLoc.latitude},${userLoc.longitude}` : '';
    const url = Platform.select({
      ios: hasOrigin
        ? `http://maps.apple.com/?daddr=${dest}&saddr=${origin}&dirflg=d`
        : `http://maps.apple.com/?daddr=${dest}&dirflg=d`,
      android: hasOrigin
        ? `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&travelmode=driving`
        : `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`,
      default:
        `https://www.google.com/maps/dir/?api=1&${hasOrigin ? `origin=${origin}&` : ''}destination=${dest}&travelmode=driving`,
    });
    Linking.openURL(url).catch(() => { });
  };

  const requestUserLocation = useCallback(async () => {
    try {
      setGettingLoc(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location denied', 'Enable location permission to use directions.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced, mayShowUserSettingsDialog: true });
      const coord = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      setUserLoc(coord);
      const addr = await reverseGeocode(coord);
      setUserAddr(addr);
      setTimeout(() => {
        mapRef.current?.animateToRegion({
          ...coord, latitudeDelta: 0.02, longitudeDelta: 0.02
        }, 500);
      }, 50);
    } catch (e) {
      Alert.alert('Failed to get location', e?.message || 'Try again.');
    } finally {
      setGettingLoc(false);
    }
  }, []);

  useEffect(() => {
    if (!locationModalVisible) return;
    requestUserLocation().catch(() => { });
  }, [locationModalVisible, requestUserLocation]);

  useEffect(() => {
    if (pickedCoord) reverseGeocode(pickedCoord).then(setPinAddr);
    else setPinAddr('');
  }, [pickedCoord?.latitude, pickedCoord?.longitude]);

  const distanceText = useMemo(() => {
    const d = haversine(userLoc, pickedCoord);
    if (!d && d !== 0) return '';
    if (d < 1) return `${Math.round(d * 1000)} m away`;
    return `${d.toFixed(1)} km away`;
  }, [userLoc, pickedCoord]);

  const toggleHoliday = (day) => {
    setForm((prev) => {
      const set = new Set(prev.holidays || []);
      if (set.has(day)) set.delete(day); else set.add(day);
      return { ...prev, holidays: Array.from(set) };
    });
  };

  // scroll padding and footer lifting
  const footerBottom = Math.max(kbHeight - insets.bottom, 0);
  const bottomPad = (editMode ? 140 : 36) + Math.max(insets.bottom, 10);
  const headerTopPad = Math.max(insets.top, 8) + 18;

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <View style={[styles.header, { paddingTop: headerTopPad }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Business Details</Text>

        {!loading && (
          editMode ? (
            <TouchableOpacity onPress={cancelEdit} style={styles.headerBtn} activeOpacity={0.8}>
              <Text style={[styles.headerBtnText, { color: '#ef4444' }]}>Cancel</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => setEditMode(true)} style={styles.headerBtn} activeOpacity={0.8}>
              <Text style={styles.headerBtnText}>Edit</Text>
            </TouchableOpacity>
          )
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <Text style={styles.muted}>Loading…</Text>
        </View>
      ) : error ? (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[styles.scrollInner, { alignItems: 'center', paddingBottom: bottomPad, minHeight: '100%' }]}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => { if (autoScrollToEnd.current) scrollRef.current?.scrollToEnd({ animated: true }); }}
        >
          <Ionicons name="alert-circle" size={28} color="#ef4444" />
          <Text style={[styles.muted, { marginTop: 8, textAlign: 'center' }]}>{error}</Text>
          {lastUrl ? (
            <Text style={[styles.muted, { marginTop: 6, fontSize: 12 }]} selectable>
              URL: {lastUrl}
            </Text>
          ) : null}
          <Pressable onPress={load} style={({ pressed }) => [styles.btn, { marginTop: 12 }, pressed && styles.btnPressed]}>
            <Ionicons name="refresh" size={16} color="#fff" />
            <Text style={[styles.btnText, { marginLeft: 8 }]}>Retry</Text>
          </Pressable>
        </ScrollView>
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={headerTopPad}
          style={{ flex: 1 }}
        >
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={[styles.scrollInner, { paddingBottom: bottomPad, minHeight: '100%' }]}
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
            showsVerticalScrollIndicator
            onContentSizeChange={() => { if (autoScrollToEnd.current) scrollRef.current?.scrollToEnd({ animated: true }); }}
          >
            {/* Top card */}
            <View style={styles.card}>
              {editMode ? (
                <>
                  <View style={styles.logoTopWrap}>
                    <LogoPicker
                      editable
                      size={100}
                      previewUri={logoFile?.uri || logoUri}
                      onPick={(file) => setLogoFile(file)}
                      onRemove={() => setLogoFile(null)}
                    />
                  </View>

                  <Field
                    label="Business Name"
                    value={form.business_name}
                    onChangeText={(v) => setForm(p => ({ ...p, business_name: v }))}
                    returnKeyType="next"
                    onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd?.({ animated: true }), 100)}
                  />

                  <View style={[styles.rowWrap, { marginTop: 8 }]}>
                    <DeliveryChip value="BOTH" current={form.delivery_option} onSelect={(v) => setForm(p => ({ ...p, delivery_option: v }))} />
                    <DeliveryChip value="DELIVERY" current={form.delivery_option} onSelect={(v) => setForm(p => ({ ...p, delivery_option: v }))} />
                    <DeliveryChip value="PICKUP" current={form.delivery_option} onSelect={(v) => setForm(p => ({ ...p, delivery_option: v }))} />
                  </View>

                  <View style={{ marginTop: 8 }}>
                    <TimeField
                      label="Opens"
                      text={openText}
                      ampm={openAmPm}
                      onChangeText={(t) => {
                        setOpenText(t);
                        setForm(p => ({ ...p, opening_time: to24h(t, openAmPm) }));
                      }}
                      onToggleAmPm={(val) => {
                        setOpenAmPm(val);
                        setForm(p => ({ ...p, opening_time: to24h(openText, val) }));
                      }}
                      inputRef={openRef}
                      onSubmitEditing={() => closeRef.current?.focus()}
                    />
                    <TimeField
                      label="Closes"
                      text={closeText}
                      ampm={closeAmPm}
                      onChangeText={(t) => {
                        setCloseText(t);
                        setForm(p => ({ ...p, closing_time: to24h(t, closeAmPm) }));
                      }}
                      onToggleAmPm={(val) => {
                        setCloseAmPm(val);
                        setForm(p => ({ ...p, closing_time: to24h(closeText, val) }));
                      }}
                      inputRef={closeRef}
                      returnKeyType="done"
                    />
                  </View>
                </>
              ) : (
                <View style={styles.row}>
                  <View style={styles.logoWrap}>
                    <LogoPicker
                      editable={false}
                      previewUri={logoFile?.uri || logoUri}
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.title} numberOfLines={1}>{data?.business_name || '—'}</Text>

                    <View style={[styles.rowWrap, { marginTop: 8 }]}>
                      <Badge icon="bicycle-outline" label={data?.delivery_option || '—'} />
                    </View>

                    <View style={{ marginTop: 8 }}>
                      <Badge compact icon="time-outline" label={`${formatPretty(data?.opening_time)} – ${formatPretty(data?.closing_time)}`} />
                    </View>
                  </View>
                </View>
              )}
            </View>

            {/* Location & registration */}
            <View className="card" style={styles.card}>
              <SubTitle text="Registration" />
              {editMode ? (
                <Field
                  label="License No."
                  value={form.business_license_number}
                  onChangeText={(v) => setForm(p => ({ ...p, business_license_number: v }))}
                  returnKeyType="next"
                  onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd?.({ animated: true }), 100)}
                />
              ) : (
                <ItemRow label="License No." value={data?.business_license_number || '—'} />
              )}

              <View style={{ height: 10 }} />
              <SubTitle text="Location" />

              {editMode ? (
                <>
                  <View style={styles.mapPreviewWrapperLarge}>
                    <MapView
                      style={styles.mapPreview}
                      region={mapRegion}
                      pointerEvents="none"
                      provider={PROVIDER_DEFAULT}
                      mapType={mapType}
                    >
                      <UrlTile
                        urlTemplate="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        maximumZ={19}
                      />
                      {pickedCoord && <Marker coordinate={pickedCoord} />}
                    </MapView>
                    <TouchableOpacity
                      accessible accessibilityRole="button"
                      activeOpacity={0.9}
                      style={styles.previewOverlay}
                      onPress={() => setLocationModalVisible(true)}
                    >
                      <Text style={styles.previewOverlayText}>Tap to edit on map</Text>
                    </TouchableOpacity>
                  </View>
                  {pickedCoord ? (
                    <View style={styles.coordsBlock}>
                      <Text style={styles.coordsLabel}>Latitude</Text>
                      <Text style={styles.coordsValue}>{pickedCoord.latitude.toFixed(6)}</Text>
                      <Text style={[styles.coordsLabel, { marginTop: 6 }]}>Longitude</Text>
                      <Text style={styles.coordsValue}>{pickedCoord.longitude.toFixed(6)}</Text>
                    </View>
                  ) : (
                    <Text style={styles.muted}>No location selected yet.</Text>
                  )}
                  <Field
                    label="Address"
                    value={form.address}
                    onChangeText={(v) => setForm(p => ({ ...p, address: v }))}
                    multiline
                    onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd?.({ animated: true }), 100)}
                  />
                </>
              ) : (
                <>
                  <ItemRow label="Address" value={data?.address || '—'} multiline />
                  <ItemRow label="Latitude" value={pickedCoord ? String(pickedCoord.latitude) : '—'} />
                  <ItemRow label="Longitude" value={pickedCoord ? String(pickedCoord.longitude) : '—'} />
                  {pickedCoord ? (
                    <Pressable onPress={openMapsApp} style={({ pressed }) => [styles.btn, { marginTop: 12 }, pressed && styles.btnPressed]}>
                      <Ionicons name="map-outline" size={16} color="#fff" />
                      <Text style={[styles.btnText, { marginLeft: 8 }]}>Open in Maps</Text>
                    </Pressable>
                  ) : null}
                </>
              )}
            </View>

            {/* Complementary */}
            <View style={styles.card}>
              <SubTitle text="Complementary Offer" />
              {editMode ? (
                <>
                  <Field
                    label="Offer"
                    value={form.complementary}
                    onChangeText={(v) => setForm(p => ({ ...p, complementary: v }))}
                    onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd?.({ animated: true }), 100)}
                  />
                  <Field
                    label="Details"
                    value={form.complementary_details}
                    onChangeText={(v) => setForm(p => ({ ...p, complementary_details: v }))}
                    multiline
                    onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd?.({ animated: true }), 100)}
                  />
                </>
              ) : (
                <>
                  <ItemRow label="Offer" value={data?.complementary || '—'} />
                  <ItemRow label="Details" value={data?.complementary_details || '—'} multiline />
                </>
              )}
            </View>

            {/* License image (view) */}
            <View style={styles.card}>
              <SubTitle text="License Image" />
              {licenseUri ? (
                <Image
                  source={{ uri: licenseUri }}
                  style={styles.licenseImg}
                />
              ) : (
                <Text style={styles.muted}>No license image uploaded</Text>
              )}
            </View>

            <View style={{ height: 8 }} />
          </ScrollView>

          {/* Sticky Save row (only in edit mode) */}
          {editMode && (
            <View
              style={[
                styles.footer,
                { paddingBottom: Math.max(insets.bottom, 32), bottom: Math.max(kbHeight - insets.bottom, 0) },
              ]}
            >
              <Pressable
                style={({ pressed }) => [styles.saveBtn, saving && { opacity: 0.6 }, pressed && styles.btnPressed]}
                onPress={save}
                disabled={saving}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save Changes</Text>}
              </Pressable>
            </View>
          )}
        </KeyboardAvoidingView>
      )}
      {/* Location Picker Modal */}
      <Modal visible={locationModalVisible} transparent={false} animationType="slide" onRequestClose={() => setLocationModalVisible(false)}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Pick Location</Text>
          <Pressable onPress={() => setLocationModalVisible(false)}>
            <Text style={styles.modalClose}>Close</Text>
          </Pressable>
        </View>
        <MapView
          style={{ flex: 1 }}
          initialRegion={mapRegion}
          provider={PROVIDER_DEFAULT}
          onLongPress={(e) => setPickedCoord(e.nativeEvent.coordinate)}
        >
          <UrlTile
            urlTemplate="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maximumZ={19}
          />
          {pickedCoord && <Marker coordinate={pickedCoord} />}
        </MapView>
        <View style={{ padding: 12 }}>
          <Text style={styles.muted}>
            Long-press anywhere on the map to drop a pin.
          </Text>
          {pickedCoord ? (
            <Pressable onPress={() => setLocationModalVisible(false)} style={({ pressed }) => [styles.btn, { marginTop: 12 }, pressed && styles.btnPressed]}>
              <Ionicons name="checkmark" size={16} color="#fff" />
              <Text style={[styles.btnText, { marginLeft: 8 }]}>Use This Location</Text>
            </Pressable>
          ) : null}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* ───────── small UI helpers ───────── */
function SubTitle({ text }) { return <Text style={styles.subtitle}>{text}</Text>; }
function Field({
  label, value, onChangeText,
  keyboardType = 'default', multiline = false, placeholder, style,
  inputRef, returnKeyType = 'default', onSubmitEditing, blurOnSubmit, onFocus
}) {
  return (
    <View style={[{ marginBottom: 10, flex: 1 }, style]}>
      <Text style={styles.itemLabel}>{label}</Text>
      <TextInput
        ref={inputRef}
        value={String(value ?? '')}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor="#94a3b8"
        multiline={multiline}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        blurOnSubmit={blurOnSubmit ?? true}
        onFocus={onFocus}
        style={[styles.input, multiline && { height: 90, textAlignVertical: 'top' }]}
      />
    </View>
  );
}
function ItemRow({ label, value, multiline = false }) {
  return (
    <View style={styles.itemRow}>
      <Text style={styles.itemLabel}>{label}</Text>
      <Text style={[styles.itemValue, multiline && { lineHeight: 20 }]} numberOfLines={multiline ? 0 : 1}>
        {value ?? '—'}
      </Text>
    </View>
  );
}
function Badge({ icon, label, compact = false }) {
  const iconSize = compact ? 10 : 12;
  return (
    <View style={[styles.badge, compact && styles.badgeCompact]}>
      <Ionicons name={icon} size={iconSize} color="#065f46" style={{ marginRight: compact ? 4 : 6 }} />
      <Text style={[styles.badgeText, compact && styles.badgeTextCompact]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}
function DeliveryChip({ value, current, onSelect }) {
  const active = current === value;
  return (
    <Pressable
      onPress={() => onSelect(value)}
      style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && styles.pressed]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{value}</Text>
    </Pressable>
  );
}
function formatPretty(hhmmss) {
  if (!hhmmss) return '—';
  const [hh, mm = '00'] = String(hhmmss).split(':');
  const h = Number(hh) || 0;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(mm).padStart(2, '0')} ${ampm}`;
}
function TimeField({ label, text, ampm, onChangeText, onToggleAmPm, inputRef, onSubmitEditing, returnKeyType = 'next' }) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={styles.itemLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={(v) => {
            const cleaned = v.replace(/[^\d:]/g, '');
            const m = cleaned.match(/^(\d{1,2})(:?)(\d{0,2})$/);
            let next = cleaned;
            if (m) {
              const h = Math.min(12, Math.max(1, Number(m[1] || 0)));
              const min = m[3] ? Math.min(59, Number(m[3])) : '';
              next = `${h}:${min !== '' ? String(min).padStart(2, '0') : ''}`.replace(/:$/, '');
            }
            onChangeText(next);
          }}
          placeholder="e.g. 9:00"
          placeholderTextColor="#94a3b8"
          keyboardType="numbers-and-punctuation"
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          style={[styles.input, { flex: 1, marginRight: 8 }]}
        />
        <View style={styles.ampmWrap}>
          {['AM', 'PM'].map(opt => {
            const active = ampm === opt;
            return (
              <Pressable
                key={opt}
                onPress={() => onToggleAmPm(opt)}
                style={({ pressed }) => [styles.ampmBtn, active && styles.ampmBtnActive, pressed && styles.pressed]}
              >
                <Text style={[styles.ampmText, active && styles.ampmTextActive]}>{opt}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

/* ───────── Friendlier Logo Picker ───────── */
function LogoPicker({ editable, previewUri, onPick, onRemove, size = 64 }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const maxBytes = 5 * 1024 * 1024; // 5MB
  const hasImage = Boolean(previewUri);

  const ensureMediaPerm = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to choose an image.');
      return false;
    }
    return true;
  };
  const ensureCameraPerm = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow camera access to take a photo.');
      return false;
    }
    return true;
  };

  const chooseFromGallery = async () => {
    try {
      setBusy(true);
      if (!(await ensureMediaPerm())) return;
      const img = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });
      if (!img.canceled) {
        const a = img.assets?.[0];
        if (a?.fileSize && a.fileSize > maxBytes) {
          Alert.alert('Too large', 'Logo must be under 5MB.'); return;
        }
        onPick?.({
          name: a?.fileName ?? 'logo.jpg',
          uri: a?.uri,
          mimeType: a?.mimeType ?? guessMimeFromUri(a?.uri || ''),
          size: a?.fileSize ?? 0,
        });
      }
    } catch (e) {
      Alert.alert('Logo upload failed', e?.message || 'Try again.');
    } finally {
      setBusy(false);
      setSheetOpen(false);
    }
  };

  const takePhoto = async () => {
    try {
      setBusy(true);
      if (!(await ensureCameraPerm())) return;
      const img = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });
      if (!img.canceled) {
        const a = img.assets?.[0];
        if (a?.fileSize && a.fileSize > maxBytes) {
          Alert.alert('Too large', 'Logo must be under 5MB.'); return;
        }
        onPick?.({
          name: a?.fileName ?? 'logo.jpg',
          uri: a?.uri,
          mimeType: a?.mimeType ?? guessMimeFromUri(a?.uri || ''),
          size: a?.fileSize ?? 0,
        });
      }
    } catch (e) {
      Alert.alert('Camera error', e?.message || 'Try again.');
    } finally {
      setBusy(false);
      setSheetOpen(false);
    }
  };

  const radius = Math.round(size * 0.1875);

  if (!editable) {
    return hasImage ? (
      <Image source={{ uri: previewUri }} style={[styles.logo, { width: size, height: size, borderRadius: radius }]} />
    ) : (
      <View style={[styles.logoFallback, { width: size, height: size, borderRadius: radius }]}>
        <Ionicons name="storefront-outline" size={26} color={THEME_GREEN} />
      </View>
    );
  }

  return (
    <>
      {hasImage ? (
        <Pressable onPress={() => setSheetOpen(true)} style={({ pressed }) => [styles.logoEditableBox, { width: size, height: size, borderRadius: radius }, pressed && styles.btnPressed]}>
          <Image source={{ uri: previewUri }} style={styles.logoEditableImg} />
          <View style={styles.editFloat}>
            <Ionicons name="pencil" size={14} color="#fff" />
          </View>
        </Pressable>
      ) : (
        <Pressable onPress={() => setSheetOpen(true)} style={({ pressed }) => [styles.logoUploadCard, { width: size, height: size, borderRadius: radius }, pressed && styles.btnPressed]}>
          <Ionicons name="image-outline" size={22} color="#9ca3af" />
          <Text style={styles.logoUploadTitle}>Add logo</Text>
          <Text style={styles.logoUploadHint}>Square image works best (1:1)</Text>
        </Pressable>
      )}

      <Modal visible={sheetOpen} transparent animationType="fade" onRequestClose={() => setSheetOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setSheetOpen(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Logo</Text>

          <View style={styles.sheetButtons}>
            <SheetButton icon="images-outline" label="Choose from Gallery" onPress={chooseFromGallery} disabled={busy} />
            <SheetButton icon="camera-outline" label="Take Photo" onPress={takePhoto} disabled={busy} />
            {hasImage && (
              <SheetButton icon="trash-outline" danger label="Remove Photo" onPress={() => { onRemove?.(); setSheetOpen(false); }} />
            )}
          </View>

          <Pressable style={styles.sheetCancel} onPress={() => setSheetOpen(false)}>
            <Text style={styles.sheetCancelText}>Cancel</Text>
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

function SheetButton({ icon, label, onPress, disabled, danger }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.sheetBtn, pressed && { opacity: 0.85 }]}>
      <View style={[styles.sheetIconWrap, danger && { backgroundColor: '#fee2e2' }]}>
        <Ionicons name={icon} size={18} color={danger ? '#b91c1c' : '#111827'} />
      </View>
      <Text style={[styles.sheetBtnText, danger && { color: '#b91c1c' }]}>{label}</Text>
    </Pressable>
  );
}

/* ───────── styles ───────── */
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f6f8fa' },

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
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: '#0f172a' },
  headerBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#eefbf3' },
  headerBtnText: { color: THEME_GREEN, fontWeight: '800' },
  minFooterWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  minHint: {
    color: '#6b7280',
    fontSize: 12,
    marginLeft: 6,
    marginBottom: 10,
  },
  minConfirmBtn: {
    alignSelf: 'center',
    width: '90%',
    backgroundColor: THEME_GREEN,
    borderRadius: 28,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  minConfirmText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
  },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  muted: { color: '#64748b', fontSize: 13 },

  scrollInner: { padding: 16 },

  card: {
    backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e5e7eb',
    padding: 14, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05,
    shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },

  row: { flexDirection: 'row', alignItems: 'center' },
  rowWrap: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },

  logoWrap: { marginRight: 12 },
  logoTopWrap: { alignItems: 'center', marginBottom: 12 },

  logo: { width: 64, height: 64, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb' },
  logoFallback: {
    width: 64, height: 64, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb',
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9',
  },

  logoEditableBox: {
    width: 64, height: 64, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#e5e7eb',
  },
  logoEditableImg: { width: '100%', height: '100%', resizeMode: 'cover' },
  editFloat: {
    position: 'absolute', right: -6, top: -6,
    backgroundColor: THEME_GREEN, height: 24, width: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2,
  },

  logoUploadCard: {
    width: 64, height: 64, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed',
    borderColor: '#cbd5e1', backgroundColor: '#f8fafc',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
  },
  logoUploadTitle: { fontSize: 11, fontWeight: '700', color: '#111827', marginTop: 4 },
  logoUploadHint: { fontSize: 9, color: '#64748b', marginTop: 2, textAlign: 'center' },

  title: { fontSize: width > 400 ? 18 : 16, fontWeight: '700', color: '#111827' },

  subtitle: { fontSize: 14, fontWeight: '700', color: '#0f172a', marginBottom: 8 },

  itemRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  itemLabel: { fontSize: 12, color: '#64748b', marginBottom: 4 },
  itemValue: { fontSize: 15, color: '#111827', fontWeight: '600' },

  input: {
    borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff',
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, fontSize: 14, color: '#111827',
  },

  badge: {
    flexDirection: 'row', alignItems: 'center', borderColor: '#86efac', backgroundColor: '#dcfce7',
    borderWidth: 1, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 999, alignSelf: 'flex-start'
  },
  badgeText: { fontSize: 11, color: '#065f46', fontWeight: '700' },
  badgeCompact: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  badgeTextCompact: { fontSize: 11 },

  pillsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    backgroundColor: '#f1f5f9', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: '#e5e7eb',
  },
  pillText: { fontSize: 12, color: '#0f172a', fontWeight: '600' },

  chip: {
    borderWidth: 1, borderColor: '#e5e7eb', paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 999, backgroundColor: '#fff',
  },
  chipActive: { borderColor: '#86efac', backgroundColor: '#dcfce7' },
  chipText: { fontSize: 12, color: '#0f172a', fontWeight: '700' },
  chipTextActive: { color: '#065f46' },

  ampmWrap: {
    flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb',
  },
  ampmBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  ampmBtnActive: { backgroundColor: '#dcfce7', borderColor: '#86efac' },
  ampmText: { fontWeight: '700', color: '#0f172a', fontSize: 12 },
  ampmTextActive: { color: '#065f46' },

  pressed: { opacity: 0.9 },
  btnPressed: { transform: [{ scale: 0.99 }] },

  licenseImg: {
    width: '100%', aspectRatio: 16 / 9, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', resizeMode: 'cover'
  },

  footer: {
    position: 'absolute', left: 0, right: 0,
    backgroundColor: '#fff', padding: 14, borderTopWidth: 1, borderTopColor: '#e5e7eb'
  },
  saveBtn: {
    backgroundColor: THEME_GREEN, borderRadius: 12, paddingVertical: 14, alignItems: 'center'
  },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 16 },

  btn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: THEME_GREEN, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10, alignSelf: 'flex-start',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 3
  },
  btnText: { color: '#fff', fontWeight: '800' },

  mapPreviewWrapperLarge: {
    borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#e5e7eb', height: 180, marginBottom: 8, position: 'relative',
  },
  mapPreview: { flex: 1 },
  previewOverlay: {
    ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 8, backgroundColor: 'rgba(0,0,0,0)'
  },
  previewOverlayText: {
    fontSize: 12, fontWeight: '700', backgroundColor: 'rgba(17,24,39,0.6)', color: '#fff',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden',
  },
  coordsBlock: { paddingVertical: 6 },
  coordsLabel: { fontSize: 12, color: '#6B7280' },
  coordsValue: { fontSize: 14, color: '#111827', fontWeight: '600' },

  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.25)' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16,
    paddingTop: 8, paddingBottom: 16, paddingHorizontal: 14,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: -2 }, elevation: 10
  },
  sheetHandle: { alignSelf: 'center', width: 36, height: 4, backgroundColor: '#e5e7eb', borderRadius: 999, marginBottom: 8 },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 8 },
  sheetButtons: { gap: 6 },
  sheetBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderRadius: 10, paddingHorizontal: 8 },
  sheetIconWrap: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  sheetBtnText: { fontSize: 15, color: '#111827', fontWeight: '600' },
  sheetCancel: { marginTop: 8, alignItems: 'center', paddingVertical: 10 },
  sheetCancelText: { fontSize: 15, fontWeight: '700', color: '#111827' },

  modalHeader: {
    paddingHorizontal: 14, paddingTop: 8, paddingBottom: 10, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between', borderBottomColor: '#e5e7eb', borderBottomWidth: 1
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  modalClose: { fontSize: 14, fontWeight: '700', color: THEME_GREEN },
});
