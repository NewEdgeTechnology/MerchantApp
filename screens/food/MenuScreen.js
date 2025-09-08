// screens/food/MenuScreen.js
import React, { useMemo, useState, useEffect, useLayoutEffect, useCallback } from 'react';
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
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import * as ImagePicker from 'expo-image-picker';
import { DISPLAY_MENU_ENDPOINT as ENV_DISPLAY_MENU_ENDPOINT, MENU_ENDPOINT as ENV_MENU_ENDPOINT } from '@env';

const money = (n, c = 'Nu') => `${c} ${Number(n ?? 0).toFixed(2)}`;

// Minimal default: just "All"
const DEFAULT_CATEGORIES = ['All'];
const KEY_LAST_CTX = 'last_ctx_payload';

function getOrigin(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    const m = String(url).match(/^(https?:\/\/[^/]+)/i);
    return m ? m[1] : '';
  }
}
function toAbsoluteUrl(origin, pathOrUrl) {
  if (!pathOrUrl) return '';
  const s = String(pathOrUrl);
  if (/^https?:\/\//i.test(s)) return s;
  const rel = s.startsWith('/') ? s : `/${s}`;
  return origin ? `${origin}${rel}` : rel;
}

/** ───────── Image helpers for multipart ───────── */
const isLocalUri = (u) => !!u && !/^https?:\/\//i.test(String(u)); // file:// or content://
const guessMimeFromName = (name) => {
  const ext = (name || '').split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'heic') return 'image/heic';
  return 'application/octet-stream';
};
const buildFilePart = (uri) => {
  const name = (uri?.split('/')?.pop() || 'photo.jpg');
  return { uri, name, type: guessMimeFromName(name) };
};

export default function MenuScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();

  // ✅ native-stack slide transition
  useLayoutEffect(() => {
    navigation.setOptions?.({
      animation: 'slide_from_right',
      gestureEnabled: true,
      fullScreenGestureEnabled: true,
    });
  }, [navigation]);

  // Pull business identifiers + display fields from params (with fallbacks)
  const businessId = useMemo(() => {
    const p = route?.params ?? {};
    return (
      p.businessId ||
      p.business_id ||
      p.merchant?.businessId ||
      p.merchant?.id ||
      p.user?.business_id ||
      p.user?.id ||
      ''
    );
  }, [route?.params]);

  const businessName = useMemo(() => {
    const p = route?.params ?? {};
    return (
      p.business_name ||
      p.merchant?.business_name ||
      p.user?.business_name ||
      ''
    );
  }, [route?.params]);

  const businessLogo = useMemo(() => {
    const p = route?.params ?? {};
    return (
      p.business_logo ||
      p.merchant?.business_logo ||
      p.user?.business_logo ||
      ''
    );
  }, [route?.params]);

  // Start with NO predefined menus; only what is passed in (or empty).
  const initialMenus = route?.params?.menus ?? [];
  const initialCategories = route?.params?.categories ?? DEFAULT_CATEGORIES;

  const [query, setQuery] = useState('');
  const [activeCat, setActiveCat] = useState('All');
  const [menus, setMenus] = useState(initialMenus);
  const [categories, setCategories] = useState(initialCategories);

  // API bits
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Modal state for edit
  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState({
    id: null,
    name: '',
    category: 'General',
    price: '',             // maps to actual_price
    discount: '',          // discount_percentage
    taxRate: '',           // tax_rate
    currency: 'Nu',
    inStock: true,
    image: '',             // local or remote URI
  });
  const isEditing = !!form?.id;

  // Endpoints
  const DISPLAY_MENU_ENDPOINT = useMemo(
    () => (ENV_DISPLAY_MENU_ENDPOINT || '').replace(/\/$/, ''),
    []
  );
  const MENU_ENDPOINT = useMemo(
    () => (ENV_MENU_ENDPOINT || '').replace(/\/$/, ''),
    []
  );
  const API_ORIGIN = useMemo(() => getOrigin(DISPLAY_MENU_ENDPOINT), [DISPLAY_MENU_ENDPOINT]);

  // Normalize + extract
  const extractItemsFromResponse = useCallback((raw) => {
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.data)) return raw.data;
    const candidates = ['items', 'rows', 'result', 'payload', 'list', 'menus', 'menu'];
    for (const k of candidates) if (Array.isArray(raw?.[k])) return raw[k];
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

    const absImage = toAbsoluteUrl(
      API_ORIGIN,
      x?.image_url ?? x?.item_image_url ?? x?.item_image ?? x?.image ?? ''
    );
    return {
      id: String(x?.id ?? x?._id ?? x?.menu_id ?? idx),
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
  }, [API_ORIGIN]);

  const buildUrl = useCallback(() => {
    if (!DISPLAY_MENU_ENDPOINT || !businessId) return null;
    return `${DISPLAY_MENU_ENDPOINT}/${encodeURIComponent(businessId)}`;
  }, [DISPLAY_MENU_ENDPOINT, businessId]);

  const hydrateCategories = useCallback((list) => {
    const uniq = new Set();
    for (const it of list) {
      const c = String(it?.category || '').trim();
      if (c) uniq.add(c);
    }
    const arr = Array.from(uniq);
    return ['All', ...arr];
  }, []);

  // ───────── API: UPDATE (PUT MENU_ENDPOINT/:id) ─────────
  const apiUpdateMenu = useCallback(
    async (foodId, data) => {
      if (!MENU_ENDPOINT) throw new Error('Missing MENU_ENDPOINT in .env');
      if (!foodId) throw new Error('Missing food id for update');

      const token = (await SecureStore.getItemAsync('auth_token')) || '';
      const url = `${MENU_ENDPOINT}/${encodeURIComponent(foodId)}`;

      // Choose between multipart (file upload) vs JSON (remote URL/no change)
      const shouldUploadFile = isLocalUri(data.image_local_uri);

      if (shouldUploadFile) {
        /** multipart/form-data */
        const formData = new FormData();

        formData.append('business_id', String(data.business_id ?? ''));
        formData.append('item_name', data.item_name ?? '');
        formData.append('category', data.category ?? '');
        if (data.actual_price != null) formData.append('actual_price', String(data.actual_price));
        if (data.discount_percentage != null) formData.append('discount_percentage', String(data.discount_percentage));
        if (data.tax_rate != null) formData.append('tax_rate', String(data.tax_rate));
        formData.append('currency', data.currency ?? 'Nu');
        formData.append('is_available', data.is_available ? '1' : '0');

        // IMPORTANT: field name must match your multer handler (e.g., multer.single('image'))
        formData.append('image', buildFilePart(data.image_local_uri));

        const res = await fetch(url, {
          method: 'PUT',
          headers: {
            Accept: 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            // Do not set Content-Type, fetch sets correct boundary
          },
          body: formData,
        });

        const text = await res.text();
        let parsed = null; try { parsed = text ? JSON.parse(text) : null; } catch { }
        if (!res.ok) {
          const msg = parsed?.message || `Update failed (HTTP ${res.status})`;
          throw new Error(msg);
        }
        return parsed || {};
      } else {
        /** JSON (no new local file to upload) */
        const jsonPayload = {
          business_id: data.business_id,
          item_name: data.item_name,
          category: data.category,
          actual_price: data.actual_price,
          discount_percentage: data.discount_percentage,
          tax_rate: data.tax_rate,
          currency: data.currency,
          is_available: data.is_available ? 1 : 0,
          ...(data.image_url ? { image_url: data.image_url } : {}),
        };

        const res = await fetch(url, {
          method: 'PUT',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(jsonPayload),
        });

        const text = await res.text();
        let parsed = null; try { parsed = text ? JSON.parse(text) : null; } catch { }
        if (!res.ok) {
          const msg = parsed?.message || `Update failed (HTTP ${res.status})`;
          throw new Error(msg);
        }
        return parsed || {};
      }
    },
    [MENU_ENDPOINT]
  );

  // 🔌 Fetch menus from API
  const fetchMenus = useCallback(async () => {
    if (!DISPLAY_MENU_ENDPOINT) {
      setErrorMsg('Missing DISPLAY_MENU_ENDPOINT in .env');
      return;
    }
    if (!businessId) {
      setErrorMsg('Missing businessId in route params');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    try {
      const token = (await SecureStore.getItemAsync('auth_token')) || '';
      const url = buildUrl();
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 15000);

      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: controller.signal,
      });
      clearTimeout(tid);

      const text = await res.text();
      if (!res.ok) {
        setErrorMsg(`Failed to load items (HTTP ${res.status}).`);
      } else {
        let parsed;
        try { parsed = text ? JSON.parse(text) : []; } catch { parsed = []; }
        const list = extractItemsFromResponse(parsed).map((x, i) => normalizeItem(x, i));
        setMenus(list);
        setCategories(hydrateCategories(list));
      }
    } catch (e) {
      setErrorMsg(String(e?.message || 'Failed to load items.'));
    } finally {
      setLoading(false);
    }
  }, [DISPLAY_MENU_ENDPOINT, businessId, buildUrl, extractItemsFromResponse, normalizeItem, hydrateCategories]);

  // Auto-load on focus/param change
  useFocusEffect(
    useCallback(() => {
      fetchMenus();
    }, [fetchMenus])
  );

  // Filtered list
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return menus.filter((m) => {
      const matchesCat =
        activeCat === 'All' ||
        String(m.category || '').toLowerCase() === activeCat.toLowerCase();
      const matchesText =
        !q ||
        String(m.name || '').toLowerCase().includes(q) ||
        String(m.category || '').toLowerCase().includes(q);
      return matchesCat && matchesText;
    });
  }, [menus, query, activeCat]);

  // Edit existing item
  const openEdit = (item) => {
    const firstRealCat = categories.find((c) => c !== 'All');
    setForm({
      id: item.id,
      name: item.name,
      category: item.category || firstRealCat || 'General',
      price: String(item.price ?? ''),                       // actual_price
      discount: item.discount !== undefined && item.discount !== null ? String(item.discount) : '',
      taxRate: item.taxRate !== undefined && item.taxRate !== null ? String(item.taxRate) : '',
      currency: item.currency || 'Nu',
      inStock: !!item.inStock,
      image: item.image || '',
    });
    setModalVisible(true);
  };

  // Open Add Menu on the EXISTING Home
  const openAddTab = async () => {
    const payload = {
      openTab: 'Add Menu',
      businessId,
      business_id: businessId,
      business_name: businessName,
      business_logo: businessLogo,
      owner_type:
        route?.params?.owner_type ||
        route?.params?.user?.owner_type ||
        'food',
    };

    try {
      await SecureStore.setItemAsync(KEY_LAST_CTX, JSON.stringify(payload));
    } catch (e) {
      if (__DEV__) console.warn('[MenuScreen] persistCtx failed:', e?.message);
    }

    DeviceEventEmitter.emit('open-tab', { key: 'Add Menu', params: payload });
    navigation.goBack();
  };

  // 📸 Image pickers for EDIT (local-only)
  const pickFromLibraryEdit = async () => {
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
    if (!result.canceled && result.assets?.[0]) {
      setForm((f) => ({ ...f, image: result.assets[0].uri }));
    }
  };

  const takePhotoEdit = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow camera access to take a photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 0.9,
    });
    if (!result.canceled && result.assets?.[0]) {
      setForm((f) => ({ ...f, image: result.assets[0].uri }));
    }
  };

  // Save handler (calls PUT /menus/:id when editing). Sends multipart if a new local image is present.
  const saveItem = async () => {
    const priceNum = Number(form.price);
    const discountNum = form.discount === '' ? '' : Number(form.discount);
    const taxNum = form.taxRate === '' ? '' : Number(form.taxRate);

    if (!form.name.trim()) return Alert.alert('Name required', 'Please enter a menu name.');
    if (Number.isNaN(priceNum)) return Alert.alert('Invalid price', 'Please enter a numeric price.');
    if (discountNum !== '' && Number.isNaN(discountNum)) return Alert.alert('Invalid discount', 'Please enter a numeric discount percentage.');
    if (taxNum !== '' && Number.isNaN(taxNum)) return Alert.alert('Invalid tax', 'Please enter a numeric tax rate.');
    if (!form.category) return Alert.alert('Category required', 'Please choose a category.');

    // Decide image fields
    const image_local_uri = isLocalUri(form.image) ? form.image : null;
    const image_url = !isLocalUri(form.image) ? (form.image || null) : null;

    const payload = {
      business_id: businessId,
      item_name: form.name.trim(),
      category: form.category,
      actual_price: priceNum,
      discount_percentage: discountNum === '' ? null : discountNum,
      tax_rate: taxNum === '' ? null : taxNum,
      currency: form.currency || 'Nu',
      is_available: !!form.inStock ? 1 : 0,
      image_local_uri, // used to trigger multipart
      image_url,       // used for JSON path
    };

    try {
      if (isEditing) {
        const resp = await apiUpdateMenu(form.id, payload);

        // Use server-returned canonical image URL if provided
        const updatedImage =
          resp?.image_url || resp?.item_image_url || resp?.image || image_url || form.image;

        // Optimistic UI update
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
    Alert.alert('Delete item', 'Are you sure you want to delete this item?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            // Sending DELETE request to backend
            const token = await SecureStore.getItemAsync('auth_token');
            const url = `${MENU_ENDPOINT}/${encodeURIComponent(id)}`;

            const res = await fetch(url, {
              method: 'DELETE',
              headers: {
                Accept: 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
            });

            const text = await res.text();
            let parsed = null;
            try {
              parsed = text ? JSON.parse(text) : null;
            } catch { }
            if (!res.ok) {
              const msg = parsed?.message || `Delete failed (HTTP ${res.status})`;
              throw new Error(msg);
            }

            // Optimistically update the UI by filtering out the deleted item
            setMenus((prev) => prev.filter((m) => m.id !== id));

            Alert.alert('Deleted', 'Item has been deleted successfully.');
          } catch (e) {
            Alert.alert('Delete failed', String(e?.message || 'Could not delete the item.'));
          }
        },
      },
    ]);
  };


  const toggleStock = (id, v) => {
    setMenus((prev) => prev.map((m) => (m.id === id ? { ...m, inStock: v } : m)));
  };

  const renderChip = ({ item }) => {
    const active = item === activeCat;
    return (
      <Pressable
        onPress={() => setActiveCat(item)}
        android_ripple={{ color: 'rgba(0,0,0,0.06)', borderless: false }}
        style={({ pressed }) => [
          styles.chip,
          active && styles.chipActive,
          pressed && { transform: [{ scale: 0.98 }] },
        ]}
      >
        <Text style={[styles.chipText, active && styles.chipTextActive]}>{item}</Text>
      </Pressable>
    );
  };

  const renderMenu = ({ item }) => (
    <View style={styles.card}>
      {item.image ? (
        <Image source={{ uri: item.image }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.thumbFallback]}>
          <Ionicons name="image-outline" size={18} color="#64748b" />
        </View>
      )}

      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={styles.title}>{item.name}</Text>
        <Text numberOfLines={1} style={styles.meta}>{item.category || '—'}</Text>
        <Text style={styles.price}>{money(item.price, item.currency || 'Nu')}</Text>
      </View>

      <View style={styles.rightCol}>
        <View style={styles.stockRow}>
          <Text style={styles.stockLabel}>{item.inStock ? 'In stock' : 'Out'}</Text>
        </View>

        <View style={styles.actions}>
          <Pressable
            onPress={() => openEdit(item)}
            style={styles.iconBtn}
            android_ripple={{ color: 'rgba(0,0,0,0.08)', borderless: true }}
          >
            <Ionicons name="create-outline" size={20} color="#0f172a" />
          </Pressable>
          <Pressable
            onPress={() => deleteItem(item.id)}
            style={styles.iconBtn}
            android_ripple={{ color: 'rgba(185,28,28,0.12)', borderless: true }}
          >
            <Ionicons name="trash-outline" size={20} color="#b91c1c" />
          </Pressable>
        </View>
      </View>
    </View>
  );

  // Optional: send menus back when leaving (if parent manages state)
  useEffect(() => {
    return () => {
      if (route?.params?.onSaveMenus) {
        route.params.onSaveMenus(menus);
      }
    };
  }, [menus, route?.params]);

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: (insets.top || 0) + 6 }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.iconBtn}
          android_ripple={{ color: 'rgba(0,0,0,0.08)', borderless: true }}
        >
          <Ionicons name="arrow-back" size={24} color="#0f172a" />
        </Pressable>
        <Text style={styles.headerTitle}>Menu</Text>
        {/* spacer to keep title centered */}
        <View style={{ width: 40 }} />
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color="#64748b" />
        <TextInput
          placeholder="Search menu items"
          placeholderTextColor="#94a3b8"
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
        />
        {query ? (
          <Pressable
            onPress={() => setQuery('')}
            style={styles.clearBtn}
            android_ripple={{ color: 'rgba(0,0,0,0.06)', borderless: true }}
          >
            <Ionicons name="close-circle" size={18} color="#94a3b8" />
          </Pressable>
        ) : null}
      </View>

      {/* Category chips */}
      <View style={styles.chipsRow}>
        <FlatList
          horizontal
          data={categories}
          keyExtractor={(c, i) => `${c}-${i}`}
          renderItem={renderChip}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingRight: 12 }}
        />
      </View>

      {/* List */}
      {loading ? (
        <View style={{ paddingTop: 40, alignItems: 'center' }}>
          <ActivityIndicator />
          <Text style={{ marginTop: 8, color: '#64748b' }}>Loading items…</Text>
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
          contentContainerStyle={{ padding: 16, paddingBottom: (insets.bottom || 0) + 120 }}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="fast-food-outline" size={30} color="#64748b" />
              <Text style={styles.emptyTitle}>No items yet</Text>
              <Text style={styles.emptySub}>Tap “Add item” to create your first one.</Text>
            </View>
          }
        />
      )}

      {/* FAB — opens Add Menu TAB */}
      <Pressable
        style={[styles.fab, { bottom: (insets.bottom || 0) + 24 }]}
        onPress={openAddTab}
        android_ripple={{ color: 'rgba(255,255,255,0.25)', borderless: false }}
      >
        <Ionicons name="add" size={22} color="#fff" />
        <Text style={styles.fabText}>Add item</Text>
      </Pressable>

      {/* Inline Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalWrap}
        >
          <View style={[styles.sheet, { paddingBottom: (insets.bottom || 0) + 16 }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Edit item</Text>
              <Pressable
                onPress={() => setModalVisible(false)}
                style={styles.iconBtn}
                android_ripple={{ color: 'rgba(0,0,0,0.08)', borderless: true }}
              >
                <Ionicons name="close" size={24} color="#0f172a" />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 12 }}>
              <Text style={styles.label}>Name</Text>
              <TextInput
                value={form.name}
                onChangeText={(t) => setForm((f) => ({ ...f, name: t }))}
                placeholder="e.g., Chicken Rice"
                style={styles.input}
              />

              <Text style={styles.label}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {categories.filter(c => c !== 'All').map((c) => (
                  <Pressable
                    key={c}
                    style={({ pressed }) => [
                      styles.catChip,
                      form.category === c && styles.catChipActive,
                      pressed && { transform: [{ scale: 0.98 }] },
                    ]}
                    android_ripple={{ color: 'rgba(0,0,0,0.06)', borderless: false }}
                    onPress={() => setForm((f) => ({ ...f, category: c }))}
                  >
                    <Text style={[styles.catChipText, form.category === c && styles.catChipTextActive]}>{c}</Text>
                  </Pressable>
                ))}
                {/* Quick add category — removed as requested */}
              </ScrollView>

              <View style={styles.row2}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Price</Text>
                  <TextInput
                    value={String(form.price)}
                    onChangeText={(t) => setForm((f) => ({ ...f, price: t.replace(/,/g, '.') }))}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    style={styles.input}
                  />
                </View>
                <View style={{ width: 100 }}>
                  <Text style={styles.label}>Currency</Text>
                  <TextInput
                    value={form.currency}
                    onChangeText={(t) => setForm((f) => ({ ...f, currency: t.trim().slice(0, 4) || 'Nu' }))}
                    placeholder="Nu"
                    style={styles.input}
                  />
                </View>
              </View>

              {/* Added fields — same look/feel */}
              <View style={styles.row2}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Tax rate (%)</Text>
                  <TextInput
                    value={String(form.taxRate)}
                    onChangeText={(t) => setForm((f) => ({ ...f, taxRate: t.replace(/,/g, '.') }))}
                    keyboardType="decimal-pad"
                    placeholder="e.g., 5"
                    style={styles.input}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Discount (%)</Text>
                  <TextInput
                    value={String(form.discount)}
                    onChangeText={(t) => setForm((f) => ({ ...f, discount: t.replace(/,/g, '.') }))}
                    keyboardType="decimal-pad"
                    placeholder="e.g., 10"
                    style={styles.input}
                  />
                </View>
              </View>

              {/* Image picker */}
              <Text style={styles.label}>Image</Text>
              {form.image ? (
                <Image
                  source={{ uri: form.image }}
                  style={{ width: '100%', height: 160, borderRadius: 12, backgroundColor: '#f1f5f9' }}
                  resizeMode="cover"
                />
              ) : (
                <View style={{ width: '100%', height: 160, borderRadius: 12, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="image-outline" size={28} color="#64748b" />
                  <Text style={{ marginTop: 6, color: '#64748b', fontWeight: '700' }}>No image selected</Text>
                </View>
              )}
              <View style={[styles.saveRow, { marginTop: 10 }]}>
                <Pressable
                  style={[styles.btn, styles.btnGhost]}
                  onPress={takePhotoEdit}
                  android_ripple={{ color: 'rgba(0,0,0,0.06)', borderless: false }}
                >
                  <Ionicons name="camera-outline" size={18} color="#0f172a" />
                  <Text style={styles.btnGhostText}>Take photo</Text>
                </Pressable>
                <Pressable
                  style={[styles.btn, styles.btnPrimary]}
                  onPress={pickFromLibraryEdit}
                  android_ripple={{ color: 'rgba(255,255,255,0.25)', borderless: false }}
                >
                  <Ionicons name="images-outline" size={18} color="#fff" />
                  <Text style={styles.btnPrimaryText}>Pick photo</Text>
                </Pressable>
              </View>

              <View style={styles.stockRow2}>
                <Text style={styles.stockLabel2}>Available</Text>
                <Switch
                  value={form.inStock}
                  onValueChange={(v) => setForm((f) => ({ ...f, inStock: v }))}
                  trackColor={{ true: '#a7f3d0', false: '#fee2e2' }}
                  thumbColor={form.inStock ? '#10b981' : '#ef4444'}
                />
              </View>

              <View style={styles.saveRow}>
                {isEditing && (
                  <Pressable
                    style={[styles.btn, styles.btnGhost]}
                    onPress={() => {
                      setModalVisible(false);
                      deleteItem(form.id);
                    }}
                    android_ripple={{ color: 'rgba(0,0,0,0.06)', borderless: false }}
                  >
                    <Ionicons name="trash-outline" size={18} color="#b91c1c" />
                    <Text style={[styles.btnGhostText, { color: '#b91c1c' }]}>Delete</Text>
                  </Pressable>
                )}
                <Pressable
                  style={[styles.btn, styles.btnPrimary]}
                  onPress={saveItem}
                  android_ripple={{ color: 'rgba(255,255,255,0.25)', borderless: false }}
                >
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

// ───────────────────────── Styles ─────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#ffffff' },

  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: '#0f172a' },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 999 },

  searchWrap: {
    marginHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 15,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
  },
  searchInput: { flex: 1, color: '#0f172a', paddingVertical: 0 },
  clearBtn: { padding: 4, borderRadius: 999 },

  chipsRow: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 2 },

  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: '#e2e8f0', marginHorizontal: 4 },
  chipActive: { backgroundColor: '#00b14f' },
  chipText: { color: '#0f172a', fontWeight: '700' },
  chipTextActive: { color: 'white' },

  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  thumb: { width: 54, height: 54, borderRadius: 10, backgroundColor: '#e2e8f0' },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  meta: { fontSize: 12, color: '#64748b', marginTop: 2 },
  price: { fontSize: 14, color: '#0f172a', fontWeight: '800', marginTop: 4 },

  rightCol: { alignItems: 'flex-end', gap: 8 },
  stockRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stockLabel: { fontSize: 12, color: '#0f172a', fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 6 },
  iconBtnSmall: { padding: 6 },

  emptyBox: { alignItems: 'center', paddingTop: 40, gap: 8 },
  emptyTitle: { fontWeight: '800', color: '#0f172a' },
  emptySub: { color: '#64748b' },

  fab: {
    position: 'absolute',
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#00b14f',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  fabText: { color: '#fff', fontWeight: '800' },

  modalWrap: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.35)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: 'white',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 12,
    maxHeight: '90%',
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },

  label: { color: '#0f172a', fontWeight: '700', marginTop: 10, marginBottom: 6 },
  input: { backgroundColor: '#f1f5f9', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, color: '#0f172a' },
  row2: { flexDirection: 'row', gap: 10, marginTop: 4 },
  catChip: { backgroundColor: '#e2e8f0', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  catChipActive: { backgroundColor: '#00b14f' },
  catChipText: { color: '#0f172a', fontWeight: '700' },
  catChipTextActive: { color: '#fff' },

  // (styles for removed "add category" button kept harmlessly; delete if you want)
  catAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ecfeff',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  catAddText: { color: '#00b14f', fontWeight: '800' },

  stockRow2: { marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stockLabel2: { fontSize: 14, color: '#0f172a', fontWeight: '700' },

  saveRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 999 },
  btnPrimary: { backgroundColor: '#00b14f' },
  btnPrimaryText: { color: '#fff', fontWeight: '800' },
  btnGhost: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' },
  btnGhostText: { color: '#0f172a', fontWeight: '800' },
});
