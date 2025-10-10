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
import { Ionicons, Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

const EmailSentScreen = () => {
  const navigation = useNavigation();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="close" size={28} color="#000" />
        </TouchableOpacity>
      </View>

      {/* Main content */}
      <View style={styles.content}>
        <Text style={styles.title}>We've emailed you your username</Text>
        <Text style={styles.subtitle}>
          Check your spam or junk folder, or contact your email admin.
        </Text>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerTitle}>Didn't receive the email?</Text>
        <Text style={styles.footerSubtitle}>
          Check your spam or junk folder, or contact your email admin.
        </Text>

        <TouchableOpacity
          style={styles.helpButton}
          onPress={() => navigation.navigate('HelpScreen')}
        >
          <Icon name="help-circle-outline" size={24} color="#1A1D1F" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

export default EmailSentScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: Platform.OS === 'android' ? 24 : 0,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 30,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
    marginBottom: 2,
    paddingVertical: 20,
    marginTop:-45,
    opacity:0.7,
  },
  subtitle: {
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
  },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 70,
  },
  footerTitle: {
    fontWeight: '600',
    fontSize: 15,
    color: '#000',
    marginBottom: 8,
  },
  footerSubtitle: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
    marginBottom: 12,
  },
});
