// utils/passengerSocket.js
import { io } from "socket.io-client";
import { MY_LOCAL_URL, RIDE_REQUEST_ENDPOINT } from "@env";

/** Resolve Socket.IO endpoint from envs */
function socketBaseURL() {
  const raw = (MY_LOCAL_URL || RIDE_REQUEST_ENDPOINT || "").trim();
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.host}`; // strip path to just host:port
  } catch {
    return "http://localhost:3000";
  }
}

/** Resolve HTTP base from envs (preserve path like /rides) */
function httpBaseURL() {
  const raw = (MY_LOCAL_URL || RIDE_REQUEST_ENDPOINT || "").trim();
  try {
    const u = new URL(raw);
    // keep any path (e.g., /rides) because your routes live under it
    return `${u.protocol}//${u.host}${u.pathname.replace(/\/$/, "")}`;
  } catch {
    return "http://localhost:3000";
  }
}

let socket = null;
let currentPassengerId = null;

// ✅ Keep last ride + last order so we can rejoin on reconnect
let lastRideId = null;
let lastOrderId = null;

/** Ensure singleton socket exists and is connected */
function ensureSocket(passengerId) {
  const baseURL = socketBaseURL();

  if (!socket) {
    socket = io(baseURL, {
      transports: ["websocket"],
      autoConnect: false,
      reconnection: true,
      reconnectionDelayMax: 5000,
      auth: { passengerId: passengerId ? String(passengerId) : undefined },
    });

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
      // (Re)identify
      if (currentPassengerId) {
        socket.emit("whoami", {
          role: "passenger",
          passenger_id: String(currentPassengerId),
        });
      }

      // ✅ Re-join ride room (transport live location, chat, etc.)
      if (lastRideId) {
        socket.emit("joinRide", { rideId: String(lastRideId) }, (ack) => {
          console.log("[rejoinRide ACK]", ack);
        });
      }

      // ✅ Re-join order room (TrackOrder live delivery)
      if (lastOrderId) {
        socket.emit("joinOrder", { orderId: String(lastOrderId) }, (ack) => {
          console.log("[rejoinOrder ACK]", ack);
        });
      }
    });

    socket.on("connect_error", (err) => {
      console.log("[socket connect_error]", err?.message || err);
    });

    socket.on("disconnect", (reason) => {
      console.log("[socket disconnect]", reason);
    });
  }

  // Update auth if passenger changes (and re-identify if connected)
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

/* ========================== Ride rooms ========================== */

export function connectPassengerSocket(passengerId) {
  return ensureSocket(passengerId);
}

/** expose the singleton (already connected by connectPassengerSocket) */
export function getPassengerSocket() {
  return ensureSocket(currentPassengerId);
}

export function joinRideRoom(rideId, ackCb) {
  lastRideId = String(rideId);
  const s = ensureSocket(currentPassengerId);

  const doJoin = () => {
    s.emit("joinRide", { rideId: lastRideId }, (ack) => {
      console.log("[joinRide ACK]", ack);
      if (typeof ackCb === "function") ackCb(ack);
    });
  };

  if (s.connected) doJoin();
  else s.once("connect", doJoin);
}

export function leaveRideRoom(rideId, ackCb) {
  const id = String(rideId);
  if (lastRideId === id) lastRideId = null;

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

/* ========================== Order rooms (NEW) ========================== */
/**
 * TrackOrder screen:
 * - call joinOrderRoom(orderId) once when screen opens
 * - listen to "deliveryDriverLocation"
 */
export function joinOrderRoom(orderId, ackCb) {
  lastOrderId = String(orderId);
  const s = ensureSocket(currentPassengerId);

  const doJoin = () => {
    s.emit("joinOrder", { orderId: lastOrderId }, (ack) => {
      console.log("[joinOrder ACK]", ack);
      if (typeof ackCb === "function") ackCb(ack);
    });
  };

  if (s.connected) doJoin();
  else s.once("connect", doJoin);
}

export function leaveOrderRoom(orderId, ackCb) {
  const id = String(orderId);
  if (lastOrderId === id) lastOrderId = null;

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

/* =========== Resolve passenger's current ride from backend =========== */
/**
 * Calls GET /passenger/current-ride?passenger_id=:id
 * Returns: request_id as string, or null if none.
 */
export async function resolveCurrentRideId(passengerId) {
  const pid = String(passengerId || currentPassengerId || "").trim();
  console.log("[resolveCurrentRideId] pid =", pid);
  if (!pid) return null;

  const raw = (MY_LOCAL_URL || RIDE_REQUEST_ENDPOINT || "").trim();
  console.log("[resolveCurrentRideId] env base =", raw);

  let base;
  try {
    const u = new URL(raw);
    base = `${u.protocol}//${u.host}${u.pathname.replace(/\/$/, "")}`;
  } catch {
    base = "http://localhost:3000";
  }
  console.log("[resolveCurrentRideId] computed base =", base);

  const endsWithRides = /\/rides$/i.test(base);
  const urls = [
    `${base}/passenger/current-ride?passenger_id=${encodeURIComponent(pid)}`,
    endsWithRides
      ? null
      : `${base}/rides/passenger/current-ride?passenger_id=${encodeURIComponent(
          pid
        )}`,
  ].filter(Boolean);

  for (const url of urls) {
    try {
      console.log("[resolveCurrentRideId] GET", url);
      const res = await fetch(url, { method: "GET" });
      const text = await res.text().catch(() => "");
      console.log(
        "[resolveCurrentRideId] HTTP",
        res.status,
        text?.slice(0, 200) || "<no body>"
      );

      if (!res.ok) continue;

      let json = {};
      try {
        json = JSON.parse(text);
      } catch {}
      const rid =
        json?.data?.request_id ??
        json?.data?.ride_id ??
        json?.data?.rideId ??
        null;
      if (json?.ok && rid != null) {
        console.log("[resolveCurrentRideId] OK ->", rid);
        return String(rid);
      }
    } catch (e) {
      console.log("[resolveCurrentRideId] fetch error", e?.message);
    }
  }
  return null;
}

/* ========================== Ride signals ========================= */

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

  if (typeof onRideAccepted === "function") {
    const h = (p) => onRideAccepted(p);
    s.on("rideAccepted", h);
    handlers.push(["rideAccepted", h]);
  }
  if (typeof onStageUpdate === "function") {
    const h = (p) => onStageUpdate(p);
    s.on("rideStageUpdate", h);
    handlers.push(["rideStageUpdate", h]);
  }
  if (typeof onFareFinalized === "function") {
    const h = (p) => onFareFinalized(p);
    s.on("fareFinalized", h);
    handlers.push(["fareFinalized", h]);
  }
  if (typeof onOfferDeclined === "function") {
    const h = (p) => onOfferDeclined(p);
    s.on("rideOfferDeclined", h);
    handlers.push(["rideOfferDeclined", h]);
  }

  if (typeof onRideCancelled === "function") {
    const h1 = (p) => onRideCancelled(p);
    s.on("rideCancelled", h1);
    handlers.push(["rideCancelled", h1]);

    const h2 = (p) => {
      try {
        if (p?.state === "cancelled") onRideCancelled(p);
      } catch {}
    };
    s.on("ride:status", h2);
    handlers.push(["ride:status", h2]);
  }

  if (typeof onBookingCancelled === "function") {
    const hb = (p) => onBookingCancelled(p);
    s.on("bookingCancelled", hb);
    handlers.push(["bookingCancelled", hb]);
  }

  if (typeof onBookingStageUpdate === "function") {
    const hs = (p) => onBookingStageUpdate(p);
    s.on("bookingStageUpdate", hs);
    handlers.push(["bookingStageUpdate", hs]);
  }

  return () => {
    handlers.forEach(([evt, h]) => s.off(evt, h));
  };
}

/* ===================== LIVE LOCATION listeners ===================== */
/**
 * Transport (ride) live driver location:
 * backend emits: "rideDriverLocation" to ride:<rideId>
 */
export function onRideDriverLocation(handler) {
  const s = ensureSocket(currentPassengerId);
  const h = (e) => {
    if (typeof handler === "function") handler(e);
  };
  s.on("rideDriverLocation", h);
  return () => s.off("rideDriverLocation", h);
}

/**
 * Delivery (order) live driver location:
 * backend emits: "deliveryDriverLocation" to order:<orderId>, merchant:<businessId>, ride:<deliveryRideId>
 */
export function onDeliveryDriverLocation(handler) {
  const s = ensureSocket(currentPassengerId);
  const h = (e) => {
    if (typeof handler === "function") handler(e);
  };
  s.on("deliveryDriverLocation", h);
  return () => s.off("deliveryDriverLocation", h);
}

/**
 * Old global broadcast (still available for debug/admin)
 */
export function onDriverLocation(handler) {
  const s = ensureSocket(currentPassengerId);
  const h = (e) => {
    if (typeof handler === "function") handler(e);
  };
  s.on("driverLocationBroadcast", h);
  return () => s.off("driverLocationBroadcast", h);
}

/* ============================= CHAT ============================= */
/**
 * Backend events (from /src/socket/chat.js):
 * - SEND:      socket.emit('chat:send', { request_id, message, attachments?, temp_id? }, ack)
 * - HISTORY:   socket.emit('chat:history', { request_id, before_id?, limit? }, ack)
 * - TYPING:    socket.emit('chat:typing', { request_id, is_typing })
 * - READ:      socket.emit('chat:read', { request_id, last_seen_id }, ack)
 * - PUSH:      socket.on('chat:new',   { message, temp_id })
 * - PUSH:      socket.on('chat:typing',{ request_id, from:{role,id}, is_typing })
 * - PUSH:      socket.on('chat:read',  { request_id, reader:{role,id}, last_seen_id })
 */

export function sendChat(
  { request_id, message, attachments = null, temp_id = null },
  ackCb
) {
  const s = ensureSocket(currentPassengerId);
  const payload = { request_id, message, attachments, temp_id };
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

/**
 * Subscribe to chat push events. Returns unsubscribe.
 */
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

  return () => {
    handlers.forEach(([evt, h]) => s.off(evt, h));
  };
}
