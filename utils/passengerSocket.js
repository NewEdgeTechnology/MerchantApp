// File: utils/passengerSocket.js
import { io } from "socket.io-client";
import { MY_LOCAL_SOCKET, MY_LOCAL_URL, RIDE_REQUEST_ENDPOINT } from "@env";

/**
 * ✅ Grablike Socket.IO on server:
 *   origin: https://grab.newedge.bt
 *   path:   /grablike/socket.io
 */
const PROD_ORIGIN = "https://grab.newedge.bt";
const PROD_PATH = "/grablike/socket.io";

/** Resolve Socket.IO endpoint from envs (local), otherwise use prod */
function resolveSocketConfig() {
  const raw = (MY_LOCAL_SOCKET || MY_LOCAL_URL || RIDE_REQUEST_ENDPOINT || "").trim();

  // If env points to localhost/dev, use it
  try {
    if (raw) {
      const u = new URL(raw);
      const origin = `${u.protocol}//${u.host}`;

      // if you want to force prod when env is grab.newedge.bt
      if (u.hostname === "grab.newedge.bt") {
        return { origin: PROD_ORIGIN, path: PROD_PATH };
      }

      // local/dev servers usually use default "/socket.io"
      return { origin, path: "/socket.io" };
    }
  } catch {}

  // default to prod grablike socket
  return { origin: PROD_ORIGIN, path: PROD_PATH };
}

let socket = null;
let currentPassengerId = null;

// ✅ Keep last ride + last order so we can rejoin on reconnect
let lastRideId = null;
let lastOrderId = null;

// ✅ prevent join spam (duplicate joinOrder/joinRide logs)
let joinedRideId = null;
let joinedOrderId = null;

// ✅ small de-dupe for frequent location packets
let lastDeliveryLocSig = "";
let lastRideLocSig = "";

function sigForLoc(e) {
  const lat = Number(e?.lat);
  const lng = Number(e?.lng);
  const did = String(e?.driver_id ?? "");
  const ts = Number(e?.ts ?? 0);
  const qLat = Number.isFinite(lat) ? Math.round(lat * 1e5) : "x";
  const qLng = Number.isFinite(lng) ? Math.round(lng * 1e5) : "y";
  return `${did}:${qLat}:${qLng}:${Math.floor(ts / 500)}`;
}

/** Ensure singleton socket exists and is connected */
function ensureSocket(passengerId) {
  const { origin, path } = resolveSocketConfig();

  if (!socket) {
    socket = io(origin, {
      path,

      // ✅ IMPORTANT: keep polling fallback for mobile networks
      transports: ["websocket", "polling"],
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 800,
      reconnectionDelayMax: 7000,
      timeout: 15000,

      auth: { passengerId: passengerId ? String(passengerId) : undefined },
    });

    console.log("[socket] init", { origin, path });

    // ---- Dev universal event tap ----
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      socket.onAny((event, ...args) => {
        try {
          const one = args && args.length ? args[0] : undefined;
          console.log("[socket EVT]", event, one);
        } catch {}
      });
    }

    // ---- Connect lifecycle ----
    socket.on("connect", () => {
      console.log("[socket] connected:", socket.id);

      // (Re)identify
      if (currentPassengerId) {
        socket.emit("whoami", {
          role: "passenger",
          passenger_id: String(currentPassengerId),
        });
      }

      // ✅ Re-join ride room
      if (lastRideId) {
        if (joinedRideId !== String(lastRideId)) {
          socket.emit("joinRide", { rideId: String(lastRideId) }, (ack) => {
            console.log("[rejoinRide ACK]", ack);
          });
          joinedRideId = String(lastRideId);
        }
      }

      // ✅ Re-join order room
      if (lastOrderId) {
        if (joinedOrderId !== String(lastOrderId)) {
          socket.emit("joinOrder", { orderId: String(lastOrderId) }, (ack) => {
            console.log("[rejoinOrder ACK]", ack);
          });
          joinedOrderId = String(lastOrderId);
        }
      }
    });

    socket.on("connect_error", (err) => {
      console.log("[socket connect_error]", err?.message || err);
    });

    socket.on("disconnect", (reason) => {
      console.log("[socket disconnect]", reason);
      joinedRideId = null;
      joinedOrderId = null;
    });
  }

  // Update auth if passenger changes
  if (passengerId && String(passengerId) !== String(currentPassengerId)) {
    currentPassengerId = String(passengerId);
    try {
      socket.auth = { ...(socket.auth || {}), passengerId: currentPassengerId };
      if (socket.connected) {
        socket.emit("whoami", {
          role: "passenger",
          passenger_id: currentPassengerId,
        });
      }
    } catch {}
  }

  if (!socket.connected) {
    try {
      socket.connect();
    } catch {}
  }

  return socket;
}

/* ========================== Public helpers ========================== */

export function connectPassengerSocket(passengerId) {
  return ensureSocket(passengerId);
}

export function getPassengerSocket() {
  return socket;
}

/* ========================== Rooms ========================== */

export function joinRideRoom(rideId, ackCb) {
  const rid = String(rideId);
  lastRideId = rid;

  const s = ensureSocket(currentPassengerId);

  const doJoin = () => {
    if (joinedRideId === rid) return;
    s.emit("joinRide", { rideId: rid }, (ack) => {
      console.log("[joinRide ACK]", ack);
      joinedRideId = rid;
      if (typeof ackCb === "function") ackCb(ack);
    });
  };

  if (s.connected) doJoin();
  else s.once("connect", doJoin);
}

export function leaveRideRoom(rideId, ackCb) {
  const id = String(rideId);
  if (lastRideId === id) lastRideId = null;
  if (joinedRideId === id) joinedRideId = null;

  const s = ensureSocket(currentPassengerId);

  const doLeave = () => {
    s.emit("leaveRide", { rideId: id }, (ack) => {
      console.log("[leaveRide ACK]", ack);
      if (typeof ackCb === "function") ackCb(ack);
    });
  };

  if (s.connected) doLeave();
  else s.once("connect", doLeave);
}

export function joinOrderRoom(orderId, ackCb) {
  const oid = String(orderId);
  lastOrderId = oid;

  const s = ensureSocket(currentPassengerId);

  const doJoin = () => {
    if (joinedOrderId === oid) return;
    s.emit("joinOrder", { orderId: oid }, (ack) => {
      console.log("[joinOrder ACK]", ack);
      joinedOrderId = oid;
      if (typeof ackCb === "function") ackCb(ack);
    });
  };

  if (s.connected) doJoin();
  else s.once("connect", doJoin);
}

export function leaveOrderRoom(orderId, ackCb) {
  const id = String(orderId);
  if (lastOrderId === id) lastOrderId = null;
  if (joinedOrderId === id) joinedOrderId = null;

  const s = ensureSocket(currentPassengerId);

  const doLeave = () => {
    s.emit("leaveOrder", { orderId: id }, (ack) => {
      console.log("[leaveOrder ACK]", ack);
      if (typeof ackCb === "function") ackCb(ack);
    });
  };

  if (s.connected) doLeave();
  else s.once("connect", doLeave);
}

/* ========================== Passenger ride events ========================== */

export function onPassengerEvents({
  onRideAccepted,
  onStageUpdate,
  onFareFinalized,
  onOfferDeclined,
  onRideCancelled,
  onBookingCancelled,
  onBookingStageUpdate,
} = {}) {
  const s = ensureSocket(currentPassengerId);
  const handlers = [];

  const bind = (evt, fn) => {
    if (typeof fn !== "function") return;
    const h = (p) => fn(p);
    s.on(evt, h);
    handlers.push([evt, h]);
  };

  bind("rideAccepted", onRideAccepted);
  bind("rideStageUpdate", onStageUpdate);
  bind("fareFinalized", onFareFinalized);
  bind("rideOfferDeclined", onOfferDeclined);
  bind("rideCancelled", onRideCancelled);
  bind("bookingCancelled", onBookingCancelled);
  bind("bookingStageUpdate", onBookingStageUpdate);

  if (typeof onRideCancelled === "function") {
    const h2 = (p) => {
      try {
        if (p?.state === "cancelled") onRideCancelled(p);
      } catch {}
    };
    s.on("ride:status", h2);
    handlers.push(["ride:status", h2]);
  }

  return () => handlers.forEach(([evt, h]) => s.off(evt, h));
}

/* ===================== LIVE LOCATION listeners ===================== */

export function onDeliveryDriverLocation(handler) {
  const s = ensureSocket(currentPassengerId);

  const h = (e) => {
    const sig = sigForLoc(e);
    if (sig && sig === lastDeliveryLocSig) return;
    lastDeliveryLocSig = sig;
    if (typeof handler === "function") handler(e);
  };

  s.on("deliveryDriverLocation", h);
  return () => s.off("deliveryDriverLocation", h);
}

export function onRideDriverLocation(handler) {
  const s = ensureSocket(currentPassengerId);

  const h = (e) => {
    const sig = sigForLoc(e);
    if (sig && sig === lastRideLocSig) return;
    lastRideLocSig = sig;
    if (typeof handler === "function") handler(e);
  };

  s.on("rideDriverLocation", h);
  return () => s.off("rideDriverLocation", h);
}

export function onDriverLocation(handler) {
  const s = ensureSocket(currentPassengerId);
  const h = (e) => {
    if (typeof handler === "function") handler(e);
  };
  s.on("driverLocationBroadcast", h);
  return () => s.off("driverLocationBroadcast", h);
}

/* ============================= CHAT ============================= */

export function sendChat(
  { request_id, message, attachments = null, temp_id = null },
  ackCb
) {
  const s = ensureSocket(currentPassengerId);
  console.log(s)
  const payload = { request_id, message, attachments, temp_id };
  console.log("[sendChat] payload:", payload);
  s.emit("chat:send", payload, (ack) => {
    if (typeof ackCb === "function") ackCb(ack);
  });
}

export function loadChatHistory(
  { request_id, before_id = null, limit = 50 },
  ackCb
) {
  const s = ensureSocket(currentPassengerId);
  const payload = {
    request_id,
    ...(before_id != null ? { before_id } : {}),
    limit,
  };
  s.emit("chat:history", payload, (ack) => {
    if (typeof ackCb === "function") ackCb(ack);
  });
}

export function setTyping(request_id, is_typing) {
  const s = ensureSocket(currentPassengerId);
  s.emit("chat:typing", { request_id, is_typing: !!is_typing });
}

export function markChatRead({ request_id, last_seen_id }, ackCb) {
  const s = ensureSocket(currentPassengerId);
  s.emit("chat:read", { request_id, last_seen_id }, (ack) => {
    if (typeof ackCb === "function") ackCb(ack);
  });
}

export function onChatEvents({ onNewMessage, onTyping, onRead } = {}) {
  const s = ensureSocket(currentPassengerId);
  const handlers = [];

  if (typeof onNewMessage === "function") {
    const h = (p) => onNewMessage(p?.message, p?.temp_id);
    s.on("chat:new", h);
    handlers.push(["chat:new", h]);
  }
  if (typeof onTyping === "function") {
    const h = (p) => onTyping(p);
    s.on("chat:typing", h);
    handlers.push(["chat:typing", h]);
  }
  if (typeof onRead === "function") {
    const h = (p) => onRead(p);
    s.on("chat:read", h);
    handlers.push(["chat:read", h]);
  }

  return () => handlers.forEach(([evt, h]) => s.off(evt, h));
}