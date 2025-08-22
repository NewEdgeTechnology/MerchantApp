// GrabMerchantHomeScreen.js — Dynamic merchant header (Expo gradient + live refresh)
import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Image,
  Platform,
  useWindowDimensions,
  AppState,
  DeviceEventEmitter,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import * as SecureStore from 'expo-secure-store';
import { LOGIN_USERNAME_MERCHANT_ENDPOINT } from '@env';

// Tabs / footer
import HomeTab from './HomeTab';
import OrdersTab from './OrderTab';
import MenuTab from './AddMenuTab';
import NotificationsTab from './NotificationsTab';
import PayoutsTab from './PayoutTab';
import MerchantBottomBar from './MerchantBottomBar';
import PromosTab from './PromoTab';

// ───────────────────────── Constants / Keys ─────────────────────────
const KEY_MERCHANT_LOGIN = 'merchant_login';
const KEY_AUTH_TOKEN = 'auth_token';
const KEY_LAST_CTX = 'last_ctx_payload';
const menusKey = (bid) => `menus_by_business_${bid}`;

// ───────────────────────── Helpers ─────────────────────────
const DEFAULT_AVATAR =
  'https://images.unsplash.com/photo-1612198182421-3f5dff0c9b40?q=80&w=400&auto=format&fit=crop';
const DEFAULT_NAME = 'Your Business';

const getBaseOrigin = () => {
  try {
    if (typeof globalThis.URL === 'function' && LOGIN_USERNAME_MERCHANT_ENDPOINT) {
      return new globalThis.URL(LOGIN_USERNAME_MERCHANT_ENDPOINT).origin;
    }
  } catch (e) {
    if (__DEV__) console.warn('[getBaseOrigin] Failed to parse endpoint:', e?.message);
  }
  return '';
};

const normalizeLogoUrl = (raw) => {
  if (!raw || typeof raw !== 'string') return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const origin = getBaseOrigin();
  if (!origin) return raw;
  return `${origin}${raw.startsWith('/') ? '' : '/'}${raw}`;
};

const candidateProfileUrls = () => {
  const base = getBaseOrigin();
  return [`${base}/api/merchant/me`, `${base}/api/merchant/profile`];
};

const money = (n, c = 'Nu') => `${c} ${Number(n ?? 0).toFixed(2)}`;

const DEFAULT_KPIS = {
  salesToday: 0,
  salesCurrency: 'Nu',
  activeOrders: 0,
  cancellations: 0,
  acceptanceRate: 0,
};

/* ───────────────────── Address chip ───────────────────── */
const AddressChip = ({ address = '', onPress = () => {} }) => {
  if (!address) return null;
  return (
    <View style={styles.addressWrap}>
      <TouchableOpacity style={styles.addressChip} activeOpacity={0.85} onPress={onPress}>
        <Ionicons name="location-outline" size={16} color="#00b14f" />
        <Text style={styles.addressText} numberOfLines={1} ellipsizeMode="tail">
          {address}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

export default function GrabMerchantHomeScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const isTablet = width >= 768;
  const isLargePhone = width >= 400 && width < 768;

  const topInset = insets.top || 0;
  const bottomInset = insets.bottom || 0;
  const softKeyPad = Platform.OS === 'android' ? Math.max(bottomInset, 8) : bottomInset;
  const bottomBarBase = isTablet ? 84 : 76;
  const bottomBarHeight = bottomBarBase + softKeyPad;
  const fabBottom = bottomBarHeight + 20;
  const avatarSize = isTablet ? 56 : isLargePhone ? 48 : 44;

  // ───────── Merchant & UI state ─────────
  const [merchantName, setMerchantName] = useState(DEFAULT_NAME);
  const [merchantLogo, setMerchantLogo] = useState(DEFAULT_AVATAR);
  const [profileAvatar, setProfileAvatar] = useState(null);
  const [businessAddress, setBusinessAddress] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const [menus, setMenus] = useState([]);
  const initialOpenTab = route?.params?.openTab || 'Home';
  const initialBid =
    route?.params?.businessId ||
    route?.params?.business_id ||
    null;
  const [activeTab, setActiveTab] = useState(initialOpenTab);
  const [businessId, setBusinessId] = useState(initialBid);
  const [ownerType, setOwnerType] = useState('food'); // 'food' | 'mart'

  const [kpis] = useState({
    salesToday: 324.5,
    salesCurrency: 'Nu',
    activeOrders: 3,
    cancellations: 0,
    acceptanceRate: 0.98,
  });
  const [orders] = useState([
    { id: 'ORD-10234', time: '2 min ago', items: '2× Chicken Rice, 1× Iced Tea', total: 27.5, note: 'Extra chili', type: 'Delivery' },
    { id: 'ORD-10233', time: '7 min ago', items: '1× Beef Burger, 1× Fries', total: 18.9, note: '', type: 'Pickup' },
    { id: 'ORD-10232', time: '12 min ago', items: '3× Latte', total: 15.0, note: 'Less sugar', type: 'Delivery' },
  ]);

  // Hydrate from params (e.g., from MenuScreen navigate)
  useEffect(() => {
    const p = route?.params ?? {};
    const name = (p.business_name || p.user?.business_name || '').trim();
    const logoRaw = p.business_logo || p.user?.business_logo || null;
    const profRaw =
      p.profile_photo ||
      p.user?.profile_photo ||
      p.user?.avatar ||
      p.user?.profile_image ||
      p.user?.photo_url ||
      null;

    const addr =
      p.business_address ||
      p.user?.business_address ||
      p.user?.address ||
      p.user?.location ||
      '';

    const bid =
      p.business_id ||
      p.user?.business_id ||
      p.user?.id ||
      p.businessId ||
      null;

    const kind = (p.owner_type || p.user?.owner_type || '').toString().toLowerCase();

    if (name) setMerchantName(name);
    if (logoRaw) setMerchantLogo(normalizeLogoUrl(logoRaw) || DEFAULT_AVATAR);
    if (profRaw) setProfileAvatar(normalizeLogoUrl(profRaw));
    if (addr) setBusinessAddress(String(addr));
    if (bid) setBusinessId(String(bid));
    if (kind === 'food' || kind === 'mart') setOwnerType(kind);
  }, [route?.params]);

  const loadFromStorage = useCallback(async () => {
    const raw = await SecureStore.getItemAsync(KEY_MERCHANT_LOGIN);
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw);
      const user = parsed?.user ?? parsed;

      setMerchantName(user?.business_name || DEFAULT_NAME);
      setMerchantLogo(normalizeLogoUrl(user?.logo_url || user?.business_logo) || DEFAULT_AVATAR);

      const profRaw =
        user?.profile_photo ||
        user?.avatar ||
        user?.profile_image ||
        user?.photo_url ||
        null;
      if (profRaw) setProfileAvatar(normalizeLogoUrl(profRaw));

      const addr = user?.business_address || user?.address || user?.location || '';
      if (addr) setBusinessAddress(String(addr));

      const bid = user?.business_id || user?.id || parsed?.business_id || null;
      if (bid) setBusinessId(String(bid));

      const kind = (user?.owner_type || '').toString().toLowerCase();
      if (kind === 'food' || kind === 'mart') setOwnerType(kind);

      return true;
    } catch (e) {
      if (__DEV__) console.warn('[loadFromStorage] Bad JSON in SecureStore:', e?.message);
      return false;
    }
  }, []);

  // Read "last context" written by MenuScreen (sticky hydration)
  const loadLastCtx = useCallback(async () => {
    try {
      const raw = await SecureStore.getItemAsync(KEY_LAST_CTX);
      if (!raw) return;
      const ctx = JSON.parse(raw);

      if (ctx.business_name) setMerchantName(String(ctx.business_name));
      if (ctx.business_logo) setMerchantLogo(normalizeLogoUrl(ctx.business_logo) || DEFAULT_AVATAR);
      if (ctx.businessId || ctx.business_id) setBusinessId(String(ctx.businessId || ctx.business_id));
      if (ctx.openTab) setActiveTab(String(ctx.openTab));
      if (ctx.owner_type && (ctx.owner_type === 'food' || ctx.owner_type === 'mart')) {
        setOwnerType(ctx.owner_type);
      }

      // Clear the one-shot flag so it won't re-trigger next focuses
      await SecureStore.setItemAsync(KEY_LAST_CTX, JSON.stringify({ ...ctx, openTab: undefined }));
    } catch (e) {
      if (__DEV__) console.warn('[Home] loadLastCtx failed:', e?.message);
    }
  }, []);

  const getAuthToken = useCallback(async (parsedMaybe) => {
    const tokenFromBlob = parsedMaybe?.token?.access_token || parsedMaybe?.token || null;
    if (typeof tokenFromBlob === 'string' && tokenFromBlob.length > 0) return tokenFromBlob;
    const t = await SecureStore.getItemAsync(KEY_AUTH_TOKEN);
    return t || null;
  }, []);

  const refreshFromServer = useCallback(async () => {
    try {
      const raw = await SecureStore.getItemAsync(KEY_MERCHANT_LOGIN);
      const parsed = raw ? JSON.parse(raw) : null;
      const token = await getAuthToken(parsed);
      if (!token) return;

      for (const url of candidateProfileUrls()) {
        try {
          const res = await fetch(url, {
            headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
          });
          if (!res.ok) continue;
          const data = await res.json();
          const user = data?.user ?? data;

          setMerchantName(user?.business_name || DEFAULT_NAME);
          setMerchantLogo(normalizeLogoUrl(user?.logo_url || user?.business_logo) || DEFAULT_AVATAR);

          const profRaw =
            user?.profile_photo || user?.avatar || user?.profile_image || user?.photo_url || null;
          if (profRaw) setProfileAvatar(normalizeLogoUrl(profRaw));

          const addr = user?.business_address || user?.address || user?.location || '';
          if (addr) setBusinessAddress(String(addr));

          const bid = user?.business_id || user?.id || data?.business_id || null;
          if (bid) setBusinessId(String(bid));

          const kind = (user?.owner_type || '').toString().toLowerCase();
          if (kind === 'food' || kind === 'mart') setOwnerType(kind);

          const merged = { ...(parsed || {}), user: { ...(parsed?.user || {}), ...user } };
          await SecureStore.setItemAsync(KEY_MERCHANT_LOGIN, JSON.stringify(merged));
          break;
        } catch (e) {
          if (__DEV__) console.warn('[refreshFromServer] profile fetch failed:', url, e?.message);
        }
      }
    } catch (e) {
      if (__DEV__) console.warn('[refreshFromServer] unexpected:', e?.message);
    }
  }, [getAuthToken]);

  // Load base data + attempt server refresh
  useEffect(() => { loadFromStorage(); refreshFromServer(); }, [loadFromStorage, refreshFromServer]);

  // On focus: make sure header rehydrates even after coming back from nested routes
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      loadLastCtx();
      loadFromStorage();
      // refreshFromServer(); // optional live refresh
    });
    return unsub;
  }, [navigation, loadLastCtx, loadFromStorage]);

  // App foreground refresh
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') refreshFromServer(); });
    return () => sub.remove();
  }, [refreshFromServer]);

  // Load menus for current business
  const loadMenusFromStorage = useCallback(async (bid) => {
    if (!bid) return;
    try {
      const raw = await SecureStore.getItemAsync(menusKey(bid));
      const arr = raw ? JSON.parse(raw) : [];
      setMenus(Array.isArray(arr) ? arr : []);
    } catch (e) {
      if (__DEV__) console.warn('[loadMenusFromStorage] bad JSON:', e?.message);
      setMenus([]);
    }
  }, []);

  useEffect(() => { if (businessId) loadMenusFromStorage(businessId); }, [businessId, loadMenusFromStorage]);

  // Listeners: merchant + menus update + open tab (event-based fallback)
  useEffect(() => {
    const sub1 = DeviceEventEmitter.addListener('merchant-updated', async () => {
      await loadFromStorage();
      await refreshFromServer();
    });
    const sub2 = DeviceEventEmitter.addListener('menus-updated', async (payload) => {
      const bid = payload?.businessId || businessId;
      if (bid) await loadMenusFromStorage(bid);
    });
    const sub3 = DeviceEventEmitter.addListener('open-tab', async (payload) => {
      const key = payload?.key;
      const params = payload?.params || {};
      if (key) setActiveTab(String(key));
      if (params.businessId || params.business_id) setBusinessId(String(params.businessId || params.business_id));
      if (params.business_name) setMerchantName(String(params.business_name));
      if (params.business_logo) setMerchantLogo(normalizeLogoUrl(params.business_logo) || DEFAULT_AVATAR);
      if (params.owner_type && (params.owner_type === 'food' || params.owner_type === 'mart')) {
        setOwnerType(params.owner_type);
      }
      try { await SecureStore.setItemAsync(KEY_LAST_CTX, JSON.stringify(params)); } catch {}
    });
    return () => { sub1.remove(); sub2.remove(); sub3.remove(); };
  }, [loadFromStorage, refreshFromServer, businessId, loadMenusFromStorage]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshFromServer();
    if (businessId) await loadMenusFromStorage(businessId);
    setRefreshing(false);
  }, [refreshFromServer, businessId, loadMenusFromStorage]);

  // Hide welcome once user leaves Home
  useEffect(() => { if (activeTab !== 'Home' && showWelcome) setShowWelcome(false); }, [activeTab, showWelcome]);

  // Param-based tab opening (with nonce as trigger). We DO NOT clear the business_* params.
  useEffect(() => {
    const p = route?.params;
    if (!p?.openTab) return;

    setActiveTab(String(p.openTab));
    if (p.businessId || p.business_id) setBusinessId(String(p.businessId || p.business_id));
    if (p.business_name) setMerchantName(String(p.business_name));
    if (p.business_logo) setMerchantLogo(normalizeLogoUrl(p.business_logo) || DEFAULT_AVATAR);
    if (p.owner_type && (p.owner_type === 'food' || p.owner_type === 'mart')) {
      setOwnerType(p.owner_type);
    }

    navigation.setParams({ openTab: undefined, nonce: undefined }); // clear only the one-shot fields
  }, [route?.params?.nonce]);

  const Header = () => (
    <LinearGradient
      colors={['#00b14f', '#4de6de']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        paddingTop: (isTablet ? 24 : 18) + topInset,
        paddingBottom: isTablet ? 16 : 12,
        paddingHorizontal: isTablet ? 24 : 18,
      }}
    >
      {showWelcome && activeTab === 'Home' && (<Text style={styles.hi}>Welcome back</Text>)}

      <View style={styles.headerRow}>
        <View style={styles.inlineRow}>
          <Image
            source={{ uri: merchantLogo || DEFAULT_AVATAR }}
            style={[styles.avatar, { width: avatarSize, height: avatarSize }]}
            onError={() => setMerchantLogo(DEFAULT_AVATAR)}
          />
          <Text style={[styles.merchantName, { marginLeft: 6 }]} numberOfLines={1} ellipsizeMode="tail">
            {merchantName || DEFAULT_NAME}
          </Text>
        </View>

        <View style={styles.inlineRow}>
          {profileAvatar ? (
            <Image
              source={{ uri: profileAvatar }}
              style={[styles.avatar, { width: avatarSize, height: avatarSize }]}
              onError={() => setProfileAvatar(null)}
            />
          ) : (
            <Ionicons name="person-circle" size={avatarSize} color="#fff" />
          )}
        </View>
      </View>

      <View style={{ marginTop: 10, alignItems: 'center', width: '100%' }}>
        <AddressChip address={businessAddress} onPress={() => {}} />
      </View>
    </LinearGradient>
  );

  const NAV_ITEMS = [
    { key: 'Home', label: 'Home', icon: 'home-outline' },
    { key: 'Orders', label: 'Orders', icon: 'receipt-outline' },
    { key: 'Add Menu', label: 'Add Menu', icon: 'add' },
    { key: 'Notifications', label: 'Notifications', icon: 'notifications-outline' },
    { key: 'Payouts', label: 'Payouts', icon: 'card-outline' },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['left','right']}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {activeTab === 'Home' && (
        <ScrollView
          contentContainerStyle={[styles.container, { paddingBottom: bottomBarHeight + 20 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
        >
          <Header />
          <HomeTab
            isTablet={isTablet}
            kpis={kpis ?? DEFAULT_KPIS}
            orders={orders ?? []}
            money={money}
            onPressNav={setActiveTab}
            businessId={businessId}
            menus={menus}
          />
        </ScrollView>
      )}

      {activeTab === 'Promos' && (
        <View style={[styles.tabWrap, { paddingBottom: bottomBarHeight }]}>
          <Header />
          <PromosTab isTablet={isTablet} businessId={businessId} />
        </View>
      )}

      {activeTab === 'Orders' && (
        <View style={[styles.tabWrap, { paddingBottom: bottomBarHeight }]}>
          <Header />
          <OrdersTab isTablet={isTablet} orders={orders ?? []} money={money} businessId={businessId} />
        </View>
      )}

      {activeTab === 'Add Menu' && (
        <View style={[styles.tabWrap, { paddingBottom: bottomBarHeight }]}>
          <Header />
          <MenuTab
            isTablet={isTablet}
            businessId={businessId}
            ownerType={ownerType}
            businessName={merchantName}
            logoUrl={merchantLogo}
          />
        </View>
      )}

      {activeTab === 'Notifications' && (
        <View style={[styles.tabWrap, { paddingBottom: bottomBarHeight }]}>
          <Header />
          <NotificationsTab isTablet={isTablet} businessId={businessId} />
        </View>
      )}

      {activeTab === 'Payouts' && (
        <View style={[styles.tabWrap, { paddingBottom: bottomBarHeight }]}>
          <Header />
          <PayoutsTab isTablet={isTablet} businessId={businessId} />
        </View>
      )}

      {activeTab === 'Home' && (
        <TouchableOpacity
          style={[styles.fab, { bottom: fabBottom }]}
          onPress={() => setActiveTab('Promos')}
          activeOpacity={0.9}
        >
          <Ionicons name="pricetag-outline" size={isTablet ? 24 : 22} color="#fff" />
          <Text style={[styles.fabText, { fontSize: isTablet ? 14 : 13 }]}>
            Create promo
          </Text>
        </TouchableOpacity>
      )}

      <MerchantBottomBar
        items={NAV_ITEMS}
        activeKey={activeTab}
        onChange={setActiveTab}
        isTablet={isTablet}
      />
    </SafeAreaView>
  );
}

// ───────────────────────── Styles ─────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#00b14f' },
  container: { backgroundColor: '#f6f7f8' },

  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  inlineRow: { flexDirection: 'row', alignItems: 'center' },
  hi: { fontSize: 20, color: '#e8fff6', opacity: 0.9, fontWeight: '900', marginBottom: 2 },
  merchantName: { color: 'white', fontWeight: '700' },
  avatar: { borderRadius: 12, backgroundColor: '#fff' },

  addressWrap: { marginTop: 10, alignItems: 'center', width: '100%' },
  addressChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#ffffff', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8,
    maxWidth: '100%',
    shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  addressText: { color: '#2d2d2d', fontSize: 13, fontWeight: '700', maxWidth: 260 },

  tabWrap: { flex: 1, backgroundColor: '#f6f7f8' },
  fab: {
    position: 'absolute', right: 16, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#00b14f', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 999,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 5,
  },
  fabText: { color: '#fff', fontWeight: '700' },
});
