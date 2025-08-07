import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

// Updated import path based on new folder structure
import WelcomeScreen from './screens/general/WelcomeScreen';
import OnboardingScreen from './screens/general/OnboardingScreen';
import OverlayDropdown from './screens/general/OverlayDropdown';
import SellingTypeScreen from './screens/general/SellingTypeScreen';
import GrabFoodScreen from './screens/food/GrabFoodScreen';
import GrabMartScreen from './screens/mart/GrabMartScreen';
import LoginScreen from './screens/general/LoginScreen';

const Stack = createStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Welcome" screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Welcome" component={WelcomeScreen} />
        <Stack.Screen name="LoginScreen" component={LoginScreen} />
        <Stack.Screen name="OnboardingScreen" component={OnboardingScreen} />
        <Stack.Screen name="OverlayDropdown" component={OverlayDropdown} />
        <Stack.Screen name="SellingTypeScreen" component={SellingTypeScreen} />
        <Stack.Screen name="GrabFoodScreen" component={GrabFoodScreen} />
        <Stack.Screen name="GrabMartScreen" component={GrabMartScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
