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
import { BRAND, FONT, RADIUS, SHADOW } from '../styles/tabdey_brand';
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
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />
      <View style={styles.topGlow} />

      <View style={styles.headerBar}>
  <Pressable
    onPress={() => navigation.goBack()}
    style={styles.backBtn}
    android_ripple={{ color: 'rgba(0,0,0,0.08)', borderless: true }}
  >
    <Ionicons name="arrow-back" size={22} color={BRAND.black} />
  </Pressable>

  <Text style={styles.headerTitle}>Manage Quick Actions</Text>

  <View style={{ width: 42 }} />
</View>

      <ScrollView
  showsVerticalScrollIndicator={false}
  contentContainerStyle={{
    paddingHorizontal: 18,
    paddingBottom: (insets.bottom || 0) + 30,
  }}
>
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
            style={styles.rowCard}
            android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
          >
            <View style={styles.rowLeft}>
              <Ionicons name={a.icon} size={18} color="#0f172a" />
              <Text style={styles.rowTitle}>{a.label}</Text>
            </View>
            <Ionicons name="add-circle-outline" size={20} color={BRAND.purple} />
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
  safe: {
    flex: 1,
    backgroundColor: '#FBF7FF',
  },

  topGlow: {
    position: 'absolute',
    top: -120,
    right: -90,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: BRAND.purpleLight,
    opacity: 0.38,
  },

  headerBar: {
    minHeight: 54,
    paddingHorizontal: 18,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },

  backBtn: {
    width: 42,
    height: 42,
    borderRadius: RADIUS.full,
    backgroundColor: BRAND.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOW.sm,
  },

  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: FONT.header,
    fontSize: 20,
    fontWeight: '900',
    color: BRAND.black,
  },

  sectionTitle: {
    fontFamily: FONT.header,
    fontWeight: '900',
    color: BRAND.black,
    fontSize: 17,
    marginTop: 6,
  },

  sectionHelp: {
    fontFamily: FONT.body,
    color: BRAND.grey,
    marginTop: 4,
    marginBottom: 12,
    fontWeight: '700',
    fontSize: 13,
  },

  rowCard: {
    backgroundColor: BRAND.white,
    borderRadius: 24,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#F3E8FF',
  },

  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },

  rowTitle: {
    fontFamily: FONT.body,
    fontWeight: '900',
    color: BRAND.black,
    fontSize: 14,
  },

  rowRight: {
    flexDirection: 'row',
    gap: 7,
  },

  pillBtn: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },

  pillGray: {
    backgroundColor: '#F4E9FF',
    borderWidth: 1,
    borderColor: '#F3E8FF',
  },

  pillRed: {
    backgroundColor: '#FFE7EE',
    borderWidth: 1,
    borderColor: '#FFD4DD',
  },

  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: BRAND.white,
    borderWidth: 1,
    borderColor: '#F3E8FF',
    marginBottom: 10,
  },

  emptyText: {
    color: BRAND.grey,
    fontWeight: '800',
  },

  btn: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },

  btnGhost: {
    borderWidth: 1,
    borderColor: '#F3E8FF',
    backgroundColor: BRAND.white,
  },

  btnGhostText: {
    color: BRAND.black,
    fontWeight: '900',
  },

  btnPrimary: {
    backgroundColor: BRAND.purple,
    ...SHADOW.md,
  },

  btnPrimaryText: {
    color: BRAND.white,
    fontWeight: '900',
  },
});
