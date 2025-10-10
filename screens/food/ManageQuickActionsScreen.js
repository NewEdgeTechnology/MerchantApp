// screens/food/ManageQuickActionsScreen.js
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  StatusBar,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useNavigation, useRoute } from '@react-navigation/native';

const KEY_QUICK_ACTIONS = 'quick_actions_v1';

// Keep this list in sync with HomeTab
const ALL_ACTIONS = [
  { key: 'menu',        icon: 'restaurant-outline', label: 'Menu' },
  { key: 'promos',      icon: 'pricetags-outline',  label: 'Promotions' },
  { key: 'payouts',     icon: 'card-outline',       label: 'Payouts' },
  { key: 'settings',    icon: 'settings-outline',   label: 'Settings' },
  { key: 'orders',      icon: 'receipt-outline',    label: 'Orders' },
  { key: 'addItem',     icon: 'add-circle-outline', label: 'Add item' },
];

const DEFAULT_ACTIONS = ['menu', 'promos', 'payouts', 'settings']; // phone default cap = 4

export default function ManageQuickActionsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState(DEFAULT_ACTIONS);

  const byKey = useMemo(() => Object.fromEntries(ALL_ACTIONS.map(a => [a.key, a])), []);
  const available = useMemo(() => ALL_ACTIONS.filter(a => !selected.includes(a.key)), [selected]);

  useEffect(() => {
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync(KEY_QUICK_ACTIONS);
        if (raw) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr) && arr.length) setSelected(arr);
        }
      } catch {}
    })();
  }, []);

  const persist = useCallback(async (arr) => {
    try { await SecureStore.setItemAsync(KEY_QUICK_ACTIONS, JSON.stringify(arr)); } catch {}
  }, []);

  const move = (from, dir) => {
    const to = from + dir;
    if (to < 0 || to >= selected.length) return;
    const next = selected.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setSelected(next);
  };

  const remove = (key) => {
    const next = selected.filter(k => k !== key);
    setSelected(next);
  };

  const add = (key) => {
    const next = [...selected, key].slice(0, 4); // cap to 4; tweak if you support more
    setSelected(next);
  };

  const reset = () => setSelected(DEFAULT_ACTIONS);

  const saveAndExit = async () => {
    await persist(selected);
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: (insets.top || 0) + 6 }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.iconBtn}
          android_ripple={{ color: 'rgba(0,0,0,0.08)', borderless: true }}
        >
          <Ionicons name="arrow-back" size={24} color="#0f172a" />
        </Pressable>
        <Text style={styles.headerTitle}>Manage quick actions</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: (insets.bottom || 0) + 24 }}>
        <Text style={styles.sectionTitle}>Pinned (shown on Home)</Text>
        <Text style={styles.sectionHelp}>Choose up to 4, reorder with arrows.</Text>

        {selected.length === 0 ? (
          <View style={styles.emptyRow}>
            <Ionicons name="information-circle-outline" size={18} color="#64748b" />
            <Text style={styles.emptyText}>No actions pinned yet</Text>
          </View>
        ) : null}

        {selected.map((k, i) => {
          const a = byKey[k];
          if (!a) return null;
          return (
            <View key={`sel-${k}`} style={styles.rowCard}>
              <View style={styles.rowLeft}>
                <Ionicons name={a.icon} size={18} color="#0f172a" />
                <Text style={styles.rowTitle}>{a.label}</Text>
              </View>
              <View style={styles.rowRight}>
                <Pressable onPress={() => move(i, -1)} style={[styles.pillBtn, styles.pillGray]}>
                  <Ionicons name="arrow-up" size={16} color="#0f172a" />
                </Pressable>
                <Pressable onPress={() => move(i, +1)} style={[styles.pillBtn, styles.pillGray]}>
                  <Ionicons name="arrow-down" size={16} color="#0f172a" />
                </Pressable>
                <Pressable onPress={() => remove(k)} style={[styles.pillBtn, styles.pillRed]}>
                  <Ionicons name="remove-circle-outline" size={16} color="#991b1b" />
                </Pressable>
              </View>
            </View>
          );
        })}

        <Text style={[styles.sectionTitle, { marginTop: 16 }]}>More actions</Text>
        <Text style={styles.sectionHelp}>Tap to add.</Text>

        {available.map((a) => (
          <Pressable
            key={`avail-${a.key}`}
            onPress={() => add(a.key)}
            style={[styles.rowCard, { borderWidth: 1, borderColor: '#e2e8f0' }]}
            android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
          >
            <View style={styles.rowLeft}>
              <Ionicons name={a.icon} size={18} color="#0f172a" />
              <Text style={styles.rowTitle}>{a.label}</Text>
            </View>
            <Ionicons name="add-circle-outline" size={18} color="#00b14f" />
          </Pressable>
        ))}

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
          <Pressable onPress={reset} style={[styles.btn, styles.btnGhost]}>
            <Text style={styles.btnGhostText}>Reset</Text>
          </Pressable>
          <Pressable onPress={saveAndExit} style={[styles.btn, styles.btnPrimary, { flex: 1 }]}>
            <Text style={styles.btnPrimaryText}>Save</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#ffffff' },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: '#0f172a' },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 999 },

  sectionTitle: { fontWeight: '800', color: '#0f172a', fontSize: 16 },
  sectionHelp: { color: '#64748b', marginTop: 4, marginBottom: 10 },

  rowCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowTitle: { fontWeight: '700', color: '#0f172a' },
  rowRight: { flexDirection: 'row', gap: 8 },

  pillBtn: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999 },
  pillGray: { backgroundColor: '#e2e8f0' },
  pillRed: { backgroundColor: '#fee2e2' },

  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  emptyText: { color: '#64748b', fontWeight: '600' },

  btn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGhost: { borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff' },
  btnGhostText: { color: '#0f172a', fontWeight: '800' },
  btnPrimary: { backgroundColor: '#00b14f' },
  btnPrimaryText: { color: '#fff', fontWeight: '800' },
});
