import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  Alert,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
  SafeAreaView,
  TouchableWithoutFeedback,
  Keyboard,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useNavigation } from "@react-navigation/native";

/* ──────────────────────────────────────────
   Constants (presets shown as chips)
─────────────────────────────────────────── */
const NONFOOD_PRESETS = [
  "Groceries",
  "Alcohol",
  "Flowers & gifts",
  "Drug Store",
  "Pets",
  "Convenience",
];

/* ──────────────────────────────────────────
   Utilities
─────────────────────────────────────────── */
const currency = (n) =>
  isNaN(Number(n)) ? "" : String(Number(n)).replace(/(\.\d{0,2}).*$/, "$1");

const uid = () =>
  Math.random().toString(36).slice(2) + Date.now().toString(36);

/* ──────────────────────────────────────────
   Reusable UI
─────────────────────────────────────────── */
function ImageThumb({ uri, onPick, onRemove, size = 64 }) {
  return (
    <View style={[styles.thumbWrap, { width: size, height: size }]}>
      {uri ? (
        <>
          <Image
            source={{ uri }}
            style={{ width: "100%", height: "100%", borderRadius: 12 }}
          />
          <TouchableOpacity onPress={onRemove} style={styles.thumbRemove}>
            <Text style={styles.thumbRemoveTxt}>×</Text>
          </TouchableOpacity>
        </>
      ) : (
        <TouchableOpacity style={styles.thumbEmpty} onPress={onPick}>
          <Text style={styles.thumbEmptyTxt}>Add{"\n"}Image</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function InputBox({
  value,
  onChangeText,
  placeholder,
  keyboardType,
  onFocus,
  onBlur,
  isFocused,
  style,
}) {
  return (
    <View
      style={[
        styles.inputWrapper,
        { borderColor: isFocused ? "#00b14f" : "#ccc" },
        style,
      ]}
    >
      <TextInput
        style={styles.inputField}
        placeholder={placeholder}
        placeholderTextColor="#9aa0a6"
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        onFocus={onFocus}
        onBlur={onBlur}
      />
    </View>
  );
}

function NFRow({ item, onChange, onRemove }) {
  const [focusName, setFocusName] = useState(false);
  const [focusDesc, setFocusDesc] = useState(false);
  const [focusPrice, setFocusPrice] = useState(false);

  const [preset, setPreset] = useState("");
  const [showAllPresets, setShowAllPresets] = useState(true);

  return (
    <View style={styles.cardRow}>
      <ImageThumb
        uri={item.imageUri}
        onPick={() => onChange({ ...item }, "image")}
        onRemove={() => onChange({ ...item, imageUri: null })}
        size={64}
      />

      <View style={{ flex: 1, marginLeft: 12 }}>
        {showAllPresets ? (
          <View style={[styles.chipsRow, { marginBottom: 10 }]}>
            {NONFOOD_PRESETS.map((p) => {
              const active = preset === p;
              return (
                <TouchableOpacity
                  key={p}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => {
                    setPreset(p);
                    setShowAllPresets(false);
                    onChange({ ...item, name: p });
                  }}
                  activeOpacity={0.9}
                >
                  <Text
                    style={[styles.chipText, active && styles.chipTextActive]}
                    numberOfLines={1}
                  >
                    {p}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <View style={[styles.chipsRow, { marginBottom: 10 }]}>
            <View style={[styles.chip, styles.chipActive]}>
              <Text style={[styles.chipText, styles.chipTextActive]}>{preset}</Text>
            </View>
            <TouchableOpacity
              style={styles.changeChipBtn}
              onPress={() => setShowAllPresets(true)}
            >
              <Text style={styles.changeChipText}>Change</Text>
            </TouchableOpacity>
          </View>
        )}

        <InputBox
          placeholder="Name (e.g., Basic Haircut)"
          value={item.name}
          onChangeText={(t) => onChange({ ...item, name: t })}
          onFocus={() => setFocusName(true)}
          onBlur={() => setFocusName(false)}
          isFocused={focusName}
        />

        <InputBox
          placeholder="Description (optional)"
          value={item.description}
          onChangeText={(t) => onChange({ ...item, description: t })}
          onFocus={() => setFocusDesc(true)}
          onBlur={() => setFocusDesc(false)}
          isFocused={focusDesc}
          style={{ marginTop: 10 }}
        />

        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10 }}>
          <Text style={styles.pricePrefix}>Nu.</Text>
          <InputBox
            placeholder="Price"
            keyboardType="decimal-pad"
            value={item.price}
            onChangeText={(t) => onChange({ ...item, price: currency(t) })}
            onFocus={() => setFocusPrice(true)}
            onBlur={() => setFocusPrice(false)}
            isFocused={focusPrice}
            style={{ flex: 1, marginLeft: 8 }}
          />
        </View>
      </View>

      <TouchableOpacity onPress={onRemove} style={styles.removeBtn}>
        <Text style={styles.removeTxt}>Delete</Text>
      </TouchableOpacity>
    </View>
  );
}

/* ──────────────────────────────────────────
   Screen
─────────────────────────────────────────── */
export default function MartServiceSetupScreen() {
  const navigation = useNavigation();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  const [nfItems, setNfItems] = useState([
    { id: uid(), name: "", description: "", price: "", imageUri: null },
  ]);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener("keyboardDidHide", () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "We need gallery access to pick images.");
      return null;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      allowsEditing: true,
      aspect: [4, 3],
      base64: false,
    });
    if (result.canceled) return null;
    return result.assets?.[0]?.uri ?? null;
  };

  const onNFRowChange = async (row, field) => {
    if (field === "image") {
      const uri = await pickImage();
      if (!uri) return;
      setNfItems((prev) => prev.map((x) => (x.id === row.id ? { ...x, imageUri: uri } : x)));
    } else {
      setNfItems((prev) => prev.map((x) => (x.id === row.id ? row : x)));
    }
  };

  const addNFRow = () =>
    setNfItems((p) => [
      ...p,
      { id: uid(), name: "", description: "", price: "", imageUri: null },
    ]);

  const removeNFRow = (id) => setNfItems((p) => p.filter((x) => x.id !== id));

  const validateNonFood = () => {
    for (const r of nfItems) {
      if (!r.name.trim()) return "Each product/service must have a name.";
      if (r.price && isNaN(Number(r.price))) return "Price must be a valid number.";
    }
    return null;
  };

  const handleSave = async () => {
    const error = validateNonFood();
    if (error) {
      Alert.alert("Fix required", error);
      return;
    }
    try {
      setSaving(true);
      // TODO: call your API with { type: "nonfood", items: nfItems }
      await new Promise((r) => setTimeout(r, 600));
      Alert.alert("Saved", "Your products/services have been saved.");
      navigation.navigate("NextStep");
    } catch (e) {
      Alert.alert("Error", "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = () => navigation.navigate("NextStep");

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={{ flex: 1 }}>
            <ScrollView
              contentContainerStyle={[
                styles.scrollContainer,
                { paddingBottom: keyboardVisible ? 10 : 100 },
              ]}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.inner}>
                <Text style={styles.title}>Service Setup (Non‑Food)</Text>
                <Text style={styles.subtitle}>
                  Pick a preset (optional), then edit the name, description, price, and image.
                </Text>

                {nfItems.map((row) => (
                  <NFRow
                    key={row.id}
                    item={row}
                    onChange={(next, field) => onNFRowChange(next, field)}
                    onRemove={() => removeNFRow(row.id)}
                  />
                ))}

                <TouchableOpacity style={styles.addBtn} onPress={addNFRow}>
                  <Text style={styles.addTxt}>+ Add product / service</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>

            <View style={styles.bottomSticky}>
              <TouchableOpacity onPress={handleSkip} style={styles.skipInline}>
                <Text style={styles.skipInlineTxt}>Skip & set up later</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSave}
                disabled={saving}
                style={saving ? styles.continueButtonDisabled : styles.continueButton}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.continueButtonText}>Save & Continue</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* ──────────────────────────────────────────
   Styles — identical look/feel to Food screen
─────────────────────────────────────────── */
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  container: { flex: 1, paddingTop: Platform.OS === "android" ? 40 : 0 },
  scrollContainer: { paddingHorizontal: 20, paddingVertical: 20 },
  inner: { flex: 1 },

  title: { fontSize: 22, fontWeight: "bold", color: "#1A1D1F", marginBottom: 8 },
  subtitle: { fontSize: 14, color: "#666", marginBottom: 24 },

  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d0d5dd",
    backgroundColor: "#fff",
  },
  chipActive: { backgroundColor: "#12b76a22", borderColor: "#12b76a" },
  chipText: { fontSize: 13, color: "#1f2937" },
  chipTextActive: { fontSize: 13, fontWeight: "700", color: "#067647" },
  changeChipBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d0d5dd",
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
  changeChipText: { fontSize: 13, fontWeight: "600", color: "#1f2937" },

  cardRow: {
    backgroundColor: "#fff",
    borderRadius: 15,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    flexDirection: "row",
    alignItems: "flex-start",
  },

  sectionTitle: { fontWeight: "700", fontSize: 16, color: "#1a1d1f" },
  itemTitle: { fontWeight: "600", color: "#1a1d1f" },

  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 10,
    height: 50,
    backgroundColor: "#fff",
  },
  inputField: { flex: 1, fontSize: 14, paddingVertical: 10, color: "#1a1d1f" },

  pricePrefix: { fontWeight: "700", color: "#1a1d1f" },

  addBtn: {
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 4,
  },
  addTxt: { fontWeight: "700", color: "#1f2937" },

  removeBtn: {
    marginLeft: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#fff1f0",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ffd4cf",
    height: 34,
    alignSelf: "flex-start",
  },
  removeTxt: { color: "#c0392b", fontWeight: "700" },

  thumbWrap: {
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  thumbEmpty: { alignItems: "center", justifyContent: "center", padding: 6 },
  thumbEmptyTxt: { fontSize: 11, textAlign: "center", color: "#6b7280", fontWeight: "600" },
  thumbRemove: {
    position: "absolute",
    top: -10,
    right: -10,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ff6b6b",
    elevation: 2,
  },
  thumbRemoveTxt: { color: "#fff", fontWeight: "900" },

  bottomSticky: {
    padding: 24,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  skipInline: { alignItems: "center", marginBottom: 10 },
  skipInlineTxt: { color: "#1a1d1f", fontWeight: "600", opacity: 0.7 },
  continueButton: {
    backgroundColor: "#00b14f",
    paddingVertical: 14,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    marginBottom: 6,
    elevation: 15,
  },
  continueButtonDisabled: {
    backgroundColor: "#c7e8d4",
    paddingVertical: 14,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  continueButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
