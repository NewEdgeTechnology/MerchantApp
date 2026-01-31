// services/wallet/TopUpOtp.js
import React, { useCallback, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Platform,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { WALLET_TOPUP_BASE } from "@env";
import { getValidAccessToken } from "../../utils/authToken";

const G = {
  grab: "#00B14F",
  grab2: "#00C853",
  text: "#0F172A",
  sub: "#6B7280",
  bg: "#F6F7F9",
  line: "#E5E7EB",
  danger: "#EF4444",
  ok: "#10B981",
  warn: "#F59E0B",
  white: "#ffffff",
  slate: "#0F172A",
};

const TOPUP_BASE = (WALLET_TOPUP_BASE || "").replace(/\/+$/, "");
const TOPUP_DEBIT_URL = `${TOPUP_BASE}/debit`;

/* ===================== timing controls ===================== */
const WAIT_BEFORE_DEBIT_MS = 600; // small wait for upstream readiness
const RETRY_ON_500_DELAY_MS = 1200; // retry delay if first call returns 500
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ===================== fetch helper (with raw logging) ===================== */
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

  const text = await res.text(); // ✅ keep raw response
  let json = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // not JSON
  }

  if (!res.ok) {
    const serverMsg =
      (json && (json.message || json.error || json.responseDesc)) ||
      (text && text.slice(0, 300)) ||
      `HTTP ${res.status}`;

    const err = new Error(serverMsg);
    err.status = res.status;
    err.raw = text;
    err.body = json;
    throw err;
  }

  return json ?? (text ? { raw: text } : {});
}

export default function TopUpOtpScreen() {
  const navigation = useNavigation();
  const route = useRoute();

  const wallet = route.params?.wallet || null;
  const amount = route.params?.amount || 0;
  const orderNo = route.params?.orderNo;

  const [otp, setOtp] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // ✅ status hint (Submitting / Retrying…)
  const [hint, setHint] = useState("");

  // ✅ warm token to reduce “first request fails then works” due to refresh race
  useEffect(() => {
    getValidAccessToken().catch(() => {});
  }, []);

  const onChangeOtp = useCallback((val) => {
    const clean = (val || "").replace(/[^0-9]/g, "").slice(0, 6);
    setOtp(clean);
  }, []);

  const onSubmit = useCallback(async () => {
    if (submitting) return;

    if (!orderNo) {
      Alert.alert("Error", "Missing order number.");
      return;
    }
    if (!otp || otp.length < 4) {
      Alert.alert("OTP required", "Please enter the OTP sent by your bank.");
      return;
    }

    setSubmitting(true);
    setHint("Submitting payment…");

    try {
      const payload = { orderNo, otp };

      // ✅ tiny wait (sometimes debit is called too fast after account-enquiry)
      await sleep(WAIT_BEFORE_DEBIT_MS);

      let res;
      try {
        res = await authFetch(TOPUP_DEBIT_URL, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      } catch (e) {
        console.log("[TopUpOtp] first debit error:", e?.status, e?.message);
        if (e?.raw) console.log("[TopUpOtp] first debit raw:", e.raw);

        // ✅ If first call returns 500, wait and retry ONCE
        if (Number(e?.status) === 500) {
          setHint("Server busy, retrying…");
          await sleep(RETRY_ON_500_DELAY_MS);

          setHint("Submitting again…");
          res = await authFetch(TOPUP_DEBIT_URL, {
            method: "POST",
            body: JSON.stringify(payload),
          });
        } else {
          throw e;
        }
      }

      const data = res?.data || res;
      const status = data?.status || "";
      const message =
        data?.message ||
        (status === "SUCCESS" ? "Payment successful." : "Payment failed.");

      setHint("");

      if (status === "SUCCESS") {
        Alert.alert("Top up successful", message, [
          {
            text: "OK",
            onPress: () => {
              navigation.navigate("Wallet");
            },
          },
        ]);
      } else {
        Alert.alert("Payment failed", message);
      }
    } catch (e) {
      console.log("[TopUpOtp] debit error:", e?.status, e?.message);
      if (e?.raw) console.log("[TopUpOtp] debit raw:", e.raw);

      setHint("");

      if (Number(e?.status) === 500) {
        Alert.alert(
          "Server busy",
          "Payment server is temporarily busy. Please try again."
        );
      } else {
        Alert.alert("Payment failed", String(e.message || e));
      }
    } finally {
      setSubmitting(false);
      setHint("");
    }
  }, [orderNo, otp, navigation, submitting]);

  return (
    <KeyboardAvoidingView
      style={styles.wrap}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <LinearGradient
        colors={["#46e693", "#40d9c2"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientHeader}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            disabled={submitting}
          >
            <Ionicons name="chevron-back" size={22} color={G.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Enter OTP</Text>
          <View style={{ width: 32 }} />
        </View>
        <Text style={styles.subHeader}>
          Amount: BTN {amount.toFixed ? amount.toFixed(2) : amount}
        </Text>
      </LinearGradient>

      <View style={styles.body}>
        <Text style={styles.label}>One-time password</Text>
        <TextInput
          style={styles.otpInput}
          value={otp}
          onChangeText={onChangeOtp}
          keyboardType="number-pad"
          maxLength={6}
          placeholder="••••••"
          placeholderTextColor="#CBD5E1"
          secureTextEntry
          editable={!submitting}
        />
        <Text style={styles.hint}>
          Enter the OTP you received from your bank to confirm this payment.
        </Text>

        {/* ✅ status hint row */}
        {submitting && !!hint ? (
          <View style={styles.hintRow}>
            <ActivityIndicator size="small" color={G.warn} />
            <Text style={styles.hintText}>{hint}</Text>
          </View>
        ) : null}

        <View style={{ flex: 1 }} />

        <TouchableOpacity
          style={[
            styles.primaryBtn,
            (otp.length < 4 || submitting) && styles.btnDisabled,
          ]}
          onPress={onSubmit}
          disabled={otp.length < 4 || submitting}
          activeOpacity={0.85}
        >
          {submitting ? (
            <ActivityIndicator size="small" color={G.white} />
          ) : (
            <Text style={styles.primaryText}>Confirm Payment</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: G.bg },
  gradientHeader: {
    paddingTop: Platform.OS === "android" ? 36 : 56,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { color: G.white, fontSize: 18, fontWeight: "800" },
  subHeader: {
    marginTop: 6,
    color: G.white,
    fontWeight: "600",
  },
  body: {
    flex: 1,
    padding: 16,
  },
  label: {
    color: G.slate,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 6,
  },
  otpInput: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: G.line,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 14,
    fontSize: 20,
    letterSpacing: 6,
    textAlign: "center",
    color: G.text,
  },
  hint: {
    marginTop: 8,
    color: "#64748B",
    fontSize: 12,
  },

  // ✅ status hint row
  hintRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  hintText: {
    color: G.sub,
    fontWeight: "700",
    fontSize: 13,
  },

  primaryBtn: {
    backgroundColor: G.grab,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 24,
  },
  primaryText: { color: G.white, fontWeight: "800", fontSize: 16 },
  btnDisabled: {
    opacity: 0.5,
  },
});
