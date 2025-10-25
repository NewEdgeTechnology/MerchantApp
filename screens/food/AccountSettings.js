// AccountSettings.js — avatar via PROFILE_IMAGE base + robust logout using LOGOUT_ENDPOINT
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Dimensions,
  ScrollView, Image as RNImage, Alert, DeviceEventEmitter, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ✅ Use legacy API to avoid deprecation warnings in SDK 54+
import * as FileSystem from 'expo-file-system/legacy';

import {
  PROFILE_ENDPOINT,
  PROFILE_IMAGE as PROFILE_IMAGE_ENDPOINT,
  LOGOUT_ENDPOINT as ENV_LOGOUT_ENDPOINT,                // ⬅️ bring the .env logout here
} from '@env';

const { width } = Dimensions.get('window');
const KEY_MERCHANT_LOGIN = 'merchant_login';

const DEFAULT_AVATAR =
  'https://images.unsplash.com/photo-1612198182421-3f5dff0c9b40?q=80&w=400&auto=format&fit=crop';

// ───────────────────────── URL helpers (minimal) ─────────────────────────
const DEFAULT_DEV_ORIGIN = Platform.select({
  android: 'http://10.0.2.2:3000',
  ios: 'http://localhost:3000',
  default: 'http://localhost:3000',
});
const isLocalOrData = (u = '') =>
  /^data:image\//i.test(u) || /^file:\/\//i.test(u) || /^content:\/\//i.test(u);

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

// add ?v=version once server-side image actually changes (cache-bust)
function withVersion(url, version) {
  if (!url || !version) return url;
  try {
    const u = new URL(url);
    u.searchParams.set('v', String(version));
    return u.toString();
  } catch {
    return url.includes('?') ? `${url}&v=${version}` : `${url}?v=${version}`;
  }
}

// Convert relative -> absolute using PROFILE_IMAGE_ENDPOINT base
const makeAbsolute = (maybeRelative, base = PROFILE_IMAGE_ENDPOINT) => {
  if (!maybeRelative) return null;
  const s = String(maybeRelative);
  if (/^https?:\/\//i.test(s)) return s; // already absolute
  const b = (base || '').replace(/\/+$/, '');
  const p = s.startsWith('/') ? s.slice(1) : s;
  return `${b}/${p}`;
};

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
  } finally {
    clearTimeout(tid);
  }
}

// ───────────────────────── Logout helpers ─────────────────────────
const SECURE_KEYS = [
  KEY_MERCHANT_LOGIN,
  'auth_token',
  'refresh_token',
  'user_profile',
  'session',
];

async function clearCredentialStores() {
  try {
    await Promise.allSettled(SECURE_KEYS.map(k => SecureStore.deleteItemAsync(k)));
  } catch {}
  try {
    await AsyncStorage.clear();
  } catch {}
}

async function clearImageCacheAsync() {
  try {
    const dirs = [
      `${FileSystem.cacheDirectory}ImagePicker/`,
      `${FileSystem.cacheDirectory}Image/`,
      `${FileSystem.cacheDirectory}ExpoImage/`,
    ];
    for (const dir of dirs) {
      const info = await FileSystem.getInfoAsync(dir);
      if (info.exists) {
        await FileSystem.deleteAsync(dir, { idempotent: true });
      }
    }
  } catch {}
}

function resetLocalState(setters) {
  const { setName, setImageUri, setImgVersion, setBiz, setBusinessLicense } = setters;
  setName('Pema Chozom');
  setImageUri(null);
  setImgVersion(null);
  setBiz({
    business_name: '',
    business_license_number: '',
    business_logo: '',
    delivery_option: '',
    address: '',
    latitude: '',
    longitude: '',
  });
  setBusinessLicense('');
  DeviceEventEmitter.emit('logged-out');
}

/** Try to obtain an existing merchant socket from your shared connector. */
function getExistingMerchantSocket() {
  try {
    const mod = require('../realtime/merchantSocket');
    return mod?.getMerchantSocket?.() || mod?.socket || global?.merchantSocket || null;
  } catch {
    return global?.merchantSocket || null;
  }
}

/** Politely notify server + disconnect socket; always safe to call. */
async function disconnectSocketGracefully({ userId, businessId }) {
  try {
    const sock = getExistingMerchantSocket();
    if (!sock) return;

    if (sock?.connected) {
      try {
        sock.emit?.('merchant:logout', { userId, businessId });
        await new Promise(r => setTimeout(r, 120));
      } catch {}
    }

    try { sock.removeAllListeners?.(); } catch {}
    try { sock.disconnect?.(); } catch {}
    try { sock.close?.(); } catch {}
  } catch {
    // swallow — logout must not crash
  } finally {
    try { if (global?.merchantSocket) global.merchantSocket = null; } catch {}
  }
}

/** Build the concrete logout URL from .env pattern like .../logout/{user_id} */
function resolveLogoutUrlFromEnv(userId) {
  const raw = (ENV_LOGOUT_ENDPOINT || '').trim();
  if (!raw) return null;
  const id = encodeURIComponent(String(userId ?? '').trim());
  if (!id) return null;
  return raw.replace('{user_id}', id);
}

/** Optionally tell backend to invalidate tokens. Accepts explicit endpoint or falls back to .env */
async function attemptServerLogout({ explicitEndpoint, userId }) {
  const endpoint =
    explicitEndpoint ||
    resolveLogoutUrlFromEnv(userId) ||
    null;

  if (!endpoint) return;

  // Prefer POST; if the server rejects body, we retry with GET (many simple logout routes are GET)
  const refresh = await SecureStore.getItemAsync('refresh_token');
  const access = await SecureStore.getItemAsync('auth_token');
  const baseHeaders = { 'Content-Type': 'application/json' };
  if (access) baseHeaders['Authorization'] = `Bearer ${access}`;

  try {
    await fetchJSON(endpoint, {
      method: 'POST',
      headers: baseHeaders,
      body: JSON.stringify({ refresh_token: refresh || undefined }),
    });
  } catch {
    // Retry once with GET (no body)
    try {
      await fetchJSON(endpoint, { method: 'GET', headers: baseHeaders });
    } catch {
      // non-fatal; continue local logout
    }
  }
}

// ───────────────────────── Component ─────────────────────────
const AccountSettings = () => {
  const route = useRoute();
  const navigation = useNavigation();

  const [name, setName] = useState('Pema Chozom');

  const [imageUri, setImageUri] = useState(null);
  const [imgError, setImgError] = useState(null);
  const [imgVersion, setImgVersion] = useState(null);

  const [userId, setUserId] = useState(route?.params?.user_id ? String(route.params.user_id) : '');
  const [businessId, setBusinessId] = useState(route?.params?.business_id ? String(route.params.business_id) : '');
  const authContext = route?.params?.authContext || null;

  const [biz, setBiz] = useState({
    business_name: route?.params?.business_name || '',
    business_license_number: '',
    business_logo: route?.params?.business_logo || '',
    delivery_option: '',
    address: route?.params?.business_address || '',
    latitude: '',
    longitude: '',
  });

  const [businessLicense, setBusinessLicense] = useState(
    route?.params?.business_license || ''
  );

  const buildProfileUrl = useCallback((uid) => {
    if (!uid || !PROFILE_ENDPOINT) return '';
    const base = normalizeHost((PROFILE_ENDPOINT || '').trim()).replace(/\/+$/, '');
    return `${base}/${encodeURIComponent(String(uid))}`;
  }, []);

  // Centralized: resolve with PROFILE_IMAGE base; add version when known
  const setAvatarFrom = useCallback(async (raw, version = null) => {
    if (!raw) {
      setImageUri(DEFAULT_AVATAR);
      setImgError(null);
      return;
    }
    try {
      const abs = isLocalOrData(raw) ? raw : makeAbsolute(String(raw), PROFILE_IMAGE_ENDPOINT);
      const final = isLocalOrData(abs) ? abs : withVersion(abs, version);
      setImageUri(final || DEFAULT_AVATAR);
      setImgError(null);
      if (version) setImgVersion(String(version));
    } catch {
      setImageUri(DEFAULT_AVATAR);
      setImgError(null);
    }
  }, []);

  // Optional warm-cache
  useEffect(() => {
    if (imageUri && /^https?:\/\//i.test(imageUri)) {
      RNImage.prefetch(imageUri).catch(() => {});
    }
  }, [imageUri]);

  const loadFromStore = useCallback(async () => {
    try {
      const raw = await SecureStore.getItemAsync(KEY_MERCHANT_LOGIN);
      if (!raw) return;
      const blob = JSON.parse(raw);

      const idCandidates = [
        blob?.user?.user_id,
        blob?.user?.id,
        blob?.user_id,
        blob?.id,
        blob?.merchant?.user_id,
        blob?.merchant?.id,
      ].filter(v => v !== undefined && v !== null && v !== '');
      if (!userId && idCandidates.length) setUserId(String(idCandidates[0]));

      const bidCandidate =
        blob?.business_id ||
        blob?.user?.business_id ||
        blob?.merchant?.business_id ||
        blob?.user?.id ||
        blob?.id ||
        null;
      if (!businessId && bidCandidate) setBusinessId(String(bidCandidate));

      const nameCandidate =
        blob?.display_name ||
        blob?.username ||
        blob?.user_name ||
        blob?.user?.display_name ||
        blob?.user?.user_name ||
        blob?.user?.name;
      if (nameCandidate) setName(String(nameCandidate));

      const imgCandidate =
        blob?.profile_image ||
        blob?.user?.profile_image ||
        blob?.avatar ||
        blob?.user?.avatar ||
        blob?.business_logo ||
        blob?.user?.business_logo;

      const vCandidate =
        blob?.profile_image_version ||
        blob?.user?.profile_image_version ||
        blob?.user?.updated_at ||
        blob?.updated_at ||
        null;

      if (imgCandidate) await setAvatarFrom(imgCandidate, vCandidate);

      const bizSource =
        blob?.merchant_business_details ||
        blob?.business ||
        blob?.merchant ||
        blob?.business_details ||
        {};
      setBiz(prev => ({
        ...prev,
        business_name: bizSource?.business_name ?? prev.business_name,
        business_license_number: bizSource?.business_license_number ?? '',
        business_logo: bizSource?.business_logo ?? prev.business_logo,
        delivery_option: bizSource?.delivery_option ?? '',
        address: bizSource?.address ?? prev.address,
        latitude: bizSource?.latitude ?? '',
        longitude: bizSource?.longitude ?? '',
      }));

      const licenseCandidate =
        blob?.business_license ||
        blob?.business_license_number ||
        blob?.merchant_business_details?.business_license_number ||
        blob?.merchant?.business_license_number ||
        '';
      if (licenseCandidate) setBusinessLicense(String(licenseCandidate));
    } catch {
      // ignore
    }
  }, [userId, businessId, setAvatarFrom]);

  const loadFromBackend = useCallback(async (uid) => {
    const url = buildProfileUrl(uid);
    if (!url) return;
    try {
      const data = await fetchJSON(url, { method: 'GET' });

      if (data?.user_name) setName(String(data.user_name));

      const version =
        data?.profile_image_version ||
        data?.updated_at ||
        data?.user_updated_at ||
        null;

      if (data?.profile_image) {
        await setAvatarFrom(String(data.profile_image), version);
      }

      const bid = data?.business_id ?? data?.id ?? null;
      if (bid && !businessId) setBusinessId(String(bid));

      const license =
        data?.business_license ||
        data?.business_license_number ||
        '';
      if (license) setBusinessLicense(String(license));

      const mergedBiz = {
        business_name: data?.business_name ?? biz.business_name,
        business_license_number: data?.business_license_number ?? biz.business_license_number,
        business_logo: data?.business_logo ?? biz.business_logo,
        delivery_option: data?.delivery_option ?? biz.delivery_option,
        address: data?.address ?? biz.address,
        latitude: data?.latitude ?? biz.latitude,
        longitude: data?.longitude ?? biz.longitude,
      };
      setBiz(mergedBiz);

      try {
        const raw = await SecureStore.getItemAsync(KEY_MERCHANT_LOGIN);
        let blob = {};
        try { blob = raw ? JSON.parse(raw) : {}; } catch {}
        const merged = {
          ...blob,
          user_id: data?.user_id ?? blob.user_id,
          user_name: data?.user_name ?? blob.user_name,
          profile_image: data?.profile_image ?? blob.profile_image,
          profile_image_version: version ?? blob.profile_image_version,
          updated_at: data?.updated_at ?? blob.updated_at,
          business_id: bid ?? blob?.business_id,
          user: {
            ...(blob.user || {}),
            user_id: data?.user_id ?? blob?.user?.user_id,
            user_name: data?.user_name ?? blob?.user?.user_name,
            display_name: data?.user_name ?? blob?.user?.display_name,
            profile_image: data?.profile_image ?? blob?.user?.profile_image,
            profile_image_version: version ?? blob?.user?.profile_image_version,
            business_id: bid ?? blob?.user?.business_id,
            updated_at: data?.user_updated_at ?? blob?.user?.updated_at,
          },
          merchant_business_details: {
            ...(blob.merchant_business_details || {}),
            business_name: mergedBiz.business_name,
            business_license_number: mergedBiz.business_license_number,
            business_logo: mergedBiz.business_logo,
            delivery_option: mergedBiz.delivery_option,
            address: mergedBiz.address,
            latitude: mergedBiz.latitude,
            longitude: mergedBiz.longitude,
          },
        };
        await SecureStore.setItemAsync(KEY_MERCHANT_LOGIN, JSON.stringify(merged));
      } catch {}
    } catch {
      // keep store values silently
    }
  }, [buildProfileUrl, biz, businessId, setAvatarFrom]);

  // First load
  useEffect(() => {
    (async () => {
      if (!userId) await loadFromStore();
      if (userId) await loadFromBackend(userId);
    })();
  }, [userId, loadFromStore, loadFromBackend]);

  // On focus: refresh store + backend
  useEffect(() => {
    const unsub = navigation.addListener('focus', async () => {
      await loadFromStore();
      if (userId) await loadFromBackend(userId);
    });
    return unsub;
  }, [navigation, userId, loadFromStore, loadFromBackend]);

  // Listen for upstream updates
  useEffect(() => {
    const subA = DeviceEventEmitter.addListener('profile-updated', async (payload) => {
      if (payload?.name) setName(String(payload.name));
      const v = payload?.profile_image_version || imgVersion || null;
      if (payload?.profile_image) await setAvatarFrom(payload.profile_image, v);
      if (userId) await loadFromBackend(userId);
    });
    const subB = DeviceEventEmitter.addListener('business-updated', async (payload) => {
      if (payload && typeof payload === 'object') setBiz(prev => ({ ...prev, ...payload }));
      if (userId) await loadFromBackend(userId);
    });
    return () => { subA.remove(); subB.remove(); };
  }, [userId, loadFromBackend, setAvatarFrom, imgVersion]);

  // Local image picker (long-press on avatar)
  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission required", "We need permission to access your gallery.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (!result.cancelled && !result.canceled) {
      const uri = result?.assets?.[0]?.uri || result?.uri;
      if (uri) {
        await setAvatarFrom(uri, null);
      }
    }
  };

  // Navigate helpers
  const goToPersonalInformation = () => {
    navigation.navigate('PersonalInformation', {
      user_id: userId,
      business_id: businessId,
      username: name,
      business_name: biz.business_name || name,
      business_logo: biz.business_logo || imageUri || '',
      business_license: businessLicense,
      profile_image_url: imageUri || '',
      authContext,
    });
  };
  const goToBusinessDetails = () => {
    navigation.navigate('ProfileBusinessDetails', {
      user_id: userId,
      business_id: businessId,
      ...biz,
      business_license: businessLicense,
      authContext,
    });
  };

  /** Full, graceful logout pipeline: revoke server session → disconnect socket → clear stores → reset nav */
  const handleLogoutNow = useCallback(async () => {
    try {
      // 1) Hook for app-specific side effects
      if (authContext?.onBeforeLogout) {
        try { await authContext.onBeforeLogout(); } catch {}
      }

      // 2) Server-side token/session invalidation
      const explicitEndpoint =
        authContext?.logoutEndpoint ||
        route?.params?.logoutEndpoint ||
        null;

      await attemptServerLogout({
        explicitEndpoint,           // if passed via route/context, this wins
        userId,                     // else we build from ENV_LOGOUT_ENDPOINT with {user_id}
      });

      // 3) Disconnect realtime socket & notify server presence
      await disconnectSocketGracefully({ userId, businessId });

      // 4) Local cleanup
      await clearCredentialStores();
      await clearImageCacheAsync();
      resetLocalState({ setName, setImageUri, setImgVersion, setBiz, setBusinessLicense });

      // 5) Post-logout hook
      if (authContext?.onAfterLogout) {
        try { await authContext.onAfterLogout(); } catch {}
      }
    } finally {
      // 6) Always reset to login
      navigation.reset({
        index: 0,
        routes: [{ name: 'LoginScreen' }],
      });
    }
  }, [authContext, route?.params, userId, businessId, navigation]);

  // Hard logout: confirm then run pipeline
  const logOut = useCallback(() => {
    Alert.alert(
      'Log out',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log out',
          style: 'destructive',
          onPress: handleLogoutNow,
        },
      ]
    );
  }, [handleLogoutNow]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          {/* Avatar (tap → PersonalInformation, long-press → pick local) */}
          <TouchableOpacity
            style={styles.profileIconContainer}
            activeOpacity={0.7}
            onPress={goToPersonalInformation}
            onLongPress={pickImage}
          >
            {imageUri ? (
              <RNImage
                source={{ uri: imageUri }}
                style={styles.profileImage}
                onError={() => {
                  setImageUri(DEFAULT_AVATAR);
                  setImgError(null);
                }}
              />
            ) : (
              <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="person-circle-outline" size={80} color="#16a34a" />
                {imgError ? (
                  <Text style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }} numberOfLines={1}>
                    {imgError}
                  </Text>
                ) : null}
              </View>
            )}
          </TouchableOpacity>

          <View style={styles.nameContainer}>
            <Text style={styles.name}>{name}</Text>
          </View>

          <TouchableOpacity style={styles.editButton} onPress={goToPersonalInformation}>
            <Ionicons name="create-outline" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Sections */}
        <TouchableOpacity style={styles.section} onPress={goToPersonalInformation}>
          <Text style={styles.text}>Personal Information</Text>
          <Ionicons name="chevron-forward" size={24} color="#16a34a" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.section} onPress={goToBusinessDetails}>
          <View style={{ flex: 1 }}>
            <Text style={styles.text}>Business Details</Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#16a34a" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.section} onPress={() => navigation.navigate('PasswordManagement', { authContext })}>
          <Text style={styles.text}>Password Management</Text>
          <Ionicons name="chevron-forward" size={24} color="#16a34a" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.section} onPress={() => navigation.navigate('SecuritySettings', { authContext })}>
          <Text style={styles.text}>Security & Privacy</Text>
          <Ionicons name="chevron-forward" size={24} color="#16a34a" />
        </TouchableOpacity>

        {/* Wallet */}
        <TouchableOpacity style={styles.section} onPress={() => navigation.navigate('WalletScreen', { authContext })}>
          <Text style={styles.text}>Wallet</Text>
          <Ionicons name="chevron-forward" size={24} color="#16a34a" />
        </TouchableOpacity>

        {/* Feedback */}
        <TouchableOpacity style={styles.section} onPress={() => navigation.navigate('FeedbackScreen', { authContext })}>
          <Text style={styles.text}>Feedback</Text>
          <Ionicons name="chevron-forward" size={24} color="#16a34a" />
        </TouchableOpacity>

        {/* Log Out */}
        <TouchableOpacity style={styles.logoutSection} onPress={logOut}>
          <Text style={[styles.text, styles.logoutText]}>Log Out</Text>
          <Ionicons name="log-out-outline" size={24} color="#F44336" />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9f9f9' },
  scrollContainer: { paddingHorizontal: 20, paddingTop: 8 },
  profileHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 30, marginTop: 20 },
  profileIconContainer: {
    marginRight: 20,
    borderWidth: 2,
    borderColor: '#ddd',
    borderRadius: 50,
    padding: 2,
    backgroundColor: '#fff',
  },
  profileImage: { width: 80, height: 80, borderRadius: 40 },
  nameContainer: { flex: 1 },
  name: { fontSize: width > 400 ? 22 : 18, fontWeight: 'bold', color: '#333' },
  editButton: { backgroundColor: '#16a34a', borderRadius: 20, padding: 8, marginLeft: 10 },
  section: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 18, borderBottomWidth: 1, borderColor: '#ddd', marginBottom: 10,
  },
  logoutSection: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 18, borderBottomWidth: 1, borderColor: '#ddd', marginBottom: 10, marginTop: 30,
  },
  text: { fontSize: width > 400 ? 18 : 16, color: '#333', fontWeight: '600' },
  logoutText: { color: '#F44336' },
});

export default AccountSettings;
