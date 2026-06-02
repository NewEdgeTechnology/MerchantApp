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
import { SafeAreaView } from "react-native-safe-area-context";

const NEXT_ROUTE = "ReviewSubmitScreen";
const DELIVERY_OPTIONS = ["Self Delivery", "Grab Delivery", "Both"];
import { BRAND, FONT, RADIUS, SHADOW } from "../styles/tabdey_brand";

export default function DeliveryOptionsScreen() {
  const navigation = useNavigation();
  const route = useRoute();

  // ✅ accept id card number from previous screen(s)
  const {
    initialDeliveryOption = null,
    returnTo = null,
    owner_type: incomingOwnerType = null,
    serviceType: incomingServiceType = null,
    idCardNo: incomingIdCardNo = null, // ✅ NEW
  } = route.params ?? {};

  const effectiveOwnerType = String(
    incomingOwnerType ??
      route.params?.merchant?.owner_type ??
      incomingServiceType ??
      "food",
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
      Alert.alert(
        "Select an option",
        "Please choose a delivery option to continue.",
      );
      return;
    }

    const goNext = returnTo || NEXT_ROUTE;

    // Normalize business type(s) from prior steps → array of IDs
    const normalizedCategoryIds = normalizeCategoryIds(
      (route.params?.merchant && route.params?.merchant.category) ??
        route.params?.initialCategory ??
        route.params?.category ??
        [],
    );

    // ✅ choose id card number from params or merchant
    const resolvedIdCardNo =
      (incomingIdCardNo != null && String(incomingIdCardNo).trim()) ||
      (route.params?.merchant?.id_card_number != null &&
        String(route.params.merchant.id_card_number).trim()) ||
      null;

    navigation.navigate(goNext, {
      ...(route.params ?? {}),
      deliveryOption: selected,

      // ✅ pass forward
      idCardNo: resolvedIdCardNo,

      // keep normalized IDs available at the root for downstream screens
      initialCategory: normalizedCategoryIds,
      category: normalizedCategoryIds,
      categories: route.params?.merchant?.categories ?? [],

      owner_type: effectiveOwnerType,

      merchant: {
        ...(route.params?.merchant ?? {}),
        category: normalizedCategoryIds,
        owner_type: effectiveOwnerType,

        // ✅ also keep it inside merchant
        ...(resolvedIdCardNo ? { id_card_number: resolvedIdCardNo } : {}),
      },

      serviceType: incomingServiceType ?? effectiveOwnerType,
    });
  };

  return (
    <SafeAreaView
      style={styles.safe}
      edges={["left", "top", "right", "bottom"]}
    >
      <View style={styles.topGlow} />

      <View style={styles.page}>
        <HeaderWithSteps step="Step 5 of 7" />

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroCard}>
            <Text style={styles.brandLabel}>TÀBDEY MERCHANT</Text>
            <Text style={styles.h1}>Delivery setup</Text>
            <Text style={styles.subtitle}>
              Choose how customer orders will be delivered from your store.
            </Text>
          </View>

          <View style={styles.optionsWrap}>
            {DELIVERY_OPTIONS.map((opt) => {
              const isActive = selected === opt;

              const title = opt === "Grab Delivery" ? "Tàbdey Delivery" : opt;

              const description =
                opt === "Self Delivery"
                  ? "You manage your own riders, delivery timing and fees."
                  : opt === "Grab Delivery"
                    ? "Tàbdey handles riders and delivery logistics for you."
                    : "Use both your own riders and Tàbdey riders based on availability.";

              return (
                <TouchableOpacity
                  key={opt}
                  activeOpacity={0.9}
                  style={[styles.option, isActive && styles.optionActive]}
                  onPress={() => setSelected(opt)}
                >
                  <View style={styles.optionTextWrap}>
                    <Text
                      style={[
                        styles.optionText,
                        isActive && styles.optionTextActive,
                      ]}
                    >
                      {title}
                    </Text>

                    <Text style={styles.optionSub}>{description}</Text>
                  </View>

                  <View
                    style={[
                      styles.radioOuter,
                      {
                        borderColor: isActive ? BRAND.purple : BRAND.greyBorder,
                      },
                    ]}
                  >
                    {isActive ? <View style={styles.radioInner} /> : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            onPress={handleNext}
            style={selected ? styles.btnPrimary : styles.btnPrimaryDisabled}
            disabled={!selected}
            activeOpacity={0.86}
          >
            <Text
              style={
                selected ? styles.btnPrimaryText : styles.btnPrimaryTextDisabled
              }
            >
              Continue
            </Text>
          </TouchableOpacity>

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
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
    paddingHorizontal: 18,
    paddingTop: 0,
  },

  scrollContent: {
    flexGrow: 1,
    paddingBottom: 24,
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

  optionsWrap: {
    gap: 14,
    marginTop: 4,
  },

  option: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: BRAND.white,
    borderWidth: 1.2,
    borderColor: BRAND.greyBorder,
    borderRadius: 22,
    padding: 16,
    gap: 12,
    ...SHADOW.sm,
  },

  optionActive: {
    borderColor: BRAND.purple,
    backgroundColor: "#F4ECFF",
  },

  iconBubble: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#F8F5FF",
    alignItems: "center",
    justifyContent: "center",
  },

  iconBubbleActive: {
    backgroundColor: BRAND.white,
  },

  iconText: {
    fontSize: 22,
  },

  optionTextWrap: {
    flex: 1,
  },

  optionText: {
    fontFamily: FONT.body,
    fontSize: 15,
    color: BRAND.black,
    fontWeight: "800",
  },

  optionTextActive: {
    color: BRAND.purple,
  },

  optionSub: {
    marginTop: 4,
    fontFamily: FONT.body,
    fontSize: 12,
    color: BRAND.grey,
    lineHeight: 18,
  },

  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BRAND.white,
  },

  radioInner: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: BRAND.purple,
  },

  btnPrimary: {
    backgroundColor: BRAND.purple,
    paddingVertical: 16,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    marginTop: 24,
    marginBottom: 16,
    ...SHADOW.md,
  },

  btnPrimaryDisabled: {
    backgroundColor: BRAND.greyLight,
    paddingVertical: 16,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    marginTop: 24,
    marginBottom: 16,
  },

  btnPrimaryText: {
    color: BRAND.white,
    fontSize: 16,
    fontWeight: "700",
    fontFamily: FONT.body,
  },

  btnPrimaryTextDisabled: {
    color: BRAND.grey,
    fontSize: 16,
    fontWeight: "600",
    fontFamily: FONT.body,
  },

  bottomSpacer: {
    height: 40,
  },
});
