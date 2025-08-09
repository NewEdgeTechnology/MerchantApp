import React, { useState } from 'react';
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
  Platform,
  FlatList, // ⬅️ added
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import HeaderWithSteps from './HeaderWithSteps';

const { height } = Dimensions.get('window');
const SHEET_HEIGHT = Math.round(height / 2);

// Country list with flags + dial codes
const COUNTRY_OPTIONS = [
  { name: 'Singapore',   code: 'sg', dial: '+65'  },
  { name: 'Malaysia',    code: 'my', dial: '+60'  },
  { name: 'Indonesia',   code: 'id', dial: '+62'  },
  { name: 'Philippines', code: 'ph', dial: '+63'  },
  { name: 'Thailand',    code: 'th', dial: '+66'  },
  { name: 'Vietnam',     code: 'vn', dial: '+84'  },
  { name: 'Myanmar',     code: 'mm', dial: '+95'  },
  { name: 'Cambodia',    code: 'kh', dial: '+855' },
];

export default function PhoneNumberScreen() {
  const navigation = useNavigation();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [countryCode, setCountryCode] = useState('+63'); // default Philippines
  const [isFocused, setIsFocused] = useState(false);
  const [codeVisible, setCodeVisible] = useState(false); // overlay toggle

  const isValid = phoneNumber.length >= 10;

  const handleContinue = () => {
    if (isValid) {
      navigation.navigate('MerchantRegistrationScreen');
    }
  };

  const renderCodeItem = ({ item }) => {
    const isActive = item.dial === countryCode;
    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.8}
        onPress={() => {
          setCountryCode(item.dial);
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
        {isActive ? (
          <Icon name="checkmark" size={22} color="#000" style={styles.tickIcon} />
        ) : null}
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
          {/* Country code pill (opens overlay) */}
          <TouchableOpacity
            style={styles.countrySelector}
            onPress={() => setCodeVisible(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.countryCode}>{countryCode}</Text>
            <Icon name="chevron-down" size={16} color="#666" />
          </TouchableOpacity>

          {/* Phone input with focus border */}
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

      {/* ===== Country Code Overlay (styled & scrollable like CountrySelectScreen) ===== */}
      <Modal
        visible={codeVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setCodeVisible(false)}
      >
        {/* Backdrop */}
        <TouchableWithoutFeedback onPress={() => setCodeVisible(false)}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>

        {/* Bottom sheet */}
        <View style={styles.sheet}>
          <SafeAreaView style={{ flex: 1 }}>
            <Text style={styles.sheetTitle}>My business is in</Text>

            <FlatList
              style={{ flex: 1 }} // list scrolls within the sheet
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

/* ====================== Styles ====================== */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },

  content: { flex: 1, paddingHorizontal: 20, marginTop: -5 },

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
  phoneInputFocused: { borderWidth: 2, borderColor: '#10B981' },
  phoneInputBlurred: { borderWidth: 1.5, borderColor: '#E5E7EB' },

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

  /* ===== Overlay (matching CountrySelectScreen) ===== */
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

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
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

  // hairline separator like your other sheet
  sep: { height: StyleSheet.hairlineWidth },
});
  