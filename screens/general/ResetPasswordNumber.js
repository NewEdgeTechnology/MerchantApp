// ResetPasswordNumber.js
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Platform,
  KeyboardAvoidingView,
  StatusBar,
  ScrollView,
  Image,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';

const COUNTRIES = [
  { name: 'Singapore', code: 'sg' },
  { name: 'Malaysia', code: 'my' },
  { name: 'Indonesia', code: 'id' },
  { name: 'Philippines', code: 'ph' },
  { name: 'Thailand', code: 'th' },
  { name: 'Vietnam', code: 'vn' },
  { name: 'Myanmar', code: 'mm' },
  { name: 'Cambodia', code: 'kh' },
];

const ResetPasswordNumber = () => {
  const navigation = useNavigation();

  const [phoneNumber, setPhoneNumber] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState(COUNTRIES[0]); // default Singapore

  const isValidPhone = phoneNumber.trim().length > 0;

  const handleClear = () => {
    setPhoneNumber('');
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'android' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'android' ? 10 : 0}
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          {/* Header */}
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
            <Text style={styles.subtitle}>
              Enter your registered mobile number
            </Text>

            {/* Phone Input */}
            <View
              style={[
                styles.inputWrapper,
                {
                  borderColor: isFocused ? '#00b14f' : '#E5E7EB',
                  borderWidth: 1.5,
                },
              ]}
            >
              {/* Country (flag + code) */}
              <TouchableOpacity
                style={styles.flagContainer}
                onPress={() =>
                  navigation.navigate('CountrySelect', {
                    countries: COUNTRIES,
                    selectedCode: selectedCountry.code,
                    onPick: (c) => setSelectedCountry(c),
                  })
                }
                activeOpacity={0.7}
              >
                <Image
                  source={{ uri: `https://flagcdn.com/w40/${selectedCountry.code}.png` }}
                  style={styles.flag}
                />
                <Text style={styles.dialCode}>
                  {`+${selectedCountry.code === 'sg' ? '65' :
                      selectedCountry.code === 'my' ? '60' :
                      selectedCountry.code === 'id' ? '62' :
                      selectedCountry.code === 'ph' ? '63' :
                      selectedCountry.code === 'th' ? '66' :
                      selectedCountry.code === 'vn' ? '84' :
                      selectedCountry.code === 'mm' ? '95' :
                      selectedCountry.code === 'kh' ? '855' : ''}`}
                </Text>
              </TouchableOpacity>

              {/* Phone number field */}
              <TextInput
                style={styles.input}
                placeholder="Enter phone number"
                keyboardType="phone-pad"
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
              />
              {phoneNumber.length > 0 && (
                <TouchableOpacity onPress={handleClear} style={styles.clearButton}>
                  <Icon name="close-circle" size={20} color="#aaa" />
                </TouchableOpacity>
              )}
            </View>

            {/* Username link */}
            <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')}>
              <Text style={styles.link}>Use username instead</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Bottom Section */}
        <View style={styles.bottomSticky}>
          <TouchableOpacity onPress={() => navigation.navigate('ForgotUsername')}>
            <Text style={styles.bottomLink}>Forgot your username?</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={isValidPhone ? styles.submitButton : styles.submitButtonDisabled}
            onPress={() => navigation.navigate('PasswordSentScreen')}
            disabled={!isValidPhone}
          >
            <Text style={isValidPhone ? styles.submitButtonText : styles.submitTextDisabled}>
              Next
            </Text>
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
    marginTop: 24,
  },
  iconButton: { padding: 8 },
  content: { flex: 1, paddingHorizontal: 20, marginTop: -5 },
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
    marginBottom: 12,
    justifyContent: 'space-between',
  },
  flagContainer: { flexDirection: 'row', alignItems: 'center', marginRight: 10 },
  flag: {
    width: 30,
    height: 23,
    marginRight: 12,
    resizeMode: 'contain',
    borderColor: '#ccc',
    borderRadius: 3,
    borderWidth: 1,
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
