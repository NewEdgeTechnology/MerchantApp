// screens/message/ChatRoomScreen.js
// ✅ Updated to use .env for ALL origins/bases (no hardcoded hosts):
// - Customer profile base: PROFILE_IMAGE (fallback API_BASE_URL + "/driver")
// - Chat media base: CHAT_ORIGIN (fallback API_BASE_URL)
// - Socket config is already handled inside utils/chatSocket (recommended), but we pass ctx as before.

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StatusBar,
  Modal,
  Dimensions,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { BRAND, FONT, RADIUS, SHADOW } from "../styles/tabdey_brand";

import {
  getConversationMessages,
  sendTextMessage,
  sendImageMessage,
  markConversationRead,
  createOrGetOrderConversationFromOrderDetails,
} from "../../utils/chatApi";

import {
  connectChatSocket,
  joinChatConversation,
  leaveChatConversation,
  onChatNewMessage,
  offChatNewMessage,
} from "../../utils/chatSocket";

import { getUserInfo } from "../../utils/authToken";

// ✅ .env
import { PROFILE_IMAGE, API_BASE_URL, CHAT_ORIGIN } from "@env";

const { width: W, height: H } = Dimensions.get("window");

/* ===================== helpers ===================== */
const toStr = (v) => (v == null ? "" : String(v));
const trim = (v) => String(v || "").trim();

const pickFirst = (...vals) => {
  for (const v of vals) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return null;
};

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * ✅ Bases from env (NO hardcoding):
 * - Customer profile base: PROFILE_IMAGE (example: https://backend.tabdhey.bt/driver/)
 *   fallback: API_BASE_URL + "/driver"
 * - Chat media base: CHAT_ORIGIN (example: https://backend.tabdhey.bt)
 *   fallback: API_BASE_URL
 */
const CUSTOMER_PROFILE_BASE = (() => {
  const p = String(PROFILE_IMAGE || "").trim();
  if (p) return p.replace(/\/+$/, ""); // keep no trailing slash for join
  const api = String(API_BASE_URL || "")
    .trim()
    .replace(/\/+$/, "");
  return api ? `${api}/driver` : "";
})();

const CHAT_MEDIA_ORIGIN = (() => {
  const c = String(CHAT_ORIGIN || "").trim();
  if (c) return c.replace(/\/+$/, "");
  const api = String(API_BASE_URL || "")
    .trim()
    .replace(/\/+$/, "");
  return api || "";
})();

const resolveCustomerProfileUrl = (raw) => {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (/^data:image\//i.test(s)) return s;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^\/\//.test(s)) return `https:${s}`;

  const base = CUSTOMER_PROFILE_BASE.replace(/\/+$/, "");
  if (!base) return "";

  const rel = s.replace(/^\/+/, "");
  return `${base}/${rel}`;
};

const resolveChatMediaUrl = (raw) => {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (/^data:image\//i.test(s)) return s;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^\/\//.test(s)) return `https:${s}`;

  const base = CHAT_MEDIA_ORIGIN.replace(/\/+$/, "");
  if (!base) return "";

  const rel = s.startsWith("/") ? s : `/${s}`;
  return `${base}${rel}`;
};

const formatDateTime = (ts) => {
  const n0 = Number(ts);
  if (!Number.isFinite(n0) || n0 <= 0) return "";
  const ms = n0 < 1e12 ? n0 * 1000 : n0;
  try {
    const d = new Date(ms);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(ts);
  }
};

const isEmptyMessage = (msg) => {
  const type = String(msg?.message_type || msg?.type || "").toUpperCase();
  const body = trim(msg?.body ?? msg?.message ?? msg?.text);
  const media = trim(msg?.media_url ?? msg?.media ?? msg?.image_url);

  if (type === "TEXT") return !body;
  if (type === "IMAGE") return !media && !body;
  return !body && !media;
};

const normalizeMessage = (m) => {
  if (!m || typeof m !== "object") return null;

  const message_type = String(
    m.message_type || m.type || (m.media_url ? "IMAGE" : "TEXT"),
  ).toUpperCase();
  const body = trim(m.body ?? m.message ?? m.text);
  const media_url = trim(m.media_url ?? m.media ?? m.image_url ?? "");

  const rawTs =
    m.ts ?? m.created_at ?? m.createdAt ?? m.timestamp ?? m.time ?? Date.now();
  const tsNum = Number(rawTs);
  const tsMs = Number.isFinite(tsNum)
    ? tsNum < 1e12
      ? tsNum * 1000
      : tsNum
    : Date.now();

  const sender_type = String(
    m.sender_type || m.senderType || m.from_type || m.fromType || "",
  ).toUpperCase();
  const sender_id = toStr(
    m.sender_id ?? m.senderId ?? m.from_id ?? m.fromId ?? "",
  );

  const id =
    m.id ??
    m.message_id ??
    m.messageId ??
    `${tsMs}_${Math.random().toString(16).slice(2)}`;

  return {
    ...m,
    id,
    message_type,
    body,
    media_url,
    ts: tsMs,
    sender_type,
    sender_id,
  };
};

const sortAscByTs = (a, b) => num(a?.ts) - num(b?.ts);

const extractMessagesArray = (res) => {
  if (!res) return [];

  const direct =
    res.rows ??
    res.messages ??
    res.data?.rows ??
    res.data?.messages ??
    res.data ??
    res.result ??
    res.results ??
    null;

  if (Array.isArray(direct)) return direct;
  if (Array.isArray(res.data?.data)) return res.data.data;
  if (Array.isArray(res.data?.messages?.rows)) return res.data.messages.rows;

  return [];
};

const extractMessageFromSendResponse = (res) => {
  if (!res) return null;

  if (res.message && typeof res.message === "object") return res.message;
  if (res.data?.message && typeof res.data.message === "object")
    return res.data.message;

  if (res.id || res.message_type || res.body || res.media_url) return res;
  if (res.data && (res.data.id || res.data.body || res.data.media_url))
    return res.data;

  return null;
};

function ChatHeader({ title, subtitle, logoUrl, onBack }) {
  return (
    <View style={styles.header}>
      {/* <StatusBar barStyle="dark-content" backgroundColor="transparent" /> */}

      <TouchableOpacity onPress={onBack} style={styles.backBtn}>
        <Ionicons name="arrow-back" size={24} color={BRAND.black} />
      </TouchableOpacity>

      <View style={styles.headerMid}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title || "Customer"}
        </Text>
        <Text style={styles.headerSub} numberOfLines={1}>
          {subtitle || ""}
        </Text>
      </View>

      <View style={{ width: 42 }} />
    </View>
  );
}
/* ===================== Fullscreen Image Viewer ===================== */
function ImageViewerModal({ visible, uri, onClose }) {
  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.viewerWrap}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <View style={styles.viewerTop}>
          <TouchableOpacity
            onPress={onClose}
            style={styles.viewerBack}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.viewerTitle} numberOfLines={1}>
            Photo
          </Text>
          <View style={{ width: 44 }} />
        </View>

        <View style={styles.viewerImageArea}>
          {uri ? (
            <Image
              source={{ uri }}
              style={styles.viewerImage}
              resizeMode="contain"
            />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

/* ===================== Caption Modal (Responsive) ===================== */
function CaptionModal({
  visible,
  imageUri,
  caption,
  setCaption,
  onCancel,
  onSend,
  sending,
  bottomInset,
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      presentationStyle="overFullScreen"
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        style={styles.modalRoot}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <Pressable style={styles.modalBackdrop} onPress={onCancel} />
        <View
          style={[
            styles.modalSheet,
            { paddingBottom: Math.max(bottomInset, 12) },
          ]}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Send photo</Text>
            <TouchableOpacity onPress={onCancel} style={styles.modalClose}>
              <Ionicons name="close" size={18} color="#111827" />
            </TouchableOpacity>
          </View>

          <View style={styles.modalPreviewWrap}>
            {imageUri ? (
              <Image
                source={{ uri: imageUri }}
                style={styles.modalPreviewImg}
              />
            ) : (
              <View
                style={[styles.modalPreviewImg, { backgroundColor: "#f3f4f6" }]}
              />
            )}
          </View>

          <View style={styles.modalCaptionRow}>
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={18}
              color="#6b7280"
            />
            <TextInput
              value={caption}
              onChangeText={setCaption}
              placeholder="Add a caption (optional)…"
              style={styles.modalCaptionInput}
              editable={!sending}
              multiline
              returnKeyType="done"
            />
          </View>

          <TouchableOpacity
            onPress={onSend}
            style={[styles.modalSendBtn, sending && { opacity: 0.7 }]}
            disabled={sending}
            activeOpacity={0.9}
          >
            {sending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="send" size={16} color="#fff" />
                <Text style={styles.modalSendTxt}>Send</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* ===================== Screen ===================== */
export default function ChatRoomScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();

  const {
    conversationId,
    orderId,
    userType: userTypeParam,
    userId: userIdParam,
    businessId: businessIdParam,
    meta: metaParam,
  } = route.params || {};

  const [activeConversationId, setActiveConversationId] = useState(
    conversationId ? String(conversationId) : "",
  );
  const [meta, setMeta] = useState(metaParam || null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const [sending, setSending] = useState(false);
  const [text, setText] = useState("");

  // image caption flow
  const [pendingImage, setPendingImage] = useState(null); // { uri, name, type }
  const [captionModalVisible, setCaptionModalVisible] = useState(false);
  const [imageCaption, setImageCaption] = useState("");

  // full screen viewer
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerUri, setViewerUri] = useState("");

  const listRef = useRef(null);
  const readTimerRef = useRef(null);

  const ctx = useMemo(() => {
    const userType = String(userTypeParam || "").toUpperCase();
    const userId = toStr(userIdParam);
    const businessIdHeader =
      userType === "MERCHANT" ? toStr(businessIdParam) : undefined;
    return { userType, userId, businessIdHeader };
  }, [userTypeParam, userIdParam, businessIdParam]);

  const getToken = useCallback(async () => {
    const info = (await getUserInfo?.()) || {};
    return (
      pickFirst(
        info.accessToken,
        info.access_token,
        info.token,
        info.jwt,
        info?.user?.token,
        info?.user?.accessToken,
      ) || null
    );
  }, []);

  const scrollToBottom = useCallback((animated = true) => {
    setTimeout(() => listRef.current?.scrollToEnd?.({ animated }), 60);
  }, []);

  useEffect(() => {
    navigation.setOptions?.({ headerShown: false });
  }, [navigation]);

  const customerName = useMemo(() => {
    return (
      meta?.customerName ||
      meta?.customer_name ||
      meta?.customer?.name ||
      metaParam?.customerName ||
      metaParam?.customer_name ||
      metaParam?.customer?.name ||
      "Customer"
    );
  }, [meta, metaParam]);

  const customerProfileUrl = useMemo(() => {
    const raw =
      meta?.customer_profile_image ||
      meta?.customerProfileImage ||
      meta?.customer_avatar ||
      meta?.customerAvatar ||
      meta?.customer?.profile_image ||
      meta?.customer?.avatar ||
      metaParam?.customer_profile_image ||
      metaParam?.customerProfileImage ||
      metaParam?.customer_avatar ||
      metaParam?.customerAvatar ||
      metaParam?.customer?.profile_image ||
      metaParam?.customer?.avatar ||
      "";

    return resolveCustomerProfileUrl(raw);
  }, [meta, metaParam]);

  const headerSubtitle = useMemo(() => {
    const oid = trim(orderId);
    return oid ? `Order ${oid}` : "Order";
  }, [orderId]);

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const token = await getToken();

      let cid = String(activeConversationId || "").trim();

      const customerId =
        route.params?.customerId ||
        metaParam?.customerId ||
        metaParam?.customer_id ||
        metaParam?.customer?.id ||
        metaParam?.customer?.user_id;

      // ✅ Always get the correct conversation for this order/business/merchant
      if (orderId && customerId && businessIdParam && userIdParam) {
        const conv = await createOrGetOrderConversationFromOrderDetails({
          orderId,
          customer_id: customerId,
          business_id: businessIdParam,
          merchant_user_id: userIdParam,
          token,
        });

        cid = String(
          conv?.conversation_id ||
            conv?.conversation?.id ||
            conv?.data?.conversation_id ||
            conv?.data?.conversation?.id ||
            cid ||
            "",
        ).trim();

        if (cid && cid !== activeConversationId) {
          setActiveConversationId(cid);
        }
      }

      if (!cid) {
        throw new Error("Unable to create or find conversation");
      }

      const res = await getConversationMessages({
        conversationId: cid,
        limit: 80,
        userType: ctx.userType,
        userId: ctx.userId,
        businessIdHeader: ctx.businessIdHeader,
        token,
      });

      const m = res?.meta ?? res?.data?.meta ?? res?.data?.data?.meta ?? null;
      if (m) setMeta(m);
      else if (metaParam) setMeta(metaParam);

      const arr = extractMessagesArray(res);
      const normalized = (Array.isArray(arr) ? arr : [])
        .map(normalizeMessage)
        .filter(Boolean)
        .filter((msg) => !isEmptyMessage(msg));

      const ordered = [...normalized].sort(sortAscByTs);
      setRows(ordered);
      scrollToBottom(false);
    } catch (e) {
      Alert.alert("Chat", e?.message || "Failed to load messages");
    } finally {
      setLoading(false);
    }
  }, [
    activeConversationId,
    orderId,
    businessIdParam,
    userIdParam,
    route.params?.customerId,
    ctx.userType,
    ctx.userId,
    ctx.businessIdHeader,
    getToken,
    metaParam,
    scrollToBottom,
  ]);
  // Add this ref at the top with other refs (around line 100)
  const autoMessageSentRef = useRef(false);
  const initialMessageSentRef = useRef(false);
  // In ChatRoomScreen.js, update the sendAutoMessage function:

  const sendAutoMessage = useCallback(
    async (autoMessageText) => {
      if (!autoMessageText || sending) return;

      setSending(true);

      // Create a unique temp ID
      const tempId = `tmp_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;

      // Add optimistic message with temp ID
      const now = Date.now();
      const tempMessage = normalizeMessage({
        id: tempId,
        message_type: "TEXT",
        body: autoMessageText,
        media_url: "",
        ts: now,
        sender_type: ctx.userType,
        sender_id: ctx.userId,
        isTemp: true,
      });

      if (tempMessage && !isEmptyMessage(tempMessage)) {
        setRows((prev) => [...prev, tempMessage].sort(sortAscByTs));
        scrollToBottom(true);
      }

      try {
        const token = await getToken();

        // ✅ IMPORTANT: When sending as MERCHANT, we need to include customer_id in the request
        // or use the correct endpoint with proper authentication
        const res = await sendTextMessage({
          conversationId: activeConversationId,
          bodyText: autoMessageText,
          userType: ctx.userType,
          userId: ctx.userId,
          businessIdHeader: ctx.businessIdHeader,
          token,
          // ✅ Add customer_id if available (from meta)
          customerId: meta?.customerId || route.params?.customerId,
        });

        const msgObj = extractMessageFromSendResponse(res);

        if (msgObj && msgObj.id) {
          // Replace temp message with real one
          setRows((prev) => {
            const tempIndex = prev.findIndex((msg) => msg.id === tempId);
            if (tempIndex !== -1) {
              const newRows = [...prev];
              newRows[tempIndex] = { ...msgObj, isTemp: false };
              return newRows.sort(sortAscByTs);
            }
            if (!prev.some((msg) => msg.id === msgObj.id)) {
              return [...prev, { ...msgObj, isTemp: false }].sort(sortAscByTs);
            }
            return prev;
          });
        }

        console.log("[CHAT] Auto-message sent successfully!");
      } catch (e) {
        // Silent failure
        console.log("[CHAT] Auto-message send failed (silent):", e?.message);
        setRows((prev) => prev.filter((msg) => msg.id !== tempId));
      } finally {
        setSending(false);
      }
    },
    [
      activeConversationId,
      ctx,
      getToken,
      scrollToBottom,
      sending,
      meta,
      route.params?.customerId,
    ],
  );

  // Auto-message from order details - SILENT MODE (no alerts)
  useEffect(() => {
    const autoMessage = route.params?.meta?.autoMessage;
    const autoMessageOnly = route.params?.meta?.autoMessageOnly === true;

    // Only proceed if we have a message, haven't sent it yet, and we have a conversation
    if (autoMessage && !autoMessageSentRef.current && activeConversationId) {
      // Check if this conversation already has this exact message
      const messageAlreadyExists = rows.some(
        (msg) =>
          msg.body === autoMessage &&
          msg.sender_type === "MERCHANT" &&
          msg.ts > Date.now() - 60000, // within last 60 seconds
      );

      if (!messageAlreadyExists) {
        autoMessageSentRef.current = true;

        // Only send if this hasn't been sent via API (autoMessageOnly flag)
        if (autoMessageOnly) {
          console.log(
            "[CHAT] Sending auto-message from chat screen (silent mode)",
          );
          // Add a small delay to ensure socket is ready
          setTimeout(async () => {
            try {
              await sendAutoMessage(autoMessage);
            } catch (error) {
              // COMPLETELY SILENT - no alerts
              console.log(
                "[CHAT] Auto-message error (suppressed):",
                error?.message,
              );
            }
          }, 1500);
        } else {
          console.log(
            "[CHAT] Auto-message already sent via API, skipping duplicate",
          );
        }
      } else {
        console.log(
          "[CHAT] Auto-message already exists in conversation, skipping duplicate",
        );
        autoMessageSentRef.current = true;
      }
    }
  }, [
    route.params?.meta?.autoMessage,
    route.params?.meta?.autoMessageOnly,
    activeConversationId,
    rows,
    sendAutoMessage,
  ]);

  // socket
  useEffect(() => {
    if (!activeConversationId) return;

    connectChatSocket({
      userType: ctx.userType,
      userId: ctx.userId,
      businessId: ctx.businessIdHeader,
    });

    joinChatConversation(activeConversationId);

    const sub = onChatNewMessage((evt) => {
      const incomingCid = String(evt?.conversationId || "").trim();
      if (!incomingCid) return;
      if (incomingCid !== String(activeConversationId)) return;

      const msg = evt?.message;
      if (!msg || isEmptyMessage(msg)) return;

      setRows((prev) => {
        const mid = msg?.id;
        if (mid && prev.some((x) => String(x?.id) === String(mid))) return prev;
        return [...prev, msg].sort(sortAscByTs);
      });

      scrollToBottom(true);
    });

    return () => {
      try {
        offChatNewMessage(sub);
      } catch {}
      leaveChatConversation(activeConversationId);
    };
  }, [
    activeConversationId,
    ctx.userType,
    ctx.userId,
    ctx.businessIdHeader,
    scrollToBottom,
  ]);

  useEffect(() => {
    load();
  }, [load]);

  // mark read
  useEffect(() => {
    if (!rows?.length || !activeConversationId) return;

    const last = rows[rows.length - 1];
    const lastId = last?.id;
    if (!lastId) return;

    if (readTimerRef.current) clearTimeout(readTimerRef.current);
    readTimerRef.current = setTimeout(async () => {
      try {
        const token = await getToken();
        await markConversationRead({
          conversationId: activeConversationId,
          lastReadMessageId: String(lastId),
          userType: ctx.userType,
          userId: ctx.userId,
          businessIdHeader: ctx.businessIdHeader,
          token,
        });
      } catch {}
    }, 600);

    return () => {
      if (readTimerRef.current) clearTimeout(readTimerRef.current);
    };
  }, [
    rows,
    activeConversationId,
    ctx.userType,
    ctx.userId,
    ctx.businessIdHeader,
    getToken,
  ]);

  const optimisticAppend = useCallback(
    ({ type, body, media_url, customId }) => {
      const now = Date.now();
      const finalId =
        customId || `tmp_${now}_${Math.random().toString(36).substr(2, 8)}`;
      const temp = normalizeMessage({
        id: finalId,
        message_type: type,
        body: body || "",
        media_url: media_url || "",
        ts: now,
        sender_type: ctx.userType,
        sender_id: ctx.userId,
        isTemp: true,
      });
      if (!temp || isEmptyMessage(temp)) return;
      setRows((prev) => {
        // Avoid duplicate temp messages
        if (prev.some((msg) => msg.id === finalId)) return prev;
        return [...prev, temp].sort(sortAscByTs);
      });
      scrollToBottom(true);
    },
    [ctx.userType, ctx.userId, scrollToBottom],
  );

  const replaceTempIfPossible = useCallback(
    (maybeMsg) => {
      const msg = normalizeMessage(maybeMsg);
      if (!msg || isEmptyMessage(msg)) return;

      setRows((prev) => {
        // Check if message already exists
        if (msg?.id && prev.some((x) => String(x?.id) === String(msg.id))) {
          return prev;
        }

        // Try to find a temp message to replace (by body content)
        const tempIndex = prev.findIndex(
          (x) =>
            x.isTemp === true &&
            x.body === msg.body &&
            x.sender_type === msg.sender_type,
        );

        if (tempIndex !== -1) {
          // Replace the temp message (NO FLICKER)
          const newRows = [...prev];
          newRows[tempIndex] = { ...msg, isTemp: false };
          return newRows.sort(sortAscByTs);
        }

        // Otherwise just add
        return [...prev, { ...msg, isTemp: false }].sort(sortAscByTs);
      });

      scrollToBottom(true);
    },
    [scrollToBottom],
  );

  const onSendText = async () => {
    const t = trim(text);
    if (!t || sending) return;

    setSending(true);
    optimisticAppend({ type: "TEXT", body: t });

    try {
      const token = await getToken();
      setText("");

      const res = await sendTextMessage({
        conversationId: activeConversationId,
        bodyText: t,
        userType: ctx.userType,
        userId: ctx.userId,
        businessIdHeader: ctx.businessIdHeader,
        token,
      });

      const msgObj = extractMessageFromSendResponse(res);
      if (msgObj) replaceTempIfPossible(msgObj);

      await load();
    } catch (e) {
      Alert.alert("Chat", e?.message || "Failed to send");
      setText((old) => old || t);
    } finally {
      setSending(false);
    }
  };

  const onPickImage = async () => {
    if (sending) return;

    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission", "Media library permission required.");
        return;
      }

      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
      });

      if (picked.canceled) return;
      const asset = picked.assets?.[0];
      if (!asset?.uri) return;

      setPendingImage({
        uri: asset.uri,
        name: asset.fileName || `chat_${Date.now()}.jpg`,
        type: asset.mimeType || "image/jpeg",
      });
      setImageCaption("");
      setCaptionModalVisible(true);
    } catch (e) {
      Alert.alert("Chat", e?.message || "Unable to pick image");
    }
  };

  const onCancelPickedImage = () => {
    if (sending) return;
    setCaptionModalVisible(false);
    setPendingImage(null);
    setImageCaption("");
  };

  const onSendPickedImage = async () => {
    if (!pendingImage || sending) return;

    setSending(true);
    optimisticAppend({
      type: "IMAGE",
      body: trim(imageCaption),
      media_url: pendingImage.uri,
    });

    try {
      const token = await getToken();

      const res = await sendImageMessage({
        conversationId: activeConversationId,
        image: pendingImage,
        caption: trim(imageCaption),
        userType: ctx.userType,
        userId: ctx.userId,
        businessIdHeader: ctx.businessIdHeader,
        token,
      });

      setCaptionModalVisible(false);
      setPendingImage(null);
      setImageCaption("");

      const msgObj = extractMessageFromSendResponse(res);
      if (msgObj) replaceTempIfPossible(msgObj);

      await load();
    } catch (e) {
      Alert.alert("Chat", e?.message || "Failed to send image");
    } finally {
      setSending(false);
    }
  };

  const openViewer = (uri) => {
    const u = trim(uri);
    if (!u) return;
    setViewerUri(u);
    setViewerVisible(true);
  };

  const renderItem = ({ item }) => {
    const msg = normalizeMessage(item);
    if (!msg || isEmptyMessage(msg)) return null;

    const senderType = String(msg?.sender_type || "").toUpperCase();
    const senderId = toStr(msg?.sender_id);

    const mine =
      senderType === String(ctx.userType).toUpperCase() &&
      senderId === String(ctx.userId);

    const type = String(msg?.message_type || "TEXT").toUpperCase();
    const body = trim(msg?.body);
    const media = resolveChatMediaUrl(msg?.media_url || "");
    const timeText = formatDateTime(msg?.ts);

    const topName = mine ? "You" : customerName;

    const bubbleStyle = mine ? styles.bubbleMine : styles.bubbleOther;
    const nameStyle = mine ? styles.nameMine : styles.nameOther;
    const timeStyle = mine ? styles.timeMine : styles.timeOther;
    const msgTextStyle = mine ? styles.msgTextMine : styles.msgTextOther;

    const imageW = Math.min(260, W * 0.7);
    const imageH = Math.round(imageW * 0.75);

    return (
      <View style={[styles.row, mine ? styles.rowRight : styles.rowLeft]}>
        <View style={[styles.bubble, bubbleStyle]}>
          <View style={styles.metaLine}>
            <Text style={[styles.nameTxt, nameStyle]} numberOfLines={1}>
              {topName}
            </Text>
            <Text style={[styles.timeTxt, timeStyle]} numberOfLines={1}>
              {timeText}
            </Text>
          </View>

          {type === "IMAGE" ? (
            <>
              {media ? (
                <Pressable
                  onPress={() => openViewer(media)}
                  style={[styles.imageWrap, { width: imageW, height: imageH }]}
                >
                  <Image
                    source={{ uri: media }}
                    style={{ width: "100%", height: "100%" }}
                    resizeMode="cover"
                  />
                </Pressable>
              ) : (
                <Text style={[styles.msgText, msgTextStyle]}>
                  [image unavailable]
                </Text>
              )}

              {!!body && (
                <Text style={[styles.msgText, msgTextStyle, { marginTop: 8 }]}>
                  {body}
                </Text>
              )}
            </>
          ) : (
            <Text style={[styles.msgText, msgTextStyle]}>{body}</Text>
          )}
        </View>
      </View>
    );
  };

  const inputBottomPad = Math.max(insets.bottom, 10);

  return (
    <SafeAreaView
      style={styles.safe}
      edges={["top", "left", "right", "bottom"]}
    >
      <View style={styles.topGlow} />
      <ChatHeader
        title={customerName || "Customer"}
        subtitle={headerSubtitle}
        logoUrl={customerProfileUrl}
        onBack={() => navigation.goBack()}
      />

      <ImageViewerModal
        visible={viewerVisible}
        uri={viewerUri}
        onClose={() => setViewerVisible(false)}
      />

      <CaptionModal
        visible={captionModalVisible}
        imageUri={pendingImage?.uri || ""}
        caption={imageCaption}
        setCaption={setImageCaption}
        onCancel={onCancelPickedImage}
        onSend={onSendPickedImage}
        sending={sending}
        bottomInset={insets.bottom}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator />
            <Text style={styles.loadingTxt}>Loading…</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={rows}
            keyExtractor={(x, i) => String(x?.id ?? i)}
            renderItem={renderItem}
            contentContainerStyle={{ padding: 12, paddingBottom: 12 }}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => scrollToBottom(false)}
          />
        )}
        <View style={[styles.inputBar, { paddingBottom: inputBottomPad }]}>
          <TouchableOpacity
            onPress={onPickImage}
            style={styles.iconBtn}
            disabled={sending}
            activeOpacity={0.85}
          >
            <Ionicons name="image-outline" size={20} color={BRAND.purple} />
          </TouchableOpacity>

          <View style={styles.inputWrap}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Type a message…"
              style={styles.input}
              editable={!sending}
              multiline
            />
          </View>

          <TouchableOpacity
            onPress={onSendText}
            style={styles.sendBtn}
            disabled={sending || !trim(text)}
            activeOpacity={0.85}
          >
            {sending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name="send" size={18} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* ===================== styles ===================== */
const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: BRAND.white,
  },

  topGlow: {
    position: "absolute",
    top: -120,
    right: -90,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: BRAND.purpleLight,
    opacity: 0.38,
  },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  loadingTxt: {
    marginTop: 8,
    fontFamily: FONT.body,
    fontSize: 13,
    color: BRAND.grey,
  },

  header: {
    minHeight: 54,
    paddingHorizontal: 18,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "transparent",
  },

  backBtn: {
    width: 42,
    height: 42,
    borderRadius: RADIUS.full,
    backgroundColor: BRAND.white,
    alignItems: "center",
    justifyContent: "center",
    ...SHADOW.sm,
  },

  headerMid: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 10,
  },

  headerLogo: {
    width: 42,
    height: 42,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: "#F3E8FF",
    backgroundColor: BRAND.white,
  },

  headerLogoFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8F0FF",
  },

  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: FONT.header,
    fontSize: 20,
    fontWeight: "900",
    color: BRAND.black,
  },

  headerSub: {
    fontSize: 13,
    color: BRAND.grey,
    fontFamily: FONT.body,
    textAlign: "center",
  },

  row: {
    marginBottom: 10,
  },

  rowLeft: {
    alignItems: "flex-start",
  },

  rowRight: {
    alignItems: "flex-end",
  },

  bubble: {
    maxWidth: "86%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    borderWidth: 1,
  },

  bubbleMine: {
    backgroundColor: BRAND.purple,
    borderColor: BRAND.purple,
  },

  bubbleOther: {
    backgroundColor: BRAND.white,
    borderColor: "#F3E8FF",
  },

  metaLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 6,
  },

  nameTxt: {
    fontFamily: FONT.header,
    fontSize: 12,
  },

  timeTxt: {
    fontFamily: FONT.body,
    fontSize: 11,
  },

  nameMine: {
    color: BRAND.white,
  },

  timeMine: {
    color: "rgba(255,255,255,0.85)",
  },

  nameOther: {
    color: BRAND.black,
  },

  timeOther: {
    color: BRAND.grey,
  },

  msgText: {
    fontFamily: FONT.body,
    fontSize: 14,
    lineHeight: 21,
  },

  msgTextMine: {
    color: BRAND.white,
  },

  msgTextOther: {
    color: BRAND.black,
  },

  imageWrap: {
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#F3E8FF",
    backgroundColor: BRAND.white,
  },

  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: BRAND.purpleLight,
    backgroundColor: BRAND.white,
  },

  iconBtn: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.full,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: BRAND.purpleLight,
    backgroundColor: "#F8F0FF",
  },

  inputWrap: {
    flex: 1,
    borderWidth: 1.2,
    borderColor: BRAND.purpleLight,
    borderRadius: RADIUS.pill,
    backgroundColor: BRAND.white,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 48,
    maxHeight: 110,
  },

  input: {
    flex: 1,
    fontFamily: FONT.body,
    fontSize: 15,
    color: BRAND.black,
    padding: 0,
    margin: 0,
  },

  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BRAND.purple,
    ...SHADOW.sm,
  },

  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },

  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
  },

  modalSheet: {
    backgroundColor: BRAND.white,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: "#F3E8FF",
  },

  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },

  modalTitle: {
    fontFamily: FONT.header,
    fontSize: 16,
    color: BRAND.black,
  },

  modalClose: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8F0FF",
    borderWidth: 1,
    borderColor: "#F3E8FF",
  },

  modalPreviewWrap: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#F3E8FF",
    backgroundColor: BRAND.white,
    height: Math.min(260, H * 0.32),
  },

  modalPreviewImg: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },

  modalCaptionRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderWidth: 1.2,
    borderColor: "#F3E8FF",
    borderRadius: RADIUS.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: BRAND.white,
  },

  modalCaptionInput: {
    flex: 1,
    fontFamily: FONT.body,
    fontSize: 14,
    color: BRAND.black,
    minHeight: 24,
    maxHeight: 90,
    padding: 0,
    margin: 0,
  },

  modalSendBtn: {
    marginTop: 12,
    height: 48,
    borderRadius: RADIUS.pill,
    backgroundColor: BRAND.purple,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    ...SHADOW.sm,
  },

  modalSendTxt: {
    fontFamily: FONT.body,
    fontSize: 15,
    color: BRAND.white,
  },

  viewerWrap: {
    flex: 1,
    backgroundColor: "#000",
  },

  viewerTop: {
    paddingTop: Platform.OS === "ios" ? 48 : 14,
    paddingHorizontal: 12,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  viewerBack: {
    width: 44,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },

  viewerTitle: {
    fontFamily: FONT.header,
    color: BRAND.white,
    fontSize: 15,
  },

  viewerImageArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  viewerImage: {
    width: "100%",
    height: "100%",
  },
});
