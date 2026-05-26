// screens/registrationsteps/SignupScreen.js
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableWithoutFeedback,
  Keyboard,
  Switch,
} from "react-native";
import * as SecureStore from "expo-secure-store";
import Icon from "react-native-vector-icons/Ionicons";
import { useNavigation, useRoute } from "@react-navigation/native";
import HeaderWithSteps from "./HeaderWithSteps";
import { SafeAreaView } from "react-native-safe-area-context";
import { BRAND, FONT, RADIUS, SHADOW } from "../styles/tabdey_brand";

export default function SignupScreen() {
  const navigation = useNavigation();
  const route = useRoute();

  const {
    merchant: incomingMerchant = {},
    initialEmail = null,
    initialPassword = null,
    returnTo = null,
    serviceType,
    owner_type,
  } = route.params ?? {};

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [savePassword, setSavePassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isEmailFocused, setIsEmailFocused] = useState(false);
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", () =>
      setKeyboardVisible(true),
    );
    const hideSub = Keyboard.addListener("keyboardDidHide", () =>
      setKeyboardVisible(false),
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    (async () => {
      const seededEmail = (
        initialEmail ??
        incomingMerchant?.email ??
        ""
      ).trim();
      const seededPassword =
        initialPassword ?? incomingMerchant?.password ?? "";

      if (seededEmail) setEmail(seededEmail);
      if (seededPassword) setPassword(seededPassword);

      if (!seededEmail || !seededPassword) {
        try {
          const [savedEmail, savedPw] = await Promise.all([
            SecureStore.getItemAsync("saved_email"),
            SecureStore.getItemAsync("saved_password"),
          ]);
          if (!seededEmail && savedEmail && savedPw) setEmail(savedEmail);
          if (!seededPassword && savedEmail && savedPw) {
            setPassword(savedPw);
            setSavePassword(true);
          }
        } catch {}
      }
    })();
  }, []);

  const isValidEmail = (val) => {
    const v = String(val ?? "").trim();
    return v.includes("@") && v.includes(".");
  };

  const checkRules = {
    length: password.length >= 8,
    upperLower: /[A-Z]/.test(password) && /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    noSpace: /^\S*$/.test(password),
    noRepeat: !/(.)\1{3,}/.test(password),
  };

  const isValidPassword = Object.values(checkRules).every(Boolean);
  const isFormValid = isValidEmail(email) && isValidPassword;
  const showPasswordRules = isPasswordFocused && password.length > 0;

  const handleContinue = async () => {
    if (!isFormValid) return;

    try {
      if (savePassword) {
        await SecureStore.setItemAsync("saved_email", email.trim());
        await SecureStore.setItemAsync("saved_password", password);
      } else {
        await SecureStore.deleteItemAsync("saved_email");
        await SecureStore.deleteItemAsync("saved_password");
      }
    } catch {}

    const mergedMerchant = {
      ...incomingMerchant,
      email: email.trim(),
      password,
      owner_type:
        owner_type ?? serviceType ?? incomingMerchant?.owner_type ?? undefined,
    };

    navigation.navigate("PhoneNumberScreen", {
      ...(route.params ?? {}),
      serviceType,
      owner_type: owner_type ?? serviceType,
      merchant: mergedMerchant,
      initialPhone: incomingMerchant?.phone ?? null,
      returnTo,
    });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right", "bottom"]}>
      <View style={styles.topGlow} />

      <View style={styles.page}>
        <HeaderWithSteps step="Step 1 of 7" />

        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={{ flex: 1 }}>
              <ScrollView
                contentContainerStyle={[
                  styles.scrollContainer,
                  { paddingBottom: keyboardVisible ? 20 : 120 },
                ]}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.heroCard}>
                  <Text style={styles.brandLabel}>TÀBDEY MERCHANT</Text>
                  <Text style={styles.title}>Set up your login</Text>
                  <Text style={styles.subtitle}>
                    Create your email and password to continue merchant
                    registration.
                  </Text>
                </View>

                <View style={styles.formCard}>
                  <Text style={styles.label}>Email</Text>
                  <View
                    style={[
                      styles.inputWrapper,
                      {
                        borderColor: isEmailFocused
                          ? BRAND.purple
                          : BRAND.greyBorder,
                      },
                    ]}
                  >
                    <TextInput
                      style={styles.inputField}
                      placeholder="e.g. name@email.com"
                      placeholderTextColor={BRAND.grey}
                      value={email}
                      onChangeText={setEmail}
                      onFocus={() => setIsEmailFocused(true)}
                      onBlur={() => setIsEmailFocused(false)}
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </View>

                  <Text style={styles.label}>Password</Text>
                  <View
                    style={[
                      styles.passwordContainer,
                      {
                        borderColor: isPasswordFocused
                          ? BRAND.purple
                          : BRAND.greyBorder,
                      },
                    ]}
                  >
                    <TextInput
                      style={styles.passwordInput}
                      placeholder="Enter password"
                      placeholderTextColor={BRAND.grey}
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      onFocus={() => setIsPasswordFocused(true)}
                      onBlur={() => setIsPasswordFocused(false)}
                      autoCapitalize="none"
                      keyboardType="email-address"
                    />

                    <TouchableOpacity
                      onPress={() => setShowPassword(!showPassword)}
                      style={styles.eyeIcon}
                    >
                      <Icon
                        name={showPassword ? "eye-off-outline" : "eye-outline"}
                        size={20}
                        color={BRAND.grey}
                      />
                    </TouchableOpacity>
                  </View>

                  {showPasswordRules && (
                    <View style={styles.rulesContainer}>
                      {[
                        { rule: "8 characters", valid: checkRules.length },
                        {
                          rule: "1 upper case & 1 lower case",
                          valid: checkRules.upperLower,
                        },
                        { rule: "1 number", valid: checkRules.number },
                        { rule: "No space", valid: checkRules.noSpace },
                        {
                          rule: "No more than 3 repeated characters",
                          valid: checkRules.noRepeat,
                        },
                      ].map((item, index) => (
                        <View key={index} style={styles.ruleItemRow}>
                          <Icon
                            name={
                              item.valid
                                ? "checkmark-circle"
                                : "ellipse-outline"
                            }
                            size={15}
                            color={item.valid ? BRAND.purple : BRAND.grey}
                            style={{ marginRight: 7 }}
                          />
                          <Text
                            style={[
                              styles.ruleItem,
                              item.valid && styles.ruleItemValid,
                            ]}
                          >
                            {item.rule}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}

                  <View style={styles.toggleRow}>
                    <View style={styles.toggleTextWrap}>
                      <Text style={styles.toggleTitle}>Save login details</Text>
                      <Text style={styles.toggleSubtitle}>
                        Keep this email and password saved on this device.
                      </Text>
                    </View>

                    <Switch
                      value={savePassword}
                      onValueChange={setSavePassword}
                      trackColor={{
                        false: BRAND.greyLight,
                        true: BRAND.purpleLight,
                      }}
                      thumbColor={savePassword ? BRAND.purple : BRAND.white}
                    />
                  </View>
                </View>
              </ScrollView>

              <View
                style={[
                  styles.bottomSticky,
                  { paddingBottom: keyboardVisible ? 10 : 24 },
                ]}
              >
                <TouchableOpacity
                  style={
                    isFormValid
                      ? styles.continueButton
                      : styles.continueButtonDisabled
                  }
                  onPress={handleContinue}
                  disabled={!isFormValid}
                  activeOpacity={0.86}
                >
                  <Text
                    style={
                      isFormValid
                        ? styles.continueButtonText
                        : styles.continueTextDisabled
                    }
                  >
                    Continue
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
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
    flex: 1,
  },

  scrollContainer: {
    paddingBottom: 120,
  },

  heroCard: {
    backgroundColor: BRAND.white,
    borderRadius: 28,
    padding: 22,
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
    marginBottom: 18,
    padding: 18,
    ...SHADOW.sm,
  },

  label: {
    fontFamily: FONT.body,
    marginBottom: 6,
    fontSize: 14,
    fontWeight: "700",
    color: BRAND.black,
  },

  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.2,
    borderRadius: 18,
    paddingHorizontal: 16,
    marginBottom: 18,
    height: 56,
    backgroundColor: "#FCFCFC",
  },

  inputField: {
    flex: 1,
    fontFamily: FONT.body,
    fontSize: 15,
    color: BRAND.black,
    paddingVertical: 10,
  },

  passwordContainer: {
    flexDirection: "row",
    borderWidth: 1.2,
    borderRadius: 18,
    alignItems: "center",
    paddingHorizontal: 16,
    paddingRight: 14,
    marginBottom: 14,
    height: 56,
    backgroundColor: "#FCFCFC",
  },

  passwordInput: {
    flex: 1,
    fontFamily: FONT.body,
    fontSize: 15,
    color: BRAND.black,
    paddingVertical: 10,
    paddingRight: 8,
  },

  eyeIcon: {
    padding: 4,
  },

  rulesContainer: {
    backgroundColor: "#FBF7FF",
    borderRadius: 18,
    padding: 14,
    marginBottom: 18,
  },

  ruleItemRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },

  ruleItem: {
    fontFamily: FONT.body,
    fontSize: 12,
    color: BRAND.grey,
  },

  ruleItemValid: {
    color: BRAND.purple,
    fontWeight: "700",
  },

  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FBF7FF",
    borderRadius: 18,
    padding: 14,
  },

  toggleTextWrap: {
    flex: 1,
    paddingRight: 12,
  },

  toggleTitle: {
    fontFamily: FONT.body,
    fontSize: 14,
    fontWeight: "700",
    color: BRAND.black,
    marginBottom: 3,
  },

  toggleSubtitle: {
    fontFamily: FONT.body,
    fontSize: 12,
    lineHeight: 17,
    color: BRAND.grey,
  },

  bottomSticky: {
    paddingTop: 14,
    paddingBottom: 24,
    backgroundColor: "#FBF7FF",
  },

  continueButton: {
    backgroundColor: BRAND.purple,
    paddingVertical: 16,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
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
  },

  continueTextDisabled: {
    fontFamily: FONT.body,
    color: BRAND.grey,
    fontSize: 16,
    fontWeight: "600",
  },
});
