// useRideChat.js
import { useEffect, useRef, useState } from "react";
import {
  connectChatSocket,
  joinChatRoom,
  leaveChatRoom,
  loadChatHistory,
  sendChatMessage,
  setTyping,
  markChatRead,
  uploadChatImage,
} from "../utils/chatClient";

export function useRideChat({ role, ids, rideId }) {
  const roleNorm = String(role || "passenger").toLowerCase();
  const [messages, setMessages] = useState([]);
  const [peerTyping, setPeerTyping] = useState(false);
  const [lastSeenId, setLastSeenId] = useState(0);
  const typingTimer = useRef(null);

  useEffect(() => {
    connectChatSocket({ role: roleNorm, ids });

    joinChatRoom(rideId, (ack) => {
      if (ack?.ok) {
        loadChatHistory({ rideId, limit: 100 }, (historyAck) => {
          if (historyAck?.ok) setMessages(historyAck.messages || []);
        });
      }
    });

    const onNew = (payload) => {
      const message = payload?.message ?? payload?.data?.message ?? payload;
      const temp_id = payload?.temp_id ?? payload?.data?.temp_id ?? null;
      try {
        const senderRole = message?.sender_role ?? message?.sender_type ?? "unknown";
        const senderId = message?.sender_id ?? message?.from?.id ?? "unknown";
        console.log("[rideChat] recv message", {
          event: "chat:new*",
          senderRole,
          senderId,
          id: message?.id ?? message?.message_id ?? null,
          request_id: message?.request_id ?? payload?.request_id ?? null,
        });
      } catch {}
      setMessages((prev) => {
        if (temp_id) {
          const idx = prev.findIndex((m) => m.id === temp_id);
          if (idx >= 0) {
            const next = prev.slice();
            next[idx] = message;
            return next;
          }
        }
        return [...prev, message];
      });
    };
    const onTyping = (payload) => {
      if (String(payload?.request_id) !== String(rideId)) return;
      if (payload?.is_typing) {
        setPeerTyping(true);
        clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setPeerTyping(false), 3000);
      } else {
        setPeerTyping(false);
      }
    };
    const onRead = (payload) => {
      if (String(payload?.request_id) !== String(rideId)) return;
      const readerRole = String(payload?.reader?.role || "").toLowerCase();
      if (readerRole && readerRole !== roleNorm) {
        setLastSeenId(Number(payload?.last_seen_id || 0));
      }
    };

    const s = connectChatSocket({ role: roleNorm, ids });
    s.on("chat:new", onNew);
    s.on("chat:new_message", onNew);
    s.on("chat:new-message", onNew);
    s.on("chat:typing", onTyping);
    s.on("chat:read", onRead);

    return () => {
      leaveChatRoom(rideId);
      s.off("chat:new", onNew);
      s.off("chat:new_message", onNew);
      s.off("chat:new-message", onNew);
      s.off("chat:typing", onTyping);
      s.off("chat:read", onRead);
      clearTimeout(typingTimer.current);
    };
  }, [roleNorm, JSON.stringify(ids), rideId]);

  const sendText = (text) => {
    const tempId = sendChatMessage({ rideId, message: text });
    if (!tempId) return;
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        message: text,
        sender_type: roleNorm,
        sender_id: ids?.[`${roleNorm}Id`],
        created_at: new Date().toISOString(),
      },
    ]);
  };

  const sendImage = async (file) => {
    const url = await uploadChatImage(file);
    sendChatMessage({
      rideId,
      attachments: [{ type: "image", url }],
    });
  };

  const notifyTyping = (val) => setTyping(rideId, val);
  const notifyRead = (id) => markChatRead(rideId, id);

  return {
    messages,
    peerTyping,
    lastSeenId,
    sendText,
    sendImage,
    notifyTyping,
    notifyRead,
  };
}
