// PersonalInformation.js — header matches ProfileBusinessDetails (back button + centered title + extra top space)
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Alert,
  Image,
  ActivityIndicator,
  Platform,
  DeviceEventEmitter,
  ScrollView,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { PROFILE_ENDPOINT } from '@env';

const { width } = Dimensions.get('window');
const KEY_MERCHANT_LOGIN = 'merchant_login';

/** Normalize localhost for Android emulator */
function normalizeHost(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    if (
      Platform.OS === 'android' &&
      (u.hostname === 'localhost' || u.hostname === '127.0.0.1')
    ) {
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
function cacheBust(u) {
  if (!u) return u;
  try {
    const url = new URL(u);
    url.searchParams.set('t', String(Date.now()));
    return url.toString();
  } catch {
    const sep = u.includes('?') ? '&' : '?';
    return `${u}${sep}t=${Date.now()}`;
  }
}
function isHttpOrRelativePath(src) {
  if (!src) return false;
  return /^https?:\/\//i.test(src) || src.startsWith('/');
}
function isLocalFileUri(src) {
  if (!src) return false;
  return /^file:\/\//i.test(src) || /^content:\/\//i.test(src) || /^asset:\/\//i.test(src) || /^ph:\/\//i.test(src);
}
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
async function discoverUserIdFromStore() {
  try {
    const raw = await SecureStore.getItemAsync(KEY_MERCHANT_LOGIN);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const candidates = [
      data?.user?.user_id,
      data?.user?.id,
      data?.user_id,
      data?.id,
      data?.merchant?.user_id,
      data?.merchant?.id,
    ].filter(v => v !== undefined && v !== null && v !== '');
    if (candidates.length) return String(candidates[0]);
  } catch {}
  return null;
}

export default function PersonalInformation() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const route = useRoute();
  const params = route?.params || {};

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [avatar, setAvatar] = useState('');
  const [userId, setUserId] = useState(params?.user_id ? String(params.user_id) : '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const endpoint = useMemo(() => {
    if (!PROFILE_ENDPOINT || !userId) return '';
    const base = normalizeHost(PROFILE_ENDPOINT.trim()); // e.g. http://localhost:3000/api/profile
    return `${base.replace(/\/+$/, '')}/${encodeURIComponent(userId)}`; // /:user_id
  }, [userId]);

  useEffect(() => {
    (async () => {
      if (userId) return;
      const discovered = await discoverUserIdFromStore();
      if (discovered) setUserId(discovered);
      else {
        setError('Missing user_id. Pass it via navigation or store it at login.');
        setLoading(false);
      }
    })();
  }, []);

  const hydrateFromPayload = (payload) => {
    setName(payload?.user_name || '');
    setEmail(payload?.email || '');
    setPhone(payload?.phone || '');

    const origin = getOrigin(normalizeHost(PROFILE_ENDPOINT));
    if (payload?.profile_image) {
      const src = String(payload.profile_image);
      const isAbsolute = /^https?:\/\//i.test(src);
      const resolved = isAbsolute ? src : origin ? `${origin}${src.startsWith('/') ? '' : '/'}${src}` : src;
      setAvatar(cacheBust(resolved));
    } else {
      setAvatar('');
    }
  };

  const fetchProfile = useCallback(async () => {
    if (!endpoint) { setLoading(false); return; }
    try {
      setError(null); setLoading(true);
      const data = await fetchJSON(endpoint, { method: 'GET' });
      hydrateFromPayload(data);
    } catch (e) {
      setError(e.message || 'Failed to fetch profile');
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => { if (userId) fetchProfile(); }, [userId, fetchProfile]);

  const handleChangePhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { Alert.alert('Permission required', 'We need permission to access your gallery.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1,1], quality: 1,
    });
    if (!result.cancelled && !result.canceled) {
      const uri = result?.assets?.[0]?.uri || result?.uri;
      if (uri) setAvatar(uri); // local preview; backend will receive file via multipart
    }
  };

  const persistLocalAndNotify = async (payload) => {
    try {
      const raw = await SecureStore.getItemAsync(KEY_MERCHANT_LOGIN);
      let blob = {};
      try { blob = raw ? JSON.parse(raw) : {}; } catch {}
      const merged = {
        ...blob,
        user_name: payload?.user_name ?? name,
        email: payload?.email ?? email,
        phone: payload?.phone ?? phone,
        profile_image: payload?.profile_image ?? avatar,
        user: {
          ...(blob.user || {}),
          user_id: userId,
          user_name: payload?.user_name ?? name,
          display_name: payload?.user_name ?? name,
          email: payload?.email ?? email,
          phone: payload?.phone ?? phone,
          profile_image: payload?.profile_image ?? avatar,
        },
      };
      await SecureStore.setItemAsync(KEY_MERCHANT_LOGIN, JSON.stringify(merged));
    } catch {}
    DeviceEventEmitter.emit('profile-updated', {
      name: payload?.user_name ?? name,
      profile_image: payload?.profile_image ?? avatar,
    });
  };

  const putJson = async () => {
    const body = { user_name: name, email, phone, profile_image: avatar };
    return fetchJSON(endpoint, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  };

  const putMultipart = async () => {
    const form = new FormData();
    form.append('user_name', String(name ?? ''));
    form.append('email', String(email ?? ''));
    form.append('phone', String(phone ?? ''));
    // Attach the file only if avatar is a local file URI
    if (isLocalFileUri(avatar)) {
      const filename = `avatar_${Date.now()}.jpg`;
      form.append('profile_image', {
        uri: avatar,
        name: filename,
        type: 'image/jpeg',
      });
    } else if (isHttpOrRelativePath(avatar)) {
      form.append('profile_image', String(avatar));
    }
    const res = await fetch(endpoint, {
      method: 'PUT',
      body: form,
      // Do NOT set Content-Type; fetch sets multipart boundary
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch {}
    if (!res.ok) {
      const msg = (json && (json.message || json.error)) || text || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return json;
  };

  const handleSave = async () => {
    if (!endpoint) return;
    try {
      setLoading(true);

      // Decide how to send the payload:
      try {
        if (isLocalFileUri(avatar)) {
          await putMultipart();
        } else {
          await putJson();
        }
      } catch (firstErr) {
        // Fallback: try multipart if JSON failed and avatar is URL/path
        if (!isLocalFileUri(avatar)) {
          await putMultipart();
        } else {
          throw firstErr;
        }
      }

      // Re-fetch the canonical record
      const fresh = await fetchJSON(endpoint, { method: 'GET' });
      hydrateFromPayload(fresh);

      // Persist & notify
      const origin = getOrigin(normalizeHost(PROFILE_ENDPOINT));
      const src = fresh?.profile_image ? String(fresh.profile_image) : avatar;
      const resolved = src
        ? (/^https?:\/\//i.test(src) ? src : (origin ? `${origin}${src.startsWith('/') ? '' : '/'}${src}` : src))
        : '';
      await persistLocalAndNotify({
        user_name: fresh?.user_name ?? name,
        email: fresh?.email ?? email,
        phone: fresh?.phone ?? phone,
        profile_image: resolved ? cacheBust(resolved) : '',
      });

      Alert.alert('Saved', 'Profile updated successfully.');
      navigation.goBack();
    } catch (e) {
      Alert.alert('Save failed', e?.message || 'Try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Header top padding like ProfileBusinessDetails
  const headerTopPad = Math.max(insets.top, 8) + 18;

  if (loading) return (
    <View style={styles.centerWrap}>
      <ActivityIndicator size="large" color="#16a34a" />
      <Text style={{ marginTop: 10, color: '#475569' }}>Loading profile…</Text>
    </View>
  );

  if (error) return (
    <View style={styles.centerWrap}>
      <Text style={styles.errorTitle}>Couldn’t load data</Text>
      <Text style={styles.errorText}>{error}</Text>
      <TouchableOpacity onPress={fetchProfile} style={[styles.saveButton,{marginTop:16}]}>
        <Text style={styles.saveButtonText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['left','right','bottom']}>
      {/* Header matches the “above” style */}
      <View style={[styles.headerBar, { paddingTop: headerTopPad }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Personal Information</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollInner} keyboardShouldPersistTaps="handled">
        <View style={styles.avatarWrap}>
          {!!avatar ? (
            <Image source={{ uri: avatar }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor:'#e2e8f0' }]} />
          )}
        </View>
        <TouchableOpacity onPress={handleChangePhoto} style={styles.changePhotoBtn}>
          <Text style={styles.changePhotoText}>Change Photo</Text>
        </TouchableOpacity>

        <Text style={styles.label}>Name</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Full name" />

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="email@example.com"
        />

        <Text style={styles.label}>Phone</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="Your phone number"
        />

        <TouchableOpacity style={styles.saveButton} onPress={handleSave} activeOpacity={0.9}>
          <Text style={styles.saveButtonText}>Save Changes</Text>
        </TouchableOpacity>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },

  // Header bar like ProfileBusinessDetails
  headerBar: {
    minHeight: 52,
    paddingHorizontal: 12,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomColor: '#e5e7eb',
    borderBottomWidth: 1,
    backgroundColor: '#fff',
  },
  backBtn: { height: 40, width: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: '#0f172a' },

  scrollInner: { padding: 18 },

  avatarWrap:{ alignItems:'center', marginVertical:10 },
  avatar:{ width:100, height:100, borderRadius:50, borderColor:'#e2e8f0', borderWidth:2, backgroundColor:'#f8fafc' },
  changePhotoBtn:{ alignSelf:'center', marginTop:8, marginBottom:4 },
  changePhotoText:{ color:'#0ea5e9', fontWeight:'600' },

  label:{ fontSize:width>400?18:16, marginVertical:5, color:'#334155' },
  input:{
    borderWidth:1, borderColor:'#e2e8f0', padding:12, borderRadius:8, marginBottom:20,
    fontSize:width>400?18:16, backgroundColor:'#fff'
  },

  saveButton:{ backgroundColor:'#16a34a', padding:15, borderRadius:10, alignItems:'center', elevation:1 },
  saveButtonText:{ color:'#fff', fontSize:width>400?18:16, fontWeight:'700' },

  centerWrap:{ flex:1, alignItems:'center', justifyContent:'center', paddingHorizontal:24, backgroundColor:'#fff' },
  errorTitle:{ fontSize:18, fontWeight:'700', color:'#b91c1c', marginBottom:6, textAlign:'center' },
  errorText:{ color:'#7f1d1d', textAlign:'center' },
});
