// screens/wallet/VerifyTPinOtpScreen.js

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { WALLET_TPIN_VERIFY_ENDPOINT } from '@env';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';

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

  const handleVerifyOtp = async () => {
    if (!walletId) {
      Alert.alert('Wallet Not Found', 'Unable to verify OTP. Wallet ID missing.');
      return;
    }

    const trimmedOtp = String(otp).trim();
    const trimmedNew = String(newTPin).trim();
    const trimmedConfirm = String(confirmTPin).trim();

    if (trimmedOtp.length < 4) {
      Alert.alert('Invalid OTP', 'Please enter the OTP sent to your email.');
      return;
    }

    if (trimmedNew.length !== 4 || /\D/.test(trimmedNew)) {
      Alert.alert('Invalid TPIN', 'New TPIN must be exactly 4 digits.');
      return;
    }

    if (trimmedNew !== trimmedConfirm) {
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
          otp: trimmedOtp,
          new_t_pin: trimmedNew,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.message || 'Failed to verify OTP.');
      }

      Alert.alert('Success', 'OTP verified and TPIN reset successfully.', [
        {
          text: 'OK',
          onPress: () => {
            navigation.navigate('TPinScreen', { walletId });
          },
        },
      ]);
    } catch (err) {
      Alert.alert('Error', err.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      {/* Header */}
      <View style={[styles.headerBar, { paddingTop: headerTopPad }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={22} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Verify OTP</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAwareScrollView
        enableOnAndroid
        extraScrollHeight={24} // small nudge so button clears the keyboard
        keyboardOpeningTime={0}
        contentContainerStyle={{
          padding: 18,
          paddingBottom: 12 + insets.bottom,
          flexGrow: 1,
        }}
      >
        <View style={styles.infoCard}>
          <View style={styles.iconWrap}>
            <Ionicons name="mail-open-outline" size={26} color="#0ea5e9" />
          </View>
          <Text style={styles.title}>Enter the OTP</Text>
          <Text style={styles.sub}>
            We have sent a one-time password (OTP) to your registered email
            address. Enter the OTP and set a new Wallet TPIN to continue.
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
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
          />
          <Text style={styles.helperText}>OTP is usually 4–6 digits.</Text>
        </View>

        {/* New TPIN */}
        <View style={[styles.inputBox, { marginTop: 14 }]}>
          <Text style={styles.inputLabel}>New TPIN</Text>
          <TextInput
            style={styles.otpInput}
            value={newTPin}
            onChangeText={setNewTPin}
            placeholder="Enter new 4-digit TPIN"
            secureTextEntry
            keyboardType="number-pad"
            maxLength={4}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
          />
          <Text style={styles.helperText}>TPIN must be exactly 4 digits.</Text>
        </View>

        {/* Confirm TPIN */}
        <View style={[styles.inputBox, { marginTop: 14 }]}>
          <Text style={styles.inputLabel}>Confirm TPIN</Text>
          <TextInput
            style={styles.otpInput}
            value={confirmTPin}
            onChangeText={setConfirmTPin}
            placeholder="Re-enter new TPIN"
            secureTextEntry
            keyboardType="number-pad"
            maxLength={4}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
          />
        </View>

        {/* Button */}
        <TouchableOpacity
          onPress={handleVerifyOtp}
          activeOpacity={0.9}
          style={[styles.primaryBtnFilled, { backgroundColor: primary }]}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons
                name="checkmark-circle-outline"
                size={18}
                color="#fff"
                style={{ marginRight: 8 }}
              />
              <Text style={styles.primaryBtnTextFilled}>VERIFY & RESET TPIN</Text>
            </View>
          )}
        </TouchableOpacity>
      </KeyboardAwareScrollView>
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
    borderBottomColor: '#e5e7eb',
    borderBottomWidth: 1,
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

  infoCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    backgroundColor: '#ffffff',
    marginBottom: 18,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#dbeafe',
    marginBottom: 8,
  },
  title: { fontSize: width > 400 ? 18 : 16, fontWeight: '800', color: '#0f172a' },
  sub: { marginTop: 6, color: '#64748b', lineHeight: 20 },

  inputBox: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 12,
    backgroundColor: '#f9fafb',
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 6,
  },
  otpInput: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d1d5db',
    paddingHorizontal: 12,
    paddingVertical: isIOS ? 10 : 8,
    fontSize: 16,
    color: '#0f172a',
    backgroundColor: '#fff',
  },
  helperText: {
    marginTop: 4,
    fontSize: 12,
    color: '#9ca3af',
  },

  primaryBtnFilled: {
    marginTop: 20,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  primaryBtnTextFilled: {
    fontSize: width > 400 ? 16 : 15,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: '#fff',
  },
});
