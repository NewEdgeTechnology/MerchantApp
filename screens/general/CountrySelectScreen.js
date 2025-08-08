// CountrySelectScreen.js
import React from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Image,
  StyleSheet,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';

export default function CountrySelectScreen() {
  const navigation = useNavigation();
  const route = useRoute();

  // Defaults so nothing is undefined
  const { countries = [], selectedCode = 'sg', onPick } = route.params ?? {};

  const renderItem = ({ item }) => {
    const isActive = selectedCode === item.code;

    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.8}
        onPress={() => {
          onPick?.(item);
          navigation.goBack();
        }}
      >
        <View style={styles.left}>
          <Image
            source={{ uri: `https://flagcdn.com/w40/${item.code}.png` }}
            style={styles.flag}
          />
          <Text style={[styles.name, isActive && styles.nameActive]}>
            {item.name}
          </Text>
        </View>

        {isActive ? (
          <Ionicons name="checkmark" size={22} color="#00b14f" style={styles.tickIcon} />
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.wrap}>
      <View style={styles.sheet}>
        <Text style={styles.title}>My business is in</Text>

        <FlatList
          data={countries}
          keyExtractor={(item) => item.code}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 8 }}
          showsVerticalScrollIndicator={false}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Full-screen modal feel with a rounded "sheet" like the screenshot
  wrap: {
    flex: 1,
    backgroundColor: '#f2f3f5', // faint backdrop like the page behind
  },
  sheet: {
    flex: 1,
    backgroundColor: '#fff',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 18,
  },

  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 16,
    color: '#111',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  left: { flexDirection: 'row', alignItems: 'center' },

  flag: {
    width: 26,
    height: 18,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 3,
    marginRight: 12,
    resizeMode: 'cover',
  },

  name: {
    fontSize: 16,
    color: '#1a1d1f',
  },
  nameActive: {
    fontWeight: '700',
  },

  tickIcon: {
    alignSelf: 'center',
    marginRight: 2,
  },

  sep: {
    height: 1,
    // backgroundColor: '#eee',
  },
});
