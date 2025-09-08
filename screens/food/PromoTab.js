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
  BANNERS_BY_BUSINESS_ENDPOINT, // not used here, but kept for easy swap
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
function originFrom(url) { try { return new URL(url).origin; } catch { return ''; } }
const ORIGIN = originFrom(BANNERS_ENDPOINT || CREATE_BANNER_ENDPOINT || UPDATE_BANNER_ENDPOINT || 'http://localhost:8080');
const joinImg = (p='') => (isHttpLike(p) ? p : `${ORIGIN}${p || ''}`);

const emptyForm = (business_id = 0) => ({
  id: null,
  business_id,
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

/** ====== Main ====== */
export default function PromosTab({ defaultBusinessId = 4, isTablet }) {
  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(() => emptyForm(defaultBusinessId));
  const [query, setQuery] = useState('');

  // Date pickers
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const textSizeTitle = isTablet ? 18 : 16;
  const textSizeSub = isTablet ? 13 : 12;

  /** ====== LOAD ALL (NO BUSINESS FILTER) ====== */
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithTimeout(BANNERS_ENDPOINT);
      const raw = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} — ${raw || 'Failed to load banners'}`);
      const json = raw ? JSON.parse(raw) : [];
      setBanners(Array.isArray(json) ? json : (Array.isArray(json.data) ? json.data : []));
    } catch (e) {
      console.error(e);
      Alert.alert(
        'Network error',
        `${String(e.message || e)}\n\n• Can the device reach ${BANNERS_ENDPOINT} in a browser?\n• Is the server bound to 0.0.0.0 and firewall open?\n• For Android emulator use 10.0.2.2 if needed.`
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return banners;
    return banners.filter(
      b =>
        (b.title || '').toLowerCase().includes(q) ||
        (b.description || '').toLowerCase().includes(q)
    );
  }, [banners, query]);

  /** ====== CRUD ====== */
  const openCreate = () => {
    setForm(emptyForm(defaultBusinessId));
    setModalOpen(true);
  };

  const openEdit = (b) => {
    setForm({
      id: b.id,
      business_id: b.business_id ?? defaultBusinessId,
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

  const validate = () => {
    if (!form.business_id) return 'Missing business_id';
    if (!form.title.trim()) return 'Title is required';
    if (!(form.banner_image || form._localImage)) return 'Please pick an image';
    if (!form.start_date) return 'Start date (YYYY-MM-DD) is required';
    if (!form.end_date) return 'End date (YYYY-MM-DD) is required';
    return null;
  };

  // CREATE (POST) and UPDATE (PUT)
  const save = async () => {
    const err = validate();
    if (err) return Alert.alert('Missing', err);

    const isEdit = !!form.id;
    const url = isEdit ? `${baseUpdate}/${encodeURIComponent(form.id)}` : baseCreate;

    try {
      if (!isEdit) {
        // CREATE: always multipart (image required)
        const fd = new FormData();
        fd.append('business_id', String(form.business_id));
        fd.append('title', form.title.trim());
        fd.append('description', form.description.trim());
        fd.append('is_active', String(Number(form.is_active) ? 1 : 0));
        fd.append('start_date', form.start_date);
        fd.append('end_date', form.end_date);

        const asset = form._localImage;
        const filename = asset?.fileName || asset?.uri?.split('/').pop() || `banner_${Date.now()}.jpg`;
        const ext = /\.(\w+)$/.exec(filename || '')?.[1]?.toLowerCase() || 'jpg';
        const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
        fd.append('banner_image', { uri: asset.uri, name: filename, type: mime });

        const res = await fetchWithTimeout(url, { method: 'POST', body: fd }, 15000);
        const text = await res.text();
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} — ${text || 'Create failed'}`);
      } else {
        // UPDATE:
        if (form._localImage) {
          // Image changed → PUT multipart
          const fd = new FormData();
          fd.append('business_id', String(form.business_id));
          fd.append('title', form.title.trim());
          fd.append('description', form.description.trim());
          fd.append('is_active', String(Number(form.is_active) ? 1 : 0));
          fd.append('start_date', form.start_date);
          fd.append('end_date', form.end_date);

          const asset = form._localImage;
          const filename = asset?.fileName || asset?.uri?.split('/').pop() || `banner_${Date.now()}.jpg`;
          const ext = /\.(\w+)$/.exec(filename || '')?.[1]?.toLowerCase() || 'jpg';
          const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
          fd.append('banner_image', { uri: asset.uri, name: filename, type: mime });

          const res = await fetchWithTimeout(url, { method: 'PUT', body: fd }, 15000);
          const text = await res.text();
          if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} — ${text || 'Update failed'}`);
        } else {
          // Image unchanged → PUT JSON
          const payload = {
            business_id: Number(form.business_id),
            title: form.title.trim(),
            description: form.description.trim(),
            banner_image: form.banner_image || '', // keep existing path
            is_active: Number(form.is_active) ? 1 : 0,
            start_date: form.start_date,
            end_date: form.end_date,
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
      setForm(emptyForm(form.business_id));
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

  const toggleActive = async (b) => {
    const next = Number(b.is_active) ? 0 : 1;
    const url = `${baseUpdate}/${encodeURIComponent(b.id)}`;

    const payload = {
      business_id: Number(b.business_id ?? defaultBusinessId),
      title: b.title ?? '',
      description: b.description ?? '',
      banner_image: b.banner_image ?? '', // keep existing
      is_active: next,
      start_date: toYMD(b.start_date),
      end_date: toYMD(b.end_date),
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

  /** ====== Date pickers ====== */
  const onPickStart = (event, date) => {
    setShowStartPicker(false);
    if (date) setForm((s) => ({ ...s, start_date: toYMD(date) }));
  };
  const onPickEnd = (event, date) => {
    setShowEndPicker(false);
    if (date) setForm((s) => ({ ...s, end_date: toYMD(date) }));
  };

  /** ====== Render row ====== */
  const renderBanner = ({ item }) => {
    const img = joinImg(item.banner_image);
    const active = Number(item.is_active) === 1;

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Image source={{ uri: img }} style={styles.thumb} />
          <View style={{ flex: 1, marginHorizontal: 10 }}>
            <Text style={styles.cardTitle} numberOfLines={1}>{item.title || '—'}</Text>
            <Text style={styles.meta} numberOfLines={2}>{item.description || '—'}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: active ? '#e8f5e9' : '#f3f4f6' }]}>
            <Text style={[styles.badgeText, { color: active ? '#166534' : '#334155' }]}>
              {active ? 'Active' : 'Paused'}
            </Text>
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
      <Text style={[styles.sub, { fontSize: textSizeSub }]}>All banners from the server.</Text>

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

        <TouchableOpacity style={styles.newBtn} onPress={openCreate}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.newBtnText}>New</Text>
        </TouchableOpacity>
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
              <TouchableOpacity style={[styles.newBtn, { marginTop: 10 }]} onPress={openCreate}>
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
                  style={[styles.saveBtn, { opacity: (form.banner_image || form._localImage) ? 1 : 0.6 }]}
                  onPress={save}
                  disabled={!(form.banner_image || form._localImage)}
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
                      source={{ uri: form._localImage ? form._localImage.uri : joinImg(form.banner_image) }}
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

            <Field label="Title">
              <TextInput
                value={form.title}
                onChangeText={(t) => setForm((s) => ({ ...s, title: t }))}
                placeholder="Offer 100%"
                placeholderTextColor="#94a3b8"
                style={styles.input}
              />
            </Field>

            <Field label="Description">
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
              <Field label="Start date">
                <TouchableOpacity style={styles.dateBtnGreen} onPress={() => setShowStartPicker(true)}>
                  <Ionicons name="calendar" size={14} color="#065f46" />
                  <Text style={styles.dateBtnTextGreen}>{form.start_date || 'Pick a date'}</Text>
                </TouchableOpacity>
              </Field>
              <Field label="End date">
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
                onChange={onPickStart}
                themeVariant="light"
                accentColor="#16a34a"
                textColor="#16a34a"
              />
            )}
            {showEndPicker && (
              <DateTimePicker
                value={form.end_date ? new Date(form.end_date) : new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={onPickEnd}
                themeVariant="light"
                accentColor="#16a34a"
                textColor="#16a34a"
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
    backgroundColor: 'rgba(185,28,28,0.95)', // red-700
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
});
