import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const KEY_BIOMETRIC_ENABLED = 'biometric_enabled';
const KEY_SESSION = 'session_token';

export async function deviceSupportsBiometrics() {
  const compatible = await LocalAuthentication.hasHardwareAsync();
  if (!compatible) return { ok: false, reason: 'No biometric hardware' };

  const enrolled = await LocalAuthentication.isEnrolledAsync();
  if (!enrolled) return { ok: false, reason: 'No biometrics enrolled' };

  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  return { ok: types.length > 0, types };
}

export async function isBiometricEnabled() {
  const v = await SecureStore.getItemAsync(KEY_BIOMETRIC_ENABLED);
  return v === '1';
}

export async function setBiometricEnabled(enabled) {
  await SecureStore.setItemAsync(KEY_BIOMETRIC_ENABLED, enabled ? '1' : '0');
}

export async function saveSessionToken(token) {
  await SecureStore.setItemAsync(KEY_SESSION, token, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
}

export async function clearSessionToken() {
  await SecureStore.deleteItemAsync(KEY_SESSION);
}

export async function getSessionToken() {
  return SecureStore.getItemAsync(KEY_SESSION);
}

// Prompt the user. Use for “unlock app”, “confirm payment”, etc.
export async function biometricPrompt({ reason = 'Authenticate' } = {}) {
  const { ok } = await deviceSupportsBiometrics();
  if (!ok) return { success: false, error: 'UNAVAILABLE' };

  const res = await LocalAuthentication.authenticateAsync({
    promptMessage: reason,
    fallbackEnabled: true,       // show device PIN/password if biometrics fail
    cancelLabel: 'Cancel',
    disableDeviceFallback: false // allow system PIN as fallback
  });
  return { success: !!res.success, error: res.error };
}
