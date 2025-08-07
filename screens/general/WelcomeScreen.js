import 'react-native-gesture-handler';
import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  SafeAreaView,
  StatusBar,
  Dimensions,
} from 'react-native';
import Carousel from 'react-native-reanimated-carousel';
import { useNavigation } from '@react-navigation/native';

import OverlayDropdown from './OverlayDropdown';

const { width } = Dimensions.get('window');

const slides = [
  {
    image: require('../../assets/shop.png'),
    title: 'Reach millions of customers',
    description: 'Expand your business offering with delivery, pickup, cashless payments, and more.',
  },
  {
    image: require('../../assets/business.png'),
    title: 'Accelerate your business growth',
    description: 'Get access to all the tools to run and grow your business, in one place.',
  },
  {
    image: require('../../assets/partner.png'),
    title: 'Be our merchant-partner today',
    description: 'Signing up is simple, and you can get onboard in as little as 3 working days.',
  },
];

const DOT_SIZE = 8;
const DOT_MARGIN = 5;

export default function WelcomeScreen() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState({
    name: 'Singapore',
    code: 'sg',
    timestamp: Date.now()
  });
  const carouselRef = useRef(null);
  const navigation = useNavigation();

  const countries = [
    { name: 'Singapore', code: 'sg' },
    { name: 'Malaysia', code: 'my' },
    { name: 'Indonesia', code: 'id' },
    { name: 'Philippines', code: 'ph' },
    { name: 'Thailand', code: 'th' },
    { name: 'Vietnam', code: 'vn' },
    { name: 'Myanmar', code: 'mm' },
    { name: 'Cambodia', code: 'kh' },
  ];

  const handleSelectCountry = useCallback((country) => {
    setSelectedCountry({
      ...country,
      timestamp: Date.now()
    });
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      <View style={styles.header}>
        <Text style={styles.logo}>
          <Text style={{ color: '#00b14f', fontWeight: 'bold' }}>Grab</Text>
          <Text style={{ color: '#00b14f' }}>Merchant</Text>
        </Text>

        <TouchableOpacity
          style={styles.countrySelector}
          onPress={() => setShowDropdown(true)}
        >
          <Image
            source={{ 
              uri: `https://flagcdn.com/w40/${selectedCountry.code}.png?ts=${selectedCountry.timestamp}`,
              cache: 'reload'
            }}
            style={styles.flag}
            key={selectedCountry.code}
            onError={(e) => console.log('Flag load error:', e.nativeEvent.error)}
          />
          <Text style={styles.countryText}>{selectedCountry.name}</Text>
          <Image
            source={require('../../assets/arrow-down.png')}
            style={styles.dropdownIcon}
          />
        </TouchableOpacity>
      </View>

      <OverlayDropdown
        visible={showDropdown}
        onClose={() => setShowDropdown(false)}
        countries={countries}
        selectedCountry={selectedCountry}
        onSelect={handleSelectCountry}
      />

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
              {item.description && <Text style={styles.description}>{item.description}</Text>}
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
        <TouchableOpacity
          style={styles.signUpBtn}
          onPress={() => navigation.navigate('OnboardingScreen')}
        >
          <Text style={styles.signUpText}>Sign Up</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.logInBtn}
          onPress={() => navigation.navigate('LoginScreen')}
        >
          <Text style={styles.logInText}>Log In</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.bottomContent}>
        <Text style={styles.terms}>
          I have read, understood and accepted the{' '}
          <Text style={styles.link}>Terms of Service</Text> and the{' '}
          <Text style={styles.link}>Privacy Policy</Text>.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 20,
  },
  header: {
    paddingTop: 30,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logo: { fontSize: 20 },
  version: { fontSize: 12, color: '#888', marginTop: -5 },

  countrySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#c9c3b1ff',
    gap: 8,
  },
  flag: {
    width: 24,
    height: 16,
    borderColor: '#ccc',
    borderRadius: 3,
    borderWidth: 1,
  },
  countryText: { fontSize: 14 },
  dropdownIcon: {
    width: 12,
    height: 12,
    marginLeft: 6,
    resizeMode: 'contain',
    tintColor: '#444',
  },

  carouselContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  slide: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 240,
    marginTop: 30,
  },
  image: {
    width: 320,
    height: 220,
    marginBottom: 15,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: -5,
  },
  description: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 9,
    paddingHorizontal: 10,
    lineHeight: 20,
  },

  dotWrapper: {
    marginTop: -10,
    marginBottom: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    marginHorizontal: DOT_MARGIN,
    borderWidth: 1,
    borderColor: '#ccc',
    backgroundColor: 'white',
  },
  activeDot: {
    backgroundColor: '#ccc',
    borderColor: '#ccc',
  },

  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    gap: 20,
    marginTop: 10,
  },
  signUpBtn: {
    backgroundColor: '#edf8faff',
    paddingVertical: 16,
    paddingHorizontal: 50,
    borderRadius: 30,
  },
  logInBtn: {
    backgroundColor: '#00b14f',
    paddingVertical: 16,
    paddingHorizontal: 50,
    borderRadius: 30,
  },
  signUpText: {
    color: '#000',
    fontSize: 16,
  },
  logInText: {
    color: '#fff',
    fontSize: 16,
  },
  bottomContent: {
    marginTop: 20,
    paddingBottom: 30,
  },
  terms: {
    fontSize: 12.5,
    textAlign: 'center',
    color: '#888',
  },
  link: {
    color: '#417fa2ff',
  },

  // Dropdown overlay styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  dropdownMenu: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
    maxHeight: '60%',
    width: '100%',
  },
  dropdownTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  dropdownText: {
    fontSize: 16,
    marginLeft: 10,
  },
});
