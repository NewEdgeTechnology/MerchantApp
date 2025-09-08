// screens/settings/NotificationSettings.js
import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, Switch, TouchableOpacity, Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { setSmallItem, getItem } from './secureStorePatch'; // <— use wrapper

const { width } = Dimensions.get('window');
const THEME_GREEN = '#16a34a';
const KEY_MASK = 'notif_mask_v1'; // tiny single value

// Define each toggle as a bit position (0..31)
const FLAGS = {
  newOrders: 0,
  orderStatusChanges: 1,
  riderArrival: 2,
  customerChat: 3,
  lowStockAlerts: 4,
  autoHideOOS: 5,
  openCloseReminders: 6,
  busyModeReminders: 7,
  payoutProcessed: 8,
  refundDisputes: 9,
  newReviews: 10,
  ratingDrops: 11,
  promoApprovals: 12,
  promoPerformance: 13,
  systemAnnouncements: 14,
  maintenanceNotices: 15,
};

// Helpers to set/get bits on a 32-bit number
const hasBit = (mask, bit) => ((mask >>> bit) & 1) === 1;
const setBit = (mask, bit, on) => on ? (mask | (1 << bit)) : (mask & ~(1 << bit));

export default function NotificationSettings() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const [mask, setMask] = useState(0); // all flags packed into one int
  const get = (k) => hasBit(mask, FLAGS[k]);
  const put = (k, on) => setMask((m) => setBit(m, FLAGS[k], on));

  // Load compact mask once
  useEffect(() => {
    (async () => {
      const saved = await getItem(KEY_MASK);
      if (saved) {
        // saved like "0x1A3F" or decimal string
        const value = saved.startsWith('0x') ? parseInt(saved, 16) : parseInt(saved, 10);
        if (!Number.isNaN(value)) setMask(value >>> 0);
      } else {
        // defaults
        let m = 0;
        m = setBit(m, FLAGS.newOrders, true);
        m = setBit(m, FLAGS.orderStatusChanges, true);
        m = setBit(m, FLAGS.riderArrival, true);
        m = setBit(m, FLAGS.customerChat, true);
        m = setBit(m, FLAGS.payoutProcessed, true);
        m = setBit(m, FLAGS.refundDisputes, true);
        m = setBit(m, FLAGS.newReviews, true);
        m = setBit(m, FLAGS.ratingDrops, true);
        m = setBit(m, FLAGS.promoApprovals, true);
        m = setBit(m, FLAGS.systemAnnouncements, true);
        m = setBit(m, FLAGS.maintenanceNotices, true);
        setMask(m >>> 0);
      }
    })();
  }, []);

  const goBack = () => navigation.goBack();

  const handleSave = async () => {
    // Store as hex string (shortest + human-friendly)
    await setSmallItem(KEY_MASK, '0x' + (mask >>> 0).toString(16).toUpperCase());
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      {/* Header (same as your SecuritySettings) */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 8) + 10 }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notification Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.container}>
        {/* Orders */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Orders</Text>
          <Text style={styles.muted}>Updates that help you prepare and hand off orders on time.</Text>

          <Row label="New Orders"           value={get('newOrders')}           onChange={(v)=>put('newOrders', v)} />
          <Row label="Order Status Changes" value={get('orderStatusChanges')}  onChange={(v)=>put('orderStatusChanges', v)} />
          <Row label="Rider/Driver Arrival" value={get('riderArrival')}        onChange={(v)=>put('riderArrival', v)} />
          <Row label="Customer Chat"        value={get('customerChat')}        onChange={(v)=>put('customerChat', v)} />
        </View>

        {/* Operations */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Operations</Text>
          <Text style={styles.muted}>Keep your menu accurate and store status in sync.</Text>

          <Row label="Low-Stock Alerts"      value={get('lowStockAlerts')}      onChange={(v)=>put('lowStockAlerts', v)} />
          <Row label="Auto-Hide Out-of-Stock"value={get('autoHideOOS')}         onChange={(v)=>put('autoHideOOS', v)} />
          <Row label="Open/Close Reminders"  value={get('openCloseReminders')}  onChange={(v)=>put('openCloseReminders', v)} />
          <Row label="Busy-Mode Reminders"   value={get('busyModeReminders')}   onChange={(v)=>put('busyModeReminders', v)} />
        </View>

        {/* Finance & Reputation */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Finance & Reputation</Text>
          <Text style={styles.muted}>Money in and how customers rate you.</Text>

          <Row label="Payout Processed" value={get('payoutProcessed')} onChange={(v)=>put('payoutProcessed', v)} />
          <Row label="Refunds & Disputes" value={get('refundDisputes')} onChange={(v)=>put('refundDisputes', v)} />
          <Row label="New Reviews"        value={get('newReviews')}     onChange={(v)=>put('newReviews', v)} />
          <Row label="Rating Drops"       value={get('ratingDrops')}    onChange={(v)=>put('ratingDrops', v)} />
        </View>

        {/* Marketing & System */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Marketing & System</Text>
          <Text style={styles.muted}>Promos performance and platform-wide notices.</Text>

          <Row label="Promo Approvals"          value={get('promoApprovals')}      onChange={(v)=>put('promoApprovals', v)} />
          <Row label="Promo Performance (Weekly)" value={get('promoPerformance')} onChange={(v)=>put('promoPerformance', v)} />
          <Row label="System Announcements"     value={get('systemAnnouncements')} onChange={(v)=>put('systemAnnouncements', v)} />
          <Row label="Maintenance Notices"      value={get('maintenanceNotices')}  onChange={(v)=>put('maintenanceNotices', v)} />
        </View>

        <TouchableOpacity style={styles.saveButton} onPress={handleSave} activeOpacity={0.85}>
          <Ionicons name="save-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.saveButtonText}>Save</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

/* --- tiny row component --- */
function Row({ label, value, onChange }) {
  return (
    <View style={rowStyles.row}>
      <Text style={rowStyles.rowLabel}>{label}</Text>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    marginTop: 6, flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: 6,
  },
  rowLabel: { fontSize: width > 400 ? 15 : 14, color: '#0f172a' },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f6f8fa' },
  header: {
    minHeight: 52, paddingHorizontal: 12, paddingBottom: 8,
    flexDirection: 'row', alignItems: 'center',
    borderBottomWidth: 1, borderBottomColor: '#e5e7eb', backgroundColor: '#fff',
  },
  backBtn: { height: 40, width: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: '#0f172a' },
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  card: {
    backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e5e7eb',
    padding: 14, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 8 },
  muted: { fontSize: 13, color: '#64748b', marginBottom: 10, lineHeight: 18 },
  saveButton: {
    marginTop: 8, marginBottom: 16, backgroundColor: THEME_GREEN,
    paddingVertical: 14, borderRadius: 12, alignItems: 'center',
    justifyContent: 'center', flexDirection: 'row',
  },
  saveButtonText: { color: '#fff', fontSize: width > 400 ? 16 : 15, fontWeight: '700' },
});
