// screens/registrationsteps/SignupScreen.js
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableWithoutFeedback,
  Keyboard,
  Switch,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation, useRoute } from '@react-navigation/native';
import HeaderWithSteps from './HeaderWithSteps';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SignupScreen() {
  const navigation = useNavigation();
  const route = useRoute();

  // May arrive when editing from Review
  const {
    merchant: incomingMerchant = {},
    initialEmail = null,
    initialPassword = null,
    returnTo = null, // e.g., "ReviewSubmitScreen"
    serviceType,
    owner_type,
  } = route.params ?? {};

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [savePassword, setSavePassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isEmailFocused, setIsEmailFocused] = useState(false);
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Prefill priority:
  // 1) initialEmail/initialPassword (from Review "Edit")
  // 2) incomingMerchant.email/password (carried through params)
  // 3) SecureStore (ONLY if BOTH saved_email and saved_password exist)
  useEffect(() => {
    (async () => {
      const seededEmail = (initialEmail ?? incomingMerchant?.email ?? '').trim();
      const seededPassword = initialPassword ?? incomingMerchant?.password ?? '';

      if (seededEmail) setEmail(seededEmail);
      if (seededPassword) setPassword(seededPassword);

      if (!seededEmail || !seededPassword) {
        try {
          const [savedEmail, savedPw] = await Promise.all([
            SecureStore.getItemAsync('saved_email'),
            SecureStore.getItemAsync('saved_password'),
          ]);
          if (!seededEmail && savedEmail && savedPw) setEmail(savedEmail);
          if (!seededPassword && savedEmail && savedPw) {
            setPassword(savedPw);
            setSavePassword(true);
          }
        } catch {}
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isValidEmail = (val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);

  // ✅ Added: must start with a lowercase letter
  const checkRules = {           // <-- NEW
    length: password.length >= 8,
    upperLower: /[A-Z]/.test(password) && /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    noSpace: /^\S*$/.test(password),
    noRepeat: !/(.)\1{3,}/.test(password),
  };

  const isValidPassword = Object.values(checkRules).every(Boolean);
  const isFormValid = isValidEmail(email) && isValidPassword;
  const showPasswordRules = isPasswordFocused && password.length > 0;

  const handleContinue = async () => {
    if (!isFormValid) return;

    try {
      if (savePassword) {
        await SecureStore.setItemAsync('saved_email', email.trim());
        await SecureStore.setItemAsync('saved_password', password);
      } else {
        await SecureStore.deleteItemAsync('saved_email');
        await SecureStore.deleteItemAsync('saved_password');
      }
    } catch {}

    const mergedMerchant = {
      ...incomingMerchant,
      email: email.trim(),
      password,
      owner_type: owner_type ?? serviceType ?? incomingMerchant?.owner_type ?? undefined,
    };

    navigation.navigate('PhoneNumberScreen', {
      ...(route.params ?? {}),
      serviceType,
      owner_type: owner_type ?? serviceType,
      merchant: mergedMerchant,
      initialPhone: incomingMerchant?.phone ?? null,
      returnTo,
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <HeaderWithSteps step="Step 1 of 7" />

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={{ flex: 1 }}>
            <ScrollView
              contentContainerStyle={[
                styles.scrollContainer,
                { paddingBottom: keyboardVisible ? 10 : 100 },
              ]}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.inner}>
                <Text style={styles.title}>Set up email and password</Text>
                <Text style={styles.subtitle}>
                  You’ll use this to log in. We’ll guide you through the rest of onboarding.
                </Text>

                <View style={styles.form}>
                  {/* Email */}
                  <Text style={styles.label}>Email</Text>
                  <View
                    style={[
                      styles.inputWrapper,
                      { borderColor: isEmailFocused ? '#00b14f' : '#ccc' },
                    ]}
                  >
                    <TextInput
                      style={styles.inputField}
                      placeholder="e.g. name@email.com"
                      value={email}
                      onChangeText={setEmail}
                      onFocus={() => setIsEmailFocused(true)}
                      onBlur={() => setIsEmailFocused(false)}
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </View>

                  {/* Password */}
                  <Text style={styles.label}>Password</Text>
                  <View
                    style={[
                      styles.passwordContainer,
                      { borderColor: isPasswordFocused ? '#00b14f' : '#ccc' },
                    ]}
                  >
                    <TextInput
                      style={styles.passwordInput}
                      placeholder="Enter password"
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      onFocus={() => setIsPasswordFocused(true)}
                      onBlur={() => setIsPasswordFocused(false)}
                      autoCapitalize="none" // keep exact casing as typed
                    />
                    <TouchableOpacity
                      onPress={() => setShowPassword(!showPassword)}
                      style={styles.eyeIcon}
                    >
                      <Icon
                        name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                        size={20}
                        color="#666"
                      />
                    </TouchableOpacity>
                  </View>

                  {/* Password Rules */}
                  {showPasswordRules && (
                    <View style={styles.rulesContainer}>
                      {[
                        { rule: '8 characters', valid: checkRules.length },
                        { rule: '1 upper case & 1 lower case', valid: checkRules.upperLower },
                        { rule: '1 number', valid: checkRules.number },
                        { rule: 'No space', valid: checkRules.noSpace },
                        { rule: 'No more than 3 repeated characters', valid: checkRules.noRepeat },
                      ].map((item, index) => (
                        <View key={index} style={styles.ruleItemRow}>
                          <Icon
                            name={item.valid ? 'checkmark-circle' : 'ellipse-outline'}
                            size={14}
                            color={item.valid ? '#00b14f' : '#999'}
                            style={{ marginRight: 6 }}
                          />
                          <Text style={[styles.ruleItem, item.valid && { color: '#00b14f' }]}>
                            {item.rule}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Save toggle */}
                  <View style={styles.toggleRow}>
                    <Text style={styles.checkboxLabel}>Save this as my login information</Text>
                    <Switch
                      value={savePassword}
                      onValueChange={setSavePassword}
                      trackColor={{ false: '#aaa', true: '#00b14f' }}
                      thumbColor="#fff"
                    />
                  </View>
                </View>
              </View>
            </ScrollView>

            {/* Sticky Button */}
            <View style={styles.bottomSticky}>
              <TouchableOpacity
                style={isFormValid ? styles.continueButton : styles.continueButtonDisabled}
                onPress={handleContinue}
                disabled={!isFormValid}
              >
                <Text style={isFormValid ? styles.continueButtonText : styles.continueTextDisabled}>
                  Continue
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff' },
  container: { flex: 1 },
  scrollContainer: { paddingHorizontal: 20 },
  inner: { flex: 1 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#1A1D1F', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 24 },
  form: { flexGrow: 1 },
  label: { marginBottom: 6, fontSize: 14, color: '#333' },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderRadius: 15, paddingHorizontal: 10,
    marginBottom: 16, height: 50,
  },
  inputField: { flex: 1, fontSize: 14, paddingVertical: 10 },
  passwordContainer: {
    flexDirection: 'row', borderWidth: 1, borderRadius: 15, alignItems: 'center',
    paddingHorizontal: 10, paddingRight: 14, marginBottom: 16, height: 50,
  },
  passwordInput: { flex: 1, fontSize: 14, paddingVertical: 10, paddingRight: 8 },
  eyeIcon: { padding: 4 },
  rulesContainer: { marginBottom: 20 },
  ruleItemRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  ruleItem: { fontSize: 12, color: '#555' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 },
  checkboxLabel: { fontSize: 14, opacity: 0.7, flex: 1, paddingRight: 10 },
  bottomSticky: {
    padding: 24, backgroundColor: '#fff',
    borderTopWidth: 1, borderTopColor: '#eee',
  },
  continueButton: {
    backgroundColor: '#00b14f', paddingVertical: 14, borderRadius: 30,
    alignItems: 'center', justifyContent: 'center', width: '100%', marginBottom: 6,
    elevation: 15,
  },
  continueButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  continueButtonDisabled: {
    backgroundColor: '#eee', paddingVertical: 14, borderRadius: 30,
    alignItems: 'center', justifyContent: 'center', width: '100%',
  },
  continueTextDisabled: { color: '#aaa', fontSize: 16, fontWeight: '600' },
});
