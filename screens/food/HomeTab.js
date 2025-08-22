// screens/food/HomeTab.js
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  BackHandler,
  Platform,
  DeviceEventEmitter,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useNavigation, useFocusEffect, useRoute } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import { DISPLAY_MENU_ENDPOINT as ENV_DISPLAY_MENU_ENDPOINT } from '@env';

const KpiCard = ({ icon, label, value, sub, isTablet }) => (
  <View style={[styles.kpiCard, { width: isTablet ? '23.5%' : '48%' }]}>
    <View style={styles.kpiIconWrap}>
      <Ionicons name={icon} size={isTablet ? 20 : 18} color="#0f172a" />
    </View>
    <Text style={[styles.kpiLabel, { fontSize: isTablet ? 13 : 12 }]}>{label}</Text>
    <Text style={[styles.kpiValue, { fontSize: isTablet ? 22 : 20 }]}>{value}</Text>
    {!!sub && <Text style={[styles.kpiSub, { fontSize: isTablet ? 12 : 11 }]}>{sub}</Text>}
  </View>
);

const Shortcut = ({ icon, label, onPress = () => {}, isTablet }) => (
  <TouchableOpacity style={styles.shortcut} onPress={onPress} activeOpacity={0.9}>
    <View style={styles.shortcutIcon}>
      <Ionicons name={icon} size={isTablet ? 22 : 20} color="#0f172a" />
    </View>
    <Text style={[styles.shortcutText, { fontSize: isTablet ? 13 : 12 }]}>{label}</Text>
  </TouchableOpacity>
);

const MenuItem = ({ item, isTablet, money }) => {
  const price =
    typeof item?.price === 'number'
      ? money(item.price, item.currency || 'Nu')
      : item?.price ?? '';
  const inStock = item?.inStock ?? true;
  const cat = item?.category || item?.categoryName || '';

  return (
    <View style={styles.menuCard}>
      {item?.image ? (
        <Image source={{ uri: item.image }} style={styles.menuThumb} />
      ) : (
        <View style={[styles.menuThumb, styles.menuThumbFallback]}>
          <Ionicons name="image-outline" size={18} color="#64748b" />
        </View>
      )}

      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={[styles.menuTitle, { fontSize: isTablet ? 15 : 14 }]}>
          {item?.name || item?.title || 'Unnamed item'}
        </Text>
        {!!cat && (
          <Text numberOfLines={1} style={[styles.menuMeta, { fontSize: isTablet ? 12 : 11 }]}>
            {cat}
          </Text>
        )}
        {!!price && <Text style={[styles.menuPrice, { fontSize: isTablet ? 14 : 13 }]}>{price}</Text>}
      </View>

      <View style={[styles.stockPill, { backgroundColor: inStock ? '#dcfce7' : '#fee2e2' }]}>
        <Text style={[styles.stockText, { color: inStock ? '#166534' : '#991b1b', fontSize: isTablet ? 12 : 11 }]}>
          {inStock ? 'In stock' : 'Out of stock'}
        </Text>
      </View>
    </View>
  );
};

// Utils
function toAbsoluteUrl(origin, pathOrUrl) {
  if (!pathOrUrl) return '';
  const s = String(pathOrUrl);
  if (/^https?:\/\//i.test(s)) return s;
  const rel = s.startsWith('/') ? s : `/${s}`;
  return `${origin}${rel}`;
}
function getOrigin(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    const m = String(url).match(/^(https?:\/\/[^/]+)/i);
    return m ? m[1] : '';
  }
}

export default function HomeTab({
  isTablet,
  kpis = {},
  menus = [],
  money: moneyProp,
  onPressNav = () => {},
}) {
  const navigation = useNavigation();
  const route = useRoute();

  // SAME resolution as MenuTab (no env/default)
  const BUSINESS_ID = useMemo(() => {
    const p = route?.params ?? {};
    return (p.businessId || p.business_id || p.merchant?.businessId || p.merchant?.id || '')
      .toString()
      .trim();
  }, [route?.params]);

  const [allMenus, setAllMenus] = useState(() => (Array.isArray(menus) ? menus : []));
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    setAllMenus(Array.isArray(menus) ? menus : []);
  }, [menus]);

  // Android back
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return undefined;
      const onBack = () => {
        if (navigation.canGoBack()) {
          navigation.goBack();
          return true;
        }
        return false;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [navigation])
  );

  const DISPLAY_MENU_ENDPOINT = useMemo(
    () => (ENV_DISPLAY_MENU_ENDPOINT || '').replace(/\/$/, ''),
    []
  );
  const API_ORIGIN = useMemo(() => getOrigin(DISPLAY_MENU_ENDPOINT), [DISPLAY_MENU_ENDPOINT]);

  const extractItemsFromResponse = useCallback((raw) => {
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.data)) return raw.data; // your API shape
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
      categoryName: x?.category_name ?? x?.category ?? x?.categoryName ?? '',
      image: absImage,
      description: x?.description ?? '',
    };
  }, [API_ORIGIN]);

  const buildUrl = useCallback(() => {
    if (!DISPLAY_MENU_ENDPOINT || !BUSINESS_ID) return null;
    return `${DISPLAY_MENU_ENDPOINT}/${encodeURIComponent(BUSINESS_ID)}`;
  }, [DISPLAY_MENU_ENDPOINT, BUSINESS_ID]);

  const fetchMenus = useCallback(async () => {
    if (!DISPLAY_MENU_ENDPOINT) {
      setErrorMsg('Missing DISPLAY_MENU_ENDPOINT in .env');
      return;
    }
    if (!BUSINESS_ID) {
      setErrorMsg('Missing businessId. Pass it via route params.');
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
        setErrorMsg(`Failed to load menu items (HTTP ${res.status}).`);
      } else {
        let parsed;
        try { parsed = text ? JSON.parse(text) : []; } catch { parsed = []; }
        const list = extractItemsFromResponse(parsed).map((x, i) => normalizeItem(x, i));
        setAllMenus(list);
      }
    } catch (e) {
      setErrorMsg(String(e?.message || 'Failed to load menu items.'));
    } finally {
      setLoading(false);
    }
  }, [DISPLAY_MENU_ENDPOINT, BUSINESS_ID, buildUrl, extractItemsFromResponse, normalizeItem]);

  // initial + on focus
  useFocusEffect(
    useCallback(() => {
      fetchMenus();
    }, [fetchMenus])
  );

  // Live: new item broadcast -> optimistic + re-sync
  useFocusEffect(
    useCallback(() => {
      const sub = DeviceEventEmitter.addListener('menu:item:added', (newItem) => {
        if (!newItem) return;
        const normalizedNew = {
          ...newItem,
          price:
            typeof newItem?.price === 'number'
              ? newItem.price
              : (Number(newItem?.price) || (newItem?.price ?? '')),
          image: toAbsoluteUrl(API_ORIGIN, newItem?.image),
        };
        setAllMenus((prev) => {
          const newId = String(normalizedNew?.id ?? normalizedNew?._id ?? normalizedNew?.slug ?? '');
          const next = [...prev];
          if (newId) {
            const idx = next.findIndex((x, i) => String(x?.id ?? x?._id ?? x?.slug ?? i) === newId);
            if (idx >= 0) next[idx] = normalizedNew;
            else next.unshift(normalizedNew);
          } else {
            next.unshift(normalizedNew);
          }
          return next;
        });
        fetchMenus();
      });
      return () => sub.remove();
    }, [API_ORIGIN, fetchMenus])
  );

  // money / pct helpers
  const fmtMoney = useCallback(
    (n, ccy = 'Nu') =>
      (typeof moneyProp === 'function' ? moneyProp(n, ccy) : `${ccy} ${Number(n || 0).toFixed(2)}`),
    [moneyProp]
  );
  const pct = useCallback((v) => `${Math.round((Number.isFinite(v) ? v : 0) * 100)}%`, []);

  const salesToday = Number(kpis?.salesToday ?? 0);
  const salesCurrency = kpis?.salesCurrency || 'Nu';
  const activeOrders = Number(kpis?.activeOrders ?? 0);
  const acceptanceRate = Number.isFinite(kpis?.acceptanceRate) ? kpis.acceptanceRate : 0;
  const cancellations = Number(kpis?.cancellations ?? 0);

  const keyExtractor = useCallback(
    (item, i) => String(item?.id ?? item?._id ?? item?.slug ?? item?.name ?? i),
    []
  );
  const renderItem = useCallback(
    ({ item }) => <MenuItem isTablet={isTablet} money={fmtMoney} item={item} />,
    [isTablet, fmtMoney]
  );

  // ——— Only show up to 3 items on Home ———
  const visibleMenus = useMemo(() => allMenus.slice(0, 3), [allMenus]);
  const showCountNote = allMenus.length > 3;

  // Header / Footer / Empty
  const ListHeaderComponent = useMemo(() => (
    <View>
      {/* KPIs */}
      <View style={[styles.kpiRow, { marginHorizontal: isTablet ? 20 : 12, marginTop: isTablet ? 20 : 16 }]}>
        <KpiCard isTablet={isTablet} icon="cash-outline" label="Today" value={fmtMoney(salesToday, salesCurrency)} sub="Sales" />
        <KpiCard isTablet={isTablet} icon="receipt-outline" label="Active" value={String(activeOrders)} sub="Orders" />
        <KpiCard isTablet={isTablet} icon="trending-up-outline" label="Accept" value={pct(acceptanceRate)} sub="Rate" />
        <KpiCard isTablet={isTablet} icon="alert-circle-outline" label="Cancel" value={String(cancellations)} sub="Today" />
      </View>

      {/* Shortcuts */}
      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <Text style={[styles.sectionTitle, { fontSize: isTablet ? 18 : 16 }]}>Quick actions</Text>
          <TouchableOpacity style={styles.linkRow} onPress={() => {}}>
            <Text style={[styles.linkText, { fontSize: isTablet ? 14 : 13 }]}>Manage</Text>
            <Ionicons name="chevron-forward" size={isTablet ? 18 : 16} color="#00b14f" />
          </TouchableOpacity>
        </View>

        <View style={[styles.shortcutsRow, { flexWrap: 'wrap' }]}>
          <Shortcut
            isTablet={isTablet}
            icon="restaurant-outline"
            label="Menu"
            onPress={() => navigation.navigate('MenuScreen', { businessId: BUSINESS_ID || 'YOUR_BUSINESS_ID' })}
          />
          <Shortcut isTablet={isTablet} icon="pricetags-outline" label="Promotions" onPress={() => onPressNav('Promos')} />
          <Shortcut isTablet={isTablet} icon="card-outline" label="Payouts" onPress={() => onPressNav('Payouts')} />
          <Shortcut isTablet={isTablet} icon="settings-outline" label="Settings" onPress={() => {}} />
        </View>
      </View>

      {/* Added Menus header row */}
      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <Text style={[styles.sectionTitle, { fontSize: isTablet ? 18 : 16 }]}>Added menus</Text>
          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => navigation.navigate('MenuScreen', { businessId: BUSINESS_ID || 'YOUR_BUSINESS_ID' })}
          >
            <Text style={[styles.linkText, { fontSize: isTablet ? 14 : 13 }]}>View all</Text>
            <Ionicons name="chevron-forward" size={isTablet ? 18 : 16} color="#00b14f" />
          </TouchableOpacity>
        </View>
        {showCountNote && (
          <Text style={styles.countNote}>Showing 3 of {allMenus.length} items</Text>
        )}
      </View>
    </View>
  ), [
    isTablet, fmtMoney, salesToday, salesCurrency, activeOrders,
    acceptanceRate, cancellations, pct, navigation, BUSINESS_ID,
    onPressNav, allMenus.length, showCountNote
  ]);

  const ListFooterComponent = useMemo(() => (
    <View>
      {/* Announcements */}
      <View style={[styles.section, { marginBottom: 75 }]}>
        <View style={styles.sectionHead}>
          <Text style={[styles.sectionTitle, { fontSize: isTablet ? 18 : 16 }]}>Announcements</Text>
        </View>
        <View style={styles.announce}>
          <Ionicons name="megaphone-outline" size={isTablet ? 20 : 18} color="#0f172a" />
          <View style={{ flex: 1 }}>
            <Text style={[styles.announceTitle, { fontSize: isTablet ? 15 : 14 }]}>Lower delivery fees this weekend</Text>
            <Text style={[styles.announceSub, { fontSize: isTablet ? 13 : 12 }]}>
              Expect higher demand from Fri–Sun. Prep your inventory and staff.
            </Text>
          </View>
          <TouchableOpacity style={styles.badge} onPress={() => {}}>
            <Text style={[styles.badgeText, { fontSize: isTablet ? 12 : 11 }]}>Details</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  ), [isTablet]);

  const ListEmptyComponent = useMemo(() => {
    if (loading) {
      return (
        <View style={[styles.section, styles.emptyBox]}>
          <ActivityIndicator />
          <Text style={[styles.emptySub, { marginTop: 6 }]}>Loading menu items…</Text>
        </View>
      );
    }
    if (errorMsg) {
      return (
        <View style={[styles.section, styles.emptyBox]}>
          <Ionicons name="warning-outline" size={20} color="#ef4444" />
          <Text style={[styles.emptyTitle, { color: '#ef4444' }]}>{errorMsg}</Text>
          <TouchableOpacity onPress={fetchMenus} style={[styles.badge, { marginTop: 8 }]}>
            <Text style={styles.badgeText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={[styles.section, styles.emptyBox]}>
        <Ionicons name="fast-food-outline" size={isTablet ? 30 : 28} color="#0f172a" />
        <Text style={[styles.emptyTitle, { fontSize: isTablet ? 15 : 14 }]}>No menu items yet</Text>
        <Text style={[styles.emptySub, { fontSize: isTablet ? 13 : 12 }]}>Add your first item to start selling.</Text>
      </View>
    );
  }, [loading, errorMsg, fetchMenus, isTablet]);

  return (
    <FlatList
      data={visibleMenus}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      ItemSeparatorComponent={() => <View style={{ height: 12, marginHorizontal: 16 }} />}
      ListHeaderComponent={ListHeaderComponent}
      ListFooterComponent={ListFooterComponent}
      ListEmptyComponent={ListEmptyComponent}
      contentContainerStyle={{ paddingBottom: 12 }}

      scrollEnabled={false}
      nestedScrollEnabled={false}

      removeClippedSubviews={false}
      refreshing={loading}
      onRefresh={fetchMenus}
    />
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 16, paddingHorizontal: 16 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle: { fontWeight: '700', color: '#0f172a' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  linkText: { color: '#00b14f', fontWeight: '600' },
  countNote: { color: '#64748b', marginTop: -6, paddingHorizontal: 2 },

  kpiRow: { marginTop: -10, backgroundColor: 'transparent', flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kpiCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 14,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  kpiIconWrap: { alignSelf: 'flex-start', padding: 8, borderRadius: 999, backgroundColor: '#f1f5f9', marginBottom: 8 },
  kpiLabel: { color: '#6b7280' },
  kpiValue: { fontWeight: '700', marginTop: 2, color: '#0f172a' },
  kpiSub: { color: '#9ca3af', marginTop: 2 },

  shortcutsRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 16 },
  shortcut: {
    flex: 1, 
    backgroundColor: '#fff', 
    borderRadius: 16, 
    paddingVertical: 14, 
    alignItems: 'center', 
    justifyContent: 'center',
    shadowColor: '#000', 
    shadowOpacity: 0.05, 
    shadowRadius: 8, 
    shadowOffset: { width: 0, height: 2 }, 
    elevation: 2,
    marginHorizontal: 0,
  },
  shortcutIcon: { padding: 10, borderRadius: 999, backgroundColor: '#f1f5f9', marginBottom: 8 },
  shortcutText: { fontWeight: '600', color: '#0f172a' },

  menuCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
    marginHorizontal: 16,
  },
  menuThumb: { width: 48, height: 48, borderRadius: 8, backgroundColor: '#e2e8f0' },
  menuThumbFallback: { alignItems: 'center', justifyContent: 'center' },
  menuTitle: { fontWeight: '700', color: '#111827' },
  menuMeta: { color: '#6b7280', marginTop: 2 },
  menuPrice: { color: '#0f172a', fontWeight: '700', marginTop: 4 },
  stockPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, marginLeft: 8 },
  stockText: { fontWeight: '700' },

  emptyBox: { backgroundColor: '#fff', borderRadius: 16, padding: 24, alignItems: 'center', gap: 6, marginHorizontal: 16 },
  emptyTitle: { fontWeight: '700', color: '#0f172a' },
  emptySub: { color: '#6b7280' },

  announce: {
    backgroundColor: '#fff', borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', 
    gap: 12,  
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
    marginHorizontal: 0,
  },
  announceTitle: { fontWeight: '700', color: '#0f172a' },
  announceSub: { color: '#475569' },
  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: '#00b14f' },
  badgeText: { color: '#fff', fontWeight: '700' },
});
