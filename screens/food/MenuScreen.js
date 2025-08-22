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
import { DISPLAY_MENU_ENDPOINT as ENV_DISPLAY_MENU_ENDPOINT } from '@env';

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

export default function MenuScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();

  // ✅ Ensure this screen uses slide-from-right transitions (native-stack)
  useLayoutEffect(() => {
    navigation.setOptions?.({
      animation: 'slide_from_right',
      gestureEnabled: true,
      fullScreenGestureEnabled: true,
      // headerShown: false,
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

  // API bits (added)
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Modal state for edit (keep inline editor for existing items)
  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState({
    id: null,
    name: '',
    category: 'General',
    price: '',
    currency: 'Nu',
    inStock: true,
    image: '',
  });
  const isEditing = !!form?.id;

  // API base (same style as HomeTab)
  const DISPLAY_MENU_ENDPOINT = useMemo(
    () => (ENV_DISPLAY_MENU_ENDPOINT || '').replace(/\/$/, ''),
    []
  );
  const API_ORIGIN = useMemo(() => getOrigin(DISPLAY_MENU_ENDPOINT), [DISPLAY_MENU_ENDPOINT]);

  // Normalize + extract like HomeTab
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
    const numericBase = Number(x?.base_price);
    const price = Number.isFinite(numericBase)
      ? numericBase
      : (typeof x?.base_price === 'number' ? x.base_price : (x?.price ?? ''));
    const absImage = toAbsoluteUrl(
      API_ORIGIN,
      x?.image_url ?? x?.item_image_url ?? x?.item_image ?? x?.image ?? ''
    );
    return {
      id: String(x?.id ?? x?._id ?? x?.menu_id ?? idx),
      name: x?.item_name ?? x?.name ?? x?.title ?? 'Unnamed item',
      title: x?.title ?? undefined,
      price,
      currency: x?.currency ?? 'Nu',
      inStock: (x?.is_available ?? x?.inStock ?? 1) ? true : false,
      category: x?.category_name ?? x?.category ?? x?.categoryName ?? '',
      image: absImage,
      description: x?.description ?? '',
    };
  }, [API_ORIGIN]);

  const buildUrl = useCallback(() => {
    if (!DISPLAY_MENU_ENDPOINT || !businessId) return null;
    // Your backend already supports GET by business id at DISPLAY_MENU_ENDPOINT/{id}
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

  // Filtered list (unchanged)
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

  // Edit existing item (unchanged)
  const openEdit = (item) => {
    const firstRealCat = categories.find((c) => c !== 'All');
    setForm({
      id: item.id,
      name: item.name,
      category: item.category || firstRealCat || 'General',
      price: String(item.price ?? ''),
      currency: item.currency || 'Nu',
      inStock: !!item.inStock,
      image: item.image || '',
    });
    setModalVisible(true);
  };

  // Persist context so Home can always hydrate the header (unchanged)
  const persistCtx = async (payload) => {
    try {
      await SecureStore.setItemAsync(KEY_LAST_CTX, JSON.stringify(payload));
    } catch (e) {
      if (__DEV__) console.warn('[MenuScreen] persistCtx failed:', e?.message);
    }
  };

  // Open Add Menu on the EXISTING Home (unchanged)
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
    navigation.goBack(); // pop with the configured animation
  };

  // Save handler for inline edit (local only here)
  const saveItem = () => {
    const priceNum = Number(form.price);
    if (!form.name.trim()) {
      Alert.alert('Name required', 'Please enter a menu name.');
      return;
    }
    if (Number.isNaN(priceNum)) {
      Alert.alert('Invalid price', 'Please enter a numeric price.');
      return;
    }
    if (!form.category) {
      Alert.alert('Category required', 'Please choose a category.');
      return;
    }

    if (isEditing) {
      setMenus((prev) =>
        prev.map((m) =>
          m.id === form.id
            ? {
                ...m,
                name: form.name.trim(),
                category: form.category,
                price: priceNum,
                currency: form.currency || 'Nu',
                inStock: !!form.inStock,
                image: form.image?.trim() || '',
              }
            : m
        )
      );
      if (!categories.includes(form.category)) {
        setCategories((prev) => ['All', ...new Set([...prev.filter(c => c !== 'All'), form.category])]);
      }
    }

    setModalVisible(false);
  };

  const deleteItem = (id) => {
    Alert.alert('Delete item', 'Are you sure you want to delete this item?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => setMenus((prev) => prev.filter((m) => m.id !== id)),
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
          <Switch
            value={!!item.inStock}
            onValueChange={(v) => toggleStock(item.id, v)}
            trackColor={{ true: '#a7f3d0', false: '#fee2e2' }}
            thumbColor={item.inStock ? '#10b981' : '#ef4444'}
          />
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
        {/* Backdrop (kept as-is; unrelated to opacity-on-press) */}
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
                {/* Quick add category */}
                <Pressable
                  style={({ pressed }) => [
                    styles.catAdd,
                    pressed && { transform: [{ scale: 0.98 }] },
                  ]}
                  android_ripple={{ color: 'rgba(0,177,79,0.12)', borderless: false }}
                  onPress={() => {
                    const nextNum = categories.filter(c => c !== 'All').length + 1;
                    const newCat = `Category ${nextNum}`;
                    if (!categories.includes(newCat)) {
                      setCategories((prev) => [...prev, newCat]);
                    }
                    setForm((f) => ({ ...f, category: newCat }));
                  }}
                >
                  <Ionicons name="add" size={16} color="#00b14f" />
                  <Text style={styles.catAddText}>New</Text>
                </Pressable>
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

              <Text style={styles.label}>Image URL (optional)</Text>
              <TextInput
                value={form.image}
                onChangeText={(t) => setForm((f) => ({ ...f, image: t }))}
                placeholder="https://example.com/photo.jpg"
                style={styles.input}
                autoCapitalize="none"
              />

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
