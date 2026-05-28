// screens/food/PrivacyPolicy.js
import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Linking,
  Alert,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, CommonActions } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { BRAND, FONT, RADIUS, SHADOW } from "../styles/tabdey_brand";

export default function PrivacyPolicy() {
  const navigation = useNavigation();
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
      Alert.alert(t.common.openLinkFailedTitle, t.common.openLinkFailedText),
    );
  };

  const goToLogin = () => {
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: "LoginScreen" }],
      }),
    );
  };

  const goToWelcome = () => {
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: "WelcomeScreen" }],
      }),
    );
  };

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

          <Text style={styles.headerTitle}>Privacy</Text>

          <TouchableOpacity
            onPress={() => navigation.navigate?.("HelpScreen")}
            style={styles.backBtn}
            activeOpacity={0.86}
          >
            <Ionicons name="help-circle-outline" size={22} color={BRAND.black} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroCard}>
            <Text style={styles.brandLabel}>TÀBDEY MERCHANT</Text>
            <Text style={styles.title}>Privacy Policy</Text>
            <Text style={styles.subtitle}>
              Review how merchant data is collected, used, protected and shared.
            </Text>
          </View>

          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <Ionicons
                name="shield-checkmark-outline"
                size={16}
                color={BRAND.purple}
              />
              <Text style={styles.badgeText}>{t.meta.bhutanContext}</Text>
            </View>

            <View style={styles.badge}>
              <Ionicons name="time-outline" size={16} color={BRAND.purple} />
              <Text style={styles.badgeText}>
                {t.meta.lastUpdated}: {lastUpdated}
              </Text>
            </View>
          </View>

          {sections.map((sec, idx) => (
            <Accordion key={idx} title={sec.title} initiallyOpen={idx < 2}>
              {sec.content(onLink)}
            </Accordion>
          ))}

          <View style={styles.divider} />

          <Checkbox
            value={agree}
            onChange={setAgree}
            label={t.consent.agree}
          />

          <View style={styles.actions}>
            <Pressable
              onPress={() =>
                agree ? goToLogin() : Alert.alert(t.common.completeConsent)
              }
              style={agree ? styles.primaryBtn : styles.primaryBtnDisabled}
            >
              <Text
                style={
                  agree
                    ? styles.primaryBtnText
                    : styles.primaryBtnTextDisabled
                }
              >
                {t.actions.accept}
              </Text>
            </Pressable>

            <Pressable onPress={goToWelcome} style={styles.ghostBtn}>
              <Text style={styles.ghostBtnText}>{t.actions.decline}</Text>
            </Pressable>
          </View>

          <View style={styles.footerNote}>
            <Text style={styles.footerText}>{t.meta.notice}</Text>
          </View>

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

/* ---------------- UI Components ---------------- */

function Accordion({ title, children, initiallyOpen = false }) {
  const [open, setOpen] = useState(initiallyOpen);

  return (
    <View style={styles.card}>
      <Pressable style={styles.cardHeader} onPress={() => setOpen((o) => !o)}>
        <Text style={styles.cardTitle}>{title}</Text>

        <View style={styles.chevronCircle}>
          <Ionicons
            name={open ? "chevron-up-outline" : "chevron-down-outline"}
            size={18}
            color={BRAND.purple}
          />
        </View>
      </Pressable>

      {open ? <View style={styles.cardBody}>{children}</View> : null}
    </View>
  );
}

function Checkbox({ value, onChange, label }) {
  return (
    <Pressable style={styles.checkboxRow} onPress={() => onChange(!value)}>
      <View style={[styles.checkbox, value && styles.checkboxChecked]}>
        {value ? <Ionicons name="checkmark" size={14} color={BRAND.purple} /> : null}
      </View>

      <Text style={styles.checkboxText}>{label}</Text>
    </Pressable>
  );
}

function Bullet({ children }) {
  return (
    <View style={styles.bulletRow}>
      <View style={styles.bulletDot} />
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
      "This Privacy Policy is tailored for Bhutan (currency: BTN/BTN.). Replace placeholders with your company’s legal details before production.",
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

  badgeRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
    flexWrap: "wrap",
  },

  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F4ECFF",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#EFE7F7",
  },

  badgeText: {
    fontFamily: FONT.body,
    fontSize: 12,
    color: BRAND.purple,
    fontWeight: "800",
  },

  card: {
    borderWidth: 1,
    borderRadius: 22,
    marginBottom: 12,
    overflow: "hidden",
    borderColor: BRAND.greyBorder,
    backgroundColor: BRAND.white,
    ...SHADOW.sm,
  },

  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 15,
    alignItems: "center",
    gap: 12,
  },

  cardTitle: {
    flex: 1,
    fontFamily: FONT.body,
    fontSize: 15,
    fontWeight: "800",
    color: BRAND.black,
  },

  chevronCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#F4ECFF",
    alignItems: "center",
    justifyContent: "center",
  },

  cardBody: {
    paddingHorizontal: 16,
    paddingBottom: 15,
  },

  p: {
    fontFamily: FONT.body,
    fontSize: 13,
    lineHeight: 20,
    color: BRAND.grey,
    marginBottom: 10,
  },

  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 8,
    gap: 9,
  },

  bulletDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: BRAND.purple,
    marginTop: 7,
  },

  bulletText: {
    flex: 1,
    fontFamily: FONT.body,
    color: BRAND.grey,
    fontSize: 13,
    lineHeight: 20,
  },

  divider: {
    borderBottomWidth: 1,
    marginVertical: 16,
    borderBottomColor: "#EFE7F7",
  },

  checkboxRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 10,
    backgroundColor: BRAND.white,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: BRAND.greyBorder,
    ...SHADOW.sm,
  },

  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: BRAND.purple,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BRAND.white,
    marginTop: 1,
  },

  checkboxChecked: {
    backgroundColor: "#F4ECFF",
  },

  checkboxText: {
    flex: 1,
    fontFamily: FONT.body,
    color: BRAND.black,
    fontSize: 13,
    lineHeight: 19,
  },

  actions: {
    gap: 10,
    marginTop: 16,
  },

  primaryBtn: {
    backgroundColor: BRAND.purple,
    paddingVertical: 16,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    ...SHADOW.md,
  },

  primaryBtnDisabled: {
    backgroundColor: BRAND.greyLight,
    paddingVertical: 16,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },

  primaryBtnText: {
    color: BRAND.white,
    fontSize: 16,
    fontWeight: "700",
    fontFamily: FONT.body,
  },

  primaryBtnTextDisabled: {
    color: BRAND.grey,
    fontSize: 16,
    fontWeight: "600",
    fontFamily: FONT.body,
  },

  ghostBtn: {
    paddingVertical: 16,
    borderRadius: RADIUS.pill,
    borderWidth: 1.2,
    borderColor: BRAND.greyBorder,
    backgroundColor: BRAND.white,
    alignItems: "center",
    justifyContent: "center",
  },

  ghostBtnText: {
    fontFamily: FONT.body,
    color: BRAND.black,
    fontWeight: "800",
    fontSize: 15,
  },

  link: {
    textDecorationLine: "underline",
    color: BRAND.purple,
    fontWeight: "800",
  },

  footerNote: {
    marginTop: 16,
    backgroundColor: BRAND.white,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: BRAND.greyBorder,
  },

  footerText: {
    color: BRAND.grey,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: FONT.body,
  },

  bottomSpacer: {
    height: 40,
  },
});