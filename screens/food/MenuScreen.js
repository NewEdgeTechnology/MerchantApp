// screens/food/MenuScreen.js
import React, {
  useMemo,
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
} from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  FlatList,
  Image,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  Switch,
  Alert,
  DeviceEventEmitter,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import * as ImagePicker from 'expo-image-picker';
import {
  DISPLAY_MENU_ENDPOINT as ENV_DISPLAY_MENU_ENDPOINT,
  DISPLAY_ITEM_ENDPOINT as ENV_DISPLAY_ITEM_ENDPOINT,
  MENU_ENDPOINT as ENV_MENU_ENDPOINT,
  ITEM_ENDPOINT as ENV_ITEM_ENDPOINT,
  MENU_IMAGE_ENDPOINT as ENV_MENU_IMAGE_ENDPOINT,
  ITEM_IMAGE_ENDPOINT as ENV_ITEM_IMAGE_ENDPOINT,
} from '@env';

const money = (n, c = 'Nu') => `${c} ${Number(n ?? 0).toFixed(2)}`;

/* ---------------- helpers ---------------- */
const DEFAULT_CATEGORIES = ['All'];
const KEY_LAST_CTX = 'last_ctx_payload';

function getOrigin(url) {
  try { const u = new URL(url); return `${u.protocol}//${u.host}`; }
  catch { const m = String(url).match(/^(https?:\/\/[^/]+)/i); return m ? m[1] : ''; }
}
const sanitizePath = (p) =>
  String(p || '').replace(/^\/uploads\/uploads\//i, '/uploads/').replace(/([^:]\/)\/+/g, '$1');
const encodePathSegments = (p) =>
  String(p || '').split('/').map(seg => (seg ? encodeURIComponent(seg) : '')).join('/');
const absJoin = (base, raw) => {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  const baseNorm = String((base || '').replace(/\/+$/, ''));
  let path = s.startsWith('/') ? s : `/${s}`;
  if (/\/uploads$/i.test(baseNorm) && /^\/uploads\//i.test(path)) path = path.replace(/^\/uploads/i, '');
  const encodedPath = encodePathSegments(sanitizePath(path));
  return `${baseNorm}${encodedPath.startsWith('/') ? '' : '/'}${encodedPath}`.replace(/([^:]\/)\/+/g, '$1');
};
const isLocalUri = (u) => !!u && !/^https?:\/\//i.test(String(u));

const addCacheBuster = (url) => {
  if (!url) return url;
  try {
    const u = new URL(url);
    u.searchParams.set('v', String(Date.now()));
    return u.toString();
  } catch {
    return url.includes('?') ? `${url}&v=${Date.now()}` : `${url}?v=${Date.now()}`;
  }
};

const normalizeOwnerType = (v) => {
  const s = String(v ?? '').trim().toLowerCase();
  if (s === '2' || s === 'mart') return 'mart';
  if (s === '1' || s === 'food') return 'food';
  return s || 'food';
};

export default function MenuScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();

  useLayoutEffect(() => {
    navigation.setOptions?.({
      animation: 'slide_from_right',
      gestureEnabled: true,
      fullScreenGestureEnabled: true,
    });
  }, [navigation]);

  const ownerType = useMemo(
    () => normalizeOwnerType(route?.params?.owner_type ?? route?.params?.ownerType ?? 'food'),
    [route?.params?.owner_type, route?.params?.ownerType]
  );
  const isMart = ownerType === 'mart';

  const IMAGE_BASE = useMemo(
    () => String((isMart ? ENV_ITEM_IMAGE_ENDPOINT : ENV_MENU_IMAGE_ENDPOINT) || '').replace(/\/+$/, ''),
    [isMart]
  );

  const nouns = useMemo(() => {
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    const base = isMart ? 'item' : 'menu';
    const plural = isMart ? 'items' : 'menu items';
    return {
      headerTitle: isMart ? 'Items' : 'Menu',
      searchPH: isMart ? 'Search items' : 'Search menu items',
      emptyTitle: 'No items yet',
      emptySub: 'Tap “Add item” to create your first one.',
      editTitle: 'Edit item',
      addFab: 'Add item',
      noun: base, plural, cap, baseCap: cap(base),
    };
  }, [isMart]);

  const businessId = useMemo(() => {
    const p = route?.params ?? {};
    return p.businessId || p.business_id || p.merchant?.businessId || p.merchant?.id || p.user?.business_id || p.user?.id || '';
  }, [route?.params]);

  const businessName = route?.params?.business_name || route?.params?.merchant?.business_name || route?.params?.user?.business_name || '';
  const businessLogo = route?.params?.business_logo || route?.params?.merchant?.business_logo || route?.params?.user?.business_logo || '';

  const [query, setQuery] = useState('');
  const [activeCat, setActiveCat] = useState('All');
  const [menus, setMenus] = useState(route?.params?.menus ?? []);
  const [categories, setCategories] = useState(route?.params?.categories ?? DEFAULT_CATEGORIES);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState({
    id: null, name: '', category: 'General', price: '', discount: '', taxRate: '', currency: 'Nu', inStock: true, image: '',
  });
  const isEditing = !!form?.id;
  const autoOpenRef = useRef(false);

  const DISPLAY_LIST_ENDPOINT = useMemo(
    () => ((isMart ? ENV_DISPLAY_ITEM_ENDPOINT : ENV_DISPLAY_MENU_ENDPOINT) || '').replace(/\/$/, ''),
    [isMart]
  );
  const MODIFY_ENDPOINT = useMemo(
    () => ((isMart ? ENV_ITEM_ENDPOINT : ENV_MENU_ENDPOINT) || '').replace(/\/$/, ''),
    [isMart]
  );
  const API_ORIGIN = useMemo(() => getOrigin(DISPLAY_LIST_ENDPOINT), [DISPLAY_LIST_ENDPOINT]);

  const extractItemsFromResponse = useCallback((raw) => {
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.data)) return raw.data;
    for (const k of ['items', 'rows', 'result', 'payload', 'list', 'menus', 'menu']) {
      if (Array.isArray(raw?.[k])) return raw[k];
    }
    if (raw && typeof raw === 'object') {
      for (const v of Object.values(raw)) if (Array.isArray(v)) return v;
    }
    return [];
  }, []);

  const normalizeItem = useCallback((x, idx = 0) => {
    const numericActual = Number(x?.actual_price);
    const numericBase = Number(x?.base_price);
    const price = Number.isFinite(numericActual)
      ? numericActual
      : Number.isFinite(numericBase)
        ? numericBase
        : (typeof x?.price === 'number' ? x.price : Number(x?.price ?? 0));

    const rawImg = x?.image_url ?? x?.item_image_url ?? x?.item_image ?? x?.image ?? '';
    const absImage = absJoin(IMAGE_BASE || API_ORIGIN, rawImg);

    return {
      id: String(x?.id ?? x?._id ?? x?.menu_id ?? x?.item_id ?? idx),
      name: x?.item_name ?? x?.name ?? x?.title ?? 'Unnamed item',
      title: x?.title ?? undefined,
      price,
      discount: x?.discount_percentage ?? '',
      taxRate: x?.tax_rate ?? '',
      currency: x?.currency ?? 'Nu',
      inStock: (x?.is_available ?? x?.inStock ?? 1) ? true : false,
      category: x?.category_name ?? x?.category ?? x?.categoryName ?? '',
      image: absImage,
      description: x?.description ?? '',
    };
  }, [API_ORIGIN, IMAGE_BASE]);

  /* ---------- List URL: always send owner_type ---------- */
  const buildListUrl = useCallback(() => {
    if (!DISPLAY_LIST_ENDPOINT || !businessId) return null;
    const base = DISPLAY_LIST_ENDPOINT.replace(/\/+$/, '');
    const service = isMart ? 'mart' : 'food';

    if (/\/business$/i.test(base)) {
      return `${base}/${encodeURIComponent(businessId)}?owner_type=${encodeURIComponent(service)}`;
    }
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}business_id=${encodeURIComponent(businessId)}&owner_type=${encodeURIComponent(service)}`;
  }, [DISPLAY_LIST_ENDPOINT, businessId, isMart]);

  const hydrateCategories = useCallback((list) => {
    const uniq = new Set();
    for (const it of list) { const c = String(it?.category || '').trim(); if (c) uniq.add(c); }
    return ['All', ...Array.from(uniq)];
  }, []);

  /* ---------- Update endpoints ---------- */

  const apiUpdateJson = useCallback(async (id, data) => {
    if (!MODIFY_ENDPOINT) throw new Error('Missing modify endpoint');
    const token = (await SecureStore.getItemAsync('auth_token')) || '';
    const url = `${MODIFY_ENDPOINT.replace(/\/+$/, '')}/${encodeURIComponent(id)}`;

    const payload = {
      business_id: data.business_id,
      item_name: data.item_name,
      category: data.category,
      category_name: data.category,
      actual_price: data.actual_price,
      discount_percentage: data.discount_percentage ?? null,
      tax_rate: data.tax_rate ?? null,
      currency: data.currency,
      is_available: data.is_available ? 1 : 0,
      ...(data.image_url ? { image_url: data.image_url, item_image_url: data.image_url } : {}),
      owner_type: isMart ? '2' : '1',
      service: isMart ? 'mart' : 'food',
    };

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
    let json = null; try { json = text ? JSON.parse(text) : null; } catch { }
    if (!res.ok) throw new Error(json?.message || text || `HTTP ${res.status}`);
    return json || {};
  }, [MODIFY_ENDPOINT, isMart]);

  const apiUpdateMultipart = useCallback(async (id, data) => {
    if (!MODIFY_ENDPOINT) throw new Error('Missing modify endpoint');
    const token = (await SecureStore.getItemAsync('auth_token')) || '';

    const url = `${MODIFY_ENDPOINT.replace(/\/+$/, '')}/${encodeURIComponent(id)}`;

    const fd = new FormData();

    fd.append('id', String(id));
    fd.append('item_id', String(id));
    fd.append('menu_id', String(id));
    if (data.business_id != null) fd.append('business_id', String(data.business_id));

    fd.append('owner_type', isMart ? '2' : '1');
    fd.append('service', isMart ? 'mart' : 'food');

    const nm = data.item_name ?? '';
    const cat = data.category ?? '';
    fd.append('item_name', nm);
    fd.append('name', nm);
    fd.append('title', nm);
    fd.append('category', cat);
    fd.append('category_name', cat);

    const priceStr = data.actual_price != null ? String(data.actual_price) : '';
    if (priceStr) {
      fd.append('price', priceStr);
      fd.append('actual_price', priceStr);
      fd.append('base_price', priceStr);
    }
    if (data.discount_percentage !== '' && data.discount_percentage != null) {
      const d = String(data.discount_percentage);
      fd.append('discount', d);
      fd.append('discount_percentage', d);
    }
    if (data.tax_rate !== '' && data.tax_rate != null) {
      fd.append('tax_rate', String(data.tax_rate));
    }

    fd.append('currency', data.currency || 'Nu');
    const avail = data.is_available ? '1' : '0';
    fd.append('is_available', avail);
    fd.append('in_stock', avail);

    if (data.image_url) {
      const u = String(data.image_url);
      fd.append(isMart ? 'item_image_url' : 'image_url', u);
    }

    if (!data.image_local_uri) throw new Error('Missing image_local_uri');
    const fileField = isMart ? 'item_image' : 'image';
    const lower = (data.image_local_uri || '').toLowerCase();
    const isPng = lower.endsWith('.png');
    fd.append(fileField, {
      uri: data.image_local_uri,
      name: `upload_${Date.now()}.${isPng ? 'png' : 'jpg'}`,
      type: isPng ? 'image/png' : 'image/jpeg',
    });

    const headers = {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    const res = await fetch(url, { method: 'PUT', headers, body: fd });
    const text = await res.text();
    let json = null; try { json = text ? JSON.parse(text) : null; } catch { }
    if (!res.ok) throw new Error(json?.message || text || `HTTP ${res.status}`);
    return json || {};
  }, [MODIFY_ENDPOINT, isMart]);


  /* ---------- Fetch list ---------- */
  const fetchMenus = useCallback(async () => {
    if (!DISPLAY_LIST_ENDPOINT) { setErrorMsg('Missing list endpoint in .env'); return; }
    if (!businessId) { setErrorMsg('Missing businessId in route params'); return; }

    setLoading(true); setErrorMsg('');
    try {
      const token = (await SecureStore.getItemAsync('auth_token')) || '';
      const url = buildListUrl();
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 15000);

      const res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        signal: controller.signal,
      });
      clearTimeout(tid);

      const text = await res.text();
      if (!res.ok) {
        setErrorMsg(`Failed to load ${isMart ? 'items' : 'menu items'} (HTTP ${res.status}).`);
      } else {
        let parsed; try { parsed = text ? JSON.parse(text) : []; } catch { parsed = []; }
        const list = extractItemsFromResponse(parsed).map((x, i) => normalizeItem(x, i));
        setMenus(list); setCategories(hydrateCategories(list));
      }
    } catch (e) {
      setErrorMsg(String(e?.message || `Failed to load ${isMart ? 'items' : 'menu items'}.`));
    } finally { setLoading(false); }
  }, [DISPLAY_LIST_ENDPOINT, businessId, buildListUrl, extractItemsFromResponse, normalizeItem, hydrateCategories, isMart]);

  useFocusEffect(useCallback(() => { fetchMenus(); }, [fetchMenus]));

  /* ---------- Filtering ---------- */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return menus.filter((m) => {
      const matchesCat = activeCat === 'All' || String(m.category || '').toLowerCase() === activeCat.toLowerCase();
      const matchesText = !q || String(m.name || '').toLowerCase().includes(q) || String(m.category || '').toLowerCase().includes(q);
      return matchesCat && matchesText;
    });
  }, [menus, query, activeCat]);

  /* ---------- Edit / Add ---------- */
  const openEdit = (item) => {
    const firstRealCat = categories.find((c) => c !== 'All');
    setForm({
      id: item.id,
      name: item.name,
      category: item.category || firstRealCat || 'General',
      price: String(item.price ?? ''),
      discount: item.discount !== undefined && item.discount !== null ? String(item.discount) : '',
      taxRate: item.taxRate !== undefined && item.taxRate !== null ? String(item.taxRate) : '',
      currency: item.currency || 'Nu',
      inStock: !!item.inStock,
      image: item.image || '',
    });
    setModalVisible(true);
  };

  const openAddTab = async () => {
    const payload = {
      openTab: 'Add Menu',
      businessId, business_id: businessId,
      business_name: businessName, business_logo: businessLogo,
      owner_type: ownerType,
    };
    try { await SecureStore.setItemAsync(KEY_LAST_CTX, JSON.stringify(payload)); } catch { }
    DeviceEventEmitter.emit('open-tab', { key: 'Add Menu', params: payload });
    navigation.goBack();
  };

  const pickFromLibraryEdit = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow photo library access to select an image.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: false, quality: 0.9, mediaTypes: ImagePicker.MediaTypeOptions.Images });
    if (!result.canceled && result.assets?.[0]) setForm((f) => ({ ...f, image: result.assets[0].uri }));
  };

  const takePhotoEdit = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow camera access to take a photo.'); return; }
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: false, quality: 0.9 });
    if (!result.canceled && result.assets?.[0]) setForm((f) => ({ ...f, image: result.assets[0].uri }));
  };

  const saveItem = async () => {
    const priceNum = Number(form.price);
    theDiscount = form.discount === '' ? '' : Number(form.discount);
    const discountNum = theDiscount;
    const taxNum = form.taxRate === '' ? '' : Number(form.taxRate);
    if (!form.name.trim()) return Alert.alert('Name required', `Please enter a ${isMart ? 'item' : 'menu'} name.`);
    if (Number.isNaN(priceNum)) return Alert.alert('Invalid price', 'Please enter a numeric price.');
    if (discountNum !== '' && Number.isNaN(discountNum)) return Alert.alert('Invalid discount', 'Please enter a numeric discount percentage.');
    if (taxNum !== '' && Number.isNaN(taxNum)) return Alert.alert('Invalid tax', 'Please enter a numeric tax rate.');
    if (!form.category) return Alert.alert('Category required', 'Please choose a category.');

    const payload = {
      business_id: businessId,
      item_name: form.name.trim(),
      category: form.category,
      actual_price: priceNum,
      discount_percentage: discountNum === '' ? null : discountNum,
      tax_rate: taxNum === '' ? null : taxNum,
      currency: form.currency || 'Nu',
      is_available: form.inStock ? 1 : 0,
      image_local_uri: isLocalUri(form.image) ? form.image : null,
      image_url: !isLocalUri(form.image) ? (form.image || null) : null,
    };

    try {
      if (isEditing) {
        const resp = payload.image_local_uri
          ? await apiUpdateMultipart(form.id, payload)
          : await apiUpdateJson(form.id, payload);

        const serverImg = resp?.image_url || resp?.item_image_url || resp?.image || '';
        const updatedImage = addCacheBuster(
          serverImg
            ? absJoin(IMAGE_BASE || API_ORIGIN, serverImg)
            : (payload.image_url ? absJoin(IMAGE_BASE || API_ORIGIN, payload.image_url) : form.image)
        );

        setMenus((prev) =>
          prev.map((m) =>
            m.id === form.id
              ? {
                  ...m,
                  name: payload.item_name,
                  category: payload.category,
                  price: payload.actual_price,
                  discount: payload.discount_percentage ?? '',
                  taxRate: payload.tax_rate ?? '',
                  currency: payload.currency,
                  inStock: !!payload.is_available,
                  image: updatedImage,
                }
              : m
          )
        );
        if (!categories.includes(form.category)) {
          setCategories((prev) => ['All', ...new Set([...prev.filter(c => c !== 'All'), form.category])]);
        }
      }
      setModalVisible(false);
    } catch (e) {
      Alert.alert('Update failed', String(e?.message || 'Could not update the item.'));
    }
  };

  const deleteItem = async (id) => {
    Alert.alert(`Delete ${isMart ? 'item' : 'menu item'}`, 'Are you sure you want to delete this?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            if (!MODIFY_ENDPOINT) throw new Error('Missing modify endpoint');
            const token = await SecureStore.getItemAsync('auth_token');
            const url = `${MODIFY_ENDPOINT}/${encodeURIComponent(id)}`;
            const res = await fetch(url, { method: 'DELETE', headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
            const text = await res.text(); let parsed = null; try { parsed = text ? JSON.parse(text) : null; } catch { }
            if (!res.ok) throw new Error(parsed?.message || `Delete failed (HTTP ${res.status})`);
            setMenus((prev) => prev.filter((m) => m.id !== id));
            Alert.alert('Deleted', 'Item has been deleted successfully.');
          } catch (e) { Alert.alert('Delete failed', String(e?.message || 'Could not delete the item.')); }
        },
      },
    ]);
  };

  // ===== Header with scrollable category chips (inside the list) =====
  const ListHeader = useMemo(() => (
    <View style={styles.chipsRow} onStartShouldSetResponderCapture={() => true}>
      <ScrollView
        horizontal
        nestedScrollEnabled
        directionalLockEnabled
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={styles.chipsContent}
      >
        {categories.map((c, i) => {
          const active = c === activeCat;
          return (
            <Pressable
              key={`${c}-${i}`}
              onPress={() => setActiveCat(c)}
              android_ripple={{ color: 'rgba(0,0,0,0.06)', borderless: false }}
              style={({ pressed }) => [
                styles.chip,
                active && styles.chipActive,
                pressed && { transform: [{ scale: 0.98 }] },
                { marginRight: 8 },
              ]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{c}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  ), [categories, activeCat]);

  useEffect(() => () => {
    if (route?.params?.onSaveMenus) route.params.onSaveMenus(menus);
  }, [menus, route?.params]);

  useEffect(() => {
    if (autoOpenRef.current) return;
    const edit = route?.params?.editItem; if (!edit) return;
    const found = menus.find(m => String(m.id) === String(edit.id)) || edit;
    if (categories.length > 0) { openEdit(found); autoOpenRef.current = true; }
  }, [route?.params?.editItem, menus, categories]);

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

      <View style={[styles.header, { paddingTop: (insets.top || 0) + 6 }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.iconBtn} android_ripple={{ color: 'rgba(0,0,0,0.08)', borderless: true }}>
          <Ionicons name="arrow-back" size={24} color="#0f172a" />
        </Pressable>
        <Text style={styles.headerTitle}>{nouns.headerTitle}</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color="#64748b" />
        <TextInput
          placeholder={nouns.searchPH} placeholderTextColor="#94a3b8" style={styles.searchInput}
          value={query} onChangeText={setQuery}
        />
        {!!query && (
          <Pressable onPress={() => setQuery('')} style={styles.clearBtn} android_ripple={{ color: 'rgba(0,0,0,0.06)', borderless: true }}>
            <Ionicons name="close-circle" size={18} color="#94a3b8" />
          </Pressable>
        )}
      </View>

      {loading ? (
        <View style={{ paddingTop: 40, alignItems: 'center' }}>
          <ActivityIndicator />
          <Text style={{ marginTop: 8, color: '#64748b' }}>Loading {isMart ? 'items' : 'menu items'}…</Text>
        </View>
      ) : errorMsg ? (
        <View style={{ paddingTop: 40, alignItems: 'center' }}>
          <Ionicons name="warning-outline" size={28} color="#ef4444" />
          <Text style={{ marginTop: 8, color: '#ef4444', fontWeight: '700' }}>{errorMsg}</Text>
          <Pressable onPress={fetchMenus} style={[styles.btn, styles.btnPrimary, { marginTop: 12 }]}>
            <Ionicons name="reload" size={18} color="#fff" />
            <Text style={styles.btnPrimaryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderMenu}
          ListHeaderComponent={ListHeader}         // ⬅️ chips live inside the list
          stickyHeaderIndices={[0]}                // ⬅️ keep chips visible while scrolling (optional)
          contentContainerStyle={{ padding: 16, paddingBottom: (insets.bottom || 0) + 120 }}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name={isMart ? 'cube-outline' : 'fast-food-outline'} size={30} color="#64748b" />
              <Text style={styles.emptyTitle}>{nouns.emptyTitle}</Text>
              <Text style={styles.emptySub}>{nouns.emptySub}</Text>
            </View>
          }
        />
      )}

      <Pressable style={[styles.fab, { bottom: (insets.bottom || 0) + 24 }]} onPress={openAddTab}
        android_ripple={{ color: 'rgba(255,255,255,0.25)', borderless: false }}>
        <Ionicons name="add" size={22} color="#fff" />
        <Text style={styles.fabText}>{nouns.addFab}</Text>
      </Pressable>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalWrap}>
          <View style={[styles.sheet, { paddingBottom: (insets.bottom || 0) + 16 }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{nouns.editTitle}</Text>
              <Pressable onPress={() => setModalVisible(false)} style={styles.iconBtn}
                android_ripple={{ color: 'rgba(0,0,0,0.08)', borderless: true }}>
                <Ionicons name="close" size={24} color="#0f172a" />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 12 }}>
              <Text style={styles.label}>Name</Text>
              <TextInput value={form.name} onChangeText={(t) => setForm((f) => ({ ...f, name: t }))}
                placeholder={isMart ? 'e.g., Toothpaste 200g' : 'e.g., Chicken Rice'} style={styles.input} />

              <Text style={styles.label}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {categories.filter(c => c !== 'All').map((c) => (
                  <Pressable key={c}
                    style={({ pressed }) => [styles.catChip, form.category === c && styles.catChipActive, pressed && { transform: [{ scale: 0.98 }] }]}
                    android_ripple={{ color: 'rgba(0,0,0,0.06)', borderless: false }}
                    onPress={() => setForm((f) => ({ ...f, category: c }))}>
                    <Text style={[styles.catChipText, form.category === c && styles.catChipTextActive]}>{c}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              <View style={styles.row2}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Price</Text>
                  <TextInput value={String(form.price)} onChangeText={(t) => setForm((f) => ({ ...f, price: t.replace(/,/g, '.') }))}
                    keyboardType="decimal-pad" placeholder="0.00" style={styles.input} />
                </View>
                <View style={{ width: 100 }}>
                  <Text style={styles.label}>Currency</Text>
                  <TextInput value={form.currency}
                    onChangeText={(t) => setForm((f) => ({ ...f, currency: t.trim().slice(0, 4) || 'Nu' }))} placeholder="Nu" style={styles.input} />
                </View>
              </View>

              <View style={styles.row2}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Tax rate (%)</Text>
                  <TextInput value={String(form.taxRate)} onChangeText={(t) => setForm((f) => ({ ...f, taxRate: t.replace(/,/g, '.') }))}
                    keyboardType="decimal-pad" placeholder="e.g., 5" style={styles.input} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Discount (%)</Text>
                  <TextInput value={String(form.discount)} onChangeText={(t) => setForm((f) => ({ ...f, discount: t.replace(/,/g, '.') }))}
                    keyboardType="decimal-pad" placeholder="e.g., 10" style={styles.input} />
                </View>
              </View>

              <Text style={styles.label}>Image</Text>
              {form.image ? (
                <Image source={{ uri: form.image }} style={{ width: '100%', height: 160, borderRadius: 12, backgroundColor: '#f1f5f9' }} resizeMode="cover" />
              ) : (
                <View style={{ width: '100%', height: 160, borderRadius: 12, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="image-outline" size={28} color="#64748b" />
                  <Text style={{ marginTop: 6, color: '#64748b', fontWeight: '700' }}>No image selected</Text>
                </View>
              )}
              <View style={[styles.saveRow, { marginTop: 10 }]}>
                <Pressable style={[styles.btn, styles.btnGhost]} onPress={takePhotoEdit}
                  android_ripple={{ color: 'rgba(0,0,0,0.06)', borderless: false }}>
                  <Ionicons name="camera-outline" size={18} color="#0f172a" />
                  <Text style={styles.btnGhostText}>Take photo</Text>
                </Pressable>
                <Pressable style={[styles.btn, styles.btnPrimary]} onPress={pickFromLibraryEdit}
                  android_ripple={{ color: 'rgba(255,255,255,0.25)', borderless: false }}>
                  <Ionicons name="images-outline" size={18} color="#fff" />
                  <Text style={styles.btnPrimaryText}>Pick photo</Text>
                </Pressable>
              </View>

              <View style={styles.stockRow2}>
                <Text style={styles.stockLabel2}>Available</Text>
                <Switch value={form.inStock} onValueChange={(v) => setForm((f) => ({ ...f, inStock: v }))}
                  trackColor={{ true: '#a7f3d0', false: '#fee2e2' }} thumbColor={form.inStock ? '#10b981' : '#ef4444'} />
              </View>

              <View style={styles.saveRow}>
                {isEditing && (
                  <Pressable style={[styles.btn, styles.btnGhost]} onPress={() => { setModalVisible(false); deleteItem(form.id); }}
                    android_ripple={{ color: 'rgba(0,0,0,0.06)', borderless: false }}>
                    <Ionicons name="trash-outline" size={18} color="#b91c1c" />
                    <Text style={[styles.btnGhostText, { color: '#b91c1c' }]}>Delete</Text>
                  </Pressable>
                )}
                <Pressable style={[styles.btn, styles.btnPrimary]} onPress={saveItem}
                  android_ripple={{ color: 'rgba(255,255,255,0.25)', borderless: false }}>
                  <Ionicons name="save-outline" size={18} color="#fff" />
                  <Text style={styles.btnPrimaryText}>Save changes</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

/* ---------------- styles ---------------- */
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#ffffff' },
  header: { paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: '#0f172a' },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 999 },

  searchWrap: { marginHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 15, borderRadius: 12, backgroundColor: '#f1f5f9' },
  searchInput: { flex: 1, color: '#0f172a', paddingVertical: 0 },
  clearBtn: { padding: 4, borderRadius: 999 },

  // Chips header (inside FlatList)
  chipsRow: {
    minHeight: 44,     // never collapses
    paddingTop: 10,
    paddingBottom: 2,
    backgroundColor: '#fff',
    zIndex: 1,
    elevation: 1,
  },
  chipsScroll: { flexGrow: 0 },
  chipsContent: { paddingHorizontal: 12, alignItems: 'center' },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: '#e2e8f0' },
  chipActive: { backgroundColor: '#00b14f' },
  chipText: { color: '#0f172a', fontWeight: '700' },
  chipTextActive: { color: 'white' },

  // Cards
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  thumb: { width: 54, height: 54, borderRadius: 10, backgroundColor: '#e2e8f0' },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  meta: { fontSize: 12, color: '#64748b', marginTop: 2 },
  price: { fontSize: 14, color: '#0f172a', fontWeight: '800', marginTop: 4 },

  rightCol: { alignItems: 'flex-end', gap: 8 },
  stockRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stockLabel: { fontSize: 12, color: '#0f172a', fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 6 },

  emptyBox: { alignItems: 'center', paddingTop: 40, gap: 8 },
  emptyTitle: { fontWeight: '800', color: '#0f172a' },
  emptySub: { color: '#64748b' },

  fab: { position: 'absolute', right: 16, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#00b14f', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 999, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 5 },
  fabText: { color: '#fff', fontWeight: '800' },

  // Modal / edit sheet
  modalWrap: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: 'white', borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingHorizontal: 16, paddingTop: 12, maxHeight: '90%' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },

  label: { color: '#0f172a', fontWeight: '700', marginTop: 10, marginBottom: 6 },
  input: { backgroundColor: '#f1f5f9', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, color: '#0f172a' },
  row2: { flexDirection: 'row', gap: 10, marginTop: 4 },
  catChip: { backgroundColor: '#e2e8f0', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  catChipActive: { backgroundColor: '#00b14f' },
  catChipText: { color: '#0f172a', fontWeight: '700' },
  catChipTextActive: { color: '#fff' },

  stockRow2: { marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stockLabel2: { fontSize: 14, color: '#0f172a', fontWeight: '700' },

  saveRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 999 },
  btnPrimary: { backgroundColor: '#00b14f' },
  btnPrimaryText: { color: '#fff', fontWeight: '800' },
  btnGhost: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' },
  btnGhostText: { color: '#0f172a', fontWeight: '800' },
});
