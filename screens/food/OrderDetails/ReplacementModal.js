import React from 'react';
import { Modal, View, Text, FlatList, TouchableOpacity, Button } from 'react-native';

export default function ReplacementModal({ visible, items, onClose }) {
  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      transparent={true}
      animationType="slide"
    >
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ backgroundColor: 'white', padding: 20 }}>
          <Text>Select a Replacement</Text>
          <FlatList
            data={items}
            keyExtractor={(item) => item.item_id.toString()}
            renderItem={({ item }) => (
              <TouchableOpacity onPress={() => onClose(item)}>
                <Text>{item.item_name}</Text>
              </TouchableOpacity>
            )}
          />
          <Button title="Close" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}
