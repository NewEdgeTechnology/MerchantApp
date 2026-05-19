// screens/OrderDetails/components/ItemsBlock.js
import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  Image,
  StyleSheet,
} from "react-native";
import { styles } from "./orderDetailsStyles";
import { RowTitle } from "./OrderAtoms";
import { toText } from "./orderDetailsUtils";
import { Ionicons } from "@expo/vector-icons";

// Import from @env
import {
  ITEM_IMAGE_ENDPOINT, // https://backend.tabdhey.bt/mart
  MENU_IMAGE_ENDPOINT, // https://backend.tabdhey.bt/food
} from "@env";

// Map button styles/text to icons for the card modal
const getButtonIcon = (button) => {
  const text = (button.text || "").toLowerCase();
  if (
    button.style === "destructive" ||
    text.includes("remove") ||
    text.includes("delete")
  )
    return "trash-outline";
  if (text.includes("chat") || text.includes("discuss"))
    return "chatbubble-outline";
  if (text.includes("replace") || text.includes("change"))
    return "refresh-outline";
  if (text.includes("available") || text.includes("mark"))
    return "checkmark-circle-outline";
  if (text.includes("cancel")) return null;
  return "ellipse-outline";
};

const getButtonColor = (button) => {
  if (button.style === "cancel") return null; // uses cancel style
  if (button.style === "destructive") return "#dc2626";
  const text = (button.text || "").toLowerCase();
  if (text.includes("chat") || text.includes("discuss")) return "#3b82f6";
  if (text.includes("replace") || text.includes("change")) return "#10b981";
  if (text.includes("available") || text.includes("mark")) return "#10b981";
  return "#3b82f6";
};

export default function ItemsBlock({
  items = [],
  status,
  ifUnavailableMode,
  unavailableMap = {},
  replacementMap = {},
  onToggleUnavailable,
  onMarkItemUnavailable,
  onOpenSimilarCatalog,
  onChatWithCustomer,
  money,
  ownerType,
  deliveryFee = 0, // ✅ Add deliveryFee prop
}) {
  const canEdit = (status || "").toUpperCase() === "PENDING";

  // State for unavailable confirmation modal
  const [unavailableModalVisible, setUnavailableModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedItemKey, setSelectedItemKey] = useState(null);
  const [unavailableReason, setUnavailableReason] = useState("");
  const [loading, setLoading] = useState(false);

  // State for custom action modal (replaces Alert)
  const [actionModalVisible, setActionModalVisible] = useState(false);
  const [actionItem, setActionItem] = useState(null);
  const [actionItemKey, setActionItemKey] = useState(null);

  // State for card-style alert modal (replaces native iOS alert)
  const [nativeAlertVisible, setNativeAlertVisible] = useState(false);
  const [nativeAlertData, setNativeAlertData] = useState({
    title: "",
    message: "",
    buttons: [],
  });

  let hint = null;
  if (canEdit) {
    if (ifUnavailableMode === "REPLACE") {
      hint =
        "Tap an item to mark it unavailable and choose a similar item. Or tap 💬 to discuss with customer.";
    } else if (ifUnavailableMode === "REMOVE") {
      hint =
        "Tap an item to remove it from this order. Customer will be notified. Or tap 💬 to discuss with customer.";
    } else {
      hint = "Tap an item to mark it unavailable.";
    }
  }

  // Calculate item totals
  const calculateItemTotal = (item) => {
    const price = Number(item.unit_price || item.price || 0);
    const qty = Number(item.qty || item.quantity || 1);
    return price * qty;
  };

  const formatMoney = (amount) => {
    if (money) return money(amount, "BTN");
    return `BTN ${Number(amount || 0).toFixed(2)}`;
  };

  // ✅ Calculate items total (excluding unavailable items)
  const calculateItemsTotal = () => {
    let total = 0;
    items.forEach((it) => {
      const key = it._key;
      const isUnavailable = !!unavailableMap[key];
      const hasReplacement = !!replacementMap?.[key];
      
      // Skip if item is unavailable without replacement in REPLACE mode
      if (ifUnavailableMode === "REPLACE" && isUnavailable && !hasReplacement) {
        return;
      }
      // Skip if item is removed in REMOVE mode
      if (ifUnavailableMode === "REMOVE" && isUnavailable) {
        return;
      }
      
      const price = Number(it.unit_price || it.price || 0);
      const qty = Number(it.qty || it.quantity || 1);
      total += price * qty;
    });
    return total;
  };

  const itemsTotal = calculateItemsTotal();
  const grandTotal = itemsTotal + deliveryFee;

  // Helper function to get the base URL based on service type
  const getImageBaseUrl = (item) => {
    const serviceType = item.service_type || ownerType || "";
    const isMart = serviceType.toUpperCase() === "MART";
    const isFood = serviceType.toUpperCase() === "FOOD";

    const imagePath = item.item_image || "";
    const hasMartInPath =
      imagePath.includes("/mart/") || imagePath.includes("mart-menu");
    const hasFoodInPath =
      imagePath.includes("/food/") || imagePath.includes("food-menu");

    if (isMart || hasMartInPath) {
      return ITEM_IMAGE_ENDPOINT || "https://backend.tabdhey.bt/mart";
    }

    if (isFood || hasFoodInPath) {
      return MENU_IMAGE_ENDPOINT || "https://backend.tabdhey.bt/food";
    }

    return ITEM_IMAGE_ENDPOINT || "https://backend.tabdhey.bt/mart";
  };

  const getItemImage = (item) => {
    let imagePath =
      item.item_image ||
      item.image_url ||
      item.imageUrl ||
      item.image ||
      item.photo_url ||
      item.photo ||
      item.image_url_thumbnail ||
      null;

    if (!imagePath) return null;

    if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
      return imagePath;
    }

    const baseUrl = getImageBaseUrl(item);
    const cleanPath = imagePath.startsWith("/")
      ? imagePath.slice(1)
      : imagePath;
    return `${baseUrl}/${cleanPath}`;
  };

  const handleCloseActionModal = () => {
    setActionModalVisible(false);
    setActionItem(null);
    setActionItemKey(null);
  };

  const handleCloseUnavailableModal = () => {
    setUnavailableModalVisible(false);
    setSelectedItem(null);
    setSelectedItemKey(null);
    setUnavailableReason("");
  };

  const handleCloseNativeAlert = () => {
    setNativeAlertVisible(false);
    setNativeAlertData({ title: "", message: "", buttons: [] });
  };

  const showCustomAlert = (title, message, buttons) => {
    setNativeAlertData({ title, message, buttons });
    setNativeAlertVisible(true);
  };

  const handleMarkUnavailableConfirm = async () => {
    if (!selectedItem || !selectedItemKey) return;

    setLoading(true);
    try {
      if (onMarkItemUnavailable) {
        console.log("[ItemsBlock] Calling onMarkItemUnavailable with forceRemove=true for item:", selectedItem.item_name);
        await onMarkItemUnavailable(
          selectedItemKey,
          selectedItem,
          unavailableReason,
          null,
          true,
          true,
        );
      } else {
        onToggleUnavailable?.(selectedItemKey);
      }
      handleCloseUnavailableModal();
    } catch (error) {
      Alert.alert("Error", error.message || "Failed to remove item");
    } finally {
      setLoading(false);
    }
  };

  const handlePressItem = (item) => {
    const key = item._key || String(item.item_id || item.id || "");
    if (!key) return;
    if (!canEdit) return;

    const itemName = toText(item.item_name || item.name || "Item");

    const isUnavailable = !!unavailableMap[key];
    const hasReplacement = !!replacementMap?.[key];

    // For REMOVE mode - direct removal
    if (ifUnavailableMode === "REMOVE" && !isUnavailable) {
      setSelectedItem(item);
      setSelectedItemKey(key);
      setUnavailableModalVisible(true);
      return;
    }

    // For REPLACE mode - show custom modal with options
    if (ifUnavailableMode === "REPLACE") {
      const isAlreadyProcessed = hasReplacement || isUnavailable;

      if (!isAlreadyProcessed) {
        setActionItem(item);
        setActionItemKey(key);
        setActionModalVisible(true);
        return;
      }

      // If already has replacement or is unavailable - show card-style alert
      const buttons = [
        {
          text: "Chat with Customer",
          icon: "chatbubble-outline",
          color: "#3b82f6",
          onPress: () => onChatWithCustomer?.(item),
        },
      ];

      if (hasReplacement) {
        buttons.push({
          text: "Change Replacement",
          icon: "refresh-outline",
          color: "#10b981",
          onPress: () => onOpenSimilarCatalog?.(item),
        });
        buttons.push({
          text: "Remove Item",
          style: "destructive",
          icon: "trash-outline",
          color: "#dc2626",
          onPress: () => {
            setSelectedItem(item);
            setSelectedItemKey(key);
            setUnavailableModalVisible(true);
          },
        });
      } else if (isUnavailable && !hasReplacement) {
        buttons.push({
          text: "Mark as Available",
          icon: "checkmark-circle-outline",
          color: "#10b981",
          onPress: () => onToggleUnavailable(key),
        });
      }

      buttons.push({ text: "Cancel", style: "cancel" });

      showCustomAlert(
        `Item: ${itemName}`,
        "What would you like to do?",
        buttons,
      );
      return;
    }

    // For REMOVE mode - show mark as available if already removed
    if (ifUnavailableMode === "REMOVE" && isUnavailable) {
      showCustomAlert(
        `Item: ${itemName}`,
        "This item is already marked as removed.",
        [
          {
            text: "Mark as Available",
            icon: "checkmark-circle-outline",
            color: "#10b981",
            onPress: () => onToggleUnavailable(key),
          },
          {
            text: "Chat with Customer",
            icon: "chatbubble-outline",
            color: "#3b82f6",
            onPress: () => onChatWithCustomer?.(item),
          },
          { text: "Cancel", style: "cancel" },
        ],
      );
      return;
    }
  };

  return (
    <>
      <View style={styles.block}>
        <RowTitle title="Items" />
        {hint ? (
          <Text style={[styles.segmentHint, { marginBottom: 8 }]}>{hint}</Text>
        ) : null}

        {(items || []).map((it, idx) => {
          const key = it._key || String(it.item_id || it.id || idx);
          const isUnavailable = !!unavailableMap[key];
          const replacement = replacementMap?.[key];
          const price = Number(it.unit_price || it.price || 0);
          const qty = Number(it.qty || it.quantity || 1);
          const itemTotal = price * qty;
          const itemImage = getItemImage(it);

          const container = canEdit ? Pressable : View;
          const ContainerComp = container;

          const nameStyle = [styles.itemName];
          if (isUnavailable && ifUnavailableMode === "REMOVE") {
            nameStyle.push({
              textDecorationLine: "line-through",
              color: "#ef4444",
            });
          }

          let statusBadge = null;
          if (canEdit && ifUnavailableMode === "REPLACE") {
            if (replacement) {
              statusBadge = {
                text: "🔄 Replaced",
                style: styles.replacedBadge,
              };
            } else if (isUnavailable) {
              statusBadge = {
                text: "⚠️ Unavailable",
                style: styles.unavailableBadge,
              };
            }
          } else if (
            canEdit &&
            ifUnavailableMode === "REMOVE" &&
            isUnavailable
          ) {
            statusBadge = { text: "✓ Removed", style: styles.removedBadge };
          }

          return (
            <ContainerComp
              key={key}
              style={[
                styles.itemRow,
                canEdit && styles.itemPressable,
                replacement && styles.itemReplacedRow,
                isUnavailable &&
                  ifUnavailableMode === "REMOVE" &&
                  styles.itemRemovedRow,
              ]}
              onPress={canEdit ? () => handlePressItem(it) : undefined}
            >
              <View style={styles.itemImageContainer}>
                {itemImage ? (
                  <Image
                    source={{ uri: itemImage }}
                    style={styles.itemImage}
                    defaultSource={require("../../../assets/placeholder.png")}
                    onError={(e) => {
                      console.log(
                        "Image load error for:",
                        itemImage,
                        e.nativeEvent.error,
                      );
                    }}
                  />
                ) : (
                  <View style={styles.itemImagePlaceholder}>
                    <Ionicons name="image-outline" size={24} color="#94a3b8" />
                  </View>
                )}
              </View>

              <View style={{ flex: 1 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <Text style={nameStyle}>
                    {toText(it.item_name || it.name || "Item")}
                  </Text>
                  {statusBadge && (
                    <View style={[styles.statusBadge, statusBadge.style]}>
                      <Text style={styles.statusBadgeText}>
                        {statusBadge.text}
                      </Text>
                    </View>
                  )}
                </View>

                <Text style={styles.itemPrice}>
                  {formatMoney(price)} × {qty} = {formatMoney(itemTotal)}
                </Text>

                {replacement && (
                  <Text style={styles.itemReplacement}>
                    → {toText(replacement.name || replacement.item_name || "")}
                  </Text>
                )}

                {canEdit && onChatWithCustomer && (
                  <Pressable
                    style={styles.chatButton}
                    onPress={() => onChatWithCustomer(it)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.chatButtonText}>
                      💬 Discuss with customer
                    </Text>
                  </Pressable>
                )}
              </View>

              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.itemQty}>
                  ×{Number.isFinite(qty) ? qty : 1}
                </Text>

                {isUnavailable &&
                  ifUnavailableMode === "REMOVE" &&
                  !replacement && (
                    <Text style={styles.unavailableTag}>Removed</Text>
                  )}
              </View>
            </ContainerComp>
          );
        })}

        {/* ✅ Totals Section with Delivery Fee */}
        <View style={localStyles.totalsContainer}>
          <View style={localStyles.totalRow}>
            <Text style={localStyles.totalLabel}>Subtotal:</Text>
            <Text style={localStyles.totalAmount}>{formatMoney(itemsTotal)}</Text>
          </View>
          
          {deliveryFee > 0 && (
            <View style={localStyles.totalRow}>
              <Text style={localStyles.totalLabel}>Delivery Fee:</Text>
              <Text style={localStyles.totalAmount}>{formatMoney(deliveryFee)}</Text>
            </View>
          )}
          
          <View style={[localStyles.totalRow, localStyles.grandTotalRow]}>
            <Text style={localStyles.grandTotalLabel}>Total:</Text>
            <Text style={localStyles.grandTotalAmount}>{formatMoney(grandTotal)}</Text>
          </View>
        </View>
      </View>

      {/* Custom Action Modal - Item Options */}
      <Modal
        visible={actionModalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCloseActionModal}
      >
        <View style={modalStyles.overlay}>
          <Pressable
            style={modalStyles.backdrop}
            onPress={handleCloseActionModal}
          />
          <View style={modalStyles.content}>
            <View style={modalStyles.header}>
              <View style={modalStyles.headerLeft}>
                <Ionicons
                  name="help-circle-outline"
                  size={24}
                  color="#3b82f6"
                />
                <Text style={modalStyles.title}>Item Options</Text>
              </View>
              <Pressable
                onPress={handleCloseActionModal}
                style={modalStyles.closeButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={24} color="#64748b" />
              </Pressable>
            </View>

            {actionItem && (
              <>
                <Text style={modalStyles.itemName}>
                  {toText(actionItem.item_name || actionItem.name || "Item")}
                </Text>
                <Text style={modalStyles.itemPriceDetail}>
                  {formatMoney(
                    Number(actionItem.unit_price || actionItem.price || 0),
                  )}{" "}
                  × {Number(actionItem.qty || actionItem.quantity || 1)}
                </Text>
                <View style={modalStyles.actionButtons}>
                  <Pressable
                    style={[
                      modalStyles.actionButton,
                      modalStyles.chatActionButton,
                    ]}
                    onPress={() => {
                      handleCloseActionModal();
                      if (onChatWithCustomer) {
                        onChatWithCustomer(actionItem);
                      }
                    }}
                  >
                    <Ionicons
                      name="chatbubble-outline"
                      size={20}
                      color="#fff"
                    />
                    <Text style={modalStyles.actionButtonText}>
                      Chat with Customer
                    </Text>
                  </Pressable>

                  <Pressable
                    style={[
                      modalStyles.actionButton,
                      modalStyles.replaceActionButton,
                    ]}
                    onPress={() => {
                      handleCloseActionModal();
                      onToggleUnavailable(actionItemKey);
                      if (typeof onOpenSimilarCatalog === "function") {
                        onOpenSimilarCatalog(actionItem);
                      }
                    }}
                  >
                    <Ionicons name="refresh-outline" size={20} color="#fff" />
                    <Text style={modalStyles.actionButtonText}>
                      Find Replacement
                    </Text>
                  </Pressable>

                  <Pressable
                    style={[
                      modalStyles.actionButton,
                      modalStyles.removeActionButton,
                    ]}
                    onPress={() => {
                      handleCloseActionModal();
                      setSelectedItem(actionItem);
                      setSelectedItemKey(actionItemKey);
                      setUnavailableModalVisible(true);
                    }}
                  >
                    <Ionicons name="trash-outline" size={20} color="#fff" />
                    <Text style={modalStyles.actionButtonText}>
                      Remove Item
                    </Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Remove Confirmation Modal */}
      <Modal
        visible={unavailableModalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCloseUnavailableModal}
      >
        <View style={modalStyles.overlay}>
          <Pressable
            style={modalStyles.backdrop}
            onPress={handleCloseUnavailableModal}
          />
          <View style={modalStyles.content}>
            <View style={modalStyles.header}>
              <View style={modalStyles.headerLeft}>
                <Ionicons
                  name="alert-circle-outline"
                  size={24}
                  color="#dc2626"
                />
                <Text style={modalStyles.title}>Remove Item</Text>
              </View>
              <Pressable
                onPress={handleCloseUnavailableModal}
                style={modalStyles.closeButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={24} color="#64748b" />
              </Pressable>
            </View>

            {selectedItem && (
              <>
                <Text style={modalStyles.itemName}>
                  {toText(
                    selectedItem.item_name || selectedItem.name || "Item",
                  )}
                </Text>

                <View style={modalStyles.priceBreakdown}>
                  <View style={modalStyles.priceRow}>
                    <Text style={modalStyles.priceLabel}>Price per unit:</Text>
                    <Text style={modalStyles.priceValue}>
                      {formatMoney(
                        Number(
                          selectedItem.unit_price || selectedItem.price || 0,
                        ),
                      )}
                    </Text>
                  </View>
                  <View style={modalStyles.priceRow}>
                    <Text style={modalStyles.priceLabel}>Quantity:</Text>
                    <Text style={modalStyles.priceValue}>
                      ×{Number(selectedItem.qty || selectedItem.quantity || 1)}
                    </Text>
                  </View>
                  <View style={[modalStyles.priceRow, modalStyles.totalRow]}>
                    <Text style={modalStyles.totalLabel}>Item Total:</Text>
                    <Text style={modalStyles.totalValue}>
                      {formatMoney(calculateItemTotal(selectedItem))}
                    </Text>
                  </View>
                </View>

                <Text style={modalStyles.label}>Reason (optional):</Text>
                <TextInput
                  style={modalStyles.input}
                  value={unavailableReason}
                  onChangeText={setUnavailableReason}
                  placeholder="e.g., Item out of stock, Cannot prepare..."
                  placeholderTextColor="#94a3b8"
                  multiline
                  numberOfLines={3}
                />

                <Text style={modalStyles.note}>
                  ⚠️ This item will be REMOVED from the order. The customer will
                  be notified via chat with the updated total.
                </Text>

                <View style={modalStyles.buttons}>
                  <Pressable
                    style={[modalStyles.button, modalStyles.cancelButton]}
                    onPress={handleCloseUnavailableModal}
                  >
                    <Text style={modalStyles.cancelButtonText}>Cancel</Text>
                  </Pressable>

                  <Pressable
                    style={[modalStyles.button, modalStyles.confirmButton]}
                    onPress={handleMarkUnavailableConfirm}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="trash-outline" size={18} color="#fff" />
                        <Text style={modalStyles.confirmButtonText}>
                          Remove Item
                        </Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Card-style Alert Modal */}
      <Modal
        visible={nativeAlertVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCloseNativeAlert}
      >
        <View style={modalStyles.overlay}>
          <Pressable
            style={modalStyles.backdrop}
            onPress={handleCloseNativeAlert}
          />
          <View style={modalStyles.content}>
            <View style={modalStyles.header}>
              <View style={modalStyles.headerLeft}>
                <Ionicons
                  name="information-circle-outline"
                  size={24}
                  color="#3b82f6"
                />
                <Text style={modalStyles.title} numberOfLines={2}>
                  {nativeAlertData.title}
                </Text>
              </View>
              <Pressable
                onPress={handleCloseNativeAlert}
                style={modalStyles.closeButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={24} color="#64748b" />
              </Pressable>
            </View>

            {nativeAlertData.message ? (
              <Text style={modalStyles.itemPriceDetail}>
                {nativeAlertData.message}
              </Text>
            ) : null}

            <View style={modalStyles.actionButtons}>
              {nativeAlertData.buttons
                .filter((b) => b.style !== "cancel")
                .map((button, index) => {
                  const icon = button.icon || getButtonIcon(button);
                  const color = button.color || getButtonColor(button);
                  return (
                    <Pressable
                      key={index}
                      style={[
                        modalStyles.actionButton,
                        { backgroundColor: color },
                      ]}
                      onPress={() => {
                        handleCloseNativeAlert();
                        if (button.onPress) button.onPress();
                      }}
                    >
                      {icon && <Ionicons name={icon} size={20} color="#fff" />}
                      <Text style={modalStyles.actionButtonText}>
                        {button.text}
                      </Text>
                    </Pressable>
                  );
                })}
            </View>

            {nativeAlertData.buttons.some((b) => b.style === "cancel") && (
              <Pressable
                style={[
                  modalStyles.actionButton,
                  { backgroundColor: "#f1f5f9", marginTop: 4 },
                ]}
                onPress={() => {
                  const cancelBtn = nativeAlertData.buttons.find(
                    (b) => b.style === "cancel",
                  );
                  handleCloseNativeAlert();
                  if (cancelBtn?.onPress) cancelBtn.onPress();
                }}
              >
                <Text
                  style={[modalStyles.actionButtonText, { color: "#64748b" }]}
                >
                  {nativeAlertData.buttons.find((b) => b.style === "cancel")
                    ?.text || "Cancel"}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

// Local styles for totals section
const localStyles = {
  totalsContainer: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  totalLabel: {
    fontSize: 14,
    color: "#64748b",
  },
  totalAmount: {
    fontSize: 14,
    color: "#0f172a",
    fontWeight: "500",
  },
  grandTotalRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  grandTotalLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
  },
  grandTotalAmount: {
    fontSize: 16,
    fontWeight: "800",
    color: "#dc2626",
  },
};

// Modal styles for Item Options, Remove Item, and Card Alert modals
const modalStyles = {
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  content: {
    width: "85%",
    maxWidth: 400,
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    paddingRight: 8,
  },
  closeButton: {
    padding: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
    flexShrink: 1,
  },
  itemName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 4,
  },
  itemPriceDetail: {
    fontSize: 14,
    color: "#64748b",
    marginBottom: 20,
  },
  priceBreakdown: {
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  priceLabel: {
    color: "#64748b",
    fontWeight: "500",
  },
  priceValue: {
    color: "#0f172a",
    fontWeight: "600",
  },
  totalRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0f172a",
  },
  totalValue: {
    fontSize: 16,
    fontWeight: "900",
    color: "#dc2626",
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0f172a",
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: "#0f172a",
    minHeight: 80,
    textAlignVertical: "top",
    marginBottom: 12,
  },
  note: {
    fontSize: 12,
    color: "#f59e0b",
    backgroundColor: "#fef3c7",
    padding: 8,
    borderRadius: 8,
    marginBottom: 20,
  },
  actionButtons: {
    gap: 12,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  chatActionButton: {
    backgroundColor: "#3b82f6",
  },
  replaceActionButton: {
    backgroundColor: "#10b981",
  },
  removeActionButton: {
    backgroundColor: "#dc2626",
  },
  actionButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  buttons: {
    flexDirection: "row",
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  cancelButton: {
    backgroundColor: "#f1f5f9",
  },
  cancelButtonText: {
    color: "#64748b",
    fontWeight: "600",
  },
  confirmButton: {
    backgroundColor: "#dc2626",
  },
  confirmButtonText: {
    color: "#fff",
    fontWeight: "700",
  },
};