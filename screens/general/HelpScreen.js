// screens/general/HelpScreen.js
// Help / Support screen (Bhutan context) — no dropdowns, no version/last-updated badges.

import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  useColorScheme,
  Linking,
  Alert,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import Icon from "react-native-vector-icons/Ionicons";
import { Ionicons } from "@expo/vector-icons";

export default function HelpScreen() {
  const navigation = useNavigation();
  const isDark = useColorScheme() === "dark";

  const onLink = (url) => {
    Linking.openURL(url).catch(() =>
      Alert.alert("Couldn’t open link", "Please try again or copy the address.")
    );
  };

  const emailSupport = () => onLink("mailto:info@newedge.bt?subject=Merchant%20Support");
  const callSupport = () => onLink("tel:+9752337191");

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: isDark ? "#0b1220" : "#ffffff" }]}>
      {/* Header — match LoginScreen */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton} activeOpacity={0.7}>
          <Icon name="arrow-back" size={24} color="#1A1D1F" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Help</Text>

        <TouchableOpacity onPress={() => navigation.navigate?.("TermsOfService")} style={styles.iconButton} activeOpacity={0.7}>
          <Icon name="document-text-outline" size={24} color="#1A1D1F" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Single badge (Bhutan context only) */}
        <View style={styles.badgeRow}>
          <View style={[styles.badge, { backgroundColor: isDark ? "#0f172a" : "#e2e8f0" }]}>
            <Ionicons name="shield-checkmark-outline" size={16} color={isDark ? "#93c5fd" : "#1d4ed8"} />
            <Text style={[styles.badgeText, { color: isDark ? "#cbd5e1" : "#334155" }]}>Bhutan context</Text>
          </View>
        </View>

        {/* Quick actions */}
        <View style={styles.quickRow}>
          <QuickAction isDark={isDark} icon="mail-outline" label="Email Support" onPress={emailSupport} />
          <QuickAction isDark={isDark} icon="call-outline" label="Call" onPress={callSupport} />
          <QuickAction
            isDark={isDark}
            icon="book-outline"
            label="Privacy"
            onPress={() => navigation.navigate?.("PrivacyPolicy")}
          />
        </View>

        {/* Static info cards (no dropdowns) */}
        <Card isDark={isDark} title="How do I reset my password?">
          <Text style={styles.p}>
            From the Login screen, tap “Forgot password”. Follow the steps sent to your email or phone.
          </Text>
        </Card>

        <Card isDark={isDark} title="How do I update my business details?">
          <Text style={styles.p}>
            Open your profile from the Home tab → Business Info. Edits may require verification and can take effect after review.
          </Text>
        </Card>

        <Card isDark={isDark} title="Payments & Payouts">
          <Text style={styles.p}>
            Settlements are in Bhutanese Ngultrum (Nu./BTN). Bank holidays and checks can affect timelines. Check your Payouts tab for status.
          </Text>
        </Card>

        <Card isDark={isDark} title="Contact Support">
          <Text style={styles.p}>
            Email <Text style={styles.link} onPress={emailSupport}>info@newedge.bt</Text> or call{" "}
            <Text style={styles.link} onPress={callSupport}>+975 2 337191</Text>. Share your app
            username and a brief description of the issue.
          </Text>
        </Card>

        <View style={{ height: 16 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

/* ---------- Small components ---------- */

function QuickAction({ icon, label, onPress, isDark }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickBtn,
        { backgroundColor: isDark ? "#0f172a" : "#f8fafc", borderColor: isDark ? "#223046" : "#e5e7eb" },
        pressed && { opacity: 0.95 },
      ]}
    >
      <Ionicons name={icon} size={18} color={isDark ? "#93c5fd" : "#1d4ed8"} />
      <Text style={[styles.quickText, { color: isDark ? "#cbd5e1" : "#0f172a" }]}>{label}</Text>
    </Pressable>
  );
}

function Card({ title, children, isDark }) {
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: isDark ? "#0f172a" : "#ffffff", borderColor: isDark ? "#223046" : "#e2e8f0" },
      ]}
    >
      <View style={styles.cardHeader}>
        <Text style={[styles.cardTitle, { color: isDark ? "#e2e8f0" : "#0f172a" }]}>{title}</Text>
      </View>
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

/* ---------- Styles ---------- */

const styles = StyleSheet.create({
  safe: { flex: 1 },

  // Header (align with LoginScreen)
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: "#fff",
  },
  iconButton: { padding: 8 },
  headerTitle: {
    fontSize: 22,
    fontWeight: "600",
    color: "#1A1D1F",
    marginRight: 180, // visual centering like your LoginScreen
  },

  content: { padding: 16, paddingBottom: 24 },

  badgeRow: { flexDirection: "row", gap: 8, marginBottom: 12, flexWrap: "wrap" },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  badgeText: { fontSize: 12 },

  quickRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 14,
  },
  quickBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  quickText: { fontWeight: "700" },

  card: {
    borderWidth: 1,
    borderRadius: 14,
    marginBottom: 10,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  cardTitle: { fontSize: 16, fontWeight: "700" },
  cardBody: { paddingHorizontal: 14, paddingBottom: 14 },

  p: { fontSize: 14, lineHeight: 20, color: "#64748b", marginBottom: 10 },

  link: { textDecorationLine: "underline", color: "#2563eb" },
});
