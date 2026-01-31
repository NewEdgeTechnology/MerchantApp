import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CREATE_TPIN_ENDPOINT as ENV_CREATE_TPIN } from '@env';

const { width } = Dimensions.get('window'); // Get the screen width

// Grab-like palette (same as other wallet screens)
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

export default function CreateTPinScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();

  const [tpin, setTpin] = useState('');
  const [confirmTpin, setConfirmTpin] = useState('');
  const [loading, setLoading] = useState(false);

  const [showTpin, setShowTpin] = useState(false);
  const [showConfirmTpin, setShowConfirmTpin] = useState(false);

  const walletId = route?.params?.walletId ?? '';
  const headerTopPad = Math.max(insets.top, 8) + 18;
  const primary = G.grab;

  const handleCreateTPin = async () => {
    if (!tpin || tpin.length !== 4 || tpin !== confirmTpin) {
      Alert.alert('Create TPIN', 'TPINs do not match or are invalid.');
      return;
    }

    if (!walletId) {
      console.error('Wallet ID is missing');
      Alert.alert('Error', 'Wallet ID is missing');
      return;
    }

    setLoading(true);
    try {
      const url = ENV_CREATE_TPIN.replace('{wallet_id}', walletId);
      console.log('Create TPIN URL:', url);

      if (!url) throw new Error('CREATE_TPIN_ENDPOINT missing in .env');

      const payload = {
        t_pin: tpin,
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const isJson = (res.headers.get('content-type') || '').includes('application/json');
      const data = isJson ? await res.json() : await res.text();

      if (!res.ok) {
        const errMsg =
          (typeof data === 'string' ? data : data?.message || data?.error) ||
          'Failed to create TPIN.';
        throw new Error(errMsg);
      }

      Alert.alert('Success', 'TPIN created successfully.', [
        { text: 'OK', onPress: () => navigation.navigate('WalletScreen') },
      ]);
    } catch (e) {
      Alert.alert('Create TPIN', e.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const openConfirmationDialog = () => {
    if (!tpin || tpin.length !== 4) {
      Alert.alert('Create TPIN', 'Please enter a valid 4-digit TPIN.');
      return;
    }

    Alert.alert(
      'Confirm TPIN',
      'Are you sure you want to create this TPIN?',
      [
        {
          text: 'Cancel',
          onPress: () => {},
          style: 'cancel',
        },
        {
          text: 'Confirm',
          onPress: handleCreateTPin,
        },
      ],
      { cancelable: false }
    );
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
          <Ionicons name="arrow-back" size={22} color={G.slate} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create TPIN</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <View style={styles.content}>
          <Text style={styles.title}>Set up your TPIN</Text>
          <Text style={styles.sub}>
            Your TPIN will be used to authenticate wallet transactions. Please choose a 4-digit PIN.
          </Text>

          {/* TPIN Input with Eye Icon */}
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              placeholder="Enter 4-digit TPIN"
              placeholderTextColor="#94a3b8"
              value={tpin}
              onChangeText={setTpin}
              keyboardType="number-pad"
              maxLength={4}
              secureTextEntry={!showTpin}
            />
            <TouchableOpacity
              onPress={() => setShowTpin((prev) => !prev)}
              style={styles.eyeIcon}
            >
              <Ionicons
                name={showTpin ? 'eye-off' : 'eye'}
                size={22}
                color={G.sub}
              />
            </TouchableOpacity>
          </View>

          {/* Confirm TPIN Input with Eye Icon */}
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              placeholder="Confirm TPIN"
              placeholderTextColor="#94a3b8"
              value={confirmTpin}
              onChangeText={setConfirmTpin}
              keyboardType="number-pad"
              maxLength={4}
              secureTextEntry={!showConfirmTpin}
            />
            <TouchableOpacity
              onPress={() => setShowConfirmTpin((prev) => !prev)}
              style={styles.eyeIcon}
            >
              <Ionicons
                name={showConfirmTpin ? 'eye-off' : 'eye'}
                size={22}
                color={G.sub}
              />
            </TouchableOpacity>
          </View>

          {/* Create TPIN Button */}
          <TouchableOpacity
            disabled={loading}
            onPress={openConfirmationDialog}
            activeOpacity={0.9}
            style={[
              styles.primaryBtnFilled,
              { backgroundColor: loading ? G.grab2 : primary, opacity: loading ? 0.8 : 1 },
            ]}
          >
            {loading ? (
              <ActivityIndicator color={G.white} />
            ) : (
              <Text style={styles.primaryBtnTextFilled}>CREATE TPIN</Text>
            )}
          </TouchableOpacity>
        </View>
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

  content: {
    padding: 18,
    paddingBottom: 24,
  },

  title: {
    fontSize: width > 400 ? 18 : 16,
    fontWeight: '800',
    color: G.slate,
  },
  sub: { marginTop: 6, color: G.sub, lineHeight: 20 },

  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    borderWidth: 1,
    borderColor: G.line,
    borderRadius: 12,
    backgroundColor: G.white,
  },

  input: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: G.slate,
  },

  eyeIcon: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },

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
    color: G.white,
    letterSpacing: 0.6,
  },
});
