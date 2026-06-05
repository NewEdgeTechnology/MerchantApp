import React, { useCallback, useRef, useState } from "react";
import {
  Animated,
  Modal,
  Platform,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Icon from "react-native-vector-icons/Feather";
import { C, F } from "../theme/index";

// ─── Type configs ──────────────────────────────────────────────────────────────
const ALERT_ICONS = {
  confirm: { name: "help-circle",  color: C.brand,   bg: C.brandLightMint },
  success: { name: "check-circle", color: "#9333EA", bg: "#F3E8FF"        }, // Changed to purple
  error:   { name: "alert-circle", color: "#EF4444", bg: "#FEF2F2"        },
  info:    { name: "info",         color: "#9333EA", bg: "#F3E8FF"        }, // Changed to purple
  warn:    { name: "alert-triangle",color: C.warn,   bg: "#FFFBEB"        },
};

const ALERT_BTN_COLOR = {
  confirm: C.brand,
  success: "#9333EA", // Changed to purple
  error:   "#EF4444",
  info:    "#9333EA", // Changed to purple
  warn:    C.warn,
};

// ─── Internal sheet component ──────────────────────────────────────────────────
function AlertSheet({ cfg, anim, onHide }) {
  const backdropOpacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const sheetTY         = anim.interpolate({ inputRange: [0, 1], outputRange: [80, 0] });
  const sheetScale      = anim.interpolate({ inputRange: [0, 1], outputRange: [0.93, 1] });

  const iconCfg   = ALERT_ICONS[cfg.type]   || ALERT_ICONS.info;
  const btnColor  = ALERT_BTN_COLOR[cfg.type] || C.brand;

  return (
    <Modal transparent animationType="none" statusBarTranslucent visible>
      <Animated.View style={{
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.45)",
        justifyContent: "flex-end",
        opacity: backdropOpacity,
      }}>
        {/* Tap backdrop to dismiss on confirm type */}
        <TouchableOpacity
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          activeOpacity={1}
          onPress={() => cfg.type === "confirm" && onHide()}
        />

        <Animated.View style={{
          backgroundColor: C.card,
          borderTopLeftRadius: 26,
          borderTopRightRadius: 26,
          paddingHorizontal: 20,
          paddingTop: 10,
          paddingBottom: Platform.OS === "ios" ? 38 : 24,
          transform: [{ translateY: sheetTY }, { scale: sheetScale }],
        }}>
          {/* Drag handle */}
          <View style={{
            width: 36, height: 4, borderRadius: 2,
            backgroundColor: C.border, alignSelf: "center", marginBottom: 20,
          }} />

          {/* Icon + texts */}
          <View style={{ alignItems: "center", marginBottom: 18 }}>
            <View style={{
              width: 58, height: 58, borderRadius: 18,
              backgroundColor: iconCfg.bg,
              alignItems: "center", justifyContent: "center",
              marginBottom: 14,
            }}>
              <Icon name={iconCfg.name} size={26} color={iconCfg.color} />
            </View>
            <Text style={{
              fontSize: F.size.x3l, fontWeight: F.weight.black,
              color: C.text, textAlign: "center", marginBottom: 6,
            }}>
              {cfg.title}
            </Text>
            <Text style={{
              fontSize: F.size.md, color: C.sub,
              textAlign: "center", lineHeight: F.lineHeight.relaxed,
            }}>
              {cfg.message}
            </Text>
          </View>

          {/* Buttons */}
          <View style={{ gap: 8 }}>
            <TouchableOpacity
              onPress={() => onHide(cfg.primaryAction)}
              activeOpacity={0.85}
              style={{
                backgroundColor: btnColor,
                borderRadius: 14,
                paddingVertical: 13,
                alignItems: "center",
              }}
            >
              <Text style={{
                color: C.white, fontWeight: F.weight.black, fontSize: F.size.md,
              }}>
                {cfg.primaryLabel}
              </Text>
            </TouchableOpacity>

            {!!cfg.secondaryLabel && (
              <TouchableOpacity
                onPress={() => onHide(cfg.secondaryAction)}
                activeOpacity={0.7}
                style={{
                  borderRadius: 14,
                  paddingVertical: 12,
                  alignItems: "center",
                  backgroundColor: C.bg,
                }}
              >
                <Text style={{
                  color: C.sub, fontWeight: F.weight.semibold, fontSize: F.size.md,
                }}>
                  {cfg.secondaryLabel}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
/**
 * Usage:
 *   const { showAlert, alertNode } = useAlert();
 *
 *   showAlert({
 *     type: "confirm" | "success" | "error" | "info" | "warn",
 *     title: "...",
 *     message: "...",
 *     primaryLabel: "...",
 *     primaryAction: () => {},       // optional
 *     secondaryLabel: "...",         // optional — renders a second button
 *     secondaryAction: () => {},     // optional
 *   });
 *
 *   // Drop alertNode anywhere in the JSX tree:
 *   return <View>...{alertNode}</View>;
 */
export function useAlert() {
  const [cfg, setCfg] = useState(null);
  const anim = useRef(new Animated.Value(0)).current;

  const showAlert = useCallback((newCfg) => {
    setCfg(newCfg);
    anim.setValue(0);
    Animated.spring(anim, {
      toValue: 1, tension: 68, friction: 10, useNativeDriver: true,
    }).start();
  }, [anim]);

  const hideAlert = useCallback((after) => {
    Animated.timing(anim, {
      toValue: 0, duration: 180, useNativeDriver: true,
    }).start(() => {
      setCfg(null);
      after?.();
    });
  }, [anim]);

  const alertNode = cfg ? (
    <AlertSheet cfg={cfg} anim={anim} onHide={hideAlert} />
  ) : null;

  return { showAlert, alertNode };
}