// screens/OrderDetails/components/ItemsBlock.js
import React from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { styles } from './orderDetailsStyles';
import { RowTitle } from './OrderAtoms';
import { toText } from './orderDetailsUtils';

export default function ItemsBlock({
  items = [],
  status,
  ifUnavailableMode,
  unavailableMap = {},
  replacementMap = {},
  onToggleUnavailable,
  onOpenSimilarCatalog,
  onChatWithCustomer, // ✅ New prop
}) {
  const canEdit = (status || '').toUpperCase() === 'PENDING';

  let hint = null;
  if (canEdit) {
    if (ifUnavailableMode === 'REPLACE') {
      hint = 'Tap an item to mark it unavailable and choose a similar item. Or tap 💬 to discuss with customer.';
    } else if (ifUnavailableMode === 'REMOVE') {
      hint = 'Tap an item to remove it from this order. Or tap 💬 to discuss with customer.';
    } else {
      hint = 'Tap an item to mark it unavailable.';
    }
  }

  const handlePressItem = (item) => {
    const key = item._key || String(item.item_id || item.id || '');
    if (!key) return;

    if (!canEdit || !onToggleUnavailable) return;

    // Show options menu instead of directly marking unavailable
    const itemName = toText(item.item_name || item.name || 'Item');
    const isUnavailable = !!unavailableMap[key];
    const hasReplacement = !!replacementMap?.[key];

    const options = [
      {
        text: "💬 Chat with Customer",
        onPress: () => {
          if (onChatWithCustomer) {
            onChatWithCustomer(item);
          } else {
            Alert.alert("Not Available", "Chat feature is not available for this order.");
          }
        }
      }
    ];

    // Add replacement options if in REPLACE mode
    if (ifUnavailableMode === 'REPLACE') {
      if (!hasReplacement && !isUnavailable) {
        options.push({
          text: "🔄 Find Replacement",
          onPress: () => {
            onToggleUnavailable(key);
            if (typeof onOpenSimilarCatalog === 'function') {
              onOpenSimilarCatalog(item);
            }
          }
        });
      } else if (hasReplacement) {
        options.push({
          text: "📝 Change Replacement",
          onPress: () => {
            if (typeof onOpenSimilarCatalog === 'function') {
              onOpenSimilarCatalog(item);
            }
          }
        });
        options.push({
          text: "❌ Cancel Replacement",
          onPress: () => onToggleUnavailable(key)
        });
      } else if (isUnavailable && !hasReplacement) {
        options.push({
          text: "✅ Mark as Available",
          onPress: () => onToggleUnavailable(key)
        });
      }
    }

    // Add remove options if in REMOVE mode
    if (ifUnavailableMode === 'REMOVE') {
      if (isUnavailable) {
        options.push({
          text: "✅ Mark as Available",
          onPress: () => onToggleUnavailable(key)
        });
      } else {
        options.push({
          text: "❌ Mark as Unavailable (Remove)",
          onPress: () => onToggleUnavailable(key)
        });
      }
    }

    Alert.alert(
      `Item: ${itemName}`,
      `What would you like to do with this item?`,
      [
        { text: "Cancel", style: "cancel" },
        ...options
      ]
    );
  };

  return (
    <View style={styles.block}>
      <RowTitle title="Items" />
      {hint ? (
        <Text style={[styles.segmentHint, { marginBottom: 8 }]}>
          {hint}
        </Text>
      ) : null}

      {(items || []).map((it, idx) => {
        const key = it._key || String(it.item_id || it.id || idx);
        const isUnavailable = !!unavailableMap[key];
        const replacement = replacementMap?.[key];

        const qty = Number(
          it.qty ??
          it.quantity ??
          it.quantity_ordered ??
          it.order_qty ??
          1
        );

        const container = canEdit ? Pressable : View;
        const ContainerComp = container;

        const nameStyle = [styles.itemName];
        if (isUnavailable && ifUnavailableMode === 'REMOVE') {
          nameStyle.push({
            textDecorationLine: 'line-through',
            color: '#ef4444',
          });
        }

        // Status badge color
        let statusBadge = null;
        if (canEdit && ifUnavailableMode === 'REPLACE') {
          if (replacement) {
            statusBadge = { text: '🔄 Replaced', style: styles.replacedBadge };
          } else if (isUnavailable) {
            statusBadge = { text: '⚠️ Unavailable', style: styles.unavailableBadge };
          }
        } else if (canEdit && ifUnavailableMode === 'REMOVE' && isUnavailable) {
          statusBadge = { text: '✓ Removed', style: styles.removedBadge };
        }

        return (
          <ContainerComp
            key={key}
            style={[
              styles.itemRow,
              canEdit && styles.itemPressable,
              replacement && styles.itemReplacedRow,
              isUnavailable && ifUnavailableMode === 'REMOVE' && styles.itemRemovedRow,
            ]}
            onPress={canEdit ? () => handlePressItem(it) : undefined}
          >
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                <Text style={nameStyle}>
                  {toText(it.item_name || it.name || 'Item')}
                </Text>
                {statusBadge && (
                  <View style={[styles.statusBadge, statusBadge.style]}>
                    <Text style={styles.statusBadgeText}>{statusBadge.text}</Text>
                  </View>
                )}
              </View>

              {/* Show chosen replacement name, if any */}
              {replacement && (
                <Text style={styles.itemReplacement}>
                  → {toText(replacement.name || replacement.item_name || '')}
                </Text>
              )}

              {/* Chat button for quick access */}
              {canEdit && onChatWithCustomer && (
                <Pressable
                  style={styles.chatButton}
                  onPress={() => onChatWithCustomer(it)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.chatButtonText}>💬 Discuss with customer</Text>
                </Pressable>
              )}
            </View>

            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.itemQty}>×{Number.isFinite(qty) ? qty : 1}</Text>

              {isUnavailable && ifUnavailableMode === 'REMOVE' && !replacement && (
                <Text style={styles.unavailableTag}>
                  Removed
                </Text>
              )}
            </View>
          </ContainerComp>
        );
      })}
    </View>
  );
}