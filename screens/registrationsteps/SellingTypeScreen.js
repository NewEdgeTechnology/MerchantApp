// screens/registrationsteps/SellingTypeScreen.js
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import HeaderWithSteps from "./HeaderWithSteps";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/Ionicons";
import { BRAND, FONT, RADIUS, SHADOW } from "../styles/tabdey_brand";

const FOOD_IMAGE_URL =
  "https://backend.tabdhey.bt/admin/uploads/logo_and_image/logo_1781244547584_dec4og20ws.webp";

const MART_IMAGE_URL =
  "https://backend.tabdhey.bt/admin/uploads/logo_and_image/logo_1781244655298_keee5i4jstr.webp";

const SellingTypeScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();

  const goFood = () => {
    navigation.navigate("SignupScreen", {
      ...(route.params ?? {}),
      serviceType: "food",
      owner_type: "food",
    });
  };

  const goMart = () => {
    navigation.navigate("SignupScreen", {
      ...(route.params ?? {}),
      serviceType: "mart",
      owner_type: "mart",
    });
  };

  return (
    <SafeAreaView
      style={styles.container}
      edges={["left", "top", "right", "bottom"]}
    >
      <View style={styles.topGlow} />

      <View style={styles.inner}>
        <HeaderWithSteps step="Step 1 of 7" />

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroCard}>
            <Text style={styles.brandLabel}>TÀBDEY MERCHANT</Text>
            <Text style={styles.title}>Select your business type</Text>
            <Text style={styles.subtitle}>
              Choose the category that fits your business so we can prepare the
              right registration steps, store setup and product options for you.
            </Text>
          </View>

          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.86}
            onPress={goFood}
          >
            <View style={styles.imageWrap}>
              <Image source={{ uri: FOOD_IMAGE_URL }} style={styles.image} />
            </View>

            <View style={styles.cardBody}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.cardTag}>FOOD & BEVERAGES</Text>
                  <Text style={styles.cardTitle}>TàbdeyFood</Text>
                </View>

                <View style={styles.arrowCircle}>
                  <Icon name="arrow-forward" size={18} color={BRAND.purple} />
                </View>
              </View>

              <Text style={styles.cardText}>
                Choose this if your business prepares meals, snacks, bakery
                items, drinks or ready-to-eat food for customer orders.
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.86}
            onPress={goMart}
          >
            <View style={styles.imageWrap}>
              <Image source={{ uri: MART_IMAGE_URL }} style={styles.image} />
            </View>

            <View style={styles.cardBody}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.cardTag}>MART & DAILY ESSENTIALS</Text>
                  <Text style={styles.cardTitle}>TàbdeyMart</Text>
                </View>

                <View style={styles.arrowCircle}>
                  <Icon name="arrow-forward" size={18} color={BRAND.purple} />
                </View>
              </View>

              <Text style={styles.cardText}>
                Choose this if your business sells groceries, packaged products,
                household items, personal care goods or other daily essentials.
              </Text>
            </View>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
};

export default SellingTypeScreen;

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
    paddingHorizontal: 18,
    paddingTop: 0,
  },

  scrollView: {
    flex: 1,
  },

  content: {
    paddingBottom: 36,
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

  card: {
    backgroundColor: BRAND.white,
    borderRadius: 26,
    marginBottom: 18,
    overflow: "hidden",
    ...SHADOW.sm,
  },

  imageWrap: {
    height: 150,
    backgroundColor: "#F4ECFF",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },

  image: {
    width: "100%",
    height: "100%",
  },

  cardBody: {
    padding: 18,
  },

  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },

  cardTag: {
    fontFamily: FONT.body,
    fontSize: 10,
    fontWeight: "800",
    color: BRAND.magenta,
    letterSpacing: 1,
    marginBottom: 4,
  },

  cardTitle: {
    fontFamily: FONT.header,
    fontSize: 21,
    fontWeight: "700",
    color: BRAND.black,
  },

  cardText: {
    fontFamily: FONT.body,
    fontSize: 13,
    lineHeight: 19,
    color: BRAND.grey,
  },

  arrowCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#F4ECFF",
    justifyContent: "center",
    alignItems: "center",
  },
});
