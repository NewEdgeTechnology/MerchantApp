// screens/wallet/ChangeTPinScreen.js

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { WALLET_TPIN_CHANGE_ENDPOINT as ENV_TPIN_CHANGE } from '@env';

const { width } = Dimensions.get('window');

// Grab-like palette (same as Wallet / AddMoney / Withdraw / TPin)
const G = {
  grab: '#00B14F',
  grab2: '#00C853',
  text: '#0F172A',
  sub: '#6B7280',
  bg: '#F6F7F9',
  line: '#E5E7EB',
  danger: '#EF4444',
  ok: '#10B981',
  warn: '#F59E0B',
  white: '#ffffff',
  slate: '#0F172A',
};

export default function ChangeTPinScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();

  // 🔑 walletId now drives the API (https://.../wallet/{wallet_id}/t-pin)
  const [walletId, setWalletId] = useState(
    route?.params?.walletId ??
      route?.params?.sender_wallet_id ??
      route?.params?.receiver_wallet_id ??
      ''
  );

  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);

  // eye toggles
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const primary = G.grab;
  const headerTopPad = Math.max(insets.top, 8) + 18;

  // If needed later, we can resolve walletId from storage here
  useEffect(() => {
    if (walletId) return;
    // TODO: optionally resolve from SecureStore if you store last-used wallet there
  }, [walletId]);

  const handleChangeTPin = useCallback(async () => {
    if (!walletId) {
      Alert.alert(
        'Wallet',
        'Missing wallet ID. Please open your wallet again and try changing TPIN.'
      );
      return;
    }

    const oldPin = String(currentPin || '').trim();
    const pin1 = String(newPin || '').trim();
    const pin2 = String(confirmPin || '').trim();

    if (!oldPin || oldPin.length < 4) {
      Alert.alert('Change TPIN', 'Enter your current TPIN.');
      return;
    }
    if (pin1.length < 4) {
      Alert.alert('Change TPIN', 'New TPIN must be at least 4 digits.');
      return;
    }
    if (pin1 !== pin2) {
      Alert.alert('Change TPIN', 'New TPIN and Confirm TPIN do not match.');
      return;
    }

    let urlTemplate = String(ENV_TPIN_CHANGE || '').trim();
    if (!urlTemplate) {
      Alert.alert('Change TPIN', 'WALLET_TPIN_CHANGE_ENDPOINT missing in .env');
      return;
    }

    // Replace {wallet_id} placeholder
    const url = urlTemplate.replace('{wallet_id}', encodeURIComponent(walletId));

    setLoading(true);
    try {
      const body = {
        old_t_pin: oldPin,
        new_t_pin: pin1,
      };

      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const isJson = (res.headers.get('content-type') || '').includes('application/json');
      const data = isJson ? await res.json() : await res.text();

      if (!res.ok) {
        const msg = (isJson && (data?.message || data?.error)) || String(data);
        throw new Error(msg || 'Failed to change TPIN.');
      }

      Alert.alert('Change TPIN', 'Your Wallet TPIN has been changed.', [
        {
          text: 'OK',
          onPress: () => {
            setCurrentPin('');
            setNewPin('');
            setConfirmPin('');
            navigation.goBack();
          },
        },
      ]);
    } catch (e) {
      Alert.alert('Change TPIN', e.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }, [walletId, currentPin, newPin, confirmPin, navigation]);

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      {/* Header */}
      <View style={[styles.headerBar, { paddingTop: headerTopPad }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={22} color={G.slate} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Change Wallet TPIN</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? headerTopPad : 0}
      >
        <ScrollView
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={{
            paddingHorizontal: 18,
            paddingTop: 18,
            paddingBottom: 32 + insets.bottom,
            flexGrow: 1,
          }}
        >
          <View style={styles.infoCard}>
            <View style={styles.iconWrap}>
              <Ionicons name="refresh-outline" size={28} color={G.grab} />
            </View>
            <Text style={styles.title}>Change Wallet TPIN</Text>
            <Text style={styles.sub}>
              Update the TPIN you use to approve wallet transfers and payments.
            </Text>
          </View>

          {/* Current TPIN */}
          <View style={styles.field}>
            <Text style={styles.label}>Current TPIN</Text>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.inputFlex}
                placeholder="Enter current TPIN"
                placeholderTextColor="#94a3b8"
                value={currentPin}
                onChangeText={setCurrentPin}
                keyboardType="number-pad"
                secureTextEntry={!showCurrent}
                maxLength={6}
                returnKeyType="next"
              />
              <TouchableOpacity
                onPress={() => setShowCurrent(!showCurrent)}
                style={styles.eyeBtn}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={showCurrent ? 'eye-off' : 'eye'}
                  size={21}
                  color={G.sub}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* New TPIN */}
          <View style={styles.field}>
            <Text style={styles.label}>New TPIN</Text>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.inputFlex}
                placeholder="Enter new TPIN"
                placeholderTextColor="#94a3b8"
                value={newPin}
                onChangeText={setNewPin}
                keyboardType="number-pad"
                secureTextEntry={!showNew}
                maxLength={6}
                returnKeyType="next"
              />
              <TouchableOpacity
                onPress={() => setShowNew(!showNew)}
                style={styles.eyeBtn}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={showNew ? 'eye-off' : 'eye'}
                  size={21}
                  color={G.sub}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Confirm TPIN */}
          <View style={styles.field}>
            <Text style={styles.label}>Confirm New TPIN</Text>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.inputFlex}
                placeholder="Re-enter new TPIN"
                placeholderTextColor="#94a3b8"
                value={confirmPin}
                onChangeText={setConfirmPin}
                keyboardType="number-pad"
                secureTextEntry={!showConfirm}
                maxLength={6}
                returnKeyType="done"
              />
              <TouchableOpacity
                onPress={() => setShowConfirm(!showConfirm)}
                style={styles.eyeBtn}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={showConfirm ? 'eye-off' : 'eye'}
                  size={21}
                  color={G.sub}
                />
              </TouchableOpacity>
            </View>
            <Text style={styles.hint}>
              You’ll use this new TPIN for future wallet transactions.
            </Text>
          </View>

          <TouchableOpacity
            disabled={loading}
            onPress={handleChangeTPin}
            activeOpacity={0.9}
            style={[
              styles.primaryBtnFilled,
              { backgroundColor: loading ? G.grab2 : primary, opacity: loading ? 0.9 : 1 },
            ]}
          >
            {loading ? (
              <ActivityIndicator color={G.white} />
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons
                  name="refresh-outline"
                  size={18}
                  color={G.white}
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.primaryBtnTextFilled}>CHANGE TPIN</Text>
              </View>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
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
    borderBottomColor: G.line,
    borderBottomWidth: 1,
    backgroundColor: G.white,
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
    color: G.slate,
  },

  infoCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: G.line,
    backgroundColor: G.white,
    marginBottom: 14,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8FFF1',
    borderWidth: 1,
    borderColor: '#D1FAE5',
    marginBottom: 8,
  },
  title: { fontSize: width > 400 ? 18 : 16, fontWeight: '800', color: G.slate },
  sub: { marginTop: 6, color: G.sub, lineHeight: 20 },

  field: { marginTop: 16 },
  label: { fontSize: 13, fontWeight: '700', color: G.slate, marginBottom: 8 },

  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: G.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: G.white,
  },
  inputFlex: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: G.slate,
  },
  eyeBtn: {
    padding: 4,
    marginLeft: 6,
  },

  hint: { fontSize: 12, color: G.sub, marginTop: 6 },

  primaryBtnFilled: {
    marginTop: 18,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  primaryBtnTextFilled: {
    fontSize: width > 400 ? 16 : 15,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: G.white,
  },
});
