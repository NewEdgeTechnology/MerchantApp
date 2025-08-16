import React from 'react';
import { 
  SafeAreaView, 
  ScrollView, 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  Image,
  Dimensions
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';

const { width, height } = Dimensions.get('window');

const OnboardingScreen = () => {
  const navigation = useNavigation();
  const stepImages = [
    require('../../assets/tell.png'),
    require('../../assets/store.png'),
    require('../../assets/contract.jpg'),
  ];
  const steps = [
    {
      title: "Tell us about your business",
      description: "Provide essential information about you and your business",

    },
    {
      title: "Set up your store",
      description: "Manage how your store will look like on Grab: Upload store banners, manage menu, and more. Make sure it stands out!"
    },
    {
      title: "Sign your contract",
      description: "Review and sign your contract, then get ready to receive orders!"
    }
  ];

  const handleContinue = () => {
    navigation.navigate('SellingTypeScreen');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        {/* back button copied from HeaderWithSteps */}
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton} activeOpacity={0.7}>
          <Icon name="arrow-back" size={24} color="#1A1D1F" />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('HelpScreen')} style={styles.iconButton}>
          <Icon name="help-circle-outline" size={24} color="#1A1D1F" />
        </TouchableOpacity>

      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          <Text style={styles.headerTitle}>Reach out to more customers with Grab</Text>
          <Text style={styles.subHeader}>Complete these steps to get your business on Grab</Text>
          
          {steps.map((step, index) => (
            <View key={index} style={styles.stepContainer}>
            <Image
                source={stepImages[index]}
                style={styles.stepImage}
                resizeMode="contain"
            />
              <View style={styles.textContainer}>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepDescription}>{step.description}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={styles.continueButton}
          onPress={handleContinue}
          activeOpacity={0.9}
        >
          <Text style={styles.continueText}>Continue</Text>
        </TouchableOpacity>
      </View>
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
  iconButton: {
    padding: 8,
  },

  icon: {
    fontSize: 24,
    color: '#1A1D1F',
    fontFamily: 'Inter-Regular',
    paddingLeft:10,
  },
  scrollContainer: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 100,
  },
  content: {
    marginBottom: 40,
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: 'Inter-Bold',
    color: '#00',
    marginBottom: 2,
    lineHeight: 32,
    // textAlign: 'center',
  },
  subHeader: {
    fontSize: 14,
    color: '#6C7072',
    fontFamily: 'Inter-Regular',
    marginBottom: 10,
    lineHeight: 20,
    // textAlign: 'center',
  },
  stepContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 16,
    paddingRight: 16,
    paddingLeft: 0, 
    marginBottom: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepImage: {
    width: 60,
    height: 60,
    borderRadius: 42/2,
    marginRight:8,
    },
  textContainer: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#1A1D1F',
    marginBottom: 4,
  },
  stepDescription: {
    fontSize: 13,
    color: '#6C7072',
    fontFamily: 'Inter-Regular',
    lineHeight: 18,
  },
  buttonContainer: {
    width: '100%',
    padding: 24,
    backgroundColor: '#FFFFFF',
    marginBottom:13,
  },
  continueButton: {
    width: '100%',
    backgroundColor: '#00B14F',
    borderRadius: 30,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  continueText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
  },
});

export default OnboardingScreen;
