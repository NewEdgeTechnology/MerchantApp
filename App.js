import React, { useEffect } from 'react';
import 'react-native-gesture-handler';
import {
  NavigationContainer,
  useNavigationContainerRef,
  CommonActions,
} from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TouchableOpacity, Platform, UIManager, DeviceEventEmitter } from 'react-native';

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
import MerchantRegistrationScreen from './screens/registrationsteps/MerchantRegistrationScreen';
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
import PasswordManagement from './screens/profile/PasswordManagement';
import SecuritySettings from './screens/profile/SecuritySettings';
import NotificationSettings from './screens/food/NotificationSettings';
import PersonalInformation from './screens/profile/PersonalInformation';
import ProfileBusinessDetails from './screens/profile/ProfileBusinessDetails';
import './screens/food/secureStorePatch';
import ManageQuickActionsScreen from './screens/food/ManageQuickActionsScreen';
import OrderDetails from './screens/food/OrderDetails';
import FeedbackScreen from './screens/profile/FeedbackScreen';
import AppLockGate from './AppLockGate';
import TwoFactorPromptScreen from './screens/food/TwoFactorPromptScreen';
import TermsOfService from './screens/general/TermsOfService';
import PrivacyPolicy from './screens/general/PrivacyPolicy';
import HelpScreen from './screens/general/HelpScreen';
import SetNewPasswordScreen from './screens/general/SetNewPasswordScreen';
import ForgotOTPVerify from './screens/general/ForgotOTPVerify';
import OrderNotifyOverlay from './components/OrderNotifyOverlay';
import WalletScreen from './screens/wallet/WalletScreen';
import CreateWalletScreen from './screens/wallet/CreateWalletScreen';
import AddMoneyScreen from './screens/wallet/AddMoneyScreen';
import WithdrawScreen from './screens/wallet/WithdrawScreen';
import SendToFriendScreen from './screens/wallet/SendToFriendScreen';
import MartOrdersTab from './screens/food/OrderTab';
import MessageScreen from './screens/message/MessageScreen';
import ChatDetailScreen from './screens/message/ChatDetailScreen';
import PayoutsTab from './screens/food/PayoutTab';
import TPinScreen from './screens/wallet/TPinScreen';
import CreateTPinScreen from './screens/wallet/CreateTPinScreen.js';
import ForgotTPinScreen from './screens/wallet/ForgotTPinScreen.js';
import ChangeTPinScreen from './screens/wallet/ChangeTPinScreen.js';
import VerifyTPinOtpScreen from './screens/wallet/VerifyTPinOtpScreen.js';
import NearbyOrdersScreen from './screens/food/GroupOrder/NearbyOrdersScreen.js';
import NearbyClusterOrdersScreen from './screens/food/GroupOrder/NearbyClusterOrdersScreen.js';
import ClusterDeliveryOptionsScreen from './screens/food/GroupOrder/ClusterDeliveryOptionsScreen.js';
import SimilarItemCatalog from './screens/food/OrderDetails/SimilarItemCatalog.js';
import TrackBatchOrdersScreen from './screens/food/GroupOrder/TrackBatchOrdersScreen.js';
import TrackDeliveryDriver from './screens/food/GroupOrder/TrackDeliveryDriver.js';
import DriverBatchDetailsOverlayScreen from "./screens/food/GroupOrder/DriverBatchDetailsOverlayScreen";

const Stack = createStackNavigator();

export default function App() {
  // Nav ref so overlay (outside tree) can navigate
  const navRef = useNavigationContainerRef();

  // Catch-all for 'open-order-details' from anywhere (overlay, bridges, etc.)
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('open-order-details', (params = {}) => {
      if (!navRef?.isReady?.()) return;

      // Optional guard: avoid repeatedly navigating to the same order
      const current = navRef.getCurrentRoute?.();
      if (current?.name === 'OrderDetails' && current?.params?.orderId === params.orderId) {
        return;
      }

      try {
        navRef.dispatch(
          CommonActions.navigate({
            name: 'OrderDetails',
            params,
            merge: true,
          })
        );
      } catch (err) {
        console.warn('Navigation to OrderDetails failed:', err);
      }
    });

    return () => sub.remove();
  }, [navRef]);

  return (
    <SafeAreaProvider>
      <NavigationContainer
        ref={navRef}
        onReady={() => {
          // Expose nav only when ready so helpers can use it safely
          global.__nav = navRef;
        }}
      >
        {/* Gate everything behind biometrics when enabled */}
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
            <Stack.Screen name="CreateWalletScreen" component={CreateWalletScreen} />
            <Stack.Screen name="AddMoneyScreen" component={AddMoneyScreen} />
            <Stack.Screen name="WithdrawScreen" component={WithdrawScreen} />
            <Stack.Screen name="SendToFriendScreen" component={SendToFriendScreen} />
            <Stack.Screen name="MartOrdersTab" component={MartOrdersTab} />
            <Stack.Screen name="MessageScreen" component={MessageScreen} />
            <Stack.Screen name="ChatDetailScreen" component={ChatDetailScreen} />
            <Stack.Screen name="PayoutsTab" component={PayoutsTab} />
            <Stack.Screen name="TPinScreen" component={TPinScreen} />
            <Stack.Screen name="CreateTPinScreen" component={CreateTPinScreen} />
            <Stack.Screen name="ForgotTPinScreen" component={ForgotTPinScreen} />
            <Stack.Screen name="ChangeTPinScreen" component={ChangeTPinScreen} />
            <Stack.Screen name="VerifyTPinOtpScreen" component={VerifyTPinOtpScreen} />

            {/* ---------------- FOOD GROUP ORDER ROUTES ---------------- */}
            <Stack.Screen name="NearbyOrdersScreen" component={NearbyOrdersScreen} />

            {/* ✅ ADD UNIQUE ROUTE NAME (fix MART vs FOOD collision) */}
            <Stack.Screen
              name="FoodNearbyClusterOrdersScreen"
              component={NearbyClusterOrdersScreen}
            />

            {/* (Optional) keep old name for backward compatibility:
               If you have older navigation calls using NearbyClusterOrdersScreen name,
               keep it but redirect internally from OrderDetails by preferring FoodNearbyClusterOrdersScreen.
            */}
            <Stack.Screen
              name="NearbyClusterOrdersScreen"
              component={NearbyClusterOrdersScreen}
            />

            <Stack.Screen name="ClusterDeliveryOptionsScreen" component={ClusterDeliveryOptionsScreen} />
            <Stack.Screen name="SimilarItemCatalog" component={SimilarItemCatalog} />
            <Stack.Screen name="TrackBatchOrdersScreen" component={TrackBatchOrdersScreen} />
            <Stack.Screen name="TrackDeliveryDriver" component={TrackDeliveryDriver} />
            <Stack.Screen
              name="DriverBatchDetailsOverlayScreen"
              component={DriverBatchDetailsOverlayScreen}
              options={{ headerShown: false, presentation: "modal" }}
            />
          </Stack.Navigator>
        </AppLockGate>
      </NavigationContainer>

      {/* Overlay is outside the tree, pass navRef for direct navigation */}
      <OrderNotifyOverlay navigation={navRef} />
    </SafeAreaProvider>
  );
}
