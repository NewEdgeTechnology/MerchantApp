// screens/food/OrderDetails/TotalsBlock.js
import React from 'react';
import { View, Text } from 'react-native';
import { styles } from './orderDetailsStyles';

export default function TotalsBlock({ itemsCount, totalLabel }) {
  return (
    <View style={styles.block}>
      <View style={styles.totRow}>
        <Text style={styles.totLabel}>Items</Text>
        <Text style={styles.totValue}>{itemsCount}</Text>
      </View>
      <View style={styles.totRow}>
        <Text style={styles.totLabelStrong}>Total</Text>
        <Text style={styles.totValueStrong}>{totalLabel}</Text>
      </View>
    </View>
  );
}
