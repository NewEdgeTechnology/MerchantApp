// screens/food/GrabMerchantHomeScreen.js
// Simplified: direct URLs for merchant & profile images (using env bases), with promo URL overrides via env

import React, { useState, useCallback, useEffect, useRef } from 'react';
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
import { Ionicons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as SecureStore from 'expo-secure-store';
import {
  LOGIN_USERNAME_MERCHANT_ENDPOINT,
  PROFILE_ENDPOINT,
  BUSINESS_DETAILS,
  MERCHANT_LOGO, // e.g. http://103.7.253.31/merchant
  ITEM_ENDPOINT as MART_ITEM_ENDPOINT,
  DISPLAY_ITEM_ENDPOINT as MART_DISPLAY_ITEM_ENDPOINT,
  PROFILE_IMAGE as PROFILE_IMAGE_ENDPOINT, // e.g. http://103.7.253.31/merchant
  // Optional env overrides for promos:
  PROMOS_ENDPOINT,           // fallback for both kinds
  PROMOS_FOOD_ENDPOINT,      // specific override for food
  PROMOS_MART_ENDPOINT,      // specific override for mart
} from '@env';

// Tabs / footer
import HomeTab from './HomeTab';
import OrdersTab from './OrderTab';
import MenuTab from './AddMenuTab';
import NotificationsTab from './NotificationsTab';
import PayoutsTab from './PayoutTab';
import MerchantBottomBar from './MerchantBottomBar';
import PromosTab from './PromoTab';

/* ───────────────────────── Constants / Keys ───────────────────────── */
const KEY_MERCHANT_LOGIN = 'merchant_login';
const KEY_AUTH_TOKEN = 'auth_token';
const KEY_LAST_CTX = 'last_ctx_payload';
const menusKey = (bid, kind) => `menus_by_business_${bid}_${kind || 'food'}`;

const DEFAULT_AVATAR =
  'https://images.unsplash.com/photo-1612198182421-3f5dff0c9b40?q=80&w=400&auto=format&fit=crop';
const DEFAULT_NAME = 'Your Business';

const DEFAULT_DEV_ORIGIN = Platform.select({
  android: 'http://10.0.2.2:3000',
  ios: 'http://localhost:3000',
  default: 'http://localhost:3000',
});

// Auto-refresh cadence (while this screen is focused & app is active)
const HEADER_REFRESH_MS = 12000;

// normalize owner type from codes/strings/spaces/casing
const normalizeOwnerType = (v) => {
  const s = String(v ?? '').trim().toLowerCase();
  if (s === '2' || s === 'mart') return 'mart';
  if (s === '1' || s === 'food') return 'food';
  return s || 'food';
};

// only apply kind when a real value was provided (prevents clobbering to "food")
const maybeApplyKind = (incoming, set) => {
  const raw = incoming ?? '';
  if (String(raw).trim() === '') return;
  set(normalizeOwnerType(raw));
};

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
  return [`${base}/api/merchant/me`, `${base}/api/merchant/profile`, `${base}/api/profile/me`];
};

// Direct URL helpers
const makeAbsolute = (maybeRelative, base) => {
  if (!maybeRelative) return null;
  const s = String(maybeRelative);
  if (/^https?:\/\//i.test(s)) return s;
  const b = (base || '').replace(/\/+$/, '');
  const p = s.startsWith('/') ? s.slice(1) : s;
  return `${b}/${p}`;
};
const money = (n, c = 'Nu') => `${c} ${Number(n ?? 0).toFixed(2)}`;
const DEFAULT_KPIS = { salesToday: 0, salesCurrency: 'Nu', activeOrders: 0, cancellations: 0, acceptanceRate: 0 };

export default function GrabMerchantHomeScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const isTablet = width >= 768;
  const isLargePhone = width >= 400 && width < 768;

  const bottomInset = insets.bottom || 0;
  const softKeyPad = Platform.OS === 'android' ? Math.max(bottomInset, 8) : bottomInset;
  const bottomBarBase = isTablet ? 84 : 76;
  const bottomBarHeight = bottomBarBase + softKeyPad;
  const fabBottom = bottomBarHeight + 20;
  const avatarSize = isTablet ? 56 : isLargePhone ? 48 : 44;

  // ───────── Merchant & UI state ─────────
  const [merchantName, setMerchantName] = useState(DEFAULT_NAME);
  const [merchantLogo, setMerchantLogo] = useState(DEFAULT_AVATAR); // will be absolute URL
  const [profileAvatar, setProfileAvatar] = useState(null);          // absolute URL
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

  const [userId, setUserId] = useState(route?.params?.user_id ? String(route.params.user_id) : '');
  const [authContext, setAuthContext] = useState(route?.params?.authContext || null);

  const isFood = ownerType === 'food';

  // cache-buster to force logo refresh when pulling to refresh or when backend says logo changed
  const [logoVersion, setLogoVersion] = useState(0);
  const addBuster = (u, v) => {
    if (!u || !v) return u;
    const sep = u?.includes('?') ? '&' : '?';
    return `${u}${sep}v=${v}`;
  };

  // Central service config (tabs can choose paths by kind)
  const serviceConfig = React.useMemo(() => {
    const base = getBaseOrigin();

    // Resolve promo endpoints with env overrides (and Android localhost fix)
    const resolvedFoodPromos =
      normalizeHost(PROMOS_FOOD_ENDPOINT || PROMOS_ENDPOINT || `${base}/api/food/promos`);
    const resolvedMartPromos =
      normalizeHost(PROMOS_MART_ENDPOINT || PROMOS_ENDPOINT || `${base}/api/mart/promos`);

    if (isFood) {
      return {
        kind: 'food',
        base,
        menus: `${base}/api/food/menus`,
        orders: `${base}/api/food/orders`,
        promos: resolvedFoodPromos,          // ← promo URL (food)
        payouts: `${base}/api/food/payouts`,
        notifications: `${base}/api/food/notifications`,
        menusList: `${base}/api/food/menus`,
        menusWrite: `${base}/api/food/menus`,
      };
    }
    const listUrl = normalizeHost(MART_DISPLAY_ITEM_ENDPOINT || `${base}/api/mart-menu/business`);
    const writeUrl = normalizeHost(MART_ITEM_ENDPOINT || `${base}/api/mart-menu`);
    return {
      kind: 'mart',
      base,
      menus: listUrl,
      itemsList: listUrl,
      itemsWrite: writeUrl,
      orders: `${base}/api/mart/orders`,
      promos: resolvedMartPromos,           // ← promo URL (mart)
      payouts: `${base}/api/mart/payouts`,
      notifications: `${base}/api/mart/notifications`,
    };
  }, [ownerType]);

  // sync params outward so children see current kind & ids
  useEffect(() => {
    navigation.setParams({
      businessId,
      business_id: businessId,
      owner_type: normalizeOwnerType(ownerType),
      user_id: userId,
      authContext,
      business_name: merchantName,
      business_logo: merchantLogo,
      business_address: businessAddress,
      business_license: businessLicense,
      serviceConfig,
    });
  }, [navigation, businessId, ownerType, userId, authContext, merchantName, merchantLogo, businessAddress, businessLicense, serviceConfig]);

  // Build profile/business endpoints
  const buildProfileUrl = useCallback((uid) => {
    if (!uid || !PROFILE_ENDPOINT) return '';
    const base = normalizeHost((PROFILE_ENDPOINT || '').trim()).replace(/\/+$/, '');
    return `${base}/${encodeURIComponent(String(uid))}`;
  }, []);
  const buildBusinessUrl = useCallback((bid) => {
    if (!bid || !BUSINESS_DETAILS) return '';
    const base = normalizeHost((BUSINESS_DETAILS || '').trim()).replace(/\/+$/, '');
    return `${base}/${encodeURIComponent(String(bid))}`;
  }, []);

  // Tiny snapshot helper to detect meaningful header changes
  const headerSnapRef = useRef({ name: null, addr: null, logo: null, profile: null });

  const applyHeaderIfChanged = useCallback((payload = {}) => {
    const next = {
      name: payload.business_name ?? payload.name ?? null,
      addr: payload.business_address ?? payload.address ?? payload.location ?? null,
      logo: payload.business_logo ?? payload.logo_url ?? null,
      profile: payload.profile_image ?? payload.avatar ?? payload.profile_photo ?? payload.photo_url ?? null,
    };

    let bumped = false;

    if (next.name && next.name !== headerSnapRef.current.name) {
      setMerchantName(String(next.name));
      headerSnapRef.current.name = next.name;
    }
    if (typeof next.addr === 'string' && next.addr !== headerSnapRef.current.addr) {
      setBusinessAddress(String(next.addr));
      headerSnapRef.current.addr = next.addr;
    }
    if (next.logo) {
      // Use env base for merchant logos
      const resolved = makeAbsolute(String(next.logo), MERCHANT_LOGO);
      if (resolved !== headerSnapRef.current.logo) {
        setMerchantLogo(resolved);
        headerSnapRef.current.logo = resolved;
        bumped = true; // bust caches
      }
    }
    if (next.profile) {
      // If relative → use PROFILE_IMAGE_ENDPOINT; if absolute, use as is
      const resolvedP = makeAbsolute(String(next.profile), PROFILE_IMAGE_ENDPOINT);
      if (resolvedP !== headerSnapRef.current.profile) {
        setProfileAvatar(resolvedP);
        headerSnapRef.current.profile = resolvedP;
      }
    }

    if (bumped) setLogoVersion((v) => v + 1);
  }, []);

  // Hydrate from SecureStore (fast)
  const loadFromStore = useCallback(async () => {
    try {
      const raw = await SecureStore.getItemAsync(KEY_MERCHANT_LOGIN);
      if (!raw) return;
      let blob = {};
      try { blob = JSON.parse(raw); } catch { }
      const user = blob?.user ?? blob;

      const idCandidates = [
        blob?.user?.user_id, blob?.user?.id, blob?.user_id, blob?.id, blob?.merchant?.user_id, blob?.merchant?.id,
      ].filter(v => v !== undefined && v !== null && v !== '');
      if (!userId && idCandidates.length) setUserId(String(idCandidates[0]));

      applyHeaderIfChanged({
        business_name: blob?.business_name ?? user?.business_name,
        business_address: user?.business_address ?? user?.address ?? user?.location ?? blob?.business_address ?? blob?.address,
        business_logo: blob?.business_logo ?? user?.business_logo ?? user?.logo_url,
        profile_image: blob?.profile_image ?? user?.profile_image ?? user?.avatar ?? user?.profile_photo ?? user?.photo_url,
      });

      const bidCandidate = user?.business_id || user?.id || blob?.business_id || blob?.id || null;
      if (bidCandidate) setBusinessId(String(bidCandidate));

      maybeApplyKind(user?.owner_type ?? blob?.owner_type, setOwnerType);

      const licenseCandidate =
        blob?.business_license || user?.business_license || user?.business_license_number || blob?.business_license_number || '';
      if (licenseCandidate) setBusinessLicense(String(licenseCandidate));
    } catch { }
  }, [userId, applyHeaderIfChanged]);

  // Authoritative: fetch from PROFILE_ENDPOINT/:userId
  const loadFromBackend = useCallback(async (uid) => {
    const url = buildProfileUrl(uid);
    if (!url) return;
    try {
      const data = await fetchJSON(url, { method: 'GET' });

      applyHeaderIfChanged(data);
      maybeApplyKind(data?.owner_type, setOwnerType);

      const bid = data?.business_id ?? data?.id ?? null;
      if (bid) setBusinessId(String(bid));

      const license = data?.business_license || data?.business_license_number || '';
      if (license) setBusinessLicense(String(license));

      // persist minimal fields
      try {
        const raw = await SecureStore.getItemAsync(KEY_MERCHANT_LOGIN);
        let blob = {};
        try { blob = raw ? JSON.parse(raw) : {}; } catch { }
        const providedKind = (data?.owner_type != null && String(data.owner_type).trim() !== '')
          ? normalizeOwnerType(data.owner_type)
          : null;

        const merged = {
          ...blob,
          business_license: license || blob?.business_license,
          business_name: data?.business_name ?? blob?.business_name,
          business_address: (data?.business_address ?? data?.address ?? data?.location) ?? blob?.business_address,
          business_logo: data?.business_logo ?? blob?.business_logo,
          profile_image: data?.profile_image ?? blob?.profile_image,
          owner_type: providedKind ?? (blob?.owner_type ?? ownerType),
          business_id: (data?.business_id ?? data?.id) ?? blob?.business_id,
          user_id: data?.user_id ?? blob?.user_id,
          user: {
            ...(blob.user || {}),
            business_license: license || blob?.user?.business_license,
            business_name: data?.business_name ?? blob?.user?.business_name,
            business_address: (data?.business_address ?? data?.address ?? data?.location) ?? blob?.user?.business_address,
            business_logo: data?.business_logo ?? blob?.user?.business_logo,
            profile_image: data?.profile_image ?? blob?.user?.profile_image,
            owner_type: providedKind ?? (blob?.user?.owner_type ?? ownerType),
            business_id: (data?.business_id ?? data?.id) ?? blob?.user?.business_id,
            user_id: data?.user_id ?? blob?.user?.user_id,
          },
        };
        await SecureStore.setItemAsync(KEY_MERCHANT_LOGIN, JSON.stringify(merged));
      } catch { }
    } catch (e) {
      if (__DEV__) console.log('[Home] profile fetch failed:', e?.message);
    }
  }, [buildProfileUrl, ownerType, applyHeaderIfChanged]);

  // Business details by businessId (name, address, logo)
  const loadBusinessFromBackend = useCallback(async (bid) => {
    const url = buildBusinessUrl(bid);
    if (!url) return;
    try {
      const data = await fetchJSON(url, { method: 'GET' });

      applyHeaderIfChanged({
        business_name: data?.business_name ?? data?.name,
        business_address: data?.business_address ?? data?.address ?? data?.location,
        business_logo: data?.business_logo,
      });

      // persist minimal fields
      try {
        const raw = await SecureStore.getItemAsync(KEY_MERCHANT_LOGIN);
        const blob = raw ? JSON.parse(raw) : {};
        const merged = {
          ...blob,
          business_name: (data?.business_name ?? data?.name) ?? blob?.business_name,
          business_address: (data?.business_address ?? data?.address ?? data?.location) ?? blob?.business_address,
          business_logo: data?.business_logo ?? blob?.business_logo,
          business_id: bid ?? blob?.business_id,
          user: {
            ...(blob.user || {}),
            business_name: (data?.business_name ?? data?.name) ?? blob?.user?.business_name,
            business_address: (data?.business_address ?? data?.address ?? data?.location) ?? blob?.user?.business_address,
            business_logo: data?.business_logo ?? blob?.user?.business_logo,
            business_id: bid ?? blob?.user?.business_id,
          },
        };
        await SecureStore.setItemAsync(KEY_MERCHANT_LOGIN, JSON.stringify(merged));
      } catch { }
    } catch (e) {
      if (__DEV__) console.log('[Home] loadBusinessFromBackend failed:', e?.message);
    }
  }, [buildBusinessUrl, applyHeaderIfChanged]);

  // Token-based “/me” fetch
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

          applyHeaderIfChanged({
            business_name: user?.business_name,
            business_address: user?.business_address ?? user?.address ?? user?.location,
            business_logo: user?.logo_url ?? user?.business_logo,
            profile_image: user?.profile_photo ?? user?.avatar ?? user?.profile_image ?? user?.photo_url,
          });

          maybeApplyKind(user?.owner_type, setOwnerType);

          const bid = user?.business_id || user?.id || data?.business_id || null;
          if (bid) setBusinessId(String(bid));

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
  }, [applyHeaderIfChanged]);

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
      if (businessId) {
        await loadBusinessFromBackend(String(businessId));
      }
      if (route?.params?.authContext) setAuthContext(route.params.authContext);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.params?.user_id]);

  // On focus → refresh once
  useEffect(() => {
    const unsub = navigation.addListener('focus', async () => {
      await loadFromStore();
      const uid = route?.params?.user_id || userId;
      if (uid) await loadFromBackend(String(uid));
      if (businessId) await loadBusinessFromBackend(String(businessId));
    });
    return unsub;
  }, [navigation, userId, route?.params?.user_id, businessId, loadFromStore, loadFromBackend, loadBusinessFromBackend]);

  // Foreground refresh
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (s) => {
      if (s === 'active') {
        await loadFromStore();
        const uid = route?.params?.user_id || userId;
        if (uid) await loadFromBackend(String(uid));
        if (businessId) await loadBusinessFromBackend(String(businessId));
      }
    });
    return () => sub.remove();
  }, [userId, route?.params?.user_id, businessId, loadFromBackend, loadFromStore, loadBusinessFromBackend]);

  // Focused auto-refresh loop for header (name, address, logo/profile)
  useEffect(() => {
    let timer = null;
    let isActive = true;

    const start = () => {
      if (timer) clearInterval(timer);
      timer = setInterval(async () => {
        if (!isActive) return;
        if (businessId) await loadBusinessFromBackend(String(businessId));
        const uid = route?.params?.user_id || userId;
        if (uid) await loadFromBackend(String(uid));
      }, HEADER_REFRESH_MS);
    };

    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    const onFocus = () => { isActive = true; start(); };
    const onBlur = () => { isActive = false; stop(); };

    const unsubFocus = navigation.addListener('focus', onFocus);
    const unsubBlur = navigation.addListener('blur', onBlur);

    if (navigation.isFocused?.()) onFocus();

    return () => { stop(); unsubFocus(); unsubBlur(); };
  }, [navigation, businessId, userId, route?.params?.user_id, loadBusinessFromBackend, loadFromBackend]);

  // Menus (ownerType-aware storage key to prevent cross-kind bleed)
  const loadMenusFromStorage = useCallback(async (bid, kind) => {
    if (!bid) return;
    try {
      const raw = await SecureStore.getItemAsync(menusKey(bid, kind));
      const arr = raw ? JSON.parse(raw) : [];
      setMenus(Array.isArray(arr) ? arr : []);
    } catch {
      setMenus([]);
    }
  }, []);
  useEffect(() => {
    if (businessId) loadMenusFromStorage(businessId, ownerType);
  }, [businessId, ownerType, loadMenusFromStorage]);

  // Live reactions from other parts of the app
  const belongsToCurrentContext = useCallback((incoming = {}) => {
    const incKind = normalizeOwnerType(incoming.owner_type ?? incoming.kind);
    const incBid = incoming.business_id ?? incoming.businessId ?? null;
    if (incoming.hasOwnProperty('owner_type') || incoming.hasOwnProperty('kind')) {
      if (incKind && incKind !== ownerType) return false;
    }
    if (incoming.hasOwnProperty('business_id') || incoming.hasOwnProperty('businessId')) {
      if (incBid && String(incBid) !== String(businessId)) return false;
    }
    return true;
  }, [ownerType, businessId]);

  useEffect(() => {
    const sub1 = DeviceEventEmitter.addListener('merchant-updated', async () => {
      await loadFromStore();
      const uid = route?.params?.user_id || userId;
      if (uid) await loadFromBackend(String(uid));
      if (businessId) await loadBusinessFromBackend(String(businessId));
    });
    const sub2 = DeviceEventEmitter.addListener('menus-updated', async (payload) => {
      const bid = payload?.businessId || businessId;
      const kind = normalizeOwnerType(payload?.owner_type || ownerType);
      if (bid) await loadMenusFromStorage(bid, kind);
    });
    const sub3 = DeviceEventEmitter.addListener('open-tab', async (payload) => {
      const key = payload?.key;
      const params = payload?.params || {};
      if (key) setActiveTab(String(key));
      if (params.businessId || params.business_id) setBusinessId(String(params.businessId || params.business_id));
      if (params.business_name) setMerchantName(String(params.business_name));
      if (params.business_logo && belongsToCurrentContext(params)) {
        applyHeaderIfChanged({ business_logo: params.business_logo });
      }
      if (params.owner_type != null && String(params.owner_type).trim() !== '') {
        maybeApplyKind(params.owner_type, setOwnerType);
      }
      if (params.authContext) setAuthContext(params.authContext);
      try { await SecureStore.setItemAsync(KEY_LAST_CTX, JSON.stringify(params)); } catch { }
    });
    const sub4 = DeviceEventEmitter.addListener('profile-updated', async (payload) => {
      try {
        if (payload?.profile_image) applyHeaderIfChanged({ profile_image: payload.profile_image });
        if (payload?.business_logo && belongsToCurrentContext(payload)) {
          applyHeaderIfChanged({ business_logo: payload.business_logo });
        }
        if (payload?.business_name) applyHeaderIfChanged({ business_name: payload.business_name });
        if (payload?.business_address || payload?.address || payload?.location) {
          applyHeaderIfChanged({ business_address: payload?.business_address ?? payload?.address ?? payload?.location });
        }
      } catch { }
      const uid = route?.params?.user_id || userId;
      if (uid) await loadFromBackend(String(uid));
      if (businessId) await loadBusinessFromBackend(String(businessId));
    });

    return () => { sub1.remove(); sub2.remove(); sub3.remove(); sub4.remove(); };
  }, [businessId, ownerType, loadMenusFromStorage, loadFromBackend, loadFromStore, route?.params?.user_id, userId, belongsToCurrentContext, loadBusinessFromBackend, applyHeaderIfChanged]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFromStore();
    const uid = route?.params?.user_id || userId;
    if (uid) await loadFromBackend(String(uid));
    if (businessId) await loadMenusFromStorage(businessId, ownerType);
    if (businessId) await loadBusinessFromBackend(String(businessId)); // ← update header (name/location/logo)
    setRefreshing(false);
    setLogoVersion((v) => v + 1);
  }, [userId, route?.params?.user_id, businessId, ownerType, loadMenusFromStorage, loadFromBackend, loadFromStore, loadBusinessFromBackend]);

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
    if (p.business_logo && belongsToCurrentContext(p)) {
      applyHeaderIfChanged({ business_logo: p.business_logo });
    }
    if (p.owner_type != null && String(p.owner_type).trim() !== '') {
      maybeApplyKind(p.owner_type, setOwnerType);
    }
    if (p.authContext) setAuthContext(p.authContext);
    navigation.setParams({ openTab: undefined, nonce: undefined });
  }, [route?.params?.nonce, belongsToCurrentContext, navigation, applyHeaderIfChanged]); // eslint-disable-line react-hooks/exhaustive-deps

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
      owner_type: normalizeOwnerType(ownerType),
      authContext,
      serviceConfig,
    };
    const safeNav = (target, fallback) => {
      try { navigation.navigate(target, params); }
      catch {
        if (fallback) try { navigation.navigate(fallback, params); } catch {}
      }
    };
    const goToAccountSettings = () => safeNav('AccountSettings', 'ProfileBusinessDetails');
    const goToProfileBusinessDetails = () => safeNav('ProfileBusinessDetails');

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
              <Image
                source={{ uri: addBuster(merchantLogo, logoVersion) || DEFAULT_AVATAR }}
                style={[styles.avatar, { width: avatarSize, height: avatarSize }]}
                onLoadStart={() => setLoadingAvatar(true)}
                onLoadEnd={() => setLoadingAvatar(false)}
                onError={() => setLoadingAvatar(false)}
              />
              {loadingAvatar && (
                <ActivityIndicator
                  style={{ position: 'absolute', left: avatarSize / 2 - 12, top: avatarSize / 2 - 12 }}
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
              <Image
                source={{ uri: profileAvatar || DEFAULT_AVATAR }}
                style={[styles.profileCircle, { width: avatarSize, height: avatarSize }]}
                onError={() => {}}
              />
            </TouchableOpacity>
          </View>
        </View>

        {!!businessAddress && (
          <View style={{ marginTop: 10, alignItems: 'center', width: '100%' }}>
            <View style={styles.addressChip}>
              <Ionicons name="location-outline" size={16} color="#00b14f" />
              <Text style={styles.addressText} numberOfLines={1} ellipsizeMode="tail">
                {businessAddress}
              </Text>
            </View>
          </View>
        )}
      </LinearGradient>
    );
  };

  // Bottom nav items
  const NAV_ITEMS = [
    { key: 'Home', label: 'Home', icon: 'home-outline' },
    { key: 'Orders', label: 'Orders', icon: 'receipt-outline' },
    { key: 'Add Menu', label: isFood ? 'Add Menu' : 'Add Item', icon: 'add' },
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
            kpis={DEFAULT_KPIS}
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
            serviceConfig={serviceConfig}
          />
        </ScrollView>
      )}

      {activeTab === 'Promos' && (
        <View style={[styles.tabWrap, { paddingBottom: bottomBarHeight }]}>
          <Header />
          <PromosTab
            isTablet={isTablet}
            businessId={businessId}
            context={authContext}
            ownerType={ownerType}
            serviceConfig={serviceConfig}
          />
        </View>
      )}

      {activeTab === 'Orders' && (
        <View style={[styles.tabWrap, { paddingBottom: bottomBarHeight }]}>
          <Header />
          <OrdersTab
            key={`orders_${businessId}_${ownerType}`}
            isTablet={isTablet}
            money={money}
            businessId={businessId}
            ownerType={ownerType}
            serviceConfig={serviceConfig}
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
            serviceConfig={serviceConfig}
          />
        </View>
      )}

      {activeTab === 'Notifications' && (
        <View style={[styles.tabWrap, { paddingBottom: bottomBarHeight }]}>
          <Header />
          <NotificationsTab
            isTablet={isTablet}
            businessId={businessId}
            context={authContext}
            ownerType={ownerType}
            serviceConfig={serviceConfig}
          />
        </View>
      )}

      {activeTab === 'Payouts' && (
        <View style={[styles.tabWrap, { paddingBottom: bottomBarHeight }]}>
          <Header />
          <PayoutsTab
            isTablet={isTablet}
            businessId={businessId}
            context={authContext}
            ownerType={ownerType}
            serviceConfig={serviceConfig}
          />
        </View>
      )}

      {activeTab === 'Home' && isFood && (
        <TouchableOpacity style={[styles.fab, { bottom: fabBottom }]} onPress={() => setActiveTab('Promos')} activeOpacity={0.9}>
          <Ionicons name="pricetag-outline" size={isTablet ? 24 : 22} color="#fff" />
          <Text style={[styles.fabText, { fontSize: isTablet ? 14 : 13 }]}>Display promos</Text>
        </TouchableOpacity>
      )}

      <MerchantBottomBar items={NAV_ITEMS} activeKey={activeTab} onChange={setActiveTab} isTablet={isTablet} />
    </SafeAreaView>
  );
}

/* ───────────────────────── Styles ───────────────────────── */
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#00b14f' },
  container: { backgroundColor: '#f6f7f8' },
  profileCircle: { borderRadius: 9999, backgroundColor: '#fff' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  inlineRow: { flexDirection: 'row', alignItems: 'center' },
  hi: { fontSize: 20, color: '#e8fff6', opacity: 0.9, fontWeight: '900', marginBottom: 2 },
  merchantName: { color: 'white', fontWeight: '700' },
  avatar: { borderRadius: 12, backgroundColor: '#fff' },
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
});
