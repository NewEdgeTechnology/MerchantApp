// screens/registrationsteps/PrivacyPolicyScreen.js
import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";

export default function PrivacyPolicyScreen() {
  const navigation = useNavigation();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          activeOpacity={1}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={22} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.title}>Privacy Policy</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.h2}>1. What we collect</Text>
        <Text style={styles.p}>
          We collect information you provide during registration (name, business details, phone,
          email), and verification details such as CID and uploaded documents.
        </Text>

        <Text style={styles.h2}>2. Why we collect it</Text>
        <Text style={styles.p}>
          To create and manage your merchant account, perform verification, enable payouts, and
          provide platform services.
        </Text>

        <Text style={styles.h2}>3. Sharing</Text>
        <Text style={styles.p}>
          We do not sell your data. We may share limited data with service providers required to run
          the platform (e.g., messaging/OTP, payments) and when required by law.
        </Text>

        <Text style={styles.h2}>4. Security</Text>
        <Text style={styles.p}>
          We apply reasonable safeguards, but no system is 100% secure. Please keep your account
          credentials confidential.
        </Text>

        <Text style={styles.h2}>5. Updates</Text>
        <Text style={styles.p}>
          This policy may be updated. Continued use indicates acceptance of the latest version.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  header: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 16, fontWeight: "800", color: "#111827" },
  content: { padding: 16, paddingBottom: 28 },
  h2: { fontSize: 14, fontWeight: "900", color: "#111827", marginTop: 14 },
  p: { marginTop: 6, fontSize: 13, lineHeight: 19, color: "#374151" },
});
