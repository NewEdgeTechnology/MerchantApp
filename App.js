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
import {
  TouchableOpacity,
  Platform,
  UIManager,
  DeviceEventEmitter,
  Alert,
} from "react-native";

import * as SecureStore from "expo-secure-store";
import { VERIFY_SESSION_ENDPOINT as ENV_VERIFY_SESSION_ENDPOINT } from "@env";
import { getExpoPushTokenAsync } from "./utils/getExpoPushTokenAsync";
import Constants from "expo-constants";
// Add this import at the top with your other imports
import { LogBox } from "react-native";
import SplashScreen from "./components/SplashScreen";
// Add this after your imports, before the component definitions
// Ignore the non-serializable warning - safe since we don't use persistence/deep linking
LogBox.ignoreLogs([
  "Non-serializable values were found in the navigation state",
]);
// Screens (all your existing imports remain the same)
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
import ItemDetailScreen from "./screens/food/ItemDetailScreen.js";
import EditItemScreen from "./screens/food/EditItemScreen.js";

const Stack = createStackNavigator();

/* ---------------- TouchOpacity + LayoutAnimation guards ---------------- */

if (!TouchableOpacity.defaultProps) TouchableOpacity.defaultProps = {};
TouchableOpacity.defaultProps = {
  ...TouchableOpacity.defaultProps,
  activeOpacity: 1,
};

const isFabric = !!global?.nativeFabricUIManager;
if (
  Platform.OS === "android" &&
  !isFabric &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
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
  if (data?.success === false) return false;
  if (data?.success === true) return true;

  const msg = String(data?.message || data?.data?.message || "");
  if (/login\s*successful/i.test(msg)) return true;

  if (data?.token?.access_token || data?.token?.accessToken) return true;

  return false;
};

async function saveVerifySessionPayloadToSecureStore(payload) {
  const tokenObj = payload?.token || {};
  const userObj = payload?.user || {};

  const accessToken =
    tokenObj?.access_token ||
    tokenObj?.accessToken ||
    payload?.access_token ||
    payload?.accessToken ||
    "";
  const refreshToken =
    tokenObj?.refresh_token ||
    tokenObj?.refreshToken ||
    payload?.refresh_token ||
    payload?.refreshToken ||
    "";

  const accessTime =
    tokenObj?.access_token_time ??
    tokenObj?.accessTokenTime ??
    payload?.access_token_time ??
    null;
  const refreshTime =
    tokenObj?.refresh_token_time ??
    tokenObj?.refreshTokenTime ??
    payload?.refresh_token_time ??
    null;

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

  if (accessToken)
    await SecureStore.setItemAsync(KEY_AUTH_TOKEN, String(accessToken));
  if (refreshToken)
    await SecureStore.setItemAsync(KEY_REFRESH_TOKEN, String(refreshToken));

  if (accessTime != null)
    await SecureStore.setItemAsync(KEY_ACCESS_TOKEN_TIME, String(accessTime));
  if (refreshTime != null)
    await SecureStore.setItemAsync(KEY_REFRESH_TOKEN_TIME, String(refreshTime));

  if (userId != null && String(userId).trim()) {
    await SecureStore.setItemAsync(KEY_USER_ID, String(userId));
  } else {
    await SecureStore.deleteItemAsync(KEY_USER_ID);
  }

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

  await SecureStore.setItemAsync(KEY_MERCHANT_LOGIN, JSON.stringify(payload));

  return {
    accessToken,
    refreshToken,
    userId: userId != null ? String(userId) : "",
    businessId: businessId != null ? String(businessId) : "",
    user: userObj,
  };
}

/* ---------------- App ---------------- */

export default function App() {
  const navRef = useNavigationContainerRef();

  const [bootState, setBootState] = useState({
    loading: true,
    target: "WelcomeScreen",
    homeParams: {},
  });

  const [showSplash, setShowSplash] = useState(true);

  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    (async () => {
      console.log("=".repeat(50));
      console.log("🚀 Boot: starting session check BEFORE showing any screen");
      console.log("📱 Platform:", Platform.OS);
      console.log("🔧 Is Development:", __DEV__);
      console.log(
        "📦 App Version:",
        Constants.expoConfig?.version || "unknown",
      );
      console.log("=".repeat(50));

      try {
        // Step 1: Test SecureStore accessibility
        console.log("\n🔐 Step 1: Testing SecureStore accessibility...");
        const testKey = "_test_" + Date.now();
        await SecureStore.setItemAsync(testKey, "test_value_123");
        const testValue = await SecureStore.getItemAsync(testKey);
        if (testValue === "test_value_123") {
          console.log("✅ SecureStore is working correctly");
        } else {
          console.error("❌ SecureStore test failed - returned:", testValue);
        }
        await SecureStore.deleteItemAsync(testKey);
        console.log("✅ SecureStore test completed\n");

        // Step 2: Get all stored credentials
        console.log("🔑 Step 2: Checking stored credentials...");
        const userIdRaw = await SecureStore.getItemAsync(KEY_USER_ID);
        const authTokenRaw = await SecureStore.getItemAsync(KEY_AUTH_TOKEN);
        const refreshTokenRaw =
          await SecureStore.getItemAsync(KEY_REFRESH_TOKEN);
        const businessIdRaw = await SecureStore.getItemAsync(KEY_BUSINESS_ID);

        console.log("📦 Stored values:");
        console.log(
          "  - user_id_v1:",
          userIdRaw ? `${userIdRaw.substring(0, 10)}...` : "NOT FOUND",
        );
        console.log(
          "  - auth_token:",
          authTokenRaw ? `${authTokenRaw.substring(0, 20)}...` : "NOT FOUND",
        );
        console.log(
          "  - refresh_token:",
          refreshTokenRaw ? "EXISTS" : "NOT FOUND",
        );
        console.log("  - business_id:", businessIdRaw ? "EXISTS" : "NOT FOUND");

        const userId = toInt(userIdRaw);

        if (!userId) {
          console.log(
            "\n❌ Boot: user_id missing or invalid -> going to WelcomeScreen",
          );
          setBootState({
            loading: false,
            target: "WelcomeScreen",
            homeParams: {},
          });
          return;
        }

        console.log("\n✅ Found valid user_id:", userId);

        // Step 3: Check environment configuration - FIXED VERSION
        console.log("\n🌐 Step 3: Checking environment configuration...");
        let verifyEndpoint = "";

        // Debug: Log all possible sources
        console.log(
          "  - Debug - ENV_VERIFY_SESSION_ENDPOINT from @env:",
          ENV_VERIFY_SESSION_ENDPOINT,
        );
        console.log("  - Debug - Constants.extra:", Constants.extra);
        console.log(
          "  - Debug - Constants.extra?.VERIFY_SESSION_ENDPOINT:",
          Constants.extra?.VERIFY_SESSION_ENDPOINT,
        );
        console.log(
          "  - Debug - process.env.VERIFY_SESSION_ENDPOINT:",
          process.env.VERIFY_SESSION_ENDPOINT,
        );

        // Try Constants.extra FIRST (this works in production APK)
        if (Constants.extra?.VERIFY_SESSION_ENDPOINT) {
          verifyEndpoint = String(
            Constants.extra.VERIFY_SESSION_ENDPOINT,
          ).trim();
          console.log("  ✅ From Constants.extra:", verifyEndpoint);
        }
        // Then try @env (works in development)
        else if (
          ENV_VERIFY_SESSION_ENDPOINT &&
          ENV_VERIFY_SESSION_ENDPOINT !== "undefined"
        ) {
          verifyEndpoint = String(ENV_VERIFY_SESSION_ENDPOINT).trim();
          console.log("  ✅ From @env:", verifyEndpoint);
        }
        // Then try process.env (fallback)
        else if (process.env.VERIFY_SESSION_ENDPOINT) {
          verifyEndpoint = String(process.env.VERIFY_SESSION_ENDPOINT).trim();
          console.log("  ✅ From process.env:", verifyEndpoint);
        }
        // Hardcoded fallback as last resort
        else {
          console.warn(
            "  ⚠️ No endpoint found in any source, using hardcoded fallback",
          );
          verifyEndpoint =
            "https://backend.tabdhey.bt/driver/api/verify-session";
          console.log("  ✅ Using hardcoded fallback:", verifyEndpoint);
        }

        console.log("  - Final endpoint:", verifyEndpoint);

        if (
          !verifyEndpoint ||
          verifyEndpoint === "undefined" ||
          verifyEndpoint === ""
        ) {
          console.error("\n❌ Boot: VERIFY_SESSION_ENDPOINT is invalid!");
          setBootState({
            loading: false,
            target: "WelcomeScreen",
            homeParams: {},
          });
          return;
        }

        // Step 4: Get push token - UPDATED with skipPermissionRequest: true
        console.log(
          "\n📲 Step 4: Fetching Expo push token (skipping permission request)...",
        );
        let deviceId = null;
        try {
          // IMPORTANT: Pass skipPermissionRequest: true to avoid permission popup during boot
          const pushTokenPromise = getExpoPushTokenAsync({
            skipPermissionRequest: true,
          });
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error("Push token timeout after 10 seconds")),
              10000,
            ),
          );

          deviceId = await Promise.race([pushTokenPromise, timeoutPromise]);

          if (deviceId && typeof deviceId === "string" && deviceId.length > 0) {
            console.log("✅ Device ID obtained successfully");
            console.log("  - Device ID length:", deviceId.length);
            console.log(
              "  - Device ID format:",
              deviceId.startsWith("ExponentPushToken")
                ? "ExponentPushToken ✓"
                : "Device format",
            );
            console.log(
              "  - Device ID prefix:",
              deviceId.substring(0, 30) + "...",
            );
          } else {
            console.error("❌ Device ID is invalid or empty:", deviceId);
            console.log("⚠️ Continuing without device ID (server may reject)");
            // Don't return here, try without device ID as fallback
            deviceId = null;
          }
        } catch (pushErr) {
          console.error("❌ Failed to get push token:", pushErr);
          console.log("⚠️ Continuing without device ID (server may reject)");
          deviceId = null;
        }

        // Step 5: Make verification request
        console.log("\n➡️ Step 5: Calling verify-session endpoint...");
        console.log("  - URL:", verifyEndpoint);

        // Prepare request body
        const requestBody = { user_id: userId };
        if (deviceId) {
          requestBody.device_id = String(deviceId);
          console.log("  - Including device_id in request");
        } else {
          console.log("  - No device_id available, sending only user_id");
        }

        console.log("  - Request body:", {
          ...requestBody,
          device_id: deviceId ? deviceId.substring(0, 20) + "..." : "null",
        });

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        try {
          const response = await fetch(verifyEndpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              "User-Agent": `MerchantApp/${Constants.expoConfig?.version || "1.0"} (Android)`,
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          console.log("  - HTTP Status:", response.status, response.statusText);
          console.log("  - Response Headers:", {
            contentType: response.headers.get("content-type"),
            contentLength: response.headers.get("content-length"),
          });

          const responseText = await response.text();
          console.log("  - Response length:", responseText.length);
          console.log(
            "  - Raw response (first 200 chars):",
            responseText.substring(0, 200),
          );

          let data = {};
          try {
            data = responseText ? JSON.parse(responseText) : {};
            console.log("  - Parsed success flag:", data?.success);
            console.log("  - Has token:", !!data?.token);
            console.log("  - Has user:", !!data?.user);
            console.log("  - Server message:", data?.message || "No message");
          } catch (parseError) {
            console.error("  - Failed to parse JSON:", parseError);
            throw new Error(
              `Invalid JSON response: ${responseText.substring(0, 100)}`,
            );
          }

          if (!response.ok) {
            console.error(
              `\n❌ Boot: HTTP ${response.status} - request failed`,
            );
            console.error("  - Server response:", responseText);
            setBootState({
              loading: false,
              target: "WelcomeScreen",
              homeParams: {},
            });
            return;
          }

          if (data?.success === false) {
            console.error("\n❌ Boot: Server returned success=false");
            console.error(
              "  - Error message:",
              data?.message || "No message provided",
            );
            console.error(
              "  - Full error response:",
              JSON.stringify(data, null, 2),
            );
            setBootState({
              loading: false,
              target: "WelcomeScreen",
              homeParams: {},
            });
            return;
          }

          if (!isTruthySuccess(data)) {
            console.error(
              "\n❌ Boot: Response validation failed - not a success response",
            );
            console.error("  - Response data:", JSON.stringify(data, null, 2));
            setBootState({
              loading: false,
              target: "WelcomeScreen",
              homeParams: {},
            });
            return;
          }

          console.log("\n✅ Boot: Verify-session successful!");

          // Step 6: Save to SecureStore
          console.log("\n💾 Step 6: Saving session to SecureStore...");
          const saved = await saveVerifySessionPayloadToSecureStore(data);
          console.log(
            "  - Saved accessToken:",
            saved.accessToken ? "YES" : "NO",
          );
          console.log(
            "  - Saved refreshToken:",
            saved.refreshToken ? "YES" : "NO",
          );
          console.log("  - Saved userId:", saved.userId);
          console.log("  - Saved businessId:", saved.businessId);

          // Verify the save was successful
          const verifyUserId = await SecureStore.getItemAsync(KEY_USER_ID);
          const verifyAuthToken =
            await SecureStore.getItemAsync(KEY_AUTH_TOKEN);
          console.log("  - Verification - user_id saved:", !!verifyUserId);
          console.log(
            "  - Verification - auth_token saved:",
            !!verifyAuthToken,
          );

          console.log(
            "\n✅✅✅ AUTO-LOGIN SUCCESSFUL! Navigating to Home Screen ✅✅✅",
          );

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
        } catch (fetchError) {
          clearTimeout(timeoutId);
          console.error("\n❌ Boot: Network/Fetch error:", fetchError);
          console.error("  - Error name:", fetchError.name);
          console.error("  - Error message:", fetchError.message);
          if (fetchError.name === "AbortError") {
            console.error("  - Request timed out after 15 seconds");
          }
          setBootState({
            loading: false,
            target: "WelcomeScreen",
            homeParams: {},
          });
        }
      } catch (error) {
        console.error("\n💥 Boot: Fatal error during session check:", error);
        console.error("  - Error stack:", error.stack);
        setBootState({
          loading: false,
          target: "WelcomeScreen",
          homeParams: {},
        });
      }

      console.log("=".repeat(50));
      console.log("🏁 Boot sequence completed");
      console.log("=".repeat(50));
    })();
  }, []);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      "open-order-details",
      (params = {}) => {
        if (!navRef?.isReady?.()) return;

        const current = navRef.getCurrentRoute?.();
        if (
          current?.name === "OrderDetails" &&
          current?.params?.orderId === params.orderId
        ) {
          return;
        }

        try {
          navRef.dispatch(
            CommonActions.navigate({
              name: "OrderDetails",
              params,
              merge: true,
            }),
          );
        } catch (err) {
          console.warn("Navigation to OrderDetails failed:", err);
        }
      },
    );

    return () => sub.remove();
  }, [navRef]);

  return (
    <SafeAreaProvider>
      {!bootState.loading && (
        <>
          <NavigationContainer
            ref={navRef}
            onReady={() => (global.__nav = navRef)}
          >
            <AppLockGate>
              <Stack.Navigator
                initialRouteName={bootState.target}
                screenOptions={{ headerShown: false }}
              >
                <Stack.Screen name="Welcome" component={WelcomeScreen} />
                <Stack.Screen name="WelcomeScreen" component={WelcomeScreen} />

                <Stack.Screen
                  name="GrabMerchantHomeScreen"
                  component={GrabMerchantHomeScreen}
                  initialParams={
                    bootState.target === "GrabMerchantHomeScreen"
                      ? bootState.homeParams
                      : {}
                  }
                />

                <Stack.Screen name="LoginScreen" component={LoginScreen} />
                <Stack.Screen
                  name="OnboardingScreen"
                  component={OnboardingScreen}
                />
                <Stack.Screen
                  name="SellingTypeScreen"
                  component={SellingTypeScreen}
                />
                <Stack.Screen
                  name="GrabFoodScreen"
                  component={GrabFoodScreen}
                />
                <Stack.Screen
                  name="GrabMartScreen"
                  component={GrabMartScreen}
                />
                <Stack.Screen name="SignupScreen" component={SignupScreen} />
                <Stack.Screen
                  name="PhoneNumberScreen"
                  component={PhoneNumberScreen}
                />
                <Stack.Screen
                  name="MobileLoginScreen"
                  component={MobileLoginScreen}
                />
                <Stack.Screen
                  name="ForgotUsername"
                  component={ForgotUsername}
                />
                <Stack.Screen
                  name="EmailSentScreen"
                  component={EmailSentScreen}
                />
                <Stack.Screen
                  name="ForgotPassword"
                  component={ForgotPassword}
                />
                <Stack.Screen
                  name="ResetPasswordNumber"
                  component={ResetPasswordNumber}
                />
                <Stack.Screen
                  name="MerchantRegistrationScreen"
                  component={MerchantRegistrationScreen}
                />
                <Stack.Screen
                  name="MerchantExtrasScreen"
                  component={MerchantExtrasScreen}
                />
                <Stack.Screen
                  name="BankPaymentInfoScreen"
                  component={BankPaymentInfoScreen}
                />
                <Stack.Screen
                  name="DeliveryOptionsScreen"
                  component={DeliveryOptionsScreen}
                />
                <Stack.Screen
                  name="ReviewSubmitScreen"
                  component={ReviewSubmitScreen}
                />
                <Stack.Screen
                  name="EmailOtpVerificationScreen"
                  component={EmailOtpVerificationScreen}
                />
                <Stack.Screen
                  name="MartServiceSetupScreen"
                  component={MartServiceSetupScreen}
                />
                <Stack.Screen
                  name="FoodMenuSetupScreen"
                  component={FoodMenuSetupScreen}
                />

                <Stack.Screen name="MenuScreen" component={MenuScreen} />
                <Stack.Screen
                  name="AccountSettings"
                  component={AccountSettings}
                />
                <Stack.Screen
                  name="PersonalInformation"
                  component={PersonalInformation}
                />
                <Stack.Screen
                  name="PasswordManagement"
                  component={PasswordManagement}
                />
                <Stack.Screen
                  name="SecuritySettings"
                  component={SecuritySettings}
                />
                <Stack.Screen
                  name="NotificationSettings"
                  component={NotificationSettings}
                />
                <Stack.Screen
                  name="ProfileBusinessDetails"
                  component={ProfileBusinessDetails}
                />
                <Stack.Screen
                  name="EditBusinessDetails"
                  component={EditBusinessDetails}
                />
                <Stack.Screen
                  name="ManageQuickActions"
                  component={ManageQuickActionsScreen}
                />
                <Stack.Screen name="OrderDetails" component={OrderDetails} />
                <Stack.Screen
                  name="FeedbackScreen"
                  component={FeedbackScreen}
                />
                <Stack.Screen
                  name="TwoFactorPromptScreen"
                  component={TwoFactorPromptScreen}
                />
                <Stack.Screen
                  name="TermsOfService"
                  component={TermsOfService}
                />
                <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicy} />
                <Stack.Screen name="HelpScreen" component={HelpScreen} />
                <Stack.Screen
                  name="SetNewPasswordScreen"
                  component={SetNewPasswordScreen}
                />
                <Stack.Screen
                  name="ForgotOTPVerify"
                  component={ForgotOTPVerify}
                />
                <Stack.Screen name="MartOrdersTab" component={MartOrdersTab} />
                <Stack.Screen name="MessageScreen" component={MessageScreen} />
                <Stack.Screen
                  name="ChatDetailScreen"
                  component={ChatDetailScreen}
                />
                <Stack.Screen name="PayoutTab" component={PayoutTab} />
                <Stack.Screen
                  name="SalesAnalyticsScreen"
                  component={SalesAnalyticsScreen}
                />

                <Stack.Screen
                  name="NearbyOrdersScreen"
                  component={NearbyOrdersScreen}
                />
                <Stack.Screen
                  name="NearbyClusterOrdersScreen"
                  component={NearbyClusterOrdersScreen}
                />
                <Stack.Screen
                  name="ClusterDeliveryOptionsScreen"
                  component={ClusterDeliveryOptionsScreen}
                />
                <Stack.Screen
                  name="SimilarItemCatalog"
                  component={SimilarItemCatalog}
                />
                <Stack.Screen
                  name="TrackBatchOrdersScreen"
                  component={TrackBatchOrdersScreen}
                />
                <Stack.Screen
                  name="TrackDeliveryDriver"
                  component={TrackDeliveryDriver}
                />

                <Stack.Screen
                  name="DriverBatchDetailsOverlayScreen"
                  component={DriverBatchDetailsOverlayScreen}
                  options={{ headerShown: false, presentation: "modal" }}
                />

                <Stack.Screen
                  name="TermsOfServiceScreen"
                  component={TermsOfServiceScreen}
                />
                <Stack.Screen
                  name="PrivacyPolicyScreen"
                  component={PrivacyPolicyScreen}
                />
                <Stack.Screen
                  name="PasswordSentScreen"
                  component={PasswordSentScreen}
                />
                <Stack.Screen
                  name="BatchRidesScreen"
                  component={BatchRidesScreen}
                />

                <Stack.Screen name="Wallet" component={Wallet} />
                <Stack.Screen name="ScanQR" component={ScanQR} />
                <Stack.Screen name="TopUp" component={TopUp} />
                <Stack.Screen name="TopUpBank" component={TopUpBank} />
                <Stack.Screen name="TopUpOtp" component={TopUpOtp} />
                <Stack.Screen name="WalletMyQR" component={WalletMyQR} />
                <Stack.Screen name="WalletSetMPIN" component={WalletSetMPIN} />
                <Stack.Screen
                  name="WalletSettings"
                  component={WalletSettings}
                />
                <Stack.Screen name="WalletSetTPIN" component={WalletSetTPIN} />
                <Stack.Screen
                  name="WalletTransfer"
                  component={WalletTransfer}
                />

                <Stack.Screen
                  name="WalletTransferSuccess"
                  component={WalletTransferSuccess}
                />

                <Stack.Screen name="Withdrawal" component={Withdrawal} />
                <Stack.Screen name="Chat" component={Chat} />
                <Stack.Screen
                  name="EditItemScreen"
                  component={EditItemScreen}
                />
                <Stack.Screen
                  name="ItemDetailScreen"
                  component={ItemDetailScreen}
                />

                <Stack.Screen
                  name="MerchantChatRoomScreen"
                  component={ChatRoomScreen}
                />
              </Stack.Navigator>
            </AppLockGate>
          </NavigationContainer>

          <OrderNotifyOverlay navigation={navRef} />
        </>
      )}

      {showSplash && (
        <SplashScreen
          loading={bootState.loading}
          onHidden={() => setShowSplash(false)}
        />
      )}
    </SafeAreaProvider>
  );
}
