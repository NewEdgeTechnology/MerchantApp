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
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';

const ResetPasswordScreen = () => {
  const navigation = useNavigation();
  const [username, setUsername] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  const isValidUsername = username.trim().length > 0;

  const handleClear = () => {
    setUsername('');
  };

//   const handleNext = () => {
//     // console.log('Reset password for:', username);
//     navigation.navigate('PasswordSentScreen');
//   };

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
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
              <Text style={styles.icon}>←</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('HelpScreen')} style={styles.iconButton}>
              <Icon name="help-circle-outline" size={24} color="#1A1D1F" />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <View style={styles.content}>
            <Text style={styles.title}>Reset password</Text>
            <Text style={styles.subtitle}>
              We’ll email you a temporary password and a link to set a new password.
            </Text>

            {/* Username Input */}
            <Text style={styles.label}>Enter your username</Text>
            <View
              style={[
                styles.inputWrapper,
                {
                  borderColor: isFocused ? '#00b14f' : '#E5E7EB',
                  borderWidth: 1.5,
                },
              ]}
            >
              <TextInput
                style={styles.input}
                value={username}
                onChangeText={setUsername}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
              />
              {username.length > 0 && (
                <TouchableOpacity onPress={handleClear} style={styles.clearButton}>
                  <Icon name="close-circle" size={20} color="#aaa" />
                </TouchableOpacity>
              )}
            </View>

            {/* Mobile instead link */}
            <TouchableOpacity>
              <Text style={styles.link}
              onPress={() => navigation.navigate('ResetPasswordNumber')}
              >Use mobile number instead</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Bottom Section */}
        <View style={styles.bottomSticky}>
          <TouchableOpacity
          onPress={() => navigation.navigate('ForgotUsername')}>
            <Text style={styles.bottomLink}>Forgot your username?</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={isValidUsername ? styles.submitButton : styles.submitButtonDisabled}
            onPress={() => navigation.navigate('PasswordSentScreen')}
            disabled={!isValidUsername}
          >
            <Text style={isValidUsername ? styles.submitButtonText : styles.submitTextDisabled}>
              Next
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default ResetPasswordScreen;

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
  label: {
    fontSize: 14,
    marginBottom: 6,
    color: '#333',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingHorizontal: 15,
    paddingVertical: 5,
    borderRadius: 12,
    marginBottom: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#1A1D1F',
    fontWeight: '400',
  },
  clearButton: {
    paddingLeft: 10,
  },
  link: {
    color: '#007bff',
    fontSize: 14,
    marginTop: 10,
    fontWeight:'bold',
    opacity:0.9,
  },
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
    fontWeight:'bold',
    opacity:0.9,
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
});
