// PromosTab.js — Fetch ALL banners (GET BANNERS_ENDPOINT) + CRUD (PUT/DELETE), image upload, green theme
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  Switch,
  Modal,
  Pressable,
  Platform,
  KeyboardAvoidingView,
  Alert,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  BANNERS_ENDPOINT,
  CREATE_BANNER_ENDPOINT,
  UPDATE_BANNER_ENDPOINT,
  BANNERS_BY_BUSINESS_ENDPOINT, 
  BANNERS_IMAGE_ENDPOINT,
} from '@env';

/** ====== Helpers ====== */
const toHuman = (d) => (d ? new Date(d).toDateString() : '—');
const isHttpLike = (s='') => /^https?:\/\//i.test(String(s));
const toYMD = (dateLike) => {
  if (!dateLike) return '';
  const d = typeof dateLike === 'string' ? new Date(dateLike) : dateLike;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};
const addDaysYMD = (dateLike, days=0) => {
  const d = typeof dateLike === 'string' ? new Date(dateLike) : new Date(dateLike);
  const base = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  base.setDate(base.getDate() + days);
  return toYMD(base);
};
const todayISO = () => new Date().toISOString().slice(0, 10);
function originFrom(url) { try { return new URL(url).origin; } catch { return ''; } }
const hostOnly = (u='') => { try { return new URL(u).origin; } catch { return ''; } };

// collapse duplicate /uploads and double slashes (not after http:)
const sanitizePath = (p='') =>
  String(p)
    .replace(/^\/(merchant\/)?uploads\/uploads\//i, '/$1uploads/')
    .replace(/([^:]\/)\/+/g, '$1');

// encode only path segments, not the protocol/host
const encodePathSegments = (p='') =>
  String(p).split('/').map(seg => (seg ? encodeURIComponent(seg) : '')).join('/');

// join base + path safely
const absJoin = (base='', raw='') => {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (isHttpLike(s)) return s;

  const baseNorm = String((base || '').replace(/\/+$/, ''));
  let path = s.startsWith('/') ? s : `/${s}`;

  // If base already ends with /merchant/uploads and path starts with it too, drop duplicate from path
  if (/\/merchant\/uploads$/i.test(baseNorm) && /^\/merchant\/uploads\//i.test(path)) {
    path = path.replace(/^\/merchant\/uploads/i, '');
  }
  path = sanitizePath(path);
  const encoded = encodePathSegments(path);
  return `${baseNorm}${encoded.startsWith('/') ? '' : '/'}${encoded}`.replace(/([^:]\/)\/+/g, '$1');
};

/**
 * Build a correct banner image URL:
 * - Prefer BANNERS_IMAGE_ENDPOINT if provided
 * - Else fall back to origin of BANNERS_BY_BUSINESS_ENDPOINT or BANNERS_ENDPOINT
 * - If API returns "/uploads/..." but server serves under "/merchant/uploads/...", prefix "/merchant" once
 */
const buildBannerImg = (rawPath) => {
  if (!rawPath) return '';
  if (isHttpLike(rawPath)) return rawPath;

  const baseHost =
    hostOnly(BANNERS_IMAGE_ENDPOINT) ||
    originFrom(BANNERS_BY_BUSINESS_ENDPOINT || '') ||
    originFrom(BANNERS_ENDPOINT || '') ||
    '';

  // decide if we need `/merchant` prefix by inspecting endpoints
  const needsMerchant =
    /\/merchant(\/|$)/i.test(String(BANNERS_BY_BUSINESS_ENDPOINT || '')) ||
    /\/merchant(\/|$)/i.test(String(BANNERS_ENDPOINT || ''));

  let path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;

  // If server expects /merchant/uploads but API gave /uploads, add /merchant once
  if (needsMerchant && /^\/uploads\//i.test(path) && !/^\/merchant\//i.test(path)) {
    path = `/merchant${path}`;
  }

  return absJoin(baseHost, path);
};

// Inactive = explicitly disabled OR expired (end_date <= today)
const isInactive = (b) => {
  const disabled = Number(b.is_active) !== 1;
  const expired = b?.end_date ? String(b.end_date).slice(0,10) <= todayISO() : false;
  return disabled || expired;
};

const emptyForm = (business_id = 0, ownerType='food') => ({
  id: null,
  business_id,
  owner_type: ownerType,
  title: '',
  description: '',
  banner_image: '',
  is_active: 1,
  start_date: '',
  end_date: '',
  _localImage: null, // { uri, fileName? }
});

// simple timeout wrapper => clearer errors than “Network request failed”
const fetchWithTimeout = (url, options = {}, ms = 10000) =>
  Promise.race([
    fetch(url, options),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Request to ${url} timed out after ${ms}ms`)), ms)),
  ]);

// bases for create/update
const baseUpdate = (UPDATE_BANNER_ENDPOINT || BANNERS_ENDPOINT).replace(/\/$/, '');
const baseCreate = (CREATE_BANNER_ENDPOINT || BANNERS_ENDPOINT).replace(/\/$/, '');

// majority helper
function mostCommonOwnerType(arr) {
  const counts = arr.reduce((m, b) => {
    const ot = String(b?.owner_type || '').trim().toLowerCase();
    if (!ot) return m;
    m[ot] = (m[ot] || 0) + 1;
    return m;
  }, {});
  let best = '';
  let n = -1;
  Object.entries(counts).forEach(([k, v]) => { if (v > n) { best = k; n = v; }});
  return best || '';
}

/** ====== Main ====== */
export default function PromosTab({
  businessId: businessIdProp,   // ← pass from parent if you have it
  ownerType: ownerTypeProp,     // ← pass from parent to force owner type
  isTablet
}) {
  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Dynamic business id (toolbar switcher). Seed with prop or 0.
  const [businessId, setBusinessId] = useState(Number(businessIdProp ?? 0) || 0);
  const [businessIdDraft, setBusinessIdDraft] = useState(String(Number(businessIdProp ?? 0) || 0));

  // Resolved owner type for this business
  const [resolvedOwnerType, setResolvedOwnerType] = useState(
    String(ownerTypeProp || '').trim().toLowerCase() || 'food'
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(() => emptyForm(Number(businessIdProp ?? 0) || 0, resolvedOwnerType));
  const [query, setQuery] = useState('');

  // Enable-with-dates sheet
  const [enableSheetOpen, setEnableSheetOpen] = useState(false);
  const [enableTarget, setEnableTarget] = useState(null); // banner being enabled
  const [enableStart, setEnableStart] = useState('');
  const [enableEnd, setEnableEnd] = useState('');
  const [showEnableStartPicker, setShowEnableStartPicker] = useState(false);
  const [showEnableEndPicker, setShowEnableEndPicker] = useState(false);

  // Date pickers for create/edit
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const textSizeTitle = isTablet ? 18 : 16;
  const textSizeSub = isTablet ? 13 : 12;

  /** ====== LOAD for current business ====== */
  const loadAll = useCallback(async () => {
    if (!businessId) {
      setBanners([]);
      return;
    }
    setLoading(true);
    try {
      const base = (BANNERS_BY_BUSINESS_ENDPOINT || '').replace(/\/$/, '');
      if (base) {
        // Prefer server endpoint if provided
        const url = `${base}/${encodeURIComponent(businessId)}`;
        const res = await fetchWithTimeout(url);
        const raw = await res.text();
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} — ${raw || 'Failed to load banners'}`);
        const json = raw ? JSON.parse(raw) : [];
        const arr = Array.isArray(json) ? json : (Array.isArray(json.data) ? json.data : []);
        setBanners(arr);
        // Infer owner type if not forced by prop
        if (!ownerTypeProp) {
          const inferred = mostCommonOwnerType(arr) || 'food';
          setResolvedOwnerType(inferred);
        }
      } else {
        // Fallback: fetch all and filter client-side
        const res = await fetchWithTimeout(BANNERS_ENDPOINT);
        const raw = await res.text();
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} — ${raw || 'Failed to load banners'}`);
        const json = raw ? JSON.parse(raw) : [];
        const arr = Array.isArray(json) ? json : (Array.isArray(json.data) ? json.data : []);
        const filtered = arr.filter(b => Number(b.business_id) === Number(businessId));
        setBanners(filtered);
        if (!ownerTypeProp) {
          const inferred = mostCommonOwnerType(filtered) || 'food';
          setResolvedOwnerType(inferred);
        }
      }
    } catch (e) {
      console.error(e);
      Alert.alert(
        'Network error',
        `${String(e.message || e)}\n\n• Can the device reach the API in a browser?\n• Is the server bound to 0.0.0.0 and firewall open?\n• For Android emulator use 10.0.2.2 if needed.`
      );
    } finally {
      setLoading(false);
    }
  }, [businessId, ownerTypeProp]);

  // initial load + whenever businessId changes
  useEffect(() => { loadAll(); }, [loadAll]);

  // keep form in sync if businessId or ownerType changes while modal closed
  useEffect(() => {
    if (!modalOpen) {
      setForm(emptyForm(businessId, resolvedOwnerType));
    }
  }, [businessId, resolvedOwnerType, modalOpen]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const arr = banners;
    if (!q) return arr;
    return arr.filter(
      b =>
        (b.title || '').toLowerCase().includes(q) ||
        (b.description || '').toLowerCase().includes(q)
    );
  }, [banners, query]);

  /** ====== CRUD ====== */
  const openCreate = () => {
    // owner_type prefilled from resolvedOwnerType
    setForm(emptyForm(businessId, resolvedOwnerType));
    setModalOpen(true);
  };

  const openEdit = (b) => {
    setForm({
      id: b.id,
      business_id: Number(b.business_id ?? businessId),
      owner_type: String(b.owner_type || resolvedOwnerType).toLowerCase(),
      title: b.title ?? '',
      description: b.description ?? '',
      banner_image: b.banner_image ?? '',
      is_active: Number(b.is_active ?? 1),
      start_date: (b.start_date || '').slice(0, 10),
      end_date: (b.end_date || '').slice(0, 10),
      _localImage: null,
    });
    setModalOpen(true);
  };

  // Make dates OPTIONAL, and title OPTIONAL
  const validate = () => {
    if (!form.business_id) return 'Missing business_id';
    if (!String(form.owner_type || '').trim()) return 'owner_type is required (food/mart)';
    // Need either server path or picked image on CREATE (edit can keep existing)
    const isEdit = !!form.id;
    if (!isEdit && !(form.banner_image || form._localImage)) return 'Provide banner_image path or pick an image';
    // If both dates provided, ensure order
    if (form.start_date && form.end_date) {
      if (new Date(form.start_date) > new Date(form.end_date)) return 'Start date must be before or equal to End date';
    }
    return null;
  };

  const save = async () => {
    const err = validate();
    if (err) return Alert.alert('Missing', err);

    const isEdit = !!form.id;
    const url = isEdit ? `${baseUpdate}/${encodeURIComponent(form.id)}` : baseCreate;

    try {
      if (!isEdit) {
        // CREATE: multipart if picking file, else JSON
        if (form._localImage) {
          const fd = new FormData();
          fd.append('business_id', String(form.business_id));
          fd.append('owner_type', String(form.owner_type || ''));
          if (form.title) fd.append('title', form.title.trim());
          if (form.description) fd.append('description', form.description.trim());
          fd.append('is_active', String(Number(form.is_active) ? 1 : 0));
          if (form.start_date) fd.append('start_date', form.start_date);
          if (form.end_date) fd.append('end_date', form.end_date);

          const asset = form._localImage;
          const filename = asset?.fileName || asset?.uri?.split('/').pop() || `banner_${Date.now()}.jpg`;
          const ext = /\.(\w+)$/.exec(filename || '')?.[1]?.toLowerCase() || 'jpg';
          const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
          fd.append('banner_image', { uri: asset.uri, name: filename, type: mime });

          const res = await fetchWithTimeout(url, { method: 'POST', body: fd }, 15000);
          const text = await res.text();
          if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} — ${text || 'Create failed'}`);
        } else {
          // JSON create with a server path
          const payload = {
            business_id: Number(form.business_id),
            owner_type: String(form.owner_type || ''),
            title: (form.title || '').trim(),
            description: (form.description || '').trim(),
            banner_image: form.banner_image || '',
            is_active: Number(form.is_active) ? 1 : 0,
            start_date: form.start_date || '',
            end_date: form.end_date || '',
          };
          const res = await fetchWithTimeout(
            url,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
            12000
          );
          const text = await res.text();
          if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} — ${text || 'Create failed'}`);
        }
      } else {
        // UPDATE:
        if (form._localImage) {
          const fd = new FormData();
          fd.append('business_id', String(form.business_id));
          fd.append('owner_type', String(form.owner_type || ''));
          if (form.title) fd.append('title', form.title.trim());
          if (form.description) fd.append('description', form.description.trim());
          fd.append('is_active', String(Number(form.is_active) ? 1 : 0));
          if (form.start_date) fd.append('start_date', form.start_date);
          if (form.end_date) fd.append('end_date', form.end_date);

          const asset = form._localImage;
          const filename = asset?.fileName || asset?.uri?.split('/').pop() || `banner_${Date.now()}.jpg`;
          const ext = /\.(\w+)$/.exec(filename || '')?.[1]?.toLowerCase() || 'jpg';
          const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
          fd.append('banner_image', { uri: asset.uri, name: filename, type: mime });

          const res = await fetchWithTimeout(url, { method: 'PUT', body: fd }, 15000);
          const text = await res.text();
          if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} — ${text || 'Update failed'}`);
        } else {
          const payload = {
            business_id: Number(form.business_id),
            owner_type: String(form.owner_type || ''),
            title: (form.title || '').trim(),
            description: (form.description || '').trim(),
            banner_image: form.banner_image || '',
            is_active: Number(form.is_active) ? 1 : 0,
            start_date: form.start_date || '',
            end_date: form.end_date || '',
          };
          const res = await fetchWithTimeout(
            url,
            { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
            12000
          );
          const text = await res.text();
          if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} — ${text || 'Update failed'}`);
        }
      }

      setModalOpen(false);
      setForm(emptyForm(form.business_id, resolvedOwnerType));
      await loadAll();
    } catch (e) {
      console.error(e);
      Alert.alert('Save Error', String(e.message || e));
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
            if (!res.ok) {
              const t = await res.text().catch(() => '');
              throw new Error(t || 'Delete failed');
            }
            await loadAll();
          } catch (e) {
            console.error(e);
            Alert.alert('Error', String(e.message || e));
          }
        },
      },
    ]);
  };

  // When turning ON, ask for dates then PUT; when turning OFF, just PUT is_active=0
  const toggleActive = async (b) => {
    const next = Number(b.is_active) ? 0 : 1;
    if (next === 1) {
      // open enable sheet with default dates
      setEnableTarget(b);
      setEnableStart(toYMD(b.start_date) || todayISO());
      setEnableEnd(toYMD(b.end_date) || addDaysYMD(new Date(), 7));
      setEnableSheetOpen(true);
      return;
    }

    // turning OFF: keep dates, set is_active=0
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
      const res = await fetchWithTimeout(
        url,
        { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
        10000
      );
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} — ${text || 'Failed to update status'}`);
      await loadAll();
    } catch (e) {
      console.error(e);
      Alert.alert('Error', String(e.message || e));
    }
  };

  // Confirm from enable sheet
  const confirmEnable = async () => {
    const b = enableTarget;
    if (!b) return;

    // Validate ordering if both set
    if (enableStart && enableEnd && new Date(enableStart) > new Date(enableEnd)) {
      Alert.alert('Invalid dates', 'Start date must be before or equal to End date');
      return;
    }

    const url = `${baseUpdate}/${encodeURIComponent(b.id)}`;
    const payload = {
      business_id: Number(b.business_id ?? businessId),
      owner_type: String((b.owner_type || '').toLowerCase() || resolvedOwnerType),
      title: b.title ?? '',
      description: b.description ?? '',
      banner_image: b.banner_image ?? '',
      is_active: 1,
      start_date: enableStart || '',
      end_date: enableEnd || '',
    };

    try {
      const res = await fetchWithTimeout(
        url,
        { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
        10000
      );
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} — ${text || 'Failed to activate'}`);
      setEnableSheetOpen(false);
      setEnableTarget(null);
      await loadAll();
    } catch (e) {
      console.error(e);
      Alert.alert('Error', String(e.message || e));
    }
  };

  /** ====== Image Picking ====== */
  const pickImage = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') {
        return Alert.alert('Permission needed', 'Please allow photo library access to upload an image.');
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.9,
      });

      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri) return;
      setForm((s) => ({ ...s, _localImage: asset, banner_image: '' })); // clear server path if picking new
    } catch (e) {
      console.error(e);
      Alert.alert('Image Error', String(e.message || e));
    }
  };

  const removePickedImage = () => {
    setForm((s) => ({ ...s, _localImage: null, banner_image: '' }));
  };

  /** ====== Render row ====== */
  const renderBanner = ({ item }) => {
    const img = buildBannerImg(item.banner_image);
    const active = Number(item.is_active) === 1;
    const showInactive = isInactive(item);
    const owner = String(item.owner_type || '').toLowerCase();

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Image source={{ uri: img }} style={styles.thumb} />
          <View style={{ flex: 1, marginHorizontal: 10 }}>
            <Text style={styles.cardTitle} numberOfLines={1}>{item.title || '—'}</Text>
            <Text style={styles.meta} numberOfLines={2}>{item.description || '—'}</Text>
          </View>

          {/* Badges */}
          <View>
            {!!owner && (
              <View style={[styles.badge, { backgroundColor: owner === 'food' ? '#bae6fd' : '#bbf7d0', marginBottom: 6 }]}>
                <Text style={[styles.badgeText, { color: owner === 'food' ? '#0c4a6e' : '#14532d' }]}>
                  {owner}
                </Text>
              </View>
            )}
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

        <View style={[styles.rowBetween, { marginTop: 10 }]}>
          <View style={styles.row}>
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
              <TouchableOpacity style={[styles.iconBtn, { marginRight: 10 }]} onPress={() => {
                // quick reactivate: default +7 days relative to end or today
                setEnableTarget(item);
                setEnableStart(toYMD(item.start_date) || todayISO());
                setEnableEnd(toYMD(item.end_date) || addDaysYMD(new Date(), 7));
                setEnableSheetOpen(true);
              }}>
                <Feather name="rotate-ccw" size={16} color="#a16207" />
                <Text style={[styles.iconBtnText, { color: '#a16207' }]}>Reactivate</Text>
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

  /** ====== UI ====== */
  return (
    <View style={styles.wrap}>
      {/* Header */}
      <Text style={[styles.title, { fontSize: textSizeTitle }]}>Promo Banners</Text>
      <Text style={[styles.sub, { fontSize: textSizeSub }]}>
        {businessId ? `Banners for business #${businessId}` : 'Select a business to view banners'}
      </Text>

      {/* Toolbar */}
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

      {/* Owner type hint */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 }}>
        <Text style={styles.meta}>Owner type:</Text>
        <View style={[styles.badge, { backgroundColor: resolvedOwnerType === 'food' ? '#bae6fd' : '#bbf7d0' }]}>
          <Text style={[styles.badgeText, { color: resolvedOwnerType === 'food' ? '#0c4a6e' : '#14532d' }]}>
            {resolvedOwnerType}
          </Text>
        </View>
      </View>

      {/* List */}
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
      <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={() => setModalOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setModalOpen(false)} />
        <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', android: undefined })} style={styles.modalWrap}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{form.id ? 'Edit Banner' : 'New Banner'}</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalOpen(false)}>
                  <Ionicons name="close" size={16} color="#111827" />
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, { opacity: (form.banner_image || form._localImage || form.id) ? 1 : 0.6 }]}
                  onPress={save}
                  disabled={!(form.banner_image || form._localImage || form.id)}
                >
                  <Ionicons name="checkmark" size={16} color="#fff" />
                  <Text style={styles.saveText}>{form.id ? 'Update' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Live preview */}
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
                  <>
                    <Image
                      source={{ uri: form._localImage ? form._localImage.uri : buildBannerImg(form.banner_image) }}
                      style={styles.previewImage}
                    />
                    {/* Remove button over the image */}
                    <TouchableOpacity style={styles.removeImgBtn} onPress={removePickedImage}>
                      <Ionicons name="trash" size={14} color="#fff" />
                      <Text style={styles.removeImgText}>Remove</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <View style={styles.previewImagePlaceholder}>
                    <Ionicons name="image" size={28} color="#86efac" />
                  </View>
                )}
              </View>
            </View>

            {/* Fields */}
            <Field label="Business ID">
              <TextInput
                value={String(form.business_id)}
                onChangeText={(t) => setForm((s) => ({ ...s, business_id: t.replace(/[^0-9]/g, '') }))}
                placeholder="e.g., 4"
                placeholderTextColor="#94a3b8"
                keyboardType="numeric"
                style={styles.input}
              />
            </Field>

            {/* Owner Type selector (no typing) */}
            <Field label="Owner Type">
              <View style={styles.ownerTypeSwitch}>
                {['food','mart'].map((opt) => {
                  const active = form.owner_type === opt;
                  return (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.ownerPill, active && styles.ownerPillActive]}
                      onPress={() => setForm((s)=>({ ...s, owner_type: opt }))}
                    >
                      <Text style={[styles.ownerPillText, active && styles.ownerPillTextActive]}>
                        {opt.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={[styles.meta, { marginTop: 6 }]}>
                Prefilled from current business: <Text style={{ fontWeight: '800', color: '#065f46' }}>{resolvedOwnerType}</Text>
              </Text>
            </Field>

            <Field label="Title (optional)">
              <TextInput
                value={form.title}
                onChangeText={(t) => setForm((s) => ({ ...s, title: t }))}
                placeholder="Offer 100%"
                placeholderTextColor="#94a3b8"
                style={styles.input}
              />
            </Field>

            <Field label="Description (optional)">
              <TextInput
                value={form.description}
                onChangeText={(t) => setForm((s) => ({ ...s, description: t }))}
                placeholder="Back to school"
                placeholderTextColor="#94a3b8"
                style={[styles.input, { height: 80, textAlignVertical: 'top', paddingTop: 8 }]}
                multiline
              />
            </Field>

            {/* Image */}
            <Field label="Banner Image">
              <View style={styles.rowBetween}>
                <TouchableOpacity style={styles.pickBtn} onPress={pickImage}>
                  <Ionicons name="image" size={16} color="#065f46" />
                  <Text style={styles.pickBtnText}>Pick from gallery</Text>
                </TouchableOpacity>
                <Text style={[styles.meta, { marginLeft: 8, flex: 1, textAlign: 'right' }]} numberOfLines={1}>
                  {form._localImage ? 'Selected image' : (form.banner_image ? form.banner_image : 'No image')}
                </Text>
              </View>
            </Field>

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

            <View style={styles.grid2}>
              <Field label="Start date (optional)">
                <TouchableOpacity style={styles.dateBtnGreen} onPress={() => setShowStartPicker(true)}>
                  <Ionicons name="calendar" size={14} color="#065f46" />
                  <Text style={styles.dateBtnTextGreen}>{form.start_date || 'Pick a date'}</Text>
                </TouchableOpacity>
              </Field>
              <Field label="End date (optional)">
                <TouchableOpacity style={styles.dateBtnGreen} onPress={() => setShowEndPicker(true)}>
                  <Ionicons name="calendar" size={14} color="#065f46" />
                  <Text style={styles.dateBtnTextGreen}>{form.end_date || 'Pick a date'}</Text>
                </TouchableOpacity>
              </Field>
            </View>

            {/* Native pickers */}
            {showStartPicker && (
              <DateTimePicker
                value={form.start_date ? new Date(form.start_date) : new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(e, d) => { setShowStartPicker(false); if (d) setForm((s)=>({ ...s, start_date: toYMD(d) })); }}
                themeVariant="light"
              />
            )}
            {showEndPicker && (
              <DateTimePicker
                value={form.end_date ? new Date(form.end_date) : new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(e, d) => { setShowEndPicker(false); if (d) setForm((s)=>({ ...s, end_date: toYMD(d) })); }}
                themeVariant="light"
              />
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Enable with dates sheet */}
      <Modal visible={enableSheetOpen} animationType="slide" transparent onRequestClose={() => setEnableSheetOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setEnableSheetOpen(false)} />
        <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', android: undefined })} style={styles.modalWrap}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Activate Banner</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setEnableSheetOpen(false)}>
                  <Ionicons name="close" size={16} color="#111827" />
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={confirmEnable}>
                  <Ionicons name="checkmark" size={16} color="#fff" />
                  <Text style={styles.saveText}>Activate</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.grid2}>
              <Field label="Start date">
                <TouchableOpacity style={styles.dateBtnGreen} onPress={() => setShowEnableStartPicker(true)}>
                  <Ionicons name="calendar" size={14} color="#065f46" />
                  <Text style={styles.dateBtnTextGreen}>{enableStart || 'Pick a date'}</Text>
                </TouchableOpacity>
              </Field>
              <Field label="End date">
                <TouchableOpacity style={styles.dateBtnGreen} onPress={() => setShowEnableEndPicker(true)}>
                  <Ionicons name="calendar" size={14} color="#065f46" />
                  <Text style={styles.dateBtnTextGreen}>{enableEnd || 'Pick a date'}</Text>
                </TouchableOpacity>
              </Field>
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

/** ====== Small UI bits ====== */
function Field({ label, children }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

/** ====== Styles ====== */
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

  applyBtn: {
    backgroundColor: '#0891b2',
    height: 40, width: 40, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },

  // GREEN primary  
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

  // Modal / Sheet
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.3)' },
  modalWrap: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, borderTopWidth: 1, borderColor: '#e2e8f0' },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },

  fieldLabel: { fontSize: 12, color: '#475569', marginBottom: 6, fontWeight: '700' },
  input: {
    height: 40, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 10, color: '#0f172a', backgroundColor: '#fff',
  },

  grid2: { flexDirection: 'row', gap: 8 },

  // Preview
  previewCard: {
    marginTop: 8, borderRadius: 12, overflow: 'hidden',
    borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff', flexDirection: 'row', padding: 12,
  },
  previewTitle: { fontSize: 16, fontWeight: '900', color: '#0f172a' },
  previewDesc: { fontSize: 12, color: '#475569', marginTop: 4 },
  previewImageWrap: { width: 120, height: 90, borderRadius: 10, overflow: 'hidden', backgroundColor: '#dcfce7', position: 'relative' },
  previewImage: { width: '100%', height: '100%' },
  previewImagePlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Remove image chip (on preview)
  removeImgBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(185,28,28,0.95)',
    paddingHorizontal: 8,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  removeImgText: { color: '#fff', fontWeight: '800', fontSize: 11 },

  // Upload button
  pickBtn: {
    backgroundColor: '#ecfdf5',
    borderColor: '#86efac',
    borderWidth: 1,
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pickBtnText: { color: '#065f46', fontWeight: '700', fontSize: 12 },

  // Date buttons (green)
  dateBtnGreen: {
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#86efac',
    paddingHorizontal: 10,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  dateBtnTextGreen: { color: '#065f46', fontWeight: '700', fontSize: 12 },

  // Save / Cancel buttons (top right of modal)
  cancelBtn: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cancelText: { color: '#111827', fontWeight: '700', fontSize: 12 },

  saveBtn: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#16a34a',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 12 },

  // Owner type pills
  ownerTypeSwitch: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    padding: 4,
    gap: 6,
  },
  ownerPill: {
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerPillActive: {
    backgroundColor: '#16a34a',
  },
  ownerPillText: { fontSize: 12, fontWeight: '800', color: '#0f172a' },
  ownerPillTextActive: { color: '#fff' },
});
