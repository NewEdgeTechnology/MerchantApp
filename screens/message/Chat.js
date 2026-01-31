// services/transport/Chat.js  (Passenger)
import React, { useEffect, useRef, useState, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Alert,
} from "react-native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import * as ImagePicker from "expo-image-picker";
import {
  connectPassengerSocket,
  getPassengerSocket,
  resolveCurrentRideId,
  joinRideRoom,
  leaveRideRoom,
  loadChatHistory,
  sendChat,
  setTyping,
  markChatRead,
  onChatEvents,
} from "../../utils/passengerSocket";
import { getUserInfo } from "../../utils/authToken";
import { RIDE_SOCKET_ENDPOINT } from "@env";

/* ---------------- theme (Grab-like) ---------------- */
const G = {
  bg: "#F6F7F9",
  line: "#E5E7EB",
  text: "#0F172A",
  sub: "#6B7280",
  me: "#00B14F",
  other: "#FFFFFF",
  green: "#00B14F",
  header: "#FFFFFF",
};

const TYPING_IDLE_MS = 4000;

/* ---------------- base-origin + url helpers ---------------- */
const BASE_ORIGIN = (() => {
  try {
    return new URL(String(RIDE_SOCKET_ENDPOINT || "")).origin;
  } catch {
    const m = String(RIDE_SOCKET_ENDPOINT || "").match(/^https?:\/\/[^/]+/i);
    return m ? m[0] : "";
  }
})();
const isAbs = (u = "") =>
  /^https?:\/\//i.test(u) ||
  /^file:\/\//i.test(u) ||
  /^ph:\/\//i.test(u) ||
  /^data:image\//i.test(u);
const toAbs = (u = "") =>
  isAbs(u) ? u : `${BASE_ORIGIN}/${String(u).replace(/^\/+/, "")}`;

const pickImageUrl = (m = {}) => {
  const arr = Array.isArray(m.attachments) ? m.attachments : [];
  const img = arr.find(
    (x) =>
      (x?.type && String(x.type).toLowerCase().startsWith("image")) ||
      (x?.mime && String(x.mime).toLowerCase().startsWith("image"))
  );
  if (img?.url) return String(img.url);
  if (m?.image_url) return String(m.image_url);
  return null;
};

/* ---------------- user service (driver name lookup) ---------------- */
const _nameCache = new Map();
async function fetchUserNameById(userId) {
  const key = String(userId || "").trim();
  if (!key) return null;
  if (_nameCache.has(key)) return _nameCache.get(key);

  try {
    const res = await fetch(
      `${RIDE_SOCKET_ENDPOINT}/api/driver_id?driverId=${encodeURIComponent(key)}`
    );
    const j = await res.json().catch(() => null);
    const raw =
      j?.details?.user_name ??
      j?.details?.name ??
      j?.user_name ??
      j?.name ??
      null;

    const name = typeof raw === "string" ? raw.trim() : null;
    if (name) {
      _nameCache.set(key, name);
      return name;
    }
  } catch {}
  return null;
}

/* ===== animated typing dots (Grab-style bubble) ===== */
const TypingDots = () => {
  const a1 = useRef(new Animated.Value(0)).current;
  const a2 = useRef(new Animated.Value(0)).current;
  const a3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = (v, delay) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, {
            toValue: 1,
            duration: 350,
            delay,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
          Animated.timing(v, {
            toValue: 0.2,
            duration: 350,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
        ])
      ).start();
    loop(a1, 0);
    loop(a2, 120);
    loop(a3, 240);
  }, [a1, a2, a3]);

  const Dot = ({ anim }) => (
    <Animated.View
      style={[
        styles.dot,
        {
          opacity: anim.interpolate({
            inputRange: [0, 1],
            outputRange: [0.3, 1],
          }),
          transform: [
            {
              translateY: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, -2],
              }),
            },
          ],
        },
      ]}
    />
  );

  return (
    <View style={styles.typingBubble}>
      <Dot anim={a1} />
      <Dot anim={a2} />
      <Dot anim={a3} />
    </View>
  );
};

/* ===== simple skeleton loader for chat bubbles ===== */
const LoadingBubbles = () => {
  const pulse = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.3,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [pulse]);

  const Skel = ({ align = "left", w = "70%" }) => (
    <View
      style={[
        styles.row,
        align === "right" ? styles.rowRight : styles.rowLeft,
        { marginVertical: 6 },
      ]}
    >
      {align === "left" ? (
        <View style={styles.avatar}>
          <Icon name="account-circle" size={30} color="#E5E7EB" />
        </View>
      ) : (
        <View style={{ width: 30 }} />
      )}
      <Animated.View
        style={[
          styles.skelBubble,
          { opacity: pulse, alignSelf: "flex-start", width: w },
          align === "right" ? styles.skelMe : styles.skelOther,
        ]}
      />
    </View>
  );

  return (
    <View style={{ paddingHorizontal: 12, paddingTop: 8 }}>
      <Skel align="left" w="76%" />
      <Skel align="left" w="54%" />
      <Skel align="right" w="62%" />
      <Skel align="left" w="68%" />
      <Skel align="right" w="42%" />
      <Skel align="right" w="58%" />
    </View>
  );
};

/* ===== header (Grab-like) ===== */
const HeaderBar = ({ onBack, title, subtitle, onCall, onInfo }) => (
  <View style={styles.headerWrap}>
    <TouchableOpacity onPress={onBack} style={styles.headerIconBtn}>
      <Icon name="chevron-left" size={28} color={G.text} />
    </TouchableOpacity>

    <View style={styles.headerCenter}>
      <View style={styles.headerTitleRow}>
        <Text numberOfLines={1} style={styles.headerTitle}>
          {title}
        </Text>
      </View>
      {subtitle ? <Text style={styles.headerSub}>{subtitle}</Text> : null}
    </View>

    <View style={styles.headerRight}>
      <TouchableOpacity onPress={onCall} style={styles.headerIconBtn}>
        <Icon name="phone" size={20} color={G.green} />
      </TouchableOpacity>
      <TouchableOpacity onPress={onInfo} style={styles.headerIconBtn}>
        <Icon name="information-outline" size={22} color={G.text} />
      </TouchableOpacity>
    </View>
  </View>
);

/* ---------------- date helpers ---------------- */
const ymd = (ts) => {
  try {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(d.getDate()).padStart(2, "0")}`;
  } catch {
    return "";
  }
};
const prettyDate = (ts) => {
  const d = new Date(ts);
  const today = new Date();
  const ymd1 = ymd(d);
  const ymd2 = ymd(today);
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  if (ymd1 === ymd2) return "Today";
  if (ymd1 === ymd(y)) return "Yesterday";
  return d.toLocaleDateString();
};
function formatTime(ts) {
  try {
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  } catch {
    return "";
  }
}

/* ===================================================================== */
/*                              Component                                 */
/* ===================================================================== */

export default function Chat({ route, navigation }) {
  const { me: meFromRoute = {}, peer = {} } = route?.params || {};

  const rawReq =
    route?.params?.requestId ??
    route?.params?.rideId ??
    route?.params?.id ??
    null;

  const initialRequestId =
    rawReq != null && rawReq !== "" ? String(rawReq) : null;

  const initialDriverUserId =
    route?.params?.driverUserId ??
    peer?.user_id ??
    peer?.driver_user_id ??
    peer?.driver_id ??
    "";
  const initialDriverName =
    route?.params?.driverName ??
    peer?.name ??
    "";

  const [me, setMe] = useState(meFromRoute || {});
  const [requestId, setRequestId] = useState(initialRequestId);
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  // typing indicator
  const [peerTyping, setPeerTyping] = useState(false);
  const typingTimerRef = useRef(null);

  // read receipts: driver's last seen message id
  const [peerLastSeenId, setPeerLastSeenId] = useState(0);

  // NEW: is this ride still the *current* ride?
  const [isCurrentRide, setIsCurrentRide] = useState(true);

  const listRef = useRef(null);
  const unsubChatRef = useRef(null);
  const unsubSocketRideRef = useRef(null);

  const [driverUserId, setDriverUserId] = useState(
    initialDriverUserId ? String(initialDriverUserId) : ""
  );
  const [driverName, setDriverName] = useState(initialDriverName);

  const meId = useMemo(() => String(me?.id ?? ""), [me]);
  const meRole = useMemo(() => String(me?.role || "passenger"), [me]);

  const hasRide = !!requestId;

  /* Header meta */
  const headerTitle = driverName || peer?.name || "Driver";
  const headerSub = requestId ? `Trip #${requestId}` : "No active ride";

  const resolveMe = async () => {
    if (meId) return meId;
    try {
      const u = await getUserInfo();
      if (u?.user_id) {
        setMe((prev) => ({
          ...prev,
          id: u.user_id,
          name: u.user_name || prev?.name,
          role: "passenger",
        }));
        return String(u.user_id);
      }
    } catch {}
    return "";
  };

  const attachRideLevelListeners = () => {
    const s = getPassengerSocket();
    if (!s) return;

    const onRideAccepted = (p) => {
      const rid = String(p?.request_id || "");
      if (rid && !requestId) {
        setIsCurrentRide(true);
        adoptRide(rid);
      }
      const dUid = p?.driver?.user_id ?? p?.driver_user_id ?? p?.driver_id;
      if (dUid && !driverUserId) setDriverUserId(String(dUid));
    };

    const onRideStageUpdate = (p) => {
      const stage = String(p?.stage || "");
      const rid = p?.request_id != null ? String(p.request_id) : "";
      if (!rid) return;

      if (
        !requestId &&
        ["accepted", "arrived_pickup", "started"].includes(stage)
      ) {
        setIsCurrentRide(true);
        adoptRide(rid);
      }

      const dUid = p?.driver?.user_id ?? p?.driver_user_id ?? p?.driver_id;
      if (dUid && !driverUserId) setDriverUserId(String(dUid));
    };

    s.on("rideAccepted", onRideAccepted);
    s.on("rideStageUpdate", onRideStageUpdate);

    unsubSocketRideRef.current = () => {
      s.off("rideAccepted", onRideAccepted);
      s.off("rideStageUpdate", onRideStageUpdate);
    };
  };

  const detachRideLevelListeners = () => {
    try {
      unsubSocketRideRef.current?.();
    } catch {}
    unsubSocketRideRef.current = null;
  };

  const adoptRide = async (rid) => {
    try {
      setRequestId(rid);
      setJoining(true);

      joinRideRoom(rid, () => {});

      const history = await new Promise((resolve) => {
        loadChatHistory({ request_id: Number(rid), limit: 100 }, (ack) => {
          resolve(ack?.ok ? ack.messages || [] : []);
        });
      });

      // detect driver's user_id from history if needed
      if (!driverUserId) {
        const firstDriverMsg = (history || []).find(
          (m) =>
            String(m?.sender_type || m?.sender_role) === "driver" &&
            String(m?.sender_id || "")
        );
        if (firstDriverMsg?.sender_id) {
          setDriverUserId(String(firstDriverMsg.sender_id));
        }
      }

      setMsgs(history.map(toUiMsg));
      setPeerTyping(false);
      setPeerLastSeenId(0);
      setTimeout(() => listRef.current?.scrollToEnd?.({ animated: false }), 50);

      if (unsubChatRef.current) {
        try {
          unsubChatRef.current();
        } catch {}
      }
      unsubChatRef.current = onChatEvents({
        onNewMessage: (message, temp_id) => {
          const m = toUiMsg(message || {});
          if (!m.id) return;

          // pick up driver user_id on first driver message
          if (
            !driverUserId &&
            (m.sender_role === "driver" || m.sender_type === "driver") &&
            m.sender_id
          ) {
            setDriverUserId(String(m.sender_id));
          }

          if (temp_id) {
            setMsgs((prev) => {
              const idx = prev.findIndex(
                (x) => String(x.id) === String(temp_id)
              );
              if (idx >= 0) {
                const next = prev.slice();
                next[idx] = m;
                return next;
              }
              return [...prev, m];
            });
          } else {
            setMsgs((prev) => [...prev, m]);
          }

          setPeerTyping(false);
          clearTimeoutSafe(typingTimerRef);
          setTimeout(
            () => listRef.current?.scrollToEnd?.({ animated: true }),
            60
          );
        },

        // typing indicator from driver
        onTyping: (p) => {
          try {
            if (!p || String(p.request_id) !== String(rid)) return;
            const fromRole = p?.from?.role;
            if (fromRole !== "driver") return;

            if (p.is_typing) {
              setPeerTyping(true);
              clearTimeoutSafe(typingTimerRef);
              typingTimerRef.current = setTimeout(() => {
                setPeerTyping(false);
                typingTimerRef.current = null;
              }, TYPING_IDLE_MS);
            } else {
              setPeerTyping(false);
              clearTimeoutSafe(typingTimerRef);
            }
          } catch {}
        },

        // read receipts from driver
        onRead: (p) => {
          try {
            if (!p || String(p.request_id) !== String(rid)) return;
            if (p?.reader?.role !== "driver") return;
            const seen = Number(p?.last_seen_id || 0);
            if (Number.isFinite(seen) && seen > 0) {
              setPeerLastSeenId((prev) => (seen > prev ? seen : prev));
            }
          } catch {}
        },
      });
    } finally {
      setJoining(false);
      setLoading(false);
      detachRideLevelListeners();
    }
  };

  // fetch driver name whenever we learn/change the driver's user_id
  useEffect(() => {
    (async () => {
      const id = String(driverUserId || "").trim();
      if (!id) return;
      const name = await fetchUserNameById(id);
      if (name) setDriverName(name);
    })();
  }, [driverUserId]);

  // initial connect + resolve ride & current-vs-old
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const pid = await resolveMe();
        if (!pid) {
          setLoading(false);
          return;
        }

        connectPassengerSocket(pid);

        // figure out active ride from backend
        let activeMeta = null;
        let activeReqId = route?.params?.requestId ??
                          route?.params?.rideId ??
                          route?.params?.id ??
                          null;;
        let activeDriverId = null;

        try {
          activeMeta = await resolveCurrentRideId(pid);
        } catch {}

        if (activeMeta != null) {
          if (typeof activeMeta === "object") {
            const d = activeMeta.data ?? activeMeta;
            activeReqId = route?.params?.requestId ??
                          route?.params?.rideId ??
                          route?.params?.id ??
                          null;
            activeDriverId =
              d?.driver_id ?? d?.driver_user_id ?? d?.driverId ?? null;
          } else {
            activeReqId = activeMeta;
          }
        }

        if (activeDriverId && !driverUserId) {
          setDriverUserId(String(activeDriverId));
        }

        // Decide which ride this screen is for:
        let finalReqId = initialRequestId || activeReqId;
        console.log("[Chat] initialRequestId:", initialRequestId, "activeReqId:", activeReqId, "→ finalReqId:", finalReqId);

        if (initialRequestId) {
          // Opened from Messages for a specific ride
          if (activeReqId && String(initialRequestId) === String(activeReqId)) {
            setIsCurrentRide(true);
          } else {
            setIsCurrentRide(false); // old ride → view only
          }
        } else {
          // No param: just attach to active ride (if any)
          setIsCurrentRide(Boolean(activeReqId));
        }

        if (finalReqId) {
          await adoptRide(String(finalReqId));
          return;
        }

        if (mounted) {
          attachRideLevelListeners();
          setLoading(false);
        }
      } catch (e) {
        setLoading(false);
      }
    })();

    return () => {
      mounted = false;
      try {
        unsubChatRef.current?.();
      } catch {}
      try {
        detachRideLevelListeners();
      } catch {}
      clearTimeoutSafe(typingTimerRef);
      if (requestId) {
        try {
          leaveRideRoom(requestId, () => {});
        } catch {}
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  // send read receipt for the highest numeric id we have
  useEffect(() => {
    if (!requestId || !msgs.length) return;
    let last = 0;
    for (let i = msgs.length - 1; i >= 0; i--) {
      const n = Number(msgs[i]?.id);
      if (Number.isFinite(n)) {
        last = n;
        break;
      }
    }
    if (!last) return;
    try {
      markChatRead(
        { request_id: Number(requestId), last_seen_id: last },
        () => {}
      );
    } catch {}
  }, [msgs.length, requestId]);

  // latest message *you* sent
  const latestMineIdStr = useMemo(() => {
    let last = null;
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      const mine =
        m.sender_role === meRole ||
        String(m.sender_id) === meId ||
        m.id?.startsWith?.("temp-");
      if (mine) {
        last = String(m.id);
        break;
      }
    }
    return last;
  }, [msgs, meId, meRole]);

  const scrollToEndSoon = () =>
    setTimeout(() => listRef.current?.scrollToEnd?.({ animated: true }), 60);

  /* ---------------- TEXT send ---------------- */
  const send = async () => {
    const text = input.trim();
    if (!text || !requestId || joining || !isCurrentRide) return;

    setInput("");
    const temp_id = `temp-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 7)}`;

    // optimistic bubble
    setMsgs((prev) => [
      ...prev,
      {
        id: String(temp_id),
        text,
        sender_role: meRole,
        sender_id: meId || "me",
        name: me?.name || "Me",
        ts: new Date().toISOString(),
      },
    ]);
    setPeerTyping(false);
    clearTimeoutSafe(typingTimerRef);
    scrollToEndSoon();

    try {
      sendChat(
        { request_id: Number(requestId), message: text, temp_id },
        () => {}
      );
    } catch {}
  };

  /* ---------------- IMAGE send ---------------- */
  const guessMime = (uri = "") => {
    const l = uri.toLowerCase();
    if (l.endsWith(".png")) return "image/png";
    if (l.endsWith(".jpg") || l.endsWith(".jpeg")) return "image/jpeg";
    if (l.endsWith(".webp")) return "image/webp";
    if (l.endsWith(".heic") || l.endsWith(".heif")) return "image/heic";
    return "image/jpeg";
  };

  const ensureMediaPermissions = async () => {
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (cam.status !== "granted" && lib.status !== "granted") {
      Alert.alert(
        "Permission needed",
        "Please allow camera or photo library access to send photos."
      );
      return false;
    }
    return true;
  };

  const CHAT_UPLOAD_ENDPOINT = `${BASE_ORIGIN}/chat/upload`;

  const uploadChatImage = async (localUri) => {
    const name = localUri.split("/").pop() || `photo-${Date.now()}.jpg`;
    const type = guessMime(localUri);
    const form = new FormData();
    form.append("file", { uri: localUri, name, type });
    form.append("request_id", String(requestId || ""));

    const res = await fetch(CHAT_UPLOAD_ENDPOINT, {
      method: "POST",
      body: form,
      // Do NOT set Content-Type; RN will set the multipart boundary.
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j?.url) {
      throw new Error(j?.error || `Upload failed (${res.status})`);
    }
    return String(j.url); // e.g. /uploads/chat/xxx.jpg
  };

  const sendImageMessage = async (localUri) => {
    if (!requestId || joining || !isCurrentRide) return;
    const temp_id = `temp-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 7)}`;

    // optimistic local preview
    setMsgs((prev) => [
      ...prev,
      {
        id: String(temp_id),
        text: "",
        sender_role: meRole,
        sender_id: meId || "me",
        name: me?.name || "Me",
        ts: new Date().toISOString(),
        image_url: localUri, // local preview
      },
    ]);
    scrollToEndSoon();

    try {
      const remote = await uploadChatImage(localUri); // '/uploads/...'
      const s = getPassengerSocket();
      s?.emit(
        "chat:send",
        {
          request_id: Number(requestId),
          message: "",
          attachments: [{ type: "image", url: remote }],
          temp_id,
        },
        () => {}
      );
      // incoming chat:new with same temp_id will replace our temp bubble
    } catch (e) {
      // mark failed
      setMsgs((prev) => {
        const i = prev.findIndex((x) => String(x.id) === String(temp_id));
        if (i >= 0) {
          const next = prev.slice();
          next[i] = { ...next[i], failed: true };
          return next;
        }
        return prev;
      });
      Alert.alert("Upload failed", String(e?.message || e));
    }
  };

  const handleAddPhoto = async () => {
    if (!requestId || joining || !isCurrentRide) return;
    const ok = await ensureMediaPermissions();
    if (!ok) return;

    Alert.alert(
      "Send photo",
      undefined,
      [
        {
          text: "Take Photo",
          onPress: async () => {
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.85,
              allowsEditing: false,
            });
            if (!result?.canceled && result?.assets?.[0]?.uri) {
              await sendImageMessage(result.assets[0].uri);
            }
          },
        },
        {
          text: "Choose from Library",
          onPress: async () => {
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.85,
              allowsMultipleSelection: false,
              selectionLimit: 1,
            });
            if (!result?.canceled && result?.assets?.[0]?.uri) {
              await sendImageMessage(result.assets[0].uri);
            }
          },
        },
        { text: "Cancel", style: "cancel" },
      ],
      { cancelable: true }
    );
  };

  const onTypingChange = (text) => {
    setInput(text);
    if (!requestId || !isCurrentRide) return;
    try {
      setTyping(Number(requestId), !!text);
    } catch {}
  };

  /* ---------------- grouping + status helpers ---------------- */
  const isMine = (m) =>
    m.sender_role === meRole ||
    String(m.sender_id) === meId ||
    m.id?.startsWith?.("temp-");
  const numericId = (m) => {
    const n = Number(m?.id);
    return Number.isFinite(n) ? n : null;
  };
  const getMyMsgStatus = (item) => {
    if (String(item?.id).startsWith("temp-")) return "pending";
    const idn = numericId(item);
    if (idn == null) return "sent";
    const isLatestMine =
      latestMineIdStr && String(item.id) === String(latestMineIdStr);
    if (!isLatestMine) return "sent";
    return Number(peerLastSeenId) >= idn ? "seen" : "sent";
  };
  const isFirstInGroup = (i) =>
    i === 0 ||
    msgs[i - 1]?.sender_role !== msgs[i]?.sender_role ||
    ymd(msgs[i - 1]?.ts) !== ymd(msgs[i]?.ts);
  const isLastInGroup = (i) =>
    i === msgs.length - 1 ||
    msgs[i + 1]?.sender_role !== msgs[i]?.sender_role ||
    ymd(msgs[i + 1]?.ts) !== ymd(msgs[i]?.ts);
  const showDayBreak = (i) =>
    i === 0 || ymd(msgs[i - 1]?.ts) !== ymd(msgs[i]?.ts);

  const renderItem = ({ item, index }) => {
    const mine = isMine(item);
    const status = mine ? getMyMsgStatus(item, index) : null;

    return (
      <>
        {showDayBreak(index) ? (
          <View style={styles.dayWrap}>
            <Text style={styles.dayText}>{prettyDate(item?.ts)}</Text>
          </View>
        ) : null}

        {!mine && isFirstInGroup(index) ? (
          <Text style={styles.peerName}>{driverName || "Driver"}</Text>
        ) : null}

        <View style={[styles.row, mine ? styles.rowRight : styles.rowLeft]}>
          {!mine && isFirstInGroup(index) ? (
            <View style={styles.avatar}>
              <Icon name="account-circle" size={30} color="#9CA3AF" />
            </View>
          ) : (
            <View style={{ width: 30 }} />
          )}

          <View
            style={[
              styles.bubble,
              mine ? styles.bubbleMe : styles.bubbleOther,
              mine
                ? {
                    borderTopRightRadius: isLastInGroup(index) ? 8 : 20,
                    borderTopLeftRadius: 20,
                    borderBottomLeftRadius: 20,
                    borderBottomRightRadius: 8,
                  }
                : {
                    borderTopLeftRadius: isLastInGroup(index) ? 8 : 20,
                    borderTopRightRadius: 20,
                    borderBottomRightRadius: 20,
                    borderBottomLeftRadius: 8,
                  },
            ]}
          >
            {/* image (if any) */}
            {item.image_url ? (
              <Image
                source={{ uri: toAbs(item.image_url) }}
                style={mine ? styles.photoMe : styles.photoOther}
              />
            ) : null}

            {/* text (if any) */}
            {item.text ? (
              <Text style={[styles.msg, mine && { color: "#fff" }]}>
                {item.text}
              </Text>
            ) : null}

            <View style={styles.metaRow}>
              <Text
                style={[
                  styles.time,
                  mine && { color: "rgba(255,255,255,0.9)" },
                ]}
              >
                {formatTime(item.ts)}
              </Text>
              {mine ? (
                <View style={styles.statusWrap}>
                  {status === "pending" ? (
                    <Icon
                      name="clock-outline"
                      size={14}
                      color="rgba(255,255,255,0.9)"
                    />
                  ) : status === "seen" ? (
                    <Icon
                      name="check-all"
                      size={16}
                      color="rgba(255,255,255,0.95)"
                    />
                  ) : (
                    <Icon
                      name="check"
                      size={16}
                      color="rgba(255,255,255,0.9)"
                    />
                  )}
                </View>
              ) : null}
            </View>

            {/* tiny tail */}
            <View
              style={[styles.tail, mine ? styles.tailRight : styles.tailLeft]}
            />
          </View>
        </View>
      </>
    );
  };

  const onBack = () => navigation.goBack?.();
  const onCall = () => {};
  const onInfo = () => {};

  /* ---------------- early UIs ---------------- */

  if (loading) {
    return (
      <View
        style={[
          styles.container,
          { alignItems: "center", justifyContent: "center" },
        ]}
      >
        <ActivityIndicator size="large" color={G.green} />
        <Text style={{ marginTop: 8, color: G.sub }}>Connecting with your driver...</Text>
      </View>
    );
  }

  if (!hasRide) {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <HeaderBar
          onBack={onBack}
          title={headerTitle}
          subtitle={"No active ride"}
          onCall={onCall}
          onInfo={onInfo}
        />
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 24,
          }}
        >
          <Icon name="chat-question" size={40} color={G.sub} />
          <Text style={{ marginTop: 8, color: G.sub, textAlign: "center" }}>
            No active ride detected yet. This screen will auto-attach when your
            ride is accepted/started.
          </Text>
        </View>
      </KeyboardAvoidingView>
    );
  }

  /* ---------------- main UI ---------------- */
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Grab-like header */}
      <HeaderBar
        onBack={onBack}
        title={headerTitle}
        subtitle={headerSub}
        onCall={onCall}
        onInfo={onInfo}
      />

      {/* Slim connecting banner */}
      {joining ? (
        <View style={styles.connectingBar}>
          <ActivityIndicator size="small" color={G.green} />
          <Text style={styles.connectingTxt}>Connecting…</Text>
        </View>
      ) : null}

      {/* Typing bubble row */}
      {peerTyping ? (
        <View style={styles.typingRow}>
          <TypingDots />
        </View>
      ) : null}

      <FlatList
        ref={listRef}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 8 }}
        data={msgs}
        keyExtractor={(it) => String(it.id)}
        renderItem={renderItem}
        onContentSizeChange={scrollToEndSoon}
        ListEmptyComponent={
          joining ? (
            <LoadingBubbles />
          ) : (
            <View style={{ padding: 24, alignItems: "center" }}>
              <Text style={{ color: G.sub }}>No messages yet</Text>
            </View>
          )
        }
      />

      {/* Bottom: either input OR tiny inactive message */}
      {isCurrentRide ? (
        <View style={styles.inputWrap}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={handleAddPhoto}
            disabled={joining}
          >
            <Icon name="camera-outline" size={22} color={G.green} />
          </TouchableOpacity>

          <View style={styles.inputPill}>
            <TextInput
              style={styles.input}
              placeholder={joining ? "Connecting…" : "Message…"}
              placeholderTextColor="#9CA3AF"
              value={input}
              onChangeText={onTypingChange}
              onSubmitEditing={send}
              editable={!joining}
              returnKeyType="send"
            />
          </View>

          <TouchableOpacity
            style={[
              styles.sendFab,
              input.trim() && !joining ? styles.sendFabActive : null,
            ]}
            onPress={send}
            disabled={!input.trim() || joining}
          >
            <Icon
              name="send"
              size={18}
              color={input.trim() && !joining ? "#fff" : "#9CA3AF"}
            />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.inactiveWrap}>
          <Text style={styles.inactiveText}>
            This ride is no longer active. You can’t send new messages.
          </Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

/* ---------------- mapping helper ---------------- */
function toUiMsg(m) {
  const id = String(m?.id ?? m?.message_id ?? `${Date.now()}-${Math.random()}`);
  const text = String(m?.message ?? m?.text ?? "");
  const sender_role = String(m?.sender_type ?? m?.sender_role ?? "");
  const sender_id = String(m?.sender_id ?? "");
  const name = m?.name || (sender_role === "driver" ? "Driver" : "Passenger");
  const ts = m?.created_at || m?.ts || new Date().toISOString();

  // image extraction + absolute url
  const imgRel = pickImageUrl(m);
  const image_url = imgRel ? toAbs(imgRel) : null;

  return { id, text, sender_role, sender_id, name, ts, image_url };
}
function clearTimeoutSafe(ref) {
  try {
    if (ref?.current) {
      clearTimeout(ref.current);
      ref.current = null;
    }
  } catch {}
}

/* ---------------- styles ---------------- */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: G.bg },

  /* Header */
  headerWrap: {
    paddingTop: Platform.OS === "ios" ? 48 : 8,
    paddingBottom: 8,
    paddingHorizontal: 10,
    backgroundColor: G.header,
    borderBottomWidth: 1,
    borderBottomColor: G.line,
    flexDirection: "row",
    alignItems: "center",
  },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: { flex: 1, paddingHorizontal: 6 },
  headerTitleRow: { flexDirection: "row", alignItems: "center" },
  headerTitle: { fontSize: 16, fontWeight: "600", color: G.text },
  headerSub: { fontSize: 12, color: G.sub, marginTop: 2 },
  headerRight: { flexDirection: "row", alignItems: "center" },

  /* Connecting banner */
  connectingBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#F8FAFC",
    borderBottomWidth: 1,
    borderBottomColor: G.line,
  },
  connectingTxt: { color: G.sub, fontSize: 12 },

  /* Typing */
  typingRow: { paddingVertical: 6, paddingHorizontal: 14 },
  typingBubble: {
    flexDirection: "row",
    alignSelf: "flex-start",
    backgroundColor: G.other,
    borderWidth: 1,
    borderColor: G.line,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 18,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#9CA3AF",
    marginHorizontal: 3,
  },

  /* Day separator */
  dayWrap: {
    alignSelf: "center",
    backgroundColor: "#EFF2F6",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 10,
    marginBottom: 4,
  },
  dayText: { fontSize: 11, color: "#6B7280" },

  peerName: {
    fontSize: 11,
    color: G.sub,
    marginLeft: 52,
    marginBottom: 4,
    marginTop: 6,
  },

  /* Rows & bubbles */
  row: { flexDirection: "row", marginVertical: 2, alignItems: "flex-end" },
  rowLeft: { justifyContent: "flex-start" },
  rowRight: { justifyContent: "flex-end", paddingLeft: 60 },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    overflow: "hidden",
    marginRight: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  bubble: {
    maxWidth: "78%",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
  },
  bubbleMe: {
    backgroundColor: G.me,
    borderColor: "#0AA461",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  bubbleOther: { backgroundColor: G.other, borderColor: G.line },
  msg: { fontSize: 15, color: G.text, lineHeight: 20 },

  /* Photo styling */
  photoMe: {
    width: 220,
    height: 180,
    borderRadius: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  photoOther: {
    width: 220,
    height: 180,
    borderRadius: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },

  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-end",
    gap: 6,
    marginTop: 4,
  },
  time: { fontSize: 10, color: "#9CA3AF" },
  statusWrap: { marginLeft: 2 },

  tail: {
    position: "absolute",
    width: 12,
    height: 12,
    backgroundColor: "transparent",
    bottom: -1,
  },
  tailLeft: {
    left: -6,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: G.line,
    backgroundColor: G.other,
    transform: [{ rotate: "45deg" }],
  },
  tailRight: {
    right: -6,
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#0AA461",
    backgroundColor: G.me,
    transform: [{ rotate: "-45deg" }],
  },

  /* Input */
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: G.line,
    backgroundColor: "#fff",
    gap: 8,
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF6F1",
  },
  inputPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    borderRadius: 22,
    paddingLeft: 14,
    paddingRight: 6,
    borderWidth: 1,
    borderColor: "#EAECF0",
  },
  input: {
    flex: 1,
    paddingVertical: 8,
    paddingRight: 8,
    fontSize: 15,
    color: G.text,
  },
  sendFab: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E5E7EB",
  },
  sendFabActive: { backgroundColor: G.green },

  /* Inactive ride footer */
  inactiveWrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: G.line,
    backgroundColor: "#FFFFFF",
  },
  inactiveText: {
    fontSize: 12,
    color: G.sub,
    textAlign: "center",
  },

  /* Skeleton bubble */
  skelBubble: {
    height: 38,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  skelOther: {
    backgroundColor: "#F3F4F6",
    borderColor: G.line,
  },
  skelMe: {
    backgroundColor: "#E5F7EE",
    borderColor: "#C9F0D9",
  },
});