// services/wallet/WalletTransferSuccess.js
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Share,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";

const G = {
  grab: "#00B14F",
  grab2: "#00C853",
  text: "#0F172A",
  sub: "#6B7280",
  bg: "#F6F7F9",
  line: "#E5E7EB",
  white: "#ffffff",
};

function fmtDateTime(ts) {
  if (!ts) return "-";
  const d = new Date(ts);
  const date = d.toLocaleDateString("en-US", {
    timeZone: "Asia/Thimphu",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const time = d.toLocaleTimeString("en-US", {
    timeZone: "Asia/Thimphu",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date} · ${time}`;
}

function currency(n) {
  return `BTN. ${Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function WalletTransferSuccess() {
  const nav = useNavigation();
  const route = useRoute();

  const {
    amount = 0,
    senderWalletId = "",
    recipientWalletId = "",
    recipientName = "",
    journalCode = "",
    transactionId = "",
    note = "Transfer",
    createdAt = null, // ISO or "2025-11-25 12:20:15"
  } = route?.params || {};

  const handleDone = () => {
    try {
      nav.goBack();
    } catch {}
  };

  const handleShare = async () => {
    try {
      const msgLines = [
        "Wallet Transfer Receipt",
        "----------------------",
        `Status       : SUCCESS`,
        `Amount       : ${currency(amount)}`,
        `From Wallet  : ${senderWalletId || "-"}`,
        `To Wallet    : ${recipientWalletId || "-"}`,
        recipientName ? `Recipient    : ${recipientName}` : null,
        journalCode ? `Journal No   : ${journalCode}` : null,
        transactionId ? `Txn ID       : ${transactionId}` : null,
        `Date & Time  : ${fmtDateTime(createdAt)}`,
        note ? `Note         : ${note}` : null,
      ].filter(Boolean);

      await Share.share({
        message: msgLines.join("\n"),
      });
    } catch (e) {
      // ignore
    }
  };

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
          <TouchableOpacity
            onPress={handleDone}
            style={styles.backBtn}
            activeOpacity={0.8}
          >
            <Ionicons name="chevron-back" size={22} color={G.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Transfer Successful</Text>
          <View style={{ width: 32 }} />
        </View>
      </LinearGradient>

      {/* Body / Receipt */}
      <View style={styles.cardWrap}>
        <View style={styles.statusIconWrap}>
          <View style={styles.statusCircleOuter}>
            <View style={styles.statusCircleInner}>
              <Ionicons name="checkmark" size={32} color={G.white} />
            </View>
          </View>
          <Text style={styles.statusText}>Money Sent</Text>
          <Text style={styles.statusSub}>
            You&apos;ve successfully transferred money.
          </Text>
        </View>

        <Text style={styles.amountText}>{currency(amount)}</Text>

        <View style={styles.divider} />

        {/* Details */}
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>From</Text>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.detailValue}>{senderWalletId || "-"}</Text>
            <Text style={styles.detailHint}>Your Wallet</Text>
          </View>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>To</Text>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.detailValue}>{recipientWalletId || "-"}</Text>
            {recipientName ? (
              <Text style={styles.detailHint}>{recipientName}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Status</Text>
          <View style={styles.statusPill}>
            <View style={styles.statusDot} />
            <Text style={styles.statusPillText}>Success</Text>
          </View>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Date & Time</Text>
          <Text style={styles.detailValue}>{fmtDateTime(createdAt)}</Text>
        </View>

        {journalCode ? (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Journal No.</Text>
            <Text style={styles.detailValue}>{journalCode}</Text>
          </View>
        ) : null}

        {transactionId ? (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Transaction ID</Text>
            <Text style={styles.detailValue}>{transactionId}</Text>
          </View>
        ) : null}

        {note ? (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Note</Text>
            <Text style={styles.detailValue}>{note}</Text>
          </View>
        ) : null}
      </View>

      {/* Bottom buttons */}
      <View style={styles.bottomActions}>
        <TouchableOpacity
          style={[styles.bottomBtn, styles.bottomBtnGhost]}
          onPress={handleShare}
          activeOpacity={0.9}
        >
          <Ionicons name="share-social-outline" size={18} color={G.grab} />
          <Text style={styles.bottomBtnGhostText}>Share Receipt</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.bottomBtn, styles.bottomBtnPrimary]}
          onPress={handleDone}
          activeOpacity={0.9}
        >
          <Text style={styles.bottomBtnPrimaryText}>Done</Text>
        </TouchableOpacity>
      </View>
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
    paddingBottom: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.1)",
  },
  headerTitle: {
    color: G.white,
    fontSize: 18,
    fontWeight: "800",
  },

  cardWrap: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: G.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: G.line,
    padding: 18,
  },

  statusIconWrap: {
    alignItems: "center",
    marginBottom: 12,
  },
  statusCircleOuter: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "rgba(16,185,129,0.18)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  statusCircleInner: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: G.grab,
    alignItems: "center",
    justifyContent: "center",
  },
  statusText: {
    fontSize: 16,
    fontWeight: "800",
    color: G.text,
  },
  statusSub: {
    fontSize: 12,
    color: G.sub,
    marginTop: 2,
  },

  amountText: {
    textAlign: "center",
    fontSize: 24,
    fontWeight: "900",
    color: G.text,
    marginBottom: 8,
  },

  divider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginVertical: 10,
  },

  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginVertical: 4,
  },
  detailLabel: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "600",
  },
  detailValue: {
    fontSize: 13,
    color: G.text,
    fontWeight: "700",
  },
  detailHint: {
    fontSize: 11,
    color: "#9CA3AF",
    marginTop: 2,
  },

  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ECFDF5",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: G.ok,
    marginRight: 6,
  },
  statusPillText: {
    fontSize: 11,
    color: G.ok,
    fontWeight: "700",
  },

  bottomActions: {
    marginTop: "auto",
    paddingHorizontal: 16,
    paddingBottom: 20,
    flexDirection: "row",
    gap: 10,
  },
  bottomBtn: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  bottomBtnGhost: {
    borderWidth: 1,
    borderColor: G.grab,
    backgroundColor: "transparent",
  },
  bottomBtnGhostText: {
    color: G.grab,
    fontWeight: "800",
    fontSize: 13,
  },
  bottomBtnPrimary: {
    backgroundColor: G.grab,
  },
  bottomBtnPrimaryText: {
    color: G.white,
    fontWeight: "800",
    fontSize: 14,
  },
});
