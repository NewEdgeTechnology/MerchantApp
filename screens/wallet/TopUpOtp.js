// services/wallet/TopUpOtp.js
import React, { useCallback, useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
  StatusBar,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { WALLET_TOPUP_BASE } from "@env";
import { getValidAccessToken } from "../../utils/authToken";
import { useAlert } from "../../components/CustomAlert";
import { C } from "../../theme";

const G = {
  grab:   C.brand,
  grab2:  C.brandDark,
  text:   C.text,
  sub:    C.sub,
  bg:     C.card2,
  line:   C.line,
  danger: C.danger,
  ok:     C.success,
  warn:   C.warn,
  white:  C.white,
  slate:  C.text,
};

const TOPUP_BASE      = (WALLET_TOPUP_BASE || "").replace(/\/+$/, "");
const TOPUP_DEBIT_URL = `${TOPUP_BASE}/debit`;

const WAIT_BEFORE_DEBIT_MS  = 600;
const RETRY_ON_500_DELAY_MS = 1200;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function authFetch(url, opts = {}) {
  const token = await getValidAccessToken();
  const baseHeaders = { "Content-Type": "application/json" };
  const headers = token
    ? { ...baseHeaders, Authorization: `Bearer ${token}` }
    : baseHeaders;

  const res = await fetch(url, {
    ...opts,
    headers: { ...(opts.headers || {}), ...headers },
  });

  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}

  if (!res.ok) {
    const serverMsg =
      (json && (json.message || json.error || json.responseDesc)) ||
      (text && text.slice(0, 300)) ||
      `HTTP ${res.status}`;
    const err = new Error(serverMsg);
    err.status = res.status;
    err.raw    = text;
    err.body   = json;
    throw err;
  }

  return json ?? (text ? { raw: text } : {});
}

export default function TopUpOtpScreen() {
  const navigation = useNavigation();
  const route      = useRoute();
  const { showAlert, alertNode } = useAlert();

  const wallet  = route.params?.wallet  || null;
  const amount  = route.params?.amount  || 0;
  const orderNo = route.params?.orderNo;

  const [otp,        setOtp]        = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [hint,       setHint]       = useState("");

  const inputRef = useRef(null);

  useEffect(() => { getValidAccessToken().catch(() => {}); }, []);

  const onChangeOtp = useCallback((val) => {
    setOtp((val || "").replace(/[^0-9]/g, "").slice(0, 6));
  }, []);

  const onSubmit = useCallback(async () => {
    if (submitting) return;

    if (!orderNo) {
      showAlert({ type: "error", title: "Error", message: "Missing order number.", primaryLabel: "OK" });
      return;
    }
    if (!otp || otp.length < 4) {
      showAlert({ type: "warn", title: "OTP required", message: "Please enter the OTP sent by your bank.", primaryLabel: "OK" });
      return;
    }

    setSubmitting(true);
    setHint("Submitting payment…");

    try {
      const payload = { orderNo, otp };
      await sleep(WAIT_BEFORE_DEBIT_MS);

      let res;
      try {
        res = await authFetch(TOPUP_DEBIT_URL, { method: "POST", body: JSON.stringify(payload) });
      } catch (e) {
        console.log("[TopUpOtp] first debit error:", e?.status, e?.message);
        if (e?.raw) console.log("[TopUpOtp] first debit raw:", e.raw);

        if (Number(e?.status) === 500) {
          setHint("Server busy, retrying…");
          await sleep(RETRY_ON_500_DELAY_MS);
          setHint("Submitting again…");
          res = await authFetch(TOPUP_DEBIT_URL, { method: "POST", body: JSON.stringify(payload) });
        } else {
          throw e;
        }
      }

      const data    = res?.data || res;
      const status  = data?.status || "";
      const message = data?.message || (status === "SUCCESS" ? "Payment successful." : "Payment failed.");

      setHint("");

      if (status === "SUCCESS") {
        showAlert({
          type: "success",
          title: "Top up successful",
          message,
          primaryLabel: "OK",
          primaryAction: () => { navigation.navigate("Wallet"); },
        });
      } else {
        showAlert({ type: "error", title: "Payment failed", message, primaryLabel: "OK" });
      }
    } catch (e) {
      console.log("[TopUpOtp] debit error:", e?.status, e?.message);
      if (e?.raw) console.log("[TopUpOtp] debit raw:", e.raw);
      setHint("");

      if (Number(e?.status) === 500) {
        showAlert({ type: "error", title: "Server busy", message: "Payment server is temporarily busy. Please try again.", primaryLabel: "OK" });
      } else {
        showAlert({ type: "error", title: "Payment failed", message: String(e.message || e), primaryLabel: "OK" });
      }
    } finally {
      setSubmitting(false);
      setHint("");
    }
  }, [orderNo, otp, navigation, submitting, showAlert]);

  const amountStr = amount.toFixed ? amount.toFixed(2) : String(amount);

  return (
    <>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <KeyboardAvoidingView
        style={styles.wrap}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* ── Header ── */}
        <LinearGradient
          colors={C.gradBrand}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <View style={styles.headerRow}>
            <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} disabled={submitting}>
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Enter OTP</Text>
            <View style={{ width: 38 }} />
          </View>
          <View style={styles.amountBadge}>
            <Ionicons name="arrow-up-circle-outline" size={14} color="rgba(255,255,255,0.85)" />
            <Text style={styles.amountBadgeText}>BTN {amountStr}</Text>
          </View>
        </LinearGradient>

        {/* ── Body ── */}
        <View style={styles.body}>

          {/* Icon + instructions */}
          <View style={styles.iconRing}>
            <Ionicons name="chatbubble-ellipses-outline" size={28} color={G.grab} />
          </View>
          <Text style={styles.instrTitle}>Check your SMS</Text>
          <Text style={styles.instrSub}>
            Enter the one-time password sent by your bank to confirm this top-up.
          </Text>

          {/* OTP boxes */}
          <View style={styles.otpContainer}>
            <View style={styles.otpBoxRow} pointerEvents="none">
              {Array.from({ length: 6 }).map((_, i) => {
                const filled  = i < otp.length;
                const active  = i === otp.length && !submitting;
                return (
                  <View
                    key={i}
                    style={[
                      styles.otpBox,
                      filled && styles.otpBoxFilled,
                      active && styles.otpBoxActive,
                    ]}
                  >
                    {filled && <Text style={styles.otpDot}>●</Text>}
                  </View>
                );
              })}
            </View>
            {/* Hidden input intercepts all keyboard events */}
            <TextInput
              ref={inputRef}
              value={otp}
              onChangeText={onChangeOtp}
              keyboardType="number-pad"
              maxLength={6}
              style={styles.hiddenInput}
              editable={!submitting}
              autoFocus
              caretHidden
            />
          </View>

          {/* Status hint */}
          {submitting && !!hint && (
            <View style={styles.hintBanner}>
              <ActivityIndicator size="small" color={G.warn} />
              <Text style={styles.hintText}>{hint}</Text>
            </View>
          )}

          <View style={{ flex: 1 }} />

          {/* Confirm button */}
          <TouchableOpacity
            style={[styles.confirmBtn, (otp.length < 4 || submitting) && styles.btnDisabled]}
            onPress={onSubmit}
            disabled={otp.length < 4 || submitting}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Text style={styles.confirmBtnText}>Confirm Payment</Text>
                <Ionicons name="checkmark" size={18} color="#fff" />
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
      {alertNode}
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "#F8FAFC" },

  /* ── Header ── */
  header: {
    paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 24) + 12 : 58,
    paddingHorizontal: 20,
    paddingBottom: 18,
  },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "800" },
  amountBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 6,
    marginTop: 10,
    backgroundColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 999,
  },
  amountBadgeText: { color: "#fff", fontWeight: "800", fontSize: 15 },

  /* ── Body ── */
  body: {
    flex: 1,
    padding: 24,
    alignItems: "center",
  },

  /* ── Instructions ── */
  iconRing: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: "#F5F3FF",
    alignItems: "center", justifyContent: "center",
    marginTop: 12, marginBottom: 16,
  },
  instrTitle: {
    color: "#0F172A",
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },
  instrSub: {
    color: "#64748B",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
    marginTop: 6,
    maxWidth: 280,
  },

  /* ── OTP boxes ── */
  otpContainer: {
    width: "100%",
    marginTop: 28,
  },
  otpBoxRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  otpBox: {
    flex: 1,
    height: 58,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  otpBoxActive: {
    borderColor: G.grab,
    backgroundColor: "#F5F3FF",
    shadowColor: G.grab,
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  otpBoxFilled: {
    borderColor: G.grab,
    backgroundColor: "#F5F3FF",
  },
  otpDot: {
    fontSize: 18,
    color: G.grab,
    lineHeight: 22,
  },
  hiddenInput: {
    position: "absolute",
    width: "100%",
    height: "100%",
    opacity: 0,
  },

  /* ── Hint banner ── */
  hintBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FFFBEB",
    borderRadius: 12,
    padding: 12,
    marginTop: 14,
    borderWidth: 1,
    borderColor: "#FDE68A",
    width: "100%",
  },
  hintText: { color: "#92400E", fontWeight: "600", fontSize: 13 },

  /* ── Confirm button ── */
  confirmBtn: {
    backgroundColor: G.grab,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    width: "100%",
    marginBottom: 8,
  },
  confirmBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  btnDisabled: { opacity: 0.45 },
});
