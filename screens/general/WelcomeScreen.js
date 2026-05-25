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
    image: require("../../assets/shop.png"),
    tag: "GROW",
    title: "Reach Thousands of Customers",
    description:
      "Expand your business with delivery, pickup, cashless payments, and more.",
    accent: BRAND.purple,
    gradStart: "#F3E6FF",
    gradEnd: "#FAF5FF",
  },
  {
    image: require("../../assets/business.png"),
    tag: "SCALE",
    title: "Accelerate Your Business Growth",
    description:
      "Get all the tools to run and grow your business in one place.",
    accent: BRAND.magenta,
    gradStart: "#FFE6F5",
    gradEnd: "#FFF5FB",
  },
  {
    image: require("../../assets/partner.png"),
    tag: "JOIN",
    title: "Be Our Merchant-Partner Today",
    description:
      "Signing up is simple — get onboard in as little as 3 working days.",
    accent: BRAND.amber,
    gradStart: "#FFF3D6",
    gradEnd: "#FFFAF0",
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
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="light-content"
      />

      {/* Background gradient */}
      <LinearGradient
        colors={[BRAND.purple, BRAND.magenta, BRAND.purple]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Soft decorative blobs */}
      <View style={styles.blobTR} pointerEvents="none" />
      <View style={styles.blobBL} pointerEvents="none" />

      <SafeAreaView style={styles.safe} edges={["left", "right"]}>
        {/* ── HEADER ─────────────────────────────────────── */}
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <View>
            <Text style={styles.logoText}>
              Tàb<Text style={styles.logoPink}>dey</Text>
            </Text>
            <Text style={styles.logoSub}>MERCHANT PARTNER</Text>
          </View>

          <TouchableOpacity style={styles.countryChip} activeOpacity={0.8}>
            <Image
              key={selectedCountry.code}
              source={{
                uri: `https://flagcdn.com/w40/${selectedCountry.code}.png?ts=${selectedCountry.timestamp}`,
              }}
              style={styles.flag}
            />
            <Text style={styles.countryText}>{selectedCountry.name}</Text>
          </TouchableOpacity>
        </View>

        <View
          style={[
            styles.card,
            {
              backgroundColor: slide.gradEnd,
              paddingBottom: insets.bottom + 16,
            },
          ]}
        >
          {/* Handle bar */}
          <View style={[styles.handle, { backgroundColor: slide.accent }]} />

          {/* ── CAROUSEL ─────────────────────────────────── */}
          <Carousel
            ref={carouselRef}
            width={width}
            height={height * 0.62}
            autoPlay
            autoPlayInterval={4500}
            loop
            data={slides}
            onSnapToItem={setActiveIndex}
            renderItem={({ item }) => (
              <View style={styles.slide}>
                {/* Image card — tinted bg, image fills it naturally */}
                <LinearGradient
                  colors={[item.gradStart, item.gradEnd]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.imageCard}
                >
                  {/* Accent pill tag */}
                  <View style={[styles.tag, { backgroundColor: item.accent }]}>
                    <Text style={styles.tagText}>{item.tag}</Text>
                  </View>

                  {/* Soft ring behind image */}
                  <View
                    style={[styles.ring, { borderColor: item.accent + "25" }]}
                  />

                  <Image
                    source={item.image}
                    style={styles.slideImage}
                    resizeMode="contain"
                  />
                </LinearGradient>

                {/* Text block directly below — no gap */}
                <Text style={styles.slideTitle}>{item.title}</Text>
                <Text style={styles.slideDesc}>{item.description}</Text>
              </View>
            )}
          />

          {/* ── DOTS ─────────────────────────────────────── */}
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

          {/* ── BUTTONS ──────────────────────────────────── */}
          <View style={styles.btnRow}>
            {/* Ghost */}
            <TouchableOpacity
              style={styles.btnGhost}
              onPress={() => navigation.navigate("OnboardingScreen")}
              activeOpacity={0.8}
            >
              <Text style={styles.btnGhostText}>Sign Up</Text>
            </TouchableOpacity>

            {/* Filled gradient */}
            <TouchableOpacity
              style={styles.btnPrimaryWrap}
              onPress={() => navigation.navigate("MobileLoginScreen")}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={[BRAND.purple, "#5500AA"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.btnPrimary}
              >
                <Text style={styles.btnPrimaryText}>Log In</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* ── TERMS ────────────────────────────────────── */}
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
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BRAND.purple },
  safe: { flex: 1 },

  // ── Blobs ─────────────────────────────────────────────────
  blobTR: {
    position: "absolute",
    top: -70,
    right: -70,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  blobBL: {
    position: "absolute",
    bottom: height * 0.35,
    left: -50,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(216,35,139,0.09)",
  },

  // ── Header ────────────────────────────────────────────────
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 18,
  },
  logoText: {
    fontFamily: FONT.header,
    fontWeight: "700",
    fontSize: 28,
    color: BRAND.white,
    letterSpacing: 0.4,
  },
  logoPink: {
    color: BRAND.purpleLight,
  },
  logoSub: {
    fontFamily: FONT.body,
    fontSize: 10,
    color: "rgba(255,255,255,0.5)",
    letterSpacing: 1.6,
    marginTop: 1,
  },
  countryChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: "rgba(247,174,248,0.3)",
    backgroundColor: "rgba(255,255,255,0.10)",
    gap: 7,
  },
  flag: { width: 22, height: 15, borderRadius: 2 },
  countryText: {
    fontFamily: FONT.body,
    fontSize: 13,
    color: BRAND.white,
    fontWeight: "500",
  },

  // ── Card ──────────────────────────────────────────────────
  card: {
    flex: 1,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingTop: 10,
    paddingBottom: 20,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 10,
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: 10,
  },

  // ── Slide ─────────────────────────────────────────────────
  slide: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingBottom: 20,
  },

  // Image card — rounded, tinted, fixed height
  imageCard: {
    borderRadius: 22,
    height: height * 0.3,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginBottom: 20,
  },
  ring: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 44,
    opacity: 0.55,
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
    width: width * 0.54,
    height: height * 0.22,
    zIndex: 1,
  },

  // Title & description sit directly under the image card
  slideTitle: {
    fontFamily: FONT.header,
    fontWeight: "700",
    fontSize: 20,
    color: BRAND.black,
    textAlign: "center",
    lineHeight: 27,
    marginBottom: 8,
    letterSpacing: 0.1,
  },
  slideDesc: {
    fontFamily: FONT.body,
    fontSize: 13.5,
    color: BRAND.grey,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 10,
  },

  // ── Dots ──────────────────────────────────────────────────
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginTop: -70,
    marginBottom: 26,
  },
  dot: {
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },

  // ── Buttons ───────────────────────────────────────────────
  btnRow: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    marginTop: "auto",
    marginBottom: 14,
  },
  btnGhost: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: BRAND.purple,
    borderRadius: RADIUS.pill,
    paddingVertical: 14,
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BRAND.white,
  },
  btnGhostText: {
    fontFamily: FONT.body,
    fontWeight: "600",
    fontSize: 15,
    color: BRAND.purple,
  },
  btnPrimaryWrap: {
    flex: 1,
    borderRadius: RADIUS.pill,
  },
  btnPrimary: {
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.pill,
    minHeight: 54,
  },
  btnPrimaryText: {
    fontFamily: FONT.body,
    fontWeight: "600",
    fontSize: 15,
    color: BRAND.white,
  },

  // ── Terms ─────────────────────────────────────────────────
  terms: {
    fontFamily: FONT.body,
    fontSize: 11.5,
    color: BRAND.grey,
    textAlign: "center",
    lineHeight: 17,
    paddingHorizontal: 28,
  },
  termsLink: {
    fontFamily: FONT.body,
    fontWeight: "600",
    color: BRAND.magenta,
  },
});
