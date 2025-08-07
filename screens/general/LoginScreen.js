import React, { useState } from 'react';
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
} from 'react-native';
import CheckBox from 'expo-checkbox';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';

const LoginScreen = () => {
  const navigation = useNavigation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [savePassword, setSavePassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isUsernameFocused, setIsUsernameFocused] = useState(false);
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.inner}>
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
                <Text style={styles.icon}>←</Text>
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Log In</Text>
              <TouchableOpacity onPress={() => navigation.navigate('HelpScreen')} style={styles.iconButton}>
                <Icon name="help-circle-outline" size={24} color="#1A1D1F" />
              </TouchableOpacity>
            </View>

            {/* Form */}
            <View style={styles.form}>
              <Text style={styles.label}>Enter your username</Text>
              <View style={[
                styles.inputWrapper,
                { borderColor: isUsernameFocused ? '#00b14f' : '#ccc' }
              ]}>
                <TextInput
                  style={styles.inputField}
                  placeholder={isUsernameFocused ? '' : 'Enter your username'}
                  value={username}
                  onChangeText={setUsername}
                  onFocus={() => setIsUsernameFocused(true)}
                  onBlur={() => setIsUsernameFocused(false)}
                />
                {username.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setUsername('')}
                    style={styles.clearButton}
                  >
                    <View style={styles.clearCircle}>
                      <Icon name="close" size={14} color="#fff" />
                    </View>
                  </TouchableOpacity>
                )}
              </View>

              <Text style={styles.label}>Password</Text>
              <View style={[
                styles.passwordContainer,
                { borderColor: isPasswordFocused ? '#00b14f' : '#ccc' },
                isPasswordFocused && styles.shadowGreen,
              ]}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder={isPasswordFocused ? '' : 'Enter password'}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  onFocus={() => setIsPasswordFocused(true)}
                  onBlur={() => setIsPasswordFocused(false)}
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

              <View style={styles.checkboxContainer}>
                <CheckBox
                  value={savePassword}
                  onValueChange={setSavePassword}
                  tintColors={{ true: '#00b14f', false: '#aaa' }}
                />
                <Text style={styles.checkboxLabel}>Save password</Text>
              </View>
            </View>

            {/* Footer */}
            <View style={styles.footer}>
              <Text style={styles.forgotText}>
                Forgot your <Text style={styles.link}>username</Text> or <Text style={styles.link}>password</Text>?
              </Text>

              <TouchableOpacity style={styles.loginButtonDisabled} disabled>
                <Text style={styles.loginButtonTextDisabled}>Log In</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.loginPhoneButton}>
                <Text style={styles.loginPhoneText}>Log In with Phone</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
};

export default LoginScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContainer: {
    flexGrow: 1,
  },
  inner: {
    flex: 1,
    justifyContent: 'space-between',
    padding: 20,
    paddingTop: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  iconButton: {
    padding: 8,
  },
  
  icon: {
    fontSize: 24,
    color: '#1A1D1F',
    fontFamily: 'Inter-Regular',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#1A1D1F',
    marginRight:180,
  },
  form: {
    flexGrow: 1,
    padding:8,
  },
  label: {
    marginBottom: 6,
    fontSize: 14,
    color: '#333',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 10,
    marginBottom: 16,
    height:50,
  },
  inputField: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 10,
  },
  clearButton: {
    paddingLeft: 8,
  },
  clearCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#000',
    opacity: 0.7,
    justifyContent: 'center',
    alignItems: 'center',
  },
  passwordContainer: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 15,
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingRight: 14,
    marginBottom: 16,
    height:50,
  },
  passwordInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 10,
    paddingRight: 8,
  },
  eyeIcon: {
    padding: 4,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    marginTop:10,
  },
  checkboxLabel: {
    marginLeft: 8,
    fontSize: 14,
    opacity:0.7,
  },
  forgotText: {
    textAlign: 'center',
    fontSize: 14,
    color: '#333',
    opacity: 0.7,
    marginBottom: 16,
  },
  link: {
    color: '#007AFF',
    fontWeight: '500',
  },
  loginButtonDisabled: {
    backgroundColor: '#eee',
    paddingVertical: 14,
    borderRadius: 25,
    alignItems: 'center',
    marginBottom: 10,
  },
  loginButtonTextDisabled: {
    color: '#aaa',
    fontSize: 16,
    fontWeight: '500',
  },
  loginPhoneButton: {
    backgroundColor: '#e9fcf6',
    paddingVertical: 14,
    borderRadius: 25,
    alignItems: 'center',
  },
  loginPhoneText: {
    color: '#004d3f',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    // paddingTop: 20,
    marginBottom:20,
  },
});
