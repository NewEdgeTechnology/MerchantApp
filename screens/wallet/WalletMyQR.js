// services/wallet/WalletMyQR.js
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";

import { getUserInfo } from "../../utils/authToken";

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

export default function WalletMyQRScreen() {
  const nav = useNavigation();
  const route = useRoute();
  const wallet = route?.params?.wallet || null; // expect wallet from WalletScreen

  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const me = await getUserInfo();
        if (!alive) return;

        const name =
          me?.user_name ||
          me?.full_name ||
          me?.name ||
          `${me?.first_name || ""} ${me?.last_name || ""}`.trim() ||
          "Wallet user";

        setUserName(name);
        setUserId(me?.user_id || me?.id || null);
      } catch (e) {
        if (!alive) return;
        setUserName("Wallet user");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const goBack = () => {
    try {
      nav.goBack();
    } catch {}
  };

  // Build QR payload (JSON string)
  const qrValue = useMemo(() => {
    if (!wallet?.wallet_id) return "";

    const payload = {
      kind: "user_wallet",
      walletId: wallet.wallet_id,
      userName,
      userId,
      // extra fields if you want later:
      // currency: "BTN",
      // platform: "grab.newedge.bt",
    };

    try {
      return JSON.stringify(payload);
    } catch {
      return "";
    }
  }, [wallet?.wallet_id, userName, userId]);

  if (!wallet?.wallet_id) {
    return (
      <View style={styles.center}>
        <Text style={styles.centerText}>
          Wallet not available. Please open your wallet again.
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={G.grab} />
        <Text style={styles.centerText}>Preparing your QR code…</Text>
      </View>
    );
  }

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
          <TouchableOpacity style={styles.backBtn} onPress={goBack}>
            <Ionicons name="chevron-back" size={22} color={G.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My QR Code</Text>
          <View style={{ width: 32 }} />
        </View>
        <Text style={styles.headerSub}>
          Let others scan this QR to send money directly to your wallet.
        </Text>
      </LinearGradient>

      {/* Body */}
      <View style={styles.body}>
        <View style={styles.card}>
          <Text style={styles.nameText}>{userName}</Text>
          <Text style={styles.walletIdText}>Wallet ID: {wallet.wallet_id}</Text>

          <View style={styles.qrWrap}>
            {qrValue ? (
              <QRCode
                value={qrValue}
                size={220}
                backgroundColor="#ffffff"
                color="#000000"
              />
            ) : (
              <Text style={{ color: G.sub }}>QR data not available</Text>
            )}
          </View>

          <Text style={styles.helperText}>
            Ask the sender to open “Scan to Pay” and scan this code. The wallet
            ID and your name are inside the QR payload.
          </Text>
        </View>
      </View>
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
    padding: 24,
  },
  centerText: {
    marginTop: 8,
    color: G.slate,
    fontWeight: "600",
    textAlign: "center",
  },

  gradientHeader: {
    paddingTop: Platform.OS === "android" ? 36 : 56,
    paddingHorizontal: 16,
    paddingBottom: 16,
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
    backgroundColor: "rgba(255,255,255,.18)",
  },
  headerTitle: {
    color: G.white,
    fontSize: 18,
    fontWeight: "800",
  },
  headerSub: {
    marginTop: 8,
    color: "rgba(255,255,255,.9)",
    fontSize: 13,
  },

  body: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: G.line,
    alignItems: "center",
  },
  nameText: {
    fontSize: 18,
    fontWeight: "800",
    color: G.slate,
  },
  walletIdText: {
    marginTop: 4,
    color: "#64748B",
    fontSize: 13,
  },
  qrWrap: {
    marginTop: 18,
    marginBottom: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: "#F9FAFB",
  },
  helperText: {
    marginTop: 4,
    color: "#6B7280",
    fontSize: 12,
    textAlign: "center",
  },
});
