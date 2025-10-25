// screens/food/CreateWalletScreen.js

import React, { useState, useEffect } from 'react';
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
import * as SecureStore from 'expo-secure-store';
import { CREATE_WALLET_ENDPOINT as ENV_CREATE_WALLET } from '@env';

const { width } = Dimensions.get('window');

export default function CreateWalletScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();

  const [userId, setUserId] = useState(route?.params?.userId ?? '');
  const [loading, setLoading] = useState(false);

  const headerTopPad = Math.max(insets.top, 8) + 18;

  useEffect(() => {
    // Try reading from local auth if userId not provided
    (async () => {
      if (userId) return;
      const keysToTry = ['user_login', 'customer_login', 'merchant_login'];
      for (const k of keysToTry) {
        try {
          const raw = await SecureStore.getItemAsync(k);
          if (!raw) continue;
          const parsed = JSON.parse(raw);
          const id = parsed?.user_id ?? parsed?.id;
          if (id) { setUserId(String(id)); return; }
        } catch {}
      }
    })();
  }, [userId]);

  async function setLocalWalletActive(extra = {}) {
    try {
      const raw = await SecureStore.getItemAsync('user_login');
      if (raw) {
        const parsed = JSON.parse(raw);
        const updated = {
          ...parsed,
          has_wallet: true,
          wallet_status: 'ACTIVE',
          ...extra,
        };
        await SecureStore.setItemAsync('user_login', JSON.stringify(updated));
      }
    } catch {}
  }

  async function handleCreate() {
    if (!userId || String(userId).trim() === '') {
      Alert.alert('Create Wallet', 'Could not detect a valid User ID.');
      return;
    }
    setLoading(true);
    try {
      const url = String(ENV_CREATE_WALLET || '').trim();
      if (!url) throw new Error('CREATE_WALLET_ENDPOINT missing in .env');

      // ✅ API expects: { "user_id": <number>, "status": "ACTIVE" }
      const payload = {
        user_id: Number(userId),
        status: 'ACTIVE',
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const isJson = (res.headers.get('content-type') || '').includes('application/json');
      const data = isJson ? await res.json() : await res.text();

      // 🧩 Gracefully handle "already exists" responses (message or 409)
      const msg = (typeof data === 'string' ? data : (data?.message || data?.error || '')) + '';
      if (/already exists/i.test(msg) || res.status === 409) {
        await setLocalWalletActive();
        Alert.alert('Wallet', 'Your wallet already exists', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
        setLoading(false);
        return;
      }

      if (!res.ok) {
        const errMsg = (typeof data === 'string' ? data : (data?.message || data?.error)) || 'Failed to create wallet.';
        throw new Error(errMsg);
      }

      await setLocalWalletActive({ wallet_id: (typeof data === 'object' ? data?.wallet_id : undefined) });

      Alert.alert('Success', 'Wallet created successfully.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert('Create Wallet', e.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['left','right','bottom']}>
      {/* Header */}
      <View style={[styles.headerBar, { paddingTop: headerTopPad }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Wallet</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 24 + insets.bottom }}>
          <View style={styles.infoCard}>
            <View style={styles.iconWrap}>
              <Ionicons name="shield-checkmark-outline" size={28} color="#16a34a" />
            </View>
            <Text style={styles.title}>Set up your Grab Wallet</Text>
            <Text style={styles.sub}>
              Your wallet lets you pay at checkout, send money to friends, and earn cashback.
            </Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>User ID</Text>
            <TextInput
              style={[styles.input, { backgroundColor: '#f9fafb', color: '#6b7280' }]}
              value={String(userId ?? '')}
              editable={false}
              selectTextOnFocus={false}
              placeholder="User ID not found"
            />
            <Text style={styles.hint}>
              Your user ID is automatically detected from your signed-in account.
            </Text>
          </View>

          <TouchableOpacity
            disabled={loading}
            onPress={handleCreate}
            activeOpacity={0.9}
            style={[styles.primaryBtnFilled, { backgroundColor: loading ? '#fb923c' : '#f97316', opacity: loading ? 0.8 : 1 }]}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnTextFilled}>CREATE WALLET</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },

  // Header
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

  infoCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    backgroundColor: '#ffffff',
    marginBottom: 14,
  },
  iconWrap: {
    width: 48, height: 48, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#f0fdf4',
    borderWidth: 1, borderColor: '#dcfce7',
    marginBottom: 8,
  },
  title: { fontSize: width > 400 ? 18 : 16, fontWeight: '800', color: '#0f172a' },
  sub: { marginTop: 6, color: '#64748b', lineHeight: 20 },

  field: { marginTop: 16 },
  label: { fontSize: 13, fontWeight: '700', color: '#0f172a', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
  },
  hint: { fontSize: 12, color: '#64748b', marginTop: 6 },

  primaryBtnFilled: {
    marginTop: 18,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  primaryBtnTextFilled: { fontSize: width > 400 ? 16 : 15, fontWeight: '800', letterSpacing: 0.6, color: '#fff' },
});
