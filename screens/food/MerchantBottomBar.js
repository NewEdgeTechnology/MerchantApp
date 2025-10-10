// MerchantBottomBar.js
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Platform, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';

export default function MerchantBottomBar({
  items = [],
  activeKey,
  onChange,
  isTablet = false,
  heightBase,
  softKeyPad,
  style,
}) {
  const insets = useSafeAreaInsets();

  const safeItems = useMemo(() => {
    if (!Array.isArray(items)) {
      if (__DEV__) console.error('MerchantBottomBar: "items" must be an array, got:', items);
      return [];
    }
    return items
      .map((it, idx) => {
        if (!it || typeof it !== 'object' || Array.isArray(it)) {
          if (__DEV__) console.error(`MerchantBottomBar: item[${idx}] is not an object:`, it);
          return null;
        }
        const { key, icon, label } = it;
        if (typeof key !== 'string' || !key) {
          if (__DEV__) console.error(`MerchantBottomBar: item[${idx}].key must be a non-empty string.`, it);
          return null;
        }
        if (typeof icon !== 'string' || !icon) {
          if (__DEV__) console.error(`MerchantBottomBar: item[${idx}].icon must be a non-empty string.`, it);
          return null;
        }
        return { key, icon, label: label == null ? '' : String(label) };
      })
      .filter(Boolean);
  }, [items]);

  const base = typeof heightBase === 'number' ? heightBase : (isTablet ? 84 : 76);
  const pad = typeof softKeyPad === 'number' ? softKeyPad : (Platform.OS === 'android' ? 8 : 16);
  const bottomPad = Math.max(pad, insets.bottom || 0);
  const height = base + bottomPad;

  return (
    <View style={[styles.bottomBar, { height, paddingBottom: bottomPad }, style]}>
      {safeItems.map((item) => {
        const active = activeKey === item.key;
        const isAddButton = item.key === 'Add Menu';

        return (
          <Pressable
            key={item.key}
            style={({ pressed }) => [
              styles.bottomItem,
              isAddButton && styles.addButtonWrap,
              pressed && styles.pressed,
            ]}
            android_ripple={{ color: '#e5e7eb', borderless: false }}
            onPress={() => (typeof onChange === 'function') && onChange(item.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={String(item.label || item.key)}
          >
            {isAddButton ? (
              <View style={[styles.addButton, isTablet && styles.addButtonTablet]}>
                <Ionicons
                  // Prefer a solid plus. If you passed 'add-circle-outline', it will still render fine.
                  name={item.icon || 'add'}
                  size={isTablet ? 34 : 30}
                  color="#fff"
                />
              </View>
            ) : (
              <>
                <Ionicons
                  name={item.icon}
                  size={isTablet ? 22 : 20}
                  color={active ? '#0b8f66' : '#64748b'}
                />
                <Text
                  style={[
                    styles.bottomLabel,
                    { fontSize: isTablet ? 12 : 11 },
                    active ? styles.bottomLabelActive : styles.bottomLabelInactive,
                  ]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {item.label}
                </Text>
              </>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
    paddingTop: 8,
  },
  bottomItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  pressed: { opacity: Platform.OS === 'ios' ? 0.6 : 1 },
  bottomLabel: { marginTop: 4, fontWeight: '600' },
  bottomLabelInactive: { color: '#64748b' },
  bottomLabelActive: { color: '#0b8f66', fontWeight: '700' },

  // TikTok-like Add button styles
  addButtonWrap: {
    // Keep the pressable full height but we will float the button visually
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  addButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#00b14f',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20, // lifts it above the bar
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  addButtonTablet: {
    width: 64,
    height: 64,
    borderRadius: 32,
    marginBottom: 22,
  },
});
