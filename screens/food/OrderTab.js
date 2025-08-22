// OrdersTab.js
// Orders list tab body (no footer)

import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

const OrderItem = ({ item, isTablet, money }) => (
  <View style={styles.orderCard}>
    <View style={styles.orderRow}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons
          name={item.type === 'Delivery' ? 'bicycle-outline' : 'bag-outline'}
          size={isTablet ? 18 : 16}
          color="#0f172a"
        />
        <Text style={[styles.orderId, { fontSize: isTablet ? 15 : 14 }]}>
          {item.id}
        </Text>
        <Text style={[styles.orderTime, { fontSize: isTablet ? 13 : 12 }]}>
          • {item.time}
        </Text>
      </View>
      <Text style={[styles.orderTotal, { fontSize: isTablet ? 16 : 15 }]}>
        {money(item.total, 'Nu')}
      </Text>
    </View>
    <Text
      style={[styles.orderItems, { fontSize: isTablet ? 14 : 13 }]}
      numberOfLines={2}
    >
      {item.items}
    </Text>
  </View>
);

export default function OrdersTab({ isTablet, orders, money }) {
  return (
    <View style={{ paddingHorizontal: 16 }}>
      <View style={{ marginTop: 12, marginBottom: 8 }}>
        <Text style={[styles.sectionTitle, { fontSize: isTablet ? 18 : 16 }]}>
          All orders
        </Text>
      </View>
      <FlatList
        contentContainerStyle={{ paddingBottom: 24 }}
        data={orders}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <OrderItem isTablet={isTablet} money={money} item={item} />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontWeight: '700',
    color: '#0f172a', // ✅ matches HomeTab headings
  },
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  orderId: {
    fontWeight: '700',
    color: '#111827', // ✅ same as menu item title
  },
  orderTime: {
    color: '#6b7280', // ✅ matches metadata in HomeTab
    fontWeight: '500',
  },
  orderTotal: {
    fontWeight: '700',
    color: '#0f172a', // ✅ consistent with prices in HomeTab
  },
  orderItems: {
    marginTop: 6,
    color: '#475569', // ✅ same tone as announcement subtitle
    fontWeight: '500',
  },
});
