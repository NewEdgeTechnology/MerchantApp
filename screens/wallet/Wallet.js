// services/wallet/WalletPassenger.js
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Dimensions,
  Platform,
  ActivityIndicator,
  Alert,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import {
  useNavigation,
  useRoute,
  useFocusEffect,
} from "@react-navigation/native";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { getUserInfo, getValidAccessToken } from "../../utils/authToken";

/* ========= SecureStore user_id key ========= */
const KEY_USER_ID = "user_id_v1";

/* ========= unlock TTL ========= */
const UNLOCK_TTL_MS = 3 * 60 * 1000; // 3 minutes

/* ========= note / reason helper ========= */
function getReasonFromNote(note) {
  if (!note || typeof note !== "string") return "";

  const trimmed = note.trim();
  if (!trimmed) return "";

  // Try JSON note first
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

  // Plain text note → we don’t override
  return "";
}

/* ========= endpoints ========= */
const GET_WALLET_BY_USER = (userId) =>
  `https://grab.newedge.bt/wallet/wallet/getbyuser/${userId}`;
const CREATE_WALLET_URL = "https://grab.newedge.bt/wallet/wallet/create";
const TX_BY_WALLET = (walletId) =>
  `https://grab.newedge.bt/wallet/transactions/wallet/${walletId}`;

const HAS_TPIN_URL = (userId) =>
  `https://grab.newedge.bt/wallet/wallet/${userId}/has-tpin`;

/* ========= SecureStore MPIN key helper ========= */
const mpinKeyForWallet = (walletId) => {
  const raw = String(walletId || "default");
  const safe = raw.replace(/[^A-Za-z0-9._-]/g, "_");
  return `wallet_mpin_${safe}`;
};

/* ========= tokens / theme ========= */
const { width } = Dimensions.get("window");
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

/* ========= helpers ========= */
const currency = (n) =>
  `BTN. ${Number(n || 0).toLocaleString("en-IN", {
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
  const d = new Date(ts);
  const t = new Date();
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
  if (!res.ok) {
    const msg = json?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

// Group transactions by logical day label
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

// Map server tx row → UI tx (prefer local time like driver screen)
function mapServerTx(row) {
  const type =
    String(row.direction || row.remark || row.type || "DR").toUpperCase() ===
    "CR"
      ? "CR"
      : "DR";

  const whenStr = row.created_at_local || row.created_at;
  const when = whenStr ? new Date(whenStr).getTime() : Date.now();

  const title = type === "CR" ? "Credited" : "Debited";

  return {
    id: String(row.transaction_id || row.id || `${when}-${Math.random()}`),
    journal_code: String(row.journal_code || ""),
    when,
    type,
    title,
    note: row.note ? String(row.note) : "",
    amount: Number(row.amount || 0),
    status: String(row.status || "success").toLowerCase(),
    created_at: row.created_at,
    created_at_local: row.created_at_local,
  };
}

export default function WalletScreen({ navigation }) {
  const nav = useNavigation();
  const route = useRoute();

  const routeUserId = route?.params?.user_id;
  const [userId, setUserId] = useState(routeUserId || null);

  const [hidden, setHidden] = useState(true); // hide balance by default like driver
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const [wallet, setWallet] = useState(null);
  const [balance, setBalance] = useState(0);
  const [pending, setPending] = useState(0); // reserved if needed later
  const [tx, setTx] = useState([]);
  const [page, setPage] = useState(1);
  const [tpinMissing, setTpinMissing] = useState(false);

  // Biometric / MPIN
  const [bioChecking, setBioChecking] = useState(false);
  const [bioPassed, setBioPassed] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(null);
  const [mpinRequired, setMpinRequired] = useState(false);

  // Unlock session TTL
  const [lastUnlockTs, setLastUnlockTs] = useState(null);

  // MPIN local state
  const [mpinExists, setMpinExists] = useState(false);
  const [mpinInput, setMpinInput] = useState("");
  const [mpinChecking, setMpinChecking] = useState(false);
  const [mpinError, setMpinError] = useState("");

  const grouped = useMemo(() => groupByDay(tx), [tx]);

  // ✅ Ensure user id comes from SecureStore if not provided via route
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        if (routeUserId) return; // already from navigation

        // 1) try SecureStore (saved during login)
        const storedUid = await SecureStore.getItemAsync(KEY_USER_ID);
        const uid = storedUid ? Number(storedUid) || storedUid : null;

        if (uid) {
          if (alive) setUserId(uid);
          console.log("[Wallet] userId from SecureStore:", uid);
          return;
        }

        // 2) fallback to your existing helper
        const me = await getUserInfo();
        const fallback = me?.user_id || me?.id || null;

        if (alive) setUserId(fallback);
        console.log("[Wallet] userId from getUserInfo:", fallback);
      } catch (e) {
        console.log("[Wallet] userId resolve error:", e?.message || e);
      }
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
      const mapped = list.map(mapServerTx).sort((a, b) => b.when - a.when);
      setTx((prev) => (replace ? mapped : [...prev, ...mapped]));
    } catch (e) {
      console.log("[Wallet] loadTransactions error:", e?.message || e);
    }
  }, []);

  // Core loader: wallet -> TPIN -> tx
  const loadWalletFlow = useCallback(
    async (uid) => {
      setError("");
      setTpinMissing(false);
      // Don’t reset bioPassed/mpinRequired here; TTL handles that
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
        console.log(
          "[Wallet] HAS_TPIN check response:",
          JSON.stringify(tpinRes, null, 2)
        );
        hasTpin = !!(tpinRes?.success && tpinRes?.has_tpin === true);
        console.log("[Wallet] hasTpin:", hasTpin);
      } catch (e) {
        console.log("[Wallet] HAS_TPIN check error:", e?.message || e);
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
    [loadTransactions]
  );

  // Initial load once userId known
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

  // Refresh every time screen is focused (like driver)
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
    }, [userId, loadWalletFlow])
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

  /* ========= MPIN existence check when it becomes required ========= */
  useEffect(() => {
    if (!mpinRequired || !wallet?.wallet_id) return;
    let alive = true;
    (async () => {
      try {
        const key = mpinKeyForWallet(wallet.wallet_id);
        const stored = await SecureStore.getItemAsync(key);
        if (!alive) return;
        setMpinExists(!!stored);
        console.log("[Wallet] MPIN exists:", !!stored);
      } catch (e) {
        if (!alive) return;
        setMpinExists(false);
        console.log("[Wallet] MPIN check error:", e?.message || e);
      }
    })();
    return () => {
      alive = false;
    };
  }, [mpinRequired, wallet?.wallet_id]);

  const onChangeMpinInput = useCallback((val) => {
    const clean = (val || "").replace(/[^0-9]/g, "").slice(0, 4);
    setMpinInput(clean);
    setMpinError("");
  }, []);

  const handleUnlockWithMPIN = useCallback(async () => {
    if (!wallet?.wallet_id) {
      Alert.alert("Error", "Wallet ID missing. Please reopen your wallet.");
      return;
    }
    if (mpinInput.length !== 4) {
      setMpinError("Enter your 4-digit MPIN.");
      return;
    }

    setMpinChecking(true);
    setMpinError("");
    try {
      const key = mpinKeyForWallet(wallet.wallet_id);
      const stored = await SecureStore.getItemAsync(key);
      if (!stored) {
        setMpinExists(false);
        Alert.alert("MPIN not found", "Please set your wallet MPIN first.", [
          {
            text: "Set MPIN",
            onPress: () => {
              try {
                nav.navigate("WalletSetMPIN", {
                  user_id: userId,
                  wallet_id: wallet.wallet_id,
                });
              } catch {}
            },
          },
          { text: "Cancel", style: "cancel" },
        ]);
        return;
      }

      if (stored !== mpinInput) {
        setMpinError("Incorrect MPIN. Try again.");
        return;
      }

      // MPIN correct -> unlock wallet + start TTL
      setBioPassed(true);
      setMpinRequired(false);
      setLastUnlockTs(Date.now());
      setMpinInput("");
      setMpinError("");
    } catch (e) {
      console.log("[Wallet] MPIN unlock error:", e?.message || e);
      Alert.alert("Failed", "Could not verify MPIN.");
    } finally {
      setMpinChecking(false);
    }
  }, [wallet?.wallet_id, mpinInput, nav, userId]);

  /* ========= biometric auth ========= */
  const runBiometricAuth = useCallback(async () => {
    if (!wallet || tpinMissing) return;

    setBioChecking(true);
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      console.log("[Wallet] hasHardware:", hasHardware, "isEnrolled:", isEnrolled);

      if (!hasHardware || !isEnrolled) {
        // No biometric → MPIN flow
        setBioAvailable(false);
        setMpinRequired(true);
        setBioPassed(false);

        Alert.alert(
          "Set MPIN",
          "Your device does not support biometrics or no fingerprint/face is enrolled. Please use an MPIN to unlock your wallet.",
          [{ text: "OK" }]
        );
        return;
      }

      setBioAvailable(true);

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock your wallet",
        fallbackLabel: "Use device passcode",
        cancelLabel: "Cancel",
      });

      console.log("[Wallet] Biometric result:", result);

      if (result.success) {
        setBioPassed(true);
        setLastUnlockTs(Date.now()); // start/unrenew TTL
      } else {
        setBioPassed(false);
      }
    } catch (e) {
      console.log("[Wallet] Biometric error:", e?.message || e);
      setBioAvailable(false);
      setMpinRequired(true);
      setBioPassed(false);
    } finally {
      setBioChecking(false);
    }
  }, [wallet, tpinMissing]);

  /* ========= Unlock logic with 3-minute TTL ========= */
  useEffect(() => {
    if (!wallet || tpinMissing) return;

    const now = Date.now();
    const withinTTL =
      typeof lastUnlockTs === "number" && now - lastUnlockTs < UNLOCK_TTL_MS;

    if (withinTTL) {
      if (!bioPassed) {
        console.log("[Wallet] Within unlock TTL -> auto-unlock");
        setBioPassed(true);
      }
      return;
    }

    // TTL expired: if device has biometrics (mpinRequired === false), trigger biometric
    if (!bioPassed && !mpinRequired) {
      runBiometricAuth();
    }
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
      const payload = { user_id: userId, status: "ACTIVE" };
      const res = await fetchJson(CREATE_WALLET_URL, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (res?.success) {
        let walletData = null;

        try {
          const again = await fetchJson(GET_WALLET_BY_USER(userId));
          walletData = again?.data || null;
          setWallet(walletData || null);
          setBalance(Number(walletData?.amount || 0));
        } catch (e) {
          console.log("[Wallet] reload after create error:", e?.message || e);
        }

        setTpinMissing(true);
        setTx([]);
        setBioPassed(false);
        setMpinRequired(false);
        setLastUnlockTs(null);

        Alert.alert(
          "Wallet created",
          "Your wallet has been created. Please set your wallet TPIN to start using it.",
          [
            {
              text: "Set TPIN now",
              onPress: () => {
                if (!walletData?.wallet_id) return;
                try {
                  nav.navigate("WalletSetTPIN", {
                    user_id: userId,
                    wallet_id: walletData.wallet_id,
                  });
                } catch {}
              },
            },
            { text: "Later", style: "cancel" },
          ]
        );
      } else {
        throw new Error(res?.message || "Failed to create wallet");
      }
    } catch (e) {
      Alert.alert("Failed", String(e.message || e));
    } finally {
      setCreating(false);
    }
  }, [userId, nav]);

  const loadMore = useCallback(() => {
    if (page > 1) return;
    setPage((p) => p + 1);
  }, [page]);

  const go = (name, params = {}) => {
    try {
      nav.navigate(name, params);
    } catch {}
  };

  // ===== Render states =====
  if (!userId) {
    return (
      <View style={[styles.center, { padding: 24 }]}>
        <ActivityIndicator size="small" color={G.grab} />
        <Text style={{ marginTop: 12, color: G.grab, fontWeight: "600" }}>
          Loading your wallet…
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: 64 }]}>
        <ActivityIndicator size="large" color={G.grab} />
        <Text style={{ marginTop: 12, color: G.grab, fontWeight: "600" }}>
          Checking your wallet…
        </Text>
        {!!error && (
          <Text style={{ marginTop: 8, color: G.danger }}>{String(error)}</Text>
        )}
      </View>
    );
  }

  // Wallet exists but TPIN is missing → block wallet and prompt to set TPIN
  if (tpinMissing) {
    return (
      <View style={styles.wrap}>
        <LinearGradient
          colors={["#46e693", "#40d9c2"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientHeader}
        >
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>Wallet</Text>
          </View>
        </LinearGradient>

        <View style={{ padding: 16 }}>
          <View style={styles.emptyCard}>
            <Ionicons name="shield-checkmark-outline" size={28} color={G.grab} />
            <Text style={styles.emptyTitle}>Set Wallet TPIN</Text>
            <Text style={styles.emptySub}>
              For your security, please create a TPIN before accessing your wallet.
            </Text>
            <TouchableOpacity
              style={styles.createBtn}
              onPress={() => {
                try {
                  nav.navigate("WalletSetTPIN", {
                    user_id: userId,
                    wallet_id: wallet?.wallet_id,
                  });
                } catch {}
              }}
            >
              <Text style={styles.createText}>Create TPIN</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // No wallet yet → ask to create wallet
  if (!wallet) {
    return (
      <View style={styles.wrap}>
        <LinearGradient
          colors={["#46e693", "#40d9c2"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientHeader}
        >
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>Wallet</Text>
          </View>
        </LinearGradient>

        <View style={{ padding: 16 }}>
          <View style={styles.emptyCard}>
            <Ionicons name="wallet-outline" size={28} color={G.grab} />
            <Text style={styles.emptyTitle}>No wallet yet</Text>
            <Text style={styles.emptySub}>
              Create a wallet to start paying, topping up, and receiving refunds. After
              creating a wallet, you&apos;ll be asked to set a secure TPIN.
            </Text>
            <TouchableOpacity
              style={styles.createBtn}
              onPress={handleCreate}
              disabled={creating}
            >
              {creating ? (
                <ActivityIndicator size="small" color={G.white} />
              ) : (
                <Text style={styles.createText}>Create Wallet</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // Device has no biometric / no enrollment → MPIN required (either set or unlock)
  if (mpinRequired && !bioPassed) {
    return (
      <View style={styles.wrap}>
        <LinearGradient
          colors={["#46e693", "#40d9c2"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientHeader}
        >
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>Wallet Locked</Text>
          </View>
        </LinearGradient>

        <View style={{ padding: 16 }}>
          <View style={styles.emptyCard}>
            <Ionicons name="keypad-outline" size={32} color={G.grab} />
            <Text style={styles.emptyTitle}>
              {mpinExists ? "Enter Wallet MPIN" : "Set Wallet MPIN"}
            </Text>
            <Text style={styles.emptySub}>
              {mpinExists
                ? "Enter your 4-digit MPIN to unlock your wallet on this device."
                : "Your device doesn&apos;t support biometrics or none is enrolled. Please set a 4-digit MPIN to unlock your wallet."}
            </Text>

            {mpinExists ? (
              <>
                <TextInput
                  value={mpinInput}
                  onChangeText={onChangeMpinInput}
                  keyboardType="number-pad"
                  maxLength={4}
                  secureTextEntry
                  style={styles.mpinInput}
                  placeholder="••••"
                  placeholderTextColor="#CBD5E1"
                />
                {mpinError ? <Text style={styles.mpinError}>{mpinError}</Text> : null}

                <TouchableOpacity
                  style={[
                    styles.createBtn,
                    mpinInput.length !== 4 || mpinChecking ? styles.btnDisabled : null,
                  ]}
                  onPress={handleUnlockWithMPIN}
                  disabled={mpinInput.length !== 4 || mpinChecking}
                >
                  {mpinChecking ? (
                    <ActivityIndicator size="small" color={G.white} />
                  ) : (
                    <Text style={styles.createText}>Unlock</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={{ marginTop: 8 }}
                  onPress={() => {
                    try {
                      nav.navigate("WalletSetMPIN", {
                        user_id: userId,
                        wallet_id: wallet?.wallet_id,
                      });
                    } catch {}
                  }}
                >
                  <Text style={{ color: G.grab, fontWeight: "700" }}>Change MPIN</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={styles.createBtn}
                onPress={() => {
                  try {
                    nav.navigate("WalletSetMPIN", {
                      user_id: userId,
                      wallet_id: wallet?.wallet_id,
                    });
                  } catch {}
                }}
              >
                <Text style={styles.createText}>Set MPIN</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    );
  }

  // Wallet + TPIN present, but biometric not yet passed → show lock screen
  if (!bioPassed) {
    return (
      <View style={styles.wrap}>
        <LinearGradient
          colors={["#46e693", "#40d9c2"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientHeader}
        >
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>Wallet Locked</Text>
          </View>
        </LinearGradient>

        <View style={{ padding: 16 }}>
          <View style={styles.emptyCard}>
            <Ionicons name="lock-closed-outline" size={32} color={G.grab} />
            <Text style={styles.emptyTitle}>Unlock your wallet</Text>
            <Text style={styles.emptySub}>
              Use your fingerprint or face to view your wallet balance and transactions.
            </Text>

            {bioChecking ? (
              <View style={{ marginTop: 12, alignItems: "center" }}>
                <ActivityIndicator size="small" color={G.grab} />
                <Text style={{ marginTop: 8, color: "#64748B", fontWeight: "600" }}>
                  Authenticating…
                </Text>
              </View>
            ) : (
              <TouchableOpacity style={styles.createBtn} onPress={runBiometricAuth}>
                <Text style={styles.createText}>Unlock with biometrics</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    );
  }

  // ===== Main wallet (unlocked) =====
  return (
    <View style={styles.wrap}>
      {/* ===== Header / Balance ===== */}
      <LinearGradient
        colors={["#46e693", "#40d9c2"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientHeader}
      >
        <View style={styles.headerRow}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Text style={styles.headerTitle}>My Wallet</Text>
          </View>

          <View style={{ flexDirection: "row", gap: 12 }}>
            {/* My QR badge like driver */}
            <TouchableOpacity
              style={styles.badgeWhite}
              onPress={() => go("WalletMyQRScreen", { wallet })}
            >
              <Ionicons name="qr-code-outline" size={14} color={G.white} />
              <Text style={[styles.badgeText, { marginLeft: 6 }]}>My QR</Text>
            </TouchableOpacity>

            {/* Settings icon */}
            <TouchableOpacity
              style={styles.iconCircle}
              onPress={() => go("WalletSettingsScreen", { wallet })}
            >
              <Ionicons name="settings-outline" size={18} color={G.white} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.balanceCard}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={styles.balanceLabel}>Available Balance</Text>
            <TouchableOpacity onPress={() => setHidden((v) => !v)}>
              <Ionicons
                name={hidden ? "eye-off-outline" : "eye-outline"}
                size={18}
                color={G.white}
              />
            </TouchableOpacity>
          </View>
          <Text style={styles.balanceAmt}>{hidden ? "xxxxxxxx" : currency(balance)}</Text>
          <Text style={styles.pending}>Wallet ID: {wallet?.wallet_id}</Text>

          {/* Quick Actions */}
          <View style={styles.quickRow}>
            <QuickAction
              icon="add-circle-outline"
              label="Top Up"
              onPress={() => go("TopUpScreen", { wallet, user_id: userId })}
            />
            <QuickAction
              icon="qr-code-outline"
              label="Pay"
              onPress={() => go("ScanQRScreen", { wallet })}
            />
            <QuickAction
              icon="swap-horizontal-outline"
              label="Transfer"
              onPress={() => go("WalletTransferScreen", { wallet })}
            />
            <QuickAction
              icon="cash-outline"
              label="Withdraw"
              onPress={() => go("WithdrawalScreen", { wallet })}
            />
          </View>
        </View>
      </LinearGradient>

      {/* ===== Transactions ===== */}
      <View style={styles.section}>
        <View style={[styles.rowBetween, { marginBottom: 8 }]}>
          <Text style={styles.sectionTitle}>Transactions</Text>
        </View>

        <FlatList
          data={grouped}
          keyExtractor={(g) => g.label}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} />}
          renderItem={({ item }) => (
            <View style={{ marginBottom: 16 }}>
              <Text style={styles.dayLabel}>{item.label}</Text>
              {item.items.map((one) => (
                <TxRow key={one.id} tx={one} />
              ))}
            </View>
          )}
          onEndReachedThreshold={0.25}
          onEndReached={loadMore}
          ListEmptyComponent={<Text style={{ color: "#64748B" }}>No transactions yet</Text>}
          ListFooterComponent={<View style={{ height: 24 }} />}
        />
      </View>

      {/* Floating Scan Button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => go("ScanQRScreen", { wallet })}
        activeOpacity={0.85}
      >
        <Ionicons name="qr-code-outline" size={22} color={G.white} />
        <Text style={{ color: G.white, fontWeight: "700", marginLeft: 8 }}>
          Scan to Pay
        </Text>
      </TouchableOpacity>
    </View>
  );
}

/* ===== Subcomponents ===== */
function QuickAction({ icon, label, onPress }) {
  return (
    <TouchableOpacity style={styles.quick} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.quickIcon}>
        <Ionicons name={icon} size={20} color={G.grab} />
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function TxRow({ tx }) {
  const isCR = tx.type === "CR";
  const amt = `${isCR ? "+" : "-"}${currency(tx.amount)}`;
  const pill =
    tx.status === "success"
      ? styles.pillOk
      : tx.status === "reversed"
      ? styles.pillWarn
      : styles.pillGray;
  const iconName = isCR ? "arrow-down-circle-outline" : "arrow-up-circle-outline";

  const reason = getReasonFromNote(tx.note);

  return (
    <View style={styles.txRow}>
      <View style={styles.txIconWrap}>
        <Ionicons name={iconName} size={22} color={isCR ? G.ok : G.danger} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.txTitle}>{reason ? reason : tx.note}</Text>
        {!!tx.journal_code && <Text style={styles.txNote}>Jrnl No: {tx.journal_code}</Text>}

        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
          <Text style={styles.txTime}>{timeHM(tx.when)}</Text>
          <View style={[styles.pill, pill]}>
            <Text style={styles.pillText}>{tx.status}</Text>
          </View>
        </View>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={[styles.txAmt, isCR ? styles.txCR : styles.txDR]}>{amt}</Text>
        <Text style={styles.txType}>{tx.type === "CR" ? "Credited" : "Debited"}</Text>
      </View>
    </View>
  );
}

/* ===== Styles ===== */
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
    paddingTop: 14,
  },
  headerTitle: { color: G.white, fontSize: 20, fontWeight: "800" },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,.18)",
    alignItems: "center",
    justifyContent: "center",
  },

  badgeWhite: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,.2)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeText: { color: G.white, fontWeight: "800", fontSize: 12 },

  balanceCard: {
    marginTop: 14,
    backgroundColor: "rgba(255,255,255,.16)",
    borderRadius: 16,
    padding: 14,
  },
  balanceLabel: { color: G.white, opacity: 0.95 },
  balanceAmt: { color: G.white, fontSize: 24, fontWeight: "900", marginTop: 6 },
  pending: { color: G.white, opacity: 0.85, marginTop: 4 },

  quickRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 14 },
  quick: { width: (width - 32 - 28) / 4, alignItems: "center" },
  quickIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#E8FFF1",
    alignItems: "center",
    justifyContent: "center",
  },
  quickLabel: { marginTop: 8, color: G.white, fontWeight: "700", fontSize: 12 },

  section: { paddingHorizontal: 16, paddingTop: 16 },
  sectionTitle: { color: G.slate, fontSize: 16, fontWeight: "800" },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },

  dayLabel: { color: "#64748B", fontWeight: "800", marginBottom: 8, marginTop: 6 },
  txRow: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: G.line,
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    marginBottom: 10,
  },
  txIconWrap: { width: 32, alignItems: "center", paddingTop: 2 },
  txTitle: { color: G.slate, fontWeight: "600" },
  txNote: { color: "#6B7280", marginTop: 2 },
  txTime: { color: "#94A3B8", fontSize: 12 },
  txAmt: { fontWeight: "800" },
  txCR: { color: G.ok },
  txDR: { color: G.danger },
  txType: { color: "#94A3B8", fontSize: 12, marginTop: 4 },

  pill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  pillText: { fontSize: 11, fontWeight: "600" },
  pillOk: { backgroundColor: "#ECFDF5", borderColor: "#D1FAE5" },
  pillWarn: { backgroundColor: "#FEF3C7", borderColor: "#FDE68A" },
  pillGray: { backgroundColor: "#F3F4F6", borderColor: "#E5E7EB" },

  fab: {
    position: "absolute",
    right: 16,
    bottom: 24,
    backgroundColor: G.grab,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 999,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },

  emptyCard: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: G.line,
    borderRadius: 16,
    padding: 18,
    gap: 8,
    alignItems: "center",
  },
  emptyTitle: { color: G.slate, fontSize: 18, fontWeight: "800", marginTop: 4 },
  emptySub: { color: "#64748B", textAlign: "center" },
  createBtn: {
    marginTop: 8,
    backgroundColor: G.grab,
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  createText: { color: G.white, fontWeight: "800" },

  mpinInput: {
    borderWidth: 1,
    borderColor: G.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 18,
    letterSpacing: 6,
    textAlign: "center",
    color: G.text,
    backgroundColor: "#F8FAFC",
    marginTop: 12,
  },
  mpinError: { marginTop: 6, color: G.danger, fontSize: 12, fontWeight: "600" },
  btnDisabled: { opacity: 0.5 },
});
