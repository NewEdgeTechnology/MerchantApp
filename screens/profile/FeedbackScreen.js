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
import { FEEDBACK_ENDPOINT, FEEDBACK_REPLY_ENDPOINT } from '@env';

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

function absoluteUrl(pathOrUrl, base) {
  if (!pathOrUrl) return '';
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  try {
    const m = /^https?:\/\/[^/]+/i.exec(base || '');
    const origin = m ? m[0] : '';
    const p = String(pathOrUrl).startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
    return `${origin}${p}`;
  } catch {
    return pathOrUrl;
  }
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

/* ---- get access token from SecureStore (matches LoginScreen) ---- */
const KEY_AUTH_TOKEN = 'auth_token';
const KEY_MERCHANT_LOGIN = 'merchant_login';

async function getAccessTokenFromStore() {
  try {
    // 1) direct access token string
    const direct = await SecureStore.getItemAsync(KEY_AUTH_TOKEN);
    if (direct && String(direct).trim()) {
      return String(direct).trim();
    }

    // 2) token inside merchant_login JSON
    const raw = await SecureStore.getItemAsync(KEY_MERCHANT_LOGIN);
    if (!raw) return '';
    const parsed = JSON.parse(raw);

    const t = parsed?.token;
    if (!t) return '';

    if (typeof t === 'string') return String(t).trim();
    if (t && typeof t.access_token === 'string') return String(t.access_token).trim();

    return '';
  } catch (e) {
    console.log('[Feedback] getAccessToken error', e);
    return '';
  }
}

/* ---------- component ---------- */
export default function RestaurantFeedbackScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const authContext = route?.params?.authContext || null; // 👈 from AccountSettings / Home

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
  const [debugUrl, setDebugUrl] = useState('');
  const alerted = useRef(false);

  // reply state
  const [replyModalVisible, setReplyModalVisible] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replyingItem, setReplyingItem] = useState(null);
  const [postingReply, setPostingReply] = useState(false);

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
      setDebugUrl(url);

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

      const notificationId = replyingItem.id;
      if (!notificationId) throw new Error('Missing notification_id');

      // build URL from FEEDBACK_REPLY_ENDPOINT env
      let url = FEEDBACK_REPLY_ENDPOINT || '';
      url = url.replace(
        /\{notification_id\}/gi,
        encodeURIComponent(String(notificationId))
      );
      url = normalizeHostLoose(url);

      // 🔑 1st: try token from authContext, 2nd: SecureStore fallback
      let token = authContext?.token;
      if (!token) {
        token = await getAccessTokenFromStore();
      }

      if (!token) {
        throw new Error('Missing access token');
      }

      // Normalise Bearer prefix so we never send "Bearer Bearer ..."
      const trimmed = String(token).trim();
      const authHeader = /^bearer\s/i.test(trimmed)
        ? trimmed
        : `Bearer ${trimmed}`;

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
      load(); // refresh list
    } catch (e) {
      console.error('[Feedback] reply error', e);
      Alert.alert('Reply failed', e?.message || 'Failed to send reply.');
    } finally {
      setPostingReply(false);
    }
  }, [replyText, replyingItem, load, authContext?.token]);

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
    const avatar = absoluteUrl(item.profile_image, debugUrl || endpointTpl);
    return (
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <View style={styles.userRow}>
            <Image
              source={{ uri: avatar }}
              style={styles.avatar}
              resizeMode="cover"
            />
            <Text style={styles.userName} numberOfLines={1}>
              {item.user_name}
            </Text>
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
          {created ? (
            <Text style={styles.cardTime}>{created.toLocaleString()}</Text>
          ) : (
            <View />
          )}
          <View style={styles.cardFootRight}>
            {item.owner_type ? (
              <Text style={styles.cardMeta}>
                {String(item.owner_type).toUpperCase()}
              </Text>
            ) : null}
            <TouchableOpacity
              style={styles.replyBtn}
              activeOpacity={0.7}
              onPress={() => openReplyModal(item)}
            >
              <Ionicons
                name="chatbox-ellipses-outline"
                size={16}
                color="#0284c7"
              />
              <Text style={styles.replyBtnText}>Reply</Text>
            </TouchableOpacity>
          </View>
        </View>
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
  cardBody: { color: '#0f172a', fontSize: 15, marginTop: 2, marginBottom: 8 },
  cardFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTime: { color: '#64748b', fontSize: 12 },
  cardMeta: { color: '#64748b', fontSize: 12, fontWeight: '600' },
  cardFootRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  replyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
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
