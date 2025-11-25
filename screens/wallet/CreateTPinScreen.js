import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CREATE_TPIN_ENDPOINT as ENV_CREATE_TPIN } from '@env';
import { Dimensions, KeyboardAvoidingView, Platform } from 'react-native';

const { width } = Dimensions.get('window'); // Get the screen width

export default function CreateTPinScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();

  const [tpin, setTpin] = useState('');
  const [confirmTpin, setConfirmTpin] = useState(''); // State for confirming TPIN
  const [loading, setLoading] = useState(false);

  const [showTpin, setShowTpin] = useState(false);  // State to toggle visibility of TPIN
  const [showConfirmTpin, setShowConfirmTpin] = useState(false);  // State to toggle visibility of Confirm TPIN

  const walletId = route?.params?.walletId ?? '';  // Ensure it's passed correctly
  const headerTopPad = Math.max(insets.top, 8) + 18;

  // Handle the creation of the TPIN
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
      console.log('Create TPIN URL:', url);  // Verify URL construction

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
        const errMsg = (typeof data === 'string' ? data : (data?.message || data?.error)) || 'Failed to create TPIN.';
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

    // Show confirmation modal
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
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#0f172a" />
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
            <TouchableOpacity onPress={() => setShowTpin(prev => !prev)} style={styles.eyeIcon}>
              <Ionicons name={showTpin ? "eye-off" : "eye"} size={24} color="#94a3b8" />
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
            <TouchableOpacity onPress={() => setShowConfirmTpin(prev => !prev)} style={styles.eyeIcon}>
              <Ionicons name={showConfirmTpin ? "eye-off" : "eye"} size={24} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          {/* Create TPIN Button */}
          <TouchableOpacity
            disabled={loading}
            onPress={openConfirmationDialog}
            activeOpacity={0.9}
            style={[styles.primaryBtnFilled, { backgroundColor: loading ? '#fb923c' : '#f97316', opacity: loading ? 0.8 : 1 }]}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnTextFilled}>CREATE TPIN</Text>}
          </TouchableOpacity>
        </View>
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

  content: {
    padding: 18,
    paddingBottom: 24,
  },

  title: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  sub: { marginTop: 6, color: '#64748b', lineHeight: 20 },

  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
  },

  input: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#0f172a',
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
  primaryBtnTextFilled: { fontSize: 16, fontWeight: '800', color: '#fff' },
});
