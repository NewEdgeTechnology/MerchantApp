import { io } from "socket.io-client";
import { MY_LOCAL_URL, RIDE_REQUEST_ENDPOINT } from "@env";

// prod socket base + path
const PROD_ORIGIN = "https://grab.newedge.bt";
const PROD_PATH = "/grablike/socket.io";
const PROD_HTTP_BASE = "https://grab.newedge.bt/grablike";

function resolveSocketConfig() {
  return { origin: PROD_ORIGIN, path: PROD_PATH };
}

function resolveHttpBase() {
  const raw = (MY_LOCAL_URL || RIDE_REQUEST_ENDPOINT || "").trim();
  try {
    if (!raw) return PROD_HTTP_BASE;
    const u = new URL(raw);
    return `${u.protocol}//${u.host}${u.pathname.replace(/\/$/, "")}`;
  } catch {
    return PROD_HTTP_BASE;
  }
}

let socket = null;
let currentIdentity = { role: "passenger", userId: null };

let lastRideId = null;
let lastOrderId = null;

let joinedRideId = null;
let joinedOrderId = null;

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

function identityPayload(role, userId) {
  const rid = userId != null ? String(userId) : undefined;
  const base = { role: String(role || "passenger") };

  if (base.role === "merchant") {
    return { ...base, merchant_id: rid, merchantId: rid };
  }
  if (base.role === "driver") {
    return { ...base, driver_id: rid, driverId: rid };
  }
  return { ...base, passenger_id: rid, passengerId: rid };
}

function authPayload(role, userId) {
  const rid = userId != null ? String(userId) : undefined;
  if (role === "merchant") {
    return {
      role,
      merchantId: rid,
      merchant_id: rid,
    };
  }
  if (role === "driver") {
    return {
      role,
      driverId: rid,
      driver_id: rid,
    };
  }
  return {
    role,
    passengerId: rid,
    passenger_id: rid,
  };
}

function ensureSocket(identity) {
  const role = String(identity?.role || currentIdentity?.role || "passenger");
  const userId =
    identity?.userId != null
      ? String(identity.userId)
      : currentIdentity?.userId != null
      ? String(currentIdentity.userId)
      : null;

  currentIdentity = { role, userId };

  const { origin, path } = resolveSocketConfig();

  if (!socket) {
    socket = io(origin, {
      path,
      transports: ["websocket", "polling"],
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 800,
      reconnectionDelayMax: 7000,
      timeout: 15000,
      auth: authPayload(role, userId),
    });

    socket.on("connect", () => {
      const idPayload = identityPayload(currentIdentity.role, currentIdentity.userId);
      socket.emit("whoami", idPayload);

      if (lastRideId && joinedRideId !== String(lastRideId)) {
        socket.emit("joinRide", { rideId: String(lastRideId) }, () => {});
        joinedRideId = String(lastRideId);
      }

      if (lastOrderId && joinedOrderId !== String(lastOrderId)) {
        socket.emit("joinOrder", { orderId: String(lastOrderId) }, () => {});
        joinedOrderId = String(lastOrderId);
      }
    });

    socket.on("disconnect", () => {
      joinedRideId = null;
      joinedOrderId = null;
    });
  }

  try {
    socket.auth = authPayload(role, userId);
    if (socket.connected) {
      socket.emit("whoami", identityPayload(role, userId));
    }
  } catch {}

  if (!socket.connected) {
    try {
      socket.connect();
    } catch {}
  }

  return socket;
}

export function connectRideSocket({ role = "passenger", userId } = {}) {
  return ensureSocket({ role, userId });
}

export function connectPassengerSocket(passengerId) {
  return connectRideSocket({ role: "passenger", userId: passengerId });
}

export function getPassengerSocket() {
  return socket;
}

export async function resolveCurrentRideId(passengerId) {
  const pid = String(passengerId || currentIdentity?.userId || "").trim();
  if (!pid) return null;

  const base = resolveHttpBase();
  const endsWithRides = /\/rides$/i.test(base);
  const urls = [
    `${base}/passenger/current-ride?passenger_id=${encodeURIComponent(pid)}`,
    endsWithRides
      ? null
      : `${base}/rides/passenger/current-ride?passenger_id=${encodeURIComponent(pid)}`,
  ].filter(Boolean);

  for (const url of urls) {
    try {
      const res = await fetch(url, { method: "GET" });
      if (!res.ok) continue;
      const json = await res.json().catch(() => ({}));
      const rid =
        json?.data?.request_id ??
        json?.data?.ride_id ??
        json?.data?.rideId ??
        null;
      if (rid != null) {
        return {
          data: {
            ...(json?.data || {}),
            request_id: String(rid),
          },
        };
      }
    } catch {}
  }

  return null;
}

export function joinRideRoom(rideId, ackCb) {
  const rid = String(rideId);
  lastRideId = rid;

  const s = ensureSocket(currentIdentity);
  const doJoin = () => {
    if (joinedRideId === rid) return;
    s.emit("joinRide", { rideId: rid }, (ack) => {
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

  const s = ensureSocket(currentIdentity);
  const doLeave = () => {
    s.emit("leaveRide", { rideId: id }, (ack) => {
      if (typeof ackCb === "function") ackCb(ack);
    });
  };

  if (s.connected) doLeave();
  else s.once("connect", doLeave);
}

export function joinOrderRoom(orderId, ackCb) {
  const oid = String(orderId);
  lastOrderId = oid;

  const s = ensureSocket(currentIdentity);
  const doJoin = () => {
    if (joinedOrderId === oid) return;
    s.emit("joinOrder", { orderId: oid }, (ack) => {
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

  const s = ensureSocket(currentIdentity);
  const doLeave = () => {
    s.emit("leaveOrder", { orderId: id }, (ack) => {
      if (typeof ackCb === "function") ackCb(ack);
    });
  };

  if (s.connected) doLeave();
  else s.once("connect", doLeave);
}

export function onPassengerEvents({
  onRideAccepted,
  onStageUpdate,
  onFareFinalized,
  onOfferDeclined,
  onRideCancelled,
  onBookingCancelled,
  onBookingStageUpdate,
} = {}) {
  const s = ensureSocket(currentIdentity);
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

export function onDeliveryDriverLocation(handler) {
  const s = ensureSocket(currentIdentity);
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
  const s = ensureSocket(currentIdentity);
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
  const s = ensureSocket(currentIdentity);
  const h = (e) => {
    if (typeof handler === "function") handler(e);
  };
  s.on("driverLocationBroadcast", h);
  return () => s.off("driverLocationBroadcast", h);
}

export function sendChat(
  { request_id, message, attachments = null, temp_id = null },
  ackCb
) {
  const s = ensureSocket(currentIdentity);
  s.emit("chat:send", { request_id, message, attachments, temp_id }, (ack) => {
    if (typeof ackCb === "function") ackCb(ack);
  });
}

export function loadChatHistory(
  { request_id, before_id = null, limit = 50 },
  ackCb
) {
  const s = ensureSocket(currentIdentity);
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
  const s = ensureSocket(currentIdentity);
  s.emit("chat:typing", { request_id, is_typing: !!is_typing });
}

export function markChatRead({ request_id, last_seen_id }, ackCb) {
  const s = ensureSocket(currentIdentity);
  s.emit("chat:read", { request_id, last_seen_id }, (ack) => {
    if (typeof ackCb === "function") ackCb(ack);
  });
}

export function onChatEvents({ onNewMessage, onTyping, onRead } = {}) {
  const s = ensureSocket(currentIdentity);
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
