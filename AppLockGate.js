// AppLockGate.js
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, Alert } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { isBiometricEnabled, getSessionToken, biometricPrompt } from './utils/biometrics';

export default function AppLockGate({ children }) {
  const [ready, setReady] = useState(false);
  const isFocused = useIsFocused();

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [enabled, token] = await Promise.all([isBiometricEnabled(), getSessionToken()]);
      if (!enabled || !token) {
        if (mounted) setReady(true);
        return;
      }
      const res = await biometricPrompt({ reason: 'Unlock app' });
      if (mounted) {
        if (res.success) setReady(true);
        else {
          Alert.alert('Locked', 'Authentication required to continue.');
          // keep not-ready → screen stays blocked
        }
      }
    })();
    return () => { mounted = false; };
  }, [isFocused]);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }
  return children;
}
