import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  Keyboard,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import HeaderWithSteps from "./HeaderWithSteps";

// use .env for admin business type APIs (no fallbacks)
import {
  BUSINESS_TYPES_FOOD_ENDPOINT as ENV_BT_FOOD,
  BUSINESS_TYPES_MART_ENDPOINT as ENV_BT_MART,
} from "@env";

export default function MerchantRegistrationScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();

  const {
    merchant = {},
    // ❗️no default here—let's not force "food" if the param is missing
    serviceType,
    deliveryOption = null,
    initialFullName,
    initialBusinessName,
    initialCategory,
    returnTo = null,
  } = route.params ?? {};

  const [fullName, setFullName] = useState(
    merchant?.full_name ?? initialFullName ?? ""
  );
  const [businessName, setBusinessName] = useState(
    merchant?.business_name ?? initialBusinessName ?? ""
  );

  // dynamic categories from admin API (store as {id, name})
  const [categories, setCategories] = useState([]); // [{id, name}]

  // --- MULTI-SELECT: keep selected categories as an array of IDS (strings) ---
  const normalizeToArray = (val) => {
    if (!val) return [];
    if (Array.isArray(val)) return val.filter(Boolean).map((v) => String(v));
    if (typeof val === "string") {
      return val
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map(String);
    }
    return [];
  };

  const [selectedCategories, setSelectedCategories] = useState(() => {
    // Prefer merchant.category, else initialCategory — both interpreted as IDs
    const merged = normalizeToArray(merchant?.category).length
      ? normalizeToArray(merchant?.category)
      : normalizeToArray(initialCategory);
    return merged;
  });

  const [focusedField, setFocusedField] = useState(null);

  // ✅ compute the effective type from anything available
  const effectiveServiceType = useMemo(() => {
    return String(
      serviceType ?? route.params?.owner_type ?? merchant?.owner_type ?? "food"
    )
      .trim()
      .toLowerCase();
  }, [serviceType, route.params?.owner_type, merchant?.owner_type]);

  // Keyboard spacing
  const [kbHeight, setKbHeight] = useState(0);
  useEffect(() => {
    const onShow = (e) => setKbHeight(e.endCoordinates?.height ?? 0);
    const onHide = () => setKbHeight(0);

    const showSub =
      Platform.OS === "ios"
        ? Keyboard.addListener("keyboardWillShow", onShow)
        : Keyboard.addListener("keyboardDidShow", onShow);
    const hideSub =
      Platform.OS === "ios"
        ? Keyboard.addListener("keyboardWillHide", onHide)
        : Keyboard.addListener("keyboardDidHide", onHide);

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const bottomSpace = Math.max(kbHeight, insets.bottom, 16);

  // fetch business types based on effectiveServiceType (food/mart)
  useEffect(() => {
    const controller = new AbortController();
    const URL = effectiveServiceType === "mart" ? ENV_BT_MART : ENV_BT_FOOD;

    (async () => {
      try {
        if (!URL) {
          setCategories([]);
          return;
        }
        const res = await fetch(URL, { signal: controller.signal });
        if (!res.ok) {
          setCategories([]);
          return;
        }
        const data = await res.json();

        // Normalize to array of {id, name}
        const arr = Array.isArray(data)
          ? data
          : Array.isArray(data?.data)
          ? data.data
          : [];

        const normalized = arr
          .map((it) => {
            const id =
              it?.id ?? it?.value ?? it?.code ?? it?.business_type_id ?? null;
            const name = String(
              it?.name ?? it?.title ?? it?.label ?? ""
            ).trim();
            return { id, name };
          })
          .filter((it) => it.id != null && it.name);

        setCategories(normalized);

        // Ensure currently selected IDs are still valid
        setSelectedCategories((prev) => {
          const validIds = new Set(normalized.map((c) => String(c.id)));
          const filtered = prev.filter((id) => validIds.has(String(id)));
          if (filtered.length) return filtered;

          const fromMerchant = normalizeToArray(merchant?.category).filter((id) =>
            validIds.has(String(id))
          );
          if (fromMerchant.length) return fromMerchant;

          const fromInitial = normalizeToArray(initialCategory).filter((id) =>
            validIds.has(String(id))
          );
          if (fromInitial.length) return fromInitial;

          return normalized.length ? [String(normalized[0].id)] : [];
        });
      } catch {
        setCategories([]);
      }
    })();

    return () => controller.abort();
  }, [effectiveServiceType]);

  const isValid = fullName.trim().length > 0 && businessName.trim().length > 0;

  const toggleCategory = (id) => {
    const strId = String(id);
    setSelectedCategories((prev) => {
      if (prev.includes(strId)) {
        return prev.filter((x) => x !== strId);
      }
      return [...prev, strId];
    });
  };

  // Map selected IDs -> names (fallback to ID if name not found)
  const selectedNames = useMemo(() => {
    const idToName = new Map(categories.map((c) => [String(c.id), c.name]));
    return selectedCategories.map((id) => idToName.get(String(id)) || String(id));
  }, [categories, selectedCategories]);

  const goContinue = () => {
    if (!isValid) return;

    const mergedMerchant = {
      ...merchant,
      full_name: fullName.trim(),
      business_name: businessName.trim(),
      // Keep the same key name `category` but it's now an array of IDS
      category: selectedCategories,
      categories,
      owner_type: effectiveServiceType, // keep consistent going forward
    };

    navigation.navigate("MerchantExtrasScreen", {
      ...(route.params ?? {}),
      merchant: mergedMerchant,
      serviceType: effectiveServiceType, // pass it forward
      deliveryOption,
      returnTo,
      initialFullName: fullName.trim(),
      initialBusinessName: businessName.trim(),
      initialCategory: selectedCategories, // IDs
    });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <HeaderWithSteps step="Step 3 of 7" />

      <View style={styles.fixedTitle}>
        <Text style={styles.h1}>Business Details</Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={[
              styles.container,
              { paddingBottom: 120 + bottomSpace },
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {/* dynamic section title */}
            <Text style={styles.section}>
              {effectiveServiceType === "mart" ? "Mart Merchant" : "Food Merchant"}
            </Text>

            <Field
              label={
                <Text>
                  Full name <Text style={{ color: "red" }}>*</Text>
                </Text>
              }
              placeholder="e.g., Sonam Dorji"
              value={fullName}
              onChangeText={setFullName}
              onFocus={() => setFocusedField("fullName")}
              onBlur={() => setFocusedField(null)}
              isFocused={focusedField === "fullName"}
            />

            <Field
              label={
                <Text>
                  Business name <Text style={{ color: "red" }}>*</Text>
                </Text>
              }
              placeholder="e.g., Zombala Restaurant"
              value={businessName}
              onChangeText={setBusinessName}
              onFocus={() => setFocusedField("businessName")}
              onBlur={() => setFocusedField(null)}
              isFocused={focusedField === "businessName"}
            />

            <Text style={styles.label}>Business type</Text>
            <View style={styles.chipsRow}>
              {categories.length > 0 ? (
                categories.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={[
                      styles.chip,
                      selectedCategories.includes(String(c.id)) &&
                        styles.chipActive,
                    ]}
                    onPress={() => toggleCategory(c.id)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        selectedCategories.includes(String(c.id)) &&
                          styles.chipTextActive,
                      ]}
                    >
                      {c.name}
                    </Text>
                  </TouchableOpacity>
                ))
              ) : selectedCategories.length > 0 ? (
                // fallback: show currently selected IDs if API returned nothing
                selectedCategories.map((id) => (
                  <TouchableOpacity
                    key={id}
                    style={[styles.chip, styles.chipActive]}
                    onPress={() => toggleCategory(id)}
                  >
                    <Text style={[styles.chipText, styles.chipTextActive]}>
                      {id}
                    </Text>
                  </TouchableOpacity>
                ))
              ) : null}
            </View>

            {!!selectedCategories.length && (
              <Text style={styles.hint}>
                Selected: {selectedNames.join(", ")}
              </Text>
            )}
          </ScrollView>

          <View
            pointerEvents="box-none"
            style={[styles.fabWrap, { bottom: bottomSpace }]}
          >
            <View style={styles.submitContainer}>
              <TouchableOpacity
                style={isValid ? styles.btnPrimary : styles.btnPrimaryDisabled}
                onPress={goContinue}
                disabled={!isValid}
              >
                <Text
                  style={
                    isValid
                      ? styles.btnPrimaryText
                      : styles.btnPrimaryTextDisabled
                  }
                >
                  Continue
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize,
  onFocus,
  onBlur,
  isFocused,
  hint,
}) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[
          styles.inputWrapper,
          { borderColor: isFocused ? "#00b14f" : "#ccc" },
        ]}
      >
        <TextInput
          style={styles.inputField}
          placeholder={placeholder}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          placeholderTextColor="#9aa0a6"
          onFocus={onFocus}
          onBlur={onBlur}
          returnKeyType="next"
        />
      </View>
      {!!hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  fixedTitle: {
    backgroundColor: "#fff",
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#fff",
  },
  h1: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#1A1D1F",
  },
  container: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  section: {
    marginTop: 6,
    marginBottom: 8,
    fontSize: 16,
    fontWeight: "700",
  },
  label: { fontSize: 14, marginBottom: 6, color: "#333" },
  hint: { marginTop: 6, fontSize: 12, color: "#067647" },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    height: 50,
    borderWidth: 1.5,
    borderRadius: 15,
    backgroundColor: "#fff",
    borderColor: "#ccc",
    paddingHorizontal: 10,
  },
  inputField: { flex: 1, fontSize: 14, paddingVertical: 10 },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
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
  fabWrap: { position: "absolute", left: 0, right: 0 },
  submitContainer: {
    height: 100,
    backgroundColor: "#fff",
    padding: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  btnPrimary: {
    backgroundColor: "#00b14f",
    paddingVertical: 14,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    marginTop: 6,
    marginBottom: 10,
    elevation: 15,
    shadowColor: "#00b14f",
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  btnPrimaryDisabled: {
    backgroundColor: "#eee",
    paddingVertical: 14,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  btnPrimaryText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  btnPrimaryTextDisabled: { color: "#aaa", fontSize: 16, fontWeight: "600" },
});
