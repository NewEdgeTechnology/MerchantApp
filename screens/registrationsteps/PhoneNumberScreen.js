import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  TextInput,
  Image,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation, useRoute } from '@react-navigation/native';
import HeaderWithSteps from './HeaderWithSteps';

// 🇧🇹 Only Bhutan
const COUNTRY_OPTIONS = [
  { name: 'Bhutan', code: 'bt', dial: '+975' },
];

// Required length
const DIAL_REQUIRED_LENGTH = {
  '+975': 8,
};
const getRequiredLength = (dial) => DIAL_REQUIRED_LENGTH[dial] ?? 8;

export default function PhoneNumberScreen() {
  const navigation = useNavigation();
  const route = useRoute();

  const {
    merchant: incomingMerchant = {},
    initialPhone = null,
    returnTo = null,
    serviceType,
    owner_type,
  } = route.params ?? {};

  // Fixed to Bhutan only
  const [country] = useState(COUNTRY_OPTIONS[0]);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    const fromParam = (initialPhone ?? incomingMerchant?.phone ?? '').trim();
    if (fromParam.startsWith(country.dial)) {
      const digits = fromParam.replace(country.dial, '').replace(/\D/g, '');
      setPhoneNumber(digits.slice(0, getRequiredLength(country.dial)));
    }
  }, []);

  const reqLen = useMemo(() => getRequiredLength(country.dial), [country.dial]);
  const isValid = phoneNumber.length === reqLen;

  const handleContinue = () => {
    if (!isValid) return;
    const full = `${country.dial}${phoneNumber}`;
    const mergedMerchant = {
      ...incomingMerchant,
      phone: full,
      owner_type: incomingMerchant?.owner_type ?? owner_type ?? serviceType ?? undefined,
    };

    navigation.navigate('MerchantRegistrationScreen', {
      ...(route.params ?? {}),
      serviceType,
      owner_type: owner_type ?? serviceType,
      merchant: mergedMerchant,
      initialFullName: mergedMerchant?.full_name ?? null,
      initialBusinessName: mergedMerchant?.business_name ?? null,
      initialCategory: mergedMerchant?.category ?? null,
      returnTo,
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <HeaderWithSteps step="Step 2 of 7" />
      <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />

      <View style={styles.content}>
        <Text style={styles.title}>Enter your phone number</Text>

        <View style={styles.phoneInputContainer}>
          {/* Fixed dial code (no dropdown) */}
          <View style={styles.countrySelector}>
            <Image
              source={{ uri: `https://flagcdn.com/w40/${country.code}.png` }}
              style={styles.flag}
            />
            <Text style={styles.countryCode}>{country.dial}</Text>
          </View>

          {/* National number input */}
          <View
            style={[
              styles.phoneInputWrapper,
              isFocused ? styles.phoneInputFocused : styles.phoneInputBlurred,
            ]}
          >
            <TextInput
              style={styles.phoneInput}
              value={phoneNumber}
              onChangeText={(text) => {
                const digitsOnly = text.replace(/\D/g, '').slice(0, reqLen);
                setPhoneNumber(digitsOnly);
              }}
              placeholder={`Phone number (${reqLen} digits)`}
              keyboardType="phone-pad"
              maxLength={reqLen}
              selection={{ start: phoneNumber.length, end: phoneNumber.length }}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
            />
            {phoneNumber.length > 0 && (
              <TouchableOpacity
                onPress={() => setPhoneNumber('')}
                style={styles.clearButton}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              >
                <Icon name="close-circle" size={20} color="#aaa" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <TouchableOpacity
          style={isValid ? styles.continueButton : styles.continueButtonDisabled}
          onPress={handleContinue}
          disabled={!isValid}
        >
          <Text
            style={isValid ? styles.continueButtonText : styles.continueTextDisabled}
          >
            Continue
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

/* Styles */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  content: { flex: 1, paddingHorizontal: 20, marginTop: -5 },
  title: { fontSize: 26, fontWeight: '700', color: '#1A1D1F', marginBottom: 25, lineHeight: 38 },

  phoneInputContainer: { flexDirection: 'row', marginBottom: 25, gap: 12 },

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
  countryCode: { fontSize: 16, color: '#1A1D1F', fontWeight: '500' },
  flag: {
    width: 26,
    height: 18,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 3,
    resizeMode: 'cover',
  },

  phoneInputWrapper: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 10,
  },
  phoneInput: {
    flex: 1,
    fontSize: 16,
    color: '#1A1D1F',
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontWeight: '500',
  },
  phoneInputFocused: { borderWidth: 2, borderColor: '#10B981' },
  phoneInputBlurred: { borderWidth: 1.5, borderColor: '#E5E7EB' },
  clearButton: { paddingLeft: 10 },

  continueButton: {
    backgroundColor: '#00b14f',
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginTop: 20,
  },
  continueButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  continueButtonDisabled: {
    backgroundColor: '#eee',
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginTop: 20,
  },
  continueTextDisabled: { color: '#aaa', fontSize: 16, fontWeight: '600' },
});
