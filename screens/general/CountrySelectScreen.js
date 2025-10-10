import React from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Image,
  StyleSheet,
  Dimensions,
  Modal,
  TouchableWithoutFeedback,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons, Feather } from '@expo/vector-icons';

const { height } = Dimensions.get('window');

export default function CountrySelectScreen(props) {
  const navigation = useNavigation();
  const route = useRoute();

  // Merge route params with props; route first, then props override if provided
  const merged = { ...(route?.params ?? {}), ...(props ?? {}) };

  const {
    countries = [],
    selectedCode = 'sg',
    onPick,
    visible = true,
    onClose,
  } = merged;

  const renderItem = ({ item }) => {
    const code = String(item?.code ?? '').toLowerCase();
    const isActive = String(selectedCode ?? '').toLowerCase() === code;

    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.8}
        onPress={() => {
          onPick?.(item);
          // If we're used as an overlay, parent passed onClose — use that.
          // Otherwise fall back to navigation.goBack() for screen usage.
          if (onClose) onClose();
          else navigation.goBack?.();
        }}
      >
        <View style={styles.left}>
          <Image
            source={{ uri: `https://flagcdn.com/w40/${code}.png` }}
            style={styles.flag}
          />
          <Text style={[styles.name, isActive && styles.nameActive]}>
            {item?.name ?? code.toUpperCase()}
          </Text>
        </View>

        {isActive ? (
          <Ionicons name="checkmark" size={22} color="#000" style={styles.tickIcon} />
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={!!visible}
      animationType="slide"
      transparent
      onRequestClose={() => {
        if (onClose) onClose();
        else navigation.goBack?.();
      }}
    >
      {/* Backdrop */}
      <TouchableWithoutFeedback
        onPress={() => {
          if (onClose) onClose();
          else navigation.goBack?.();
        }}
      >
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>

      {/* Half page sheet */}
      <View style={styles.sheet}>
        <SafeAreaView style={{ flex: 1 }}>
          <Text style={styles.title}>My business is in</Text>

          <FlatList
            data={countries}
            keyExtractor={(item, i) => String(item?.code ?? i)}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: 8 }}
            showsVerticalScrollIndicator={false}
          />
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    height: height / 2,
    backgroundColor: '#fff',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 10,
  },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 16, color: '#111' },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14,
  },
  left: { flexDirection: 'row', alignItems: 'center' },
  flag: {
    width: 26, height: 18, borderWidth: 1, borderColor: '#ddd', borderRadius: 3, marginRight: 12, resizeMode: 'cover',
  },
  name: { fontSize: 16, color: '#1a1d1f' },
  nameActive: { fontWeight: '700' },
  tickIcon: { alignSelf: 'center', marginRight: 2 },
  sep: { height: 1 },
});
