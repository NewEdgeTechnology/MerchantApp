// services/wallet/WalletTransfer.js
import React, { useCallback, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Platform,
  Modal,
  KeyboardAvoidingView,
  StatusBar,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import * as LocalAuthentication from "expo-local-authentication";
import { getValidAccessToken } from "../../utils/authToken";
import { useAlert } from "../../components/CustomAlert";
import { C } from "../../theme";

/* ========= tokens ========= */
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

/* ========= endpoints ========= */
const TRANSFER_URL = "https://backend.tabdhey.bt/wallet/wallet/transfer";
const GET_RECIPIENT_USERNAME = (walletId) =>
  `https://backend.tabdhey.bt/wallet/wallet/${walletId}/user-name`;

/* ========= tiny helpers ========= */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function authFetch(url, opts = {}) {
  const token = await getValidAccessToken();
  const baseHeaders = { "Content-Type": "application/json" };
  const headers = token
    ? { ...baseHeaders, Authorization: `Bearer ${token}` }
    : baseHeaders;

  return fetch(url, {
    ...opts,
    headers: { ...(opts.headers || {}), ...headers },
  });
}

async function fetchJson(url, opts) {
  const res = await authFetch(url, opts);
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { success: false, message: "Invalid JSON", raw: text };
  }
  if (!res.ok) {
    const msg = json?.message || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.raw = json;
    throw err;
  }
  return json;
}

/**
 * Some servers “wake up” and first call returns 500.
 * This retries ONLY for HTTP 500 (once), with a short delay.
 */
async function fetchJsonWithWarmupRetry(url, opts, delayMs = 900) {
  try {
    return await fetchJson(url, opts);
  } catch (e) {
    const status = e?.status || 0;
    if (status === 500) {
      await sleep(delayMs);
      return await fetchJson(url, opts);
    }
    throw e;
  }
}

/* ========= screen ========= */
export default function WalletTransferScreen() {
  const nav = useNavigation();
  const route = useRoute();
  const { showAlert, alertNode } = useAlert();

  const walletFromParams = route?.params?.wallet || null;
  const senderWalletId =
    walletFromParams?.wallet_id || route?.params?.wallet_id || "";

  console.log("[WalletTransfer] senderWalletId:", senderWalletId);

  // 👇 QR payload from ScanQR (optional)
  const qrPayload = route?.params?.qrPayload || null;

  console.log("[WalletTransfer] qr: ", qrPayload, "from params:", walletFromParams);

  // store only suffix – UI shows NET + suffix
  const [recipientSuffix, setRecipientSuffix] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [note, setNote] = useState("Transfer");

  const [submitting, setSubmitting] = useState(false);

  // TPIN modal state
  const [tpinModalVisible, setTpinModalVisible] = useState(false);
  const [tpin, setTpin] = useState("");
  const [tpinSubmitting, setTpinSubmitting] = useState(false);

  // TPIN attempts & lock
  const [tpinAttempts, setTpinAttempts] = useState(0);
  const [tpinLockedUntil, setTpinLockedUntil] = useState(null); // timestamp (ms)
  const [lockSecondsLeft, setLockSecondsLeft] = useState(0);

  // Recipient username
  const [recipientName, setRecipientName] = useState("");
  const [recipientLoading, setRecipientLoading] = useState(false);
  const [recipientError, setRecipientError] = useState("");

  // biometric state
  const [bioChecking, setBioChecking] = useState(false);

  const handleBack = () => {
    try {
      nav.goBack();
    } catch {}
  };

  const onChangeAmount = (val) => {
    const cleaned = (val || "").replace(/[^0-9.]/g, "");
    const parts = cleaned.split(".");
    if (parts.length > 2) {
      const fixed = parts[0] + "." + parts.slice(1).join("");
      setAmountStr(fixed);
    } else {
      setAmountStr(cleaned);
    }
  };

  const onChangeTPIN = (val) =>
    setTpin((val || "").replace(/[^0-9]/g, "").slice(0, 4));

  // Recipient wallet – limit total to 9 chars ("NET" + 6 digits)
  const onChangeRecipient = (val) => {
    const upper = (val || "").toUpperCase();

    // Remove "TD" if present
    let body = upper.startsWith("TD") ? upper.slice(2) : upper;

    // Keep digits only and limit to 10 → "TD" + 8 = 10 total
    body = body.replace(/[^0-9]/g, "").slice(0,8);
    console.log("Recipient wallet input changed:", val, "cleaned to:", body);

    setRecipientSuffix(body);
  };

  console.log("Recipient suffix:", recipientSuffix);

  const fullRecipientId = recipientSuffix ? `TD${recipientSuffix}` : "";
  console.log("Full recipient wallet ID:", fullRecipientId);  

  /* ========= Prefill from QR payload ========= */
  useEffect(() => {
    if (!qrPayload) return;

    const kind = qrPayload.kind || qrPayload.type || "";

    if (kind === "user_wallet" || !kind) {
      if (qrPayload.walletId) {
        const upper = String(qrPayload.walletId).toUpperCase();
        let body = upper.startsWith("TD") ? upper.slice(2) : upper;
        body = body.replace(/[^0-9]/g, "").slice(0, 8);
        setRecipientSuffix(body);
      }

      if (typeof qrPayload.amount === "number") {
        setAmountStr(String(qrPayload.amount));
      }

      if (qrPayload.note) {
        setNote(String(qrPayload.note));
      }

      if (qrPayload.userName) {
        setRecipientName(String(qrPayload.userName));
      }
    }
  }, [qrPayload]);

  /* ========= Recipient username lookup ========= */
  useEffect(() => {
    setRecipientName("");
    setRecipientError("");

    if (!fullRecipientId || fullRecipientId.length !== 10) {
      setRecipientLoading(false);
      return;
    }

    let alive = true;
    (async () => {
      setRecipientLoading(true);
      try {
        const res = await fetchJsonWithWarmupRetry(
          GET_RECIPIENT_USERNAME(fullRecipientId),
          undefined,
          700,
        );
        console.log("[WalletTransfer] recipient lookup result:", res);
        if (!alive) return;

        if (res?.success && res?.data?.user_name) {
          setRecipientName(String(res.data.user_name));
          setRecipientError("");
        } else {
          setRecipientName("");
          setRecipientError("User not found for this wallet ID.");
        }
      } catch (e) {
        if (!alive) return;
        setRecipientName("");
        setRecipientError(
          e?.message ||
            "Could not fetch recipient details. Please check the ID.",
        );
      } finally {
        if (alive) setRecipientLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [fullRecipientId]);

  /* ========= TPIN lock countdown ========= */
  useEffect(() => {
    if (!tpinLockedUntil) return;

    const timer = setInterval(() => {
      const diffMs = tpinLockedUntil - Date.now();
      const secs = Math.max(0, Math.floor(diffMs / 1000));
      setLockSecondsLeft(secs);

      if (secs <= 0) {
        setTpinLockedUntil(null);
        setTpinAttempts(0);
        setLockSecondsLeft(0);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [tpinLockedUntil]);

  const validateBeforePay = useCallback(() => {
    if (!senderWalletId) {
      showAlert({ type: "error", title: "Error", message: "Sender wallet ID missing.", primaryLabel: "OK" });
      return false;
    }
    if (!recipientSuffix.trim()) {
      showAlert({ type: "warn", title: "Missing field", message: "Please enter recipient wallet ID.", primaryLabel: "OK" });
      return false;
    }
    if (fullRecipientId === senderWalletId.trim()) {
      showAlert({ type: "warn", title: "Invalid recipient", message: "You cannot transfer to the same wallet.", primaryLabel: "OK" });
      return false;
    }
    const amt = parseFloat(amountStr);
    if (!Number.isFinite(amt) || amt <= 0) {
      showAlert({ type: "warn", title: "Invalid amount", message: "Please enter a valid amount greater than 0.", primaryLabel: "OK" });
      return false;
    }
    return true;
  }, [senderWalletId, recipientSuffix, fullRecipientId, amountStr, showAlert]);

  /**
   * Calls backend transfer.
   * - biometric=true -> t_pin:null
   * - biometric=false -> t_pin:"1234"
   */
  const doTransfer = useCallback(
    async ({ biometric, t_pin }) => {
      const amt = parseFloat(amountStr);

      const payload = {
        sender_wallet_id: senderWalletId,
        recipient_wallet_id: fullRecipientId,
        amount: amt,
        note: note?.trim() || "Transfer",

        // ✅ as you requested
        biometric: !!biometric,
        t_pin: biometric ? null : String(t_pin || ""),
      };

      console.log("[WalletTransfer] payload:", payload);

      // warmup wait + retry for first 500
      const res = await fetchJsonWithWarmupRetry(
        TRANSFER_URL,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
        900,
      );

      if (!res?.success) {
        throw new Error(res?.message || "Transfer failed.");
      }

      const tx = res?.data || {};
      const createdAt =
        tx.created_at_local || tx.created_at || new Date().toISOString();

      nav.navigate("WalletTransferSuccess", {
        amount: amt,
        senderWalletId,
        recipientWalletId: fullRecipientId,
        recipientName,
        journalCode: tx.journal_code || "",
        transactionId: tx.transaction_id || "",
        note: payload.note,
        createdAt,
      });
    },
    [amountStr, senderWalletId, fullRecipientId, note, nav, recipientName],
  );

  /**
   * Try biometric payment first.
   * If device can't do biometrics OR auth fails -> fallback to TPIN modal.
   */
  const handleContinue = useCallback(async () => {
    if (!validateBeforePay()) return;

    setSubmitting(true);

    try {
      // Check biometric availability
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware || !isEnrolled) {
        // fallback to TPIN
        setSubmitting(false);
        setTpin("");
        setTpinModalVisible(true);
        return;
      }

      // Run biometric auth
      setBioChecking(true);
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Confirm wallet transfer",
        fallbackLabel: "Use device passcode",
        cancelLabel: "Cancel",
      });
      setBioChecking(false);

      if (!result?.success) {
        // fallback to TPIN
        setSubmitting(false);
        setTpin("");
        setTpinModalVisible(true);
        return;
      }

      // ✅ biometric success -> call API with biometric:true + t_pin:null
      await doTransfer({ biometric: true, t_pin: null });
    } catch (e) {
      console.log(
        "[WalletTransfer] biometric/transfer error:",
        e?.message || e,
      );
      // fallback to TPIN on any unexpected error
      setTpin("");
      setTpinModalVisible(true);
    } finally {
      setBioChecking(false);
      setSubmitting(false);
    }
  }, [validateBeforePay, doTransfer]);

  const handleConfirmWithTPIN = useCallback(async () => {
    // If locked, block immediately
    if (tpinLockedUntil && lockSecondsLeft > 0) {
      showAlert({ type: "warn", title: "Too many attempts", message: `Please wait ${lockSecondsLeft} seconds before trying again.`, primaryLabel: "OK" });
      return;
    }

    if (!validateBeforePay()) return;

    if (tpin.length !== 4) {
      showAlert({ type: "warn", title: "Invalid TPIN", message: "Please enter your 4-digit TPIN.", primaryLabel: "OK" });
      return;
    }

    setTpinSubmitting(true);
    try {
      // ✅ TPIN flow -> biometric false + t_pin value
      await doTransfer({ biometric: false, t_pin: tpin });

      // reset attempts/lock and close modal
      setTpinAttempts(0);
      setTpinLockedUntil(null);
      setLockSecondsLeft(0);
      setTpinModalVisible(false);
    } catch (e) {
      setTpinAttempts((prev) => {
        const next = prev + 1;

        if (next >= 3) {
          const LOCK_SECONDS = 30;
          const until = Date.now() + LOCK_SECONDS * 1000;
          setTpinLockedUntil(until);
          setLockSecondsLeft(LOCK_SECONDS);

          showAlert({ type: "warn", title: "Too many attempts", message: `You have entered an incorrect TPIN too many times. Please wait ${LOCK_SECONDS} seconds before trying again.`, primaryLabel: "OK" });
        } else {
          showAlert({ type: "error", title: "Transfer failed", message: String(e.message || "Transfer error."), primaryLabel: "OK" });
        }

        return next;
      });
    } finally {
      setTpinSubmitting(false);
    }
  }, [tpin, validateBeforePay, doTransfer, tpinLockedUntil, lockSecondsLeft, showAlert]);

  const locked = !!tpinLockedUntil && lockSecondsLeft > 0;

  return (
    <View style={styles.wrap}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* ── Flat header with safe area ── */}
      <LinearGradient
        colors={C.gradBrand}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <TouchableOpacity onPress={handleBack} style={styles.backBtn} activeOpacity={0.8}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Transfer</Text>
          {!!senderWalletId && (
            <Text style={styles.headerSub}>From {senderWalletId}</Text>
          )}
        </View>
        <View style={{ width: 38 }} />
      </LinearGradient>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

          {/* ── Section: Recipient ── */}
          <Text style={styles.sectionLabel}>Recipient</Text>
          <View style={styles.field}>
            <Ionicons name="wallet-outline" size={18} color={G.sub} style={styles.fieldIcon} />
            <TextInput
              value={fullRecipientId}
              onChangeText={onChangeRecipient}
              autoCapitalize="characters"
              autoCorrect={false}
              style={styles.fieldInput}
              placeholder="Wallet ID  e.g. TD00000000"
              placeholderTextColor="#CBD5E1"
              maxLength={10}
            />
          </View>

          {/* Recipient status */}
          {recipientLoading ? (
            <View style={styles.recipientRow}>
              <ActivityIndicator size="small" color={G.grab} />
              <Text style={styles.recipientHint}>Looking up account…</Text>
            </View>
          ) : recipientName ? (
            <View style={styles.recipientRow}>
              <View style={styles.recipientBadge}>
                <Ionicons name="checkmark-circle" size={16} color={G.ok} />
                <Text style={styles.recipientName}>{recipientName}</Text>
              </View>
            </View>
          ) : recipientError ? (
            <View style={styles.recipientRow}>
              <Ionicons name="alert-circle-outline" size={15} color={G.danger} />
              <Text style={styles.recipientErr}>{recipientError}</Text>
            </View>
          ) : null}

          <View style={styles.divider} />

          {/* ── Section: Amount ── */}
          <Text style={styles.sectionLabel}>Amount</Text>
          <View style={styles.amountRow}>
            <Text style={styles.currencyLabel}>BTN</Text>
            <TextInput
              value={amountStr}
              onChangeText={onChangeAmount}
              keyboardType="decimal-pad"
              style={styles.amountInput}
              placeholder="0.00"
              placeholderTextColor="#CBD5E1"
            />
          </View>

          <View style={styles.divider} />

          {/* ── Section: Note ── */}
          <Text style={styles.sectionLabel}>Note  <Text style={styles.optionalTag}>optional</Text></Text>
          <View style={styles.field}>
            <Ionicons name="create-outline" size={18} color={G.sub} style={styles.fieldIcon} />
            <TextInput
              value={note}
              onChangeText={setNote}
              style={styles.fieldInput}
              placeholder="What's this for?"
              placeholderTextColor="#CBD5E1"
            />
          </View>

          <View style={styles.divider} />

          {/* ── Info notice ── */}
          <View style={styles.notice}>
            <Ionicons name="lock-closed-outline" size={14} color={G.sub} />
            <Text style={styles.noticeText}>
              Transfers are instant and irreversible. Double-check the wallet ID before confirming.
            </Text>
          </View>

          {/* ── CTA ── */}
          <TouchableOpacity
            style={[styles.ctaBtn, (submitting || bioChecking) && styles.ctaBtnDisabled]}
            activeOpacity={0.88}
            disabled={submitting || bioChecking}
            onPress={handleContinue}
          >
            {submitting || bioChecking ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="arrow-forward-circle-outline" size={20} color="#fff" />
                <Text style={styles.ctaBtnText}>Continue</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={styles.hint}>
            We'll verify with biometrics first. TPIN used as fallback.
          </Text>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── TPIN Modal ── */}
      <Modal
        visible={tpinModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setTpinModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            {/* Handle */}
            <View style={styles.sheetHandle} />

            <View style={styles.sheetIconWrap}>
              <Ionicons name="keypad-outline" size={28} color={G.grab} />
            </View>
            <Text style={styles.sheetTitle}>Enter TPIN</Text>
            <Text style={styles.sheetSubtitle}>
              Confirm this transfer with your 4-digit wallet TPIN.
            </Text>

            <TextInput
              value={tpin}
              onChangeText={onChangeTPIN}
              keyboardType="number-pad"
              maxLength={4}
              secureTextEntry
              style={styles.pinInput}
              placeholder="• • • •"
              placeholderTextColor="#CBD5E1"
              autoFocus
            />

            {locked && (
              <Text style={styles.lockText}>
                Too many attempts — wait {lockSecondsLeft}s
              </Text>
            )}

            <TouchableOpacity
              style={[
                styles.sheetConfirmBtn,
                (tpinSubmitting || tpin.length !== 4 || locked) && styles.ctaBtnDisabled,
              ]}
              onPress={handleConfirmWithTPIN}
              disabled={tpinSubmitting || tpin.length !== 4 || locked}
            >
              {tpinSubmitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.ctaBtnText}>{locked ? "Locked" : "Confirm Transfer"}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sheetCancelBtn}
              onPress={() => setTpinModalVisible(false)}
              disabled={tpinSubmitting}
            >
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {alertNode}
    </View>
  );
}

/* ========= styles ========= */
const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "#F8FAFC" },

  /* header */
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: Platform.OS === "android" ? 44 : 58,
    paddingBottom: 16,
    paddingHorizontal: 16,
    gap: 8,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "800" },
  headerSub:   { color: "rgba(255,255,255,0.75)", fontSize: 11, fontWeight: "500", marginTop: 2 },

  /* scroll body */
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 28, paddingBottom: 40 },

  sectionLabel: {
    fontSize: 11, fontWeight: "700", color: "#94A3B8",
    textTransform: "uppercase", letterSpacing: 0.8,
    marginBottom: 10,
  },
  optionalTag: {
    fontSize: 10, fontWeight: "500", color: "#CBD5E1",
    textTransform: "none", letterSpacing: 0,
  },

  /* flat field row */
  field: {
    flexDirection: "row", alignItems: "center",
    gap: 10,
  },
  fieldIcon: { marginTop: 2 },
  fieldInput: {
    flex: 1, fontSize: 15, color: G.text,
    paddingVertical: 4,
  },

  /* recipient status */
  recipientRow: {
    flexDirection: "row", alignItems: "center",
    gap: 6, marginTop: 8,
  },
  recipientBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "#ECFDF5", borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  recipientName: { color: "#059669", fontWeight: "700", fontSize: 13 },
  recipientHint: { color: "#64748B", fontSize: 12 },
  recipientErr:  { color: G.danger, fontSize: 12, fontWeight: "600", flex: 1 },

  divider: {
    height: 1, backgroundColor: "#F1F5F9",
    marginVertical: 22,
  },

  /* big amount input */
  amountRow: {
    flexDirection: "row", alignItems: "flex-end", gap: 8,
  },
  currencyLabel: {
    fontSize: 22, fontWeight: "700", color: "#94A3B8",
    paddingBottom: 4,
  },
  amountInput: {
    flex: 1, fontSize: 36, fontWeight: "800",
    color: G.text, paddingVertical: 0,
  },

  /* notice */
  notice: {
    flexDirection: "row", alignItems: "flex-start",
    gap: 8, marginBottom: 28,
  },
  noticeText: { flex: 1, fontSize: 12, color: "#94A3B8", lineHeight: 18 },

  /* CTA button */
  ctaBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, backgroundColor: G.grab,
    borderRadius: 16, paddingVertical: 16,
  },
  ctaBtnDisabled: { opacity: 0.45 },
  ctaBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },

  hint: {
    marginTop: 14, textAlign: "center",
    fontSize: 12, color: "#94A3B8",
  },

  /* TPIN bottom sheet modal */
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 24, paddingBottom: 40, paddingTop: 12,
    alignItems: "center",
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: "#E2E8F0", marginBottom: 20,
  },
  sheetIconWrap: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: C.brandBg,
    alignItems: "center", justifyContent: "center",
    marginBottom: 14,
  },
  sheetTitle:    { fontSize: 18, fontWeight: "800", color: G.text, marginBottom: 6 },
  sheetSubtitle: { fontSize: 13, color: "#64748B", textAlign: "center", marginBottom: 24, lineHeight: 20 },

  pinInput: {
    width: "100%",
    borderBottomWidth: 2, borderBottomColor: G.line,
    fontSize: 28, letterSpacing: 16, textAlign: "center",
    color: G.text, paddingVertical: 10,
    marginBottom: 8,
  },
  lockText: {
    fontSize: 12, color: G.danger, fontWeight: "600",
    marginBottom: 12, textAlign: "center",
  },
  sheetConfirmBtn: {
    width: "100%", backgroundColor: G.grab,
    borderRadius: 16, paddingVertical: 15,
    alignItems: "center", marginTop: 24,
  },
  sheetCancelBtn: { marginTop: 14, paddingVertical: 8 },
  sheetCancelText: { fontSize: 14, fontWeight: "600", color: "#64748B" },
});
