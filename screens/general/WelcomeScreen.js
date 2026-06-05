// screens/general/WelcomeScreen.js

import "react-native-gesture-handler";
import React, { useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  StatusBar,
  Dimensions,
  Platform,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import Carousel from "react-native-reanimated-carousel";
import { useNavigation } from "@react-navigation/native";

import { BRAND, FONT, RADIUS } from "../styles/tabdey_brand";

const { width, height } = Dimensions.get("window");

const LOGO_URL =
  "https://backend.tabdhey.bt/admin/uploads/logo_and_image/logo_1780554371104_hlvv6tc34zr.webp";

const slides = [
  {
    image: require("../../assets/Reach your Customers.png"),
    title: "Reach your\nCustomers",
    description:
      "Expand your business with delivery, pickup, cashless payments, and more",
  },
  {
    image: require("../../assets/Accelerate your Business.png"),
    title: "Accelerate\nyour Business",
    description: "Get all the tools to run and grow your business in one place",
  },
  {
    image: require("../../assets/Be Our Partner.png"),
    title: "Be our\nPartner",
    description:
      "Signing up is simple — get onboard and start selling with TàbDey",
  },
];

const IS_SMALL = height < 700;
const IS_VERY_SMALL = height < 620;

const CARD_WIDTH = Math.min(width * 0.73, 390);
const CARD_HEIGHT = IS_VERY_SMALL
  ? height * 0.46
  : IS_SMALL
    ? height * 0.5
    : height * 0.52;

const BUTTON_WIDTH = CARD_WIDTH;
const BUTTON_HEIGHT = 48;

export default function WelcomeScreen() {
  const [activeIndex, setActiveIndex] = useState(0);
  const carouselRef = useRef(null);
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const openTerms = () => navigation.navigate("TermsOfService");
  const openPrivacy = () => navigation.navigate("PrivacyPolicy");

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={BRAND.white} />

      <SafeAreaView style={styles.safe}>
        <View
          style={[
            styles.container,
            {
              paddingBottom: Math.max(insets.bottom, 24),
            },
          ]}
        >
          {/* ── LOGO + MERCHANT BADGE ── */}
          <View style={styles.logoSection}>
            <Image
              source={{ uri: LOGO_URL }}
              style={styles.logo}
              resizeMode="contain"
            />
            <View style={styles.merchantBadgeWrap}>
              <View style={styles.merchantCutLeft} />

              <View style={styles.merchantBadgeCenter}>
                <Text style={styles.merchantText}>MERCHANT</Text>
              </View>

              <View style={styles.merchantCutRight} />
            </View>
            <Text style={styles.subtitle}>
              Start selling, managing orders and{"\n"}
              growing your business with TàbDey
            </Text>
          </View>

          {/* ── CAROUSEL ── */}
          <View style={styles.middleSection}>
            <View style={styles.carouselWrapper}>
              <Carousel
                ref={carouselRef}
                width={CARD_WIDTH}
                height={CARD_HEIGHT}
                autoPlay
                autoPlayInterval={4500}
                loop
                data={slides}
                onSnapToItem={setActiveIndex}
                renderItem={({ item }) => (
                  <View style={styles.slideCard}>
                    <Text style={styles.slideTitle}>{item.title}</Text>
                    <Image
                      source={item.image}
                      style={styles.slideImage}
                      resizeMode="contain"
                    />
                    <Text style={styles.slideDesc}>{item.description}</Text>
                  </View>
                )}
              />
            </View>

            <View style={styles.indicatorRow}>
              {slides.map((_, index) => {
                const active = index === activeIndex;
                const color = active ? BRAND.purple : BRAND.purpleLight;

                return (
                  <View
                    key={index}
                    style={[
                      styles.diamondBar,
                      !active && styles.diamondBarInactive,
                    ]}
                  >
                    <View
                      style={[
                        styles.diamondCutLeft,
                        { borderRightColor: color },
                      ]}
                    />
                    <View
                      style={[styles.diamondMiddle, { backgroundColor: color }]}
                    />
                    <View
                      style={[
                        styles.diamondCutRight,
                        { borderLeftColor: color },
                      ]}
                    />
                  </View>
                );
              })}
            </View>
          </View>

          {/* ── BUTTONS ── */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.btnPrimary}
              onPress={() => navigation.navigate("MobileLoginScreen")}
              activeOpacity={0.85}
            >
              <Text style={styles.btnPrimaryText}>Log In</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.btnSecondary}
              onPress={() => navigation.navigate("OnboardingScreen")}
              activeOpacity={0.85}
            >
              <Text style={styles.btnSecondaryText}>
                Create Merchant Account
              </Text>
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
            </Text>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BRAND.white },
  safe: { flex: 1, backgroundColor: BRAND.white },

  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    backgroundColor: BRAND.white,
  },

  // ── logo ──
  logoSection: {
    alignItems: "center",
  },

  logo: {
    width: 150,
    height: 65,
  },

  merchantBadgeWrap: {
    marginTop: -16,
    flexDirection: "row",
    alignItems: "center",
    height: 26,
    alignSelf: "center",
    transform: [{ translateX: width * 0.055 }],
  },

  merchantBadgeCenter: {
    height: 26,
    backgroundColor: BRAND.purple,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
  },

  merchantCutLeft: {
    width: 0,
    height: 0,
    borderBottomWidth: 26,
    borderBottomColor: BRAND.purple,
    borderLeftWidth: 6,
    borderLeftColor: "transparent",
    marginRight: -1,
  },

  merchantCutRight: {
    width: 0,
    height: 0,
    borderTopWidth: 26,
    borderTopColor: BRAND.purple,
    borderRightWidth: 6,
    borderRightColor: "transparent",
  },
  merchantText: {
    fontFamily: FONT.body,
    fontSize: 13,
    fontWeight: "800",
    fontStyle: "italic",
    color: BRAND.white,
    letterSpacing: 2,
  },

  subtitle: {
    marginTop: 18,
    fontFamily: FONT.body,
    fontSize: 14,
    fontWeight: "400",
    color: BRAND.black,
    textAlign: "center",
    lineHeight: 11 * 1.4,
    width: BUTTON_WIDTH,
  },

  middleSection: {
    alignItems: "center",
    marginTop: IS_VERY_SMALL ? 2 : 12,
  },

  carouselWrapper: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    overflow: "hidden",
  },

  slideCard: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    backgroundColor: BRAND.white,
    borderWidth: 1,
    borderColor: BRAND.purpleLight,
    borderRadius: 20,
    paddingTop: IS_VERY_SMALL ? 14 : 24,
    paddingHorizontal: IS_VERY_SMALL ? 18 : 26,
    paddingBottom: IS_VERY_SMALL ? 14 : 22,
    overflow: "hidden",
  },

  slideTitle: {
    fontFamily: FONT.body,
    fontSize: IS_VERY_SMALL ? 21 : IS_SMALL ? 23 : 26,
    fontWeight: "700",
    color: "#1a1a1a",
    lineHeight: IS_VERY_SMALL ? 25 : IS_SMALL ? 28 : 32,
    textAlign: "left",
  },

  slideImage: {
    width: CARD_WIDTH * 0.82,
    height: CARD_HEIGHT * 0.5,
    alignSelf: "center",
    marginTop: IS_VERY_SMALL ? 42 : 52,
    marginBottom: IS_VERY_SMALL ? 14 : 24,
  },

  slideDesc: {
    fontFamily: FONT.body,
    fontSize: IS_VERY_SMALL ? 12 : 14,
    fontWeight: "400",
    color: "#333333",
    lineHeight: IS_VERY_SMALL ? 16 : 19,
    textAlign: "left",
    lineHeight: 11 * 1.4,
  },

  indicatorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: IS_VERY_SMALL ? 8 : 14,
    marginBottom: IS_VERY_SMALL ? 8 : 14,
    height: 14,
  },

  diamondBar: {
    flexDirection: "row",
    alignItems: "center",
    height: 5,
  },

  diamondBarInactive: {
    opacity: 0.35,
  },

  diamondCutLeft: {
    width: 0,
    height: 0,
    borderTopWidth: 5,
    borderTopColor: "transparent",
    borderRightWidth: 5,
    borderBottomWidth: 0,
    borderBottomColor: "transparent",
  },

  diamondMiddle: {
    width: 24,
    height: 5,
  },

  diamondCutRight: {
    width: 0,
    height: 0,
    borderTopWidth: 0,
    borderTopColor: "transparent",
    borderLeftWidth: 5,
    borderBottomWidth: 5,
    borderBottomColor: "transparent",
  },

  // ── buttons ──
  actions: {
    alignItems: "center",
    width: "100%",
    marginTop: 22,
    paddingBottom: 0,
  },

  btnPrimary: {
    width: BUTTON_WIDTH,
    height: BUTTON_HEIGHT,
    borderRadius: RADIUS.pill,
    backgroundColor: BRAND.purple,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    shadowColor: BRAND.purple,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: Platform.OS === "android" ? 5 : 0,
  },

  btnPrimaryText: {
    fontFamily: FONT.body,
    fontSize: 16,
    fontWeight: "600",
    color: BRAND.white,
  },

  btnSecondary: {
    width: BUTTON_WIDTH,
    height: BUTTON_HEIGHT,
    borderRadius: RADIUS.pill,
    backgroundColor: BRAND.white,
    borderWidth: 1.5,
    borderColor: BRAND.purple,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },

  btnSecondaryText: {
    fontFamily: FONT.body,
    fontSize: 16,
    fontWeight: "500",
    color: BRAND.purple,
  },

  terms: {
    fontFamily: FONT.body,
    fontSize: 11,
    fontWeight: "400",
    color: BRAND.black,
    textAlign: "center",
    lineHeight: 16,
    width: BUTTON_WIDTH,
  },

  termsLink: {
    fontFamily: FONT.body,
    fontSize: 11,
    color: BRAND.magenta,
  },
});
