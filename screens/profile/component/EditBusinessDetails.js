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
import { BRAND, FONT, RADIUS, SHADOW } from "../../styles/tabdey_brand";
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

  let hh = null;
  let mm = null;

  // ISO DateTime: 1970-01-01T09:30:00.000Z
  const isoMatch = raw.match(/T(\d{2}):(\d{2})/);
  if (isoMatch) {
    hh = Number(isoMatch[1]);
    mm = Number(isoMatch[2]);
  }

  // Time only: 09:30:00 or 09:30
  const timeMatch = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (timeMatch) {
    hh = Number(timeMatch[1]);
    mm = Number(timeMatch[2]);
  }

  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return raw;

  const ap = hh >= 12 ? "PM" : "AM";
  const hour12 = hh % 12 || 12;

  return `${hour12}:${pad2(mm)} ${ap}`;
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

  const hhmmss = to24hHHmmss(s);
  if (!hhmmss) return null;

  return `1970-01-01T${hhmmss}.000Z`;
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
    const raw = await SecureStore.getItemAsync(KEY_AUTH_TOKEN);
    if (!raw) return null;

    return String(raw)
      .replace(/^Bearer\s+/i, "")
      .trim();
  } catch {
    return null;
  }
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
        setMapLoading(false);
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  // Retry map initialization
  useEffect(() => {
    if (mapInitAttempts < 3 && mapLoading && mapInitAttempts > 0) {
      const retryTimer = setTimeout(() => {
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
    },
    [extractMapCoord],
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

      await applyCoords(lat, lng, { alsoAddress: true });

      Alert.alert(
        "Success",
        "Current location has been set as your business location.",
      );

      closeMapPicker();
    } catch (e) {
      Alert.alert("Location error", String(e?.message || e));
    } finally {
      setLocating(false);
    }
  }, [applyCoords, closeMapPicker]);

  const openMapPicker = useCallback(async () => {
    setMapError(false);
    setMapLoading(true);
    setMapInitAttempts(0);
    setTempSelectedCoords(null);

    const latNum = Number(latitude);
    const lngNum = Number(longitude);

    if (Number.isFinite(latNum) && Number.isFinite(lngNum)) {
      const coord = { latitude: latNum, longitude: lngNum };
      setMapCenter(coord);
      setCenterPinCoord(coord);
      setTempSelectedCoords(coord);
      setMapZoom(16);
      setMapOpen(true);
      setMapKey(Date.now());
      return;
    }

    const coord = { latitude: 27.4728, longitude: 89.639 };
    setMapCenter(coord);
    setCenterPinCoord(coord);
    setTempSelectedCoords(coord);
    setMapZoom(13);
    setMapOpen(true);
    setMapKey(Date.now());
  }, [latitude, longitude]);

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

    Alert.alert("Location Updated", "Business location has been updated.");
    closeMapPicker();
  }, [
    centerPinCoord,
    tempSelectedCoords,
    mapCenter,
    applyCoords,
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
          throw new Error(msg);
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
  const EXTRA_KB_SPACE = 24 + (insets?.bottom ?? 0);

  if (loading) {
    return (
      <View style={styles.centerWrap}>
        <ActivityIndicator size="large" color="#16a34a" />
        <Text style={styles.muted}>Loading…</Text>
      </View>
    );
  }

  return (
    <SafeAreaView
      style={styles.safe}
      edges={["top", "left", "right", "bottom"]}
    >
      <View style={styles.topGlow} />
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
                    styleUrl="https://tiles.openfreemap.org/styles/liberty"
                    onRegionChange={handleMapPick}
                    onMapReady={() => {
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
      <View style={[styles.headerBar]}>
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

      <View style={{ flex: 1 }}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[
            styles.scrollInner,
            { paddingBottom: EXTRA_KB_SPACE },
          ]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={
            Platform.OS === "ios" ? "interactive" : "on-drag"
          }
          scrollIndicatorInsets={{ bottom: EXTRA_KB_SPACE }}
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
          </View>

          {/* Operations - TIME INPUTS IMPROVED */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Operations</Text>

            <View style={styles.timeSection}>
              <View style={styles.timeBlock}>
                <Label>Opening Time</Label>
                <View style={styles.timeRow}>
                  <TextInput
                    style={[
                      styles.timeInput,
                      focusedKey === "openingHour" && styles.timeInputFocused,
                    ]}
                    value={openingHour}
                    onChangeText={(text) => {
                      let val = text.replace(/[^0-9]/g, "");
                      if (val.length > 2) val = val.slice(0, 2);
                      let num = parseInt(val, 10);
                      if (val !== "" && (num < 1 || num > 12))
                        val = num > 12 ? "12" : "1";
                      setOpeningHour(val);
                    }}
                    placeholder="HH"
                    keyboardType="number-pad"
                    maxLength={2}
                    onFocus={() => setFocusedKey("openingHour")}
                    onBlur={() => setFocusedKey(null)}
                  />

                  <Text style={styles.colon}>:</Text>

                  <TextInput
                    style={[
                      styles.timeInput,
                      focusedKey === "openingMinute" && styles.timeInputFocused,
                    ]}
                    value={openingMinute}
                    onChangeText={(text) => {
                      let val = text.replace(/[^0-9]/g, "");
                      if (val.length > 2) val = val.slice(0, 2);
                      let num = parseInt(val, 10);
                      if (val !== "" && (num < 0 || num > 59))
                        val = num > 59 ? "59" : "0";
                      setOpeningMinute(val);
                    }}
                    placeholder="MM"
                    keyboardType="number-pad"
                    maxLength={2}
                    onFocus={() => setFocusedKey("openingMinute")}
                    onBlur={() => setFocusedKey(null)}
                  />

                  <TouchableOpacity
                    style={styles.ampmBtn}
                    onPress={() => openAmPmModal("opening")}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.ampmText}>{openingMeridiem}</Text>
                    <Ionicons
                      name="chevron-down"
                      size={16}
                      color={BRAND.purple}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.timeBlock}>
                <Label>Closing Time</Label>
                <View style={styles.timeRow}>
                  <TextInput
                    style={[
                      styles.timeInput,
                      focusedKey === "closingHour" && styles.timeInputFocused,
                    ]}
                    value={closingHour}
                    onChangeText={(text) => {
                      let val = text.replace(/[^0-9]/g, "");
                      if (val.length > 2) val = val.slice(0, 2);
                      let num = parseInt(val, 10);
                      if (val !== "" && (num < 1 || num > 12))
                        val = num > 12 ? "12" : "1";
                      setClosingHour(val);
                    }}
                    placeholder="HH"
                    keyboardType="number-pad"
                    maxLength={2}
                    onFocus={() => setFocusedKey("closingHour")}
                    onBlur={() => setFocusedKey(null)}
                  />

                  <Text style={styles.colon}>:</Text>

                  <TextInput
                    style={[
                      styles.timeInput,
                      focusedKey === "closingMinute" && styles.timeInputFocused,
                    ]}
                    value={closingMinute}
                    onChangeText={(text) => {
                      let val = text.replace(/[^0-9]/g, "");
                      if (val.length > 2) val = val.slice(0, 2);
                      let num = parseInt(val, 10);
                      if (val !== "" && (num < 0 || num > 59))
                        val = num > 59 ? "59" : "0";
                      setClosingMinute(val);
                    }}
                    placeholder="MM"
                    keyboardType="number-pad"
                    maxLength={2}
                    onFocus={() => setFocusedKey("closingMinute")}
                    onBlur={() => setFocusedKey(null)}
                  />

                  <TouchableOpacity
                    style={styles.ampmBtn}
                    onPress={() => openAmPmModal("closing")}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.ampmText}>{closingMeridiem}</Text>
                    <Ionicons
                      name="chevron-down"
                      size={16}
                      color={BRAND.purple}
                    />
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
      </View>
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

  iconBtn: {
    height: 42,
    width: 42,
    borderRadius: RADIUS.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BRAND.white,
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

  card: {
    borderWidth: 1,
    borderColor: "#F3E8FF",
    backgroundColor: BRAND.white,
    borderRadius: 24,
    padding: 16,
    marginBottom: 16,
  },
  centerWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: BRAND.white,
  },
  muted: {
    marginTop: 10,
    fontFamily: FONT.body,
    color: BRAND.grey,
  },

  cardTitle: {
    fontFamily: FONT.header,
    fontSize: SCREEN_W > 400 ? 17 : 16,
    fontWeight: "900",
    color: BRAND.black,
    marginBottom: 10,
  },

  label: {
    fontFamily: FONT.body,
    fontSize: 13,
    color: BRAND.black,
    fontWeight: "600",
    marginTop: 10,
    marginBottom: 6,
  },

  inputWrap: {
    backgroundColor: BRAND.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BRAND.greyBorder,
  },

  inputWrapFocused: {
    borderColor: BRAND.purple,
    backgroundColor: "#FCF7FF",
  },
  input: {
    fontFamily: FONT.body,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: SCREEN_W > 400 ? 15 : 14,
    color: BRAND.black,
  },
  inputMultiline: { minHeight: 88, textAlignVertical: "top" },

  grid2: { flexDirection: "row", gap: 10, marginTop: 4 },

  imageRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  imageBox: {
    width: 150,
    height: 112,
    borderRadius: RADIUS.lg,
    backgroundColor: "#FCF7FF",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: BRAND.purpleLight,
  },
  image: { width: "100%", height: "100%" },
  imageEmpty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#FCF7FF",
  },
  emptyText: {
    fontFamily: FONT.body,
    fontSize: 12,
    color: BRAND.grey,
    fontWeight: "600",
  },

  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    backgroundColor: "#F3E4FF",
    borderWidth: 1,
    borderColor: BRAND.purpleLight,
  },
  actionBtnSoft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    backgroundColor: BRAND.white,
    borderWidth: 1,
    borderColor: BRAND.greyLight,
  },
  actionText: {
    fontFamily: FONT.body,
    fontSize: 12,
    fontWeight: "600",
    color: BRAND.black,
  },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: BRAND.greyLight,
    marginVertical: 14,
  },

  timeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  colon: { fontSize: 18, fontWeight: "700", color: BRAND.purple },
  timeSection: {
    gap: 12,
    marginTop: 4,
  },

  timeBlock: {
    width: "100%",
  },

  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  timeInput: {
    width: 74,
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BRAND.greyBorder,
    backgroundColor: BRAND.white,
    textAlign: "center",
    fontFamily: FONT.body,
    fontSize: 15,
    fontWeight: "700",
    color: BRAND.black,
  },

  timeInputFocused: {
    borderColor: BRAND.purple,
    backgroundColor: "#FCF7FF",
  },

  colon: {
    fontSize: 22,
    fontWeight: "900",
    color: BRAND.purple,
    marginHorizontal: 2,
  },

  ampmBtn: {
    height: 52,
    minWidth: 82,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BRAND.purpleLight,
    backgroundColor: "#F3E4FF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },

  ampmText: {
    fontFamily: FONT.body,
    fontSize: 14,
    fontWeight: "900",
    color: BRAND.purple,
  },

  saveBtn: {
    marginTop: 6,
    backgroundColor: BRAND.purple,
    borderRadius: RADIUS.pill,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    ...SHADOW.md,
  },
  saveText: {
    fontFamily: FONT.body,
    color: BRAND.white,
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
    backgroundColor: BRAND.white,
    borderRadius: RADIUS.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: BRAND.greyLight,
  },
  modalHeader: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BRAND.greyLight,
    backgroundColor: BRAND.white,
  },
  modalTitle: {
    fontFamily: FONT.header,
    fontSize: 14,
    fontWeight: "700",
    color: BRAND.purple,
    flex: 1,
    marginRight: 10,
  },
  modalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.md,
    backgroundColor: "#F3E4FF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: BRAND.purpleLight,
  },
  modalImage: {
    width: "100%",
    height: SCREEN_H * 0.55,
    backgroundColor: BRAND.black,
  },

  sourceCard: {
    width: Math.min(SCREEN_W - 32, 360),
    backgroundColor: BRAND.white,
    borderRadius: RADIUS.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: BRAND.greyLight,
    ...SHADOW.md,
  },
  sourceTitle: {
    fontFamily: FONT.header,
    fontSize: 16,
    fontWeight: "700",
    color: BRAND.purple,
    marginBottom: 10,
  },
  sourceBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: RADIUS.md,
    backgroundColor: "#F3E4FF",
    borderWidth: 1,
    borderColor: BRAND.purpleLight,
    marginBottom: 10,
  },
  sourceBtnText: {
    fontFamily: FONT.body,
    fontSize: 14,
    fontWeight: "600",
    color: BRAND.black,
  },
  sourceCancel: { paddingVertical: 10, alignItems: "center" },
  sourceCancelText: {
    fontFamily: FONT.body,
    fontSize: 14,
    fontWeight: "700",
    color: BRAND.magenta,
  },

  selectRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    backgroundColor: "#FCF7FF",
    borderWidth: 1,
    borderColor: BRAND.purpleLight,
  },
  selectValue: {
    fontFamily: FONT.body,
    fontSize: 14,
    fontWeight: "700",
    color: BRAND.black,
  },

  deliveryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: RADIUS.md,
    backgroundColor: "#FCF7FF",
    borderWidth: 1,
    borderColor: BRAND.purpleLight,
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
    borderRadius: RADIUS.pill,
    backgroundColor: "#F3E4FF",
    borderWidth: 1,
    borderColor: BRAND.purpleLight,
  },
  locBtnText: {
    fontFamily: FONT.body,
    fontSize: 13,
    fontWeight: "700",
    color: BRAND.purple,
  },

  mapFullSafe: { flex: 1, backgroundColor: BRAND.white },
  mapFullHeader: {
    height: 54,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BRAND.greyLight,
    backgroundColor: BRAND.white,
  },
  mapFullIconBtn: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3E4FF",
    borderWidth: 1,
    borderColor: BRAND.purpleLight,
  },
  mapFullTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: FONT.header,
    fontSize: 17,
    fontWeight: "700",
    color: BRAND.purple,
  },

  mapFullHelpRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: BRAND.white,
  },
  mapFullHelpText: {
    flex: 1,
    fontFamily: FONT.body,
    fontSize: 12,
    fontWeight: "600",
    color: BRAND.grey,
  },

  mapFullMapWrap: {
    flex: 1,
    backgroundColor: BRAND.white,
    position: "relative",
  },

  mapFullBottomCard: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    padding: 14,
    borderRadius: RADIUS.lg,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderWidth: 1,
    borderColor: BRAND.purpleLight,
    ...SHADOW.md,
  },
  mapFullBottomText: {
    fontFamily: FONT.body,
    fontSize: 12,
    fontWeight: "700",
    color: BRAND.black,
  },

  mapFullBtnRow: { flexDirection: "row", gap: 10 },
  mapFullBtn: {
    flex: 1,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: RADIUS.pill,
    backgroundColor: BRAND.white,
    borderWidth: 1,
    borderColor: BRAND.purpleLight,
  },
  mapFullBtnPrimary: {
    backgroundColor: BRAND.purple,
    borderColor: BRAND.purple,
  },
  mapFullBtnText: {
    fontFamily: FONT.body,
    fontSize: 13,
    fontWeight: "700",
    color: BRAND.black,
  },

  mapFullBottomHint: {
    marginTop: 10,
    fontFamily: FONT.body,
    fontSize: 11,
    color: BRAND.grey,
    fontWeight: "600",
  },

  hintText: {
    fontFamily: FONT.body,
    fontSize: 11,
    color: BRAND.grey,
    marginTop: 4,
    marginLeft: 4,
  },

  mapErrorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FCF7FF",
  },
  mapErrorText: {
    marginTop: 12,
    fontFamily: FONT.header,
    fontSize: 16,
    fontWeight: "700",
    color: BRAND.red,
  },
  mapErrorSubtext: {
    marginTop: 4,
    fontFamily: FONT.body,
    fontSize: 12,
    color: BRAND.grey,
  },
  mapRetryBtn: {
    marginTop: 16,
    paddingHorizontal: 22,
    paddingVertical: 10,
    backgroundColor: BRAND.purple,
    borderRadius: RADIUS.pill,
  },
  mapRetryText: {
    fontFamily: FONT.body,
    color: BRAND.white,
    fontWeight: "700",
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
    fontFamily: FONT.body,
    fontSize: 14,
    color: BRAND.purple,
    fontWeight: "700",
  },
  mapLoadingSubtext: {
    marginTop: 4,
    fontFamily: FONT.body,
    fontSize: 11,
    color: BRAND.grey,
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
