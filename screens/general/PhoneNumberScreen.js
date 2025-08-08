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
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import HeaderWithSteps from './HeaderWithSteps';

const PhoneNumberScreen = () => {
  const navigation = useNavigation();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [countryCode, setCountryCode] = useState('+63');
  const [isFocused, setIsFocused] = useState(false); // 👈 Added focus state

  const handleContinue = () => {
    if (phoneNumber.length >= 10) {
      console.log('Phone number:', countryCode + phoneNumber);
      navigation.navigate('NextScreen');
    }
  };

  const isValid = phoneNumber.length >= 10;

  return (
    <SafeAreaView style={styles.container}>
      <HeaderWithSteps step="Step 2 of 7" />
      <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />

      <View style={styles.content}>
        <Text style={styles.title}>Enter your phone number</Text>

        <View style={styles.phoneInputContainer}>
          <TouchableOpacity style={styles.countrySelector}>
            <Text style={styles.countryCode}>{countryCode}</Text>
            <Icon name="chevron-down" size={16} color="#666" />
          </TouchableOpacity>

          {/* 👇 Conditional border styling based on focus */}
          <View
            style={[
              styles.phoneInputWrapper,
              isFocused ? styles.phoneInputFocused : styles.phoneInputBlurred,
            ]}
          >
            <TextInput
              style={styles.phoneInput}
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              placeholder="Phone number"
              keyboardType="phone-pad"
              maxLength={15}
              autoFocus={false}
              selection={{ start: phoneNumber.length, end: phoneNumber.length }}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
            />
          </View>
        </View>

        <TouchableOpacity
          style={isValid ? styles.continueButton : styles.continueButtonDisabled}
          onPress={handleContinue}
          disabled={!isValid}
        >
          <Text style={isValid ? styles.continueButtonText : styles.continueTextDisabled}>
            Continue
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

export default PhoneNumberScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
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

  phoneInputContainer: {
    flexDirection: 'row',
    marginBottom: 25,
    gap: 12,
  },

  countrySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    gap: 8,
  },

  countryCode: {
    fontSize: 16,
    color: '#1A1D1F',
    fontWeight: '500',
  },

  phoneInputWrapper: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 12,
  },

  phoneInput: {
    fontSize: 16,
    color: '#1A1D1F',
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontWeight: '500',
  },

  // ✅ Conditional styles for focus
  phoneInputFocused: {
    borderWidth: 2,
    borderColor: '#10B981',
  },

  phoneInputBlurred: {
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },

  // ✅ Continue button styling
  continueButton: {
    backgroundColor: '#00b14f',
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginTop: 20,
  },

  continueButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },

  continueButtonDisabled: {
    backgroundColor: '#eee',
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginTop: 20,
  },

  continueTextDisabled: {
    color: '#aaa',
    fontSize: 16,
    fontWeight: '600',
  },
});
