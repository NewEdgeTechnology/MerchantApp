// services/wallet/TopUpBank.js
import React, { useCallback, useState, useMemo, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Platform,
  ActivityIndicator,
  FlatList,
  Modal,
  Image,
  ScrollView,
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
  grab: C.brand,
  grab2: C.brandDark,
  text: C.text,
  sub: C.sub,
  bg: C.card2,
  line: C.line,
  danger: C.danger,
  ok: C.success,
  warn: C.warn,
  white: C.white,
  slate: C.text,
};

const BANK_LOGOS = {
  1010: "https://backend.tabdhey.bt/admin/uploads/logo_and_image/logo_1781242661159_h58ix4mzvwq.webp",
  1020: "https://backend.tabdhey.bt/admin/uploads/logo_and_image/logo_1781242625061_ao6jqck79yk.webp",
  1030: "https://backend.tabdhey.bt/admin/uploads/logo_and_image/logo_1781242481264_kbeq81vy6jb.webp",
  1040: "https://backend.tabdhey.bt/admin/uploads/logo_and_image/logo_1781243867060_4aln975xkj2.webp",
  1050: "https://backend.tabdhey.bt/admin/uploads/logo_and_image/logo_1781242607361_9bbtkp1ykhe.webp",
  1060: "https://backend.tabdhey.bt/admin/uploads/logo_and_image/logo_1781242674959_pcz9u06cv49.webp",
  1070: "https://backend.tabdhey.bt/admin/uploads/logo_and_image/logo_1781244315725_ie18ga5f1c.webp",
};

const getBankLogoUrl = (bankId) => {
  return BANK_LOGOS[String(bankId)] || null;
};

const TOPUP_BASE = (WALLET_TOPUP_BASE || "").replace(/\/+$/, "");
const TOPUP_AE_URL = `${TOPUP_BASE}/account-enquiry`;

const WAIT_BEFORE_VERIFY_MS = 1200;
const RETRY_ON_500_DELAY_MS = 1300;
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
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}

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

export default function TopUpBankScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { showAlert, alertNode } = useAlert();

  const wallet = route.params?.wallet || null;
  const userId = route.params?.user_id || null;
  const amount = route.params?.amount || 0;
  const orderNo = route.params?.orderNo;
  const bankList = route.params?.bankList || [];

  const [selectedBankId, setSelectedBankId] = useState(
    bankList?.[0]?.id || null,
  );
  const [account, setAccount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [hint, setHint] = useState("");
  const [bankPickerVisible, setBankPickerVisible] = useState(false);

  const selectedBank = useMemo(
    () => bankList.find((b) => b.id === selectedBankId) || null,
    [bankList, selectedBankId],
  );

  useEffect(() => {
    getValidAccessToken().catch(() => {});
  }, []);

  const onVerify = useCallback(async () => {
    if (submitting) return;

    if (!orderNo) {
      showAlert({
        type: "error",
        title: "Error",
        message: "Missing order number.",
        primaryLabel: "OK",
      });
      return;
    }
    if (!selectedBankId) {
      showAlert({
        type: "warn",
        title: "Choose bank",
        message: "Please select a bank.",
        primaryLabel: "OK",
      });
      return;
    }
    const acc = String(account || "").trim();
    if (!acc || acc.length < 8) {
      showAlert({
        type: "warn",
        title: "Account number",
        message: "Please enter a valid account number.",
        primaryLabel: "OK",
      });
      return;
    }

    setSubmitting(true);
    setHint("Preparing verification…");

    try {
      const payload = {
        orderNo,
        remitterBankId: selectedBankId,
        remitterAccNo: acc,
      };

      await sleep(WAIT_BEFORE_VERIFY_MS);
      setHint("Verifying account…");

      let res;
      try {
        res = await authFetch(TOPUP_AE_URL, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      } catch (e) {
        console.log("[TopUpBank] first verify error:", e?.status, e?.message);
        if (e?.raw) console.log("[TopUpBank] first verify raw:", e.raw);

        if (Number(e?.status) === 500) {
          setHint("Server busy, retrying…");
          await sleep(RETRY_ON_500_DELAY_MS);
          setHint("Verifying again…");
          res = await authFetch(TOPUP_AE_URL, {
            method: "POST",
            body: JSON.stringify(payload),
          });
        } else {
          throw e;
        }
      }

      const data = res?.data || res;
      if (data?.responseCode !== "00") {
        throw new Error(data?.responseDesc || "Account verification failed.");
      }

      setHint("");
      navigation.navigate("TopUpOtp", {
        wallet,
        user_id: userId,
        amount,
        orderNo,
        remitterBankId: selectedBankId,
        remitterAccNo: acc,
      });
    } catch (e) {
      console.log("[TopUpBank] verify error:", e?.status, e?.message);
      if (e?.raw) console.log("[TopUpBank] verify raw:", e.raw);
      setHint("");
      if (Number(e?.status) === 500) {
        showAlert({
          type: "error",
          title: "Server busy",
          message: "Verification server is temporarily busy. Please try again.",
          primaryLabel: "OK",
        });
      } else {
        showAlert({
          type: "error",
          title: "Verification failed",
          message: String(e.message || e),
          primaryLabel: "OK",
        });
      }
    } finally {
      setSubmitting(false);
      setHint("");
    }
  }, [
    orderNo,
    selectedBankId,
    account,
    navigation,
    wallet,
    userId,
    amount,
    submitting,
    showAlert,
  ]);

  const renderBankItem = ({ item }) => {
    const active = item.id === selectedBankId;
    const logo = getBankLogoUrl(item.id);

    return (
      <TouchableOpacity
        style={[styles.bankRow, active && styles.bankRowActive]}
        onPress={() => {
          setSelectedBankId(item.id);
          setBankPickerVisible(false);
        }}
        disabled={submitting}
        activeOpacity={0.75}
      >
        <View style={styles.bankRowLeft}>
          {logo ? (
            <Image source={{ uri: logo }} style={styles.bankLogo} />
          ) : (
            <View style={styles.bankLogoFallback}>
              <Ionicons name="business-outline" size={18} color="#94A3B8" />
            </View>
          )}

          <Text style={[styles.bankName, active && styles.bankNameActive]}>
            {item.name}
          </Text>
        </View>

        {active && (
          <Ionicons name="checkmark-circle" size={20} color={G.grab} />
        )}
      </TouchableOpacity>
    );
  };

  const amountStr = amount.toFixed ? amount.toFixed(2) : String(amount);
  const isBusy = submitting;

  return (
    <View style={styles.wrap}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="light-content"
      />

      {/* ── Header ── */}
      <LinearGradient
        colors={C.gradBrand}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            disabled={isBusy}
          >
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Select Bank</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={styles.amountBadge}>
          <Ionicons
            name="arrow-up-circle-outline"
            size={14}
            color="rgba(255,255,255,0.85)"
          />
          <Text style={styles.amountBadgeText}>BTN {amountStr}</Text>
        </View>
      </LinearGradient>

      {/* ── Body ── */}
      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Bank selector */}
        <Text style={styles.sectionLabel}>Your Bank</Text>
        <TouchableOpacity
          style={styles.bankSelector}
          onPress={() => setBankPickerVisible(true)}
          activeOpacity={0.8}
          disabled={isBusy}
        >
          <View style={styles.bankSelectorLeft}>
            {selectedBank && getBankLogoUrl(selectedBank.id) ? (
              <Image
                source={{ uri: getBankLogoUrl(selectedBank.id) }}
                style={styles.bankLogoMed}
              />
            ) : (
              <View style={styles.bankLogoFallback}>
                <Ionicons name="business-outline" size={20} color="#94A3B8" />
              </View>
            )}
            <View>
              <Text style={styles.bankSelectorName}>
                {selectedBank ? selectedBank.name : "Select your bank"}
              </Text>
              {selectedBank && (
                <Text style={styles.bankSelectorSub}>Tap to change</Text>
              )}
            </View>
          </View>
          <Ionicons
            name={bankPickerVisible ? "chevron-up" : "chevron-down"}
            size={18}
            color="#64748B"
          />
        </TouchableOpacity>

        {/* Account input */}
        <Text style={[styles.sectionLabel, { marginTop: 20 }]}>
          Account Number
        </Text>
        <TextInput
          style={styles.accountInput}
          value={account}
          onChangeText={setAccount}
          keyboardType="default"
          placeholder="Enter your account number"
          placeholderTextColor="#CBD5E1"
          editable={!isBusy}
        />

        {/* Status hint */}
        {isBusy && !!hint && (
          <View style={styles.hintBanner}>
            <ActivityIndicator size="small" color={G.warn} />
            <Text style={styles.hintText}>{hint}</Text>
          </View>
        )}

        {/* Verify button */}
        <TouchableOpacity
          style={[styles.verifyBtn, (!account || isBusy) && styles.btnDisabled]}
          onPress={onVerify}
          disabled={!account || isBusy}
          activeOpacity={0.85}
        >
          {isBusy ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Text style={styles.verifyBtnText}>Verify Account</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* ── Bank picker modal ── */}
      <Modal
        visible={bankPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setBankPickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.dragHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Bank</Text>
              <TouchableOpacity
                style={styles.modalClose}
                onPress={() => setBankPickerVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={bankList}
              keyExtractor={(b) => String(b.id)}
              renderItem={renderBankItem}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </View>
      </Modal>

      {alertNode}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "#F8FAFC" },

  /* ── Header ── */
  header: {
    paddingTop:
      Platform.OS === "android" ? (StatusBar.currentHeight || 24) + 12 : 58,
    paddingHorizontal: 20,
    paddingBottom: 18,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
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
  body: { padding: 20, paddingBottom: 36 },

  sectionLabel: {
    color: "#1E293B",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 10,
  },

  /* ── Bank selector ── */
  bankSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  bankSelectorLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  bankLogoMed: {
    width: 36,
    height: 36,
    borderRadius: 10,
    resizeMode: "contain",
  },
  bankLogoFallback: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  bankSelectorName: { color: "#0F172A", fontWeight: "700", fontSize: 14 },
  bankSelectorSub: { color: "#94A3B8", fontSize: 11, marginTop: 2 },

  /* ── Account input ── */
  accountInput: {
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: "#0F172A",
    fontSize: 15,
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
  },
  hintText: { color: "#92400E", fontWeight: "600", fontSize: 13 },

  /* ── Verify button ── */
  verifyBtn: {
    backgroundColor: G.grab,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 24,
  },
  verifyBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  btnDisabled: { opacity: 0.45 },

  /* ── Modal ── */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.4)",
    justifyContent: "flex-end",
  },
  modalCard: {
    maxHeight: "65%",
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === "ios" ? 32 : 20,
    paddingTop: 8,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E2E8F0",
    alignSelf: "center",
    marginBottom: 12,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  modalTitle: { color: "#0F172A", fontSize: 16, fontWeight: "800" },
  modalClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },

  /* ── Bank rows (inside modal) ── */
  bankRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#F1F5F9",
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  bankRowActive: { borderColor: G.grab, backgroundColor: "#F5F3FF" },
  bankRowLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  bankLogo: { width: 32, height: 32, borderRadius: 8, resizeMode: "contain" },
  bankName: { color: "#1E293B", fontWeight: "600", fontSize: 14 },
  bankNameActive: { color: G.grab, fontWeight: "700" },
});
