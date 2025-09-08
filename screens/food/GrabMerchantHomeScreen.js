// screens/food/GrabMerchantHomeScreen.js — flicker-free image loading (keeps last good URL) + safe navigation
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Platform,
  useWindowDimensions,
  AppState,
  DeviceEventEmitter,
  Image,
  ActivityIndicator,
  BackHandler,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import * as SecureStore from 'expo-secure-store';
import { LOGIN_USERNAME_MERCHANT_ENDPOINT, PROFILE_ENDPOINT, BUSINESS_DETAILS } from '@env';

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

const DEFAULT_DEV_ORIGIN = Platform.select({
  android: 'http://10.0.2.2:3000',
  ios: 'http://localhost:3000',
  default: 'http://localhost:3000',
});

function normalizeHost(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    if (Platform.OS === 'android' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) {
      u.hostname = '10.0.2.2';
    }
    return u.toString();
  } catch {
    return url;
  }
}
function getOrigin(url) {
  try { return new URL(url).origin; } catch { return ''; }
}
function resolveImageUrl(maybeRelative) {
  if (!maybeRelative) return null;
  const src = String(maybeRelative);
  if (/^https?:\/\//i.test(src)) return src;
  const origin = getOrigin(normalizeHost(PROFILE_ENDPOINT || DEFAULT_DEV_ORIGIN)) || DEFAULT_DEV_ORIGIN;
  return `${origin}${src.startsWith('/') ? '' : '/'}${src}`;
}
async function fetchJSON(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { }
    if (!res.ok) {
      const msg = (json && (json.message || json.error)) || text || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return json;
  } finally {
    clearTimeout(tid);
  }
}

// Where to GET the logged-in merchant (token auth) if needed
const getBaseOrigin = () => {
  try {
    if (typeof globalThis.URL === 'function' && LOGIN_USERNAME_MERCHANT_ENDPOINT) {
      return new globalThis.URL(LOGIN_USERNAME_MERCHANT_ENDPOINT).origin;
    }
  } catch { }
  return DEFAULT_DEV_ORIGIN;
};
const candidateProfileUrls = () => {
  const base = normalizeHost(getBaseOrigin());
  return [
    `${base}/api/merchant/me`,
    `${base}/api/merchant/profile`,
    `${base}/api/profile/me`,
  ];
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
const AddressChip = ({ address = '', onPress = () => { } }) => {
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

/* ───────────────────── Asset URL discovery (no ASSETS_BASE) ───────────────────── */
const devPortVariants = (origin) => {
  try {
    const u = new URL(origin);
    const out = new Set([u.origin]);
    const ports = new Set([u.port || '', '3000', '8080', '8000']);
    ports.forEach((p) => {
      try {
        const u2 = new URL(origin);
        u2.port = p || '';
        out.add(u2.origin);
      } catch {}
    });
    return Array.from(out);
  } catch {
    return [origin];
  }
};

const collectOrigins = () => {
  const baseOrigins = [];
  const push = (v) => {
    if (!v) return;
    const o = getOrigin(normalizeHost(v));
    if (o) baseOrigins.push(o);
  };
  push(PROFILE_ENDPOINT);
  push(LOGIN_USERNAME_MERCHANT_ENDPOINT);
  push(BUSINESS_DETAILS);
  baseOrigins.push(DEFAULT_DEV_ORIGIN);
  const expanded = baseOrigins.flatMap(devPortVariants);
  return Array.from(new Set(expanded));
};

const pathFrom = (input) => {
  if (!input) return '';
  try {
    const u = new URL(normalizeHost(input));
    return u.pathname.startsWith('/') ? u.pathname : `/${u.pathname}`;
  } catch {
    const s = String(input);
    return s.startsWith('/') ? s : `/${s}`;
  }
};

const expandPathVariants = (p) => {
  const out = new Set([p]);
  const prefixes = ['', '/api', '/public', '/storage', '/static', '/files', '/file'];
  prefixes.forEach((pre) => {
    const combined = `${pre}${p}`.replace(/\/{2,}/g, '/');
    out.add(combined.startsWith('/') ? combined : `/${combined}`);
  });
  if (p.startsWith('/uploads/')) {
    ['/public', '/storage', '/static'].forEach((pre) => out.add(`${pre}${p}`));
  }
  return Array.from(out);
};

const buildImageCandidates = (input) => {
  if (!input) return [];
  const origins = collectOrigins();
  const first = /^https?:\/\//i.test(String(input)) ? [normalizeHost(input)] : [];
  const p = pathFrom(input);
  const pathVars = expandPathVariants(p);

  const cands = [...first];
  origins.forEach((o) => {
    pathVars.forEach((pv) => cands.push(`${o}${pv}`));
  });

  return Array.from(new Set(cands));
};

// Probe helper to avoid spamming <Image /> with 404s
const probeUrl = async (url, timeoutMs = 3500) => {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resH = await fetch(url, { method: 'HEAD', signal: controller.signal });
    if (resH.ok) return true;
  } catch {}
  try {
    const resG = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' }, signal: controller.signal });
    return resG.ok;
  } catch {} finally {
    clearTimeout(tid);
  }
  return false;
};

/* ───────────────────── Flicker-free CascadingImage ───────────────────── */
// global cache: sourcePath -> working url (string) or null (confirmed missing)
const imageResolveCache = new Map();

const CascadingImage = ({
  sourcePath,
  style,
  fallbackUri,
  onFinalError,
  onLoadStart,
  onLoadEnd,
  testID,
}) => {
  const candidates = useMemo(() => buildImageCandidates(sourcePath), [sourcePath]);

  // initialize from cache so we don't flicker on re-mount/focus
  const [uri, setUri] = useState(() => imageResolveCache.get(sourcePath) ?? null);
  const lastGoodRef = useRef(imageResolveCache.get(sourcePath) ?? null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // No source: show last good or fallback
      if (!sourcePath) {
        setUri(lastGoodRef.current || fallbackUri || null);
        return;
      }

      // Cached resolution? Use it immediately
      if (imageResolveCache.has(sourcePath)) {
        const cached = imageResolveCache.get(sourcePath); // string or null
        if (cached) lastGoodRef.current = cached;
        setUri(cached || lastGoodRef.current || fallbackUri || null);
        return;
      }

      // Keep current image visible while probing candidates
      for (const cand of candidates) {
        const ok = await probeUrl(cand);
        if (cancelled) return;
        if (ok) {
          imageResolveCache.set(sourcePath, cand);
          lastGoodRef.current = cand;
          setUri(cand);
          return;
        }
      }

      // Nothing worked: cache the miss and keep prior/fallback
      imageResolveCache.set(sourcePath, null);
      setUri(lastGoodRef.current || fallbackUri || null);
      onFinalError?.({ message: 'No candidate URL worked', candidates });
    })();

    return () => { cancelled = true; };
  }, [sourcePath, candidates, fallbackUri, onFinalError]);

  if (!uri && !fallbackUri) {
    return <View style={[style, { backgroundColor: '#e5e7eb', borderRadius: 12 }]} testID={testID} />;
  }

  return (
    <Image
      testID={testID}
      style={style}
      source={{ uri: uri || fallbackUri }}
      onLoadStart={onLoadStart}
      onLoadEnd={onLoadEnd}
      // If server drops after probe, fall back but don't blank
      onError={() => setUri(lastGoodRef.current || fallbackUri || null)}
    />
  );
};

// ✅ check if a route exists in a navigator
const routeExists = (nav, name) => {
  try {
    return !!nav?.getState?.()?.routeNames?.includes(name);
  } catch {
    return false;
  }
};

// ✅ robust navigation that works with nested stacks
const safeNavigate = (navigation, target, params, fallbackTarget) => {
  if (routeExists(navigation, target)) { navigation.navigate(target, params); return; }
  const parent = navigation.getParent?.();
  if (routeExists(parent, target)) { parent.navigate(target, params); return; }
  const pState = parent?.getState?.();
  if (pState?.routeNames?.length) {
    for (const rn of pState.routeNames) {
      try { parent.navigate(rn, { screen: target, params }); return; } catch {}
    }
  }
  if (fallbackTarget) {
    if (routeExists(navigation, fallbackTarget)) { navigation.navigate(fallbackTarget, params); return; }
    if (routeExists(parent, fallbackTarget)) { parent.navigate(fallbackTarget, params); return; }
  }
  console.warn(`[Nav] Could not find a route named "${target}". Make sure it’s registered.`);
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
  const [businessLicense, setBusinessLicense] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const [menus, setMenus] = useState([]);
  const [loadingAvatar, setLoadingAvatar] = useState(false);
  const initialOpenTab = route?.params?.openTab || 'Home';
  const initialBid = route?.params?.businessId || route?.params?.business_id || null;
  const [activeTab, setActiveTab] = useState(initialOpenTab);
  const [businessId, setBusinessId] = useState(initialBid);
  const [ownerType, setOwnerType] = useState('food');

  const [userId, setUserId] = useState(
    route?.params?.user_id ? String(route.params.user_id) : ''
  );

  // NEW: carry through full auth context (token/profile/rawLogin/userPayload)
  const [authContext, setAuthContext] = useState(route?.params?.authContext || null);

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

  // Build profile endpoint like AccountSettings
  const buildProfileUrl = useCallback((uid) => {
    if (!uid || !PROFILE_ENDPOINT) return '';
    const base = normalizeHost((PROFILE_ENDPOINT || '').trim()); // e.g., http://localhost:3000/api/profile
    return `${base.replace(/\/+$/, '')}/${encodeURIComponent(String(uid))}`;
  }, []);
  // Hydrate from SecureStore (fast)
  const loadFromStore = useCallback(async () => {
    try {
      const raw = await SecureStore.getItemAsync(KEY_MERCHANT_LOGIN);
      if (!raw) return;
      const blob = JSON.parse(raw);
      const user = blob?.user ?? blob;

      // discover userId if missing
      const idCandidates = [
        blob?.user?.user_id,
        blob?.user?.id,
        blob?.user_id,
        blob?.id,
        blob?.merchant?.user_id,
        blob?.merchant?.id,
      ].filter(v => v !== undefined && v !== null && v !== '');
      if (!userId && idCandidates.length) setUserId(String(idCandidates[0]));

      // Only use business_name for title
      const nameCandidate = blob?.business_name || user?.business_name;
      if (nameCandidate) setMerchantName(String(nameCandidate));

      const addrCandidate =
        user?.business_address ||
        user?.address ||
        user?.location ||
        blob?.business_address ||
        blob?.address ||
        '';
      if (addrCandidate) setBusinessAddress(String(addrCandidate));

      const logoCandidate =
        blob?.business_logo ||
        user?.business_logo ||
        user?.logo_url;
      if (logoCandidate) setMerchantLogo(resolveImageUrl(logoCandidate));

      const profCandidate =
        blob?.profile_image ||
        user?.profile_image ||
        user?.avatar ||
        user?.profile_photo ||
        user?.photo_url;
      if (profCandidate) setProfileAvatar(resolveImageUrl(profCandidate));

      const bidCandidate = user?.business_id || user?.id || blob?.business_id || blob?.id || null;
      if (bidCandidate) setBusinessId(String(bidCandidate));

      const kind = (user?.owner_type || blob?.owner_type || '').toString().toLowerCase();
      if (kind === 'food' || kind === 'mart') setOwnerType(kind);

      const licenseCandidate =
        blob?.business_license ||
        user?.business_license ||
        user?.business_license_number ||
        blob?.business_license_number ||
        '';
      if (licenseCandidate) setBusinessLicense(String(licenseCandidate));
    } catch { }
  }, [userId]);

  // Authoritative: fetch from PROFILE_ENDPOINT/:userId
  const loadFromBackend = useCallback(async (uid) => {
    const url = buildProfileUrl(uid);
    if (url) {
      try {
        const data = await fetchJSON(url, { method: 'GET' });

        if (data?.business_name) setMerchantName(String(data.business_name));

        if (data?.business_logo) setMerchantLogo(resolveImageUrl(String(data.business_logo)));
        if (data?.profile_image) setProfileAvatar(resolveImageUrl(String(data.profile_image)));

        const addr = data?.business_address ?? data?.address ?? data?.location ?? '';
        if (addr) setBusinessAddress(String(addr));

        const kind = String(data?.owner_type ?? '').toLowerCase();
        if (kind === 'food' || kind === 'mart') setOwnerType(kind);

        const bid = data?.business_id ?? data?.id ?? null;
        if (bid) setBusinessId(String(bid));

        const license = data?.business_license || data?.business_license_number || '';
        if (license) setBusinessLicense(String(license));

        // persist into SecureStore
        try {
          const raw = await SecureStore.getItemAsync(KEY_MERCHANT_LOGIN);
          let blob = {};
          try { blob = raw ? JSON.parse(raw) : {}; } catch { }
          const merged = {
            ...blob,
            business_license: license || blob?.business_license,
            business_name: data?.business_name ?? blob?.business_name,
            business_address: addr ?? blob?.business_address,
            business_logo: data?.business_logo ?? blob?.business_logo,
            profile_image: data?.profile_image ?? blob?.profile_image,
            owner_type: kind || blob?.owner_type,
            business_id: bid ?? blob?.business_id,
            user_id: data?.user_id ?? blob?.user_id,
            user: {
              ...(blob.user || {}),
              business_license: license || blob?.user?.business_license,
              business_name: data?.business_name ?? blob?.user?.business_name,
              business_address: addr ?? blob?.user?.business_address,
              business_logo: data?.business_logo ?? blob?.user?.business_logo,
              profile_image: data?.profile_image ?? blob?.user?.profile_image,
              owner_type: kind || blob?.user?.owner_type,
              business_id: bid ?? blob?.user?.business_id,
              user_id: data?.user_id ?? blob?.user?.user_id,
            },
          };
          await SecureStore.setItemAsync(KEY_MERCHANT_LOGIN, JSON.stringify(merged));
        } catch { }
      } catch (e) {
        if (__DEV__) console.log('[Home] profile fetch failed:', e?.message);
      }
    }
  }, [buildProfileUrl]);

  // Token-based “me” fetch
  const refreshFromServerMe = useCallback(async () => {
    try {
      const raw = await SecureStore.getItemAsync(KEY_MERCHANT_LOGIN);
      const parsed = raw ? JSON.parse(raw) : null;
      const token =
        parsed?.token?.access_token ||
        parsed?.token ||
        (await SecureStore.getItemAsync(KEY_AUTH_TOKEN));
      if (!token) return;

      for (const url of candidateProfileUrls()) {
        try {
          const res = await fetch(url, {
            headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
          });
          if (!res.ok) continue;
          const data = await res.json();
          const user = data?.user ?? data;

          const name = user?.business_name || DEFAULT_NAME;
          if (name) setMerchantName(String(name));

          const addr = user?.business_address || user?.address || user?.location || '';
          if (addr) setBusinessAddress(String(addr));

          const kind = (user?.owner_type || '').toString().toLowerCase();
          if (kind === 'food' || kind === 'mart') setOwnerType(kind);

          const bid = user?.business_id || user?.id || data?.business_id || null;
          if (bid) setBusinessId(String(bid));

          const logoRaw = user?.logo_url || user?.business_logo;
          if (logoRaw) setMerchantLogo(resolveImageUrl(logoRaw));

          const profRaw = user?.profile_photo || user?.avatar || user?.profile_image || user?.photo_url;
          if (profRaw) setProfileAvatar(resolveImageUrl(profRaw));

          const merged = { ...(parsed || {}), user: { ...(parsed?.user || {}), ...user } };
          await SecureStore.setItemAsync(KEY_MERCHANT_LOGIN, JSON.stringify(merged));
          break;
        } catch (e) {
          if (__DEV__) console.log('[Home] /me fetch failed for', url, e?.message);
        }
      }
    } catch (e) {
      if (__DEV__) console.log('[Home] refreshFromServerMe unexpected:', e?.message);
    }
  }, []);

  // Initial
  useEffect(() => {
    (async () => {
      await loadFromStore();
      if (route?.params?.user_id && !userId) setUserId(String(route.params.user_id));
      const uid = route?.params?.user_id || userId;
      if (uid) {
        await loadFromBackend(String(uid));
      } else {
        await refreshFromServerMe();
      }
      if (route?.params?.authContext) setAuthContext(route.params.authContext);
    })();
  }, [route?.params?.user_id]);

  // On focus
  useEffect(() => {
    const unsub = navigation.addListener('focus', async () => {
      await loadFromStore();
      const uid = route?.params?.user_id || userId;
      if (uid) await loadFromBackend(String(uid));
    });
    return unsub;
  }, [navigation, userId, route?.params?.user_id, loadFromStore, loadFromBackend]);

  // Foreground refresh
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (s) => {
      if (s === 'active') {
        await loadFromStore();
        const uid = route?.params?.user_id || userId;
        if (uid) await loadFromBackend(String(uid));
      }
    });
    return () => sub.remove();
  }, [userId, route?.params?.user_id, loadFromBackend, loadFromStore]);

  // Menus
  const loadMenusFromStorage = useCallback(async (bid) => {
    if (!bid) return;
    try {
      const raw = await SecureStore.getItemAsync(menusKey(bid));
      const arr = raw ? JSON.parse(raw) : [];
      setMenus(Array.isArray(arr) ? arr : []);
    } catch {
      setMenus([]);
    }
  }, []);
  useEffect(() => {
    if (businessId) loadMenusFromStorage(businessId);
  }, [businessId, loadMenusFromStorage]);

  // Live reactions
  useEffect(() => {
    const sub1 = DeviceEventEmitter.addListener('merchant-updated', async () => {
      await loadFromStore();
      const uid = route?.params?.user_id || userId;
      if (uid) await loadFromBackend(String(uid));
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
      if (params.business_logo) setMerchantLogo(resolveImageUrl(params.business_logo));
      if (params.owner_type && (params.owner_type === 'food' || params.owner_type === 'mart')) setOwnerType(params.owner_type);
      if (params.authContext) setAuthContext(params.authContext);
      try { await SecureStore.setItemAsync(KEY_LAST_CTX, JSON.stringify(params)); } catch { }
    });
    const sub4 = DeviceEventEmitter.addListener('profile-updated', async (payload) => {
      try {
        if (payload?.profile_image) setProfileAvatar(resolveImageUrl(payload.profile_image));
        if (payload?.business_logo) setMerchantLogo(resolveImageUrl(payload.business_logo));
        if (payload?.business_name) setMerchantName(String(payload.business_name));
      } catch { }
      const uid = route?.params?.user_id || userId;
      if (uid) await loadFromBackend(String(uid));
    });

    return () => { sub1.remove(); sub2.remove(); sub3.remove(); sub4.remove(); };
  }, [businessId, loadMenusFromStorage, loadFromBackend, loadFromStore, route?.params?.user_id, userId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFromStore();
    const uid = route?.params?.user_id || userId;
    if (uid) await loadFromBackend(String(uid));
    if (businessId) await loadMenusFromStorage(businessId);
    setRefreshing(false);
  }, [userId, route?.params?.user_id, businessId, loadMenusFromStorage, loadFromBackend, loadFromStore]);

  useEffect(() => {
    if (activeTab !== 'Home' && showWelcome) setShowWelcome(false);
  }, [activeTab, showWelcome]);

  // Android back: if not on Home tab, go to Home instead of popping stack
  useEffect(() => {
    const onBack = () => {
      if (activeTab !== 'Home') {
        setActiveTab('Home');
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [activeTab]);

  useEffect(() => {
    const p = route?.params;
    if (!p?.openTab) return;

    setActiveTab(String(p.openTab));
    if (p.businessId || p.business_id) setBusinessId(String(p.businessId || p.business_id));
    if (p.business_name) setMerchantName(String(p.business_name));
    if (p.business_logo) setMerchantLogo(resolveImageUrl(p.business_logo));
    if (p.owner_type && (p.owner_type === 'food' || p.owner_type === 'mart')) setOwnerType(p.owner_type);
    if (p.authContext) setAuthContext(p.authContext);

    navigation.setParams({ openTab: undefined, nonce: undefined });
  }, [route?.params?.nonce]);

  const Header = () => {
    const navigation = useNavigation();

    const params = {
      user_id: userId,
      business_id: businessId,
      business_name: merchantName,
      business_logo: merchantLogo,
      profile_image: profileAvatar,
      business_address: businessAddress,
      business_license: businessLicense,
      owner_type: ownerType,
      authContext,
    };

    const goToAccountSettings = () => {
      safeNavigate(navigation, 'AccountSettings', params, 'ProfileBusinessDetails');
    };

    const goToProfileBusinessDetails = () => {
      safeNavigate(navigation, 'ProfileBusinessDetails', params);
    };

    return (
      <LinearGradient
        colors={['#00b14f', '#4de6de']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          paddingTop: (isTablet ? 24 : 18) + (insets.top || 0),
          paddingBottom: isTablet ? 16 : 12,
          paddingHorizontal: isTablet ? 24 : 18,
        }}
      >
        {showWelcome && activeTab === 'Home' && <Text style={styles.hi}>Welcome back</Text>}

        <View style={styles.headerRow}>
          <View style={styles.inlineRow}>
            {/* Tap logo to open business details */}
            <TouchableOpacity
              onPress={goToProfileBusinessDetails}
              activeOpacity={0.85}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ position: 'relative' }}
            >
              <CascadingImage
                sourcePath={merchantLogo}
                fallbackUri={DEFAULT_AVATAR}
                style={[styles.avatar, { width: avatarSize, height: avatarSize }]}
                onLoadStart={() => setLoadingAvatar(true)}
                onLoadEnd={() => setLoadingAvatar(false)}
                onFinalError={() => {}}
                testID="merchantLogo"
              />
              {loadingAvatar && (
                <ActivityIndicator
                  style={{
                    position: 'absolute',
                    left: avatarSize / 2 - 12,
                    top: avatarSize / 2 - 12,
                  }}
                  size="small"
                  color="#00b14f"
                />
              )}
            </TouchableOpacity>

            <Text style={[styles.merchantName, { marginLeft: 6 }]} numberOfLines={1} ellipsizeMode="tail">
              {merchantName || DEFAULT_NAME}
            </Text>
          </View>

          <View style={styles.inlineRow}>
            <TouchableOpacity
              onPress={goToAccountSettings}
              activeOpacity={0.85}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              {(
                <CascadingImage
                  sourcePath={profileAvatar || DEFAULT_AVATAR}
                  fallbackUri={DEFAULT_AVATAR}   // non-null fallback prevents collapse/flicker
                  style={[styles.profileCircle, { width: avatarSize, height: avatarSize }]}
                  onFinalError={() => {}}
                  testID="profileAvatar"
                />
              )}
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ marginTop: 10, alignItems: 'center', width: '100%' }}>
          <AddressChip address={businessAddress} onPress={goToProfileBusinessDetails} />
        </View>
      </LinearGradient>
    );
  };

  const NAV_ITEMS = [
    { key: 'Home', label: 'Home', icon: 'home-outline' },
    { key: 'Orders', label: 'Orders', icon: 'receipt-outline' },
    { key: 'Add Menu', label: 'Add Menu', icon: 'add' },
    { key: 'Notifications', label: 'Notifications', icon: 'notifications-outline' },
    { key: 'Payouts', label: 'Payouts', icon: 'card-outline' },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
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
            context={authContext}
            userId={userId}
            ownerType={ownerType}
            businessName={merchantName}
            logoUrl={merchantLogo}
            address={businessAddress}
            businessLicense={businessLicense}
          />
        </ScrollView>
      )}

      {activeTab === 'Promos' && (
        <View style={[styles.tabWrap, { paddingBottom: bottomBarHeight }]}>
          <Header />
          <PromosTab isTablet={isTablet} businessId={businessId} context={authContext} />
        </View>
      )}

      {activeTab === 'Orders' && (
        <View style={[styles.tabWrap, { paddingBottom: bottomBarHeight }]}>
          <Header />
          <OrdersTab
            isTablet={isTablet}
            orders={orders ?? []}
            money={money}
            businessId={businessId}
            context={authContext}
          />
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
            address={businessAddress}
            userId={userId}
            context={authContext}
          />
        </View>
      )}

      {activeTab === 'Notifications' && (
        <View style={[styles.tabWrap, { paddingBottom: bottomBarHeight }]}>
          <Header />
          <NotificationsTab isTablet={isTablet} businessId={businessId} context={authContext} />
        </View>
      )}

      {activeTab === 'Payouts' && (
        <View style={[styles.tabWrap, { paddingBottom: bottomBarHeight }]}>
          <Header />
          <PayoutsTab isTablet={isTablet} businessId={businessId} context={authContext} />
        </View>
      )}

      {activeTab === 'Home' && (
        <TouchableOpacity
          style={[styles.fab, { bottom: fabBottom }]}
          onPress={() => setActiveTab('Promos')}
          activeOpacity={0.9}
        >
          <Ionicons name="pricetag-outline" size={isTablet ? 24 : 22} color="#fff" />
          <Text style={[styles.fabText, { fontSize: isTablet ? 14 : 13 }]}>Create promo</Text>
        </TouchableOpacity>
      )}

      <MerchantBottomBar items={NAV_ITEMS} activeKey={activeTab} onChange={setActiveTab} isTablet={isTablet} />
    </SafeAreaView>
  );
}

// ───────────────────────── Styles ─────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#00b14f' },
  container: { backgroundColor: '#f6f7f8' },
  profileCircle: {
    borderRadius: 9999,
    backgroundColor: '#fff',
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  inlineRow: { flexDirection: 'row', alignItems: 'center' },
  hi: { fontSize: 20, color: '#e8fff6', opacity: 0.9, fontWeight: '900', marginBottom: 2 },
  merchantName: { color: 'white', fontWeight: '700' },
  avatar: { borderRadius: 12, backgroundColor: '#fff' },

  addressWrap: { marginTop: 10, alignItems: 'center', width: '100%' },
  addressChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: '100%',
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  addressText: { color: '#2d2d2d', fontSize: 13, fontWeight: '700', maxWidth: 260 },

  tabWrap: { flex: 1, backgroundColor: '#f6f7f8' },
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
  fabText: { color: '#fff', fontWeight: '700' },
});
