// screens/registrationsteps/HeaderWithSteps.js
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import Icon from "react-native-vector-icons/Ionicons";
import { useNavigation } from "@react-navigation/native";
import { BRAND, FONT, SHADOW } from "../styles/tabdey_brand";

const HeaderWithSteps = ({ step = "Step 1 of 7" }) => {
  const navigation = useNavigation();

  return (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={styles.iconButton}
        activeOpacity={0.7}
      >
        <Icon name="arrow-back" size={24} color={BRAND.black} />
      </TouchableOpacity>

      <Text style={styles.headerTitle}>{step}</Text>

      <TouchableOpacity
        onPress={() => navigation.navigate("HelpScreen")}
        style={styles.iconButton}
        activeOpacity={0.7}
      >
        <Icon name="help-circle-outline" size={24} color={BRAND.purple} />
      </TouchableOpacity>
    </View>
  );
};

export default HeaderWithSteps;

const styles = StyleSheet.create({
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
  position: "absolute",
  left: 0,
  right: 0,
  textAlign: "center",
  fontFamily: FONT.header,
  fontSize: 22,
  fontWeight: "700",
  color: BRAND.black,
  zIndex: -1,
},
});