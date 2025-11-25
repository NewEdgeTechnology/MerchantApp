// screens/food/OrderDetails/MetaSection.js
import React from 'react';
import { View, TextInput, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from './orderDetailsStyles';
import { Row } from './OrderAtoms';

export default function MetaSection({
  order,
  status,
  fulfillment,
  fulfillmentLower,
  deliveryOptionDisplay,
  ifUnavailableDisplay,
  estimatedArrivalDisplay,
  etaText,
  etaShortText,
  manualPrepMin,
  setManualPrepMin,
  restaurantNote,
}) {
  return (
    <View style={{ marginTop: 12, gap: 8 }}>
      <Row icon="person-outline" text={order.customer_name || '—'} />
      <Row icon="bicycle-outline" text={`Fulfillment: ${fulfillment || '—'}`} />
      <Row icon="swap-horizontal-outline" text={`Delivery by: ${deliveryOptionDisplay || '—'}`} />
      {!!ifUnavailableDisplay && (
        <Row icon="help-buoy-outline" text={`If unavailable: ${ifUnavailableDisplay}`} />
      )}
      {fulfillmentLower === 'delivery' && !!estimatedArrivalDisplay && (
        <Row icon="time-outline" text={`Customer ETA: ${estimatedArrivalDisplay}`} />
      )}
      <Row icon="card-outline" text={`Payment: ${order.payment_method || '—'}`} />

      {fulfillmentLower !== 'pickup' && (
        <Row icon="navigate-outline" text={order.delivery_address || '—'} />
      )}

      {fulfillmentLower === 'delivery' && (
        <>
          <Row icon="map-outline" text={etaText} />
          {status === 'PENDING' ? (
            <View style={styles.timeRow}>
              <Ionicons name="time-outline" size={16} color="#64748b" />
              <TextInput
                placeholder="Time to prepare (minutes)"
                keyboardType="numeric"
                value={manualPrepMin}
                onChangeText={setManualPrepMin}
                style={styles.timeInput}
              />
            </View>
          ) : (
            <View style={styles.timeRow}>
              <Ionicons name="time-outline" size={16} color="#64748b" />
              <Text style={[styles.rowText, { fontSize: 13 }]}>
                {etaShortText}
              </Text>
            </View>
          )}
        </>
      )}

      {fulfillmentLower === 'pickup' && (
        <View style={styles.timeBlock}>
          {status === 'PENDING' ? (
            <View style={styles.timeRow}>
              <Ionicons name="time-outline" size={16} color="#64748b" />
              <TextInput
                placeholder="Time to prepare (minutes)"
                keyboardType="numeric"
                value={manualPrepMin}
                onChangeText={setManualPrepMin}
                style={styles.timeInput}
              />
            </View>
          ) : (
            <View style={styles.timeRow}>
              <Ionicons name="time-outline" size={16} color="#64748b" />
              <Text style={styles.timeHint}>
                Time to prepare
                {Number(manualPrepMin) > 0
                  ? ` ~${Math.round(Number(manualPrepMin))} min`
                  : ' not set'}
              </Text>
            </View>
          )}

          {Number(manualPrepMin) > 0 && (
            <Text style={styles.timeHint}>
              Estimated time to get ready ~{Math.round(Number(manualPrepMin))} min
            </Text>
          )}
        </View>
      )}

      {!!restaurantNote && (
        <View style={styles.noteBox}>
          <Ionicons name="chatbubble-ellipses-outline" size={14} color="#0f766e" />
          <Text style={styles.noteText} numberOfLines={6}>{restaurantNote}</Text>
        </View>
      )}
    </View>
  );
}
