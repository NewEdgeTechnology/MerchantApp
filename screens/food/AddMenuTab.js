// screens/food/AddMenuTab.js
// FOOD ONLY: includes is_veg + spice_level; posts to MENU_ENDPOINT
import React, {
  useEffect, useMemo, useState, useLayoutEffect, useCallback, useRef
} from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Image, Switch,
  ActivityIndicator, Alert, Platform, Modal, TouchableWithoutFeedback,
  RefreshControl, BackHandler, FlatList, Pressable, Keyboard, KeyboardAvoidingView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { useHeaderHeight } from '@react-navigation/elements';
import {
  CATEGORY_ENDPOINT as ENV_CATEGORY_ENDPOINT,
  MENU_ENDPOINT as ENV_ADD_MENU_ENDPOINT,          // FOOD create endpoint
  MENU_IMAGE_ENDPOINT as ENV_MENU_IMAGE_ENDPOINT,   // optional view base
} from '@env';

/* ───────── Debug ───────── */
const DEBUG = true;
const rid = () => Math.random().toString(36).slice(2, 8);
const dlog = (...a) => DEBUG && console.log('[FOOD-ADD]', ...a);
const derr = (...a) => DEBUG && console.log('%c[FOOD-ADD ERR]', 'color:#d00', ...a);

/* ───────── Theme ───────── */
const FONT_FAMILY = Platform.select({ ios: 'System', android: 'sans-serif' });
const PLACEHOLDER_COLOR = '#94a3b8';
const TEXT_COLOR = '#0f172a';
const INPUT_HEIGHT = 46;

/* ───────── Image base (render only) ───────── */
const IMG_FOOD_BASE = (ENV_MENU_IMAGE_ENDPOINT || '').replace(/\/$/, '');
const makeImageUrl = (path) => {
  if (!path) return '';
  const s = String(path).trim();
  if (/^https?:\/\//i.test(s)) return s;
  return IMG_FOOD_BASE ? `${IMG_FOOD_BASE}/${s.replace(/^\/+/, '')}` : s;
};

/* ───────── Small Select component ───────── */
function Select({ value, options, onChange, placeholder = 'None', fontSize = 14, testID, maxVisible = 3 }) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const wrapRef = useRef(null);

  const isNone = value == null || value === '' || value === 'None';
  const shown = isNone
    ? placeholder
    : (options.find((o) => String(o.value) === String(value))?.label ?? placeholder);

  const measure = () => wrapRef.current?.measureInWindow((x, y, w, h) => setAnchor({ x, y, w, h }));
  const openMenu = () => { measure(); setOpen(true); };
  const selectAndClose = (v) => { onChange?.(v); setOpen(false); };

  const itemHeight = INPUT_HEIGHT;
  const visibleCount = Math.min(options.length, maxVisible);
  const dropdownHeight = itemHeight * visibleCount;

  return (
    <>
      <Pressable ref={wrapRef} onPress={openMenu} testID={testID} style={styles.pickerWrap} onLayout={measure}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text numberOfLines={1} style={[styles.pickerText, { color: isNone ? PLACEHOLDER_COLOR : TEXT_COLOR, fontSize }]}>
            {shown}
          </Text>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={isNone ? PLACEHOLDER_COLOR : TEXT_COLOR} />
        </View>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onShow={measure}>
        <TouchableWithoutFeedback onPress={() => setOpen(false)}>
          <View style={styles.overlayBackdrop}>
            <TouchableWithoutFeedback>
              <View style={[styles.dropdownCard, { left: anchor.x, top: anchor.y + anchor.h, width: anchor.w, height: dropdownHeight }]}>
                <FlatList
                  data={options}
                  keyExtractor={(it, idx) => String(it.value ?? idx)}
                  renderItem={({ item }) => {
                    const selected = String(item.value) === String(value);
                    return (
                      <Pressable onPress={() => selectAndClose(item.value)} style={styles.dropdownItem}>
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.dropdownText,
                            { fontSize, color: selected ? '#00b14f' : TEXT_COLOR, fontFamily: FONT_FAMILY, fontWeight: selected ? '700' : '500' },
                          ]}
                        >
                          {item.label}
                        </Text>
                        {selected ? <Ionicons name="checkmark" size={18} color="#00b14f" /> : null}
                      </Pressable>
                    );
                  }}
                  ItemSeparatorComponent={() => <View style={styles.dropdownSeparator} />}
                />
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}

/* ───────── Main (FOOD) ───────── */
export default function AddMenuTab({ isTablet }) {
  const navigation = useNavigation();
  const route = useRoute();
  const headerHeight = useHeaderHeight();

  /* Fonts */
  const FS = useMemo(() => {
    const base = isTablet ? 15 : 14;
    return { base, label: base, title: isTablet ? 18 : 16, sub: isTablet ? 13 : 12, small: isTablet ? 13 : 12 };
  }, [isTablet]);

  /* Header/back */
  useLayoutEffect(() => {
    navigation.setOptions?.({
      gestureEnabled: true,
      fullScreenGestureEnabled: true,
      headerLeft: () => (
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
          <Ionicons name="chevron-back" size={24} color={TEXT_COLOR} />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => { if (navigation.canGoBack()) { navigation.goBack(); return true; } return false; };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => sub?.remove?.();
    }, [navigation])
  );

  /* BusinessId */
  const BUSINESS_ID = useMemo(() => {
    const p = route?.params ?? {};
    return String(p.businessId || p.business_id || p.merchant?.businessId || p.merchant?.id || '').trim();
  }, [route?.params]);

  /* Categories URL */
  const CATEGORY_BASE = useMemo(() => (ENV_CATEGORY_ENDPOINT || '').replace(/\/$/, ''), []);
  const CATEGORIES_URL = useMemo(() => {
    if (!CATEGORY_BASE || !BUSINESS_ID) return null;
    const hasPh = /\{businessId\}/i.test(CATEGORY_BASE);
    const pathStyle = hasPh ? CATEGORY_BASE.replace(/\{businessId\}/gi, encodeURIComponent(BUSINESS_ID))
                            : `${CATEGORY_BASE}/${encodeURIComponent(BUSINESS_ID)}`;
    const queryStyle = `${CATEGORY_BASE}?business_id=${encodeURIComponent(BUSINESS_ID)}`;
    const baseUrl = CATEGORY_BASE.includes('?') ? queryStyle : pathStyle;
    const sep = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${sep}owner_type=food`;
  }, [CATEGORY_BASE, BUSINESS_ID]);

  /* Endpoint: FOOD create */
  const addEndpointOverride = useMemo(() => {
    const p = route?.params ?? {};
    return String(p.addItemEndpoint ?? p.add_item_endpoint ?? '').trim();
  }, [route?.params]);

  const ADD_ENDPOINT = useMemo(() => {
    if (addEndpointOverride) return addEndpointOverride;
    return (ENV_ADD_MENU_ENDPOINT || '').trim();
  }, [addEndpointOverride]);

  /* Form state */
  const [itemName, setItemName] = useState('');
  const [description, setDescription] = useState('');
  const [imageUri, setImageUri] = useState('');
  const [imageName, setImageName] = useState('');
  const [imageSize, setImageSize] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [basePrice, setBasePrice] = useState('');
  const [taxRate, setTaxRate] = useState('');
  const [discount, setDiscount] = useState('');
  const [isVeg, setIsVeg] = useState(false);
  const SPICE_OPTIONS = ['None', 'Mild', 'Medium', 'Hot'];
  const [spiceLevel, setSpiceLevel] = useState('None');
  const [isAvailable, setIsAvailable] = useState(true);
  const [stockLimit, setStockLimit] = useState('');
  const [sortPriority, setSortPriority] = useState('None');
  const [category, setCategory] = useState('None');   // store NAME only
  const [categories, setCategories] = useState([]);   // [{id, name}]
  const [loadingCats, setLoadingCats] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [kbHeight, setKbHeight] = useState(0);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const sh = Keyboard.addListener(showEvt, (e) => setKbHeight(e?.endCoordinates?.height || 0));
    const hh = Keyboard.addListener(hideEvt, () => setKbHeight(0));
    return () => { sh.remove(); hh.remove(); };
  }, []);

  const formatBytes = (bytes) => {
    if (!bytes || bytes <= 0) return '';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), sizes.length - 1);
    const val = bytes / Math.pow(1024, i);
    return `${val.toFixed(val >= 10 || i === 0 ? 0 : 1)} ${sizes[i]}`;
  };

  const setPickedAsset = (asset) => {
    setImageUri(asset.uri);
    setImageName(asset.fileName || asset.filename || 'image.jpg');
    setImageSize(asset.fileSize ?? asset.size ?? 0);
  };

  const extractCategoriesFromResponse = (raw) => {
    if (Array.isArray(raw)) return raw;
    if (raw && Array.isArray(raw.types)) {
      const flat = [];
      for (const t of raw.types) if (Array.isArray(t.categories)) flat.push(...t.categories);
      return flat;
    }
    const wrappers = ['data', 'categories', 'result', 'items', 'rows', 'payload', 'list'];
    for (const k of wrappers) if (Array.isArray(raw?.[k])) return raw[k];
    if (raw && typeof raw === 'object') for (const v of Object.values(raw)) if (Array.isArray(v)) return v;
    return [];
  };

  // Fetch categories (food)
  const loadCategories = useCallback(async (opts = { showErrors: true }) => {
    if (!BUSINESS_ID) { setLoadingCats(false); if (opts.showErrors) Alert.alert('Config', 'Missing businessId.'); return; }
    if (!CATEGORY_BASE) { setLoadingCats(false); if (opts.showErrors) Alert.alert('Config', 'Missing CATEGORY_ENDPOINT'); return; }
    if (!CATEGORIES_URL) return;

    try {
      setLoadingCats(true);
      const token = (await SecureStore.getItemAsync('auth_token')) || '';
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 15000);

      const res = await fetch(CATEGORIES_URL, {
        method: 'GET',
        headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        signal: controller.signal,
      });
      clearTimeout(tid);

      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}${text ? ` • ${text}` : ''}`);

      let raw;
      try { raw = text ? JSON.parse(text) : []; } catch { raw = []; }

      const list = extractCategoriesFromResponse(raw);
      const normalized = list.map((c, idx) => ({
        id: String(c.id ?? c._id ?? c.categoryId ?? c.category_id ?? idx),
        name: c.category_name ?? c.name ?? c.title ?? c.label ?? 'Unnamed',
      }));

      const withNone = [{ id: 'None', name: 'None' }, ...normalized];
      setCategories(withNone);
      if (!category || category === 'None') setCategory(normalized[0]?.name ?? 'None');
    } catch (e) {
      if (opts.showErrors) Alert.alert('Categories', `Failed to load categories.\n${String(e?.message || e)}`);
    } finally {
      setLoadingCats(false);
    }
  }, [BUSINESS_ID, CATEGORY_BASE, CATEGORIES_URL, category]);

  useEffect(() => { loadCategories({ showErrors: true }); }, [loadCategories]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await loadCategories({ showErrors: false }); setRefreshing(false); }, [loadCategories]);

  // Image actions
  const pickFromLibrary = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow photo library access to select an image.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: false, quality: 0.9, mediaTypes: ImagePicker.MediaTypeOptions.Images });
    if (!result.canceled && result.assets?.[0]) setPickedAsset(result.assets[0]);
  };
  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow camera access to take a photo.'); return; }
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: false, quality: 0.9 });
    if (!result.canceled && result.assets?.[0]) setPickedAsset(result.assets[0]);
  };
  const removeImage = () => { setImageUri(''); setImageName(''); setImageSize(0); setPreviewOpen(false); };

  const mapSortPriority = (p) => (p === 'high' ? 3 : p === 'low' ? 1 : 2);

  async function toFileUriIfNeeded(uri) {
    if (!uri) return uri;
    if (uri.startsWith('file://')) return uri;
    if (!uri.startsWith('content://')) return uri;
    const dst = `${FileSystem.cacheDirectory}upload_${Date.now()}.jpg`;
    try { await FileSystem.copyAsync({ from: uri, to: dst }); return dst; } catch { return uri; }
  }
  const guessMimeFromName = (name = '') => {
    const lower = name.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.gif')) return 'image/gif';
    return 'application/octet-stream';
  };
  const snapshotFormData = (fd) => {
    const out = [];
    fd.forEach((v, k) => out.push([k, v && typeof v === 'object' && 'uri' in v ? `{file name:${v.name}, type:${v.type}}` : v]));
    return out;
  };

  function buildFormData({ payload, imageUri, imageName }) {
    const fd = new FormData();
    if (imageUri) {
      const filename = imageName || 'image.jpg';
      fd.append('item_image', { uri: imageUri, name: filename, type: guessMimeFromName(filename) });
    }
    const entries = {
      business_id: String(payload.business_id ?? ''),
      category_name: payload.category_name ?? '',
      item_name: payload.item_name ?? '',
      description: payload.description ?? '',
      actual_price: String(payload.actual_price ?? ''),
      discount_percentage: payload.discount_percentage == null ? '' : String(payload.discount_percentage),
      tax_rate: payload.tax_rate == null ? '' : String(payload.tax_rate),
      is_available: String(payload.is_available ?? 1),
      stock_limit: payload.stock_limit == null ? '' : String(payload.stock_limit),
      sort_order: String(payload.sort_order ?? 2),
      is_veg: String(payload.is_veg ?? 0),
      spice_level: payload.spice_level && payload.spice_level !== 'None' ? payload.spice_level : '',
    };
    Object.entries(entries).forEach(([k, v]) => { if (v !== undefined && v !== null && String(v) !== '') fd.append(k, String(v)); });
    return fd;
  }

  async function postToBackend(payload) {
    if (!ADD_ENDPOINT) throw new Error('MENU_ENDPOINT is not set');
    const token = (await SecureStore.getItemAsync('auth_token')) || '';
    const url = ADD_ENDPOINT;

    const fd = buildFormData({
      payload,
      imageUri: imageUri ? await toFileUriIfNeeded(imageUri) : null,
      imageName: imageName || 'image.jpg',
    });

    const reqId = rid();
    dlog(`(req:${reqId}) POST ->`, url);
    dlog(`(req:${reqId}) Payload(category_name: "${payload.category_name}")`);
    dlog(`(req:${reqId}) FormData:`, snapshotFormData(fd));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: fd, signal: controller.signal,
      });
      const text = await res.text();
      dlog(`(req:${reqId}) status:`, res.status);
      dlog(`(req:${reqId}) body:`, text.slice(0, 1000));
      if (!res.ok) throw new Error(`HTTP ${res.status} • ${text}`);
      let created = null;
      try { created = text ? JSON.parse(text) : null; } catch { created = null; }
      return { data: created };
    } finally { clearTimeout(timeout); }
  }

  const onSave = async () => {
    const clickId = rid();
    dlog(`(click:${clickId}) Save pressed`);

    if (!BUSINESS_ID) return Alert.alert('Config', 'Missing businessId.');
    if (!itemName.trim()) return Alert.alert('Validation', 'Please enter item name.');
    if (!basePrice || isNaN(Number(basePrice))) return Alert.alert('Validation', 'Enter a valid base price.');
    if (taxRate !== '' && isNaN(Number(taxRate))) return Alert.alert('Validation', 'Enter a valid tax rate.');
    if (discount !== '' && isNaN(Number(discount))) return Alert.alert('Validation', 'Enter a valid discount.');
    if (!SPICE_OPTIONS.includes(spiceLevel)) return Alert.alert('Validation', `Spice level must be one of: ${SPICE_OPTIONS.join(', ')}`);
    if (stockLimit !== '' && (isNaN(Number(stockLimit)) || Number(stockLimit) < 0)) {
      return Alert.alert('Validation', 'Stock limit must be 0 or more.');
    }

    const category_name = (category && category !== 'None') ? String(category) : '';
    if (!category_name) return Alert.alert('Validation', 'Please select a category.');

    setSaving(true);

    const payload = {
      business_id: Number(BUSINESS_ID),
      category_name,
      item_name: itemName.trim(),
      description: description.trim(),
      actual_price: Number(basePrice),
      discount_percentage: discount === '' ? null : Number(discount),
      tax_rate: taxRate === '' ? null : Number(taxRate),
      is_available: isAvailable ? 1 : 0,
      stock_limit: stockLimit === '' ? null : Number(stockLimit),
      sort_order: mapSortPriority(sortPriority),
      is_veg: isVeg ? 1 : 0,
      spice_level: spiceLevel,
    };
    if (__DEV__) console.log('payload', payload);

    try {
      const { data: created } = await postToBackend(payload);
      const rawPath =
        created?.image_url ?? created?.item_image_url ?? created?.menu_image_url ??
        created?.item_image ?? created?.menu_image ?? created?.data?.item_image ?? created?.data?.menu_image ?? null;

      const absoluteUrl = makeImageUrl(rawPath);
      const imageUrl = absoluteUrl ? `${absoluteUrl}${absoluteUrl.includes('?') ? '&' : '?'}v=${Date.now()}` : '';

      // reset form
      setItemName(''); setDescription(''); setImageUri(''); setImageName(''); setImageSize(0);
      setBasePrice(''); setTaxRate(''); setDiscount(''); setIsVeg(false); setSpiceLevel('None');
      setIsAvailable(true); setStockLimit(''); setSortPriority('None');

      Alert.alert('Saved', 'Menu item added successfully.', [{ text: 'OK', onPress: () => navigation.navigate('MenuScreen') }], {
        cancelable: true, onDismiss: () => navigation.navigate('MenuScreen'),
      });
    } catch (e) {
      derr(`(click:${clickId}) failed:`, e?.message);
      Alert.alert('Error', e?.message || 'Failed to save.');
    } finally { setSaving(false); }
  };

  const PREVIEW_W = isTablet ? 320 : 270;
  const PREVIEW_H = isTablet ? 180 : 150;

  const ListHeaderComponent = useMemo(() => (
    <View style={{ marginBottom: 12 }}>
      <Text style={[styles.title, { fontSize: FS.title }]}>Menu</Text>
      <Text style={[styles.sub, { fontSize: FS.sub }]}>Manage your menu items and availability.</Text>
    </View>
  ), [FS.title, FS.sub]);

  const renderForm = useCallback(() => (
    <View>
      {/* Item Name */}
      <View style={styles.field}>
        <Text style={[styles.label, { fontSize: FS.label }]}>Item name</Text>
        <TextInput
          value={itemName} onChangeText={setItemName}
          placeholder="e.g., Chicken Fried Rice" placeholderTextColor={PLACEHOLDER_COLOR}
          style={[styles.input, { fontSize: FS.base, fontFamily: FONT_FAMILY, height: INPUT_HEIGHT }]}
          editable={!saving}
        />
      </View>

      {/* Description */}
      <View style={styles.field}>
        <Text style={[styles.label, { fontSize: FS.label }]}>Description</Text>
        <TextInput
          value={description} onChangeText={setDescription}
          placeholder="Short description" placeholderTextColor={PLACEHOLDER_COLOR}
          style={[styles.input, styles.inputMultiline, { fontSize: FS.base, fontFamily: FONT_FAMILY }]}
          multiline numberOfLines={3} editable={!saving}
        />
      </View>

      {/* Item Image */}
      <View style={styles.field}>
        <Text style={[styles.label, { fontSize: FS.label }]}>Item image</Text>
        {!imageUri ? (
          <View style={[styles.qrCard, { paddingVertical: isTablet ? 24 : 18, opacity: saving ? 0.6 : 1 }]}>
            <Ionicons name="image-outline" size={isTablet ? 28 : 22} color="#64748b" />
            <Text style={[styles.qrTitle, { fontSize: FS.base, fontFamily: FONT_FAMILY }]}>Upload item image</Text>
            <Text style={[styles.qrHint, { fontSize: FS.small, fontFamily: FONT_FAMILY }]}>JPG or PNG • up to ~5 MB</Text>
            <View style={styles.qrActionsRow}>
              <TouchableOpacity style={styles.qrAction} onPress={takePhoto} disabled={saving}>
                <Ionicons name="camera-outline" size={18} color="#00b14f" />
                <Text style={[styles.qrActionText, { fontFamily: FONT_FAMILY }]}>Take photo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.qrAction} onPress={pickFromLibrary} disabled={saving}>
                <Ionicons name="images-outline" size={18} color="#00b14f" />
                <Text style={[styles.qrActionText, { fontFamily: FONT_FAMILY }]}>Choose from gallery</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={[styles.qrPreviewCard, saving && { opacity: 0.6 }]}>
            <View style={[styles.previewBanner, { width: PREVIEW_W, height: PREVIEW_H }]}>
              <Image source={{ uri: imageUri }} resizeMode="contain" style={{ width: '100%', height: '100%' }} />
            </View>
            <View style={styles.metaRow}>
              <Ionicons name="document-text-outline" size={16} color="#64748b" />
              <Text style={[styles.metaText, { fontFamily: FONT_FAMILY, fontSize: FS.small }]} numberOfLines={1}>
                {imageName || 'image.jpg'} {imageSize ? ` • ${formatBytes(imageSize)}` : ''}
              </Text>
            </View>
            <View style={styles.previewActionsRow}>
              <TouchableOpacity style={styles.previewActionBtn} onPress={() => setPreviewOpen(true)} disabled={saving}>
                <Ionicons name="eye-outline" size={18} color={TEXT_COLOR} />
                <Text style={[styles.previewActionText, { fontFamily: FONT_FAMILY, fontSize: FS.small }]}>View</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.previewActionBtn} onPress={pickFromLibrary} disabled={saving}>
                <Ionicons name="swap-horizontal-outline" size={18} color={TEXT_COLOR} />
                <Text style={[styles.previewActionText, { fontFamily: FONT_FAMILY, fontSize: FS.small }]}>Replace</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.previewActionBtn} onPress={removeImage} disabled={saving}>
                <Ionicons name="trash-outline" size={18} color="#ef4444" />
                <Text style={[styles.previewActionText, { color: '#ef4444', fontFamily: FONT_FAMILY, fontSize: FS.small }]}>Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* Price / Tax */}
      <View style={[styles.row, { gap: 12 }]}>
        <View style={[styles.col, { flex: 1 }]}>
          <Text style={[styles.label, { fontSize: FS.label }]}>Base price</Text>
          <TextInput
            value={basePrice} onChangeText={setBasePrice}
            keyboardType={Platform.OS === 'ios' ? 'decimal-pad' : 'numeric'}
            placeholder="e.g., 9.99" placeholderTextColor={PLACEHOLDER_COLOR}
            style={[styles.input, { fontSize: FS.base, fontFamily: FONT_FAMILY, height: INPUT_HEIGHT }]}
            editable={!saving}
          />
        </View>
        <View style={[styles.col, { flex: 1 }]}>
          <Text style={[styles.label, { fontSize: FS.label }]}>Tax rate (%)</Text>
          <TextInput
            value={taxRate} onChangeText={setTaxRate}
            keyboardType={Platform.OS === 'ios' ? 'decimal-pad' : 'numeric'}
            placeholder="e.g., 5" placeholderTextColor={PLACEHOLDER_COLOR}
            style={[styles.input, { fontSize: FS.base, fontFamily: FONT_FAMILY, height: INPUT_HEIGHT }]}
            editable={!saving}
          />
        </View>
      </View>

      {/* Discount (%) */}
      <View style={styles.field}>
        <Text style={[styles.label, { fontSize: FS.label }]}>Discount (%)</Text>
        <TextInput
          value={discount} onChangeText={setDiscount}
          keyboardType={Platform.OS === 'ios' ? 'decimal-pad' : 'numeric'}
          placeholder="e.g., 10" placeholderTextColor={PLACEHOLDER_COLOR}
          style={[styles.input, { fontSize: FS.base, fontFamily: FONT_FAMILY, height: INPUT_HEIGHT }]}
          editable={!saving}
        />
      </View>

      {/* Switches row */}
      <View style={[styles.row, { alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }]}>
        <View style={styles.switchRow}>
          <Text style={[styles.label, { marginRight: 8, fontSize: FS.label }]}>Is veg</Text>
          <Switch value={isVeg} onValueChange={setIsVeg} disabled={saving} />
        </View>
        <View style={styles.switchRow}>
          <Text style={[styles.label, { marginRight: 8, fontSize: FS.label }]}>Is available</Text>
          <Switch value={isAvailable} onValueChange={setIsAvailable} disabled={saving} />
        </View>
      </View>

      {/* Spice / Stock / Sort */}
      <View style={[styles.row, { gap: 12 }]}>
        <View style={[styles.col, { flex: 1 }]}>
          <Text style={[styles.label, { fontSize: FS.label }]}>Spice level</Text>
          <Select
            value={spiceLevel} onChange={setSpiceLevel}
            options={SPICE_OPTIONS.map((x) => ({ label: x, value: x }))} placeholder="None" testID="spice" fontSize={FS.base}
          />
        </View>

        <View style={[styles.col, { flex: 1 }]}>
          <Text style={[styles.label, { fontSize: FS.label }]}>Stock limit</Text>
          <TextInput
            value={stockLimit} onChangeText={setStockLimit}
            keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
            placeholder="e.g., 50" placeholderTextColor={PLACEHOLDER_COLOR}
            style={[styles.input, { fontSize: FS.base, fontFamily: FONT_FAMILY, height: INPUT_HEIGHT }]}
            editable={!saving}
          />
        </View>

        <View style={[styles.col, { flex: 1 }]}>
          <Text style={[styles.label, { fontSize: FS.label }]}>Sort priority</Text>
          <Select
            value={sortPriority} onChange={setSortPriority}
            options={[
              { label: 'None', value: 'None' },
              { label: 'High', value: 'high' },
              { label: 'Medium', value: 'medium' },
              { label: 'Low', value: 'low' },
            ]} placeholder="None" testID="sort" fontSize={FS.base}
          />
        </View>
      </View>

      {/* Category */}
      <View style={styles.field}>
        <Text style={[styles.label, { fontSize: FS.label }]}>Category</Text>
        {loadingCats ? (
          <View style={[styles.pickerWrap, styles.catLoading]}>
            <ActivityIndicator />
            <Text style={[styles.catLoadingText, { fontFamily: FONT_FAMILY, fontSize: FS.small }]}>Loading categories…</Text>
          </View>
        ) : categories.length === 0 ? (
          <View style={[styles.pickerWrap, styles.catLoading]}>
            <Ionicons name="warning-outline" size={16} color="#ef4444" />
            <Text style={[styles.catLoadingText, { color: '#ef4444', fontFamily: FONT_FAMILY, fontSize: FS.small }]}>
              No categories found for this business.
            </Text>
          </View>
        ) : (
          <Select
            value={category}
            onChange={setCategory}
            options={categories.map((c) => ({ label: c.name, value: c.name }))}
            placeholder="None" testID="category" fontSize={FS.base}
          />
        )}
      </View>

      {/* Buttons */}
      <View style={[styles.row, { marginTop: 16, gap: 12 }]}>
        <TouchableOpacity
          style={[styles.primaryBtn, { paddingVertical: isTablet ? 14 : 12, opacity: saving ? 0.8 : 1 }]}
          onPress={onSave} activeOpacity={0.9} disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="save-outline" size={isTablet ? 20 : 18} color="#fff" />
              <Text style={[styles.primaryBtnText, { fontSize: FS.base, fontFamily: FONT_FAMILY }]}>Save item</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondaryBtn, { paddingVertical: isTablet ? 14 : 12 }]}
          onPress={() => navigation.navigate('MenuScreen')} activeOpacity={0.9} disabled={saving}
        >
          <Ionicons name="list-outline" size={isTablet ? 20 : 18} color={TEXT_COLOR} />
          <Text style={[styles.secondaryBtnText, { fontSize: FS.base, fontFamily: FONT_FAMILY }]}>Open menu</Text>
        </TouchableOpacity>
      </View>
    </View>
  ), [FS, itemName, description, imageUri, imageName, imageSize, isTablet, basePrice, taxRate, discount, isVeg, isAvailable,
      category, categories, loadingCats, spiceLevel, stockLimit, sortPriority, saving]);

  return (
    <>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Math.max(0, (headerHeight || 0) + -8)}>
        <FlatList
          data={[{ key: 'form' }]} keyExtractor={(it) => it.key} renderItem={() => renderForm()}
          ListHeaderComponent={ListHeaderComponent} ItemSeparatorComponent={() => <View style={{ height: 0 }} />}
          contentContainerStyle={{ paddingBottom: kbHeight ? kbHeight - 8 : 32, paddingHorizontal: isTablet ? 20 : 16, paddingTop: 16 }}
          automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          removeClippedSubviews={false} nestedScrollEnabled={false}
          scrollIndicatorInsets={{ bottom: Math.max(0, kbHeight - 8) }} contentInset={{ bottom: 0 }}
        />
      </KeyboardAvoidingView>

      {/* Preview Modal */}
      <Modal visible={previewOpen} animationType="fade" transparent>
        <TouchableWithoutFeedback onPress={() => setPreviewOpen(false)}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback>
              <View style={styles.modalCard}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Preview</Text>
                  <TouchableOpacity onPress={() => setPreviewOpen(false)}>
                    <Ionicons name="close" size={22} color={TEXT_COLOR} />
                  </TouchableOpacity>
                </View>
                <View style={styles.modalImageWrap}>
                  {imageUri ? <Image source={{ uri: imageUri }} resizeMode="contain" style={{ width: '100%', height: '100%' }} /> : null}
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Saving overlay */}
      <Modal visible={saving} animationType="fade" transparent>
        <View style={styles.loaderOverlay}>
          <View style={styles.loaderCard}>
            <ActivityIndicator size="large" />
            <Text style={styles.loaderText}>Saving…</Text>
          </View>
        </View>
      </Modal>
    </>
  );
}

/* ───────── Styles (shared look) ───────── */
const styles = StyleSheet.create({
  title: { fontWeight: '700', color: TEXT_COLOR, fontFamily: FONT_FAMILY },
  sub: { color: '#64748b', marginTop: 6, fontFamily: FONT_FAMILY },

  field: { marginTop: 14 },
  label: { color: TEXT_COLOR, fontWeight: '600', fontFamily: FONT_FAMILY },

  input: {
    marginTop: 8, backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0',
  },
  inputMultiline: { minHeight: 84, textAlignVertical: 'top' },

  qrCard: {
    marginTop: 8, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#cbd5e1',
    borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, backgroundColor: '#ffffff',
  },
  qrTitle: { marginTop: 8, color: TEXT_COLOR, fontWeight: '700' },
  qrHint: { marginTop: 4, color: '#64748b' },
  qrActionsRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  qrAction: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    backgroundColor: '#ecfdf3', borderWidth: 1, borderColor: '#bbf7d0',
  },
  qrActionText: { color: '#065f46', fontWeight: '700', fontSize: 13 },

  qrPreviewCard: {
    marginTop: 8, padding: 10, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0',
  },
  previewBanner: {
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc',
    borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', alignSelf: 'center', padding: 8, overflow: 'hidden',
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  metaText: { color: '#475569', flexShrink: 1 },

  previewActionsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  previewActionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 999, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0',
  },
  previewActionText: { color: TEXT_COLOR, fontWeight: '700' },

  row: { flexDirection: 'row', alignItems: 'flex-start' },
  col: {},
  switchRow: { flexDirection: 'row', alignItems: 'center' },

  pickerWrap: {
    marginTop: 8, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0',
    height: INPUT_HEIGHT, justifyContent: 'center', paddingHorizontal: 12,
  },
  pickerText: { fontFamily: FONT_FAMILY, includeFontPadding: false },

  catLoading: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, height: INPUT_HEIGHT, gap: 10 },
  catLoadingText: { color: '#475569' },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#00b14f',
    paddingHorizontal: 16, borderRadius: 999, alignSelf: 'flex-start',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  primaryBtnText: { color: '#fff', fontWeight: '800' },
  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f1f5f9',
    paddingHorizontal: 16, borderRadius: 999, alignSelf: 'flex-start', borderWidth: 1, borderColor: '#e2e8f0',
  },
  secondaryBtnText: { color: TEXT_COLOR, fontWeight: '800' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  modalCard: { width: '100%', maxWidth: 560, backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden' },
  modalHeader: {
    paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  modalTitle: { fontWeight: '700', color: TEXT_COLOR, fontSize: 16 },
  modalImageWrap: { width: '100%', height: 360, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },

  overlayBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.12)' },
  dropdownCard: {
    position: 'absolute', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0',
    elevation: 6, shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, overflow: 'hidden',
  },
  dropdownItem: { height: INPUT_HEIGHT, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dropdownSeparator: { height: 1, backgroundColor: '#e2e8f0' },
  dropdownText: { fontFamily: FONT_FAMILY },

  loaderOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center' },
  loaderCard: { backgroundColor: '#fff', paddingHorizontal: 20, paddingVertical: 16, borderRadius: 12, alignItems: 'center', gap: 10, minWidth: 140 },
  loaderText: { color: TEXT_COLOR, fontWeight: '700' },
});
