// RestaurantFeedbackScreen.js (FULL UPDATED)
// ✅ Uses REPORT_COMMENT/REPORT_REPLY with {type} = owner_type ('food'|'mart')
// ✅ Same report UX as MartReviews (reasons + Other max 30 words)
// ✅ Prevent stacked modals freeze (reply -> report -> reopen reply)
// ✅ Strict URL guards (no empty url)
// ✅ Shows ONLY backend message

import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Platform,
  Image,
  TextInput,
  Modal,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Keyboard,
} from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import {
  FEEDBACK_ENDPOINT,
  FEEDBACK_REPLY_ENDPOINT,
  REPORT_COMMENT,
  REPORT_REPLY,
  PROFILE_IMAGE as PROFILE_IMAGE_ENDPOINT,
  MEDIA_BASE_URL,
} from "@env";

/* ===================== constants ===================== */
const BLUE = "#2E90FA";
const REPORT_OTHER_MAX_WORDS = 30;

/* ===================== helpers ===================== */
function normalizeHostLoose(url) {
  if (!url) return "";
  let out = String(url).replace("/marchant/", "/merchant/");
  if (Platform.OS === "android") {
    out = out
      .replace("://localhost", "://10.0.2.2")
      .replace("://127.0.0.1", "://10.0.2.2");
  }
  return out;
}

function coerceHttpsForGrab(url) {
  if (!url) return "";
  let out = normalizeHostLoose(url);
  if (/^http:\/\//i.test(out) && /grab\.newedge\.bt/i.test(out)) {
    out = out.replace(/^http:/i, "https:");
  }
  return out;
}

function normalizeRatingType(v) {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "mart" || s === "grocery" || s === "grocer" || s.includes("mart"))
    return "mart";
  if (
    s === "food" ||
    s === "restaurant" ||
    s === "resturant" ||
    s.includes("food")
  )
    return "food";
  return "food";
}

const wordCount = (s = "") =>
  String(s).trim().split(/\s+/).filter(Boolean).length;

const clampToWords = (s = "", maxWords = 30) => {
  const parts = String(s).trim().split(/\s+/).filter(Boolean);
  if (parts.length <= maxWords) return s;
  return parts.slice(0, maxWords).join(" ");
};

const REPORT_REASONS = [
  { id: "offensive", label: "Offensive, hateful, or sexual content" },
  { id: "spam", label: "Spam or advertisement" },
  { id: "false", label: "Irrelevant or false information" },
  { id: "personal", label: "Personal or restricted information" },
  { id: "other", label: "It's something else" },
];

const extractMsg = (j) =>
  (j && (j.message || j.msg || j.error)) ||
  (j?.data && (j.data.message || j.data.msg || j.data.error)) ||
  (j?.result && (j.result.message || j.result.msg || j.result.error)) ||
  null;

const userFacingMessage = (err, fallback = "Something went wrong.") => {
  const raw = String(err?.message || err || "").trim();
  if (!raw) return fallback;

  const bodyMatch = raw.match(/\bBody\s*:\s*([\s\S]*)$/i);
  const bodyText = bodyMatch?.[1]?.trim();

  if (bodyText) {
    try {
      const j = JSON.parse(bodyText);
      const m = extractMsg(j);
      if (m) return m;
    } catch {
      const m1 = bodyText.match(/"message"\s*:\s*"([^"]+)"/i);
      if (m1?.[1]) return m1[1];
      const m2 = bodyText.match(/message\s*:\s*([^,\n]+)/i);
      if (m2?.[1]) return String(m2[1]).trim();
    }
  }

  const rm1 = raw.match(/"message"\s*:\s*"([^"]+)"/i);
  if (rm1?.[1]) return rm1[1];

  const rm2 = raw.match(/message\s*:\s*([^,\n]+)/i);
  if (rm2?.[1]) return String(rm2[1]).trim();

  const looksNoisy =
    /(^|\s)HTTP\s*\d+/i.test(raw) ||
    /\bat\s+https?:\/\//i.test(raw) ||
    /\bBody\s*:/i.test(raw);

  if (looksNoisy) return fallback;
  return raw;
};

async function fetchJSON(url, options = {}, timeoutMs = 15000) {
  if (!url) throw new Error("Cannot load an empty url");

  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();

    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {}

    if (!res.ok) {
      const msg =
        (json && (json.error || json.message)) || text || `HTTP ${res.status}`;
      throw new Error(msg);
    }

    return json;
  } finally {
    clearTimeout(tid);
  }
}

/* ---- token helpers ---- */
const KEY_AUTH_TOKEN = "auth_token";
const KEY_MERCHANT_LOGIN = "merchant_login";

async function getAccessTokenFromStore() {
  try {
    const raw = await SecureStore.getItemAsync(KEY_MERCHANT_LOGIN);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.token?.access_token) return String(parsed.token.access_token).trim();
      if (typeof parsed?.token === "string") return String(parsed.token).trim();
    }
    const direct = await SecureStore.getItemAsync(KEY_AUTH_TOKEN);
    if (direct) return String(direct).trim();
    return "";
  } catch {
    return "";
  }
}

async function getBearerToken(authContext) {
  let token = authContext?.token || (await getAccessTokenFromStore());
  if (!token) throw new Error("Missing access token from login info.");
  const bare = String(token).replace(/^Bearer\s+/i, "").trim();
  return `Bearer ${bare}`;
}

/* ---------- profile image helpers ---------- */
const DEFAULT_AVATAR =
  "https://images.unsplash.com/photo-1612198182421-3f5dff0c9b40?q=80&w=400&auto=format&fit=crop";

const PROFILE_BASE = normalizeHostLoose(
  String(PROFILE_IMAGE_ENDPOINT || MEDIA_BASE_URL || "").replace(/\/+$/, "")
);

const FEEDBACK_ORIGIN = (() => {
  try {
    const m = /^https?:\/\/[^/]+/i.exec(FEEDBACK_ENDPOINT || "");
    return m ? normalizeHostLoose(m[0]) : "";
  } catch {
    return "";
  }
})();

function buildProfileImageUrl(rawProfilePath) {
  if (!rawProfilePath) return DEFAULT_AVATAR;

  const raw = String(rawProfilePath).trim();
  if (/^https?:\/\//i.test(raw)) return normalizeHostLoose(raw);

  const path = raw.startsWith("/") ? raw : `/${raw}`;
  if (PROFILE_BASE) return `${PROFILE_BASE}${path}`;
  if (FEEDBACK_ORIGIN) return `${FEEDBACK_ORIGIN}${path}`;
  return DEFAULT_AVATAR;
}

/* ===================== component ===================== */
export default function RestaurantFeedbackScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const authContext = route?.params?.authContext || null;

  const businessName = route?.params?.business_name || "";
  const businessIdRaw = route?.params?.business_id;
  const businessIdStr = String(businessIdRaw ?? "").trim();
  const businessIdNum = Number.isInteger(businessIdRaw)
    ? businessIdRaw
    : /^\d+$/.test(businessIdStr)
    ? parseInt(businessIdStr, 10)
    : NaN;

  // ✅ owner_type normalized to food|mart
  const ownerTypeParam = normalizeRatingType(
    route?.params?.owner_type ||
      authContext?.owner_type ||
      authContext?.user?.owner_type ||
      authContext?.raw?.owner_type ||
      "food"
  );

  useEffect(() => {
    console.log("[Feedback] ownerTypeParam (normalized) =", ownerTypeParam);
    console.log("[Feedback] REPORT_COMMENT =", REPORT_COMMENT);
    console.log("[Feedback] REPORT_REPLY =", REPORT_REPLY);
  }, [ownerTypeParam]);

  const endpointTpl = useMemo(() => normalizeHostLoose(FEEDBACK_ENDPOINT || ""), []);

  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const alerted = useRef(false);

  // reply state
  const [replyModalVisible, setReplyModalVisible] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replyingItem, setReplyingItem] = useState(null);
  const [postingReply, setPostingReply] = useState(false);

  // replies expanded
  const [expandedReplies, setExpandedReplies] = useState({});

  // report state (MartReviews style)
  const [reportTarget, setReportTarget] = useState(null); // { kind:'comment', ratingId, type } | { kind:'reply', replyId, type }
  const [reportReasonId, setReportReasonId] = useState(null);
  const [reportOtherText, setReportOtherText] = useState("");
  const [postingReport, setPostingReport] = useState(false);

  // prevent stacked modal freeze
  const [replyReopenItem, setReplyReopenItem] = useState(null);

  // iOS keyboard offset
  const [reportKbdOffset, setReportKbdOffset] = useState(0);
  useEffect(() => {
    if (Platform.OS !== "ios") return;
    const show = Keyboard.addListener("keyboardWillShow", (e) => {
      const h = e?.endCoordinates?.height || 0;
      setReportKbdOffset(Math.max(0, h - 12));
    });
    const hide = Keyboard.addListener("keyboardWillHide", () => setReportKbdOffset(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const buildUrl = useCallback(() => {
    if (!Number.isInteger(businessIdNum) || businessIdNum <= 0) return "";
    let base = endpointTpl;
    base = base
      .replace(/\{business_id\}/gi, String(businessIdNum))
      .replace(/%7Bbusiness_id%7D/gi, String(businessIdNum));
    if (/\/ratings\/?$/i.test(base) && !/\/\d+(\?|$)/.test(base)) {
      base = base.replace(/\/?$/, `/${encodeURIComponent(String(businessIdNum))}`);
    }
    return coerceHttpsForGrab(base);
  }, [endpointTpl, businessIdNum]);

  const load = useCallback(async () => {
    if (!Number.isInteger(businessIdNum) || businessIdNum <= 0) {
      if (!alerted.current) {
        alerted.current = true;
        Alert.alert("Feedback", "Missing or invalid business_id.");
      }
      return;
    }

    try {
      setLoading(true);
      const url = buildUrl();
      const payload = await fetchJSON(url);

      const listRaw = Array.isArray(payload) ? payload : payload?.data || payload?.items || [];

      const mapped = listRaw.map((it, idx) => ({
        id: it.id ?? it.notification_id ?? `${it.user?.user_id || "u"}_${idx}`,
        rating_id: it.rating_id ?? it.id ?? it.notification_id ?? null,
        rating: it.rating,
        comment: it.comment,
        created_at: it.created_at || it.createdAt || null,
        user_name: it.user?.user_name || "Anonymous",
        profile_image: it.user?.profile_image || "",
        owner_type: normalizeRatingType(it.owner_type || ownerTypeParam),
        business_id: it.business_id || null,
        likes_count: it.likes_count ?? 0,
        reply_count: it.reply_count ?? (Array.isArray(it.replies) ? it.replies.length : 0),
        replies: Array.isArray(it.replies) ? it.replies : [],
      }));

      setMeta(Array.isArray(payload) ? null : payload?.meta || null);
      setItems(mapped);
    } catch (e) {
      if (!alerted.current) {
        alerted.current = true;
        Alert.alert("Load failed", userFacingMessage(e, "Load failed"));
      }
      console.error("[Feedback] load error", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setInitialLoad(false);
    }
  }, [businessIdNum, buildUrl, ownerTypeParam]);

  useEffect(() => {
    setItems([]);
    setMeta(null);
    setInitialLoad(true);
    alerted.current = false;
    setExpandedReplies({});
    load();
  }, [businessIdNum, endpointTpl, load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  /* ===================== reply ===================== */
  const openReplyModal = useCallback((item) => {
    setReplyingItem(item);
    setReplyText("");
    setReplyModalVisible(true);
  }, []);

  const closeReplyModal = useCallback(() => {
    if (postingReply) return;
    setReplyModalVisible(false);
    setReplyText("");
    setReplyingItem(null);
  }, [postingReply]);

  const submitReply = useCallback(async () => {
    if (!replyText.trim()) {
      Alert.alert("Reply", "Please enter a reply first.");
      return;
    }
    if (!replyingItem) return;

    try {
      setPostingReply(true);

      const notificationId = replyingItem.id ?? replyingItem.notification_id ?? replyingItem.rating_id;
      if (!notificationId) throw new Error("Missing notification_id (rating id)");

      const ratingType = normalizeRatingType(replyingItem?.owner_type || ownerTypeParam);

      let url = String(FEEDBACK_REPLY_ENDPOINT || "").trim();
      if (!url) throw new Error("Missing FEEDBACK_REPLY_ENDPOINT");

      if (/\{owner_type\}/i.test(url) || /%7Bowner_type%7D/i.test(url)) {
        url = url
          .replace(/\{owner_type\}/gi, ratingType)
          .replace(/%7Bowner_type%7D/gi, ratingType);
      } else {
        url = url.replace(/\/ratings\/(food|mart)\//i, `/ratings/${ratingType}/`);
      }

      url = url
        .replace(/\{notification_id\}/gi, encodeURIComponent(String(notificationId)))
        .replace(/%7Bnotification_id%7D/gi, encodeURIComponent(String(notificationId)));

      url = coerceHttpsForGrab(url);

      const authHeader = await getBearerToken(authContext);

      await fetchJSON(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        body: JSON.stringify({ text: replyText.trim() }),
      });

      Alert.alert("Reply sent", "Your reply has been posted.");
      setReplyModalVisible(false);
      setReplyText("");
      setReplyingItem(null);
      load();
    } catch (e) {
      console.error("[Feedback] reply error", e);
      Alert.alert("Reply failed", userFacingMessage(e, "Failed to send reply."));
    } finally {
      setPostingReply(false);
    }
  }, [replyText, replyingItem, load, authContext, ownerTypeParam]);

  /* ===================== report (type = owner_type) ===================== */
  const openReportForComment = useCallback(
    (item) => {
      const ratingId = item?.rating_id ?? item?.id;
      if (!ratingId) return Alert.alert("Report failed", "Missing rating id.");

      const type = normalizeRatingType(item?.owner_type || ownerTypeParam); // ✅ type = owner_type

      setReplyReopenItem(null);
      setReportTarget({ kind: "comment", ratingId, type });
      setReportReasonId(null);
      setReportOtherText("");
    },
    [ownerTypeParam]
  );

  const openReportForReply = useCallback(
    (parentItem, rep) => {
      const replyId = rep?.reply_id ?? rep?.id ?? rep?.replyId;
      if (!replyId) return Alert.alert("Report failed", "Missing reply id.");

      const type = normalizeRatingType(parentItem?.owner_type || ownerTypeParam); // ✅ type = owner_type

      // prevent stacked modal freeze
      if (replyModalVisible && replyingItem) setReplyReopenItem(replyingItem);
      if (replyModalVisible) {
        setReplyModalVisible(false);
        setReplyingItem(null);
        setReplyText("");
      }

      setReportTarget({ kind: "reply", replyId, type });
      setReportReasonId(null);
      setReportOtherText("");
    },
    [ownerTypeParam, replyModalVisible, replyingItem]
  );

  const closeReportSheet = useCallback(() => {
    if (postingReport) return;

    setReportTarget(null);
    setReportReasonId(null);
    setReportOtherText("");

    if (replyReopenItem) {
      setReplyingItem(replyReopenItem);
      setReplyText("");
      setReplyModalVisible(true);
      setReplyReopenItem(null);
    }
  }, [postingReport, replyReopenItem]);

  // ✅ REPORT_COMMENT=https://.../ratings/{type}/{rating_id}/report
  const buildReportCommentUrl = useCallback(({ type, ratingId }) => {
    const base = String(REPORT_COMMENT || "").trim();
    if (!base) return "";
    let url = base;

    url = url
      .replace(/\{type\}/gi, type)
      .replace(/%7Btype%7D/gi, type)
      .replace(/\{rating_id\}/gi, encodeURIComponent(String(ratingId)))
      .replace(/%7Brating_id%7D/gi, encodeURIComponent(String(ratingId)));

    return coerceHttpsForGrab(url);
  }, []);

  // ✅ REPORT_REPLY=https://.../ratings/{type}/replies/{reply_id}/report
  const buildReportReplyUrl = useCallback(({ type, replyId }) => {
    const base = String(REPORT_REPLY || "").trim();
    if (!base) return "";
    let url = base;

    url = url
      .replace(/\{type\}/gi, type)
      .replace(/%7Btype%7D/gi, type)
      .replace(/\{reply_id\}/gi, encodeURIComponent(String(replyId)))
      .replace(/%7Breply_id%7D/gi, encodeURIComponent(String(replyId)));

    return coerceHttpsForGrab(url);
  }, []);

  const handleReportSubmit = useCallback(async () => {
    if (!reportTarget || !reportReasonId) return;

    const chosen = REPORT_REASONS.find((x) => x.id === reportReasonId);
    if (!chosen) return;

    const otherTrim = reportOtherText.trim();
    const reasonFinal = reportReasonId === "other" ? otherTrim : chosen.label;
    if (!reasonFinal) return;

    const wc = wordCount(reasonFinal);
    if (reportReasonId === "other" && wc > REPORT_OTHER_MAX_WORDS) return;

    try {
      setPostingReport(true);

      const authHeader = await getBearerToken(authContext);

      let url = "";
      if (reportTarget.kind === "comment") {
        url = buildReportCommentUrl({
          type: reportTarget.type || ownerTypeParam,
          ratingId: reportTarget.ratingId,
        });
      } else {
        url = buildReportReplyUrl({
          type: reportTarget.type || ownerTypeParam,
          replyId: reportTarget.replyId,
        });
      }

      if (!url) throw new Error("Cannot load an empty url");

      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason: reasonFinal }),
      });

      if (!res.ok) {
        const text = await res.text();
        let msg = "Could not submit your report.";
        try {
          const j = text ? JSON.parse(text) : null;
          msg = extractMsg(j) || msg;
        } catch {
          msg = text || msg;
        }

        if (
          /already\s*reported|already\s*report|reported\s*already|duplicate|only\s*once|once/i.test(
            String(msg)
          )
        ) {
          closeReportSheet();
          Alert.alert("Already reported", msg);
          return;
        }

        throw new Error(msg);
      }

      closeReportSheet();
      Alert.alert("Reported", "Your report has been submitted successfully.");
    } catch (e) {
      Alert.alert("Report failed", userFacingMessage(e, "Could not submit your report."));
    } finally {
      setPostingReport(false);
    }
  }, [
    reportTarget,
    reportReasonId,
    reportOtherText,
    authContext,
    ownerTypeParam,
    buildReportCommentUrl,
    buildReportReplyUrl,
    closeReportSheet,
  ]);

  /* ===================== UI ===================== */
  const renderHeader = () => {
    if (!meta?.totals) return null;
    const t = meta.totals;
    return (
      <View>
        <View style={styles.summary}>
          <View style={styles.summaryLeft}>
            <Ionicons name="star" size={18} color="#f59e0b" />
            <Text style={styles.summaryScore}>
              {Number(t.avg_rating ?? 0).toFixed(1)} / 5
            </Text>
          </View>
          <Text style={styles.summaryText}>
            {t.total_ratings ?? 0} ratings • {t.total_comments ?? 0} comments
          </Text>
        </View>
      </View>
    );
  };

  const renderItem = ({ item }) => {
    const created = item.created_at ? new Date(item.created_at) : null;
    const avatar = buildProfileImageUrl(item.profile_image);
    const likesCount = Number(item.likes_count ?? 0);

    const hasReplies = Array.isArray(item.replies) && item.replies.length > 0;
    const expanded = !!expandedReplies[item.id];

    const toggleExpand = () => {
      setExpandedReplies((prev) => ({ ...prev, [item.id]: !prev[item.id] }));
    };

    return (
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <View style={styles.userRow}>
            <Image source={{ uri: avatar }} style={styles.avatar} resizeMode="cover" />
            <View>
              <Text style={styles.userName} numberOfLines={1}>
                {item.user_name}
              </Text>
              {created ? (
                <Text style={styles.cardTimeSmall}>{created.toLocaleDateString()}</Text>
              ) : null}
            </View>
          </View>

          <View style={styles.rightHead}>
            <TouchableOpacity
              style={styles.reportIconBtn}
              activeOpacity={0.7}
              onPress={() => openReportForComment(item)}
            >
              <Ionicons name="flag-outline" size={18} color="#ef4444" />
            </TouchableOpacity>

            <View style={styles.ratingPill}>
              <Ionicons name="star" size={14} color="#f59e0b" />
              <Text style={styles.ratingText}>{Number(item.rating ?? 0)}/5</Text>
            </View>
          </View>
        </View>

        {item.comment ? <Text style={styles.cardBody}>{item.comment}</Text> : null}

        <View style={styles.cardFoot}>
          <View style={styles.cardFootLeft}>
            <View style={styles.iconStat}>
              <Ionicons name="heart-outline" size={14} color="#ef4444" />
              <Text style={styles.iconStatText}>{likesCount}</Text>
            </View>
            <View style={styles.iconStat}>
              <Ionicons name="chatbubble-ellipses-outline" size={14} color="#0ea5e9" />
              <Text style={styles.iconStatText}>
                {item.reply_count ?? (item.replies || []).length ?? 0}
              </Text>
            </View>
          </View>

          <TouchableOpacity style={styles.replyBtn} activeOpacity={0.7} onPress={() => openReplyModal(item)}>
            <Ionicons name="arrow-undo-outline" size={16} color="#0284c7" />
            <Text style={styles.replyBtnText}>Reply</Text>
          </TouchableOpacity>
        </View>

        {hasReplies && !expanded && (
          <TouchableOpacity style={styles.viewRepliesRow} activeOpacity={0.7} onPress={toggleExpand}>
            <View style={styles.viewRepliesLine} />
            <Text style={styles.viewRepliesText}>
              View {item.replies.length} {item.replies.length === 1 ? "reply" : "replies"}
            </Text>
          </TouchableOpacity>
        )}

        {hasReplies && expanded && (
          <View style={styles.replyThreadContainer}>
            <View style={styles.threadBar} />
            <View style={styles.replyList}>
              {item.replies.map((rep) => {
                const rAvatar = buildProfileImageUrl(rep.user?.profile_image);
                const rName = rep.user?.user_name || "You";
                const ago =
                  rep.hours_ago === 0
                    ? "Just now"
                    : rep.hours_ago != null
                    ? `${rep.hours_ago}h ago`
                    : "";

                return (
                  <View key={String(rep.id ?? rep.reply_id)} style={styles.replyRow}>
                    <Image source={{ uri: rAvatar }} style={styles.replyAvatar} resizeMode="cover" />
                    <View style={styles.replyBubble}>
                      <View style={styles.replyHeaderRow}>
                        <Text style={styles.replyName}>{rName}</Text>
                        <View style={styles.replyMetaRight}>
                          {!!ago && <Text style={styles.replyTime}>{ago}</Text>}
                          <TouchableOpacity
                            style={styles.replyReportBtn}
                            activeOpacity={0.7}
                            onPress={() => openReportForReply(item, rep)}
                          >
                            <Ionicons name="flag-outline" size={14} color="#ef4444" />
                          </TouchableOpacity>
                          <Ionicons
                            name="checkmark-done-outline"
                            size={14}
                            color="#22c55e"
                            style={{ marginLeft: 6 }}
                          />
                        </View>
                      </View>

                      <Text style={styles.replyText}>{rep.text}</Text>
                    </View>
                  </View>
                );
              })}

              <TouchableOpacity style={styles.hideRepliesRow} onPress={toggleExpand}>
                <Text style={styles.hideRepliesText}>Hide replies</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  };

  const modalCommon = {
    transparent: true,
    animationType: "fade",
    presentationStyle: "overFullScreen",
    statusBarTranslucent: true,
  };

  const reportOpen = !!reportTarget;
  const otherSelected = reportReasonId === "other";
  const otherWords = wordCount(reportOtherText);
  const otherTooLong = otherSelected && otherWords > REPORT_OTHER_MAX_WORDS;
  const reportDisabled =
    !reportReasonId ||
    (otherSelected && !reportOtherText.trim()) ||
    otherTooLong;

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right", "bottom"]}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 8) + 18 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.title}>{businessName ? `${businessName} Feedback` : "Feedback"}</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={items}
        keyExtractor={(it, idx) => String(it.id ?? idx)}
        contentContainerStyle={styles.listPad}
        renderItem={renderItem}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          !initialLoad && !loading ? (
            <View style={styles.empty}>
              <Ionicons name="mail-open-outline" size={36} color="#94a3b8" />
              <Text style={styles.emptyText}>No feedback yet.</Text>
            </View>
          ) : null
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListFooterComponent={
          loading ? (
            <View style={{ paddingVertical: 16 }}>
              <ActivityIndicator />
            </View>
          ) : null
        }
      />

      {/* Reply modal */}
      <Modal visible={replyModalVisible} {...modalCommon} onRequestClose={closeReplyModal}>
        <KeyboardAvoidingView style={styles.kav} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <Pressable style={styles.modalBackdrop} onPress={closeReplyModal}>
            <Pressable style={styles.modalContent} onPress={() => {}}>
              <Text style={styles.modalTitle}>Reply to feedback</Text>

              {replyingItem?.comment ? (
                <Text style={styles.modalOriginal} numberOfLines={3}>
                  “{replyingItem.comment}”
                </Text>
              ) : null}

              <TextInput
                style={styles.modalInput}
                placeholder="Type your reply..."
                placeholderTextColor="#94a3b8"
                multiline
                value={replyText}
                onChangeText={setReplyText}
                editable={!postingReply}
                textAlignVertical="top"
              />

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalBtnCancel]}
                  onPress={closeReplyModal}
                  disabled={postingReply}
                >
                  <Text style={styles.modalBtnCancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalBtnSend]}
                  onPress={submitReply}
                  disabled={postingReply}
                >
                  {postingReply ? <ActivityIndicator size="small" /> : <Text style={styles.modalBtnSendText}>Send</Text>}
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Report bottom sheet */}
      <Modal visible={reportOpen} {...modalCommon} onRequestClose={closeReportSheet}>
        <KeyboardAvoidingView
          style={styles.kav}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? reportKbdOffset : 0}
        >
          <Pressable style={styles.menuBackdrop} onPress={closeReportSheet}>
            <Pressable style={styles.reportSheet} onPress={() => {}}>
              <Text style={styles.reportTitle}>
                {reportTarget?.kind === "reply" ? "Report Reply" : "Report Comment"}
              </Text>
              <Text style={styles.reportSubtitle}>
                A reported item will be assessed according to our guidelines before any action is taken.
                Your report will be anonymous.
              </Text>

              <ScrollView
                style={{ maxHeight: "62%" }}
                contentContainerStyle={{ paddingBottom: 8 }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {REPORT_REASONS.map((opt) => {
                  const selected = reportReasonId === opt.id;
                  return (
                    <Pressable
                      key={opt.id}
                      style={styles.reportRow}
                      onPress={() => {
                        setReportReasonId(opt.id);
                        if (opt.id !== "other") setReportOtherText("");
                      }}
                    >
                      <Ionicons
                        name={selected ? "radio-button-on-outline" : "radio-button-off-outline"}
                        size={20}
                        color={selected ? BLUE : "#9ca3af"}
                        style={{ marginRight: 10 }}
                      />
                      <Text style={styles.reportRowTxt}>{opt.label}</Text>
                    </Pressable>
                  );
                })}

                {otherSelected && (
                  <View style={{ marginTop: 8 }}>
                    <TextInput
                      style={styles.reportOtherInput}
                      placeholder="Write your reason (max 30 words)…"
                      value={reportOtherText}
                      onChangeText={(t) => setReportOtherText(clampToWords(t, REPORT_OTHER_MAX_WORDS))}
                      multiline
                      textAlignVertical="top"
                      returnKeyType="done"
                    />
                    <View style={styles.reportOtherMetaRow}>
                      <Text style={[styles.reportOtherCounter, otherTooLong && styles.reportOtherCounterBad]}>
                        {Math.min(otherWords, REPORT_OTHER_MAX_WORDS)}/{REPORT_OTHER_MAX_WORDS} words
                      </Text>
                      {!!reportOtherText.trim() && (
                        <TouchableOpacity
                          onPress={() => setReportOtherText("")}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="close-circle" size={18} color="#9ca3af" />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                )}
              </ScrollView>

              <TouchableOpacity
                onPress={handleReportSubmit}
                disabled={reportDisabled || postingReport}
                style={[
                  styles.reportBtn,
                  (reportDisabled || postingReport) && styles.reportBtnDisabled,
                ]}
              >
                {postingReport ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.reportBtnTxt}>Report</Text>}
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

/* ===================== styles ===================== */
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  header: {
    minHeight: 52,
    paddingHorizontal: 12,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    borderBottomColor: "#e2e8f0",
    borderBottomWidth: 1,
    backgroundColor: "#fff",
  },
  backBtn: { height: 40, width: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700", color: "#0f172a" },
  listPad: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10 },

  summary: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 12,
    marginVertical: 6,
    backgroundColor: "#f8fafc",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  summaryLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  summaryScore: { fontWeight: "800", color: "#0f172a" },
  summaryText: { color: "#475569" },

  card: { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 12, marginVertical: 6, backgroundColor: "#fff" },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  userRow: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#e5e7eb" },
  userName: { color: "#0f172a", fontWeight: "700", flexShrink: 1 },
  cardTimeSmall: { fontSize: 11, color: "#94a3b8", marginTop: 2 },

  rightHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  reportIconBtn: {
    height: 34,
    width: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff1f2",
    borderWidth: 1,
    borderColor: "#fecdd3",
  },
  ratingPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#fff7ed",
    borderWidth: 1,
    borderColor: "#fed7aa",
  },
  ratingText: { color: "#92400e", fontWeight: "800" },
  cardBody: { color: "#0f172a", fontSize: 15, marginTop: 6, marginBottom: 8 },

  cardFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  cardFootLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  iconStat: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 999, backgroundColor: "#f9fafb" },
  iconStatText: { fontSize: 11, fontWeight: "600", color: "#0f172a" },

  replyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#bae6fd",
    backgroundColor: "#eff6ff",
  },
  replyBtnText: { fontSize: 12, fontWeight: "600", color: "#0284c7" },

  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 36 },
  emptyText: { color: "#64748b", marginTop: 10, fontWeight: "600" },

  viewRepliesRow: { flexDirection: "row", alignItems: "center", marginTop: 6, marginLeft: 40, gap: 6 },
  viewRepliesLine: { width: 18, height: 1, backgroundColor: "#cbd5f5" },
  viewRepliesText: { fontSize: 12, color: "#2563eb", fontWeight: "500" },

  replyThreadContainer: { flexDirection: "row", marginTop: 6, marginLeft: 24 },
  threadBar: { width: 2, borderRadius: 999, backgroundColor: "#e5e7eb", marginRight: 8 },
  replyList: { flex: 1 },
  replyRow: { flexDirection: "row", alignItems: "flex-start", marginTop: 4 },
  replyAvatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#e5e7eb", marginRight: 6 },
  replyBubble: { flex: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "#f3f4f6" },
  replyHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 2 },
  replyName: { fontSize: 12, fontWeight: "700", color: "#0f172a" },
  replyMetaRight: { flexDirection: "row", alignItems: "center" },
  replyTime: { fontSize: 11, color: "#9ca3af" },
  replyText: { fontSize: 13, color: "#111827", marginTop: 2 },
  replyReportBtn: { marginLeft: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: "#fff1f2", borderWidth: 1, borderColor: "#fecdd3" },
  hideRepliesRow: { marginTop: 6 },
  hideRepliesText: { fontSize: 11, color: "#6b7280", fontWeight: "500" },

  // modals
  kav: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.45)", alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  modalContent: { width: "100%", maxWidth: 400, borderRadius: 16, padding: 16, backgroundColor: "#fff" },
  modalTitle: { fontSize: 16, fontWeight: "700", color: "#0f172a", marginBottom: 6 },
  modalOriginal: { fontSize: 13, color: "#475569", marginBottom: 8 },
  modalInput: { minHeight: 80, maxHeight: 150, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, textAlignVertical: "top", color: "#0f172a", marginBottom: 10 },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
  modalBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  modalBtnCancel: { backgroundColor: "#e5e7eb" },
  modalBtnSend: { backgroundColor: "#0ea5e9" },
  modalBtnCancelText: { fontSize: 13, fontWeight: "600", color: "#0f172a" },
  modalBtnSendText: { fontSize: 13, fontWeight: "600", color: "#f9fafb" },

  // report sheet
  menuBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.25)", justifyContent: "flex-end" },
  reportSheet: { backgroundColor: "#fff", padding: 16, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: "88%" },
  reportTitle: { fontSize: 18, fontWeight: "800", color: "#111827", marginBottom: 4 },
  reportSubtitle: { fontSize: 13, color: "#6b7280", marginBottom: 12 },
  reportRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
  reportRowTxt: { flex: 1, fontSize: 14, color: "#111827" },
  reportBtn: { marginTop: 12, backgroundColor: BLUE, borderRadius: 999, paddingVertical: 10, alignItems: "center" },
  reportBtnDisabled: { opacity: 0.5 },
  reportBtnTxt: { color: "#fff", fontWeight: "700", fontSize: 15 },
  reportOtherInput: { borderWidth: 1, borderColor: "#E5E7EB", backgroundColor: "#F9FAFB", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: "#111827", minHeight: 44, maxHeight: 120 },
  reportOtherMetaRow: { marginTop: 6, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  reportOtherCounter: { fontSize: 12, color: "#6b7280", fontWeight: "600" },
  reportOtherCounterBad: { color: "#ef4444" },
});
