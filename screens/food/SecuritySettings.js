// screens/settings/SecuritySettings.js
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Dimensions,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';

const { width } = Dimensions.get('window');
const THEME_GREEN = '#16a34a';

const KEY_BIOMETRIC_LOGIN = 'security_biometric_login';
const KEY_TWO_FACTOR_AUTH = 'security_two_factor_auth';

export default function SecuritySettings() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const [biometricLogin, setBiometricLogin] = useState(false);
  const [twoFactorAuth, setTwoFactorAuth] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [biometricSupported, setBiometricSupported] = useState(null); // null = unknown, true/false when resolved
  const [biometricTypes, setBiometricTypes] = useState([]);

  const goBack = () => navigation.goBack();

  // Load persisted settings & check device biometric capability
  useEffect(() => {
    (async () => {
      try {
        const savedBio = await SecureStore.getItemAsync(KEY_BIOMETRIC_LOGIN);
        const saved2fa = await SecureStore.getItemAsync(KEY_TWO_FACTOR_AUTH);
        if (savedBio != null) setBiometricLogin(savedBio === '1');
        if (saved2fa != null) setTwoFactorAuth(saved2fa === '1');

        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();

        setBiometricSupported(Boolean(hasHardware && isEnrolled));
        setBiometricTypes(types || []);
      } catch (e) {
        // Non-fatal: show a friendly toast/alert if you like
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await SecureStore.setItemAsync(KEY_BIOMETRIC_LOGIN, biometricLogin ? '1' : '0');
      await SecureStore.setItemAsync(KEY_TWO_FACTOR_AUTH, twoFactorAuth ? '1' : '0');

      Alert.alert('Saved', 'Your security settings have been updated.');
      navigation.goBack();
    } catch (e) {
      Alert.alert('Save Failed', 'Could not save your settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const biometricLabel = useMemo(() => {
    if (biometricTypes?.length) {
      // Map expo enum to friendly
      // 1: FINGERPRINT, 2: FACIAL_RECOGNITION, 3: IRIS
      const map = { 1: 'Fingerprint', 2: 'Face ID', 3: 'Iris' };
      const names = biometricTypes.map((t) => map[t] || 'Biometric');
      return [...new Set(names)].join(' / ');
    }
    return 'Biometric';
  }, [biometricTypes]);

  const canToggleBiometric = biometricSupported === true;
  const changed = useMemo(() => !loading, [loading]); // enable save once loaded
  const saveDisabled = !changed || saving;

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      {/* Header (same layout style as PasswordManagement) */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 8) + 10 }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Security & Privacy</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.container}>
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="small" color={THEME_GREEN} />
            <Text style={styles.loadingText}>Loading security options…</Text>
          </View>
        ) : (
          <>
            {/* Biometric Login */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>{biometricLabel} Login</Text>
              <Text style={styles.muted}>
                Use your device’s {biometricLabel.toLowerCase()} to quickly and securely log in.
              </Text>

              {!canToggleBiometric && (
                <View style={styles.infoBox}>
                  <Ionicons name="information-circle-outline" size={16} color="#64748b" />
                  <Text style={styles.infoText}>
                    {Platform.OS === 'android'
                      ? 'Biometric login is unavailable. Ensure your device has biometrics and at least one is enrolled.'
                      : 'Biometric login is unavailable. Make sure Face ID/Touch ID is set up in device settings.'}
                  </Text>
                </View>
              )}

              <View style={styles.row}>
                <Text style={styles.rowLabel}>Enable {biometricLabel} Login</Text>
                <Switch
                  value={biometricLogin && canToggleBiometric}
                  onValueChange={(v) => setBiometricLogin(v)}
                  disabled={!canToggleBiometric}
                />
              </View>
            </View>

            {/* Two-Factor Authentication */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Two-Factor Authentication (2FA)</Text>
              <Text style={styles.muted}>
                Add an extra layer of protection to your account. When 2FA is on, you’ll confirm your
                identity using a second step after your password.
              </Text>

              <View style={styles.row}>
                <Text style={styles.rowLabel}>Enable 2FA</Text>
                <Switch value={twoFactorAuth} onValueChange={setTwoFactorAuth} />
              </View>

              <View style={styles.helperRow}>
                <Ionicons name="shield-checkmark-outline" size={16} color="#64748b" />
                <Text style={styles.helperText}>
                  Recommended for admins and business owners. You can add SMS/Email codes later in
                  “Manage 2FA Methods”.
                </Text>
              </View>

              {/* Optional manage button (placeholder for future screen) */}
              <TouchableOpacity
                activeOpacity={0.85}
                style={[styles.secondaryBtn, !twoFactorAuth && { opacity: 0.6 }]}
                disabled={!twoFactorAuth}
                onPress={() => Alert.alert('Coming soon', 'Manage 2FA methods screen')}
              >
                <Ionicons name="key-outline" size={16} color="#0f172a" style={{ marginRight: 8 }} />
                <Text style={styles.secondaryBtnText}>Manage 2FA Methods</Text>
              </TouchableOpacity>
            </View>

            {/* Save */}
            <TouchableOpacity
              style={[styles.saveButton, saveDisabled && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saveDisabled}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="lock-closed-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.saveButtonText}>Save</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f6f8fa' },

  /* Header (aligned with PasswordManagement) */
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
  backBtn: {
    height: 40,
    width: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
  },

  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },

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

  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 8 },
  muted: { fontSize: 13, color: '#64748b', marginBottom: 10, lineHeight: 18 },

  row: {
    marginTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  rowLabel: { fontSize: width > 400 ? 15 : 14, color: '#0f172a' },

  helperRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  helperText: { flex: 1, fontSize: 12, color: '#64748b', lineHeight: 16 },

  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 8,
  },
  infoText: { flex: 1, fontSize: 12, color: '#475569' },

  secondaryBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  secondaryBtnText: { color: '#0f172a', fontSize: 14, fontWeight: '600' },

  saveButton: {
    marginTop: 8,
    marginBottom: 16,
    backgroundColor: THEME_GREEN,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  saveButtonText: { color: '#fff', fontSize: width > 400 ? 16 : 15, fontWeight: '700' },

  loadingWrap: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingVertical: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: { marginTop: 8, fontSize: 13, color: '#64748b' },
});
