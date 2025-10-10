// screens/food/PrivacyPolicy.js
// Privacy Policy screen (Bhutan context) for a Grab Merchant-style app
// Header matches LoginScreen. Accept → LoginScreen, Decline → WelcomeScreen.

import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  useColorScheme,
  Linking,
  Alert,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, CommonActions } from "@react-navigation/native";
import Icon from "react-native-vector-icons/Ionicons";
import { Ionicons } from "@expo/vector-icons";

export default function PrivacyPolicy() {
  const navigation = useNavigation();
  const isDark = useColorScheme() === "dark";
  const [agree, setAgree] = useState(false);

  const lastUpdated = useMemo(() => {
    try {
      return new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Thimphu",
        year: "numeric",
        month: "long",
        day: "2-digit",
      }).format(new Date());
    } catch {
      return "—";
    }
  }, []);

  const t = stringsEN;
  const sections = getSections(t);

  const onLink = (url) => {
    Linking.openURL(url).catch(() =>
      Alert.alert(t.common.openLinkFailedTitle, t.common.openLinkFailedText)
    );
  };

  /* Navigation actions */
  const goToLogin = () => {
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: "LoginScreen" }],
      })
    );
  };

  const goToWelcome = () => {
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: "WelcomeScreen" }],
      })
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: isDark ? "#0b1220" : "#f8fafc" }]}>
      {/* ===== Header ===== */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.iconButton}
          activeOpacity={0.7}
        >
          <Icon name="arrow-back" size={24} color="#1A1D1F" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Privacy Policy</Text>

        <TouchableOpacity
          onPress={() => navigation.navigate?.("HelpScreen")}
          style={styles.iconButton}
          activeOpacity={0.7}
        >
          <Icon name="help-circle-outline" size={24} color="#1A1D1F" />
        </TouchableOpacity>
      </View>

      {/* ===== Body ===== */}
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.badgeRow}>
          <View style={[styles.badge, { backgroundColor: isDark ? "#0f172a" : "#e2e8f0" }]}>
            <Ionicons name="shield-checkmark-outline" size={16} color={isDark ? "#93c5fd" : "#1d4ed8"} />
            <Text style={[styles.badgeText, { color: isDark ? "#cbd5e1" : "#334155" }]}>{t.meta.bhutanContext}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: isDark ? "#0f172a" : "#e2e8f0" }]}>
            <Ionicons name="time-outline" size={16} color={isDark ? "#93c5fd" : "#1d4ed8"} />
            <Text style={[styles.badgeText, { color: isDark ? "#cbd5e1" : "#334155" }]}>
              {t.meta.lastUpdated}: {lastUpdated}
            </Text>
          </View>
        </View>

        {sections.map((sec, idx) => (
          <Accordion key={idx} title={sec.title} isDark={isDark} initiallyOpen={idx < 2}>
            {sec.content(onLink)}
          </Accordion>
        ))}

        <View style={[styles.divider, { borderBottomColor: isDark ? "#223046" : "#e2e8f0" }]} />

        {/* Agreement checkbox */}
        <Checkbox
          isDark={isDark}
          value={agree}
          onChange={setAgree}
          label={t.consent.agree}
        />

        <View style={styles.actions}>
          <Pressable
            onPress={() => (agree ? goToLogin() : Alert.alert(t.common.completeConsent))}
            style={[styles.primaryBtn, { backgroundColor: agree ? "#2563eb" : "#94a3b8" }]}
          >
            <Text style={styles.primaryBtnText}>{t.actions.accept}</Text>
          </Pressable>

        <Pressable
            onPress={goToWelcome}
            style={[styles.ghostBtn, { borderColor: isDark ? "#334155" : "#cbd5e1" }]}
          >
            <Text style={[styles.ghostBtnText, { color: isDark ? "#e2e8f0" : "#0f172a" }]}>{t.actions.decline}</Text>
          </Pressable>
        </View>

        <View style={styles.footerNote}>
          <Text style={{ color: isDark ? "#94a3b8" : "#475569", fontSize: 12 }}>
            {t.meta.notice}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ---------------- UI Components ---------------- */

function Accordion({ title, children, isDark, initiallyOpen = false }) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: isDark ? "#0f172a" : "#ffffff", borderColor: isDark ? "#223046" : "#e2e8f0" },
      ]}
    >
      <Pressable style={styles.cardHeader} onPress={() => setOpen((o) => !o)}>
        <Text style={[styles.cardTitle, { color: isDark ? "#e2e8f0" : "#0f172a" }]}>{title}</Text>
        <Ionicons
          name={open ? "chevron-up-outline" : "chevron-down-outline"}
          size={18}
          color={isDark ? "#93c5fd" : "#1d4ed8"}
        />
      </Pressable>
      {open ? <View style={styles.cardBody}>{children}</View> : null}
    </View>
  );
}

function Checkbox({ value, onChange, label, isDark }) {
  return (
    <Pressable style={styles.checkboxRow} onPress={() => onChange(!value)}>
      <View
        style={[
          styles.checkbox,
          {
            borderColor: isDark ? "#475569" : "#94a3b8",
            backgroundColor: value ? (isDark ? "#1e40af" : "#2563eb") : "transparent",
          },
        ]}
      >
        {value ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
      </View>
      <Text style={{ flex: 1, color: isDark ? "#cbd5e1" : "#334155" }}>{label}</Text>
    </Pressable>
  );
}

function Bullet({ children }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bulletDot}>•</Text>
      <Text style={styles.bulletText}>{children}</Text>
    </View>
  );
}

/* ---------------- Content Strings ---------------- */

const stringsEN = {
  meta: {
    lastUpdated: "Last updated",
    bhutanContext: "Bhutan context",
    notice:
      "This Privacy Policy is tailored for Bhutan (currency: BTN/Nu.). Replace placeholders with your company’s legal details before production.",
  },
  actions: { accept: "Accept & Continue", decline: "Decline" },
  consent: { agree: "I have read and acknowledge this Privacy Policy." },
  common: {
    openLinkFailedTitle: "Couldn’t open link",
    openLinkFailedText: "Please try again or copy the address.",
    completeConsent: "Please check the acknowledgement to continue.",
  },
  s1: {
    title: "1) Introduction",
    body:
      "We value your privacy. This Policy explains how your information is collected, used, stored, and protected when using our services.",
  },
  s2: {
    title: "2) Information We Collect",
    lead: "Depending on your use, we may collect:",
    b1: "Business details such as name, license, contact person, email, and phone.",
    b2: "Transaction and order details (items, prices, taxes, payouts).",
    b3: "Device information (app version, IP, OS).",
    b4: "Support and communication records.",
    b5: "Location data (if permission is granted).",
  },
  s3: {
    title: "3) Use of Information",
    lead: "We use your data to:",
    b1: "Deliver and improve merchant services.",
    b2: "Process payments, settlements, and invoices.",
    b3: "Ensure security, prevent fraud, and comply with laws.",
    b4: "Provide support and communicate important updates.",
    b5: "Analyze usage for performance and stability improvements.",
  },
  s4: {
    title: "4) Sharing & Disclosure",
    lead: "Your data may be shared with:",
    b1: "Payment gateways and partner banks for processing.",
    b2: "Third-party vendors under confidentiality obligations.",
    b3: "Regulators or authorities as required by Bhutanese law.",
    b4: "Other parties with your consent.",
  },
  s5: {
    title: "5) Data Security",
    lead:
      "We implement appropriate safeguards to protect your data from unauthorized access, loss, or misuse.",
    b1: "Encryption, access control, and secure storage practices.",
    b2: "Regular audits and updates of security controls.",
    b3: "Limited staff access based on operational necessity.",
  },
  s6: {
    title: "6) Data Retention",
    lead:
      "Data is retained only as long as necessary to fulfill legal and operational requirements.",
    b1: "Financial and audit records retained as per legal requirements.",
    b2: "Inactive accounts may be archived or deleted after due notice.",
    b3: "You may request deletion of certain personal data.",
    b4: "Some data may be retained as required by law.",
  },
  s7: {
    title: "7) Your Rights",
    lead:
      "You have the right to access, update, or request deletion of your data within legal limits.",
    b1: "Access and update your information through the merchant dashboard.",
    b2: "Withdraw consent for optional permissions.",
    b3: "Contact our support for any privacy-related inquiries.",
    b4: "We will respond within a reasonable timeframe.",
  },
  s8: {
    title: "8) Contact & Support",
    lead: "For questions or requests related to this Privacy Policy:",
    b1: "Email: support@yourexample.bt",
    b2: "Phone: +975 00000000",
    b3: "Office: Thimphu, Bhutan",
  },
  s9: {
    title: "9) Changes & Governing Law",
    lead:
      "We may update this Policy periodically. This Policy is governed by the laws of the Kingdom of Bhutan.",
    b1: "Material updates will be notified in-app or via email.",
    b2: "Continued use after updates means you acknowledge the revised Policy.",
  },
};

function getSections(t) {
  return [
    { title: t.s1.title, content: () => <Text style={styles.p}>{t.s1.body}</Text> },
    {
      title: t.s2.title,
      content: () => (
        <>
          <Text style={styles.p}>{t.s2.lead}</Text>
          <Bullet>{t.s2.b1}</Bullet>
          <Bullet>{t.s2.b2}</Bullet>
          <Bullet>{t.s2.b3}</Bullet>
          <Bullet>{t.s2.b4}</Bullet>
          <Bullet>{t.s2.b5}</Bullet>
        </>
      ),
    },
    {
      title: t.s3.title,
      content: () => (
        <>
          <Text style={styles.p}>{t.s3.lead}</Text>
          <Bullet>{t.s3.b1}</Bullet>
          <Bullet>{t.s3.b2}</Bullet>
          <Bullet>{t.s3.b3}</Bullet>
          <Bullet>{t.s3.b4}</Bullet>
          <Bullet>{t.s3.b5}</Bullet>
        </>
      ),
    },
    {
      title: t.s4.title,
      content: () => (
        <>
          <Text style={styles.p}>{t.s4.lead}</Text>
          <Bullet>{t.s4.b1}</Bullet>
          <Bullet>{t.s4.b2}</Bullet>
          <Bullet>{t.s4.b3}</Bullet>
          <Bullet>{t.s4.b4}</Bullet>
        </>
      ),
    },
    {
      title: t.s5.title,
      content: () => (
        <>
          <Text style={styles.p}>{t.s5.lead}</Text>
          <Bullet>{t.s5.b1}</Bullet>
          <Bullet>{t.s5.b2}</Bullet>
          <Bullet>{t.s5.b3}</Bullet>
        </>
      ),
    },
    {
      title: t.s6.title,
      content: () => (
        <>
          <Text style={styles.p}>{t.s6.lead}</Text>
          <Bullet>{t.s6.b1}</Bullet>
          <Bullet>{t.s6.b2}</Bullet>
          <Bullet>{t.s6.b3}</Bullet>
          <Bullet>{t.s6.b4}</Bullet>
        </>
      ),
    },
    {
      title: t.s7.title,
      content: () => (
        <>
          <Text style={styles.p}>{t.s7.lead}</Text>
          <Bullet>{t.s7.b1}</Bullet>
          <Bullet>{t.s7.b2}</Bullet>
          <Bullet>{t.s7.b3}</Bullet>
          <Bullet>{t.s7.b4}</Bullet>
        </>
      ),
    },
    {
      title: t.s8.title,
      content: () => (
        <>
          <Text style={styles.p}>{t.s8.lead}</Text>
          <Bullet>{t.s8.b1}</Bullet>
          <Bullet>{t.s8.b2}</Bullet>
          <Bullet>{t.s8.b3}</Bullet>
        </>
      ),
    },
    {
      title: t.s9.title,
      content: () => (
        <>
          <Text style={styles.p}>{t.s9.lead}</Text>
          <Bullet>{t.s9.b1}</Bullet>
          <Bullet>{t.s9.b2}</Bullet>
        </>
      ),
    },
  ];
}

/* ---------------- Styles ---------------- */

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
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
    marginRight: 180,
  },
  content: { padding: 16, paddingBottom: 32 },
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
  card: {
    borderWidth: 1,
    borderRadius: 14,
    marginBottom: 10,
    overflow: "hidden",
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
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
  bulletRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 8, gap: 8 },
  bulletDot: { width: 16, textAlign: "center", lineHeight: 20, color: "#64748b" },
  bulletText: { flex: 1, color: "#64748b", fontSize: 14, lineHeight: 20 },
  divider: { borderBottomWidth: 1, marginVertical: 14, borderBottomColor: "#e2e8f0" },
  checkboxRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  actions: { flexDirection: "row", gap: 10, marginTop: 12 },
  primaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { color: "white", fontWeight: "700" },
  ghostBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  ghostBtnText: { fontWeight: "700" },
  link: { textDecorationLine: "underline", color: "#2563eb" },
  footerNote: { marginTop: 16 },
});

