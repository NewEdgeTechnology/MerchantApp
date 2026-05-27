import React, { useState, useMemo, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  TextInput,
  Image,
} from "react-native";
import Icon from "react-native-vector-icons/Ionicons";
import { useNavigation, useRoute } from "@react-navigation/native";
import HeaderWithSteps from "./HeaderWithSteps";
import { SafeAreaView } from "react-native-safe-area-context";
import { BRAND, FONT, RADIUS, SHADOW } from "../styles/tabdey_brand";

const COUNTRY_OPTIONS = [{ name: "Bhutan", code: "bt", dial: "+975" }];
const DIAL_REQUIRED_LENGTH = { "+975": 8 };
const getRequiredLength = (dial) => DIAL_REQUIRED_LENGTH[dial] ?? 8;
const ALLOWED_PREFIXES = ["77", "17", "16"];

const formatBhutan = (digits) => {
  const d = digits.slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)} ${d.slice(2)}`;
  return `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5)}`;
};

export default function PhoneNumberScreen() {
  const navigation = useNavigation();
  const route = useRoute();

  const {
    merchant: incomingMerchant = {},
    initialPhone = null,
    returnTo = null,
    serviceType,
    owner_type,
  } = route.params ?? {};

  const [country] = useState(COUNTRY_OPTIONS[0]);
  const [digits, setDigits] = useState("");
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    const fromParam = (initialPhone ?? incomingMerchant?.phone ?? "").trim();
    if (fromParam.startsWith(country.dial)) {
      const only = fromParam.replace(country.dial, "").replace(/\D/g, "");
      setDigits(only.slice(0, getRequiredLength(country.dial)));
    }
  }, []);

  const reqLen = useMemo(() => getRequiredLength(country.dial), [country.dial]);

  const hasRequiredLength = digits.length === reqLen;
  const firstOk = digits.length === 0 || digits[0] === "1" || digits[0] === "7";
  const prefixOk =
    digits.length < 2 || ALLOWED_PREFIXES.includes(digits.slice(0, 2));
  const isValid = hasRequiredLength && firstOk && prefixOk;

  const handleChangePhone = (text) => {
    const raw = text.replace(/\D/g, "").slice(0, reqLen);
    setDigits(raw);
  };

  const handleContinue = () => {
    if (!isValid) return;

    const full = `${country.dial}${digits}`;
    const mergedMerchant = {
      ...incomingMerchant,
      phone: full,
      owner_type:
        incomingMerchant?.owner_type ?? owner_type ?? serviceType ?? undefined,
    };

    navigation.navigate("MerchantRegistrationScreen", {
      ...(route.params ?? {}),
      serviceType,
      owner_type: owner_type ?? serviceType,
      merchant: mergedMerchant,
      initialFullName: mergedMerchant?.full_name ?? null,
      initialBusinessName: mergedMerchant?.business_name ?? null,
      initialCategory: mergedMerchant?.category ?? null,
      returnTo,
    });
  };

  const showHelper =
    digits.length > 0 && (!firstOk || !prefixOk || !hasRequiredLength);
  const display = formatBhutan(digits);

  return (
    <SafeAreaView style={styles.container} edges={["left", "right", "bottom"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FBF7FF" />
      <View style={styles.topGlow} />

      <View style={styles.page}>
        <HeaderWithSteps step="Step 2 of 7" />

        <View style={styles.heroCard}>
          <Text style={styles.brandLabel}>TÀBDEY MERCHANT</Text>
          <Text style={styles.title}>Verify your phone number</Text>
          <Text style={styles.subtitle}>
            Enter your mobile number so we can continue setting up your merchant
            account.
          </Text>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.label}>Mobile number</Text>

          <View style={styles.phoneInputContainer}>
            <View style={styles.countrySelector}>
              <Image
                source={{ uri: `https://flagcdn.com/w40/${country.code}.png` }}
                style={styles.flag}
              />
              <Text style={styles.countryCode}>{country.dial}</Text>
            </View>

            <View
              style={[
                styles.phoneInputWrapper,
                {
                  borderColor: isFocused ? BRAND.purple : BRAND.greyBorder,
                },
              ]}
            >
              <TextInput
                style={styles.phoneInput}
                value={display}
                onChangeText={handleChangePhone}
                placeholder="8-digit number"
                placeholderTextColor={BRAND.grey}
                keyboardType="number-pad"
                inputMode="numeric"
                maxLength={reqLen + 2}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                autoCorrect={false}
                autoCapitalize="none"
                accessibilityLabel="Bhutan phone number input"
              />

              {digits.length > 0 && !isValid && (
                <TouchableOpacity
                  onPress={() => setDigits("")}
                  style={styles.clearButton}
                  hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                >
                  <Icon name="close-circle" size={20} color={BRAND.grey} />
                </TouchableOpacity>
              )}

              {isValid && (
                <View style={styles.validBadge}>
                  <Icon
                    name="checkmark-circle"
                    size={22}
                    color={BRAND.purple}
                  />
                </View>
              )}
            </View>
          </View>

          {showHelper && (
            <Text style={styles.helperText}>
              {(!firstOk || !prefixOk) && `Starts with 77, 17 or 16. `}
              {!hasRequiredLength && `${reqLen} digits required.`}
            </Text>
          )}

          <Text style={styles.caption}>
            Format: 77/17/16 ××× ××× (8 digits)
          </Text>
        </View>

        <TouchableOpacity
          style={
            isValid ? styles.continueButton : styles.continueButtonDisabled
          }
          onPress={handleContinue}
          disabled={!isValid}
          activeOpacity={0.86}
        >
          <Text
            style={
              isValid ? styles.continueButtonText : styles.continueTextDisabled
            }
          >
            Continue
          </Text>

          {isValid && (
            <Icon name="arrow-forward" size={20} color={BRAND.white} />
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
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

  title: {
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

  label: {
    fontFamily: FONT.body,
    marginBottom: 10,
    fontSize: 14,
    fontWeight: "700",
    color: BRAND.black,
  },

  phoneInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 12,
  },

  countrySelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 110,
    backgroundColor: "#FCFCFC",
    paddingHorizontal: 14,
    height: 54,
    borderRadius: 16,
    borderWidth: 1.2,
    borderColor: BRAND.greyBorder,
    gap: 8,
  },

  countryCode: {
    fontFamily: FONT.body,
    fontSize: 15,
    color: BRAND.black,
    fontWeight: "700",
  },

  flag: {
    width: 26,
    height: 18,
    borderWidth: 1,
    borderColor: BRAND.greyBorder,
    borderRadius: 3,
    resizeMode: "cover",
  },

  phoneInputWrapper: {
    flex: 1,
    backgroundColor: "#FCFCFC",
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 10,
    minHeight: 54,
    borderWidth: 1.2,
  },

  phoneInput: {
    flex: 1,
    fontFamily: FONT.body,
    fontSize: 16,
    letterSpacing: 0.4,
    color: BRAND.black,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontWeight: "700",
    textAlignVertical: "center",
  },

  clearButton: {
    paddingLeft: 10,
  },

  validBadge: {
    paddingLeft: 6,
    paddingRight: 4,
  },

  helperText: {
    fontFamily: FONT.body,
    marginTop: 6,
    color: BRAND.red,
    fontSize: 12,
    fontWeight: "600",
  },

  caption: {
    fontFamily: FONT.body,
    marginTop: 8,
    color: BRAND.grey,
    fontSize: 12,
  },

  continueButton: {
    backgroundColor: BRAND.purple,
    paddingVertical: 16,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    marginTop: 22,
    flexDirection: "row",
    gap: 8,
    ...SHADOW.md,
  },

  continueButtonText: {
    fontFamily: FONT.body,
    color: BRAND.white,
    fontSize: 16,
    fontWeight: "700",
  },

  continueButtonDisabled: {
    backgroundColor: BRAND.greyLight,
    paddingVertical: 16,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    marginTop: 22,
  },

  continueTextDisabled: {
    fontFamily: FONT.body,
    color: BRAND.grey,
    fontSize: 16,
    fontWeight: "600",
  },
});
