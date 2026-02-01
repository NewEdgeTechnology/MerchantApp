// utils/chatSocket.js
import { io } from "socket.io-client";

/**
 * Your API works on: https://grab.newedge.bt/chat/chat/...
 * Socket path also needs the same prefix:
 *   ✅ /chat/chat/socket.io
 *   ❌ /chat/socket.io  (404)
 *
 * This file auto-detects and uses the correct one.
 */

const CHAT_ORIGIN = "https://grab.newedge.bt";

/** Try these in order */
const PATH_CANDIDATES = ["/chat/chat/socket.io", "/chat/socket.io", "/socket.io"];

/** Toggle to see all logs */
const CHAT_SOCKET_DEBUG = true;

let socket = null;
let socketIdentityKey = "";
let connectingPromise = null;

/** queued joins (when join called before connected) */
const pendingJoins = new Set();

/** subscribers for new message event */
let subIdCounter = 0;
const subscribers = new Map();

function log(...args) {
  if (!CHAT_SOCKET_DEBUG) return;
  console.log("[CHAT][SOCKET]", ...args);
}

function emitToSubscribers(payload) {
  for (const cb of subscribers.values()) {
    try {
      cb(payload);
    } catch {}
  }
}

function toStr(v) {
  return v == null ? "" : String(v);
}

function buildIdentity({ userType, userId, businessId } = {}) {
  const ut = String(userType || "").toUpperCase();
  const uid = String(userId || "").trim();
  const bid = businessId != null ? String(businessId).trim() : "";
  return { userType: ut, userId: uid, businessId: bid };
}

function identityKey(id) {
  return `${id.userType}|${id.userId}|${id.businessId}`;
}

/** quick HTTP probe to see which path exists */
async function probePath(origin, path, timeoutMs = 4500) {
  // Engine.IO polling probe (GET)
  // if this returns 200, the path exists
  const url = `${origin}${path}/?EIO=4&transport=polling&t=${Date.now()}`;

  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = setTimeout(() => ctrl?.abort?.(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "GET",
      signal: ctrl?.signal,
      headers: { Accept: "*/*" },
    }).catch(() => null);

    clearTimeout(timer);

    if (!res) return { ok: false, status: 0, url };
    return { ok: res.ok, status: res.status, url };
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, status: 0, url, error: e?.message || String(e) };
  }
}

async function detectSocketPath(origin) {
  for (const p of PATH_CANDIDATES) {
    const r = await probePath(origin, p);
    log("PROBE", r);
    if (r.ok && r.status === 200) return p;
  }
  // if none are 200, still return first candidate (best guess)
  return PATH_CANDIDATES[0];
}

function attachLogs(s, pathUsed) {
  s.on("connect", () => log("CONNECTED", { id: s.id, path: pathUsed, transport: s.io?.engine?.transport?.name }));
  s.on("disconnect", (reason) => log("DISCONNECTED", reason));
  s.on("connect_error", (err) => log("CONNECT_ERROR", err?.message || err));
  s.io?.on?.("reconnect_attempt", (n) => log("RECONNECT_ATTEMPT", n));
  s.io?.on?.("reconnect", (n) => log("RECONNECTED", n));
  s.io?.on?.("reconnect_error", (e) => log("RECONNECT_ERROR", e?.message || e));
  s.io?.on?.("error", (e) => log("IO_ERROR", e?.message || e));

  // Engine transport changes (polling -> websocket)
  try {
    const eng = s.io?.engine;
    if (eng) {
      eng.on("upgrade", (t) => log("ENGINE_UPGRADE", t?.name));
      eng.on("close", (r) => log("ENGINE_CLOSE", r));
      eng.on("error", (e) => log("ENGINE_ERROR", e?.message || e));
    }
  } catch {}
}

function attachMessageHandlers(s) {
  // your server emits chat:new_message
  s.on("chat:new_message", (payload) => emitToSubscribers(payload));

  // optional fallbacks (in case server uses different event names)
  s.on("chat:new-message", (payload) => emitToSubscribers(payload));
  s.on("new_message", (payload) => emitToSubscribers(payload));

  // helpful for debugging: see any events (comment if too noisy)
  // s.onAny((ev, payload) => log("EVENT", ev, payload ? "[payload]" : null));
}

function flushPendingJoins(s) {
  if (!s?.connected) return;
  if (!pendingJoins.size) return;

  for (const cid of Array.from(pendingJoins)) {
    try {
      s.emit("chat:join", { conversationId: String(cid) });
      log("JOIN_SENT", cid);
    } catch {}
  }
}

/**
 * Create socket with preferred transport.
 * We first try websocket-only (avoids xhr poll/post problems).
 * If websocket-only fails, we fallback to polling+websocket.
 */
async function createSocket(origin, path, id) {
  const baseQuery = {
    userType: id.userType,
    userId: id.userId,
    businessId: id.businessId || "",
    role: id.userType,
    // some backends read these names
    "x-user-type": id.userType,
    "x-user-id": id.userId,
    "x-business-id": id.businessId || "",
  };

  const extraHeaders = {
    "x-user-type": id.userType,
    "x-user-id": id.userId,
    ...(id.businessId ? { "x-business-id": id.businessId } : {}),
  };

  // 1) try websocket only
  log("CONNECT_START", {
    endpoint: { origin, path },
    mode: "websocket_only",
    query: baseQuery,
  });

  let s = io(origin, {
    path,
    transports: ["websocket"],
    upgrade: false,
    rememberUpgrade: true,
    forceNew: true,
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 600,
    timeout: 15000,
    query: baseQuery,
    auth: baseQuery,
    extraHeaders, // important for RN / proxies
  });

  attachLogs(s, path);
  attachMessageHandlers(s);

  const ok = await waitForConnect(s, 7000);
  if (ok) return s;

  // websocket-only failed -> cleanup
  try {
    s.removeAllListeners();
    s.disconnect();
  } catch {}

  // 2) fallback to polling + websocket
  log("CONNECT_START", {
    endpoint: { origin, path },
    mode: "polling_then_upgrade",
    query: baseQuery,
  });

  s = io(origin, {
    path,
    transports: ["polling", "websocket"],
    upgrade: true,
    rememberUpgrade: true,
    forceNew: true,
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 600,
    timeout: 20000,
    query: baseQuery,
    auth: baseQuery,
    extraHeaders,
  });

  attachLogs(s, path);
  attachMessageHandlers(s);

  const ok2 = await waitForConnect(s, 10000);
  if (ok2) return s;

  // failed both
  try {
    s.removeAllListeners();
    s.disconnect();
  } catch {}

  throw new Error("Chat socket could not connect (websocket + polling failed).");
}

function waitForConnect(s, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      resolve(!!v);
    };

    const t = setTimeout(() => finish(false), timeoutMs);

    if (s.connected) {
      clearTimeout(t);
      return finish(true);
    }

    s.once("connect", () => {
      clearTimeout(t);
      finish(true);
    });

    s.once("connect_error", () => {
      clearTimeout(t);
      finish(false);
    });
  });
}

/**
 * Public API
 */
export async function connectChatSocket({ userType, userId, businessId } = {}) {
  const id = buildIdentity({ userType, userId, businessId });
  const key = identityKey(id);

  // if already connected for same identity, reuse
  if (socket && socketIdentityKey === key) return socket;

  // if identity changed, reset
  if (socket && socketIdentityKey !== key) {
    try {
      socket.removeAllListeners();
      socket.disconnect();
    } catch {}
    socket = null;
    socketIdentityKey = "";
  }

  if (connectingPromise) return connectingPromise;

  connectingPromise = (async () => {
    const path = await detectSocketPath(CHAT_ORIGIN);

    const s = await createSocket(CHAT_ORIGIN, path, id);

    // on connect/reconnect -> rejoin rooms
    s.on("connect", () => {
      flushPendingJoins(s);
    });
    s.io?.on?.("reconnect", () => {
      flushPendingJoins(s);
    });

    socket = s;
    socketIdentityKey = key;
    connectingPromise = null;

    // if joins were queued before connect finished
    flushPendingJoins(socket);

    return socket;
  })().catch((e) => {
    connectingPromise = null;
    throw e;
  });

  return connectingPromise;
}

export function joinChatConversation(conversationId) {
  const cid = String(conversationId || "").trim();
  if (!cid) return;

  pendingJoins.add(cid);

  if (!socket || !socket.connected) {
    log("JOIN_QUEUED", cid);
    return;
  }

  try {
    socket.emit("chat:join", { conversationId: cid });
    log("JOIN_SENT", cid);
  } catch {}
}

export function leaveChatConversation(conversationId) {
  const cid = String(conversationId || "").trim();
  if (!cid) return;

  pendingJoins.delete(cid);

  if (!socket) return;
  try {
    socket.emit("chat:leave", { conversationId: cid });
    log("LEAVE_SENT", cid);
  } catch {}
}

export function onChatNewMessage(cb) {
  const id = ++subIdCounter;
  subscribers.set(id, cb);
  log("SUBSCRIBE", { id, count: subscribers.size });
  return id;
}

export function offChatNewMessage(id) {
  subscribers.delete(id);
  log("UNSUBSCRIBE", { id, count: subscribers.size });
}

/** optional: manual reset */
export function resetChatSocket() {
  try {
    pendingJoins.clear();
    subscribers.clear();
    subIdCounter = 0;
    connectingPromise = null;

    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
    }
  } catch {}
  socket = null;
  socketIdentityKey = "";
  log("RESET");
}
