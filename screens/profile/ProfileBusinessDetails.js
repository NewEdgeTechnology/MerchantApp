// ProfileBusinessDetails.js — user-friendly image upload (logo & license), pretty errors, OSM tiles, PUT updates
// ✅ UPDATED: supports special_celebration + special_celebration_discount_percentage (view + edit + PUT payload)

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Image,
  Dimensions,
  Platform,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Keyboard,
  Pressable,
  Modal,
  Alert,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import MapView, { Marker, UrlTile, PROVIDER_DEFAULT } from 'react-native-maps';
import {
  BUSINESS_DETAILS,
  MERCHANT_LOGO,
  UPDATE_BUSINESS_LICENSE_ENDPOINT,
  MIN_AMT_UPDATE_ENDPOINT,
} from '@env';

const { width } = Dimensions.get('window');
const THEME_GREEN = '#16a34a';
const KEY_AUTH_TOKEN = 'auth_token';

/* ───────── helpers: clean errors, requests ───────── */
const stripHtml = (s = '') => String(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

function humanHttpError(res, text) {
  const ct = (res.headers?.get?.('content-type') || '').toLowerCase();
  if (ct.includes('application/json')) {
    try {
      const j = JSON.parse(text || '{}');
      return j?.message || j?.error || text || `HTTP ${res.status}`;
    } catch {}
  }
  if (ct.includes('text/html')) {
    const t = stripHtml(text);
    return t || `HTTP ${res.status}`;
  }
  try {
    const j = JSON.parse(text || '{}');
    return j?.message || j?.error || text || `HTTP ${res.status}`;
  } catch {
    return text || `HTTP ${res.status}`;
  }
}

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

async function fetchJSON(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    if (!res.ok) throw new Error(humanHttpError(res, text));
    return text ? JSON.parse(text) : null;
  } finally {
    clearTimeout(tid);
  }
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
    if (!res.ok) throw new Error(humanHttpError(res, text));
    return text ? JSON.parse(text) : null;
  } finally {
    clearTimeout(tid);
  }
}

function guessMimeFromUri(uri = '') {
  const u = uri.toLowerCase();
  if (u.endsWith('.png')) return 'image/png';
  if (u.endsWith('.jpg') || u.endsWith('.jpeg')) return 'image/jpeg';
  if (u.endsWith('.heic')) return 'image/heic';
  return 'image/jpeg';
}

async function putMultipart(url, bodyObj, fileField, file, headers = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const form = new FormData();
    Object.entries(bodyObj || {}).forEach(([k, v]) => {
      if (v == null) return;
      if (Array.isArray(v) || typeof v === 'object') form.append(k, JSON.stringify(v));
      else if (String(v).trim() !== '') form.append(k, String(v));
    });
    if (file?.uri) {
      form.append(fileField, {
        uri: file.uri,
        name: file.name || 'file.jpg',
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
    if (!res.ok) throw new Error(humanHttpError(res, text));
    return text ? JSON.parse(text) : null;
  } finally {
    clearTimeout(tid);
  }
}

// Multi-file upload with graceful field-name fallbacks
async function putMultipartMulti(url, bodyObj, filesDict, headers = {}, timeoutMs = 30000) {
  const tryCombined = async (logoField, licField) => {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const form = new FormData();
      Object.entries(bodyObj || {}).forEach(([k, v]) => {
        if (v == null) return;
        if (Array.isArray(v) || typeof v === 'object') form.append(k, JSON.stringify(v));
        else if (String(v).trim() !== '') form.append(k, String(v));
      });
      if (filesDict?.logo?.uri) {
        form.append(logoField, {
          uri: filesDict.logo.uri,
          name: filesDict.logo.name || 'logo.jpg',
          type: filesDict.logo.mimeType || guessMimeFromUri(filesDict.logo.uri) || 'image/jpeg',
        });
      }
      if (filesDict?.license?.uri) {
        form.append(licField, {
          uri: filesDict.license.uri,
          name: filesDict.license.name || 'license.jpg',
          type: filesDict.license.mimeType || guessMimeFromUri(filesDict.license.uri) || 'image/jpeg',
        });
      }
      const res = await fetch(url, {
        method: 'PUT',
        headers: { Accept: 'application/json', ...(headers || {}) },
        body: form,
        signal: controller.signal,
      });
      const text = await res.text();
      if (!res.ok) throw new Error(humanHttpError(res, text));
      return text ? JSON.parse(text) : null;
    } finally {
      clearTimeout(tid);
    }
  };

  try {
    return await tryCombined('business_logo', 'license_image');
  } catch (e) {
    const m = String(e?.message || '');
    if (!/Unexpected field|unknown field|unprocessable/i.test(m)) throw e;
  }

  const logoFields = ['business_logo', 'logo', 'image', 'file'];
  const licFields = ['license_image', 'license', 'licenseImage', 'document', 'file'];

  if (filesDict?.logo?.uri) {
    let last = null;
    for (const f of logoFields) {
      try {
        await putMultipart(url, bodyObj, f, filesDict.logo, headers, timeoutMs);
        last = null;
        break;
      } catch (err) {
        last = err;
        if (!/Unexpected field|unknown field/i.test(String(err?.message || ''))) throw err;
      }
    }
    if (last) throw last;
  }
  if (filesDict?.license?.uri) {
    let last = null;
    for (const f of licFields) {
      try {
        await putMultipart(url, bodyObj, f, filesDict.license, headers, timeoutMs);
        last = null;
        break;
      } catch (err) {
        last = err;
        if (!/Unexpected field|unknown field/i.test(String(err?.message || ''))) throw err;
      }
    }
    if (last) throw last;
  }
  return { ok: true };
}

/* ───────── misc helpers ───────── */
const safeStr = (v) => (v == null ? '' : String(v));
const safeNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// ✅ keep as string in form (TextInput friendly)
const safePctString = (v) => {
  if (v == null) return '';
  const s = String(v).trim();
  if (!s) return '';
  const n = Number(s);
  if (!Number.isFinite(n)) return '';
  return String(n);
};

function shapeFromParams(params = {}) {
  const holidays =
    Array.isArray(params.holidays)
      ? params.holidays
      : params.holidays
      ? String(params.holidays)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
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
    min_amount_for_fd: params.min_amount_for_fd != null ? String(params.min_amount_for_fd) : '',
    complementary: params.complementary ?? '',
    complementary_details: params.complementary_details ?? '',
    opening_time: params.opening_time ?? '',
    closing_time: params.closing_time ?? '',
    holidays,

    // ✅ NEW:
    special_celebration: params.special_celebration ?? '',
    special_celebration_discount_percentage: safePctString(
      params.special_celebration_discount_percentage ?? params.special_celebration_discount ?? params.discount_percentage
    ),
  };
}

function to12hText(hhmmss) {
  if (!hhmmss) return { text: '', ampm: 'AM' };
  const [hh, mm = '00'] = String(hhmmss).split(':');
  const H = Math.max(0, Math.min(23, Number(hh) || 0));
  const ampm = H >= 12 ? 'PM' : 'AM';
  const h12 = ((H + 11) % 12) + 1;
  return { text: `${String(h12)}:${String(mm).padStart(2, '0')}`, ampm };
}

function to24h(text, ampm) {
  if (!text) return '';
  const m = String(text).match(/^(\d{1,2}):(\d{1,2})$/);
  if (!m) return '';
  let h = parseInt(m[1], 10);
  let min = parseInt(m[2], 10);
  if (!Number.isFinite(h)) h = 0;
  if (!Number.isFinite(min)) min = 0;
  h = Math.max(1, Math.min(12, h));
  min = Math.max(0, Math.min(59, min));
  if ((ampm || 'AM') === 'PM' && h < 12) h += 12;
  if ((ampm || 'AM') === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00`;
}

async function reverseGeocode({ latitude, longitude }) {
  try {
    const res = await Location.reverseGeocodeAsync({ latitude, longitude });
    const addr = res?.[0];
    if (!addr) return '';
    const parts = [addr.name || addr.street || '', addr.subregion || '', addr.region || '', addr.postalCode || '', addr.country || ''].filter(Boolean);
    return parts.join(', ');
  } catch {
    return '';
  }
}

async function setAddressFromCoord(coord, setForm) {
  if (!coord?.latitude || !coord?.longitude) return;
  const line = await reverseGeocode(coord);
  const fallback = `Located at: ${coord.latitude.toFixed(5)}, ${coord.longitude.toFixed(5)}`;
  setForm((prev) => ({ ...prev, address: line || fallback }));
}

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
  try {
    origin = new URL(normalizeHost(base)).origin;
  } catch {}
  const p = s.replace(/^\/+/, '');
  return origin ? `${origin}/${p}` : p;
};

function pruneNulls(obj) {
  const out = {};
  Object.entries(obj || {}).forEach(([k, v]) => {
    if (v == null) return;
    if (typeof v === 'string' && v.trim() === '') return;
    out[k] = v;
  });
  return out;
}

function prettyDeliveryOption(opt) {
  const v = String(opt || '').toUpperCase();
  if (v === 'GRAB') return 'Grab delivery';
  if (v === 'SELF') return 'Self delivery';
  if (v === 'BOTH') return 'Grab & Self';
  if (v === 'DELIVERY') return 'Delivery only';
  if (v === 'PICKUP') return 'Pickup only';
  return opt || '—';
}

/* ✅ normalize percent (0–100) as string */
function clampPercentString(v) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const n = Number(s);
  if (!Number.isFinite(n)) return '';
  const clamped = Math.max(0, Math.min(100, n));
  // keep up to 2 decimals if any
  const hasDot = String(s).includes('.');
  return hasDot ? String(Math.round(clamped * 100) / 100) : String(Math.round(clamped));
}

/* ───────── component ───────── */
export default function ProfileBusinessDetails() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const route = useRoute();

  const businessId =
    route?.params?.business_id ??
    route?.params?.id ??
    route?.params?.business?.id ??
    null;

  const authContext = route?.params?.authContext || null;

  const [data, setData] = useState(() => shapeFromParams(route?.params || {}));
  const [form, setForm] = useState(() => shapeFromParams(route?.params || {}));
  const [loading, setLoading] = useState(Boolean(businessId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [lastUrl, setLastUrl] = useState('');

  const [kbHeight, setKbHeight] = useState(0);

  // time UI
  const initOpen = to12hText(form.opening_time);
  const initClose = to12hText(form.closing_time);
  const [openText, setOpenText] = useState(initOpen.text);
  const [openAmPm, setOpenAmPm] = useState(initOpen.ampm);
  const [closeText, setCloseText] = useState(initClose.text);
  const [closeAmPm, setCloseAmPm] = useState(initClose.ampm);
  const openRef = useRef(null);
  const closeRef = useRef(null);

  const scrollRef = useRef(null);

  // Files
  const [logoFile, setLogoFile] = useState(null);
  const [licenseFile, setLicenseFile] = useState(null);
  const [logoBust, setLogoBust] = useState(0);

  // Map picker
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

  const [modalLocLoading, setModalLocLoading] = useState(false);
  const [modalLocError, setModalLocError] = useState('');
  const [userLoc] = useState(null); // reserved if needed later
  const [pinAddr, setPinAddr] = useState('');
  const mapRef = useRef(null);

  // keyboard listeners
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = (e) => setKbHeight(e?.endCoordinates?.height ?? 0);
    const onHide = () => setKbHeight(0);
    const s1 = Keyboard.addListener(showEvt, onShow);
    const s2 = Keyboard.addListener(hideEvt, onHide);
    return () => {
      s1.remove();
      s2.remove();
    };
  }, []);

  const endpoint = useMemo(() => {
    if (!businessId) return null;

    let raw = (BUSINESS_DETAILS || '').trim();
    if (!raw) raw = 'http://localhost:8080/api/merchant-business/{businessId}';

    raw = raw
      .replace('{business_id}', String(businessId))
      .replace('{bussiness_id}', String(businessId))
      .replace('{businessId}', String(businessId))
      .replace(':business_id', String(businessId))
      .replace(':businessId', String(businessId));

    return normalizeHost(raw);
  }, [businessId]);

  const licenseUpdateUrl = useMemo(() => {
    if (!businessId) return null;
    const rawEnv = (UPDATE_BUSINESS_LICENSE_ENDPOINT || '').trim();
    if (!rawEnv) return null;
    const replaced = rawEnv
      .replace('{businessId}', String(businessId))
      .replace('{business_id}', String(businessId))
      .replace('{bussiness_id}', String(businessId))
      .replace(':businessId', String(businessId))
      .replace(':business_id', String(businessId));
    return normalizeHost(replaced);
  }, [businessId]);

  const minAmtUpdateUrl = useMemo(() => {
    if (!businessId || !MIN_AMT_UPDATE_ENDPOINT) return null;
    let raw = (MIN_AMT_UPDATE_ENDPOINT || '').trim();

    raw = raw
      .replace('{businessId}', String(businessId))
      .replace('{bussiness_id}', String(businessId))
      .replace('{business_id}', String(businessId))
      .replace(':businessId', String(businessId))
      .replace(':business_id', String(businessId));

    const baseUrl = BUSINESS_DETAILS || '';
    const full = makeFromOrigin(raw, baseUrl || 'http://localhost:8080');
    return normalizeHost(full);
  }, [businessId]);

  const getAuthHeader = useCallback(async () => {
    let tokenStr = null;
    const t = authContext?.token;
    if (t) tokenStr = typeof t === 'string' ? t : t?.access_token ?? null;
    if (!tokenStr) {
      try {
        tokenStr = await SecureStore.getItemAsync(KEY_AUTH_TOKEN);
      } catch {}
    }
    return tokenStr ? { Authorization: `Bearer ${tokenStr}` } : {};
  }, [authContext?.token]);

  const load = useCallback(async () => {
    if (!endpoint) {
      setError('Missing business_id or BUSINESS_DETAILS base URL.');
      return;
    }
    setError('');
    setLoading(true);
    setLastUrl(endpoint);
    try {
      const headers = { Accept: 'application/json', ...(await getAuthHeader()) };
      const json = await fetchJSON(endpoint, { method: 'GET', headers }, 30000);
      const payloadRaw = json?.data || json || {};

      const payload = shapeFromParams({
        ...payloadRaw,
        business_logo: payloadRaw?.business_logo || payloadRaw?.business?.business_logo || payloadRaw?.logo,
        license_image:
          payloadRaw?.license_image ||
          payloadRaw?.licenseImage ||
          payloadRaw?.business?.license_image ||
          payloadRaw?.files?.license_image ||
          payloadRaw?.documents?.license_image,
        min_amount_for_fd:
          payloadRaw?.min_amount_for_fd ?? payloadRaw?.business?.min_amount_for_fd ?? payloadRaw?.settings?.min_amount_for_fd,

        // ✅ NEW fields (works even if they come nested)
        special_celebration:
          payloadRaw?.special_celebration ??
          payloadRaw?.business?.special_celebration ??
          payloadRaw?.settings?.special_celebration ??
          '',
        special_celebration_discount_percentage:
          payloadRaw?.special_celebration_discount_percentage ??
          payloadRaw?.business?.special_celebration_discount_percentage ??
          payloadRaw?.settings?.special_celebration_discount_percentage ??
          payloadRaw?.special_celebration_discount ??
          payloadRaw?.discount_percentage ??
          '',
      });

      setData(payload);
      setForm(payload);

      const o = to12hText(payload.opening_time);
      setOpenText(o.text);
      setOpenAmPm(o.ampm);
      const c = to12hText(payload.closing_time);
      setCloseText(c.text);
      setCloseAmPm(c.ampm);

      if (payload.latitude && payload.longitude) {
        const coord = { latitude: payload.latitude, longitude: payload.longitude };
        setPickedCoord(coord);
        setMapRegion((r) => ({ ...r, latitude: coord.latitude, longitude: coord.longitude }));
        reverseGeocode(coord).then((line) => setPinAddr(line));
      } else {
        setPinAddr('');
      }
    } catch (e) {
      setError(e?.message || 'Failed to load business details.');
    } finally {
      setLoading(false);
    }
  }, [endpoint, getAuthHeader]);

  useEffect(() => {
    if (endpoint) load();
  }, [endpoint, load]);

  // ✅ keep min_amount_for_fd + percent as string; only send if non-empty
  const buildUpdatePayload = useCallback(() => {
    const lat = pickedCoord?.latitude ?? data?.latitude ?? form?.latitude ?? null;
    const lng = pickedCoord?.longitude ?? data?.longitude ?? form?.longitude ?? null;

    const rawMin = String(form.min_amount_for_fd ?? '').trim();
    const rawPct = clampPercentString(form.special_celebration_discount_percentage);

    const payload = {
      business_name: String(form.business_name ?? ''),
      latitude: Number.isFinite(lat) ? lat : null,
      longitude: Number.isFinite(lng) ? lng : null,
      address: String(form.address ?? ''),
      business_logo: String(form.business_logo ?? ''),
      license_image: String(form.license_image ?? ''),
      delivery_option: String(form.delivery_option ?? 'BOTH'),
      complementary: String(form.complementary ?? ''),
      complementary_details: String(form.complementary_details ?? ''),
      opening_time: to24h(openText, openAmPm) || '',
      closing_time: to24h(closeText, closeAmPm) || '',
      holidays: Array.isArray(form.holidays) ? form.holidays : [],
      business_license_number: String(form.business_license_number ?? ''),

      // ✅ NEW:
      special_celebration: String(form.special_celebration ?? ''),
      special_celebration_discount_percentage: rawPct,
    };

    if (rawMin !== '') payload.min_amount_for_fd = rawMin;

    // if celebration empty, don’t force-send percentage (optional)
    if (!String(payload.special_celebration || '').trim()) {
      delete payload.special_celebration_discount_percentage;
    } else {
      // if celebration is set but % empty => default "0"
      if (!String(payload.special_celebration_discount_percentage || '').trim()) {
        payload.special_celebration_discount_percentage = '0';
      }
    }

    return payload;
  }, [form, openText, openAmPm, closeText, closeAmPm, pickedCoord, data]);

  const save = useCallback(async () => {
    if (!endpoint) return;

    const lat = pickedCoord?.latitude ?? data?.latitude ?? null;
    const lng = pickedCoord?.longitude ?? data?.longitude ?? null;
    if (!(Number.isFinite(lat) && Number.isFinite(lng))) {
      Alert.alert('Pick a location', 'Please long-press on the map to set latitude & longitude.');
      return;
    }

    setSaving(true);
    try {
      const headers = await getAuthHeader();
      const payloadRaw = buildUpdatePayload();
      const payload = pruneNulls(payloadRaw);

      const uploadingLogo = !!logoFile?.uri;
      const uploadingLicense = !!licenseFile?.uri;

      if (uploadingLogo) delete payload.business_logo;
      if (uploadingLicense) delete payload.license_image;

      if (uploadingLicense) {
        const licUrl = licenseUpdateUrl || endpoint;
        await putMultipartMulti(licUrl, {}, { license: licenseFile }, headers, 30000);
      }

      if (uploadingLogo) {
        await putMultipartMulti(endpoint, {}, { logo: logoFile }, headers, 30000);
        setLogoBust(Date.now());
      }

      // PUT JSON fields (includes special celebration + %)
      await putJSON(endpoint, payload, headers, 30000);

      // also PUT to dedicated endpoint for delivery_option + min_amount_for_fd, if provided
      if (minAmtUpdateUrl) {
        const subPayload = pruneNulls({
          business_name: payload.business_name,
          address: payload.address,
          delivery_option: payload.delivery_option,
          min_amount_for_fd: payload.min_amount_for_fd,
        });
        await putJSON(minAmtUpdateUrl, subPayload, headers, 30000);
      }

      await load();
      setEditMode(false);
      setLogoFile(null);
      setLicenseFile(null);
      Alert.alert('Saved', 'Business details updated.');
    } catch (e) {
      setError(e?.message || 'Update failed.');
      Alert.alert('Upload failed', e?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  }, [
    endpoint,
    licenseUpdateUrl,
    minAmtUpdateUrl,
    getAuthHeader,
    buildUpdatePayload,
    load,
    logoFile,
    licenseFile,
    pickedCoord,
    data,
  ]);

  const cancelEdit = () => {
    setForm(data);
    setEditMode(false);
    setLogoFile(null);
    setLicenseFile(null);
  };

  // preview urls
  const logoRaw = data?.business_logo || route?.params?.business_logo || route?.params?.logo || '';
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

  /* ── UI ── */
  const bottomPad = (editMode ? 148 : 36) + Math.max(insets.bottom, 10);
  const headerTopPad = Math.max(insets.top, 8) + 18;
  const footerBottom = Math.max(kbHeight - insets.bottom, 0);

  const showCelebration = String(data?.special_celebration || '').trim();
  const showCelebrationPct = String(data?.special_celebration_discount_percentage || '').trim();

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <View style={[styles.header, { paddingTop: headerTopPad }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#0f172a" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Business Details</Text>

        {!loading &&
          (editMode ? (
            <TouchableOpacity onPress={cancelEdit} style={styles.headerBtn} activeOpacity={0.8}>
              <Text style={[styles.headerBtnText, { color: '#ef4444' }]}>Cancel</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => setEditMode(true)} style={styles.headerBtn} activeOpacity={0.8}>
              <Text style={styles.headerBtnText}>Edit</Text>
            </TouchableOpacity>
          ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <Text style={styles.muted}>Loading…</Text>
        </View>
      ) : error ? (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[styles.scrollInner, { paddingBottom: bottomPad + footerBottom, minHeight: '100%' }]}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'android' ? 'none' : 'interactive'}
          showsVerticalScrollIndicator
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
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={headerTopPad} style={{ flex: 1 }}>
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={[styles.scrollInner, { paddingBottom: bottomPad + footerBottom, minHeight: '100%' }]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'android' ? 'none' : 'interactive'}
            refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
            showsVerticalScrollIndicator
          >
            {/* Top card */}
            <View style={styles.card}>
              {editMode ? (
                <>
                  <View style={styles.logoTopWrap}>
                    <ImagePickerCard
                      editable
                      size={110}
                      title="Business Logo"
                      addHint="Square image works best (1:1)"
                      previewUri={logoFile?.uri || logoUri}
                      onPick={(f) => setLogoFile(f)}
                      onRemove={() => setLogoFile(null)}
                    />
                  </View>

                  <Field
                    label="Business Name"
                    value={form.business_name}
                    onChangeText={(v) => setForm((p) => ({ ...p, business_name: v }))}
                    returnKeyType="next"
                  />

                  {/* Delivery option chips (GRAB / SELF / BOTH) */}
                  <View style={[styles.rowWrap, { marginTop: 8 }]}>
                    <DeliveryChip value="GRAB" current={form.delivery_option} onSelect={(v) => setForm((p) => ({ ...p, delivery_option: v }))} />
                    <DeliveryChip value="SELF" current={form.delivery_option} onSelect={(v) => setForm((p) => ({ ...p, delivery_option: v }))} />
                    <DeliveryChip value="BOTH" current={form.delivery_option} onSelect={(v) => setForm((p) => ({ ...p, delivery_option: v }))} />
                  </View>

                  {/* Min amount for free delivery - editable */}
                  <Field
                    label="Min amount for Free Delivery (Nu.)"
                    value={form.min_amount_for_fd}
                    keyboardType="numeric"
                    onChangeText={(v) => setForm((p) => ({ ...p, min_amount_for_fd: v }))}
                    style={{ marginTop: 8 }}
                  />

                  {/* ✅ Special Celebration + Discount % */}
                  <View style={{ marginTop: 8 }}>
                    <SubTitle text="Special Celebration" />
                    <Field
                      label="Celebration (optional)"
                      value={form.special_celebration}
                      onChangeText={(v) => setForm((p) => ({ ...p, special_celebration: v }))}
                      placeholder="e.g. New Year, Losar, Valentine"
                    />
                    <Field
                      label="Discount Percentage (%)"
                      value={form.special_celebration_discount_percentage}
                      keyboardType="numeric"
                      onChangeText={(v) =>
                        setForm((p) => ({
                          ...p,
                          special_celebration_discount_percentage: clampPercentString(v),
                        }))
                      }
                      placeholder="0 - 100"
                    />
                    <Text style={[styles.muted, { marginTop: 2 }]}>
                      If celebration is set and % is empty, it will save as 0%.
                    </Text>
                  </View>

                  <View style={{ marginTop: 8 }}>
                    <TimeField
                      label="Opens"
                      text={openText}
                      ampm={openAmPm}
                      onChangeText={(t) => {
                        setOpenText(t);
                        setForm((p) => ({ ...p, opening_time: to24h(t, openAmPm) }));
                      }}
                      onToggleAmPm={(val) => {
                        setOpenAmPm(val);
                        setForm((p) => ({ ...p, opening_time: to24h(openText, val) }));
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
                        setForm((p) => ({ ...p, closing_time: to24h(t, closeAmPm) }));
                      }}
                      onToggleAmPm={(val) => {
                        setCloseAmPm(val);
                        setForm((p) => ({ ...p, closing_time: to24h(closeText, val) }));
                      }}
                      inputRef={closeRef}
                      returnKeyType="done"
                    />
                  </View>
                </>
              ) : (
                <View style={styles.row}>
                  <View style={styles.logoWrap}>
                    <ImagePickerCard editable={false} previewUri={logoFile?.uri || logoUri} title="Business Logo" />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.title} numberOfLines={1}>
                      {data?.business_name || '—'}
                    </Text>

                    <View style={[styles.rowWrap, { marginTop: 8 }]}>
                      <Badge icon="bicycle-outline" label={prettyDeliveryOption(data?.delivery_option)} />
                      {data?.min_amount_for_fd ? (
                        <Badge icon="pricetag-outline" label={`Min Free Delivery: Nu. ${data.min_amount_for_fd}`} compact />
                      ) : null}
                    </View>

                    {/* ✅ show celebration badge(s) */}
                    {!!showCelebration && (
                      <View style={[styles.rowWrap, { marginTop: 8 }]}>
                        <Badge icon="sparkles-outline" label={`Celebration: ${showCelebration}`} />
                        <Badge icon="gift-outline" label={`Discount: ${showCelebrationPct || '0'}%`} compact />
                      </View>
                    )}

                    <View style={{ marginTop: 8 }}>
                      <Badge compact icon="time-outline" label={`${formatPretty(data?.opening_time)} – ${formatPretty(data?.closing_time)}`} />
                    </View>
                  </View>
                </View>
              )}
            </View>

            {/* Registration + License */}
            <View style={styles.card}>
              <SubTitle text="Registration" />
              {editMode ? (
                <>
                  <Field
                    label="License No."
                    value={form.business_license_number}
                    onChangeText={(v) => setForm((p) => ({ ...p, business_license_number: v }))}
                  />
                  <View style={{ marginTop: 8 }}>
                    <ImagePickerCard
                      editable
                      size={150}
                      title="License Image"
                      addHint="Clear photo or scan"
                      previewUri={licenseFile?.uri || licenseUri}
                      onPick={(f) => setLicenseFile(f)}
                      onRemove={() => setLicenseFile(null)}
                    />
                  </View>
                </>
              ) : (
                <>
                  <ItemRow label="License No." value={data?.business_license_number || '—'} />
                  <View style={{ height: 10 }} />
                  <SubTitle text="License Image" />
                  {licenseUri ? (
                    <Image source={{ uri: licenseUri }} style={styles.licenseImg} />
                  ) : (
                    <Text style={styles.muted}>No license image uploaded</Text>
                  )}
                </>
              )}
            </View>

            {/* Location */}
            <View style={styles.card}>
              <SubTitle text="Location" />
              {editMode ? (
                <>
                  <View style={styles.mapPreviewWrapperLarge}>
                    <MapView style={styles.mapPreview} region={mapRegion} pointerEvents="none" provider={PROVIDER_DEFAULT}>
                      <UrlTile urlTemplate="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maximumZ={19} />
                      {pickedCoord && <Marker coordinate={pickedCoord} />}
                    </MapView>
                    <TouchableOpacity style={styles.previewOverlay} activeOpacity={0.9} onPress={() => setLocationModalVisible(true)}>
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
                    onChangeText={(v) => setForm((p) => ({ ...p, address: v }))}
                    multiline
                  />
                </>
              ) : (
                <>
                  <ItemRow label="Address" value={data?.address || '—'} multiline />
                  <ItemRow label="Latitude" value={pickedCoord ? String(pickedCoord.latitude) : '—'} />
                  <ItemRow label="Longitude" value={pickedCoord ? String(pickedCoord.longitude) : '—'} />
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
                    onChangeText={(v) => setForm((p) => ({ ...p, complementary: v }))}
                  />
                  <Field
                    label="Details"
                    value={form.complementary_details}
                    onChangeText={(v) => setForm((p) => ({ ...p, complementary_details: v }))}
                    multiline
                  />
                </>
              ) : (
                <>
                  <ItemRow label="Offer" value={data?.complementary || '—'} />
                  <ItemRow label="Details" value={data?.complementary_details || '—'} multiline />
                </>
              )}
            </View>

            <View style={{ height: 8 }} />
          </ScrollView>

          {/* Sticky Save row */}
          {editMode && (
            <View
              style={[
                styles.footer,
                {
                  paddingBottom: Math.max(insets.bottom, 32),
                  bottom: Math.max(kbHeight - insets.bottom, 0),
                },
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
      <Modal
        visible={locationModalVisible}
        transparent={false}
        animationType="slide"
        onRequestClose={() => setLocationModalVisible(false)}
      >
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Pick Location</Text>
          <Pressable onPress={() => setLocationModalVisible(false)}>
            <Text style={styles.modalClose}>Close</Text>
          </Pressable>
        </View>

        <View style={{ flex: 1 }}>
          <MapView
            ref={mapRef}
            style={{ flex: 1 }}
            initialRegion={mapRegion}
            provider={PROVIDER_DEFAULT}
            onLongPress={(e) => setPickedCoord(e.nativeEvent.coordinate)}
          >
            <UrlTile urlTemplate="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maximumZ={19} />
            {pickedCoord && <Marker coordinate={pickedCoord} />}
          </MapView>

          <View style={styles.modalFloatWrap}>
            <TouchableOpacity
              style={styles.modalFloatBtn}
              onPress={async () => {
                setModalLocError('');
                setModalLocLoading(true);
                try {
                  const svc = await Location.hasServicesEnabledAsync();
                  if (!svc) {
                    setModalLocError('Location services are off.');
                    return;
                  }
                  let { status } = await Location.getForegroundPermissionsAsync();
                  if (status !== 'granted') status = (await Location.requestForegroundPermissionsAsync())?.status;
                  if (status !== 'granted') {
                    setModalLocError('Location permission denied.');
                    return;
                  }
                  const pos = await Location.getCurrentPositionAsync({
                    accuracy: Location.Accuracy.High,
                    maximumAge: 5000,
                  });
                  const { latitude, longitude } = pos.coords || {};
                  if (latitude == null || longitude == null) {
                    setModalLocError('Current location unavailable.');
                    return;
                  }
                  setPickedCoord({ latitude, longitude });
                  const region = { latitude, longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 };
                  mapRef.current?.animateToRegion(region, 600);
                } catch {
                  setModalLocError('Unable to fetch current location.');
                } finally {
                  setModalLocLoading(false);
                }
              }}
              disabled={modalLocLoading}
            >
              {modalLocLoading ? <ActivityIndicator /> : <Text style={styles.modalFloatBtnText}>Use Current Location</Text>}
            </TouchableOpacity>
          </View>
        </View>

        {!!modalLocError && (
          <Text style={[styles.muted, { marginHorizontal: 16, marginTop: 8 }]}>{modalLocError}</Text>
        )}

        <View style={{ padding: 12 }}>
          <Text style={styles.muted}>Long-press anywhere on the map to drop a pin.</Text>
          {pickedCoord ? (
            <Pressable
              onPress={async () => {
                await setAddressFromCoord(pickedCoord, setForm);
                setLocationModalVisible(false);
              }}
              style={({ pressed }) => [styles.btn, { marginTop: 12 }, pressed && styles.btnPressed]}
            >
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
function SubTitle({ text }) {
  return <Text style={styles.subtitle}>{text}</Text>;
}

function Field({
  label,
  value,
  onChangeText,
  keyboardType = 'default',
  multiline = false,
  placeholder,
  style,
  inputRef,
  returnKeyType = 'default',
  onSubmitEditing,
  blurOnSubmit,
  onFocus,
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
  return (
    <View style={[styles.badge, compact && styles.badgeCompact]}>
      <Ionicons name={icon} size={compact ? 10 : 12} color="#065f46" style={{ marginRight: compact ? 4 : 6 }} />
      <Text style={[styles.badgeText, compact && styles.badgeTextCompact]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function DeliveryChip({ value, current, onSelect }) {
  const active = (current || '').toUpperCase() === value.toUpperCase();
  return (
    <Pressable
      onPress={() => onSelect(value)}
      style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && styles.pressed]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{prettyDeliveryOption(value)}</Text>
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

/* TimeField: HH and MM inputs, fixed ":" splitter */
function TimeField({
  label,
  text,
  ampm,
  onChangeText,
  onToggleAmPm,
  inputRef,
  onSubmitEditing,
  returnKeyType = 'next',
}) {
  const [hours, setHours] = useState(() => String(text || '').match(/^(\d{1,2}):(\d{1,2})$/)?.[1] || '');
  const [mins, setMins] = useState(() => String(text || '').match(/^(\d{1,2}):(\d{1,2})$/)?.[2] || '');
  const minsRef = useRef(null);

  useEffect(() => {
    const m = String(text || '').match(/^(\d{1,2}):(\d{1,2})$/);
    const newH = m ? m[1] : '';
    const newM = m ? m[2] : '';
    if (newH !== hours) setHours(newH);
    if (newM !== mins) setMins(newM);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const emitNow = useCallback(
    (h, m) => {
      const hh = (h ?? '').replace(/\D/g, '').slice(0, 2);
      const mm = (m ?? '').replace(/\D/g, '').slice(0, 2);
      if (hh) onChangeText?.(`${hh}:${mm}`);
    },
    [onChangeText]
  );

  const onHoursChange = (v) => {
    const d = v.replace(/\D/g, '').slice(0, 2);
    setHours(d);
    emitNow(d, mins);
  };
  const onMinsChange = (v) => {
    const d = v.replace(/\D/g, '').slice(0, 2);
    setMins(d);
    emitNow(hours, d);
  };

  const onHoursEnd = () => {
    if (!hours) return;
    let H = parseInt(hours, 10);
    if (!Number.isFinite(H)) return;
    H = Math.max(1, Math.min(12, H));
    const Hs = String(H);
    if (Hs !== hours) setHours(Hs);
    emitNow(Hs, mins);
    if (!mins) minsRef.current?.focus();
  };
  const onMinsEnd = () => {
    if (!mins) return;
    let M = parseInt(mins, 10);
    if (!Number.isFinite(M)) return;
    M = Math.max(0, Math.min(59, M));
    const Ms = String(M);
    if (Ms !== mins) setMins(Ms);
    emitNow(hours, Ms);
  };

  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={styles.itemLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={[styles.input, styles.hhmmBox]}>
          <TextInput
            ref={inputRef}
            value={hours}
            onChangeText={onHoursChange}
            onEndEditing={onHoursEnd}
            placeholder="9"
            placeholderTextColor="#94a3b8"
            keyboardType="number-pad"
            returnKeyType="next"
            maxLength={2}
            style={[styles.hhmmInput, { textAlign: 'center' }]}
            onSubmitEditing={() => minsRef.current?.focus()}
            accessibilityLabel="Hour"
          />
          <Text style={styles.colonFixed}>:</Text>
          <TextInput
            ref={minsRef}
            value={mins}
            onChangeText={onMinsChange}
            onEndEditing={onMinsEnd}
            placeholder="00"
            placeholderTextColor="#94a3b8"
            keyboardType="number-pad"
            returnKeyType={returnKeyType}
            onSubmitEditing={onSubmitEditing}
            maxLength={2}
            style={[styles.hhmmInput, { textAlign: 'center' }]}
            accessibilityLabel="Minutes"
          />
        </View>

        <View style={styles.ampmWrap}>
          {['AM', 'PM'].map((opt) => {
            const active = ampm === opt;
            return (
              <Pressable
                key={opt}
                onPress={() => onToggleAmPm(opt)}
                style={({ pressed }) => [styles.ampmBtn, active && styles.ampmBtnActive, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`Select ${opt}`}
                accessibilityState={{ selected: active }}
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

/* ImagePickerCard: friendlier uploader with preview modal */
function ImagePickerCard({ editable, previewUri, onPick, onRemove, size = 64, title = 'Image', addHint = 'Select an image' }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
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

  const fromGallery = async () => {
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
          Alert.alert('Too large', 'Image must be under 5MB.');
          return;
        }
        onPick?.({
          name: a?.fileName ?? 'image.jpg',
          uri: a?.uri,
          mimeType: a?.mimeType ?? guessMimeFromUri(a?.uri || ''),
          size: a?.fileSize ?? 0,
        });
      }
    } catch (e) {
      Alert.alert(`${title} selection failed`, e?.message || 'Try again.');
    } finally {
      setBusy(false);
      setSheetOpen(false);
    }
  };

  const fromCamera = async () => {
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
          Alert.alert('Too large', 'Image must be under 5MB.');
          return;
        }
        onPick?.({
          name: a?.fileName ?? 'image.jpg',
          uri: a?.uri,
          mimeType: a?.mimeType ?? guessMimeFromUri(a?.uri || ''),
          size: a?.fileSize ?? 0,
        });
        Alert.alert('Captured', `${title} ready — tap “Save Changes”.`);
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
      <>
        <Pressable
          onPress={() => setPreviewOpen(true)}
          style={({ pressed }) => [styles.logoEditableBox, { width: size, height: size, borderRadius: radius }, pressed && styles.btnPressed]}
        >
          <Image source={{ uri: previewUri }} style={styles.logoEditableImg} />
        </Pressable>
        <ImagePreviewModal uri={previewUri} open={previewOpen} onClose={() => setPreviewOpen(false)} title={title} />
      </>
    ) : (
      <View style={[styles.logoFallback, { width: size, height: size, borderRadius: radius }]}>
        <Ionicons name="image-outline" size={26} color={THEME_GREEN} />
      </View>
    );
  }

  return (
    <>
      {hasImage ? (
        <>
          <Pressable
            onPress={() => setPreviewOpen(true)}
            style={({ pressed }) => [styles.logoEditableBox, { width: size, height: size, borderRadius: radius }, pressed && styles.btnPressed]}
          >
            <Image source={{ uri: previewUri }} style={styles.logoEditableImg} />
            <View style={styles.editFloat}>
              <Ionicons name="search" size={14} color="#fff" />
            </View>
          </Pressable>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <SmallBtn label="Change" icon="swap-horizontal" onPress={() => setSheetOpen(true)} />
            <SmallBtn label="Remove" icon="trash-outline" danger onPress={() => onRemove?.()} />
          </View>

          <ImagePreviewModal uri={previewUri} open={previewOpen} onClose={() => setPreviewOpen(false)} title={title} />
        </>
      ) : (
        <Pressable
          onPress={() => setSheetOpen(true)}
          style={({ pressed }) => [styles.logoUploadCard, { width: size, height: size, borderRadius: radius }, pressed && styles.btnPressed]}
        >
          <Ionicons name="image-outline" size={22} color="#9ca3af" />
          <Text style={styles.logoUploadTitle}>Add {title}</Text>
          <Text style={styles.logoUploadHint}>{addHint}</Text>
        </Pressable>
      )}

      <Modal visible={sheetOpen} transparent animationType="fade" onRequestClose={() => setSheetOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setSheetOpen(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{title}</Text>

          <View style={styles.sheetButtons}>
            <SheetButton icon="images-outline" label="Choose from Gallery" onPress={fromGallery} disabled={busy} />
            <SheetButton icon="camera-outline" label="Take Photo" onPress={fromCamera} disabled={busy} />
            {hasImage && (
              <SheetButton
                icon="trash-outline"
                danger
                label="Remove Photo"
                onPress={() => {
                  onRemove?.();
                  setSheetOpen(false);
                }}
              />
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

function ImagePreviewModal({ uri, open, onClose, title }) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.previewBackdrop} onPress={onClose} />
      <View style={styles.previewCard}>
        <Text style={styles.previewTitle}>{title}</Text>
        {uri ? <Image source={{ uri }} style={styles.previewImage} /> : <Text style={styles.muted}>No preview</Text>}
        <Pressable onPress={onClose} style={({ pressed }) => [styles.btn, { alignSelf: 'center', marginTop: 10 }, pressed && styles.btnPressed]}>
          <Ionicons name="close" size={16} color="#fff" />
          <Text style={[styles.btnText, { marginLeft: 8 }]}>Close</Text>
        </Pressable>
      </View>
    </Modal>
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

function SmallBtn({ label, icon, onPress, danger }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.smallBtn,
        pressed && { opacity: 0.9 },
        danger && { borderColor: '#fecaca', backgroundColor: '#fee2e2' },
      ]}
    >
      <Ionicons name={icon} size={14} color={danger ? '#b91c1c' : '#0f172a'} />
      <Text style={[styles.smallBtnText, danger && { color: '#b91c1c' }]}>{label}</Text>
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
  headerBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#eefbf3',
  },
  headerBtnText: { color: THEME_GREEN, fontWeight: '800' },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  muted: { color: '#64748b', fontSize: 13 },

  scrollInner: { padding: 16 },

  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },

  row: { flexDirection: 'row', alignItems: 'center' },
  rowWrap: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },

  logoWrap: { marginRight: 12 },
  logoTopWrap: { alignItems: 'center', marginBottom: 12 },

  logoFallback: {
    width: 64,
    height: 64,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
  },

  logoEditableBox: {
    width: 64,
    height: 64,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  logoEditableImg: { width: '100%', height: '100%', resizeMode: 'cover' },
  editFloat: {
    position: 'absolute',
    right: -6,
    top: -6,
    backgroundColor: THEME_GREEN,
    height: 24,
    width: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },

  logoUploadCard: {
    width: 64,
    height: 64,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  logoUploadTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#111827',
    marginTop: 4,
  },
  logoUploadHint: {
    fontSize: 9,
    color: '#64748b',
    marginTop: 2,
    textAlign: 'center',
  },

  title: { fontSize: width > 400 ? 18 : 16, fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: 14, fontWeight: '700', color: '#0f172a', marginBottom: 8 },

  itemRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  itemLabel: { fontSize: 12, color: '#64748b', marginBottom: 4 },
  itemValue: { fontSize: 15, color: '#111827', fontWeight: '600' },

  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    fontSize: 14,
    color: '#111827',
  },

  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderColor: '#86efac',
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  badgeText: { fontSize: 11, color: '#065f46', fontWeight: '700' },
  badgeCompact: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  badgeTextCompact: { fontSize: 11 },

  chip: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#fff',
  },
  chipActive: { borderColor: '#86efac', backgroundColor: '#dcfce7' },
  chipText: { fontSize: 12, color: '#0f172a', fontWeight: '700' },
  chipTextActive: { color: '#065f46' },

  ampmWrap: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginLeft: 8,
  },
  ampmBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  ampmBtnActive: { backgroundColor: '#dcfce7', borderColor: '#86efac' },
  ampmText: { fontWeight: '700', color: '#0f172a', fontSize: 12 },
  ampmTextActive: { color: '#065f46' },

  hhmmBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    gap: 6,
    flex: 1,
  },
  hhmmInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    minWidth: 52,
    fontSize: 14,
    color: '#111827',
  },
  colonFixed: { fontSize: 16, fontWeight: '800', color: '#111827', paddingHorizontal: 2 },

  pressed: { opacity: 0.9 },
  btnPressed: { transform: [{ scale: 0.99 }] },

  licenseImg: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    resizeMode: 'cover',
  },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  saveBtn: { backgroundColor: THEME_GREEN, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 16 },

  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME_GREEN,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignSelf: 'flex-start',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  btnText: { color: '#fff', fontWeight: '800' },

  mapPreviewWrapperLarge: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    height: 180,
    marginBottom: 8,
    position: 'relative',
  },
  mapPreview: { flex: 1 },
  previewOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 8,
    backgroundColor: 'rgba(0,0,0,0)',
  },
  previewOverlayText: {
    fontSize: 12,
    fontWeight: '700',
    backgroundColor: 'rgba(17,24,39,0.6)',
    color: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  coordsBlock: { paddingVertical: 6 },
  coordsLabel: { fontSize: 12, color: '#6B7280' },
  coordsValue: { fontSize: 14, color: '#111827', fontWeight: '600' },

  // bottom sheet
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.25)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 8,
    paddingBottom: 16,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
    elevation: 10,
  },
  sheetHandle: { alignSelf: 'center', width: 36, height: 4, backgroundColor: '#e5e7eb', borderRadius: 999, marginBottom: 8 },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 8 },
  sheetButtons: { gap: 6 },
  sheetBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderRadius: 10, paddingHorizontal: 8 },
  sheetIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  sheetBtnText: { fontSize: 15, color: '#111827', fontWeight: '600' },
  sheetCancel: { marginTop: 8, alignItems: 'center', paddingVertical: 10 },
  sheetCancelText: { fontSize: 15, fontWeight: '700', color: '#111827' },

  // preview modal
  previewBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  previewCard: {
    position: 'absolute',
    left: 14,
    right: 14,
    top: 44,
    bottom: 44,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  previewTitle: { fontSize: 16, fontWeight: '800', color: '#111827', marginBottom: 8, textAlign: 'center' },
  previewImage: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    resizeMode: 'contain',
  },

  // small buttons under image
  smallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  smallBtnText: { fontSize: 13, fontWeight: '700', color: '#0f172a' },

  // modal header
  modalHeader: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomColor: '#e5e7eb',
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  modalClose: { fontSize: 14, fontWeight: '700', color: THEME_GREEN },

  modalFloatWrap: { position: 'absolute', top: 12, right: 12 },
  modalFloatBtn: {
    backgroundColor: THEME_GREEN,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  modalFloatBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
