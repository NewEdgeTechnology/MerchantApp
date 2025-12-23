// screens/OrderDetails/components/ItemsBlock.js
import React from 'react';
import { View, Text, Pressable } from 'react-native';
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
}) {
  const canEdit = (status || '').toUpperCase() === 'PENDING';

  let hint = null;
  if (canEdit) {
    if (ifUnavailableMode === 'REPLACE') {
      hint = 'Tap an item to mark it unavailable and choose a similar item.';
    } else if (ifUnavailableMode === 'REMOVE') {
      hint = 'Tap an item to remove it from this order.';
    } else {
      hint = 'Tap an item to mark it unavailable.';
    }
  }

  const handlePressItem = (item) => {
    const key = item._key || String(item.item_id || item.id || '');
    if (!key) return;

    if (!canEdit || !onToggleUnavailable) return;

    onToggleUnavailable(key);

    // If customer chose "replace with similar item", open the catalog
    if (ifUnavailableMode === 'REPLACE' && typeof onOpenSimilarCatalog === 'function') {
      onOpenSimilarCatalog(item);
    }
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

        return (
          <ContainerComp
            key={key}
            style={styles.itemRow}
            onPress={canEdit ? () => handlePressItem(it) : undefined}
          >
            <View style={{ flex: 1 }}>
              <Text style={nameStyle}>
                {toText(it.item_name || it.name || 'Item')}
              </Text>

              {/* Show chosen replacement name, if any */}
              {replacement && (
                <Text style={styles.itemReplacement}>
                  Replace with: {toText(replacement.name || replacement.item_name || '')}
                </Text>
              )}
            </View>

            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.itemQty}>×{Number.isFinite(qty) ? qty : 1}</Text>

              {isUnavailable && (
                <Text style={styles.unavailableTag}>
                  {ifUnavailableMode === 'REMOVE' ? 'Removed' : 'Unavailable'}
                </Text>
              )}
            </View>
          </ContainerComp>
        );
      })}
    </View>
  );
}
