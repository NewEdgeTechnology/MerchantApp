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
   Constants
─────────────────────────────────────────── */
const FOOD_CATEGORIES = [
  "Halal",
  "Fast Food",
  "Chinese",
  "Local & Malaysian",
  "Drinks & Beverages",
  "Noodles",
  "Western",
  "Coffee & Tea",
  "Sea Food",
  "Breakfast & Brunch",
  "Dessert",
  "Burgers",
  "Bubble tea",
  "Healthy",
  "Snack",
  "Pasta",
  "Japanese",
  "Indian",
  "Bakery& Cake",
  "Salad",
  "Hawker",
  "Pizza",
  "Thai",
  "BBQ & Grill",
  "Vegetarian Friendly",
  "Bento and zi Char",
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

function FoodItemCard({ item, onChange, onRemove }) {
  const [focusName, setFocusName] = useState(false);
  const [focusDesc, setFocusDesc] = useState(false);
  const [focusPrice, setFocusPrice] = useState(false);

  return (
    <View style={styles.itemCard}>
      <View style={styles.cardHeaderRow}>
        <Text style={styles.itemTitle}>Menu Item</Text>
        <TouchableOpacity onPress={onRemove}>
          <Text style={styles.removeTxt}>Remove</Text>
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <ImageThumb
          uri={item.imageUri}
          onPick={() => onChange({ ...item }, "image")}
          onRemove={() => onChange({ ...item, imageUri: null })}
          size={64}
        />

        <View style={{ flex: 1, marginLeft: 12 }}>
          <InputBox
            placeholder="Name (e.g., Iced Latte)"
            value={item.name}
            onChangeText={(t) => onChange({ ...item, name: t })}
            onFocus={() => setFocusName(true)}
            onBlur={() => setFocusName(false)}
            isFocused={focusName}
          />

          <InputBox
            placeholder="Description"
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
      </View>
    </View>
  );
}

function CategoryCard({
  category,
  onChangeCategory,
  onRemoveCategory,
  onAddItem,
  onItemChange,
  onRemoveItem,
}) {
  const [showAll, setShowAll] = useState(!category.name);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <Text style={styles.sectionTitle}>Category</Text>
        <TouchableOpacity onPress={onRemoveCategory}>
          <Text style={styles.removeTxt}>Remove</Text>
        </TouchableOpacity>
      </View>

      {showAll ? (
        <View style={[styles.chipsRow, { marginTop: 10 }]}>
          {FOOD_CATEGORIES.map((c) => {
            const active = category.name === c;
            return (
              <TouchableOpacity
                key={c}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => {
                  onChangeCategory({ ...category, name: c });
                  setShowAll(false);
                }}
                activeOpacity={0.9}
              >
                <Text
                  style={[styles.chipText, active && styles.chipTextActive]}
                  numberOfLines={1}
                >
                  {c}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : (
        <View style={[styles.chipsRow, { marginTop: 10 }]}>
          <View style={[styles.chip, styles.chipActive]}>
            <Text style={[styles.chipText, styles.chipTextActive]}>
              {category.name}
            </Text>
          </View>
          <TouchableOpacity style={styles.changeChipBtn} onPress={() => setShowAll(true)}>
            <Text style={styles.changeChipText}>Change</Text>
          </TouchableOpacity>
        </View>
      )}

      {category.items.map((it) => (
        <FoodItemCard
          key={it.id}
          item={it}
          onChange={(next, field) => onItemChange(next, field)}
          onRemove={() => onRemoveItem(it.id)}
        />
      ))}

      <TouchableOpacity style={styles.addTiny} onPress={onAddItem}>
        <Text style={styles.addTinyTxt}>+ Add item</Text>
      </TouchableOpacity>
    </View>
  );
}

/* ──────────────────────────────────────────
   Screen
─────────────────────────────────────────── */
export default function FoodMenuSetupScreen() {
  const navigation = useNavigation();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  const [categories, setCategories] = useState([
    { id: uid(), name: "Drinks", items: [] },
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

  const onFoodItemChange = async (catId, item, field) => {
    if (field === "image") {
      const uri = await pickImage();
      if (!uri) return;
      setCategories((prev) =>
        prev.map((c) =>
          c.id === catId
            ? {
                ...c,
                items: c.items.map((it) =>
                  it.id === item.id ? { ...it, imageUri: uri } : it
                ),
              }
            : c
        )
      );
      return;
    }
    setCategories((prev) =>
      prev.map((c) =>
        c.id === catId
          ? { ...c, items: c.items.map((it) => (it.id === item.id ? item : it)) }
          : c
      )
    );
  };

  const onCategoryChange = (next) =>
    setCategories((prev) => prev.map((x) => (x.id === next.id ? next : x)));

  const addCategory = () =>
    setCategories((p) => [...p, { id: uid(), name: "", items: [] }]);

  const removeCategory = (id) =>
    setCategories((p) => p.filter((c) => c.id !== id));

  const addFoodItem = (catId) =>
    setCategories((p) =>
      p.map((c) =>
        c.id === catId
          ? {
              ...c,
              items: [
                ...c.items,
                { id: uid(), name: "", description: "", price: "", imageUri: null },
              ],
            }
          : c
      )
    );

  const removeFoodItem = (catId, itemId) =>
    setCategories((p) =>
      p.map((c) =>
        c.id === catId
          ? { ...c, items: c.items.filter((x) => x.id !== itemId) }
          : c
      )
    );

  const validateFood = () => {
    for (const c of categories) {
      if (!c.name.trim()) return "Every category must have a name.";
      for (const it of c.items) {
        if (!it.name.trim()) return "Each item must have a name.";
        if (!it.price || isNaN(Number(it.price))) return "Each item needs a valid price.";
      }
    }
    return null;
  };

  const handleSave = async () => {
    const error = validateFood();
    if (error) {
      Alert.alert("Fix required", error);
      return;
    }
    try {
      setSaving(true);
      // TODO: call your API with { type: "food", categories }
      await new Promise((r) => setTimeout(r, 600));
      Alert.alert("Saved", "Your menu has been saved.");
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
                <Text style={styles.title}>Menu Setup (Food)</Text>
                <Text style={styles.subtitle}>
                  Pick a category and add menu items (name, description, price, image).
                </Text>

                {categories.map((cat) => (
                  <CategoryCard
                    key={cat.id}
                    category={cat}
                    onChangeCategory={(next) => onCategoryChange(next)}
                    onRemoveCategory={() => removeCategory(cat.id)}
                    onAddItem={() => addFoodItem(cat.id)}
                    onItemChange={(item, field) => onFoodItemChange(cat.id, item, field)}
                    onRemoveItem={(itemId) => removeFoodItem(cat.id, itemId)}
                  />
                ))}

                <TouchableOpacity style={styles.addBtn} onPress={addCategory}>
                  <Text style={styles.addTxt}>+ Add category</Text>
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
   Styles (shared look/feel)
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

  card: {
    backgroundColor: "#fff",
    borderRadius: 15,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  itemCard: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 15,
    padding: 12,
    backgroundColor: "#fff",
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
  addTiny: {
    marginTop: 10,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  addTinyTxt: { fontWeight: "700", color: "#1f2937" },

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
