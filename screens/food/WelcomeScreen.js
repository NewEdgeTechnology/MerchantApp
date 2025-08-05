import 'react-native-gesture-handler';
import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  SafeAreaView,
  StatusBar,
  Dimensions,
  Modal,
  Pressable,
  TouchableWithoutFeedback,
} from 'react-native';
import Carousel from 'react-native-reanimated-carousel';

const { width } = Dimensions.get('window');

const slides = [
  {
    image: require('../../assets/shop.png'),
    title: 'Reach millions of customers',
    description:
      'Expand your business offering with delivery, pickup, cashless payments, and more.',
  },
  {
    image: require('../../assets/shop.png'),
    title: 'Accelerate your business growth',
    description: 'Get access to all the tools to run and grow your business, in one place.',
  },
  {
    image: require('../../assets/shop.png'),
    title: 'Be our merchant-partner today',
    description: 'Signing up is simple, and you can get onboard in as little as 3 working days.',
  },
];

const DOT_SIZE = 8;
const DOT_MARGIN = 5;

export default function WelcomeScreen({ navigation }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const carouselRef = useRef(null);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logo}>
          <Text style={{ color: '#00b14f', fontWeight: 'bold' }}>Grab</Text>
          <Text style={{ color: '#00b14f' }}>Merchant</Text>
        </Text>

        {/* Country Selector */}
        <TouchableOpacity
          style={styles.countrySelector}
          onPress={() => setShowDropdown(prev => !prev)}
        >
          <Image source={{ uri: 'https://flagcdn.com/w40/sg.png' }} style={styles.flag} />
          <Text style={styles.countryText}>Singapore</Text>
          <Image source={require('../../assets/arrow-down.png')} style={styles.dropdownIcon} />
        </TouchableOpacity>
      </View>

      {/* Country Dropdown Modal */}
      <Modal
        visible={showDropdown}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDropdown(false)}
      >
        {/* Clicking outside closes the modal */}
        <Pressable style={styles.modalOverlay} onPress={() => setShowDropdown(false)}>
          {/* Prevent closing when clicking inside dropdown */}
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <View style={styles.dropdownMenu}>
              <TouchableOpacity style={styles.dropdownItem}>
                <Image source={{ uri: 'https://flagcdn.com/w40/sg.png' }} style={styles.flag} />
                <Text style={styles.dropdownText}>Singapore</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.dropdownItem}>
                <Image source={{ uri: 'https://flagcdn.com/w40/my.png' }} style={styles.flag} />
                <Text style={styles.dropdownText}>Malaysia</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.dropdownItem}>
                <Image source={{ uri: 'https://flagcdn.com/w40/id.png' }} style={styles.flag} />
                <Text style={styles.dropdownText}>Indonesia</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.dropdownItem}>
                <Image source={{ uri: 'https://flagcdn.com/w40/ph.png' }} style={styles.flag} />
                <Text style={styles.dropdownText}>Philippines</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.dropdownItem}>
                <Image source={{ uri: 'https://flagcdn.com/w40/th.png' }} style={styles.flag} />
                <Text style={styles.dropdownText}>Thailand</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.dropdownItem}>
                <Image source={{ uri: 'https://flagcdn.com/w40/vn.png' }} style={styles.flag} />
                <Text style={styles.dropdownText}>Vietnam</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.dropdownItem}>
                <Image source={{ uri: 'https://flagcdn.com/w40/mm.png' }} style={styles.flag} />
                <Text style={styles.dropdownText}>Myanmar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.dropdownItem}>
                <Image source={{ uri: 'https://flagcdn.com/w40/kh.png' }} style={styles.flag} />
                <Text style={styles.dropdownText}>Cambodia</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </Pressable>
      </Modal>

      <Text style={styles.version}>v 4.134.0</Text>

      {/* Carousel */}
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

      {/* Dot indicators */}
      <View style={styles.dotWrapper}>
        <View style={styles.dots}>
          {slides.map((_, index) => (
            <View key={index} style={[styles.dot, activeIndex === index && styles.activeDot]} />
          ))}
        </View>
      </View>

      {/* Buttons */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={styles.signUpBtn}
          onPress={() => navigation.navigate('SignUp')}
        >
          <Text style={styles.signUpText}>Sign Up</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.logInBtn}
          onPress={() => navigation.navigate('LogIn')}
        >
          <Text style={styles.logInText}>Log In</Text>
        </TouchableOpacity>
      </View>

      {/* Terms */}
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
    width: '100%',
    height: '100%',
  },
  dropdownMenu: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    height: '50%', // half screen height
    width: '100%',
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
