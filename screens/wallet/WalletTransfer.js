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
  Alert,
  Platform,
  Modal,
  KeyboardAvoidingView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { getValidAccessToken } from "../../utils/authToken";

/* ========= tokens ========= */
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

/* ========= endpoints ========= */
const TRANSFER_URL = "https://grab.newedge.bt/wallet/wallet/transfer";
const GET_RECIPIENT_USERNAME = (walletId) =>
  `https://grab.newedge.bt/wallet/wallet/${walletId}/user-name`;

/* ========= networking helpers ========= */
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
    throw new Error(msg);
  }
  return json;
}

/* ========= screen ========= */
export default function WalletTransferScreen() {
  const nav = useNavigation();
  const route = useRoute();

  const walletFromParams = route?.params?.wallet || null;
  const senderWalletId =
    walletFromParams?.wallet_id || route?.params?.wallet_id || "";

  // 👇 QR payload from ScanQR (optional)
  const qrPayload = route?.params?.qrPayload || null;

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

    // Remove "NET" if present
    let body = upper.startsWith("NET") ? upper.slice(3) : upper;

    // Keep digits only and limit to 6 → "NET" + 6 = 9 total
    body = body.replace(/[^0-9]/g, "").slice(0, 6);

    setRecipientSuffix(body);
  };

  const fullRecipientId = recipientSuffix ? `NET${recipientSuffix}` : "";

  /* ========= Prefill from QR payload (walletId, userName, amount, note) ========= */
  useEffect(() => {
    if (!qrPayload) return;

    // We encoded this in WalletMyQR:
    // { kind: "user_wallet", walletId, userName, userId, amount?, note? }
    const kind = qrPayload.kind || qrPayload.type || "";

    if (kind === "user_wallet" || !kind) {
      if (qrPayload.walletId) {
        const upper = String(qrPayload.walletId).toUpperCase();
        let body = upper.startsWith("NET") ? upper.slice(3) : upper;
        body = body.replace(/[^0-9]/g, "").slice(0, 6);
        setRecipientSuffix(body);
      }

      if (typeof qrPayload.amount === "number") {
        setAmountStr(String(qrPayload.amount));
      }

      if (qrPayload.note) {
        setNote(String(qrPayload.note));
      }

      // optional: prefill recipientName from QR (backend lookup will still run)
      if (qrPayload.userName) {
        setRecipientName(String(qrPayload.userName));
      }
    }
  }, [qrPayload]);

  /* ========= Recipient username lookup ========= */
  useEffect(() => {
    // Reset whenever input changes
    setRecipientName("");
    setRecipientError("");

    // Only fetch when full ID is complete (NET + 6 digits = 9 chars)
    if (!fullRecipientId || fullRecipientId.length !== 9) {
      setRecipientLoading(false);
      return;
    }

    let alive = true;
    (async () => {
      setRecipientLoading(true);
      try {
        const res = await fetchJson(GET_RECIPIENT_USERNAME(fullRecipientId));
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
          e?.message || "Could not fetch recipient details. Please check the ID."
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
        // unlock
        setTpinLockedUntil(null);
        setTpinAttempts(0);
        setLockSecondsLeft(0);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [tpinLockedUntil]);

  const handleOpenTPINModal = () => {
    if (!senderWalletId) {
      Alert.alert("Error", "Sender wallet ID missing.");
      return;
    }
    if (!recipientSuffix.trim()) {
      Alert.alert("Missing field", "Please enter recipient wallet ID.");
      return;
    }

    if (fullRecipientId === senderWalletId.trim()) {
      Alert.alert(
        "Invalid recipient",
        "You cannot transfer to the same wallet."
      );
      return;
    }

    const amt = parseFloat(amountStr);
    if (!Number.isFinite(amt) || amt <= 0) {
      Alert.alert("Invalid amount", "Please enter a valid amount greater than 0.");
      return;
    }

    setTpin("");
    setTpinModalVisible(true);
  };

  const handleConfirmTransfer = useCallback(async () => {
    // If locked, block immediately
    if (tpinLockedUntil && lockSecondsLeft > 0) {
      Alert.alert(
        "Too many attempts",
        `Please wait ${lockSecondsLeft} seconds before trying again.`
      );
      return;
    }

    if (!senderWalletId) {
      Alert.alert("Error", "Sender wallet ID missing.");
      return;
    }

    if (!recipientSuffix.trim()) {
      Alert.alert("Missing field", "Please enter recipient wallet ID.");
      return;
    }

    const recipient = fullRecipientId;
    const amt = parseFloat(amountStr);

    if (!Number.isFinite(amt) || amt <= 0) {
      Alert.alert("Invalid amount", "Please enter a valid amount greater than 0.");
      return;
    }
    if (tpin.length !== 4) {
      Alert.alert("Invalid TPIN", "Please enter your 4-digit TPIN.");
      return;
    }

    setTpinSubmitting(true);
    try {
      const payload = {
        sender_wallet_id: senderWalletId,
        recipient_wallet_id: recipient,
        amount: amt,
        note: note?.trim() || "Transfer",
        t_pin: tpin,
      };

      console.log("[WalletTransfer] payload:", payload);

      const res = await fetchJson(TRANSFER_URL, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (!res?.success) {
        throw new Error(res?.message || "Transfer failed.");
      }

      // On success, reset attempts & lock
      setTpinAttempts(0);
      setTpinLockedUntil(null);
      setLockSecondsLeft(0);
      setTpinModalVisible(false);

      // try to read tx info from response (adjust as per your actual API)
      const tx = res?.data || {};
      const createdAt =
        tx.created_at_local || tx.created_at || new Date().toISOString();

      // Navigate to pretty receipt screen
      nav.navigate("WalletTransferSuccess", {
        amount: amt,
        senderWalletId,
        recipientWalletId: recipient,
        recipientName, // from your state (username lookup)
        journalCode: tx.journal_code || "",
        transactionId: tx.transaction_id || "",
        note: payload.note,
        createdAt,
      });
    } catch (e) {
      // Count this as a failed TPIN attempt
      setTpinAttempts((prev) => {
        const next = prev + 1;

        if (next >= 3) {
          // Lock for 30 seconds
          const LOCK_SECONDS = 30;
          const until = Date.now() + LOCK_SECONDS * 1000;
          setTpinLockedUntil(until);
          setLockSecondsLeft(LOCK_SECONDS);

          Alert.alert(
            "Too many attempts",
            `You have entered an incorrect TPIN too many times. Please wait ${LOCK_SECONDS} seconds before trying again.`
          );
        } else {
          Alert.alert(
            "Transfer failed",
            String(e.message || "Invalid TPIN or transfer error.")
          );
        }

        return next;
      });
    } finally {
      setTpinSubmitting(false);
    }
  }, [
    senderWalletId,
    recipientSuffix,
    fullRecipientId,
    amountStr,
    note,
    tpin,
    nav,
    tpinLockedUntil,
    lockSecondsLeft,
    recipientName,
  ]);

  const locked = !!tpinLockedUntil && lockSecondsLeft > 0;

  return (
    <View style={styles.wrap}>
      {/* Header */}
      <LinearGradient
        colors={["#46e693", "#40d9c2"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientHeader}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={handleBack}
            style={styles.backBtn}
            activeOpacity={0.8}
          >
            <Ionicons name="chevron-back" size={22} color={G.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Wallet Transfer</Text>
          <View style={{ width: 32 }} />
        </View>

        {!!senderWalletId && (
          <Text style={styles.senderInfo}>
            From Wallet:{" "}
            <Text style={{ fontWeight: "800" }}>{senderWalletId}</Text>
          </Text>
        )}
      </LinearGradient>

      <ScrollView
        style={styles.body}
        contentContainerStyle={{ paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Transfer Details</Text>
          <Text style={styles.cardSubtitle}>
            Enter the recipient&apos;s wallet ID and the amount you want to
            transfer.
          </Text>

          {/* Recipient Wallet ID */}
          <Text style={styles.inputLabel}>Recipient Wallet ID</Text>
          <TextInput
            value={fullRecipientId}
            onChangeText={onChangeRecipient}
            autoCapitalize="characters"
            autoCorrect={false}
            style={styles.input}
            placeholder="NET000008"
            placeholderTextColor="#CBD5E1"
            maxLength={9}
          />

          {/* Recipient name state */}
          {recipientLoading ? (
            <View style={styles.recipientRow}>
              <ActivityIndicator size="small" color={G.grab} />
              <Text style={styles.recipientInfoText}>Fetching user name…</Text>
            </View>
          ) : recipientName ? (
            <View style={styles.recipientRow}>
              <Ionicons name="person-circle-outline" size={18} color={G.ok} />
              <Text style={styles.recipientNameText}>{recipientName}</Text>
            </View>
          ) : recipientError ? (
            <Text style={styles.recipientErrorText}>{recipientError}</Text>
          ) : null}

          {/* Amount */}
          <Text style={styles.inputLabel}>Amount (BTN)</Text>
          <TextInput
            value={amountStr}
            onChangeText={onChangeAmount}
            keyboardType="decimal-pad"
            style={styles.input}
            placeholder="0.00"
            placeholderTextColor="#CBD5E1"
          />

          {/* Note */}
          <Text style={styles.inputLabel}>Note (optional)</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            style={styles.input}
            placeholder="Transfer"
            placeholderTextColor="#CBD5E1"
          />

          <TouchableOpacity
            style={[styles.primaryBtn, submitting && styles.btnDisabled]}
            activeOpacity={0.9}
            disabled={submitting}
            onPress={handleOpenTPINModal}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={G.white} />
            ) : (
              <Text style={styles.primaryBtnText}>Continue</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={18} color={G.sub} />
          <Text style={styles.infoText}>
            Transfers are instant and cannot be reversed. Please double-check the
            recipient wallet ID and user name before confirming.
          </Text>
        </View>
      </ScrollView>

      {/* TPIN Modal */}
      <Modal
        visible={tpinModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTpinModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Enter Wallet TPIN</Text>
            <Text style={styles.modalSubtitle}>
              For security, please enter your 4-digit TPIN to confirm this
              transfer.
            </Text>

            <TextInput
              value={tpin}
              onChangeText={onChangeTPIN}
              keyboardType="number-pad"
              maxLength={4}
              secureTextEntry
              style={styles.modalInput}
              placeholder="••••"
              placeholderTextColor="#CBD5E1"
            />

            {locked && (
              <Text style={styles.lockText}>
                Too many attempts. Try again in {lockSecondsLeft}s.
              </Text>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalCancel]}
                onPress={() => setTpinModalVisible(false)}
                disabled={tpinSubmitting}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalBtn,
                  styles.modalConfirm,
                  (tpinSubmitting || tpin.length !== 4 || locked) &&
                    styles.btnDisabled,
                ]}
                onPress={handleConfirmTransfer}
                disabled={tpinSubmitting || tpin.length !== 4 || locked}
              >
                {tpinSubmitting ? (
                  <ActivityIndicator size="small" color={G.white} />
                ) : (
                  <Text style={styles.modalConfirmText}>
                    {locked ? "Locked" : "Confirm"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

/* ========= styles ========= */
const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: G.bg },
  gradientHeader: {
    paddingTop: Platform.OS === "android" ? 36 : 56,
    paddingHorizontal: 16,
    paddingBottom: 12,
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
    backgroundColor: "rgba(0,0,0,0.1)",
  },
  headerTitle: {
    color: G.white,
    fontSize: 18,
    fontWeight: "800",
  },
  senderInfo: {
    marginTop: 8,
    color: "rgba(255,255,255,0.95)",
    fontSize: 12,
    fontWeight: "600",
  },

  body: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },

  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: G.line,
    padding: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: G.slate,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 12,
    color: "#64748B",
    marginBottom: 12,
  },

  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
    marginTop: 8,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: G.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
    color: G.text,
    backgroundColor: "#F8FAFC",
  },

  recipientRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    gap: 6,
  },
  recipientNameText: {
    color: G.ok,
    fontWeight: "700",
    fontSize: 13,
  },
  recipientInfoText: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "600",
  },
  recipientErrorText: {
    marginTop: 6,
    color: G.danger,
    fontSize: 12,
    fontWeight: "600",
  },

  primaryBtn: {
    marginTop: 16,
    backgroundColor: G.grab,
    borderRadius: 999,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    color: G.white,
    fontWeight: "800",
    fontSize: 14,
  },
  btnDisabled: {
    opacity: 0.5,
  },

  infoBox: {
    marginTop: 16,
    marginHorizontal: 4,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: "#64748B",
  },

  /* modal */
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  modalCard: {
    width: "100%",
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    padding: 18,
    borderWidth: 1,
    borderColor: G.line,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: G.slate,
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 12,
    color: "#64748B",
    marginBottom: 12,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: G.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 18,
    letterSpacing: 4,
    textAlign: "center",
    color: G.text,
    backgroundColor: "#F8FAFC",
  },
  lockText: {
    marginTop: 8,
    fontSize: 12,
    color: G.danger,
    textAlign: "center",
    fontWeight: "600",
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 16,
  },
  modalBtn: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  modalCancel: {
    backgroundColor: "#E5E7EB",
  },
  modalCancelText: {
    color: "#4B5563",
    fontWeight: "700",
  },
  modalConfirm: {
    backgroundColor: G.grab,
  },
  modalConfirmText: {
    color: G.white,
    fontWeight: "800",
  },
});
