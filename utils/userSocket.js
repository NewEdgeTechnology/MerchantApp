// utils/userSocket.js
import { DeviceEventEmitter } from "react-native";
import { io } from "socket.io-client";

// Backend:
// new Server(server, { path: "/socket.io", transports:["websocket"] })
const SOCKET_BASE_URL = "https://grab.newedge.bt";
const SOCKET_PATH = "/socket.io";

let socket = null;
let debugAllEvents = true;

function normalizeOrderStatusPayload(raw) {
  if (!raw || typeof raw !== "object") return null;

  const orderId =
    raw.orderId ??
    raw.order_id ??
    raw?.data?.orderId ??
    raw?.data?.order_id ??
    raw?.order?.id ??
    null;

  const statusRaw =
    raw?.data?.status ??
    raw.status ??
    raw?.data?.newStatus ??
    raw?.data?.state ??
    null;

  const reason =
    raw?.data?.reason ??
    raw?.reason ??
    raw?.data?.status_reason ??
    raw?.status_reason ??
    null;

  const createdAt = raw.createdAt ?? Date.now();
  const status =
    typeof statusRaw === "string" ? statusRaw.toUpperCase().trim() : statusRaw;

  return { orderId, status, reason, createdAt, raw };
}

export function connectUserSocket({ user_id }) {
  try {
    if (!user_id) {
      console.log("[USER SOCKET] Missing user_id, not connecting.");
      return null;
    }

    // cleanup any existing
    try {
      socket?.removeAllListeners?.();
      socket?.disconnect?.();
    } catch {}

    socket = io(SOCKET_BASE_URL, {
      path: SOCKET_PATH,
      transports: ["websocket"],
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 800,
      timeout: 15000,
      auth: {
        // DEV_NOAUTH=true expects these:
        devUserId: Number(user_id),
        devRole: "user",
      },
    });

    socket.on("connect", () => {
      console.log("[USER SOCKET] ✅ connected:", socket.id);
    });

    socket.on("connect_error", (err) => {
      console.log(
        "[USER SOCKET] ❌ connect_error:",
        err?.message,
        err?.description || "",
        err?.context || ""
      );
    });

    socket.on("disconnect", (reason) => {
      console.log("[USER SOCKET] 🔌 disconnected:", reason);
    });

    // Backend emits: io.to(userRoom).emit("order:status", ev)
    socket.on("order:status", (payload) => {
      const normalized = normalizeOrderStatusPayload(payload);
      console.log("[USER SOCKET] 🔔 order:status", normalized);
      if (normalized) DeviceEventEmitter.emit("user-order-status", normalized);
    });

    // Optional: debug all events
    if (debugAllEvents && socket.onAny) {
      socket.onAny((event, ...args) => {
        try {
          console.log(
            `[USER SOCKET][onAny] ${event}:`,
            JSON.stringify(args?.[0], null, 2)
          );
        } catch {
          console.log(`[USER SOCKET][onAny] ${event}:`, args);
        }
      });
    }

    // "notify" is mainly merchant room based, but safe to listen
    socket.on("notify", (payload) => {
      console.log("[USER SOCKET] 📦 notify", payload);
    });

    return socket;
  } catch (e) {
    console.log("[USER SOCKET] setup error:", e?.message || e);
    return null;
  }
}

export function getUserSocket() {
  return socket;
}

export function joinOrderRoom(orderId) {
  if (!socket || !orderId) return;
  console.log("[USER SOCKET] joining room for order:", orderId);
  socket.emit("order:join", { orderId });
}

export function disconnectUserSocket() {
  try {
    socket?.removeAllListeners?.();
    socket?.disconnect?.();
  } catch {}
  socket = null;
}

export function onUserOrderStatus(handler) {
  return DeviceEventEmitter.addListener("user-order-status", handler);
}
export function offUserOrderStatus(sub) {
  try {
    sub?.remove?.();
  } catch {}
}

export function setUserSocketDebug(v) {
  debugAllEvents = !!v;
}