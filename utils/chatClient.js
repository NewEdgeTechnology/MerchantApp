// chatClient.js
import { io } from "socket.io-client";

const SOCKET_PATH = "/grablike/socket.io";
const SOCKET_ORIGIN = "https://grab.newedge.bt";
const HTTP_BASE = "https://grab.newedge.bt/grablike";
const CHAT_UPLOAD_URL = `${HTTP_BASE}/chat/upload`;

let socket = null;
let socketConfig = null;

const normalizeIds = (ids = {}) => ({
  driverId: ids?.driverId || ids?.driver_id || null,
  passengerId: ids?.passengerId || ids?.passenger_id || null,
  merchantId: ids?.merchantId || ids?.merchant_id || null,
});

const buildAuth = (role, ids) => ({
  role,
  userType: String(role || "").toUpperCase(),
  driverId: ids?.driverId || undefined,
  driver_id: ids?.driverId || undefined,
  passengerId: ids?.passengerId || undefined,
  passenger_id: ids?.passengerId || undefined,
  merchantId: ids?.merchantId || undefined,
  merchant_id: ids?.merchantId || undefined,
});

const sameConfig = (a, b) =>
  !!a &&
  !!b &&
  a.role === b.role &&
  a.ids?.driverId === b.ids?.driverId &&
  a.ids?.passengerId === b.ids?.passengerId &&
  a.ids?.merchantId === b.ids?.merchantId;

const toRequestId = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : s;
};

/**
 * Initialize (or reuse) a singleton socket for any role.
 * role: "driver" | "passenger" | "merchant"
 * ids: { driverId?, passengerId?, merchantId? }
 */
export function connectChatSocket({ role, ids } = {}) {
  const nextCfg = {
    role: String(role || "passenger").toLowerCase(),
    ids: normalizeIds(ids),
  };

  if (sameConfig(socketConfig, nextCfg) && socket) return socket;

  if (socket) {
    try {
      socket.removeAllListeners();
      socket.disconnect();
    } catch {}
  }

  socketConfig = nextCfg;
  const auth = buildAuth(nextCfg.role, nextCfg.ids);

  socket = io(SOCKET_ORIGIN, {
    path: SOCKET_PATH,
    transports: ["websocket", "polling"],
    auth,
    query: auth,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 800,
    reconnectionDelayMax: 7000,
    timeout: 15000,
  });

  socket.on("connect", () => {
    console.log("[chat] connected", socket.id);
    socket.emit("whoami", {
      role: nextCfg.role,
      userType: String(nextCfg.role || "").toUpperCase(),
      driver_id: nextCfg.ids?.driverId || undefined,
      passenger_id: nextCfg.ids?.passengerId || undefined,
      merchant_id: nextCfg.ids?.merchantId || undefined,
      driverId: nextCfg.ids?.driverId || undefined,
      passengerId: nextCfg.ids?.passengerId || undefined,
      merchantId: nextCfg.ids?.merchantId || undefined,
    });
  });

  socket.on("connect_error", (err) =>
    console.warn("[chat] connect_error:", err?.message || err),
  );

  socket.on("disconnect", (reason) =>
    console.log("[chat] disconnected:", reason),
  );

  return socket;
}

/** Join a ride chat room (request_id === ride_id). */
export function joinChatRoom(rideId, cb) {
  if (!socket) return;
  const requestId = toRequestId(rideId);
  if (requestId == null) return;
  socket.emit("chat:join", { request_id: requestId }, (ack) => {
    if (!ack?.ok) console.warn("[chat] join failed:", ack?.error);
    cb?.(ack);
  });
}

/** Leave chat room */
export function leaveChatRoom(rideId, cb) {
  if (!socket) return;
  const requestId = toRequestId(rideId);
  if (requestId == null) return;
  socket.emit("chat:leave", { request_id: requestId }, cb);
}

/** Fetch history */
export function loadChatHistory({ rideId, beforeId = null, limit = 100 }, cb) {
  if (!socket) return;
  const requestId = toRequestId(rideId);
  if (requestId == null) return;
  const payload = {
    request_id: requestId,
    limit,
    ...(beforeId != null ? { before_id: Number(beforeId) } : {}),
  };
  socket.emit("chat:history", payload, cb);
}

/** Send text or attachment messages */
export function sendChatMessage({ rideId, message = "", attachments = null }) {
  if (!socket) return null;
  const requestId = toRequestId(rideId);
  if (requestId == null) return null;
  const temp_id = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  socket.emit(
    "chat:send",
    {
      request_id: requestId,
      message,
      attachments,
      temp_id,
    },
    (ack) => {
      if (!ack?.ok) console.warn("[chat] send failed:", ack?.error);
    },
  );
  return temp_id;
}

/** Typing indicator */
export function setTyping(rideId, isTyping) {
  if (!socket) return;
  const requestId = toRequestId(rideId);
  if (requestId == null) return;
  socket.emit("chat:typing", { request_id: requestId, is_typing: !!isTyping });
}

/** Read receipts */
export function markChatRead(rideId, lastSeenId) {
  if (!socket) return;
  const requestId = toRequestId(rideId);
  if (requestId == null) return;
  socket.emit("chat:read", {
    request_id: requestId,
    last_seen_id: Number(lastSeenId),
  });
}

/** Upload attachment, returns URL to include in attachments array */
export async function uploadChatImage(file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(CHAT_UPLOAD_URL, { method: "POST", body: form });
  const json = await res.json();
  if (!res.ok || !json?.url) {
    throw new Error(json?.error || `Upload failed (${res.status})`);
  }
  return json.url; // e.g. /uploads/chat/xxx.jpg
}
