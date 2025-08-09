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
import { useNavigation } from '@react-navigation/native';
import HeaderWithSteps from './HeaderWithSteps'; // Adjust the path if needed

const { width, height } = Dimensions.get('window');

const SellingTypeScreen = () => {
  const navigation = useNavigation();

  return (
    <SafeAreaView style={styles.container}>
      {/* Reusable Header */}
      <HeaderWithSteps step="Step 1 of 7" />

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>What are you selling?</Text>

        {/* Option 1: GrabFood */}
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('GrabFoodScreen')}
        >
          <Image source={require('../../assets/grabfood.png')} style={styles.image} />
          <View style={styles.textContainer}>
            <Text style={styles.cardTitle}>Food delivery: GrabFood</Text>
            <Text style={styles.cardText}>
              Suitable if you have ready-to-eat food and beverages. For other items such as packaged drinks, alcoholic beverages and raw or dry ingredients, please select GrabMart instead.
            </Text>
          </View>
        </TouchableOpacity>

        {/* Option 2: GrabMart */}
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('GrabMartScreen')}
        >
          <Image source={require('../../assets/grabmart.png')} style={styles.image} />
          <View style={styles.textContainer}>
            <Text style={styles.cardTitle}>Groceries delivery: GrabMart</Text>
            <Text style={styles.cardText}>
              Suitable if you are selling groceries, healthcare, beauty products and raw or dry ingredients. For ready-to-eat food and beverages, please select GrabFood instead.
            </Text>
          </View>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollView: {
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
    fontFamily: 'Inter-Bold',
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
  image: {
    width: '100%',
    height: 150,
    resizeMode: 'cover',
  },
  textContainer: {
    padding: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 8,
    fontFamily: 'Inter-SemiBold',
  },
  cardText: {
    fontSize: 12,
    color: '#555',
    fontFamily: 'Inter-Regular',
  },
});

export default SellingTypeScreen;
