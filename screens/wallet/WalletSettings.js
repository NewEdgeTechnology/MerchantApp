// services/wallet/WalletSettings.js
import React, { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  StatusBar,
} from "react-native";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { getValidAccessToken } from "../../utils/authToken";
import { API_BASE_URL } from "@env";
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
  white:  C.white,
  slate:  C.text,
};

const TPIN_REGEX = /^\d{4}$/;

const CHANGE_TPIN_URL      = (id) => `${API_BASE_URL}/wallet/wallet/${id}/t-pin`;
const FORGOT_TPIN_URL      = (id) => `${API_BASE_URL}/wallet/wallet/${id}/forgot-tpin-sms`;
const VERIFY_FORGOT_TPIN_URL = (id) => `${API_BASE_URL}/wallet/wallet/${id}/forgot-tpin-sms/verify`;

async function authFetch(url, opts = {}) {
  const token = await getValidAccessToken();
  const baseHeaders = { "Content-Type": "application/json" };
  const headers = token ? { ...baseHeaders, Authorization: `Bearer ${token}` } : baseHeaders;
  return fetch(url, { ...opts, headers: { ...(opts.headers || {}), ...headers } });
}

async function fetchJson(url, opts) {
  const res  = await authFetch(url, opts);
  const text = await res.text();
  let json;
  try   { json = text ? JSON.parse(text) : {}; }
  catch { json = { success: false, message: "Invalid JSON", raw: text }; }
  if (!res.ok) throw new Error(json?.message || `HTTP ${res.status}`);
  return json;
}

/* ── TPIN input with show/hide toggle ── */
function SecurePINInput({ value, onChange, editable = true, autoFocus = false }) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={pinStyles.wrapper}>
      <View style={{ width: 28 }} />
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="number-pad"
        maxLength={4}
        secureTextEntry={!visible}
        style={pinStyles.input}
        placeholder="••••"
        placeholderTextColor="#CBD5E1"
        editable={editable}
        autoFocus={autoFocus}
      />
      <TouchableOpacity
        onPress={() => setVisible((v) => !v)}
        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
        style={pinStyles.eyeBtn}
      >
        <Ionicons name={visible ? "eye-off-outline" : "eye-outline"} size={18} color="#94A3B8" />
      </TouchableOpacity>
    </View>
  );
}

/* ── Reusable OTP box input (6 digits) ── */
function OTPBoxInput({ value, onChange, editable = true }) {
  const ref = useRef(null);
  return (
    <View style={otpStyles.container}>
      <View style={otpStyles.boxRow} pointerEvents="none">
        {Array.from({ length: 6 }).map((_, i) => {
          const filled = i < value.length;
          const active = i === value.length && editable;
          return (
            <View key={i} style={[otpStyles.box, filled && otpStyles.boxFilled, active && otpStyles.boxActive]}>
              {filled && <Text style={otpStyles.dot}>●</Text>}
            </View>
          );
        })}
      </View>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChange}
        keyboardType="number-pad"
        maxLength={6}
        style={otpStyles.hidden}
        editable={editable}
        caretHidden
      />
    </View>
  );
}

/* ── Main screen ── */
export default function WalletSettingsScreen() {
  const nav    = useNavigation();
  const insets = useSafeAreaInsets();
  const { showAlert, alertNode } = useAlert();
  const route = useRoute();

  const walletFromParams   = route?.params?.wallet || null;
  const walletIdFromParams = walletFromParams?.wallet_id || route?.params?.wallet_id || null;
  const walletId           = walletIdFromParams ? String(walletIdFromParams) : null;

  const [oldTPIN,        setOldTPIN]        = useState("");
  const [newTPIN,        setNewTPIN]        = useState("");
  const [confirmNewTPIN, setConfirmNewTPIN] = useState("");
  const [changeLoading,  setChangeLoading]  = useState(false);

  const [otpSent,           setOtpSent]           = useState(false);
  const [otpCode,           setOtpCode]           = useState("");
  const [forgotNewTPIN,     setForgotNewTPIN]     = useState("");
  const [forgotConfirmTPIN, setForgotConfirmTPIN] = useState("");
  const [otpSending,        setOtpSending]        = useState(false);
  const [otpVerifying,      setOtpVerifying]      = useState(false);

  const onChangeOldTPIN        = (v) => setOldTPIN((v || "").replace(/[^0-9]/g, "").slice(0, 4));
  const onChangeNewTPIN        = (v) => setNewTPIN((v || "").replace(/[^0-9]/g, "").slice(0, 4));
  const onChangeConfirmNewTPIN = (v) => setConfirmNewTPIN((v || "").replace(/[^0-9]/g, "").slice(0, 4));
  const onChangeOtp            = (v) => setOtpCode((v || "").replace(/[^0-9]/g, "").slice(0, 6));
  const onChangeForgotNewTPIN  = (v) => setForgotNewTPIN((v || "").replace(/[^0-9]/g, "").slice(0, 4));
  const onChangeForgotConfirm  = (v) => setForgotConfirmTPIN((v || "").replace(/[^0-9]/g, "").slice(0, 4));

  const handleChangeTPIN = useCallback(async () => {
    if (!walletId) { showAlert({ type: "error", title: "Error", message: "Wallet ID is missing.", primaryLabel: "OK" }); return; }
    if (!TPIN_REGEX.test(oldTPIN) || !TPIN_REGEX.test(newTPIN)) {
      showAlert({ type: "warn", title: "Invalid TPIN", message: "TPIN must be a 4-digit numeric code.", primaryLabel: "OK" }); return;
    }
    if (newTPIN === oldTPIN) {
      showAlert({ type: "warn", title: "Invalid TPIN", message: "New TPIN must be different from old TPIN.", primaryLabel: "OK" }); return;
    }
    if (newTPIN !== confirmNewTPIN) {
      showAlert({ type: "warn", title: "Mismatch", message: "New TPIN and confirm TPIN do not match.", primaryLabel: "OK" }); return;
    }
    setChangeLoading(true);
    try {
      const res = await fetchJson(CHANGE_TPIN_URL(walletId), { method: "POST", body: JSON.stringify({ old_t_pin: oldTPIN, new_t_pin: newTPIN }) });
      if (!res?.success) throw new Error(res?.message || "Failed to change TPIN.");
      showAlert({ type: "success", title: "TPIN updated", message: "Your wallet TPIN has been changed.", primaryLabel: "OK",
        primaryAction: () => { setOldTPIN(""); setNewTPIN(""); setConfirmNewTPIN(""); },
      });
    } catch (e) {
      showAlert({ type: "error", title: "Failed", message: String(e.message || e), primaryLabel: "OK" });
    } finally {
      setChangeLoading(false);
    }
  }, [walletId, oldTPIN, newTPIN, confirmNewTPIN, showAlert]);

  const handleSendOtp = useCallback(async () => {
    if (!walletId) { showAlert({ type: "error", title: "Error", message: "Wallet ID is missing.", primaryLabel: "OK" }); return; }
    setOtpSending(true);
    try {
      const res = await fetchJson(FORGOT_TPIN_URL(walletId), { method: "POST", body: JSON.stringify({}) });
      if (!res?.success) throw new Error(res?.message || "Failed to send OTP.");
      setOtpSent(true);
      showAlert({ type: "info", title: "OTP sent", message: "We have sent an OTP to your registered phone number.", primaryLabel: "OK" });
    } catch (e) {
      showAlert({ type: "error", title: "Failed", message: String(e.message || e), primaryLabel: "OK" });
    } finally {
      setOtpSending(false);
    }
  }, [walletId, showAlert]);

  const handleVerifyOtp = useCallback(async () => {
    if (!walletId) { showAlert({ type: "error", title: "Error", message: "Wallet ID is missing.", primaryLabel: "OK" }); return; }
    if (otpCode.length !== 6) { showAlert({ type: "warn", title: "Invalid OTP", message: "Please enter the 6-digit OTP.", primaryLabel: "OK" }); return; }
    if (!TPIN_REGEX.test(forgotNewTPIN)) { showAlert({ type: "warn", title: "Invalid TPIN", message: "TPIN must be a 4-digit numeric code.", primaryLabel: "OK" }); return; }
    if (forgotNewTPIN !== forgotConfirmTPIN) { showAlert({ type: "warn", title: "Mismatch", message: "New TPIN and confirm TPIN do not match.", primaryLabel: "OK" }); return; }
    setOtpVerifying(true);
    try {
      const res = await fetchJson(VERIFY_FORGOT_TPIN_URL(walletId), { method: "POST", body: JSON.stringify({ otp: otpCode, new_t_pin: forgotNewTPIN }) });
      if (!res?.success) throw new Error(res?.message || "Failed to verify OTP.");
      showAlert({ type: "success", title: "TPIN reset", message: "Your wallet TPIN has been reset successfully.", primaryLabel: "OK",
        primaryAction: () => { setOtpCode(""); setForgotNewTPIN(""); setForgotConfirmTPIN(""); setOtpSent(false); },
      });
    } catch (e) {
      showAlert({ type: "error", title: "Failed", message: String(e.message || e), primaryLabel: "OK" });
    } finally {
      setOtpVerifying(false);
    }
  }, [walletId, otpCode, forgotNewTPIN, forgotConfirmTPIN, showAlert]);

  const changeDisabled = changeLoading || !oldTPIN || !newTPIN || !confirmNewTPIN;
  const verifyDisabled = otpVerifying || !otpCode || !forgotNewTPIN || !forgotConfirmTPIN;

  return (
    <View style={styles.wrap}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* ── Gradient header ── */}
      <LinearGradient
        colors={C.gradBrand}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + 12 }]}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => { try { nav.goBack(); } catch {} }}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Wallet Settings</Text>
          <View style={{ width: 38 }} />
        </View>
        {!!walletId && (
          <View style={styles.idBadge}>
            <Ionicons name="card-outline" size={13} color="rgba(255,255,255,0.75)" />
            <Text style={styles.idBadgeText}>{walletId}</Text>
          </View>
        )}
      </LinearGradient>

      <ScrollView
        style={styles.body}
        contentContainerStyle={[styles.bodyContent, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* ── Change TPIN section ── */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionIconWrap}>
            <Ionicons name="lock-closed-outline" size={17} color={G.grab} />
          </View>
          <View>
            <Text style={styles.sectionTitle}>Change TPIN</Text>
            <Text style={styles.sectionSub}>Enter your current and new 4-digit TPIN</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.fieldLabel}>Current TPIN</Text>
          <SecurePINInput value={oldTPIN} onChange={onChangeOldTPIN} editable={!changeLoading} />

          <View style={styles.divider} />

          <Text style={styles.fieldLabel}>New TPIN</Text>
          <SecurePINInput value={newTPIN} onChange={onChangeNewTPIN} editable={!changeLoading} />

          <View style={styles.divider} />

          <Text style={styles.fieldLabel}>Confirm New TPIN</Text>
          <SecurePINInput value={confirmNewTPIN} onChange={onChangeConfirmNewTPIN} editable={!changeLoading} />
        </View>

        <TouchableOpacity
          style={[styles.ctaBtn, changeDisabled && styles.btnDisabled]}
          disabled={changeDisabled}
          onPress={handleChangeTPIN}
          activeOpacity={0.85}
        >
          {changeLoading
            ? <ActivityIndicator size="small" color="#fff" />
            : <><Ionicons name="shield-checkmark-outline" size={18} color="#fff" /><Text style={styles.ctaBtnText}>Update TPIN</Text></>
          }
        </TouchableOpacity>

        {/* ── Forgot TPIN section ── */}
        <View style={[styles.sectionHeader, { marginTop: 32 }]}>
          <View style={[styles.sectionIconWrap, { backgroundColor: "#FEF3C7" }]}>
            <Ionicons name="key-outline" size={17} color="#D97706" />
          </View>
          <View>
            <Text style={styles.sectionTitle}>Forgot TPIN</Text>
            <Text style={styles.sectionSub}>Reset via OTP sent to your phone</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.otpSendBtn, otpSending && styles.btnDisabled]}
          disabled={otpSending}
          onPress={handleSendOtp}
          activeOpacity={0.85}
        >
          {otpSending
            ? <ActivityIndicator size="small" color={G.grab} />
            : <><Ionicons name="chatbubble-ellipses-outline" size={18} color={G.grab} /><Text style={styles.otpSendBtnText}>{otpSent ? "Resend OTP" : "Send OTP to Phone"}</Text></>
          }
        </TouchableOpacity>

        {otpSent && (
          <>
            <View style={styles.otpBanner}>
              <Ionicons name="checkmark-circle" size={16} color="#059669" />
              <Text style={styles.otpBannerText}>OTP sent — enter it below along with your new TPIN</Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.fieldLabel}>OTP (6 digits)</Text>
              <OTPBoxInput value={otpCode} onChange={onChangeOtp} editable={!otpVerifying} />

              <View style={styles.divider} />

              <Text style={styles.fieldLabel}>New TPIN</Text>
              <SecurePINInput value={forgotNewTPIN} onChange={onChangeForgotNewTPIN} editable={!otpVerifying} />

              <View style={styles.divider} />

              <Text style={styles.fieldLabel}>Confirm New TPIN</Text>
              <SecurePINInput value={forgotConfirmTPIN} onChange={onChangeForgotConfirm} editable={!otpVerifying} />
            </View>

            <TouchableOpacity
              style={[styles.ctaBtn, verifyDisabled && styles.btnDisabled]}
              disabled={verifyDisabled}
              onPress={handleVerifyOtp}
              activeOpacity={0.85}
            >
              {otpVerifying
                ? <ActivityIndicator size="small" color="#fff" />
                : <><Ionicons name="checkmark-circle-outline" size={18} color="#fff" /><Text style={styles.ctaBtnText}>Verify & Reset TPIN</Text></>
              }
            </TouchableOpacity>
          </>
        )}

      </ScrollView>
      {alertNode}
    </View>
  );
}

/* ── SecurePINInput styles ── */
const pinStyles = StyleSheet.create({
  wrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    backgroundColor: "#fff",
    marginTop: 4,
    paddingHorizontal: 14,
  },
  input: {
    flex: 1,
    paddingVertical: 13,
    fontSize: 20,
    letterSpacing: 10,
    textAlign: "center",
    color: "#0F172A",
  },
  eyeBtn: {
    width: 28,
    alignItems: "flex-end",
  },
});

/* ── OTP box styles (6 digits) ── */
const otpStyles = StyleSheet.create({
  container: { width: "100%", marginTop: 4 },
  boxRow: { flexDirection: "row", gap: 8 },
  box: {
    flex: 1, height: 52,
    borderRadius: 12, borderWidth: 1.5, borderColor: "#E2E8F0",
    backgroundColor: "#fff", alignItems: "center", justifyContent: "center",
  },
  boxActive: {
    borderColor: C.brand, backgroundColor: "#F5F3FF",
    shadowColor: C.brand, shadowOpacity: 0.15, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  boxFilled: { borderColor: C.brand, backgroundColor: "#F5F3FF" },
  dot:       { fontSize: 14, color: C.brand, lineHeight: 18 },
  hidden:    { position: "absolute", width: "100%", height: "100%", opacity: 0 },
});

/* ── Screen styles ── */
const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "#F8FAFC" },

  /* header */
  header: { paddingHorizontal: 20, paddingBottom: 20 },
  headerRow: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginBottom: 14,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "800" },
  idBadge: {
    flexDirection: "row", alignItems: "center", alignSelf: "center", gap: 6,
    backgroundColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999,
  },
  idBadgeText: { color: "#fff", fontWeight: "700", fontSize: 12, letterSpacing: 1.2 },

  /* body */
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: 20, paddingTop: 24 },

  /* section header */
  sectionHeader: {
    flexDirection: "row", alignItems: "center", gap: 12,
    marginBottom: 14,
  },
  sectionIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: "#F5F3FF",
    alignItems: "center", justifyContent: "center",
  },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: "#0F172A" },
  sectionSub:   { fontSize: 12, color: "#64748B", marginTop: 2 },

  /* flat section box */
  section: {
    backgroundColor: "#fff",
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },

  divider: { height: 1, backgroundColor: "#F1F5F9", marginTop: 16 },

  /* field label */
  fieldLabel: {
    color: "#94A3B8", fontSize: 11, fontWeight: "700",
    letterSpacing: 0.6, marginTop: 16, marginBottom: 8,
    textTransform: "uppercase",
  },

  /* CTA button */
  ctaBtn: {
    marginTop: 16,
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, backgroundColor: G.grab,
    borderRadius: 16, paddingVertical: 15,
  },
  ctaBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },

  /* OTP send button */
  otpSendBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderRadius: 16, paddingVertical: 14,
    borderWidth: 1.5, borderColor: G.grab,
    backgroundColor: "#F5F3FF",
    marginBottom: 16,
  },
  otpSendBtnText: { color: G.grab, fontWeight: "800", fontSize: 14 },

  btnDisabled: { opacity: 0.45 },

  /* OTP sent banner */
  otpBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#ECFDF5", borderRadius: 14,
    padding: 12, marginBottom: 14,
    borderWidth: 1, borderColor: "#A7F3D0",
  },
  otpBannerText: { color: "#065F46", fontSize: 12, fontWeight: "600", flex: 1 },
});
