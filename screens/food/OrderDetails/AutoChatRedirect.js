// components/AutoChatRedirect.js
// ✅ NO BACKEND CHANGES NEEDED - Uses regular text messages

import React, { useEffect, useRef, useState } from "react";
import { View, Alert, ActivityIndicator, Modal, Text } from "react-native";
import { useNavigation } from "@react-navigation/native";
import * as SecureStore from "expo-secure-store";
import { BRAND, FONT, RADIUS, SHADOW, TEXT } from "../../../styles/tabdey_brand";
import {
  createOrGetOrderConversationFromOrderDetails,
  sendTextMessage,
} from "../../../utils/chatApi";

const AutoChatRedirect = ({
  visible = false,
  onComplete = () => {},
  onError = () => {},
  order = null,
  replacements = [],
  businessId = null,
  businessName = "",
  routeOrderId = null,
  autoNavigate = true,
}) => {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const triggeredRef = useRef(false);

  // Format replacements as readable text message
  const formatReplacementsMessage = (repls) => {
    if (!repls || repls.length === 0) return "";

    let message = "🔄 *ITEM REPLACEMENT NOTICE*\n\n";
    message += "Dear customer,\n\n";
    message +=
      "The following items were unavailable and have been replaced with similar items:\n\n";

    repls.forEach((r, idx) => {
      const oldName = r.old?.item_name || "Unknown item";
      const newName = r.new?.item_name || "Unknown replacement";
      const quantity = r.new?.quantity || 1;
      const price = r.new?.price || 0;
      const subtotal = price * quantity;

      message += `${idx + 1}. ❌ ${oldName}\n`;
      message += `   ✅ Replaced with: ${newName}\n`;
      message += `   📦 Quantity: ${quantity}\n`;
      message += `   💰 Price: Nu. ${price.toFixed(2)}\n`;
      message += `   📝 Subtotal: Nu. ${subtotal.toFixed(2)}\n\n`;
    });

    const totalAmount = repls.reduce(
      (sum, r) => sum + (r.new?.price || 0) * (r.new?.quantity || 1),
      0,
    );
    message += `━━━━━━━━━━━━━━━━━━━━\n`;
    message += `💰 New Total for replaced items: Nu. ${totalAmount.toFixed(2)}\n\n`;
    message += `Please review these changes. Contact us if you have any concerns.\n\n`;
    message += `Thank you for your understanding!\n`;
    message += `${businessName || "Our Store"}`;

    return message;
  };

  const handleAutoChat = async () => {
    if (!visible || triggeredRef.current) return;
    if (!replacements || replacements.length === 0) {
      onComplete({ success: false, reason: "no_replacements" });
      return;
    }

    setLoading(true);
    setProgress("Opening chat...");

    try {
      const token = await SecureStore.getItemAsync("auth_token");
      const merchant_user_id =
        (await SecureStore.getItemAsync("user_id_v1")) ||
        (await SecureStore.getItemAsync("user_id")) ||
        null;

      if (!merchant_user_id) throw new Error("Merchant user_id not found");

      const customer_id =
        order?.__user?.user_id ??
        order?.__user?.id ??
        order?.user?.user_id ??
        order?.user?.id ??
        order?.user_id ??
        order?.customer_id ??
        null;

      if (!customer_id) throw new Error("Customer ID not found");

      const orderIdForChat =
        order?.order_code || order?.order_id || order?.id || routeOrderId;
      if (!orderIdForChat) throw new Error("Order ID missing");

      setProgress("Creating conversation...");

      // Create or get conversation
      const resp = await createOrGetOrderConversationFromOrderDetails({
        orderId: orderIdForChat,
        customer_id,
        business_id: businessId,
        merchant_user_id,
        token,
      });

      const conversationId =
        resp?.conversation_id ??
        resp?.data?.conversation_id ??
        resp?.conversationId ??
        null;
      if (!conversationId) throw new Error("No conversation_id returned");

      setProgress("Sending replacement details...");

      // Format and send as regular text message (NO BACKEND CHANGES!)
      const messageText = formatReplacementsMessage(replacements);

      await sendTextMessage({
        conversationId,
        bodyText: messageText,
        userType: "MERCHANT",
        userId: merchant_user_id,
        businessIdHeader: businessId,
        token,
      });

      setProgress("Done!");

      onComplete({
        success: true,
        conversationId,
        orderId: orderIdForChat,
        replacementsCount: replacements.length,
      });

      if (autoNavigate) {
        setTimeout(() => {
          navigation.navigate("MerchantChatRoomScreen", {
            conversationId: String(conversationId),
            orderId: String(orderIdForChat),
            userType: "MERCHANT",
            userId: String(merchant_user_id),
            businessId: String(businessId),
            meta: {
              customerId: String(customer_id),
              customerName:
                order?.customer_name ||
                order?.user_name ||
                order?.__user?.user_name ||
                order?.__user?.name ||
                "",
              customer_profile_image:
                order?.__user?.profile_image ||
                order?.__user?.profileImage ||
                order?.__user?.avatar ||
                "",
            },
            source: "auto-chat-redirect",
          });
          setLoading(false);
          triggeredRef.current = true;
        }, 500);
      } else {
        setLoading(false);
        triggeredRef.current = true;
      }
    } catch (error) {
      console.error("[AutoChatRedirect] Error:", error);
      setLoading(false);
      onError(error?.message || "Failed to open chat");

      Alert.alert(
        "Chat Notice",
        `Order accepted with replacements, but couldn't open chat automatically.\n\nYou can manually message the customer about the replacements using the chat button.`,
        [{ text: "OK" }],
      );
    }
  };

  useEffect(() => {
    if (visible && replacements?.length > 0 && !triggeredRef.current) {
      handleAutoChat();
    }
  }, [visible]);

  useEffect(() => {
    return () => {
      triggeredRef.current = false;
    };
  }, []);

  return (
    <Modal visible={visible && loading} transparent={true} animationType="fade">
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.5)",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <View
          style={{
            backgroundColor: BRAND.white,
            borderRadius: RADIUS.lg,
            borderColor: BRAND.greyBorder,
            padding: 24,
            width: "80%",
            maxWidth: 300,
            alignItems: "center",
            borderWidth: 1,
            ...SHADOW.md,
          }}
        >
          <ActivityIndicator size="large" color={BRAND.purple} />
          <Text
            style={{
              ...TEXT.h3,
              textAlign: "center",
              marginTop: 16,
              marginBottom: 8,
              color: BRAND.black,
            }}
          >
            Notifying customer...
          </Text>
          {progress && (
            <Text
              style={{
                ...TEXT.body,
                color: BRAND.grey,
                textAlign: "center",
                marginTop: 4,
              }}
            >
              {progress}
            </Text>
          )}
          <View
            style={{
              marginTop: 16,
              padding: 12,
              backgroundColor: "#F4E9FF",
              borderRadius: 14,
              width: "100%",
              borderWidth: 1,
              borderColor: "#F3E8FF",
            }}
          >
            <Text
              style={{
                ...TEXT.bodySmall,
                color: BRAND.purple,
                textAlign: "center",
              }}
            >
              📝 Sending replacement details to customer via chat
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default AutoChatRedirect;
