// screens/food/OrderDetails/UpdateStatusActions.js
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from './orderDetailsStyles';

export default function UpdateStatusActions({
  status,
  isCancelledByCustomer,
  isTerminalNegative,
  isTerminalSuccess,
  isBothOption,
  isGrabSelected,
  isPlatformDelivery,
  updating,
  next,
  primaryLabel,
  onPrimaryAction,
  doUpdate,
  onDecline,
  driverAccepted, // NEW
}) {
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
          {status === 'PENDING' ? (
            <>
              <Pressable
                onPress={() => doUpdate('CONFIRMED')}
                disabled={updating}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  { opacity: updating || pressed ? 0.85 : 1 },
                ]}
              >
                <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                <Text style={styles.primaryBtnText}>Accept</Text>
              </Pressable>

              <Pressable
                onPress={onDecline}
                disabled={updating}
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  { borderColor: '#ef4444', opacity: updating || pressed ? 0.85 : 1 },
                ]}
              >
                <Ionicons name="close-circle-outline" size={18} color="#b91c1c" />
                <Text style={[styles.secondaryBtnText, { color: '#991b1b' }]}>
                  Decline
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              {primaryLabel ? (
                <Pressable
                  onPress={() => { if (next) onPrimaryAction(); }}
                  disabled={
                    updating ||
                    (
                      status === 'READY' &&
                      ((isBothOption && isGrabSelected) || (!isBothOption && isPlatformDelivery)) &&
                      !driverAccepted // NEW: only disable while waiting for driver
                    )
                  }
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    {
                      opacity: (
                        updating ||
                        (
                          status === 'READY' &&
                          ((isBothOption && isGrabSelected) ||
                           (!isBothOption && isPlatformDelivery)) &&
                          !driverAccepted
                        ) ||
                        pressed
                      ) ? 0.85 : 1,
                    },
                  ]}
                >
                  <Ionicons name="arrow-forward-circle" size={18} color="#fff" />
                  <Text style={styles.primaryBtnText}>{primaryLabel}</Text>
                </Pressable>
              ) : null}

              {status === 'READY' &&
                ((isBothOption && isGrabSelected) || (!isBothOption && isPlatformDelivery)) &&
                !driverAccepted && (
                  <Text style={{ color: '#64748b', fontWeight: '600' }}>
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
