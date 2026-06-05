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
  KeyboardAvoidingView,
  ScrollView,
  StatusBar,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { WALLET_TOPUP_BASE } from "@env";
import { getUserInfo, getValidAccessToken } from "../../utils/authToken";
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

const TOPUP_BASE     = (WALLET_TOPUP_BASE || "").replace(/\/+$/, "");
const TOPUP_INIT_URL = `${TOPUP_BASE}/init`;
const MAX_TOPUP_AMOUNT = 100000;

const QUICK_AMOUNTS = [100, 500, 1000, 5000];

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
  try   { json = text ? JSON.parse(text) : {}; }
  catch { json = { ok: false, message: "Invalid JSON", raw: text }; }
  if (!res.ok) throw new Error(json?.message || `HTTP ${res.status}`);
  return json;
}

export default function TopUpScreen() {
  const navigation = useNavigation();
  const { showAlert, alertNode } = useAlert();
  const route      = useRoute();
  const wallet     = route.params?.wallet    || null;
  const passedUserId = route.params?.user_id || null;

  const [user,       setUser]       = useState(null);
  const [amount,     setAmount]     = useState("");
  const [note,       setNote]       = useState("");
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
    return () => { alive = false; };
  }, []);

  const onChangeAmount = useCallback((val) => {
    setAmount((val || "").replace(/[^0-9.]/g, ""));
  }, []);

  const onPickQuick = useCallback((n) => setAmount(String(n)), []);

  const onContinue = useCallback(async () => {
    const trimmed = (amount || "").trim();
    if (trimmed && !/^\d+(\.\d{1,2})?$/.test(trimmed)) {
      showAlert({ type: "warn", title: "Invalid amount", message: "Enter a valid amount with up to 2 decimal places.", primaryLabel: "OK" });
      return;
    }
    const num = Number(trimmed);
    if (!num || !isFinite(num) || num <= 0) {
      showAlert({ type: "warn", title: "Invalid amount", message: "Please enter a valid amount.", primaryLabel: "OK" });
      return;
    }
    if (num < 10) {
      showAlert({ type: "warn", title: "Minimum amount", message: "Please top up at least BTN 10.00.", primaryLabel: "OK" });
      return;
    }
    if (num > MAX_TOPUP_AMOUNT) {
      showAlert({ type: "warn", title: "Maximum amount exceeded", message: `Single top-up cannot exceed BTN ${MAX_TOPUP_AMOUNT.toLocaleString("en-IN")}.`, primaryLabel: "OK" });
      return;
    }

    const me = user || (await getUserInfo());
    const userId = passedUserId || me?.user_id || me?.id || wallet?.user_id || null;

    if (!userId) {
      showAlert({ type: "error", title: "Error", message: "Could not determine your user ID. Please log in again.", primaryLabel: "OK" });
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
      const res  = await authFetch(TOPUP_INIT_URL, { method: "POST", body: JSON.stringify(payload) });
      const data = res?.data || res;
      const { orderNo, bfsTxnId, bankList } = data || {};

      if (!orderNo || !bfsTxnId || !Array.isArray(bankList)) {
        throw new Error("Invalid response from topup server.");
      }

      navigation.navigate("TopUpBank", {
        wallet, user_id: userId, amount: num,
        note: payload.description, orderNo, bfsTxnId, bankList,
      });
    } catch (e) {
      showAlert({ type: "error", title: "Top up failed", message: String(e.message || e), primaryLabel: "OK" });
    } finally {
      setSubmitting(false);
    }
  }, [amount, note, user, passedUserId, wallet, navigation, showAlert]);

  const numericAmount = Number(amount) || 0;

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
            <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Top Up Wallet</Text>
            <View style={{ width: 38 }} />
          </View>
        </LinearGradient>

        {/* ── Body ── */}
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Amount input card */}
          <View style={styles.amountCard}>
            <Text style={styles.amountCardLabel}>Enter Amount</Text>
            <View style={styles.amountRow}>
              <Text style={styles.currencyLabel}>BTN</Text>
              <TextInput
                style={styles.amountInput}
                keyboardType="numeric"
                value={amount}
                onChangeText={onChangeAmount}
                placeholder="0.00"
                placeholderTextColor="#CBD5E1"
                autoFocus
              />
            </View>
            {numericAmount > 0 && (
              <Text style={styles.amountWords}>
                {numericAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Ngultrum
              </Text>
            )}
          </View>

          {/* Quick amounts */}
          <Text style={styles.sectionLabel}>Quick Select</Text>
          <View style={styles.quickRow}>
            {QUICK_AMOUNTS.map((n) => {
              const active = amount === String(n);
              return (
                <TouchableOpacity
                  key={n}
                  style={[styles.quickChip, active && styles.quickChipActive]}
                  onPress={() => onPickQuick(n)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.quickChipText, active && styles.quickChipTextActive]}>
                    {n >= 1000 ? `${n / 1000}K` : n}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Note */}
          <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Note (optional)</Text>
          <TextInput
            style={styles.noteInput}
            placeholder="e.g. Wallet top up"
            placeholderTextColor="#94A3B8"
            value={note}
            onChangeText={setNote}
            maxLength={60}
          />

          {/* Info banner */}
          <View style={styles.infoBanner}>
            <Ionicons name="information-circle-outline" size={16} color="#64748B" />
            <Text style={styles.infoText}>
              This amount will be debited from your bank and credited to your wallet.
            </Text>
          </View>

          {/* Continue button */}
          <TouchableOpacity
            style={[styles.continueBtn, (!amount || submitting) && styles.btnDisabled]}
            onPress={onContinue}
            disabled={!amount || submitting}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Text style={styles.continueBtnText}>Continue</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
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
    paddingBottom: 16,
  },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "800" },

  /* ── Body ── */
  body: {
    padding: 20,
    paddingBottom: 36,
  },

  /* ── Amount card ── */
  amountCard: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 20,
  },
  amountCardLabel: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  amountRow: { flexDirection: "row", alignItems: "center" },
  currencyLabel: {
    color: G.grab,
    fontWeight: "800",
    fontSize: 18,
    marginRight: 10,
  },
  amountInput: {
    flex: 1,
    fontSize: 32,
    fontWeight: "800",
    color: "#0F172A",
    padding: 0,
  },
  amountWords: {
    marginTop: 8,
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "600",
  },

  /* ── Quick amounts ── */
  sectionLabel: { color: "#1E293B", fontSize: 13, fontWeight: "700", marginBottom: 10 },
  quickRow: { flexDirection: "row", gap: 10 },
  quickChip: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    backgroundColor: "#fff",
    alignItems: "center",
  },
  quickChipActive: { borderColor: G.grab, backgroundColor: "#F5F3FF" },
  quickChipText: { color: "#64748B", fontWeight: "700", fontSize: 13 },
  quickChipTextActive: { color: G.grab },

  /* ── Note ── */
  noteInput: {
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#1E293B",
    fontSize: 14,
  },

  /* ── Info banner ── */
  infoBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
  },
  infoText: { color: "#64748B", fontSize: 12, flex: 1, lineHeight: 18 },

  /* ── Continue button ── */
  continueBtn: {
    backgroundColor: G.grab,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 20,
  },
  continueBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  btnDisabled: { opacity: 0.45 },
});
