import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import HeaderWithSteps from "./HeaderWithSteps";
import { SafeAreaView } from 'react-native-safe-area-context';

const NEXT_ROUTE = "ReviewSubmitScreen";
const DELIVERY_OPTIONS = ["Self Delivery", "Grab Delivery", "Both"];
const BRAND = "#00AA13";

export default function DeliveryOptionsScreen() {
  const navigation = useNavigation();
  const route = useRoute();

  // Support prefill + return target when editing from Review
  const {
    initialDeliveryOption = null,
    returnTo = null,
    owner_type: incomingOwnerType = null,
    serviceType: incomingServiceType = null,
  } = route.params ?? {};

  const effectiveOwnerType = String(
    incomingOwnerType ??
      route.params?.merchant?.owner_type ??
      incomingServiceType ??
      "food"
  )
    .trim()
    .toLowerCase();

  // Start with pre-selected value if provided, otherwise null
  const [selected, setSelected] = useState(initialDeliveryOption ?? null);

  // ✅ Normalize business type(s) to an array of **IDs** (strings)
  const normalizeCategoryIds = (v) => {
    if (!v) return [];
    if (Array.isArray(v)) {
      return v
        .map((item) => {
          if (typeof item === "object") {
            const id = item.id ?? item.value ?? item.business_type_id ?? null;
            return id != null ? String(id).trim() : "";
          }
          return String(item).trim();
        })
        .filter(Boolean);
    }
    if (typeof v === "string") {
      // supports CSV like "2,5,8"
      return v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (typeof v === "object") {
      const id = v.id ?? v.value ?? v.business_type_id ?? null;
      return id != null && String(id).trim() ? [String(id).trim()] : [];
    }
    return [];
  };

  const handleNext = () => {
    if (!selected) {
      Alert.alert("Select an option", "Please choose a delivery option to continue.");
      return;
    }

    const goNext = returnTo || NEXT_ROUTE;

    // Normalize business type(s) from prior steps → array of IDs
    const normalizedCategoryIds = normalizeCategoryIds(
      (route.params?.merchant && route.params?.merchant.category) ??
        route.params?.initialCategory ??
        route.params?.category ??
        []
    );

    navigation.navigate(goNext, {
      ...(route.params ?? {}),
      deliveryOption: selected,

      // keep normalized IDs available at the root for downstream screens
      initialCategory: normalizedCategoryIds,
      category: normalizedCategoryIds,
      categories: route.params?.merchant?.categories ?? [],

      owner_type: effectiveOwnerType,

      merchant: {
        ...(route.params?.merchant ?? {}),
        category: normalizedCategoryIds,
        owner_type: effectiveOwnerType,
      },
      
      serviceType: incomingServiceType ?? effectiveOwnerType,
    });
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header styled like your other screens */}
      <HeaderWithSteps step="Step 5 of 7" />

      {/* Fixed page title */}
      <View style={styles.fixedTitle}>
        <Text style={styles.h1}>Delivery Options</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.subtitle}>
          Choose how orders will be delivered from your store.
        </Text>

        <View style={styles.optionsWrap}>
          {DELIVERY_OPTIONS.map((opt) => {
            const isActive = selected === opt;
            return (
              <TouchableOpacity
                key={opt}
                activeOpacity={0.9}
                style={[styles.option, isActive && styles.optionActive]}
                onPress={() => setSelected(opt)}
              >
                {/* Radio — circular with filled dot when selected */}
                <View
                  style={[
                    styles.radioOuter,
                    { borderColor: isActive ? BRAND : "#d0d5dd" },
                  ]}
                >
                  {isActive ? <View style={styles.radioInner} /> : null}
                </View>

                <View style={styles.optionTextWrap}>
                  <Text style={[styles.optionText, isActive && styles.optionTextActive]}>
                    {opt}
                  </Text>
                  <Text style={styles.optionSub}>
                    {opt === "Self Delivery"
                      ? "You handle your own riders and fees."
                      : opt === "Grab Delivery"
                      ? "Grab handles riders and logistics."
                      : "Use both your own riders and Grab riders."}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Bottom CTA */}
      <View style={styles.submitContainer}>
        <TouchableOpacity
          onPress={handleNext}
          style={selected ? styles.btnPrimary : styles.btnPrimaryDisabled}
          disabled={!selected}
        >
          <Text style={selected ? styles.btnPrimaryText : styles.btnPrimaryTextDisabled}>
            Continue
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  /* Screen */
  safe: { flex: 1, backgroundColor: "#fff" },

  /* Header-like title block */
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
    marginBottom: 16,
  },

  /* Content */
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  subtitle: {
    fontSize: 14,
    color: "#666",
    marginBottom: 16,
  },

  /* Options */
  optionsWrap: {
    gap: 12,
  },
  option: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderWidth: 1,
    borderColor: "#e6e6e6",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
  },
  optionActive: {
    borderColor: BRAND,
    backgroundColor: "#EAF8EE",
  },

  // Radio
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    marginTop: 2,
    backgroundColor: "#fff",
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: BRAND, // filled dot
  },

  optionTextWrap: { flex: 1 },
  optionText: {
    fontSize: 16,
    color: "#222",
    fontWeight: "600",
  },
  optionTextActive: {
    color: BRAND,
  },
  optionSub: {
    marginTop: 4,
    fontSize: 13,
    color: "#555",
  },

  /* Bottom CTA — same vibe as your other screen */
  submitContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 100,
    backgroundColor: "#fff",
    padding: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: -2 },
    elevation: 6,
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
    marginTop: 6,
    marginBottom: 6,
  },
  btnPrimaryText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  btnPrimaryTextDisabled: { color: "#aaa", fontSize: 16, fontWeight: "600" },
});
