// services/transport/Chat.js
import React, { useEffect, useMemo, useRef, useState } from "react";
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
  StatusBar,
  Pressable,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import * as ImagePicker from "expo-image-picker";
import { io } from "socket.io-client";
import { resolveCurrentRideId } from "../../utils/passengerSocket";
import { getUserInfo } from "../../utils/authToken";
// hardcoded socket endpoint per request

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
const SOCKET_ORIGIN = "https://grab.newedge.bt";
const SOCKET_PATH = "/grablike/socket.io";
const HTTP_BASE = "https://grab.newedge.bt/grablike";
const BASE_ORIGIN = SOCKET_ORIGIN;

/* ---------------- base + socket helpers ---------------- */
const CHAT_UPLOAD_ENDPOINT = `${HTTP_BASE}/chat/upload`;

let chatSocket = null;
let chatConfig = null;

const normalizeIds = (ids = {}) => ({
  driverId: ids.driverId || ids.driver_id || null,
  passengerId: ids.passengerId || ids.passenger_id || null,
  merchantId: ids.merchantId || ids.merchant_id || null,
});

const buildAuth = (role, ids) => ({
  role,
  userType: String(role || "").toUpperCase(),
  driverId: ids.driverId || undefined,
  driver_id: ids.driverId || undefined,
  passengerId: ids.passengerId || undefined,
  passenger_id: ids.passengerId || undefined,
  merchantId: ids.merchantId || undefined,
  merchant_id: ids.merchantId || undefined,
});

function ensureChatSocket({ role, ids }) {
  const normalized = normalizeIds(ids);
  const nextCfg = { role: role || "passenger", ids: normalized };

  const sameConfig =
    chatSocket &&
    chatConfig &&
    chatConfig.role === nextCfg.role &&
    chatConfig.ids.driverId === nextCfg.ids.driverId &&
    chatConfig.ids.passengerId === nextCfg.ids.passengerId &&
    chatConfig.ids.merchantId === nextCfg.ids.merchantId;

  if (sameConfig) return chatSocket;

  if (chatSocket) {
    try {
      chatSocket.disconnect();
    } catch {}
  }

  chatConfig = nextCfg;
  const auth = buildAuth(nextCfg.role, nextCfg.ids);
  chatSocket = io(SOCKET_ORIGIN, {
    path: SOCKET_PATH,
    transports: ["websocket", "polling"],
    auth,
    query: auth,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 800,
    reconnectionDelayMax: 7000,
    timeout: 15000,
  });

  chatSocket.on("connect", () => {
    chatSocket.emit("whoami", {
      role: nextCfg.role,
      driver_id: nextCfg.ids.driverId || undefined,
      passenger_id: nextCfg.ids.passengerId || undefined,
      merchant_id: nextCfg.ids.merchantId || undefined,
      driverId: nextCfg.ids.driverId || undefined,
      passengerId: nextCfg.ids.passengerId || undefined,
      merchantId: nextCfg.ids.merchantId || undefined,
    });
  });

  chatSocket.on("connect_error", (err) => {
    console.warn("[chat socket] connect_error", err?.message || err);
  });

  return chatSocket;
}

const getChatSocket = () => chatSocket;

const emitWithAck = (event, payload, { timeoutMs = 8000 } = {}) =>
  new Promise((resolve) => {
    const sock = getChatSocket();
    if (!sock) {
      resolve({ ok: false, error: "socket_not_ready" });
      return;
    }
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      resolve(v);
    };
    const timer = setTimeout(() => {
      finish({ ok: false, error: "ack_timeout", event });
    }, timeoutMs);
    try {
      sock.emit(event, payload, (ack) => {
        clearTimeout(timer);
        finish(ack);
      });
    } catch (err) {
      clearTimeout(timer);
      finish({ ok: false, error: err?.message || "socket_emit_failed" });
    }
  });

const toRequestId = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : s;
};

const joinChatRoom = (rideId) => {
  const requestId = toRequestId(rideId);
  if (requestId == null) {
    return Promise.resolve({ ok: false, error: "missing_request_id" });
  }
  return emitWithAck("chat:join", { request_id: requestId });
};
const leaveChatRoom = (rideId) => {
  const requestId = toRequestId(rideId);
  if (requestId == null) {
    return Promise.resolve({ ok: false, error: "missing_request_id" });
  }
  return emitWithAck("chat:leave", { request_id: requestId });
};
const fetchChatHistory = ({ rideId, beforeId = null, limit = 100 }) => {
  const requestId = toRequestId(rideId);
  if (requestId == null) {
    return Promise.resolve({ ok: false, error: "missing_request_id" });
  }
  return emitWithAck("chat:history", {
    request_id: requestId,
    ...(beforeId != null ? { before_id: Number(beforeId) } : {}),
    limit,
  });
};
const emitChatMessage = (payload) => emitWithAck("chat:send", payload);
const emitTyping = (rideId, isTyping) => {
  const sock = getChatSocket();
  if (!sock) return;
  const requestId = toRequestId(rideId);
  if (requestId == null) return;
  sock.emit("chat:typing", { request_id: requestId, is_typing: !!isTyping });
};
const emitReadReceipt = (rideId, lastSeenId) => {
  const sock = getChatSocket();
  if (!sock) return;
  const requestId = toRequestId(rideId);
  if (requestId == null) return;
  sock.emit("chat:read", {
    request_id: requestId,
    last_seen_id: Number(lastSeenId),
  });
};
const registerChatEvents = ({ onNewMessage, onTyping, onRead } = {}) => {
  const sock = getChatSocket();
  if (!sock) return () => {};

  const handlers = [];
  if (typeof onNewMessage === "function") {
    const h = (payload) => {
      const msg = payload?.message ?? payload?.data?.message ?? payload;
      const tempId = payload?.temp_id ?? payload?.data?.temp_id ?? null;
      try {
        const senderRole = msg?.sender_role ?? msg?.sender_type ?? "unknown";
        const senderId = msg?.sender_id ?? msg?.from?.id ?? "unknown";
        console.log("[chat] recv message", {
          event: "chat:new*",
          senderRole,
          senderId,
          id: msg?.id ?? msg?.message_id ?? null,
          request_id: msg?.request_id ?? payload?.request_id ?? null,
        });
      } catch {}
      onNewMessage(msg, tempId);
    };
    const evts = ["chat:new", "chat:new_message", "chat:new-message"];
    evts.forEach((evt) => {
      sock.on(evt, h);
      handlers.push([evt, h]);
    });
  }
  if (typeof onTyping === "function") {
    sock.on("chat:typing", onTyping);
    handlers.push(["chat:typing", onTyping]);
  }
  if (typeof onRead === "function") {
    sock.on("chat:read", onRead);
    handlers.push(["chat:read", onRead]);
  }

  return () => {
    handlers.forEach(([evt, handler]) => {
      try {
        sock.off(evt, handler);
      } catch {}
    });
  };
};

/* ---------------- misc helpers ---------------- */
const isAbs = (u = "") =>
  /^https?:\/\//i.test(u) ||
  /^file:\/\//i.test(u) ||
  /^ph:\/\//i.test(u) ||
  /^data:image\//i.test(u);
const toAbs = (u = "") =>
  isAbs(u) ? u : `${HTTP_BASE}/${String(u).replace(/^\/+/, "")}`;

const _nameCache = new Map();
async function fetchUserNameById(userId) {
  const key = String(userId || "").trim();
  if (!key) return null;
  if (_nameCache.has(key)) return _nameCache.get(key);

  try {
    const res = await fetch(
      `${HTTP_BASE}/api/driver_id?driverId=${encodeURIComponent(key)}`
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

/* ===== animated typing dots ===== */
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

/* ===== skeleton loader ===== */
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
        styles.bubbleRow,
        align === "right" ? styles.bubbleRowRight : styles.bubbleRowLeft,
        { marginVertical: 6 },
      ]}
    >
      <Animated.View
        style={[
          styles.skelBubble,
          { opacity: pulse, width: w },
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
const formatTime = (ts) => {
  try {
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  } catch {
    return "";
  }
};

/* ===================================================================== */
/*                              Component                                 */
/* ===================================================================== */

export default function Chat({ route, navigation }) {
  const insets = useSafeAreaInsets();

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
  const initialDriverName = route?.params?.driverName ?? peer?.name ?? "";

  const [me, setMe] = useState(meFromRoute || {});
  const [requestId, setRequestId] = useState(initialRequestId);
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  const [peerTyping, setPeerTyping] = useState(false);
  const typingTimerRef = useRef(null);
  const [peerLastSeenId, setPeerLastSeenId] = useState(0);
  const [isCurrentRide, setIsCurrentRide] = useState(true);
  const [replyTo, setReplyTo] = useState(null);

  const listRef = useRef(null);
  const unsubChatRef = useRef(null);
  const unsubSocketRideRef = useRef(null);

  const [driverUserId, setDriverUserId] = useState(
    initialDriverUserId ? String(initialDriverUserId) : ""
  );
  const [driverName, setDriverName] = useState(initialDriverName);

  const meId = useMemo(() => String(me?.id ?? ""), [me]);
  const meRole = useMemo(
    () => String(me?.role || meFromRoute?.role || "passenger"),
    [me, meFromRoute?.role]
  );

  const handshakeIds = useMemo(
    () => ({
      driverId:
        me?.driver_id ||
        route?.params?.driverId ||
        (meRole === "driver" ? meId : null),
      passengerId:
        me?.passenger_id ||
        route?.params?.passengerId ||
        (meRole === "passenger" ? meId : null),
      merchantId:
        me?.merchant_id ||
        route?.params?.merchantId ||
        (meRole === "merchant" ? meId : null),
    }),
    [
      me?.driver_id,
      me?.passenger_id,
      me?.merchant_id,
      route?.params?.driverId,
      route?.params?.passengerId,
      route?.params?.merchantId,
      meRole,
      meId,
    ]
  );

  const hasRide = !!requestId;
  const headerTitle =
    driverName ||
    peer?.name ||
    (meRole === "merchant" ? "Merchant" : "Driver");
  const headerSub = requestId ? `Trip #${requestId}` : "No active ride";

  useEffect(() => {
    if (
      !meRole ||
      (!handshakeIds.driverId &&
        !handshakeIds.passengerId &&
        !handshakeIds.merchantId)
    ) {
      return;
    }
    ensureChatSocket({ role: meRole, ids: handshakeIds });
  }, [
    meRole,
    handshakeIds.driverId,
    handshakeIds.passengerId,
    handshakeIds.merchantId,
  ]);

  const resolveMe = async () => {
    if (meId) return meId;
    try {
      const u = await getUserInfo();
      if (u?.user_id) {
        setMe((prev) => ({
          ...prev,
          id: u.user_id,
          name: u.user_name || prev?.name,
          role: meFromRoute?.role || prev?.role || "passenger",
        }));
        return String(u.user_id);
      }
    } catch {}
    return "";
  };

  const attachRideLevelListeners = () => {
    const s = getChatSocket();
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
      try {
        s.off("rideAccepted", onRideAccepted);
        s.off("rideStageUpdate", onRideStageUpdate);
      } catch {}
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

      const [joinAck, historyAck] = await Promise.all([
        joinChatRoom(rid),
        fetchChatHistory({ rideId: rid, limit: 100 }),
      ]);
      if (joinAck && joinAck.ok === false) {
        console.warn("[Chat] join failed:", joinAck?.error || joinAck);
      }
      const history = historyAck?.ok ? historyAck.messages || [] : [];

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
      console.log("Messages:", history.map(toUiMsg));
      setPeerTyping(false);
      setPeerLastSeenId(0);
      setTimeout(() => listRef.current?.scrollToEnd?.({ animated: false }), 50);

      if (unsubChatRef.current) {
        try {
          unsubChatRef.current();
        } catch {}
      }
      unsubChatRef.current = registerChatEvents({
        onNewMessage: (message, temp_id) => {
          const m = toUiMsg(message || {});
          if (!m.id) return;
          if (m.request_id && String(m.request_id) !== String(rid)) return;

          if (
            !driverUserId &&
            (m.sender_role === "driver" || m.sender_type === "driver") &&
            m.sender_id
          ) {
            setDriverUserId(String(m.sender_id));
          }

          if (temp_id) {
            setMsgs((prev) => {
              const idx = prev.findIndex((x) => String(x.id) === String(temp_id));
              if (idx >= 0) {
                const next = prev.slice();
                next[idx] = m;
                return next;
              }
              if (prev.some((x) => String(x.id) === String(m.id))) return prev;
              return [...prev, m];
            });
          } else {
            setMsgs((prev) => {
              if (prev.some((x) => String(x.id) === String(m.id))) return prev;
              return [...prev, m];
            });
          }

          setPeerTyping(false);
          clearTimeoutSafe(typingTimerRef);
          setTimeout(() => listRef.current?.scrollToEnd?.({ animated: true }), 60);
        },

        onTyping: (p) => {
          try {
            if (!p || String(p.request_id) !== String(rid)) return;
            if (p?.from?.role === meRole) return;

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

        onRead: (p) => {
          try {
            if (!p || String(p.request_id) !== String(rid)) return;
            if (p?.reader?.role === meRole) return;
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

  useEffect(() => {
    (async () => {
      const id = String(driverUserId || "").trim();
      if (!id) return;
      const name = await fetchUserNameById(id);
      if (name) setDriverName(name);
    })();
  }, [driverUserId]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const pid = await resolveMe();
        if (!pid) {
          setLoading(false);
          return;
        }

        let activeMeta = null;
        let activeReqId =
          route?.params?.requestId ??
          route?.params?.rideId ??
          route?.params?.id ??
          null;
        let activeDriverId = null;

        try {
          activeMeta = await resolveCurrentRideId(pid);
        } catch {}

        if (activeMeta != null) {
          if (typeof activeMeta === "object") {
            const d = activeMeta.data ?? activeMeta;
            activeReqId =
              route?.params?.requestId ??
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

        let finalReqId = initialRequestId || activeReqId;
        if (initialRequestId) {
          if (activeReqId && String(initialRequestId) === String(activeReqId)) {
            setIsCurrentRide(true);
          } else {
            setIsCurrentRide(false);
          }
        } else {
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
        console.warn("[Chat] init error", e?.message || e);
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
        leaveChatRoom(requestId);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!requestId || !msgs.length) return;
    let last = 0;
    for (let i = msgs.length - 1; i >= 0; i -= 1) {
      const n = Number(msgs[i]?.id);
      if (Number.isFinite(n)) {
        last = n;
        break;
      }
    }
    if (!last) return;
    try {
      emitReadReceipt(requestId, last);
    } catch {}
  }, [msgs.length, requestId]);

  const latestMineIdStr = useMemo(() => {
    let last = null;
    for (let i = msgs.length - 1; i >= 0; i -= 1) {
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

  const sendTextMessage = async () => {
    const text = input.trim();
    if (!text || !requestId || joining || !isCurrentRide) return;

    setInput("");
    const replyMeta = replyTo ? normalizeReply(replyTo) : null;
    const temp_id = `temp-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 7)}`;

    setMsgs((prev) => [
      ...prev,
      {
        id: String(temp_id),
        text,
        sender_role: meRole,
        sender_id: meId || "me",
        name: me?.name || "Me",
        ts: new Date().toISOString(),
        reply_to: replyMeta || undefined,
      },
    ]);
    setReplyTo(null);
    setPeerTyping(false);
    clearTimeoutSafe(typingTimerRef);
    scrollToEndSoon();

    try {
      const reqId = toRequestId(requestId);
      if (reqId == null) return;
      const ack = await emitChatMessage({
        request_id: reqId,
        message: text,
        temp_id,
        ...(replyMeta
          ? {
              reply_to: replyMeta,
              reply_to_id: replyMeta.id || undefined,
              reply_message_id: replyMeta.id || undefined,
            }
          : {}),
      });

      if (ack?.ok) {
        const ackMsg =
          ack?.message ||
          ack?.data?.message ||
          ack?.data?.msg ||
          ack?.data ||
          null;
        const ackId =
          ackMsg?.id ??
          ackMsg?.message_id ??
          ack?.message_id ??
          ack?.id ??
          null;
        const ackTs =
          ackMsg?.created_at ?? ackMsg?.ts ?? ack?.created_at ?? null;

        setMsgs((prev) => {
          const idx = prev.findIndex((x) => String(x.id) === String(temp_id));
          if (idx < 0) return prev;
          const next = prev.slice();
          const cur = next[idx];
          next[idx] = {
            ...cur,
            id: ackId != null ? String(ackId) : cur.id,
            ts: ackTs || cur.ts,
            client_state: "sent",
          };
          return next;
        });
      }
    } catch {}
  };

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

  const uploadChatImage = async (localUri) => {
    const name = localUri.split("/").pop() || `photo-${Date.now()}.jpg`;
    const type = guessMime(localUri);
    const form = new FormData();
    form.append("file", { uri: localUri, name, type });
    form.append("request_id", String(requestId || ""));

    const res = await fetch(CHAT_UPLOAD_ENDPOINT, {
      method: "POST",
      body: form,
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j?.url) {
      throw new Error(j?.error || `Upload failed (${res.status})`);
    }
    return String(j.url);
  };

  const sendImageMessage = async (localUri) => {
    if (!requestId || joining || !isCurrentRide) return;
    const replyMeta = replyTo ? normalizeReply(replyTo) : null;
    const temp_id = `temp-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 7)}`;

    setMsgs((prev) => [
      ...prev,
      {
        id: String(temp_id),
        text: "",
        sender_role: meRole,
        sender_id: meId || "me",
        name: me?.name || "Me",
        ts: new Date().toISOString(),
        image_url: localUri,
        reply_to: replyMeta || undefined,
      },
    ]);
    setReplyTo(null);
    scrollToEndSoon();

    try {
      const remote = await uploadChatImage(localUri);
      const reqId = toRequestId(requestId);
      if (reqId == null) return;
      const ack = await emitChatMessage({
        request_id: reqId,
        message: "",
        attachments: [{ type: "image", url: remote }],
        temp_id,
        ...(replyMeta
          ? {
              reply_to: replyMeta,
              reply_to_id: replyMeta.id || undefined,
              reply_message_id: replyMeta.id || undefined,
            }
          : {}),
      });

      if (ack?.ok) {
        const ackMsg =
          ack?.message ||
          ack?.data?.message ||
          ack?.data?.msg ||
          ack?.data ||
          null;
        const ackId =
          ackMsg?.id ??
          ackMsg?.message_id ??
          ack?.message_id ??
          ack?.id ??
          null;
        const ackTs =
          ackMsg?.created_at ?? ackMsg?.ts ?? ack?.created_at ?? null;
        const ackImage =
          ackMsg?.image_url ??
          ackMsg?.attachment?.url ??
          ackMsg?.attachments?.[0]?.url ??
          null;

        setMsgs((prev) => {
          const idx = prev.findIndex((x) => String(x.id) === String(temp_id));
          if (idx < 0) return prev;
          const next = prev.slice();
          const cur = next[idx];
          next[idx] = {
            ...cur,
            id: ackId != null ? String(ackId) : cur.id,
            ts: ackTs || cur.ts,
            image_url: ackImage || cur.image_url,
            client_state: "sent",
          };
          return next;
        });
      }
    } catch (e) {
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
      emitTyping(Number(requestId), !!text);
    } catch {}
  };

  const isMine = (m) =>
    m.sender_role === meRole ||
    String(m.sender_id) === meId ||
    m.id?.startsWith?.("temp-");
  const numericId = (m) => {
    const n = Number(m?.id);
    return Number.isFinite(n) ? n : null;
  };
  const getMyMsgStatus = (item) => {
    if (item?.client_state === "sent") return "sent";
    if (String(item?.id).startsWith("temp-")) return "pending";
    const idn = numericId(item);
    if (idn == null) return "sent";
    const isLatestMine =
      latestMineIdStr && String(item.id) === String(latestMineIdStr);
    if (!isLatestMine) return "sent";
    return Number(peerLastSeenId) >= idn ? "seen" : "sent";
  };
  const showDayBreak = (i) =>
    i === 0 || ymd(msgs[i - 1]?.ts) !== ymd(msgs[i]?.ts);

  const renderItem = ({ item, index }) => {
    const mine = isMine(item);
    const status = mine ? getMyMsgStatus(item, index) : null;
    const reply = item?.reply_to || null;
    const replyName =
      reply?.name ||
      (reply?.sender_role === "driver"
        ? "Driver"
        : reply?.sender_role === "merchant"
        ? "Merchant"
        : reply?.sender_role === "passenger"
        ? "Passenger"
        : "User");
    const replyText =
      reply?.text || (reply?.image_url ? "📷 Photo" : "") || "";

    return (
      <>
        {showDayBreak(index) ? (
          <View style={styles.dayWrap}>
            <Text style={styles.dayText}>{prettyDate(item?.ts)}</Text>
          </View>
        ) : null}

        <View
          style={[
            styles.bubbleRow,
            mine ? styles.bubbleRowRight : styles.bubbleRowLeft,
          ]}
        >
          <TouchableOpacity
            activeOpacity={0.88}
            onLongPress={() =>
              setReplyTo({
                id: item?.id,
                text: item?.text,
                sender_role: item?.sender_role,
                sender_id: item?.sender_id,
                name: item?.name,
                image_url: item?.image_url,
              })
            }
            style={[
              styles.bubble,
              mine ? styles.bubbleMerchant : styles.bubbleOther,
            ]}
          >
            {reply ? (
              <View style={styles.replyBubble}>
                <Text style={styles.replyName} numberOfLines={1}>
                  Replying to {replyName}
                </Text>
                {!!replyText && (
                  <Text style={styles.replyText} numberOfLines={1}>
                    {replyText}
                  </Text>
                )}
              </View>
            ) : null}

            {item.image_url ? (
              <Image
                source={{ uri: toAbs(item.image_url) }}
                style={styles.photo}
              />
            ) : null}

            {item.text ? (
              <Text style={[styles.bubbleText, mine && styles.bubbleTextMerchant]}>
                {item.text}
              </Text>
            ) : null}

            <View style={styles.metaRow}>
              <Text style={[styles.time, mine && styles.timeOnGreen]}>
                {formatTime(item.ts)}
              </Text>
              {mine ? (
                <View style={styles.statusWrap}>
                  {status === "pending" ? (
                    <Icon name="clock-outline" size={14} color="#FFFFFF" />
                  ) : status === "seen" ? (
                    <Icon name="check-all" size={16} color="#FFFFFF" />
                  ) : (
                    <Icon name="check" size={16} color="#FFFFFF" />
                  )}
                </View>
              ) : null}
            </View>
          </TouchableOpacity>
        </View>
      </>
    );
  };

  const onBack = () => navigation.goBack?.();
  const onCall = () => {};
  const onInfo = () => {};

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["left", "right"]}>
        <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />
        <ChatHeader
          insetsTop={insets.top}
          onBack={onBack}
          title={headerTitle}
          subtitle={headerSub}
          requestId={requestId}
        />
        <View style={[styles.centerWrap, { paddingBottom: 40 }]}>
          <ActivityIndicator size="large" color={G.green} />
          <Text style={styles.centerText}>Connecting with your driver...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!hasRide) {
    return (
      <SafeAreaView style={styles.safe} edges={["left", "right"]}>
        <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />
        <ChatHeader
          insetsTop={insets.top}
          onBack={onBack}
          title={headerTitle}
          subtitle={"No active ride"}
          requestId={null}
        />
        <View style={styles.centerWrap}>
          <Icon name="chat-question" size={40} color={G.sub} />
          <Text style={[styles.centerText, { maxWidth: 320 }]}>
            No active ride detected yet. This screen will auto-attach when your
            ride is accepted/started.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right"]}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

      <ChatHeader
        insetsTop={insets.top}
        onBack={onBack}
        title={headerTitle}
        subtitle={headerSub}
        requestId={requestId}
        onCall={onCall}
        onInfo={onInfo}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
      >
        {joining ? (
          <View style={styles.connectingBar}>
            <ActivityIndicator size="small" color={G.green} />
            <Text style={styles.connectingTxt}>Connecting…</Text>
          </View>
        ) : null}

        {peerTyping ? (
          <View style={styles.typingRow}>
            <TypingDots />
          </View>
        ) : null}

        <FlatList
          ref={listRef}
          data={msgs}
          keyExtractor={(it) => String(it.id)}
          renderItem={renderItem}
          onContentSizeChange={scrollToEndSoon}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingTop: 10,
            paddingBottom: 12,
          }}
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

        {isCurrentRide ? (
          <View
            style={[
              styles.inputBarWrap,
              {
                paddingBottom: Math.max(insets.bottom, 8) + 2,
                marginBottom: 4,
              },
            ]}
          >
            {replyTo ? (
              <View style={styles.replyBar}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.replyBarTitle} numberOfLines={1}>
                    Replying to{" "}
                    {replyTo?.name ||
                      (replyTo?.sender_role === "driver"
                        ? "Driver"
                        : replyTo?.sender_role === "merchant"
                        ? "Merchant"
                        : replyTo?.sender_role === "passenger"
                        ? "Passenger"
                        : "User")}
                  </Text>
                  <Text style={styles.replyBarText} numberOfLines={1}>
                    {replyTo?.text ||
                      (replyTo?.image_url ? "📷 Photo" : "") ||
                      ""}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.replyClose}
                  onPress={() => setReplyTo(null)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="close" size={16} color={G.sub} />
                </TouchableOpacity>
              </View>
            ) : null}

            <View style={styles.inputRow}>
              <TouchableOpacity
                style={styles.cameraBtn}
                onPress={handleAddPhoto}
                disabled={joining}
                activeOpacity={0.85}
              >
                <Ionicons name="camera-outline" size={20} color={G.green} />
              </TouchableOpacity>

              <TextInput
                style={styles.input}
                placeholder={joining ? "Connecting…" : "Type a message..."}
                placeholderTextColor="#9CA3AF"
                value={input}
                onChangeText={onTypingChange}
                multiline
                scrollEnabled
                textAlignVertical="top"
                editable={!joining}
              />

              <TouchableOpacity
                style={[
                  styles.sendButton,
                  input.trim() && !joining ? styles.sendButtonActive : null,
                ]}
                onPress={sendTextMessage}
                disabled={!input.trim() || joining}
                activeOpacity={0.85}
              >
                <Ionicons
                  name="send"
                  size={18}
                  color={input.trim() && !joining ? "#ffffff" : "#E5E7EB"}
                />
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.inactiveWrap}>
            <Text style={styles.inactiveText}>
              This ride is no longer active. You can’t send new messages.
            </Text>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* ======================= Header (UI only) ======================= */
const ChatHeader = ({ insetsTop = 0, onBack, title, subtitle, requestId, onCall, onInfo }) => {
  return (
    <View style={[styles.header, { paddingTop: (insetsTop || 0) + 6 }]}>
      <Pressable
        onPress={onBack}
        style={styles.iconBtn}
        android_ripple={{ color: "rgba(0,0,0,0.08)", borderless: true }}
      >
        <Ionicons name="arrow-back" size={24} color="#0f172a" />
      </Pressable>

      <View style={styles.headerTextWrap}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.headerSubtitle} numberOfLines={1}>
          {subtitle || ""}
        </Text>
      </View>

      {requestId ? (
        <View style={styles.orderPill}>
          <Ionicons name="receipt-outline" size={14} color="#065F46" />
          <Text style={styles.orderPillText} numberOfLines={1}>
            {String(requestId)}
          </Text>
        </View>
      ) : (
        <View style={styles.headerRightBtns}>
          {typeof onCall === "function" ? (
            <Pressable
              onPress={onCall}
              style={styles.iconBtn}
              android_ripple={{ color: "rgba(0,0,0,0.08)", borderless: true }}
            >
              <Ionicons name="call-outline" size={22} color={G.green} />
            </Pressable>
          ) : null}
          {typeof onInfo === "function" ? (
            <Pressable
              onPress={onInfo}
              style={styles.iconBtn}
              android_ripple={{ color: "rgba(0,0,0,0.08)", borderless: true }}
            >
              <Ionicons name="information-circle-outline" size={24} color="#0f172a" />
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
};

/* ---------------- mapping helper ---------------- */
function toUiMsg(m) {
  const id = String(
    m?.id ??
      m?.message_id ??
      m?.messageId ??
      m?.msg_id ??
      `${Date.now()}-${Math.random()}`
  );

  const text = String(pickMessageText(m));

  const sender_role = String(
    m?.sender_type ??
      m?.sender_role ??
      m?.from?.role ??
      m?.sender?.role ??
      ""
  ).toLowerCase();

  const sender_id = String(m?.sender_id ?? m?.from?.id ?? m?.sender?.id ?? "");

  const name =
    m?.name ||
    m?.sender_name ||
    (sender_role === "driver"
      ? "Driver"
      : sender_role === "merchant"
      ? "Merchant"
      : "Passenger");

  const ts =
    m?.created_at ??
    m?.createdAt ??
    m?.ts ??
    m?.timestamp ??
    new Date().toISOString();

  const request_id =
    m?.request_id ?? m?.requestId ?? m?.ride_id ?? m?.rideId ?? null;

  const reply_to = pickReplyMeta(m);

  const imgRel = pickImageUrl(m);
  const image_url = imgRel ? toAbs(imgRel) : null;

  return {
    id,
    text,
    sender_role,
    sender_id,
    name,
    ts,
    image_url,
    request_id,
    reply_to,
  };
}

function pickMessageText(m) {
  if (m == null) return "";
  if (typeof m === "string" || typeof m === "number") return String(m);

  const candidates = [
    m?.message,
    m?.text,
    m?.body,
    m?.message_body,
    m?.messageBody,
    m?.content,
    m?.last_message,
    m?.lastMessage,
  ];

  for (const c of candidates) {
    if (c == null) continue;
    const s = String(c).trim();
    if (s) return s;
  }
  return "";
}

function pickImageUrl(m) {
  if (!m) return null;
  const direct =
    m?.image_url ||
    m?.imageUrl ||
    m?.image ||
    m?.photo ||
    m?.photo_url ||
    null;
  if (direct) return direct;

  const att = m?.attachments ?? m?.attachment ?? m?.media ?? m?.files ?? null;
  const pickFromObj = (obj) => {
    if (!obj) return null;
    const url = obj.url ?? obj.uri ?? obj.path ?? obj.location ?? obj.file_url ?? null;
    if (!url) return null;
    const type = String(obj.type || obj.mime || obj.mimetype || "").toLowerCase();
    if (!type || type.startsWith("image")) return url;
    return null;
  };

  if (Array.isArray(att)) {
    for (const it of att) {
      const u = pickFromObj(it);
      if (u) return u;
    }
    return null;
  }

  return pickFromObj(att);
}

function pickReplyMeta(m) {
  if (!m) return null;

  const direct = m?.reply_to ?? m?.replyTo ?? m?.reply ?? null;
  if (direct) return normalizeReply(direct);

  const id =
    m?.reply_message_id ??
    m?.replyMessageId ??
    m?.reply_id ??
    m?.replyId ??
    null;
  const text =
    m?.reply_message ??
    m?.replyMessage ??
    m?.reply_text ??
    m?.replyText ??
    null;

  if (id != null || text != null) {
    return normalizeReply({ id, text });
  }
  return null;
}

function normalizeReply(r) {
  if (!r) return null;
  if (typeof r === "string" || typeof r === "number") {
    return { id: String(r), text: "", sender_role: "", sender_id: "", name: "" };
  }

  const id =
    r?.id ??
    r?.message_id ??
    r?.messageId ??
    r?.reply_id ??
    r?.replyId ??
    null;

  const text = pickMessageText(r);

  const sender_role = String(
    r?.sender_role ?? r?.sender_type ?? r?.from?.role ?? r?.sender?.role ?? ""
  ).toLowerCase();

  const sender_id = String(r?.sender_id ?? r?.from?.id ?? r?.sender?.id ?? "");

  const name =
    r?.name ||
    r?.sender_name ||
    (sender_role === "driver"
      ? "Driver"
      : sender_role === "merchant"
      ? "Merchant"
      : sender_role === "passenger"
      ? "Passenger"
      : "User");

  const image_url = pickImageUrl(r);

  if (!id && !text && !image_url) return null;

  return {
    id: id != null ? String(id) : null,
    text,
    sender_role,
    sender_id,
    name,
    image_url,
  };
}

function clearTimeoutSafe(ref) {
  try {
    if (ref?.current) {
      clearTimeout(ref.current);
      ref.current = null;
    }
  } catch {}
}

/* ---------------- styles (UI updated to match ChatDetailScreen) ---------------- */
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F9FAFB" },

  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#ffffff",
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
  },
  headerTextWrap: { flex: 1 },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
    textAlign: "left",
  },
  headerSubtitle: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 2,
  },
  headerRightBtns: { flexDirection: "row", alignItems: "center", gap: 6 },
  orderPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#D1FAE5",
    maxWidth: 140,
  },
  orderPillText: {
    marginLeft: 4,
    fontSize: 11,
    fontWeight: "600",
    color: "#065F46",
  },

  connectingBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#ffffff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  connectingTxt: { color: "#6B7280", fontSize: 12 },

  typingRow: { paddingVertical: 6, paddingHorizontal: 14 },
  typingBubble: {
    flexDirection: "row",
    alignSelf: "flex-start",
    backgroundColor: "#E5E7EB",
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

  bubbleRow: { flexDirection: "row", marginVertical: 3 },
  bubbleRowLeft: { justifyContent: "flex-start" },
  bubbleRowRight: { justifyContent: "flex-end" },

  bubble: {
    maxWidth: "78%",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  bubbleOther: { backgroundColor: "#E5E7EB", borderBottomLeftRadius: 4 },
  bubbleMerchant: { backgroundColor: "#00b14f", borderBottomRightRadius: 4 },

  replyBubble: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
  },
  replyName: { fontSize: 11, fontWeight: "700", color: "rgba(255,255,255,0.95)" },
  replyText: { fontSize: 12, color: "rgba(255,255,255,0.95)", marginTop: 2 },

  bubbleText: { fontSize: 14, color: "#111827" },
  bubbleTextMerchant: { color: "#ffffff" },

  photo: {
    width: 220,
    height: 180,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },

  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-end",
    gap: 6,
    marginTop: 6,
  },
  time: { fontSize: 10, color: "#6B7280" },
  timeOnGreen: { color: "rgba(255,255,255,0.9)" },
  statusWrap: { marginLeft: 2 },

  inputBarWrap: {
    backgroundColor: "#ffffff",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  replyBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingBottom: 10,
  },
  replyBarTitle: { fontSize: 12, color: "#6B7280", fontWeight: "700" },
  replyBarText: { fontSize: 12, color: "#111827", marginTop: 2 },
  replyClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
  },

  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingTop: 8,
    height: 80,
  },
  cameraBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
    marginRight: 10,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    backgroundColor: "#F3F4F6",
    color: "#111827",
  },
  sendButton: {
    marginLeft: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E5E7EB",
  },
  sendButtonActive: { backgroundColor: "#00b14f" },

  inactiveWrap: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 20,
    backgroundColor: "#ffffff",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
  },
  inactiveText: { fontSize: 12, color: "#6B7280", textAlign: "center" },

  centerWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  centerText: { marginTop: 10, color: "#6B7280", textAlign: "center" },

  skelBubble: { height: 38, borderRadius: 16, marginBottom: 10 },
  skelOther: { backgroundColor: "#E5E7EB" },
  skelMe: { backgroundColor: "#D1FAE5" },
});
