// components/MerchantHeader.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
  useWindowDimensions,
  AppState,
  DeviceEventEmitter,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { LOGIN_USERNAME_MERCHANT_ENDPOINT, PROFILE_ENDPOINT, BUSINESS_DETAILS } from '@env';

/* ───────────────────────── Keys / Defaults ───────────────────────── */
const KEY_MERCHANT_LOGIN = 'merchant_login';
const KEY_AUTH_TOKEN = 'auth_token';
const KEY_LAST_CTX = 'last_ctx_payload';

const DEFAULT_AVATAR =
  'https://images.unsplash.com/photo-1612198182421-3f5dff0c9b40?q=80&w=400&auto=format&fit=crop';
const DEFAULT_NAME = 'Your Business';

const DEFAULT_DEV_ORIGIN = Platform.select({
  android: 'http://10.0.2.2:3000',
  ios: 'http://localhost:3000',
  default: 'http://localhost:3000',
});

/* ───────────────────────── URL helpers ───────────────────────── */
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
function getOrigin(url) { try { return new URL(url).origin; } catch { return ''; } }
function resolveImageUrl(maybeRelative) {
  if (!maybeRelative) return null;
  const src = String(maybeRelative);
  if (/^https?:\/\//i.test(src)) return src;
  const origin = getOrigin(normalizeHost(PROFILE_ENDPOINT || DEFAULT_DEV_ORIGIN)) || DEFAULT_DEV_ORIGIN;
  return `${origin}${src.startsWith('/') ? '' : '/'}${src}`;
}

/* ───────────────────────── fetchJSON (with timeout) ───────────────────────── */
async function fetchJSON(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch {}
    if (!res.ok) {
      const msg = (json && (json.message || json.error)) || text || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return json;
  } finally { clearTimeout(tid); }
}

/* ───────────────────────── Header-only “/me” discovery ───────────────────────── */
const getBaseOrigin = () => {
  try {
    if (typeof globalThis.URL === 'function' && LOGIN_USERNAME_MERCHANT_ENDPOINT) {
      return new globalThis.URL(LOGIN_USERNAME_MERCHANT_ENDPOINT).origin;
    }
  } catch {}
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

/* ───────────────────────── Image probing (flicker-free) ───────────────────────── */
const imageResolveCache = new Map();
const probeUrl = async (url, timeoutMs = 3500) => {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const h = await fetch(url, { method: 'HEAD', signal: controller.signal });
    if (h.ok) return true;
  } catch {}
  try {
    const g = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' }, signal: controller.signal });
    return g.ok;
  } catch {} finally { clearTimeout(tid); }
  return false;
};

/* Inline flicker-free <CascadingImage/> so ALL image logic stays here */
function CascadingImage({ candidates = [], sourceKey, style, fallbackUri, onFinalError, testID }) {
  const cacheKey = sourceKey || candidates[0] || '';
  const [uri, setUri] = useState(() => imageResolveCache.get(cacheKey) ?? null);
  const lastGoodRef = useRef(imageResolveCache.get(cacheKey) ?? null);

  const list = useMemo(() => Array.from(new Set(candidates.filter(Boolean))), [candidates]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!list.length) { setUri(lastGoodRef.current || fallbackUri || null); return; }
      if (imageResolveCache.has(cacheKey)) {
        const cached = imageResolveCache.get(cacheKey);
        if (cached) lastGoodRef.current = cached;
        setUri(cached || lastGoodRef.current || fallbackUri || null);
        return;
      }
      for (const u of list) {
        const ok = await probeUrl(u);
        if (cancelled) return;
        if (ok) {
          imageResolveCache.set(cacheKey, u);
          lastGoodRef.current = u;
          setUri(u);
          return;
        }
      }
      imageResolveCache.set(cacheKey, null);
      setUri(lastGoodRef.current || fallbackUri || null);
      onFinalError?.({ message: 'No candidate URL worked', candidates: list });
    })();
    return () => { cancelled = true; };
  }, [cacheKey, list, fallbackUri, onFinalError]);

  if (!uri && !fallbackUri) {
    return <View style={[style, { backgroundColor: '#e5e7eb', borderRadius: 12 }]} testID={testID} />;
  }
  return (
    <View style={style}>
      {/* Use native Image to avoid import cycle; RN will accept {uri} objects from parent */}
      <View style={[StyleSheet.absoluteFill, { borderRadius: style?.borderRadius }]} />
      {/* eslint-disable-next-line react-native/no-inline-styles */}
      <View style={{ flex: 1 }}>
        {/* We keep using RN.Image via require to avoid circular dep in some setups */}
        {React.createElement(require('react-native').Image, {
          testID,
          style: [style],
          source: { uri: uri || fallbackUri },
          onError: () => setUri(lastGoodRef.current || fallbackUri || null),
        })}
      </View>
    </View>
  );
}

/* ───────────────────────── Safe navigation (header owns this too) ───────────────────────── */
const routeExists = (nav, name) => {
  try { return !!nav?.getState?.()?.routeNames?.includes(name); } catch { return false; }
};
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

/* ───────────────────────── AddressChip ───────────────────────── */
const AddressChip = ({ address = '', onPress = () => {} }) => {
  if (!address) return null;
  return (
    <View style={{ marginTop: 10, alignItems: 'center', width: '100%' }}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.addressChip}>
        <Ionicons name="location-outline" size={16} color="#00b14f" />
        <Text numberOfLines={1} ellipsizeMode="tail" style={styles.addressText}>{address}</Text>
      </TouchableOpacity>
    </View>
  );
};

/* ───────────────────────── Main Header (ALL logic inside) ───────────────────────── */
export default function MerchantHeader() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const isTablet = width >= 768;
  const isLargePhone = width >= 400 && width < 768;
  const avatarSize = isTablet ? 56 : isLargePhone ? 48 : 44;

  // Header-owned state (no props or external context)
  const [merchantName, setMerchantName] = useState(DEFAULT_NAME);
  const [merchantLogo, setMerchantLogo] = useState(DEFAULT_AVATAR);
  const [profileAvatar, setProfileAvatar] = useState(null);
  const [businessAddress, setBusinessAddress] = useState('');
  const [businessLicense, setBusinessLicense] = useState('');
  const [ownerType, setOwnerType] = useState('food');
  const [businessId, setBusinessId] = useState(null);
  const [userId, setUserId] = useState(route?.params?.user_id ? String(route.params.user_id) : '');
  const [authContext, setAuthContext] = useState(route?.params?.authContext || null);
  const [loadingAvatar, setLoadingAvatar] = useState(false);

  /* build PROFILE_ENDPOINT/:userId URL */
  const buildProfileUrl = useCallback((uid) => {
    if (!uid || !PROFILE_ENDPOINT) return '';
    const base = normalizeHost((PROFILE_ENDPOINT || '').trim());
    return `${base.replace(/\/+$/, '')}/${encodeURIComponent(String(uid))}`;
  }, []);

  /* Hydrate from SecureStore (fast path) */
  const loadFromStore = useCallback(async () => {
    try {
      const raw = await SecureStore.getItemAsync(KEY_MERCHANT_LOGIN);
      if (!raw) return;
      const blob = JSON.parse(raw);
      const user = blob?.user ?? blob;

      const idCandidates = [
        blob?.user?.user_id,
        blob?.user?.id,
        blob?.user_id,
        blob?.id,
        blob?.merchant?.user_id,
        blob?.merchant?.id,
      ].filter(v => v !== undefined && v !== null && v !== '');
      if (!userId && idCandidates.length) setUserId(String(idCandidates[0]));

      const nameCandidate = blob?.business_name || user?.business_name;
      if (nameCandidate) setMerchantName(String(nameCandidate));

      const addrCandidate = user?.business_address || user?.address || user?.location || blob?.business_address || blob?.address || '';
      if (addrCandidate) setBusinessAddress(String(addrCandidate));

      const logoCandidate = blob?.business_logo || user?.business_logo || user?.logo_url;
      if (logoCandidate) setMerchantLogo(resolveImageUrl(logoCandidate));

      const profCandidate = blob?.profile_image || user?.profile_image || user?.avatar || user?.profile_photo || user?.photo_url;
      if (profCandidate) setProfileAvatar(resolveImageUrl(profCandidate));

      const bidCandidate = user?.business_id || user?.id || blob?.business_id || blob?.id || null;
      if (bidCandidate) setBusinessId(String(bidCandidate));

      const kind = (user?.owner_type || blob?.owner_type || '').toString().toLowerCase();
      if (kind === 'food' || kind === 'mart') setOwnerType(kind);

      const licenseCandidate = blob?.business_license || user?.business_license || user?.business_license_number || blob?.business_license_number || '';
      if (licenseCandidate) setBusinessLicense(String(licenseCandidate));
    } catch {}
  }, [userId]);

  /* Authoritative backend fetch: PROFILE_ENDPOINT/:userId */
  const loadFromBackend = useCallback(async (uid) => {
    const url = buildProfileUrl(uid);
    if (!url) return;
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

      // persist back to store so rest of app stays in sync (still header-owned)
      try {
        const raw = await SecureStore.getItemAsync(KEY_MERCHANT_LOGIN);
        let blob = {};
        try { blob = raw ? JSON.parse(raw) : {}; } catch {}
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
      } catch {}
    } catch (e) {
      if (__DEV__) console.log('[Header] profile fetch failed:', e?.message);
    }
  }, [buildProfileUrl]);

  /* Token-based “/me” fallback */
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
          if (__DEV__) console.log('[Header] /me fetch failed for', url, e?.message);
        }
      }
    } catch (e) {
      if (__DEV__) console.log('[Header] refreshFromServerMe unexpected:', e?.message);
    }
  }, []);

  /* Initial load & whenever route params change */
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.params?.user_id, route?.params?.authContext]);

  /* On focus → refresh quickly (header lives across tabs) */
  useEffect(() => {
    const unsub = navigation.addListener('focus', async () => {
      await loadFromStore();
      const uid = route?.params?.user_id || userId;
      if (uid) await loadFromBackend(String(uid));
    });
    return unsub;
  }, [navigation, userId, route?.params?.user_id, loadFromStore, loadFromBackend]);

  /* When app comes back to foreground */
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

  /* React to live events fired elsewhere in app */
  useEffect(() => {
    const sub1 = DeviceEventEmitter.addListener('merchant-updated', async () => {
      await loadFromStore();
      const uid = route?.params?.user_id || userId;
      if (uid) await loadFromBackend(String(uid));
    });
    const sub2 = DeviceEventEmitter.addListener('profile-updated', async (payload) => {
      try {
        if (payload?.profile_image) setProfileAvatar(resolveImageUrl(payload.profile_image));
        if (payload?.business_logo) setMerchantLogo(resolveImageUrl(payload.business_logo));
        if (payload?.business_name) setMerchantName(String(payload.business_name));
      } catch {}
      const uid = route?.params?.user_id || userId;
      if (uid) await loadFromBackend(String(uid));
    });
    return () => { sub1.remove(); sub2.remove(); };
  }, [loadFromBackend, loadFromStore, route?.params?.user_id, userId]);

  /* Build params to pass when navigating from header */
  const navParams = useMemo(() => ({
    user_id: userId,
    business_id: businessId,
    business_name: merchantName,
    business_logo: merchantLogo,
    profile_image: profileAvatar,
    business_address: businessAddress,
    business_license: businessLicense,
    owner_type: ownerType,
    authContext,
  }), [userId, businessId, merchantName, merchantLogo, profileAvatar, businessAddress, businessLicense, ownerType, authContext]);

  const goToAccountSettings = () => safeNavigate(navigation, 'AccountSettings', navParams, 'ProfileBusinessDetails');
  const goToProfileBusinessDetails = () => safeNavigate(navigation, 'ProfileBusinessDetails', navParams);

  const avatarCands = (u) => (u ? [u] : []);
  const profCands   = (u) => (u ? [u] : [DEFAULT_AVATAR]);

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
      <Text style={styles.hi}>Welcome back</Text>

      <View style={styles.headerRow}>
        <View style={styles.inlineRow}>
          <TouchableOpacity
            onPress={goToProfileBusinessDetails}
            activeOpacity={0.85}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ position: 'relative' }}
          >
            <CascadingImage
              candidates={avatarCands(merchantLogo)}
              sourceKey={merchantLogo}
              fallbackUri={DEFAULT_AVATAR}
              style={[styles.avatar, { width: avatarSize, height: avatarSize }]}
              onFinalError={() => {}}
              testID="merchantLogo"
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

        <TouchableOpacity
          onPress={goToAccountSettings}
          activeOpacity={0.85}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <CascadingImage
            candidates={profCands(profileAvatar)}
            sourceKey={profileAvatar || DEFAULT_AVATAR}
            fallbackUri={DEFAULT_AVATAR}
            style={[styles.profileCircle, { width: avatarSize, height: avatarSize }]}
            onFinalError={() => {}}
            testID="profileAvatar"
          />
        </TouchableOpacity>
      </View>

      <AddressChip address={businessAddress} onPress={goToProfileBusinessDetails} />
    </LinearGradient>
  );
}

/* ───────────────────────── Styles ───────────────────────── */
const styles = StyleSheet.create({
  hi: { fontSize: 20, color: '#e8fff6', opacity: 0.9, fontWeight: '900', marginBottom: 2 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  inlineRow: { flexDirection: 'row', alignItems: 'center' },
  merchantName: { color: 'white', fontWeight: '700' },
  avatar: { borderRadius: 12, backgroundColor: '#fff' },
  profileCircle: { borderRadius: 9999, backgroundColor: '#fff' },

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
});
