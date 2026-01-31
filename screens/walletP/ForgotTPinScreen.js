// screens/wallet/VerifyTPinOtpScreen.js

import React, { useMemo, useRef, useState, useEffect } from 'react';
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  WALLET_TPIN_VERIFY_ENDPOINT, // (email verify) keep if you already have it
  FORGOT_TPIN_SMS_ENDPOINT, // send sms otp
  VERIFY_TPIN_SMS_ENDPOINT, // verify sms otp
} from '@env';

const { width } = Dimensions.get('window');
const isIOS = Platform.OS === 'ios';

// Shared wallet palette
const G = {
  grab: '#00B14F',
  grab2: '#00C853',
  text: '#0F172A',
  sub: '#6B7280',
  bg: '#F6F7F9',
  line: '#E5E7EB',
  white: '#ffffff',
  slate: '#0F172A',
};

const CHANNEL_STORAGE_KEY = 'wallet:forgot_tpin:otp_channel_v1';

const safeStr = (v) => (v == null ? '' : String(v));

const replaceWalletId = (tpl, walletId) =>
  safeStr(tpl).includes('{wallet_id}')
    ? safeStr(tpl).replace('{wallet_id}', String(walletId))
    : safeStr(tpl);

export default function VerifyTPinOtpScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const headerTopPad = Math.max(insets.top, 8) + 18;
  const primary = G.grab;

  const walletId = route?.params?.walletId ?? '';

  const [otp, setOtp] = useState('');
  const [newTPin, setNewTPin] = useState('');
  const [confirmTPin, setConfirmTPin] = useState('');
  const [loading, setLoading] = useState(false);

  // remember last selected channel
  const [channel, setChannel] = useState('email'); // 'email' | 'sms'
  const [sendingOtp, setSendingOtp] = useState(false);
  const [channelHydrated, setChannelHydrated] = useState(false);

  const scrollRef = useRef(null);

  const scrollToEnd = () => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  };

  // load last chosen channel once
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const saved = await AsyncStorage.getItem(CHANNEL_STORAGE_KEY);
        const v = safeStr(saved).toLowerCase().trim();
        if (mounted && (v === 'sms' || v === 'email')) setChannel(v);
      } catch {
        // ignore
      } finally {
        if (mounted) setChannelHydrated(true);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // persist channel whenever it changes (after hydration)
  useEffect(() => {
    if (!channelHydrated) return;
    (async () => {
      try {
        await AsyncStorage.setItem(CHANNEL_STORAGE_KEY, channel);
      } catch {
        // ignore
      }
    })();
  }, [channel, channelHydrated]);

  const otpHint = useMemo(() => {
    return channel === 'sms'
      ? 'We have sent a one-time password (OTP) to your registered phone number.'
      : 'We have sent a one-time password (OTP) to your registered email.';
  }, [channel]);

  const otpKeyboard = 'number-pad';

  const validateInputs = () => {
    if (!walletId) {
      Alert.alert('Wallet Not Found', 'Unable to proceed. Wallet ID missing.');
      return false;
    }

    if (otp.trim().length < 4) {
      Alert.alert(
        'Invalid OTP',
        `Please enter the OTP sent to your ${channel === 'sms' ? 'phone' : 'email'}.`
      );
      return false;
    }

    if (newTPin.trim().length !== 4 || /\D/.test(newTPin)) {
      Alert.alert('Invalid TPIN', 'TPIN must be exactly 4 digits.');
      return false;
    }

    if (newTPin !== confirmTPin) {
      Alert.alert('TPIN Mismatch', 'New TPIN and Confirm TPIN do not match.');
      return false;
    }

    return true;
  };

  // NEW: send OTP based on channel
  const handleSendOtp = async () => {
    if (!walletId) {
      Alert.alert('Wallet Not Found', 'Unable to send OTP. Wallet ID missing.');
      return;
    }

    try {
      setSendingOtp(true);

      if (channel === 'sms') {
        const url = replaceWalletId(FORGOT_TPIN_SMS_ENDPOINT, walletId);

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });

        const isJson = (res.headers.get('content-type') || '').includes('application/json');
        const data = isJson ? await res.json() : await res.text();

        if (!res.ok) {
          throw new Error((isJson && (data?.message || data?.error)) || 'Failed to send OTP via SMS.');
        }

        Alert.alert('OTP Sent', 'OTP has been sent via SMS.');
      } else {
        // If you have an EMAIL send endpoint, wire it here.
        Alert.alert(
          'Email OTP',
          'Email OTP sending endpoint is not wired here. If your backend sends email OTP on the previous step, you can continue.'
        );
      }
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setSendingOtp(false);
    }
  };

  // UPDATED: verify OTP using channel-specific endpoint
  const handleVerifyOtp = async () => {
    if (!validateInputs()) return;

    try {
      setLoading(true);

      const url =
        channel === 'sms'
          ? replaceWalletId(VERIFY_TPIN_SMS_ENDPOINT, walletId)
          : replaceWalletId(WALLET_TPIN_VERIFY_ENDPOINT, walletId);

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          otp: otp.trim(),
          new_t_pin: newTPin.trim(),
        }),
      });

      const isJson = (res.headers.get('content-type') || '').includes('application/json');
      const data = isJson ? await res.json() : await res.text();

      if (!res.ok) {
        throw new Error((isJson && (data?.message || data?.error)) || 'Failed to verify OTP.');
      }

      Alert.alert('Success', 'OTP verified and TPIN reset successfully.', [
        { text: 'OK', onPress: () => navigation.navigate('TPinScreen', { walletId }) },
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
          <Ionicons name="arrow-back" size={22} color={G.slate} />
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
              <Ionicons
                name={channel === 'sms' ? 'chatbox-ellipses-outline' : 'mail-open-outline'}
                size={26}
                color="#0ea5e9"
              />
            </View>

            <Text style={styles.title}>Enter the OTP</Text>
            <Text style={styles.sub}>{otpHint}</Text>

            <View style={styles.channelRow}>
              <TouchableOpacity
                onPress={() => setChannel('email')}
                activeOpacity={0.9}
                style={[styles.channelPill, channel === 'email' ? styles.channelPillActive : null]}
                disabled={loading || sendingOtp}
              >
                <Ionicons name="mail-outline" size={16} color={channel === 'email' ? G.white : G.slate} />
                <Text style={[styles.channelText, channel === 'email' ? styles.channelTextActive : null]}>
                  Email
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setChannel('sms')}
                activeOpacity={0.9}
                style={[styles.channelPill, channel === 'sms' ? styles.channelPillActive : null]}
                disabled={loading || sendingOtp}
              >
                <Ionicons
                  name="chatbubble-outline"
                  size={16}
                  color={channel === 'sms' ? G.white : G.slate}
                />
                <Text style={[styles.channelText, channel === 'sms' ? styles.channelTextActive : null]}>
                  SMS
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSendOtp}
                activeOpacity={0.9}
                style={[styles.sendOtpBtn, { opacity: loading ? 0.7 : 1 }]}
                disabled={loading || sendingOtp}
              >
                {sendingOtp ? (
                  <ActivityIndicator size="small" color={G.white} />
                ) : (
                  <>
                    <Ionicons name="send-outline" size={16} color={G.white} />
                    <Text style={styles.sendOtpText}>Send OTP</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.inputBox}>
            <Text style={styles.inputLabel}>OTP</Text>
            <TextInput
              style={styles.otpInput}
              value={otp}
              onChangeText={setOtp}
              placeholder="Enter OTP"
              placeholderTextColor="#94a3b8"
              keyboardType={otpKeyboard}
              maxLength={6}
              onFocus={scrollToEnd}
            />
          </View>

          <View style={[styles.inputBox, { marginTop: 14 }]}>
            <Text style={styles.inputLabel}>New TPIN</Text>
            <TextInput
              style={styles.otpInput}
              value={newTPin}
              onChangeText={setNewTPin}
              placeholder="Enter new 4-digit TPIN"
              placeholderTextColor="#94a3b8"
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
              onFocus={scrollToEnd}
            />
          </View>

          <View style={[styles.inputBox, { marginTop: 14 }]}>
            <Text style={styles.inputLabel}>Confirm TPIN</Text>
            <TextInput
              style={styles.otpInput}
              value={confirmTPin}
              onChangeText={setConfirmTPin}
              placeholder="Re-enter TPIN"
              placeholderTextColor="#94a3b8"
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
              onFocus={scrollToEnd}
            />
          </View>

          <TouchableOpacity
            onPress={handleVerifyOtp}
            style={[
              styles.primaryBtnFilled,
              { backgroundColor: loading ? G.grab2 : primary, opacity: loading ? 0.9 : 1 },
            ]}
            activeOpacity={0.9}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={G.white} />
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
  safe: { flex: 1, backgroundColor: G.bg },

  headerBar: {
    minHeight: 52,
    paddingHorizontal: 12,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: G.line,
    backgroundColor: G.white,
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
    color: G.slate,
  },

  infoCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: G.line,
    backgroundColor: G.white,
    marginBottom: 18,
  },

  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#E5F0FF',
    borderColor: '#dbeafe',
    borderWidth: 1,
    marginBottom: 8,
  },

  title: {
    fontSize: width > 400 ? 18 : 16,
    fontWeight: '800',
    color: G.slate,
  },
  sub: { marginTop: 6, color: G.sub, lineHeight: 20 },

  channelRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  channelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: G.line,
    backgroundColor: '#f9fafb',
  },

  channelPillActive: {
    backgroundColor: G.grab,
    borderColor: G.grab,
  },

  channelText: {
    fontSize: 13,
    fontWeight: '800',
    color: G.slate,
  },

  channelTextActive: {
    color: G.white,
  },

  sendOtpBtn: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#0ea5e9',
  },

  sendOtpText: {
    color: G.white,
    fontSize: 13,
    fontWeight: '800',
  },

  inputBox: {
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: G.line,
    backgroundColor: '#f9fafb',
  },

  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: G.slate,
  },

  otpInput: {
    marginTop: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: G.white,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: G.slate,
  },

  primaryBtnFilled: {
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
  },

  primaryBtnTextFilled: {
    color: G.white,
    fontSize: width > 400 ? 16 : 15,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
});
