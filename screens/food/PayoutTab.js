// PayoutsTab.js
// Placeholder body for Payouts/Statements

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function PayoutsTab({ isTablet }) {
  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { fontSize: isTablet ? 18 : 16 }]}>Payouts</Text>
      <Text style={[styles.sub, { fontSize: isTablet ? 13 : 12 }]}>Show weekly statements and settlement status.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 16 },
  title: { fontWeight: '700', color: '#0f172a' },
  sub: { color: '#64748b', marginTop: 6 },
});
