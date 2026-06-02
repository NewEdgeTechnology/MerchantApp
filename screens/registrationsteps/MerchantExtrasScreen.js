// screens/merchant/MerchantExtrasScreen.js
// ✅ FIXED - Single merchant marker that can be updated by tapping on map

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Keyboard,
  Image,
  ActivityIndicator,
  Modal,
  useWindowDimensions,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { OSMView } from "expo-osm-sdk";
import { useNavigation, useRoute } from "@react-navigation/native";
import HeaderWithSteps from "./HeaderWithSteps";
import { SafeAreaView } from "react-native-safe-area-context";
import { BRAND, FONT, RADIUS, SHADOW } from "../styles/tabdey_brand";

const NEXT_ROUTE = "BankPaymentInfoScreen";

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
    console.error("OSMView crashed in MerchantExtrasScreen:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.mapErrorContainer}>
          <Text style={styles.mapErrorText}>⚠️ Map failed to load</Text>
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

export default function MerchantExtrasScreen() {
  const navigation = useNavigation();
  const route = useRoute();

  // received from previous page
  const {
    merchant: incomingMerchant = null,
    initialFullName = "",
    initialBusinessName = "",
    initialCategory = "",
    initialAddress = "",
    initialRegNo = "",
    initialPickedCoord = null,
    initialLogo = null,
    initialLicenseFile = null,
    deliveryOption = null,
    returnTo = null,
    phoneNumber = null,
    serviceType = "food",
    owner_type = null,
  } = route.params ?? {};

  const effectiveOwnerType = String(
    owner_type ?? incomingMerchant?.owner_type ?? serviceType ?? "food",
  )
    .trim()
    .toLowerCase();

  const [licenseFile, setLicenseFile] = useState(null);
  const [logo, setLogo] = useState(null);

  // address + map
  const [address, setAddress] = useState("");
  const [locationModalVisible, setLocationModalVisible] = useState(false);
  const [pickedCoord, setPickedCoord] = useState(null);

  const [mapCenter, setMapCenter] = useState({
    latitude: 27.4728,
    longitude: 89.639,
  });

  const [centerPinCoord, setCenterPinCoord] = useState({
    latitude: 27.4728,
    longitude: 89.639,
  });
  const [mapZoom, setMapZoom] = useState(14);
  // ✅ SINGLE MARKER - only one marker for merchant location
  const [mapMarkers, setMapMarkers] = useState([]);

  // Map error handling states
  const [mapError, setMapError] = useState(false);
  const [mapInitAttempts, setMapInitAttempts] = useState(0);
  const [mapKey, setMapKey] = useState(Date.now());
  const [mapLoading, setMapLoading] = useState(true);

  const [regNo, setRegNo] = useState("");
  const [idCardNo, setIdCardNo] = useState("");

  const [pickingLicense, setPickingLicense] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const mapRef = useRef(null);
  const scrollRef = useRef(null);
  const submitRef = useRef(null);

  const KeyboardWrapper = Platform.OS === "ios" ? KeyboardAvoidingView : View;

  // Map loader timeout
  // Map loader timeout
  useEffect(() => {
    if (!locationModalVisible || !mapLoading) return;

    const timer = setTimeout(() => {
      console.log("Force hiding map loader after timeout");
      setMapLoading(false);
    }, 5000);

    return () => clearTimeout(timer);
  }, [locationModalVisible, mapLoading, mapKey]);

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

  // Prefill from merchant
  useEffect(() => {
    if (incomingMerchant) {
      if (incomingMerchant.registration_no)
        setRegNo(String(incomingMerchant.registration_no));
      if (incomingMerchant.address) setAddress(incomingMerchant.address);

      if (incomingMerchant.id_card_number) {
        const cleaned = String(incomingMerchant.id_card_number)
          .replace(/[^0-9]/g, "")
          .slice(0, 11);
        setIdCardNo(cleaned);
      }

      const lat = incomingMerchant.latitude ?? null;
      const lng = incomingMerchant.longitude ?? null;
      if (typeof lat === "number" && typeof lng === "number") {
        const coord = { latitude: lat, longitude: lng };
        setPickedCoord(coord);
        setMapCenter({ latitude: lat, longitude: lng });
        setMapZoom(15);
        // ✅ SINGLE MERCHANT MARKER - RED pin
        setMapMarkers([
          {
            id: "merchant",
            coordinate: coord,
            title: "🏪 MERCHANT LOCATION",
            description: `Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}`,
            pinColor: "#EF4444",
          },
        ]);
      }

      const normalizeImg = (img, fallback) => {
        if (!img) return null;
        if (typeof img === "string")
          return { uri: img, name: fallback, mimeType: "image/jpeg", size: 0 };
        return {
          uri: img.uri ?? "",
          name: img.name ?? fallback,
          mimeType: img.mimeType ?? "image/jpeg",
          size: img.size ?? 0,
        };
      };
      if (incomingMerchant.logo)
        setLogo(normalizeImg(incomingMerchant.logo, "logo.jpg"));
      if (incomingMerchant.license)
        setLicenseFile(normalizeImg(incomingMerchant.license, "license"));
    }

    if (!incomingMerchant?.address && initialAddress)
      setAddress(initialAddress);

    if (!incomingMerchant?.registration_no && initialRegNo)
      setRegNo(String(initialRegNo));

    if (
      !incomingMerchant?.latitude &&
      !incomingMerchant?.longitude &&
      initialPickedCoord
    ) {
      setPickedCoord(initialPickedCoord);
      setMapCenter({
        latitude: initialPickedCoord.latitude,
        longitude: initialPickedCoord.longitude,
      });
      setMapZoom(15);
      // ✅ SINGLE MERCHANT MARKER - RED pin
      setMapMarkers([
        {
          id: "merchant",
          coordinate: initialPickedCoord,
          title: "🏪 MERCHANT LOCATION",
          description: `Lat: ${initialPickedCoord.latitude.toFixed(6)}, Lng: ${initialPickedCoord.longitude.toFixed(6)}`,
          pinColor: "#EF4444",
        },
      ]);
    }

    if (!incomingMerchant?.logo && initialLogo) setLogo(initialLogo);

    if (!incomingMerchant?.license && initialLicenseFile)
      setLicenseFile(initialLicenseFile);
  }, [
    incomingMerchant,
    initialAddress,
    initialRegNo,
    initialPickedCoord,
    initialLogo,
    initialLicenseFile,
  ]);

  // ✅ FIX 1: Remove keyboard listeners — they caused layout re-renders that
  // flickered the keyboard. KeyboardAvoidingView handles this automatically.
  // The kbHeight padding on ScrollView is also removed (was causing the flicker).

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", () => {
      setKeyboardOpen(true);
    });

    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardOpen(false);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const validate = () => {
    if (!toSafeString(address).trim()) return false;
    if (!logo?.uri) return false;
    if (!idCardNo || idCardNo.trim().length !== 11) return false;
    return true;
  };

  const openMapPicker = () => {
    setMapError(false);
    setMapInitAttempts(0);

    const startCoord = pickedCoord || mapCenter;

    setCenterPinCoord(startCoord);
    setMapCenter(startCoord);
    setMapZoom(pickedCoord ? 16 : 14);

    setMapKey(Date.now());
    setMapLoading(true);
    setLocationModalVisible(true);
  };
  const closeMapPicker = () => setLocationModalVisible(false);

  const updateMerchantLocation = (coord) => {
    setPickedCoord(coord);
    setMapCenter(coord);
    setMapZoom(16);
    setMapMarkers([
      {
        id: "merchant",
        coordinate: coord,
        title: "🏪 MERCHANT LOCATION",
        description: `Lat: ${coord.latitude.toFixed(6)}, Lng: ${coord.longitude.toFixed(6)}`,
        pinColor: "#EF4444",
      },
    ]);
  };

  const reverseGeocode = async (latitude, longitude) => {
    try {
      const results = await Location.reverseGeocodeAsync({
        latitude,
        longitude,
      });
      if (results?.length) {
        const r = results[0];
        const line = [
          r.name,
          r.street,
          r.subregion || r.city,
          r.region,
          r.postalCode,
          r.country,
        ]
          .filter(Boolean)
          .join(", ");
        return line;
      }
    } catch {
      // ignore
    }
    return "";
  };

  const extractMapCoord = (eventOrRegion) => {
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
  };

  const handleMapPick = useCallback((eventOrRegion) => {
    const coord = extractMapCoord(eventOrRegion);
    if (!coord) return;

    setCenterPinCoord(coord);
    setMapCenter(coord);
    setMapZoom(16);
  }, []);

  const confirmPickedLocation = async () => {
    const coordToSave = centerPinCoord || pickedCoord || mapCenter;

    if (!coordToSave?.latitude || !coordToSave?.longitude) {
      Alert.alert("Pick a location", "Move the map to your business location.");
      return;
    }

    updateMerchantLocation(coordToSave);

    const line = await reverseGeocode(
      coordToSave.latitude,
      coordToSave.longitude,
    );

    setAddress(
      line ||
        `Located at: ${coordToSave.latitude.toFixed(5)}, ${coordToSave.longitude.toFixed(5)}`,
    );

    closeMapPicker();
  };

  // ===== CURRENT LOCATION =====
  const [modalLocLoading, setModalLocLoading] = useState(false);
  const [modalLocError, setModalLocError] = useState("");

  const animateTo = (latitude, longitude) => {
    setMapCenter({ latitude, longitude });
    setMapZoom(16);
  };

  // ✅ Use current location to update merchant marker
  const useCurrentLocationInModal = async () => {
    setModalLocError("");
    setModalLocLoading(true);
    try {
      const svc = await Location.hasServicesEnabledAsync();
      if (!svc) {
        setModalLocError(
          "Location services are turned off. Please enable GPS.",
        );
        return;
      }
      let { status } = await Location.getForegroundPermissionsAsync();
      if (status !== "granted") {
        const req = await Location.requestForegroundPermissionsAsync();
        status = req?.status ?? status;
      }
      if (status !== "granted") {
        setModalLocError("Location permission denied. Enable it in Settings.");
        return;
      }

      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        maximumAge: 5000,
        mayShowUserSettingsDialog: true,
      });
      const { latitude, longitude } = pos.coords || {};
      if (latitude == null || longitude == null) {
        setModalLocError("Current location unavailable. Try again.");
        return;
      }

      const coord = { latitude, longitude };
      updateMerchantLocation(coord);
      setCenterPinCoord(coord);
    } catch {
      setModalLocError("Unable to fetch current location. Try again.");
    } finally {
      setModalLocLoading(false);
    }
  };

  const onPickLicense = async () => {
    Keyboard.dismiss();

    try {
      setPickingLicense(true);
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission needed",
          "Allow photo access to upload your business license.",
        );
        return;
      }
      const img = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.9,
      });
      if (!img.canceled) {
        const a = img.assets?.[0];
        setLicenseFile({
          name: a?.fileName ?? "license.jpg",
          uri: a?.uri,
          mimeType: a?.mimeType ?? "image/jpeg",
          size: a?.fileSize ?? 0,
        });
      }
    } catch (e) {
      Alert.alert("Upload failed", e?.message || "Try again.");
    } finally {
      setPickingLicense(false);
    }
  };

  const onRemoveLicense = () => setLicenseFile(null);

  // ===== Submit =====
  const onSubmit = async () => {
    if (!validate()) {
      if (!logo?.uri) {
        Alert.alert(
          "Missing required field",
          "Please upload your business logo.",
        );
        return;
      }
      if (!toSafeString(address).trim()) {
        Alert.alert("Missing address", "Please add your business address.");
        return;
      }
      if (!idCardNo || idCardNo.trim().length === 0) {
        Alert.alert(
          "Missing ID number",
          "Please enter your 11-digit ID card number.",
        );
        return;
      }
      if (idCardNo.trim().length !== 11) {
        Alert.alert(
          "Invalid ID number",
          "ID card number must be exactly 11 digits.",
        );
        return;
      }
      return;
    }

    try {
      setSubmitting(true);

      const normalizedCategoryIds = normalizeCategoryIds(
        (incomingMerchant && incomingMerchant.category) ?? initialCategory,
      );

      const normalizedRegNo = toSafeString(regNo).trim();
      const maybeRegNo =
        normalizedRegNo.length > 0 ? normalizedRegNo : undefined;

      const normalizedIdCard = toSafeString(idCardNo).trim();
      const maybeIdCard =
        normalizedIdCard.length > 0 ? normalizedIdCard : undefined;

      const mergedMerchant = {
        ...(incomingMerchant ?? {}),

        email: incomingMerchant?.email ?? undefined,
        password: incomingMerchant?.password ?? undefined,
        phone: incomingMerchant?.phone ?? phoneNumber ?? undefined,

        full_name: toSafeString(
          incomingMerchant?.full_name ?? initialFullName,
        ).trim(),
        business_name: toSafeString(
          incomingMerchant?.business_name ?? initialBusinessName,
        ).trim(),

        category: normalizedCategoryIds,
        categories:
          incomingMerchant?.categories ??
          route.params?.merchant?.categories ??
          [],

        ...(maybeRegNo !== undefined ? { registration_no: maybeRegNo } : {}),
        ...(maybeIdCard !== undefined ? { id_card_number: maybeIdCard } : {}),

        address: toSafeString(address).trim(),
        latitude: pickedCoord?.latitude ?? null,
        longitude: pickedCoord?.longitude ?? null,

        logo,
        license: licenseFile,

        owner_type: effectiveOwnerType,
      };

      navigation.navigate(NEXT_ROUTE, {
        ...(route.params ?? {}),
        merchant: mergedMerchant,
        idCardNo: maybeIdCard ?? null,
        serviceType: serviceType ?? "food",
        owner_type: effectiveOwnerType,
        initialDeliveryOption: deliveryOption ?? null,
        returnTo,
        initialCategory: normalizedCategoryIds,
      });
    } catch (e) {
      Alert.alert("Error", e?.message || "Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const isFormValid = validate();

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={["left", "top", "right", "bottom"]}
    >
      <View style={styles.topGlow} />

      <View style={styles.page}>
        <HeaderWithSteps step="Step 4 of 7" />

        {/* ✅ FIX 3: behavior="padding" on iOS only — same as file 2.
            On Android, undefined avoids the double-resize flicker. */}
        <KeyboardWrapper
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={{ flex: 1 }}>
            <ScrollView
              ref={scrollRef}
              contentContainerStyle={[
                styles.container,
                keyboardOpen && styles.containerKeyboardOpen,
              ]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              showsVerticalScrollIndicator={false}
              removeClippedSubviews={false}
            >
              <View style={styles.heroCard}>
                <Text style={styles.brandLabel}>TÀBDEY MERCHANT</Text>
                <Text style={styles.h1}>Business setup</Text>
                <Text style={styles.subtitle}>
                  Add your business location, logo and required identification
                  details.
                </Text>
              </View>

              {/* ===== Business location (map) ===== */}
              <Text style={[styles.label, { marginTop: 6 }]}>
                Business location (map) — tap to update
              </Text>

              <View style={{ marginBottom: 8 }}>
                <TouchableOpacity
                  style={styles.btnSecondary}
                  onPress={openMapPicker}
                >
                  <Text style={styles.btnSecondaryText}>
                    📍 Select on full map
                  </Text>
                </TouchableOpacity>
              </View>

              {pickedCoord ? (
                <>
                  <TouchableOpacity
                    style={styles.locationPreviewCard}
                    activeOpacity={0.86}
                    onPress={openMapPicker}
                  >
                    <Text style={styles.locationPreviewIcon}>📍</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.locationPreviewTitle}>
                        Location selected
                      </Text>
                      <Text style={styles.locationPreviewText}>
                        Tap to edit location on full map
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <View style={styles.coordsBlock}>
                    <View style={styles.coordsRow}>
                      <Text style={styles.coordsLabel}>Latitude:</Text>
                      <Text style={styles.coordsValue}>
                        {pickedCoord.latitude.toFixed(6)}
                      </Text>
                    </View>
                    <View style={styles.coordsRow}>
                      <Text style={styles.coordsLabel}>Longitude:</Text>
                      <Text style={styles.coordsValue}>
                        {pickedCoord.longitude.toFixed(6)}
                      </Text>
                    </View>
                  </View>
                </>
              ) : (
                <View style={styles.noLocationCard}>
                  <Text style={styles.noLocationIcon}>🗺️</Text>
                  <Text style={styles.noLocationText}>
                    No location selected yet.
                  </Text>
                  <Text style={styles.noLocationSubtext}>
                    Tap "Select on full map" to drop a pin, then Confirm.
                  </Text>
                </View>
              )}

              <Field
                label={
                  <Text>
                    Business address <Text style={{ color: "red" }}>*</Text>
                  </Text>
                }
                placeholder="Street, city, region"
                value={address}
                onChangeText={setAddress}
                autoCapitalize="words"
                hint={
                  pickedCoord
                    ? "📍 Auto-filled from GPS/map; you can edit."
                    : undefined
                }
                scrollRef={scrollRef}
              />

              {/* ===== Logo Upload ===== */}
              <Text style={styles.label}>
                Business logo <Text style={{ color: "red" }}>*</Text>
              </Text>
              <LogoUploader value={logo} onChange={setLogo} />

              <Field
                label={
                  <Text>
                    ID card number <Text style={{ color: "red" }}>*</Text>
                  </Text>
                }
                placeholder="Enter 11-digit ID number"
                value={idCardNo}
                onChangeText={(text) => {
                  const cleaned = text.replace(/[^0-9]/g, "").slice(0, 11);
                  setIdCardNo(cleaned);
                }}
                keyboardType={Platform.OS === "ios" ? "number-pad" : "numeric"}
                maxLength={11}
                hint="🆔 Only numbers allowed, exactly 11 digits."
                scrollRef={scrollRef}
              />

              <Field
                label={<Text>Business License number</Text>}
                placeholder="e.g., BRN-12345"
                value={regNo}
                onChangeText={setRegNo}
                autoCapitalize="characters"
                scrollRef={scrollRef}
              />

              {/* ===== License Upload ===== */}
              <Text style={styles.label}>
                Business license / registration document (optional)
              </Text>
              <View style={styles.row}>
                <TouchableOpacity
                  ref={submitRef}
                  style={[
                    styles.btnSecondary,
                    pickingLicense && styles.btnDisabled,
                  ]}
                  onPress={onPickLicense}
                  disabled={pickingLicense}
                >
                  {pickingLicense ? (
                    <ActivityIndicator />
                  ) : (
                    <Text style={styles.btnSecondaryText}>📄 Choose File</Text>
                  )}
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  {licenseFile ? (
                    <View>
                      <Text style={styles.fileName} numberOfLines={1}>
                        {licenseFile.name}
                      </Text>
                      <Text style={styles.metaText}>
                        {licenseFile.mimeType || "file"} ·{" "}
                        {formatSize(licenseFile.size)}
                      </Text>
                      <TouchableOpacity onPress={onRemoveLicense}>
                        <Text style={styles.removeText}>❌ Remove</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <Text numberOfLines={1} style={styles.fileName}>
                      No file selected
                    </Text>
                  )}
                </View>
              </View>

              {/* ✅ FIX 5: Submit button is INSIDE the ScrollView (not a
                  position:absolute fabWrap). A floating absolute view forces
                  the layout engine to recalculate its `bottom` offset on every
                  keyboard show/hide, which is what caused the flicker. Keeping
                  the button in the scroll flow means the keyboard just shifts
                  the scroll — no layout thrash. */}
              <TouchableOpacity
                style={
                  isFormValid && !submitting
                    ? styles.btnPrimary
                    : styles.btnPrimaryDisabled
                }
                onPress={onSubmit}
                disabled={!isFormValid || submitting}
                activeOpacity={0.86}
              >
                {submitting ? (
                  <ActivityIndicator color={BRAND.white} />
                ) : (
                  <Text
                    style={
                      isFormValid
                        ? styles.btnPrimaryText
                        : styles.btnPrimaryTextDisabled
                    }
                  >
                    Submit
                  </Text>
                )}
              </TouchableOpacity>
              <View
                style={
                  keyboardOpen ? styles.keyboardSpacer : styles.normalSpacer
                }
              />
            </ScrollView>
          </View>
        </KeyboardWrapper>
      </View>

      {/* ===== Map Picker Modal ===== */}
      <Modal
        visible={locationModalVisible}
        onRequestClose={closeMapPicker}
        animationType="slide"
        presentationStyle="fullScreen"
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>Select Merchant Location</Text>
              <Text style={styles.modalSubtitle}>
                Tap the map or use your current location
              </Text>
            </View>

            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={closeMapPicker}
            >
              <Text style={styles.modalClose}>Close</Text>
            </TouchableOpacity>
          </View>

          {/* Map with single marker that updates on tap */}
          <View style={{ flex: 1 }}>
            {!mapError ? (
              <>
                <OSMViewErrorBoundary>
                  <OSMView
                    ref={mapRef}
                    key={mapKey}
                    style={styles.fullMap}
                    initialCenter={mapCenter}
                    initialZoom={mapZoom}
                    styleUrl="https://tiles.openfreemap.org/styles/liberty"
                    onRegionChange={handleMapPick}
                    onMapReady={() => {
                      console.log("Map ready in MerchantExtrasScreen");
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
                  <Text style={styles.centerPinText}>📍</Text>
                </View>
              </>
            ) : (
              <View style={styles.mapErrorContainerFull}>
                <Text style={styles.mapErrorTextFull}>
                  ⚠️ Unable to load map
                </Text>
                <Text style={styles.mapErrorSubtextFull}>
                  Check your internet connection
                </Text>
                <TouchableOpacity
                  style={styles.mapRetryBtnFull}
                  onPress={() => {
                    setMapError(false);
                    setMapInitAttempts(0);
                    setMapKey(Date.now());
                    setMapLoading(true);
                  }}
                >
                  <Text style={styles.mapRetryTextFull}>⟳ Retry</Text>
                </TouchableOpacity>
              </View>
            )}

            {mapLoading && !mapError && (
              <View style={styles.mapLoadingOverlay}>
                <ActivityIndicator size="large" color={BRAND.purple} />
                <Text style={styles.mapLoadingText}>Loading map...</Text>
                {mapInitAttempts > 0 && (
                  <Text style={styles.mapLoadingSubtext}>
                    Retry attempt {mapInitAttempts}/3
                  </Text>
                )}
              </View>
            )}

            <View style={styles.modalFloatWrap}>
              <TouchableOpacity
                style={styles.modalFloatBtn}
                onPress={useCurrentLocationInModal}
                disabled={modalLocLoading}
                accessibilityRole="button"
                accessibilityLabel="Use current location"
              >
                {modalLocLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalFloatBtnText}>
                    Use Current Location
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {!!modalLocError && (
            <Text style={[styles.locError, { marginHorizontal: 16 }]}>
              ⚠️ {modalLocError}
            </Text>
          )}

          <View style={styles.modalFooter}>
            <Text style={styles.modalHint}>
              Move the map until the pin is on your merchant location, then
              confirm.
            </Text>

            <TouchableOpacity
              style={
                centerPinCoord || pickedCoord
                  ? styles.btnPrimary
                  : styles.btnPrimaryDisabled
              }
              onPress={confirmPickedLocation}
              disabled={!centerPinCoord && !pickedCoord}
              activeOpacity={0.86}
            >
              <Text
                style={
                  centerPinCoord || pickedCoord
                    ? styles.btnPrimaryText
                    : styles.btnPrimaryTextDisabled
                }
              >
                Confirm Location
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

// ========== LogoUploader Component ==========
function LogoUploader({ value, onChange }) {
  const [busy, setBusy] = useState(false);
  const maxBytes = 5 * 1024 * 1024;

  const pickFromGallery = async () => {
    try {
      setBusy(true);
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission needed",
          "Allow photo access to upload a logo.",
        );
        return;
      }
      const img = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });
      if (!img.canceled) {
        const a = img.assets?.[0];
        if (a?.fileSize && a.fileSize > maxBytes) {
          Alert.alert("Too large", "Logo must be under 5MB.");
          return;
        }
        onChange({
          name: a?.fileName ?? "logo.jpg",
          uri: a?.uri,
          mimeType: a?.mimeType ?? "image/jpeg",
          size: a?.fileSize ?? 0,
        });
      }
    } catch (e) {
      Alert.alert("Logo upload failed", e?.message || "Try again.");
    } finally {
      setBusy(false);
    }
  };

  const takePhoto = async () => {
    try {
      setBusy(true);
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission needed",
          "Allow camera access to take a logo photo.",
        );
        return;
      }
      const img = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });
      if (!img.canceled) {
        const a = img.assets?.[0];
        if (a?.fileSize && a.fileSize > maxBytes) {
          Alert.alert("Too large", "Logo must be under 5MB.");
          return;
        }
        onChange({
          name: a?.fileName ?? "logo.jpg",
          uri: a?.uri,
          mimeType: a?.mimeType ?? "image/jpeg",
          size: a?.fileSize ?? 0,
        });
      }
    } catch (e) {
      Alert.alert("Camera error", e?.message || "Try again.");
    } finally {
      setBusy(false);
    }
  };

  const remove = () => onChange(null);

  if (!value) {
    return (
      <View style={styles.logoCard}>
        <Text style={styles.logoCardIcon}>➕</Text>
        <Text style={styles.logoCardTitle}>Upload logo</Text>
        <Text style={styles.logoCardHint}>
          Square image works best (1:1). Max 5MB.
        </Text>

        <View style={styles.logoActionsRow}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={pickFromGallery}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator />
            ) : (
              <Text style={styles.actionBtnText}>📁 Choose Image</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtnGhost}
            onPress={takePhoto}
            disabled={busy}
          >
            <Text style={styles.actionBtnGhostText}>📷 Take Photo</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.logoSelectedWrap}>
      <View style={styles.logoPreviewLargeWrap}>
        <Image source={{ uri: value.uri }} style={styles.logoPreviewLarge} />
      </View>
      <View style={{ marginTop: 8 }}>
        <Text numberOfLines={1} style={styles.fileName}>
          {value.name}
        </Text>
        <Text style={styles.metaText}>
          {formatSize(value.size)} · {value.mimeType || "image"}
        </Text>
      </View>

      <View style={styles.logoActionsRow}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={pickFromGallery}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator />
          ) : (
            <Text style={styles.actionBtnText}>🔄 Change</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionBtnGhost}
          onPress={remove}
          disabled={busy}
        >
          <Text style={styles.actionBtnGhostText}>❌ Remove</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = "default",
  autoCapitalize = "none",
  hint,
  maxLength,
  scrollRef,
}) {
  const inputWrapRef = useRef(null);

  const scrollToField = () => {
    requestAnimationFrame(() => {
      inputWrapRef.current?.measureLayout(
        scrollRef.current,
        (x, y) => {
          scrollRef.current?.scrollTo({
            y: Math.max(y - 80, 0),
            animated: true,
          });
        },
        () => {},
      );
    });
  };

  return (
    <View ref={inputWrapRef} style={{ marginBottom: 16 }}>
      <Text style={styles.label}>{label}</Text>

      <View style={styles.inputWrapper}>
        <TextInput
          style={styles.inputField}
          placeholder={placeholder}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          placeholderTextColor="#9aa0a6"
          returnKeyType="done"
          blurOnSubmit={false}
          maxLength={maxLength}
          textContentType="none"
          autoCorrect={false}
          autoComplete="off"
          importantForAutofill="no"
          underlineColorAndroid="transparent"
          onFocus={scrollToField}
        />
      </View>

      {!!hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

// ========== Helpers ==========
function formatSize(bytes = 0) {
  if (!bytes || bytes <= 0) return "—";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

const toSafeString = (v) => {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (Array.isArray(v)) return v.join(",");
  if (typeof v === "object") return String(v.label ?? v.value ?? "");
  return "";
};

const normalizeCategoryIds = (v) => {
  if (!v) return [];
  if (Array.isArray(v)) {
    return v
      .map((item) => {
        if (typeof item === "object") {
          const id = item.id ?? item.value ?? item.business_type_id ?? null;
          return id != null ? String(id).trim() : "";
        }
        return String(item).trim();
      })
      .filter(Boolean);
  }
  if (typeof v === "string") {
    return v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (typeof v === "object") {
    const id = v.id ?? v.value ?? v.business_type_id ?? null;
    return id != null && String(id).trim() ? [String(id).trim()] : [];
  }
  return [];
};

const styles = StyleSheet.create({
  safeArea: {
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
    opacity: 0.45,
  },

  page: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 0,
  },

  heroCard: {
    backgroundColor: BRAND.white,
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 18,
    marginBottom: 18,
    ...SHADOW.sm,
  },

  brandLabel: {
    fontFamily: FONT.body,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    color: BRAND.purple,
    marginBottom: 10,
  },

  h1: {
    fontFamily: FONT.header,
    fontSize: 26,
    fontWeight: "700",
    color: BRAND.black,
    lineHeight: 32,
    marginBottom: 10,
  },

  subtitle: {
    fontFamily: FONT.body,
    fontSize: 14,
    lineHeight: 21,
    color: BRAND.grey,
  },

  // ✅ FIX 6: paddingBottom is a fixed value — no dynamic kbHeight addition.
  // kbHeight was set by manual Keyboard listeners which fired setState on every
  // keystroke, causing a full re-render (and keyboard flicker) each time.
  // KeyboardAvoidingView already handles the scroll offset natively.
  container: {
    flexGrow: 1,
    paddingBottom: 24,
  },

  containerKeyboardOpen: {
    paddingBottom: Platform.OS === "ios" ? 90 : 130,
  },
  normalSpacer: {
    height: 24,
  },

  keyboardSpacer: {
    height: Platform.OS === "ios" ? 90 : 180,
  },
  label: {
    fontFamily: FONT.body,
    fontSize: 14,
    marginBottom: 7,
    color: BRAND.black,
    fontWeight: "700",
  },

  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    height: 56,
    borderWidth: 1.2,
    borderRadius: 18,
    backgroundColor: "#FCFCFC",
    borderColor: BRAND.greyBorder,
    paddingHorizontal: 16,
  },
  inputField: {
    flex: 1,
    fontFamily: FONT.body,
    fontSize: 15,
    color: BRAND.black,
    paddingVertical: 10,
  },

  hint: {
    marginTop: 6,
    fontSize: 12,
    color: BRAND.grey,
    lineHeight: 18,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },

  btnSecondary: {
    backgroundColor: "#F4ECFF",
    borderWidth: 1.2,
    borderColor: BRAND.purple,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 18,
    alignItems: "center",
  },

  btnSecondaryText: {
    color: BRAND.purple,
    fontWeight: "700",
    fontSize: 14,
    fontFamily: FONT.body,
  },

  btnDisabled: { opacity: 0.6 },

  locationPreviewCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: BRAND.white,
    borderRadius: 18,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: BRAND.purple,
    ...SHADOW.sm,
  },

  locationPreviewIcon: {
    fontSize: 28,
  },

  locationPreviewTitle: {
    fontFamily: FONT.body,
    fontSize: 14,
    fontWeight: "700",
    color: BRAND.black,
  },

  locationPreviewText: {
    fontFamily: FONT.body,
    fontSize: 12,
    color: BRAND.grey,
    marginTop: 2,
  },

  coordsBlock: {
    backgroundColor: BRAND.white,
    padding: 14,
    borderRadius: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: BRAND.greyBorder,
    ...SHADOW.sm,
  },

  coordsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },

  coordsLabel: {
    fontSize: 12,
    color: BRAND.grey,
    fontWeight: "600",
  },

  coordsValue: {
    fontSize: 13,
    color: BRAND.black,
    fontWeight: "700",
  },

  noLocationCard: {
    backgroundColor: BRAND.white,
    padding: 20,
    borderRadius: 24,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#EFE7F7",
    ...SHADOW.sm,
  },

  noLocationIcon: {
    fontSize: 34,
    marginBottom: 10,
  },

  noLocationText: {
    fontSize: 15,
    fontWeight: "700",
    color: BRAND.black,
  },

  noLocationSubtext: {
    fontSize: 12,
    color: BRAND.grey,
    marginTop: 4,
    textAlign: "center",
    lineHeight: 18,
  },

  logoCard: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: BRAND.purple,
    borderRadius: 24,
    paddingVertical: 24,
    paddingHorizontal: 18,
    alignItems: "center",
    marginBottom: 16,
    backgroundColor: "#FCFCFC",
  },

  logoCardIcon: {
    fontSize: 34,
    color: BRAND.purple,
  },

  logoCardTitle: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: "700",
    color: BRAND.black,
  },

  logoCardHint: {
    marginTop: 4,
    fontSize: 12,
    color: BRAND.grey,
  },

  logoActionsRow: {
    marginTop: 14,
    flexDirection: "row",
    gap: 10,
  },

  actionBtn: {
    backgroundColor: BRAND.purple,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: RADIUS.pill,
  },

  actionBtnText: {
    color: BRAND.white,
    fontWeight: "700",
  },

  actionBtnGhost: {
    backgroundColor: BRAND.white,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: RADIUS.pill,
    borderWidth: 1.2,
    borderColor: BRAND.greyBorder,
  },

  actionBtnGhostText: {
    color: BRAND.black,
    fontWeight: "700",
  },

  logoSelectedWrap: {
    marginBottom: 16,
    alignItems: "center",
  },

  logoPreviewLargeWrap: {
    width: 128,
    height: 128,
    borderRadius: 30,
    overflow: "hidden",
    backgroundColor: "#fff",
    ...SHADOW.sm,
  },

  logoPreviewLarge: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },

  fileName: {
    fontSize: 13,
    color: BRAND.black,
    fontWeight: "600",
  },

  metaText: {
    fontSize: 12,
    color: BRAND.grey,
    marginTop: 2,
  },

  removeText: {
    marginTop: 6,
    fontSize: 12,
    color: "#ef4444",
    fontWeight: "700",
  },

  btnPrimary: {
    backgroundColor: BRAND.purple,
    paddingVertical: 16,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    marginTop: 8,
    marginBottom: 16,
    ...SHADOW.md,
  },

  btnPrimaryDisabled: {
    backgroundColor: BRAND.greyLight,
    paddingVertical: 16,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    marginTop: 8,
    marginBottom: 16,
  },

  btnPrimaryText: {
    color: BRAND.white,
    fontSize: 16,
    fontWeight: "700",
  },

  btnPrimaryTextDisabled: {
    color: BRAND.grey,
    fontSize: 16,
    fontWeight: "600",
  },

  modalHeader: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 14,
    backgroundColor: BRAND.white,
    borderBottomWidth: 1,
    borderBottomColor: "#EFE7F7",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  modalTitle: {
    fontFamily: FONT.header,
    fontSize: 18,
    fontWeight: "700",
    color: BRAND.black,
  },

  modalSubtitle: {
    fontFamily: FONT.body,
    fontSize: 12,
    color: BRAND.grey,
    marginTop: 3,
  },

  modalCloseButton: {
    backgroundColor: "#F4ECFF",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
  },

  modalClose: {
    fontFamily: FONT.body,
    fontSize: 13,
    fontWeight: "700",
    color: BRAND.purple,
  },

  fullMap: {
    flex: 1,
    backgroundColor: "#EEF6FF",
  },

  modalFloatWrap: {
    position: "absolute",
    top: 18,
    right: 18,
  },

  modalFloatBtn: {
    backgroundColor: BRAND.purple,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: RADIUS.pill,
    ...SHADOW.md,
  },

  modalFloatBtnText: {
    fontFamily: FONT.body,
    color: BRAND.white,
    fontWeight: "700",
    fontSize: 13,
  },

  modalFooter: {
    backgroundColor: BRAND.white,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: "#EFE7F7",
  },

  modalHint: {
    fontFamily: FONT.body,
    fontSize: 12,
    color: BRAND.grey,
    lineHeight: 17,
    marginBottom: 10,
    textAlign: "center",
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
    fontSize: 11,
    color: BRAND.grey,
  },

  centerPin: {
    position: "absolute",
    left: "50%",
    top: "50%",
    marginLeft: -18,
    marginTop: -36,
    zIndex: 999,
  },

  centerPinText: {
    fontSize: 36,
  },

  locError: {
    fontSize: 12,
    color: "#ef4444",
    marginTop: 6,
    marginBottom: 4,
  },

  mapErrorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f9fafb",
    borderRadius: 12,
  },

  mapErrorText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },

  mapErrorSubtext: {
    marginTop: 4,
    fontSize: 11,
    color: "#6b7280",
  },

  mapRetryBtn: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: BRAND.purple,
    borderRadius: 8,
  },

  mapRetryText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 12,
  },

  mapErrorContainerFull: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f9fafb",
  },

  mapErrorTextFull: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },

  mapErrorSubtextFull: {
    marginTop: 4,
    fontSize: 12,
    color: "#6b7280",
  },

  mapRetryBtnFull: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: BRAND.purple,
    borderRadius: 8,
  },

  mapRetryTextFull: {
    color: "#fff",
    fontWeight: "600",
  },
});
