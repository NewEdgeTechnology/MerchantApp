// services/foods/TrackDeliveryDriver.js
// ✅ In-app map
// ✅ Uses OpenStreetMap tiles via expo-osm-sdk
// ✅ Still supports driver live location + OSRM route

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  TouchableOpacity,
  Linking,
  Alert,
} from "react-native";
import { MapView, Marker, Polyline } from "expo-osm-sdk";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { getUserInfo } from "../../../utils/authToken";
import { connectPassengerSocket } from "../../../utils/passengerSocket";

const { height } = Dimensions.get("window");

const G = {
  green: "#00B14F",
  greenDark: "#02874A",
  text: "#0F172A",
  sub: "#6B7280",
  line: "#E5E7EB",
  white: "#FFFFFF",
  gray: "#9CA3AF",
};

const ORDER_STAGES = [
  "PENDING",
  "ASSIGNED",
  "PICKED_UP",
  "ON_ROAD",
  "DELIVERED",
];

const asNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export default function TrackDeliveryDriver({ route, navigation }) {
  const { orderId, order: initialOrder } = route.params || {};

  const mapRef = useRef(null);
  const socketRef = useRef(null);

  const [order, setOrder] = useState(initialOrder || null);
  const [status, setStatus] = useState(
    String(initialOrder?.delivery_status || initialOrder?.status || "PENDING"),
  );
  const [driverPos, setDriverPos] = useState(null);
  const [polyline, setPolyline] = useState([]);
  const [mapError, setMapError] = useState(false);

  const orderIdStr = String(orderId || initialOrder?.order_id || "");

  const pickup = useMemo(() => {
    const o = order || {};
    const lat = asNum(
      o.pickup_lat ?? o.merchant_lat ?? o.restaurant_lat ?? o.pickupLatitude,
    );
    const lng = asNum(
      o.pickup_lng ?? o.merchant_lng ?? o.restaurant_lng ?? o.pickupLongitude,
    );
    if (lat == null || lng == null) return null;
    return { latitude: lat, longitude: lng };
  }, [order]);

  const dropoff = useMemo(() => {
    const o = order || {};
    const lat = asNum(
      o.dropoff_lat ??
        o.deliver_to?.lat ??
        o.delivery_address?.lat ??
        o.deliveryAddress?.lat ??
        o.dropoffLatitude,
    );
    const lng = asNum(
      o.dropoff_lng ??
        o.deliver_to?.lng ??
        o.delivery_address?.lng ??
        o.deliveryAddress?.lng ??
        o.dropoffLongitude,
    );
    if (lat == null || lng == null) return null;
    return { latitude: lat, longitude: lng };
  }, [order]);

  const initialRegion = useMemo(() => {
    const base = pickup || dropoff;
    if (!base) {
      return {
        latitude: 27.4712,
        longitude: 89.6339,
        zoom: 12,
      };
    }
    return {
      latitude: base.latitude,
      longitude: base.longitude,
      zoom: 14,
    };
  }, [pickup, dropoff]);

  // Function to fit map to show all points
  const fitToAllPoints = useCallback(() => {
    if (!mapRef.current) return;

    const points = [];
    if (pickup)
      points.push({ latitude: pickup.latitude, longitude: pickup.longitude });
    if (dropoff)
      points.push({ latitude: dropoff.latitude, longitude: dropoff.longitude });
    if (driverPos)
      points.push({ latitude: driverPos.lat, longitude: driverPos.lng });

    if (points.length === 0) return;

    // Calculate center of all points
    const sumLat = points.reduce((sum, p) => sum + p.latitude, 0);
    const sumLng = points.reduce((sum, p) => sum + p.longitude, 0);
    const centerLat = sumLat / points.length;
    const centerLng = sumLng / points.length;

    // Calculate max distance to determine zoom level
    let maxLatDiff = 0;
    let maxLngDiff = 0;
    points.forEach((p) => {
      maxLatDiff = Math.max(maxLatDiff, Math.abs(p.latitude - centerLat));
      maxLngDiff = Math.max(maxLngDiff, Math.abs(p.longitude - centerLng));
    });

    // Approximate zoom based on distance
    let zoom = 14;
    const maxDiff = Math.max(maxLatDiff, maxLngDiff);
    if (maxDiff > 0.1) zoom = 10;
    else if (maxDiff > 0.05) zoom = 11;
    else if (maxDiff > 0.02) zoom = 12;
    else if (maxDiff > 0.01) zoom = 13;

    mapRef.current.setCamera({
      center: { latitude: centerLat, longitude: centerLng },
      zoom: zoom,
    });
  }, [pickup, dropoff, driverPos]);

  // Fit map when points change
  useEffect(() => {
    if (mapRef.current && (pickup || dropoff || driverPos)) {
      setTimeout(() => {
        fitToAllPoints();
      }, 100);
    }
  }, [pickup, dropoff, driverPos, fitToAllPoints]);

  /* ==================== CONNECT SOCKET ==================== */
  useEffect(() => {
    let mounted = true;

    (async () => {
      const u = await getUserInfo();
      const passengerId = String(u?.user_id || "");

      const s = await connectPassengerSocket(passengerId);
      socketRef.current = s;

      if (s) {
        s.emit("joinOrder", { orderId: orderIdStr }, (ack) => {
          console.log("[joinOrder ACK]", ack);
        });

        s.on("deliveryDriverLocation", (e) => {
          if (!mounted) return;
          if (String(e?.order_id || orderIdStr) !== orderIdStr) return;

          const lat = asNum(e?.lat);
          const lng = asNum(e?.lng);
          if (lat == null || lng == null) return;

          setDriverPos({ lat, lng });
        });

        s.on("orderStatus", (e) => {
          if (!mounted) return;
          if (String(e?.order_id) !== orderIdStr) return;
          setStatus(String(e?.status || ""));
        });
      }
    })();

    return () => {
      mounted = false;
      const s = socketRef.current;
      if (s) {
        s.emit("leaveOrder", { orderId: orderIdStr });
        s.off("deliveryDriverLocation");
        s.off("orderStatus");
      }
    };
  }, [orderIdStr]);

  /* ==================== ROUTE DRAW (OSRM) ==================== */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const o = order || {};
      const pLat = asNum(o.pickup_lat ?? o.merchant_lat ?? o.restaurant_lat);
      const pLng = asNum(o.pickup_lng ?? o.merchant_lng ?? o.restaurant_lng);
      const dLat = asNum(
        o.dropoff_lat ?? o.deliver_to?.lat ?? o.delivery_address?.lat,
      );
      const dLng = asNum(
        o.dropoff_lng ?? o.deliver_to?.lng ?? o.delivery_address?.lng,
      );

      if (pLat == null || pLng == null || dLat == null || dLng == null) return;

      try {
        const coords = [`${pLng},${pLat}`, `${dLng},${dLat}`];
        const url = `https://router.project-osrm.org/route/v1/driving/${coords.join(
          ";",
        )}?overview=full&geometries=geojson`;

        const res = await fetch(url);
        const j = await res.json();
        if (!j?.routes?.length) return;

        const line = j.routes[0].geometry.coordinates.map(([lng, lat]) => ({
          latitude: lat,
          longitude: lng,
        }));

        if (!cancelled) setPolyline(line);
      } catch (error) {
        console.log("[OSRM] Error fetching route:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [order]);

  const stageIndex = ORDER_STAGES.indexOf(String(status || "").toUpperCase());

  // Call driver function (if phone number available)
  const onCallDriver = useCallback(() => {
    const driverPhone = order?.driver_phone || order?.driver?.phone;
    if (!driverPhone) {
      Alert.alert("No phone", "Driver phone number not available yet.");
      return;
    }
    try {
      Linking.openURL(`tel:${driverPhone}`);
    } catch {
      Alert.alert("Cannot call", "Your device cannot place calls.");
    }
  }, [order]);

  return (
    <View style={styles.container}>
      {!mapError && (pickup || dropoff) ? (
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={initialRegion}
          onError={() => setMapError(true)}
        >
          {/* Pickup/Merchant Marker */}
          {pickup && (
            <Marker
              latitude={pickup.latitude}
              longitude={pickup.longitude}
              title="Merchant"
            >
              <View style={styles.merchantMarker}>
                <Icon name="store" size={20} color="#ffffff" />
              </View>
            </Marker>
          )}

          {/* Dropoff/Delivery Marker */}
          {dropoff && (
            <Marker
              latitude={dropoff.latitude}
              longitude={dropoff.longitude}
              title="Delivery address"
            >
              <View style={styles.dropoffMarker}>
                <Icon name="map-marker" size={20} color="#ffffff" />
              </View>
            </Marker>
          )}

          {/* Driver Marker */}
          {driverPos && (
            <Marker
              latitude={driverPos.lat}
              longitude={driverPos.lng}
              title="Driver"
            >
              <View style={styles.driverMarker}>
                <Icon name="bike" size={20} color="#ffffff" />
              </View>
            </Marker>
          )}

          {/* Route Polyline */}
          {polyline.length > 0 && (
            <Polyline coordinates={polyline} color={G.green} width={5} />
          )}
        </MapView>
      ) : (
        <View style={styles.errorContainer}>
          <Icon name="map-outline" size={48} color={G.gray} />
          <Text style={styles.errorText}>
            {mapError ? "Failed to load map" : "No location data available"}
          </Text>
        </View>
      )}

      <View style={styles.sheet}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Tracking Order #{orderIdStr}</Text>
          {order?.driver_phone && (
            <TouchableOpacity onPress={onCallDriver} style={styles.callBtn}>
              <Icon name="phone" size={18} color={G.green} />
              <Text style={styles.callBtnText}>Call</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.statusRow}>
          {ORDER_STAGES.map((s, i) => (
            <View key={s} style={styles.stageWrap}>
              <View
                style={[
                  styles.dot,
                  i <= stageIndex && { backgroundColor: G.green },
                ]}
              />
              <Text
                style={[styles.stageText, i <= stageIndex && { color: G.text }]}
              >
                {s.replace("_", " ")}
              </Text>
            </View>
          ))}
        </View>

        {!driverPos && (
          <View style={{ marginTop: 12 }}>
            <ActivityIndicator color={G.green} />
            <Text style={{ textAlign: "center", marginTop: 6, color: G.sub }}>
              Waiting for driver location…
            </Text>
          </View>
        )}

        {driverPos && (
          <View style={styles.infoRow}>
            <Icon name="bike" size={16} color={G.green} />
            <Text style={styles.infoText}>Driver is on the way</Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={() => {
            if (mapRef.current) {
              fitToAllPoints();
            }
          }}
        >
          <Icon name="crosshairs" size={16} color={G.green} />
          <Text style={styles.refreshBtnText}>Center map</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },

  errorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  errorText: {
    marginTop: 12,
    fontSize: 14,
    color: G.gray,
    fontWeight: "600",
  },

  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    backgroundColor: "#fff",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 10,
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },

  title: {
    fontSize: 16,
    fontWeight: "800",
    color: G.text,
    flex: 1,
  },

  callBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0FDF4",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: G.green,
  },
  callBtnText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: "700",
    color: G.green,
  },

  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },

  stageWrap: { alignItems: "center", flex: 1 },

  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: G.line,
    marginBottom: 6,
  },

  stageText: {
    fontSize: 10,
    textAlign: "center",
    color: G.gray,
    fontWeight: "600",
  },

  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: G.line,
  },
  infoText: {
    marginLeft: 8,
    fontSize: 12,
    color: G.green,
    fontWeight: "600",
  },

  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
    paddingVertical: 10,
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: G.line,
  },
  refreshBtnText: {
    marginLeft: 8,
    fontSize: 12,
    fontWeight: "600",
    color: G.text,
  },

  merchantMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: G.green,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#ffffff",
  },

  dropoffMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: G.gray,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#ffffff",
  },

  driverMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: G.greenDark,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#ffffff",
  },
});
