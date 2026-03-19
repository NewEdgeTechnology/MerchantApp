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
  Alert,
  FlatList,
  Modal,
  Image,
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

// BFS bank ID → logo image
const BANK_LOGOS = {
  "1010": require("../../assets/banks/bob.png"),
  "1020": require("../../assets/banks/bnb.png"),
  "1030": require("../../assets/banks/drukpnb.png"),
  "1040": require("../../assets/banks/tbank.jpeg"),
  "1050": require("../../assets/banks/bdbl.jpeg"),
  "1060": require("../../assets/banks/dk.png"),
  "1070": require("../../assets/banks/unionpay.png"),
};

const TOPUP_BASE = (WALLET_TOPUP_BASE || "").replace(/\/+$/, "");
const TOPUP_AE_URL = `${TOPUP_BASE}/account-enquiry`;

const WAIT_BEFORE_VERIFY_MS = 1200;
const RETRY_ON_500_DELAY_MS = 1300;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function authFetch(url, opts = {}) {
  const token = await getValidAccessToken();

  const baseHeaders = {
    "Content-Type": "application/json",
  };

  const headers = token
    ? { ...baseHeaders, Authorization: `Bearer ${token}` }
    : baseHeaders;

  const res = await fetch(url, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      ...headers,
    },
  });

  const text = await res.text();
  let json = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
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

export default function TopUpBank() {
  const navigation = useNavigation();
  const route = useRoute();

  const wallet = route?.params?.wallet || null;
  const userId = route?.params?.user_id || null;
  const amount = Number(route?.params?.amount || 0);
  const orderNo = route?.params?.orderNo || null;
  const bfsTxnId = route?.params?.bfsTxnId || null;
  const bankList = Array.isArray(route?.params?.bankList)
    ? route.params.bankList
    : [];

  const [selectedBankId, setSelectedBankId] = useState(
    bankList?.[0]?.id || bankList?.[0]?.bankId || null
  );
  const [account, setAccount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [hint, setHint] = useState("");
  const [bankPickerVisible, setBankPickerVisible] = useState(false);

  const selectedBank = useMemo(() => {
    return (
      bankList.find(
        (b) => String(b?.id || b?.bankId) === String(selectedBankId)
      ) || null
    );
  }, [bankList, selectedBankId]);

  useEffect(() => {
    getValidAccessToken().catch(() => {});
  }, []);

  const onChangeAccount = useCallback((val) => {
    const clean = String(val || "").replace(/[^\d]/g, "");
    setAccount(clean);
  }, []);

  const onVerify = useCallback(async () => {
    if (submitting) return;

    if (!orderNo) {
      Alert.alert("Error", "Missing order number.");
      return;
    }

    if (!selectedBankId) {
      Alert.alert("Choose bank", "Please select a bank.");
      return;
    }

    const acc = String(account || "").trim();
    if (!acc || acc.length < 8) {
      Alert.alert("Account number", "Please enter a valid account number.");
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

      console.log("[TopUpBank] verify payload:", payload);

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
      console.log("[TopUpBank] verify response data:", data);

      if (data?.responseCode !== "00") {
        throw new Error(data?.responseDesc || "Account verification failed.");
      }

      setHint("");

      Alert.alert("Account verified", "Proceed to OTP.", [
        {
          text: "Continue",
          onPress: () => {
            navigation.navigate("TopUpOtp", {
              wallet,
              user_id: userId,
              amount,
              orderNo,
              bfsTxnId,
              remitterBankId: selectedBankId,
              remitterAccNo: acc,
              selectedBank,
            });
          },
        },
      ]);
    } catch (e) {
      console.log("[TopUpBank] verify error:", e?.status, e?.message);
      if (e?.raw) console.log("[TopUpBank] verify raw:", e.raw);

      setHint("");

      if (Number(e?.status) === 500) {
        Alert.alert(
          "Server busy",
          "Verification server is temporarily busy. Please try again."
        );
      } else {
        Alert.alert("Verification failed", String(e?.message || e));
      }
    } finally {
      setSubmitting(false);
      setHint("");
    }
  }, [
    submitting,
    orderNo,
    selectedBankId,
    account,
    navigation,
    wallet,
    userId,
    amount,
    bfsTxnId,
    selectedBank,
  ]);

  const renderBankItem = ({ item }) => {
    const itemId = String(item?.id || item?.bankId || "");
    const itemName = item?.name || item?.bankName || "Bank";
    const active = String(itemId) === String(selectedBankId);
    const logo = BANK_LOGOS[itemId];

    return (
      <TouchableOpacity
        style={[styles.bankRow, active && styles.bankRowActive]}
        onPress={() => {
          setSelectedBankId(itemId);
          setBankPickerVisible(false);
        }}
        disabled={submitting}
      >
        <View style={styles.bankRowLeft}>
          {logo ? <Image source={logo} style={styles.bankLogo} /> : null}
          <Text style={styles.bankName}>{itemName}</Text>
        </View>

        {active ? (
          <Ionicons name="checkmark-circle" size={20} color={G.grab} />
        ) : null}
      </TouchableOpacity>
    );
  };

  const isBusy = submitting;

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
            style={[styles.backBtn, styles.backBtnFilled]}
            onPress={() => navigation.goBack()}
            disabled={isBusy}
          >
            <Ionicons name="chevron-back" size={22} color={G.white} />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Select Bank</Text>
          <View style={{ width: 32 }} />
        </View>

        <Text style={styles.subHeader}>
          Amount: BTN {Number.isFinite(amount) ? amount.toFixed(2) : amount}
        </Text>
      </LinearGradient>

      <View style={styles.body}>
        <Text style={styles.label}>Choose your bank</Text>

        <TouchableOpacity
          style={styles.dropdown}
          onPress={() => setBankPickerVisible(true)}
          activeOpacity={0.8}
          disabled={isBusy}
        >
          <View style={styles.dropdownLeft}>
            {selectedBank && BANK_LOGOS[String(selectedBank?.id || selectedBank?.bankId)] ? (
              <Image
                source={
                  BANK_LOGOS[String(selectedBank?.id || selectedBank?.bankId)]
                }
                style={styles.bankLogoSmall}
              />
            ) : null}

            <Text
              style={[
                styles.dropdownText,
                !selectedBank && { color: "#9CA3AF" },
              ]}
              numberOfLines={1}
            >
              {selectedBank
                ? selectedBank?.name || selectedBank?.bankName || "Selected bank"
                : "Select bank"}
            </Text>
          </View>

          <Ionicons
            name={bankPickerVisible ? "chevron-up" : "chevron-down"}
            size={18}
            color={G.slate}
          />
        </TouchableOpacity>

        <Text style={[styles.label, { marginTop: 16 }]}>
          Enter account number
        </Text>

        <TextInput
          style={styles.input}
          value={account}
          onChangeText={onChangeAccount}
          keyboardType="number-pad"
          placeholder="Account number"
          placeholderTextColor="#CBD5E1"
          editable={!isBusy}
          maxLength={30}
        />

        {isBusy && !!hint ? (
          <View style={styles.hintRow}>
            <ActivityIndicator size="small" color={G.warn} />
            <Text style={styles.hintText}>{hint}</Text>
          </View>
        ) : null}

        <View style={{ flex: 1 }} />

        <TouchableOpacity
          style={[
            styles.primaryBtn,
            (!account || !selectedBankId || isBusy) && styles.btnDisabled,
          ]}
          onPress={onVerify}
          disabled={!account || !selectedBankId || isBusy}
          activeOpacity={0.85}
        >
          {isBusy ? (
            <ActivityIndicator size="small" color={G.white} />
          ) : (
            <Text style={styles.primaryText}>Verify Account</Text>
          )}
        </TouchableOpacity>
      </View>

      <Modal
        visible={bankPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setBankPickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Bank</Text>
              <TouchableOpacity
                onPress={() => setBankPickerVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                disabled={isBusy}
              >
                <Ionicons name="close" size={20} color={G.slate} />
              </TouchableOpacity>
            </View>

            <FlatList
              data={bankList}
              keyExtractor={(b, i) => String(b?.id || b?.bankId || i)}
              renderItem={renderBankItem}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 6 }}
              ListEmptyComponent={
                <View style={styles.emptyWrap}>
                  <Text style={styles.emptyText}>No banks available.</Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: G.bg,
  },
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
  backBtnFilled: {
    backgroundColor: "rgba(255,255,255,.18)",
  },
  headerTitle: {
    color: G.white,
    fontSize: 18,
    fontWeight: "800",
  },
  subHeader: {
    marginTop: 8,
    color: G.white,
    fontWeight: "600",
    fontSize: 13,
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
  dropdown: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: G.line,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dropdownLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  dropdownText: {
    color: G.slate,
    fontWeight: "700",
    fontSize: 14,
    flexShrink: 1,
    marginLeft: 10,
  },
  bankRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: G.line,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  bankRowActive: {
    borderColor: G.grab,
    backgroundColor: "#ECFDF3",
  },
  bankRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  bankName: {
    color: G.slate,
    fontWeight: "700",
    marginLeft: 10,
    flexShrink: 1,
  },
  bankLogo: {
    width: 28,
    height: 28,
    borderRadius: 6,
    resizeMode: "contain",
  },
  bankLogoSmall: {
    width: 22,
    height: 22,
    borderRadius: 6,
    resizeMode: "contain",
  },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: G.line,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: G.text,
    fontSize: 14,
  },
  hintRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  hintText: {
    color: G.sub,
    fontWeight: "700",
    fontSize: 13,
    marginLeft: 8,
  },
  primaryBtn: {
    backgroundColor: G.grab,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 24,
  },
  primaryText: {
    color: G.white,
    fontWeight: "800",
    fontSize: 16,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.35)",
    justifyContent: "flex-end",
  },
  modalCard: {
    maxHeight: "60%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  modalTitle: {
    color: G.slate,
    fontSize: 16,
    fontWeight: "800",
  },
  emptyWrap: {
    paddingVertical: 20,
    alignItems: "center",
  },
  emptyText: {
    color: G.sub,
    fontSize: 13,
    fontWeight: "600",
  },
});