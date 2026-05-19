// screens/mart/AddItemTab.js
import React, {
  useEffect,
  useMemo,
  useState,
  useLayoutEffect,
  useCallback,
  useRef,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Image,
  Switch,
  ActivityIndicator,
  Alert,
  Platform,
  Modal,
  TouchableWithoutFeedback,
  RefreshControl,
  BackHandler,
  DeviceEventEmitter,
  FlatList,
  Pressable,
  Keyboard,
  KeyboardAvoidingView,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as SecureStore from "expo-secure-store";
import * as FileSystem from "expo-file-system";
import {
  useNavigation,
  useRoute,
  useFocusEffect,
} from "@react-navigation/native";
import { useHeaderHeight } from "@react-navigation/elements";
import { Picker } from "@react-native-picker/picker";
import * as ImageManipulator from 'expo-image-manipulator';

import {
  CATEGORY_ENDPOINT as ENV_CATEGORY_ENDPOINT,
  ITEM_ENDPOINT as ENV_ITEM_ENDPOINT,
  ITEM_IMAGE_ENDPOINT as ENV_ITEM_IMAGE_ENDPOINT,
} from "@env";

/* ───────────────────────── Debug ───────────────────────── */
const DEBUG = true;
const rid = () => Math.random().toString(36).slice(2, 8);
const dlog = (...args) => DEBUG && console.log("[ADD-ITEM]", ...args);
const derr = (...args) =>
  DEBUG && console.log("%c[ADD-ITEM ERR]", "color:#d00", ...args);

/* ───────────────────────── Theme ───────────────────────── */
const FONT_FAMILY = Platform.select({ ios: "System", android: "sans-serif" });
const PLACEHOLDER_COLOR = "#94a3b8";
const TEXT_COLOR = "#0f172a";
const INPUT_HEIGHT = 46;

/* ───────────────────────── Image base ───────────────────────── */
const IMG_MART_BASE = (ENV_ITEM_IMAGE_ENDPOINT || "").replace(/\/$/, "");
function makeItemImageUrl(path) {
  if (!path) return "";
  const s = String(path).trim();
  if (/^https?:\/\//i.test(s)) return s;
  return IMG_MART_BASE ? `${IMG_MART_BASE}/${s.replace(/^\/+/, "")}` : s;
}

/* ───────────────────────── Custom Select ───────────────────────── */
function Select({
  value,
  options,
  onChange,
  placeholder = "None",
  fontSize = 14,
  testID,
  maxVisible = 3,
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const wrapRef = useRef(null);

  const isNone =
    value === undefined || value === null || value === "" || value === "None";
  const shown = isNone
    ? placeholder
    : (options.find((o) => String(o.value) === String(value))?.label ??
      placeholder);

  const measure = () => {
    if (!wrapRef.current) return;
    wrapRef.current.measureInWindow((x, y, w, h) => setAnchor({ x, y, w, h }));
  };
  const openMenu = () => {
    measure();
    setOpen(true);
  };
  const selectAndClose = (v) => {
    onChange?.(v);
    setOpen(false);
  };

  const itemHeight = INPUT_HEIGHT;
  const visibleCount = Math.min(options.length, maxVisible);
  const dropdownHeight = itemHeight * visibleCount;

  return (
    <>
      <Pressable
        ref={wrapRef}
        onPress={openMenu}
        testID={testID}
        style={styles.pickerWrap}
        onLayout={measure}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text
            numberOfLines={1}
            style={[
              styles.pickerText,
              { color: isNone ? PLACEHOLDER_COLOR : TEXT_COLOR, fontSize },
            ]}
            testID={testID ? `${testID}-text` : undefined}
          >
            {shown}
          </Text>
          <Ionicons
            name={open ? "chevron-up" : "chevron-down"}
            size={18}
            color={isNone ? PLACEHOLDER_COLOR : TEXT_COLOR}
          />
        </View>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onShow={measure}>
        <TouchableWithoutFeedback onPress={() => setOpen(false)}>
          <View style={styles.overlayBackdrop}>
            <TouchableWithoutFeedback>
              <View
                style={[
                  styles.dropdownCard,
                  {
                    left: anchor.x,
                    top: anchor.y + anchor.h,
                    width: anchor.w,
                    height: dropdownHeight,
                  },
                ]}
              >
                <FlatList
                  data={options}
                  keyExtractor={(it, idx) => String(it.value ?? idx)}
                  renderItem={({ item }) => {
                    const selected = String(item.value) === String(value);
                    return (
                      <Pressable
                        onPress={() => selectAndClose(item.value)}
                        style={styles.dropdownItem}
                      >
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.dropdownText,
                            {
                              fontSize,
                              color: selected ? "#00b14f" : TEXT_COLOR,
                              fontFamily: FONT_FAMILY,
                              fontWeight: selected ? "700" : "500",
                            },
                          ]}
                        >
                          {item.label}
                        </Text>
                        {selected ? (
                          <Ionicons
                            name="checkmark"
                            size={18}
                            color="#00b14f"
                          />
                        ) : null}
                      </Pressable>
                    );
                  }}
                  ItemSeparatorComponent={() => (
                    <View style={styles.dropdownSeparator} />
                  )}
                  contentContainerStyle={{ padding: 0 }}
                />
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}

// Replace the entire SizeStandardPicker component with this:

function SizeStandardPicker({ value, onChange, enabled, fontSize = 14 }) {
  return (
    <Select
      value={value}
      onChange={onChange}
      options={[
        { label: "US (American)", value: "US" },
        { label: "UK (British)", value: "UK" },
        { label: "EU (European)", value: "EU" },
        { label: "JP (Japanese)", value: "JP" },
      ]}
      placeholder="Select size standard"
      fontSize={fontSize}
    />
  );
}

/* ───────────────────────── Main Component ───────────────────────── */
export default function AddItemTab({ isTablet }) {
  const navigation = useNavigation();
  const route = useRoute();
  const headerHeight = useHeaderHeight();

  /* Fonts */
  const FS = useMemo(() => {
    const base = isTablet ? 15 : 14;
    const label = base;
    const title = isTablet ? 18 : 16;
    const sub = isTablet ? 13 : 12;
    const small = isTablet ? 13 : 12;
    return { base, label, title, sub, small };
  }, [isTablet]);

  useLayoutEffect(() => {
    navigation.setOptions?.({
      gestureEnabled: true,
      fullScreenGestureEnabled: true,
      headerLeft: () => (
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{ paddingHorizontal: 12, paddingVertical: 8 }}
        >
          <Ionicons name="chevron-back" size={24} color={TEXT_COLOR} />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  /* Android back */
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (navigation.canGoBack()) {
          navigation.goBack();
          return true;
        }
        return false;
      };
      const sub = BackHandler.addEventListener(
        "hardwareBackPress",
        onBackPress,
      );
      return () => sub?.remove?.();
    }, [navigation]),
  );

  /* BusinessId */
  const BUSINESS_ID = useMemo(() => {
    const p = route?.params ?? {};
    return (
      (p.businessId ||
        p.business_id ||
        p.merchant?.businessId ||
        p.merchant?.id ||
        "") + ""
    ).trim();
  }, [route?.params]);

  const OWNER_TYPE = useMemo(() => {
    const p = route?.params ?? {};
    return p.owner_type || p.ownerType || "mart";
  }, [route?.params]);

  const goToMenu = useCallback(() => {
    if (!BUSINESS_ID) {
      navigation.navigate("MenuScreen");
      return;
    }
    const bidNum = Number(BUSINESS_ID);
    navigation.navigate("MenuScreen", {
      businessId: bidNum,
      business_id: bidNum,
      owner_type: OWNER_TYPE,
      refreshAt: Date.now(),
    });
  }, [navigation, BUSINESS_ID, OWNER_TYPE]);

  /* Categories URL */
  const CATEGORY_BASE = useMemo(
    () => (ENV_CATEGORY_ENDPOINT || "").replace(/\/$/, ""),
    [],
  );
  const CATEGORIES_URL = useMemo(() => {
    if (!CATEGORY_BASE || !BUSINESS_ID) return null;

    const hasPlaceholder = /\{businessId\}/i.test(CATEGORY_BASE);
    const pathStyle = hasPlaceholder
      ? CATEGORY_BASE.replace(
          /\{businessId\}/gi,
          encodeURIComponent(BUSINESS_ID),
        )
      : `${CATEGORY_BASE}/${encodeURIComponent(BUSINESS_ID)}`;

    const queryStyle = `${CATEGORY_BASE}?business_id=${encodeURIComponent(BUSINESS_ID)}`;
    const baseUrl = CATEGORY_BASE.includes("?") ? queryStyle : pathStyle;

    const sep = baseUrl.includes("?") ? "&" : "?";
    return `${baseUrl}${sep}owner_type=mart`;
  }, [CATEGORY_BASE, BUSINESS_ID]);

  const ADD_ITEM_ENDPOINT = useMemo(() => (ENV_ITEM_ENDPOINT || "").trim(), []);

  /* Local state */
  const [itemName, setItemName] = useState("");
  const [description, setDescription] = useState("");

  const [imageUri, setImageUri] = useState("");
  const [imageName, setImageName] = useState("");
  const [imageSize, setImageSize] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);

  const [price, setPrice] = useState("");
  const [taxRate, setTaxRate] = useState("0");
  const [discount, setDiscount] = useState("");

  const [isAvailable, setIsAvailable] = useState(true);
  const [stockLimit, setStockLimit] = useState("");

  const [sortPriority, setSortPriority] = useState("None");

  const [category, setCategory] = useState("None");
  const [categories, setCategories] = useState([]);
  const [loadingCats, setLoadingCats] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [saving, setSaving] = useState(false);
  const [kbHeight, setKbHeight] = useState(0);

  // Category info overlay state
  const [catInfoOpen, setCatInfoOpen] = useState(false);
  const [catInfoLoading, setCatInfoLoading] = useState(false);
  const [catInfoError, setCatInfoError] = useState("");
  const [catInfoData, setCatInfoData] = useState(null);
  const [businessTypeMap, setBusinessTypeMap] = useState({}); // Maps category_id -> business_type_name
  const [showSizeFields, setShowSizeFields] = useState(false);
  // Add after the state declarations
  const isClothingOrShoesCategory = useCallback(
    (categoryId) => {
      const businessType = businessTypeMap[categoryId];
      if (!businessType) return false;

      const clothingKeywords = ["clothes", "clothe", "cloth", "shoe", "shoes"];
      const lowerType = businessType.toLowerCase();

      return clothingKeywords.some((keyword) => lowerType.includes(keyword));
    },
    [businessTypeMap],
  );
  // Add after isClothingOrShoesCategory
  const handleCategoryChange = useCallback(
    (selectedCategoryName) => {
      setCategory(selectedCategoryName);

      // Find the category ID to check business type
      const selectedCat = categories.find(
        (c) => c.name === selectedCategoryName,
      );
      if (selectedCat && selectedCat.id !== "None") {
        const requiresSize = isClothingOrShoesCategory(selectedCat.id);
        setShowSizeFields(requiresSize);
      } else {
        setShowSizeFields(false);
      }
    },
    [categories, isClothingOrShoesCategory],
  );
  // New state for clothing/shoes
  const [itemType, setItemType] = useState("general"); // 'general', 'clothing', 'shoes'
  const [sizeStandard, setSizeStandard] = useState("US");
  const [availableSizes, setAvailableSizes] = useState("");
  const [productImages, setProductImages] = useState([]); // Array of image objects
  const [isVeg, setIsVeg] = useState(false);
  const [spiceLevel, setSpiceLevel] = useState("None");

  useEffect(() => {
    const showEvt =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const sh = Keyboard.addListener(showEvt, (e) =>
      setKbHeight(e?.endCoordinates?.height || 0),
    );
    const hh = Keyboard.addListener(hideEvt, () => setKbHeight(0));
    return () => {
      sh.remove();
      hh.remove();
    };
  }, []);

  const formatBytes = (bytes) => {
    if (!bytes || bytes <= 0) return "";
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.min(
      Math.floor(Math.log(bytes) / Math.log(1024)),
      sizes.length - 1,
    );
    const val = bytes / Math.pow(1024, i);
    return `${val.toFixed(val >= 10 || i === 0 ? 0 : 1)} ${sizes[i]}`;
  };

  const setPickedAsset = (asset) => {
    setImageUri(asset.uri);
    setImageName(asset.fileName || asset.filename || "image.jpg");
    setImageSize(
      asset.fileSize || asset.fileSize === 0 ? asset.fileSize : asset.size || 0,
    );
  };

  const extractCategoriesFromResponse = (raw) => {
    if (Array.isArray(raw)) return raw;
    if (raw && Array.isArray(raw.types)) {
      const flat = [];
      for (const t of raw.types)
        if (Array.isArray(t.categories)) flat.push(...t.categories);
      return flat;
    }
    const wrappers = [
      "data",
      "categories",
      "result",
      "items",
      "rows",
      "payload",
      "list",
    ];
    for (const k of wrappers) if (Array.isArray(raw?.[k])) return raw[k];
    if (raw && typeof raw === "object")
      for (const v of Object.values(raw)) if (Array.isArray(v)) return v;
    return [];
  };

  const loadCategories = useCallback(
    async (opts = { showErrors: true }) => {
      if (!BUSINESS_ID) {
        setLoadingCats(false);
        if (opts.showErrors)
          Alert.alert(
            "Config",
            "Missing businessId. Pass it via route params.",
          );
        return;
      }
      if (!CATEGORY_BASE) {
        setLoadingCats(false);
        if (opts.showErrors)
          Alert.alert("Config", "Missing CATEGORY_ENDPOINT in .env");
        return;
      }
      if (!CATEGORIES_URL) return;

      try {
        setLoadingCats(true);
        const token = (await SecureStore.getItemAsync("auth_token")) || "";

        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 15000);

        const res = await fetch(CATEGORIES_URL, {
          method: "GET",
          headers: {
            Accept: "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          signal: controller.signal,
        });
        clearTimeout(tid);

        const rawText = await res.text();
        if (!res.ok)
          throw new Error(
            `HTTP ${res.status}${rawText ? ` • ${rawText}` : ""}`,
          );

        let raw;
        try {
          raw = rawText ? JSON.parse(rawText) : [];
        } catch {
          raw = [];
        }

        // Extract categories with their business_type_name from the nested structure
        const normalized = [];
        const businessTypeMapping = {};

        if (raw && Array.isArray(raw.types)) {
          for (const typeGroup of raw.types) {
            const businessTypeName = typeGroup.business_type_name || "";
            if (Array.isArray(typeGroup.categories)) {
              for (const category of typeGroup.categories) {
                const categoryId = String(
                  category.id ?? category.category_id ?? "",
                );
                normalized.push({
                  id: categoryId,
                  name: category.category_name ?? category.name ?? "Unnamed",
                  description: category.description ?? "",
                  image: category.category_image ?? category.image ?? null,
                  business_type: businessTypeName,
                });
                if (categoryId) {
                  businessTypeMapping[categoryId] = businessTypeName;
                }
              }
            }
          }
        }

        const withNone = [
          { id: "None", name: "None", business_type: "None" },
          ...normalized,
        ];
        setCategories(withNone);
        setBusinessTypeMap(businessTypeMapping);

        if (!category || category === "None") {
          const firstReal = normalized[0]?.name ?? "None";
          setCategory(firstReal);
          // Check if first category requires size fields
          if (normalized[0]?.id) {
            const requiresSize = isClothingOrShoesCategory(normalized[0].id);
            setShowSizeFields(requiresSize);
          }
        }
      } catch (e) {
        if (opts.showErrors)
          Alert.alert(
            "Categories",
            `Failed to load categories.\n${String(e?.message || e)}`,
          );
      } finally {
        setLoadingCats(false);
      }
    },
    [BUSINESS_ID, CATEGORY_BASE, CATEGORIES_URL, category],
  );

  useEffect(() => {
    loadCategories({ showErrors: true });
  }, [loadCategories]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadCategories({ showErrors: false });
    setRefreshing(false);
  }, [loadCategories]);

  // Image actions
  const pickFromLibrary = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission needed",
        "Allow photo library access to select an image.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: false,
      quality: 0.9,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });
    if (!result.canceled && result.assets?.[0])
      setPickedAsset(result.assets[0]);
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow camera access to take a photo.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 0.9,
    });
    if (!result.canceled && result.assets?.[0])
      setPickedAsset(result.assets[0]);
  };

  const removeImage = () => {
    setImageUri("");
    setImageName("");
    setImageSize(0);
    setPreviewOpen(false);
  };

  // Multiple product images functions
  const pickMultipleImages = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission needed",
        "Allow photo library access to select images.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: false,
      quality: 0.9,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
    });

    if (!result.canceled && result.assets?.length) {
      const newImages = result.assets.map((asset) => ({
        uri: asset.uri,
        name: asset.fileName || asset.filename || `image_${Date.now()}.jpg`,
        size: asset.fileSize || asset.size || 0,
        type: guessMimeFromName(asset.fileName || "image.jpg"),
      }));
      setProductImages((prev) => [...prev, ...newImages]);
    }
  };

  const removeProductImage = (index) => {
    setProductImages((prev) => prev.filter((_, i) => i !== index));
  };

  const mapSortPriority = (priority) => {
    if (!priority || priority === "None") return 2;
    return priority === "high" ? 3 : priority === "low" ? 1 : 2;
  };

  async function toFileUriIfNeeded(uri) {
    if (!uri) return uri;
    if (uri.startsWith("file://")) return uri;
    if (!uri.startsWith("content://")) return uri;
    const dst = `${FileSystem.cacheDirectory}upload_${Date.now()}.jpg`;
    try {
      await FileSystem.copyAsync({ from: uri, to: dst });
      return dst;
    } catch {
      return uri;
    }
  }

  function guessMimeFromName(name = "") {
    const lower = name.toLowerCase();
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
    if (lower.endsWith(".webp")) return "image/webp";
    if (lower.endsWith(".gif")) return "image/gif";
    return "application/octet-stream";
  }

  const snapshotFormData = (fd) => {
    const out = [];
    fd.forEach((v, k) => {
      if (v && typeof v === "object" && "uri" in v) {
        out.push([k, `{file name:${v.name}, type:${v.type}}`]);
      } else {
        out.push([k, v]);
      }
    });
    return out;
  };

  function buildFormData({ payload, imageUri, imageName, productImagesList }) {
    const fd = new FormData();

    // Primary image (thumbnail)
    if (imageUri) {
      const filename = imageName || "image.jpg";
      const type = guessMimeFromName(filename);
      fd.append("item_image", { uri: imageUri, name: filename, type });
    }

    // Multiple product images - send as comma-separated paths after upload
    // For now, send as separate files
    if (productImagesList && productImagesList.length > 0) {
      productImagesList.forEach((img, idx) => {
        fd.append(`product_images`, {
          uri: img.uri,
          name: img.name,
          type: img.type,
        });
      });
    }

    const entries = {
      business_id: String(payload.business_id ?? ""),
      owner_type: "mart",
      category_name: payload.category_name ?? "",
      item_name: payload.item_name ?? "",
      description: payload.description ?? "",
      actual_price: String(payload.actual_price ?? ""),
      discount_percentage:
        payload.discount_percentage == null
          ? ""
          : String(payload.discount_percentage),
      tax_rate: payload.tax_rate == null ? "" : String(payload.tax_rate),
      is_available: String(payload.is_available ?? 1),
      stock_limit:
        payload.stock_limit == null ? "" : String(payload.stock_limit),
      sort_order: String(payload.sort_order ?? 2),
      // Clothing/Shoes specific fields
      size_standard: payload.size_standard || "",
      available_sizes: payload.available_sizes || "",
      is_veg: String(payload.is_veg ?? false),
      spice_level: payload.spice_level || "None",
    };

    Object.entries(entries).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v) !== "")
        fd.append(k, String(v));
    });

    return fd;
  }

  async function postToBackend(payload) {
    if (!ADD_ITEM_ENDPOINT) throw new Error("ITEM_ENDPOINT is not set");

    const token = (await SecureStore.getItemAsync("auth_token")) || "";
    const url = ADD_ITEM_ENDPOINT;

    // Convert all image URIs
    const primaryImageUri = imageUri ? await toFileUriIfNeeded(imageUri) : null;
    const multipleImages = await Promise.all(
      productImages.map(async (img) => ({
        ...img,
        uri: await toFileUriIfNeeded(img.uri),
      })),
    );

    const fd = buildFormData({
      payload,
      imageUri: primaryImageUri,
      imageName: imageName || "image.jpg",
      productImagesList: multipleImages,
    });

    const reqId = rid();
    dlog(`(req:${reqId}) POST ->`, url);
    dlog(`(req:${reqId}) Payload:`, payload);
    dlog(`(req:${reqId}) Primary image: ${!!primaryImageUri}`);
    dlog(`(req:${reqId}) Additional images: ${multipleImages.length}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: fd,
        signal: controller.signal,
      });

      const text = await res.text();
      dlog(`(req:${reqId}) status:`, res.status);
      dlog(`(req:${reqId}) body:`, text.slice(0, 1000));

      if (!res.ok) throw new Error(`HTTP ${res.status} • ${text}`);
      let created = null;
      try {
        created = text ? JSON.parse(text) : null;
      } catch {
        created = null;
      }
      return { data: created };
    } finally {
      clearTimeout(timeout);
    }
  }

  const fetchCategoryDetails = useCallback(async () => {
    const selectedName =
      category && category !== "None" ? String(category) : "";
    if (!selectedName) return;
    if (!CATEGORIES_URL) {
      setCatInfoError("Config error: categories URL not set.");
      return;
    }

    try {
      setCatInfoLoading(true);
      setCatInfoError("");
      setCatInfoData(null);

      const token = (await SecureStore.getItemAsync("auth_token")) || "";
      const url =
        CATEGORIES_URL +
        (CATEGORIES_URL.includes("?") ? "&" : "?") +
        `ts=${Date.now()}`;

      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: controller.signal,
      });
      clearTimeout(tid);

      const text = await res.text();
      if (!res.ok)
        throw new Error(`HTTP ${res.status}${text ? ` • ${text}` : ""}`);

      let raw;
      try {
        raw = text ? JSON.parse(text) : [];
      } catch {
        raw = [];
      }

      const harvest = [];
      const push = (c) => {
        if (!c) return;
        harvest.push({
          id: String(c.id ?? c.category_id ?? c._id ?? ""),
          name: c.category_name ?? c.name ?? c.title ?? c.label ?? "",
          description: c.description ?? "",
          image: c.category_image ?? c.image ?? null,
          business_type: c.business_type ?? "",
        });
      };
      if (Array.isArray(raw)) raw.forEach(push);
      if (raw && Array.isArray(raw.types))
        for (const t of raw.types)
          if (Array.isArray(t.categories)) t.categories.forEach(push);
      const wrappers = [
        "data",
        "categories",
        "result",
        "items",
        "rows",
        "payload",
        "list",
      ];
      for (const k of wrappers)
        if (Array.isArray(raw?.[k])) raw[k].forEach(push);
      if (!harvest.length && raw && typeof raw === "object") {
        for (const v of Object.values(raw)) {
          if (Array.isArray(v)) {
            v.forEach(push);
            break;
          }
        }
      }

      const norm = (s = "") => String(s).trim().toLowerCase();
      const found = harvest.find((c) => norm(c.name) === norm(selectedName));

      if (!found) setCatInfoError("Category not found on server.");
      else setCatInfoData(found);
    } catch (e) {
      setCatInfoError(e?.message || "Failed to load details.");
    } finally {
      setCatInfoLoading(false);
    }
  }, [category, CATEGORIES_URL]);

  const onSave = async () => {
    const clickId = rid();
    dlog(`(click:${clickId}) Save pressed`);

    if (!BUSINESS_ID)
      return Alert.alert(
        "Config",
        "Missing businessId. Pass it via route params.",
      );
    if (!itemName.trim())
      return Alert.alert("Validation", "Please enter item name.");
    if (!price || isNaN(Number(price)))
      return Alert.alert("Validation", "Enter a valid price.");
    if (taxRate !== "" && isNaN(Number(taxRate)))
      return Alert.alert("Validation", "Enter a valid tax rate.");
    if (discount !== "" && isNaN(Number(discount)))
      return Alert.alert("Validation", "Enter a valid discount.");
    if (
      stockLimit !== "" &&
      (isNaN(Number(stockLimit)) || Number(stockLimit) < 0)
    ) {
      return Alert.alert("Validation", "Stock must be 0 or more.");
    }

    const category_name =
      category && category !== "None" ? String(category) : "";
    if (!category_name) {
      return Alert.alert("Validation", "Please select a category.");
    }

    // Validate size fields if category requires them
    if (showSizeFields) {
      if (!availableSizes.trim()) {
        return Alert.alert(
          "Validation",
          "Please enter available sizes for this clothing/shoes category.",
        );
      }
      const sizes = availableSizes.split(",").map((s) => s.trim());
      if (sizes.length === 0) {
        return Alert.alert("Validation", "Please enter at least one size.");
      }
    }
    setSaving(true);

    const payload = {
      business_id: Number(BUSINESS_ID),
      category_name,
      item_name: itemName.trim(),
      description: description.trim(),
      actual_price: Number(price),
      discount_percentage: discount === "" ? null : Number(discount),
      tax_rate: taxRate === "" ? null : Number(taxRate),
      is_available: isAvailable ? 1 : 0,
      stock_limit: stockLimit === "" ? null : Number(stockLimit),
      sort_order: mapSortPriority(sortPriority),
      // Clothing/Shoes fields (only if category requires them)
      size_standard: showSizeFields ? sizeStandard : "",
      available_sizes: showSizeFields ? availableSizes : "",
      is_veg: isVeg,
      spice_level: spiceLevel,
    };

    dlog(`(click:${clickId}) payload:`, payload);

    try {
      const { data: created } = await postToBackend(payload);

      const rawPath =
        created?.image_url ??
        created?.item_image_url ??
        created?.item_image ??
        null;
      const absoluteUrl = makeItemImageUrl(rawPath);
      const imageUrl = absoluteUrl
        ? `${absoluteUrl}${absoluteUrl.includes("?") ? "&" : "?"}v=${Date.now()}`
        : "";

      const newItem = {
        id: String(
          created?.id ?? created?._id ?? created?.item_id ?? Date.now(),
        ),
        name: created?.item_name ?? payload.item_name,
        price: created?.actual_price ?? created?.price ?? payload.actual_price,
        inStock: (created?.is_available ?? payload.is_available) ? true : false,
        category:
          created?.category_name ??
          created?.category ??
          payload.category_name ??
          "",
        image: imageUrl,
        description: created?.description ?? payload.description ?? "",
        size_standard: created?.size_standard ?? payload.size_standard,
        available_sizes: created?.available_sizes ?? payload.available_sizes,
      };

      DeviceEventEmitter.emit("mart:item:added", newItem);

      // Reset form
      setItemName("");
      setDescription("");
      setImageUri("");
      setImageName("");
      setImageSize(0);
      setPrice("");
      setTaxRate("");
      setDiscount("");
      setIsAvailable(true);
      setStockLimit("");
      setSortPriority("None");
      setItemType("general");
      setSizeStandard("US");
      setAvailableSizes("");
      setProductImages([]);
      setIsVeg(false);
      setSpiceLevel("None");

      Alert.alert(
        "Saved",
        "Item added successfully.",
        [{ text: "OK", onPress: goToMenu }],
        { cancelable: true, onDismiss: goToMenu },
      );
    } catch (e) {
      derr(`(click:${clickId}) failed:`, e?.message);
      Alert.alert("Error", e?.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const PREVIEW_W = isTablet ? 320 : 270;
  const PREVIEW_H = isTablet ? 180 : 150;

  const ListHeaderComponent = useMemo(() => {
    const titleText = "Items";
    const subText = "Manage your items and availability.";
    return (
      <View style={{ marginBottom: 12 }}>
        <Text style={[styles.title, { fontSize: FS.title }]}>{titleText}</Text>
        <Text style={[styles.sub, { fontSize: FS.sub }]}>{subText}</Text>
      </View>
    );
  }, [FS.title, FS.sub]);

  const renderForm = useCallback(
    () => (
      <View>
        {/* Category */}
        <View style={styles.field}>
          <View style={styles.labelRow}>
            <Text style={[styles.label, { fontSize: FS.label }]}>Category</Text>
            <TouchableOpacity
              style={styles.labelInfoBtn}
              onPress={async () => {
                if (!category || category === "None") {
                  Alert.alert("Category", "Please select a category first.");
                  return;
                }
                setCatInfoOpen(true);
                await fetchCategoryDetails();
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Show category details"
              testID="cat-info-button"
            >
              <Ionicons
                name="information-circle-outline"
                size={18}
                color={category && category !== "None" ? "#0a0f1a" : "#94a3b8"}
              />
            </TouchableOpacity>
          </View>

          {loadingCats ? (
            <View style={[styles.pickerWrap, styles.catLoading]}>
              <ActivityIndicator />
              <Text
                style={[
                  styles.catLoadingText,
                  { fontFamily: FONT_FAMILY, fontSize: FS.small },
                ]}
              >
                Loading categories…
              </Text>
            </View>
          ) : categories.length === 0 ? (
            <View style={[styles.pickerWrap, styles.catLoading]}>
              <Ionicons name="warning-outline" size={16} color="#ef4444" />
              <Text
                style={[
                  styles.catLoadingText,
                  {
                    color: "#ef4444",
                    fontFamily: FONT_FAMILY,
                    fontSize: FS.small,
                  },
                ]}
              >
                No categories found for this business.
              </Text>
            </View>
          ) : (
            <Select
              value={category}
              onChange={handleCategoryChange}
              options={categories.map((c) => ({
                label: c.name,
                value: c.name,
              }))}
              placeholder="None"
              testID="category"
              fontSize={FS.base}
              maxVisible={6} // Add this line - shows 6 items instead of 3
            />
          )}
        </View>
        {/* Item Name */}
        <View style={styles.field}>
          <Text style={[styles.label, { fontSize: FS.label }]}>Item name</Text>
          <TextInput
            value={itemName}
            onChangeText={setItemName}
            placeholder="e.g., Toothpaste 200g"
            placeholderTextColor={PLACEHOLDER_COLOR}
            style={[
              styles.input,
              {
                fontSize: FS.base,
                fontFamily: FONT_FAMILY,
                height: INPUT_HEIGHT,
              },
            ]}
            editable={!saving}
          />
        </View>

        {/* Description */}
        <View style={styles.field}>
          <Text style={[styles.label, { fontSize: FS.label }]}>
            Description
          </Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Short description (brand, size, etc.)"
            placeholderTextColor={PLACEHOLDER_COLOR}
            style={[
              styles.input,
              styles.inputMultiline,
              { fontSize: FS.base, fontFamily: FONT_FAMILY },
            ]}
            multiline
            numberOfLines={3}
            editable={!saving}
          />
        </View>

        {/* Primary Item Image */}
        <View style={styles.field}>
          <Text style={[styles.label, { fontSize: FS.label }]}>
            Main Image (Thumbnail)
          </Text>

          {!imageUri ? (
            <View
              style={[
                styles.qrCard,
                {
                  paddingVertical: isTablet ? 24 : 18,
                  opacity: saving ? 0.6 : 1,
                },
              ]}
            >
              <Ionicons
                name="image-outline"
                size={isTablet ? 28 : 22}
                color="#64748b"
              />
              <Text
                style={[
                  styles.qrTitle,
                  { fontSize: FS.base, fontFamily: FONT_FAMILY },
                ]}
              >
                Upload main image
              </Text>
              <Text
                style={[
                  styles.qrHint,
                  { fontSize: FS.small, fontFamily: FONT_FAMILY },
                ]}
              >
                JPG or PNG • up to ~5 MB
              </Text>
              <View style={styles.qrActionsRow}>
                <TouchableOpacity
                  style={styles.qrAction}
                  onPress={takePhoto}
                  disabled={saving}
                >
                  <Ionicons name="camera-outline" size={18} color="#00b14f" />
                  <Text
                    style={[styles.qrActionText, { fontFamily: FONT_FAMILY }]}
                  >
                    Take photo
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.qrAction}
                  onPress={pickFromLibrary}
                  disabled={saving}
                >
                  <Ionicons name="images-outline" size={18} color="#00b14f" />
                  <Text
                    style={[styles.qrActionText, { fontFamily: FONT_FAMILY }]}
                  >
                    Choose from gallery
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={[styles.qrPreviewCard, saving && { opacity: 0.6 }]}>
              <View
                style={[
                  styles.previewBanner,
                  { width: PREVIEW_W, height: PREVIEW_H },
                ]}
              >
                <Image
                  source={{ uri: imageUri }}
                  resizeMode="contain"
                  style={{ width: "100%", height: "100%" }}
                />
              </View>
              <View style={styles.metaRow}>
                <Ionicons
                  name="document-text-outline"
                  size={16}
                  color="#64748b"
                />
                <Text
                  style={[
                    styles.metaText,
                    { fontFamily: FONT_FAMILY, fontSize: FS.small },
                  ]}
                  numberOfLines={1}
                >
                  {imageName || "image.jpg"}{" "}
                  {imageSize ? ` • ${formatBytes(imageSize)}` : ""}
                </Text>
              </View>
              <View style={styles.previewActionsRow}>
                <TouchableOpacity
                  style={styles.previewActionBtn}
                  onPress={() => setPreviewOpen(true)}
                  disabled={saving}
                >
                  <Ionicons name="eye-outline" size={18} color={TEXT_COLOR} />
                  <Text
                    style={[
                      styles.previewActionText,
                      { fontFamily: FONT_FAMILY, fontSize: FS.small },
                    ]}
                  >
                    View
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.previewActionBtn}
                  onPress={pickFromLibrary}
                  disabled={saving}
                >
                  <Ionicons
                    name="swap-horizontal-outline"
                    size={18}
                    color={TEXT_COLOR}
                  />
                  <Text
                    style={[
                      styles.previewActionText,
                      { fontFamily: FONT_FAMILY, fontSize: FS.small },
                    ]}
                  >
                    Replace
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.previewActionBtn}
                  onPress={removeImage}
                  disabled={saving}
                >
                  <Ionicons name="trash-outline" size={18} color="#ef4444" />
                  <Text
                    style={[
                      styles.previewActionText,
                      {
                        color: "#ef4444",
                        fontFamily: FONT_FAMILY,
                        fontSize: FS.small,
                      },
                    ]}
                  >
                    Remove
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { fontSize: FS.label }]}>
            Additional Images
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.multiImageScroll}
          >
            <View style={styles.multiImageContainer}>
              {productImages.map((img, idx) => (
                <View key={idx} style={styles.multiImageItem}>
                  <Image
                    source={{ uri: img.uri }}
                    style={styles.multiImagePreview}
                  />
                  <TouchableOpacity
                    style={styles.removeImageBtn}
                    onPress={() => removeProductImage(idx)}
                    disabled={saving}
                  >
                    <Ionicons name="close-circle" size={24} color="#ef4444" />
                  </TouchableOpacity>
                  <Text style={styles.multiImageName} numberOfLines={1}>
                    {img.name}
                  </Text>
                </View>
              ))}

              <TouchableOpacity
                style={styles.addMoreImagesBtn}
                onPress={pickMultipleImages}
                disabled={saving}
              >
                <Ionicons name="add-circle-outline" size={40} color="#00b14f" />
                <Text style={styles.addMoreImagesText}>Add Images</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

          <Text style={styles.hintText}>
            Add multiple images to showcase your product from different angles
          </Text>
        </View>

        {/* Price / Tax */}
        <View style={[styles.row, { gap: 12 }]}>
          <View style={[styles.col, { flex: 1 }]}>
            <Text style={[styles.label, { fontSize: FS.label }]}>Price</Text>
            <TextInput
              value={price}
              onChangeText={setPrice}
              keyboardType={Platform.OS === "ios" ? "decimal-pad" : "numeric"}
              placeholder="e.g., 99.00"
              placeholderTextColor={PLACEHOLDER_COLOR}
              style={[
                styles.input,
                {
                  fontSize: FS.base,
                  fontFamily: FONT_FAMILY,
                  height: INPUT_HEIGHT,
                },
              ]}
              editable={!saving}
            />
          </View>
          <View style={[styles.col, { flex: 1 }]}>
            <Text style={[styles.label, { fontSize: FS.label }]}>
              Tax rate (%)
            </Text>
            <TextInput
              value={taxRate}
              onChangeText={setTaxRate}
              keyboardType={Platform.OS === "ios" ? "decimal-pad" : "numeric"}
              placeholder="e.g., 6"
              placeholderTextColor={PLACEHOLDER_COLOR}
              style={[
                styles.input,
                {
                  fontSize: FS.base,
                  fontFamily: FONT_FAMILY,
                  height: INPUT_HEIGHT,
                },
              ]}
              editable={!saving}
            />
          </View>
        </View>

        {/* Discount (%) */}
        <View style={styles.field}>
          <Text style={[styles.label, { fontSize: FS.label }]}>
            Discount (%)
          </Text>
          <TextInput
            value={discount}
            onChangeText={setDiscount}
            keyboardType={Platform.OS === "ios" ? "decimal-pad" : "numeric"}
            placeholder="e.g., 10"
            placeholderTextColor={PLACEHOLDER_COLOR}
            style={[
              styles.input,
              {
                fontSize: FS.base,
                fontFamily: FONT_FAMILY,
                height: INPUT_HEIGHT,
              },
            ]}
            editable={!saving}
          />
        </View>

        {/* Availability / Stock / Sort */}
        <View
          style={[
            styles.row,
            {
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 10,
            },
          ]}
        >
          <View style={styles.switchRow}>
            <Text
              style={[styles.label, { marginRight: 8, fontSize: FS.label }]}
            >
              Is available
            </Text>
            <Switch
              value={isAvailable}
              onValueChange={setIsAvailable}
              disabled={saving}
            />
          </View>
        </View>

        <View style={[styles.row, { gap: 12 }]}>
          <View style={[styles.col, { flex: 1 }]}>
            <Text style={[styles.label, { fontSize: FS.label }]}>Stock</Text>
            <TextInput
              value={stockLimit}
              onChangeText={setStockLimit}
              keyboardType={Platform.OS === "ios" ? "number-pad" : "numeric"}
              placeholder="e.g., 50"
              placeholderTextColor={PLACEHOLDER_COLOR}
              style={[
                styles.input,
                {
                  fontSize: FS.base,
                  fontFamily: FONT_FAMILY,
                  height: INPUT_HEIGHT,
                },
              ]}
              editable={!saving}
            />
          </View>

          <View style={[styles.col, { flex: 1 }]}>
            <Text style={[styles.label, { fontSize: FS.label }]}>
              Sort priority
            </Text>
            <Select
              value={sortPriority}
              onChange={setSortPriority}
              options={[
                { label: "None", value: "None" },
                { label: "High", value: "high" },
                { label: "Medium", value: "medium" },
                { label: "Low", value: "low" },
              ]}
              placeholder="None"
              testID="sort"
              fontSize={FS.base}
            />
          </View>
        </View>

        {showSizeFields && (
          <>
            <View style={styles.field}>
              <Text style={[styles.label, { fontSize: FS.label }]}>
                Size Standard
              </Text>
              <SizeStandardPicker
                value={sizeStandard}
                onChange={setSizeStandard}
                enabled={!saving}
                fontSize={FS.base}
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { fontSize: FS.label }]}>
                Available Sizes (comma-separated)
              </Text>
              <TextInput
                value={availableSizes}
                onChangeText={setAvailableSizes}
                placeholder="e.g., S,M,L,XL,XXL or 7,8,9,10,11"
                placeholderTextColor={PLACEHOLDER_COLOR}
                style={[
                  styles.input,
                  {
                    fontSize: FS.base,
                    fontFamily: FONT_FAMILY,
                    height: INPUT_HEIGHT,
                  },
                ]}
                editable={!saving}
              />
              <Text style={styles.hintText}>
                Enter sizes separated by commas (e.g., S,M,L or 7,8,9,10)
              </Text>
            </View>
          </>
        )}

        {/* Buttons */}
        <View style={[styles.row, { marginTop: 16, gap: 12 }]}>
          <TouchableOpacity
            style={[
              styles.primaryBtn,
              {
                paddingVertical: isTablet ? 14 : 12,
                opacity: saving ? 0.8 : 1,
              },
            ]}
            onPress={onSave}
            activeOpacity={0.9}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons
                  name="save-outline"
                  size={isTablet ? 20 : 18}
                  color="#fff"
                />
                <Text
                  style={[
                    styles.primaryBtnText,
                    { fontSize: FS.base, fontFamily: FONT_FAMILY },
                  ]}
                >
                  Save item
                </Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.secondaryBtn,
              { paddingVertical: isTablet ? 14 : 12 },
            ]}
            onPress={goToMenu}
            activeOpacity={0.9}
            disabled={saving}
          >
            <Ionicons
              name="list-outline"
              size={isTablet ? 20 : 18}
              color={TEXT_COLOR}
            />
            <Text
              style={[
                styles.secondaryBtnText,
                { fontSize: FS.base, fontFamily: FONT_FAMILY },
              ]}
            >
              Open items
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    ),
    [
      FS,
      itemType,
      itemName,
      description,
      imageUri,
      imageName,
      imageSize,
      isTablet,
      price,
      taxRate,
      discount,
      isAvailable,
      stockLimit,
      sortPriority,
      category,
      categories,
      loadingCats,
      saving,
      productImages,
      sizeStandard,
      availableSizes,
      isVeg,
      spiceLevel,
      onSave,
      fetchCategoryDetails,
      goToMenu,
    ],
  );

  return (
    <>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Math.max(0, (headerHeight || 0) + -8)}
      >
        <FlatList
          data={[{ key: "form" }]}
          keyExtractor={(it) => it.key}
          renderItem={() => renderForm()}
          ListHeaderComponent={ListHeaderComponent}
          contentContainerStyle={{
            paddingBottom: kbHeight ? kbHeight - 8 : 32,
            paddingHorizontal: isTablet ? 20 : 16,
            paddingTop: 16,
          }}
          automaticallyAdjustKeyboardInsets
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          removeClippedSubviews={false}
          nestedScrollEnabled={false}
          scrollIndicatorInsets={{ bottom: Math.max(0, kbHeight - 8) }}
          contentInset={{ bottom: 0 }}
        />
      </KeyboardAvoidingView>

      {/* Preview Modal */}
      <Modal visible={previewOpen} animationType="fade" transparent>
        <TouchableWithoutFeedback onPress={() => setPreviewOpen(false)}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback>
              <View style={styles.modalCard}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Preview</Text>
                  <TouchableOpacity onPress={() => setPreviewOpen(false)}>
                    <Ionicons name="close" size={22} color={TEXT_COLOR} />
                  </TouchableOpacity>
                </View>
                <View style={styles.modalImageWrap}>
                  {imageUri ? (
                    <Image
                      source={{ uri: imageUri }}
                      resizeMode="contain"
                      style={{ width: "100%", height: "100%" }}
                    />
                  ) : null}
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Category Info Overlay */}
      <Modal
        visible={catInfoOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setCatInfoOpen(false)}
      >
        <TouchableWithoutFeedback onPress={() => setCatInfoOpen(false)}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback>
              <View style={styles.catInfoCard}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Category details</Text>
                  <TouchableOpacity onPress={() => setCatInfoOpen(false)}>
                    <Ionicons name="close" size={22} color={TEXT_COLOR} />
                  </TouchableOpacity>
                </View>

                <View
                  style={{
                    paddingHorizontal: 16,
                    paddingBottom: 16,
                    minHeight: 96,
                    justifyContent: "center",
                  }}
                >
                  {catInfoLoading ? (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <ActivityIndicator />
                      <Text
                        style={{ color: "#475569", fontFamily: FONT_FAMILY }}
                      >
                        Loading details…
                      </Text>
                    </View>
                  ) : catInfoError ? (
                    <Text style={{ color: "#ef4444", fontFamily: FONT_FAMILY }}>
                      {catInfoError}
                    </Text>
                  ) : (
                    <>
                      <Text style={styles.infoTitle}>
                        {catInfoData?.name ?? category ?? "—"}
                      </Text>
                      <Text style={styles.infoDesc}>
                        {catInfoData?.description?.trim()
                          ? catInfoData.description
                          : "No description available for this category."}
                      </Text>
                    </>
                  )}
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Saving overlay loader */}
      <Modal visible={saving} animationType="fade" transparent>
        <View style={styles.loaderOverlay}>
          <View style={styles.loaderCard}>
            <ActivityIndicator size="large" />
            <Text style={styles.loaderText}>Saving…</Text>
          </View>
        </View>
      </Modal>
    </>
  );
}

/* ───────────────────────── Styles ───────────────────────── */
const styles = StyleSheet.create({
  wrap: { paddingTop: 16 },
  title: { fontWeight: "700", color: TEXT_COLOR, fontFamily: FONT_FAMILY },
  sub: { color: "#64748b", marginTop: 6, fontFamily: FONT_FAMILY },

  field: { marginTop: 14 },
  label: { color: TEXT_COLOR, fontWeight: "600", fontFamily: FONT_FAMILY },

  labelRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  labelInfoBtn: { padding: 2 },

  input: {
    marginTop: 8,
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  inputMultiline: { minHeight: 84, textAlignVertical: "top" },

  // Type selector
  typeSelector: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  typeButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
    alignItems: "center",
  },
  typeButtonActive: {
    backgroundColor: "#00b14f",
    borderColor: "#00b14f",
  },
  typeButtonText: {
    color: TEXT_COLOR,
    fontWeight: "600",
    fontSize: 13,
  },
  typeButtonTextActive: {
    color: "#fff",
  },

  // Uploader
  qrCard: {
    marginTop: 8,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#cbd5e1",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    backgroundColor: "#ffffff",
  },
  qrTitle: { marginTop: 8, color: TEXT_COLOR, fontWeight: "700" },
  qrHint: { marginTop: 4, color: "#64748b" },
  qrActionsRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  qrAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#ecfdf3",
    borderWidth: 1,
    borderColor: "#bbf7d0",
  },
  qrActionText: { color: "#065f46", fontWeight: "700", fontSize: 13 },

  qrPreviewCard: {
    marginTop: 8,
    padding: 10,
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  previewBanner: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignSelf: "center",
    padding: 8,
    overflow: "hidden",
  },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  metaText: { color: "#475569", flexShrink: 1 },

  previewActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
  },
  previewActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  previewActionText: { color: TEXT_COLOR, fontWeight: "700" },

  // Multi-image styles
  multiImageScroll: {
    marginTop: 8,
  },
  multiImageContainer: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 4,
  },
  multiImageItem: {
    width: 100,
    position: "relative",
  },
  multiImagePreview: {
    width: 100,
    height: 100,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  removeImageBtn: {
    position: "absolute",
    top: -8,
    right: -8,
    backgroundColor: "#fff",
    borderRadius: 12,
  },
  multiImageName: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 4,
    textAlign: "center",
  },
  addMoreImagesBtn: {
    width: 100,
    height: 100,
    borderRadius: 8,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#cbd5e1",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fafc",
  },
  addMoreImagesText: {
    fontSize: 12,
    color: "#00b14f",
    marginTop: 4,
    textAlign: "center",
  },
  hintText: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 4,
    fontFamily: FONT_FAMILY,
    marginBottom: 10,
  },

  // Rows
  row: { flexDirection: "row", alignItems: "flex-start" },
  col: {},
  switchRow: { flexDirection: "row", alignItems: "center" },

  // Select
  pickerWrap: {
    marginTop: 8,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    height: INPUT_HEIGHT,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  pickerText: { fontFamily: FONT_FAMILY, includeFontPadding: false },

  catLoading: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    height: INPUT_HEIGHT,
    gap: 10,
  },
  catLoadingText: { color: "#475569" },

  // Buttons
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#00b14f",
    paddingHorizontal: 16,
    borderRadius: 999,
    alignSelf: "flex-start",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  primaryBtnText: { color: "#fff", fontWeight: "800" },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 16,
    borderRadius: 999,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  secondaryBtnText: { color: TEXT_COLOR, fontWeight: "800" },

  // Modals
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 560,
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
  },
  modalHeader: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalTitle: { fontWeight: "700", color: TEXT_COLOR, fontSize: 16 },
  modalImageWrap: {
    width: "100%",
    height: 360,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },

  // Dropdown
  overlayBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.12)" },
  dropdownCard: {
    position: "absolute",
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    overflow: "hidden",
  },
  dropdownItem: {
    height: INPUT_HEIGHT,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dropdownSeparator: { height: 1, backgroundColor: "#e2e8f0" },
  dropdownText: { fontFamily: FONT_FAMILY },

  // Category info
  catInfoCard: {
    width: "100%",
    maxWidth: 560,
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
  },
  infoTitle: {
    fontFamily: FONT_FAMILY,
    color: TEXT_COLOR,
    fontWeight: "700",
    fontSize: 16,
    marginTop: 8,
    marginBottom: 8,
  },
  infoDesc: {
    fontFamily: FONT_FAMILY,
    color: "#475569",
    fontSize: 14,
    lineHeight: 20,
  },

  // Loader
  loaderOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  loaderCard: {
    backgroundColor: "#fff",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    gap: 10,
    minWidth: 140,
  },
  loaderText: { color: TEXT_COLOR, fontWeight: "700" },
});
