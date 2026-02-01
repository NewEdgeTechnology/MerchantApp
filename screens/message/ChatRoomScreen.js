// screens/chat/ChatRoomScreen.js
// ✅ Updated as requested:
// - Customer profile image base: https://grab.newedge.bt/driver/
// - Header subtitle: Order <orderId> (instead of "Chat")
// - Full file included

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";

import {
  getConversationMessages,
  sendTextMessage,
  sendImageMessage,
  markConversationRead,
} from "../../utils/chatApi";

import {
  connectChatSocket,
  joinChatConversation,
  leaveChatConversation,
  onChatNewMessage,
  offChatNewMessage,
} from "../../utils/chatSocket";

import { getUserInfo } from "../../utils/authToken";

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
 * ✅ Requested base for user profile image:
 * https://grab.newedge.bt/driver/<relative_path>
 */
const CUSTOMER_PROFILE_BASE = "https://grab.newedge.bt/driver";
const CHAT_MEDIA_ORIGIN = "https://grab.newedge.bt"; // chat images served from here

const resolveCustomerProfileUrl = (raw) => {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (/^data:image\//i.test(s)) return s;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^\/\//.test(s)) return `https:${s}`;

  // remove leading slashes
  const rel = s.replace(/^\/+/, "");

  const base = CUSTOMER_PROFILE_BASE.replace(/\/+$/, "");
  return `${base}/${rel}`;
};

const resolveChatMediaUrl = (raw) => {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (/^data:image\//i.test(s)) return s;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^\/\//.test(s)) return `https:${s}`;

  const base = CHAT_MEDIA_ORIGIN.replace(/\/+$/, "");
  const rel = s.startsWith("/") ? s : `/${s}`;
  return `${base}${rel}`;
};

const formatDateTime = (ts) => {
  const n0 = Number(ts);
  if (!Number.isFinite(n0) || n0 <= 0) return "";

  // seconds -> ms
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

  const rawTs = m.ts ?? m.created_at ?? m.createdAt ?? m.timestamp ?? m.time ?? Date.now();
  const tsNum = Number(rawTs);
  const tsMs = Number.isFinite(tsNum) ? (tsNum < 1e12 ? tsNum * 1000 : tsNum) : Date.now();

  const sender_type = String(m.sender_type || m.senderType || m.from_type || m.fromType || "").toUpperCase();
  const sender_id = toStr(m.sender_id ?? m.senderId ?? m.from_id ?? m.fromId ?? "");

  const id = m.id ?? m.message_id ?? m.messageId ?? `${tsMs}_${Math.random().toString(16).slice(2)}`;

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
  if (res.data?.message && typeof res.data.message === "object") return res.data.message;

  if (res.id || res.message_type || res.body || res.media_url) return res;
  if (res.data && (res.data.id || res.data.body || res.data.media_url)) return res.data;

  return null;
};

/* ===================== Header ===================== */
function ChatHeader({ title, subtitle, logoUrl, onBack }) {
  return (
    <View style={styles.header}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <TouchableOpacity
        onPress={onBack}
        style={styles.backBtn}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="chevron-back" size={22} color="#111" />
      </TouchableOpacity>

      <View style={styles.headerMid}>
        {logoUrl ? (
          <Image source={{ uri: logoUrl }} style={styles.headerLogo} />
        ) : (
          <View style={[styles.headerLogo, styles.headerLogoFallback]}>
            <Ionicons name="person-outline" size={18} color="#6b7280" />
          </View>
        )}

        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title || "Customer"}
          </Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {subtitle || ""}
          </Text>
        </View>
      </View>

      <View style={{ width: 36 }} />
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
          {uri ? <Image source={{ uri }} style={styles.viewerImage} resizeMode="contain" /> : null}
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

        <View style={[styles.modalSheet, { paddingBottom: Math.max(bottomInset, 12) }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Send photo</Text>
            <TouchableOpacity onPress={onCancel} style={styles.modalClose}>
              <Ionicons name="close" size={18} color="#111827" />
            </TouchableOpacity>
          </View>

          <View style={styles.modalPreviewWrap}>
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={styles.modalPreviewImg} />
            ) : (
              <View style={[styles.modalPreviewImg, { backgroundColor: "#f3f4f6" }]} />
            )}
          </View>

          <View style={styles.modalCaptionRow}>
            <Ionicons name="chatbubble-ellipses-outline" size={18} color="#6b7280" />
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
    const businessIdHeader = userType === "MERCHANT" ? toStr(businessIdParam) : undefined;
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
        info?.user?.accessToken
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
    if (!conversationId) return;

    setLoading(true);
    try {
      const token = await getToken();

      const res = await getConversationMessages({
        conversationId,
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
    conversationId,
    ctx.userType,
    ctx.userId,
    ctx.businessIdHeader,
    getToken,
    metaParam,
    scrollToBottom,
  ]);

  // socket
// socket
useEffect(() => {
  if (!conversationId) return;

  connectChatSocket({
    userType: ctx.userType,
    userId: ctx.userId,
    businessId: ctx.businessIdHeader,
  });

  joinChatConversation(conversationId);

  const sub = onChatNewMessage((evt) => {
    // evt shape from updated chatSocket:
    // { eventName, conversationId, message, raw }

    const incomingCid = String(evt?.conversationId || "").trim();
    if (!incomingCid) {
      console.log("[CHAT][UI] dropped (no conversationId)", evt?.eventName, evt?.raw);
      return;
    }
    if (incomingCid !== String(conversationId)) {
      // keep this log for 1-2 tests, then remove
      console.log("[CHAT][UI] dropped (cid mismatch)", { incomingCid, my: String(conversationId), event: evt?.eventName });
      return;
    }

    const msg = evt?.message;
    if (!msg || isEmptyMessage(msg)) {
      console.log("[CHAT][UI] dropped (no message)", evt?.eventName, evt?.raw);
      return;
    }

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
    leaveChatConversation(conversationId);
  };
}, [conversationId, ctx.userType, ctx.userId, ctx.businessIdHeader, scrollToBottom]);

  useEffect(() => {
    load();
  }, [load]);

  // mark read
  useEffect(() => {
    if (!rows?.length || !conversationId) return;

    const last = rows[rows.length - 1];
    const lastId = last?.id;
    if (!lastId) return;

    if (readTimerRef.current) clearTimeout(readTimerRef.current);
    readTimerRef.current = setTimeout(async () => {
      try {
        const token = await getToken();
        await markConversationRead({
          conversationId,
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
  }, [rows, conversationId, ctx.userType, ctx.userId, ctx.businessIdHeader, getToken]);

  const optimisticAppend = useCallback(
    ({ type, body, media_url }) => {
      const now = Date.now();
      const temp = normalizeMessage({
        id: `tmp_${now}_${Math.random().toString(16).slice(2)}`,
        message_type: type,
        body: body || "",
        media_url: media_url || "",
        ts: now,
        sender_type: ctx.userType,
        sender_id: ctx.userId,
      });
      if (!temp || isEmptyMessage(temp)) return;
      setRows((prev) => [...prev, temp].sort(sortAscByTs));
      scrollToBottom(true);
    },
    [ctx.userType, ctx.userId, scrollToBottom],
  );

  const replaceTempIfPossible = useCallback(
    (maybeMsg) => {
      const msg = normalizeMessage(maybeMsg);
      if (!msg || isEmptyMessage(msg)) return;

      setRows((prev) => {
        if (msg?.id && prev.some((x) => String(x?.id) === String(msg.id))) return prev;
        return [...prev, msg].sort(sortAscByTs);
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
        conversationId,
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
        conversationId,
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
                <Text style={[styles.msgText, msgTextStyle]}>[image unavailable]</Text>
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
    <SafeAreaView style={styles.safe} edges={["top"]}>
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
            <Ionicons name="image-outline" size={20} color="#00B14F" />
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
  safe: { flex: 1, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingTxt: { marginTop: 8, color: "#6b7280", fontWeight: "700" },

  /* Header */
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F7",
    backgroundColor: "#fff",
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  headerMid: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 10,
  },
  headerLogo: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#fff",
  },
  headerLogoFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
  },
  headerTitle: { fontSize: 15, fontWeight: "900", color: "#0F172A" },
  headerSub: { marginTop: 2, fontSize: 11, fontWeight: "800", color: "#64748B" },

  /* Messages */
  row: { marginBottom: 10 },
  rowLeft: { alignItems: "flex-start" },
  rowRight: { alignItems: "flex-end" },

  bubble: {
    maxWidth: "88%",
    padding: 10,
    borderRadius: 16,
    borderWidth: 1,
  },
  bubbleMine: {
    backgroundColor: "#00B14F",
    borderColor: "#00B14F",
  },
  bubbleOther: {
    backgroundColor: "#F3F4F6",
    borderColor: "#E5E7EB",
  },

  metaLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 6,
  },
  nameTxt: { fontSize: 11, fontWeight: "900" },
  timeTxt: { fontSize: 10, fontWeight: "800" },

  nameMine: { color: "#E7FBEF" },
  timeMine: { color: "#D4F6E1" },
  nameOther: { color: "#111827" },
  timeOther: { color: "#6b7280" },

  msgText: { fontSize: 14, fontWeight: "700", lineHeight: 20 },
  msgTextMine: { color: "#ffffff" },
  msgTextOther: { color: "#111827" },

  imageWrap: {
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#fff",
  },

  /* Input */
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#EEF2F7",
    backgroundColor: "#fff",
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#D1FAE5",
    backgroundColor: "#F0FDF4",
  },
  inputWrap: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    backgroundColor: "#fff",
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 40,
    maxHeight: 120,
  },
  input: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    padding: 0,
    margin: 0,
  },
  sendBtn: {
    width: 44,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#00B14F",
  },

  /* Caption modal */
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.35)" },
  modalSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#EEF2F7",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  modalTitle: { fontSize: 14, fontWeight: "900", color: "#0F172A" },
  modalClose: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  modalPreviewWrap: {
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#fff",
    height: Math.min(260, H * 0.32),
  },
  modalPreviewImg: { width: "100%", height: "100%", resizeMode: "cover" },
  modalCaptionRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  modalCaptionInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    minHeight: 24,
    maxHeight: 90,
    padding: 0,
    margin: 0,
  },
  modalSendBtn: {
    marginTop: 12,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#00B14F",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  modalSendTxt: { color: "#fff", fontWeight: "900" },

  /* Fullscreen viewer */
  viewerWrap: { flex: 1, backgroundColor: "#000" },
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
  viewerTitle: { color: "#fff", fontWeight: "900", fontSize: 14 },
  viewerImageArea: { flex: 1, alignItems: "center", justifyContent: "center" },
  viewerImage: { width: "100%", height: "100%" },
});
