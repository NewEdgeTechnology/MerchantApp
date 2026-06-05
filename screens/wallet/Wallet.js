// services/wallet/WalletPassenger.js

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useWindowDimensions } from "react-native";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Platform,
  ActivityIndicator,
  TextInput,
  ToastAndroid,
  StatusBar,
} from "react-native";
import {
  Svg,
  Rect,
  Path,
  Circle,
  Line,
  G as SvgG,
  Text as SvgText,
  Defs,
  LinearGradient as SvgGrad,
  Stop,
} from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import {
  useNavigation,
  useRoute,
  useFocusEffect,
} from "@react-navigation/native";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import * as Clipboard from "expo-clipboard";

import { getUserInfo, getValidAccessToken } from "../../utils/authToken";
import { useAlert } from "../../components/CustomAlert";
import { C } from "../../theme";

/* ========= unlock TTL ========= */
const UNLOCK_TTL_MS = 3 * 60 * 1000;

/* ========= note / reason helper ========= */
function getReasonFromNote(note) {
  if (!note || typeof note !== "string") return "";
  const trimmed = note.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object") {
        if (parsed.reason) return String(parsed.reason);
        const parts = [];
        if (parsed.Pickup) parts.push(`From: ${parsed.Pickup}`);
        if (parsed.Dropoff) parts.push(`To: ${parsed.Dropoff}`);
        if (parts.length) return parts.join(" · ");
      }
      return "";
    } catch {
      return "";
    }
  }
  return "";
}

/* ========= endpoints ========= */
const GET_WALLET_BY_USER = (userId) =>
  `https://backend.tabdhey.bt/wallet/wallet/getbyuser/${userId}`;
const CREATE_WALLET_URL = "https://backend.tabdhey.bt/wallet/wallet/create";
const TX_BY_WALLET = (walletId) =>
  `https://backend.tabdhey.bt/wallet/transactions/wallet/${walletId}`;
const HAS_TPIN_URL = (userId) =>
  `https://backend.tabdhey.bt/wallet/wallet/${userId}/has-tpin`;

/* ========= SecureStore MPIN key helper ========= */
const mpinKeyForWallet = (walletId) => {
  const raw = String(walletId || "default");
  const safe = raw.replace(/[^A-Za-z0-9._-]/g, "_");
  return `wallet_mpin_${safe}`;
};

/* ========= design tokens ========= */
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

/* ========= helpers ========= */
const currency = (n) =>
  `BTN ${Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
const timeHM = (ts) =>
  new Date(ts).toLocaleTimeString("en-US", {
    timeZone: "Asia/Thimphu",
    hour: "2-digit",
    minute: "2-digit",
  });
const dateMD = (ts) =>
  new Date(ts).toLocaleDateString("en-US", {
    timeZone: "Asia/Thimphu",
    month: "short",
    day: "numeric",
  });
const isToday = (ts) => {
  const d = new Date(ts),
    t = new Date();
  return (
    d.getFullYear() === t.getFullYear() &&
    d.getMonth() === t.getMonth() &&
    d.getDate() === t.getDate()
  );
};
const isYesterday = (ts) => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const x = new Date(ts);
  return (
    d.getFullYear() === x.getFullYear() &&
    d.getMonth() === x.getMonth() &&
    d.getDate() === x.getDate()
  );
};

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
  if (!res.ok) throw new Error(json?.message || `HTTP ${res.status}`);
  return json;
}

function groupByDay(list) {
  const buckets = {};
  list.forEach((t) => {
    const label = isToday(t.when)
      ? "Today"
      : isYesterday(t.when)
        ? "Yesterday"
        : dateMD(t.when);
    if (!buckets[label]) buckets[label] = [];
    buckets[label].push(t);
  });
  Object.values(buckets).forEach((a) => a.sort((a, b) => b.when - a.when));
  return Object.entries(buckets)
    .sort((a, b) => (b[1]?.[0]?.when || 0) - (a[1]?.[0]?.when || 0))
    .map(([label, items]) => ({ label, items }));
}

function mapServerTx(row) {
  const type =
    String(row.direction || row.remark || row.type || "DR").toUpperCase() ===
    "CR"
      ? "CR"
      : "DR";
  const whenStr = row.created_at_local || row.created_at;
  const when = whenStr ? new Date(whenStr).getTime() : Date.now();
  return {
    id: String(row.transaction_id || row.id || `${when}-${Math.random()}`),
    journal_code: String(row.journal_code || ""),
    when,
    type,
    title: type === "CR" ? "Credited" : "Debited",
    note: row.note ? String(row.note) : "",
    amount: Number(row.amount || 0),
    status: String(row.status || "success").toLowerCase(),
    created_at: row.created_at,
    created_at_local: row.created_at_local,
  };
}

/* ========= Main Component ========= */
export default function WalletScreen() {
  const nav = useNavigation();
  const route = useRoute();
  const { showAlert, alertNode } = useAlert();

  const routeUserId = route?.params?.user_id;
  const [userId, setUserId] = useState(routeUserId || null);

  const [hidden, setHidden] = useState(true);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const [wallet, setWallet] = useState(null);
  const [balance, setBalance] = useState(0);
  const [tx, setTx] = useState([]);
  const [page, setPage] = useState(1);
  const [tpinMissing, setTpinMissing] = useState(false);

  const [bioChecking, setBioChecking] = useState(false);
  const [bioPassed, setBioPassed] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(null);
  const [mpinRequired, setMpinRequired] = useState(false);
  const [lastUnlockTs, setLastUnlockTs] = useState(null);

  const [mpinExists, setMpinExists] = useState(false);
  const [mpinInput, setMpinInput] = useState("");
  const [mpinChecking, setMpinChecking] = useState(false);
  const [mpinError, setMpinError] = useState("");

  const showToast = useCallback((message) => {
    if (Platform.OS === "android")
      ToastAndroid.show(message, ToastAndroid.SHORT);
  }, []);

  const grouped = useMemo(() => groupByDay(tx), [tx]);

  const go = useCallback(
    (name, params = {}) => {
      try {
        nav.navigate(name, params);
      } catch {}
    },
    [nav],
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (routeUserId) return;
        const me = await getUserInfo();
        if (alive) setUserId(me?.user_id || me?.id || null);
      } catch {}
    })();
    return () => {
      alive = false;
    };
  }, [routeUserId]);

  const loadTransactions = useCallback(async (walletId, replace = false) => {
    try {
      const res = await fetchJson(TX_BY_WALLET(walletId));
      const list = Array.isArray(res?.data)
        ? res.data
        : Array.isArray(res)
          ? res
          : [];
      const now = new Date();
      const thisMonth = now.getMonth();
      const thisYear = now.getFullYear();
      const mapped = list
        .map(mapServerTx)
        .filter((t) => {
          const d = new Date(t.when);
          return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
        })
        .sort((a, b) => b.when - a.when);
      setTx((prev) => (replace ? mapped : [...prev, ...mapped]));
    } catch (e) {
      console.log("[Wallet] loadTransactions error:", e?.message || e);
    }
  }, []);

  const loadWalletFlow = useCallback(
    async (uid) => {
      setError("");
      setTpinMissing(false);
      setMpinInput("");
      setMpinError("");
      setMpinExists(false);
      const res = await fetchJson(GET_WALLET_BY_USER(uid));
      const w = res?.data || null;
      if (!w || !w.wallet_id) {
        setWallet(null);
        setBalance(0);
        setTx([]);
        return { wallet: null, hasTpin: false };
      }
      setWallet(w);
      setBalance(Number(w.amount || 0));
      let hasTpin = false;
      try {
        const tpinRes = await fetchJson(HAS_TPIN_URL(uid));
        hasTpin = !!(tpinRes?.success && tpinRes?.has_tpin === true);
      } catch {
        hasTpin = false;
      }
      if (!hasTpin) {
        setTpinMissing(true);
        setTx([]);
        return { wallet: w, hasTpin: false };
      }
      await loadTransactions(w.wallet_id, true);
      return { wallet: w, hasTpin: true };
    },
    [loadTransactions],
  );

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        if (!alive) return;
        await loadWalletFlow(userId);
      } catch (e) {
        if (!alive) return;
        setError(String(e.message || e));
        setWallet(null);
        setBalance(0);
        setTx([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId, loadWalletFlow]);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      let alive = true;
      (async () => {
        setLoading(true);
        try {
          if (!alive) return;
          await loadWalletFlow(userId);
        } catch (e) {
          if (!alive) return;
          setError(String(e.message || e));
        } finally {
          if (alive) setLoading(false);
        }
      })();
      return () => {
        alive = false;
      };
    }, [userId, loadWalletFlow]),
  );

  const onRefresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      await loadWalletFlow(userId);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }, [userId, loadWalletFlow]);

  useEffect(() => {
    if (!mpinRequired || !wallet?.wallet_id) return;
    let alive = true;
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(
          mpinKeyForWallet(wallet.wallet_id),
        );
        if (alive) setMpinExists(!!stored);
      } catch {
        if (alive) setMpinExists(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [mpinRequired, wallet?.wallet_id]);

  const onChangeMpinInput = useCallback((val) => {
    setMpinInput((val || "").replace(/[^0-9]/g, "").slice(0, 4));
    setMpinError("");
  }, []);

  const handleUnlockWithMPIN = useCallback(async () => {
    if (!wallet?.wallet_id) {
      showAlert({
        type: "error",
        title: "Error",
        message: "Wallet ID missing. Please reopen your wallet.",
        primaryLabel: "OK",
      });
      return;
    }
    if (mpinInput.length !== 4) {
      setMpinError("Enter your 4-digit MPIN.");
      return;
    }
    setMpinChecking(true);
    setMpinError("");
    try {
      const stored = await SecureStore.getItemAsync(
        mpinKeyForWallet(wallet.wallet_id),
      );
      if (!stored) {
        setMpinExists(false);
        showAlert({
          type: "confirm",
          title: "MPIN not found",
          message: "Please set your wallet MPIN first.",
          primaryLabel: "Set MPIN",
          primaryAction: () => {
            try {
              nav.navigate("WalletSetMPIN", {
                user_id: userId,
                wallet_id: wallet.wallet_id,
              });
            } catch {}
          },
          secondaryLabel: "Cancel",
        });
        return;
      }
      if (stored !== mpinInput) {
        setMpinError("Incorrect MPIN. Try again.");
        return;
      }
      setBioPassed(true);
      setMpinRequired(false);
      setLastUnlockTs(Date.now());
      setMpinInput("");
      setMpinError("");
    } catch {
      showAlert({
        type: "error",
        title: "Failed",
        message: "Could not verify MPIN.",
        primaryLabel: "OK",
      });
    } finally {
      setMpinChecking(false);
    }
  }, [wallet?.wallet_id, mpinInput, nav, userId, showAlert]);

  const runBiometricAuth = useCallback(async () => {
    if (!wallet || tpinMissing) return;
    setBioChecking(true);
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !isEnrolled) {
        setBioAvailable(false);
        setMpinRequired(true);
        setBioPassed(false);
        showAlert({
          type: "info",
          title: "Set MPIN",
          message:
            "Your device does not support biometrics or no fingerprint/face is enrolled. Please use an MPIN to unlock your wallet.",
          primaryLabel: "OK",
        });
        return;
      }
      setBioAvailable(true);
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock your wallet",
        fallbackLabel: "Use device passcode",
        cancelLabel: "Cancel",
      });
      if (result.success) {
        setBioPassed(true);
        setLastUnlockTs(Date.now());
      } else {
        setBioPassed(false);
      }
    } catch {
      setBioAvailable(false);
      setMpinRequired(true);
      setBioPassed(false);
    } finally {
      setBioChecking(false);
    }
  }, [wallet, tpinMissing, showAlert]);

  useEffect(() => {
    if (!wallet || tpinMissing) return;
    const now = Date.now();
    const withinTTL =
      typeof lastUnlockTs === "number" && now - lastUnlockTs < UNLOCK_TTL_MS;
    if (withinTTL) {
      if (!bioPassed) setBioPassed(true);
      return;
    }
    if (!bioPassed && !mpinRequired) runBiometricAuth();
  }, [
    wallet,
    tpinMissing,
    lastUnlockTs,
    bioPassed,
    mpinRequired,
    runBiometricAuth,
  ]);

  const handleCreate = useCallback(async () => {
    if (!userId) return;
    setCreating(true);
    try {
      const res = await fetchJson(CREATE_WALLET_URL, {
        method: "POST",
        body: JSON.stringify({ user_id: userId, status: "ACTIVE" }),
      });
      if (res?.success) {
        let walletData = null;
        try {
          const again = await fetchJson(GET_WALLET_BY_USER(userId));
          walletData = again?.data || null;
          setWallet(walletData || null);
          setBalance(Number(walletData?.amount || 0));
        } catch {}
        setTpinMissing(true);
        setTx([]);
        setBioPassed(false);
        setMpinRequired(false);
        setLastUnlockTs(null);
        showAlert({
          type: "confirm",
          title: "Wallet created",
          message:
            "Your wallet has been created. Please set your wallet TPIN to start using it.",
          primaryLabel: "Set TPIN now",
          primaryAction: () => {
            if (!walletData?.wallet_id) return;
            try {
              nav.navigate("WalletSetTPIN", {
                user_id: userId,
                wallet_id: walletData.wallet_id,
              });
            } catch {}
          },
          secondaryLabel: "Later",
        });
      } else throw new Error(res?.message || "Failed to create wallet");
    } catch (e) {
      showAlert({
        type: "error",
        title: "Failed",
        message: String(e.message || e),
        primaryLabel: "OK",
      });
    } finally {
      setCreating(false);
    }
  }, [userId, nav, showAlert]);

  const loadMore = useCallback(() => {
    if (page > 1) return;
    setPage((p) => p + 1);
  }, [page]);

  const copyWalletId = useCallback(async () => {
    if (!wallet?.wallet_id) {
      showToast("No wallet ID available");
      return;
    }
    try {
      await Clipboard.setStringAsync(String(wallet.wallet_id));
      showToast("Wallet ID copied!");
    } catch {
      showToast("Failed to copy wallet ID");
    }
  }, [wallet, showToast]);

  /* ================================================================
     RENDER STATES
  ================================================================ */

  // — Loading —
  if (!userId || loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#F8FAFC",
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 32,
        }}
      >
        <StatusBar
          translucent
          backgroundColor="transparent"
          barStyle="dark-content"
        />
        <ActivityIndicator size="large" color={G.grab} />
        <Text
          style={{
            color: G.grab,
            fontWeight: "700",
            fontSize: 15,
            marginTop: 14,
          }}
        >
          {!userId ? "Loading your wallet…" : "Checking your wallet…"}
        </Text>
        {!!error && (
          <Text
            style={{
              color: G.danger,
              fontSize: 13,
              marginTop: 8,
              textAlign: "center",
            }}
          >
            {String(error)}
          </Text>
        )}
      </View>
    );
  }

  // — TPIN missing —
  if (tpinMissing) {
    return (
      <View style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
        <StatusBar
          translucent
          backgroundColor="transparent"
          barStyle="light-content"
        />
        <LinearGradient
          colors={C.gradBrand}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.lockGrad}
        >
          <View style={styles.lockRing}>
            <Ionicons name="shield-checkmark" size={34} color="#fff" />
          </View>
          <Text style={styles.lockTitle}>Security Required</Text>
          <Text style={styles.lockSub}>
            Set a TPIN to protect your wallet and start transacting.
          </Text>
        </LinearGradient>
        <View style={styles.lockBody}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => {
              try {
                nav.navigate("WalletSetTPIN", {
                  user_id: userId,
                  wallet_id: wallet?.wallet_id,
                });
              } catch {}
            }}
          >
            <Ionicons name="shield-outline" size={18} color="#fff" />
            <Text style={styles.primaryBtnText}>Create TPIN</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // — No wallet —
  if (!wallet) {
    return (
      <View style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
        <StatusBar
          translucent
          backgroundColor="transparent"
          barStyle="light-content"
        />
        <LinearGradient
          colors={C.gradBrand}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.lockGrad}
        >
          <View style={styles.lockRing}>
            <Ionicons name="wallet" size={34} color="#fff" />
          </View>
          <Text style={styles.lockTitle}>No Wallet Yet</Text>
          <Text style={styles.lockSub}>
            Create your digital wallet to pay, top up, and receive refunds
            instantly.
          </Text>
        </LinearGradient>
        <View style={styles.lockBody}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={handleCreate}
            disabled={creating}
          >
            {creating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="add-circle-outline" size={18} color="#fff" />
                <Text style={styles.primaryBtnText}>Create Wallet</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // — MPIN required —
  if (mpinRequired && !bioPassed) {
    return (
      <View style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
        <StatusBar
          translucent
          backgroundColor="transparent"
          barStyle="light-content"
        />
        <LinearGradient
          colors={C.gradBrand}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.lockGrad}
        >
          <View style={styles.lockRing}>
            <Ionicons name="keypad" size={34} color="#fff" />
          </View>
          <Text style={styles.lockTitle}>
            {mpinExists ? "Enter MPIN" : "Set Wallet MPIN"}
          </Text>
          <Text style={styles.lockSub}>
            {mpinExists
              ? "Enter your 4-digit MPIN to unlock your wallet."
              : "Biometrics unavailable. Set a 4-digit MPIN to secure your wallet."}
          </Text>
        </LinearGradient>
        <View style={styles.lockBody}>
          {mpinExists ? (
            <>
              <TextInput
                value={mpinInput}
                onChangeText={onChangeMpinInput}
                keyboardType="number-pad"
                maxLength={4}
                secureTextEntry
                style={styles.mpinInput}
                placeholder="• • • •"
                placeholderTextColor="#CBD5E1"
                autoFocus
              />
              {!!mpinError && <Text style={styles.mpinError}>{mpinError}</Text>}
              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  (mpinInput.length !== 4 || mpinChecking) &&
                    styles.btnDisabled,
                ]}
                onPress={handleUnlockWithMPIN}
                disabled={mpinInput.length !== 4 || mpinChecking}
              >
                {mpinChecking ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="lock-open-outline" size={18} color="#fff" />
                    <Text style={styles.primaryBtnText}>Unlock Wallet</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.ghostBtn}
                onPress={() => {
                  try {
                    nav.navigate("WalletSetMPIN", {
                      user_id: userId,
                      wallet_id: wallet?.wallet_id,
                    });
                  } catch {}
                }}
              >
                <Text style={styles.ghostBtnText}>Change MPIN</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => {
                try {
                  nav.navigate("WalletSetMPIN", {
                    user_id: userId,
                    wallet_id: wallet?.wallet_id,
                  });
                } catch {}
              }}
            >
              <Ionicons name="keypad-outline" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>Set MPIN</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  // — Biometric lock —
  if (!bioPassed) {
    return (
      <View style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
        <StatusBar
          translucent
          backgroundColor="transparent"
          barStyle="light-content"
        />
        <LinearGradient
          colors={C.gradBrand}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.lockGrad}
        >
          <View style={styles.lockRing}>
            <Ionicons name="lock-closed" size={34} color="#fff" />
          </View>
          <Text style={styles.lockTitle}>Wallet Locked</Text>
          <Text style={styles.lockSub}>
            Use your fingerprint or face ID to access your wallet securely.
          </Text>
        </LinearGradient>
        <View style={styles.lockBody}>
          {bioChecking ? (
            <View style={{ alignItems: "center", gap: 12 }}>
              <ActivityIndicator size="large" color={G.grab} />
              <Text style={{ color: "#64748B", fontWeight: "600" }}>
                Authenticating…
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={runBiometricAuth}
            >
              <Ionicons name="finger-print-outline" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>Unlock Wallet</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  /* ================================================================
     MAIN WALLET (unlocked)
  ================================================================ */
  const listHeader = (
    <>
      {/* ── Gradient Header ── */}
      <LinearGradient
        colors={C.gradBrand}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradHeader}
      >
        {/* Nav row */}
        <View style={styles.navRow}>
          <Text style={styles.navTitle}>My Wallet</Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity
              style={styles.navPill}
              onPress={() =>
                go("WalletMyQR", {
                  wallet,
                  user_id: userId,
                  username:
                    route?.params?.username ||
                    route?.params?.full_name ||
                    route?.params?.userName ||
                    route?.params?.name ||
                    wallet?.user_name ||
                    wallet?.full_name ||
                    wallet?.name ||
                    "Wallet User",
                  full_name:
                    route?.params?.full_name ||
                    route?.params?.username ||
                    route?.params?.userName ||
                    route?.params?.name ||
                    wallet?.full_name ||
                    wallet?.user_name ||
                    wallet?.name ||
                    "Wallet User",
                  userName:
                    route?.params?.userName ||
                    route?.params?.username ||
                    route?.params?.full_name ||
                    route?.params?.name ||
                    wallet?.user_name ||
                    wallet?.full_name ||
                    wallet?.name ||
                    "Wallet User",
                })
              }
            >
              <Ionicons name="qr-code-outline" size={13} color="#fff" />
              <Text style={styles.navPillText}>My QR</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.navIcon}
              onPress={() => go("WalletSettings", { wallet })}
            >
              <Ionicons name="settings-outline" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Balance section — flat on gradient */}
        <View style={styles.balSection}>
          <View style={styles.balTopRow}>
            <Text style={styles.balLabel}>Available Balance</Text>
            <TouchableOpacity
              onPress={() => setHidden((v) => !v)}
              style={styles.eyeBtn}
            >
              <Ionicons
                name={hidden ? "eye-outline" : "eye-off-outline"}
                size={17}
                color="rgba(255,255,255,0.9)"
              />
            </TouchableOpacity>
          </View>

          {hidden ? (
            <Text style={styles.balHidden}>• • • • • •</Text>
          ) : (
            <View style={styles.balAmtRow}>
              <Text style={styles.balCurrency}>BTN</Text>
              <Text style={styles.balAmt}>
                {Number(balance || 0).toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </Text>
            </View>
          )}

          <View style={styles.walletIdRow}>
            <Text style={styles.walletIdText}>
              ID {String(wallet?.wallet_id || "").padStart(8, "0")}
            </Text>
            <TouchableOpacity
              onPress={copyWalletId}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            >
              <Ionicons
                name="copy-outline"
                size={15}
                color="rgba(255,255,255,0.7)"
              />
            </TouchableOpacity>
          </View>
        </View>
      </LinearGradient>

      {/* ── Quick Actions ── */}
      <View style={styles.quickBar}>
        <QuickAction
          icon="arrow-up-circle-outline"
          label="Top Up"
          bg="#D1FAE5"
          color="#059669"
          onPress={() => go("TopUp", { wallet, user_id: userId })}
        />
        <QuickAction
          icon="qr-code-outline"
          label="Pay"
          bg="#DBEAFE"
          color="#2563EB"
          onPress={() => go("ScanQR", { wallet })}
        />
        <QuickAction
          icon="swap-horizontal-outline"
          label="Transfer"
          bg="#FEF3C7"
          color="#D97706"
          onPress={() => go("WalletTransfer", { wallet })}
        />
        <QuickAction
          icon="cash-outline"
          label="Withdraw"
          bg="#FEE2E2"
          color="#DC2626"
          onPress={() => go("Withdrawal", { wallet })}
        />
      </View>

      {/* ── Spending chart ── */}
      {tx.length > 0 && <SpendingChart transactions={tx} />}

      {/* ── Transactions heading ── */}
      <View style={styles.txHeading}>
        <Text style={styles.sectionTitle}>Transactions</Text>
      </View>
    </>
  );

  return (
    <View style={styles.wrap}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="light-content"
      />

      <FlatList
        style={{ flex: 1 }}
        data={grouped}
        keyExtractor={(g) => g.label}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={onRefresh}
            tintColor={G.grab}
          />
        }
        ListHeaderComponent={listHeader}
        renderItem={({ item }) => (
          <View style={{ paddingHorizontal: 16, marginBottom: 4 }}>
            <Text style={styles.dayLabel}>{item.label}</Text>
            {item.items.map((one) => (
              <TxRow key={one.id} tx={one} />
            ))}
          </View>
        )}
        onEndReachedThreshold={0.25}
        onEndReached={loadMore}
        ListEmptyComponent={
          <View style={styles.emptyTx}>
            <View style={styles.emptyTxRing}>
              <Ionicons name="receipt-outline" size={32} color="#94A3B8" />
            </View>
            <Text style={styles.emptyTxTitle}>No transactions yet</Text>
            <Text style={styles.emptyTxSub}>
              Your transaction history will appear here once you start using
              your wallet.
            </Text>
          </View>
        }
        ListFooterComponent={<View style={{ height: 120 }} />}
      />

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => go("ScanQR", { wallet })}
        activeOpacity={0.88}
      >
        <Ionicons name="scan-outline" size={19} color="#fff" />
        <Text style={styles.fabText}>Scan to Pay</Text>
      </TouchableOpacity>

      {alertNode}
    </View>
  );
}

/* ================================================================
   SUB-COMPONENTS
================================================================ */

/* ================================================================
   SPENDING CHART
================================================================ */
const fmtK = (n) => {
  if (n >= 100000) return `${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(Math.round(n));
};

const INCOME_COLOR = C.brand;
const EXPENSE_COLOR = "#1E1B4B";
const CR_LINE = "#EF4444"; // red  — Income line
const DR_LINE = "#3B82F6"; // blue — Expense line

function buildBezier(pts) {
  if (pts.length < 2) return null;
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const cpx = ((pts[i - 1].x + pts[i].x) / 2).toFixed(1);
    d += ` C ${cpx} ${pts[i - 1].y.toFixed(1)},${cpx} ${pts[i].y.toFixed(1)},${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)}`;
  }
  return d;
}

function buildArea(pts, line, baseY) {
  if (!line || pts.length < 2) return null;
  return `${line} L ${pts[pts.length - 1].x.toFixed(1)} ${baseY} L ${pts[0].x.toFixed(1)} ${baseY} Z`;
}

function SpendingChart({ transactions }) {
  const { width: screenW } = useWindowDimensions();
  const W = screenW - 32;
  const H = 170;
  const PADL = 42,
    PADR = 8,
    PADT = 12,
    PADB = 36;
  const cW = W - PADL - PADR;
  const cH = H - PADT - PADB;

  if (!transactions || transactions.length === 0) return null;

  const ordered = [...transactions].sort((a, b) => a.when - b.when);
  const n = ordered.length;
  const maxAmt = Math.max(...ordered.map((t) => t.amount), 1);
  const totalCR = transactions
    .filter((t) => t.type === "CR")
    .reduce((s, t) => s + t.amount, 0);
  const totalDR = transactions
    .filter((t) => t.type === "DR")
    .reduce((s, t) => s + t.amount, 0);

  const timeMin = ordered[0].when;
  const timeSpan = Math.max(ordered[n - 1].when - timeMin, 1);

  // Map a transaction to SVG coordinates
  const toX = (when) => PADL + ((when - timeMin) / timeSpan) * cW;
  const toY = (amt) => PADT + cH - (amt / maxAmt) * cH;

  // Separate CR and DR point sets
  const crPts = ordered
    .filter((t) => t.type === "CR")
    .map((t) => ({ x: toX(t.when), y: toY(t.amount), t }));
  const drPts = ordered
    .filter((t) => t.type === "DR")
    .map((t) => ({ x: toX(t.when), y: toY(t.amount), t }));

  const crLine = buildBezier(crPts);
  const drLine = buildBezier(drPts);
  const baseY = (PADT + cH).toFixed(1);
  const crArea = buildArea(crPts, crLine, baseY);
  const drArea = buildArea(drPts, drLine, baseY);

  const yTicks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <View style={chartStyles.card}>
      {/* ── Header ── */}
      <View style={chartStyles.header}>
        <Text style={chartStyles.headerTitle}>Overview</Text>
        {/* <View style={chartStyles.filterPill}>
          <Text style={chartStyles.filterText}>Recent</Text>
          <Ionicons name="chevron-down" size={13} color="#6B7280" />
        </View> */}
      </View>

      {/* ── Line chart ── */}
      <Svg width={W} height={H}>
        <Defs>
          <SvgGrad id="crFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={CR_LINE} stopOpacity="0.18" />
            <Stop offset="1" stopColor={CR_LINE} stopOpacity="0.01" />
          </SvgGrad>
          <SvgGrad id="drFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={DR_LINE} stopOpacity="0.15" />
            <Stop offset="1" stopColor={DR_LINE} stopOpacity="0.01" />
          </SvgGrad>
        </Defs>

        {/* Gridlines + Y labels */}
        {yTicks.map((frac, i) => {
          const y = PADT + cH * (1 - frac);
          return (
            <SvgG key={i}>
              <Line
                x1={PADL}
                y1={y}
                x2={W - PADR}
                y2={y}
                stroke="#E9EDF2"
                strokeWidth={1}
                strokeDasharray={frac === 0 ? "" : "4 3"}
              />
              <SvgText
                x={PADL - 5}
                y={y + 4}
                textAnchor="end"
                fontSize={9}
                fill="#9CA3AF"
              >
                {fmtK(maxAmt * frac)}
              </SvgText>
            </SvgG>
          );
        })}

        {/* CR (Income) area + line + dots */}
        {crArea && <Path d={crArea} fill="url(#crFill)" />}
        {crLine && (
          <Path
            d={crLine}
            stroke={CR_LINE}
            strokeWidth={2.5}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {crPts.map((pt, i) => (
          <SvgG key={`cr${i}`}>
            <Circle cx={pt.x} cy={pt.y} r={6} fill={CR_LINE} opacity={0.18} />
            <Circle cx={pt.x} cy={pt.y} r={4} fill={CR_LINE} />
            <Circle cx={pt.x} cy={pt.y} r={1.8} fill="#fff" />
          </SvgG>
        ))}

        {/* DR (Expense) area + line + dots */}
        {drArea && <Path d={drArea} fill="url(#drFill)" />}
        {drLine && (
          <Path
            d={drLine}
            stroke={DR_LINE}
            strokeWidth={2.5}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {drPts.map((pt, i) => (
          <SvgG key={`dr${i}`}>
            <Circle cx={pt.x} cy={pt.y} r={6} fill={DR_LINE} opacity={0.18} />
            <Circle cx={pt.x} cy={pt.y} r={4} fill={DR_LINE} />
            <Circle cx={pt.x} cy={pt.y} r={1.8} fill="#fff" />
          </SvgG>
        ))}

        {/* X-axis date labels — first, last, and middle if ≤ 5 pts */}
        {ordered.map((tx, i) => {
          if (n > 3 && i !== 0 && i !== n - 1) return null;
          const anchor = i === 0 ? "start" : i === n - 1 ? "end" : "middle";
          const dateLbl = new Date(tx.when).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            timeZone: "Asia/Thimphu",
          });
          return (
            <SvgText
              key={tx.id}
              x={toX(tx.when)}
              y={H - 6}
              textAnchor={anchor}
              fontSize={9}
              fill="#9CA3AF"
            >
              {dateLbl}
            </SvgText>
          );
        })}
      </Svg>

      {/* ── Legend ── */}
      <View style={chartStyles.legend}>
        <View style={chartStyles.legendItem}>
          <View style={[chartStyles.legendDot, { backgroundColor: CR_LINE }]} />
          <Text style={chartStyles.legendLabel}>Income</Text>
        </View>
        <View style={chartStyles.legendItem}>
          <View style={[chartStyles.legendDot, { backgroundColor: DR_LINE }]} />
          <Text style={chartStyles.legendLabel}>Expense</Text>
        </View>
      </View>

      {/* ── Summary cards ── */}
      <View style={chartStyles.cardsRow}>
        {/* Income card */}
        <View
          style={[chartStyles.summaryCard, { backgroundColor: INCOME_COLOR }]}
        >
          <View style={chartStyles.cardIconCircle}>
            <Ionicons name="arrow-down" size={14} color="#fff" />
          </View>
          <Ionicons
            name="arrow-down"
            size={72}
            color="rgba(255,255,255,0.07)"
            style={chartStyles.cardWatermark}
          />
          <Text style={chartStyles.cardLabel}>Income</Text>
          <Text style={chartStyles.cardAmt} numberOfLines={1}>
            BTN{" "}
            {Number(totalCR).toLocaleString("en-IN", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </Text>
        </View>

        {/* Expense card */}
        <View
          style={[chartStyles.summaryCard, { backgroundColor: EXPENSE_COLOR }]}
        >
          <View style={chartStyles.cardIconCircle}>
            <Ionicons name="arrow-up" size={14} color="#fff" />
          </View>
          <Ionicons
            name="arrow-up"
            size={72}
            color="rgba(255,255,255,0.07)"
            style={chartStyles.cardWatermark}
          />
          <Text style={chartStyles.cardLabel}>Expense</Text>
          <Text style={chartStyles.cardAmt} numberOfLines={1}>
            BTN{" "}
            {Number(totalDR).toLocaleString("en-IN", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </Text>
        </View>
      </View>
    </View>
  );
}

const chartStyles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },

  /* header */
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  headerTitle: { fontSize: 16, fontWeight: "800", color: "#0F172A" },
  filterPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  filterText: { fontSize: 12, fontWeight: "600", color: "#6B7280" },

  /* legend */
  legend: {
    flexDirection: "row",
    gap: 20,
    marginTop: 6,
    marginBottom: 14,
    paddingLeft: 4,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendLabel: { fontSize: 12, fontWeight: "600", color: "#374151" },

  /* summary cards */
  cardsRow: { flexDirection: "row", gap: 12 },
  summaryCard: {
    flex: 1,
    borderRadius: 18,
    padding: 14,
    overflow: "hidden",
    minHeight: 100,
    justifyContent: "flex-end",
  },
  cardIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  cardWatermark: {
    position: "absolute",
    top: -10,
    right: -10,
  },
  cardLabel: {
    fontSize: 11,
    color: "rgba(255,255,255,0.75)",
    fontWeight: "600",
    marginBottom: 4,
  },
  cardAmt: {
    fontSize: 15,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -0.3,
  },
});

function QuickAction({ icon, label, bg, color, onPress }) {
  return (
    <TouchableOpacity
      style={styles.quickBtn}
      onPress={onPress}
      activeOpacity={0.78}
    >
      <View style={[styles.quickIcon, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function TxRow({ tx }) {
  const isCR = tx.type === "CR";
  const amt = `${isCR ? "+" : "-"}${currency(tx.amount)}`;
  const iconBg = isCR ? "#D1FAE5" : "#FEE2E2";
  const iconColor = isCR ? "#059669" : "#DC2626";
  const accentColor = isCR ? "#059669" : "#DC2626";
  const iconName = isCR
    ? "arrow-down-circle-outline"
    : "arrow-up-circle-outline";
  const reason = getReasonFromNote(tx.note);

  const pillStyle =
    tx.status === "success"
      ? styles.pillOk
      : tx.status === "reversed"
        ? styles.pillWarn
        : styles.pillGray;

  return (
    <View style={[styles.txRow, { borderLeftColor: accentColor }]}>
      <View style={[styles.txIconCircle, { backgroundColor: iconBg }]}>
        <Ionicons name={iconName} size={20} color={iconColor} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.txTitle} numberOfLines={1}>
          {reason || tx.note || (isCR ? "Credited" : "Debited")}
        </Text>
        {!!tx.journal_code && (
          <Text style={styles.txJournal}>Jrnl: {tx.journal_code}</Text>
        )}
        <View style={styles.txMeta}>
          <Text style={styles.txTime}>{timeHM(tx.when)}</Text>
          <View style={[styles.pill, pillStyle]}>
            <Text style={styles.pillText}>{tx.status}</Text>
          </View>
        </View>
      </View>
      <View style={{ alignItems: "flex-end", gap: 3 }}>
        <Text style={[styles.txAmt, isCR ? styles.txCR : styles.txDR]}>
          {amt}
        </Text>
        <Text style={styles.txTypeLabel}>{isCR ? "Credited" : "Debited"}</Text>
      </View>
    </View>
  );
}

/* ================================================================
   STYLES
================================================================ */
const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "#F8FAFC" },

  /* ── Gradient header (main) ── */
  gradHeader: {
    paddingTop:
      Platform.OS === "android" ? (StatusBar.currentHeight || 24) + 12 : 58,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  navTitle: { color: "#fff", fontSize: 22, fontWeight: "800" },
  navPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.22)",
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 999,
  },
  navPillText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  navIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },

  /* ── Balance section ── */
  balSection: {
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.18)",
  },
  balTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  balLabel: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  eyeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  balAmtRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 5,
    marginTop: 8,
  },
  balCurrency: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 3,
  },
  balAmt: {
    color: "#fff",
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  balHidden: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 22,
    fontWeight: "700",
    marginTop: 8,
    letterSpacing: 6,
  },
  walletIdRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.15)",
  },
  walletIdText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1.5,
  },

  /* ── Quick actions ── */
  quickBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  quickBtn: { alignItems: "center", gap: 6 },
  quickIcon: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  quickLabel: { color: "#374151", fontSize: 12, fontWeight: "700" },

  /* ── Transactions ── */
  txHeading: {
    paddingHorizontal: 16,
    paddingTop: 22,
    paddingBottom: 10,
    backgroundColor: "#F8FAFC",
  },
  sectionTitle: { color: "#0F172A", fontSize: 17, fontWeight: "800" },
  dayLabel: {
    color: "#94A3B8",
    fontWeight: "700",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 4,
  },
  txRow: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    borderLeftWidth: 3,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    marginBottom: 8,
  },
  txIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  txTitle: { color: "#1E293B", fontWeight: "600", fontSize: 14 },
  txJournal: { color: "#94A3B8", fontSize: 11, marginTop: 1 },
  txMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 5 },
  txTime: { color: "#94A3B8", fontSize: 12 },
  txAmt: { fontWeight: "800", fontSize: 15 },
  txCR: { color: "#059669" },
  txDR: { color: "#DC2626" },
  txTypeLabel: { color: "#94A3B8", fontSize: 11 },

  /* ── Pills ── */
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillText: { fontSize: 11, fontWeight: "600", color: "#374151" },
  pillOk: { backgroundColor: "#ECFDF5", borderColor: "#A7F3D0" },
  pillWarn: { backgroundColor: "#FEF3C7", borderColor: "#FDE68A" },
  pillGray: { backgroundColor: "#F3F4F6", borderColor: "#E5E7EB" },

  /* ── Empty transactions ── */
  emptyTx: {
    alignItems: "center",
    paddingVertical: 52,
    paddingHorizontal: 32,
    gap: 8,
  },
  emptyTxRing: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  emptyTxTitle: { color: "#475569", fontSize: 16, fontWeight: "700" },
  emptyTxSub: {
    color: "#94A3B8",
    textAlign: "center",
    fontSize: 13,
    lineHeight: 20,
  },

  /* ── FAB ── */
  fab: {
    position: "absolute",
    right: 16,
    bottom: 82,
    backgroundColor: G.grab,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 999,
    shadowColor: G.grab,
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  fabText: { color: "#fff", fontWeight: "800", fontSize: 14 },

  /* ── Lock / empty screens ── */
  lockGrad: {
    paddingTop:
      Platform.OS === "android" ? (StatusBar.currentHeight || 24) + 28 : 76,
    paddingBottom: 44,
    paddingHorizontal: 28,
    alignItems: "center",
    gap: 10,
  },
  lockRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.4)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  lockTitle: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "800",
    textAlign: "center",
  },
  lockSub: {
    color: "rgba(255,255,255,0.8)",
    textAlign: "center",
    fontSize: 14,
    lineHeight: 22,
    maxWidth: 280,
  },
  lockBody: {
    margin: 16,
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    gap: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#F1F5F9",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },

  /* ── Buttons ── */
  primaryBtn: {
    backgroundColor: G.grab,
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
  },
  primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  ghostBtn: { paddingVertical: 8 },
  ghostBtnText: { color: G.grab, fontWeight: "700", fontSize: 14 },
  btnDisabled: { opacity: 0.45 },

  /* ── MPIN input ── */
  mpinInput: {
    width: "100%",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 30,
    letterSpacing: 18,
    textAlign: "center",
    color: "#1E293B",
    backgroundColor: "#F8FAFC",
  },
  mpinError: { color: "#DC2626", fontSize: 13, fontWeight: "600" },
});
