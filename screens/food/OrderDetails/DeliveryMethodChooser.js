// screens/food/OrderDetails/DeliveryMethodChooser.js
// ✅ UPDATED: Added PENDING status support
// ✅ UPDATED: "Deliver in group" shows like your screenshot — as a separate button on the RIGHT
// ✅ Self + Grab remain as your existing segmented buttons on the LEFT (same row)

import React from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { styles } from "./orderDetailsStyles";
import { RowTitle } from "./OrderAtoms";
import { BRAND, FONT, RADIUS, SHADOW, TEXT } from "../../styles/tabdey_brand";

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
  if (isTerminalNegative || isTerminalSuccess) return null;

  // Once a driver is accepted, ALWAYS show only driver details (no chooser)
  if (driverAccepted) {
    return (
      <View style={[styles.block, { marginTop: 12 }]}>
        <RowTitle title="Assigned driver" />
        <Text
          style={[
            styles.segmentHint,
            {
              marginTop: 4,
              fontFamily: TEXT.body.fontFamily,
            },
          ]}
        >
          {driverSummaryText || "Driver assigned"}
        </Text>
      </View>
    );
  }

  // ✅ FIXED: Allow PENDING, CONFIRMED, and READY status
  if (!["PENDING", "CONFIRMED", "READY"].includes(status)) return null;

  const hintText = (() => {
    if (isSelfSelected) return "Self delivery selected.";
    if (isGrabSelected) return rideMessage || "Tàbdey  delivery selected.";
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
            style={[
              styles.segmentBtn,
              isSelfSelected && styles.segmentBtnActive,
            ]}
          >
            <Ionicons
              name="person-outline"
              size={16}
              color={isSelfSelected ? BRAND.white : BRAND.black}
            />
            <Text
              style={[
                styles.segmentText,
                {
                  color: isSelfSelected ? BRAND.white : BRAND.black,
                },
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
                color={isGrabSelected ? BRAND.white : BRAND.black}
              />
            ) : (
              <Ionicons
                name="bicycle-outline"
                size={16}
                color={isGrabSelected ? BRAND.white : BRAND.black}
              />
            )}
            <Text
              style={[
                styles.segmentText,
                { color: isGrabSelected ? BRAND.white : BRAND.black },
              ]}
            >
              Tàbdey
            </Text>
          </Pressable>
        </View>

        {/* RIGHT: Deliver in group button (optional) */}
        {showDeliverInGroup && (
          <Pressable onPress={onDeliverInGroup} style={styles.groupButton}>
            <Ionicons name="people-outline" size={16} color={BRAND.purple} />
            <Text style={styles.groupButtonText}>Deliver{"\n"}in group</Text>
          </Pressable>
        )}
      </View>

      <Text style={[styles.segmentHint, { marginTop: 8 }]}>{hintText}</Text>
    </View>
  );
}
