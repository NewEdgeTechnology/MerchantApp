// utils/secureStoreKeys.js
export const safeSSKey = (key, fallback = "app_key") => {
  const s = (key == null ? "" : String(key)).trim();
  const cleaned = s.replace(/[^a-zA-Z0-9._-]/g, "_"); // allow only SecureStore-safe chars
  return cleaned.length ? cleaned : fallback;
};

export const makeBatchKey = (businessId) => {
  const bid = (businessId == null ? "" : String(businessId)).trim();
  return safeSSKey(`food.last_batch_id.${bid || "global"}`, "food.last_batch_id.global");
};
