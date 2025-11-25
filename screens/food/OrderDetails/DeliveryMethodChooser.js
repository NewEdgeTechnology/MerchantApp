// screens/food/OrderDetails/DeliveryMethodChooser.js
import React from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from './orderDetailsStyles';
import { RowTitle } from './OrderAtoms';

export default function DeliveryMethodChooser({
  status,
  isBothOption,
  isTerminalNegative,
  isTerminalSuccess,
  isSelfSelected,
  isGrabSelected,
  sendingGrab,
  rideMessage,
  driverSummaryText,   // e.g. "Keshar Bhujel · 17654321 · Rating: 4.8 (23)"
  driverAccepted,      // NEW
  setDeliveryChoice,
  stopGrabLoop,
  startGrabLoop,
}) {
  // if not READY / BOTH or order already finished, don't show anything
  if (status !== 'READY' || !isBothOption || isTerminalNegative || isTerminalSuccess) {
    return null;
  }

  // AFTER DRIVER ACCEPTED: hide delivery method buttons,
  // show only driver details block
  if (driverAccepted) {
    if (!driverSummaryText) return null; // nothing to show yet

    return (
      <View style={[styles.block, { marginTop: 12 }]}>
        <RowTitle title="Assigned driver" />
        <Text
          style={[
            styles.segmentHint,
            { marginTop: 4, fontWeight: '600' },
          ]}
        >
          {driverSummaryText}
        </Text>
      </View>
    );
  }

  // BEFORE driver acceptance: normal "Choose delivery method" UI
  const hintText = (() => {
    if (isSelfSelected) return 'Self delivery selected.';
    if (isGrabSelected) return rideMessage || 'Grab delivery selected.';
    return 'Pick one to continue.';
  })();

  return (
    <View style={[styles.block, { marginTop: 12 }]}>
      <RowTitle title="Choose delivery method" />
      <View style={styles.segmentWrap}>
        <Pressable
          onPress={() => {
            setDeliveryChoice('self');
            stopGrabLoop();
          }}
          style={[styles.segmentBtn, isSelfSelected && styles.segmentBtnActive]}
        >
          <Ionicons
            name="person-outline"
            size={16}
            color={isSelfSelected ? '#fff' : '#0f172a'}
          />
          <Text
            style={[
              styles.segmentText,
              { color: isSelfSelected ? '#fff' : '#0f172a' },
            ]}
          >
            Self
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            setDeliveryChoice('grab');
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
              color={isGrabSelected ? '#fff' : '#0f172a'}
            />
          ) : (
            <Ionicons
              name="bicycle-outline"
              size={16}
              color={isGrabSelected ? '#fff' : '#0f172a'}
            />
          )}
          <Text
            style={[
              styles.segmentText,
              { color: isGrabSelected ? '#fff' : '#0f172a' },
            ]}
          >
            Grab
          </Text>
        </Pressable>
      </View>

      <Text style={styles.segmentHint}>{hintText}</Text>
    </View>
  );
}
