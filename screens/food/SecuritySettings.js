// screens/settings/SecuritySettings.js
import React, { useEffect, useMemo, useState, useCallback } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';

const { width } = Dimensions.get('window');
const THEME_GREEN = '#16a34a';

// Primary keys
const KEY_BIOMETRIC_LOGIN = 'security_biometric_login';
// Legacy (read/write for backward-compat)
const KEY_BIOMETRIC_LOGIN_LEGACY = 'biometric_enabled_v1';

export default function SecuritySettings() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const [biometricLogin, setBiometricLogin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [biometricSupported, setBiometricSupported] = useState(null); // null = unknown
  const [biometricTypes, setBiometricTypes] = useState([]);

  const goBack = () => navigation.goBack();

  // ---- Helpers ----
  const readStore = useCallback(async (key, def = '0') => {
    try {
      const v = await SecureStore.getItemAsync(key);
      return v ?? def;
    } catch {
      return def;
    }
  }, []);

  const writeStore = useCallback(async (key, val) => {
    await SecureStore.setItemAsync(key, val);
  }, []);

  const checkBiometricCapability = useCallback(async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
      setBiometricSupported(Boolean(hasHardware && isEnrolled));
      setBiometricTypes(types || []);
    } catch {
      setBiometricSupported(false);
      setBiometricTypes([]);
    }
  }, []);

  // Load persisted settings & capability
  useEffect(() => {
    (async () => {
      try {
        const [bioPrimary, bioLegacy] = await Promise.all([
          readStore(KEY_BIOMETRIC_LOGIN),
          readStore(KEY_BIOMETRIC_LOGIN_LEGACY),
        ]);
        const bioFlag = (bioPrimary ?? '0') !== '0' ? bioPrimary : bioLegacy;
        setBiometricLogin(bioFlag === '1');
        await checkBiometricCapability();
      } finally {
        setLoading(false);
      }
    })();
  }, [readStore, checkBiometricCapability]);

  // Friendlier label
  const biometricLabel = useMemo(() => {
    if (biometricTypes?.length) {
      const map = { 1: 'Fingerprint', 2: 'Face ID', 3: 'Iris' };
      const names = biometricTypes.map((t) => map[t] || 'Biometric');
      return [...new Set(names)].join(' / ');
    }
    return 'Biometric';
  }, [biometricTypes]);

  const canToggleBiometric = biometricSupported === true;
  const saveDisabled = saving || loading;

  // Authenticate now when turning ON
  const onToggleBiometric = async (val) => {
    if (!canToggleBiometric) return;
    if (val === false) {
      setBiometricLogin(false);
      return;
    }

    try {
      const res = await LocalAuthentication.authenticateAsync({
        promptMessage: `Enable ${biometricLabel} Login`,
        cancelLabel: 'Cancel',
        fallbackEnabled: true,
        disableDeviceFallback: false,
      });

      if (res.success) {
        setBiometricLogin(true);
        Alert.alert('Enabled', `${biometricLabel} login is now on.`);
      } else {
        setBiometricLogin(false);
        Alert.alert('Not enabled', 'Authentication was cancelled or failed.');
      }
    } catch {
      setBiometricLogin(false);
      Alert.alert('Error', 'Could not complete biometric authentication.');
    }
  };

  const testBiometricNow = async () => {
    if (!canToggleBiometric) {
      Alert.alert('Unavailable', 'No enrolled biometrics on this device.');
      return;
    }
    try {
      const res = await LocalAuthentication.authenticateAsync({
        promptMessage: `Authenticate with ${biometricLabel}`,
        cancelLabel: 'Cancel',
        fallbackEnabled: true,
        disableDeviceFallback: false,
      });
      if (res.success) Alert.alert('Success', 'Authentication passed.');
      else Alert.alert('Failed', 'Authentication failed or was cancelled.');
    } catch {
      Alert.alert('Error', 'Could not start biometric prompt.');
    }
  };

  const handleSave = async () => {
    if (biometricLogin && !canToggleBiometric) {
      Alert.alert(
        'Unavailable',
        `Your device doesn’t have ${biometricLabel.toLowerCase()} set up. Please enroll it in Settings first.`
      );
      return;
    }

    setSaving(true);
    try {
      const bioVal = biometricLogin ? '1' : '0';
      await writeStore(KEY_BIOMETRIC_LOGIN, bioVal);
      await writeStore(KEY_BIOMETRIC_LOGIN_LEGACY, bioVal);

      Alert.alert('Saved', 'Your security settings have been updated.');
      navigation.goBack();
    } catch {
      Alert.alert('Save Failed', 'Could not save your settings. Please try again.');
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

              {biometricSupported === false && (
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
                  onValueChange={onToggleBiometric}
                  disabled={!canToggleBiometric}
                />
              </View>

              <TouchableOpacity
                activeOpacity={0.85}
                style={[styles.secondaryBtn, !canToggleBiometric && { opacity: 0.5 }]}
                disabled={!canToggleBiometric}
                onPress={testBiometricNow}
              >
                <Ionicons name="finger-print-outline" size={16} color="#0f172a" style={{ marginRight: 8 }} />
                <Text style={styles.secondaryBtnText}>Test {biometricLabel} Now</Text>
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
