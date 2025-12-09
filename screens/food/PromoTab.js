// PromosTab.js — banners CRUD + auto pricing + payment alert on save/reactivate
// - Owner type is NOT shown anywhere (still sent to API)
// - Image + "Select Image" are together in the form field (inline preview + buttons)
// - Amount recalculates & displays immediately after date selection (create & edit)
// - total_amount is sent on create, and on edit/reactivate ONLY when dates are changed
// - In list rows: if inactive or expired => show "Paid: Nu. X" instead of amount
// - Reactivate flow shows live days/amount, but wallet is charged only if dates change
// - After successful POST/PUT, show Alert with message & journal/payment details
// - Reactivating sends ONLY { user_id, start_date, end_date, total_amount, is_active:1 } when charging
// - Dates sent as MySQL-friendly "YYYY-MM-DD" (no timezone) to avoid DB error.
// - Unified error alert for any failure, including {success:false,message:"Insufficient wallet balance"}

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  RefreshControl, Switch, Modal, Pressable, Platform, KeyboardAvoidingView,
  Alert, Image, ActivityIndicator, ScrollView,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  BANNERS_ENDPOINT,
  CREATE_BANNER_ENDPOINT,
  UPDATE_BANNER_ENDPOINT,
  REACTIVATING_BANNER_ENDPOINT,
  BANNERS_BY_BUSINESS_ENDPOINT,
  BANNERS_IMAGE_ENDPOINT,
  BANNER_BASE_PRICE_ENDPOINT,
  BUSINESS_DETAILS,
} from '@env';

/* ================= helpers ================= */
const toHuman = (d) => (d ? new Date(d).toDateString() : '—');
const isHttpLike = (s = '') => /^https?:\/\//i.test(String(s));
const toYMD = (dateLike) => {
  if (!dateLike) return '';
  const d = typeof dateLike === 'string' ? new Date(dateLike) : dateLike;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};
const addDaysYMD = (dateLike, days = 0) => {
  const d = typeof dateLike === 'string' ? new Date(dateLike) : new Date(dateLike);
  const base = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  base.setDate(base.getDate() + days);
  return toYMD(base);
};
const todayISO = () => new Date().toISOString().slice(0, 10);
const originFrom = (u) => { try { return new URL(u).origin; } catch { return ''; } };
const hostOnly = (u = '') => { try { return new URL(u).origin; } catch { return ''; } };
const sanitizePath = (p = '') =>
  String(p).replace(/^\/(merchant\/)?uploads\/uploads\//i, '/$1uploads/').replace(/([^:]\/)\/+/g, '$1');
const encodePathSegments = (p = '') =>
  String(p).split('/').map(seg => (seg ? encodeURIComponent(seg) : '')).join('/');

const absJoin = (base = '', raw = '') => {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (isHttpLike(s)) return s;
  const baseNorm = String((base || '').replace(/\/+$/, ''));
  let path = s.startsWith('/') ? s : `/${s}`;
  if (/\/merchant\/uploads$/i.test(baseNorm) && /^\/merchant\/uploads\//i.test(path)) {
    path = path.replace(/^\/merchant\/uploads/i, '');
  }
  path = sanitizePath(path);
  const encoded = encodePathSegments(path);
  return `${baseNorm}${encoded.startsWith('/') ? '' : '/'}${encoded}`.replace(/([^:]\/)\/+/g, '$1');
};

const buildBannerImg = (rawPath) => {
  if (!rawPath) return '';
  if (isHttpLike(rawPath)) return rawPath;
  const baseHost =
    hostOnly(BANNERS_IMAGE_ENDPOINT) ||
    originFrom(BANNERS_BY_BUSINESS_ENDPOINT || '') ||
    originFrom(BANNERS_ENDPOINT || '') ||
    '';
  const needsMerchant =
    /\/merchant(\/|$)/i.test(String(BANNERS_BY_BUSINESS_ENDPOINT || '')) ||
    /\/merchant(\/|$)/i.test(String(BANNERS_ENDPOINT || ''));
  let path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  if (needsMerchant && /^\/uploads\//i.test(path) && !/^\/merchant\//i.test(path)) {
    path = `/merchant${path}`;
  }
  return absJoin(baseHost, path);
};

const isInactive = (b) => {
  const disabled = Number(b.is_active) !== 1;
  const expired = b?.end_date ? String(b.end_date).slice(0, 10) <= todayISO() : false;
  return disabled || expired;
};

const emptyForm = (business_id = 0, ownerType = 'food') => ({
  id: null,
  business_id,
  owner_type: ownerType, // internal only
  title: '',
  description: '',
  banner_image: '',
  is_active: 1,
  start_date: '',
  end_date: '',
  _localImage: null,
  _originalStart: '',
  _originalEnd: '',
});

const fetchWithTimeout = (url, options = {}, ms = 10000) =>
  Promise.race([
    fetch(url, options),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Request to ${url} timed out after ${ms}ms`)), ms)),
  ]);

const baseUpdate = (UPDATE_BANNER_ENDPOINT || BANNERS_ENDPOINT).replace(/\/$/, '');
const baseCreate = (CREATE_BANNER_ENDPOINT || BANNERS_ENDPOINT).replace(/\/$/, '');
const baseReactivate = (REACTIVATING_BANNER_ENDPOINT || UPDATE_BANNER_ENDPOINT || BANNERS_ENDPOINT).replace(/\/$/, '');

/** FIX: build BUSINESS_DETAILS URL even if it contains placeholders */
const buildBusinessDetailsUrl = (businessId) => {
  if (!BUSINESS_DETAILS) return '';
  const baseRaw = String(BUSINESS_DETAILS).replace(/\/$/, '');
  const idStr = encodeURIComponent(businessId);

  if (baseRaw.includes('{businessId}')) return baseRaw.replace('{businessId}', idStr);
  if (baseRaw.includes('{business_id}')) return baseRaw.replace('{business_id}', idStr);
  if (baseRaw.match(/:businessId\b/)) return baseRaw.replace(/:businessId\b/, idStr);
  if (baseRaw.match(/:business_id\b/)) return baseRaw.replace(/:business_id\b/, idStr);

  // fallback: just append
  return `${baseRaw}/${idStr}`;
};

function mostCommonOwnerType(arr) {
  const counts = arr.reduce((m, b) => {
    const ot = String(b?.owner_type || '').trim().toLowerCase();
    if (!ot) return m;
    m[ot] = (m[ot] || 0) + 1;
    return m;
  }, {});
  let best = ''; let n = -1;
  Object.entries(counts).forEach(([k, v]) => { if (v > n) { best = k; n = v; } });
  return best || '';
}

// Inclusive days
const daysInclusive = (startYMD, endYMD) => {
  if (!startYMD || !endYMD) return 0;
  const s = new Date(startYMD + 'T00:00:00');
  const e = new Date(endYMD + 'T00:00:00');
  const ms = e - s;
  if (!isFinite(ms)) return 0;
  return Math.floor(ms / (24 * 3600 * 1000)) + 1;
};

const currency = (n) =>
  `Nu. ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* ===== unified error alert helpers ===== */
function extractApiErrorMessage(input) {
  if (!input) return 'Something went wrong.';
  if (typeof input === 'string') {
    try {
      const j = JSON.parse(input);
      return extractApiErrorMessage(j);
    } catch {
      return input;
    }
  }
  if (typeof input === 'object') {
    if (typeof input.message === 'string') return input.message;
    if (typeof input.error === 'string') return input.error;
    if (input.errors && typeof input.errors === 'object') {
      const lines = [];
      Object.entries(input.errors).forEach(([k, v]) => {
        if (Array.isArray(v)) v.forEach(s => lines.push(`${k}: ${s}`));
        else if (v) lines.push(`${k}: ${String(v)}`);
      });
      if (lines.length) return lines.join('\n');
    }
    if (Array.isArray(input.details)) {
      const lines = input.details.map(d => (d.message || d.msg || d) + '');
      if (lines.length) return lines.join('\n');
    }
    try { return JSON.stringify(input); } catch { return 'Unexpected error.'; }
  }
  return 'Unexpected error.';
}
function showErrorAlert(payload, title = 'Error') {
  Alert.alert(title, extractApiErrorMessage(payload));
}

/* ===== success alert with payment/journal details ===== */
function showBannerPaymentAlert(json, { isEdit = false } = {}) {
  const msg =
    String(json?.message || (isEdit ? 'Banner updated successfully.' : 'Banner created successfully.'));

  const p = json?.payment;
  if (p && (p.journal_code || p.amount != null || p.debit_txn_id || p.credit_txn_id)) {
    const lines = [
      msg,
      '',
      p.journal_code ? `Journal: ${p.journal_code}` : null,
      p.amount != null ? `Amount: ${currency(p.amount)}` : null,
      p.debited_from_wallet ? `Debited from: ${p.debited_from_wallet}` : null,
      p.credited_to_wallet ? `Credited to: ${p.credited_to_wallet}` : null,
      p.debit_txn_id ? `Debit Txn: ${p.debit_txn_id}` : null,
      p.credit_txn_id ? `Credit Txn: ${p.credit_txn_id}` : null,
    ].filter(Boolean).join('\n');

    Alert.alert('Success', lines);
  } else {
    Alert.alert('Success', msg);
  }
}

/* ===== use plain MySQL-friendly date strings (YYYY-MM-DD) ===== */
function ymdToMySQLDate(ymd) {
  return ymd || '';
}

/* ================= component ================= */
export default function PromosTab({
  businessId: businessIdProp,
  ownerType: ownerTypeProp,
  isTablet,
}) {
  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [businessId] = useState(Number(businessIdProp ?? 0) || 0);

  const [resolvedOwnerType, setResolvedOwnerType] = useState(
    String(ownerTypeProp || '').trim().toLowerCase() || 'food'
  );

  const [userId, setUserId] = useState(null);

  // per-day base price
  const [basePrice, setBasePrice] = useState(null);
  const [basePriceLoading, setBasePriceLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(() => emptyForm(businessId, resolvedOwnerType));
  const [query, setQuery] = useState('');

  // Enable-with-dates sheet
  const [enableSheetOpen, setEnableSheetOpen] = useState(false);
  const [enableTarget, setEnableTarget] = useState(null);
  const [enableStart, setEnableStart] = useState('');
  const [enableEnd, setEnableEnd] = useState('');
  const [showEnableStartPicker, setShowEnableStartPicker] = useState(false);
  const [showEnableEndPicker, setShowEnableEndPicker] = useState(false);

  // Live calc for reactivate sheet
  const enableDays = useMemo(
    () => daysInclusive(enableStart, enableEnd),
    [enableStart, enableEnd]
  );
  const enableAmount = useMemo(() => {
    if (!Number.isFinite(basePrice)) return null;
    if (!enableDays || enableDays < 0) return null;
    return Number((enableDays * basePrice).toFixed(2));
  }, [enableDays, basePrice]);

  // Dates changed vs original for reactivation
  const reactivateOriginalStart = enableTarget ? toYMD(enableTarget.start_date) : '';
  const reactivateOriginalEnd = enableTarget ? toYMD(enableTarget.end_date) : '';
  const reactivateDatesChanged =
    !!enableTarget &&
    !!enableStart &&
    !!enableEnd &&
    (enableStart !== reactivateOriginalStart || enableEnd !== reactivateOriginalEnd);

  // For disabling date changes when end date not ended
  const endNotEndedEdit = useMemo(() => {
    if (!form._originalEnd) return false;
    return form._originalEnd >= todayISO(); // YYYY-MM-DD lexicographical works
  }, [form._originalEnd]);

  const endNotEndedReactivate = useMemo(() => {
    if (!enableTarget?.end_date) return false;
    const orig = toYMD(enableTarget.end_date);
    if (!orig) return false;
    return orig >= todayISO();
  }, [enableTarget]);

  // Date pickers for create/edit
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const textSizeTitle = isTablet ? 18 : 16;
  const textSizeSub = isTablet ? 13 : 12;

  /* -------- Load BUSINESS → user_id (no token) -------- */
  const loadBusinessUserId = useCallback(async () => {
    if (!businessId || !BUSINESS_DETAILS) return;
    try {
      const url = buildBusinessDetailsUrl(businessId);
      if (!url) return;

      const res = await fetchWithTimeout(url, {}, 8000);
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status} — ${text || 'Failed to load business'}`);
      const json = text ? JSON.parse(text) : {};
      const obj = json?.data && typeof json.data === 'object' ? json.data : json;
      const uid = Number(obj?.user_id);
      if (Number.isFinite(uid) && uid > 0) setUserId(uid);
    } catch (e) {
      console.error('[PromosTab] business/user_id error', e);
    }
  }, [businessId]);

  /* -------- Load BASE PRICE once -------- */
  const loadBasePrice = useCallback(async () => {
    if (!BANNER_BASE_PRICE_ENDPOINT) return;
    setBasePriceLoading(true);
    try {
      const url = String(BANNER_BASE_PRICE_ENDPOINT).replace(/\/$/, '');
      const res = await fetchWithTimeout(url, {}, 8000);
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status} — ${text || 'Failed to fetch base price'}`);
      const json = text ? JSON.parse(text) : {};
      const per = Number(json?.amount_per_day);
      if (Number.isFinite(per) && per > 0) setBasePrice(per);
    } catch (e) {
      console.error('[PromosTab] base price error', e);
    } finally {
      setBasePriceLoading(false);
    }
  }, []);

  /* -------- Load banners -------- */
  const loadAll = useCallback(async () => {
    if (!businessId) { setBanners([]); return; }
    setLoading(true);
    try {
      const base = (BANNERS_BY_BUSINESS_ENDPOINT || '').replace(/\/$/, '');
      if (base) {
        const url = `${base}/${encodeURIComponent(businessId)}`;
        const res = await fetchWithTimeout(url);
        const raw = await res.text();
        if (!res.ok) { showErrorAlert(raw || 'Failed to load banners', 'Network error'); return; }
        const json = raw ? JSON.parse(raw) : [];
        const arr = Array.isArray(json) ? json : (Array.isArray(json.data) ? json.data : []);
        setBanners(arr);
        if (!ownerTypeProp) {
          const inferred = mostCommonOwnerType(arr) || 'food';
          setResolvedOwnerType(inferred);
          setForm((s) => ({ ...s, owner_type: inferred }));
        }
      } else {
        const res = await fetchWithTimeout(BANNERS_ENDPOINT);
        const raw = await res.text();
        if (!res.ok) { showErrorAlert(raw || 'Failed to load banners', 'Network error'); return; }
        const json = raw ? JSON.parse(raw) : [];
        const arr = Array.isArray(json) ? json : (Array.isArray(json.data) ? json.data : []);
        const filtered = arr.filter(b => Number(b.business_id) === Number(businessId));
        setBanners(filtered);
        if (!ownerTypeProp) {
          const inferred = mostCommonOwnerType(filtered) || 'food';
          setResolvedOwnerType(inferred);
          setForm((s) => ({ ...s, owner_type: inferred }));
        }
      }
    } catch (e) {
      console.error(e);
      showErrorAlert(e?.message || e, 'Network error');
    } finally {
      setLoading(false);
    }
  }, [businessId, ownerTypeProp]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { loadBusinessUserId(); }, [loadBusinessUserId]);
  useEffect(() => { loadBasePrice(); }, [loadBasePrice]);

  useEffect(() => {
    if (!modalOpen) setForm(emptyForm(businessId, resolvedOwnerType));
  }, [businessId, resolvedOwnerType, modalOpen]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadAll(), loadBusinessUserId(), loadBasePrice()]);
    setRefreshing(false);
  }, [loadAll, loadBusinessUserId, loadBasePrice]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return banners;
    return banners.filter(b =>
      (b.title || '').toLowerCase().includes(q) ||
      (b.description || '').toLowerCase().includes(q)
    );
  }, [banners, query]);

  /* ---------- live draft days & amount (modal) ---------- */
  const draftDays = useMemo(
    () => daysInclusive(form.start_date, form.end_date),
    [form.start_date, form.end_date]
  );
  const draftAmount = useMemo(() => {
    if (!Number.isFinite(basePrice)) return null;
    if (!draftDays || draftDays < 0) return null;
    return Number((draftDays * basePrice).toFixed(2));
  }, [draftDays, basePrice]);

  /* ------------- list-row helpers ------------- */
  const computeDaysFor = (b) => daysInclusive(
    String(b?.start_date || '').slice(0, 10),
    String(b?.end_date || '').slice(0, 10)
  );
  const computeAmountFor = (b) => {
    const d = computeDaysFor(b);
    if (!d || !Number.isFinite(basePrice)) return null;
    return Number((d * basePrice).toFixed(2));
  };

  /* ------------- CRUD ------------- */
  const openCreate = () => {
    setForm(emptyForm(businessId, resolvedOwnerType));
    setModalOpen(true);
  };

  const openEdit = (b) => {
    const sd = (b.start_date || '').slice(0, 10);
    const ed = (b.end_date || '').slice(0, 10);
    setForm({
      id: b.id,
      business_id: Number(b.business_id ?? businessId),
      owner_type: String(b.owner_type || resolvedOwnerType).toLowerCase(),
      title: b.title ?? '',
      description: b.description ?? '',
      banner_image: b.banner_image ?? '',
      is_active: Number(b.is_active ?? 1),
      start_date: sd,
      end_date: ed,
      _localImage: null,
      _originalStart: sd,
      _originalEnd: ed,
    });
    setModalOpen(true);
  };

  const validate = (needPricing = false) => {
    if (!form.business_id) return 'Missing business_id';
    if (!String(resolvedOwnerType || '').trim()) return 'owner_type missing';
    const isEdit = !!form.id;
    if (!isEdit && !(form.banner_image || form._localImage)) return 'Pick an image or provide server path';
    if (needPricing) {
      if (!form.start_date || !form.end_date) return 'Start & End dates are required';
      if (new Date(form.start_date) > new Date(form.end_date)) return 'Start date must be before or equal to End date';
      const uid = Number(userId);
      if (!Number.isFinite(uid) || uid <= 0) return 'user_id missing for this business';
    } else if (form.start_date && form.end_date) {
      if (new Date(form.start_date) > new Date(form.end_date)) return 'Start date must be before or equal to End date';
    }
    return null;
  };

  const fetchTotalAmount = async (startYMD, endYMD, options = {}) => {
    const { skipValidation = false } = options;

    // For create/edit we validate; for reactivation we skip (no image required)
    if (!skipValidation) {
      const err = validate(true);
      if (err) throw new Error(err);
    }

    const days = daysInclusive(startYMD, endYMD);
       if (days <= 0) throw new Error('Invalid date range');
    if (Number.isFinite(basePrice) && basePrice > 0) {
      return Number((days * basePrice).toFixed(2));
    }
    const url = (BANNER_BASE_PRICE_ENDPOINT || '').replace(/\/$/, '');
    if (!url) throw new Error('BANNER_BASE_PRICE_ENDPOINT missing');
    const res = await fetchWithTimeout(url, {}, 8000);
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${text || 'Failed to fetch base price'}`);
    let json = {};
    try { json = text ? JSON.parse(text) : {}; } catch { }
    const per = Number(json?.amount_per_day);
    if (!Number.isFinite(per) || per <= 0) throw new Error('Invalid amount_per_day from server');
    return Number((days * per).toFixed(2));
  };

  /* ===== save(): parse response JSON and show payment alert ===== */
  const save = async () => {
    const isEdit = !!form.id;
    const url = isEdit ? `${baseUpdate}/${encodeURIComponent(form.id)}` : baseCreate;

    try {
      const hasDates = !!(form.start_date && form.end_date);
      const datesChangedOnEdit =
        isEdit &&
        hasDates &&
        (form.start_date !== form._originalStart || form.end_date !== form._originalEnd);

      const shouldCharge = (!isEdit && hasDates) || (isEdit && datesChangedOnEdit);

      let totalAmount = null;
      if (shouldCharge) {
        totalAmount = await fetchTotalAmount(form.start_date, form.end_date);
      }

      let res, text, json;

      if (form._localImage) {
        const fd = new FormData();
        fd.append('business_id', String(form.business_id));
        fd.append('owner_type', String(resolvedOwnerType));
        if (form.title) fd.append('title', form.title.trim());
        if (form.description) fd.append('description', form.description.trim());
        fd.append('is_active', String(Number(form.is_active) ? 1 : 0));
        if (form.start_date) fd.append('start_date', form.start_date);
        if (form.end_date) fd.append('end_date', form.end_date);
        if (shouldCharge && Number.isFinite(totalAmount)) fd.append('total_amount', String(totalAmount));
        if (Number.isFinite(Number(userId)) && Number(userId) > 0) fd.append('user_id', String(Number(userId)));

        const asset = form._localImage;
        const filename = asset?.fileName || asset?.uri?.split('/').pop() || `banner_${Date.now()}.jpg`;
        const ext = /\.(\w+)$/.exec(filename || '')?.[1]?.toLowerCase() || 'jpg';
        const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
        fd.append('banner_image', { uri: asset.uri, name: filename, type: mime });

        res = await fetchWithTimeout(url, { method: isEdit ? 'PUT' : 'POST', body: fd }, 15000);
        text = await res.text();
      } else {
        const payload = {
          business_id: Number(form.business_id),
          owner_type: String(resolvedOwnerType),
          title: (form.title || '').trim(),
          description: (form.description || '').trim(),
          banner_image: form.banner_image || '',
          is_active: Number(form.is_active) ? 1 : 0,
          start_date: form.start_date || '',
          end_date: form.end_date || '',
        };
        if (shouldCharge && Number.isFinite(totalAmount)) payload.total_amount = totalAmount;
        if (Number.isFinite(Number(userId)) && Number(userId) > 0) payload.user_id = Number(userId);

        res = await fetchWithTimeout(
          url,
          { method: isEdit ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
          12000
        );
        text = await res.text();
      }

      try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }

      if (!res.ok || json?.success === false) {
        showErrorAlert(text || json || (isEdit ? 'Update failed' : 'Create failed'), 'Save Error');
        return;
      }

      // success alert with optional payment/journal
      showBannerPaymentAlert(json, { isEdit });

      // Clean up and refresh
      setModalOpen(false);
      setForm(emptyForm(form.business_id, resolvedOwnerType));
      await loadAll();
    } catch (e) {
      console.error(e);
      showErrorAlert(e?.message || e, 'Save Error');
    }
  };

  const remove = (id) => {
    Alert.alert('Delete banner?', 'This action cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            const res = await fetchWithTimeout(`${baseUpdate}/${encodeURIComponent(id)}`, { method: 'DELETE' }, 10000);
            const t = await res.text().catch(() => '');
            if (!res.ok) { showErrorAlert(t || 'Delete failed'); return; }
            await loadAll();
          } catch (e) {
            console.error(e);
            showErrorAlert(e?.message || e);
          }
        },
      },
    ]);
  };

  const toggleActive = async (b) => {
    const next = Number(b.is_active) ? 0 : 1;
    if (next === 1) {
      // opening reactivation sheet, keep original dates
      setEnableTarget(b);
      setEnableStart(toYMD(b.start_date) || todayISO());
      setEnableEnd(toYMD(b.end_date) || addDaysYMD(new Date(), 7));
      setEnableSheetOpen(true);
      return;
    }

    const url = `${baseUpdate}/${encodeURIComponent(b.id)}`;
    const payload = {
      business_id: Number(b.business_id ?? businessId),
      owner_type: String((b.owner_type || '').toLowerCase() || resolvedOwnerType),
      title: b.title ?? '',
      description: b.description ?? '',
      banner_image: b.banner_image ?? '',
      is_active: 0,
      start_date: toYMD(b.start_date) || '',
      end_date: toYMD(b.end_date) || '',
    };

    try {
      const res = await fetchWithTimeout(url, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      }, 10000);
      const text = await res.text();
      if (!res.ok) { showErrorAlert(text || `HTTP ${res.status} ${res.statusText}`); return; }
      await loadAll();
    } catch (e) {
      console.error(e);
      showErrorAlert(e?.message || e);
    }
  };

  /* ===== confirmEnable(): reactivation ===== */
  const confirmEnable = async () => {
    const b = enableTarget;
    if (!b) return;

    // validation
    if (enableStart && enableEnd && new Date(enableStart) > new Date(enableEnd)) {
      showErrorAlert('Start date must be before or equal to End date', 'Invalid dates');
      return;
    }

    const uid = Number(userId);
    if (!Number.isFinite(uid) || uid <= 0) {
      showErrorAlert('user_id missing for this business');
      return;
    }

    const originalStart = toYMD(b.start_date) || enableStart;
    const originalEnd = toYMD(b.end_date) || enableEnd;

    const datesChanged =
      !!enableStart &&
      !!enableEnd &&
      (enableStart !== originalStart || enableEnd !== originalEnd);

    const endDatePassed = new Date(enableEnd) < new Date(todayISO());
    if (endDatePassed) {
      Alert.alert(
        'Invalid End Date',
        'The selected end date has already passed. Please select a valid future date.'
      );
      return; // 🚫 stop here — do not charge or enable
    }

    const shouldCharge = datesChanged && new Date(enableEnd) >= new Date(todayISO());

    try {
      let totalAmount = null;
      if (shouldCharge) {
        totalAmount = await fetchTotalAmount(enableStart, enableEnd, { skipValidation: true });
      }

      const startStr = ymdToMySQLDate(enableStart);
      const endStr = ymdToMySQLDate(enableEnd);

      const url = `${baseReactivate}/${encodeURIComponent(b.id)}`;
      const payload = {
        user_id: uid,
        start_date: startStr,
        end_date: endStr,
        is_active: 1,
      };

      if (shouldCharge && Number.isFinite(totalAmount)) {
        payload.total_amount = totalAmount;
      }

      const res = await fetchWithTimeout(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }, 10000);

      const text = await res.text();
      let json = {};
      try { json = text ? JSON.parse(text) : {}; } catch { }

      if (!res.ok || json?.success === false) {
        showErrorAlert(text || json || 'Failed to activate');
        return;
      }

      if (json?.payment || json?.message) {
        showBannerPaymentAlert(json, { isEdit: true });
      } else {
        Alert.alert(
          'Success',
          datesChanged
            ? 'Banner reactivated successfully.'
            : 'Banner reactivated with no extra charge.'
        );
      }

      setEnableSheetOpen(false);
      setEnableTarget(null);
      await loadAll();
    } catch (e) {
      console.error(e);
      showErrorAlert(e?.message || e);
    }
  };


  /* ------------- image picking ------------- */
  const pickImage = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') {
        showErrorAlert('Please allow photo library access to upload an image.', 'Permission needed');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.9,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri) return;
      setForm((s) => ({ ...s, _localImage: asset, banner_image: '' }));
    } catch (e) {
      console.error(e);
      showErrorAlert(e?.message || e, 'Image Error');
    }
  };

  const removePickedImage = () => setForm((s) => ({
    ...s,
    _localImage: null,
    banner_image: '',
  }));

  /* ------------- render row ------------- */
  const renderBanner = ({ item }) => {
    const img = buildBannerImg(item.banner_image);
    const active = Number(item.is_active) === 1;
    const showInactive = isInactive(item);
    const days = computeDaysFor(item);
    const amount = computeAmountFor(item); // null if basePrice missing

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Image source={{ uri: img }} style={styles.thumb} />
          <View style={{ flex: 1, marginHorizontal: 10 }}>
            <Text style={styles.cardTitle} numberOfLines={1}>{item.title || '—'}</Text>
            <Text style={styles.meta} numberOfLines={2}>{item.description || '—'}</Text>
          </View>
          <View>
            <View style={[styles.badge, { backgroundColor: showInactive ? '#f3f4f6' : '#e8f5e9' }]}>
              <Text style={[styles.badgeText, { color: showInactive ? '#334155' : '#166534' }]}>
                {showInactive ? 'Inactive' : 'Active'}
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.rowBetween, { marginTop: 8 }]}>
          <Text style={styles.meta}>Start: {toHuman(item.start_date)}</Text>
          <Text style={styles.meta}>End: {toHuman(item.end_date)}</Text>
        </View>

        {/* Days & Amount (or "Paid: Nu. X" when inactive/expired) */}
        <View style={[styles.rowBetween, { marginTop: 6 }]}>
          <View style={[styles.badge, { backgroundColor: '#eef2ff' }]}>
            <Text style={[styles.badgeText, { color: '#3730a3' }]}>
              Days Active: {days || '—'}
            </Text>
          </View>

          {showInactive ? (
            <View style={[styles.badge, { backgroundColor: '#ecfeff' }]}>
              <Text style={[styles.badgeText, { color: '#0369a1' }]}>
                Paid: {Number.isFinite(amount) ? currency(amount) : (basePriceLoading ? '…' : '—')}
              </Text>
            </View>
          ) : (
            <View style={[styles.badge, { backgroundColor: '#ecfeff' }]}>
              <Text style={[styles.badgeText, { color: '#0369a1' }]}>
                Amount: {Number.isFinite(amount) ? currency(amount) : (basePriceLoading ? '…' : '—')}
              </Text>
            </View>
          )}
        </View>

        <View style={[styles.rowBetween, { marginTop: 10 }]}>
          <View className="row" style={styles.row}>
            <Text style={styles.meta}>Enabled</Text>
            <Switch
              value={active}
              onValueChange={() => toggleActive(item)}
              trackColor={{ false: '#cbd5e1', true: '#86efac' }}
              thumbColor={active ? '#16a34a' : '#f8fafc'}
            />
          </View>
          <View style={styles.row}>
            {showInactive && (
              <TouchableOpacity
                style={[styles.iconBtn, { marginRight: 10 }]}
                onPress={() => {
                  setEnableTarget(item);
                  setEnableStart(toYMD(item.start_date) || todayISO());
                  setEnableEnd(toYMD(item.end_date) || addDaysYMD(new Date(), 7));
                  setEnableSheetOpen(true);
                }}
              >
                <Feather name="rotate-ccw" size={16} color="#a16207" />
                <Text style={[styles.iconBtnText, { color: '#a16207' }]}>
                  Reactivate
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.iconBtn} onPress={() => openEdit(item)}>
              <Feather name="edit-2" size={16} color="#334155" />
              <Text style={styles.iconBtnText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.iconBtn, { marginLeft: 10 }]} onPress={() => remove(item.id)}>
              <Feather name="trash-2" size={16} color="#be123c" />
              <Text style={[styles.iconBtnText, { color: '#be123c' }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  /* ------------- UI ------------- */
  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { fontSize: textSizeTitle }]}>Promo Banners</Text>
      <Text style={[styles.sub, { fontSize: textSizeSub }]}>
        {businessId ? `Banners for business #${businessId}` : 'Select a business to view banners'}
      </Text>

      <View style={styles.toolbar}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={18} color="#64748b" />
          <TextInput
            placeholder="Search title or description"
            placeholderTextColor="#94a3b8"
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
          />
          {query ? (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={18} color="#94a3b8" />
            </TouchableOpacity>
          ) : null}
        </View>

        <TouchableOpacity
          style={[styles.newBtn, { opacity: businessId ? 1 : 0.4 }]}
          onPress={openCreate}
          disabled={!businessId}
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.newBtnText}>New</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator />
          <Text style={{ color: '#475569', marginTop: 8 }}>Loading…</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderBanner}
          contentContainerStyle={{ paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="image-outline" size={28} color="#94a3b8" />
              <Text style={styles.emptyTitle}>No banners yet</Text>
              <Text style={styles.emptySub}>Create your first banner to promote offers.</Text>
              <TouchableOpacity
                style={[styles.newBtn, { marginTop: 10, opacity: businessId ? 1 : 0.4 }]}
                onPress={openCreate}
                disabled={!businessId}
              >
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={styles.newBtnText}>Create Banner</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {/* Create / Edit Modal */}
      <Modal
        visible={modalOpen}
        animationType="slide"
        transparent
        presentationStyle="overFullScreen"
        onRequestClose={() => setModalOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setModalOpen(false)} />
        <View style={styles.modalWrap}>
          <KeyboardAvoidingView
            style={{ flex: 1, justifyContent: 'flex-end' }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 0}
          >
            <View style={styles.sheet}>
              {/* Fixed header */}
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>{form.id ? 'Edit Banner' : 'New Banner'}</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalOpen(false)}>
                    <Ionicons name="close" size={16} color="#111827" />
                    <Text style={styles.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.saveBtn,
                      { opacity: (form.start_date && form.end_date && (form._localImage || form.banner_image || form.id)) ? 1 : 0.6 }
                    ]}
                    onPress={save}
                    disabled={!(form.start_date && form.end_date && (form._localImage || form.banner_image || form.id))}
                  >
                    <Ionicons name="checkmark" size={16} color="#fff" />
                    <Text style={styles.saveText}>{form.id ? 'Update' : 'Save'}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Scrollable content */}
              <ScrollView
                style={styles.modalScroll}
                contentContainerStyle={styles.sheetScroll}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {/* Live mini preview header */}
                <View style={styles.previewCard}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={styles.previewTitle} numberOfLines={2}>{form.title || 'Offer headline'}</Text>
                    <Text style={styles.previewDesc} numberOfLines={3}>{form.description || 'Short description of the banner'}</Text>
                    <View style={[styles.badge, { alignSelf: 'flex-start', backgroundColor: Number(form.is_active) ? '#e8f5e9' : '#f3f4f6', marginTop: 6 }]}>
                      <Text style={[styles.badgeText, { color: Number(form.is_active) ? '#166534' : '#334155' }]}>
                        {Number(form.is_active) ? 'Active' : 'Paused'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.previewImageWrap}>
                    {(form._localImage || form.banner_image) ? (
                      <Image
                        source={{ uri: form._localImage ? form._localImage.uri : buildBannerImg(form.banner_image) }}
                        style={styles.previewImage}
                      />
                    ) : (
                      <View style={styles.previewImagePlaceholder}>
                        <Ionicons name="image" size={28} color="#86efac" />
                      </View>
                    )}
                  </View>
                </View>

                {/* Business ID (read-only) */}
                <Field label="Business ID">
                  <View style={styles.disabledInput}>
                    <Text style={styles.disabledInputText}>{String(form.business_id || '')}</Text>
                  </View>
                </Field>

                {/* Title */}
                <Field label="Title">
                  <TextInput
                    value={form.title}
                    onChangeText={(t) => setForm((s) => ({ ...s, title: t }))}
                    placeholder="Offer 100%"
                    placeholderTextColor="#94a3b8"
                    style={styles.input}
                    returnKeyType="next"
                  />
                </Field>

                {/* Description */}
                <Field label="Description">
                  <TextInput
                    value={form.description}
                    onChangeText={(t) => setForm((s) => ({ ...s, description: t }))}
                    placeholder="Back to school"
                    placeholderTextColor="#94a3b8"
                    style={[styles.input, { height: 100, textAlignVertical: 'top', paddingTop: 8 }]}
                    multiline
                  />
                </Field>

                {/* Image + Select together */}
                <Field label="Banner Image">
                  <View style={styles.imageRow}>
                    <View style={styles.imageThumbBox}>
                      {(form._localImage || form.banner_image) ? (
                        <Image
                          source={{ uri: form._localImage ? form._localImage.uri : buildBannerImg(form.banner_image) }}
                          style={styles.imageThumb}
                        />
                      ) : (
                        <View style={styles.imageThumbEmpty}>
                          <Ionicons name="image" size={22} color="#86efac" />
                        </View>
                      )}
                    </View>

                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity style={styles.pickBtn} onPress={pickImage}>
                          <Ionicons name="image" size={16} color="#065f46" />
                          <Text style={styles.pickBtnText}>{(form._localImage || form.banner_image) ? 'Change Image' : 'Select Image'}</Text>
                        </TouchableOpacity>
                        {(form._localImage || form.banner_image) ? (
                          <TouchableOpacity style={styles.removeBtn} onPress={removePickedImage}>
                            <Ionicons name="trash" size={14} color="#fff" />
                            <Text style={styles.removeBtnText}>Remove</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                      <Text style={[styles.meta, { marginTop: 6 }]} numberOfLines={1}>
                        {form._localImage ? (form._localImage.fileName || 'Selected image') :
                          (form.banner_image ? form.banner_image : 'No image selected')}
                      </Text>
                    </View>
                  </View>
                </Field>

                {/* Active */}
                <Field label="Active">
                  <View style={styles.row}>
                    <Switch
                      value={Number(form.is_active) === 1}
                      onValueChange={(v) => setForm((s) => ({ ...s, is_active: v ? 1 : 0 }))}
                      trackColor={{ false: '#cbd5e1', true: '#86efac' }}
                      thumbColor={Number(form.is_active) === 1 ? '#16a34a' : '#f8fafc'}
                    />
                    <Text style={[styles.meta, { marginLeft: 8, color: Number(form.is_active) ? '#166534' : '#64748b' }]}>
                      {Number(form.is_active) ? 'Enabled' : 'Disabled'}
                    </Text>
                  </View>
                </Field>

                {/* Dates */}
                <View style={styles.grid2}>
                  <Field label="Start date">
                    <TouchableOpacity
                      style={[styles.dateBtnGreen, endNotEndedEdit && styles.dateBtnDisabled]}
                      onPress={() => !endNotEndedEdit && setShowStartPicker(true)}
                      disabled={endNotEndedEdit}
                    >
                      <Ionicons name="calendar" size={14} color="#065f46" />
                      <Text style={styles.dateBtnTextGreen}>{form.start_date || 'Pick a date'}</Text>
                    </TouchableOpacity>
                  </Field>
                  <Field label="End date">
                    <TouchableOpacity
                      style={[styles.dateBtnGreen, endNotEndedEdit && styles.dateBtnDisabled]}
                      onPress={() => !endNotEndedEdit && setShowEndPicker(true)}
                      disabled={endNotEndedEdit}
                    >
                      <Ionicons name="calendar" size={14} color="#065f46" />
                      <Text style={styles.dateBtnTextGreen}>{form.end_date || 'Pick a date'}</Text>
                    </TouchableOpacity>
                  </Field>
                </View>

                {endNotEndedEdit && (
                  <Text style={[styles.meta, { marginTop: 6, color: '#b45309' }]}>
                    End date has not passed yet – dates cannot be edited.
                  </Text>
                )}

                {/* LIVE: Amount under dates */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20, marginTop: 12 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#0f172a' }}>
                    Days Active: {draftDays || '—'}
                  </Text>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#0f172a' }}>
                    Amount: {Number.isFinite(draftAmount) ? currency(draftAmount) : (basePriceLoading ? 'Calculating…' : '—')}
                  </Text>
                </View>

                {/* Date pickers */}
                {showStartPicker && (
                  <DateTimePicker
                    value={form.start_date ? new Date(form.start_date) : new Date()}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(e, d) => { setShowStartPicker(false); if (d) setForm((s) => ({ ...s, start_date: toYMD(d) })); }}
                    themeVariant="light"
                  />
                )}
                {showEndPicker && (
                  <DateTimePicker
                    value={form.end_date ? new Date(form.end_date) : new Date()}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(e, d) => { setShowEndPicker(false); if (d) setForm((s) => ({ ...s, end_date: toYMD(d) })); }}
                    themeVariant="light"
                  />
                )}
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Enable with dates sheet */}
      <Modal visible={enableSheetOpen} animationType="slide" transparent onRequestClose={() => setEnableSheetOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setEnableSheetOpen(false)} />
        <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', android: undefined })} style={styles.modalWrap}>
          <View style={styles.sheet}>
            <View className="sheetHeader" style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Activate Banner</Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setEnableSheetOpen(false)}>
                  <Ionicons name="close" size={16} color="#111827" />
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={confirmEnable}>
                  <Ionicons name="checkmark" size={16} color="#fff" />
                  <Text style={styles.saveText}>
                    {reactivateDatesChanged && Number.isFinite(enableAmount)
                      ? `Activate • ${currency(enableAmount)}`
                      : 'Activate'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.grid2}>
              <Field label="Start date">
                <TouchableOpacity
                  style={[styles.dateBtnGreen, endNotEndedReactivate && styles.dateBtnDisabled]}
                  onPress={() => !endNotEndedReactivate && setShowEnableStartPicker(true)}
                  disabled={endNotEndedReactivate}
                >
                  <Ionicons name="calendar" size={14} color="#065f46" />
                  <Text style={styles.dateBtnTextGreen}>{enableStart || 'Pick a date'}</Text>
                </TouchableOpacity>
              </Field>
              <Field label="End date">
                <TouchableOpacity
                  style={[styles.dateBtnGreen, endNotEndedReactivate && styles.dateBtnDisabled]}
                  onPress={() => !endNotEndedReactivate && setShowEnableEndPicker(true)}
                  disabled={endNotEndedReactivate}
                >
                  <Ionicons name="calendar" size={14} color="#065f46" />
                  <Text style={styles.dateBtnTextGreen}>{enableEnd || 'Pick a date'}</Text>
                </TouchableOpacity>
              </Field>
            </View>

            {endNotEndedReactivate && (
              <Text style={[styles.meta, { marginTop: 6, color: '#b45309' }]}>
                End date has not passed yet – dates cannot be edited. Reactivation will not charge extra.
              </Text>
            )}

            {/* LIVE: Amount for reactivate */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20, marginTop: 12 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#0f172a' }}>
                Days: {enableDays || '—'}
              </Text>
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#0f172a' }}>
                Amount{' '}
                {reactivateDatesChanged && Number.isFinite(enableAmount)
                  ? currency(enableAmount)
                  : 'No extra charge'}
              </Text>
            </View>

            {showEnableStartPicker && (
              <DateTimePicker
                value={enableStart ? new Date(enableStart) : new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(e, d) => { setShowEnableStartPicker(false); if (d) setEnableStart(toYMD(d)); }}
                themeVariant="light"
              />
            )}
            {showEnableEndPicker && (
              <DateTimePicker
                value={enableEnd ? new Date(enableEnd) : new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(e, d) => { setShowEnableEndPicker(false); if (d) setEnableEnd(toYMD(d)); }}
                themeVariant="light"
              />
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

/* ================ small UI bits ================ */
function Field({ label, children }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

/* ================ styles ================ */
const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 16, flex: 1, backgroundColor: '#f8fafc' },
  title: { fontWeight: '700', color: '#0f172a' },
  sub: { color: '#64748b', marginTop: 6 },

  toolbar: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 10 },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#ffffff', borderRadius: 12, paddingHorizontal: 10, height: 40,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  searchInput: { flex: 1, color: '#0f172a', paddingVertical: 8 },

  newBtn: {
    backgroundColor: '#16a34a', height: 40, paddingHorizontal: 12, borderRadius: 12,
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  newBtnText: { color: '#fff', fontWeight: '700' },

  card: { backgroundColor: '#fff', borderRadius: 14, padding: 12, marginTop: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  cardTitle: { fontWeight: '800', color: '#0f172a', fontSize: 15 },

  thumb: { width: 56, height: 56, borderRadius: 10, backgroundColor: '#f1f5f9' },
  badge: { paddingHorizontal: 8, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  badgeText: { fontSize: 11, fontWeight: '800' },

  row: { flexDirection: 'row', alignItems: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  meta: { fontSize: 12, color: '#64748b' },

  iconBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' },
  iconBtnText: { fontSize: 12, color: '#334155', fontWeight: '700' },

  empty: { alignItems: 'center', marginTop: 32 },
  emptyTitle: { marginTop: 8, fontSize: 16, fontWeight: '800', color: '#0f172a' },
  emptySub: { color: '#64748b', marginTop: 4, textAlign: 'center' },

  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.3)' },
  modalWrap: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 16,
    borderTopRightRadius: 16, padding: 16,
    borderTopWidth: 1, borderColor: '#e2e8f0'
  },
  sheetHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center'
  },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  modalScroll: { maxHeight: '89%' },
  sheetScroll: { paddingBottom: 24 },

  fieldLabel: { fontSize: 12, color: '#475569', marginBottom: 6, fontWeight: '700' },
  input: {
    height: 40, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 10, color: '#0f172a', backgroundColor: '#fff',
  },

  disabledInput: {
    height: 40, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 10, backgroundColor: '#f1f5f9', justifyContent: 'center',
  },
  disabledInputText: { color: '#475569', fontWeight: '700' },

  grid2: { flexDirection: 'row', gap: 8 },

  previewCard: {
    marginTop: 8, borderRadius: 12, overflow: 'hidden',
    borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff', flexDirection: 'row', padding: 12,
  },
  previewTitle: { fontSize: 16, fontWeight: '900', color: '#0f172a' },
  previewDesc: { fontSize: 12, color: '#475569', marginTop: 4 },
  previewImageWrap: { width: 120, height: 90, borderRadius: 10, overflow: 'hidden', backgroundColor: '#dcfce7', position: 'relative' },
  previewImage: { width: '100%', height: '100%' },
  previewImagePlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Inline "Image + Select" field
  imageRow: { flexDirection: 'row', alignItems: 'center' },
  imageThumbBox: { width: 64, height: 64, borderRadius: 10, overflow: 'hidden', backgroundColor: '#dcfce7' },
  imageThumb: { width: '100%', height: '100%' },
  imageThumbEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  pickBtn: {
    backgroundColor: '#ecfdf5', borderColor: '#86efac', borderWidth: 1,
    height: 40, paddingHorizontal: 12, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  pickBtnText: { color: '#065f46', fontWeight: '700', fontSize: 12 },

  removeBtn: {
    backgroundColor: '#b91c1c',
    height: 40, paddingHorizontal: 12, borderRadius: 10,
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  removeBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },

  dateBtnGreen: {
    height: 40, borderRadius: 10, borderWidth: 1, borderColor: '#86efac', paddingHorizontal: 10,
    backgroundColor: '#dcfce7', alignItems: 'center', flexDirection: 'row', gap: 6,
  },
  dateBtnTextGreen: { color: '#065f46', fontWeight: '700', fontSize: 12 },
  dateBtnDisabled: {
    opacity: 0.5,
  },

  cancelBtn: {
    height: 36, paddingHorizontal: 12,
    borderRadius: 10, backgroundColor: '#f1f5f9',
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginLeft: 8
  },
  cancelText: { color: '#111827', fontWeight: '700', fontSize: 12 },

  saveBtn: {
    height: 36, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#16a34a',
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 12 },
});
 