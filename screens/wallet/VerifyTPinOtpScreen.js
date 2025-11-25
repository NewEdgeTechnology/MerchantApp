// screens/wallet/VerifyTPinOtpScreen.js

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { WALLET_TPIN_VERIFY_ENDPOINT } from '@env';

const { width } = Dimensions.get('window');
const isIOS = Platform.OS === 'ios';

export default function VerifyTPinOtpScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const headerTopPad = Math.max(insets.top, 8) + 18;
  const primary = '#f97316';

  const walletId = route?.params?.walletId ?? '';
  const [otp, setOtp] = useState('');
  const [newTPin, setNewTPin] = useState('');
  const [confirmTPin, setConfirmTPin] = useState('');
  const [loading, setLoading] = useState(false);

  const scrollRef = useRef(null);

  const scrollToEnd = () => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  };

  const handleVerifyOtp = async () => {
    if (!walletId) {
      Alert.alert('Wallet Not Found', 'Unable to verify OTP. Wallet ID missing.');
      return;
    }

    if (otp.trim().length < 4) {
      Alert.alert('Invalid OTP', 'Please enter the OTP sent to your email.');
      return;
    }

    if (newTPin.trim().length !== 4 || /\D/.test(newTPin)) {
      Alert.alert('Invalid TPIN', 'TPIN must be exactly 4 digits.');
      return;
    }

    if (newTPin !== confirmTPin) {
      Alert.alert('TPIN Mismatch', 'New TPIN and Confirm TPIN do not match.');
      return;
    }

    try {
      setLoading(true);
      const url = WALLET_TPIN_VERIFY_ENDPOINT.replace('{wallet_id}', walletId);

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          otp: otp.trim(),
          new_t_pin: newTPin.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Failed to verify OTP.');

      Alert.alert('Success', 'OTP verified and TPIN reset successfully.', [
        {
          text: 'OK',
          onPress: () => navigation.navigate('TPinScreen', { walletId }),
        },
      ]);
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const Container = isIOS ? KeyboardAvoidingView : View;

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <View style={[styles.headerBar, { paddingTop: headerTopPad }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Verify OTP</Text>
        <View style={{ width: 40 }} />
      </View>

      <Container
        style={{ flex: 1 }}
        behavior={isIOS ? 'padding' : undefined}
        keyboardVerticalOffset={isIOS ? headerTopPad : 0}
      >
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: 18,
            paddingBottom: 16 + insets.bottom,
            flexGrow: 1,
          }}
        >
          <View style={styles.infoCard}>
            <View style={styles.iconWrap}>
              <Ionicons name="mail-open-outline" size={26} color="#0ea5e9" />
            </View>
            <Text style={styles.title}>Enter the OTP</Text>
            <Text style={styles.sub}>
              We have sent a one-time password (OTP) to your registered email.
            </Text>
          </View>

          {/* OTP */}
          <View style={styles.inputBox}>
            <Text style={styles.inputLabel}>OTP</Text>
            <TextInput
              style={styles.otpInput}
              value={otp}
              onChangeText={setOtp}
              placeholder="Enter OTP"
              keyboardType="number-pad"
              maxLength={6}
              onFocus={scrollToEnd}
            />
          </View>

          {/* NEW PIN */}
          <View style={[styles.inputBox, { marginTop: 14 }]}>
            <Text style={styles.inputLabel}>New TPIN</Text>
            <TextInput
              style={styles.otpInput}
              value={newTPin}
              onChangeText={setNewTPin}
              placeholder="Enter new 4-digit TPIN"
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
              onFocus={scrollToEnd}
            />
          </View>

          {/* CONFIRM PIN */}
          <View style={[styles.inputBox, { marginTop: 14 }]}>
            <Text style={styles.inputLabel}>Confirm TPIN</Text>
            <TextInput
              style={styles.otpInput}
              value={confirmTPin}
              onChangeText={setConfirmTPin}
              placeholder="Re-enter TPIN"
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
              onFocus={scrollToEnd}
            />
          </View>

          {/* SUBMIT */}
          <TouchableOpacity
            onPress={handleVerifyOtp}
            style={[styles.primaryBtnFilled, { backgroundColor: primary }]}
            activeOpacity={0.9}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnTextFilled}>VERIFY & RESET TPIN</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </Container>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },

  headerBar: {
    minHeight: 52,
    paddingHorizontal: 12,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: '#e5e7eb',
  },

  backBtn: {
    height: 40,
    width: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },

  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
  },

  infoCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    marginBottom: 18,
  },

  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderColor: '#dbeafe',
    borderWidth: 1,
    marginBottom: 8,
  },

  title: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  sub: { marginTop: 6, color: '#64748b', lineHeight: 20 },

  inputBox: {
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },

  inputLabel: { fontSize: 13, fontWeight: '600', color: '#0f172a' },

  otpInput: {
    marginTop: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },

  primaryBtnFilled: {
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
  },

  primaryBtnTextFilled: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
});
