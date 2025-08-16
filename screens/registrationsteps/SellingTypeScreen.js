// screens/registrationsteps/SellingTypeScreen.js
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  SafeAreaView,
  Platform,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import HeaderWithSteps from './HeaderWithSteps'; // Adjust the path if needed

const { width } = Dimensions.get('window');

const SellingTypeScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();

  const goFood = () => {
    navigation.navigate('SignupScreen', {
      ...(route.params ?? {}),
      serviceType: 'food',
      owner_type: 'food', // if your flow expects this too
    });
  };

  const goMart = () => {
    navigation.navigate('SignupScreen', {
      ...(route.params ?? {}),
      serviceType: 'mart',
      owner_type: 'mart', // if your flow expects this too
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <HeaderWithSteps step="Step 1 of 7" />
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>What are you selling?</Text>

        {/* Food */}
        <TouchableOpacity style={styles.card} activeOpacity={0.8} onPress={goFood}>
          <Image source={require('../../assets/grabfood.png')} style={styles.image} />
          <View style={styles.textContainer}>
            <Text style={styles.cardTitle}>Food delivery: GrabFood</Text>
            <Text style={styles.cardText}>
              Suitable if you have ready-to-eat food and beverages. For other items such as
              packaged drinks, alcoholic beverages and raw or dry ingredients, please select
              GrabMart instead.
            </Text>
          </View>
        </TouchableOpacity>

        {/* Mart */}
        <TouchableOpacity style={styles.card} activeOpacity={0.8} onPress={goMart}>
          <Image source={require('../../assets/grabmart.png')} style={styles.image} />
          <View style={styles.textContainer}>
            <Text style={styles.cardTitle}>Groceries delivery: GrabMart</Text>
            <Text style={styles.cardText}>
              Suitable if you are selling groceries, healthcare, beauty products and raw or dry
              ingredients. For ready-to-eat food and beverages, please select GrabFood instead.
            </Text>
          </View>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  scrollView: { paddingHorizontal: 24 },
  title: {
    fontSize: 24, fontWeight: 'bold', marginBottom: 16, fontFamily: 'Inter-Bold',
  },
  card: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    marginVertical: 10,
    overflow: 'hidden',
    elevation: 2,
    ...Platform.select({
      android: {
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
      },
    }),
  },
  image: { width: '100%', height: 150, resizeMode: 'cover' },
  textContainer: { padding: 12 },
  cardTitle: { fontSize: 15, fontWeight: 'bold', marginBottom: 8, fontFamily: 'Inter-SemiBold' },
  cardText: { fontSize: 12, color: '#555', fontFamily: 'Inter-Regular' },
});

export default SellingTypeScreen;
