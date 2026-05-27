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
  Keyboard,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useSafeAreaInsets, SafeAreaView } from "react-native-safe-area-context";
import HeaderWithSteps from "./HeaderWithSteps";
import Icon from "react-native-vector-icons/Ionicons";
import { BRAND, FONT, RADIUS, SHADOW } from "../styles/tabdey_brand";

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
    serviceType,
    deliveryOption = null,
    initialFullName,
    initialBusinessName,
    initialCategory,
    returnTo = null,
    requireLicense = false,
    requireLicenseImage = false,
  } = route.params ?? {};

  const [fullName, setFullName] = useState(
    merchant?.full_name ?? initialFullName ?? ""
  );
  const [businessName, setBusinessName] = useState(
    merchant?.business_name ?? initialBusinessName ?? ""
  );

  const [categories, setCategories] = useState([]);

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
    const merged = normalizeToArray(merchant?.category).length
      ? normalizeToArray(merchant?.category)
      : normalizeToArray(initialCategory);
    return merged;
  });

  const [focusedField, setFocusedField] = useState(null);

  // ✅ Smart title-case fix used onBlur
  const toTitleCaseSmart = (s = "") =>
    s
      .replace(/\s+/g, " ")
      .trim()
      .replace(
        /(^|[\s\-’'])(\p{L})(\p{L}*)/gu,
        (_, sep, a, rest) => sep + a.toUpperCase() + rest.toLowerCase()
      );

  const effectiveServiceType = useMemo(() => {
    return String(
      serviceType ?? route.params?.owner_type ?? merchant?.owner_type ?? "food"
    )
      .trim()
      .toLowerCase();
  }, [serviceType, route.params?.owner_type, merchant?.owner_type]);

  // 🔁 Dynamic labels based on seller type
  const typeLabel =
    effectiveServiceType === "mart" ? "Business type" : "Cuisine";
  const selectedHintPrefix =
    effectiveServiceType === "mart"
      ? "Selected type(s): "
      : "Selected cuisine(s): ";

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

  // Fetch business types (for food we treat them as cuisines)
  useEffect(() => {
    const controller = new AbortController();
    const URL = effectiveServiceType === "mart" ? ENV_BT_MART : ENV_BT_FOOD;

    (async () => {
      try {
        if (!URL) return setCategories([]);
        const res = await fetch(URL, { signal: controller.signal });
        if (!res.ok) return setCategories([]);
        const data = await res.json();
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

        // keep valid selected IDs
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
    setSelectedCategories((prev) =>
      prev.includes(strId)
        ? prev.filter((x) => x !== strId)
        : [...prev, strId]
    );
  };

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
      category: selectedCategories,
      categories,
      owner_type: effectiveServiceType,
    };

    navigation.navigate("MerchantExtrasScreen", {
      ...(route.params ?? {}),
      merchant: mergedMerchant,
      serviceType: effectiveServiceType,
      deliveryOption,
      returnTo,
      initialFullName: fullName.trim(),
      initialBusinessName: businessName.trim(),
      initialCategory: selectedCategories,
      requireLicense,
      requireLicenseImage,
    });
  };

  return (
  <SafeAreaView style={styles.safeArea} edges={["left", "right", "bottom"]}>
    <View style={styles.topGlow} />

    <View style={styles.page}>
      <HeaderWithSteps step="Step 3 of 7" />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={[
              styles.container,
              { paddingBottom:  bottomSpace },
            ]}
            keyboardShouldPersistTaps="always"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.heroCard}>
              <Text style={styles.brandLabel}>TÀBDEY MERCHANT</Text>
              <Text style={styles.h1}>Business details</Text>
              <Text style={styles.subtitle}>
                Add your owner name, business name and business category.
              </Text>
            </View>

            <View style={styles.formCard}>
              <Text style={styles.section}>
                {effectiveServiceType === "mart"
                  ? "Mart Merchant"
                  : "Food Merchant"}
              </Text>

              <Field
                label={
                  <Text>
                    Full name <Text style={{ color: BRAND.red }}>*</Text>
                  </Text>
                }
                placeholder="e.g., Sonam Dorji"
                value={fullName}
                onChangeText={setFullName}
                onFocus={() => setFocusedField("fullName")}
                onBlur={() => {
                  setFocusedField(null);
                  setFullName(toTitleCaseSmart(fullName));
                }}
                isFocused={focusedField === "fullName"}
                autoCapitalize="words"
              />

              <Field
                label={
                  <Text>
                    Business name <Text style={{ color: BRAND.red }}>*</Text>
                  </Text>
                }
                placeholder="e.g., Zombala Restaurant"
                value={businessName}
                onChangeText={setBusinessName}
                onFocus={() => setFocusedField("businessName")}
                onBlur={() => {
                  setFocusedField(null);
                  setBusinessName(toTitleCaseSmart(businessName));
                }}
                isFocused={focusedField === "businessName"}
                autoCapitalize="words"
              />

              <Text style={styles.label}>{typeLabel}</Text>

              <View style={styles.chipsRow}>
                {categories.length > 0
                  ? categories.map((c) => (
                      <TouchableOpacity
                        key={c.id}
                        style={[
                          styles.chip,
                          selectedCategories.includes(String(c.id)) &&
                            styles.chipActive,
                        ]}
                        onPress={() => toggleCategory(c.id)}
                        activeOpacity={0.8}
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
                  : selectedCategories.length > 0
                  ? selectedCategories.map((id) => (
                      <TouchableOpacity
                        key={id}
                        style={[styles.chip, styles.chipActive]}
                        onPress={() => toggleCategory(id)}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.chipText, styles.chipTextActive]}>
                          {id}
                        </Text>
                      </TouchableOpacity>
                    ))
                  : null}
              </View>

              {!!selectedCategories.length && (
                <Text style={styles.hint}>
                  {selectedHintPrefix}
                  {selectedNames.join(", ")}
                </Text>
              )}
            </View>
          </ScrollView>

          <View style={styles.submitContainer}>
            <TouchableOpacity
              style={isValid ? styles.btnPrimary : styles.btnPrimaryDisabled}
              onPress={goContinue}
              disabled={!isValid}
              activeOpacity={0.86}
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

              {isValid && (
                <Icon name="arrow-forward" size={20} color={BRAND.white} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  </SafeAreaView>
);
}

/* ---------- Field Component ---------- */
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
  safeArea: {
    flex: 1,
    backgroundColor: "#FBF7FF",
  },

  topGlow: {
    position: "absolute",
    top: -120,
    right: -90,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: BRAND.purpleLight,
    opacity: 0.45,
  },

  page: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 42,
  },

  container: {
    paddingBottom: 120,
  },

  heroCard: {
    backgroundColor: BRAND.white,
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 18,
    marginBottom: 18,
    ...SHADOW.sm,
  },

  brandLabel: {
    fontFamily: FONT.body,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    color: BRAND.purple,
    marginBottom: 10,
  },

  h1: {
    fontFamily: FONT.header,
    fontSize: 26,
    fontWeight: "700",
    color: BRAND.black,
    lineHeight: 32,
    marginBottom: 10,
  },

  subtitle: {
    fontFamily: FONT.body,
    fontSize: 14,
    lineHeight: 21,
    color: BRAND.grey,
  },

  formCard: {
    backgroundColor: BRAND.white,
    borderRadius: 26,
    padding: 18,
    ...SHADOW.sm,
  },

  section: {
    fontFamily: FONT.body,
    marginBottom: 18,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1.1,
    color: BRAND.magenta,
    textTransform: "uppercase",
  },

  label: {
    fontFamily: FONT.body,
    fontSize: 14,
    marginBottom: 7,
    color: BRAND.black,
    fontWeight: "700",
  },

  hint: {
    fontFamily: FONT.body,
    marginTop: 8,
    fontSize: 12,
    color: BRAND.purple,
    lineHeight: 17,
  },

  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    height: 56,
    borderWidth: 1.2,
    borderRadius: 18,
    backgroundColor: "#FCFCFC",
    paddingHorizontal: 16,
  },

  inputField: {
    flex: 1,
    fontFamily: FONT.body,
    fontSize: 15,
    color: BRAND.black,
    paddingVertical: 10,
  },

  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
    marginTop: 4,
    marginBottom: 10,
  },

  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: RADIUS.pill,
    borderWidth: 1.2,
    borderColor: BRAND.greyBorder,
    backgroundColor: "#FCFCFC",
  },

  chipActive: {
    backgroundColor: "#F4ECFF",
    borderColor: BRAND.purple,
  },

  chipText: {
    fontFamily: FONT.body,
    fontSize: 13,
    color: BRAND.grey,
    fontWeight: "600",
  },

  chipTextActive: {
    color: BRAND.purple,
    fontWeight: "800",
  },

  submitContainer: {
    backgroundColor: "#FBF7FF",
    paddingTop: 14,
    paddingBottom: 24,
  },

  btnPrimary: {
    backgroundColor: BRAND.purple,
    paddingVertical: 16,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    flexDirection: "row",
    gap: 8,
    ...SHADOW.md,
  },

  btnPrimaryDisabled: {
    backgroundColor: BRAND.greyLight,
    paddingVertical: 16,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },

  btnPrimaryText: {
    fontFamily: FONT.body,
    color: BRAND.white,
    fontSize: 16,
    fontWeight: "700",
  },

  btnPrimaryTextDisabled: {
    fontFamily: FONT.body,
    color: BRAND.grey,
    fontSize: 16,
    fontWeight: "600",
  },
});
