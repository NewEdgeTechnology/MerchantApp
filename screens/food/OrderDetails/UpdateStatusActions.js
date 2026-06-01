// screens/food/OrderDetails/UpdateStatusActions.js
import React from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { styles } from "./orderDetailsStyles";
import { BRAND, FONT, RADIUS, SHADOW } from "../../styles/tabdey_brand";

export default function UpdateStatusActions({
  status,
  isCancelledByCustomer,
  isTerminalNegative,
  isTerminalSuccess,
  isBothOption,
  isGrabSelected,
  isPlatformDelivery,
  isSelfSelected,
  updating,
  next,
  primaryLabel,
  onPrimaryAction,
  doUpdate,
  onDecline,
  driverAccepted,
}) {
  // Determine if this is a Grab/Platform delivery
  const isGrabDelivery = isPlatformDelivery || (isBothOption && isGrabSelected);

  return (
    <>
      <Text style={styles.sectionTitle}>Update status</Text>
      {isCancelledByCustomer ? (
        <Text style={styles.terminalNote}>
          This order was cancelled by the customer. No further actions.
        </Text>
      ) : isTerminalNegative || isTerminalSuccess ? (
        <Text style={styles.terminalNote}>No further actions.</Text>
      ) : (
        <View style={styles.actionsRow}>
          {status === "PENDING" ? (
            <>
              <Pressable
                onPress={() => doUpdate("CONFIRMED")}
                disabled={updating}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  { opacity: updating || pressed ? 0.85 : 1 },
                ]}
              >
                <Ionicons
                  name="checkmark-circle-outline"
                  size={18}
                  color={BRAND.white}
                />
                <Text style={styles.primaryBtnText}>Accept</Text>
              </Pressable>

              <Pressable
                onPress={onDecline}
                disabled={updating}
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  {
                    borderColor: BRAND.red,
                    opacity: updating || pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Ionicons
                  name="close-circle-outline"
                  size={18}
                  color={BRAND.red}
                />
                <Text
                  style={[
                    styles.secondaryBtnText,
                    {
                      color: BRAND.red,
                      fontFamily: FONT.body,
                    },
                  ]}
                >
                  Decline
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              {primaryLabel ? (
                <Pressable
                  onPress={() => {
                    if (next) onPrimaryAction();
                  }}
                  disabled={
                    updating ||
                    (status === "READY" &&
                      // ONLY disable for GRAB deliveries without driver
                      // NEVER disable for SELF delivery
                      isGrabDelivery &&
                      !driverAccepted)
                  }
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    {
                      opacity:
                        updating ||
                        (status === "READY" &&
                          isGrabDelivery &&
                          !driverAccepted) ||
                        pressed
                          ? 0.85
                          : 1,
                    },
                  ]}
                >
                  <Ionicons
                    name="arrow-forward-circle"
                    size={18}
                    color={BRAND.white}
                  />
                  <Text style={styles.primaryBtnText}>{primaryLabel}</Text>
                </Pressable>
              ) : null}

              {/* ✅ Show "Waiting for driver" message ONLY for GRAB deliveries (not SELF) */}
              {status === "READY" && isGrabDelivery && !driverAccepted && (
                <Text
                  style={{
                    color: BRAND.grey,
                    fontFamily: FONT.body,
                  }}
                >
                  Waiting for driver to accept…
                </Text>
              )}
            </>
          )}
        </View>
      )}
    </>
  );
}
