import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { CREATE_WALLET_ENDPOINT as ENV_CREATE_WALLET } from '@env';

const { width } = Dimensions.get('window');

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

export default function CreateWalletScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();

  const [userId, setUserId] = useState(route?.params?.userId ?? '');
  const [loading, setLoading] = useState(false);

  const headerTopPad = Math.max(insets.top, 8) + 18;
  const primary = G.grab;

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
          if (id) {
            setUserId(String(id));
            return;
          }
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

      // API expects: { "user_id": <number>, "status": "ACTIVE" }
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

      // Gracefully handle "already exists" responses (message or 409)
      const msg =
        (typeof data === 'string'
          ? data
          : data?.message || data?.error || '') + '';
      if (/already exists/i.test(msg) || res.status === 409) {
        await setLocalWalletActive();
        Alert.alert('Wallet', 'Your wallet already exists', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
        setLoading(false);
        return;
      }

      if (!res.ok) {
        const errMsg =
          (typeof data === 'string'
            ? data
            : data?.message || data?.error) || 'Failed to create wallet.';
        throw new Error(errMsg);
      }

      await setLocalWalletActive({ wallet_id: data.data.wallet_id });

      setTimeout(() => {
        Alert.alert('Success', 'Wallet created successfully.', [
          {
            text: 'OK',
            onPress: () =>
              navigation.navigate('CreateTPinScreen', {
                userId: userId,
                walletId: data.data.wallet_id,
              }),
          },
        ]);
      }, 100);
    } catch (e) {
      Alert.alert('Create Wallet', e.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

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
        <Text style={styles.headerTitle}>Create Wallet</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          contentContainerStyle={{
            padding: 18,
            paddingBottom: 24 + insets.bottom,
          }}
        >
          <View style={styles.infoCard}>
            <View style={styles.iconWrap}>
              <Ionicons
                name="shield-checkmark-outline"
                size={28}
                color={G.grab}
              />
            </View>
            <Text style={styles.title}>Set up your Grab Wallet</Text>
            <Text style={styles.sub}>
              Your wallet lets you pay at checkout, send money to friends, and
              earn cashback.
            </Text>
          </View>

          <Text style={styles.label}>Wallet Setup</Text>
          <Text style={styles.sub}>
            You're about to create your wallet. Once done, you will be prompted
            to set up your TPIN.
          </Text>

          <TouchableOpacity
            disabled={loading}
            onPress={handleCreate}
            activeOpacity={0.9}
            style={[
              styles.primaryBtnFilled,
              {
                backgroundColor: loading ? G.grab2 : primary,
                opacity: loading ? 0.8 : 1,
              },
            ]}
          >
            {loading ? (
              <ActivityIndicator color={G.white} />
            ) : (
              <Text style={styles.primaryBtnTextFilled}>CREATE WALLET</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: G.bg },

  // Header
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
  title: {
    fontSize: width > 400 ? 18 : 16,
    fontWeight: '800',
    color: G.slate,
  },
  sub: { marginTop: 6, color: G.sub, lineHeight: 20 },

  field: { marginTop: 16 },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: G.slate,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: G.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: G.slate,
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
