// services/food/GroupOrder/socket.js
import io from "socket.io-client";
import { AppState } from "react-native";
import * as SecureStore from "expo-secure-store";

// // From your .env, the correct endpoint is:
// const SOCKET_URL = "https://grab.newedge.bt";
// const SOCKET_PATH = "/grablike/socket.io";

const SOCKET_URL = "https://grab.newedge.bt";
const SOCKET_PATH = "/grablike/socket.io";

let socket = null;
let appStateSub = null;
let currentRideId = null;
let listeners = {};

export function initSocket({ driverId } = {}) {
  if (socket) {
    console.log("[Socket] Socket already exists, returning existing");
    return socket;
  }

  console.log("[Socket] Initializing new socket connection", {
    url: SOCKET_URL,
    path: SOCKET_PATH,
    driverId: driverId || 'not provided'
  });

  socket = io(SOCKET_URL, {
    path: SOCKET_PATH,
    transports: ["websocket", "polling"],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
    auth: { driverId },
    query: { driverId },
  });

  // Setup basic event listeners
  socket.on("connect", () => {
    console.log("[Socket] ✅ Connected successfully. ID:", socket.id);
    
    // Re-join ride if we had one
    if (currentRideId) {
      console.log("[Socket] Re-joining ride:", currentRideId);
      socket.emit("joinRide", { rideId: String(currentRideId) });
    }
  });

  socket.on("disconnect", (reason) => {
    console.log("[Socket] ❌ Disconnected:", reason);
  });

  socket.on("connect_error", (error) => {
    console.log("[Socket] ❌ Connection error:", error.message);
  });

  socket.on("error", (error) => {
    console.log("[Socket] ❌ Error:", error);
  });

  // Handle app state changes (reconnect when app comes to foreground)
  appStateSub = AppState.addEventListener("change", (state) => {
    if (state === "active" && socket && !socket.connected) {
      console.log("[Socket] App foreground - reconnecting...");
      socket.connect();
    }
  });

  return socket;
}

export function getSocket() {
  return socket;
}

export function setCurrentRide(rideId) {
  const rid = rideId ? String(rideId) : null;
  currentRideId = rid;
  
  if (!socket) return;
  
  if (rid && socket.connected) {
    console.log("[Socket] Joining ride:", rid);
    socket.emit("joinRide", { rideId: rid }, (response) => {
      console.log("[Socket] Join ride response:", response);
    });
  }
}

export function onDriverLocation(callback) {
  if (!socket) {
    console.log("[Socket] No socket to listen on");
    return () => {};
  }

  const handler = (data) => {
    console.log("[Socket] 📍 Driver location received");
    callback(data);
  };

  // Listen for all possible location event names
  socket.on("deliveryDriverLocation", handler);
  socket.on("driverLocation", handler);
  socket.on("location", handler);
  socket.on("driver_location", handler);

  // Store for cleanup
  listeners.driverLocation = handler;

  return () => {
    socket.off("deliveryDriverLocation", handler);
    socket.off("driverLocation", handler);
    socket.off("location", handler);
    socket.off("driver_location", handler);
  };
}

export function disconnectSocket() {
  console.log("[Socket] Disconnecting...");
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  if (appStateSub) {
    appStateSub.remove();
    appStateSub = null;
  }
  currentRideId = null;
  listeners = {};
}