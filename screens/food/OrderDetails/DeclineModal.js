// screens/food/OrderDetails/DeclineModal.js
import React from "react";
import { View, Text, Modal, TextInput, Pressable } from "react-native";
import { styles } from "./orderDetailsStyles";
import { BRAND, FONT, RADIUS, SHADOW ,TEXT} from "../../styles/tabdey_brand";

export default function DeclineModal({
  visible,
  declineReason,
  setDeclineReason,
  canDecline,
  onCancel,
  onConfirm,
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Decline order</Text>
          <Text style={styles.modalSub}>A reason is required:</Text>
          <TextInput
            style={styles.input}
            placeholder="Reason (min 3 characters)"
            value={declineReason}
            onChangeText={setDeclineReason}
            multiline
          />
          <Text
            style={{
              ...TEXT.bodySmall,
              color: canDecline ? BRAND.purple : BRAND.red,
              marginTop: 6,
            }}
          >
            {canDecline ? "Looks good." : "Please enter at least 3 characters."}
          </Text>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            <Pressable
              style={[
                styles.dialogBtn,
                {
                  backgroundColor: BRAND.white,
                  borderWidth: 1,
                  borderColor: "#F3E8FF",
                },
              ]}
              onPress={onCancel}
            >
              <Text style={[styles.dialogBtnText, { color: BRAND.black }]}>
                Cancel
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.dialogBtn,
                {
                  backgroundColor: canDecline ? BRAND.red : BRAND.greyLight,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
              onPress={onConfirm}
              disabled={!canDecline}
            >
              <Text
                style={[
                  styles.dialogBtnText,
                  {
                    color: canDecline ? BRAND.white : BRAND.red,
                  },
                ]}
              >
                Decline
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
