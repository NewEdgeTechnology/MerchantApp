// screens/food/OrderDetails/DeliveryMethodChooser.js
// ✅ UPDATED: "Deliver in group" shows like your screenshot — as a separate button on the RIGHT
// ✅ Self + Grab remain as your existing segmented buttons on the LEFT (same row)

import React from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { styles } from "./orderDetailsStyles";
import { RowTitle } from "./OrderAtoms";

export default function DeliveryMethodChooser({
  status,
  isBothOption,
  isTerminalNegative,
  isTerminalSuccess,
  isSelfSelected,
  isGrabSelected,
  sendingGrab,
  rideMessage,
  driverSummaryText,
  driverAccepted,
  setDeliveryChoice,
  stopGrabLoop,
  startGrabLoop,

  // ✅ NEW (pass from OrderDetails)
  showDeliverInGroup = false,
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

  // Only when order is READY → show the delivery method chooser
  if (status !== "READY") return null;

  const hintText = (() => {
    if (isSelfSelected) return "Self delivery selected.";
    if (isGrabSelected) return rideMessage || "Grab delivery selected.";
    return "Pick one to continue.";
  })();

  return (
    <View style={[styles.block, { marginTop: 12 }]}>
      <RowTitle title="Choose delivery method" />

      {/* ✅ Layout like screenshot: Left segmented (Self/Grab) + Right "Deliver in group" */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          marginTop: 10,
        }}
      >
        {/* LEFT: existing segmented buttons */}
        <View style={[styles.segmentWrap, { flex: 1 }]}>
          {/* SELF BUTTON */}
          <Pressable
            onPress={() => {
              setDeliveryChoice("self");
              stopGrabLoop();
            }}
            style={[styles.segmentBtn, isSelfSelected && styles.segmentBtnActive]}
          >
            <Ionicons
              name="person-outline"
              size={16}
              color={isSelfSelected ? "#fff" : "#0f172a"}
            />
            <Text
              style={[
                styles.segmentText,
                { color: isSelfSelected ? "#fff" : "#0f172a" },
              ]}
            >
              Self
            </Text>
          </Pressable>

          {/* GRAB BUTTON */}
          <Pressable
            onPress={() => {
              setDeliveryChoice("grab");
              startGrabLoop();
            }}
            disabled={sendingGrab}
            style={[
              styles.segmentBtn,
              isGrabSelected && styles.segmentBtnActive,
              sendingGrab && { opacity: 0.85 },
            ]}
          >
            {sendingGrab ? (
              <ActivityIndicator
                size="small"
                color={isGrabSelected ? "#fff" : "#0f172a"}
              />
            ) : (
              <Ionicons
                name="bicycle-outline"
                size={16}
                color={isGrabSelected ? "#fff" : "#0f172a"}
              />
            )}
            <Text
              style={[
                styles.segmentText,
                { color: isGrabSelected ? "#fff" : "#0f172a" },
              ]}
            >
              Grab
            </Text>
          </Pressable>
        </View>

        {/* RIGHT: Deliver in group (separate button like screenshot) */}
        {showDeliverInGroup ? (
          <Pressable
            onPress={onDeliverInGroup}
            style={{
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
        ) : null}
      </View>

      <Text style={[styles.segmentHint, { marginTop: 8 }]}>{hintText}</Text>
    </View>
  );
}
