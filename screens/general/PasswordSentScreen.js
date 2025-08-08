import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';

const PasswordSentScreen = () => {
  const navigation = useNavigation();

  const maskedEmail = 'cho****@yah******'; // replace with dynamic email if needed

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="close" size={28} color="#000" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('HelpScreen')}>
          <Icon name="help-circle-outline" size={24} color="#000" />
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View style={styles.content}>
        <Text style={styles.title}>
          Temporary password sent to {maskedEmail}
        </Text>
        <Text style={styles.subtitle}>
          We’ll email you a temporary password and a link to set a new password.
        </Text>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerTitle}>Didn't receive the email?</Text>
        <Text style={styles.footerSubtitle}>
          Check your spam or junk folder, or contact your email admin.
        </Text>

        <TouchableOpacity
          style={styles.loginButton}
          onPress={() => navigation.navigate('LoginScreen')}
        >
          <Text style={styles.loginButtonText}>Back to Login</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

export default PasswordSentScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: Platform.OS === 'android' ? 24 : 0,
  },
  header: {
    paddingHorizontal: 20,
    // paddingTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 30,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#000',
    marginBottom: 14,
    lineHeight: 30,
  },
  subtitle: {
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
  },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  footerTitle: {
    fontWeight: '600',
    fontSize: 16,
    color: '#000',
    marginBottom: 10,
  },
  footerSubtitle: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
    marginBottom: 40,
  },
  loginButton: {
    backgroundColor: '#00b14f',
    paddingVertical: 16,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
});
