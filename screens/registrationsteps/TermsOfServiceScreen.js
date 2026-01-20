// screens/registrationsteps/TermsOfServiceScreen.js
import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";

export default function TermsOfServiceScreen() {
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
        <Text style={styles.title}>Terms &amp; Conditions</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.h2}>1. Acceptance</Text>
        <Text style={styles.p}>
          By creating an account and using this app, you agree to comply with these Terms &amp;
          Conditions. If you do not agree, do not continue registration.
        </Text>

        <Text style={styles.h2}>2. Merchant Responsibilities</Text>
        <Text style={styles.p}>
          You agree to provide accurate business information, maintain updated details, and ensure
          lawful operation of your business.
        </Text>

        <Text style={styles.h2}>3. Verification &amp; Approval</Text>
        <Text style={styles.p}>
          Account activation may require OTP verification and review. Approval is subject to policy
          compliance and validation of submitted documents.
        </Text>

        <Text style={styles.h2}>4. Prohibited Use</Text>
        <Text style={styles.p}>
          You must not misuse the platform, attempt unauthorized access, submit false documents, or
          violate local regulations.
        </Text>

        <Text style={styles.h2}>5. Changes</Text>
        <Text style={styles.p}>
          We may update these Terms from time to time. Continued use means you accept the latest
          version.
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
