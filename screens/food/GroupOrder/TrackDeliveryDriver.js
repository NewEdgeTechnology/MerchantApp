// services/foods/TrackDeliveryDriver.js
// ✅ In-app map
// ✅ Uses OpenStreetMap tiles (UrlTile)
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
import MapView, { Marker, Polyline, UrlTile } from "react-native-maps";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
// import { getUserInfo } from "../../utils/authToken";
// import { connectPassengerSocket } from "../../utils/passengerSocket";
// import { getSocket } from "../../utils/socket";

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

const ORDER_STAGES = ["PENDING", "ASSIGNED", "PICKED_UP", "ON_ROAD", "DELIVERED"];

const asNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export default function TrackDeliveryDriver({ route, navigation }) {
  const { orderId, order: initialOrder } = route.params || {};

  const mapRef = useRef(null);
  const socketRef = useRef(null);

  const [order, setOrder] = useState(initialOrder || null);
  const [status, setStatus] = useState(String(initialOrder?.delivery_status || initialOrder?.status || "PENDING"));
  const [driverPos, setDriverPos] = useState(null);
  const [polyline, setPolyline] = useState([]);

  const orderIdStr = String(orderId || initialOrder?.order_id || "");

  const pickup = useMemo(() => {
    const o = order || {};
    const lat = asNum(o.pickup_lat ?? o.merchant_lat ?? o.restaurant_lat ?? o.pickupLatitude);
    const lng = asNum(o.pickup_lng ?? o.merchant_lng ?? o.restaurant_lng ?? o.pickupLongitude);
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
        o.dropoffLatitude
    );
    const lng = asNum(
      o.dropoff_lng ??
        o.deliver_to?.lng ??
        o.delivery_address?.lng ??
        o.deliveryAddress?.lng ??
        o.dropoffLongitude
    );
    if (lat == null || lng == null) return null;
    return { latitude: lat, longitude: lng };
  }, [order]);

  const initialRegion = useMemo(() => {
    const base = pickup || dropoff;
    return {
      latitude: base?.latitude ?? 27.4712,
      longitude: base?.longitude ?? 89.6339,
      latitudeDelta: 0.03,
      longitudeDelta: 0.03,
    };
  }, [pickup, dropoff]);

  /* ==================== CONNECT SOCKET ==================== */
  useEffect(() => {
    let mounted = true;

    (async () => {
      const u = await getUserInfo();
      const passengerId = String(u?.user_id || "");

      connectPassengerSocket(passengerId);
      const s = getSocket();
      socketRef.current = s;

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
      const dLat = asNum(o.dropoff_lat ?? o.deliver_to?.lat ?? o.delivery_address?.lat);
      const dLng = asNum(o.dropoff_lng ?? o.deliver_to?.lng ?? o.delivery_address?.lng);

      if (pLat == null || pLng == null || dLat == null || dLng == null) return;

      try {
        const coords = [`${pLng},${pLat}`, `${dLng},${dLat}`];
        const url = `https://router.project-osrm.org/route/v1/driving/${coords.join(
          ";"
        )}?overview=full&geometries=geojson`;

        const res = await fetch(url);
        const j = await res.json();
        if (!j?.routes?.length) return;

        const line = j.routes[0].geometry.coordinates.map(([lng, lat]) => ({
          latitude: lat,
          longitude: lng,
        }));

        if (!cancelled) setPolyline(line);
      } catch {}
    })();

    return () => {
      cancelled = true;
    };
  }, [order]);

  const stageIndex = ORDER_STAGES.indexOf(String(status || "").toUpperCase());

  return (
    <View style={styles.container}>
      <MapView ref={mapRef} style={StyleSheet.absoluteFill} initialRegion={initialRegion}>
        {/* ✅ OSM tiles */}
        <UrlTile
          urlTemplate="https://a.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maximumZ={19}
          flipY={false}
        />

        {pickup && (
          <Marker coordinate={pickup} title="Merchant">
            <Icon name="store" size={34} color={G.green} />
          </Marker>
        )}

        {dropoff && (
          <Marker coordinate={dropoff} title="Delivery address">
            <Icon name="map-marker" size={34} color={G.gray} />
          </Marker>
        )}

        {driverPos && (
          <Marker
            coordinate={{ latitude: driverPos.lat, longitude: driverPos.lng }}
            title="Driver"
          >
            <Icon name="bike" size={30} color={G.greenDark} />
          </Marker>
        )}

        {polyline.length > 0 && (
          <Polyline coordinates={polyline} strokeWidth={5} strokeColor={G.green} />
        )}
      </MapView>

      <View style={styles.sheet}>
        <Text style={styles.title}>Tracking Order #{orderIdStr}</Text>

        <View style={styles.statusRow}>
          {ORDER_STAGES.map((s, i) => (
            <View key={s} style={styles.stageWrap}>
              <View style={[styles.dot, i <= stageIndex && { backgroundColor: G.green }]} />
              <Text style={[styles.stageText, i <= stageIndex && { color: G.text }]}>
                {s.replace("_", " ")}
              </Text>
            </View>
          ))}
        </View>

        {!driverPos && (
          <View style={{ marginTop: 12 }}>
            <ActivityIndicator color={G.green} />
            <Text style={{ textAlign: "center", marginTop: 6 }}>
              Waiting for driver location…
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },

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

  title: {
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 12,
    color: G.text,
  },

  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
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
  },
});
