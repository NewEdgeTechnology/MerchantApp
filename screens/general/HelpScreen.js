// screens/general/HelpScreen.js
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Linking,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { BRAND, FONT, SHADOW } from "../styles/tabdey_brand";

export default function HelpScreen() {
  const navigation = useNavigation();

  const onLink = (url) => {
    Linking.openURL(url).catch(() =>
      Alert.alert("Couldn’t open link", "Please try again or copy the address."),
    );
  };

  const emailSupport = () =>
    onLink("mailto:info@newedge.bt?subject=Merchant%20Support");

  const callSupport = () => onLink("tel:+9752337191");

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right", "bottom"]}>
      <View style={styles.topGlow} />

      <View style={styles.page}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
            activeOpacity={0.86}
          >
            <Ionicons name="chevron-back" size={22} color={BRAND.black} />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Help</Text>

          <TouchableOpacity
            onPress={() => navigation.navigate?.("TermsOfService")}
            style={styles.backBtn}
            activeOpacity={0.86}
          >
            <Ionicons name="document-text-outline" size={22} color={BRAND.black} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroCard}>
            <Text style={styles.brandLabel}>TÀBDEY MERCHANT</Text>
            <Text style={styles.title}>Help &amp; support</Text>
            <Text style={styles.subtitle}>
              Get support for merchant registration, payments, account access and business profile updates.
            </Text>
          </View>

          <View style={styles.badge}>
            <Ionicons name="shield-checkmark-outline" size={16} color={BRAND.purple} />
            <Text style={styles.badgeText}>Bhutan context</Text>
          </View>

          <View style={styles.quickRow}>
            <QuickAction icon="mail-outline" label="Email Support" onPress={emailSupport} />
            <QuickAction icon="call-outline" label="Call" onPress={callSupport} />
            <QuickAction
              icon="book-outline"
              label="Privacy"
              onPress={() => navigation.navigate?.("PrivacyPolicy")}
            />
          </View>

          <Card title="How do I reset my password?">
            <Text style={styles.p}>
              From the Login screen, tap “Forgot password”. Follow the steps sent to your email or phone.
            </Text>
          </Card>

          <Card title="How do I update my business details?">
            <Text style={styles.p}>
              Open your profile from the Home tab → Business Info. Edits may require verification and can take effect after review.
            </Text>
          </Card>

          <Card title="Payments & Payouts">
            <Text style={styles.p}>
              Settlements are in Bhutanese Ngultrum. Bank holidays and checks can affect timelines. Check your Payouts tab for status.
            </Text>
          </Card>

          <Card title="Contact Support">
            <Text style={styles.p}>
              Email{" "}
              <Text style={styles.link} onPress={emailSupport}>
                info@newedge.bt
              </Text>{" "}
              or call{" "}
              <Text style={styles.link} onPress={callSupport}>
                +975 2 337191
              </Text>
              . Share your app username and a brief description of the issue.
            </Text>
          </Card>

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

function QuickAction({ icon, label, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.quickBtn, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.quickIconWrap}>
        <Ionicons name={icon} size={18} color={BRAND.purple} />
      </View>
      <Text style={styles.quickText}>{label}</Text>
    </Pressable>
  );
}

function Card({ title, children }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <View style={styles.cardBody}>{children}</View>
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
    marginBottom: 14,
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

  badge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F4ECFF",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#EFE7F7",
  },

  badgeText: {
    fontFamily: FONT.body,
    fontSize: 12,
    color: BRAND.purple,
    fontWeight: "800",
  },

  quickRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },

  quickBtn: {
    flex: 1,
    backgroundColor: BRAND.white,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: BRAND.greyBorder,
    ...SHADOW.sm,
  },

  quickIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F4ECFF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },

  quickText: {
    fontFamily: FONT.body,
    fontSize: 12,
    fontWeight: "800",
    color: BRAND.black,
    textAlign: "center",
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

  cardTitle: {
    fontFamily: FONT.body,
    fontSize: 15,
    fontWeight: "800",
    color: BRAND.black,
    marginBottom: 8,
  },

  cardBody: {
    marginTop: 2,
  },

  p: {
    fontFamily: FONT.body,
    fontSize: 13,
    lineHeight: 20,
    color: BRAND.grey,
  },

  link: {
    color: BRAND.purple,
    fontWeight: "800",
    textDecorationLine: "underline",
  },

  bottomSpacer: {
    height: 40,
  },
});