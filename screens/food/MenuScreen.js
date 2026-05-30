// screens/food/MenuScreen.js - Updated with alphabetical sorting and dropdown category selector

import React, {
  useMemo,
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
} from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  FlatList,
  Image,
  Platform,
  ScrollView,
  StatusBar,
  Alert,
  DeviceEventEmitter,
  Pressable,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import {
  useNavigation,
  useRoute,
  useFocusEffect,
} from "@react-navigation/native";
import * as SecureStore from "expo-secure-store";
import { BRAND, FONT, RADIUS, SHADOW } from "../styles/tabdey_brand";
import {
  DISPLAY_MENU_ENDPOINT as ENV_DISPLAY_MENU_ENDPOINT,
  DISPLAY_ITEM_ENDPOINT as ENV_DISPLAY_ITEM_ENDPOINT,
  MENU_ENDPOINT as ENV_MENU_ENDPOINT,
  ITEM_ENDPOINT as ENV_ITEM_ENDPOINT,
  MENU_IMAGE_ENDPOINT as ENV_MENU_IMAGE_ENDPOINT,
  ITEM_IMAGE_ENDPOINT as ENV_ITEM_IMAGE_ENDPOINT,
} from "@env";

// basic money formatter
const money = (n, c = "BTN") => `${c} ${Number(n ?? 0).toFixed(2)}`;

const DEFAULT_CATEGORIES = ["All"];
const KEY_LAST_CTX = "last_ctx_payload";

/* ---------------- helpers ---------------- */
function getOrigin(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    const m = String(url).match(/^(https?:\/\/[^/]+)/i);
    return m ? m[1] : "";
  }
}

const sanitizePath = (p) =>
  String(p || "")
    .replace(/^\/uploads\/uploads\//i, "/uploads/")
    .replace(/([^:]\/)\/+/g, "$1");

const encodePathSegments = (p) =>
  String(p || "")
    .split("/")
    .map((seg) => (seg ? encodeURIComponent(seg) : ""))
    .join("/");

const absJoin = (base, raw) => {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;

  const baseNorm = String((base || "").replace(/\/+$/, ""));
  let path = s.startsWith("/") ? s : `/${s}`;

  if (/\/uploads$/i.test(baseNorm) && /^\/uploads\//i.test(path)) {
    path = path.replace(/^\/uploads/i, "");
  }

  const encodedPath = encodePathSegments(sanitizePath(path));
  return `${baseNorm}${encodedPath.startsWith("/") ? "" : "/"}${encodedPath}`.replace(
    /([^:]\/)\/+/g,
    "$1",
  );
};

const normalizeOwnerType = (v) => {
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  if (s === "2" || s === "mart") return "mart";
  if (s === "1" || s === "food") return "food";
  return s || "food";
};

/* ---------- Category Dropdown Component ---------- */
function CategoryDropdown({ categories, activeCategory, onChangeCategory }) {
  const [modalVisible, setModalVisible] = useState(false);
  const data = Array.isArray(categories) ? categories : [];
  const activeNorm = String(activeCategory || "").trim();

  const selectedCategory = data.includes(activeNorm) ? activeNorm : "All";

  return (
    <>
      <TouchableOpacity
        style={styles.dropdownButton}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.7}
      >
        <Text style={styles.dropdownButtonText}>{selectedCategory}</Text>
        <Ionicons name="chevron-down" size={20} color="#0f172a" />
      </TouchableOpacity>

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setModalVisible(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Category</Text>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={24} color="#0f172a" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={data}
              keyExtractor={(item, index) => `${item}-${index}`}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.modalItem,
                    selectedCategory === item && styles.modalItemActive,
                  ]}
                  onPress={() => {
                    onChangeCategory(item);
                    setModalVisible(false);
                  }}
                >
                  <Text
                    style={[
                      styles.modalItemText,
                      selectedCategory === item && styles.modalItemTextActive,
                    ]}
                  >
                    {item}
                  </Text>
                  {selectedCategory === item && (
                    <Ionicons name="checkmark" size={20} color={BRAND.purple} />
                  )}
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => (
                <View style={styles.modalSeparator} />
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

/* ---------------- main screen ---------------- */
export default function MenuScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();

  useLayoutEffect(() => {
    navigation.setOptions?.({
      animation: "slide_from_right",
      gestureEnabled: true,
      fullScreenGestureEnabled: true,
    });
  }, [navigation]);

  const ownerType = useMemo(
    () =>
      normalizeOwnerType(
        route?.params?.owner_type ?? route?.params?.ownerType ?? "food",
      ),
    [route?.params?.owner_type, route?.params?.ownerType],
  );
  const isMart = ownerType === "mart";

  const IMAGE_BASE = useMemo(
    () =>
      String(
        (isMart ? ENV_ITEM_IMAGE_ENDPOINT : ENV_MENU_IMAGE_ENDPOINT) || "",
      ).replace(/\/+$/, ""),
    [isMart],
  );

  const nouns = useMemo(() => {
    const base = isMart ? "item" : "menu";
    return {
      headerTitle: isMart ? "Items" : "Menu",
      searchPH: isMart ? "Search items" : "Search menu items",
      emptyTitle: "No items yet",
      emptySub: 'Tap "Add item" to create your first one.',
      addFab: "Add item",
    };
  }, [isMart]);

  const businessId = useMemo(() => {
    const p = route?.params ?? {};
    const id =
      p.businessId ||
      p.business_id ||
      p.merchant?.businessId ||
      p.merchant?.id ||
      p.user?.business_id ||
      p.user?.id ||
      "";
    return id;
  }, [route?.params]);

  const businessName =
    route?.params?.business_name ||
    route?.params?.merchant?.business_name ||
    route?.params?.user?.business_name ||
    "";

  const businessLogo =
    route?.params?.business_logo ||
    route?.params?.merchant?.business_logo ||
    route?.params?.user?.business_logo ||
    "";

  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [menus, setMenus] = useState(route?.params?.menus ?? []);
  const [categories, setCategories] = useState(
    route?.params?.categories ?? DEFAULT_CATEGORIES,
  );
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const DISPLAY_LIST_ENDPOINT = useMemo(
    () =>
      (
        (isMart ? ENV_DISPLAY_ITEM_ENDPOINT : ENV_DISPLAY_MENU_ENDPOINT) || ""
      ).replace(/\/$/, ""),
    [isMart],
  );
  const MODIFY_ENDPOINT = useMemo(
    () =>
      ((isMart ? ENV_ITEM_ENDPOINT : ENV_MENU_ENDPOINT) || "").replace(
        /\/$/,
        "",
      ),
    [isMart],
  );
  const API_ORIGIN = useMemo(
    () => getOrigin(DISPLAY_LIST_ENDPOINT),
    [DISPLAY_LIST_ENDPOINT],
  );

  const extractItemsFromResponse = useCallback((raw) => {
    if (raw?.data && typeof raw.data === "object" && !Array.isArray(raw.data)) {
      if (raw.data.id || raw.data.item_name) {
        return [raw.data];
      }
    }

    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.data)) return raw.data;

    for (const k of [
      "items",
      "rows",
      "result",
      "payload",
      "list",
      "menus",
      "menu",
    ]) {
      if (Array.isArray(raw?.[k])) return raw[k];
    }
    if (raw && typeof raw === "object") {
      for (const v of Object.values(raw)) {
        if (Array.isArray(v)) return v;
      }
    }
    return [];
  }, []);

  const parseMultipleImages = useCallback(
    (item) => {
      if (item?.product_info?.product_images) {
        const imagesStr = item.product_info.product_images;
        const imagePaths = imagesStr.includes(",")
          ? imagesStr.split(",").map((img) => img.trim())
          : [imagesStr];

        return imagePaths.map((path) =>
          absJoin(IMAGE_BASE || API_ORIGIN, path),
        );
      }
      return [];
    },
    [IMAGE_BASE, API_ORIGIN],
  );

  const normalizeItem = useCallback(
    (x, idx = 0) => {
      const item = x?.data || x;

      const numericActual = Number(item?.actual_price);
      const numericBase = Number(item?.base_price);
      const price = Number.isFinite(numericActual)
        ? numericActual
        : Number.isFinite(numericBase)
          ? numericBase
          : typeof item?.price === "number"
            ? item.price
            : Number(item?.price ?? 0);

      const rawImg =
        item?.image_url ??
        item?.item_image_url ??
        item?.item_image ??
        item?.image ??
        (isMart ? item?.item_image : null) ??
        "";

      const absImage = absJoin(IMAGE_BASE || API_ORIGIN, rawImg);

      const multipleImages = isMart ? parseMultipleImages(item) : [];

      return {
        id: String(
          item?.id ?? item?._id ?? item?.menu_id ?? item?.item_id ?? idx,
        ),
        name: item?.item_name ?? item?.name ?? item?.title ?? "Unnamed item",
        price,
        currency: item?.currency ?? "BTN",
        inStock: (item?.is_available ?? item?.inStock ?? 1) ? true : false,
        category:
          item?.category_name ?? item?.category ?? item?.categoryName ?? "",
        image: absImage,
        images: multipleImages,
        description: item?.description ?? "",
        discount: parseFloat(item?.discount_percentage) || 0,
        taxRate: parseFloat(item?.tax_rate) || 0,
        stockLimit: item?.stock_limit || 0,
        isVeg: item?.is_veg === 1,
        spiceLevel: item?.spice_level || "None",
        productInfo: item?.product_info || null,
      };
    },
    [API_ORIGIN, IMAGE_BASE, isMart, parseMultipleImages],
  );

  const buildListUrl = useCallback(() => {
    if (!DISPLAY_LIST_ENDPOINT || !businessId) return null;
    const base = DISPLAY_LIST_ENDPOINT.replace(/\/+$/, "");
    const service = isMart ? "mart" : "food";

    if (isMart) {
      return `${base}/${encodeURIComponent(businessId)}?owner_type=${encodeURIComponent(service)}`;
    }

    if (/\/business$/i.test(base)) {
      return `${base}/${encodeURIComponent(businessId)}?owner_type=${encodeURIComponent(service)}`;
    }

    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}business_id=${encodeURIComponent(businessId)}&owner_type=${encodeURIComponent(service)}`;
  }, [DISPLAY_LIST_ENDPOINT, businessId, isMart]);

  const hydrateCategories = useCallback((list) => {
    const uniq = new Map(); // Use Map to store original case
    for (const it of list) {
      const c = String(it?.category || "").trim();
      if (c) {
        // Store by lowercase key but keep original case
        if (!uniq.has(c.toLowerCase())) {
          uniq.set(c.toLowerCase(), c);
        }
      }
    }
    // Return "All" first, then all unique categories sorted alphabetically (case insensitive)
    const sortedCategories = Array.from(uniq.values()).sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase()),
    );
    return ["All", ...sortedCategories];
  }, []);

  const fetchMenus = useCallback(async () => {
    if (!DISPLAY_LIST_ENDPOINT) {
      setErrorMsg("Missing list endpoint in .env");
      return;
    }
    if (!businessId) {
      setErrorMsg("Missing businessId in route params");
      return;
    }

    setLoading(true);
    setErrorMsg("");
    try {
      const token = (await SecureStore.getItemAsync("auth_token")) || "";
      const url = buildListUrl();
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
      if (!res.ok) {
        setErrorMsg(
          `Failed to load ${isMart ? "items" : "menu items"} (HTTP ${res.status}).`,
        );
      } else {
        let parsed;
        try {
          parsed = text ? JSON.parse(text) : [];
        } catch {
          parsed = [];
        }
        const list = extractItemsFromResponse(parsed).map((x, i) =>
          normalizeItem(x, i),
        );

        // Sort items alphabetically by name
        const sortedList = list.sort((a, b) =>
          a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
        );

        setMenus(sortedList);
        const cats = hydrateCategories(sortedList);
        setCategories(cats);
        setActiveCategory((prev) => (cats.includes(prev) ? prev : "All"));
      }
    } catch (e) {
      setErrorMsg(
        String(
          e?.message || `Failed to load ${isMart ? "items" : "menu items"}.`,
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [
    DISPLAY_LIST_ENDPOINT,
    businessId,
    buildListUrl,
    extractItemsFromResponse,
    normalizeItem,
    hydrateCategories,
    isMart,
  ]);

  useFocusEffect(
    useCallback(() => {
      fetchMenus();
    }, [fetchMenus]),
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const activeNorm = activeCategory.trim().toLowerCase();

    let filteredItems = menus.filter((m) => {
      const cat = String(m.category || "")
        .trim()
        .toLowerCase();
      // Compare case-insensitively
      const matchesCat = activeCategory === "All" || cat === activeNorm;
      const matchesText =
        !q ||
        String(m.name || "")
          .toLowerCase()
          .includes(q) ||
        cat.includes(q);
      return matchesCat && matchesText;
    });

    // Ensure filtered items remain alphabetically sorted
    return filteredItems.sort((a, b) =>
      a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
    );
  }, [menus, query, activeCategory]);

  const openAddTab = async () => {
    const payload = {
      openTab: "Add Menu",
      businessId,
      business_id: businessId,
      business_name: businessName,
      business_logo: businessLogo,
      owner_type: ownerType,
    };
    try {
      await SecureStore.setItemAsync(KEY_LAST_CTX, JSON.stringify(payload));
    } catch {}
    DeviceEventEmitter.emit("open-tab", { key: "Add Menu", params: payload });
    navigation.goBack();
  };

  const deleteItem = async (id) => {
    Alert.alert(
      `Delete ${isMart ? "item" : "menu item"}`,
      "Are you sure you want to delete this?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              if (!MODIFY_ENDPOINT) throw new Error("Missing modify endpoint");
              const token = await SecureStore.getItemAsync("auth_token");
              const url = `${MODIFY_ENDPOINT}/${encodeURIComponent(id)}`;
              const res = await fetch(url, {
                method: "DELETE",
                headers: {
                  Accept: "application/json",
                  ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
              });
              await res.text();
              if (!res.ok)
                throw new Error(`Delete failed (HTTP ${res.status})`);
              setMenus((prev) => prev.filter((m) => m.id !== id));
              Alert.alert("Deleted", "Item has been deleted successfully.");
            } catch (e) {
              Alert.alert(
                "Delete failed",
                String(e?.message || "Could not delete the item."),
              );
            }
          },
        },
      ],
    );
  };

  const convertToApiFormat = (normalizedItem) => {
    return {
      id: normalizedItem.id,
      item_name: normalizedItem.name,
      category_name: normalizedItem.category,
      actual_price: normalizedItem.price,
      item_image: normalizedItem.image,
      images: normalizedItem.images,
      is_available: normalizedItem.inStock ? 1 : 0,
      description: normalizedItem.description || "",
      discount_percentage: normalizedItem.discount || 0,
      tax_rate: normalizedItem.taxRate || 0,
      currency: normalizedItem.currency || "BTN",
      stock_limit: normalizedItem.stockLimit || 0,
      is_veg: normalizedItem.isVeg ? 1 : 0,
      spice_level: normalizedItem.spiceLevel || "None",
      product_info: normalizedItem.productInfo || null,
    };
  };

  const renderMenu = ({ item }) => (
    <Pressable
      onPress={() =>
        navigation.navigate("ItemDetailScreen", {
          itemId: item.id,
          businessId: businessId,
          businessName: businessName,
          ownerType: ownerType,
          onItemDeleted: (deletedId) => {
            setMenus((prev) => prev.filter((m) => m.id !== deletedId));
          },
          onItemUpdated: (updatedItem) => {
            setMenus((prev) =>
              prev.map((m) => (m.id === updatedItem.id ? updatedItem : m)),
            );
          },
        })
      }
      style={styles.card}
    >
      <View style={styles.imageContainer}>
        {item.images && item.images.length > 0 ? (
          <>
            <Image source={{ uri: item.images[0] }} style={styles.thumb} />
            {item.images.length > 1 && (
              <View style={styles.multipleImagesBadge}>
                <Text style={styles.multipleImagesBadgeText}>
                  +{item.images.length - 1}
                </Text>
              </View>
            )}
          </>
        ) : item.image ? (
          <Image source={{ uri: item.image }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbFallback]}>
            <Ionicons name="image-outline" size={18} color="#64748b" />
          </View>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={styles.title}>
          {item.name}
        </Text>
        <Text numberOfLines={1} style={styles.meta}>
          {item.category || "—"}
        </Text>
        <Text style={styles.price}>
          {money(item.price, item.currency || "BTN")}
        </Text>
      </View>
      <View style={styles.rightCol}>
        <View style={styles.stockRow}>
          <Text style={styles.stockLabel}>
            {item.inStock ? "In stock" : "Out"}
          </Text>
        </View>
        <View style={styles.actions}>
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              navigation.navigate("EditItemScreen", {
                item: convertToApiFormat(item), // Convert to API format
                businessId: businessId,
                businessName: route.params?.businessName,
                ownerType: ownerType,
                onItemUpdated: (updatedItem) => {
                  setMenus((prev) =>
                    prev.map((m) =>
                      m.id === updatedItem.id ? updatedItem : m,
                    ),
                  );
                },
              });
            }}
            style={styles.iconBtn}
          >
            <Ionicons name="create-outline" size={20} color="#0f172a" />
          </Pressable>
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              deleteItem(item.id);
            }}
            style={styles.iconBtn}
          >
            <Ionicons name="trash-outline" size={20} color="#b91c1c" />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );

  return (
    <SafeAreaView
      style={styles.safe}
      edges={["top", "left", "bottom", "right"]}
    >
      <View style={styles.topGlow} />
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="dark-content"
      />

      {/* Updated Header - Same style as PasswordManagement */}
      <View style={[styles.header]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={22} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{nouns.headerTitle}</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color="#64748b" />
        <TextInput
          placeholder={nouns.searchPH}
          placeholderTextColor="#94a3b8"
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
        />
        {!!query && (
          <Pressable onPress={() => setQuery("")} style={styles.clearBtn}>
            <Ionicons name="close-circle" size={18} color="#94a3b8" />
          </Pressable>
        )}
      </View>

      {/* Category Dropdown instead of scrollable bar */}
      <View style={styles.categoryDropdownContainer}>
        <Text style={styles.categoryLabel}>Category:</Text>
        <CategoryDropdown
          categories={categories}
          activeCategory={activeCategory}
          onChangeCategory={setActiveCategory}
        />
      </View>

      {loading ? (
        <View style={{ paddingTop: 40, alignItems: "center" }}>
          <ActivityIndicator />
          <Text style={{ marginTop: 8, color: "#64748b" }}>
            Loading {isMart ? "items" : "menu items"}…
          </Text>
        </View>
      ) : errorMsg ? (
        <View style={{ paddingTop: 40, alignItems: "center" }}>
          <Ionicons name="warning-outline" size={28} color="#ef4444" />
          <Text style={{ marginTop: 8, color: "#ef4444", fontWeight: "700" }}>
            {errorMsg}
          </Text>
          <Pressable
            onPress={fetchMenus}
            style={[styles.btn, styles.btnPrimary, { marginTop: 12 }]}
          >
            <Ionicons name="reload" size={18} color="#fff" />
            <Text style={styles.btnPrimaryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderMenu}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: (insets.bottom || 0) + 120,
            paddingTop: 4,
          }}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons
                name={isMart ? "cube-outline" : "fast-food-outline"}
                size={30}
                color="#64748b"
              />
              <Text style={styles.emptyTitle}>{nouns.emptyTitle}</Text>
              <Text style={styles.emptySub}>{nouns.emptySub}</Text>
            </View>
          }
          nestedScrollEnabled={true}
          keyboardShouldPersistTaps="handled"
        />
      )}

      <Pressable
        style={[styles.fab, { bottom: (insets.bottom || 0) + 24 }]}
        onPress={openAddTab}
      >
        <Ionicons name="add" size={22} color="#fff" />
        <Text style={styles.fabText}>{nouns.addFab}</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: BRAND.white,
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
  header: {
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

  iconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
  },

  searchWrap: {
    marginHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: BRAND.white,
    borderWidth: 1,
    borderColor: "#F3E8FF",
    // ...SHADOW.sm,
  },
  searchInput: { flex: 1, color: "#0f172a", paddingVertical: 0 },
  clearBtn: { padding: 4, borderRadius: 999 },

  categoryDropdownContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    marginTop: 12,
    marginBottom: 10,
  },
  categoryLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0f172a",
  },
  dropdownButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: BRAND.white,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    minWidth: 160,
    borderWidth: 1,
    borderColor: "#F3E8FF",
  },
  dropdownButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#0f172a",
    marginRight: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0f172a",
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  modalItemActive: {
    backgroundColor: "#F4E9FF",
  },
  modalItemText: {
    fontSize: 16,
    color: "#0f172a",
  },
  modalItemTextActive: {
    color: BRAND.purple,
    fontWeight: "900",
  },
  modalSeparator: {
    height: 1,
    backgroundColor: "#f1f5f9",
  },

  card: {
    backgroundColor: BRAND.white,
    borderRadius: 24,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "#F3E8FF",
  },
  imageContainer: { position: "relative" },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: "#F4E9FF",
  },

  thumbFallback: { alignItems: "center", justifyContent: "center" },
  multipleImagesBadge: {
    position: "absolute",
    bottom: -4,
    right: -4,
    backgroundColor: BRAND.purple,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "white",
  },
  multipleImagesBadgeText: { color: "white", fontSize: 10, fontWeight: "bold" },
  title: { fontSize: 15, fontWeight: "800", color: "#0f172a" },
  meta: { fontSize: 12, color: "#64748b", marginTop: 2 },
  price: { fontSize: 14, color: "#0f172a", fontWeight: "800", marginTop: 4 },
  rightCol: { alignItems: "flex-end", gap: 8 },
  stockRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  stockLabel: { fontSize: 12, color: "#0f172a", fontWeight: "700" },
  actions: { flexDirection: "row", gap: 6 },
  emptyBox: { alignItems: "center", paddingTop: 40, gap: 8 },
  emptyTitle: { fontWeight: "800", color: "#0f172a" },
  emptySub: { color: "#64748b" },
  fab: {
    position: "absolute",
    right: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: BRAND.purple,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: RADIUS.pill,
    ...SHADOW.md,
  },
  fabText: { color: "#fff", fontWeight: "800" },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  btnPrimary: {
    backgroundColor: BRAND.purple,
  },
  btnPrimaryText: { color: "#fff", fontWeight: "800" },
});
