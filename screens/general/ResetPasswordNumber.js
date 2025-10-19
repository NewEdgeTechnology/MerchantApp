// ResetPasswordNumber.js
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  StatusBar,
  ScrollView,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context'; // ✅ use the correct SafeAreaView
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';

const ALLOWED_PREFIXES = ['77', '17', '16'];

const ResetPasswordNumber = () => {
  const navigation = useNavigation();

  const [phoneNumber, setPhoneNumber] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  const handleChange = (text) => {
    // keep digits only and clamp to 8 chars
    let digits = text.replace(/\D/g, '').slice(0, 8);
    setPhoneNumber(digits);
  };

  const prefix = phoneNumber.slice(0, 2);
  const isValidPrefix = ALLOWED_PREFIXES.includes(prefix);
  const isValidPhone = phoneNumber.length === 8 && isValidPrefix;

  const handleClear = () => setPhoneNumber('');

  return (
    <SafeAreaView style={styles.container} edges={['top', 'right', 'left']}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'android' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'android' ? 10 : 0}
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          {/* Header (kept same place + layout) */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.navigate('LoginScreen')} style={styles.iconButton}>
              <Icon name="close-outline" size={28} color="#1A1D1F" style={{ paddingLeft: 10 }} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('HelpScreen')} style={styles.iconButton}>
              <Icon name="help-circle-outline" size={24} color="#1A1D1F" />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <View style={styles.content}>
            <Text style={styles.title}>Reset password</Text>
            <Text style={styles.subtitle}>Enter your registered mobile number</Text>

            {/* Phone Input */}
            <View
              style={[
                styles.inputWrapper,
                { borderColor: isFocused ? '#00b14f' : '#E5E7EB', borderWidth: 1.5 },
              ]}
            >
              {/* Fixed Bhutan flag + dial code */}
              <View style={styles.flagContainer}>
                <View style={styles.flagBox}>
                  <Image
                    source={{ uri: 'https://flagcdn.com/w40/bt.png' }}
                    style={styles.flag}
                  />
                </View>
                <Text style={styles.dialCode}>+975</Text>
              </View>

              {/* Phone number field */}
              <TextInput
                style={styles.input}
                placeholder="Enter phone number"
                keyboardType="number-pad"
                inputMode="numeric"
                maxLength={8}
                value={phoneNumber}
                onChangeText={handleChange}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
              />
              {phoneNumber.length > 0 && (
                <TouchableOpacity onPress={handleClear} style={styles.clearButton}>
                  <Icon name="close-circle" size={20} color="#aaa" />
                </TouchableOpacity>
              )}
            </View>

            {/* Warning if prefix invalid */}
            {phoneNumber.length >= 2 && !isValidPrefix && (
              <Text style={styles.warningText}>
                Please enter a valid Bhutanese number (starts with 77, 17, or 16)
              </Text>
            )}

            {/* Username link */}
            <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')}>
              <Text style={styles.link}>Use email instead</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Bottom Section */}
        <View style={styles.bottomSticky}>
          <TouchableOpacity
            style={isValidPhone ? styles.submitButton : styles.submitButtonDisabled}
            onPress={() => navigation.navigate('PasswordSentScreen')}
            disabled={!isValidPhone}
          >
            <Text style={isValidPhone ? styles.submitButtonText : styles.submitTextDisabled}>Next</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default ResetPasswordNumber;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    // removed marginTop: 24 to avoid double spacing with SafeAreaView
  },
  iconButton: { padding: 8 },
  content: { flex: 1, paddingHorizontal: 20 /* removed marginTop:-5 to avoid pull-up */ },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1A1D1F',
    marginBottom: 15,
    lineHeight: 38,
  },
  subtitle: { fontSize: 15, color: '#666', marginBottom: 24 },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingHorizontal: 20,
    paddingVertical: 5,
    borderRadius: 12,
    marginBottom: 8,
    justifyContent: 'space-between',
  },
  warningText: {
    color: '#d9534f',
    fontSize: 13,
    marginBottom: 10,
    marginLeft: 5,
  },
  flagContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 10,
  },
  flagBox: {
    width: 30,
    height: 23,
    marginRight: 12,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#ccc',
    overflow: 'hidden',
  },
  flag: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  dialCode: { fontSize: 16, fontWeight: '400' },
  input: { flex: 1, fontSize: 16, color: '#1A1D1F', fontWeight: '400' },
  clearButton: { paddingLeft: 10 },
  link: { color: '#007bff', fontSize: 14, marginTop: 10, fontWeight: 'bold', opacity: 0.9 },
  bottomSticky: {
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'android' ? 20 : 20,
    borderRadius: 15,
    marginBottom: 8,
  },
  bottomLink: {
    color: '#007bff',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 10,
    fontWeight: 'bold',
    opacity: 0.9,
  },
  submitButton: {
    backgroundColor: '#00b14f',
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginTop: 10,
  },
  submitButtonDisabled: {
    backgroundColor: '#eee',
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginTop: 10,
  },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  submitTextDisabled: { color: '#aaa', fontSize: 16, fontWeight: '600' },
});
