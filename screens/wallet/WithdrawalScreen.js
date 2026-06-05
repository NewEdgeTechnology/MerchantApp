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
  ActivityIndicator,
  RefreshControl,
  LayoutAnimation,
  UIManager,
  Modal,
  StatusBar,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAlert } from "../../components/CustomAlert";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  interpolate,
  Extrapolate,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { API_API_BASE_URL } from "@env";
import { C } from "../../theme";

// const API_BASE = WALLET_WITHDRAWAL_BASE; // change if needed

const G = {
  brand:     C.brand,
  brandDark: C.brandDark,
  bg:        C.card2,
  card:      C.card,
  text:      C.text,
  sub:       C.sub,
  border:    C.border,
  border2:   C.border,
  danger:    C.danger,
  warn:      C.warn,
  ok:        C.success,
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

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DEFAULT_VISIBLE = 5;

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
  const insets = useSafeAreaInsets();

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return BT_BANKS;
    return BT_BANKS.filter((b) => b.name.toLowerCase().includes(s) || b.code.toLowerCase().includes(s));
  }, [q]);

  useEffect(() => { if (!visible) setQ(""); }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <View style={[styles.bankSheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Select Bank</Text>
          <Pressable onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={22} color={G.sub} />
          </Pressable>
        </View>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={G.sub} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search bank…"
            placeholderTextColor={G.sub}
            style={styles.searchInput}
          />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 320 }}>
          {filtered.map((b) => {
            const active = value?.code === b.code;
            return (
              <Pressable
                key={b.code}
                onPress={() => onPick(b)}
                style={({ pressed }) => [styles.bankRow, pressed && { backgroundColor: "#F8FAFC" }]}
              >
                <View style={[styles.bankDot, active && { backgroundColor: G.brand, borderColor: G.brand }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.bankName, active && { color: G.brand }]}>{b.name}</Text>
                  <Text style={styles.bankCode}>{b.code}</Text>
                </View>
                {active && <Ionicons name="checkmark-circle" size={20} color={G.brand} />}
              </Pressable>
            );
          })}
          {filtered.length === 0 && (
            <Text style={{ color: G.sub, padding: 16, textAlign: "center" }}>No banks found.</Text>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function WithdrawalScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { showAlert, alertNode } = useAlert();

  const userId = useMemo(() => {
    const p = route?.params || {};
    // console.log("WithdrawalScreen route params:", p);
    console.log("WithdrawalScreen user_id param:", p.wallet.user_id);
    return Number(p.wallet.user_id); // dev fallback
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

  // --- Date filter ---
  const _now = new Date();
  const [filterVisible, setFilterVisible] = useState(false);
  const [dateFilterActive, setDateFilterActive] = useState(false);
  const [fromMonth, setFromMonth] = useState(_now.getMonth());
  const [fromYear, setFromYear]   = useState(_now.getFullYear());
  const [toMonth, setToMonth]     = useState(_now.getMonth());
  const [toYear, setToYear]       = useState(_now.getFullYear());
  const [showAll, setShowAll]     = useState(false);

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
      showAlert({ type: "error", title: "Error", message: e?.message || "Failed to load withdrawals", primaryLabel: "OK" });
    } finally {
      setLoadingList(false);
    }
  }, [userId, showAlert]);

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
      showAlert({ type: "warn", title: "Check details", message: v.msg, primaryLabel: "OK" });
      return;
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
      console.log("Submitting withdrawal:", body, "IdemKey:", idem);
      // return;
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

      showAlert({ type: "success", title: "Request submitted", message: "Your withdrawal request is now HELD for admin review.", primaryLabel: "OK" });
    } catch (e) {
      showAlert({ type: "error", title: "Error", message: e?.message || "Withdrawal request failed", primaryLabel: "OK" });
    } finally {
      setSubmitting(false);
    }
  }, [userId, amountTxt, bank, accountNo, accountName, note, fetchList, pulse, showAlert]);

  const cancelRequest = useCallback(
    async (requestId) => {
      showAlert({
        type: "confirm",
        title: "Cancel withdrawal?",
        message: "This will refund the held amount back to your wallet.",
        primaryLabel: "Yes, cancel",
        primaryAction: async () => {
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
            showAlert({ type: "success", title: "Cancelled", message: "Your withdrawal was cancelled and refunded.", primaryLabel: "OK" });
          } catch (e) {
            showAlert({ type: "error", title: "Error", message: e?.message || "Cancel failed", primaryLabel: "OK" });
          }
        },
        secondaryLabel: "No",
      });
    },
    [userId, fetchList, showAlert]
  );

  const toggleExpand = (id) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const amountPreview = useMemo(() => {
    const a = normalizeAmount(amountTxt);
    return a ? fmtNu(a) : "Nu. 0.00";
  }, [amountTxt]);

  // Month navigation helpers
  const stepMonth = (month, year, dir, setM, setY) => {
    let m = month + dir, y = year;
    if (m > 11) { m = 0; y++; }
    if (m < 0)  { m = 11; y--; }
    setM(m); setY(y);
  };

  // Filter + pagination
  const filteredItems = useMemo(() => {
    if (!dateFilterActive) return items;
    const fromVal = fromYear * 12 + fromMonth;
    const toVal   = toYear   * 12 + toMonth;
    return items.filter((it) => {
      const d = new Date(it.created_at || it.requested_at || it.updated_at || 0);
      const v = d.getFullYear() * 12 + d.getMonth();
      return v >= fromVal && v <= toVal;
    });
  }, [items, dateFilterActive, fromMonth, fromYear, toMonth, toYear]);

  const visibleItems = showAll ? filteredItems : filteredItems.slice(0, DEFAULT_VISIBLE);
  const hasMore = !showAll && filteredItems.length > DEFAULT_VISIBLE;

  const applyFilter = () => {
    setShowAll(false);
    setDateFilterActive(true);
    setFilterVisible(false);
  };

  const clearFilter = () => {
    setDateFilterActive(false);
    setShowAll(false);
    const n = new Date();
    setFromMonth(n.getMonth()); setFromYear(n.getFullYear());
    setToMonth(n.getMonth());   setToYear(n.getFullYear());
  };

  return (
    <View style={styles.safe}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* ── Gradient header ── */}
      <LinearGradient
        colors={C.gradBrand}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + 12 }]}
      >
        <Animated.View style={heroStyle}>
          <View style={styles.headerRow}>
            <Pressable
              onPress={() => navigation?.goBack?.()}
              style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </Pressable>
            <Text style={styles.headerTitle}>Withdraw</Text>
            <View style={{ width: 38 }} />
          </View>

          <View style={styles.amountHero}>
            <Text style={styles.amountHeroLabel}>Withdrawal Amount</Text>
            <Text style={styles.amountHeroValue}>{amountPreview}</Text>
            <Text style={styles.amountHeroSub}>Admin reviews before bank transfer</Text>
          </View>
        </Animated.View>
      </LinearGradient>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={G.brand} />}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

          {/* ── Form section ── */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Amount</Text>
            <View style={styles.flatField}>
              <Text style={styles.currencyPrefix}>Nu.</Text>
              <TextInput
                value={amountTxt}
                onChangeText={setAmountTxt}
                placeholder="0.00"
                placeholderTextColor="#CBD5E1"
                keyboardType="decimal-pad"
                style={styles.amountFieldInput}
              />
              <Pressable
                onPress={() => setAmountTxt("100.00")}
                style={({ pressed }) => [styles.quickChip, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.quickChipText}>+100</Text>
              </Pressable>
            </View>

            <View style={styles.divider} />

            <Text style={styles.sectionLabel}>Bank</Text>
            <Pressable
              onPress={() => setBankPickerOpen(true)}
              style={({ pressed }) => [styles.flatField, styles.flatFieldTouchable, pressed && { opacity: 0.8 }]}
            >
              <Ionicons name="business-outline" size={18} color={G.sub} />
              <View style={{ flex: 1 }}>
                <Text style={styles.flatFieldValue}>{bank?.name}</Text>
                <Text style={styles.flatFieldSub}>Code: {bank?.code}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={G.sub} />
            </Pressable>

            <View style={styles.divider} />

            <Text style={styles.sectionLabel}>Account Number</Text>
            <View style={styles.flatField}>
              <Ionicons name="card-outline" size={18} color={G.sub} />
              <TextInput
                value={accountNo}
                onChangeText={setAccountNo}
                placeholder="0123456789"
                placeholderTextColor="#CBD5E1"
                keyboardType="number-pad"
                style={styles.flatInput}
              />
            </View>

            <View style={styles.divider} />

            <Text style={styles.sectionLabel}>Account Name</Text>
            <View style={styles.flatField}>
              <Ionicons name="person-outline" size={18} color={G.sub} />
              <TextInput
                value={accountName}
                onChangeText={setAccountName}
                placeholder="Name as on bank account"
                placeholderTextColor="#CBD5E1"
                style={styles.flatInput}
              />
            </View>

            <View style={styles.divider} />

            <Text style={styles.sectionLabel}>
              Note  <Text style={styles.optionalTag}>optional</Text>
            </Text>
            <View style={styles.flatField}>
              <Ionicons name="create-outline" size={18} color={G.sub} />
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="Message for admin…"
                placeholderTextColor="#CBD5E1"
                style={styles.flatInput}
              />
            </View>
          </View>

          {/* ── Notice ── */}
          <View style={styles.notice}>
            <Ionicons name="lock-closed-outline" size={14} color={G.sub} />
            <Text style={styles.noticeText}>
              Amount is held immediately and released to your bank once approved.
            </Text>
          </View>

          {/* ── CTA ── */}
          <Animated.View style={[styles.ctaWrap, ctaStyle]}>
            <Pressable
              onPress={submitWithdrawal}
              disabled={submitting}
              style={({ pressed }) => [styles.cta, pressed && { opacity: 0.88 }, submitting && { opacity: 0.6 }]}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="arrow-up-circle-outline" size={20} color="#fff" />
                  <Text style={styles.ctaText}>Submit Request</Text>
                </>
              )}
            </Pressable>
          </Animated.View>

          {/* ── History ── */}
          <View style={styles.historyHeader}>
            <Text style={styles.historyTitle}>
              History
              {dateFilterActive && (
                <Text style={styles.filterBadge}>  {MONTHS[fromMonth]} {fromYear} – {MONTHS[toMonth]} {toYear}</Text>
              )}
            </Text>
            <View style={styles.historyHeaderActions}>
              <Pressable
                onPress={() => setFilterVisible(true)}
                style={({ pressed }) => [styles.refreshPill, pressed && { opacity: 0.7 }, dateFilterActive && styles.refreshPillActive]}
              >
                <Ionicons name="calendar-outline" size={14} color={dateFilterActive ? G.brand : G.sub} />
                <Text style={[styles.refreshPillText, dateFilterActive && { color: G.brand }]}>
                  {dateFilterActive ? "Filtered" : "Filter"}
                </Text>
              </Pressable>
              <Pressable
                onPress={fetchList}
                style={({ pressed }) => [styles.refreshPill, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name="refresh" size={14} color={G.sub} />
              </Pressable>
            </View>
          </View>

          {loadingList ? (
            <View style={styles.centerBox}>
              <ActivityIndicator color={G.brand} />
              <Text style={styles.loadingText}>Loading…</Text>
            </View>
          ) : filteredItems.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="document-text-outline" size={36} color="#CBD5E1" />
              <Text style={styles.emptyTitle}>{items.length === 0 ? "No withdrawals yet" : "No results"}</Text>
              <Text style={styles.emptySub}>
                {items.length === 0
                  ? "Your withdrawal history will appear here."
                  : "No withdrawals found in the selected date range."}
              </Text>
              {dateFilterActive && (
                <Pressable onPress={clearFilter} style={styles.clearFilterBtn}>
                  <Text style={styles.clearFilterText}>Clear filter</Text>
                </Pressable>
              )}
            </View>
          ) : (
            <View style={styles.historyList}>
              {visibleItems.map((it, idx) => {
                const id = it.request_id || it.id || "";
                const meta = statusMeta(it.status);
                const expanded = expandedId === id;

                return (
                  <View key={id} style={[styles.historyItem, idx === 0 && { borderTopWidth: 0 }]}>
                    <Pressable
                      onPress={() => toggleExpand(id)}
                      style={({ pressed }) => [styles.historyItemTop, pressed && { opacity: 0.85 }]}
                    >
                      <View style={[styles.statusIcon, { backgroundColor: `${meta.color}18` }]}>
                        <Ionicons name={meta.icon} size={18} color={meta.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.historyAmt}>{fmtNu(it.amount)}</Text>
                        <Text style={styles.historyMeta}>
                          {safe(it.bank_name)} · ••{safe(it.account_no).slice(-4)}
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end", gap: 4 }}>
                        <Text style={[styles.statusLabel, { color: meta.color }]}>{meta.label}</Text>
                        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={14} color={G.sub} />
                      </View>
                    </Pressable>

                    {expanded && (
                      <View style={styles.expandBody}>
                        <Row k="Request ID" v={safe(it.request_id)} />
                        <Row k="Bank" v={`${safe(it.bank_name)} (${safe(it.bank_code)})`} />
                        <Row k="Account" v={`${safe(it.account_name)} · ${safe(it.account_no)}`} />
                        {safe(it.user_note) ? <Row k="Note" v={safe(it.user_note)} /> : null}
                        {safe(it.admin_note) ? <Row k="Admin note" v={safe(it.admin_note)} /> : null}
                        {safe(it.bank_reference) ? <Row k="Bank ref" v={safe(it.bank_reference)} /> : null}

                        <View style={styles.expandActions}>
                          <Pressable
                            onPress={() => showAlert({ type: "info", title: "Details", message: `Status: ${meta.label}\nAmount: ${fmtNu(it.amount)}\nID: ${safe(it.request_id)}`, primaryLabel: "OK" })}
                            style={({ pressed }) => [styles.outlineBtn, pressed && { opacity: 0.75 }]}
                          >
                            <Ionicons name="information-circle-outline" size={16} color={G.text} />
                            <Text style={styles.outlineBtnText}>Details</Text>
                          </Pressable>

                          <Pressable
                            onPress={() => canCancel(it.status) ? cancelRequest(it.request_id) : null}
                            disabled={!canCancel(it.status)}
                            style={({ pressed }) => [
                              styles.dangerBtn,
                              pressed && { opacity: 0.85 },
                              !canCancel(it.status) && { opacity: 0.4 },
                            ]}
                          >
                            <Ionicons name="close-circle-outline" size={16} color="#fff" />
                            <Text style={styles.dangerBtnText}>Cancel</Text>
                          </Pressable>
                        </View>

                        {!canCancel(it.status) && (
                          <Text style={styles.disabledNote}>
                            Cancellation only available while HELD or NEEDS_INFO.
                          </Text>
                        )}
                      </View>
                    )}
                  </View>
                );
              })}

              {/* Show more / clear filter footer */}
              {(hasMore || dateFilterActive) && (
                <View style={styles.listFooter}>
                  {hasMore && (
                    <Pressable onPress={() => setShowAll(true)} style={({ pressed }) => [styles.showMoreBtn, pressed && { opacity: 0.7 }]}>
                      <Text style={styles.showMoreText}>Show all {filteredItems.length} results</Text>
                      <Ionicons name="chevron-down" size={14} color={G.brand} />
                    </Pressable>
                  )}
                  {dateFilterActive && (
                    <Pressable onPress={clearFilter} style={({ pressed }) => [styles.clearFilterInline, pressed && { opacity: 0.7 }]}>
                      <Ionicons name="close-circle-outline" size={14} color={G.sub} />
                      <Text style={styles.clearFilterInlineText}>Clear filter</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Date range filter modal ── */}
      <Modal
        visible={filterVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setFilterVisible(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setFilterVisible(false)} />
        <View style={[styles.filterSheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.filterSheetTitle}>Filter by Date Range</Text>
          <Text style={styles.filterSheetSub}>Select the month range to view withdrawals</Text>

          {/* From row */}
          <View style={styles.monthPickerSection}>
            <Text style={styles.monthPickerLabel}>From</Text>
            <View style={styles.monthPickerRow}>
              <Pressable onPress={() => stepMonth(fromMonth, fromYear, -1, setFromMonth, setFromYear)} style={styles.monthArrow}>
                <Ionicons name="chevron-back" size={20} color={G.text} />
              </Pressable>
              <View style={styles.monthDisplay}>
                <Text style={styles.monthText}>{MONTHS[fromMonth]}</Text>
                <Text style={styles.yearText}>{fromYear}</Text>
              </View>
              <Pressable onPress={() => stepMonth(fromMonth, fromYear, 1, setFromMonth, setFromYear)} style={styles.monthArrow}>
                <Ionicons name="chevron-forward" size={20} color={G.text} />
              </Pressable>
            </View>
          </View>

          <View style={styles.monthRangeArrow}>
            <Ionicons name="arrow-down" size={18} color="#CBD5E1" />
          </View>

          {/* To row */}
          <View style={styles.monthPickerSection}>
            <Text style={styles.monthPickerLabel}>To</Text>
            <View style={styles.monthPickerRow}>
              <Pressable onPress={() => stepMonth(toMonth, toYear, -1, setToMonth, setToYear)} style={styles.monthArrow}>
                <Ionicons name="chevron-back" size={20} color={G.text} />
              </Pressable>
              <View style={styles.monthDisplay}>
                <Text style={styles.monthText}>{MONTHS[toMonth]}</Text>
                <Text style={styles.yearText}>{toYear}</Text>
              </View>
              <Pressable onPress={() => stepMonth(toMonth, toYear, 1, setToMonth, setToYear)} style={styles.monthArrow}>
                <Ionicons name="chevron-forward" size={20} color={G.text} />
              </Pressable>
            </View>
          </View>

          <Pressable onPress={applyFilter} style={({ pressed }) => [styles.applyBtn, pressed && { opacity: 0.85 }]}>
            <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
            <Text style={styles.applyBtnText}>Apply Filter</Text>
          </Pressable>

          {dateFilterActive && (
            <Pressable onPress={() => { clearFilter(); setFilterVisible(false); }} style={styles.clearSheetBtn}>
              <Text style={styles.clearSheetBtnText}>Clear filter</Text>
            </Pressable>
          )}
        </View>
      </Modal>

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
      {alertNode}
    </View>
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
  safe: { flex: 1, backgroundColor: "#F8FAFC" },
  flex: { flex: 1 },

  /* ── Header ── */
  header: { paddingHorizontal: 20, paddingBottom: 24 },
  headerRow: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginBottom: 20,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "800" },
  amountHero: { alignItems: "center", paddingBottom: 4 },
  amountHeroLabel: { color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: "600", marginBottom: 6 },
  amountHeroValue: { color: "#fff", fontSize: 32, fontWeight: "900", letterSpacing: -1 },
  amountHeroSub: { color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 6 },

  /* ── Form section ── */
  section: {
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sectionLabel: {
    fontSize: 11, fontWeight: "700", color: "#94A3B8",
    textTransform: "uppercase", letterSpacing: 0.7,
    marginTop: 16, marginBottom: 8,
  },
  optionalTag: {
    fontSize: 10, fontWeight: "500", color: "#CBD5E1",
    textTransform: "none", letterSpacing: 0,
  },
  flatField: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 4,
  },
  flatFieldTouchable: { paddingVertical: 6 },
  flatFieldValue: { fontSize: 15, fontWeight: "700", color: G.text },
  flatFieldSub: { fontSize: 12, color: G.sub, marginTop: 2 },
  flatInput: { flex: 1, fontSize: 15, color: G.text, paddingVertical: 4 },

  amountFieldInput: {
    flex: 1, fontSize: 28, fontWeight: "800",
    color: G.text, paddingVertical: 4,
  },
  currencyPrefix: {
    fontSize: 20, fontWeight: "700", color: "#94A3B8", paddingBottom: 2,
  },
  quickChip: {
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: `${G.brand}14`,
  },
  quickChipText: { fontSize: 12, fontWeight: "800", color: G.brand },

  divider: { height: 1, backgroundColor: "#F1F5F9", marginTop: 8 },

  /* ── Notice ── */
  notice: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    marginHorizontal: 20, marginTop: 16, marginBottom: 4,
  },
  noticeText: { flex: 1, fontSize: 12, color: "#94A3B8", lineHeight: 18 },

  /* ── CTA ── */
  ctaWrap: { marginHorizontal: 16, marginTop: 20 },
  cta: {
    height: 52, borderRadius: 16,
    backgroundColor: G.brand,
    alignItems: "center", justifyContent: "center",
    flexDirection: "row", gap: 8,
  },
  ctaText: { color: "#fff", fontSize: 15, fontWeight: "800" },

  /* ── History ── */
  historyHeader: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 20, marginTop: 28, marginBottom: 12,
  },
  historyTitle: { fontSize: 15, fontWeight: "800", color: G.text },
  refreshPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 20, backgroundColor: "#F1F5F9",
  },
  refreshPillText: { fontSize: 12, fontWeight: "600", color: G.sub },

  centerBox: { alignItems: "center", gap: 8, paddingVertical: 24 },
  loadingText: { color: G.sub, fontSize: 13 },

  emptyBox: { alignItems: "center", paddingVertical: 40, gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: G.text },
  emptySub: { fontSize: 13, color: G.sub, textAlign: "center" },

  historyList: {
    marginHorizontal: 16,
    backgroundColor: "#fff",
    borderRadius: 20,
    overflow: "hidden",
  },
  historyItem: { borderTopWidth: 1, borderTopColor: "#F1F5F9" },
  historyItemTop: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  statusIcon: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  historyAmt: { fontSize: 15, fontWeight: "800", color: G.text },
  historyMeta: { fontSize: 12, color: G.sub, marginTop: 2 },
  statusLabel: { fontSize: 12, fontWeight: "700" },

  expandBody: {
    paddingHorizontal: 16, paddingBottom: 14,
    backgroundColor: "#FAFBFC",
  },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12, marginTop: 10 },
  rowKey: { fontSize: 12, color: G.sub },
  rowVal: { flex: 1, fontSize: 12, color: G.text, textAlign: "right" },

  expandActions: { flexDirection: "row", gap: 10, marginTop: 14 },
  outlineBtn: {
    flex: 1, height: 40, borderRadius: 12,
    borderWidth: 1, borderColor: "#E2E8F0",
    alignItems: "center", justifyContent: "center",
    flexDirection: "row", gap: 6,
  },
  outlineBtnText: { fontSize: 13, fontWeight: "700", color: G.text },
  dangerBtn: {
    flex: 1, height: 40, borderRadius: 12,
    backgroundColor: G.danger,
    alignItems: "center", justifyContent: "center",
    flexDirection: "row", gap: 6,
  },
  dangerBtnText: { fontSize: 13, fontWeight: "700", color: "#fff" },
  disabledNote: { marginTop: 10, fontSize: 11, color: G.sub, lineHeight: 16 },

  /* ── Bank picker bottom sheet ── */
  sheetBackdrop: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(15,23,42,0.45)",
  },
  bankSheet: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    backgroundColor: "#fff",
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingTop: 12,
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: "#E2E8F0",
    alignSelf: "center", marginBottom: 14,
  },
  sheetHeader: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20, marginBottom: 8,
  },
  sheetTitle: { fontSize: 16, fontWeight: "800", color: G.text },
  searchWrap: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: "#F8FAFC", borderRadius: 14,
    paddingHorizontal: 12, height: 44,
  },
  searchInput: { flex: 1, fontSize: 14, color: G.text },
  bankRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 20, paddingVertical: 14,
    borderTopWidth: 1, borderTopColor: "#F1F5F9",
  },
  bankDot: {
    width: 12, height: 12, borderRadius: 6,
    borderWidth: 2, borderColor: "#E2E8F0", backgroundColor: "#fff",
  },
  bankName: { fontSize: 14, fontWeight: "700", color: G.text },
  bankCode: { fontSize: 12, color: G.sub, marginTop: 1 },

  /* ── History header with filter ── */
  historyHeaderActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  filterBadge: { fontSize: 11, fontWeight: "600", color: G.brand },
  refreshPillActive: { backgroundColor: `${G.brand}12`, borderWidth: 1, borderColor: `${G.brand}30` },

  /* ── List footer ── */
  listFooter: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 14,
    borderTopWidth: 1, borderTopColor: "#F1F5F9",
  },
  showMoreBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  showMoreText: { fontSize: 13, fontWeight: "700", color: G.brand },
  clearFilterInline: { flexDirection: "row", alignItems: "center", gap: 4 },
  clearFilterInlineText: { fontSize: 12, color: G.sub },
  clearFilterBtn: { marginTop: 14 },
  clearFilterText: { fontSize: 13, fontWeight: "700", color: G.brand },

  /* ── Date filter bottom sheet ── */
  filterSheet: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    backgroundColor: "#fff",
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingTop: 12, paddingHorizontal: 24,
  },
  filterSheetTitle: { fontSize: 17, fontWeight: "800", color: G.text, marginBottom: 4, textAlign: "center" },
  filterSheetSub:   { fontSize: 13, color: G.sub, textAlign: "center", marginBottom: 24 },

  monthPickerSection: { marginBottom: 8 },
  monthPickerLabel: {
    fontSize: 11, fontWeight: "700", color: "#94A3B8",
    textTransform: "uppercase", letterSpacing: 0.7,
    marginBottom: 10, textAlign: "center",
  },
  monthPickerRow: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F8FAFC", borderRadius: 16, padding: 4,
  },
  monthArrow: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  monthDisplay: { alignItems: "center", flex: 1 },
  monthText: { fontSize: 18, fontWeight: "800", color: G.text },
  yearText:  { fontSize: 13, color: G.sub, fontWeight: "600", marginTop: 2 },

  monthRangeArrow: { alignItems: "center", marginVertical: 10 },

  applyBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, backgroundColor: G.brand,
    borderRadius: 16, paddingVertical: 15, marginTop: 24,
  },
  applyBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  clearSheetBtn: { alignItems: "center", paddingVertical: 14 },
  clearSheetBtnText: { fontSize: 14, fontWeight: "600", color: G.sub },
});
