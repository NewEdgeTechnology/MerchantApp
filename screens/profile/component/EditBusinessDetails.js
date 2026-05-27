// screens/profile/component/EditBusinessDetails.js
// ✅ FULLY FIXED: Proper location picking with working OSMView
// ✅ IMPROVED: Separate hour & minute inputs for opening/closing times

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  Image,
  RefreshControl,
  Modal,
  Pressable,
  Dimensions,
  KeyboardAvoidingView,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { OSMView } from "expo-osm-sdk";
import { useNavigation, useRoute } from "@react-navigation/native";
import { BUSINESS_DETAILS, MERCHANT_LOGO } from "@env";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

/* ============================================================
   ERROR BOUNDARY COMPONENT FOR MAP
============================================================ */
class OSMViewErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("OSMView crashed in EditBusinessDetails:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.mapErrorContainer}>
          <Ionicons name="map-outline" size={48} color="#ef4444" />
          <Text style={styles.mapErrorText}>Map failed to load</Text>
          <Text style={styles.mapErrorSubtext}>Tap to retry</Text>
          <TouchableOpacity
            style={styles.mapRetryBtn}
            onPress={() => this.setState({ hasError: false })}
          >
            <Text style={styles.mapRetryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

// Must match backend multer field names
const LOGO_FIELD = "business_logo";
const LICENSE_FIELD = "license_image";

// Must match your login storage keys
const KEY_AUTH_TOKEN = "auth_token";
const KEY_MERCHANT_LOGIN = "merchant_login";

/* ---------------- helpers ---------------- */

const isHttpUrl = (u) => /^https?:\/\//i.test(String(u || ""));

const joinUrl = (base, path) => {
  const b = String(base || "").trim();
  const p = String(path || "").trim();
  if (!b) return p || "";
  if (!p) return b;
  if (b.endsWith("/") && p.startsWith("/")) return b + p.slice(1);
  if (!b.endsWith("/") && !p.startsWith("/")) return b + "/" + p;
  return b + p;
};

const buildDetailsUrl = (template, businessId) => {
  const t = String(template || "").trim();
  if (!t) return "";
  if (businessId == null) return t;
  return t
    .replace("{business_id}", String(businessId))
    .replace(":business_id", String(businessId));
};

const isNilish = (v) => {
  if (v === null || v === undefined) return true;
  const s = String(v).trim().toLowerCase();
  return s === "" || s === "null" || s === "undefined";
};

const safeText = (v, fallback = "") => (isNilish(v) ? fallback : String(v));
const pad2 = (n) => String(n).padStart(2, "0");

/** Accepts:
 * - "HH:mm" or "HH:mm:ss"
 * - "h:mm AM", "h:mmPM", "h AM", "hh:mm pm", etc
 * Returns "HH:mm:ss" or null
 */
const to24hHHmmss = (input) => {
  const raw = String(input || "").trim();
  if (!raw) return null;

  const s = raw.replace(/\./g, "").replace(/\s+/g, " ").trim();
  const up = s.toUpperCase();

  const m12 = up.match(/^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(AM|PM)$/);
  if (m12) {
    let hh = Number(m12[1]);
    const mm = Number(m12[2] ?? "0");
    const ss = Number(m12[3] ?? "0");
    const ap = m12[4];

    if (!Number.isFinite(hh) || hh < 1 || hh > 12) return null;
    if (!Number.isFinite(mm) || mm < 0 || mm > 59) return null;
    if (!Number.isFinite(ss) || ss < 0 || ss > 59) return null;

    if (ap === "AM") {
      if (hh === 12) hh = 0;
    } else {
      if (hh !== 12) hh += 12;
    }
    return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
  }

  const m24 = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m24) {
    const hh = Number(m24[1]);
    const mm = Number(m24[2]);
    const ss = Number(m24[3] ?? "0");
    if (!Number.isFinite(hh) || hh < 0 || hh > 23) return null;
    if (!Number.isFinite(mm) || mm < 0 || mm > 59) return null;
    if (!Number.isFinite(ss) || ss < 0 || ss > 59) return null;
    return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
  }

  return null;
};

const toAmPmLabel = (t) => {
  const raw = String(t || "").trim();
  if (!raw) return "";
  const m = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return raw;

  let hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return raw;

  const ap = hh >= 12 ? "PM" : "AM";
  hh = hh % 12;
  if (hh === 0) hh = 12;
  return `${hh}:${pad2(mm)} ${ap}`;
};

const splitAmPm = (label) => {
  const s = String(label || "").trim();
  if (!s) return { time: "", meridiem: "AM" };

  const up = s.toUpperCase().replace(/\s+/g, " ").trim();

  const m = up.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/);
  if (m) {
    const hh = m[1];
    const mm = m[2] ?? "00";
    return { time: `${Number(hh)}:${pad2(mm)}`, meridiem: m[3] };
  }

  const maybeLabel = toAmPmLabel(up);
  const m2 = String(maybeLabel)
    .toUpperCase()
    .match(/^(\d{1,2}:\d{2})\s*(AM|PM)$/);
  if (m2) return { time: m2[1], meridiem: m2[2] };

  return { time: s, meridiem: "AM" };
};

const parseHourMinute = (timeStr) => {
  if (!timeStr) return { hour: "", minute: "" };
  const parts = timeStr.split(":");
  let hour = parts[0] || "";
  let minute = parts[1] || "";
  return { hour, minute };
};

const normalizeTime = (t) => {
  const s = String(t || "").trim();
  if (!s) return null;

  const out = to24hHHmmss(s);
  if (out) return out;

  if (/^\d{2}:\d{2}$/.test(s)) return s + ":00";
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s;
  return s;
};

const guessMime = (uri) => {
  const u = String(uri || "").toLowerCase();
  if (u.endsWith(".png")) return "image/png";
  if (u.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
};

const filenameFromUri = (uri, fallback) => {
  const u = String(uri || "");
  const last = u.split("?")[0].split("#")[0].split("/").pop();
  return last && last.includes(".") ? last : fallback;
};

const stripBearer = (t) =>
  String(t || "")
    .replace(/^Bearer\s+/i, "")
    .trim();
const tryParseJson = (v) => {
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
};
const pickFirstString = (...vals) => {
  for (const v of vals) {
    if (!v) continue;
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
};

async function getAccessTokenFromLogin() {
  try {
    const raw = await SecureStore.getItemAsync(KEY_MERCHANT_LOGIN);
    if (raw) {
      const parsed = tryParseJson(raw);

      const tokenNode =
        parsed?.token ??
        parsed?.data?.token ??
        parsed?.auth ??
        parsed?.jwt ??
        parsed?.access_token ??
        parsed?.accessToken ??
        parsed?.token ??
        parsed?.jwt;

      const tokenMaybeParsed =
        typeof tokenNode === "string"
          ? tryParseJson(tokenNode) || tokenNode
          : tokenNode;

      const candidate = pickFirstString(
        tokenMaybeParsed?.access_token,
        tokenMaybeParsed?.accessToken,
        tokenMaybeParsed?.token,
        tokenMaybeParsed?.jwt,
        typeof tokenMaybeParsed === "string" ? tokenMaybeParsed : null,
        parsed?.access_token,
        parsed?.accessToken,
        parsed?.token,
        parsed?.jwt,
      );

      if (candidate) return stripBearer(candidate);
    }
  } catch {}

  try {
    const raw = await SecureStore.getItemAsync(KEY_AUTH_TOKEN);
    if (raw) {
      const parsed = tryParseJson(raw);
      const candidate = pickFirstString(
        parsed?.access_token,
        parsed?.accessToken,
        parsed?.token,
        typeof raw === "string" ? raw : null,
      );
      if (candidate) return stripBearer(candidate);
    }
  } catch {}

  const keysToTry = [
    "access_token",
    "ACCESS_TOKEN",
    "token",
    "authToken",
    "AUTH_TOKEN",
  ];
  for (const k of keysToTry) {
    try {
      const raw = await SecureStore.getItemAsync(k);
      if (!raw) continue;
      const parsed = tryParseJson(raw);
      const candidate = pickFirstString(
        parsed?.access_token,
        parsed?.accessToken,
        parsed?.token,
        typeof raw === "string" ? raw : null,
      );
      if (candidate) return stripBearer(candidate);
    } catch {}
  }

  return null;
}

/* ---------------- picker helpers ---------------- */

async function pickFromGallery() {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert(
      "Permission required",
      "Please allow photo access to choose an image.",
    );
    return null;
  }
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    quality: 0.85,
  });
  if (res.canceled) return null;
  return res.assets?.[0] || null;
}

async function pickFromCamera() {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    Alert.alert(
      "Permission required",
      "Please allow camera access to take a photo.",
    );
    return null;
  }
  const res = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    quality: 0.85,
  });
  if (res.canceled) return null;
  return res.assets?.[0] || null;
}

/* ---------------- helper to convert comma string to JSON array ---------------- */
const commaStringToJsonArray = (str) => {
  if (!str || !str.trim()) return null;

  const items = str
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (items.length === 0) return null;

  return JSON.stringify(items);
};

/* ---------------- helper to convert JSON array to comma string for display ---------------- */
const jsonArrayToCommaString = (jsonStr) => {
  if (!jsonStr) return "";

  try {
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed)) {
      return parsed.join(", ");
    }
    return jsonStr;
  } catch {
    return jsonStr;
  }
};

/* ---------------- small UI atoms ---------------- */

const Label = ({ children }) => <Text style={styles.label}>{children}</Text>;

const Input = ({ isFocused, onFocus, onBlur, multiline, style, ...props }) => (
  <View style={[styles.inputWrap, isFocused ? styles.inputWrapFocused : null]}>
    <TextInput
      {...props}
      onFocus={onFocus}
      onBlur={onBlur}
      placeholderTextColor="#94a3b8"
      style={[styles.input, multiline ? styles.inputMultiline : null, style]}
      multiline={multiline}
    />
  </View>
);

const SelectRow = ({ value, onPress }) => (
  <TouchableOpacity
    activeOpacity={0.9}
    onPress={onPress}
    style={styles.selectRow}
  >
    <Text style={styles.selectValue}>{value || "Select"}</Text>
    <Ionicons name="chevron-down" size={18} color="#0f172a" />
  </TouchableOpacity>
);

export default function EditBusinessDetails() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();

  const businessId =
    route?.params?.business_id ?? route?.params?.businessId ?? null;
  const initial = route?.params?.initial ?? null;

  const detailsUrl = useMemo(
    () => buildDetailsUrl(BUSINESS_DETAILS, businessId),
    [businessId],
  );

  const [loading, setLoading] = useState(!initial);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [details, setDetails] = useState(initial);

  // focused input -> green border
  const [focusedKey, setFocusedKey] = useState(null);

  // form state
  const [business_name, setBusinessName] = useState(
    safeText(initial?.business_name),
  );
  const [address, setAddress] = useState(safeText(initial?.address));
  const [latitude, setLatitude] = useState(safeText(initial?.latitude));
  const [longitude, setLongitude] = useState(safeText(initial?.longitude));

  // Map picker state (using OSMView)
  const [mapOpen, setMapOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [tempSelectedCoords, setTempSelectedCoords] = useState(null); // Temporary selection in map
  const [mapCenter, setMapCenter] = useState(null);
  const [centerPinCoord, setCenterPinCoord] = useState(null);
  const [confirmedCoord, setConfirmedCoord] = useState(null);
  const [mapZoom, setMapZoom] = useState(15);
  const [mapMarkers, setMapMarkers] = useState([]);
  const [mapError, setMapError] = useState(false);
  const [mapInitAttempts, setMapInitAttempts] = useState(0);
  const [mapKey, setMapKey] = useState(Date.now());
  const [mapLoading, setMapLoading] = useState(true);

  // time = separate hour/minute + AM/PM dropdown
  const initOpen = splitAmPm(toAmPmLabel(initial?.opening_time));
  const initClose = splitAmPm(toAmPmLabel(initial?.closing_time));
  const { hour: initOpenHour, minute: initOpenMinute } = parseHourMinute(
    initOpen.time,
  );
  const { hour: initCloseHour, minute: initCloseMinute } = parseHourMinute(
    initClose.time,
  );

  const [openingHour, setOpeningHour] = useState(initOpenHour);
  const [openingMinute, setOpeningMinute] = useState(initOpenMinute);
  const [openingMeridiem, setOpeningMeridiem] = useState(initOpen.meridiem);
  const [closingHour, setClosingHour] = useState(initCloseHour);
  const [closingMinute, setClosingMinute] = useState(initCloseMinute);
  const [closingMeridiem, setClosingMeridiem] = useState(initClose.meridiem);

  const opening_time = useMemo(() => {
    if (!openingHour) return "";
    const minute = openingMinute
      ? String(openingMinute).padStart(2, "0")
      : "00";
    return `${openingHour}:${minute} ${openingMeridiem}`;
  }, [openingHour, openingMinute, openingMeridiem]);

  const closing_time = useMemo(() => {
    if (!closingHour) return "";
    const minute = closingMinute
      ? String(closingMinute).padStart(2, "0")
      : "00";
    return `${closingHour}:${minute} ${closingMeridiem}`;
  }, [closingHour, closingMinute, closingMeridiem]);

  const [delivery_option, setDeliveryOption] = useState(
    safeText(initial?.delivery_option, "BOTH").toUpperCase(),
  );

  const [holidaysDisplay, setHolidaysDisplay] = useState(() => {
    const val = initial?.holidays;
    if (!val) return "";
    return jsonArrayToCommaString(val);
  });

  const [min_amount_for_fd, setMinAmountForFD] = useState(
    safeText(initial?.min_amount_for_fd),
  );

  const [complementary, setComplementary] = useState(
    safeText(initial?.complementary),
  );
  const [complementary_details, setComplementaryDetails] = useState(
    safeText(initial?.complementary_details),
  );
  const [special_celebration, setSpecialCelebration] = useState(
    safeText(initial?.special_celebration),
  );
  const [special_celebration_discount_percentage, setCelebrationDiscount] =
    useState(safeText(initial?.special_celebration_discount_percentage));

  // images
  const [pickedLogo, setPickedLogo] = useState(null);
  const [pickedLicense, setPickedLicense] = useState(null);

  // image viewer modal
  const [imgModalOpen, setImgModalOpen] = useState(false);
  const [imgModalUri, setImgModalUri] = useState("");
  const [imgModalTitle, setImgModalTitle] = useState("");

  // source chooser
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [sourceTarget, setSourceTarget] = useState(null);

  // delivery dropdown modal
  const [deliveryModalOpen, setDeliveryModalOpen] = useState(false);

  // AM/PM dropdown modal
  const [ampmModalOpen, setAmpmModalOpen] = useState(false);
  const [ampmTarget, setAmpmTarget] = useState(null);

  // Map loader timeout
  useEffect(() => {
    const timer = setTimeout(() => {
      if (mapLoading) {
        console.log("Force hiding map loader after timeout");
        setMapLoading(false);
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  // Retry map initialization
  useEffect(() => {
    if (mapInitAttempts < 3 && mapLoading && mapInitAttempts > 0) {
      const retryTimer = setTimeout(() => {
        console.log(
          `Retrying map initialization (attempt ${mapInitAttempts + 1})`,
        );
        setMapKey(Date.now());
        setMapError(false);
      }, 2000);
      return () => clearTimeout(retryTimer);
    }
  }, [mapInitAttempts, mapLoading]);

  const openImageModal = useCallback((title, uri) => {
    if (!uri) return;
    setImgModalTitle(title || "Image");
    setImgModalUri(uri);
    setImgModalOpen(true);
  }, []);
  const closeImageModal = useCallback(() => {
    setImgModalOpen(false);
    setImgModalUri("");
    setImgModalTitle("");
  }, []);
  const openSourceModal = useCallback((target) => {
    setSourceTarget(target);
    setSourceModalOpen(true);
  }, []);
  const closeSourceModal = useCallback(() => {
    setSourceModalOpen(false);
    setSourceTarget(null);
  }, []);

  const openAmPmModal = useCallback((target) => {
    setAmpmTarget(target);
    setAmpmModalOpen(true);
  }, []);
  const closeAmPmModal = useCallback(() => {
    setAmpmTarget(null);
    setAmpmModalOpen(false);
  }, []);
  const pickAmPm = useCallback(
    (val) => {
      if (ampmTarget === "opening") setOpeningMeridiem(val);
      if (ampmTarget === "closing") setClosingMeridiem(val);
      closeAmPmModal();
    },
    [ampmTarget, closeAmPmModal],
  );

  const displayLogoUrl = useMemo(() => {
    if (pickedLogo?.uri) return pickedLogo.uri;
    const p = details?.business_logo;
    if (isNilish(p)) return "";
    return isHttpUrl(p) ? p : joinUrl(MERCHANT_LOGO, p);
  }, [pickedLogo, details]);

  const displayLicenseUrl = useMemo(() => {
    if (pickedLicense?.uri) return pickedLicense.uri;
    const p = details?.license_image;
    if (isNilish(p)) return "";
    return isHttpUrl(p) ? p : joinUrl(MERCHANT_LOGO, p);
  }, [pickedLicense, details]);

  // reverse geocode (best effort) -> fill address
  const reverseGeocodeToAddress = useCallback(async (lat, lng) => {
    try {
      const res = await Location.reverseGeocodeAsync({
        latitude: Number(lat),
        longitude: Number(lng),
      });
      const first = res?.[0];
      if (!first) return;

      const parts = [
        first.name,
        first.street,
        first.district,
        first.city,
        first.subregion,
        first.region,
        first.postalCode,
        first.country,
      ].filter(Boolean);

      const out = parts.join(", ").replace(/\s+/g, " ").trim();
      if (out) setAddress(out);
    } catch {}
  }, []);

  // ✅ FIXED: Create marker with proper pinColor (no PNGs)
  const updateMapMarker = useCallback((latNum, lngNum) => {
    setMapMarkers([
      {
        id: "selected",
        coordinate: { latitude: latNum, longitude: lngNum },
        title: "📍 SELECTED LOCATION",
        description: `Lat: ${latNum.toFixed(6)} | Lng: ${lngNum.toFixed(6)}`,
        pinColor: "#00b14f", // Green pin for selected location
      },
    ]);
  }, []);

  const applyCoords = useCallback(
    async (lat, lng, { alsoAddress = true } = {}) => {
      const latNum = Number(lat);
      const lngNum = Number(lng);
      if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return;

      const latStr = String(latNum.toFixed(6));
      const lngStr = String(lngNum.toFixed(6));

      setLatitude(latStr);
      setLongitude(lngStr);

      if (alsoAddress) {
        await reverseGeocodeToAddress(latNum, lngNum);
      }
    },
    [reverseGeocodeToAddress],
  );

 const extractMapCoord = useCallback((eventOrRegion) => {
  const latitude =
    eventOrRegion?.latitude ??
    eventOrRegion?.center?.latitude ??
    eventOrRegion?.nativeEvent?.latitude ??
    eventOrRegion?.nativeEvent?.coordinate?.latitude ??
    eventOrRegion?.nativeEvent?.center?.latitude ??
    eventOrRegion?.coordinate?.latitude;

  const longitude =
    eventOrRegion?.longitude ??
    eventOrRegion?.center?.longitude ??
    eventOrRegion?.nativeEvent?.longitude ??
    eventOrRegion?.nativeEvent?.coordinate?.longitude ??
    eventOrRegion?.nativeEvent?.center?.longitude ??
    eventOrRegion?.coordinate?.longitude;

  if (latitude == null || longitude == null) return null;

  return {
    latitude: Number(latitude),
    longitude: Number(longitude),
  };
}, []);

const handleMapPick = useCallback(
  (eventOrRegion) => {
    const coord = extractMapCoord(eventOrRegion);
    if (!coord) return;

    setCenterPinCoord(coord);
    setTempSelectedCoords(coord);
    setMapCenter(coord);
    setMapZoom(16);
    updateMapMarker(coord.latitude, coord.longitude);
  },
  [extractMapCoord, updateMapMarker],
);
  const closeMapPicker = useCallback(() => {
    setMapOpen(false);
    setTempSelectedCoords(null);
  }, []);
  const useCurrentLocationInMap = useCallback(async () => {
    try {
      setLocating(true);

      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission required", "Please allow location access.");
        return;
      }

      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const lat = pos?.coords?.latitude;
      const lng = pos?.coords?.longitude;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        Alert.alert("Location error", "Could not get your GPS location.");
        return;
      }

      const coord = { latitude: lat, longitude: lng };
      setTempSelectedCoords(coord);
      setMapCenter(coord);
      setCenterPinCoord(coord);
      updateMapMarker(lat, lng);

      // Auto-apply the current location
      await applyCoords(lat, lng, { alsoAddress: true });
      Alert.alert(
        "Success",
        "Current location has been set as your business location.",
      );
      closeMapPicker(); // Close the map picker after setting location
    } catch (e) {
      Alert.alert("Location error", String(e?.message || e));
    } finally {
      setLocating(false);
    }
  }, [updateMapMarker, applyCoords, closeMapPicker]);

  const openMapPicker = useCallback(async () => {
    setMapError(false);
    setMapLoading(false);
    setMapInitAttempts(0);
    setTempSelectedCoords(null); // Reset temp selection

    const latNum = Number(latitude);
    const lngNum = Number(longitude);

    if (Number.isFinite(latNum) && Number.isFinite(lngNum)) {
      const coord = { latitude: latNum, longitude: lngNum };
      setMapCenter(coord);
      setCenterPinCoord(coord);
      setMapZoom(16);
      updateMapMarker(latNum, lngNum);
      setMapOpen(true);
      return;
    }

    try {
      setLocating(true);
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        const coord = { latitude: 27.4728, longitude: 89.639 };
        setMapCenter(coord);
        setCenterPinCoord(coord);
        setMapZoom(13);
        setMapMarkers([]);
        setMapOpen(true);
        return;
      }

      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const lat = pos?.coords?.latitude;
      const lng = pos?.coords?.longitude;

      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        const coord = { latitude: lat, longitude: lng };
        setMapCenter(coord);
        setCenterPinCoord(coord);
        setMapZoom(15);
        setMapMarkers([]);
      } else {
        const coord = { latitude: 27.4728, longitude: 89.639 };
        setMapCenter(coord);
        setCenterPinCoord(coord);
        setMapZoom(13);
        setMapMarkers([]);
      }
      setMapOpen(true);
    } catch {
      const coord = { latitude: 27.4728, longitude: 89.639 };
      setMapCenter(coord);
      setCenterPinCoord(coord);
      setMapZoom(13);
      setMapMarkers([]);
      setMapOpen(true);
    } finally {
      setLocating(false);
    }
  }, [latitude, longitude, updateMapMarker]);

  const confirmMapSelection = useCallback(async () => {
    const coordToSave = centerPinCoord || tempSelectedCoords || mapCenter;

    if (!coordToSave?.latitude || !coordToSave?.longitude) {
      Alert.alert("Pick a location", "Move the map to your business location.");
      return;
    }

    await applyCoords(coordToSave.latitude, coordToSave.longitude, {
      alsoAddress: true,
    });

    setMapCenter(coordToSave);
setCenterPinCoord(coordToSave);
setTempSelectedCoords(coordToSave);
setConfirmedCoord(coordToSave);

    updateMapMarker(coordToSave.latitude, coordToSave.longitude);

    Alert.alert("Location Updated", "Business location has been updated.");
    closeMapPicker();
  }, [
    centerPinCoord,
    tempSelectedCoords,
    mapCenter,
    applyCoords,
    updateMapMarker,
    closeMapPicker,
  ]);
  const loadDetails = useCallback(
    async ({ isRefresh = false } = {}) => {
      try {
        if (!detailsUrl) throw new Error("BUSINESS_DETAILS missing in @env");
        if (!businessId) throw new Error("business_id is required");

        isRefresh ? setRefreshing(true) : setLoading(true);

        const accessToken = await getAccessTokenFromLogin();
        if (!accessToken)
          throw new Error("Access token not found. Please login again.");

        const res = await fetch(detailsUrl, {
          method: "GET",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
        });

        const json = await res.json().catch(() => null);
        if (!res.ok) {
          const msg =
            json?.message || json?.error || `Request failed (${res.status})`;
          throw new Error(msg);
        }

        const data = json?.data ?? json;
        setDetails(data);

        setBusinessName(safeText(data?.business_name));
        setAddress(safeText(data?.address));
        setLatitude(safeText(data?.latitude));
        setLongitude(safeText(data?.longitude));

        const latNum = Number(data?.latitude);
        const lngNum = Number(data?.longitude);
        if (Number.isFinite(latNum) && Number.isFinite(lngNum)) {
          const coord = { latitude: latNum, longitude: lngNum };
          setMapCenter(coord);
          setCenterPinCoord(coord);
          setMapZoom(16);
          updateMapMarker(latNum, lngNum);
        }

        const o = splitAmPm(toAmPmLabel(safeText(data?.opening_time)));
        const c = splitAmPm(toAmPmLabel(safeText(data?.closing_time)));
        const { hour: oHour, minute: oMinute } = parseHourMinute(o.time);
        const { hour: cHour, minute: cMinute } = parseHourMinute(c.time);
        setOpeningHour(oHour);
        setOpeningMinute(oMinute);
        setOpeningMeridiem(o.meridiem);
        setClosingHour(cHour);
        setClosingMinute(cMinute);
        setClosingMeridiem(c.meridiem);

        setDeliveryOption(
          safeText(data?.delivery_option, "BOTH").toUpperCase(),
        );

        const holidayVal = data?.holidays;
        if (holidayVal) {
          setHolidaysDisplay(jsonArrayToCommaString(holidayVal));
        } else {
          setHolidaysDisplay("");
        }

        setMinAmountForFD(safeText(data?.min_amount_for_fd));
        setComplementary(safeText(data?.complementary));
        setComplementaryDetails(safeText(data?.complementary_details));
        setSpecialCelebration(safeText(data?.special_celebration));
        setCelebrationDiscount(
          safeText(data?.special_celebration_discount_percentage),
        );
      } catch (e) {
        Alert.alert("Error", String(e?.message || e));
      } finally {
        isRefresh ? setRefreshing(false) : setLoading(false);
      }
    },
    [detailsUrl, businessId, updateMapMarker],
  );

  useEffect(() => {
    if (!initial) loadDetails();
  }, [initial, loadDetails]);

  const onRefresh = useCallback(
    () => loadDetails({ isRefresh: true }),
    [loadDetails],
  );

  const chooseFromGallery = useCallback(async () => {
    try {
      const asset = await pickFromGallery();
      if (!asset?.uri) return;
      if (sourceTarget === "logo") setPickedLogo(asset);
      if (sourceTarget === "license") setPickedLicense(asset);
    } catch (e) {
      Alert.alert("Pick image failed", String(e?.message || e));
    } finally {
      closeSourceModal();
    }
  }, [sourceTarget, closeSourceModal]);

  const chooseFromCamera = useCallback(async () => {
    try {
      const asset = await pickFromCamera();
      if (!asset?.uri) return;
      if (sourceTarget === "logo") setPickedLogo(asset);
      if (sourceTarget === "license") setPickedLicense(asset);
    } catch (e) {
      Alert.alert("Camera failed", String(e?.message || e));
    } finally {
      closeSourceModal();
    }
  }, [sourceTarget, closeSourceModal]);

  const validate = useCallback(() => {
    if (!business_name.trim()) return "Business name is required";
    if (!delivery_option.trim()) return "Delivery option is required";
    if (latitude && !Number.isFinite(Number(latitude)))
      return "Latitude must be a number";
    if (longitude && !Number.isFinite(Number(longitude)))
      return "Longitude must be a number";

    if (min_amount_for_fd && !Number.isFinite(Number(min_amount_for_fd))) {
      return "Min amount for FD must be a number";
    }

    if (special_celebration && !special_celebration_discount_percentage) {
      return "Discount % is required when Special Celebration is provided";
    }
    if (
      special_celebration_discount_percentage &&
      !Number.isFinite(Number(special_celebration_discount_percentage))
    ) {
      return "Discount % must be a number";
    }

    return "";
  }, [
    business_name,
    delivery_option,
    latitude,
    longitude,
    min_amount_for_fd,
    special_celebration,
    special_celebration_discount_percentage,
    
  ]);

  const BACKEND_KEYS = useMemo(
    () => [
      "business_name",
      "latitude",
      "longitude",
      "address",
      "delivery_option",
      "complementary",
      "complementary_details",
      "opening_time",
      "closing_time",
      "holidays",
      "special_celebration",
      "special_celebration_discount_percentage",
      "min_amount_for_fd",
    ],
    [],
  );

  const buildPayload = useCallback(() => {
    const holidaysJson = commaStringToJsonArray(holidaysDisplay);

    const payload = {
      business_name: business_name.trim(),
     latitude: confirmedCoord?.latitude
  ? String(confirmedCoord.latitude.toFixed(6))
  : latitude.trim() || null,

longitude: confirmedCoord?.longitude
  ? String(confirmedCoord.longitude.toFixed(6))
  : longitude.trim() || null,
      address: address.trim() || null,
      delivery_option: delivery_option.trim().toUpperCase() || null,
      complementary: complementary.trim() || null,
      complementary_details: complementary_details.trim() || null,
      opening_time: normalizeTime(opening_time),
      closing_time: normalizeTime(closing_time),
      holidays: holidaysJson,
      special_celebration: special_celebration.trim() || null,
      special_celebration_discount_percentage:
        special_celebration_discount_percentage.trim() || null,
      min_amount_for_fd: min_amount_for_fd.trim() || null,
    };

    if (!payload.special_celebration) {
      payload.special_celebration_discount_percentage = null;
    }
    return payload;
  }, [
    business_name,
    latitude,
    longitude,
    address,
    delivery_option,
    complementary,
    complementary_details,
    opening_time,
    closing_time,
    holidaysDisplay,
    special_celebration,
    special_celebration_discount_percentage,
    min_amount_for_fd,
    confirmedCoord,
  ]);

  const valueForCompare = (key, obj) => {
    const v = obj?.[key];

    if (key === "opening_time" || key === "closing_time") {
      const t = safeText(v);
      const maybe24 = to24hHHmmss(t);
      if (maybe24) return maybe24;

      if (/^\d{2}:\d{2}:\d{2}$/.test(t)) return t;
      if (/^\d{2}:\d{2}$/.test(t)) return t + ":00";
      return t || "";
    }

    if (key === "holidays") {
      const currentDisplay = holidaysDisplay;
      const currentJson = commaStringToJsonArray(currentDisplay);

      let originalJson = null;
      if (v) {
        if (typeof v === "string") {
          try {
            const parsed = JSON.parse(v);
            if (Array.isArray(parsed)) {
              originalJson = v;
            } else {
              originalJson = JSON.stringify([v]);
            }
          } catch {
            originalJson = commaStringToJsonArray(v);
          }
        } else if (Array.isArray(v)) {
          originalJson = JSON.stringify(v);
        } else {
          originalJson = JSON.stringify([String(v)]);
        }
      }

      return (currentJson || "") === (originalJson || "");
    }

    if (v === null || v === undefined) return "";
    return String(v);
  };

  const save = useCallback(async () => {
    const err = validate();
    if (err) {
      Alert.alert("Fix this", err);
      return;
    }
    if (!detailsUrl) {
      Alert.alert("Missing", "BUSINESS_DETAILS is missing in @env");
      return;
    }

    setSaving(true);
    try {
      const accessToken = await getAccessTokenFromLogin();
      if (!accessToken)
        throw new Error("Access token not found. Please login again.");

      const hasFiles = !!pickedLogo?.uri || !!pickedLicense?.uri;
      const payload = buildPayload();

      const base = details || initial || {};
      const supportedChanged = BACKEND_KEYS.some(
        (k) => valueForCompare(k, base) !== valueForCompare(k, payload),
      );

      if (!supportedChanged && !hasFiles) {
        setSaving(false);
        Alert.alert("Nothing to update", "No changes detected.");
        return;
      }

      let res;

      if (hasFiles) {
        const form = new FormData();

        BACKEND_KEYS.forEach((k) => {
          const vv = payload[k];
          if (vv === undefined) return;
          if (vv === null) return;
          form.append(k, String(vv));
        });

        if (pickedLogo?.uri) {
          form.append(LOGO_FIELD, {
            uri: pickedLogo.uri,
            name: filenameFromUri(pickedLogo.uri, "logo.jpg"),
            type: guessMime(pickedLogo.uri),
          });
        }
        if (pickedLicense?.uri) {
          form.append(LICENSE_FIELD, {
            uri: pickedLicense.uri,
            name: filenameFromUri(pickedLicense.uri, "license.jpg"),
            type: guessMime(pickedLicense.uri),
          });
        }

        res = await fetch(detailsUrl, {
          method: "PUT",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: form,
        });
      } else {
        const jsonPayload = {};
        BACKEND_KEYS.forEach((k) => {
          jsonPayload[k] = payload[k] ?? null;
        });

        res = await fetch(detailsUrl, {
          method: "PUT",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(jsonPayload),
        });
      }

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          json?.message || json?.error || `Update failed (${res.status})`;
        if (res.status === 401 || /expired|invalid/i.test(msg)) {
          throw new Error(
            "Invalid or expired token. Please logout and login again.",
          );
        }
        throw new Error(msg);
      }

      Alert.alert("Saved", "Business details updated successfully.");
      navigation.goBack();
    } catch (e) {
      Alert.alert("Save failed", String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }, [
    validate,
    detailsUrl,
    pickedLogo,
    pickedLicense,
    buildPayload,
    details,
    initial,
    navigation,
    BACKEND_KEYS,
    valueForCompare,
    confirmedCoord,
  ]);

  const headerTopPad = Math.max(insets.top, 8) + 18;

  const EXTRA_KB_SPACE = 140 + (insets?.bottom ?? 0);

  if (loading) {
    return (
      <View style={styles.centerWrap}>
        <ActivityIndicator size="large" color="#16a34a" />
        <Text style={styles.muted}>Loading…</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right", "bottom"]}>
      {/* FULLSCREEN MAP PICKER MODAL with OSMView - FIXED location picking */}
      <Modal
        visible={mapOpen}
        animationType="slide"
        onRequestClose={closeMapPicker}
      >
        <SafeAreaView
          style={styles.mapFullSafe}
          edges={["top", "left", "right", "bottom"]}
        >
          <View style={styles.mapFullHeader}>
            <TouchableOpacity
              onPress={closeMapPicker}
              style={styles.mapFullIconBtn}
              activeOpacity={0.8}
            >
              <Ionicons name="arrow-back" size={22} color="#0f172a" />
            </TouchableOpacity>

            <Text style={styles.mapFullTitle}>Pick Location</Text>

            <TouchableOpacity
              onPress={closeMapPicker}
              style={styles.mapFullIconBtn}
              activeOpacity={0.8}
            >
              <Ionicons name="close" size={22} color="#0f172a" />
            </TouchableOpacity>
          </View>

          <View style={styles.mapFullMapWrap}>
            {!mapError ? (
              <>
                <OSMViewErrorBoundary>
                  <OSMView
                    key={mapKey}
                    style={StyleSheet.absoluteFillObject}
                    initialCenter={
                      mapCenter || { latitude: 27.4728, longitude: 89.639 }
                    }
                    initialZoom={mapZoom || 12}
                    markers={mapMarkers}
                    styleUrl="https://tiles.openfreemap.org/styles/liberty"
                    onRegionChangeComplete={handleMapPick}
onPress={handleMapPick}
                    onMapReady={() => {
                      console.log("Map ready in EditBusinessDetails");
                      setMapLoading(false);
                      setMapInitAttempts(0);
                    }}
                    onError={(error) => {
                      console.error("Map error:", error);
                      setMapInitAttempts((prev) => prev + 1);
                      if (mapInitAttempts >= 2) {
                        setMapError(true);
                        setMapLoading(false);
                      }
                    }}
                    cacheEnabled={true}
                    cacheSize={100}
                    userAgent="YourApp/1.0"
                    renderToHardwareTextureAndroid={true}
                  />
                </OSMViewErrorBoundary>

                <View pointerEvents="none" style={styles.centerPin}>
                  <Ionicons name="location-sharp" size={42} color="#00b14f" />
                </View>
              </>
            ) : (
              <View style={styles.mapErrorContainer}>
                <Ionicons name="map-outline" size={48} color="#ef4444" />
                <Text style={styles.mapErrorText}>Unable to load map</Text>
                <Text style={styles.mapErrorSubtext}>
                  Check your internet connection
                </Text>
                <TouchableOpacity
                  style={styles.mapRetryBtn}
                  onPress={() => {
                    setMapError(false);
                    setMapInitAttempts(0);
                    setMapKey(Date.now());
                    setMapLoading(false);
                  }}
                >
                  <Text style={styles.mapRetryText}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}

            {mapLoading && !mapError && (
              <View style={styles.mapLoadingOverlay}>
                <ActivityIndicator size="large" color="#16a34a" />
                <Text style={styles.mapLoadingText}>Loading map...</Text>
                {mapInitAttempts > 0 && (
                  <Text style={styles.mapLoadingSubtext}>
                    Retry attempt {mapInitAttempts}/3
                  </Text>
                )}
              </View>
            )}

            {/* Bottom card with current selection */}
            <View style={styles.mapFullBottomCard}>
              <Text style={styles.mapFullBottomText} numberOfLines={1}>
                {tempSelectedCoords ? (
                  <>
                    Selected: Lat: {tempSelectedCoords.latitude.toFixed(6)} •
                    Lng: {tempSelectedCoords.longitude.toFixed(6)}
                  </>
                ) : mapCenter ? (
                  <>
                    Current: Lat: {mapCenter.latitude.toFixed(6)} • Lng:{" "}
                    {mapCenter.longitude.toFixed(6)}
                  </>
                ) : (
                  "Tap on the map to select a location"
                )}
              </Text>

              <View style={{ height: 10 }} />

              <View style={styles.mapFullBtnRow}>
                <TouchableOpacity
                  style={[
                    styles.mapFullBtn,
                    locating ? { opacity: 0.75 } : null,
                  ]}
                  onPress={useCurrentLocationInMap}
                  activeOpacity={0.9}
                  disabled={locating}
                >
                  {locating ? (
                    <ActivityIndicator size="small" color="#0f172a" />
                  ) : (
                    <>
                      <Ionicons
                        name="locate-outline"
                        size={18}
                        color="#0f172a"
                      />
                      <Text style={styles.mapFullBtnText}>My Location</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.mapFullBtn, styles.mapFullBtnPrimary]}
                  onPress={confirmMapSelection}
                  activeOpacity={0.9}
                >
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={18}
                    color="#fff"
                  />
                  <Text style={[styles.mapFullBtnText, { color: "#fff" }]}>
                    Confirm
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </SafeAreaView>
      </Modal>

      {/* AM/PM dropdown modal */}
      <Modal
        visible={ampmModalOpen}
        transparent
        animationType="fade"
        onRequestClose={closeAmPmModal}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeAmPmModal}>
          <Pressable style={styles.sourceCard} onPress={() => {}}>
            <Text style={styles.sourceTitle}>Select AM / PM</Text>

            {["AM", "PM"].map((opt) => {
              const active =
                (ampmTarget === "opening" && openingMeridiem === opt) ||
                (ampmTarget === "closing" && closingMeridiem === opt);

              return (
                <TouchableOpacity
                  key={opt}
                  style={styles.deliveryBtn}
                  onPress={() => pickAmPm(opt)}
                  activeOpacity={0.9}
                >
                  <Text style={styles.sourceBtnText}>{opt}</Text>
                  {active ? (
                    <Ionicons name="checkmark" size={18} color="#0f172a" />
                  ) : null}
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              style={styles.sourceCancel}
              onPress={closeAmPmModal}
              activeOpacity={0.9}
            >
              <Text style={styles.sourceCancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Delivery dropdown modal */}
      <Modal
        visible={deliveryModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDeliveryModalOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setDeliveryModalOpen(false)}
        >
          <Pressable style={styles.sourceCard} onPress={() => {}}>
            <Text style={styles.sourceTitle}>Delivery Option</Text>

            {["GRAB", "BOTH", "SELF"].map((opt) => (
              <TouchableOpacity
                key={opt}
                style={styles.deliveryBtn}
                onPress={() => {
                  setDeliveryOption(opt);
                  setDeliveryModalOpen(false);
                }}
                activeOpacity={0.9}
              >
                <Text style={styles.sourceBtnText}>{opt}</Text>
                {delivery_option === opt ? (
                  <Ionicons name="checkmark" size={18} color="#0f172a" />
                ) : null}
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={styles.sourceCancel}
              onPress={() => setDeliveryModalOpen(false)}
              activeOpacity={0.9}
            >
              <Text style={styles.sourceCancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Image viewer modal */}
      <Modal
        visible={imgModalOpen}
        transparent
        animationType="fade"
        onRequestClose={closeImageModal}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeImageModal}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={1}>
                {imgModalTitle}
              </Text>
              <TouchableOpacity
                onPress={closeImageModal}
                style={styles.modalCloseBtn}
                activeOpacity={0.8}
              >
                <Ionicons name="close" size={20} color="#0f172a" />
              </TouchableOpacity>
            </View>
            <Image
              source={{ uri: imgModalUri }}
              style={styles.modalImage}
              resizeMode="contain"
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Source chooser modal */}
      <Modal
        visible={sourceModalOpen}
        transparent
        animationType="fade"
        onRequestClose={closeSourceModal}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeSourceModal}>
          <Pressable style={styles.sourceCard} onPress={() => {}}>
            <Text style={styles.sourceTitle}>Choose image source</Text>

            <TouchableOpacity
              style={styles.sourceBtn}
              onPress={chooseFromCamera}
              activeOpacity={0.9}
            >
              <Ionicons name="camera-outline" size={18} color="#0f172a" />
              <Text style={styles.sourceBtnText}>Camera</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sourceBtn}
              onPress={chooseFromGallery}
              activeOpacity={0.9}
            >
              <Ionicons name="images-outline" size={18} color="#0f172a" />
              <Text style={styles.sourceBtnText}>Gallery</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sourceCancel}
              onPress={closeSourceModal}
              activeOpacity={0.9}
            >
              <Text style={styles.sourceCancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Header */}
      <View style={[styles.headerBar, { paddingTop: headerTopPad }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={22} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Business</Text>
        <TouchableOpacity
          onPress={onRefresh}
          style={styles.iconBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="refresh" size={20} color="#0f172a" />
        </TouchableOpacity>
      </View>

      {/* Keyboard-safe scroll */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={headerTopPad}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[
            styles.scrollInner,
            { flexGrow: 1, paddingBottom: EXTRA_KB_SPACE },
          ]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={
            Platform.OS === "ios" ? "interactive" : "on-drag"
          }
          scrollIndicatorInsets={{ bottom: EXTRA_KB_SPACE }}
          contentInset={{ bottom: EXTRA_KB_SPACE }}
          contentInsetAdjustmentBehavior="always"
        >
          {/* Images */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Images</Text>

            <Text style={styles.label}>Business Logo</Text>
            <View style={styles.imageRow}>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() =>
                  displayLogoUrl &&
                  openImageModal("Business Logo", displayLogoUrl)
                }
                style={styles.imageBox}
              >
                {displayLogoUrl ? (
                  <Image
                    source={{ uri: displayLogoUrl }}
                    style={styles.image}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.imageEmpty}>
                    <Ionicons name="image-outline" size={22} color="#64748b" />
                    <Text style={styles.emptyText}>No logo</Text>
                  </View>
                )}
              </TouchableOpacity>

              <View style={{ flex: 1, gap: 8 }}>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => openSourceModal("logo")}
                  activeOpacity={0.9}
                >
                  <Ionicons
                    name="cloud-upload-outline"
                    size={18}
                    color="#0f172a"
                  />
                  <Text style={styles.actionText}>Change</Text>
                </TouchableOpacity>

                {pickedLogo?.uri ? (
                  <TouchableOpacity
                    style={styles.actionBtnSoft}
                    onPress={() => setPickedLogo(null)}
                    activeOpacity={0.9}
                  >
                    <Ionicons
                      name="close-circle-outline"
                      size={18}
                      color="#0f172a"
                    />
                    <Text style={styles.actionText}>Remove selected</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>

            <View style={styles.divider} />

            <Text style={styles.label}>License Image</Text>
            <View style={styles.imageRow}>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() =>
                  displayLicenseUrl &&
                  openImageModal("License Image", displayLicenseUrl)
                }
                style={styles.imageBox}
              >
                {displayLicenseUrl ? (
                  <Image
                    source={{ uri: displayLicenseUrl }}
                    style={styles.image}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.imageEmpty}>
                    <Ionicons
                      name="document-outline"
                      size={22}
                      color="#64748b"
                    />
                    <Text style={styles.emptyText}>No license</Text>
                  </View>
                )}
              </TouchableOpacity>

              <View style={{ flex: 1, gap: 8 }}>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => openSourceModal("license")}
                  activeOpacity={0.9}
                >
                  <Ionicons
                    name="cloud-upload-outline"
                    size={18}
                    color="#0f172a"
                  />
                  <Text style={styles.actionText}>Change</Text>
                </TouchableOpacity>

                {displayLicenseUrl ? (
                  <TouchableOpacity
                    style={styles.actionBtnSoft}
                    onPress={() =>
                      openImageModal("License Image", displayLicenseUrl)
                    }
                    activeOpacity={0.9}
                  >
                    <Ionicons name="eye-outline" size={18} color="#0f172a" />
                    <Text style={styles.actionText}>View</Text>
                  </TouchableOpacity>
                ) : null}

                {pickedLicense?.uri ? (
                  <TouchableOpacity
                    style={styles.actionBtnSoft}
                    onPress={() => setPickedLicense(null)}
                    activeOpacity={0.9}
                  >
                    <Ionicons
                      name="close-circle-outline"
                      size={18}
                      color="#0f172a"
                    />
                    <Text style={styles.actionText}>Remove selected</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </View>

          {/* Basic */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Basic Info</Text>

            <Label>Business Name</Label>
            <Input
              value={business_name}
              onChangeText={setBusinessName}
              placeholder="Business name"
              isFocused={focusedKey === "business_name"}
              onFocus={() => setFocusedKey("business_name")}
              onBlur={() => setFocusedKey(null)}
            />

            <Label>Delivery Option</Label>
            <SelectRow
              value={delivery_option}
              onPress={() => setDeliveryModalOpen(true)}
            />

            <Label>Min amount for FD</Label>
            <Input
              value={min_amount_for_fd}
              onChangeText={setMinAmountForFD}
              placeholder="e.g. 6000.00"
              keyboardType="numeric"
              isFocused={focusedKey === "min_amount_for_fd"}
              onFocus={() => setFocusedKey("min_amount_for_fd")}
              onBlur={() => setFocusedKey(null)}
            />
          </View>

          {/* Location */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Location</Text>

            <Label>Address</Label>
            <Input
              value={address}
              onChangeText={setAddress}
              placeholder="Address"
              multiline
              isFocused={focusedKey === "address"}
              onFocus={() => setFocusedKey("address")}
              onBlur={() => setFocusedKey(null)}
            />

            <View style={styles.locActions}>
              <TouchableOpacity
                style={styles.locBtnFull}
                onPress={openMapPicker}
                activeOpacity={0.9}
              >
                <Ionicons name="map-outline" size={18} color="#0f172a" />
                <Text style={styles.locBtnText}>Pick on Map</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.grid2}>
              <View style={{ flex: 1 }}>
                <Label>Latitude</Label>
                <Input
                  value={latitude}
                  onChangeText={setLatitude}
                  placeholder="27.47..."
                  keyboardType="numeric"
                  isFocused={focusedKey === "latitude"}
                  onFocus={() => setFocusedKey("latitude")}
                  onBlur={() => setFocusedKey(null)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Label>Longitude</Label>
                <Input
                  value={longitude}
                  onChangeText={setLongitude}
                  placeholder="89.63..."
                  keyboardType="numeric"
                  isFocused={focusedKey === "longitude"}
                  onFocus={() => setFocusedKey("longitude")}
                  onBlur={() => setFocusedKey(null)}
                />
              </View>
            </View>
          </View>

          {/* Operations - TIME INPUTS IMPROVED */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Operations</Text>

            <View style={styles.grid2}>
              <View style={{ flex: 1 }}>
                <Label>Opening Time</Label>
                <View style={styles.timeRow}>
                  <View style={{ flex: 1 }}>
                    <TextInput
                      style={[styles.input, { textAlign: "center" }]}
                      value={openingHour}
                      onChangeText={(text) => {
                        let val = text.replace(/[^0-9]/g, "");
                        if (val.length > 2) val = val.slice(0, 2);
                        let num = parseInt(val, 10);
                        if (val !== "" && (num < 1 || num > 12)) {
                          if (num < 1) val = "1";
                          if (num > 12) val = "12";
                        }
                        setOpeningHour(val);
                      }}
                      placeholder="HH"
                      keyboardType="number-pad"
                      maxLength={2}
                      onFocus={() => setFocusedKey("openingHour")}
                      onBlur={() => setFocusedKey(null)}
                    />
                  </View>
                  <Text style={styles.colon}>:</Text>
                  <View style={{ flex: 1 }}>
                    <TextInput
                      style={[styles.input, { textAlign: "center" }]}
                      value={openingMinute}
                      onChangeText={(text) => {
                        let val = text.replace(/[^0-9]/g, "");
                        if (val.length > 2) val = val.slice(0, 2);
                        let num = parseInt(val, 10);
                        if (val !== "" && (num < 0 || num > 59)) {
                          if (num < 0) val = "0";
                          if (num > 59) val = "59";
                        }
                        setOpeningMinute(val);
                      }}
                      placeholder="MM"
                      keyboardType="number-pad"
                      maxLength={2}
                      onFocus={() => setFocusedKey("openingMinute")}
                      onBlur={() => setFocusedKey(null)}
                    />
                  </View>
                  <TouchableOpacity
                    style={styles.ampmBtn}
                    onPress={() => openAmPmModal("opening")}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.ampmText}>{openingMeridiem}</Text>
                    <Ionicons name="chevron-down" size={16} color="#0f172a" />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={{ flex: 1 }}>
                <Label>Closing Time</Label>
                <View style={styles.timeRow}>
                  <View style={{ flex: 1 }}>
                    <TextInput
                      style={[styles.input, { textAlign: "center" }]}
                      value={closingHour}
                      onChangeText={(text) => {
                        let val = text.replace(/[^0-9]/g, "");
                        if (val.length > 2) val = val.slice(0, 2);
                        let num = parseInt(val, 10);
                        if (val !== "" && (num < 1 || num > 12)) {
                          if (num < 1) val = "1";
                          if (num > 12) val = "12";
                        }
                        setClosingHour(val);
                      }}
                      placeholder="HH"
                      keyboardType="number-pad"
                      maxLength={2}
                      onFocus={() => setFocusedKey("closingHour")}
                      onBlur={() => setFocusedKey(null)}
                    />
                  </View>
                  <Text style={styles.colon}>:</Text>
                  <View style={{ flex: 1 }}>
                    <TextInput
                      style={[styles.input, { textAlign: "center" }]}
                      value={closingMinute}
                      onChangeText={(text) => {
                        let val = text.replace(/[^0-9]/g, "");
                        if (val.length > 2) val = val.slice(0, 2);
                        let num = parseInt(val, 10);
                        if (val !== "" && (num < 0 || num > 59)) {
                          if (num < 0) val = "0";
                          if (num > 59) val = "59";
                        }
                        setClosingMinute(val);
                      }}
                      placeholder="MM"
                      keyboardType="number-pad"
                      maxLength={2}
                      onFocus={() => setFocusedKey("closingMinute")}
                      onBlur={() => setFocusedKey(null)}
                    />
                  </View>
                  <TouchableOpacity
                    style={styles.ampmBtn}
                    onPress={() => openAmPmModal("closing")}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.ampmText}>{closingMeridiem}</Text>
                    <Ionicons name="chevron-down" size={16} color="#0f172a" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <Label>Holidays</Label>
            <Input
              value={holidaysDisplay}
              onChangeText={setHolidaysDisplay}
              placeholder="e.g. Sunday, Saturday"
              placeholderTextColor="#94a3b8"
              autoCapitalize="words"
              isFocused={focusedKey === "holidays"}
              onFocus={() => setFocusedKey("holidays")}
              onBlur={() => setFocusedKey(null)}
            />
            <Text style={styles.hintText}>
              Tip: Separate multiple days with commas (e.g., "Sunday, Saturday")
            </Text>
          </View>

          {/* Promotions */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Promotions</Text>

            <Label>Special Celebration</Label>
            <Input
              value={special_celebration}
              onChangeText={setSpecialCelebration}
              placeholder="e.g. New Year"
              isFocused={focusedKey === "special_celebration"}
              onFocus={() => setFocusedKey("special_celebration")}
              onBlur={() => setFocusedKey(null)}
            />

            <Label>Discount %</Label>
            <Input
              value={special_celebration_discount_percentage}
              onChangeText={setCelebrationDiscount}
              placeholder="10"
              keyboardType="numeric"
              isFocused={
                focusedKey === "special_celebration_discount_percentage"
              }
              onFocus={() =>
                setFocusedKey("special_celebration_discount_percentage")
              }
              onBlur={() => setFocusedKey(null)}
            />

            <Label>Complementary</Label>
            <Input
              value={complementary}
              onChangeText={setComplementary}
              placeholder="e.g. Free gift"
              isFocused={focusedKey === "complementary"}
              onFocus={() => setFocusedKey("complementary")}
              onBlur={() => setFocusedKey(null)}
            />

            <Label>Complementary Details</Label>
            <Input
              value={complementary_details}
              onChangeText={setComplementaryDetails}
              placeholder="Explain the complementary offer"
              multiline
              isFocused={focusedKey === "complementary_details"}
              onFocus={() => setFocusedKey("complementary_details")}
              onBlur={() => setFocusedKey(null)}
            />
          </View>

          {/* Save */}
          <TouchableOpacity
            style={[styles.saveBtn, saving ? { opacity: 0.7 } : null]}
            onPress={save}
            disabled={saving}
            activeOpacity={0.9}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="save-outline" size={18} color="#FFF" />
                <Text style={styles.saveText}>Save Changes</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={{ height: 18 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* ---------------- styles ---------------- */

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },

  headerBar: {
    minHeight: 52,
    paddingHorizontal: 12,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    borderBottomColor: "#e5e7eb",
    borderBottomWidth: 1,
    backgroundColor: "#fff",
  },
  backBtn: {
    height: 40,
    width: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtn: {
    height: 40,
    width: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "700",
    color: "#0f172a",
  },

  scrollInner: { padding: 18, paddingBottom: 28 },

  centerWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: "#fff",
  },
  muted: { marginTop: 10, color: "#475569" },

  card: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: SCREEN_W > 400 ? 16 : 15,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 10,
  },

  label: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: "700",
    marginTop: 10,
    marginBottom: 6,
  },

  inputWrap: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
  },
  inputWrapFocused: {
    borderColor: "#00b14f",
  },
  input: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: SCREEN_W > 400 ? 16 : 14,
    color: "#0f172a",
  },
  inputMultiline: { minHeight: 90, textAlignVertical: "top" },

  grid2: { flexDirection: "row", gap: 1, marginTop: 4 },

  imageRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  imageBox: {
    width: 160,
    height: 120,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  image: { width: "100%", height: "100%" },
  imageEmpty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#f8fafc",
  },
  emptyText: { fontSize: 12, color: "#64748b", fontWeight: "700" },

  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  actionBtnSoft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  actionText: { fontSize: 12, fontWeight: "700", color: "#0f172a" },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#e5e7eb",
    marginVertical: 12,
  },

  timeRow: { flexDirection: "row", alignItems: "center", gap: 1 },
  colon: { fontSize: 18, fontWeight: "bold", color: "#0f172a" },
  ampmBtn: {
    height: 46,
    paddingHorizontal: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  ampmText: { fontSize: 12, fontWeight: "700", color: "#0f172a" },

  saveBtn: {
    marginTop: 6,
    backgroundColor: "#16a34a",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  saveText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: SCREEN_W > 400 ? 16 : 14,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    width: Math.min(SCREEN_W - 32, 420),
    maxHeight: SCREEN_H * 0.78,
    backgroundColor: "#fff",
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  modalHeader: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
    backgroundColor: "#fff",
  },
  modalTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0f172a",
    flex: 1,
    marginRight: 10,
  },
  modalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  modalImage: {
    width: "100%",
    height: SCREEN_H * 0.55,
    backgroundColor: "#0f172a",
  },

  sourceCard: {
    width: Math.min(SCREEN_W - 32, 360),
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  sourceTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 10,
  },
  sourceBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 10,
  },
  sourceBtnText: { fontSize: 14, fontWeight: "700", color: "#0f172a" },
  sourceCancel: { paddingVertical: 10, alignItems: "center" },
  sourceCancelText: { fontSize: 14, fontWeight: "700", color: "#0f172a" },

  selectRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  selectValue: { fontSize: 14, fontWeight: "700", color: "#0f172a" },

  deliveryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 10,
  },

  locActions: { marginTop: 8 },
  locBtnFull: {
    width: "100%",
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  locBtnText: { fontSize: 13, fontWeight: "800", color: "#0f172a" },

  // FULLSCREEN MAP
  mapFullSafe: { flex: 1, backgroundColor: "#fff" },
  mapFullHeader: {
    height: 54,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
    backgroundColor: "#fff",
  },
  mapFullIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  mapFullTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "900",
    color: "#0f172a",
  },

  mapFullHelpRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
  },
  mapFullHelpText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
  },

  mapFullMapWrap: { flex: 1, backgroundColor: "#fff", position: "relative" },

  mapFullBottomCard: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  mapFullBottomText: { fontSize: 12, fontWeight: "900", color: "#0f172a" },

  mapFullBtnRow: { flexDirection: "row", gap: 10 },
  mapFullBtn: {
    flex: 1,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  mapFullBtnPrimary: {
    backgroundColor: "#00b14f",
    borderColor: "#00b14f",
  },
  mapFullBtnText: { fontSize: 13, fontWeight: "900", color: "#0f172a" },

  mapFullBottomHint: {
    marginTop: 10,
    fontSize: 11,
    color: "#64748b",
    fontWeight: "700",
  },

  hintText: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 4,
    marginLeft: 4,
    fontWeight: "500",
  },

  // Map error styles
  mapErrorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f9fafb",
  },
  mapErrorText: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
  mapErrorSubtext: {
    marginTop: 4,
    fontSize: 12,
    color: "#6b7280",
  },
  mapRetryBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: "#16a34a",
    borderRadius: 8,
  },
  mapRetryText: {
    color: "#fff",
    fontWeight: "600",
  },
  mapLoadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255,255,255,0.95)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  mapLoadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#16a34a",
    fontWeight: "600",
  },
  mapLoadingSubtext: {
    marginTop: 4,
    fontSize: 11,
    color: "#6b7280",
  },
  centerPin: {
    position: "absolute",
    left: "50%",
    top: "50%",
    marginLeft: -21,
    marginTop: -42,
    zIndex: 20,
  },
});
