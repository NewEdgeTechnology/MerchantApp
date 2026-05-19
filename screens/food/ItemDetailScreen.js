// screens/food/ItemDetailScreen.js

import React, { useState, useLayoutEffect, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  Pressable,
  Alert,
  Dimensions,
  StatusBar,
  Modal,
  Share,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import * as SecureStore from "expo-secure-store";
import {
  DISPLAY_ITEM_ENDPOINT as ENV_DISPLAY_ITEM_ENDPOINT,
  DISPLAY_MENU_ENDPOINT as ENV_DISPLAY_MENU_ENDPOINT,
  ITEM_ENDPOINT as ENV_ITEM_ENDPOINT,
  MENU_ENDPOINT as ENV_MENU_ENDPOINT,
  ITEM_IMAGE_ENDPOINT as ENV_ITEM_IMAGE_ENDPOINT,
  MENU_IMAGE_ENDPOINT as ENV_MENU_IMAGE_ENDPOINT,
} from "@env";

const { width, height } = Dimensions.get("window");

const money = (n, c = "BTN") => `${c} ${Number(n ?? 0).toFixed(2)}`;

export default function ItemDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();

  const [item, setItem] = useState(route?.params?.item || null);
  const [loading, setLoading] = useState(!route?.params?.item);
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [mainImageScrollIndex, setMainImageScrollIndex] = useState(0);
  const flatListRef = useRef(null);
  const mainImageFlatListRef = useRef(null);

  const ownerType = route?.params?.ownerType || "mart";
  const isMart = ownerType === "mart";
  const businessId = route?.params?.businessId;
  const itemId = route?.params?.itemId || item?.id;

  const DISPLAY_ENDPOINT = isMart
    ? ENV_DISPLAY_ITEM_ENDPOINT
    : ENV_DISPLAY_MENU_ENDPOINT;
  const MODIFY_ENDPOINT = isMart ? ENV_ITEM_ENDPOINT : ENV_MENU_ENDPOINT;
  const IMAGE_BASE_URL = isMart
    ? ENV_ITEM_IMAGE_ENDPOINT
    : ENV_MENU_IMAGE_ENDPOINT;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
      animation: "slide_from_right",
      gestureEnabled: true,
    });
  }, [navigation]);

  useEffect(() => {
    if (!item && businessId && itemId) {
      fetchItemDetails();
    }
  }, [businessId, itemId]);

  useEffect(() => {
    if (imageModalVisible && flatListRef.current && selectedImageIndex) {
      setTimeout(() => {
        flatListRef.current?.scrollToIndex({
          index: selectedImageIndex,
          animated: false,
        });
      }, 100);
    }
  }, [imageModalVisible, selectedImageIndex]);

  const getFullImageUrl = (path) => {
    if (!path) return null;
    if (path.startsWith("http://") || path.startsWith("https://")) {
      return path;
    }
    const normalizedPath = path.startsWith("/") ? path.substring(1) : path;
    return `${IMAGE_BASE_URL}/${normalizedPath}`;
  };

  const getAllImages = (apiItem) => {
    const images = [];

    if (apiItem.item_image) {
      const mainImageUrl = getFullImageUrl(apiItem.item_image);
      if (mainImageUrl) {
        images.push(mainImageUrl);
      }
    }

    if (apiItem.product_info?.product_images) {
      const additionalImages = apiItem.product_info.product_images
        .split(",")
        .map((img) => img.trim())
        .filter((img) => img && img.length > 0)
        .map((img) => getFullImageUrl(img))
        .filter((img) => img !== null);

      additionalImages.forEach((img) => {
        if (!images.includes(img)) {
          images.push(img);
        }
      });
    }

    return images;
  };

  const fetchItemDetails = async () => {
    setLoading(true);
    try {
      const token = await SecureStore.getItemAsync("auth_token");
      const url = `${DISPLAY_ENDPOINT}/${businessId}`;

      const response = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      const data = await response.json();

      if (data.success && data.data) {
        const foundItem = data.data.find((i) => i.id === parseInt(itemId));
        if (foundItem) {
          const transformed = transformApiItem(foundItem);
          setItem(transformed);
        } else {
          Alert.alert("Error", "Item not found");
          navigation.goBack();
        }
      } else {
        Alert.alert("Error", data.message || "Failed to fetch item");
      }
    } catch (error) {
      console.error("Error fetching item:", error);
      Alert.alert("Error", "Could not load item details");
    } finally {
      setLoading(false);
    }
  };

  const transformApiItem = (apiItem) => {
    const discount = parseFloat(apiItem.discount_percentage) || 0;
    const price = parseFloat(apiItem.actual_price);
    const discountedPrice = discount > 0 ? price * (1 - discount / 100) : price;

    let availableSizes = [];
    if (apiItem.product_info?.available_sizes) {
      availableSizes = apiItem.product_info.available_sizes
        .split(",")
        .map((s) => s.trim());
    }

    let productImagesList = [];
    if (apiItem.product_info?.product_images) {
      productImagesList = apiItem.product_info.product_images
        .split(",")
        .map((img) => img.trim())
        .filter((img) => img);
    }

    return {
      id: apiItem.id,
      name: apiItem.item_name,
      description: apiItem.description || "No description available",
      price: price,
      discountedPrice: discountedPrice,
      discount: discount,
      taxRate: parseFloat(apiItem.tax_rate) || 0,
      category: apiItem.category_name || "Uncategorized",
      inStock: apiItem.is_available === 1,
      stockLimit: apiItem.stock_limit || 0,
      isVeg: apiItem.is_veg === 1,
      spiceLevel: apiItem.spice_level || "None",
      currency: "BTN",
      images: getAllImages(apiItem),
      productInfo: apiItem.product_info
        ? {
            sku: apiItem.product_info.sku,
            brand: apiItem.product_info.brand,
            weight: apiItem.product_info.weight,
            unit: apiItem.product_info.unit,
            sizeStandard: apiItem.product_info.size_standard,
            availableSizes: availableSizes,
            productImages: productImagesList,
          }
        : null,
      createdAt: apiItem.created_at,
      updatedAt: apiItem.updated_at,
    };
  };

  const images = item?.images || [];
  const mainImage = images[0] || null;

  const handleEdit = () => {
    navigation.navigate("EditItemScreen", {
      itemId: item?.id,
      businessId: businessId,
      businessName: route.params?.businessName,
      ownerType: ownerType,
      onItemUpdated: (updatedItem) => {
        setItem(updatedItem);
        if (route.params?.onItemUpdated) {
          route.params.onItemUpdated(updatedItem);
        }
      },
    });
  };

  const handleShare = async () => {
    try {
      const displayPrice = getFinalPrice();
      const message = `${item?.name}\n${displayPrice}\n${item?.description || ""}`;
      await Share.share({
        message: message,
        title: item?.name,
      });
    } catch (error) {
      console.error("Error sharing:", error);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      "Delete Item",
      `Are you sure you want to delete "${item?.name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            if (!MODIFY_ENDPOINT) {
              Alert.alert("Error", "Modify endpoint not configured");
              return;
            }

            try {
              const token = await SecureStore.getItemAsync("auth_token");
              const url = `${MODIFY_ENDPOINT.replace(/\/$/, "")}/${encodeURIComponent(item.id)}`;

              const res = await fetch(url, {
                method: "DELETE",
                headers: {
                  Accept: "application/json",
                  ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
              });

              if (!res.ok) {
                throw new Error(`Delete failed (HTTP ${res.status})`);
              }

              Alert.alert(
                "Success",
                `${isMart ? "Item" : "Menu item"} deleted successfully`,
              );

              if (route.params?.onItemDeleted) {
                route.params.onItemDeleted(item.id);
              }
              navigation.goBack();
            } catch (e) {
              Alert.alert("Error", e?.message || "Could not delete the item");
            }
          },
        },
      ],
    );
  };

  const getBasePrice = () => {
    return money(item?.price, item?.currency);
  };

  const getDiscountedPrice = () => {
    if (item?.discount > 0) {
      return money(item.discountedPrice, item.currency);
    }
    return null;
  };

  const getFinalPrice = () => {
    const basePrice = item?.discountedPrice || item?.price;
    const taxAmount = basePrice * (item?.taxRate / 100);
    return money(basePrice + taxAmount, item?.currency);
  };

  const getTaxAmount = () => {
    const basePrice = item?.discountedPrice || item?.price;
    return money(basePrice * (item?.taxRate / 100), item?.currency);
  };

  const getSavingsAmount = () => {
    if (item?.discount > 0) {
      const savings = item.price - item.discountedPrice;
      return money(savings, item.currency);
    }
    return null;
  };

  const getDiscountAmount = () => {
    if (item?.discount > 0) {
      return money(item.price - item.discountedPrice, item.currency);
    }
    return null;
  };

  // Handle main image scroll - improved with better detection
  const onMainImageScroll = (e) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / width);
    if (index !== mainImageScrollIndex && index >= 0 && index < images.length) {
      setMainImageScrollIndex(index);
    }
  };

  // Scroll to specific image
  const scrollToImage = (index) => {
    if (mainImageFlatListRef.current && index >= 0 && index < images.length) {
      setMainImageScrollIndex(index);
      mainImageFlatListRef.current.scrollToIndex({
        index: index,
        animated: true,
      });
    }
  };

  // Render product highlights/badges
  const renderProductHighlights = () => {
    const highlights = [];

    if (item?.discount > 0) {
      highlights.push({
        icon: "pricetag-outline",
        label: `${item.discount}% OFF`,
        color: "#10b981",
        bg: "#dcfce7",
      });
    }

    if (item?.taxRate > 0) {
      highlights.push({
        icon: "receipt-outline",
        label: `${item.taxRate}% Tax`,
        color: "#1e3658",
        bg: "#f1f5f9",
      });
    }

    if (!item?.inStock) {
      highlights.push({
        icon: "close-circle-outline",
        label: "Out of Stock",
        color: "#ef4444",
        bg: "#fef2f2",
      });
    } else if (item?.stockLimit > 0 && item?.stockLimit <= 10) {
      highlights.push({
        icon: "warning-outline",
        label: `Only ${item.stockLimit} left`,
        color: "#f59e0b",
        bg: "#fef3c7",
      });
    }

    if (item?.isVeg && !isMart) {
      highlights.push({
        icon: "leaf-outline",
        label: "Pure Veg",
        color: "#10b981",
        bg: "#dcfce7",
      });
    }

    if (highlights.length === 0) return null;

    return (
      <View style={styles.highlightsContainer}>
        {highlights.map((h, i) => (
          <View
            key={i}
            style={[styles.highlightBadge, { backgroundColor: h.bg }]}
          >
            <Ionicons name={h.icon} size={14} color={h.color} />
            <Text style={[styles.highlightText, { color: h.color }]}>
              {h.label}
            </Text>
          </View>
        ))}
      </View>
    );
  };

  // Enhanced Description with read more/less
  const renderDescription = () => {
    if (!item?.description || item.description === "No description available") {
      return (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Description</Text>
          <Text style={styles.descriptionMuted}>
            No description available for this item.
          </Text>
        </View>
      );
    }

    const shouldTruncate = item.description.length > 150;
    const displayText =
      descriptionExpanded || !shouldTruncate
        ? item.description
        : item.description.substring(0, 150) + "...";

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Description</Text>
        <Text style={styles.description}>{displayText}</Text>
        {shouldTruncate && (
          <TouchableOpacity
            onPress={() => setDescriptionExpanded(!descriptionExpanded)}
          >
            <Text style={styles.readMore}>
              {descriptionExpanded ? "Read less" : "Read more"}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // Price Card with better UX
  const renderPriceCard = () => {
    const hasDiscount = item?.discount > 0;
    const hasTax = item?.taxRate > 0;

    return (
      <View style={styles.priceCard}>
        <View style={styles.priceCardHeader}>
          <Text style={styles.priceCardTitle}>💰 Price Details</Text>
        </View>

        <View style={styles.priceCardRow}>
          <Text style={styles.priceCardLabel}>
            {hasDiscount ? "Original Price" : "Price"}
          </Text>
          <Text style={styles.priceCardValue}>
            {money(item?.price, item?.currency)}
          </Text>
        </View>

        {hasDiscount && (
          <View style={styles.priceCardRow}>
            <Text style={styles.priceCardLabel}>Discount</Text>
            <Text style={[styles.priceCardValue, { color: "#10b981" }]}>
              -{getDiscountAmount()} ({item.discount}% OFF)
            </Text>
          </View>
        )}

        {hasTax && (
          <View style={styles.priceCardRow}>
            <Text style={styles.priceCardLabel}>
              Tax ({item.taxRate}% {isMart ? "Tax" : "VAT"})
            </Text>
            <Text style={styles.priceCardValue}>+{getTaxAmount()}</Text>
          </View>
        )}

        <View style={[styles.priceCardRow, styles.totalRow]}>
          <Text style={styles.totalLabel}>Total Amount</Text>
          <Text style={styles.totalPrice}>{getFinalPrice()}</Text>
        </View>

        {hasDiscount && (
          <View style={styles.savingsInfo}>
            <Ionicons name="cash-outline" size={14} color="#10b981" />
            <Text style={styles.savingsInfoText}>
              You save {getSavingsAmount()}
            </Text>
          </View>
        )}
      </View>
    );
  };

  // Product Specifications - shows ALL available data
  const renderProductSpecifications = () => {
    const productInfo = item?.productInfo;
    const specs = [];

    // From main item
    if (item?.category && item.category !== "Uncategorized") {
      specs.push({
        label: "Category",
        value: item.category,
        icon: "folder-outline",
      });
    }

    // Only show spice level for restaurants/menus, not for mart items
    if (!isMart && item?.spiceLevel && item.spiceLevel !== "None") {
      specs.push({
        label: "Spice Level",
        value: item.spiceLevel,
        icon: "flame-outline",
      });
    }

    // Stock info
    specs.push({
      label: "Stock Status",
      value: item?.inStock
        ? `✓ In Stock${item?.stockLimit > 0 ? ` (${item.stockLimit} units left)` : ""}`
        : "✗ Out of Stock",
      icon: "archive-outline",
    });

    // Dietary info for restaurants
    if (!isMart && item?.isVeg) {
      specs.push({
        label: "Dietary",
        value: "Vegetarian",
        icon: "leaf-outline",
      });
    }

    // From product_info
    if (productInfo) {
      if (productInfo.brand) {
        specs.push({
          label: "Brand",
          value: productInfo.brand,
          icon: "business-outline",
        });
      }
      if (productInfo.sku) {
        specs.push({
          label: "SKU",
          value: productInfo.sku,
          icon: "barcode-outline",
        });
      }
      if (productInfo.weight) {
        specs.push({
          label: "Weight",
          value: productInfo.weight,
          icon: "fitness-outline",
        });
      }
      if (productInfo.unit) {
        specs.push({
          label: "Unit",
          value: productInfo.unit,
          icon: "cube-outline",
        });
      }
      if (productInfo.sizeStandard) {
        specs.push({
          label: "Size Standard",
          value: productInfo.sizeStandard,
          icon: "resize-outline",
        });
      }
      if (productInfo.availableSizes && productInfo.availableSizes.length > 0) {
        specs.push({
          label: "Available Sizes",
          value: productInfo.availableSizes.join(", "),
          icon: "options-outline",
        });
      }
    }

    if (specs.length === 0) return null;

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📋 Product Specifications</Text>
        <View style={styles.specsGrid}>
          {specs.map((spec, index) => (
            <View key={index} style={styles.specItem}>
              <View style={styles.specIconContainer}>
                <Ionicons name={spec.icon} size={18} color="#00b14f" />
              </View>
              <View style={styles.specContent}>
                <Text style={styles.specLabel}>{spec.label}</Text>
                <Text style={styles.specValue}>{spec.value}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  };

  const renderImageCarousel = () => {
    if (images.length === 0) {
      return (
        <View style={styles.imagePlaceholder}>
          <Ionicons name="image-outline" size={60} color="#cbd5e1" />
          <Text style={styles.noImageText}>No image available</Text>
        </View>
      );
    }

    const renderImageItem = ({ item: imageUrl, index }) => (
      <Pressable 
        key={index} 
        onPress={() => {
          setSelectedImageIndex(index);
          setImageModalVisible(true);
        }}
        style={styles.imageContainer}
      >
        <Image source={{ uri: imageUrl }} style={styles.mainImage} resizeMode="cover" />
      </Pressable>
    );

    return (
      <View style={styles.carouselWrapper}>
        {/* Main scrollable image carousel */}
        <FlatList
          ref={mainImageFlatListRef}
          data={images}
          renderItem={renderImageItem}
          keyExtractor={(_, index) => `main_${index}`}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onMainImageScroll}
          getItemLayout={(data, index) => ({
            length: width,
            offset: width * index,
            index,
          })}
          style={styles.imageCarousel}
          decelerationRate="fast"
          snapToInterval={width}
          snapToAlignment="start"
        />

        {/* Image counter badge */}
        {images.length > 1 && (
          <View style={styles.imageCountBadge}>
            <Ionicons name="images" size={16} color="#fff" />
            <Text style={styles.imageCountText}>
              {mainImageScrollIndex + 1} / {images.length}
            </Text>
          </View>
        )}

        {/* Thumbnail scroll indicator */}
        {images.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.thumbnailScroll}
            contentContainerStyle={styles.thumbnailContainer}
          >
            {images.map((img, idx) => (
              <Pressable
                key={idx}
                onPress={() => scrollToImage(idx)}
                style={[
                  styles.thumbnailWrapper,
                  mainImageScrollIndex === idx && styles.thumbnailActive,
                ]}
              >
                <Image source={{ uri: img }} style={styles.thumbnail} />
                {mainImageScrollIndex === idx && (
                  <View style={styles.thumbnailOverlay} />
                )}
              </Pressable>
            ))}
          </ScrollView>
        )}

        {/* Left/Right navigation arrows for desktop/web */}
        {images.length > 1 && width > 768 && (
          <>
            {mainImageScrollIndex > 0 && (
              <TouchableOpacity
                style={[styles.navArrow, styles.navArrowLeft]}
                onPress={() => scrollToImage(mainImageScrollIndex - 1)}
                activeOpacity={0.7}
              >
                <Ionicons name="chevron-back" size={30} color="#fff" />
              </TouchableOpacity>
            )}
            {mainImageScrollIndex < images.length - 1 && (
              <TouchableOpacity
                style={[styles.navArrow, styles.navArrowRight]}
                onPress={() => scrollToImage(mainImageScrollIndex + 1)}
                activeOpacity={0.7}
              >
                <Ionicons name="chevron-forward" size={30} color="#fff" />
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
    );
  };

  const renderFullImageModal = () => {
    const onScrollEnd = (e) => {
      const index = Math.round(e.nativeEvent.contentOffset.x / width);
      if (index >= 0 && index < images.length) {
        setSelectedImageIndex(index);
      }
    };

    const renderImageItem = ({ item }) => (
      <View style={styles.modalImageContainer}>
        <Image
          source={{ uri: item }}
          style={styles.fullImage}
          resizeMode="contain"
        />
      </View>
    );

    return (
      <Modal 
        visible={imageModalVisible} 
        transparent={true}
        animationType="fade"
        onRequestClose={() => setImageModalVisible(false)}
      >
        <View style={styles.fullImageModal}>
          {/* Close button */}
          <TouchableOpacity
            style={styles.closeModalBtn}
            onPress={() => setImageModalVisible(false)}
            activeOpacity={0.7}
            hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
          >
            <View style={styles.closeButtonBackground}>
              <Ionicons name="close" size={28} color="#fff" />
            </View>
          </TouchableOpacity>

          {images.length > 1 && (
            <View style={styles.modalImageCounter} pointerEvents="none">
              <View style={styles.counterBackground}>
                <Text style={styles.modalImageCounterText}>
                  {selectedImageIndex + 1} / {images.length}
                </Text>
              </View>
            </View>
          )}

          <FlatList
            ref={flatListRef}
            data={images}
            renderItem={renderImageItem}
            keyExtractor={(_, index) => `modal_${index}`}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onScrollEnd}
            initialScrollIndex={selectedImageIndex}
            getItemLayout={(data, index) => ({
              length: width,
              offset: width * index,
              index,
            })}
            removeClippedSubviews={true}
            maxToRenderPerBatch={3}
            decelerationRate="fast"
            snapToInterval={width}
            snapToAlignment="start"
          />
        </View>
      </Modal>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View
          style={[styles.header, { paddingTop: Math.max(insets.top, 8) + 10 }]}
        >
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={22} color="#0f172a" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {isMart ? "Item Details" : "Menu Details"}
          </Text>
          <View style={styles.headerActions} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#00b14f" />
          <Text style={styles.loadingText}>
            Loading {isMart ? "item" : "menu"} details...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!item) {
    return (
      <SafeAreaView style={styles.safe}>
        <View
          style={[styles.header, { paddingTop: Math.max(insets.top, 8) + 10 }]}
        >
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={22} color="#0f172a" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {isMart ? "Item Details" : "Menu Details"}
          </Text>
          <View style={styles.headerActions} />
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={60} color="#ef4444" />
          <Text style={styles.errorText}>
            {isMart ? "Item not found" : "Menu item not found"}
          </Text>
          <TouchableOpacity
            style={styles.goBackBtn}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.goBackBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      <View
        style={[styles.header, { paddingTop: Math.max(insets.top, 8) + 10 }]}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={22} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Details</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={handleShare}
            style={styles.actionBtn}
            activeOpacity={0.7}
          >
            <Ionicons name="share-outline" size={20} color="#0f172a" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleEdit}
            style={styles.actionBtn}
            activeOpacity={0.7}
          >
            <Ionicons name="create-outline" size={20} color="#0f172a" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {renderImageCarousel()}

        <View style={styles.content}>
          {/* Category */}
          {item?.category && item.category !== "Uncategorized" && (
            <View style={styles.categoryContainer}>
              <Ionicons name="folder-outline" size={14} color="#64748b" />
              <Text style={styles.category}>{item.category}</Text>
            </View>
          )}

          {/* Title */}
          <Text style={styles.name}>{item?.name}</Text>

          {/* Highlights/Badges */}
          {renderProductHighlights()}

          {/* Price Card */}
          {renderPriceCard()}

          {/* Description */}
          {renderDescription()}

          {/* Product Specifications */}
          {renderProductSpecifications()}

          {/* Additional Info */}
          {(item?.createdAt || item?.updatedAt) && (
            <View style={styles.metaSection}>
              <Ionicons name="time-outline" size={12} color="#94a3b8" />
              <Text style={styles.metaText}>
                Added: {new Date(item.createdAt).toLocaleDateString()}
              </Text>
              {item.updatedAt !== item.createdAt && (
                <Text style={styles.metaText}>
                  Last updated: {new Date(item.updatedAt).toLocaleDateString()}
                </Text>
              )}
            </View>
          )}
        </View>
      </ScrollView>

      <View style={[styles.actionBar, { paddingBottom: insets.bottom || 16 }]}>
        <TouchableOpacity
          style={styles.editButton}
          onPress={handleEdit}
          activeOpacity={0.8}
        >
          <Ionicons name="create-outline" size={20} color="#fff" />
          <Text style={styles.editButtonText}>
            Edit {isMart ? "Item" : "Menu"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={handleDelete}
          activeOpacity={0.8}
        >
          <Ionicons name="trash-outline" size={20} color="#ef4444" />
          <Text style={styles.deleteButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>

      {renderFullImageModal()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#ffffff" },

  scrollContent: {
    flexGrow: 1,
  },

  header: {
    minHeight: 52,
    paddingHorizontal: 12,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    backgroundColor: "#fff",
    zIndex: 1,
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

  headerActions: {
    flexDirection: "row",
    gap: 4,
  },

  actionBtn: {
    height: 40,
    width: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },

  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  loadingText: {
    fontSize: 14,
    color: "#64748b",
  },
  errorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingHorizontal: 32,
  },
  errorText: {
    fontSize: 16,
    color: "#ef4444",
    textAlign: "center",
  },
  goBackBtn: {
    backgroundColor: "#00b14f",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  goBackBtnText: {
    color: "#fff",
    fontWeight: "600",
  },

  carouselWrapper: {
    position: "relative",
  },
  imageCarousel: {
    height: width * 0.8,
  },
  imageContainer: {
    width: width,
    height: width * 0.8,
  },
  mainImage: {
    width: width,
    height: width * 0.8,
    backgroundColor: "#f1f5f9",
  },
  imagePlaceholder: {
    width: width,
    height: width * 0.8,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
  },
  noImageText: {
    marginTop: 12,
    color: "#94a3b8",
    fontSize: 14,
  },
  imageCountBadge: {
    position: "absolute",
    bottom: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.75)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    zIndex: 10,
  },
  imageCountText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  thumbnailScroll: {
    position: "absolute",
    bottom: 16,
    left: 0,
    right: 0,
  },
  thumbnailContainer: {
    paddingHorizontal: 16,
    gap: 8,
  },
  thumbnailWrapper: {
    width: 50,
    height: 50,
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.9)",
    position: "relative",
  },
  thumbnailActive: {
    borderColor: "#00b14f",
  },
  thumbnailOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,177,79,0.2)",
  },
  thumbnail: {
    width: "100%",
    height: "100%",
    backgroundColor: "#e2e8f0",
  },
  navArrow: {
    position: "absolute",
    top: "50%",
    transform: [{ translateY: -25 }],
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 20,
  },
  navArrowLeft: {
    left: 16,
  },
  navArrowRight: {
    right: 16,
  },

  content: {
    padding: 20,
  },
  categoryContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  category: {
    fontSize: 13,
    color: "#64748b",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  name: {
    fontSize: 24,
    fontWeight: "800",
    color: "#0f172a",
    lineHeight: 32,
    marginBottom: 12,
  },

  highlightsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  highlightBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  highlightText: {
    fontSize: 12,
    fontWeight: "600",
  },

  priceCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginBottom: 20,
    overflow: "hidden",
  },
  priceCardHeader: {
    padding: 14,
    backgroundColor: "#f8fafc",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  priceCardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
  },
  priceCardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  priceCardLabel: {
    fontSize: 13,
    color: "#64748b",
  },
  priceCardValue: {
    fontSize: 13,
    color: "#0f172a",
    fontWeight: "500",
  },
  totalRow: {
    backgroundColor: "#fafcff",
    borderBottomWidth: 0,
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
  },
  totalPrice: {
    fontSize: 18,
    fontWeight: "800",
    color: "#00b14f",
  },
  savingsInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 12,
    backgroundColor: "#f0fdf4",
    marginTop: 4,
  },
  savingsInfoText: {
    fontSize: 12,
    color: "#10b981",
    fontWeight: "500",
  },

  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 12,
  },
  description: {
    fontSize: 14,
    color: "#475569",
    lineHeight: 22,
  },
  descriptionMuted: {
    fontSize: 14,
    color: "#94a3b8",
    fontStyle: "italic",
  },
  readMore: {
    color: "#00b14f",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 8,
  },

  specsGrid: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden",
  },
  specItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  specItemLast: {
    borderBottomWidth: 0,
  },
  specIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#dcfce7",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  specContent: {
    flex: 1,
  },
  specLabel: {
    fontSize: 12,
    color: "#64748b",
    marginBottom: 2,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  specValue: {
    fontSize: 14,
    color: "#0f172a",
    fontWeight: "500",
  },

  metaSection: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  metaText: {
    fontSize: 11,
    color: "#94a3b8",
  },

  actionBar: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    marginBottom: 12,
  },
  editButton: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#00b14f",
    paddingVertical: 14,
    borderRadius: 12,
  },
  editButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  deleteButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#fff",
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#fee2e2",
  },
  deleteButtonText: {
    color: "#ef4444",
    fontWeight: "700",
    fontSize: 16,
  },

  fullImageModal: {
    flex: 1,
    backgroundColor: "#000",
  },
  modalSafeArea: {
    flex: 1,
  },
  closeModalBtn: {
    position: "absolute",
    top: 40,
    right: 20,
    zIndex: 999,
    elevation: 10,
  },
  closeButtonBackground: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalImageCounter: {
    position: "absolute",
    top: 40,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 998,
  },
  counterBackground: {
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  modalImageCounterText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  modalImageContainer: {
    width: width,
    height: height,
    justifyContent: "center",
    alignItems: "center",
  },
  fullImage: {
    width: width,
    height: height * 0.85,
  },
});