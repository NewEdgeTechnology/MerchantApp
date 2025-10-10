// screens/food/AddMenuTab.js
import React, { useEffect, useMemo, useState, useLayoutEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Image,
  Switch,
  ActivityIndicator,
  Alert,
  Platform,
  Modal,
  TouchableWithoutFeedback,
  RefreshControl,
  BackHandler,
  DeviceEventEmitter,
  FlatList,
  Pressable,
  Keyboard,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as SecureStore from 'expo-secure-store';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { useHeaderHeight } from '@react-navigation/elements';

import {
  CATEGORY_ENDPOINT as ENV_CATEGORY_ENDPOINT,
  MENU_ENDPOINT as ENV_ADD_MENU_ENDPOINT,
  ITEM_ENDPOINT as ENV_ITEM_ENDPOINT, // mart add-item endpoint (exact)
} from '@env';

// ───────────────────────── Theme ─────────────────────────
const FONT_FAMILY = Platform.select({ ios: 'System', android: 'sans-serif' });
const PLACEHOLDER_COLOR = '#94a3b8';
const TEXT_COLOR = '#0f172a';
const INPUT_HEIGHT = 46;

// ───────────────────────── Custom Select ─────────────────────────
function Select({ value, options, onChange, placeholder = 'None', fontSize = 14, testID, maxVisible = 3 }) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const wrapRef = useRef(null);

  const isNone = value === undefined || value === null || value === '' || value === 'None';
  const shown = isNone ? placeholder : (options.find(o => String(o.value) === String(value))?.label ?? placeholder);

  const measure = () => {
    if (!wrapRef.current) return;
    wrapRef.current.measureInWindow((x, y, w, h) => setAnchor({ x, y, w, h }));
  };

  const openMenu = () => { measure(); setOpen(true); };
  const selectAndClose = (v) => { onChange?.(v); setOpen(false); };

  const itemHeight = INPUT_HEIGHT;
  const visibleCount = Math.min(options.length, maxVisible);
  const dropdownHeight = itemHeight * visibleCount;

  return (
    <>
      <Pressable ref={wrapRef} onPress={openMenu} testID={testID} style={styles.pickerWrap} onLayout={measure}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text
            numberOfLines={1}
            style={[styles.pickerText, { color: isNone ? PLACEHOLDER_COLOR : TEXT_COLOR, fontSize }]}
            testID={testID ? `${testID}-text` : undefined}
          >
            {shown}
          </Text>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={isNone ? PLACEHOLDER_COLOR : TEXT_COLOR} />
        </View>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onShow={measure}>
        <TouchableWithoutFeedback onPress={() => setOpen(false)}>
          <View style={styles.overlayBackdrop}>
            <TouchableWithoutFeedback>
              <View
                style={[
                  styles.dropdownCard,
                  { left: anchor.x, top: anchor.y + anchor.h, width: anchor.w, height: dropdownHeight },
                ]}
              >
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
                  contentContainerStyle={{ padding: 0 }}
                />
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}

export default function AddMenuTab({ isTablet }) {
  const navigation = useNavigation();
  const route = useRoute();
  const headerHeight = useHeaderHeight();

  // Unified font sizes
  const FS = useMemo(() => {
    const base = isTablet ? 15 : 14;
    const label = base;
    const title = isTablet ? 18 : 16;
    const sub = isTablet ? 13 : 12;
    const small = isTablet ? 13 : 12;
    return { base, label, title, sub, small };
  }, [isTablet]);

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

  // Android hardware back
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (navigation.canGoBack()) { navigation.goBack(); return true; }
        return false;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => sub?.remove?.();
    }, [navigation])
  );

  // Owner type
  const ownerType = useMemo(() => {
    const raw = String(route?.params?.ownerType ?? route?.params?.ownertype ?? route?.params?.owner_type ?? 'food')
      .toLowerCase().trim();
    if (raw.startsWith('mart')) return 'mart';
    if (raw.startsWith('food') || raw === 'restaurant' || raw === 'merchant') return 'food';
    return 'food';
  }, [route?.params]);

  const IS_MART = ownerType === 'mart';

  // Business and categories
  const BUSINESS_ID = useMemo(() => {
    const p = route?.params ?? {};
    return (p.businessId || p.business_id || p.merchant?.businessId || p.merchant?.id || '').toString().trim();
  }, [route?.params]);

  // ── CATEGORY URL: one API for both owner types + owner_type hint + always include "None"
  const CATEGORY_BASE = useMemo(() => (ENV_CATEGORY_ENDPOINT || '').replace(/\/$/, ''), []);
  const CATEGORIES_URL = useMemo(() => {
    if (!CATEGORY_BASE || !BUSINESS_ID) return null;

    // Support both forms your backend might provide:
    //   - /categories/:businessId
    //   - /categories?business_id=...
    const hasPlaceholder = /\{businessId\}/i.test(CATEGORY_BASE);
    const pathStyle = hasPlaceholder
      ? CATEGORY_BASE.replace(/\{businessId\}/ig, encodeURIComponent(BUSINESS_ID))
      : `${CATEGORY_BASE}/${encodeURIComponent(BUSINESS_ID)}`;

    const queryStyle = `${CATEGORY_BASE}?business_id=${encodeURIComponent(BUSINESS_ID)}`;

    // Prefer path style unless the base already has '?'
    const baseUrl = CATEGORY_BASE.includes('?') ? queryStyle : pathStyle;

    // Always tell backend which owner type we’re asking for
    const sep = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${sep}owner_type=${IS_MART ? 'mart' : 'food'}`;
  }, [CATEGORY_BASE, BUSINESS_ID, IS_MART]);

  // Optional hard override via nav params
  const addItemEndpointOverride = useMemo(() => {
    const p = route?.params ?? {};
    return String(p.addItemEndpoint ?? p.add_item_endpoint ?? '').trim();
  }, [route?.params]);

  // Choose add-item endpoint — exact, no mutation
  const ADD_ITEM_ENDPOINT = useMemo(() => {
    if (addItemEndpointOverride) return addItemEndpointOverride.trim();
    const foodUrl = (ENV_ADD_MENU_ENDPOINT || '').trim();
    const martUrl = (ENV_ITEM_ENDPOINT || '').trim(); // exact value from .env
    return IS_MART ? martUrl : foodUrl;
  }, [IS_MART, addItemEndpointOverride]);

  // Local state
  const [itemName, setItemName] = useState('');
  const [description, setDescription] = useState('');

  const [imageUri, setImageUri] = useState('');
  const [imageName, setImageName] = useState('');
  const [imageSize, setImageSize] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);

  const [basePrice, setBasePrice] = useState('');
  const [taxRate, setTaxRate] = useState('');
  const [discount, setDiscount] = useState('');

  // These are food-only controls
  const [isVeg, setIsVeg] = useState(false);
  const SPICE_OPTIONS = ['None', 'Mild', 'Medium', 'Hot'];
  const [spiceLevel, setSpiceLevel] = useState('None');

  const [isAvailable, setIsAvailable] = useState(true);
  const [stockLimit, setStockLimit] = useState('');

  const [sortPriority, setSortPriority] = useState('None');
  const [category, setCategory] = useState('None');
  const [categories, setCategories] = useState([]);
  const [loadingCats, setLoadingCats] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // keyboard padding
  const [kbHeight, setKbHeight] = useState(0);
  const KB_EXTRA = -8;

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const sh = Keyboard.addListener(showEvt, e => setKbHeight(e?.endCoordinates?.height || 0));
    const hh = Keyboard.addListener(hideEvt, () => setKbHeight(0));
    return () => { sh.remove(); hh.remove(); };
  }, []);

  // helpers
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
    setImageSize(asset.fileSize || asset.fileSize == 0 ? asset.fileSize : asset.size || 0);
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

  // fetch categories (same API for food & mart) + always include "None"
  const loadCategories = useCallback(async (opts = { showErrors: true }) => {
    if (!BUSINESS_ID) {
      setLoadingCats(false);
      if (opts.showErrors) Alert.alert('Config', 'Missing businessId. Pass it via route params.');
      return;
    }
    if (!CATEGORY_BASE) {
      setLoadingCats(false);
      if (opts.showErrors) Alert.alert('Config', 'Missing CATEGORY_ENDPOINT in .env');
      return;
    }
    if (!CATEGORIES_URL) return;

    try {
      setLoadingCats(true);
      const token = (await SecureStore.getItemAsync('auth_token')) || '';

      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 15000);

      const res = await fetch(CATEGORIES_URL, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: controller.signal,
      });
      clearTimeout(tid);

      const rawText = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}${rawText ? ` • ${rawText}` : ''}`);

      let raw;
      try { raw = rawText ? JSON.parse(rawText) : []; } catch { raw = []; }

      const listCandidate = extractCategoriesFromResponse(raw);
      const normalized = listCandidate.map((c, idx) => ({
        id: String(c.id ?? c._id ?? c.categoryId ?? c.category_id ?? idx),
        name: c.category_name ?? c.name ?? c.title ?? c.label ?? 'Unnamed',
      }));

      const withNone = [{ id: 'None', name: 'None' }, ...normalized];
      setCategories(withNone);
      if (!category) setCategory('None');
    } catch (e) {
      if (opts.showErrors) Alert.alert('Categories', `Failed to load categories.\n${String(e?.message || e)}`);
    } finally {
      setLoadingCats(false);
    }
  }, [BUSINESS_ID, CATEGORY_BASE, CATEGORIES_URL, category]);

  useEffect(() => { loadCategories({ showErrors: true }); }, [loadCategories]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadCategories({ showErrors: false });
    setRefreshing(false);
  }, [loadCategories]);

  // image actions
  const pickFromLibrary = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo library access to select an image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: false,
      quality: 0.9,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });
    if (!result.canceled && result.assets?.[0]) setPickedAsset(result.assets[0]);
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow camera access to take a photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: false, quality: 0.9 });
    if (!result.canceled && result.assets?.[0]) setPickedAsset(result.assets[0]);
  };

  const removeImage = () => {
    setImageUri(''); setImageName(''); setImageSize(0); setPreviewOpen(false);
  };

  const mapSortPriority = (priority) => {
    if (!priority || priority === 'None') return 2;
    return priority === 'high' ? 3 : priority === 'low' ? 1 : 2;
  };

  // POST to backend — EXACT endpoint, no auto-retry, no suffix changes
  async function postToBackend(payload) {
    if (!ADD_ITEM_ENDPOINT) throw new Error('ADD_ITEM_ENDPOINT is not set');
    const token = (await SecureStore.getItemAsync('auth_token')) || '';
    const hasLocalImage = !!payload.item_image;

    const url = ADD_ITEM_ENDPOINT; // EXACT as provided
    // console.log(`[AddMenuTab] POST (exact) → ${url} (ownerType=${ownerType})`);

    if (!hasLocalImage) {
      // JSON request
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status} • ${text.slice(0, 200)}`);
      try { return text ? JSON.parse(text) : null; } catch { return null; }
    }

    // multipart request
    const fd = new FormData();
    fd.append('business_id', String(payload.business_id));
    if (payload.category_name != null) fd.append('category_name', String(payload.category_name));
    fd.append('item_name', payload.item_name);
    fd.append('description', payload.description ?? '');
    fd.append('actual_price', String(payload.actual_price));
    if (payload.discount_percentage != null) fd.append('discount_percentage', String(payload.discount_percentage));
    if (payload.tax_rate != null) fd.append('tax_rate', String(payload.tax_rate));

    // FOOD-only fields
    if (!IS_MART) {
      fd.append('is_veg', String(payload.is_veg));
      fd.append('spice_level', payload.spice_level);
    }

    fd.append('is_available', String(payload.is_available));
    if (payload.stock_limit != null) fd.append('stock_limit', String(payload.stock_limit));
    fd.append('sort_order', String(payload.sort_order));

    if (payload.item_image) {
      const uri = String(payload.item_image);
      const filename = (uri.split('/').pop() || 'image.jpg').toLowerCase();
      const type = filename.endsWith('.png') ? 'image/png'
        : (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) ? 'image/jpeg'
        : 'application/octet-stream';
      fd.append('item_image', { uri, name: filename, type });
    }

    const res2 = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: fd,
    });
    const text2 = await res2.text();
    if (!res2.ok) throw new Error(`HTTP ${res2.status} • ${text2.slice(0, 200)}`);
    try { return text2 ? JSON.parse(text2) : null; } catch { return null; }
  }

  // Save
  const onSave = async () => {
    if (!BUSINESS_ID) return Alert.alert('Config', 'Missing businessId. Pass it via route params.');
    if (!itemName.trim()) return Alert.alert('Validation', 'Please enter item name.');
    if (!basePrice || isNaN(Number(basePrice))) return Alert.alert('Validation', 'Enter a valid base price.');
    if (taxRate !== '' && isNaN(Number(taxRate))) return Alert.alert('Validation', 'Enter a valid tax rate.');
    if (discount !== '' && isNaN(Number(discount))) return Alert.alert('Validation', 'Enter a valid discount.');

    if (!IS_MART && !SPICE_OPTIONS.includes(spiceLevel)) {
      return Alert.alert('Validation', `Spice level must be one of: ${SPICE_OPTIONS.join(', ')}`);
    }
    if (stockLimit !== '' && (isNaN(Number(stockLimit)) || Number(stockLimit) < 0)) {
      return Alert.alert('Validation', 'Stock limit must be 0 or more.');
    }

    const selectedCat = categories.find((x) => x.id === category);

    const payload = {
      business_id: Number(BUSINESS_ID),
      category_name: (category === 'None') ? null : (selectedCat?.name ?? null),
      item_name: itemName.trim(),
      description: description.trim(),
      item_image: imageUri || null,

      actual_price: Number(basePrice),
      discount_percentage: discount === '' ? null : Number(discount),
      tax_rate: taxRate === '' ? null : Number(taxRate),

      is_available: isAvailable ? 1 : 0,
      stock_limit: stockLimit === '' ? null : Number(stockLimit),
      sort_order: mapSortPriority(sortPriority),
    };

    // Only add to payload for food
    if (!IS_MART) {
      payload.is_veg = isVeg ? 1 : 0;
      payload.spice_level = spiceLevel;
    }

    try {
      const created = await postToBackend(payload);

      const newItem = {
        id: String(created?.id ?? created?._id ?? created?.menu_id ?? Date.now()),
        name: created?.item_name ?? payload.item_name,
        title: created?.title ?? undefined,
        price: created?.actual_price ?? payload.actual_price,
        currency: created?.currency ?? 'Nu',
        inStock: (created?.is_available ?? payload.is_available) ? true : false,
        category: created?.category_name ?? payload.category_name ?? '',
        categoryName: created?.category_name ?? payload.category_name ?? '',
        image: created?.image_url ?? created?.item_image_url ?? created?.item_image ?? payload.item_image ?? '',
        description: created?.description ?? payload.description ?? '',
      };

      DeviceEventEmitter.emit('menu:item:added', newItem);

      setItemName('');
      setDescription('');
      setImageUri('');
      setImageName('');
      setImageSize(0);
      setBasePrice('');
      setTaxRate('');
      setDiscount('');
      setIsVeg(false);
      setSpiceLevel('None');
      setIsAvailable(true);
      setStockLimit('');
      setSortPriority('None');
      setCategory('None');

      Alert.alert('Saved', IS_MART ? 'Item added successfully.' : 'Menu item added successfully.');
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to save.');
    }
  };

  const PREVIEW_W = isTablet ? 320 : 270;
  const PREVIEW_H = isTablet ? 180 : 150;

  // Header and form (mart-specific labels/placeholders)
  const ListHeaderComponent = useMemo(() => {
    const titleText = IS_MART ? 'Items' : 'Menu';
    const subText = IS_MART ? 'Manage your items and availability.' : 'Manage your menu items and availability.';
    return (
      <View style={{ marginBottom: 12 }}>
        <Text style={[styles.title, { fontSize: FS.title }]}>{titleText}</Text>
        <Text style={[styles.sub, { fontSize: FS.sub }]}>{subText}</Text>
      </View>
    );
  }, [FS.title, FS.sub, IS_MART]);

  const renderForm = useCallback(() => (
    <View>
      {/* Item Name */}
      <View style={styles.field}>
        <Text style={[styles.label, { fontSize: FS.label }]}>Item name</Text>
        <TextInput
          value={itemName}
          onChangeText={setItemName}
          placeholder={IS_MART ? 'e.g., Toothpaste 200g' : 'e.g., Chicken Fried Rice'}
          placeholderTextColor={PLACEHOLDER_COLOR}
          style={[styles.input, { fontSize: FS.base, fontFamily: FONT_FAMILY, height: INPUT_HEIGHT }]}
        />
      </View>

      {/* Description */}
      <View style={styles.field}>
        <Text style={[styles.label, { fontSize: FS.label }]}>Description</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder={IS_MART ? 'Short description (brand, size, etc.)' : 'Short description'}
          placeholderTextColor={PLACEHOLDER_COLOR}
          style={[styles.input, styles.inputMultiline, { fontSize: FS.base, fontFamily: FONT_FAMILY }]}
          multiline
          numberOfLines={3}
        />
      </View>

      {/* Item Image */}
      <View style={styles.field}>
        <Text style={[styles.label, { fontSize: FS.label }]}>Item image</Text>

        {!imageUri ? (
          <View style={[styles.qrCard, { paddingVertical: isTablet ? 24 : 18 }]}>
            <Ionicons name="image-outline" size={isTablet ? 28 : 22} color="#64748b" />
            <Text style={[styles.qrTitle, { fontSize: FS.base, fontFamily: FONT_FAMILY }]}>Upload item image</Text>
            <Text style={[styles.qrHint, { fontSize: FS.small, fontFamily: FONT_FAMILY }]}>JPG or PNG • up to ~5 MB</Text>
            <View style={styles.qrActionsRow}>
              <TouchableOpacity style={styles.qrAction} onPress={takePhoto}>
                <Ionicons name="camera-outline" size={18} color="#00b14f" />
                <Text style={[styles.qrActionText, { fontFamily: FONT_FAMILY }]}>Take photo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.qrAction} onPress={pickFromLibrary}>
                <Ionicons name="images-outline" size={18} color="#00b14f" />
                <Text style={[styles.qrActionText, { fontFamily: FONT_FAMILY }]}>Choose from gallery</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.qrPreviewCard}>
            <View style={[styles.previewBanner, { width: PREVIEW_W, height: PREVIEW_H }]}>
              <Image source={{ uri: imageUri }} resizeMode="contain" style={{ width: '100%', height: '100%' }} />
            </View>
            <View style={styles.metaRow}>
              <Ionicons name="document-text-outline" size={16} color="#64748b" />
              <Text style={[styles.metaText, { fontFamily: FONT_FAMILY, fontSize: FS.small }]} numberOfLines={1}>
                {imageName || 'image.jpg'} {imageSize ? `• ${formatBytes(imageSize)}` : ''}
              </Text>
            </View>
            <View style={styles.previewActionsRow}>
              <TouchableOpacity style={styles.previewActionBtn} onPress={() => setPreviewOpen(true)}>
                <Ionicons name="eye-outline" size={18} color={TEXT_COLOR} />
                <Text style={[styles.previewActionText, { fontFamily: FONT_FAMILY, fontSize: FS.small }]}>View</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.previewActionBtn} onPress={pickFromLibrary}>
                <Ionicons name="swap-horizontal-outline" size={18} color={TEXT_COLOR} />
                <Text style={[styles.previewActionText, { fontFamily: FONT_FAMILY, fontSize: FS.small }]}>Replace</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.previewActionBtn} onPress={removeImage}>
                <Ionicons name="trash-outline" size={18} color="#ef4444" />
                <Text style={[styles.previewActionText, { color: '#ef4444', fontFamily: FONT_FAMILY, fontSize: FS.small }]}>
                  Remove
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* Price / Tax */}
      <View style={[styles.row, { gap: 12 }]}>
        <View style={[styles.col, { flex: 1 }]}>
          <Text style={[styles.label, { fontSize: FS.label }]}>{IS_MART ? 'Price' : 'Base price'}</Text>
          <TextInput
            value={basePrice}
            onChangeText={setBasePrice}
            keyboardType={Platform.OS === 'ios' ? 'decimal-pad' : 'numeric'}
            placeholder={IS_MART ? 'e.g., 99.00' : 'e.g., 9.99'}
            placeholderTextColor={PLACEHOLDER_COLOR}
            style={[styles.input, { fontSize: FS.base, fontFamily: FONT_FAMILY, height: INPUT_HEIGHT }]}
          />
        </View>
        <View style={[styles.col, { flex: 1 }]}>
          <Text style={[styles.label, { fontSize: FS.label }]}>Tax rate (%)</Text>
          <TextInput
            value={taxRate}
            onChangeText={setTaxRate}
            keyboardType={Platform.OS === 'ios' ? 'decimal-pad' : 'numeric'}
            placeholder="e.g., 6"
            placeholderTextColor={PLACEHOLDER_COLOR}
            style={[styles.input, { fontSize: FS.base, fontFamily: FONT_FAMILY, height: INPUT_HEIGHT }]}
          />
        </View>
      </View>

      {/* Discount (%) */}
      <View style={styles.field}>
        <Text style={[styles.label, { fontSize: FS.label }]}>Discount (%)</Text>
        <TextInput
          value={discount}
          onChangeText={setDiscount}
          keyboardType={Platform.OS === 'ios' ? 'decimal-pad' : 'numeric'}
          placeholder="e.g., 10"
          placeholderTextColor={PLACEHOLDER_COLOR}
          style={[styles.input, { fontSize: FS.base, fontFamily: FONT_FAMILY, height: INPUT_HEIGHT }]}
        />
      </View>

      {/* Switches row (Is veg hidden for mart) */}
      <View style={[styles.row, { alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }]}>
        {!IS_MART && (
          <View style={styles.switchRow}>
            <Text style={[styles.label, { marginRight: 8, fontSize: FS.label }]}>Is veg</Text>
            <Switch value={isVeg} onValueChange={setIsVeg} />
          </View>
        )}
        <View style={styles.switchRow}>
          <Text style={[styles.label, { marginRight: 8, fontSize: FS.label }]}>Is available</Text>
          <Switch value={isAvailable} onValueChange={setIsAvailable} />
        </View>
      </View>

      {/* Spice / Stock / Sort (Spice hidden for mart) */}
      <View style={[styles.row, { gap: 12 }]}>
        {!IS_MART && (
          <View style={[styles.col, { flex: 1 }]}>
            <Text style={[styles.label, { fontSize: FS.label }]}>Spice level</Text>
            <Select
              value={spiceLevel}
              onChange={setSpiceLevel}
              options={SPICE_OPTIONS.map((x) => ({ label: x, value: x }))}
              placeholder="None"
              testID="spice"
              fontSize={FS.base}
            />
          </View>
        )}

        <View style={[styles.col, { flex: 1 }]}>
          <Text style={[styles.label, { fontSize: FS.label }]}>{IS_MART ? 'Stock' : 'Stock limit'}</Text>
          <TextInput
            value={stockLimit}
            onChangeText={setStockLimit}
            keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
            placeholder="e.g., 50"
            placeholderTextColor={PLACEHOLDER_COLOR}
            style={[styles.input, { fontSize: FS.base, fontFamily: FONT_FAMILY, height: INPUT_HEIGHT }]}
          />
        </View>

        <View style={[styles.col, { flex: 1 }]}>
          <Text style={[styles.label, { fontSize: FS.label }]}>Sort priority</Text>
          <Select
            value={sortPriority}
            onChange={setSortPriority}
            options={[
              { label: 'None', value: 'None' },
              { label: 'High', value: 'high' },
              { label: 'Medium', value: 'medium' },
              { label: 'Low', value: 'low' },
            ]}
            placeholder="None"
            testID="sort"
            fontSize={FS.base}
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
            options={categories.map((c) => ({ label: c.name, value: c.id }))}
            placeholder="None"
            testID="category"
            fontSize={FS.base}
          />
        )}
      </View>

      {/* Buttons */}
      <View style={[styles.row, { marginTop: 16, gap: 12 }]}>
        <TouchableOpacity style={[styles.primaryBtn, { paddingVertical: isTablet ? 14 : 12 }]} onPress={onSave} activeOpacity={0.9}>
          <Ionicons name="save-outline" size={isTablet ? 20 : 18} color="#fff" />
          <Text style={[styles.primaryBtnText, { fontSize: FS.base, fontFamily: FONT_FAMILY }]}>
            {IS_MART ? 'Save item' : 'Save item'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondaryBtn, { paddingVertical: isTablet ? 14 : 12 }]}
          onPress={() => navigation.navigate('MenuScreen')}
          activeOpacity={0.9}
        >
          <Ionicons name="list-outline" size={isTablet ? 20 : 18} color={TEXT_COLOR} />
          <Text style={[styles.secondaryBtnText, { fontSize: FS.base, fontFamily: FONT_FAMILY }]}>
            {IS_MART ? 'Open items' : 'Open menu'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  ), [
    FS, itemName, description, imageUri, imageName, imageSize, isTablet,
    basePrice, taxRate, discount, isVeg, isAvailable, category, categories, loadingCats,
    spiceLevel, stockLimit, sortPriority, IS_MART
  ]);

  return (
    <>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Math.max(0, (headerHeight || 0) + KB_EXTRA)}
      >
        <FlatList
          data={[{ key: 'form' }]}
          keyExtractor={(it) => it.key}
          renderItem={() => renderForm()}
          ListHeaderComponent={ListHeaderComponent}
          ItemSeparatorComponent={() => <View style={{ height: 0 }} />}
          contentContainerStyle={{
            paddingBottom: (kbHeight ? kbHeight + KB_EXTRA : 32),
            paddingHorizontal: isTablet ? 20 : 16,
            paddingTop: 16,
          }}
          automaticallyAdjustKeyboardInsets
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          removeClippedSubviews={false}
          nestedScrollEnabled={false}
          scrollIndicatorInsets={{ bottom: Math.max(0, kbHeight + KB_EXTRA) }}
          contentInset={{ bottom: 0 }}
        />
      </KeyboardAvoidingView>

      <Modal visible={previewOpen} animationType="fade" transparent>
        <TouchableWithoutFeedback onPress={() => setPreviewOpen(false)}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback>
              <View style={styles.modalCard}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{'Preview'}</Text>
                  <TouchableOpacity onPress={() => setPreviewOpen(false)}>
                    <Ionicons name="close" size={22} color={TEXT_COLOR} />
                  </TouchableOpacity>
                </View>
                <View style={styles.modalImageWrap}>
                  <Image source={{ uri: imageUri }} resizeMode="contain" style={{ width: '100%', height: '100%' }} />
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: 16 },
  title: { fontWeight: '700', color: TEXT_COLOR, fontFamily: FONT_FAMILY },
  sub: { color: '#64748b', marginTop: 6, fontFamily: FONT_FAMILY },

  field: { marginTop: 14 },
  label: { color: TEXT_COLOR, fontWeight: '600', fontFamily: FONT_FAMILY },

  input: {
    marginTop: 8,
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  inputMultiline: { minHeight: 84, textAlignVertical: 'top' },

  // Uploader
  qrCard: {
    marginTop: 8,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#cbd5e1',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    backgroundColor: '#ffffff',
  },
  qrTitle: { marginTop: 8, color: TEXT_COLOR, fontWeight: '700' },
  qrHint: { marginTop: 4, color: '#64748b' },
  qrActionsRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  qrAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#ecfdf3',
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  qrActionText: { color: '#065f46', fontWeight: '700', fontSize: 13 },

  qrPreviewCard: {
    marginTop: 8,
    padding: 10,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  previewBanner: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignSelf: 'center',
    padding: 8,
    overflow: 'hidden',
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  metaText: { color: '#475569', flexShrink: 1 },

  previewActionsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  previewActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  previewActionText: { color: TEXT_COLOR, fontWeight: '700' },

  // Rows
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  col: {},
  switchRow: { flexDirection: 'row', alignItems: 'center' },

  // Select (uniform with TextInput)
  pickerWrap: {
    marginTop: 8,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    height: INPUT_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  pickerText: { fontFamily: FONT_FAMILY, includeFontPadding: false },

  catLoading: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, height: INPUT_HEIGHT, gap: 10 },
  catLoadingText: { color: '#475569' },

  // Buttons
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#00b14f',
    paddingHorizontal: 16,
    borderRadius: 999,
    alignSelf: 'flex-start',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  primaryBtnText: { color: '#fff', fontWeight: '800' },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 16,
    borderRadius: 999,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  secondaryBtnText: { color: TEXT_COLOR, fontWeight: '800' },

  // Image preview modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 560,
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
  },
  modalHeader: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: { fontWeight: '700', color: TEXT_COLOR, fontSize: 16 },
  modalImageWrap: {
    width: '100%',
    height: 360,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Dropdown overlay
  overlayBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.12)' },
  dropdownCard: {
    position: 'absolute',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    overflow: 'hidden',
  },
  dropdownItem: {
    height: INPUT_HEIGHT,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownSeparator: { height: 1, backgroundColor: '#e2e8f0' },
  dropdownText: { fontFamily: FONT_FAMILY },
});
