// screens/food/OrderDetails/DeliveryMethodChooser.js
// ✅ UPDATED: "Choose delivery method" shows ONLY "Deliver in group"

import React from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { styles } from "./orderDetailsStyles";
import { RowTitle } from "./OrderAtoms";

export default function DeliveryMethodChooser({
  status,
  isBothOption,
  isTerminalNegative,
  isTerminalSuccess,
  driverAccepted,
  driverSummaryText,

  // ✅ show/hide + click handler
  showDeliverInGroup = true,
  onDeliverInGroup,
}) {
  // If not BOTH or already terminal/cancelled → show nothing at all
  if (!isBothOption || isTerminalNegative || isTerminalSuccess) return null;

  // Once a driver is accepted, ALWAYS show only driver details (no chooser)
  if (driverAccepted) {
    return (
      <View style={[styles.block, { marginTop: 12 }]}>
        <RowTitle title="Assigned driver" />
        <Text style={[styles.segmentHint, { marginTop: 4, fontWeight: "600" }]}>
          {driverSummaryText || "Driver assigned"}
        </Text>
      </View>
    );
  }

  // Only when order is READY → show the button
  if (status !== "READY") return null;

  if (!showDeliverInGroup) return null;

  return (
    <View style={[styles.block, { marginTop: 12 }]}>
      <RowTitle title="Choose delivery method" />

      <Pressable
        onPress={onDeliverInGroup}
        style={{
          alignSelf: "flex-start",
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 14,
          height: 42,
          borderRadius: 12,
          marginTop: 10,
          borderWidth: 1,
          borderColor: "#e5e7eb",
          backgroundColor: "#fff",
        }}
      >
        <Ionicons name="grid-outline" size={16} color="#0f172a" />
        <Text style={{ fontSize: 13, fontWeight: "700", color: "#0f172a" }}>
          Deliver in group
        </Text>
      </Pressable>

      <Text style={[styles.segmentHint, { marginTop: 8 }]}>
        Deliver multiple nearby orders together.
      </Text>
    </View>
  );
}
