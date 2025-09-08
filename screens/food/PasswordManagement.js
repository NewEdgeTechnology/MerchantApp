// screens/settings/PasswordManagement.js — calls POST /api/profile/password/:user_id with {current_password,new_password}
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Alert,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  Keyboard,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import * as SecureStore from 'expo-secure-store';
import { PASSWORD_CHANGE_ENDPOINT } from '@env';

const { width } = Dimensions.get('window');
const THEME_GREEN = '#16a34a';
const KEY_MERCHANT_LOGIN = 'merchant_login';
const KEY_AUTH_TOKEN = 'auth_token';

/* ---------- Android emulator localhost helper ---------- */
function androidLoopback(absUrl) {
  if (!absUrl || Platform.OS !== 'android') return absUrl;
  try {
    const u = new URL(absUrl);
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
      u.hostname = '10.0.2.2';
    }
    return u.toString();
  } catch {
    return absUrl;
  }
}

export default function PasswordManagement() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();

  // Prefer user_id from route, else load from SecureStore
  const routeUserId = route?.params?.user_id ?? route?.params?.id ?? null;
  const [resolvedUserId, setResolvedUserId] = useState(routeUserId);
  const [authToken, setAuthToken] = useState(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [saving, setSaving] = useState(false);

  // focus states for outline + rules-on-focus
  const [isCurrentFocused, setIsCurrentFocused] = useState(false);
  const [isNewFocused, setIsNewFocused] = useState(false);
  const [isConfirmFocused, setIsConfirmFocused] = useState(false);

  // ---- keyboard padding ----
  const [kbHeight, setKbHeight] = useState(0);
  useEffect(() => {
    const onShow = Keyboard.addListener('keyboardDidShow', (e) => {
      setKbHeight(e?.endCoordinates?.height ?? 0);
    });
    const onHide = Keyboard.addListener('keyboardDidHide', () => setKbHeight(0));
    return () => { onShow.remove(); onHide.remove(); };
  }, []);

  // Resolve user_id + token from SecureStore if not passed
  useEffect(() => {
    (async () => {
      try {
        if (!resolvedUserId) {
          const raw = await SecureStore.getItemAsync(KEY_MERCHANT_LOGIN);
          if (raw) {
            try {
              const obj = JSON.parse(raw);
              const uid =
                obj?.user_id ??
                obj?.user?.user_id ??
                obj?.id ??
                obj?.user?.id ??
                null;
              if (uid) setResolvedUserId(uid);
            } catch {}
          }
        }
        const t = await SecureStore.getItemAsync(KEY_AUTH_TOKEN);
        if (t) setAuthToken(t);
      } catch {}
    })();
  }, []); // run once

  // ===== Rules (SignupScreen style) =====
  const rules = useMemo(() => {
    const v = String(newPassword || '');
    return {
      length: v.length >= 8,
      upperLower: /[A-Z]/.test(v) && /[a-z]/.test(v),
      number: /\d/.test(v),
      noSpace: /^\S*$/.test(v),
      noRepeat: !/(.)\1{3,}/.test(v),
    };
  }, [newPassword]);

  const passedCount = useMemo(() => Object.values(rules).filter(Boolean).length, [rules]);

  const strengthInfo = useMemo(() => {
    if (!newPassword) return { label: '—', bar: 0, color: '#94a3b8' };
    if (passedCount <= 2) return { label: 'Weak', bar: 0.33, color: '#ef4444' };
    if (passedCount === 3 || passedCount === 4) return { label: 'Medium', bar: 0.66, color: '#f59e0b' };
    return { label: 'Strong', bar: 1, color: THEME_GREEN };
  }, [newPassword, passedCount]);

  const confirmMatches = confirm.length > 0 && confirm === newPassword;
  const allRulesPass = passedCount === 5;
  const showPasswordRules = isNewFocused && newPassword.length > 0;

  const canSave =
    !!resolvedUserId &&
    currentPassword.length > 0 &&
    allRulesPass &&
    confirmMatches &&
    !saving;

  const goBack = () => navigation.goBack();

  const buildBase = () => androidLoopback((PASSWORD_CHANGE_ENDPOINT || '').replace(/\/+$/, ''));

  const fetchOnce = async (method, url, headers, body, controller) => {
    const res = await fetch(url, { method, headers, body, signal: controller.signal });
    const raw = await res.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch {}
    return { res, raw, data };
  };

  const handleSave = async () => {
    if (!canSave) return;

    const base = buildBase();
    if (!base) {
      Alert.alert('Configuration error', 'PASSWORD_CHANGE_ENDPOINT is missing in your .env.');
      return;
    }
    if (!resolvedUserId) {
      Alert.alert('Missing user', 'No user_id found to call the password endpoint.');
      return;
    }

    // Per your spec: /api/profile/password/:user_id
    const url = `${base}/${encodeURIComponent(String(resolvedUserId))}`;

    setSaving(true);
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 15000);

      const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };
      if (authToken) headers.Authorization = `Bearer ${authToken}`;

      const payload = {
        current_password: currentPassword,
        new_password: newPassword,
      };
      const body = JSON.stringify(payload);

      // Try POST (your spec), then fallback to PUT/PATCH if server rejects method
      const methods = ['POST', 'PUT', 'PATCH'];

      let last = null;
      let ok = false;

      for (const m of methods) {
        const attempt = await fetchOnce(m, url, headers, body, controller);
        last = attempt;
        if (attempt.res.ok) { ok = true; break; }

        const textLower = (attempt.raw || '').toLowerCase();
        if (attempt.res.status === 404 || attempt.res.status === 405 || textLower.includes('cannot')) {
          continue; // method not allowed/route mismatch → try next method
        }

        // Meaningful client errors (wrong current password, validation)
        if (attempt.res.status === 400 || attempt.res.status === 401) { break; }
      }

      clearTimeout(tid);

      if (!ok && last) {
        const backendMsg =
          last.data?.message ??
          last.data?.error ??
          last.data?.errors ??
          last.raw ??
          `${last.res.status} ${last.res.statusText || ''}`;

        const title = (last.res.status === 400 || last.res.status === 401)
          ? 'Incorrect Current Password'
          : 'Unable to Update';

        Alert.alert(title, String(backendMsg).trim());
        return;
      }

      const okMsg =
        last?.data?.message ??
        last?.data?.status ??
        (/success/i.test(String(last?.raw)) ? 'Password updated successfully.' : 'Password updated successfully.');

      Alert.alert('Password Changed', String(okMsg).trim(), [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);

      // Clear local fields (optional)
      setCurrentPassword('');
      setNewPassword('');
      setConfirm('');
    } catch (err) {
      const friendly =
        err?.name === 'AbortError'
          ? 'Request timed out. Please try again.'
          : (err?.message || 'Internal server error.');
      Alert.alert('Unable to Update', friendly);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 8) + 10 }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Password Management</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.select({ ios: 'padding', android: 'height' })}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingTop: 16,
            paddingHorizontal: 16,
            paddingBottom: insets.bottom + (kbHeight || 64),
            flexGrow: 1,
          }}
        >
          {/* Current password */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Current Password</Text>
            <Text style={styles.label}>Enter current password</Text>
            <View
              style={[
                styles.inputRow,
                { borderColor: isCurrentFocused ? THEME_GREEN : '#e5e7eb' },
              ]}
            >
              <TextInput
                key={showCurrent ? 'cur-visible' : 'cur-hidden'}
                style={styles.input}
                secureTextEntry={!showCurrent}
                value={currentPassword}
                onChangeText={setCurrentPassword}
                placeholder="••••••••"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="password"
                onFocus={() => setIsCurrentFocused(true)}
                onBlur={() => setIsCurrentFocused(false)}
              />
              <TouchableOpacity onPress={() => setShowCurrent(!showCurrent)} style={styles.eyeBtn}>
                <Ionicons
                  name={showCurrent ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color="#64748b"
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* New & confirm */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>New Password</Text>
            <Text style={styles.label}>Enter new password</Text>
            <View
              style={[
                styles.inputRow,
                { borderColor: isNewFocused ? THEME_GREEN : '#e5e7eb' },
              ]}
            >
              <TextInput
                key={showNew ? 'new-visible' : 'new-hidden'}
                style={styles.input}
                secureTextEntry={!showNew}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="At least 8 characters"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType={Platform.OS === 'ios' ? 'newPassword' : 'password'}
                onFocus={() => setIsNewFocused(true)}
                onBlur={() => setIsNewFocused(false)}
              />
              <TouchableOpacity onPress={() => setShowNew(!showNew)} style={styles.eyeBtn}>
                <Ionicons
                  name={showNew ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color="#64748b"
                />
              </TouchableOpacity>
            </View>

            {showPasswordRules && (
              <>
                <View style={styles.meterWrap}>
                  <View style={styles.meterTrack}>
                    <View
                      style={[
                        styles.meterFill,
                        {
                          width: `${Math.round(strengthInfo.bar * 100)}%`,
                          backgroundColor: strengthInfo.color,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.meterLabel, { color: strengthInfo.color }]}>
                    {strengthInfo.label}
                  </Text>
                </View>

                <View style={styles.rulesWrap}>
                  <Rule ok={rules.length} label="8 characters" />
                  <Rule ok={rules.upperLower} label="1 upper case & 1 lower case" />
                  <Rule ok={rules.number} label="1 number" />
                  <Rule ok={rules.noSpace} label="No space" />
                  <Rule ok={rules.noRepeat} label="No more than 3 repeated characters" />
                </View>
              </>
            )}

            <Text style={[styles.label, { marginTop: 10 }]}>Confirm new password</Text>
            <View
              style={[
                styles.inputRow,
                { borderColor: isConfirmFocused ? THEME_GREEN : '#e5e7eb' },
              ]}
            >
              <TextInput
                key={showConfirm ? 'conf-visible' : 'conf-hidden'}
                style={styles.input}
                secureTextEntry={!showConfirm}
                value={confirm}
                onChangeText={setConfirm}
                placeholder="Re-enter new password"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="password"
                onFocus={() => setIsConfirmFocused(true)}
                onBlur={() => setIsConfirmFocused(false)}
              />
              <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)} style={styles.eyeBtn}>
                <Ionicons
                  name={showConfirm ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color="#64748b"
                />
              </TouchableOpacity>
            </View>
            {!!confirm && confirm !== newPassword && (
              <Text style={styles.mismatch}>Passwords don’t match</Text>
            )}

            <TouchableOpacity
              style={[styles.saveButton, !canSave && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={!canSave}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons
                    name="lock-closed-outline"
                    size={18}
                    color="#fff"
                    style={{ marginRight: 8 }}
                  />
                  <Text style={styles.saveButtonText}>Save Changes</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Rule({ ok, label }) {
  return (
    <View style={styles.ruleItem}>
      <Ionicons
        name={ok ? 'checkmark-circle' : 'ellipse-outline'}
        size={16}
        color={ok ? THEME_GREEN : '#94a3b8'}
        style={{ marginRight: 8 }}
      />
      <Text style={[styles.ruleText, ok && { color: '#0f172a' }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f6f8fa' },
  header: {
    minHeight: 52,
    paddingHorizontal: 12,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  backBtn: { height: 40, width: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: '#0f172a' },

  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },

  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 10 },
  label: { fontSize: 12, color: '#64748b', marginBottom: 6 },

  inputRow: {
    borderWidth: 1,
    borderRadius: 12,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  input: { flex: 1, paddingVertical: 12, fontSize: width > 400 ? 16 : 15, color: '#0f172a' },
  eyeBtn: { height: 36, width: 36, alignItems: 'center', justifyContent: 'center' },

  meterWrap: { marginTop: 10, flexDirection: 'row', alignItems: 'center' },
  meterTrack: { flex: 1, height: 8, backgroundColor: '#f1f5f9', borderRadius: 999, marginRight: 10, overflow: 'hidden' },
  meterFill: { height: 8, borderRadius: 999 },
  meterLabel: { fontSize: 12, fontWeight: '700' },

  rulesWrap: { marginTop: 10 },
  ruleItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  ruleText: { fontSize: 13, color: '#64748b' },

  mismatch: { marginTop: 6, fontSize: 12, color: '#ef4444' },

  saveButton: {
    marginTop: 12,
    backgroundColor: THEME_GREEN,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  saveButtonText: { color: '#fff', fontSize: width > 400 ? 16 : 15, fontWeight: '700' },
});
