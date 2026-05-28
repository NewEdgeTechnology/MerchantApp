// screens/registrationsteps/TermsOfServiceScreen.js
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { BRAND, FONT, RADIUS, SHADOW } from "../styles/tabdey_brand";

export default function TermsOfServiceScreen() {
  const navigation = useNavigation();

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right", "bottom"]}>
      <View style={styles.topGlow} />

      <View style={styles.page}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            activeOpacity={0.86}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.backBtn}
          >
            <Ionicons name="chevron-back" size={22} color={BRAND.black} />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Terms</Text>

          <View style={styles.backBtnGhost} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroCard}>
            <Text style={styles.brandLabel}>TÀBDEY MERCHANT</Text>
            <Text style={styles.title}>Terms &amp; Conditions</Text>
            <Text style={styles.subtitle}>
              Please review these terms before continuing your merchant
              registration.
            </Text>
          </View>

          <TermSection
            number="1"
            title="Acceptance"
            body="By creating an account and using this app, you agree to comply with these Terms & Conditions. If you do not agree, do not continue registration."
          />

          <TermSection
            number="2"
            title="Merchant Responsibilities"
            body="You agree to provide accurate business information, maintain updated details, and ensure lawful operation of your business."
          />

          <TermSection
            number="3"
            title="Verification & Approval"
            body="Account activation may require OTP verification and review. Approval is subject to policy compliance and validation of submitted documents."
          />

          <TermSection
            number="4"
            title="Prohibited Use"
            body="You must not misuse the platform, attempt unauthorized access, submit false documents, or violate local regulations."
          />

          <TermSection
            number="5"
            title="Changes"
            body="We may update these Terms from time to time. Continued use means you accept the latest version."
          />

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

function TermSection({ number, title, body }) {
  return (
    <View style={styles.card}>
      <View style={styles.sectionHeader}>
        <View style={styles.numberBadge}>
          <Text style={styles.numberText}>{number}</Text>
        </View>

        <Text style={styles.h2}>{title}</Text>
      </View>

      <Text style={styles.p}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#FBF7FF",
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

  page: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 42,
  },

  header: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },

  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: BRAND.white,
    alignItems: "center",
    justifyContent: "center",
    ...SHADOW.sm,
  },

  backBtnGhost: {
    width: 44,
    height: 44,
  },

  headerTitle: {
    fontFamily: FONT.header,
    fontSize: 18,
    fontWeight: "800",
    color: BRAND.black,
  },

  content: {
    flexGrow: 1,
    paddingBottom: 24,
  },

  heroCard: {
    backgroundColor: BRAND.white,
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 18,
    marginBottom: 18,
    ...SHADOW.sm,
  },

  brandLabel: {
    fontFamily: FONT.body,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    color: BRAND.purple,
    marginBottom: 10,
  },

  title: {
    fontFamily: FONT.header,
    fontSize: 26,
    fontWeight: "700",
    color: BRAND.black,
    lineHeight: 32,
    marginBottom: 10,
  },

  subtitle: {
    fontFamily: FONT.body,
    fontSize: 14,
    lineHeight: 21,
    color: BRAND.grey,
  },

  card: {
    backgroundColor: BRAND.white,
    borderRadius: 22,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: BRAND.greyBorder,
    ...SHADOW.sm,
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },

  numberBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#F4ECFF",
    alignItems: "center",
    justifyContent: "center",
  },

  numberText: {
    fontFamily: FONT.body,
    fontSize: 13,
    fontWeight: "900",
    color: BRAND.purple,
  },

  h2: {
    flex: 1,
    fontFamily: FONT.body,
    fontSize: 15,
    fontWeight: "800",
    color: BRAND.black,
  },

  p: {
    fontFamily: FONT.body,
    fontSize: 13,
    lineHeight: 20,
    color: BRAND.grey,
  },

  bottomSpacer: {
    height: 40,
  },
});