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
  Platform
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/FontAwesome5';

const { width, height } = Dimensions.get('window');

const SellingTypeScreen = () => {
  const navigation = useNavigation();

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.leftHeader}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
            <Text style={styles.icon}>←</Text>
          </TouchableOpacity>
          <Text style={styles.step}>Step 1 of 7</Text>
        </View>

        <TouchableOpacity onPress={() => navigation.navigate('HelpScreen')} style={styles.iconButton}>
          <Icon name="question-circle" size={20} color="#1A1D1F" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>What are you selling?</Text>

        {/* Option 1: GrabFood */}
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('GrabFoodScreen')}
        >
          <Image source={require('../../assets/dummy.jpg')} style={styles.image} />
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
          <Image source={require('../../assets/dummy.jpg')} style={styles.image} />
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    marginTop: 24,
  },
  leftHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    padding: 8,
  },
  icon: {
    fontSize: 24,
    color: '#1A1D1F',
    fontFamily: 'Inter-Regular',
  },
  scrollView: {
    paddingHorizontal: 24,
  },
  step: {
    fontSize: 18,
    color: '#000',
    marginBottom: 8,
    marginTop: 10,
    fontWeight: 'bold',
    opacity: 0.7,
    fontFamily: 'Inter-Regular',
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
      ios: {
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
