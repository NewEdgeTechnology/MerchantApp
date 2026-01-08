// screens/food/TermsOfService.js
// Terms of Service screen (Bhutanese context) for Grab Merchant-style app
// English-only version, no KYC mentions. Drop-in Expo/React Native component.

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
import Icon from "react-native-vector-icons/Ionicons"; // ✔ match LoginScreen header icons
import { Ionicons } from "@expo/vector-icons"; // keep for inline badges/checkmarks

export default function TermsOfService() {
  const navigation = useNavigation();
  const isDark = useColorScheme() === "dark";
  const [consentFlags, setConsentFlags] = useState({
    over18: false,
    authorized: false,
    agree: false,
  });

  // Format "Last updated" in Asia/Thimphu time.
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

  const canAccept = consentFlags.over18 && consentFlags.authorized && consentFlags.agree;

  const onLink = (url) => {
    Linking.openURL(url).catch(() =>
      Alert.alert(t.common.openLinkFailedTitle, t.common.openLinkFailedText)
    );
  };

  // ---- Navigation targets ----
  const resetTo = (routeName) =>
    navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: routeName }] }));

  const goLogin = () => resetTo("LoginScreen");
  const goWelcome = () => resetTo("WelcomeScreen");

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: isDark ? "#0b1220" : "#f8fafc" }]}>
      {/* ===== Header (aligned to LoginScreen) ===== */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.iconButton}
          activeOpacity={0.7}
        >
          <Icon name="arrow-back" size={24} color="#1A1D1F" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Terms of Service</Text>

        <TouchableOpacity
          onPress={() => navigation.navigate?.("HelpScreen")}
          style={styles.iconButton}
          activeOpacity={0.7}
        >
          <Icon name="help-circle-outline" size={24} color="#1A1D1F" />
        </TouchableOpacity>
      </View>
      {/* ========================================== */}

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

        
        <Checkbox
          isDark={isDark}
          value={consentFlags.authorized}
          onChange={(v) => setConsentFlags((s) => ({ ...s, authorized: v }))}
          label={t.consent.authorized}
        />
        <Checkbox
          isDark={isDark}
          value={consentFlags.agree}
          onChange={(v) => setConsentFlags((s) => ({ ...s, agree: v }))}
          label={t.consent.agree}
        />

        <View style={styles.actions}>
          <Pressable
            onPress={() => (canAccept ? goLogin() : Alert.alert(t.common.completeConsent))}
            style={[styles.primaryBtn, { backgroundColor: canAccept ? "#2563eb" : "#94a3b8" }]}
          >
            <Text style={styles.primaryBtnText}>{t.actions.accept}</Text>
          </Pressable>

          <Pressable
            onPress={goWelcome}
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

/* ---------------- UI bits ---------------- */

function Accordion({ title, children, isDark, initiallyOpen = false }) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: isDark ? "#0f172a" : "#ffffff",
          borderColor: isDark ? "#223046" : "#e2e8f0",
        },
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

/* ---------------- Content ---------------- */

function getSections(t) {
  return [
    {
      title: t.s1.title,
      content: () => <Text style={styles.p}>{t.s1.body}</Text>,
    },
    {
      title: t.s2.title,
      content: () => (
        <>
          <Text style={styles.p}>{t.s2.b1}</Text>
          <Bullet>{t.s2.b2}</Bullet>
          <Bullet>{t.s2.b3}</Bullet>
          <Bullet>{t.s2.b4}</Bullet>
        </>
      ),
    },
    {
      title: t.s3.title,
      content: () => (
        <>
          <Text style={styles.p}>{t.s3.b1}</Text>
          <Bullet>{t.s3.b2}</Bullet>
          <Bullet>{t.s3.b3}</Bullet>
          <Bullet>{t.s3.b4}</Bullet>
        </>
      ),
    },
    {
      title: t.s4.title,
      content: () => (
        <>
          <Text style={styles.p}>{t.s4.lead}</Text>
          <Bullet>{t.s4.p1}</Bullet>
          <Bullet>{t.s4.p2}</Bullet>
          <Bullet>{t.s4.p3}</Bullet>
          <Bullet>{t.s4.p4}</Bullet>
        </>
      ),
    },
    {
      title: t.s5.title,
      content: () => (
        <>
          <Text style={styles.p}>{t.s5.lead}</Text>
          <Bullet>{t.s5.p1}</Bullet>
          <Bullet>{t.s5.p2}</Bullet>
          <Bullet>{t.s5.p3}</Bullet>
          <Bullet>{t.s5.p4}</Bullet>
        </>
      ),
    },
    {
      title: t.s6.title,
      content: (onLink) => (
        <>
          <Text style={styles.p}>{t.s6.lead}</Text>
          <Text style={styles.p}>
            {t.s6.contact}{" "}
            <Text style={styles.link} onPress={() => onLink("mailto:info@newedge.bt")}>
              info@newedge.bt
            </Text>{" "}
            {t.s6.or}{" "}
            <Text style={styles.link} onPress={() => onLink("tel:+9752337191")}>
              +975 2 337191
            </Text>
            .
          </Text>
        </>
      ),
    },
    {
      title: t.s7.title,
      content: () => (
        <>
          <Text style={styles.p}>{t.s7.lead}</Text>
          <Bullet>{t.s7.p1}</Bullet>
          <Bullet>{t.s7.p2}</Bullet>
          <Bullet>{t.s7.p3}</Bullet>
          <Bullet>{t.s7.p4}</Bullet>
          <Bullet>{t.s7.p5}</Bullet>
        </>
      ),
    },
    {
      title: t.s8.title,
      content: () => (
        <>
          <Text style={styles.p}>{t.s8.lead}</Text>
          <Bullet>{t.s8.p1}</Bullet>
          <Bullet>{t.s8.p2}</Bullet>
          <Bullet>{t.s8.p3}</Bullet>
        </>
      ),
    },
    {
      title: t.s9.title,
      content: () => (
        <>
          <Text style={styles.p}>{t.s9.lead}</Text>
          <Bullet>{t.s9.p1}</Bullet>
          <Bullet>{t.s9.p2}</Bullet>
        </>
      ),
    },
  ];
}

function Bullet({ children }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bulletDot}>•</Text>
      <Text style={styles.bulletText}>{children}</Text>
    </View>
  );
}

/* ---------------- Strings (EN only) ---------------- */

const stringsEN = {
  meta: {
    title: "Terms of Service",
    lastUpdated: "Last updated",
    bhutanContext: "Bhutan context",
    notice:
      "This document is tailored for use in Bhutan and references local norms (currency: BTN/Nu.). Update it with your company’s exact legal wording before production.",
  },
  actions: { accept: "Accept & Continue", decline: "Decline" },
  consent: {
    authorized: "I am authorized to act on behalf of this business/merchant.",
    agree: "I have read and agree to these Terms of Service.",
  },
  common: {
    openLinkFailedTitle: "Couldn’t open link",
    openLinkFailedText: "Please try again or copy the address.",
    completeConsent: "Please confirm all consent checkboxes to continue.",
  },
  s1: {
    title: "1) Acceptance & Use",
    body:
      "By creating a merchant account and using this service, you agree to these Terms. If you disagree with any part, you may not access or use the service.",
  },
  // 🔻 No KYC. General eligibility only.
  s2: {
    title: "2) Merchant Eligibility",
    b1: "You confirm your business is legally registered in Bhutan and compliant with applicable laws.",
    b2: "Provide accurate business details (e.g., legal name, address, contact).",
    b3: "Keep your information current; notify us of changes promptly.",
    b4: "We may suspend or limit accounts for policy violations or unlawful use.",
  },
  s3: {
    title: "3) Payments, Payouts & Invoices (Nu./BTN)",
    b1: "All prices, fees and settlements are expressed in Bhutanese Ngultrum (Nu./BTN).",
    b2: "You authorize us and our payment partners to process payments and deposits.",
    b3: "Settlement timelines may vary by bank/public holidays and risk checks.",
    b4: "You are responsible for applicable taxes, surcharges and statutory deductions.",
  },
  s4: {
    title: "4) Data Privacy & Security",
    lead:
      "We collect and process data to deliver and improve the service. We safeguard it with reasonable security measures.",
    p1: "Use of data is limited to service delivery, support and compliance.",
    p2: "We may retain records as allowed/required under Bhutanese law.",
    p3: "We may update our privacy practices and will notify you of material changes.",
    p4: "You should implement reasonable security controls on your devices and staff.",
  },
  s5: {
    title: "5) Fees, Deductions & Adjustments",
    lead: "We may charge platform/transaction fees, deduct chargebacks or adjustments.",
    p1: "Fees are disclosed in your merchant dashboard or agreements.",
    p2: "Chargebacks, refunds and fines may be deducted from your next payout.",
    p3: "We may correct any settlement errors.",
    p4: "We may change fees with reasonable prior notice.",
  },
  s6: {
    title: "6) Support & Contact",
    lead: "Need help with onboarding, payouts or menu/catalog?",
    contact: "Email",
    or: "or call",
  },
  s7: {
    title: "7) Prohibited Activities",
    lead: "You agree not to use the service for any unlawful or restricted purpose.",
    p1: "Illegal goods/services or misrepresentation.",
    p2: "Fraud, money laundering or abuse of promotions.",
    p3: "Sharing credentials or compromising security.",
    p4: "Violating third-party IP rights.",
    p5: "Circumventing platform processes/payouts.",
  },
  s8: {
    title: "8) Changes & Termination",
    lead: "We may update these Terms and/or suspend accounts for violations.",
    p1: "We’ll provide notice for material changes where feasible.",
    p2: "Continued use after changes means you accept the updated Terms.",
    p3: "Either party may terminate as per the merchant agreement.",
  },
  s9: {
    title: "9) Governing Law & Disputes",
    lead:
      "These Terms are governed by the laws of the Kingdom of Bhutan. Venue and jurisdiction will be in Bhutan, unless otherwise agreed in writing.",
    p1: "Comply with all applicable Bhutanese laws and regulations.",
    p2: "Good-faith efforts should be made to settle disputes before escalation.",
  },
};

/* ---------------- Styles ---------------- */

const styles = StyleSheet.create({
  safe: { flex: 1 },

  // ===== Header copied to match LoginScreen =====
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
    // mimic the “center by marginRight” trick from LoginScreen
    marginRight: 180,
  },
  // ==============================================

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

export { stringsEN };
