// App.js
import React, { useEffect, useRef, useState } from "react";
import "react-native-gesture-handler";
import {
  NavigationContainer,
  useNavigationContainerRef,
  CommonActions,
} from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { TouchableOpacity, Platform, UIManager, DeviceEventEmitter, View, ActivityIndicator } from "react-native";

import * as SecureStore from "expo-secure-store";
import { VERIFY_SESSION_ENDPOINT as ENV_VERIFY_SESSION_ENDPOINT } from "@env";
import { getExpoPushTokenAsync } from "./utils/getExpoPushTokenAsync";

// Screens
import WelcomeScreen from "./screens/general/WelcomeScreen";
import OnboardingScreen from "./screens/general/OnboardingScreen";
import SellingTypeScreen from "./screens/registrationsteps/SellingTypeScreen";
import GrabFoodScreen from "./screens/food/GrabFoodScreen";
import GrabMartScreen from "./screens/mart/GrabMartScreen";
import LoginScreen from "./screens/general/LoginScreen";
import SignupScreen from "./screens/registrationsteps/SignupScreen";
import PhoneNumberScreen from "./screens/registrationsteps/PhoneNumberScreen";
import MobileLoginScreen from "./screens/general/MobileLoginScreen";
import ForgotUsername from "./screens/general/ForgotUsername";
import EmailSentScreen from "./screens/general/EmailSentScreen";
import ForgotPassword from "./screens/general/ForgotPassword";
import ResetPasswordNumber from "./screens/general/ResetPasswordNumber";
import MerchantRegistrationScreen from "./screens/registrationsteps/MerchantRegistrationScreen";
import MerchantExtrasScreen from "./screens/registrationsteps/MerchantExtrasScreen";
import BankPaymentInfoScreen from "./screens/registrationsteps/BankPaymentInfoScreen";
import DeliveryOptionsScreen from "./screens/registrationsteps/DeliveryOptionsScreen";
import ReviewSubmitScreen from "./screens/registrationsteps/ReviewSubmitScreen";
import EmailOtpVerificationScreen from "./screens/registrationsteps/EmailOtpVerificationScreen";
import MartServiceSetupScreen from "./screens/mart/MartServiceSetupScreen";
import FoodMenuSetupScreen from "./screens/food/FoodMenuSetupScreen";
import GrabMerchantHomeScreen from "./screens/food/GrabMerchantHomeScreen";
import MenuScreen from "./screens/food/MenuScreen";
import AccountSettings from "./screens/food/AccountSettings";
import PasswordManagement from "./screens/profile/PasswordManagement";
import SecuritySettings from "./screens/profile/SecuritySettings";
import NotificationSettings from "./screens/food/NotificationSettings";
import PersonalInformation from "./screens/profile/PersonalInformation";
import ProfileBusinessDetails from "./screens/profile/ProfileBusinessDetails";
import "./screens/food/secureStorePatch";
import ManageQuickActionsScreen from "./screens/food/ManageQuickActionsScreen";
import OrderDetails from "./screens/food/OrderDetails";
import FeedbackScreen from "./screens/profile/FeedbackScreen";
import AppLockGate from "./AppLockGate";
import TwoFactorPromptScreen from "./screens/food/TwoFactorPromptScreen";
import TermsOfService from "./screens/general/TermsOfService";
import PrivacyPolicy from "./screens/general/PrivacyPolicy";
import HelpScreen from "./screens/general/HelpScreen";
import SetNewPasswordScreen from "./screens/general/SetNewPasswordScreen";
import ForgotOTPVerify from "./screens/general/ForgotOTPVerify";
import OrderNotifyOverlay from "./components/OrderNotifyOverlay";
import MartOrdersTab from "./screens/food/OrderTab";
import MessageScreen from "./screens/message/MessageScreen";
import ChatDetailScreen from "./screens/message/ChatDetailScreen";
import PayoutTab from "./screens/food/PayoutTab";
import NearbyOrdersScreen from "./screens/food/GroupOrder/NearbyOrdersScreen.js";
import NearbyClusterOrdersScreen from "./screens/food/GroupOrder/NearbyClusterOrdersScreen.js";
import ClusterDeliveryOptionsScreen from "./screens/food/GroupOrder/ClusterDeliveryOptionsScreen.js";
import SimilarItemCatalog from "./screens/food/OrderDetails/SimilarItemCatalog.js";
import TrackBatchOrdersScreen from "./screens/food/GroupOrder/TrackBatchOrdersScreen.js";
import TrackDeliveryDriver from "./screens/food/GroupOrder/TrackDeliveryDriver.js";
import DriverBatchDetailsOverlayScreen from "./screens/food/GroupOrder/DriverBatchDetailsOverlayScreen";
import TermsOfServiceScreen from "./screens/registrationsteps/TermsOfServiceScreen.js";
import PrivacyPolicyScreen from "./screens/registrationsteps/PrivacyPolicyScreen.js";
import PasswordSentScreen from "./screens/general/PasswordSentScreen.js";
import BatchRidesScreen from "./screens/food/GroupOrder/BatchRidesScreen.js";
import SalesAnalyticsScreen from "./screens/food/SalesAnalyticsScreen.js";
import EditBusinessDetails from "./screens/profile/component/EditBusinessDetails.js";
import Wallet from "./screens/wallet/Wallet.js";
import ScanQR from "./screens/wallet/ScanQR.js";
import TopUp from "./screens/wallet/TopUp.js";
import TopUpBank from "./screens/wallet/TopUpBank.js";
import TopUpOtp from "./screens/wallet/TopUpOtp.js";
import WalletMyQR from "./screens/wallet/WalletMyQR.js";
import WalletSetMPIN from "./screens/wallet/WalletSetMPIN.js";
import WalletSettings from "./screens/wallet/WalletSettings.js";
import WalletSetTPIN from "./screens/wallet/WalletSetTPIN.js";
import WalletTransfer from "./screens/wallet/WalletTransfer.js";
import WalletTransferSuccess from "./screens/wallet/WalletTransferSuccess.js";
import Withdrawal from "./screens/wallet/WithdrawalScreen.js";
import Chat from "./screens/message/Chat.js";
import ChatRoomScreen from "./screens/message/ChatRoomScreen";

const Stack = createStackNavigator();

/* ---------------- TouchOpacity + LayoutAnimation guards ---------------- */

if (!TouchableOpacity.defaultProps) TouchableOpacity.defaultProps = {};
TouchableOpacity.defaultProps = { ...TouchableOpacity.defaultProps, activeOpacity: 1 };

const isFabric = !!global?.nativeFabricUIManager;
if (Platform.OS === "android" && !isFabric && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/* ---------------- SecureStore Keys ---------------- */

const KEY_AUTH_TOKEN = "auth_token";
const KEY_REFRESH_TOKEN = "refresh_token_v1";
const KEY_ACCESS_TOKEN_TIME = "access_token_time";
const KEY_REFRESH_TOKEN_TIME = "refresh_token_time";
const KEY_MERCHANT_LOGIN = "merchant_login";
const KEY_USER_ID = "user_id_v1";
const KEY_BUSINESS_ID = "business_id_v1";
const KEY_BUSINESS_ID_COMPAT_1 = "business_id";
const KEY_BUSINESS_ID_COMPAT_2 = "businessId";

/* ---------------- Helpers ---------------- */

const toInt = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const isTruthySuccess = (data) => {
  // Your failure shape: { success:false, ... }
  if (data?.success === false) return false;
  if (data?.success === true) return true;

  // Your success sample has { message:"Login successful", token:{...}, user:{...} }
  const msg = String(data?.message || data?.data?.message || "");
  if (/login\s*successful/i.test(msg)) return true;

  // If token exists, treat as success
  if (data?.token?.access_token || data?.token?.accessToken) return true;

  return false;
};

async function saveVerifySessionPayloadToSecureStore(payload) {
  const tokenObj = payload?.token || {};
  const userObj = payload?.user || {};

  const accessToken =
    tokenObj?.access_token || tokenObj?.accessToken || payload?.access_token || payload?.accessToken || "";
  const refreshToken =
    tokenObj?.refresh_token || tokenObj?.refreshToken || payload?.refresh_token || payload?.refreshToken || "";

  const accessTime =
    tokenObj?.access_token_time ?? tokenObj?.accessTokenTime ?? payload?.access_token_time ?? null;
  const refreshTime =
    tokenObj?.refresh_token_time ?? tokenObj?.refreshTokenTime ?? payload?.refresh_token_time ?? null;

  const userId = userObj?.user_id ?? payload?.user_id ?? null;
  const businessId = userObj?.business_id ?? payload?.business_id ?? null;

  console.log("💾 Replacing SecureStore from verify-session:", {
    hasAccessToken: !!accessToken,
    hasRefreshToken: !!refreshToken,
    userId,
    businessId,
    accessTime,
    refreshTime,
  });

  // Replace tokens
  if (accessToken) await SecureStore.setItemAsync(KEY_AUTH_TOKEN, String(accessToken));
  if (refreshToken) await SecureStore.setItemAsync(KEY_REFRESH_TOKEN, String(refreshToken));

  if (accessTime != null) await SecureStore.setItemAsync(KEY_ACCESS_TOKEN_TIME, String(accessTime));
  if (refreshTime != null) await SecureStore.setItemAsync(KEY_REFRESH_TOKEN_TIME, String(refreshTime));

  // Replace user_id
  if (userId != null && String(userId).trim()) {
    await SecureStore.setItemAsync(KEY_USER_ID, String(userId));
  } else {
    await SecureStore.deleteItemAsync(KEY_USER_ID);
  }

  // Replace business_id + compat
  if (businessId != null && String(businessId).trim()) {
    const bid = String(businessId);
    await SecureStore.setItemAsync(KEY_BUSINESS_ID, bid);
    await SecureStore.setItemAsync(KEY_BUSINESS_ID_COMPAT_1, bid);
    await SecureStore.setItemAsync(KEY_BUSINESS_ID_COMPAT_2, bid);
  } else {
    await SecureStore.deleteItemAsync(KEY_BUSINESS_ID);
    await SecureStore.deleteItemAsync(KEY_BUSINESS_ID_COMPAT_1);
    await SecureStore.deleteItemAsync(KEY_BUSINESS_ID_COMPAT_2);
  }

  // Replace merchant_login
  await SecureStore.setItemAsync(KEY_MERCHANT_LOGIN, JSON.stringify(payload));

  return {
    accessToken,
    refreshToken,
    userId: userId != null ? String(userId) : "",
    businessId: businessId != null ? String(businessId) : "",
    user: userObj,
  };
}

/* ---------------- Splash Gate (verify first, then decide) ---------------- */

function BootSplash() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" }}>
      <ActivityIndicator size="large" color="#00b14f" />
    </View>
  );
}

/* ---------------- App ---------------- */

export default function App() {
  const navRef = useNavigationContainerRef();

  // ✅ This prevents rendering screens until verification is finished
  const [bootState, setBootState] = useState({
    loading: true,
    target: "WelcomeScreen", // or "GrabMerchantHomeScreen"
    homeParams: {},
  });

  const ranRef = useRef(false);

  useEffect(() => {
    // run only once
    if (ranRef.current) return;
    ranRef.current = true;

    (async () => {
      console.log("🚀 Boot: starting session check BEFORE showing any screen");

      try {
        const userIdRaw = await SecureStore.getItemAsync(KEY_USER_ID);
        const userId = toInt(userIdRaw);

        console.log("🔎 Boot: user_id_v1 from SecureStore:", userIdRaw, "=>", userId);

        if (!userId) {
          console.log("❌ Boot: user_id missing -> go WelcomeScreen");
          setBootState({ loading: false, target: "WelcomeScreen", homeParams: {} });
          return;
        }

        console.log("📲 Boot: fetching device_id (Expo push token)...");
        const deviceId = await getExpoPushTokenAsync();
        console.log("📲 Boot: device_id:", deviceId);

        if (!deviceId) {
          console.log("❌ Boot: device_id missing -> go WelcomeScreen");
          setBootState({ loading: false, target: "WelcomeScreen", homeParams: {} });
          return;
        }

        const verifyEndpoint = String(ENV_VERIFY_SESSION_ENDPOINT || "").trim();
        console.log("🌐 Boot: VERIFY_SESSION_ENDPOINT:", verifyEndpoint);

        if (!verifyEndpoint) {
          console.log("❌ Boot: VERIFY_SESSION_ENDPOINT not set -> go WelcomeScreen");
          setBootState({ loading: false, target: "WelcomeScreen", homeParams: {} });
          return;
        }

        console.log("➡️ Boot: calling verify-session:", { user_id: userId, device_id: deviceId });

        const r = await fetch(verifyEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ user_id: userId, device_id: String(deviceId) }),
        });

        const txt = await r.text();
        let data = {};
        try {
          data = txt ? JSON.parse(txt) : {};
        } catch {
          data = {};
        }

        console.log("⬅️ Boot: verify-session HTTP:", r.status, "ok:", r.ok);
        console.log("⬅️ Boot: verify-session body:", data);

        if (!r.ok || data?.success === false || !isTruthySuccess(data)) {
          console.log("❌ Boot: verify-session failed -> go WelcomeScreen");
          setBootState({ loading: false, target: "WelcomeScreen", homeParams: {} });
          return;
        }

        // ✅ Replace SecureStore from response BEFORE going home
        const saved = await saveVerifySessionPayloadToSecureStore(data);

        console.log("✅ Boot: verify-session success -> go GrabMerchantHomeScreen");

        setBootState({
          loading: false,
          target: "GrabMerchantHomeScreen",
          homeParams: {
            openTab: "Home",
            nonce: Date.now(),
            business_id: saved.businessId || "",
            business_name: String(saved?.user?.business_name || ""),
            business_logo: String(saved?.user?.business_logo || ""),
            owner_type: String(saved?.user?.owner_type || ""),
            auth_token: String(saved.accessToken || ""),
            user_id: saved.userId || "",
          },
        });
      } catch (e) {
        console.warn("⚠️ Boot: session check error -> WelcomeScreen", e);
        setBootState({ loading: false, target: "WelcomeScreen", homeParams: {} });
      }
    })();
  }, []);

  // Catch-all for 'open-order-details'
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("open-order-details", (params = {}) => {
      if (!navRef?.isReady?.()) return;

      const current = navRef.getCurrentRoute?.();
      if (current?.name === "OrderDetails" && current?.params?.orderId === params.orderId) return;

      try {
        navRef.dispatch(
          CommonActions.navigate({
            name: "OrderDetails",
            params,
            merge: true,
          })
        );
      } catch (err) {
        console.warn("Navigation to OrderDetails failed:", err);
      }
    });

    return () => sub.remove();
  }, [navRef]);

  if (bootState.loading) {
    // ✅ Show ONLY a loading screen while verifying (no Welcome flash)
    return (
      <SafeAreaProvider>
        <BootSplash />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer ref={navRef} onReady={() => (global.__nav = navRef)}>
        <AppLockGate>
          <Stack.Navigator
            // ✅ Decide the first screen ONLY after verification finished
            initialRouteName={bootState.target}
            screenOptions={{ headerShown: false }}
          >
            <Stack.Screen name="Welcome" component={WelcomeScreen} />
            <Stack.Screen name="WelcomeScreen" component={WelcomeScreen} />

            {/* Home: pass verified params */}
            <Stack.Screen
              name="GrabMerchantHomeScreen"
              component={GrabMerchantHomeScreen}
              initialParams={bootState.target === "GrabMerchantHomeScreen" ? bootState.homeParams : {}}
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
            <Stack.Screen name="ResetPasswordNumber" component={ResetPasswordNumber} />
            <Stack.Screen name="MerchantRegistrationScreen" component={MerchantRegistrationScreen} />
            <Stack.Screen name="MerchantExtrasScreen" component={MerchantExtrasScreen} />
            <Stack.Screen name="BankPaymentInfoScreen" component={BankPaymentInfoScreen} />
            <Stack.Screen name="DeliveryOptionsScreen" component={DeliveryOptionsScreen} />
            <Stack.Screen name="ReviewSubmitScreen" component={ReviewSubmitScreen} />
            <Stack.Screen name="EmailOtpVerificationScreen" component={EmailOtpVerificationScreen} />
            <Stack.Screen name="MartServiceSetupScreen" component={MartServiceSetupScreen} />
            <Stack.Screen name="FoodMenuSetupScreen" component={FoodMenuSetupScreen} />

            <Stack.Screen name="MenuScreen" component={MenuScreen} />
            <Stack.Screen name="AccountSettings" component={AccountSettings} />
            <Stack.Screen name="PersonalInformation" component={PersonalInformation} />
            <Stack.Screen name="PasswordManagement" component={PasswordManagement} />
            <Stack.Screen name="SecuritySettings" component={SecuritySettings} />
            <Stack.Screen name="NotificationSettings" component={NotificationSettings} />
            <Stack.Screen name="ProfileBusinessDetails" component={ProfileBusinessDetails} />
            <Stack.Screen name="EditBusinessDetails" component={EditBusinessDetails} />
            <Stack.Screen name="ManageQuickActions" component={ManageQuickActionsScreen} />
            <Stack.Screen name="OrderDetails" component={OrderDetails} />
            <Stack.Screen name="FeedbackScreen" component={FeedbackScreen} />
            <Stack.Screen name="TwoFactorPromptScreen" component={TwoFactorPromptScreen} />
            <Stack.Screen name="TermsOfService" component={TermsOfService} />
            <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicy} />
            <Stack.Screen name="HelpScreen" component={HelpScreen} />
            <Stack.Screen name="SetNewPasswordScreen" component={SetNewPasswordScreen} />
            <Stack.Screen name="ForgotOTPVerify" component={ForgotOTPVerify} />
            <Stack.Screen name="MartOrdersTab" component={MartOrdersTab} />
            <Stack.Screen name="MessageScreen" component={MessageScreen} />
            <Stack.Screen name="ChatDetailScreen" component={ChatDetailScreen} />
            <Stack.Screen name="PayoutTab" component={PayoutTab} />
            <Stack.Screen name="SalesAnalyticsScreen" component={SalesAnalyticsScreen} />

            <Stack.Screen name="NearbyOrdersScreen" component={NearbyOrdersScreen} />
            <Stack.Screen name="NearbyClusterOrdersScreen" component={NearbyClusterOrdersScreen} />
            <Stack.Screen name="ClusterDeliveryOptionsScreen" component={ClusterDeliveryOptionsScreen} />
            <Stack.Screen name="SimilarItemCatalog" component={SimilarItemCatalog} />
            <Stack.Screen name="TrackBatchOrdersScreen" component={TrackBatchOrdersScreen} />
            <Stack.Screen name="TrackDeliveryDriver" component={TrackDeliveryDriver} />
            <Stack.Screen
              name="DriverBatchDetailsOverlayScreen"
              component={DriverBatchDetailsOverlayScreen}
              options={{ headerShown: false, presentation: "modal" }}
            />
            <Stack.Screen name="TermsOfServiceScreen" component={TermsOfServiceScreen} />
            <Stack.Screen name="PrivacyPolicyScreen" component={PrivacyPolicyScreen} />
            <Stack.Screen name="PasswordSentScreen" component={PasswordSentScreen} />
            <Stack.Screen name="BatchRidesScreen" component={BatchRidesScreen} />

            <Stack.Screen name="Wallet" component={Wallet} />
            <Stack.Screen name="ScanQR" component={ScanQR} />
            <Stack.Screen name="TopUp" component={TopUp} />
            <Stack.Screen name="TopUpBank" component={TopUpBank} />
            <Stack.Screen name="TopUpOtp" component={TopUpOtp} />
            <Stack.Screen name="WalletMyQR" component={WalletMyQR} />
            <Stack.Screen name="WalletSetMPIN" component={WalletSetMPIN} />
            <Stack.Screen name="WalletSettings" component={WalletSettings} />
            <Stack.Screen name="WalletSetTPIN" component={WalletSetTPIN} />
            <Stack.Screen name="WalletTransfer" component={WalletTransfer} />
            <Stack.Screen name="WalletTransferSuccess" component={WalletTransferSuccess} />
            <Stack.Screen name="Withdrawal" component={Withdrawal} />

            <Stack.Screen name="Chat" component={Chat} />
            <Stack.Screen name="MerchantChatRoomScreen" component={ChatRoomScreen} />
          </Stack.Navigator>
        </AppLockGate>
      </NavigationContainer>

      <OrderNotifyOverlay navigation={navRef} />
    </SafeAreaProvider>
  );
}
