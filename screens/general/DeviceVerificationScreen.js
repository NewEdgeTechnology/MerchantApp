import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
  TextInput,
  Alert,
  useWindowDimensions,
  DeviceEventEmitter as RNDeviceEventEmitter,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/Ionicons";
import {
  CommonActions,
  useNavigation,
  useRoute,
} from "@react-navigation/native";
import * as SecureStore from "expo-secure-store";
import {
  LOGIN_MERCHANT_ENDPOINT,
  DEVICE_CHANGE_VERIFY_OTP_ENDPOINT,
} from "@env";
import { BRAND, FONT, RADIUS, SHADOW } from "../styles/tabdey_brand";
import { connectMerchantSocket } from "../realtime/merchantSocket";

const KEY_AUTH_TOKEN = "auth_token";
const KEY_REFRESH_TOKEN = "refresh_token_v1";
const KEY_MERCHANT_LOGIN = "merchant_login";
const KEY_USER_ID = "user_id_v1";
const KEY_BUSINESS_ID = "business_id_v1";

const KEY_SAVED_PHONE = "saved_phone_v1";
const KEY_SAVED_PHONE_PASSWORD = "saved_phone_password_v1";
const KEY_LAST_LOGIN_PHONE = "last_login_phone_v1";

const KEY_PENDING_DEVICE_LOGIN = "pending_device_login_v1";

const changeDeviceVerifyOtpEndpoint = (
  DEVICE_CHANGE_VERIFY_OTP_ENDPOINT || ""
).trim();

const digitsOnly = (value = "") => String(value || "").replace(/\D/g, "");

const isEmailIdentifier = (value = "") =>
  String(value || "")
    .trim()
    .includes("@");

const getLoginIdentifier = (pendingLogin) => {
  const rawLogin = String(
    pendingLogin?.login_identifier ??
      pendingLogin?.identifier ??
      pendingLogin?.username ??
      pendingLogin?.phone ??
      pendingLogin?.email ??
      "",
  ).trim();

  if (isEmailIdentifier(rawLogin)) {
    return {
      type: "email",
      key: "email",
      value: rawLogin.toLowerCase(),
    };
  }

  const phoneDigits =
    digitsOnly(pendingLogin?.phone_digits || "").length === 8
      ? digitsOnly(pendingLogin?.phone_digits || "")
      : digitsOnly(rawLogin).slice(-8);

  return {
    type: "phone",
    key: "phone",
    value: phoneDigits,
  };
};

const SafeDeviceEventEmitter =
  RNDeviceEventEmitter && typeof RNDeviceEventEmitter.emit === "function"
    ? RNDeviceEventEmitter
    : { emit: () => {} };

const safeJsonParse = async (res) => {
  const raw = await res.text();

  try {
    return { data: JSON.parse(raw), raw };
  } catch {
    return { data: null, raw };
  }
};

const postJson = async (url, body, signal) => {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });

  const parsed = await safeJsonParse(res);
  return { res, ...parsed };
};

function extractErrorMessage(out) {
  const fallback = "Verification failed. Please try again.";

  if (out?.data && typeof out.data === "object") {
    const msg =
      out.data.message ||
      out.data.error ||
      out.data.msg ||
      out.data?.data?.message ||
      out.data?.data?.error ||
      out.data?.data?.msg ||
      "";

    if (String(msg || "").trim()) return String(msg).trim();
  }

  const raw = String(out?.raw || "").trim();
  if (!raw) return fallback;

  try {
    const parsed = JSON.parse(raw);
    const msg = parsed?.message || parsed?.error || parsed?.msg || "";
    if (String(msg || "").trim()) return String(msg).trim();
  } catch {
    return raw || fallback;
  }

  return fallback;
}

export default function DeviceVerificationScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { height } = useWindowDimensions();

  const isSmallScreen = height < 720;
  const isTinyScreen = height < 650;

  const message =
    route?.params?.message ||
    "This account is already logged in on another device.";
  const previousDevice = route?.params?.previous_device || "";
  const maskedPhone = route?.params?.masked_phone || "";

  const [pendingLogin, setPendingLogin] = useState(null);
  const [otpCode, setOtpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [screenLoading, setScreenLoading] = useState(true);
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    const loadPendingLogin = async () => {
      try {
        const raw = await SecureStore.getItemAsync(KEY_PENDING_DEVICE_LOGIN);

        if (!raw) {
          setErrorText(
            "Login verification session expired. Please log in again.",
          );
          setScreenLoading(false);
          return;
        }

        const parsed = JSON.parse(raw);
        setPendingLogin(parsed);
      } catch {
        setErrorText("Unable to load login verification session.");
      } finally {
        setScreenLoading(false);
      }
    };

    loadPendingLogin();
  }, []);

  const cancelVerification = async () => {
    try {
      await SecureStore.deleteItemAsync(KEY_PENDING_DEVICE_LOGIN);
    } catch {}

    navigation.goBack();
  };

  const navigateHome = (extras = {}) => {
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [
          {
            name: "GrabMerchantHomeScreen",
            params: {
              openTab: "Home",
              nonce: Date.now(),
              ...extras,
            },
          },
        ],
      }),
    );
  };

  const verifyThisDevice = async () => {
    setErrorText("");

    const loginBase = (LOGIN_MERCHANT_ENDPOINT || "").trim();

    if (!loginBase) {
      Alert.alert(
        "Configuration error",
        "LOGIN_MERCHANT_ENDPOINT is not configured in .env",
      );
      return;
    }

    if (!changeDeviceVerifyOtpEndpoint) {
      Alert.alert(
        "Configuration error",
        "DEVICE_CHANGE_VERIFY_OTP_ENDPOINT is not configured in .env",
      );
      return;
    }

    const cleanOtp = String(otpCode || "").trim();
    const loginIdentifier = getLoginIdentifier(pendingLogin);

    if (!loginIdentifier?.value) {
      setErrorText("Email or phone number is missing. Please log in again.");
      return;
    }

    if (
      loginIdentifier.type === "phone" &&
      loginIdentifier.value.length !== 8
    ) {
      setErrorText("Phone number is invalid. Please log in again.");
      return;
    }

    if (!pendingLogin?.password || !pendingLogin?.device_id) {
      setErrorText("Verification session is incomplete. Please log in again.");
      return;
    }

    if (!cleanOtp || cleanOtp.length !== 6) {
      setErrorText("Please enter the 6-digit OTP.");
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    setLoading(true);

    try {
      /**
       * STEP 1:
       * Verify OTP using:
       * POST /verify-change-device-otp
       *
       * Required backend JSON:
       * {
       *   phone: "77282280",
       *   device_id: "new-device-",
       *   otp: "606679"
       * }
       */
      const verifyOut = await postJson(
        changeDeviceVerifyOtpEndpoint,
        {
          [loginIdentifier.key]: loginIdentifier.value,
          device_id: pendingLogin.device_id,
          otp: cleanOtp,
        },
        controller.signal,
      );

    //   console.log(
    //     "Verify change-device OTP:",
    //     verifyOut.res.status,
    //     verifyOut.raw,
    //   );

      if (!verifyOut.res.ok) {
        const msg = extractErrorMessage(verifyOut);
        setErrorText(msg);
        return;
      }

      /**
       * STEP 2:
       * OTP is valid, now force-login this device.
       */
      const loginPayload = {
        [loginIdentifier.key]: loginIdentifier.value,
        password: pendingLogin.password,
        device_id: pendingLogin.device_id,
        push_token: pendingLogin.push_token || pendingLogin.device_id,

        force_login: true,
        replace_existing_session: true,

        conflict_token: pendingLogin.conflict_token || undefined,
      };

      const out = await postJson(loginBase, loginPayload, controller.signal);

    //   console.log("Force login after OTP:", out.res.status, out.raw);

      if (!out.res.ok) {
        const msg = extractErrorMessage(out);
        setErrorText(msg);
        return;
      }

      const data = out.data || {};

      const tokenObj = data?.token || data?.data?.token || {};

      const accessToken =
        (typeof data?.token === "string" && data.token) ||
        tokenObj?.access_token ||
        tokenObj?.accessToken ||
        data?.access_token ||
        data?.accessToken ||
        "";

      const refreshToken =
        tokenObj?.refresh_token ||
        tokenObj?.refreshToken ||
        data?.refresh_token ||
        data?.refreshToken ||
        "";

      if (accessToken) {
        await SecureStore.setItemAsync(KEY_AUTH_TOKEN, String(accessToken));
      }

      if (refreshToken) {
        await SecureStore.setItemAsync(KEY_REFRESH_TOKEN, String(refreshToken));
      }

      const userInfo =
        data?.merchant ||
        data?.user ||
        data?.data?.merchant ||
        data?.data?.user ||
        data ||
        {};

      const user_id =
        userInfo?.user_id ?? userInfo?.id ?? data?.user_id ?? data?.id ?? null;

      const business_id =
        userInfo?.business_id ??
        userInfo?.businessId ??
        data?.business_id ??
        data?.id ??
        "";

      const business_name =
        userInfo?.business_name ??
        userInfo?.businessName ??
        data?.business_name ??
        "";

      const business_logo =
        userInfo?.business_logo ??
        userInfo?.businessLogo ??
        userInfo?.logo ??
        "";

      const business_address =
        userInfo?.business_address ??
        userInfo?.businessAddress ??
        userInfo?.address ??
        "";

      const owner_type = String(
        userInfo?.owner_type ??
          userInfo?.ownerType ??
          data?.owner_type ??
          data?.ownerType ??
          "food",
      )
        .trim()
        .toLowerCase();

      if (user_id != null && String(user_id).trim()) {
        await SecureStore.setItemAsync(KEY_USER_ID, String(user_id));
      } else {
        await SecureStore.deleteItemAsync(KEY_USER_ID);
      }

      if (business_id != null && String(business_id).trim()) {
        const bid = String(business_id);
        await SecureStore.setItemAsync(KEY_BUSINESS_ID, bid);
        await SecureStore.setItemAsync("business_id", bid);
        await SecureStore.setItemAsync("businessId", bid);
      } else {
        await SecureStore.deleteItemAsync(KEY_BUSINESS_ID);
        await SecureStore.deleteItemAsync("business_id");
        await SecureStore.deleteItemAsync("businessId");
      }

      const userPayload = {
        user_id,
        business_id,
        business_name,
        business_logo,
        business_address,
        phone: loginIdentifier.type === "phone" ? loginIdentifier.value : "",
        email: loginIdentifier.type === "email" ? loginIdentifier.value : "",
        login_type: loginIdentifier.type,
        device_id: pendingLogin.device_id,
        push_token: pendingLogin.push_token || pendingLogin.device_id,
        owner_type,
      };

      await SecureStore.setItemAsync(
        KEY_MERCHANT_LOGIN,
        JSON.stringify(userPayload),
      );

      await SecureStore.setItemAsync(
        KEY_LAST_LOGIN_PHONE,
        loginIdentifier.type === "phone" ? String(loginIdentifier.value) : "",
      );

      if (pendingLogin.save_password) {
        await SecureStore.setItemAsync(
          KEY_SAVED_PHONE,
          loginIdentifier.type === "phone" ? String(loginIdentifier.value) : "",
        );
        await SecureStore.setItemAsync(
          KEY_SAVED_PHONE_PASSWORD,
          String(pendingLogin.password || ""),
        );
      } else {
        await SecureStore.deleteItemAsync(KEY_SAVED_PHONE);
        await SecureStore.deleteItemAsync(KEY_SAVED_PHONE_PASSWORD);
      }

      await SecureStore.deleteItemAsync(KEY_PENDING_DEVICE_LOGIN);

      SafeDeviceEventEmitter.emit("profile-updated", {
        business_name,
        business_logo,
      });

      try {
        connectMerchantSocket({ user_id, business_id });
      } catch {}

      navigateHome({
        business_name,
        business_logo,
        business_address,
        business_id,
        auth_token: accessToken,
        user_id: user_id != null ? String(user_id) : "",
        owner_type,
        ownerType: owner_type,
        expo_push_token: pendingLogin.push_token || pendingLogin.device_id,
        device_id: pendingLogin.device_id,
      });
    } catch (e) {
      const msg =
        e?.name === "AbortError"
          ? "Request timeout. Please try again."
          : "Network error. Please try again.";

      setErrorText(msg);
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  };

  if (screenLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={BRAND.purple} />
        <Text style={styles.loadingText}>Preparing secure check...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView
      style={styles.container}
      edges={["top", "left", "right", "bottom"]}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#FBF7FF" />

      <View style={styles.topGlow} />

      <View style={[styles.header, isSmallScreen && styles.headerSmall]}>
        <TouchableOpacity
          onPress={cancelVerification}
          style={[styles.iconButton, isSmallScreen && styles.iconButtonSmall]}
          disabled={loading}
          activeOpacity={0.75}
        >
          <Icon
            name="arrow-back"
            size={isSmallScreen ? 22 : 24}
            color="#1A1D1F"
          />
        </TouchableOpacity>

        <Text
          style={[styles.headerTitle, isSmallScreen && styles.headerTitleSmall]}
        >
          Device Check
        </Text>

        <View
          style={[
            styles.iconButtonPlaceholder,
            isSmallScreen && styles.iconButtonSmall,
          ]}
        />
      </View>

      <View style={[styles.content, isSmallScreen && styles.contentSmall]}>
        <View style={[styles.card, isSmallScreen && styles.cardSmall]}>
          {!isTinyScreen && (
            <View style={styles.badge}>
              <Icon
                name="shield-checkmark-outline"
                size={15}
                color={BRAND.purple}
              />
              <Text style={styles.badgeText}>Secure login verification</Text>
            </View>
          )}

          <View
            style={[styles.iconCircle, isSmallScreen && styles.iconCircleSmall]}
          >
            <Icon
              name="phone-portrait-outline"
              size={isSmallScreen ? 28 : 34}
              color={BRAND.purple}
            />
          </View>

          <Text style={[styles.title, isSmallScreen && styles.titleSmall]}>
            Continue on this device?
          </Text>

          <Text
            style={[styles.subtitle, isSmallScreen && styles.subtitleSmall]}
          >
            Your merchant account is already active on another device. Continue
            here only if this is your current trusted device.
          </Text>

          {!!maskedPhone && (
            <View
              style={[
                styles.accountBox,
                isSmallScreen && styles.accountBoxSmall,
              ]}
            >
              <View
                style={[
                  styles.accountIcon,
                  isSmallScreen && styles.accountIconSmall,
                ]}
              >
                <Icon name="call-outline" size={17} color={BRAND.purple} />
              </View>

              <View style={styles.accountTextWrap}>
                <Text style={styles.accountLabel}>Merchant number</Text>
                <Text
                  style={[
                    styles.accountValue,
                    isSmallScreen && styles.accountValueSmall,
                  ]}
                >
                  {maskedPhone}
                </Text>
              </View>
            </View>
          )}

          {!!previousDevice && (
            <View
              style={[
                styles.accountBox,
                isSmallScreen && styles.accountBoxSmall,
              ]}
            >
              <View
                style={[
                  styles.accountIcon,
                  isSmallScreen && styles.accountIconSmall,
                ]}
              >
                <Icon
                  name="phone-portrait-outline"
                  size={17}
                  color={BRAND.purple}
                />
              </View>

              <View style={styles.accountTextWrap}>
                <Text style={styles.accountLabel}>Active device</Text>
                <Text
                  style={[
                    styles.accountValue,
                    isSmallScreen && styles.accountValueSmall,
                  ]}
                >
                  {previousDevice}
                </Text>
              </View>
            </View>
          )}

          <View
            style={[styles.noticeBox, isSmallScreen && styles.noticeBoxSmall]}
          >
            <View style={styles.noticeItem}>
              <Icon name="log-out-outline" size={17} color={BRAND.purple} />
              <Text
                style={[
                  styles.noticeText,
                  isSmallScreen && styles.noticeTextSmall,
                ]}
              >
                Previous device will be logged out automatically.
              </Text>
            </View>

            {!isTinyScreen && (
              <>
                <View style={styles.noticeDivider} />

                <View style={styles.noticeItem}>
                  <Icon
                    name="lock-closed-outline"
                    size={17}
                    color={BRAND.purple}
                  />
                  <Text
                    style={[
                      styles.noticeText,
                      isSmallScreen && styles.noticeTextSmall,
                    ]}
                  >
                    Your account and store data will remain safe.
                  </Text>
                </View>
              </>
            )}
          </View>

          <View
            style={[styles.otpSection, isSmallScreen && styles.otpSectionSmall]}
          >
            <Text style={[styles.label, isSmallScreen && styles.labelSmall]}>
              Security code
            </Text>

            <TextInput
              value={otpCode}
              onChangeText={(t) => {
                setOtpCode(
                  String(t || "")
                    .replace(/\D/g, "")
                    .slice(0, 6),
                );
                setErrorText("");
              }}
              placeholder="Enter 6-digit OTP"
              placeholderTextColor="#9CA3AF"
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={6}
              style={[styles.otpInput, isSmallScreen && styles.otpInputSmall]}
              editable={!loading}
            />

            {!isTinyScreen && (
              <Text style={styles.otpHelp}>
                Enter the OTP sent to your registered mobile number.
              </Text>
            )}
          </View>

          {!!errorText && (
            <View
              style={[styles.errorBox, isSmallScreen && styles.errorBoxSmall]}
            >
              <Icon name="alert-circle-outline" size={17} color={BRAND.red} />
              <Text style={styles.errorText}>{errorText}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[
              styles.primaryButton,
              isSmallScreen && styles.primaryButtonSmall,
              (loading || !pendingLogin) && styles.primaryButtonDisabled,
            ]}
            onPress={verifyThisDevice}
            disabled={loading || !pendingLogin}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator size="small" color={BRAND.white} />
            ) : (
              <>
                <Icon
                  name="checkmark-circle-outline"
                  size={19}
                  color={BRAND.white}
                />
                <Text
                  style={[
                    styles.primaryButtonText,
                    isSmallScreen && styles.primaryButtonTextSmall,
                  ]}
                >
                  Continue on this device
                </Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.secondaryButton,
              isSmallScreen && styles.secondaryButtonSmall,
            ]}
            onPress={cancelVerification}
            disabled={loading}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.secondaryButtonText,
                isSmallScreen && styles.secondaryButtonTextSmall,
              ]}
            >
              Go back to login
            </Text>
          </TouchableOpacity>

          {!isTinyScreen && !!message && (
            <Text style={styles.backendNote}>Reason: {message}</Text>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FBF7FF",
  },

  topGlow: {
    position: "absolute",
    top: -130,
    right: -95,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: BRAND.purpleLight,
    opacity: 0.48,
  },

  center: {
    justifyContent: "center",
    alignItems: "center",
  },

  loadingText: {
    fontFamily: FONT.body,
    marginTop: 12,
    fontSize: 14,
    color: BRAND.grey,
  },

  header: {
    minHeight: 56,
    paddingHorizontal: 22,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  headerSmall: {
    minHeight: 48,
    paddingBottom: 4,
  },

  iconButton: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.full,
    backgroundColor: BRAND.white,
    justifyContent: "center",
    alignItems: "center",
    ...SHADOW.sm,
  },

  iconButtonSmall: {
    width: 40,
    height: 40,
  },

  iconButtonPlaceholder: {
    width: 44,
    height: 44,
  },

  headerTitle: {
    fontFamily: FONT.header,
    fontSize: 22,
    fontWeight: "800",
    color: BRAND.black,
  },

  headerTitleSmall: {
    fontSize: 20,
  },

  content: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 14,
    justifyContent: "center",
  },

  contentSmall: {
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 8,
  },

  card: {
    backgroundColor: BRAND.white,
    borderRadius: 30,
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 22,
    borderWidth: 1,
    borderColor: "#F0E4FF",
    // ...SHADOW.md,
  },

  cardSmall: {
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 16,
  },

  badge: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F7EEFF",
    borderRadius: RADIUS.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginBottom: 5,
  },

  badgeText: {
    fontFamily: FONT.body,
    marginLeft: 6,
    fontSize: 11,
    fontWeight: "800",
    color: BRAND.purple,
  },

  iconCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "#F1E4FF",
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    // marginBottom: 14,
  },

  iconCircleSmall: {
    width: 56,
    height: 56,
    borderRadius: 28,
    // marginBottom: 10,
  },

  title: {
    fontFamily: FONT.header,
    fontSize: 24,
    fontWeight: "900",
    color: BRAND.black,
    textAlign: "center",
    marginBottom: 8,
  },

  titleSmall: {
    fontSize: 20,
    marginBottom: 6,
  },

  subtitle: {
    fontFamily: FONT.body,
    fontSize: 14,
    lineHeight: 21,
    color: BRAND.grey,
    textAlign: "center",
    marginBottom: 16,
  },

  subtitleSmall: {
    fontSize: 12.5,
    lineHeight: 18,
    marginBottom: 12,
  },

  accountBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FBF7FF",
    borderWidth: 1,
    borderColor: "#E9DDFB",
    borderRadius: 16,
    paddingHorizontal: 13,
    paddingVertical: 11,
    marginBottom: 9,
  },

  accountBoxSmall: {
    borderRadius: 14,
    paddingHorizontal: 11,
    paddingVertical: 8,
    marginBottom: 7,
  },

  accountIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: BRAND.white,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 11,
  },

  accountIconSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 9,
  },

  accountTextWrap: {
    flex: 1,
  },

  accountLabel: {
    fontFamily: FONT.body,
    fontSize: 11,
    color: BRAND.grey,
    marginBottom: 1,
  },

  accountValue: {
    fontFamily: FONT.body,
    fontSize: 14,
    fontWeight: "800",
    color: BRAND.black,
  },

  accountValueSmall: {
    fontSize: 13,
  },

  noticeBox: {
    backgroundColor: "#FCFAFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#EFE3FF",
    paddingHorizontal: 13,
    paddingVertical: 12,
    marginTop: 5,
    marginBottom: 14,
  },

  noticeBoxSmall: {
    borderRadius: 14,
    paddingHorizontal: 11,
    paddingVertical: 9,
    marginTop: 4,
    marginBottom: 10,
  },

  noticeItem: {
    flexDirection: "row",
    alignItems: "flex-start",
  },

  noticeText: {
    flex: 1,
    fontFamily: FONT.body,
    fontSize: 12.5,
    lineHeight: 18,
    color: BRAND.grey,
    marginLeft: 9,
  },

  noticeTextSmall: {
    fontSize: 11.5,
    lineHeight: 16,
  },

  noticeDivider: {
    height: 1,
    backgroundColor: "#EFE3FF",
    marginVertical: 10,
  },

  otpSection: {
    marginBottom: 6,
  },

  otpSectionSmall: {
    marginBottom: 4,
  },

  label: {
    fontFamily: FONT.body,
    fontSize: 13,
    fontWeight: "800",
    color: BRAND.black,
    marginBottom: 7,
  },

  labelSmall: {
    fontSize: 12,
    marginBottom: 5,
  },

  otpInput: {
    height: 50,
    borderRadius: 16,
    borderWidth: 1.2,
    borderColor: BRAND.greyBorder,
    backgroundColor: "#FCFCFC",
    paddingHorizontal: 16,
    fontFamily: FONT.body,
    fontSize: 15,
    fontWeight: "700",
    color: BRAND.black,
    textAlign: "center",
  },

  otpInputSmall: {
    height: 44,
    borderRadius: 14,
    fontSize: 14,
  },

  otpHelp: {
    fontFamily: FONT.body,
    fontSize: 11,
    color: BRAND.grey,
    marginTop: 6,
    textAlign: "center",
  },

  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#FFF1F1",
    borderWidth: 1,
    borderColor: "#FFD6D6",
    borderRadius: 14,
    paddingHorizontal: 11,
    paddingVertical: 9,
    marginTop: 8,
    marginBottom: 2,
  },

  errorBoxSmall: {
    paddingVertical: 7,
    marginTop: 6,
  },

  errorText: {
    flex: 1,
    fontFamily: FONT.body,
    color: BRAND.red,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16,
    marginLeft: 8,
  },

  primaryButton: {
    backgroundColor: BRAND.purple,
    paddingVertical: 15,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    marginTop: 12,
    ...SHADOW.md,
  },

  primaryButtonSmall: {
    paddingVertical: 13,
    marginTop: 10,
  },

  primaryButtonDisabled: {
    opacity: 0.65,
  },

  primaryButtonText: {
    fontFamily: FONT.body,
    color: BRAND.white,
    fontSize: 15,
    fontWeight: "900",
    marginLeft: 8,
  },

  primaryButtonTextSmall: {
    fontSize: 14,
  },

  secondaryButton: {
    backgroundColor: BRAND.white,
    borderWidth: 1.5,
    borderColor: BRAND.purple,
    paddingVertical: 14,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    marginTop: 10,
  },

  secondaryButtonSmall: {
    paddingVertical: 12,
    marginTop: 8,
  },

  secondaryButtonText: {
    fontFamily: FONT.body,
    color: BRAND.purple,
    fontSize: 14,
    fontWeight: "900",
  },

  secondaryButtonTextSmall: {
    fontSize: 13,
  },

  backendNote: {
    fontFamily: FONT.body,
    fontSize: 10.5,
    lineHeight: 15,
    color: BRAND.grey,
    textAlign: "center",
    marginTop: 10,
  },
});
