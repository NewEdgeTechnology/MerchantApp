// screens/OrderDetails/components/ItemsBlock.js
import React from 'react';
import { View, Text } from 'react-native';
import { styles } from './orderDetailsStyles';
import { RowTitle } from './OrderAtoms';
import { toText } from './orderDetailsUtils';

export default function ItemsBlock({ items }) {
  return (
    <View style={styles.block}>
      <RowTitle title="Items" />
      {(items || []).map((it, idx) => (
        <View key={`${it.item_id || idx}`} style={styles.itemRow}>
          <Text style={styles.itemName} numberOfLines={1}>
            {toText(it.item_name || 'Item')}
          </Text>
          <Text style={styles.itemQty}>×{Number(it.quantity ?? 1)}</Text>
        </View>
      ))}
    </View>
  );
}
