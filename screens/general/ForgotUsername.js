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

const ForgotUsername = () => {
  const navigation = useNavigation();
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const isValidEmail = (email) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const handleEmailChange = (text) => {
    setEmail(text);
  };

  const handleClear = () => {
    setEmail('');
  };

  const handleLogin = () => {
    console.log('Login with:', email);
    navigation.navigate('EmailSentScreen');
  };

  const isButtonEnabled = isValidEmail(email);

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
            <Text style={styles.title}>Forgot your username?</Text>
            <Text style={styles.subtitle}>
              Enter the email address you signed up for Grab with to retrieve it.
            </Text>

            {/* Email Input */}
            <View style={styles.inputContainer}>
              <View
                style={[
                  styles.emailInputWrapper,
                  {
                    borderColor: isFocused ? '#00b14f' : '#E5E7EB',
                    borderWidth: 1.5,
                  },
                ]}
              >
                <TextInput
                  style={styles.emailInput}
                  value={email}
                  onChangeText={handleEmailChange}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  onFocus={() => {
                    setTouched(true);
                    setIsFocused(true);
                  }}
                  onBlur={() => setIsFocused(false)}
                />
                {email.length > 0 && (
                  <TouchableOpacity onPress={handleClear} style={styles.clearButton}>
                    <Icon name="close-circle" size={20} color="#aaa" />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </ScrollView>

        {/* Bottom Section with Button */}
        <View style={styles.bottomSticky}>
          <TouchableOpacity
            style={isButtonEnabled ? styles.submitButton : styles.submitButtonDisabled}
            onPress={handleLogin}
            disabled={!isButtonEnabled}
          >
            <Text style={isButtonEnabled ? styles.submitButtonText : styles.submitTextDisabled}>
              Submit
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default ForgotUsername;

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
  subtitle: {
    fontSize: 15,
    color: '#666',
    marginBottom: 24,
  },
  inputContainer: {
    marginBottom: 25,
    gap: 12,
  },
  emailInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingHorizontal: 15,
    paddingVertical: 5,
    borderRadius: 12,
  },
  emailInput: {
    flex: 1,
    fontSize: 16,
    color: '#1A1D1F',
    fontWeight: '400',
  },
  clearButton: {
    paddingLeft: 10,
  },
  bottomSticky: {
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'android' ? 20 : 20,
    borderRadius: 15,
    marginBottom:8,
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
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  submitTextDisabled: {
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
