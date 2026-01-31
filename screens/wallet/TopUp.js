// services/wallet/TopUp.js
import React, { useCallback, useEffect, useState } from "react";
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
import { getUserInfo, getValidAccessToken } from "../../utils/authToken";

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
const TOPUP_INIT_URL = `${TOPUP_BASE}/init`;

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
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { ok: false, message: "Invalid JSON", raw: text };
  }
  if (!res.ok) {
    const msg = json?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

export default function TopUpScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const wallet = route.params?.wallet || null;
  const passedUserId = route.params?.user_id || null;

  const [user, setUser] = useState(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const me = await getUserInfo();
        if (!alive) return;
        setUser(me || null);
      } catch (e) {
        console.log("[TopUp] getUserInfo error:", e?.message || e);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const onChangeAmount = useCallback((val) => {
    const clean = (val || "").replace(/[^0-9.]/g, "");
    setAmount(clean);
  }, []);

  const onContinue = useCallback(async () => {
    const num = Number(amount);
    if (!num || !isFinite(num) || num <= 0) {
      Alert.alert("Invalid amount", "Please enter a valid amount.");
      return;
    }
    if (num < 10) {
      Alert.alert(
        "Minimum amount",
        "Please top up at least BTN 10.00."
      );
      return;
    }

    const me = user || (await getUserInfo());
    const userId =
      passedUserId || me?.user_id || me?.id || wallet?.user_id || null;

    if (!userId) {
      Alert.alert(
        "Error",
        "Could not determine your user ID. Please log in again."
      );
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        userId,
        amount: num,
        email: me?.email || me?.user_email || "",
        description: note || "Wallet topup",
      };

      const res = await authFetch(TOPUP_INIT_URL, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const data = res?.data || res;
      console.log("[TopUp] init response data:", data);
      const { orderNo, bfsTxnId, bankList } = data || {};

      if (!orderNo || !bfsTxnId || !Array.isArray(bankList)) {
        throw new Error("Invalid response from topup server.");
      }

      navigation.navigate("TopUpBank", {
        wallet,
        user_id: userId,
        amount: num,
        note: payload.description,
        orderNo,
        bfsTxnId,
        bankList,
      });
    } catch (e) {
      console.log("[TopUp] init error:", e?.message || e);
      Alert.alert("Top up failed", String(e.message || e));
    } finally {
      setSubmitting(false);
    }
  }, [amount, note, user, passedUserId, wallet, navigation]);

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
          >
            <Ionicons name="chevron-back" size={22} color={G.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Top Up Wallet</Text>
          <View style={{ width: 32 }} />
        </View>
      </LinearGradient>

      <View style={styles.body}>
        <Text style={styles.label}>Enter amount</Text>
        <View style={styles.amountRow}>
          <Text style={styles.currency}>BTN</Text>
          <TextInput
            style={styles.amountInput}
            keyboardType="numeric"
            value={amount}
            onChangeText={onChangeAmount}
            placeholder="0.00"
            placeholderTextColor="#CBD5E1"
          />
        </View>
        <Text style={styles.hint}>
          This amount will be debited from your bank and added to your wallet.
        </Text>

        <Text style={[styles.label, { marginTop: 20 }]}>
          Note (optional)
        </Text>
        <TextInput
          style={styles.noteInput}
          placeholder="e.g. Ride wallet top up"
          placeholderTextColor="#94A3B8"
          value={note}
          onChangeText={setNote}
          maxLength={60}
        />

        <View style={{ flex: 1 }} />

        <TouchableOpacity
          style={[
            styles.primaryBtn,
            (!amount || submitting) && styles.btnDisabled,
          ]}
          onPress={onContinue}
          disabled={!amount || submitting}
          activeOpacity={0.85}
        >
          {submitting ? (
            <ActivityIndicator size="small" color={G.white} />
          ) : (
            <Text style={styles.primaryText}>Continue</Text>
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
    paddingTop: 14,
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { color: G.white, fontSize: 18, fontWeight: "800" },
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
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: G.line,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  currency: {
    color: "#64748B",
    fontWeight: "700",
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    fontSize: 20,
    fontWeight: "800",
    color: G.text,
  },
  hint: {
    marginTop: 6,
    color: "#64748B",
    fontSize: 12,
  },
  noteInput: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: G.line,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: G.text,
  },
  primaryBtn: {
    backgroundColor: G.grab,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 24,
  },
  primaryText: { color: G.white, fontWeight: "800", fontSize: 16 },
  btnDisabled: { opacity: 0.5 },
});
