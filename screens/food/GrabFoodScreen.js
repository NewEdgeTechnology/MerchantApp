import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons, Feather } from '@expo/vector-icons';

const GrabFoodScreen = () => {
  const navigation = useNavigation();

  return (
    <View style={styles.container}>
      {/* Back Button */}
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={styles.backButton}
        activeOpacity={0.7}
      >
        <Icon name="arrow-back" size={24} color="#1A1D1F" />
      </TouchableOpacity>

      {/* Scrollable Content */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Image */}
        <View style={styles.imageContainer}>
          <Image
            source={require('../../assets/grabfood.png')}
            style={styles.headerImage}
          />
        </View>

        <View style={styles.content}>
          <Text style={styles.title}>GrabFood</Text>
          <Text style={styles.description}>
            Suitable if you have ready-to-eat food and beverages. For other
            items such as packaged drinks, alcoholic beverages and raw or dry
            ingredients, please select GrabMart instead.
          </Text>

          <Text style={styles.subheading}>Commission rate</Text>
          <Text style={styles.listItem}>• 25% in all cities</Text>

          <Text style={styles.subheading}>Features</Text>

          <View style={styles.feature}>
            <Image
              source={require('../../assets/reach.png')}
              style={styles.featureIcon}
            />
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>Reach more customers</Text>
              <Text style={styles.featureDescription}>
                Expand your business beyond those who go into the store, and
                provide the convenience that your customers expect.
              </Text>
            </View>
          </View>

          <View style={styles.feature}>
            <Image
              source={require('../../assets/boost.png')}
              style={styles.featureIcon}
            />
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>Boost your sales</Text>
              <Text style={styles.featureDescription}>
                With user insights and marketing tools, including ads and
                promos, we made it easier for you to drive more orders.
              </Text>
            </View>
          </View>

          <View style={styles.feature}>
            <Image
              source={require('../../assets/ease.png')}
              style={styles.featureIcon}
            />
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>Operate with ease & speed</Text>
              <Text style={styles.featureDescription}>
                You don’t have to worry about any of the logistics. All you
                have to do is prepare the customer orders and we'll manage the
                rest
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Fixed Bottom Button */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate('SignupScreen')}
          activeOpacity={0.9}
        >
          <Text style={styles.buttonText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default GrabFoodScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 30,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  imageContainer: {
    position: 'relative',
  },
  headerImage: {
    width: '100%',
    height: 200,
    resizeMode: 'cover',
  },
  backButton: {
    position: 'absolute',
    top: 40,
    left: 16,
    backgroundColor: 'rgba(255,255,255,0.7)',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  content: {
    padding: 25,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#555',
    marginBottom: 10,
    lineHeight: 19,
  },
  subheading: {
    fontSize: 19,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 10,
  },
  listItem: {
    fontSize: 14,
    marginLeft: 8,
    marginBottom: 16,
    lineHeight: 20,
  },
  feature: {
    flexDirection: 'row',
    marginBottom: 20,
    alignItems: 'flex-start',
  },
  featureIcon: {
    width: 40,
    height: 40,
    marginRight: 15,
    marginTop: 4,
    borderRadius: 20,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  featureDescription: {
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
  },
  buttonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    width: '100%',
    padding: 24,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    borderRadius: 15,
    elevation: 15,
    marginBottom: 3,
  },
  button: {
    backgroundColor: '#00b14f',
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginBottom: 6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
