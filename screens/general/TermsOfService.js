// screens/food/TermsOfService.js
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

export default function TermsOfService() {
  const navigation = useNavigation();

  const [consentFlags, setConsentFlags] = useState({
    over18: false,
    authorized: false,
    agree: false,
  });

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
  const canAccept = consentFlags.authorized && consentFlags.agree;

  const onLink = (url) => {
    Linking.openURL(url).catch(() =>
      Alert.alert(t.common.openLinkFailedTitle, t.common.openLinkFailedText),
    );
  };

  const resetTo = (routeName) =>
    navigation.dispatch(
      CommonActions.reset({ index: 0, routes: [{ name: routeName }] }),
    );

  const goLogin = () => resetTo("LoginScreen");
  const goWelcome = () => resetTo("WelcomeScreen");

  return (
    <SafeAreaView
      style={styles.safe}
      edges={["top", "left", "right", "bottom"]}
    >
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

          <Text style={styles.headerTitle}>Terms</Text>

          <TouchableOpacity
            onPress={() => navigation.navigate?.("HelpScreen")}
            style={styles.backBtn}
            activeOpacity={0.86}
          >
            <Ionicons
              name="help-circle-outline"
              size={22}
              color={BRAND.black}
            />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroCard}>
            <Text style={styles.brandLabel}>TÀBDEY MERCHANT</Text>
            <Text style={styles.title}>Terms of Service</Text>
            <Text style={styles.subtitle}>
              Review the merchant platform terms before continuing.
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
            value={consentFlags.authorized}
            onChange={(v) => setConsentFlags((s) => ({ ...s, authorized: v }))}
            label={t.consent.authorized}
          />

          <Checkbox
            value={consentFlags.agree}
            onChange={(v) => setConsentFlags((s) => ({ ...s, agree: v }))}
            label={t.consent.agree}
          />

          <View style={styles.actions}>
            <Pressable
              onPress={() =>
                canAccept ? goLogin() : Alert.alert(t.common.completeConsent)
              }
              style={canAccept ? styles.primaryBtn : styles.primaryBtnDisabled}
            >
              <Text
                style={
                  canAccept
                    ? styles.primaryBtnText
                    : styles.primaryBtnTextDisabled
                }
              >
                {t.actions.accept}
              </Text>
            </Pressable>

            <Pressable onPress={goWelcome} style={styles.ghostBtn}>
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

/* ---------------- UI bits ---------------- */

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
        {value ? (
          <Ionicons name="checkmark" size={14} color={BRAND.purple} />
        ) : null}
      </View>

      <Text style={styles.checkboxText}>{label}</Text>
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
            <Text
              style={styles.link}
              onPress={() => onLink("mailto:info@newedge.bt")}
            >
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
      <View style={styles.bulletDot} />
      <Text style={styles.bulletText}>{children}</Text>
    </View>
  );
}

/* ---------------- Strings unchanged ---------------- */

const stringsEN = {
  meta: {
    title: "Terms of Service",
    lastUpdated: "Last updated",
    bhutanContext: "Bhutan context",
    notice:
      "This document is tailored for use in Bhutan and references local norms (currency: BTN/BTN.). Update it with your company’s exact legal wording before production.",
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
    body: "By creating a merchant account and using this service, you agree to these Terms. If you disagree with any part, you may not access or use the service.",
  },
  s2: {
    title: "2) Merchant Eligibility",
    b1: "You confirm your business is legally registered in Bhutan and compliant with applicable laws.",
    b2: "Provide accurate business details (e.g., legal name, address, contact).",
    b3: "Keep your information current; notify us of changes promptly.",
    b4: "We may suspend or limit accounts for policy violations or unlawful use.",
  },
  s3: {
    title: "3) Payments, Payouts & Invoices (BTN./BTN)",
    b1: "All prices, fees and settlements are expressed in Bhutanese Ngultrum (BTN./BTN).",
    b2: "You authorize us and our payment partners to process payments and deposits.",
    b3: "Settlement timelines may vary by bank/public holidays and risk checks.",
    b4: "You are responsible for applicable taxes, surcharges and statutory deductions.",
  },
  s4: {
    title: "4) Data Privacy & Security",
    lead: "We collect and process data to deliver and improve the service. We safeguard it with reasonable security measures.",
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
    lead: "These Terms are governed by the laws of the Kingdom of Bhutan. Venue and jurisdiction will be in Bhutan, unless otherwise agreed in writing.",
    p1: "Comply with all applicable Bhutanese laws and regulations.",
    p2: "Good-faith efforts should be made to settle disputes before escalation.",
  },
};

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
    paddingHorizontal: 18,
    paddingTop: 0,
  },

  header: {
    minHeight: 54,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "transparent",
    marginBottom: 12,
  },

  backBtn: {
    width: 42,
    height: 42,
    borderRadius: RADIUS.full,
    backgroundColor: BRAND.white,
    alignItems: "center",
    justifyContent: "center",
    ...SHADOW.sm,
  },

  headerTitle: {
    fontFamily: FONT.header,
    fontSize: 22,
    fontWeight: "700",
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

export { stringsEN };
