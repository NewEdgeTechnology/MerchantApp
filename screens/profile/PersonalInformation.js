// PersonalInformation.js — Fixed with correct HTTP method and endpoint
import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Alert,
  Image,
  ActivityIndicator,
  Platform,
  DeviceEventEmitter,
  ScrollView,
  KeyboardAvoidingView,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import * as SecureStore from "expo-secure-store";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { BRAND, FONT, RADIUS, SHADOW } from "../styles/tabdey_brand";
import {
  PROFILE_ENDPOINT,
  PROFILE_IMAGE as PROFILE_IMAGE_ENDPOINT,
} from "@env";

const { width } = Dimensions.get("window");
const KEY_MERCHANT_LOGIN = "merchant_login";

/** ───────── Phone rules (Bhutan) ───────── */
const COUNTRY_CODE = "+975";
const LOCAL_MAX_LEN = 8;
const ALLOWED_PREFIXES = ["77", "17", "16"];

/** Android emulator localhost normalization */
function normalizeHost(url) {
  if (!url) return "";
  try {
    const u = new URL(url);
    if (
      Platform.OS === "android" &&
      (u.hostname === "localhost" || u.hostname === "127.0.0.1")
    ) {
      u.hostname = "10.0.2.2";
    }
    return u.toString();
  } catch {
    return url;
  }
}

const isLocalFileUri = (src) =>
  !!src &&
  (/^file:\/\//i.test(src) ||
    /^content:\/\//i.test(src) ||
    /^asset:\/\//i.test(src) ||
    /^ph:\/\//i.test(src));

const makeAbsolute = (maybeRelative, base = PROFILE_IMAGE_ENDPOINT) => {
  if (!maybeRelative) return "";
  const s = String(maybeRelative);
  if (/^https?:\/\//i.test(s)) return s;
  const b = (base || "").replace(/\/+$/, "");
  const p = s.startsWith("/") ? s.slice(1) : s;
  return `${b}/${p}`;
};

const withVersion = (url, version) => {
  if (!url || !version) return url;
  try {
    const u = new URL(url);
    u.searchParams.set("v", String(version));
    return u.toString();
  } catch {
    return url.includes("?") ? `${url}&v=${version}` : `${url}?v=${version}`;
  }
};

async function fetchJSON(url, options = {}, timeoutMs = 15000) {
  console.log("🌐 Fetching URL:", url);
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    console.log("📡 Response status:", res.status);

    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {}
    if (!res.ok) {
      const msg =
        (json && (json.message || json.error)) || text || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return json;
  } finally {
    clearTimeout(tid);
  }
}

async function discoverUserIdFromStore() {
  try {
    const raw = await SecureStore.getItemAsync(KEY_MERCHANT_LOGIN);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const candidates = [
      data?.user?.user_id,
      data?.user?.id,
      data?.user_id,
      data?.id,
      data?.merchant?.user_id,
      data?.merchant?.id,
      data?.data?.user_id,
      data?.userId,
      data?.user?.userId,
    ].filter((v) => v !== undefined && v !== null && v !== "");
    if (candidates.length) {
      console.log("✅ Found user ID in storage:", candidates[0]);
      return String(candidates[0]);
    }
  } catch (e) {
    console.error("Error discovering user ID:", e);
  }
  return null;
}

/** ───────── Phone helpers ───────── */
const digitsOnly = (s = "") => String(s).replace(/\D+/g, "");

const stripCountry = (raw = "") => {
  const s = String(raw).trim();
  if (s.startsWith(COUNTRY_CODE))
    return digitsOnly(s.slice(COUNTRY_CODE.length));
  if (s.startsWith("00975")) return digitsOnly(s.slice(5));
  if (s.startsWith("975")) return digitsOnly(s.slice(3));
  return digitsOnly(s);
};

const buildE164 = (local = "") => {
  const d = digitsOnly(local);
  return d ? `${COUNTRY_CODE}${d}` : "";
};

const isLocalValid = (local = "") => {
  const d = digitsOnly(local);
  if (d.length < 2) return false;
  if (!ALLOWED_PREFIXES.includes(d.slice(0, 2))) return false;
  return d.length === LOCAL_MAX_LEN;
};

export default function PersonalInformation() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const route = useRoute();
  const params = route?.params || {};

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [localPhone, setLocalPhone] = useState("");
  const [avatar, setAvatar] = useState("");
  const [userId, setUserId] = useState(
    params?.user_id ? String(params.user_id) : "",
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [phoneError, setPhoneError] = useState("");

  // Construct endpoint URL properly - make sure it includes /driver
  const endpoint = useMemo(() => {
    if (!PROFILE_ENDPOINT) {
      console.error("❌ PROFILE_ENDPOINT not defined in env");
      return "";
    }
    if (!userId) {
      console.log("⏳ Waiting for user ID...");
      return "";
    }

    // Get the base URL from env
    let base = PROFILE_ENDPOINT.trim().replace(/\/+$/, "");

    // Remove any {user_id} placeholder
    base = base.replace(/\{user_id\}/g, "");

    // Ensure the URL has /driver in the path
    // If the base doesn't include 'driver', add it
    if (!base.includes("/driver/")) {
      // Insert /driver after the domain
      const urlParts = base.split("/");
      const domain = urlParts.slice(0, 3).join("/"); // https://backend.tabdhey.bt
      const rest = urlParts.slice(3).join("/");
      base = `${domain}/driver/${rest}`;
    }

    // Construct the full URL with user ID
    const fullUrl = `${base}/${userId}`;
    const normalized = normalizeHost(fullUrl);
    console.log("🔗 Constructed endpoint:", normalized);
    return normalized;
  }, [userId]);

  useEffect(() => {
    (async () => {
      if (userId) {
        console.log("📱 User ID from params:", userId);
        return;
      }
      console.log("🔍 Discovering user ID from storage...");
      const discovered = await discoverUserIdFromStore();
      if (discovered) {
        console.log("✅ Discovered user ID:", discovered);
        setUserId(discovered);
      } else {
        setError("Unable to find user information. Please log in again.");
        setLoading(false);
      }
    })();
  }, []);

  const hydrateFromPayload = (payload) => {
    console.log("📦 Hydrating from payload:", payload);
    const data = payload?.data || payload;

    setName(data?.user_name || "");
    setEmail(data?.email || "");

    const rawPhone = data?.phone || "";
    const stripped = stripCountry(rawPhone);
    console.log("📞 Phone raw:", rawPhone, "stripped:", stripped);
    setLocalPhone(stripped.slice(0, LOCAL_MAX_LEN));

    const version = data?.profile_image_version || data?.updated_at || null;

    if (data?.profile_image) {
      const abs = makeAbsolute(
        String(data.profile_image),
        PROFILE_IMAGE_ENDPOINT,
      );
      setAvatar(withVersion(abs, version));
      console.log("🖼️ Avatar URL:", abs);
    } else {
      setAvatar("");
    }
  };

  const fetchProfile = useCallback(async () => {
    if (!endpoint) {
      if (userId) {
        setError(
          "API endpoint not properly configured. Check PROFILE_ENDPOINT in .env",
        );
      }
      setLoading(false);
      return;
    }
    try {
      setError(null);
      setLoading(true);
      console.log("🚀 Fetching profile from:", endpoint);
      const response = await fetchJSON(endpoint, { method: "GET" });
      console.log("✅ Profile fetched successfully");
      hydrateFromPayload(response);
    } catch (e) {
      console.error("❌ Fetch error:", e);
      setError(
        e.message || "Failed to fetch profile. Please check your connection.",
      );
    } finally {
      setLoading(false);
    }
  }, [endpoint, userId]);

  useEffect(() => {
    if (userId) {
      fetchProfile();
    }
  }, [userId, fetchProfile]);

  const handleChangePhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Permission required",
        "We need permission to access your gallery.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) {
      const uri = result?.assets?.[0]?.uri;
      if (uri) setAvatar(uri);
    }
  };

  const persistLocalAndNotify = async (payload) => {
    try {
      const raw = await SecureStore.getItemAsync(KEY_MERCHANT_LOGIN);
      let blob = {};
      try {
        blob = raw ? JSON.parse(raw) : {};
      } catch {}
      const merged = {
        ...blob,
        user_name: payload?.user_name ?? name,
        email: payload?.email ?? email,
        phone: payload?.phone ?? buildE164(localPhone),
        profile_image: payload?.profile_image ?? avatar,
        user_id: userId,
        user: {
          ...(blob.user || {}),
          user_id: userId,
          user_name: payload?.user_name ?? name,
          email: payload?.email ?? email,
          phone: payload?.phone ?? buildE164(localPhone),
          profile_image: payload?.profile_image ?? avatar,
        },
      };
      await SecureStore.setItemAsync(
        KEY_MERCHANT_LOGIN,
        JSON.stringify(merged),
      );
      console.log("💾 Profile saved to storage");
    } catch (e) {
      console.error("Error saving to storage:", e);
    }
    DeviceEventEmitter.emit("profile-updated", {
      name: payload?.user_name ?? name,
      profile_image: payload?.profile_image ?? avatar,
    });
  };

  const updateProfile = async () => {
    const formData = new FormData();
    formData.append("user_name", name);
    formData.append("email", email);
    formData.append("phone", buildE164(localPhone));

    if (isLocalFileUri(avatar)) {
      formData.append("profile_image", {
        uri: avatar,
        name: `avatar_${Date.now()}.jpg`,
        type: "image/jpeg",
      });
    } else if (avatar && !avatar.startsWith("http")) {
      formData.append("profile_image", avatar);
    }

    console.log("📤 Updating profile with PUT to:", endpoint);
    const response = await fetch(endpoint, {
      method: "PUT", // Changed back to PUT
      body: formData,
    });

    const text = await response.text();
    console.log("📥 Update response status:", response.status);
    console.log("📥 Update response body:", text.substring(0, 200));

    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}

    if (!response.ok) {
      throw new Error(
        json?.message || json?.error || `HTTP ${response.status}`,
      );
    }
    return json;
  };

  const handleSave = async () => {
    const valid = isLocalValid(localPhone);
    setPhoneError(valid ? "" : "Enter 8 digits starting with 77, 17 or 16.");
    if (!valid) {
      Alert.alert(
        "Invalid phone",
        "Phone must be 8 digits and start with 77, 17 or 16.",
      );
      return;
    }

    if (!endpoint) {
      Alert.alert("Error", "Cannot save: API endpoint not configured");
      return;
    }

    try {
      setLoading(true);
      await updateProfile();

      // Fetch fresh data after update
      const fresh = await fetchJSON(endpoint, { method: "GET" });
      hydrateFromPayload(fresh);

      const profileImage = fresh?.data?.profile_image || fresh?.profile_image;
      const resolved = profileImage
        ? makeAbsolute(String(profileImage), PROFILE_IMAGE_ENDPOINT)
        : avatar;

      await persistLocalAndNotify({
        user_name: fresh?.data?.user_name ?? name,
        email: fresh?.data?.email ?? email,
        phone: fresh?.data?.phone ?? buildE164(localPhone),
        profile_image: resolved,
      });

      Alert.alert("Success", "Profile updated successfully");
      navigation.goBack();
    } catch (e) {
      console.error("Save error:", e);
      Alert.alert(
        "Save Failed",
        e?.message || "Unable to save changes. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const onLocalPhoneChange = (txt) => {
    const d = digitsOnly(txt).slice(0, LOCAL_MAX_LEN);
    setLocalPhone(d);
    if (d.length >= 2 && !ALLOWED_PREFIXES.includes(d.slice(0, 2))) {
      setPhoneError("Number must start with 77, 17 or 16.");
    } else if (d.length && d.length < LOCAL_MAX_LEN) {
      setPhoneError(
        `Enter ${LOCAL_MAX_LEN} digits (${d.length}/${LOCAL_MAX_LEN})`,
      );
    } else {
      setPhoneError("");
    }
  };
  const canSave =
    isLocalValid(localPhone) && !loading && name.trim().length > 0;

  if (loading)
    return (
      <View style={styles.centerWrap}>
        <ActivityIndicator size="large" color="#16a34a" />
        <Text style={{ marginTop: 10, color: "#475569" }}>
          Loading profile…
        </Text>
      </View>
    );

  if (error)
    return (
      <View style={styles.centerWrap}>
        <Ionicons name="alert-circle-outline" size={48} color="#b91c1c" />
        <Text style={styles.errorTitle}>Couldn't load data</Text>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity
          onPress={fetchProfile}
          style={[styles.saveButton, { marginTop: 16 }]}
        >
          <Text style={styles.saveButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <View style={styles.topGlow} />

        <View style={[styles.headerBar]}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={22} color={BRAND.black} />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Personal Information</Text>

          <View style={{ width: 42 }} />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollInner}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.profileCard}>
            <View style={styles.avatarWrap}>
              {avatar ? (
                <Image source={{ uri: avatar }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Ionicons name="person" size={42} color={BRAND.purple} />
                </View>
              )}

              <TouchableOpacity
                onPress={handleChangePhoto}
                style={styles.cameraBadge}
              >
                <Ionicons name="camera-outline" size={16} color={BRAND.white} />
              </TouchableOpacity>
            </View>

            <Text style={styles.profileTitle}>{name || "Your Profile"}</Text>
            <Text style={styles.profileSub}>
              Update your merchant account details
            </Text>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Full name"
              placeholderTextColor={BRAND.grey}
            />

            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="email@example.com"
              placeholderTextColor={BRAND.grey}
            />

            <Text style={styles.label}>Phone</Text>
            <View style={styles.phoneRow}>
              <View style={styles.ccBox}>
                <Text style={styles.ccText}>{COUNTRY_CODE}</Text>
              </View>

              <TextInput
                style={[styles.input, styles.localInput]}
                value={localPhone}
                onChangeText={onLocalPhoneChange}
                keyboardType="number-pad"
                placeholder="77xxxxxx"
                placeholderTextColor={BRAND.grey}
                maxLength={LOCAL_MAX_LEN}
              />
            </View>

            {!!phoneError && (
              <Text style={styles.helperError}>{phoneError}</Text>
            )}
          </View>

          <TouchableOpacity
            style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
            onPress={handleSave}
            activeOpacity={0.9}
            disabled={!canSave}
          >
            <Text style={styles.saveButtonText}>Save Changes</Text>
          </TouchableOpacity>

          <View style={{ height: 24 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#FBF7FF",
  },

  topGlow: {
    position: "absolute",
    top: -120,
    right: -90,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: BRAND.purpleLight,
    opacity: 0.38,
  },

  headerBar: {
    minHeight: 54,
    paddingHorizontal: 18,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "transparent",
  },

  backBtn: {
    width: 42,
    height: 42,
    borderRadius: RADIUS.full,
    backgroundColor: BRAND.white,
    alignItems: "center",
    justifyContent: "center",
    ...SHADOW.sm,
  },

  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: FONT.header,
    fontSize: 20,
    fontWeight: "900",
    color: BRAND.black,
  },

  scrollInner: {
    paddingHorizontal: 18,
    paddingBottom: 30,
  },

  profileCard: {
    backgroundColor: BRAND.white,
    borderRadius: 26,
    alignItems: "center",
    paddingVertical: 22,
    paddingHorizontal: 16,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#F3E8FF",
    // ...SHADOW.md,
  },

  avatarWrap: {
    width: 108,
    height: 108,
    borderRadius: 54,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F4E9FF",
    borderWidth: 2,
    borderColor: BRAND.purpleLight,
  },

  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },

  avatarFallback: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#F4E9FF",
    alignItems: "center",
    justifyContent: "center",
  },

  cameraBadge: {
    position: "absolute",
    right: 2,
    bottom: 4,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: BRAND.purple,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: BRAND.white,
  },

  profileTitle: {
    fontFamily: FONT.header,
    fontSize: width > 400 ? 21 : 19,
    fontWeight: "900",
    color: BRAND.black,
    marginTop: 14,
  },

  profileSub: {
    fontFamily: FONT.body,
    fontSize: 13,
    fontWeight: "600",
    color: BRAND.grey,
    marginTop: 5,
  },

  formCard: {
    backgroundColor: BRAND.white,
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: "#F3E8FF",
    // ...SHADOW.sm,
  },

  label: {
    fontFamily: FONT.body,
    fontSize: 14,
    fontWeight: "800",
    color: BRAND.black,
    marginBottom: 7,
  },

  input: {
    fontFamily: FONT.body,
    borderWidth: 1.2,
    borderColor: BRAND.greyBorder,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 16,
    marginBottom: 16,
    fontSize: width > 400 ? 16 : 15,
    color: BRAND.black,
    backgroundColor: "#FCFCFC",
  },

  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 4,
  },

  ccBox: {
    borderWidth: 1.2,
    borderColor: BRAND.greyBorder,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: "#FCFCFC",
  },

  ccText: {
    fontFamily: FONT.body,
    fontWeight: "900",
    color: BRAND.black,
    fontSize: width > 400 ? 16 : 15,
  },

  localInput: {
    flex: 1,
    marginBottom: 0,
  },

  helperError: {
    fontFamily: FONT.body,
    color: BRAND.red,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 6,
  },

  saveButton: {
    backgroundColor: BRAND.purple,
    paddingVertical: 16,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    marginTop: 22,
    ...SHADOW.md,
  },

  saveButtonDisabled: {
    opacity: 0.55,
  },

  saveButtonText: {
    fontFamily: FONT.body,
    color: BRAND.white,
    fontSize: width > 400 ? 17 : 16,
    fontWeight: "900",
  },

  centerWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: "#FBF7FF",
  },

  errorTitle: {
    fontFamily: FONT.header,
    fontSize: 18,
    fontWeight: "900",
    color: BRAND.red,
    marginBottom: 6,
    textAlign: "center",
  },

  errorText: {
    fontFamily: FONT.body,
    color: BRAND.red,
    textAlign: "center",
    marginBottom: 10,
  },
});
