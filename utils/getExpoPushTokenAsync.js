import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";

/**
 * ✅ Configure how notifications behave when app is in foreground
 * Put this once (top-level) in your app.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Change this to your backend endpoint that saves push tokens.
 * Example (you should create this backend route):
 *   POST https://grab.newedge.bt/realtime/api/push-token
 */
const SAVE_PUSH_TOKEN_URL = "https://grab.newedge.bt/realtime/api/push-token";

/**
 * ✅ Get Expo Push Token (your existing function, improved)
 * - Works on physical device only
 * - Requests permissions if needed
 * - Sets Android channel
 */
export async function getExpoPushTokenAsync() {
  let token = null;

  try {
    if (!Device.isDevice) {
      alert("Must use physical device for Push Notifications");
      return null;
    }

    // Get existing permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Request permission if not granted
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      alert("Failed to get push token for push notification!");
      return null;
    }

    // ✅ Get Expo push token
    const response = await Notifications.getExpoPushTokenAsync({
      projectId: "39465596-f80e-4ebb-b661-e149cd200ad8", // required for EAS builds
    });

    token = response?.data || null;
    console.log("✅ Expo Push Token:", token);

    // ✅ Android channel (required for Android)
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#FF231F7C",
      });
    }
  } catch (error) {
    console.error("Error getting Expo push token:", error);
  }

  return token;
}

/**
 * ✅ Register token to backend (do this after login)
 *
 * @param {Object} params
 * @param {number|string} params.user_id - logged in user id
 * @param {"user"|"merchant"} params.role - role of logged in user
 * @param {number|string|null} [params.business_id] - required if merchant wants business notifications
 * @param {string|null} [params.token] - optional JWT if your backend requires auth
 */
export async function registerExpoPushTokenToBackend({
  user_id,
  role = "user",
  business_id = null,
  token = null,
}) {
  try {
    const uid = Number(user_id);
    if (!Number.isFinite(uid) || uid <= 0) {
      console.log("[PUSH] Missing/invalid user_id, skipping token register");
      return null;
    }

    // 1) get expo token
    const expoToken = await getExpoPushTokenAsync();
    if (!expoToken) return null;

    // 2) send to backend
    const payload = {
      user_id: uid,
      role: String(role || "user"),
      business_id:
        business_id != null && Number(business_id) > 0 ? Number(business_id) : null,
      expo_push_token: expoToken,
      device: Platform.OS,
      device_name: Device?.deviceName || null,
    };

    console.log("[PUSH] saving token payload:", payload);

    const res = await fetch(SAVE_PUSH_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || data?.success === false) {
      console.log("[PUSH] ❌ token save failed:", data?.message || res.status);
      return null;
    }

    console.log("[PUSH] ✅ token saved on backend");
    return expoToken;
  } catch (e) {
    console.log("[PUSH] token register error:", e?.message || e);
    return null;
  }
}

/**
 * ✅ Optional helpers (recommended)
 * Listen when a notification arrives (foreground/background)
 */
export function addExpoNotificationListeners({
  onReceived,
  onResponse,
} = {}) {
  const receivedSub = Notifications.addNotificationReceivedListener((n) => {
    try {
      onReceived?.(n);
    } catch (e) {
      console.log("[PUSH] onReceived handler error:", e?.message || e);
    }
  });

  const responseSub = Notifications.addNotificationResponseReceivedListener((r) => {
    try {
      onResponse?.(r);
    } catch (e) {
      console.log("[PUSH] onResponse handler error:", e?.message || e);
    }
  });

  return {
    remove: () => {
      try {
        receivedSub?.remove?.();
      } catch {}
      try {
        responseSub?.remove?.();
      } catch {}
    },
  };
}