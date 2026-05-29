// MerchantBottomBar.js
import React, { useMemo } from "react";
import { View, Text, StyleSheet, Platform, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { BRAND, FONT, RADIUS, SHADOW } from "../styles/tabdey_brand";

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
      if (__DEV__)
        console.error(
          'MerchantBottomBar: "items" must be an array, got:',
          items,
        );
      return [];
    }

    return items
      .map((it, idx) => {
        if (!it || typeof it !== "object" || Array.isArray(it)) {
          if (__DEV__)
            console.error(
              `MerchantBottomBar: item[${idx}] is not an object:`,
              it,
            );
          return null;
        }

        const { key, icon, label, badge } = it;

        if (typeof key !== "string" || !key) {
          if (__DEV__)
            console.error(
              `MerchantBottomBar: item[${idx}].key must be a non-empty string.`,
              it,
            );
          return null;
        }
        if (typeof icon !== "string" || !icon) {
          if (__DEV__)
            console.error(
              `MerchantBottomBar: item[${idx}].icon must be a non-empty string.`,
              it,
            );
          return null;
        }

        const badgeNum = Number(badge ?? 0);
        const safeBadge = Number.isFinite(badgeNum) ? Math.max(0, badgeNum) : 0;

        return {
          key,
          icon,
          label: label == null ? "" : String(label),
          badge: safeBadge,
        };
      })
      .filter(Boolean);
  }, [items]);

  const base = typeof heightBase === "number" ? heightBase : isTablet ? 84 : 76;
  const pad =
    typeof softKeyPad === "number"
      ? softKeyPad
      : Platform.OS === "android"
        ? 8
        : 16;

  const bottomPad = Math.max(pad, insets.bottom || 0);
  const height = base + bottomPad;

  const renderBadge = (value) => {
    const n = Number(value || 0);
    if (!Number.isFinite(n) || n <= 0) return null;

    const text = n > 99 ? "99+" : String(n);

    return (
      <View style={[styles.badge, isTablet && styles.badgeTablet]}>
        <Text style={[styles.badgeText, isTablet && styles.badgeTextTablet]}>
          {text}
        </Text>
      </View>
    );
  };

  return (
    <View
      style={[styles.bottomBar, { height, paddingBottom: bottomPad }, style]}
    >
      {safeItems.map((item) => {
        const active = activeKey === item.key;
        const isAddButton = item.key === "Add Menu";

        return (
          <Pressable
            key={item.key}
            style={({ pressed }) => [
              styles.bottomItem,
              isAddButton && styles.addButtonWrap,
              pressed && styles.pressed,
            ]}
            android_ripple={{ color: BRAND.greyLight, borderless: false }}
            onPress={() => typeof onChange === "function" && onChange(item.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={String(item.label || item.key)}
          >
            {isAddButton ? (
              <View
                style={[styles.addButton, isTablet && styles.addButtonTablet]}
              >
                <Ionicons
                  name={item.icon || "add"}
                  size={isTablet ? 34 : 30}
                  color={BRAND.white}
                />
              </View>
            ) : (
              <>
                <View style={styles.iconBox}>
                  <Ionicons
                    name={item.icon}
                    size={isTablet ? 22 : 20}
                    color={active ? BRAND.purple : BRAND.grey}
                  />
                  {renderBadge(item.badge)}
                </View>

                <Text
                  style={[
                    styles.bottomLabel,
                    { fontSize: isTablet ? 12 : 11 },
                    active
                      ? styles.bottomLabelActive
                      : styles.bottomLabelInactive,
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
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: BRAND.white,
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BRAND.greyLight,
    paddingTop: 6,
    ...SHADOW.md,
  },

  pressed: { opacity: Platform.OS === "ios" ? 0.6 : 1 },

  bottomItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
  },

  iconBox: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 30,
    minHeight: 24,
  },

  bottomLabel: {
    marginTop: 3,
    fontFamily: FONT.body,
    fontWeight: "800",
  },

  bottomLabelInactive: {
    color: BRAND.grey,
  },

  bottomLabelActive: {
    color: BRAND.purple,
    fontWeight: "900",
  },

  badge: {
    position: "absolute",
    top: -6,
    right: -12,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: RADIUS.full,
    backgroundColor: BRAND.red,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: BRAND.white,
  },

  badgeText: {
    color: BRAND.white,
    fontFamily: FONT.body,
    fontWeight: "900",
    fontSize: 10,
  },
  badgeTablet: {
    top: -7,
    right: -14,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
  },
  badgeTextTablet: { fontSize: 11 },

  addButtonWrap: {
    alignItems: "center",
    justifyContent: "flex-start",
  },

  addButton: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.full,
    backgroundColor: BRAND.purple,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
    ...SHADOW.md,
  },

  addButtonTablet: {
    width: 62,
    height: 62,
    borderRadius: RADIUS.full,
    marginBottom: 20,
  },
});
