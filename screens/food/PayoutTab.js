import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Sample data for statements
const sampleStatements = [
  { id: '1', date: '2025-08-01', status: 'Completed', total: 1200, fees: 100, netPayout: 1100 },
  { id: '2', date: '2025-08-08', status: 'Pending', total: 1500, fees: 120, netPayout: 1380 },
  { id: '3', date: '2025-08-15', status: 'Completed', total: 1300, fees: 110, netPayout: 1190 },
  { id: '4', date: '2025-08-22', status: 'Completed', total: 1250, fees: 90, netPayout: 1160 },
  { id: '5', date: '2025-08-29', status: 'Pending', total: 1400, fees: 100, netPayout: 1300 },
];

export default function PayoutsTab({ isTablet }) {
  const [statements, setStatements] = useState(sampleStatements);

  // Handle payout status update (for future enhancements)
  const updatePayoutStatus = (id, status) => {
    setStatements(prevStatements => 
      prevStatements.map(statement => 
        statement.id === id ? { ...statement, status } : statement
      )
    );
  };

  // Combine the stats and payout history into a single data structure
  const data = [
    {
      type: 'stats',
      content: [
        { icon: 'wallet', title: 'Today', value: 'Nu 324.50', subtitle: 'Sales', color: '#16a34a' },
        { icon: 'cart', title: 'Active', value: '3 Orders', subtitle: '', color: '#3b82f6' },
        { icon: 'checkmark-circle', title: 'Accept', value: '98%', subtitle: 'Rate', color: '#e11d48' },
      ]
    },
    {
      type: 'history',
      content: statements
    }
  ];

  // Render different sections based on the type
  const renderItem = ({ item }) => {
    if (item.type === 'stats') {
      return (
        <View style={styles.stats}>
          {item.content.map((stat, index) => (
            <View key={index} style={styles.statItem}>
              <Ionicons name={stat.icon} size={24} color={stat.color} />
              <Text style={styles.statTitle}>{stat.title}</Text>
              <Text style={styles.statValue}>{stat.value}</Text>
              {stat.subtitle && <Text style={styles.statSubtitle}>{stat.subtitle}</Text>}
            </View>
          ))}
        </View>
      );
    }

    if (item.type === 'history') {
      return (
        <>
          <Text style={[styles.title, { fontSize: isTablet ? 18 : 16, marginTop: 20 }]}>Payout History</Text>
          {item.content.map((statement) => (
            <View key={statement.id} style={styles.statementItem}>
              <Text style={styles.date}>{statement.date}</Text>
              <Text style={styles.status}>{statement.status}</Text>
              <Text style={styles.total}>Total: ${statement.total}</Text>
              <Text style={styles.fees}>Fees: -${statement.fees}</Text>
              <Text style={styles.netPayout}>Net Payout: ${statement.netPayout}</Text>
              <TouchableOpacity 
                style={styles.statusButton} 
                onPress={() => updatePayoutStatus(statement.id, 'Paid')}
              >
                <Text style={styles.statusButtonText}>Mark as Paid</Text>
              </TouchableOpacity>
            </View>
          ))}
        </>
      );
    }
  };

  return (
    <FlatList
      data={data}
      keyExtractor={(item, index) => index.toString()}
      renderItem={renderItem}
      contentContainerStyle={styles.contentContainer}
    />
  );
}

const styles = StyleSheet.create({
  contentContainer: { paddingHorizontal: 16, paddingTop: 16, backgroundColor: '#f3f4f6', paddingBottom: 80 }, // Added paddingBottom for footer spacing

  title: { fontWeight: '700', color: '#0f172a', marginBottom: 8 },

  // Stats Section
  stats: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, marginBottom: 24 },
  statItem: { alignItems: 'center', backgroundColor: '#ffffff', padding: 12, borderRadius: 12, flex: 1, marginHorizontal: 8, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 2 },
  statTitle: { fontSize: 12, color: '#4b5563', marginBottom: 4 },
  statValue: { fontSize: 16, fontWeight: '600', color: '#16a34a' }, // Updated green color
  statSubtitle: { fontSize: 12, color: '#e11d48', marginTop: 4 },

  // Payout History Section
  statementItem: {
    marginTop: 20,
    padding: 12,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  date: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  status: { fontSize: 12, color: '#4b5563', marginTop: 4 },
  total: { fontSize: 14, fontWeight: '600', color: '#16a34a', marginTop: 8 }, // Updated green color
  fees: { fontSize: 12, color: '#e11d48', marginTop: 4 },
  netPayout: { fontSize: 14, fontWeight: '700', color: '#1e40af', marginTop: 4 },

  // Mark as Paid Button
  statusButton: {
    marginTop: 12,
    paddingVertical: 10,
    backgroundColor: '#39a962ff', // Updated green color
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14,
  },
});
