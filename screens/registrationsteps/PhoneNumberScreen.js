import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  TextInput,
  Image,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation, useRoute } from '@react-navigation/native';
import HeaderWithSteps from './HeaderWithSteps';
import { SafeAreaView } from 'react-native-safe-area-context';

// 🇧🇹 Only Bhutan
const COUNTRY_OPTIONS = [{ name: 'Bhutan', code: 'bt', dial: '+975' }];

// Required length
const DIAL_REQUIRED_LENGTH = { '+975': 8 };
const getRequiredLength = (dial) => DIAL_REQUIRED_LENGTH[dial] ?? 8;

// Allowed local prefixes (first two digits)
const ALLOWED_PREFIXES = ['77', '17', '16'];

/* ---- formatting helpers ---- */
const formatBhutan = (digits) => {
  // format 8 digits as "## ### ###"
  const d = digits.slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)} ${d.slice(2)}`;
  return `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5)}`;
};

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
  const [digits, setDigits] = useState('');   // store raw digits only
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    const fromParam = (initialPhone ?? incomingMerchant?.phone ?? '').trim();
    if (fromParam.startsWith(country.dial)) {
      const only = fromParam.replace(country.dial, '').replace(/\D/g, '');
      setDigits(only.slice(0, getRequiredLength(country.dial)));
    }
  }, []);

  const reqLen = useMemo(() => getRequiredLength(country.dial), [country.dial]);

  // Validation (don’t block typing)
  const hasRequiredLength = digits.length === reqLen;
  const firstOk = digits.length === 0 || digits[0] === '1' || digits[0] === '7';
  const prefixOk = digits.length < 2 || ALLOWED_PREFIXES.includes(digits.slice(0, 2));
  const isValid = hasRequiredLength && firstOk && prefixOk;

  const handleChangePhone = (text) => {
    const raw = text.replace(/\D/g, '').slice(0, reqLen);
    setDigits(raw);
  };

  const handleContinue = () => {
    if (!isValid) return;
    const full = `${country.dial}${digits}`;
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

  const showHelper = digits.length > 0 && (!firstOk || !prefixOk || !hasRequiredLength);
  const display = formatBhutan(digits);

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
              value={display}
              onChangeText={handleChangePhone}
              placeholder="8-digit number"
              placeholderTextColor="#94a3b8"
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={reqLen + 2} // allows spaces when user pastes formatted text
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              autoCorrect={false}
              autoCapitalize="none"
              accessibilityLabel="Bhutan phone number input"
            />

            {/* Right icon: clear when typing, check when valid */}
            {digits.length > 0 && !isValid && (
              <TouchableOpacity
                onPress={() => setDigits('')}
                style={styles.clearButton}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              >
                <Icon name="close-circle" size={20} color="#9ca3af" />
              </TouchableOpacity>
            )}
            {isValid && (
              <View style={styles.validBadge}>
                <Icon name="checkmark-circle" size={22} color="#10B981" />
              </View>
            )}
          </View>
        </View>

        {/* Inline helper */}
        {showHelper && (
          <Text style={styles.helperText}>
            {(!firstOk || !prefixOk) && `Starts with 77, 17 or 16. `}
            {!hasRequiredLength && `${reqLen} digits required.`}
          </Text>
        )}

        {/* Tiny caption under field to explain mask */}
        <Text style={styles.caption}>Format: 77/17/16 ××× ××× (8 digits)</Text>

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
}

/* Styles */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  content: { flex: 1, paddingHorizontal: 20, marginTop: -5 },
  title: { fontSize: 26, fontWeight: '700', color: '#1A1D1F', marginBottom: 25, lineHeight: 38 },

  phoneInputContainer: { flexDirection: 'row', marginBottom: 8, gap: 12 },

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
    minHeight: 56,
  },
  phoneInput: {
    flex: 1,
    fontSize: 18,
    letterSpacing: 0.5,
    color: '#111827',
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontWeight: '600',
    textAlignVertical: 'center', // Android vertical centering
  },
  phoneInputFocused: { borderWidth: 2, borderColor: '#10B981' },
  phoneInputBlurred: { borderWidth: 1.5, borderColor: '#E5E7EB' },
  clearButton: { paddingLeft: 10 },
  validBadge: { paddingLeft: 6, paddingRight: 4 },

  helperText: { marginTop: 6, color: '#ef4444', fontSize: 12 },
  caption: { marginTop: 6, color: '#6b7280', fontSize: 12 },

  continueButton: {
    backgroundColor: '#00b14f',
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginTop: 16,
  },
  continueButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  continueButtonDisabled: {
    backgroundColor: '#eee',
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginTop: 16,
  },
  continueTextDisabled: { color: '#aaa', fontSize: 16, fontWeight: '600' },
});
