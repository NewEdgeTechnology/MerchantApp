// screens/general/WelcomeScreen.js
import 'react-native-gesture-handler';
import React, { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Image, StatusBar, Dimensions, Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Carousel from 'react-native-reanimated-carousel';
import { useNavigation } from '@react-navigation/native';

const { width } = Dimensions.get('window');

const slides = [
  { image: require('../../assets/shop.png'), title: 'Reach Thousands of customers',
    description: 'Expand your business offering with delivery, pickup, cashless payments, and more.' },
  { image: require('../../assets/business.png'), title: 'Accelerate your business growth',
    description: 'Get access to all the tools to run and grow your business, in one place.' },
  { image: require('../../assets/partner.png'), title: 'Be our merchant-partner today',
    description: 'Signing up is simple, and you can get onboard in as little as 3 working days.' },
];

const DOT_SIZE = 8;
const DOT_MARGIN = 5;

export default function WelcomeScreen() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedCountry] = useState({
    name: 'Bhutan',
    code: 'bt',
    timestamp: Date.now(),
  });

  const carouselRef = useRef(null);
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  // 👉 Add link handlers (only addition)
  const openTerms = () => navigation.navigate('TermsOfService');
  const openPrivacy = () => navigation.navigate('PrivacyPolicy');

  return (
    <SafeAreaView style={styles.container} edges={['left','right']}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Text style={styles.logo}>
          <Text style={{ color: '#00b14f', fontWeight: 'bold' }}>Grab</Text>
          <Text style={{ color: '#00b14f' }}>Merchant</Text>
        </Text>

        <TouchableOpacity style={styles.countrySelector} activeOpacity={1}>
          <Image
            source={{ uri: `https://flagcdn.com/w40/${selectedCountry.code}.png?ts=${selectedCountry.timestamp}` }}
            style={styles.flag}
            key={selectedCountry.code}
          />
          <Text style={styles.countryText}>{selectedCountry.name}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.version}>v 4.134.0</Text>

      <View style={styles.carouselContainer}>
        <Carousel
          ref={carouselRef}
          width={width - 40}
          height={300}
          autoPlay
          autoPlayInterval={5000}
          loop
          data={slides}
          onSnapToItem={(index) => setActiveIndex(index)}
          renderItem={({ item }) => (
            <View style={styles.slide}>
              <Image source={item.image} style={styles.image} resizeMode="contain" />
              <Text style={styles.title}>{item.title}</Text>
              {!!item.description && <Text style={styles.description}>{item.description}</Text>}
            </View>
          )}
        />
      </View>

      <View style={styles.dotWrapper}>
        <View style={styles.dots}>
          {slides.map((_, index) => (
            <View key={index} style={[styles.dot, activeIndex === index && styles.activeDot]} />
          ))}
        </View>
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.signUpBtn} onPress={() => navigation.navigate('OnboardingScreen')}>
          <Text style={styles.signUpText}>Sign Up</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.logInBtn} onPress={() => navigation.navigate('LoginScreen')}>
          <Text style={styles.logInText}>Log In</Text>
        </TouchableOpacity>
      </View>

      {/* Footer with tappable links */}
      <View style={[styles.bottomContent, { paddingBottom: (insets.bottom || 0) + 30 }]}>
        <Text style={styles.terms}>
          I have read, understood and accepted the{' '}
          <Text style={styles.link} onPress={openTerms}>Terms of Service</Text> and the{' '}
          <Text style={styles.link} onPress={openPrivacy}>Privacy Policy</Text>.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logo: { fontSize: 20 },
  version: { fontSize: 12, color: '#888', marginTop: -5, paddingHorizontal: 20 },
  countrySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#c9c3b1ff',
    gap: 8,
    backgroundColor: '#fff',
  },
  flag: { width: 24, height: 16, borderColor: '#ccc', borderRadius: 3, borderWidth: 1 },
  countryText: { fontSize: 14 },
  carouselContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  slide: { alignItems: 'center', justifyContent: 'center', height: 240, marginTop: 30 },
  image: { width: 320, height: 220, marginBottom: 15 },
  title: { fontSize: 17, fontWeight: '600', textAlign: 'center', marginTop: -5 },
  description: { fontSize: 14, color: '#666', textAlign: 'center', marginTop: 9, paddingHorizontal: 10, lineHeight: 20 },
  dotWrapper: { marginTop: -10, marginBottom: 60, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center' },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    marginHorizontal: DOT_MARGIN,
    borderWidth: 1,
    borderColor: '#ccc',
    backgroundColor: 'white',
  },
  activeDot: { backgroundColor: '#ccc', borderColor: '#ccc' },
  buttonContainer: { flexDirection: 'row', justifyContent: 'space-evenly', gap: 20, marginTop: 10, paddingHorizontal: 20 },
  signUpBtn: { backgroundColor: '#edf8faff', paddingVertical: 16, paddingHorizontal: 50, borderRadius: 30 },
  logInBtn: { backgroundColor: '#00b14f', paddingVertical: 16, paddingHorizontal: 50, borderRadius: 30 },
  signUpText: { color: '#000', fontSize: 16 },
  logInText: { color: '#fff', fontSize: 16 },
  bottomContent: { marginTop: 20, paddingHorizontal: 20 },
  terms: { fontSize: 12.5, textAlign: 'center', color: '#888' },
  link: { color: '#417fa2ff' },
});
