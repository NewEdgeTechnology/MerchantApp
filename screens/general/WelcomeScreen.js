// screens/general/WelcomeScreen.js
// 📦 requires: npx expo install expo-linear-gradient

import "react-native-gesture-handler";
import React, { useState, useRef } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { BRAND, FONT, RADIUS, SHADOW } from "../styles/tabdey_brand";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  StatusBar,
  Dimensions,
  ScrollView,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import Carousel from "react-native-reanimated-carousel";
import { useNavigation } from "@react-navigation/native";

const { width, height } = Dimensions.get("window");

const slides = [
  {
    image: require("../../assets/Reach your Customers.png"),
    tag: "GROW",
    title: "Reach Thousands of Customers",
    description:
      "Expand your business with delivery, pickup, cashless payments, and more.",
    accent: BRAND.purple,
    // gradStart: "#F3E6FF",
    // gradEnd: "#FAF5FF",
  },
  {
    image: require("../../assets/Accelerate your Business.png"),
    tag: "SCALE",
    title: "Accelerate Your Business Growth",
    description:
      "Get all the tools to run and grow your business in one place.",
    accent: BRAND.magenta,
    // gradStart: "#FFE6F5",
    // gradEnd: "#FFF5FB",
  },
  {
    image: require("../../assets/Be Our Partner.png"),
    tag: "JOIN",
    title: "Be Our Merchant-Partner Today",
    description:
      "Signing up is simple — get onboard in as little as 3 working days.",
    accent: BRAND.amber,
    // gradStart: "#FFF3D6",
    // gradEnd: "#FFFAF0",
  },
];

const DOT_SIZE = 7;

export default function WelcomeScreen() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedCountry] = useState({
    name: "Bhutan",
    code: "bt",
    timestamp: Date.now(),
  });
  const carouselRef = useRef(null);
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const openTerms = () => navigation.navigate("TermsOfService");
  const openPrivacy = () => navigation.navigate("PrivacyPolicy");

  const slide = slides[activeIndex] ?? slides[0];

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#FBF7FF" />
      <View style={styles.topGlow} />

      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { minHeight: height - insets.top - insets.bottom },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.inner}>
            <View style={styles.header}>
              <View style={styles.brandBlock}>
                <Text style={styles.brandTitle}>
                  Tàbdey <Text style={styles.brandAccent}>Merchant</Text>
                </Text>
                <Text style={styles.brandLabel}>MERCHANT PARTNER APP</Text>
                <Text style={styles.brandSubtitle}>
                  Start selling, managing orders and growing your business with
                  Tàbdey.
                </Text>
              </View>

              <TouchableOpacity style={styles.countryChip} activeOpacity={0.8}>
                <Image
                  source={{
                    uri: `https://flagcdn.com/w40/${selectedCountry.code}.png?ts=${selectedCountry.timestamp}`,
                  }}
                  style={styles.flag}
                />
                <Text style={styles.countryText}>{selectedCountry.name}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.carouselCard}>
              <Carousel
                ref={carouselRef}
                width={width - 44}
                height={Math.min(height * 0.4, 430)}
                autoPlay
                autoPlayInterval={4500}
                loop
                data={slides}
                onSnapToItem={setActiveIndex}
                renderItem={({ item }) => (
                  <View style={styles.slide}>
                    <View style={styles.imageCard}>
                      <View
                        style={[styles.tag, { backgroundColor: item.accent }]}
                      >
                        <Text style={styles.tagText}>{item.tag}</Text>
                      </View>

                      <View
                        style={[
                          styles.circle,
                          { backgroundColor: item.accent + "33" },
                        ]}
                      />

                      <Image
                        source={item.image}
                        style={styles.slideImage}
                        resizeMode="contain"
                      />
                    </View>

                    <Text style={styles.slideTitle}>{item.title}</Text>
                    <Text style={styles.slideDesc}>{item.description}</Text>
                  </View>
                )}
              />

              <View style={styles.dotsRow}>
                {slides.map((s, i) => (
                  <View
                    key={i}
                    style={[
                      styles.dot,
                      i === activeIndex
                        ? { width: DOT_SIZE * 3, backgroundColor: slide.accent }
                        : { width: DOT_SIZE, backgroundColor: BRAND.greyLight },
                    ]}
                  />
                ))}
              </View>
            </View>

            <View
              style={[styles.footer, { paddingBottom: insets.bottom + 10 }]}
            >
              <TouchableOpacity
                style={styles.btnPrimary}
                onPress={() => navigation.navigate("MobileLoginScreen")}
                activeOpacity={0.85}
              >
                <Text style={styles.btnPrimaryText}>Log In</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.btnGhost}
                onPress={() => navigation.navigate("OnboardingScreen")}
                activeOpacity={0.85}
              >
                <Text style={styles.btnGhostText}>Create Merchant Account</Text>
              </TouchableOpacity>

              <Text style={styles.terms}>
                By continuing you accept our{" "}
                <Text style={styles.termsLink} onPress={openTerms}>
                  Terms of Service
                </Text>{" "}
                and{" "}
                <Text style={styles.termsLink} onPress={openPrivacy}>
                  Privacy Policy
                </Text>
                .
              </Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#FBF7FF",
  },

  safe: {
    flex: 1,
    paddingTop: 12,
  },
  scrollContent: {
    paddingBottom: 28,
  },
  topGlow: {
    position: "absolute",
    top: -120,
    right: -90,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: BRAND.purpleLight,
    opacity: 0.45,
  },

  inner: {
    flex: 1,
    paddingHorizontal: 30,
    justifyContent: "space-between",
  },

  header: {
    marginBottom: 18,
  },

  brandBlock: {
    flex: 1,
    paddingRight: 12,
  },

  brandTitle: {
    fontFamily: FONT.header,
    fontSize: 30,
    fontWeight: "800",
    color: BRAND.black,
    marginBottom: 6,
    paddingRight: 90,
  },

  brandAccent: {
    color: BRAND.purple,
  },

  brandLabel: {
    fontFamily: FONT.body,
    fontSize: 10.5,
    fontWeight: "800",
    letterSpacing: 1.4,
    color: BRAND.magenta,
    marginBottom: 8,
  },

  brandSubtitle: {
    fontFamily: FONT.body,
    fontSize: 14,
    lineHeight: 21,
    color: BRAND.grey,
    maxWidth: "92%",
  },

  countryChip: {
    position: "absolute",
    right: 0,
    top: 4,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
    backgroundColor: BRAND.white,
    gap: 6,
    ...SHADOW.sm,
  },
  flag: {
    width: 22,
    height: 15,
    borderRadius: 2,
  },

  countryText: {
    fontFamily: FONT.body,
    fontSize: 13,
    color: BRAND.black,
    fontWeight: "600",
  },

  carouselCard: {
    backgroundColor: BRAND.white,
    borderRadius: 28,
    paddingTop: 14,
    paddingBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(157,0,255,0.08)",
    ...SHADOW.sm,
  },

  slide: {
    flex: 1,
    paddingHorizontal: 18,
    alignItems: "center",
  },

  imageCard: {
    width: "100%",
    height: Math.min(height * 0.23, 250),
    borderRadius: 22,
    // backgroundColor: "#FCFCFC",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginBottom: 18,
  },

  circle: {
  position: "absolute",
  width: 190,
  height: 190,
  borderRadius: 105,
  opacity: 1,
  zIndex: 0,
},

  tag: {
    position: "absolute",
    top: 14,
    left: 14,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    zIndex: 2,
  },

  tagText: {
    fontFamily: FONT.body,
    fontSize: 10,
    fontWeight: "700",
    color: BRAND.white,
    letterSpacing: 1.3,
  },

  slideImage: {
  width: width * 0.48,
  height: height * 0.16,
  zIndex: 1,
},
  slideTitle: {
    fontFamily: FONT.header,
    fontWeight: "800",
    fontSize: 20,
    color: BRAND.black,
    textAlign: "center",
    lineHeight: 26,
    marginBottom: 6,
  },

  slideDesc: {
    fontFamily: FONT.body,
    fontSize: 13.5,
    color: BRAND.grey,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 10,
  },

  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 7,
    marginTop: 4,
  },

  dot: {
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },

  footer: {
    marginTop: 20,
  },

  btnPrimary: {
    backgroundColor: BRAND.purple,
    paddingVertical: 16,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    marginBottom: 12,
    ...SHADOW.md,
  },

  btnPrimaryText: {
    fontFamily: FONT.body,
    color: BRAND.white,
    fontSize: 16,
    fontWeight: "700",
  },

  btnGhost: {
    backgroundColor: BRAND.white,
    borderWidth: 1.5,
    borderColor: BRAND.purple,
    paddingVertical: 16,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    marginBottom: 16,
  },

  btnGhostText: {
    fontFamily: FONT.body,
    color: BRAND.purple,
    fontSize: 16,
    fontWeight: "700",
  },

  terms: {
    fontFamily: FONT.body,
    fontSize: 11.5,
    color: BRAND.grey,
    textAlign: "center",
    lineHeight: 17,
    paddingHorizontal: 20,
    marginTop: 2,
  },

  termsLink: {
    fontFamily: FONT.body,
    fontWeight: "700",
    color: BRAND.magenta,
  },
});
