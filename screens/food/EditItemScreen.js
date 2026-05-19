// screens/food/EditItemScreen.js (Final version with working crop)

import React, {
  useState,
  useLayoutEffect,
  useEffect,
  useCallback,
  useRef,
} from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Image,
  Pressable,
  Alert,
  Switch,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  ActivityIndicator,
  LogBox,
  Modal,
  TouchableOpacity,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import * as SecureStore from "expo-secure-store";
import * as ImageManipulator from "expo-image-manipulator";
import {
  DISPLAY_ITEM_ENDPOINT as ENV_DISPLAY_ITEM_ENDPOINT,
  DISPLAY_MENU_ENDPOINT as ENV_DISPLAY_MENU_ENDPOINT,
  ITEM_ENDPOINT as ENV_ITEM_ENDPOINT,
  MENU_ENDPOINT as ENV_MENU_ENDPOINT,
  ITEM_IMAGE_ENDPOINT as ENV_ITEM_IMAGE_ENDPOINT,
  MENU_IMAGE_ENDPOINT as ENV_MENU_IMAGE_ENDPOINT,
  CATEGORY_ENDPOINT as ENV_CATEGORY_ENDPOINT,
} from "@env";

LogBox.ignoreLogs([
  "Non-serializable values were found in the navigation state",
]);

const isLocalUri = (u) => !!u && !/^https?:\/\//i.test(String(u));

const absJoin = (base, raw) => {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  const baseNorm = String((base || "").replace(/\/+$/, ""));
  let path = s.startsWith("/") ? s : `/${s}`;
  return `${baseNorm}${path}`.replace(/([^:]\/)\/+/g, "$1");
};

const getFullImageUrl = (path, baseUrl) => {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  const cleanPath = path.startsWith("/") ? path.substring(1) : path;
  return `${baseUrl}/${cleanPath}`;
};

function SizeStandardPicker({ value, onChange, fontSize = 14 }) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const wrapRef = useRef(null);

  const options = [
    { label: "US (American)", value: "US" },
    { label: "UK (British)", value: "UK" },
    { label: "EU (European)", value: "EU" },
    { label: "JP (Japanese)", value: "JP" },
  ];

  const isNone = !value || value === "";
  const shown = isNone
    ? "Select size standard"
    : options.find((o) => o.value === value)?.label || value;

  const measure = () =>
    wrapRef.current?.measureInWindow((x, y, w, h) => setAnchor({ x, y, w, h }));
  const openMenu = () => {
    measure();
    setOpen(true);
  };
  const selectAndClose = (v) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <>
      <Pressable
        ref={wrapRef}
        onPress={openMenu}
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
            style={[
              styles.pickerText,
              { color: isNone ? "#94a3b8" : "#0f172a", fontSize },
            ]}
          >
            {shown}
          </Text>
          <Ionicons
            name={open ? "chevron-up" : "chevron-down"}
            size={18}
            color={isNone ? "#94a3b8" : "#0f172a"}
          />
        </View>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onShow={measure}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setOpen(false)}
        >
          <View
            style={[
              styles.dropdownCard,
              { left: anchor.x, top: anchor.y + anchor.h, width: anchor.w },
            ]}
          >
            {options.map((option, idx) => (
              <TouchableOpacity
                key={idx}
                onPress={() => selectAndClose(option.value)}
                style={styles.dropdownItem}
              >
                <Text
                  style={[
                    styles.dropdownText,
                    value === option.value && {
                      color: "#00b14f",
                      fontWeight: "700",
                    },
                  ]}
                >
                  {option.label}
                </Text>
                {value === option.value && (
                  <Ionicons name="checkmark" size={18} color="#00b14f" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

function Select({
  value,
  options,
  onChange,
  placeholder = "None",
  fontSize = 14,
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const wrapRef = useRef(null);

  const isNone = !value || value === "" || value === "None";
  const shown = isNone
    ? placeholder
    : options.find((o) => o.value === value)?.label || value;

  const measure = () =>
    wrapRef.current?.measureInWindow((x, y, w, h) => setAnchor({ x, y, w, h }));
  const openMenu = () => {
    measure();
    setOpen(true);
  };
  const selectAndClose = (v) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <>
      <Pressable
        ref={wrapRef}
        onPress={openMenu}
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
            style={[
              styles.pickerText,
              { color: isNone ? "#94a3b8" : "#0f172a", fontSize },
            ]}
          >
            {shown}
          </Text>
          <Ionicons
            name={open ? "chevron-up" : "chevron-down"}
            size={18}
            color={isNone ? "#94a3b8" : "#0f172a"}
          />
        </View>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onShow={measure}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setOpen(false)}
        >
          <View
            style={[
              styles.dropdownCard,
              {
                left: anchor.x,
                top: anchor.y + anchor.h,
                width: anchor.w,
                maxHeight: 300,
              },
            ]}
          >
            <ScrollView nestedScrollEnabled>
              {options.map((option, idx) => (
                <TouchableOpacity
                  key={idx}
                  onPress={() => selectAndClose(option.value)}
                  style={styles.dropdownItem}
                >
                  <Text
                    style={[
                      styles.dropdownText,
                      value === option.value && {
                        color: "#00b14f",
                        fontWeight: "700",
                      },
                    ]}
                  >
                    {option.label}
                  </Text>
                  {value === option.value && (
                    <Ionicons name="checkmark" size={18} color="#00b14f" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

// Simple working crop modal with fixed ratio
const SimpleCropModal = ({ visible, imageUri, onCrop, onCancel }) => {
  const [cropSize, setCropSize] = useState({ width: 250, height: 250 });

  const applyCrop = async () => {
    try {
      const result = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ resize: { width: 800, height: 800 } }],
        { compress: 0.8 },
      );
      onCrop(result.uri);
    } catch (error) {
      console.error("Error:", error);
      onCrop(imageUri);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent={true} animationType="slide">
      <View style={styles.cropModalContainer}>
        <View style={styles.cropModalHeader}>
          <Text style={styles.cropModalTitle}>Crop Image</Text>
          <TouchableOpacity onPress={onCancel}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.cropImageContainer}>
          {imageUri && (
            <View style={styles.cropImageWrapper}>
              <Image
                source={{ uri: imageUri }}
                style={styles.cropImagePreview}
                resizeMode="contain"
              />
              <View style={styles.cropOverlayBox}>
                <View style={styles.cropFrame}>
                  <View style={styles.cropCornerTL} />
                  <View style={styles.cropCornerTR} />
                  <View style={styles.cropCornerBL} />
                  <View style={styles.cropCornerBR} />
                </View>
              </View>
            </View>
          )}
        </View>

        <View style={styles.cropActions}>
          <TouchableOpacity style={styles.cropButtonCancel} onPress={onCancel}>
            <Text style={styles.cropButtonCancelText}>Use Original</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cropButtonSave} onPress={applyCrop}>
            <Text style={styles.cropButtonSaveText}>Apply Crop</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

export default function EditItemScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const item = route.params?.item;
  const businessId = route.params?.businessId;
  const ownerType = route.params?.ownerType || "food";
  const isMart = ownerType === "mart";

  const IMAGE_BASE_URL = isMart
    ? ENV_ITEM_IMAGE_ENDPOINT
    : ENV_MENU_IMAGE_ENDPOINT;

  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(
    item?.category || "",
  );
  const [businessTypeMap, setBusinessTypeMap] = useState({});
  const [showSizeFields, setShowSizeFields] = useState(false);

  const MODIFY_ENDPOINT =
    (isMart ? ENV_ITEM_ENDPOINT : ENV_MENU_ENDPOINT)?.replace(/\/$/, "") || "";
  const CATEGORY_ENDPOINT = ENV_CATEGORY_ENDPOINT?.replace(/\/$/, "") || "";

  const [cropModalVisible, setCropModalVisible] = useState(false);
  const [tempImageUri, setTempImageUri] = useState("");
  const [pendingCropCallback, setPendingCropCallback] = useState(null);

  const [nameHeight, setNameHeight] = useState(50);
  const [descHeight, setDescHeight] = useState(100);

  const parseMainImage = () => {
    if (item?.mainImage && isLocalUri(item.mainImage)) return item.mainImage;
    if (item?.image && isLocalUri(item.image)) return item.image;
    if (item?.item_image)
      return getFullImageUrl(item.item_image, IMAGE_BASE_URL);
    if (item?.image_url) return getFullImageUrl(item.image_url, IMAGE_BASE_URL);
    return item?.image || item?.mainImage || "";
  };

  const parseAdditionalImages = () => {
    if (!isMart) return [];
    if (item?.additionalImages && item.additionalImages.length > 0)
      return item.additionalImages;
    if (item?.images && item.images.length > 0) {
      const mainImg = parseMainImage();
      if (mainImg) return item.images.filter((img) => img !== mainImg);
      return item.images;
    }
    if (item?.product_info?.product_images) {
      const images = item.product_info.product_images
        .split(",")
        .map((img) => getFullImageUrl(img.trim(), IMAGE_BASE_URL));
      const mainImg = parseMainImage();
      if (mainImg) return images.filter((img) => img !== mainImg);
      return images.slice(1);
    }
    return [];
  };

  const [form, setForm] = useState({
    id: item?.id || null,
    name: item?.name || item?.item_name || "",
    category: item?.category || item?.category_name || "",
    price: String(item?.price || item?.actual_price || ""),
    discount: String(item?.discount || item?.discount_percentage || ""),
    taxRate: String(item?.taxRate || item?.tax_rate || ""),
    currency: item?.currency || "BTN",
    inStock: item?.inStock ?? item?.is_available === 1,
    mainImage: parseMainImage(),
    additionalImages: parseAdditionalImages(),
    description: item?.description || "",
    productInfo: item?.productInfo || item?.product_info || null,
    isVeg: item?.isVeg ?? item?.is_veg === 1,
    spiceLevel: item?.spiceLevel || item?.spice_level || "None",
    sizeStandard: item?.sizeStandard || item?.size_standard || "US",
    availableSizes: item?.availableSizes || item?.available_sizes || "",
  });

  const [loading, setLoading] = useState(false);
  const SPICE_OPTIONS = ["None", "Mild", "Medium", "Hot"];

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
      animation: "slide_from_right",
      gestureEnabled: true,
    });
  }, [navigation]);

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

  useEffect(() => {
    if (businessId && CATEGORY_ENDPOINT && isMart) fetchCategoriesFromAPI();
    else if (!isMart) {
      setCategories([]);
      setCategoriesLoading(false);
    }
  }, [businessId, isMart]);

  useEffect(() => {
    const itemIdParam = route.params?.itemId;
    if (itemIdParam && businessId && !item) fetchItemForEditing();
  }, [route.params?.itemId, businessId]);

  const fetchItemForEditing = async () => {
    setLoading(true);
    try {
      const token = await SecureStore.getItemAsync("auth_token");
      const DISPLAY_ENDPOINT = isMart
        ? ENV_DISPLAY_ITEM_ENDPOINT
        : ENV_DISPLAY_MENU_ENDPOINT;
      const url = `${DISPLAY_ENDPOINT}/${businessId}`;
      const response = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await response.json();
      if (data.success && data.data) {
        const foundItem = data.data.find(
          (i) => i.id === parseInt(route.params?.itemId),
        );
        if (foundItem) {
          const mainImageUrl = getFullImageUrl(
            foundItem.item_image,
            IMAGE_BASE_URL,
          );
          let additionalImagesArray = [];
          if (foundItem.product_info?.product_images) {
            const allImages = foundItem.product_info.product_images
              .split(",")
              .map((img) => getFullImageUrl(img.trim(), IMAGE_BASE_URL));
            additionalImagesArray = allImages.filter(
              (img) => img !== mainImageUrl,
            );
          }
          setForm({
            id: foundItem.id,
            name: foundItem.item_name,
            category: foundItem.category_name,
            price: String(foundItem.actual_price),
            discount: String(foundItem.discount_percentage || ""),
            taxRate: String(foundItem.tax_rate || ""),
            currency: "BTN",
            inStock: foundItem.is_available === 1,
            mainImage: mainImageUrl,
            additionalImages: additionalImagesArray,
            description: foundItem.description || "",
            productInfo: foundItem.product_info,
            isVeg: foundItem.is_veg === 1,
            spiceLevel: foundItem.spice_level || "None",
            sizeStandard: foundItem.product_info?.size_standard || "US",
            availableSizes: foundItem.product_info?.available_sizes || "",
          });
        }
      }
    } catch (error) {
      console.error("Error:", error);
      Alert.alert("Error", "Could not load item details");
    } finally {
      setLoading(false);
    }
  };

  const fetchCategoriesFromAPI = async () => {
    setCategoriesLoading(true);
    try {
      const token = await SecureStore.getItemAsync("auth_token");
      const url = `${CATEGORY_ENDPOINT}/${businessId}`;
      const response = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const allCategories = [];
      const businessTypeMapping = {};
      if (data.types && Array.isArray(data.types)) {
        data.types.forEach((type) => {
          const businessTypeName = type.business_type_name || "";
          if (type.categories && Array.isArray(type.categories)) {
            type.categories.forEach((category) => {
              const categoryId = String(
                category.id ?? category.category_id ?? "",
              );
              if (category.category_name) {
                allCategories.push(category.category_name);
                if (categoryId)
                  businessTypeMapping[categoryId] = businessTypeName;
              }
            });
          }
        });
      }
      const uniqueCategories = [...new Set(allCategories)].sort((a, b) =>
        a.localeCompare(b),
      );
      setBusinessTypeMap(businessTypeMapping);
      if (uniqueCategories.length > 0) {
        setCategories(uniqueCategories);
        if (!form.category && uniqueCategories.length > 0) {
          setSelectedCategory(uniqueCategories[0]);
          setForm((f) => ({ ...f, category: uniqueCategories[0] }));
        }
      } else setCategories([]);
    } catch (error) {
      console.error("Category fetch error:", error);
      setCategories([]);
    } finally {
      setCategoriesLoading(false);
    }
  };

  const selectCategory = (category) => {
    setSelectedCategory(category);
    setForm((f) => ({ ...f, category }));
    setCategoryModalVisible(false);
  };

  const pickMainImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow photo library access.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      quality: 0.9,
    });
    if (!result.canceled && result.assets?.[0]) {
      setForm((f) => ({ ...f, mainImage: result.assets[0].uri }));
    }
  };

  const takeMainImagePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow camera access.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.9,
    });
    if (!result.canceled && result.assets?.[0]) {
      setForm((f) => ({ ...f, mainImage: result.assets[0].uri }));
    }
  };

  const removeMainImage = () => setForm((f) => ({ ...f, mainImage: "" }));

  const addAdditionalImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow photo library access.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      allowsMultipleSelection: true,
      quality: 0.9,
    });
    if (!result.canceled && result.assets?.length) {
      const newImages = result.assets.map((asset) => asset.uri);
      setForm((f) => ({
        ...f,
        additionalImages: [...f.additionalImages, ...newImages],
      }));
    }
  };

  const takeAdditionalImagePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow camera access.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.9,
    });
    if (!result.canceled && result.assets?.[0]) {
      setForm((f) => ({
        ...f,
        additionalImages: [...f.additionalImages, result.assets[0].uri],
      }));
    }
  };

  const removeAdditionalImage = (index) => {
    Alert.alert("Remove Image", "Remove this image?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () =>
          setForm((f) => ({
            ...f,
            additionalImages: f.additionalImages.filter((_, i) => i !== index),
          })),
      },
    ]);
  };

  const saveItem = async () => {
    const priceNum = Number(form.price);
    const discountNum = form.discount === "" ? "" : Number(form.discount);
    const taxNum = form.taxRate === "" ? "" : Number(form.taxRate);

    if (!form.name.trim()) {
      Alert.alert(
        "Name required",
        `Please enter ${isMart ? "an item" : "a menu item"} name.`,
      );
      return;
    }
    if (Number.isNaN(priceNum)) {
      Alert.alert("Invalid price", "Please enter a numeric price.");
      return;
    }
    if (!form.category) {
      Alert.alert("Category required", "Please select a category.");
      return;
    }
    if (showSizeFields && !form.availableSizes.trim()) {
      Alert.alert("Validation", "Please enter available sizes.");
      return;
    }

    setLoading(true);
    try {
      const token = await SecureStore.getItemAsync("auth_token");
      const url = `${MODIFY_ENDPOINT}/${encodeURIComponent(form.id)}`;
      const fd = new FormData();
      fd.append("id", String(form.id));
      fd.append("business_id", String(businessId));
      fd.append("owner_type", isMart ? "2" : "1");
      fd.append("service", isMart ? "mart" : "food");
      fd.append("item_name", form.name.trim());
      fd.append("category", form.category);
      fd.append("category_name", form.category);
      fd.append("actual_price", String(priceNum));
      fd.append("is_available", form.inStock ? "1" : "0");
      if (discountNum !== "" && discountNum !== null)
        fd.append("discount_percentage", String(discountNum));
      if (taxNum !== "" && taxNum !== null)
        fd.append("tax_rate", String(taxNum));
      if (form.description) fd.append("description", form.description);
      if (!isMart) {
        fd.append("is_veg", form.isVeg ? "1" : "0");
        if (form.spiceLevel && form.spiceLevel !== "None")
          fd.append("spice_level", form.spiceLevel);
      }
      if (showSizeFields) {
        if (form.sizeStandard) fd.append("size_standard", form.sizeStandard);
        if (form.availableSizes)
          fd.append("available_sizes", form.availableSizes);
      }
      if (form.mainImage && isLocalUri(form.mainImage)) {
        const lower = form.mainImage.toLowerCase();
        const isPng = lower.endsWith(".png");
        fd.append("item_image", {
          uri: form.mainImage,
          name: `upload_${Date.now()}.${isPng ? "png" : "jpg"}`,
          type: isPng ? "image/png" : "image/jpeg",
        });
      } else if (form.mainImage && !isLocalUri(form.mainImage)) {
        fd.append("item_image_url", form.mainImage);
      }
      const existingImageUrls = form.additionalImages.filter(
        (img) => !isLocalUri(img),
      );
      const newLocalImages = form.additionalImages.filter((img) =>
        isLocalUri(img),
      );
      if (existingImageUrls.length > 0)
        fd.append("product_images", existingImageUrls.join(","));
      for (let i = 0; i < newLocalImages.length; i++) {
        const img = newLocalImages[i];
        const lower = img.toLowerCase();
        const isPng = lower.endsWith(".png");
        fd.append("product_images", {
          uri: img,
          name: `upload_${Date.now()}_${i}.${isPng ? "png" : "jpg"}`,
          type: isPng ? "image/png" : "image/jpeg",
        });
      }
      const res = await fetch(url, {
        method: "PUT",
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: fd,
      });
      const text = await res.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {}
      if (!res.ok)
        throw new Error(json?.message || text || `HTTP ${res.status}`);

      let updatedMainImage = form.mainImage;
      let updatedAdditionalImages = form.additionalImages;
      if (json) {
        const responseImage =
          json?.item_image || json?.image_url || json?.image;
        if (responseImage)
          updatedMainImage = responseImage.startsWith("http")
            ? responseImage
            : getFullImageUrl(responseImage, IMAGE_BASE_URL);
        const responseImages = json?.product_images || json?.additional_images;
        if (responseImages) {
          const imageArray =
            typeof responseImages === "string"
              ? responseImages.split(",").map((img) => img.trim())
              : responseImages;
          updatedAdditionalImages = imageArray.map((img) =>
            img.startsWith("http") ? img : getFullImageUrl(img, IMAGE_BASE_URL),
          );
        }
      }
      const updatedItem = {
        ...form,
        id: form.id,
        name: form.name,
        price: priceNum,
        inStock: form.inStock,
        category: form.category,
        description: form.description,
        mainImage: updatedMainImage,
        additionalImages: updatedAdditionalImages,
        images: [updatedMainImage, ...updatedAdditionalImages],
        isVeg: form.isVeg,
        spiceLevel: form.spiceLevel,
      };
      if (route.params?.onItemUpdated) route.params.onItemUpdated(updatedItem);
      Alert.alert(
        "Success",
        `${isMart ? "Item" : "Menu item"} updated successfully!`,
      );
      navigation.goBack();
    } catch (e) {
      Alert.alert(
        "Update failed",
        String(e?.message || "Could not update the item."),
      );
    } finally {
      setLoading(false);
    }
  };

  const CategorySelectorModal = () => (
    <Modal visible={categoryModalVisible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Category</Text>
            <TouchableOpacity onPress={() => setCategoryModalVisible(false)}>
              <Ionicons name="close" size={24} color="#0f172a" />
            </TouchableOpacity>
          </View>
          {categories.length > 0 ? (
            <ScrollView style={styles.modalList}>
              {categories.map((category, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.modalListItem,
                    selectedCategory === category && styles.modalListItemActive,
                  ]}
                  onPress={() => selectCategory(category)}
                >
                  <Text
                    style={[
                      styles.modalListItemText,
                      selectedCategory === category &&
                        styles.modalListItemTextActive,
                    ]}
                  >
                    {category}
                  </Text>
                  {selectedCategory === category && (
                    <Ionicons
                      name="checkmark-circle"
                      size={22}
                      color="#00b14f"
                    />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.modalEmpty}>
              <Ionicons name="folder-open-outline" size={48} color="#cbd5e1" />
              <Text style={styles.modalEmptyText}>No categories available</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );

  const MainImagePicker = () => (
    <>
      <Text style={styles.label}>Main Image (Thumbnail)</Text>
      {form.mainImage ? (
        <View style={styles.singleImageWrapper}>
          <Image
            source={{ uri: form.mainImage }}
            style={styles.singleImage}
            resizeMode="cover"
          />
          <Pressable
            style={styles.removeSingleImageBtn}
            onPress={removeMainImage}
          >
            <Ionicons name="close-circle" size={24} color="#ef4444" />
          </Pressable>
        </View>
      ) : (
        <View style={styles.noImageContainer}>
          <Ionicons name="image-outline" size={40} color="#64748b" />
          <Text style={styles.noImageText}>No main image selected</Text>
        </View>
      )}
      <View style={styles.imageActionRow}>
        <Pressable
          style={[styles.imageActionBtn, styles.btnGhost]}
          onPress={takeMainImagePhoto}
        >
          <Ionicons name="camera-outline" size={18} color="#0f172a" />
          <Text style={styles.imageActionText}>Take Photo</Text>
        </Pressable>
        <Pressable
          style={[styles.imageActionBtn, styles.btnPrimary]}
          onPress={pickMainImage}
        >
          <Ionicons name="images-outline" size={18} color="#fff" />
          <Text style={styles.imageActionTextWhite}>Choose from Gallery</Text>
        </Pressable>
      </View>
    </>
  );

  const AdditionalImagesPicker = () => (
    <>
      <Text style={styles.label}>Additional Images</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.galleryScrollContent}
      >
        {form.additionalImages.map((img, index) => (
          <View key={index} style={styles.galleryImageWrapper}>
            <Image source={{ uri: img }} style={styles.galleryImage} />
            <Pressable
              style={styles.removeImageBtn}
              onPress={() => removeAdditionalImage(index)}
            >
              <Ionicons name="close-circle" size={24} color="#ef4444" />
            </Pressable>
            <View style={styles.imageIndex}>
              <Text style={styles.imageIndexText}>{index + 1}</Text>
            </View>
          </View>
        ))}
        <Pressable style={styles.addImageBtn} onPress={addAdditionalImage}>
          <Ionicons name="add" size={32} color="#64748b" />
          <Text style={styles.addImageText}>Add Image</Text>
        </Pressable>
      </ScrollView>
      <View style={styles.imageActionRow}>
        <Pressable
          style={[styles.imageActionBtn, styles.btnGhost]}
          onPress={takeAdditionalImagePhoto}
        >
          <Ionicons name="camera-outline" size={18} color="#0f172a" />
          <Text style={styles.imageActionText}>Take Photo</Text>
        </Pressable>
        <Pressable
          style={[styles.imageActionBtn, styles.btnGhost]}
          onPress={addAdditionalImage}
        >
          <Ionicons name="images-outline" size={18} color="#0f172a" />
          <Text style={styles.imageActionText}>Choose from Gallery</Text>
        </Pressable>
      </View>
    </>
  );

  if (categoriesLoading && isMart) {
    return (
      <SafeAreaView style={styles.safe}>
        <View
          style={[styles.header, { paddingTop: Math.max(insets.top, 8) + 10 }]}
        >
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
          >
            <Ionicons name="arrow-back" size={22} color="#0f172a" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            Edit {isMart ? "Item" : "Menu Item"}
          </Text>
          <View style={styles.headerActions} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#00b14f" />
          <Text style={styles.loadingText}>Loading categories...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right"]}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="dark-content"
      />
      <View
        style={[styles.header, { paddingTop: Math.max(insets.top, 8) + 10 }]}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={22} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          Edit {isMart ? "Item" : "Menu Item"}
        </Text>
        <View style={styles.headerActions} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.form}>
            <Text style={styles.label}>Category *</Text>
            <Pressable
              style={styles.categorySelector}
              onPress={() => setCategoryModalVisible(true)}
            >
              <Text style={styles.categorySelectorText}>
                {form.category || "Select Category"}
              </Text>
              <Ionicons name="chevron-down" size={20} color="#64748b" />
            </Pressable>

            <Text style={styles.label}>Name *</Text>
            <TextInput
              value={form.name}
              onChangeText={(t) => setForm((f) => ({ ...f, name: t }))}
              placeholder={
                isMart ? "e.g., Toothpaste 200g" : "e.g., Chicken Rice"
              }
              style={[styles.input, { height: Math.max(50, nameHeight) }]}
              multiline
              textAlignVertical="top"
              onContentSizeChange={(e) =>
                setNameHeight(e.nativeEvent.contentSize.height)
              }
            />

            <View style={styles.row2}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Price *</Text>
                <TextInput
                  value={String(form.price)}
                  onChangeText={(t) =>
                    setForm((f) => ({ ...f, price: t.replace(/,/g, ".") }))
                  }
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  style={styles.input}
                />
              </View>
              <View style={{ width: 100 }}>
                <Text style={styles.label}>Currency</Text>
                <TextInput
                  value={form.currency}
                  onChangeText={(t) =>
                    setForm((f) => ({
                      ...f,
                      currency: t.trim().slice(0, 4) || "BTN",
                    }))
                  }
                  placeholder="BTN"
                  style={styles.input}
                />
              </View>
            </View>

            <View style={styles.row2}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Tax Rate (%)</Text>
                <TextInput
                  value={String(form.taxRate)}
                  onChangeText={(t) =>
                    setForm((f) => ({ ...f, taxRate: t.replace(/,/g, ".") }))
                  }
                  keyboardType="decimal-pad"
                  placeholder="e.g., 5"
                  style={styles.input}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Discount (%)</Text>
                <TextInput
                  value={String(form.discount)}
                  onChangeText={(t) =>
                    setForm((f) => ({ ...f, discount: t.replace(/,/g, ".") }))
                  }
                  keyboardType="decimal-pad"
                  placeholder="e.g., 10"
                  style={styles.input}
                />
              </View>
            </View>

            {!isMart && (
              <View style={styles.row2}>
                <View
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Text style={styles.label}>Is Veg</Text>
                  <Switch
                    value={form.isVeg}
                    onValueChange={(v) => setForm((f) => ({ ...f, isVeg: v }))}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Spice Level</Text>
                  <Select
                    value={form.spiceLevel}
                    onChange={(v) => setForm((f) => ({ ...f, spiceLevel: v }))}
                    options={SPICE_OPTIONS.map((x) => ({ label: x, value: x }))}
                    placeholder="None"
                  />
                </View>
              </View>
            )}

            <Text style={styles.label}>Description</Text>
            <TextInput
              value={form.description}
              onChangeText={(t) => setForm((f) => ({ ...f, description: t }))}
              placeholder="Add a description..."
              style={[styles.input, { height: Math.max(100, descHeight) }]}
              multiline
              textAlignVertical="top"
              onContentSizeChange={(e) =>
                setDescHeight(e.nativeEvent.contentSize.height)
              }
            />

            <MainImagePicker />
            {isMart && <AdditionalImagesPicker />}

            {showSizeFields && (
              <>
                <Text style={styles.label}>Size Standard</Text>
                <SizeStandardPicker
                  value={form.sizeStandard}
                  onChange={(v) => setForm((f) => ({ ...f, sizeStandard: v }))}
                />
                <Text style={styles.label}>
                  Available Sizes (comma-separated)
                </Text>
                <TextInput
                  value={form.availableSizes}
                  onChangeText={(t) =>
                    setForm((f) => ({ ...f, availableSizes: t }))
                  }
                  placeholder="e.g., S,M,L,XL,XXL"
                  style={styles.input}
                />
                <Text style={styles.hintText}>
                  Enter sizes separated by commas
                </Text>
              </>
            )}

            <View style={styles.stockRow2}>
              <Text style={styles.stockLabel2}>In Stock / Available</Text>
              <Switch
                value={form.inStock}
                onValueChange={(v) => setForm((f) => ({ ...f, inStock: v }))}
                trackColor={{ true: "#a7f3d0", false: "#fee2e2" }}
                thumbColor={form.inStock ? "#10b981" : "#ef4444"}
              />
            </View>

            <View style={styles.saveRow}>
              <Pressable
                style={[styles.btn, styles.btnGhost]}
                onPress={() => navigation.goBack()}
              >
                <Ionicons name="close-outline" size={18} color="#0f172a" />
                <Text style={styles.btnGhostText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.btn, styles.btnPrimary]}
                onPress={saveItem}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="save-outline" size={18} color="#fff" />
                    <Text style={styles.btnPrimaryText}>Save Changes</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <CategorySelectorModal />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#ffffff" },
  header: {
    minHeight: 52,
    paddingHorizontal: 12,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    backgroundColor: "#fff",
  },
  backBtn: {
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
  headerActions: { flexDirection: "row", gap: 4 },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: { fontSize: 14, color: "#64748b" },
  scrollContent: { paddingBottom: 32 },
  form: { padding: 20, paddingTop: 4 },
  label: {
    color: "#0f172a",
    fontWeight: "700",
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    backgroundColor: "#f1f5f9",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: "#0f172a",
    fontSize: 15,
  },
  row2: { flexDirection: "row", gap: 10, marginTop: 4 },
  hintText: { fontSize: 12, color: "#64748b", marginTop: 4 },
  categorySelector: {
    backgroundColor: "#f1f5f9",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  categorySelectorText: { color: "#0f172a", fontSize: 15 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#0f172a" },
  modalCloseBtn: { padding: 4 },
  modalList: { maxHeight: 500 },
  modalListItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  modalListItemActive: { backgroundColor: "#f0fdf4" },
  modalListItemText: { fontSize: 16, color: "#0f172a" },
  modalListItemTextActive: { color: "#00b14f", fontWeight: "600" },
  modalEmpty: { padding: 48, alignItems: "center", gap: 12 },
  modalEmptyText: { fontSize: 14, color: "#64748b" },
  pickerWrap: {
    backgroundColor: "#f1f5f9",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    height: 46,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  pickerText: { fontSize: 14, includeFontPadding: false },
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
    height: 46,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dropdownText: { fontSize: 14 },
  stockRow2: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stockLabel2: { fontSize: 14, color: "#0f172a", fontWeight: "700" },
  saveRow: { flexDirection: "row", gap: 10, marginTop: 20 },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  btnPrimary: { backgroundColor: "#00b14f" },
  btnPrimaryText: { color: "#fff", fontWeight: "800" },
  btnGhost: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0" },
  btnGhostText: { color: "#0f172a", fontWeight: "800" },
  imageActionRow: { flexDirection: "row", gap: 10, marginTop: 10 },
  imageActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  imageActionText: { color: "#0f172a", fontWeight: "600", fontSize: 13 },
  imageActionTextWhite: { color: "#fff", fontWeight: "600", fontSize: 13 },
  singleImageWrapper: {
    position: "relative",
    width: "100%",
    height: 160,
    marginTop: 8,
  },
  singleImage: {
    width: "100%",
    height: 160,
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
  },
  removeSingleImageBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "white",
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  noImageContainer: {
    width: "100%",
    height: 120,
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  noImageText: { marginTop: 8, color: "#64748b", fontWeight: "600" },
  galleryScrollContent: { paddingVertical: 8, gap: 12, flexDirection: "row" },
  galleryImageWrapper: {
    position: "relative",
    width: 100,
    height: 100,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
  },
  galleryImage: { width: "100%", height: "100%", backgroundColor: "#f1f5f9" },
  removeImageBtn: {
    position: "absolute",
    top: -8,
    right: -8,
    backgroundColor: "white",
    borderRadius: 12,
    overflow: "hidden",
  },
  imageIndex: {
    position: "absolute",
    bottom: 4,
    left: 4,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  imageIndexText: { color: "white", fontSize: 10, fontWeight: "bold" },
  addImageBtn: {
    width: 100,
    height: 100,
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#e2e8f0",
    borderStyle: "dashed",
  },
  addImageText: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 4,
    fontWeight: "500",
  },
});
