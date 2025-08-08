import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  SafeAreaView,
  StatusBar,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';

const MobileLoginScreen = () => {
  const navigation = useNavigation();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [hasError, setHasError] = useState(true);
  const [touched, setTouched] = useState(false);
  const [countryCode, setCountryCode] = useState('+63');

  const handlePhoneChange = (text) => {
    setPhoneNumber(text);
    if (text.length > 0 && text.length < 10) {
      setHasError(true);
    } else if (text.length >= 10) {
      setHasError(false);
    }
  };

  const handleLogin = () => {
    if (phoneNumber.length >= 10 && !hasError) {
      console.log('Login with:', countryCode + phoneNumber);
      navigation.navigate('OTPScreen');
    } else {
      setHasError(true);
    }
  };

  const isButtonEnabled = phoneNumber.length >= 10 && !hasError;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'android' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'android' ? 10 : 0}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
              <Text style={styles.icon}>←</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('HelpScreen')} style={styles.iconButton}>
              <Icon name="help-circle-outline" size={24} color="#1A1D1F" />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <View style={styles.content}>
            <Text style={styles.title}>Log in with mobile number</Text>

            {/* Phone Input */}
            <View style={styles.inputContainer}>
              <View style={[styles.phoneInputWrapper, hasError && touched && styles.phoneInputError]}>
                <Text style={styles.countryCode}>{countryCode}</Text>
                <View style={styles.separator} />
                <TextInput
                  style={styles.phoneInput}
                  value={phoneNumber}
                  onChangeText={handlePhoneChange}
                  placeholder="Enter mobile number"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="phone-pad"
                  autoFocus={false}
                  onFocus={() => setTouched(true)}
                />
                {hasError && touched && (
                  <View style={styles.errorIconContainer}>
                    <Text style={styles.errorIcon}>!</Text>
                  </View>
                )}
              </View>
              {hasError && touched && <Text style={styles.errorText}>Required</Text>}
            </View>
          </View>
        </ScrollView>

        {/* Bottom Section with Button */}
        <View style={styles.bottomSticky}>
          <TouchableOpacity
            style={isButtonEnabled ? styles.continueButton : styles.continueButtonDisabled}
            onPress={handleLogin}
            disabled={!isButtonEnabled}
          >
            <Text style={isButtonEnabled ? styles.continueButtonText : styles.continueTextDisabled}>
              Log In
            </Text>
          </TouchableOpacity>

          {/* Home Indicator */}
          {/* <View style={styles.homeIndicator} /> */}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default MobileLoginScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    marginTop: 24,
  },
  iconButton: {
    padding: 8,
  },
  icon: {
    fontSize: 24,
    color: '#1A1D1F',
    fontFamily: 'Inter-Regular',
    paddingLeft: 10,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    marginTop: -5,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1A1D1F',
    marginBottom: 25,
    lineHeight: 38,
  },
  inputContainer: {
    marginBottom: 25,
    gap: 12,
  },
  phoneInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingHorizontal: 15,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  phoneInputError: {
    borderColor: '#EF4444',
    borderWidth: 2,
    opacity: 0.8,
  },
  countryCode: {
    fontSize: 16,
    color: '#1A1D1F',
    fontWeight: '500',
  },
  separator: {
    width: 1,
    height: 30,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 12,
  },
  phoneInput: {
    flex: 1,
    fontSize: 16,
    color: '#1A1D1F',
    fontWeight: '400',
  },
  errorIconContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorIcon: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '500',
    marginTop: 8,
    marginLeft: 4,
  },
  bottomSticky: {
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'android' ? 34 : 20,
    borderRadius: 15,
  },
  continueButton: {
    backgroundColor: '#00b14f',
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginTop: 10,
  },
  continueButtonDisabled: {
    backgroundColor: '#eee',
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginBottom: 15,
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  continueTextDisabled: {
    color: '#aaa',
    fontSize: 16,
    fontWeight: '600',
  },
  homeIndicator: {
    width: 134,
    height: 5,
    backgroundColor: '#6B7280',
    borderRadius: 3,
    alignSelf: 'center',
    marginTop: 12,
  },
});
