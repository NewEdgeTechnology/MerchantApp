// services/wallet/WalletMyQR.js
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Platform,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import { captureRef } from "react-native-view-shot";
import * as MediaLibrary from "expo-media-library";
import { C as T } from "../../theme/colors";
import { getUserInfo } from "../../utils/authToken";
import { useAlert } from "../../components/CustomAlert";

const LOGO_URI = Image.resolveAssetSource(require("../../assets/logo_v2_real.png")).uri;

export default function WalletMyQRScreen() {
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const route = useRoute();
  const { showAlert, alertNode } = useAlert();
  const wallet = route?.params?.wallet || null;

  const passedUserName =
    route?.params?.userName ||
    route?.params?.username ||
    route?.params?.full_name ||
    route?.params?.name ||
    "";

  const passedUserId = route?.params?.user_id || route?.params?.userId || null;

  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState(passedUserName);
  const [userId, setUserId] = useState(passedUserId);
  const [saving, setSaving] = useState(false);

  const posterRef = useRef(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const me = await getUserInfo();

        if (!alive) return;

        const resolvedName =
          passedUserName ||
          wallet?.user_name ||
          wallet?.full_name ||
          wallet?.name ||
          wallet?.customer_name ||
          wallet?.passenger_name ||
          me?.user_name ||
          me?.full_name ||
          me?.name ||
          me?.customer_name ||
          me?.passenger_name ||
          me?.user?.user_name ||
          me?.user?.full_name ||
          me?.user?.name ||
          me?.data?.user_name ||
          me?.data?.full_name ||
          me?.data?.name ||
          `${me?.first_name || ""} ${me?.last_name || ""}`.trim() ||
          "Wallet User";

        const resolvedUserId =
          passedUserId ||
          wallet?.user_id ||
          wallet?.customer_id ||
          wallet?.passenger_id ||
          me?.user_id ||
          me?.id ||
          me?.customer_id ||
          me?.passenger_id ||
          me?.user?.user_id ||
          me?.user?.id ||
          me?.data?.user_id ||
          me?.data?.id ||
          null;

        setUserName(resolvedName);
        setUserId(resolvedUserId);
      } catch {
        if (alive) {
          setUserName(
            passedUserName ||
              wallet?.user_name ||
              wallet?.full_name ||
              wallet?.name ||
              "Wallet User",
          );
          setUserId(passedUserId || wallet?.user_id || null);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [passedUserName, passedUserId, wallet]);

  const qrValue = useMemo(() => {
    if (!wallet?.wallet_id) return "";
    try {
      return JSON.stringify({
        kind: "user_wallet",
        walletId: wallet.wallet_id,
        userName,
        userId,
      });
    } catch {
      return "";
    }
  }, [wallet?.wallet_id, userName, userId]);

  const downloadQR = useCallback(async () => {
    setSaving(true);
    try {
      const uri = await captureRef(posterRef, { format: "png", quality: 1 });
      await MediaLibrary.saveToLibraryAsync(uri);
      showAlert({
        type: "success",
        title: "Saved!",
        message: "Your QR poster has been saved to your photo library.",
        primaryLabel: "OK",
      });
    } catch (e) {
      const msg = e?.message || "";
      if (
        msg.toLowerCase().includes("permission") ||
        msg.toLowerCase().includes("denied")
      ) {
        showAlert({
          type: "warn",
          title: "Permission required",
          message:
            "Please allow photo library access in Settings to save your QR.",
          primaryLabel: "OK",
        });
      } else {
        showAlert({
          type: "error",
          title: "Save failed",
          message: "Could not save your QR. Please try again.",
          primaryLabel: "OK",
        });
      }
    } finally {
      setSaving(false);
    }
  }, [showAlert]);

  if (!wallet?.wallet_id) {
    return (
      <View style={styles.center}>
        <StatusBar
          translucent
          backgroundColor="transparent"
          barStyle="dark-content"
        />
        <Ionicons name="wallet-outline" size={40} color="#94A3B8" />
        <Text style={styles.centerTitle}>Wallet not available</Text>
        <Text style={styles.centerSub}>Please open your wallet again.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <StatusBar
          translucent
          backgroundColor="transparent"
          barStyle="dark-content"
        />
        <ActivityIndicator size="large" color={T.brand} />
        <Text style={styles.centerTitle}>Preparing your QR…</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="light-content"
      />

      {/* ── Header ── */}
      <LinearGradient
        colors={T.gradHeader}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + 12 }]}
      >
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => {
            try {
              nav.goBack();
            } catch {}
          }}
        >
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My QR Code</Text>
        <View style={{ width: 38 }} />
      </LinearGradient>

      {/* ── Body ── */}
      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* posterRef — no overflow:hidden, prevents partial capture on Android */}
        <View ref={posterRef} collapsable={false} style={styles.poster}>
          {/* Brand row inside captured area */}
          <View style={styles.posterBrandRow}>
            <Image
              source={require("../../assets/logo_v2_real.png")}
              style={styles.posterLogo}
            />
            <View>
              <Text style={styles.posterBrand}>TàbDey</Text>
              <Text style={styles.posterTagline}>Digital Wallet</Text>
            </View>
          </View>

          <Text style={styles.posterInstruction}>Scan to pay</Text>

          {/* QR code */}
          <View style={styles.qrBox}>
            {qrValue ? (
              <QRCode
                value={qrValue}
                size={220}
                backgroundColor="#ffffff"
                color="#111827"
                logo={{ uri: LOGO_URI }}
                logoSize={44}
                logoMargin={4}
                logoBorderRadius={10}
                logoBackgroundColor="#ffffff"
              />
            ) : (
              <Text style={{ color: T.sub }}>QR data not available</Text>
            )}
          </View>

          {/* Name + ID */}
          <Text style={styles.posterName}>{userName}</Text>
          <View style={styles.posterIdRow}>
            <Ionicons name="card-outline" size={13} color="#94A3B8" />
            <Text style={styles.posterId}>{wallet.wallet_id}</Text>
          </View>

          <Text style={styles.posterFooterText}>www.tabdey.com</Text>
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Save button */}
        <TouchableOpacity
          onPress={downloadQR}
          disabled={saving}
          activeOpacity={0.85}
          style={[styles.saveBtn, saving && { opacity: 0.55 }]}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Ionicons name="download-outline" size={18} color="#fff" />
          )}
          <Text style={styles.saveBtnText}>
            {saving ? "Saving…" : "Save to Gallery"}
          </Text>
        </TouchableOpacity>

        <Text style={styles.hint}>
          Saves as a high-res image to your photo library
        </Text>
      </ScrollView>
      {alertNode}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "#fff" },
  center: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 6,
  },
  centerTitle: {
    color: "#1E293B",
    fontWeight: "700",
    fontSize: 15,
    marginTop: 8,
  },
  centerSub: { color: "#64748B", fontSize: 13, textAlign: "center" },

  /* header */
  header: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "800" },

  /* body */
  body: { paddingHorizontal: 24, paddingTop: 36, alignItems: "center" },

  /* captured poster — no shadow, no border, no overflow:hidden */
  poster: {
    width: "100%",
    backgroundColor: "#fff",
    alignItems: "center",
    padding: 28,
  },

  posterBrandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 28,
    alignSelf: "flex-start",
  },
  posterLogo: { width: 36, height: 36, borderRadius: 10 },
  posterBrand: { color: "#0F172A", fontSize: 15, fontWeight: "900" },
  posterTagline: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 1,
  },

  posterInstruction: {
    fontSize: 11,
    fontWeight: "700",
    color: "#94A3B8",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 20,
  },

  qrBox: { backgroundColor: "#fff" },

  posterName: {
    marginTop: 22,
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: 0.5,
    textAlign: "center",
  },
  posterIdRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 6,
  },
  posterId: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  posterFooterText: {
    marginTop: 20,
    color: "#CBD5E1",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1,
  },

  divider: {
    width: "100%",
    height: 1,
    backgroundColor: "#F1F5F9",
    marginTop: 32,
    marginBottom: 24,
  },

  /* save button */
  saveBtn: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: T.brand,
    borderRadius: 16,
    paddingVertical: 15,
  },
  saveBtnText: { fontSize: 15, fontWeight: "800", color: "#fff" },
  hint: { marginTop: 12, fontSize: 12, color: "#CBD5E1", textAlign: "center" },
});
