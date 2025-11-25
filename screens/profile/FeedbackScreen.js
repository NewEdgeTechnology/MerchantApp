import React, {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
} from 'react';
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
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import {
  FEEDBACK_ENDPOINT,
  FEEDBACK_REPLY_ENDPOINT,
  FEEDBACK_REPLY_DELETE_ENDPOINT,
  PROFILE_IMAGE as PROFILE_IMAGE_ENDPOINT,
  MEDIA_BASE_URL,
} from '@env';

/* ---------- helpers (no URL() so braces won't be encoded) ---------- */
function normalizeHostLoose(url) {
  if (!url) return '';
  let out = String(url).replace('/marchant/', '/merchant/');
  if (Platform.OS === 'android') {
    out = out
      .replace('://localhost', '://10.0.2.2')
      .replace('://127.0.0.1', '://10.0.2.2');
  }
  return out;
}

async function fetchJSON(url, options = {}, timeoutMs = 15000) {
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
        (json && (json.error || json.message)) ||
        text ||
        `HTTP ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return json;
  } finally {
    clearTimeout(tid);
  }
}

/* ---- token helpers: fetch from login info ---- */
const KEY_AUTH_TOKEN = 'auth_token';
const KEY_MERCHANT_LOGIN = 'merchant_login';

async function getAccessTokenFromStore() {
  try {
    const raw = await SecureStore.getItemAsync(KEY_MERCHANT_LOGIN);
    if (raw) {
      const parsed = JSON.parse(raw);

      if (parsed?.token?.access_token) {
        return String(parsed.token.access_token).trim();
      }

      if (typeof parsed?.token === 'string') {
        return String(parsed.token).trim();
      }
    }

    const direct = await SecureStore.getItemAsync(KEY_AUTH_TOKEN);
    if (direct) return String(direct).trim();

    return '';
  } catch (e) {
    console.log('TOKEN ERROR', e);
    return '';
  }
}

/* ---------- profile image endpoint helpers ---------- */

const DEFAULT_AVATAR =
  'https://images.unsplash.com/photo-1612198182421-3f5dff0c9b40?q=80&w=400&auto=format&fit=crop';

const PROFILE_BASE = normalizeHostLoose(
  String(PROFILE_IMAGE_ENDPOINT || MEDIA_BASE_URL || '').replace(/\/+$/, '')
);

const FEEDBACK_ORIGIN = (() => {
  try {
    const m = /^https?:\/\/[^/]+/i.exec(FEEDBACK_ENDPOINT || '');
    return m ? normalizeHostLoose(m[0]) : '';
  } catch {
    return '';
  }
})();

function buildProfileImageUrl(rawProfilePath) {
  if (!rawProfilePath) return DEFAULT_AVATAR;

  const raw = String(rawProfilePath).trim();
  if (/^https?:\/\//i.test(raw)) {
    return normalizeHostLoose(raw);
  }

  const path = raw.startsWith('/') ? raw : `/${raw}`;

  if (PROFILE_BASE) {
    return `${PROFILE_BASE}${path}`;
  }

  if (FEEDBACK_ORIGIN) {
    return `${FEEDBACK_ORIGIN}${path}`;
  }

  return DEFAULT_AVATAR;
}

/* ---------- component ---------- */
export default function RestaurantFeedbackScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const authContext = route?.params?.authContext || null;

  const businessName = route?.params?.business_name || '';
  const businessIdRaw = route?.params?.business_id;
  const businessIdStr = String(businessIdRaw ?? '').trim();
  const businessIdNum = Number.isInteger(businessIdRaw)
    ? businessIdRaw
    : /^\d+$/.test(businessIdStr)
    ? parseInt(businessIdStr, 10)
    : NaN;

  const endpointTpl = useMemo(
    () => normalizeHostLoose(FEEDBACK_ENDPOINT || ''),
    []
  );

  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const alerted = useRef(false);

  // reply state
  const [replyModalVisible, setReplyModalVisible] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replyingItem, setReplyingItem] = useState(null);
  const [postingReply, setPostingReply] = useState(false);

  // which rating IDs have their replies expanded (like “View X replies”)
  const [expandedReplies, setExpandedReplies] = useState({}); // { [ratingId]: true }

  const buildUrl = useCallback(() => {
    if (!Number.isInteger(businessIdNum) || businessIdNum <= 0) return '';
    let base = endpointTpl;
    base = base
      .replace(/\{business_id\}/gi, String(businessIdNum))
      .replace(/%7Bbusiness_id%7D/gi, String(businessIdNum));
    if (/\/ratings\/?$/i.test(base) && !/\/\d+(\?|$)/.test(base)) {
      base = base.replace(
        /\/?$/,
        `/${encodeURIComponent(String(businessIdNum))}`
      );
    }
    return base;
  }, [endpointTpl, businessIdNum]);

  const load = useCallback(async () => {
    if (!Number.isInteger(businessIdNum) || businessIdNum <= 0) {
      if (!alerted.current) {
        alerted.current = true;
        Alert.alert('Feedback', 'Missing or invalid business_id.');
      }
      return;
    }

    try {
      setLoading(true);
      const url = buildUrl();

      const payload = await fetchJSON(url);

      const listRaw = Array.isArray(payload)
        ? payload
        : payload?.data || payload?.items || [];

      const mapped = listRaw.map((it, idx) => ({
        id: it.id ?? `${it.user?.user_id || 'u'}_${idx}`,
        rating: it.rating,
        comment: it.comment,
        created_at: it.created_at || it.createdAt || null,
        user_name: it.user?.user_name || 'Anonymous',
        profile_image: it.user?.profile_image || '',
        owner_type: it.owner_type || null,
        business_id: it.business_id || null,
        likes_count: it.likes_count ?? 0,
        reply_count:
          it.reply_count ?? (Array.isArray(it.replies) ? it.replies.length : 0),
        replies: Array.isArray(it.replies) ? it.replies : [],
      }));

      setMeta(Array.isArray(payload) ? null : payload?.meta || null);
      setItems(mapped);
    } catch (e) {
      if (!alerted.current) {
        alerted.current = true;
        const msg = e?.message || 'Load failed';
        Alert.alert('Load failed', msg);
      }
      console.error('[Feedback] load error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setInitialLoad(false);
    }
  }, [businessIdNum, buildUrl]);

  useEffect(() => {
    setItems([]);
    setMeta(null);
    setInitialLoad(true);
    alerted.current = false;
    load();
  }, [businessIdNum, endpointTpl, load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  /* ---------- reply helpers ---------- */

  const openReplyModal = useCallback((item) => {
    setReplyingItem(item);
    setReplyText('');
    setReplyModalVisible(true);
  }, []);

  const closeReplyModal = useCallback(() => {
    if (postingReply) return;
    setReplyModalVisible(false);
    setReplyText('');
    setReplyingItem(null);
  }, [postingReply]);

  const submitReply = useCallback(async () => {
    if (!replyText.trim()) {
      Alert.alert('Reply', 'Please enter a reply first.');
      return;
    }
    if (!replyingItem) return;

    try {
      setPostingReply(true);

      // rating id = notification_id in this endpoint
      const notificationId = replyingItem.id;
      if (!notificationId) throw new Error('Missing notification_id (rating id)');

      // detect owner_type to switch /ratings/food/ -> /ratings/mart/ etc.
      const ownerType = String(replyingItem.owner_type || 'food').toLowerCase();

      // FEEDBACK_REPLY_ENDPOINT example:
      // http://grab.newedge.bt/merchant/api/merchant/ratings/food/{notification_id}/replies
      let url = FEEDBACK_REPLY_ENDPOINT || '';

      // 1) if template has {owner_type}, fill it
      if (/\{owner_type\}/i.test(url) || /%7Bowner_type%7D/i.test(url)) {
        url = url
          .replace(/\{owner_type\}/gi, ownerType)
          .replace(/%7Bowner_type%7D/gi, ownerType);
      } else {
        // 2) otherwise, replace hard-coded segment /ratings/food/ with ownerType
        url = url.replace(
          /\/ratings\/(food|mart|ride|parcel)\//i,
          `/ratings/${ownerType}/`
        );
      }

      // now inject rating id
      url = url
        .replace(
          /\{notification_id\}/gi,
          encodeURIComponent(String(notificationId))
        )
        .replace(
          /%7Bnotification_id%7D/gi,
          encodeURIComponent(String(notificationId))
        );

      url = normalizeHostLoose(url);

      if (/^http:\/\//i.test(url) && /grab\.newedge\.bt/i.test(url)) {
        url = url.replace(/^http:/i, 'https:');
      }

      // token from authContext first, then from secure store
      let token =
        authContext?.token ||
        (await getAccessTokenFromStore());

      if (!token) {
        throw new Error('Missing access token from login info.');
      }

      // ensure "Bearer <token>"
      const bare = String(token).replace(/^Bearer\s+/i, '').trim();
      const authHeader = `Bearer ${bare}`;

      await fetchJSON(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
        },
        body: JSON.stringify({ text: replyText.trim() }),
      });

      Alert.alert('Reply sent', 'Your reply has been posted.');
      setReplyModalVisible(false);
      setReplyText('');
      setReplyingItem(null);
      load();
    } catch (e) {
      console.error('[Feedback] reply error', e);
      Alert.alert('Reply failed', e?.message || 'Failed to send reply.');
    } finally {
      setPostingReply(false);
    }
  }, [replyText, replyingItem, load, authContext?.token]);

  /* ---------- delete reply helper ---------- */

  const handleDeleteReply = useCallback(
    async (reply) => {
      if (!reply?.id) return;

      Alert.alert(
        'Delete reply',
        'Are you sure you want to delete this reply?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                const replyId = reply.id;

                let url = FEEDBACK_REPLY_DELETE_ENDPOINT || '';
                url = url
                  .replace(
                    /\{reply_id\}/gi,
                    encodeURIComponent(String(replyId))
                  )
                  .replace(
                    /%7Breply_id%7D/gi,
                    encodeURIComponent(String(replyId))
                  );

                url = normalizeHostLoose(url);

                if (/^http:\/\//i.test(url) && /grab\.newedge\.bt/i.test(url)) {
                  url = url.replace(/^http:/i, 'https:');
                }

                let token =
                  authContext?.token ||
                  (await getAccessTokenFromStore());

                if (!token) {
                  throw new Error('Missing access token from login info.');
                }

                const bare = String(token).replace(/^Bearer\s+/i, '').trim();
                const authHeader = `Bearer ${bare}`;

                await fetchJSON(url, {
                  method: 'DELETE',
                  headers: {
                    Authorization: authHeader,
                  },
                });

                load();
              } catch (e) {
                console.error('[Feedback] delete reply error', e);
                Alert.alert(
                  'Delete failed',
                  e?.message || 'Failed to delete reply.'
                );
              }
            },
          },
        ]
      );
    },
    [authContext?.token, load]
  );

  const renderHeader = () => {
    if (!meta?.totals) return null;
    const t = meta.totals;
    return (
      <View>
        <View className={styles.summary}>
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
    const repliesCount =
      item.reply_count ?? (Array.isArray(item.replies) ? item.replies.length : 0);

    const hasReplies =
      Array.isArray(item.replies) && item.replies.length > 0;
    const expanded = !!expandedReplies[item.id];

    const toggleExpand = () => {
      setExpandedReplies((prev) => ({
        ...prev,
        [item.id]: !prev[item.id],
      }));
    };

    return (
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <View style={styles.userRow}>
            <Image
              source={{ uri: avatar }}
              style={styles.avatar}
              resizeMode="cover"
            />
            <View>
              <Text style={styles.userName} numberOfLines={1}>
                {item.user_name}
              </Text>
              {created ? (
                <Text style={styles.cardTimeSmall}>
                  {created.toLocaleDateString()}
                </Text>
              ) : null}
            </View>
          </View>
          <View style={styles.ratingPill}>
            <Ionicons name="star" size={14} color="#f59e0b" />
            <Text style={styles.ratingText}>
              {Number(item.rating ?? 0)}/5
            </Text>
          </View>
        </View>

        {item.comment ? (
          <Text style={styles.cardBody}>{item.comment}</Text>
        ) : null}

        <View style={styles.cardFoot}>
          <View style={styles.cardFootLeft}>
            <View style={styles.iconStat}>
              <Ionicons name="heart-outline" size={14} color="#ef4444" />
              <Text style={styles.iconStatText}>{likesCount}</Text>
            </View>
            <View style={styles.iconStat}>
              <Ionicons
                name="chatbubble-ellipses-outline"
                size={14}
                color="#0ea5e9"
              />
              <Text style={styles.iconStatText}>{repliesCount}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.replyBtn}
            activeOpacity={0.7}
            onPress={() => openReplyModal(item)}
          >
            <Ionicons
              name="arrow-undo-outline"
              size={16}
              color="#0284c7"
            />
            <Text style={styles.replyBtnText}>Reply</Text>
          </TouchableOpacity>
        </View>

        {/* "View X replies" / "Hide replies" like other apps */}
        {hasReplies && !expanded && (
          <TouchableOpacity
            style={styles.viewRepliesRow}
            activeOpacity={0.7}
            onPress={toggleExpand}
          >
            <View style={styles.viewRepliesLine} />
            <Text style={styles.viewRepliesText}>
              View {item.replies.length}{' '}
              {item.replies.length === 1 ? 'reply' : 'replies'}
            </Text>
          </TouchableOpacity>
        )}

        {hasReplies && expanded && (
          <View style={styles.replyThreadContainer}>
            <View style={styles.threadBar} />
            <View style={styles.replyList}>
              {item.replies.map((rep) => {
                const rAvatar = buildProfileImageUrl(rep.user?.profile_image);
                const rName = rep.user?.user_name || 'You';
                const ago =
                  rep.hours_ago === 0
                    ? 'Just now'
                    : rep.hours_ago != null
                    ? `${rep.hours_ago}h ago`
                    : '';
                return (
                  <View key={rep.id} style={styles.replyRow}>
                    <Image
                      source={{ uri: rAvatar }}
                      style={styles.replyAvatar}
                      resizeMode="cover"
                    />
                    <View style={styles.replyBubble}>
                      <View style={styles.replyHeaderRow}>
                        <Text style={styles.replyName}>{rName}</Text>
                        <View style={styles.replyMetaRight}>
                          {!!ago && (
                            <Text style={styles.replyTime}>{ago}</Text>
                          )}
                          <Ionicons
                            name="checkmark-done-outline"
                            size={14}
                            color="#22c55e"
                            style={{ marginLeft: 4 }}
                          />
                          {/* delete icon */}
                          <TouchableOpacity
                            style={{ marginLeft: 8 }}
                            onPress={() => handleDeleteReply(rep)}
                          >
                            <Ionicons
                              name="trash-outline"
                              size={14}
                              color="#ef4444"
                            />
                          </TouchableOpacity>
                        </View>
                      </View>
                      <Text style={styles.replyText}>{rep.text}</Text>
                    </View>
                  </View>
                );
              })}

              <TouchableOpacity
                style={styles.hideRepliesRow}
                onPress={toggleExpand}
              >
                <Text style={styles.hideRepliesText}>Hide replies</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { paddingTop: Math.max(insets.top, 8) + 18 },
        ]}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={22} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.title}>
          {businessName ? `${businessName} Feedback` : 'Feedback'}
        </Text>
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
              <Ionicons
                name="mail-open-outline"
                size={36}
                color="#94a3b8"
              />
              <Text style={styles.emptyText}>No feedback yet.</Text>
            </View>
          ) : null
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListFooterComponent={
          loading ? (
            <View style={{ paddingVertical: 16 }}>
              <ActivityIndicator />
            </View>
          ) : null
        }
      />

      {/* Reply modal */}
      <Modal
        visible={replyModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeReplyModal}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
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
                {postingReply ? (
                  <ActivityIndicator size="small" />
                ) : (
                  <Text style={styles.modalBtnSendText}>Send</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* ---------- styles ---------- */
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  header: {
    minHeight: 52,
    paddingHorizontal: 12,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomColor: '#e2e8f0',
    borderBottomWidth: 1,
    backgroundColor: '#fff',
  },
  backBtn: {
    height: 40,
    width: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
  },
  listPad: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10 },
  summary: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 12,
    marginVertical: 6,
    backgroundColor: '#f8fafc',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  summaryScore: { fontWeight: '800', color: '#0f172a' },
  summaryText: { color: '#475569' },
  card: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 12,
    marginVertical: 6,
    backgroundColor: '#fff',
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#e5e7eb' },
  userName: { color: '#0f172a', fontWeight: '700', flexShrink: 1 },
  cardTimeSmall: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  ratingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fed7aa',
  },
  ratingText: { color: '#92400e', fontWeight: '800' },
  cardBody: { color: '#0f172a', fontSize: 15, marginTop: 6, marginBottom: 8 },
  cardFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  cardFootLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardTime: { color: '#64748b', fontSize: 12 },
  iconStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#f9fafb',
  },
  iconStatText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0f172a',
  },
  replyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#bae6fd',
    backgroundColor: '#eff6ff',
  },
  replyBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0284c7',
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
  },
  emptyText: { color: '#64748b', marginTop: 10, fontWeight: '600' },

  // "view replies" row (collapsed state)
  viewRepliesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    marginLeft: 40,
    gap: 6,
  },
  viewRepliesLine: {
    width: 18,
    height: 1,
    backgroundColor: '#cbd5f5',
  },
  viewRepliesText: {
    fontSize: 12,
    color: '#2563eb',
    fontWeight: '500',
  },

  // replies thread (expanded)
  replyThreadContainer: {
    flexDirection: 'row',
    marginTop: 6,
    marginLeft: 24,
  },
  threadBar: {
    width: 2,
    borderRadius: 999,
    backgroundColor: '#e5e7eb',
    marginRight: 8,
  },
  replyList: {
    flex: 1,
  },
  replyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 4,
  },
  replyAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#e5e7eb',
    marginRight: 6,
  },
  replyBubble: {
    flex: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#f3f4f6',
  },
  replyHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  replyName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
  },
  replyMetaRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  replyTime: {
    fontSize: 11,
    color: '#9ca3af',
  },
  replyText: {
    fontSize: 13,
    color: '#111827',
    marginTop: 2,
  },
  hideRepliesRow: {
    marginTop: 6,
  },
  hideRepliesText: {
    fontSize: 11,
    color: '#6b7280',
    fontWeight: '500',
  },

  // modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    padding: 16,
    backgroundColor: '#fff',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 6,
  },
  modalOriginal: {
    fontSize: 13,
    color: '#475569',
    marginBottom: 8,
  },
  modalInput: {
    minHeight: 80,
    maxHeight: 150,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    textAlignVertical: 'top',
    color: '#0f172a',
    marginBottom: 10,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  modalBtnCancel: {
    backgroundColor: '#e5e7eb',
  },
  modalBtnSend: {
    backgroundColor: '#0ea5e9',
  },
  modalBtnCancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
  },
  modalBtnSendText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#f9fafb',
  },
});
