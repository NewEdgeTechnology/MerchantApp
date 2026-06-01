// screens/food/OrderDetails/orderDetailsUtils.js
import { BUSINESS_DETAILS as ENV_BUSINESS_DETAILS } from "@env";
import { BRAND, FONT, RADIUS, SHADOW } from "../../styles/tabdey_brand";

/* ---------------- Money + utils ---------------- */
export const money = (n, c = "BTN") => `${c} ${Number(n ?? 0).toFixed(2)}`;
export const norm = (s = "") => String(s).toLowerCase().trim();
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export const findStepIndex = (status, seq) =>
  seq.indexOf((status || "").toUpperCase());
export const fmtStamp = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/* ---------- stringify helpers ---------- */
export const clean = (v) => (v == null ? "" : String(v).trim());
export const addressToLine = (val) => {
  if (!val) return "";
  if (typeof val === "string") return val;
  if (typeof val === "object") {
    const parts = [
      clean(val.address || val.line1 || val.street),
      clean(val.area || val.locality || val.block),
      clean(val.city || val.town || val.dzongkhag),
      clean(val.postcode || val.zip),
    ].filter(Boolean);
    if (!parts.length) {
      const lat = val.lat ?? val.latitude;
      const lng = val.lng ?? val.longitude;
      const ll = [lat, lng].filter((n) => n != null).join(", ");
      return ll ? `(${ll})` : "";
    }
    return parts.join(", ");
  }
  return String(val);
};

export const STATUS_META = {
  PENDING: { label: "Pending", color: "#F59E0B", icon: "time-outline" },
  CONFIRMED: {
    label: "Confirmed",
     color: BRAND.purple,
    icon: "checkmark-circle-outline",
  },
  ASSIGNED: { label: "Assigned", color: "#3B82F6", icon: "person-outline" },
  READY: { label: "Ready", color: "#8B5CF6", icon: "restaurant-outline" },
  PICKEDUP: {
    label: "Picked Up",
     color: BRAND.purple,
    icon: "checkmark-done-circle-outline",
  }, // ✅ ADD THIS LINE
  PICKED_UP: {
    label: "Picked Up",
     color: BRAND.purple,
    icon: "checkmark-done-circle-outline",
  },
  OUT_FOR_DELIVERY: {
    label: "Out for Delivery",
    color: "#F59E0B",
    icon: "bicycle-outline",
  },
  COMPLETED: {
    label: "Completed",
     color: BRAND.purple,
    icon: "checkmark-done-circle-outline",
  },
  DECLINED: {
    label: "Declined",
    color: "#EF4444",
    icon: "close-circle-outline",
  },
  CANCELLED: {
    label: "Cancelled",
    color: "#EF4444",
    icon: "close-circle-outline",
  },
};

export const TERMINAL_NEGATIVE = new Set(["CANCELLED", "DECLINED"]);
export const TERMINAL_SUCCESS = new Set(["COMPLETED", "PICKEDUP"]);

/* ---------------- if_unavailable mapping ---------------- */
export const IF_UNAVAILABLE_LABELS = {
  replace_with_similar: "Replace with similar item",
  suggest_replacement: "Suggest a replacement",
  remove_item: "Remove that item",
  cancel_order: "Cancel the whole order",
};

/* ---------------- Order code helpers ---------------- */
export const normalizeOrderCode = (raw) => {
  if (!raw) return null;
  const s = String(raw).trim();
  const digits = (s.match(/\d+/) || [])[0];
  if (!digits) return s.toUpperCase();
  return `ORD-${digits}`;
};

export const sameOrder = (a, b) => {
  if (!a || !b) return false;
  const A = normalizeOrderCode(a);
  const B = normalizeOrderCode(b);
  if (!A || !B) return false;
  return A.replace(/\D/g, "") === B.replace(/\D/g, "");
};

export const buildUpdateUrl = (base, orderCode) => {
  const cleanBase = String(base || "")
    .trim()
    .replace(/\/+$/, "");
  if (!cleanBase || !orderCode) return null;

  // Try different URL patterns
  const candidates = [];

  // Pattern 1: Replace placeholders
  let url = cleanBase
    .replace(/\{\s*order_id\s*\}/gi, orderCode)
    .replace(/\{\s*order\s*\}/gi, orderCode)
    .replace(/\{\s*orderCode\s*\}/gi, orderCode)
    .replace(/:order_id/gi, orderCode)
    .replace(/:order/gi, orderCode)
    .replace(/:orderCode/gi, orderCode);

  if (url !== cleanBase) {
    candidates.push(url);
  }

  // Pattern 2: Append /{orderCode}/status
  candidates.push(`${cleanBase}/${orderCode}/status`);

  // Pattern 3: Append /status with query param
  candidates.push(`${cleanBase}/status?order_code=${orderCode}`);
  candidates.push(`${cleanBase}/status?order_id=${orderCode}`);

  // Pattern 4: Just append /status (if the endpoint expects order_code in body)
  candidates.push(`${cleanBase}/status`);

  // Return the first candidate that isn't the same as base (preferring the most specific)
  console.log("[DEBUG] buildUpdateUrl candidates:", candidates);
  return candidates[0];
};

/* ---------------- NORMALIZERS ---------------- */
export const normDelivery = (v) => {
  const s = String(v || "")
    .trim()
    .toUpperCase();
  if (!s) return "UNKNOWN";
  if (
    [
      "SELF",
      "SELF_ONLY",
      "PICKUP",
      "PICK_UP",
      "SELF_PICKUP",
      "SELF-DELIVERY",
      "SELF_DELIVERY",
    ].includes(s)
  )
    return "SELF";
  if (
    [
      "GRAB",
      "GRAB_ONLY",
      "DELIVERY",
      "PLATFORM",
      "PLATFORM_DELIVERY",
      "PLATFORM-DELIVERY",
    ].includes(s)
  )
    return "GRAB";
  if (s === "BOTH" || s === "ALL") return "BOTH";
  if (s === "1" || s === "TRUE") return "GRAB";
  if (s === "0" || s === "FALSE") return "SELF";
  if (s.includes("GRAB") || s.includes("PLATFORM")) return "GRAB";
  if (s.includes("SELF")) return "SELF";
  if (s.includes("BOTH")) return "BOTH";
  return "UNKNOWN";
};

export function resolveDeliveryOptionFromOrder(from) {
  const cands = [
    from?.delivery_option,
    from?.deliveryOption,
    from?.delivery_by,
    from?.deliveryBy,
    from?.courier,
    from?.courier_type,
    from?.courierType,
    from?.fulfillment_option,
    from?.fulfillmentOption,
    from?.owner_delivery_option,
    from?.ownerDeliveryOption,
    from?.type,
    from?.delivery_type,
    from?.fulfillment_type,
    from?.params?.delivery_option,
    from?.params?.deliveryOption,
    from?.params?.delivery_by,
  ].map((v) => (v == null ? "" : String(v).trim()));

  for (const val of cands) {
    const n = normDelivery(val);
    if (n !== "UNKNOWN") return n;
  }
  return "";
}

/** Returns 'Delivery' | 'Pickup' | '' */
export function resolveFulfillmentType(from) {
  const cands = [
    from?.fulfillment_type,
    from?.fulfillmentType,
    from?.order_type,
    from?.orderType,
    from?.type,
    from?.delivery_type,
    from?.service_type,
  ].map((v) => (v == null ? "" : String(v).trim()));

  for (const val of cands) {
    const s = norm(val);
    if (!s) continue;
    if (
      ["delivery", "deliver", "platform_delivery", "self-delivery"].includes(s)
    )
      return "Delivery";
    if (
      ["pickup", "self-pickup", "pick_up", "takeaway", "take-away"].includes(s)
    )
      return "Pickup";
    return "";
  }
  return "";
}

/* ---------------- BUSINESS_DETAILS URL helper ---------------- */

const buildBusinessDetailsUrl = (business_id) => {
  const tpl = (ENV_BUSINESS_DETAILS || "").trim();
  if (!tpl) return null;

  const urls = [];

  if (business_id != null && business_id !== "") {
    const rawId = String(business_id).trim();
    const encId = encodeURIComponent(rawId);

    // Try replacing common placeholders
    let replaced = tpl
      .replace("{business_id}", encId)
      .replace("{businessId}", encId)
      .replace(":business_id", encId)
      .replace(":businessId", encId);

    if (replaced !== tpl) {
      urls.push(replaced);
    } else {
      // Fallback: /:id
      urls.push(`${tpl.replace(/\/+$/, "")}/${encId}`);

      // Fallback: ?business_id=
      const sep = tpl.includes("?") ? "&" : "?";
      urls.push(`${tpl}${sep}business_id=${encId}`);
    }
  }

  // Also try bare endpoint (could be /me or similar)
  urls.push(tpl);

  return urls;
};

/* ---------------- BUSINESS_DETAILS fetcher ---------------- */
export async function fetchBusinessDetails({ token, business_id }) {
  const urlCandidates = buildBusinessDetailsUrl(business_id);
  if (!urlCandidates || urlCandidates.length === 0) return null;

  const headers = token
    ? { Accept: "application/json", Authorization: `Bearer ${token}` }
    : { Accept: "application/json" };

  for (const url of urlCandidates) {
    try {
      const r = await fetch(url, { headers });
      const text = await r.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }
      if (!r.ok) continue;

      const maybe =
        data?.data && typeof data.data === "object" ? data.data : data;

      if (
        maybe &&
        (maybe.business_id ||
          maybe.business_name ||
          maybe.delivery_option ||
          maybe.owner_type)
      ) {
        return maybe;
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

export async function updateStatusApi({ endpoint, orderCode, payload, token }) {
  const url = buildUpdateUrl(endpoint, orderCode);
  if (!url) throw new Error("Invalid update endpoint");

  console.log("[DEBUG] updateStatusApi - URL:", url);
  console.log(
    "[DEBUG] updateStatusApi - Payload:",
    JSON.stringify(payload, null, 2),
  );

  // Try with PUT first, then fallback to POST if needed
  const methods = ["PUT", "POST"];
  let lastError = null;

  for (const method of methods) {
    try {
      const res = await fetch(url, {
        method: method,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          ...payload,
          order_code: orderCode, // Always include order_code in body
          order_id: orderCode, // Also include order_id
        }),
      });

      const text = await res.text();
      console.log(`[DEBUG] ${method} response status:`, res.status);
      console.log(`[DEBUG] ${method} response body:`, text);

      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }

      if (res.ok) {
        return json;
      }

      lastError = new Error(
        json?.message || json?.error || `HTTP ${res.status}`,
      );
    } catch (err) {
      lastError = err;
      console.log(`[DEBUG] ${method} failed:`, err.message);
    }
  }

  throw lastError || new Error("Failed to update status");
}
/* ---------------- Distance & ETA helpers (Haversine) ---------------- */
const toRad = (deg) => (deg * Math.PI) / 180;

export const computeHaversineKm = (from, to) => {
  if (!from || !to) return null;
  const { lat: lat1, lng: lon1 } = from;
  const { lat: lat2, lng: lon2 } = to;

  if (
    !Number.isFinite(lat1) ||
    !Number.isFinite(lon1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lon2)
  ) {
    return null;
  }

  const R = 6371; // km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/* ---------------- Tiny helpers ---------------- */
export const toText = (val) => {
  if (val == null) return "—";
  if (typeof val === "object") return addressToLine(val) || "—";
  const s = String(val).trim();
  return s.length ? s : "—";
};
