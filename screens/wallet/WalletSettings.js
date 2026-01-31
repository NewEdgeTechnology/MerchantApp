// services/wallet/WalletSettings.js
import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  Keyboard,
  KeyboardAvoidingView,
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
  ok: "#10B981",
  white: "#ffffff",
  slate: "#0F172A",
};

/* ========= validation ========= */
const TPIN_REGEX = /^\d{4}$/;

/* ========= endpoints ========= */
const CHANGE_TPIN_URL = (walletId) =>
  `https://grab.newedge.bt/wallet/wallet/${walletId}/t-pin`;

const FORGOT_TPIN_URL = (walletId) =>
  `https://grab.newedge.bt/wallet/wallet/${walletId}/forgot-tpin-sms`;

const VERIFY_FORGOT_TPIN_URL = (walletId) =>
  `https://grab.newedge.bt/wallet/wallet/${walletId}/forgot-tpin-sms/verify`;

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

/* ========= small component ========= */
function PinInput({
  label,
  value,
  onChangeText,
  placeholder = "••••",
  maxLength = 4,
  visible,
  onToggleVisible,
  autoFocus = false,
}) {
  return (
    <>
      <Text style={styles.inputLabel}>{label}</Text>
      <View style={styles.inputWrap}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          keyboardType="number-pad"
          maxLength={maxLength}
          secureTextEntry={!visible}
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor="#CBD5E1"
          autoFocus={autoFocus}
        />
        <TouchableOpacity
          onPress={onToggleVisible}
          activeOpacity={0.8}
          style={styles.eyeBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name={visible ? "eye-off-outline" : "eye-outline"}
            size={18}
            color="#64748B"
          />
        </TouchableOpacity>
      </View>
    </>
  );
}

/* ========= screen ========= */
export default function WalletSettingsScreen() {
  const nav = useNavigation();
  const route = useRoute();

  // Expecting params from WalletScreen: { wallet } or { wallet_id }
  const walletFromParams = route?.params?.wallet || null;
  const walletIdFromParams =
    walletFromParams?.wallet_id || route?.params?.wallet_id || null;

  const walletId = walletIdFromParams ? String(walletIdFromParams) : null;

  const [oldTPIN, setOldTPIN] = useState("");
  const [newTPIN, setNewTPIN] = useState("");
  const [confirmNewTPIN, setConfirmNewTPIN] = useState("");
  const [changeLoading, setChangeLoading] = useState(false);

  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [forgotNewTPIN, setForgotNewTPIN] = useState("");
  const [forgotConfirmTPIN, setForgotConfirmTPIN] = useState("");
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);

  // ✅ eye toggles
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirmNew, setShowConfirmNew] = useState(false);
  const [showForgotNew, setShowForgotNew] = useState(false);
  const [showForgotConfirm, setShowForgotConfirm] = useState(false);

  // ✅ keyboard padding so you can scroll to the end WITHOUT dismissing keyboard
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const subShow = Keyboard.addListener(showEvt, (e) => {
      const h = e?.endCoordinates?.height || 0;
      setKeyboardHeight(h);
    });

    const subHide = Keyboard.addListener(hideEvt, () => {
      setKeyboardHeight(0);
    });

    return () => {
      subShow?.remove?.();
      subHide?.remove?.();
    };
  }, []);

  const scrollPaddingBottom = useMemo(() => {
    // base padding + keyboard height when open so last inputs stay reachable
    const base = 32;
    const extra = keyboardHeight ? Math.max(16, keyboardHeight + 16) : 0;
    return base + extra;
  }, [keyboardHeight]);

  const onChangeOldTPIN = (val) =>
    setOldTPIN((val || "").replace(/[^0-9]/g, "").slice(0, 4));
  const onChangeNewTPIN = (val) =>
    setNewTPIN((val || "").replace(/[^0-9]/g, "").slice(0, 4));
  const onChangeConfirmNewTPIN = (val) =>
    setConfirmNewTPIN((val || "").replace(/[^0-9]/g, "").slice(0, 4));

  const onChangeOtp = (val) =>
    setOtpCode((val || "").replace(/[^0-9]/g, "").slice(0, 6));
  const onChangeForgotNewTPIN = (val) =>
    setForgotNewTPIN((val || "").replace(/[^0-9]/g, "").slice(0, 4));
  const onChangeForgotConfirmTPIN = (val) =>
    setForgotConfirmTPIN((val || "").replace(/[^0-9]/g, "").slice(0, 4));

  const handleBack = () => {
    try {
      nav.goBack();
    } catch {}
  };

  const handleChangeTPIN = useCallback(async () => {
    if (!walletId) {
      Alert.alert("Error", "Wallet ID is missing.");
      return;
    }

    if (!TPIN_REGEX.test(oldTPIN) || !TPIN_REGEX.test(newTPIN)) {
      Alert.alert(
        "Invalid TPIN",
        "The TPIN must be a 4-digit numeric code (e.g. 1234)."
      );
      return;
    }

    if (newTPIN === oldTPIN) {
      Alert.alert("Invalid TPIN", "New TPIN must be different from old TPIN.");
      return;
    }

    if (newTPIN !== confirmNewTPIN) {
      Alert.alert("Mismatch", "New TPIN and confirm TPIN do not match.");
      return;
    }

    setChangeLoading(true);
    try {
      const body = JSON.stringify({
        old_t_pin: oldTPIN,
        new_t_pin: newTPIN,
      });
      console.log("[WalletSettings] Changing TPIN for wallet body data:", body);

      const res = await fetchJson(CHANGE_TPIN_URL(walletId), {
        method: "POST",
        body,
      });

      if (!res?.success) throw new Error(res?.message || "Failed to change TPIN.");

      Alert.alert("TPIN updated", "Your wallet TPIN has been changed.", [
        {
          text: "OK",
          onPress: () => {
            setOldTPIN("");
            setNewTPIN("");
            setConfirmNewTPIN("");
            setShowOld(false);
            setShowNew(false);
            setShowConfirmNew(false);
          },
        },
      ]);
    } catch (e) {
      Alert.alert("Failed", String(e.message || e));
    } finally {
      setChangeLoading(false);
    }
  }, [walletId, oldTPIN, newTPIN, confirmNewTPIN]);

  const handleSendOtp = useCallback(async () => {
    if (!walletId) {
      Alert.alert("Error", "Wallet ID is missing.");
      return;
    }

    setOtpSending(true);
    try {
      const res = await fetchJson(FORGOT_TPIN_URL(walletId), {
        method: "POST",
        body: JSON.stringify({}),
      });

      if (!res?.success) throw new Error(res?.message || "Failed to send OTP.");

      setOtpSent(true);
      Alert.alert(
        "OTP sent",
        "We have sent an OTP to your registered phone number. Please check and enter it below."
      );
    } catch (e) {
      Alert.alert("Failed", String(e.message || e));
    } finally {
      setOtpSending(false);
    }
  }, [walletId]);

  const handleVerifyOtpAndSetTPIN = useCallback(async () => {
    if (!walletId) {
      Alert.alert("Error", "Wallet ID is missing.");
      return;
    }

    if (otpCode.length !== 6) {
      Alert.alert("Invalid OTP", "Please enter the 6-digit OTP.");
      return;
    }

    if (!TPIN_REGEX.test(forgotNewTPIN)) {
      Alert.alert(
        "Invalid TPIN",
        "The TPIN must be a 4-digit numeric code (e.g. 1234)."
      );
      return;
    }

    if (forgotNewTPIN !== forgotConfirmTPIN) {
      Alert.alert("Mismatch", "New TPIN and confirm TPIN do not match.");
      return;
    }

    setOtpVerifying(true);
    try {
      const body = JSON.stringify({
        otp: otpCode,
        new_t_pin: forgotNewTPIN,
      });

      const res = await fetchJson(VERIFY_FORGOT_TPIN_URL(walletId), {
        method: "POST",
        body,
      });

      if (!res?.success) throw new Error(res?.message || "Failed to verify OTP.");

      Alert.alert("TPIN reset", "Your wallet TPIN has been reset successfully.", [
        {
          text: "OK",
          onPress: () => {
            setOtpCode("");
            setForgotNewTPIN("");
            setForgotConfirmTPIN("");
            setOtpSent(false);
            setShowForgotNew(false);
            setShowForgotConfirm(false);
          },
        },
      ]);
    } catch (e) {
      Alert.alert("Failed", String(e.message || e));
    } finally {
      setOtpVerifying(false);
    }
  }, [walletId, otpCode, forgotNewTPIN, forgotConfirmTPIN]);

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
          <Text style={styles.headerTitle}>Wallet Settings</Text>
          <View style={{ width: 32 }} />
        </View>

        {!!walletId && (
          <Text style={styles.walletIdText}>Wallet ID: {walletId}</Text>
        )}
      </LinearGradient>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <ScrollView
          style={styles.body}
          contentContainerStyle={{ paddingBottom: scrollPaddingBottom }}
          // ✅ keep keyboard open while scrolling
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="none"
          // ✅ iOS auto inset when keyboard shows (RN 0.71+)
          automaticallyAdjustKeyboardInsets={true}
          showsVerticalScrollIndicator={false}
        >
          {/* Change TPIN */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Change TPIN</Text>
            <Text style={styles.cardSubtitle}>
              Enter your current TPIN and choose a new TPIN.{"\n"}
              The TPIN must be a 4-digit numeric code (e.g. 1234).
            </Text>

            <PinInput
              label="Current TPIN"
              value={oldTPIN}
              onChangeText={onChangeOldTPIN}
              visible={showOld}
              onToggleVisible={() => setShowOld((s) => !s)}
            />

            <PinInput
              label="New TPIN"
              value={newTPIN}
              onChangeText={onChangeNewTPIN}
              visible={showNew}
              onToggleVisible={() => setShowNew((s) => !s)}
            />

            <PinInput
              label="Confirm New TPIN"
              value={confirmNewTPIN}
              onChangeText={onChangeConfirmNewTPIN}
              visible={showConfirmNew}
              onToggleVisible={() => setShowConfirmNew((s) => !s)}
            />

            <TouchableOpacity
              style={[
                styles.primaryBtn,
                (changeLoading ||
                  !oldTPIN ||
                  !newTPIN ||
                  !confirmNewTPIN) &&
                  styles.btnDisabled,
              ]}
              disabled={
                changeLoading || !oldTPIN || !newTPIN || !confirmNewTPIN
              }
              onPress={handleChangeTPIN}
            >
              {changeLoading ? (
                <ActivityIndicator size="small" color={G.white} />
              ) : (
                <Text style={styles.primaryBtnText}>Update TPIN</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Divider */}
          <View style={styles.sectionDivider} />

          {/* Forgot TPIN */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Forgot TPIN</Text>
            <Text style={styles.cardSubtitle}>
              If you forgot your TPIN, we&apos;ll send an OTP to your registered
              phone number so you can reset it.{"\n"}
              The TPIN must be a 4-digit numeric code (e.g. 1234).
            </Text>

            <TouchableOpacity
              style={[styles.secondaryBtn, otpSending && styles.btnDisabled]}
              disabled={otpSending}
              onPress={handleSendOtp}
            >
              {otpSending ? (
                <ActivityIndicator size="small" color={G.grab} />
              ) : (
                <Text style={styles.secondaryBtnText}>Send OTP</Text>
              )}
            </TouchableOpacity>

            {otpSent && (
              <>
                <Text style={[styles.inputLabel, { marginTop: 16 }]}>
                  Enter OTP
                </Text>
                <TextInput
                  value={otpCode}
                  onChangeText={onChangeOtp}
                  keyboardType="number-pad"
                  maxLength={6}
                  style={styles.input}
                  placeholder="6-digit OTP"
                  placeholderTextColor="#CBD5E1"
                />

                <PinInput
                  label="New TPIN"
                  value={forgotNewTPIN}
                  onChangeText={onChangeForgotNewTPIN}
                  visible={showForgotNew}
                  onToggleVisible={() => setShowForgotNew((s) => !s)}
                />

                <PinInput
                  label="Confirm New TPIN"
                  value={forgotConfirmTPIN}
                  onChangeText={onChangeForgotConfirmTPIN}
                  visible={showForgotConfirm}
                  onToggleVisible={() => setShowForgotConfirm((s) => !s)}
                />

                <TouchableOpacity
                  style={[
                    styles.primaryBtnOutline,
                    (otpVerifying ||
                      !otpCode ||
                      !forgotNewTPIN ||
                      !forgotConfirmTPIN) &&
                      styles.btnDisabled,
                  ]}
                  disabled={
                    otpVerifying ||
                    !otpCode ||
                    !forgotNewTPIN ||
                    !forgotConfirmTPIN
                  }
                  onPress={handleVerifyOtpAndSetTPIN}
                >
                  {otpVerifying ? (
                    <ActivityIndicator size="small" color={G.grab} />
                  ) : (
                    <Text style={styles.primaryBtnOutlineText}>
                      Verify OTP & Reset TPIN
                    </Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  walletIdText: {
    marginTop: 8,
    color: "rgba(255,255,255,0.9)",
    fontWeight: "600",
    fontSize: 12,
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

  inputWrap: {
    position: "relative",
  },
  input: {
    borderWidth: 1,
    borderColor: G.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    paddingRight: 44, // room for eye button
    fontSize: 16,
    color: G.text,
    backgroundColor: "#F8FAFC",
  },
  eyeBtn: {
    position: "absolute",
    right: 10,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    width: 36,
  },

  primaryBtn: {
    marginTop: 16,
    backgroundColor: G.grab,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    color: G.white,
    fontWeight: "800",
    fontSize: 14,
  },
  primaryBtnOutline: {
    marginTop: 16,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: G.grab,
  },
  primaryBtnOutlineText: {
    color: G.grab,
    fontWeight: "800",
    fontSize: 14,
  },
  secondaryBtn: {
    marginTop: 8,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E0F7EC",
  },
  secondaryBtnText: {
    color: G.grab,
    fontWeight: "800",
    fontSize: 14,
  },

  btnDisabled: {
    opacity: 0.5,
  },

  sectionDivider: {
    height: 16,
  },
});
