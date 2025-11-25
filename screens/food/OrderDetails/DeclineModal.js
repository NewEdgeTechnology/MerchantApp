// screens/food/OrderDetails/DeclineModal.js
import React from 'react';
import { View, Text, Modal, TextInput, Pressable } from 'react-native';
import { styles } from './orderDetailsStyles';

export default function DeclineModal({
  visible,
  declineReason,
  setDeclineReason,
  canDecline,
  onCancel,
  onConfirm,
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
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
          <Text style={{ fontSize: 11, color: canDecline ? '#16a34a' : '#ef4444', marginTop: 6 }}>
            {canDecline ? 'Looks good.' : 'Please enter at least 3 characters.'}
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            <Pressable
              style={[styles.dialogBtn, { backgroundColor: '#f1f5f9' }]}
              onPress={onCancel}
            >
              <Text style={[styles.dialogBtnText, { color: '#0f172a' }]}>Cancel</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.dialogBtn,
                { backgroundColor: canDecline ? '#ef4444' : '#fecaca', opacity: pressed ? 0.85 : 1 },
              ]}
              onPress={onConfirm}
              disabled={!canDecline}
            >
              <Text style={[styles.dialogBtnText, { color: canDecline ? '#fff' : '#7f1d1d' }]}>
                Decline
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
