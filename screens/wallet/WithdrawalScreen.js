// src/screens/Wallet/WithdrawalScreen.js
// ✅ Nicer inputs + Bhutan bank dropdown + auto bank code + smooth animations
// Requires: react-native-reanimated, react-native-safe-area-context, @expo/vector-icons
//
// Backend (no-auth dev):
//  - POST   /api/wallet/withdrawals
//  - GET    /api/wallet/withdrawals?user_id=...
//  - POST   /api/wallet/withdrawals/:id/cancel

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  RefreshControl,
  LayoutAnimation,
  UIManager,
  Modal,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  interpolate,
  Extrapolate,
} from "react-native-reanimated";
import { API_BASE_URL } from "@env";

// const API_BASE = WALLET_WITHDRAWAL_BASE; // change if needed

const G = {
  brand: "#00B14F",
  brandDark: "#028A47",
  bg: "#F6F7F9",
  card: "#FFFFFF",
  text: "#0F172A",
  sub: "#64748B",
  border: "rgba(2, 6, 23, 0.12)",
  border2: "rgba(2, 6, 23, 0.08)",
  danger: "#EF4444",
  warn: "#F59E0B",
  ok: "#16A34A",
};

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/**
 * Bhutan banks list
 * Note: Codes vary per implementation. You can adjust codes to match your internal mapping.
 */
const BT_BANKS = [
  { code: "BOB", name: "Bank of Bhutan" },
  { code: "BNB", name: "Bhutan National Bank" },
  { code: "BDBL", name: "Bhutan Development Bank" },
  { code: "DKB", name: "Druk PNB Bank" }, // rename/code if you use different
  { code: "T-BANK", name: "T-Bank" }, // rename/code if you use different
];

const safe = (v) => (v == null ? "" : String(v));
const makeIdemKey = () => `wd-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const normalizeAmount = (txt) => {
  const s = safe(txt).trim().replace(/,/g, "");
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  const [i, d = ""] = s.split(".");
  const dec = (d + "00").slice(0, 2);
  return `${Number(i)}.${dec}`;
};

const fmtNu = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "Nu. 0.00";
  return `Nu. ${n.toFixed(2)}`;
};

const statusMeta = (st) => {
  const s = String(st || "").toUpperCase();
  if (s === "PAID") return { label: "Paid", icon: "checkmark-circle", color: G.ok };
  if (s === "APPROVED") return { label: "Approved", icon: "shield-checkmark", color: G.ok };
  if (s === "HELD") return { label: "Held", icon: "time", color: G.warn };
  if (s === "NEEDS_INFO") return { label: "Needs info", icon: "alert-circle", color: G.warn };
  if (s === "REJECTED") return { label: "Rejected", icon: "close-circle", color: G.danger };
  if (s === "CANCELLED") return { label: "Cancelled", icon: "remove-circle", color: G.sub };
  if (s === "FAILED") return { label: "Failed", icon: "warning", color: G.danger };
  return { label: safe(st) || "Unknown", icon: "help-circle", color: G.sub };
};

const canCancel = (st) => ["HELD", "NEEDS_INFO"].includes(String(st || "").toUpperCase());

function BankPicker({ visible, onClose, value, onPick }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return BT_BANKS;
    return BT_BANKS.filter((b) => b.name.toLowerCase().includes(s) || b.code.toLowerCase().includes(s));
  }, [q]);

  useEffect(() => {
    if (!visible) setQ("");
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose} />
      <View style={styles.modalSheet}>
        <View style={styles.modalTop}>
          <Text style={styles.modalTitle}>Select your bank</Text>
          <Pressable onPress={onClose} style={({ pressed }) => [styles.modalClose, pressed && { opacity: 0.7 }]}>
            <Ionicons name="close" size={18} color={G.text} />
          </Pressable>
        </View>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={G.sub} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search bank…"
            placeholderTextColor="rgba(15,23,42,0.35)"
            style={styles.searchInput}
          />
        </View>

        <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
          {filtered.map((b) => {
            const active = value?.code === b.code;
            return (
              <Pressable
                key={b.code}
                onPress={() => onPick(b)}
                style={({ pressed }) => [
                  styles.bankRow,
                  active && styles.bankRowActive,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <View style={styles.bankLeft}>
                  <View style={[styles.bankDot, active && { backgroundColor: G.brandDark, borderColor: G.brandDark }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.bankName}>{b.name}</Text>
                    <Text style={styles.bankCode}>Code: {b.code}</Text>
                  </View>
                </View>
                {active ? <Ionicons name="checkmark" size={18} color={G.brandDark} /> : null}
              </Pressable>
            );
          })}
          {filtered.length === 0 ? (
            <View style={{ padding: 14 }}>
              <Text style={{ color: G.sub }}>No banks found.</Text>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function WithdrawalScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();

  const userId = useMemo(() => {
    const p = route?.params || {};
    return Number(p.user_id || 59); // dev fallback
  }, [route?.params]);

  // --- Form state ---
  const [amountTxt, setAmountTxt] = useState("");
  const [bankPickerOpen, setBankPickerOpen] = useState(false);
  const [bank, setBank] = useState(BT_BANKS[0]); // default BOB
  const [accountNo, setAccountNo] = useState("");
  const [accountName, setAccountName] = useState("");
  const [note, setNote] = useState("");

  // --- List state ---
  const [items, setItems] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  const [submitting, setSubmitting] = useState(false);

  // --- Animations ---
  const hero = useSharedValue(0);
  const pulse = useSharedValue(1);

  useEffect(() => {
    hero.value = withTiming(1, { duration: 380 });
  }, [hero]);

  const heroStyle = useAnimatedStyle(() => {
    const y = interpolate(hero.value, [0, 1], [14, 0], Extrapolate.CLAMP);
    const op = interpolate(hero.value, [0, 1], [0, 1], Extrapolate.CLAMP);
    return { transform: [{ translateY: y }], opacity: op };
  });

  const ctaStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  const fetchList = useCallback(async () => {
    setLoadingList(true);
    try {
      const url = `${API_BASE_URL}/bfs/api/wallet/withdrawals?user_id=${encodeURIComponent(String(userId))}&limit=50&offset=0`;
      const res = await fetch(url);
      const j = await res.json().catch(() => ({}));
      console.log("Fetch withdrawals:", url, j);
      if (!res.ok || j?.ok === false) throw new Error(j?.error || j?.message || "Failed to load withdrawals");
      setItems(Array.isArray(j?.data) ? j.data : []);
    } catch (e) {
      Alert.alert("Error", e?.message || "Failed to load withdrawals");
    } finally {
      setLoadingList(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchList();
    } finally {
      setRefreshing(false);
    }
  }, [fetchList]);

  const validate = () => {
    const amt = normalizeAmount(amountTxt);
    if (!amt) return { ok: false, msg: "Enter a valid amount (e.g., 120 or 120.00)" };
    if (Number(amt) <= 0) return { ok: false, msg: "Amount must be greater than 0" };
    if (!safe(accountNo).trim()) return { ok: false, msg: "Account number is required" };
    if (!safe(accountName).trim()) return { ok: false, msg: "Account name is required" };
    if (!bank?.code || !bank?.name) return { ok: false, msg: "Select a bank" };
    return { ok: true, amt };
  };

  const submitWithdrawal = useCallback(async () => {
    const v = validate();
    if (!v.ok) {
      pulse.value = withSpring(0.97, { damping: 14, stiffness: 220 });
      setTimeout(() => (pulse.value = withSpring(1, { damping: 14, stiffness: 220 })), 120);
      return Alert.alert("Check details", v.msg);
    }

    setSubmitting(true);
    try {
      const idem = makeIdemKey();
      const body = {
        user_id: userId,
        amount: v.amt,
        bank: {
          bank_code: bank.code,
          bank_name: bank.name,
          account_no: safe(accountNo).trim(),
          account_name: safe(accountName).trim(),
        },
        user_note: safe(note).trim() || null,
      };

      const res = await fetch(`${API_BASE_URL}/bfs/api/wallet/withdrawals`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idem },
        body: JSON.stringify(body),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.ok === false) throw new Error(j?.error || j?.message || "Withdrawal request failed");

      pulse.value = withSpring(1.03, { damping: 14, stiffness: 220 });
      setTimeout(() => (pulse.value = withSpring(1, { damping: 14, stiffness: 220 })), 160);

      setAmountTxt("");
      setNote("");

      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      await fetchList();

      Alert.alert("Request submitted", "Your withdrawal request is now HELD for admin review.");
    } catch (e) {
      Alert.alert("Error", e?.message || "Withdrawal request failed");
    } finally {
      setSubmitting(false);
    }
  }, [userId, amountTxt, bank, accountNo, accountName, note, fetchList, pulse]);

  const cancelRequest = useCallback(
    async (requestId) => {
      Alert.alert("Cancel withdrawal?", "This will refund the held amount back to your wallet.", [
        { text: "No", style: "cancel" },
        {
          text: "Yes, cancel",
          style: "destructive",
          onPress: async () => {
            try {
              const res = await fetch(`${API_BASE_URL}/bfs/api/wallet/withdrawals/${encodeURIComponent(String(requestId))}/cancel`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_id: userId }),
              });
              const j = await res.json().catch(() => ({}));
              if (!res.ok || j?.ok === false) throw new Error(j?.error || j?.message || "Cancel failed");

              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              await fetchList();
              Alert.alert("Cancelled", "Your withdrawal was cancelled and refunded.");
            } catch (e) {
              Alert.alert("Error", e?.message || "Cancel failed");
            }
          },
        },
      ]);
    },
    [userId, fetchList]
  );

  const toggleExpand = (id) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const amountPreview = useMemo(() => {
    const a = normalizeAmount(amountTxt);
    return a ? fmtNu(a) : "Nu. 0.00";
  }, [amountTxt]);

  return (
    <SafeAreaView style={[styles.safe, { paddingTop: insets.top }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={{ paddingBottom: 22 + insets.bottom }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View style={[styles.header, heroStyle]}>
            <View style={styles.headerTop}>
              <Pressable
                onPress={() => (navigation?.goBack ? navigation.goBack() : null)}
                style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name="chevron-back" size={22} color={G.text} />
              </Pressable>

              <Text style={styles.headerTitle}>Withdraw</Text>

              <View style={styles.iconBtn} />
            </View>

            <View style={styles.heroRow}>
              <View style={styles.heroLeft}>
                <Text style={styles.headerSub}>Send a request. Admin verifies & transfers.</Text>
                <Text style={styles.heroAmount}>{amountPreview}</Text>
              </View>
              <View style={styles.heroBadge}>
                <Ionicons name="card-outline" size={18} color={G.brandDark} />
                <Text style={styles.heroBadgeText}>Bank</Text>
              </View>
            </View>
          </Animated.View>

          {/* Form */}
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <Ionicons name="cash-outline" size={18} color={G.brandDark} />
              <Text style={styles.cardTitle}>Withdrawal details</Text>
            </View>

            {/* Amount */}
            <Field label="Amount (Nu.)" hint="Enter amount with up to 2 decimals">
              <View style={styles.niceInputWrap}>
                <Ionicons name="wallet-outline" size={18} color={G.sub} />
                <Text style={styles.nuPrefix}>Nu.</Text>
                <TextInput
                  value={amountTxt}
                  onChangeText={setAmountTxt}
                  placeholder="120.00"
                  placeholderTextColor="rgba(15,23,42,0.35)"
                  keyboardType="decimal-pad"
                  style={styles.niceInput}
                />
                <Pressable
                  onPress={() => setAmountTxt("100.00")}
                  style={({ pressed }) => [styles.quickChip, pressed && { opacity: 0.7 }]}
                >
                  <Text style={styles.quickChipText}>+100</Text>
                </Pressable>
              </View>
            </Field>

            {/* Bank dropdown */}
            <Field label="Bank" hint="Select your bank (code is auto-filled)">
              <Pressable
                onPress={() => setBankPickerOpen(true)}
                style={({ pressed }) => [styles.dropdown, pressed && { opacity: 0.88 }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.dropdownMain}>{bank?.name}</Text>
                  <Text style={styles.dropdownSub}>Code: {bank?.code}</Text>
                </View>
                <Ionicons name="chevron-down" size={18} color={G.sub} />
              </Pressable>
            </Field>

            {/* Account number */}
            <Field label="Account number" hint="Double check the number before submitting">
              <View style={styles.niceInputWrap}>
                <Ionicons name="key-outline" size={18} color={G.sub} />
                <TextInput
                  value={accountNo}
                  onChangeText={setAccountNo}
                  placeholder="0123456789"
                  placeholderTextColor="rgba(15,23,42,0.35)"
                  keyboardType="number-pad"
                  style={styles.niceInput}
                />
              </View>
            </Field>

            {/* Account name */}
            <Field label="Account name" hint="Use the exact name as in the bank account">
              <View style={styles.niceInputWrap}>
                <Ionicons name="person-outline" size={18} color={G.sub} />
                <TextInput
                  value={accountName}
                  onChangeText={setAccountName}
                  placeholder="Keshar Bhujel"
                  placeholderTextColor="rgba(15,23,42,0.35)"
                  style={styles.niceInput}
                />
              </View>
            </Field>

            {/* Note */}
            <Field label="Note (optional)" hint="Short note for admin (optional)">
              <View style={styles.niceInputWrap}>
                <Ionicons name="chatbubble-ellipses-outline" size={18} color={G.sub} />
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder="Any message for admin…"
                  placeholderTextColor="rgba(15,23,42,0.35)"
                  style={styles.niceInput}
                />
              </View>
            </Field>

            {/* CTA */}
            <Animated.View style={[styles.ctaWrap, ctaStyle]}>
              <Pressable
                onPress={submitWithdrawal}
                disabled={submitting}
                style={({ pressed }) => [
                  styles.cta,
                  pressed && { opacity: 0.88 },
                  submitting && { opacity: 0.65 },
                ]}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="arrow-up-circle" size={18} color="#fff" />
                    <Text style={styles.ctaText}>Submit request</Text>
                  </>
                )}
              </Pressable>
            </Animated.View>

            <View style={styles.smallRow}>
              <Ionicons name="lock-closed-outline" size={14} color={G.sub} />
              <Text style={styles.smallText}>
                Wallet is debited immediately and held until final decision.
              </Text>
            </View>
          </View>

          {/* History */}
          <View style={[styles.sectionHead, { marginTop: 14 }]}>
            <Text style={styles.sectionTitle}>History</Text>
            <Pressable
              onPress={fetchList}
              style={({ pressed }) => [styles.refreshBtn, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="refresh" size={16} color={G.text} />
              <Text style={styles.refreshText}>Refresh</Text>
            </Pressable>
          </View>

          <View style={styles.listCard}>
            {loadingList ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator color={G.brandDark} />
                <Text style={styles.loadingText}>Loading…</Text>
              </View>
            ) : items.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="document-text-outline" size={28} color={G.sub} />
                <Text style={styles.emptyTitle}>No withdrawals yet</Text>
                <Text style={styles.emptySub}>Create your first withdrawal request above.</Text>
              </View>
            ) : (
              items.map((it) => {
                const id = it.request_id || it.id || "";
                const meta = statusMeta(it.status);
                const expanded = expandedId === id;

                return (
                  <View key={id} style={styles.item}>
                    <Pressable onPress={() => toggleExpand(id)} style={({ pressed }) => [styles.itemTop, pressed && { opacity: 0.9 }]}>
                      <View style={styles.itemLeft}>
                        <View style={[styles.chip, { borderColor: meta.color }]}>
                          <Ionicons name={meta.icon} size={14} color={meta.color} />
                          <Text style={[styles.chipText, { color: meta.color }]}>{meta.label}</Text>
                        </View>

                        <Text style={styles.itemAmount}>{fmtNu(it.amount)}</Text>
                        <Text style={styles.itemSub}>
                          {safe(it.bank_name)} • {safe(it.account_no).slice(-4).padStart(4, "•")}
                        </Text>
                      </View>

                      <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={G.sub} />
                    </Pressable>

                    {expanded && (
                      <View style={styles.itemBody}>
                        <Row k="Request ID" v={safe(it.request_id)} />
                        <Row k="Bank" v={`${safe(it.bank_name)} (${safe(it.bank_code)})`} />
                        <Row k="Account" v={`${safe(it.account_name)} • ${safe(it.account_no)}`} />
                        {safe(it.user_note) ? <Row k="Note" v={safe(it.user_note)} /> : null}
                        {safe(it.admin_note) ? <Row k="Admin note" v={safe(it.admin_note)} /> : null}
                        {safe(it.bank_reference) ? <Row k="Bank ref" v={safe(it.bank_reference)} /> : null}

                        <View style={styles.itemActions}>
                          <Pressable
                            onPress={() => Alert.alert("Details", `Status: ${meta.label}\nAmount: ${fmtNu(it.amount)}\nID: ${safe(it.request_id)}`)}
                            style={({ pressed }) => [styles.ghostBtn, pressed && { opacity: 0.75 }]}
                          >
                            <Ionicons name="information-circle-outline" size={18} color={G.text} />
                            <Text style={styles.ghostText}>Details</Text>
                          </Pressable>

                          <Pressable
                            onPress={() => (canCancel(it.status) ? cancelRequest(it.request_id) : null)}
                            disabled={!canCancel(it.status)}
                            style={({ pressed }) => [
                              styles.dangerBtn,
                              pressed && { opacity: 0.85 },
                              !canCancel(it.status) && { opacity: 0.45 },
                            ]}
                          >
                            <Ionicons name="close-circle-outline" size={18} color="#fff" />
                            <Text style={styles.dangerText}>Cancel</Text>
                          </Pressable>
                        </View>

                        {!canCancel(it.status) && (
                          <Text style={styles.disabledNote}>
                            Cancellation is only available while HELD or NEEDS_INFO.
                          </Text>
                        )}
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>

        <BankPicker
          visible={bankPickerOpen}
          value={bank}
          onClose={() => setBankPickerOpen(false)}
          onPick={(b) => {
            setBank(b);
            setBankPickerOpen(false);
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          }}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, hint, children }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

function Row({ k, v }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowKey}>{k}</Text>
      <Text style={styles.rowVal} numberOfLines={2}>
        {v}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: G.bg },
  flex: { flex: 1 },

  header: { paddingHorizontal: 16,paddingBottom: 10 },
  headerTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: G.border,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 18, fontWeight: "800", color: G.text },
  headerSub: { marginTop: 8, fontSize: 13, color: G.sub, lineHeight: 18 },

  heroRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 10, gap: 12 },
  heroLeft: { flex: 1 },
  heroAmount: { marginTop: 6, fontSize: 18, fontWeight: "900", color: G.text },
  heroBadge: {
    height: 38,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: G.border2,
    backgroundColor: "#fff",
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  heroBadgeText: { fontSize: 12, fontWeight: "800", color: G.text },

  card: {
    marginHorizontal: 16,
    marginTop: 10,
    backgroundColor: G.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: G.border,
    padding: 14,
  },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  cardTitle: { fontSize: 14, fontWeight: "800", color: G.text },

  field: { marginTop: 12 },
  label: { fontSize: 12, color: G.sub, marginBottom: 8, fontWeight: "700" },
  hint: { fontSize: 11, color: "rgba(100,116,139,0.92)", marginTop: 8 },

  // nicer input wrapper
  niceInputWrap: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: G.border,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  nuPrefix: { fontSize: 13, color: G.sub, fontWeight: "800" },
  niceInput: { flex: 1, height: 48, fontSize: 14, color: G.text },

  quickChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(2, 138, 71, 0.25)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(2, 138, 71, 0.06)",
  },
  quickChipText: { fontSize: 12, fontWeight: "900", color: G.brandDark },

  dropdown: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: G.border,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  dropdownMain: { fontSize: 14, fontWeight: "900", color: G.text },
  dropdownSub: { fontSize: 12, color: G.sub, marginTop: 2 },

  ctaWrap: { marginTop: 14 },
  cta: {
    height: 48,
    borderRadius: 16,
    backgroundColor: G.brandDark,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  ctaText: { color: "#fff", fontSize: 14, fontWeight: "900" },

  smallRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  smallText: { flex: 1, fontSize: 11, color: G.sub, lineHeight: 16 },

  sectionHead: {
    marginHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 14, fontWeight: "900", color: G.text },
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: G.border,
    backgroundColor: "#fff",
  },
  refreshText: { fontSize: 12, color: G.text, fontWeight: "800" },

  listCard: {
    marginHorizontal: 16,
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: G.border,
    overflow: "hidden",
  },

  loadingBox: { padding: 16, flexDirection: "row", alignItems: "center", gap: 10 },
  loadingText: { color: G.sub, fontSize: 12 },

  emptyBox: { padding: 18, alignItems: "center" },
  emptyTitle: { marginTop: 10, fontSize: 14, fontWeight: "900", color: G.text },
  emptySub: { marginTop: 4, fontSize: 12, color: G.sub, textAlign: "center" },

  item: { borderTopWidth: 1, borderTopColor: G.border },
  itemTop: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  itemLeft: { flex: 1 },

  chip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "#fff",
    marginBottom: 8,
  },
  chipText: { fontSize: 12, fontWeight: "900" },

  itemAmount: { fontSize: 16, fontWeight: "900", color: G.text, marginBottom: 4 },
  itemSub: { fontSize: 12, color: G.sub },

  itemBody: { paddingHorizontal: 14, paddingBottom: 12, paddingTop: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12, marginTop: 8 },
  rowKey: { fontSize: 12, color: G.sub },
  rowVal: { flex: 1, fontSize: 12, color: G.text, textAlign: "right" },

  itemActions: { flexDirection: "row", gap: 10, marginTop: 14 },
  ghostBtn: {
    flex: 1,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: G.border,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  ghostText: { fontSize: 13, fontWeight: "900", color: G.text },

  dangerBtn: {
    flex: 1,
    height: 42,
    borderRadius: 14,
    backgroundColor: G.danger,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  dangerText: { fontSize: 13, fontWeight: "900", color: "#fff" },

  disabledNote: { marginTop: 10, fontSize: 11, color: G.sub, lineHeight: 16 },

  // Modal (bank picker)
  modalBackdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.35)" },
  modalSheet: {
    position: "absolute",
    left: 14,
    right: 14,
    top: 110,
    backgroundColor: "#fff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: G.border,
    overflow: "hidden",
  },
  modalTop: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: G.border2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalTitle: { fontSize: 14, fontWeight: "900", color: G.text },
  modalClose: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: G.border2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  searchWrap: {
    height: 44,
    margin: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: G.border,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchInput: { flex: 1, height: 44, fontSize: 13, color: G.text },

  bankRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: G.border2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  bankRowActive: { backgroundColor: "rgba(2, 138, 71, 0.05)" },
  bankLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  bankDot: {
    width: 12,
    height: 12,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: G.border,
    backgroundColor: "#fff",
  },
  bankName: { fontSize: 13, fontWeight: "900", color: G.text },
  bankCode: { fontSize: 12, color: G.sub, marginTop: 2 },
});
