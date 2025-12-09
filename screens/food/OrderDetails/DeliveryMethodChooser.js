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
  driverSummaryText,
  driverAccepted,
  setDeliveryChoice,
  stopGrabLoop,
  startGrabLoop,
}) {
  // If not BOTH or already terminal/cancelled → show nothing at all
  if (!isBothOption || isTerminalNegative || isTerminalSuccess) {
    return null;
  }

  // Once a driver is accepted, ALWAYS show only driver details (no chooser)
  if (driverAccepted) {
    return (
      <View style={[styles.block, { marginTop: 12 }]}>
        <RowTitle title="Assigned driver" />

        <Text
          style={[
            styles.segmentHint,
            { marginTop: 4, fontWeight: '600' },
          ]}
        >
          {driverSummaryText || 'Driver assigned'}
        </Text>
      </View>
    );
  }

  // Only when order is READY → show the delivery method chooser
  if (status !== 'READY') {
    return null;
  }

  const hintText = (() => {
    if (isSelfSelected) return 'Self delivery selected.';
    if (isGrabSelected) return rideMessage || 'Grab delivery selected.';
    return 'Pick one to continue.';
  })();

  return (
    <View style={[styles.block, { marginTop: 12 }]}>
      <RowTitle title="Choose delivery method" />

      <View style={styles.segmentWrap}>
        {/* SELF BUTTON */}
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

        {/* GRAB BUTTON */}
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
