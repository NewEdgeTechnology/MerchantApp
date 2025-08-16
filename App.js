import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

import WelcomeScreen from './screens/general/WelcomeScreen';
import CountrySelectScreen from './screens/general/CountrySelectScreen';
import OnboardingScreen from './screens/general/OnboardingScreen';
import SellingTypeScreen from './screens/registrationsteps/SellingTypeScreen';
import GrabFoodScreen from './screens/food/GrabFoodScreen';
import GrabMartScreen from './screens/mart/GrabMartScreen';
import LoginScreen from './screens/general/LoginScreen';
import SignupScreen from './screens/registrationsteps/SignupScreen';
import PhoneNumberScreen from './screens/registrationsteps/PhoneNumberScreen';
import MobileLoginScreen from './screens/general/MobileLoginScreen';
import ForgotUsername from './screens/general/ForgotUsername';
import EmailSentScreen from './screens/general/EmailSentScreen';
import ForgotPassword from './screens/general/ForgotPassword';
import PasswordSentScreen from './screens/general/PasswordSentScreen';
import ResetPasswordNumber from './screens/general/ResetPasswordNumber';
import MerchantRegistrationScreen from './screens/registrationsteps/BusinessDetails';
import MerchantExtrasScreen from './screens/registrationsteps/MerchantExtrasScreen';
import BankPaymentInfoScreen from './screens/registrationsteps/BankPaymentInfoScreen';
import DeliveryOptionsScreen from './screens/registrationsteps/DeliveryOptionsScreen';
import ReviewSubmitScreen from './screens/registrationsteps/ReviewSubmitScreen';
import EmailOtpVerificationScreen from './screens/registrationsteps/EmailOtpVerificationScreen';
import MartServiceSetupScreen from './screens/mart/MartServiceSetupScreen';
import FoodMenuSetupScreen from './screens/food/FoodMenuSetupScreen';

const Stack = createStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Welcome" screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Welcome" component={WelcomeScreen} />
        <Stack.Screen
          name="CountrySelect"
          component={CountrySelectScreen}
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen name="LoginScreen" component={LoginScreen} />
        <Stack.Screen name="OnboardingScreen" component={OnboardingScreen} />
        <Stack.Screen name="SellingTypeScreen" component={SellingTypeScreen} />
        <Stack.Screen name="GrabFoodScreen" component={GrabFoodScreen} />
        <Stack.Screen name="GrabMartScreen" component={GrabMartScreen} />
        <Stack.Screen name="SignupScreen" component={SignupScreen} />
        <Stack.Screen name="PhoneNumberScreen" component={PhoneNumberScreen} />
        <Stack.Screen name="MobileLoginScreen" component={MobileLoginScreen} />
        <Stack.Screen name="ForgotUsername" component={ForgotUsername} />
        <Stack.Screen name="EmailSentScreen" component={EmailSentScreen} />
        <Stack.Screen name="ForgotPassword" component={ForgotPassword} />
        <Stack.Screen name="PasswordSentScreen" component={PasswordSentScreen} />
        <Stack.Screen name="ResetPasswordNumber" component={ResetPasswordNumber} />
        <Stack.Screen name="MerchantRegistrationScreen" component={MerchantRegistrationScreen} />
        <Stack.Screen name="MerchantExtrasScreen" component={MerchantExtrasScreen} />
        <Stack.Screen name="BankPaymentInfoScreen" component={BankPaymentInfoScreen} />
        <Stack.Screen name="DeliveryOptionsScreen" component={DeliveryOptionsScreen} />
        <Stack.Screen name="ReviewSubmitScreen" component={ReviewSubmitScreen} />
        <Stack.Screen name="EmailOtpVerificationScreen" component={EmailOtpVerificationScreen} />
        <Stack.Screen name="MartServiceSetupScreen" component={MartServiceSetupScreen} />
        <Stack.Screen name="FoodMenuSetupScreen" component={FoodMenuSetupScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
