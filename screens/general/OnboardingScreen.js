import React from "react";
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { BRAND, FONT, RADIUS, SHADOW } from "../styles/tabdey_brand";

const OnboardingScreen = () => {
  const navigation = useNavigation();

  const stepImages = [
    require("../../assets/tell.png"),
    require("../../assets/store.png"),
    require("../../assets/contract.jpg"),
  ];

  const steps = [
    {
      title: "Tell us about your business",
      description:
        "Add your business details so customers can recognize and trust your store.",
    },
    {
      title: "Set up your store",
      description:
        "Upload banners, manage your menu and prepare your store profile for customers.",
    },
    {
      title: "Sign your contract",
      description:
        "Review and complete your agreement, then start getting ready to receive orders.",
    },
  ];

  const handleContinue = () => {
    navigation.navigate("SellingTypeScreen");
  };

  return (
    <SafeAreaView style={styles.container} edges={["left", "right", "bottom"]}>
      <View style={styles.topGlow} />

      <View style={styles.inner}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.iconButton}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={24} color={BRAND.black} />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Get Started</Text>

          <TouchableOpacity
            onPress={() => navigation.navigate("HelpScreen")}
            style={styles.iconButton}
            activeOpacity={0.7}
          >
            <Ionicons
              name="help-circle-outline"
              size={24}
              color={BRAND.purple}
            />
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContainer}
        >
          <View style={styles.heroCard}>
            <Text style={styles.brandLabel}>TÀBDEY MERCHANT</Text>

            <Text style={styles.heroTitle}>
              Start selling with Tàbdey
            </Text>

            <Text style={styles.heroSubtitle}>
              Complete a few simple steps to prepare your business profile,
              store setup and contract.
            </Text>
          </View>

          <View style={styles.stepsCard}>
            {steps.map((step, index) => (
              <View
                key={index}
                style={[
                  styles.stepRow,
                  index !== steps.length - 1 && styles.stepDivider,
                ]}
              >
                <View style={styles.imageWrap}>
                  <Image
                    source={stepImages[index]}
                    style={styles.stepImage}
                    resizeMode="cover"
                  />
                </View>

                <View style={styles.stepTextWrap}>
                  <View style={styles.stepTopLine}>
                    <Text style={styles.stepNumber}>STEP {index + 1}</Text>
                  </View>

                  <Text style={styles.stepTitle}>{step.title}</Text>
                  <Text style={styles.stepDescription}>
                    {step.description}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.continueButton}
            onPress={handleContinue}
            activeOpacity={0.88}
          >
            <Text style={styles.continueText}>Continue</Text>
            <Ionicons name="arrow-forward" size={20} color={BRAND.white} />
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

export default OnboardingScreen;

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

  inner: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 42,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
  },

  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: BRAND.white,
    justifyContent: "center",
    alignItems: "center",
    ...SHADOW.sm,
  },

  headerTitle: {
    fontFamily: FONT.header,
    fontSize: 22,
    fontWeight: "700",
    color: BRAND.black,
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
    fontWeight: "700",
    letterSpacing: 1.5,
    color: BRAND.purple,
    marginBottom: 10,
  },

  heroTitle: {
    fontFamily: FONT.header,
    fontSize: 32,
    fontWeight: "700",
    color: BRAND.black,
    lineHeight: 39,
    marginBottom: 10,
  },

  heroSubtitle: {
    fontFamily: FONT.body,
    fontSize: 14,
    lineHeight: 21,
    color: BRAND.grey,
  },

  stepsCard: {
    backgroundColor: BRAND.white,
    borderRadius: 26,
    paddingVertical: 4,
    paddingHorizontal: 16,
    ...SHADOW.sm,
  },

  stepRow: {
    flexDirection: "row",
    paddingVertical: 18,
    alignItems: "center",
  },

  stepDivider: {
    borderBottomWidth: 1,
    borderBottomColor: "#EFE7F7",
  },

  imageWrap: {
    width: 68,
    height: 68,
    borderRadius: 24,
    backgroundColor: "#F4ECFF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
    overflow: "hidden",
  },

  stepImage: {
    width: 58,
    height: 58,
    borderRadius: 20,
  },

  stepTextWrap: {
    flex: 1,
  },

  stepTopLine: {
    marginBottom: 4,
  },

  stepNumber: {
    fontFamily: FONT.body,
    fontSize: 10,
    fontWeight: "800",
    color: BRAND.magenta,
    letterSpacing: 1,
  },

  stepTitle: {
    fontFamily: FONT.body,
    fontSize: 16,
    fontWeight: "700",
    color: BRAND.black,
    marginBottom: 5,
  },

  stepDescription: {
    fontFamily: FONT.body,
    fontSize: 13,
    lineHeight: 18,
    color: BRAND.grey,
  },

  buttonContainer: {
    position: "absolute",
    left: 22,
    right: 22,
    bottom: 24,
  },

  continueButton: {
    backgroundColor: BRAND.purple,
    borderRadius: RADIUS.pill,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    ...SHADOW.md,
  },

  continueText: {
    fontFamily: FONT.body,
    color: BRAND.white,
    fontSize: 16,
    fontWeight: "700",
  },
});