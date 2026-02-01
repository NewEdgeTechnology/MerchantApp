// utils/chatApi.js
import {
  ASSET_ORIGIN,
  API_BASE_URL,
  CHAT_ORIGIN,
  USER_MERCHANT_CHAT_ORIGIN,
  MERCHANT_CHAT_CONVERSATIONS_URL,
  CHAT_CREATE_CONVERSATION_URL,
} from "@env";

const trimSlashes = (s) => String(s || "").replace(/\/+$/, "");
const normalizeBearer = (t) => {
  const s = String(t || "").trim();
  if (!s) return null;
  return /^bearer\s/i.test(s) ? s : `Bearer ${s}`;
};

async function safeText(res) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function safeJsonFromText(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

/**
 * ✅ IMPORTANT:
 * Returns a FULL PREFIX (can include path like /chat)
 * Example: USER_MERCHANT_CHAT_ORIGIN=https://grab.newedge.bt/chat
 * Then final messages URL becomes: https://grab.newedge.bt/chat/chat/messages/:id
 */
function pickChatPrefix(fallback = "https://grab.newedge.bt/chat") {
  const prefix =
    String(USER_MERCHANT_CHAT_ORIGIN || "").trim() ||
    String(CHAT_ORIGIN || "").trim() ||
    String(API_BASE_URL || "").trim() ||
    String(ASSET_ORIGIN || "").trim() ||
    String(fallback || "").trim();

  return trimSlashes(prefix);
}

function buildHeaders({
  userType,
  userId,
  token,
  businessIdHeader,
  isMultipart = false,
  omitUserId = false, // ✅ merchant list (business-only)
}) {
  const headers = {
    Accept: "application/json",
    "x-user-type": String(userType || "").toUpperCase(),
  };

  if (!omitUserId) headers["x-user-id"] = String(userId || "");

  if (businessIdHeader != null && String(businessIdHeader).trim()) {
    headers["x-business-id"] = String(businessIdHeader);
  }

  const bearer = normalizeBearer(token);
  if (bearer) headers.Authorization = bearer;

  if (!isMultipart) headers["Content-Type"] = "application/json";
  return headers;
}

/* =============== Debug fetch (prints exact URL) =============== */
const CHAT_DEBUG = true;

function maskAuth(headers = {}) {
  const h = { ...(headers || {}) };
  if (h.Authorization) h.Authorization = "Bearer ***";
  return h;
}

async function debugFetch(url, { method = "GET", headers = {}, body } = {}) {
  if (CHAT_DEBUG) {
    console.log("[CHAT][REQ]", {
      method,
      url,
      headers: maskAuth(headers),
      body: typeof body === "string" ? body : body ? "[FormData]" : null,
    });
  }

  const res = await fetch(url, { method, headers, body });
  const text = await safeText(res);
  const json = safeJsonFromText(text);

  if (CHAT_DEBUG) {
    console.log("[CHAT][RES]", { status: res.status, ok: res.ok, url, text });
  }

  if (!res.ok) {
    throw new Error(json?.message || json?.error || text || `HTTP ${res.status}`);
  }
  return json ?? {};
}

/* =========================================================
   ✅ Create / get conversation (uses FULL URL from env)
   POST  .../chat/conversations/order/:orderId
   ========================================================= */
export async function createOrGetOrderConversationFromOrderDetails({
  orderId,
  customer_id,
  business_id,
  merchant_user_id,
  token,
}) {
  const tpl = String(CHAT_CREATE_CONVERSATION_URL || "").trim();
  if (!tpl) throw new Error("CHAT_CREATE_CONVERSATION_URL missing in env");

  const oid = String(orderId || "").trim();
  if (!oid) throw new Error("orderId required");

  const url = tpl.replace(":orderId", encodeURIComponent(oid));

  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "x-user-type": "MERCHANT",
    "x-user-id": String(merchant_user_id || ""),
    "x-business-id": String(business_id || ""),
  };

  const bearer = normalizeBearer(token);
  if (bearer) headers.Authorization = bearer;

  return await debugFetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      customer_id: Number(customer_id),
      business_id: Number(business_id),
    }),
  });
}

/* =========================================================
   ✅ Merchant list (FULL URL from env; no joining)
   ========================================================= */
export async function listMerchantConversations({ businessId, token }) {
  const url = String(MERCHANT_CHAT_CONVERSATIONS_URL || "").trim();
  if (!url) throw new Error("MERCHANT_CHAT_CONVERSATIONS_URL missing in env");

  const headers = {
    Accept: "application/json",
    "x-user-type": "MERCHANT",
    "x-business-id": String(businessId || ""),
  };

  const bearer = normalizeBearer(token);
  if (bearer) headers.Authorization = bearer;

  return await debugFetch(url, { method: "GET", headers });
}

/* =========================================================
   ✅ Get messages (DOUBLE /chat/chat/... as you requested)
   GET  https://grab.newedge.bt/chat/chat/messages/:conversationId?limit=80
   ========================================================= */
export async function getConversationMessages({
  conversationId,
  limit = 80,
  userType,
  userId,
  businessIdHeader,
  token,
}) {
  const base = pickChatPrefix("https://grab.newedge.bt/chat"); // ✅ ends with /chat
  const cid = String(conversationId || "").trim();
  if (!cid) throw new Error("conversationId required");

  // ✅ results in /chat/chat/messages/...
  const url = `${base}/chat/messages/${encodeURIComponent(cid)}?limit=${encodeURIComponent(
    String(limit),
  )}`;

  return await debugFetch(url, {
    method: "GET",
    headers: buildHeaders({ userType, userId, token, businessIdHeader }),
  });
}

/* =========================================================
   ✅ Send text (DOUBLE /chat/chat/messages)
   POST https://grab.newedge.bt/chat/chat/messages/:conversationId
   ========================================================= */
export async function sendTextMessage({
  conversationId,
  bodyText,
  userType,
  userId,
  businessIdHeader,
  token,
}) {
  const base = pickChatPrefix("https://grab.newedge.bt/chat");
  const cid = String(conversationId || "").trim();
  if (!cid) throw new Error("conversationId required");

  const url = `${base}/chat/messages/${encodeURIComponent(cid)}`;

  return await debugFetch(url, {
    method: "POST",
    headers: buildHeaders({ userType, userId, token, businessIdHeader }),
    body: JSON.stringify({ body: String(bodyText || "") }),
  });
}

/* =========================================================
   ✅ Send image (DOUBLE /chat/chat/messages)
   ========================================================= */
export async function sendImageMessage({
  conversationId,
  image, // { uri, name, type }
  caption = "",
  userType,
  userId,
  businessIdHeader,
  token,
}) {
  const base = pickChatPrefix("https://grab.newedge.bt/chat");
  const cid = String(conversationId || "").trim();
  if (!cid) throw new Error("conversationId required");

  const url = `${base}/chat/messages/${encodeURIComponent(cid)}`;

  const form = new FormData();
  if (caption && String(caption).trim()) form.append("body", String(caption).trim());

  form.append("chat_image", {
    uri: image?.uri,
    name: image?.name || `chat_${Date.now()}.jpg`,
    type: image?.type || "image/jpeg",
  });

  return await debugFetch(url, {
    method: "POST",
    headers: buildHeaders({
      userType,
      userId,
      token,
      businessIdHeader,
      isMultipart: true,
    }),
    body: form,
  });
}

/* =========================================================
   ✅ Mark read (DOUBLE /chat/chat/read)
   ========================================================= */
export async function markConversationRead({
  conversationId,
  lastReadMessageId,
  userType,
  userId,
  businessIdHeader,
  token,
}) {
  const base = pickChatPrefix("https://grab.newedge.bt/chat");
  const cid = String(conversationId || "").trim();
  if (!cid) throw new Error("conversationId required");

  const url = `${base}/chat/read/${encodeURIComponent(cid)}`;

  return await debugFetch(url, {
    method: "POST",
    headers: buildHeaders({ userType, userId, token, businessIdHeader }),
    body: JSON.stringify({ lastReadMessageId: String(lastReadMessageId || "") }),
  });
}
