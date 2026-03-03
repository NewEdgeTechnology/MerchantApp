import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Simple UUID v4 (good enough for install ID)
function uuidv4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const KEY_SECURE = "device_id_install_v1";
const KEY_ASYNC = "device_id_install_v1_async";

export async function getStableDeviceId() {
  // 1) SecureStore
  try {
    const existing = await SecureStore.getItemAsync(KEY_SECURE);
    if (existing) return existing;
  } catch {}

  // 2) AsyncStorage fallback
  try {
    const existingAsync = await AsyncStorage.getItem(KEY_ASYNC);
    if (existingAsync) {
      try {
        await SecureStore.setItemAsync(KEY_SECURE, existingAsync);
      } catch {}
      return existingAsync;
    }
  } catch {}

  // 3) Generate & persist
  const id = uuidv4();

  try {
    await SecureStore.setItemAsync(KEY_SECURE, id);
  } catch {}
  try {
    await AsyncStorage.setItem(KEY_ASYNC, id);
  } catch {}

  return id;
}