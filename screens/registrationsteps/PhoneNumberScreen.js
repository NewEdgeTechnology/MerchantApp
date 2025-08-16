import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  TextInput,
  Modal,
  TouchableWithoutFeedback,
  Image,
  Dimensions,
  FlatList,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation, useRoute } from '@react-navigation/native';
import HeaderWithSteps from './HeaderWithSteps';

const { height } = Dimensions.get('window');
const SHEET_HEIGHT = Math.round(height / 2);

// 🇧🇹 Add/adjust countries & dial codes here
const COUNTRY_OPTIONS = [
  { name: 'Bhutan',      code: 'bt', dial: '+975' },
  { name: 'Singapore',   code: 'sg', dial: '+65'  },
  { name: 'Malaysia',    code: 'my', dial: '+60'  },
  { name: 'Indonesia',   code: 'id', dial: '+62'  },
  { name: 'Philippines', code: 'ph', dial: '+63'  },
  { name: 'Thailand',    code: 'th', dial: '+66'  },
  { name: 'Vietnam',     code: 'vn', dial: '+84'  },
  { name: 'Myanmar',     code: 'mm', dial: '+95'  },
  { name: 'Cambodia',    code: 'kh', dial: '+855' },
];

// Required national number lengths per dial (tweak to your rules)
const DIAL_REQUIRED_LENGTH = {
  '+975': 8,
  '+65': 8,
  '+60': 9,
  '+62': 10,
  '+63': 10,
  '+66': 9,
  '+84': 9,
  '+95': 9,
  '+855': 9,
};
const getRequiredLength = (dial) => DIAL_REQUIRED_LENGTH[dial] ?? 10;

export default function PhoneNumberScreen() {
  const navigation = useNavigation();
  const route = useRoute();

  // Bring forward what's already collected
  const {
    merchant: incomingMerchant = {},
    initialPhone = null,
    returnTo = null,
    serviceType,
    owner_type,
  } = route.params ?? {};

  // Default to Bhutan; change if your funnel should start elsewhere
  const [country, setCountry] = useState(COUNTRY_OPTIONS[0]); // {name, code, dial}
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [codeVisible, setCodeVisible] = useState(false);

  // Prefill phone only from params (Edit-from-Review path)
  useEffect(() => {
    const fromParam = (initialPhone ?? incomingMerchant?.phone ?? '').trim();
    if (fromParam) {
      const found = COUNTRY_OPTIONS.find((c) => fromParam.startsWith(c.dial));
      if (found) {
        setCountry(found);
        const digits = fromParam.replace(found.dial, '').replace(/\D/g, '');
        setPhoneNumber(digits.slice(0, getRequiredLength(found.dial)));
      } else {
        setPhoneNumber(fromParam.replace(/\D/g, ''));
      }
    }
    // no SecureStore fallback anymore
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reqLen = useMemo(() => getRequiredLength(country.dial), [country.dial]);
  const isValid = phoneNumber.length === reqLen;

  const handleContinue = () => {
    if (!isValid) return;

    const full = `${country.dial}${phoneNumber}`; // keep a space

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
      // also hydrate business fields if they existed
      initialFullName: mergedMerchant?.full_name ?? null,
      initialBusinessName: mergedMerchant?.business_name ?? null,
      initialCategory: mergedMerchant?.category ?? null,
      returnTo,
    });
  };

  const renderCodeItem = ({ item }) => {
    const isActive = item.dial === country.dial;
    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.8}
        onPress={() => {
          setCountry(item);
          const newLen = getRequiredLength(item.dial);
          setPhoneNumber((prev) => prev.replace(/\D/g, '').slice(0, newLen));
          setCodeVisible(false);
        }}
      >
        <View style={styles.left}>
          <Image
            source={{ uri: `https://flagcdn.com/w40/${item.code}.png` }}
            style={styles.flag}
          />
          <Text style={[styles.name, isActive && styles.nameActive]}>
            {item.name} ({item.dial})
          </Text>
        </View>
        {isActive && (
          <Icon name="checkmark" size={22} color="#000" style={styles.tickIcon} />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <HeaderWithSteps step="Step 2 of 7" />
      <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />

      <View style={styles.content}>
        <Text style={styles.title}>Enter your phone number</Text>

        <View style={styles.phoneInputContainer}>
          {/* Dial code selector */}
          <TouchableOpacity
            style={styles.countrySelector}
            onPress={() => setCodeVisible(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.countryCode}>{country.dial}</Text>
            <Icon name="chevron-down" size={16} color="#666" />
          </TouchableOpacity>

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

      {/* Country bottom sheet */}
      <Modal
        visible={codeVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setCodeVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setCodeVisible(false)}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>

        <View style={styles.sheet}>
          <SafeAreaView style={{ flex: 1 }}>
            <Text style={styles.sheetTitle}>My business is in</Text>

            <FlatList
              style={{ flex: 1 }}
              data={COUNTRY_OPTIONS}
              keyExtractor={(item) => item.code}
              renderItem={renderCodeItem}
              ItemSeparatorComponent={() => <View style={styles.sep} />}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 8 }}
              keyboardShouldPersistTaps="handled"
            />
          </SafeAreaView>
        </View>
      </Modal>
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

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    height: SHEET_HEIGHT,
    backgroundColor: '#fff',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 10,
  },
  sheetTitle: { fontSize: 22, fontWeight: '700', marginBottom: 16, color: '#111' },

  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14 },
  left: { flexDirection: 'row', alignItems: 'center' },
  flag: {
    width: 26,
    height: 18,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 3,
    marginRight: 12,
    resizeMode: 'cover',
  },
  name: { fontSize: 16, color: '#1a1d1f' },
  nameActive: { fontWeight: '700' },
  tickIcon: { alignSelf: 'center', marginRight: 2 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: '#eee' },
});
