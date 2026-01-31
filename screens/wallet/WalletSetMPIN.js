import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import * as SecureStore from "expo-secure-store";

const G = {
  grab: "#00B14F",
  grab2: "#00C853",
  text: "#0F172A",
  sub: "#6B7280",
  bg: "#F6F7F9",
  line: "#E5E7EB",
  danger: "#EF4444",
  white: "#ffffff",
};

const mpinKeyForWallet = (walletId) => {
  const raw = String(walletId || "default");
  const safe = raw.replace(/[^A-Za-z0-9._-]/g, "_"); // replace *, :, etc. with "_"
  return `wallet_mpin_${safe}`;
};

export default function WalletSetMPIN() {
  const nav = useNavigation();
  const route = useRoute();

  const userId = route?.params?.user_id;
  const walletId = route?.params?.wallet_id;

  const [existingMpin, setExistingMpin] = useState(null); // if present, we can show "Change MPIN" later
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!walletId) return;
        const stored = await SecureStore.getItemAsync(mpinKeyForWallet(walletId));
        if (alive && stored) {
          setExistingMpin(stored);
        }
      } catch (e) {
        // ignore
      }
    })();
    return () => {
      alive = false;
    };
  }, [walletId]);

  const onChangePin = (val) => {
    const clean = (val || "").replace(/[^0-9]/g, "").slice(0, 4);
    setPin(clean);
  };

  const onChangePin2 = (val) => {
    const clean = (val || "").replace(/[^0-9]/g, "").slice(0, 4);
    setPin2(clean);
  };

  const canSubmit = pin.length === 4 && pin2.length === 4 && pin === pin2;

  const handleSave = async () => {
    if (!walletId) {
      Alert.alert("Error", "Wallet ID missing. Please reopen your wallet.");
      return;
    }
    if (!canSubmit) {
      Alert.alert("Invalid MPIN", "Please enter and confirm a 4-digit MPIN.");
      return;
    }

    setLoading(true);
    try {
      // === Local secure save ===
      // If later you create a backend API for MPIN,
      // replace this block with a fetch() call and keep SecureStore as cache.
      await SecureStore.setItemAsync(mpinKeyForWallet(walletId), pin);

      Alert.alert(
        "MPIN set",
        existingMpin
          ? "Your wallet MPIN has been updated."
          : "Your wallet MPIN has been created.",
        [
          {
            text: "OK",
            onPress: () => {
              // Go back to wallet screen
              try {
                nav.goBack();
              } catch {}
            },
          },
        ]
      );
    } catch (e) {
      Alert.alert("Failed", e?.message || "Could not save MPIN.");
    } finally {
      setLoading(false);
    }
  };

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
            style={styles.backBtn}
            onPress={() => {
              try {
                nav.goBack();
              } catch {}
            }}
          >
            <Ionicons name="chevron-back" size={22} color={G.white} />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>
            {existingMpin ? "Change Wallet MPIN" : "Set Wallet MPIN"}
          </Text>

          <View style={{ width: 32 }} />
        </View>
      </LinearGradient>

      <View style={styles.body}>
        <View style={styles.card}>
          <Ionicons name="keypad-outline" size={32} color={G.grab} />
          <Text style={styles.title}>
            {existingMpin ? "Update your wallet MPIN" : "Create your wallet MPIN"}
          </Text>
          <Text style={styles.sub}>
            This 4-digit MPIN will be used to access your wallet information on
            this device when biometrics are not available.
          </Text>

          <View style={{ marginTop: 16, width: "100%" }}>
            <Text style={styles.label}>New MPIN</Text>
            <TextInput
              value={pin}
              onChangeText={onChangePin}
              keyboardType="number-pad"
              maxLength={4}
              secureTextEntry
              style={styles.input}
              placeholder="••••"
              placeholderTextColor="#CBD5E1"
            />
          </View>

          <View style={{ marginTop: 12, width: "100%" }}>
            <Text style={styles.label}>Confirm MPIN</Text>
            <TextInput
              value={pin2}
              onChangeText={onChangePin2}
              keyboardType="number-pad"
              maxLength={4}
              secureTextEntry
              style={styles.input}
              placeholder="••••"
              placeholderTextColor="#CBD5E1"
            />
          </View>

          {pin2.length === 4 && pin !== pin2 && (
            <Text style={styles.errorText}>MPIN does not match.</Text>
          )}

          <TouchableOpacity
            style={[styles.btn, !canSubmit || loading ? styles.btnDisabled : null]}
            onPress={handleSave}
            disabled={!canSubmit || loading}
            activeOpacity={0.9}
          >
            {loading ? (
              <ActivityIndicator size="small" color={G.white} />
            ) : (
              <Text style={styles.btnText}>
                {existingMpin ? "Update MPIN" : "Save MPIN"}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.infoFoot}>
          Do not share your MPIN with anyone. You can change it anytime from
          wallet settings.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: G.bg },
  gradientHeader: {
    paddingTop: Platform.OS === "android" ? 36 : 56,
    paddingHorizontal: 16,
    paddingBottom: 12,
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
  },
  headerTitle: { color: G.white, fontSize: 18, fontWeight: "800" },

  body: {
    flex: 1,
    padding: 16,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: G.line,
    alignItems: "center",
  },
  title: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: "800",
    color: G.text,
    textAlign: "center",
  },
  sub: {
    marginTop: 6,
    fontSize: 13,
    color: G.sub,
    textAlign: "center",
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: G.text,
    marginBottom: 4,
  },
  input: {
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
  },
  errorText: {
    marginTop: 6,
    color: G.danger,
    fontSize: 12,
    fontWeight: "600",
    alignSelf: "flex-start",
  },
  btn: {
    marginTop: 18,
    backgroundColor: G.grab,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 999,
    alignItems: "center",
    alignSelf: "stretch",
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnText: {
    color: G.white,
    fontWeight: "800",
    fontSize: 15,
  },
  infoFoot: {
    marginTop: 12,
    fontSize: 12,
    color: G.sub,
    textAlign: "center",
  },
});
