import React from 'react';
import 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TouchableOpacity, Platform, UIManager } from 'react-native';

if (!TouchableOpacity.defaultProps) {
  TouchableOpacity.defaultProps = {};
}
TouchableOpacity.defaultProps = {
  ...TouchableOpacity.defaultProps,
  activeOpacity: 1,
};

// Fabric-aware guard: only enable LayoutAnimation on old architecture to avoid the warning
const isFabric = !!global?.nativeFabricUIManager;
if (Platform.OS === 'android' && !isFabric && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

import WelcomeScreen from './screens/general/WelcomeScreen';
// import CountrySelectScreen from './screens/general/CountrySelectScreen';
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
import ResetPasswordNumber from './screens/general/ResetPasswordNumber';
import MerchantRegistrationScreen from './screens/registrationsteps/BusinessDetails';
import MerchantExtrasScreen from './screens/registrationsteps/MerchantExtrasScreen';
import BankPaymentInfoScreen from './screens/registrationsteps/BankPaymentInfoScreen';
import DeliveryOptionsScreen from './screens/registrationsteps/DeliveryOptionsScreen';
import ReviewSubmitScreen from './screens/registrationsteps/ReviewSubmitScreen';
import EmailOtpVerificationScreen from './screens/registrationsteps/EmailOtpVerificationScreen';
import MartServiceSetupScreen from './screens/mart/MartServiceSetupScreen';
import FoodMenuSetupScreen from './screens/food/FoodMenuSetupScreen';
import GrabMerchantHomeScreen from './screens/food/GrabMerchantHomeScreen';
import MenuScreen from './screens/food/MenuScreen';
import AccountSettings from './screens/food/AccountSettings';
import PasswordManagement from './screens/food/PasswordManagement';
import SecuritySettings from './screens/food/SecuritySettings';
import NotificationSettings from './screens/food/NotificationSettings';
import PersonalInformation from './screens/food/PersonalInformation';
import ProfileBusinessDetails from './screens/food/ProfileBusinessDetails';
import './screens/food/secureStorePatch';
import ManageQuickActionsScreen from './screens/food/ManageQuickActionsScreen';
import OrderDetails from './screens/food/OrderDetails';
import WalletScreen from './screens/food/WalletScreen';
import FeedbackScreen from './screens/food/FeedbackScreen';
import AppLockGate from './AppLockGate';
import TwoFactorPromptScreen from './screens/food/TwoFactorPromptScreen';
import TermsOfService from './screens/food/TermsOfService';
import PrivacyPolicy from './screens/general/PrivacyPolicy';
import HelpScreen from './screens/general/HelpScreen';
import SetNewPasswordScreen from './screens/general/SetNewPasswordScreen';
import ForgotOTPVerify from './screens/general/ForgotOTPVerify';

// ⬇️ NEW: global overlay that pops on socket "notify"
import OrderNotifyOverlay from './components/OrderNotifyOverlay';

const Stack = createStackNavigator();

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        {/* Gate EVERYTHING behind biometrics when enabled */}
        <AppLockGate>
          <Stack.Navigator initialRouteName="Welcome" screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Welcome" component={WelcomeScreen} />
            {/* <Stack.Screen name="CountrySelect" component={CountrySelectScreen} options={{ presentation: 'modal', headerShown: false }} /> */}
            <Stack.Screen name="WelcomeScreen" component={WelcomeScreen} />
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
            <Stack.Screen name="ResetPasswordNumber" component={ResetPasswordNumber} />
            <Stack.Screen name="MerchantRegistrationScreen" component={MerchantRegistrationScreen} />
            <Stack.Screen name="MerchantExtrasScreen" component={MerchantExtrasScreen} />
            <Stack.Screen name="BankPaymentInfoScreen" component={BankPaymentInfoScreen} />
            <Stack.Screen name="DeliveryOptionsScreen" component={DeliveryOptionsScreen} />
            <Stack.Screen name="ReviewSubmitScreen" component={ReviewSubmitScreen} />
            <Stack.Screen name="EmailOtpVerificationScreen" component={EmailOtpVerificationScreen} />
            <Stack.Screen name="MartServiceSetupScreen" component={MartServiceSetupScreen} />
            <Stack.Screen name="FoodMenuSetupScreen" component={FoodMenuSetupScreen} />
            <Stack.Screen name="GrabMerchantHomeScreen" component={GrabMerchantHomeScreen} />
            <Stack.Screen name="MenuScreen" component={MenuScreen} />
            <Stack.Screen name="AccountSettings" component={AccountSettings} />
            <Stack.Screen name="PersonalInformation" component={PersonalInformation} />
            <Stack.Screen name="PasswordManagement" component={PasswordManagement} />
            <Stack.Screen name="SecuritySettings" component={SecuritySettings} />
            <Stack.Screen name="NotificationSettings" component={NotificationSettings} />
            <Stack.Screen name="ProfileBusinessDetails" component={ProfileBusinessDetails} />
            <Stack.Screen name="ManageQuickActions" component={ManageQuickActionsScreen} options={{ headerShown: false }} />
            <Stack.Screen name="OrderDetails" component={OrderDetails} />
            <Stack.Screen name="WalletScreen" component={WalletScreen} />
            <Stack.Screen name="FeedbackScreen" component={FeedbackScreen} />
            <Stack.Screen name="TwoFactorPromptScreen" component={TwoFactorPromptScreen} />
            <Stack.Screen name="TermsOfService" component={TermsOfService} />
            <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicy} />
            <Stack.Screen name="HelpScreen" component={HelpScreen} />
            <Stack.Screen name="SetNewPasswordScreen" component={SetNewPasswordScreen} />
            <Stack.Screen name="ForgotOTPVerify" component={ForgotOTPVerify} />
          </Stack.Navigator>
        </AppLockGate>
      </NavigationContainer>

      {/* ⬇️ Always-mounted overlay that listens to DeviceEventEmitter and pops the toast */}
      <OrderNotifyOverlay />
    </SafeAreaProvider>
  );
}
