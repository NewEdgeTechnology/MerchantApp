// services/food/GroupOrder/DriverBatchDetailsOverlayScreen.js

import React, { useMemo, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Platform,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";

// ✅ REPLACED MAP IMPORT
import { MapView, Marker } from "expo-osm-sdk";

const isDelivered = (status) => {
  const s = String(status || "")
    .toUpperCase()
    .trim();
  return s === "DELIVERED" || s === "COMPLETED" || s === "COMPLETE";
};

const getOrderId = (order = {}) => {
  const base = order.raw || order;
  const cand = [
    base.order_id,
    base.id,
    base.orderId,
    base.order_no,
    base.orderNo,
    base.order_code,
  ];
  for (const v of cand) {
    if (v != null && String(v).trim().length > 0) return String(v).trim();
  }
  return null;
};

export default function DriverBatchDetailsOverlayScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const route = useRoute();

  const {
    businessId,
    batch_id,
    rideId,
    driverCoords,
    lastPing,
    drops = [],
    orders = [],
    statusMap = {},
    businessCoords,
  } = route.params || {};

  const mapRef = useRef(null);

  const headerTopPad = Math.max(insets.top, 8) + 18;

  // ✅ expo-osm-sdk uses center instead of region
  const initialRegion = useMemo(() => {
    const base = driverCoords || businessCoords || drops?.[0] || null;
    if (!base) return null;
    return {
      latitude: base.lat,
      longitude: base.lng,
      zoom: 14,
    };
  }, [driverCoords, businessCoords, drops]);

  // ❌ fitToCoordinates not supported → keep safe fallback
  const fitAll = useCallback(() => {
    if (!mapRef.current) return;

    const base = driverCoords || businessCoords || drops?.[0];
    if (!base) return;

    mapRef.current.setCamera({
      center: {
        latitude: base.lat,
        longitude: base.lng,
      },
      zoom: 14,
    });
  }, [businessCoords, driverCoords, drops]);

  const renderOrder = ({ item }) => {
    const base = item?.raw || item || {};
    const id = getOrderId(base) || item?.id;
    const st = id ? statusMap?.[id] : "";
    const done = isDelivered(st);
    return (
      <View style={styles.row}>
        <Text style={styles.rowTitle}>#{id || "—"}</Text>
        <View
          style={[styles.badge, done ? styles.badgeDone : styles.badgePending]}
        >
          <Text
            style={[
              styles.badgeText,
              done ? styles.badgeTextDone : styles.badgeTextPending,
            ]}
          >
            {st ? String(st).toUpperCase().replace(/_/g, " ") : "—"}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right", "bottom"]}>
      <View style={[styles.headerBar, { paddingTop: headerTopPad }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={22} color="#0f172a" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Driver details</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.metaCard}>
        <Text style={styles.metaMain}>
          Ride #{rideId || "—"} · Batch #{batch_id ?? "—"}
        </Text>
        <Text style={styles.metaSub}>Business ID: {businessId ?? "—"}</Text>
        {!!lastPing && (
          <Text style={styles.metaSub}>Last update: {lastPing}</Text>
        )}
        <Text style={styles.metaSub}>
          Orders in view: {orders?.length ?? 0}
        </Text>
      </View>

      <View style={styles.mapWrap}>
        {initialRegion ? (
          <MapView
            ref={mapRef}
            style={styles.map}
            initialRegion={initialRegion}
          >
            {/* BUSINESS */}
            {!!businessCoords && (
              <Marker
                latitude={businessCoords.lat}
                longitude={businessCoords.lng}
                title="Business"
              />
            )}

            {/* DRIVER */}
            {!!driverCoords && (
              <Marker
                latitude={driverCoords.lat}
                longitude={driverCoords.lng}
                title="Driver"
              >
                <View style={styles.carMarker}>
                  <Ionicons name="car" size={16} color="#ffffff" />
                </View>
              </Marker>
            )}

            {/* DROPS */}
            {(drops || []).map((d, idx) => {
              const orderId = d?.key || null;
              const st = orderId ? statusMap?.[orderId] : null;
              const done = isDelivered(st);

              if (done) {
                return (
                  <Marker
                    key={orderId || `${d.lat},${d.lng},${idx}`}
                    latitude={d.lat}
                    longitude={d.lng}
                  >
                    <View style={styles.tickMarkerOuter}>
                      <View style={styles.tickMarkerInner}>
                        <Ionicons name="checkmark" size={16} color="#ffffff" />
                      </View>
                    </View>
                  </Marker>
                );
              }

              return (
                <Marker
                  key={orderId || `${d.lat},${d.lng},${idx}`}
                  latitude={d.lat}
                  longitude={d.lng}
                />
              );
            })}
          </MapView>
        ) : (
          <View style={styles.noMap}>
            <Ionicons name="map-outline" size={28} color="#9ca3af" />
            <Text style={styles.noMapText}>No coordinates yet</Text>
          </View>
        )}

        <View style={styles.mapLegend}>
          <Text style={styles.mapLegendText}>
            <Text style={styles.dotRed}>●</Text> Business ·{" "}
            <Text style={styles.dotCar}>●</Text> Driver ·{" "}
            <Text style={styles.dotOrange}>●</Text> Drops ·{" "}
            <Text style={styles.dotGreen}>●</Text> Delivered ✓
          </Text>
          <TouchableOpacity
            style={styles.fitBtn}
            onPress={fitAll}
            activeOpacity={0.85}
          >
            <Ionicons name="scan-outline" size={16} color="#ffffff" />
            <Text style={styles.fitBtnText}>Fit</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.listHeader}>
        <Text style={styles.listHeaderText}>Orders</Text>
      </View>

      <FlatList
        data={orders}
        keyExtractor={(it) => String(getOrderId(it) || it?.id || Math.random())}
        renderItem={renderOrder}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },

  headerBar: {
    minHeight: 52,
    paddingHorizontal: 12,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    borderBottomColor: "#e5e7eb",
    borderBottomWidth: 1,
    backgroundColor: "#fff",
  },
  backBtn: {
    height: 40,
    width: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "700",
    color: "#0f172a",
  },

  metaCard: {
    margin: 16,
    marginBottom: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
  },
  metaMain: { fontSize: 13, fontWeight: "900", color: "#0f172a" },
  metaSub: { marginTop: 4, fontSize: 11, fontWeight: "700", color: "#6b7280" },

  mapWrap: {
    marginHorizontal: 16,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#fff",
  },
  map: { height: 260, width: "100%" },

  mapLegend: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  mapLegendText: { fontSize: 11, color: "#374151", fontWeight: "900" },

  fitBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#16a34a",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  fitBtnText: { marginLeft: 6, color: "#fff", fontSize: 12, fontWeight: "900" },

  dotRed: { color: "#ef4444" },
  dotGreen: { color: "#16a34a" },
  dotOrange: { color: "#f59e0b" },
  dotCar: { color: "#0f172a" },

  carMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#ffffff",
  },

  tickMarkerOuter: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(22,163,74,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  tickMarkerInner: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#16a34a",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#ffffff",
  },

  noMap: { height: 260, alignItems: "center", justifyContent: "center" },
  noMapText: {
    marginTop: 8,
    fontSize: 12,
    color: "#6b7280",
    fontWeight: "800",
  },

  listHeader: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  listHeaderText: { fontSize: 13, fontWeight: "700", color: "#0f172a" },

  row: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowTitle: { fontSize: 13, fontWeight: "800", color: "#0f172a" },

  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeDone: { backgroundColor: "#ecfdf3", borderColor: "#bbf7d0" },
  badgePending: { backgroundColor: "#fff7ed", borderColor: "#fed7aa" },
  badgeText: { fontSize: 10, fontWeight: "800" },
  badgeTextDone: { color: "#166534" },
  badgeTextPending: { color: "#9a3412" },
});
