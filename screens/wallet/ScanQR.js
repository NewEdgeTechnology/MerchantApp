// services/wallet/ScanQR.js
import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

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

/* ========= helper: parse QR payload ========= */
function parseQrPayload(raw) {
  const out = { raw, type: "text" };

  if (!raw || typeof raw !== "string") return out;

  const trimmed = raw.trim();

  // Try JSON first
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const json = JSON.parse(trimmed);
      return {
        ...out,
        ...json,
        type: "json",
      };
    } catch {
      // ignore
    }
  }

  // URL pattern
  if (/^https?:\/\//i.test(trimmed)) {
    return {
      ...out,
      url: trimmed,
      type: "url",
    };
  }

  return out;
}

export default function ScanQRScreen() {
  const nav = useNavigation();
  const route = useRoute();
  const wallet = route?.params?.wallet || null;

  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  const handleBarCodeScanned = useCallback(
    ({ type, data }) => {
      if (scanned) return; // prevent double navigation
      setScanned(true);

      console.log("[ScanQR] type:", type, "data:", data);

      const parsedPayload = parseQrPayload(data);

      try {
        nav.navigate("WalletTransfer", {
          wallet,
          qrPayload: parsedPayload,
        });
      } catch (e) {
        console.log("[ScanQR] navigate WalletTransfer error:", e?.message || e);
        Alert.alert("Scanned", parsedPayload.raw || "QR scanned successfully.");
        // allow another try if navigation failed
        setScanned(false);
      }
    },
    [scanned, nav, wallet]
  );

  const goBack = () => {
    try {
      nav.goBack();
    } catch {}
  };

  /* ===== Permission states ===== */

  // Still loading permission object
  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={G.grab} />
        <Text style={styles.centerText}>Checking camera permission…</Text>
      </View>
    );
  }

  // Not granted yet
  if (!permission.granted) {
    return (
      <View style={styles.wrap}>
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
            <Text style={styles.headerTitle}>Scan to Pay</Text>
            <View style={{ width: 32 }} />
          </View>
          <Text style={styles.headerSub}>
            We need your permission to access the camera to scan QR codes.
          </Text>
        </LinearGradient>

        <View style={styles.body}>
          <View style={styles.bottomCard}>
            <Text style={styles.bottomTitle}>Camera permission required</Text>
            <Text style={styles.bottomSub}>
              Allow camera access so you can scan merchant QR codes and pay
              directly from your wallet.
            </Text>

            <TouchableOpacity
              style={[styles.btnPrimary, { marginTop: 16 }]}
              onPress={requestPermission}
            >
              <Text style={styles.btnPrimaryText}>Grant Permission</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  /* ===== Main scanner ===== */

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
          <Text style={styles.headerTitle}>Scan to Pay</Text>
          <View style={{ width: 32 }} />
        </View>
        <Text style={styles.headerSub}>
          Align the QR code within the frame to pay with your wallet.
        </Text>
      </LinearGradient>

      {/* Scanner area */}
      <View style={styles.body}>
        <View style={styles.scannerWrap}>
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: ["qr"],
            }}
            onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          />

          {/* Overlay / mask */}
          <View style={styles.overlay}>
            <View className="overlayRow" style={styles.overlayRow}>
              <View style={styles.overlaySide} />
              <View style={styles.scanBox}>
                {/* Corner decorations */}
                <View style={[styles.corner, styles.cornerTL]} />
                <View style={[styles.corner, styles.cornerTR]} />
                <View style={[styles.corner, styles.cornerBL]} />
                <View style={[styles.corner, styles.cornerBR]} />
              </View>
              <View style={styles.overlaySide} />
            </View>
            <View style={styles.overlayBottom} />
          </View>
        </View>

        {/* Bottom sheet with info */}
        <View style={styles.bottomCard}>
          <Text style={styles.bottomTitle}>Ready to scan</Text>
          <Text style={styles.bottomSub}>
            As soon as a QR code is detected, we&apos;ll open the transfer
            screen with the details filled in for you.
          </Text>

          <TouchableOpacity
            style={[styles.helperRow]}
            activeOpacity={0.75}
            onPress={() => {
              Alert.alert(
                "How Scan to Pay works",
                "The QR code contains payment details such as wallet ID, name, and sometimes amount or note. After scanning, we auto-fill the transfer screen so you can just confirm and pay."
              );
            }}
          >
            <Ionicons
              name="information-circle-outline"
              size={18}
              color={G.sub}
            />
            <Text style={styles.helperText}>How does this work?</Text>
          </TouchableOpacity>
        </View>
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

  scannerWrap: {
    flex: 0.5,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#000",
  },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  overlayRow: {
    flexDirection: "row",
    alignItems: "center",
    height: "100%",
  },
  overlaySide: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  scanBox: {
    width: "70%",
    aspectRatio: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    overflow: "hidden",
  },
  overlayBottom: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  corner: {
    position: "absolute",
    width: 24,
    height: 24,
    borderColor: "#fff",
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderLeftWidth: 3,
    borderTopWidth: 3,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderRightWidth: 3,
    borderTopWidth: 3,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderLeftWidth: 3,
    borderBottomWidth: 3,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderRightWidth: 3,
    borderBottomWidth: 3,
  },

  bottomCard: {
    marginTop: 16,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: G.line,
  },
  bottomTitle: {
    color: G.slate,
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 4,
  },
  bottomSub: {
    color: "#64748B",
    fontSize: 13,
  },
  amountText: {
    marginTop: 8,
    color: G.ok,
    fontWeight: "800",
    fontSize: 16,
  },
  noteText: {
    marginTop: 4,
    color: "#6B7280",
  },
  bottomBtnsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
  },
  btnPrimary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: G.grab,
  },
  btnPrimaryText: {
    color: G.white,
    fontWeight: "800",
  },
  btnSecondary: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: G.line,
    backgroundColor: "#F9FAFB",
  },
  btnSecondaryText: {
    color: G.slate,
    fontWeight: "700",
  },
  helperRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  helperText: {
    marginLeft: 6,
    color: G.sub,
    fontSize: 12,
    fontWeight: "600",
  },
});
