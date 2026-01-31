// services/wallet/WalletSetTPIN.js
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { getValidAccessToken } from "../../utils/authToken";

/* ========= colors ========= */
const G = {
  grab: "#00B14F",
  grab2: "#00C853",
  text: "#0F172A",
  sub: "#6B7280",
  bg: "#F6F7F9",
  line: "#E5E7EB",
  danger: "#EF4444",
  white: "#ffffff",
};

/* ========= endpoint (new) ========= */
// POST https://grab.newedge.bt/wallet/wallet/:wallet_id/t-pin
// body: { "t_pin": "1234" }
const SET_TPIN_URL = (walletId) =>
  `https://grab.newedge.bt/wallet/wallet/${walletId}/t-pin`;

/* ========= helpers ========= */
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

async function setTpinOnServer(walletId, tpin) {
  const res = await authFetch(SET_TPIN_URL(walletId), {
    method: "POST",
    body: JSON.stringify({ t_pin: tpin }), // 👈 backend expects "t_pin"
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || `Failed to set TPIN (HTTP ${res.status})`);
  }
  return data;
}

export default function WalletSetTPIN() {
  const navigation = useNavigation();
  const route = useRoute();

  const userId = route?.params?.user_id;      // optional, just for context/logs
  const walletId = route?.params?.wallet_id;  // 👈 REQUIRED for API
  console.log("[WalletSetTPIN] route.params:", route?.params || {});

  const [tpin, setTpin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!walletId) {
    return (
      <View style={styles.center}>
        <Text style={{ color: G.danger, fontWeight: "600" }}>
          Missing wallet information for TPIN setup.
        </Text>
      </View>
    );
  }

  const handleSave = async () => {
    const trimmed = tpin.trim();
    const trimmedConfirm = confirm.trim();

    // ✅ EXACTLY 4 digit numeric PIN
    if (!trimmed || !/^\d{4}$/.test(trimmed)) {
      Alert.alert(
        "Invalid TPIN",
        "Please enter a 4-digit numeric TPIN (numbers only)."
      );
      return;
    }
    if (trimmed !== trimmedConfirm) {
      Alert.alert("TPIN mismatch", "TPIN and Confirm TPIN must match.");
      return;
    }

    setLoading(true);
    try {
      console.log(
        "[WalletSetTPIN] Setting TPIN for wallet:",
        walletId,
        "user:",
        userId
      );
      const res = await setTpinOnServer(walletId, trimmed);
      console.log(
        "[WalletSetTPIN] TPIN set response:",
        JSON.stringify(res, null, 2)
      );
      Alert.alert(
        "TPIN set",
        "Your wallet TPIN has been set successfully.",
        [
          {
            text: "OK",
            onPress: () => {
              try {
                navigation.goBack(); // WalletScreen will re-check has_tpin
              } catch {}
            },
          },
        ]
      );
    } catch (e) {
      console.log("[WalletSetTPIN] Error setting TPIN:", e?.message || e);
      Alert.alert("Failed", String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.wrap}>
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
            <Ionicons name="chevron-back" size={20} color={G.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Set Wallet TPIN</Text>
          <View style={{ width: 32 }} />
        </View>
      </LinearGradient>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.body}>
          <Text style={styles.infoTitle}>Secure your wallet</Text>
          <Text style={styles.infoText}>
            Your TPIN will be required for wallet actions like payments,
            transfers, and withdrawals. Keep it secret and do not share it with
            anyone.
          </Text>

          {/* TPIN */}
          <View style={styles.field}>
            <Text style={styles.label}>New TPIN</Text>
            <View style={styles.inputRow}>
              <TextInput
                value={tpin}
                onChangeText={setTpin}
                keyboardType="number-pad"
                secureTextEntry={!show}
                maxLength={4}
                style={styles.input}
                placeholder="Enter 4-digit TPIN"
                placeholderTextColor="#9CA3AF"
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => setShow((v) => !v)}
              >
                <Ionicons
                  name={show ? "eye-off-outline" : "eye-outline"}
                  size={18}
                  color="#6B7280"
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* CONFIRM TPIN */}
          <View style={styles.field}>
            <Text style={styles.label}>Confirm TPIN</Text>
            <View style={styles.inputRow}>
              <TextInput
                value={confirm}
                onChangeText={setConfirm}
                keyboardType="number-pad"
                secureTextEntry={!showConfirm}
                maxLength={4}
                style={styles.input}
                placeholder="Re-enter 4-digit TPIN"
                placeholderTextColor="#9CA3AF"
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => setShowConfirm((v) => !v)}
              >
                <Ionicons
                  name={showConfirm ? "eye-off-outline" : "eye-outline"}
                  size={18}
                  color="#6B7280"
                />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, loading && { opacity: 0.7 }]}
            disabled={loading}
            onPress={handleSave}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator size="small" color={G.white} />
            ) : (
              <Text style={styles.saveText}>Save TPIN</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

/* ========= styles ========= */
const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: G.bg },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: G.bg,
  },
  gradientHeader: {
    paddingTop: Platform.OS === "android" ? 36 : 56,
    paddingHorizontal: 16,
    paddingBottom: 12,
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
  headerTitle: {
    color: G.white,
    fontSize: 18,
    fontWeight: "800",
  },

  body: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: G.text,
    marginBottom: 4,
  },
  infoText: {
    fontSize: 13,
    color: G.sub,
    marginBottom: 20,
  },

  field: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: G.text,
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: G.line,
    backgroundColor: G.white,
    paddingHorizontal: 10,
  },
  input: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 16,
    color: G.text,
  },
  eyeBtn: {
    paddingHorizontal: 6,
    paddingVertical: 8,
  },

  saveBtn: {
    marginTop: 24,
    backgroundColor: G.grab,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  saveText: {
    color: G.white,
    fontWeight: "800",
    fontSize: 15,
  },
});
