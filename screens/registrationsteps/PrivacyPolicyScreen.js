// screens/registrationsteps/PrivacyPolicyScreen.js
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
import { BRAND, FONT, SHADOW } from "../styles/tabdey_brand";

export default function PrivacyPolicyScreen() {
  const navigation = useNavigation();

  return (
    <SafeAreaView style={styles.safe} edges={["left", "top", "right", "bottom"]}>
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

          <Text style={styles.headerTitle}>Privacy</Text>

          <View style={styles.backBtnGhost} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroCard}>
            <Text style={styles.brandLabel}>TÀBDEY MERCHANT</Text>
            <Text style={styles.title}>Privacy Policy</Text>
            <Text style={styles.subtitle}>
              Review how your merchant registration data is collected, used and protected.
            </Text>
          </View>

          <PolicySection
            number="1"
            title="What we collect"
            body="We collect information you provide during registration, including name, business details, phone, email, and verification details such as CID and uploaded documents."
          />

          <PolicySection
            number="2"
            title="Why we collect it"
            body="We use this information to create and manage your merchant account, perform verification, enable payouts, and provide platform services."
          />

          <PolicySection
            number="3"
            title="Sharing"
            body="We do not sell your data. We may share limited data with service providers required to run the platform, such as messaging, OTP, payments, and when required by law."
          />

          <PolicySection
            number="4"
            title="Security"
            body="We apply reasonable safeguards, but no system is completely secure. Please keep your account credentials confidential."
          />

          <PolicySection
            number="5"
            title="Updates"
            body="This policy may be updated from time to time. Continued use indicates acceptance of the latest version."
          />

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

function PolicySection({ number, title, body }) {
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
    paddingHorizontal: 18,
    paddingTop: 0,
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