// screens/food/SimilarItemCatalog.js
import React, {
  useMemo,
  useState,
  useEffect,
  useCallback,
} from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  Image,
  StyleSheet,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { DeviceEventEmitter } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import {
  DISPLAY_MENU_ENDPOINT as ENV_DISPLAY_MENU_ENDPOINT,
  DISPLAY_ITEM_ENDPOINT as ENV_DISPLAY_ITEM_ENDPOINT,
  MENU_IMAGE_ENDPOINT as ENV_MENU_IMAGE_ENDPOINT,
  ITEM_IMAGE_ENDPOINT as ENV_ITEM_IMAGE_ENDPOINT,
} from '@env';

import { styles as orderStyles } from './orderDetailsStyles';

const norm = (s = '') => String(s).toLowerCase().trim();

/* ---------------- helpers copied from MenuScreen ---------------- */
function getOrigin(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    const m = String(url).match(/^(https?:\/\/[^/]+)/i);
    return m ? m[1] : '';
  }
}

const sanitizePath = (p) =>
  String(p || '')
    .replace(/^\/uploads\/uploads\//i, '/uploads/')
    .replace(/([^:]\/)\/+/g, '$1');

const encodePathSegments = (p) =>
  String(p || '')
    .split('/')
    .map((seg) => (seg ? encodeURIComponent(seg) : ''))
    .join('/');

const absJoin = (base, raw) => {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;

  const baseNorm = String((base || '').replace(/\/+$/, ''));
  let path = s.startsWith('/') ? s : `/${s}`;

  if (/\/uploads$/i.test(baseNorm) && /^\/uploads\//i.test(path)) {
    path = path.replace(/^\/uploads/i, '');
  }

  const encodedPath = encodePathSegments(sanitizePath(path));
  return `${baseNorm}${encodedPath.startsWith('/') ? '' : '/'}${encodedPath}`.replace(
    /([^:]\/)\/+/g,
    '$1'
  );
};

const normalizeOwnerType = (v) => {
  const s = String(v ?? '').trim().toLowerCase();
  if (s === '2' || s === 'mart') return 'mart';
  if (s === '1' || s === 'food') return 'food';
  return s || 'food';
};

const extractItemsFromResponse = (raw) => {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.data)) return raw.data;

  for (const k of ['items', 'rows', 'result', 'payload', 'list', 'menus', 'menu']) {
    if (Array.isArray(raw?.[k])) return raw[k];
  }
  if (raw && typeof raw === 'object') {
    for (const v of Object.values(raw)) {
      if (Array.isArray(v)) return v;
    }
  }
  return [];
};

/* ---------------- main screen ---------------- */
export default function SimilarItemCatalog() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();

  const itemKey = route.params?.itemKey || '';
  const itemName = route.params?.itemName || '';
  const paramBusinessId = route.params?.businessId || null;
  const ownerTypeRaw = route.params?.owner_type ?? route.params?.ownerType ?? 'food';

  const ownerType = useMemo(
    () => normalizeOwnerType(ownerTypeRaw),
    [ownerTypeRaw]
  );
  const isMart = ownerType === 'mart';

  const [businessId] = useState(paramBusinessId);
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const IMAGE_BASE = useMemo(
    () =>
      String(
        (isMart ? ENV_ITEM_IMAGE_ENDPOINT : ENV_MENU_IMAGE_ENDPOINT) || ''
      ).replace(/\/+$/, ''),
    [isMart]
  );

  const DISPLAY_LIST_ENDPOINT = useMemo(
    () =>
      ((isMart ? ENV_DISPLAY_ITEM_ENDPOINT : ENV_DISPLAY_MENU_ENDPOINT) || '')
        .replace(/\/+$/, ''),
    [isMart]
  );

  const API_ORIGIN = useMemo(
    () => getOrigin(DISPLAY_LIST_ENDPOINT),
    [DISPLAY_LIST_ENDPOINT]
  );

  const buildListUrl = useCallback(() => {
    if (!DISPLAY_LIST_ENDPOINT || !businessId) return null;
    const base = DISPLAY_LIST_ENDPOINT.replace(/\/+$/, '');
    const service = isMart ? 'mart' : 'food';

    if (/\/business$/i.test(base)) {
      return `${base}/${encodeURIComponent(
        businessId
      )}?owner_type=${encodeURIComponent(service)}`;
    }
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}business_id=${encodeURIComponent(
      businessId
    )}&owner_type=${encodeURIComponent(service)}`;
  }, [DISPLAY_LIST_ENDPOINT, businessId, isMart]);

  const normalizeItem = useCallback(
    (x, idx = 0) => {
      const numericActual = Number(x?.actual_price);
      const numericBase = Number(x?.base_price);
      const price = Number.isFinite(numericActual)
        ? numericActual
        : Number.isFinite(numericBase)
          ? numericBase
          : typeof x?.price === 'number'
            ? x.price
            : Number(x?.price ?? 0);

      const rawImg =
        x?.image_url ?? x?.item_image_url ?? x?.item_image ?? x?.image ?? '';
      const absImage = absJoin(IMAGE_BASE || API_ORIGIN, rawImg);

      return {
        id: String(x?.id ?? x?._id ?? x?.menu_id ?? x?.item_id ?? idx),
        name: x?.item_name ?? x?.name ?? x?.title ?? 'Unnamed item',
        category: x?.category_name ?? x?.category ?? x?.categoryName ?? '',
        price,
        currency: x?.currency ?? 'Nu',
        image: absImage,
      };
    },
    [API_ORIGIN, IMAGE_BASE]
  );

  const fetchCatalog = useCallback(async () => {
    try {
      if (!DISPLAY_LIST_ENDPOINT) {
        setErrorMsg('Missing list endpoint in .env');
        return;
      }
      if (!businessId) {
        setErrorMsg('Missing businessId');
        return;
      }

      setLoading(true);
      setErrorMsg('');

      const token = (await SecureStore.getItemAsync('auth_token')) || '';
      const url = buildListUrl();
      if (!url) {
        setErrorMsg('Could not build catalog URL');
        return;
      }

      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const text = await res.text();
      let parsed;
      try {
        parsed = text ? JSON.parse(text) : [];
      } catch {
        parsed = [];
      }

      if (!res.ok) {
        setErrorMsg(
          parsed?.message ||
            parsed?.error ||
            `Failed to load catalog (HTTP ${res.status})`
        );
        return;
      }

      const list = extractItemsFromResponse(parsed).map((x, i) =>
        normalizeItem(x, i)
      );
      setCatalog(list);
    } catch (e) {
      setErrorMsg(String(e?.message || 'Failed to load catalog.'));
    } finally {
      setLoading(false);
    }
  }, [DISPLAY_LIST_ENDPOINT, businessId, buildListUrl, normalizeItem]);

  useEffect(() => {
    fetchCatalog();
  }, [fetchCatalog]);

  // keywords from existing item name
  const keywords = useMemo(
    () =>
      norm(itemName)
        .split(/[\s\-]+/)
        .map((w) => w.trim())
        .filter((w) => w.length > 1),
    [itemName]
  );

  // filter only real items that match the existing name keywords
  const suggestions = useMemo(() => {
    if (!keywords.length) return [];

    const uniq = new Set();
    const out = [];

    catalog.forEach((it) => {
      const nm = norm(it.name || '');
      if (!nm) return;

      const match = keywords.some((kw) => nm.includes(kw));
      if (!match) return;

      if (!uniq.has(it.id)) {
        uniq.add(it.id);
        out.push(it);
      }
    });

    return out;
  }, [catalog, keywords]);

  const onSelect = (item) => {
    // Send choice back to OrderDetails through DeviceEventEmitter
    DeviceEventEmitter.emit('similar-item-chosen', {
      itemKey,
      replacement: {
        name: item.name,
        price: item.price,
        currency: item.currency,
        id: item.id,
      },
    });
    navigation.goBack();
  };

  const headerTopPad = Math.max(insets.top, 8) + 18;

  return (
    <SafeAreaView style={orderStyles.safe} edges={['left', 'right', 'bottom']}>
      {/* Header */}
      <View style={[orderStyles.headerBar, { paddingTop: headerTopPad }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={orderStyles.backBtn}
          hitSlop={8}
        >
          <Ionicons name="arrow-back" size={22} color="#0f172a" />
        </Pressable>
        <Text style={orderStyles.headerTitle}>Similar items</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={{ padding: 16, flex: 1 }}>
        <Text style={[orderStyles.segmentHint, { marginBottom: 12 }]}>
          Original item: {itemName || 'Item'}
        </Text>
        <Text style={[orderStyles.segmentHint, { marginBottom: 8 }]}>
          Choose a similar item to replace the unavailable one.
        </Text>

        {loading ? (
          <View style={localStyles.centerBox}>
            <ActivityIndicator />
            <Text style={localStyles.centerText}>Loading catalog…</Text>
          </View>
        ) : errorMsg ? (
          <View style={localStyles.centerBox}>
            <Ionicons name="warning-outline" size={24} color="#ef4444" />
            <Text style={[localStyles.centerText, { color: '#ef4444', marginTop: 6 }]}>
              {errorMsg}
            </Text>
          </View>
        ) : (
          <FlatList
            data={suggestions}
            keyExtractor={(it) => String(it.id)}
            numColumns={2}
            columnWrapperStyle={{ gap: 8, marginBottom: 8 }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => onSelect(item)}
                style={localStyles.card}
              >
                {item.image ? (
                  <Image
                    source={{ uri: item.image }}
                    style={localStyles.thumb}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[localStyles.thumb, localStyles.thumbFallback]}>
                    <Ionicons name="image-outline" size={18} color="#64748b" />
                  </View>
                )}
                <Text
                  style={localStyles.cardTitle}
                  numberOfLines={2}
                >
                  {item.name}
                </Text>
                {!!item.category && (
                  <Text
                    style={localStyles.cardMeta}
                    numberOfLines={1}
                  >
                    {item.category}
                  </Text>
                )}
                <Text style={localStyles.cardPrice}>
                  {`${item.currency || 'Nu'} ${Number(item.price || 0).toFixed(2)}`}
                </Text>
                <Text style={localStyles.cardHint}>
                  Tap to use this as replacement.
                </Text>
              </Pressable>
            )}
            ListEmptyComponent={
              <Text style={[orderStyles.segmentHint, { marginTop: 16 }]}>
                No similar suggestions found using this item name.  
                You may update the order manually.
              </Text>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

/* ---------------- local styles ---------------- */
const localStyles = StyleSheet.create({
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 24,
  },
  centerText: {
    marginTop: 4,
    color: '#64748b',
    fontSize: 14,
  },
  card: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  thumb: {
    width: '100%',
    height: 80,
    borderRadius: 10,
    backgroundColor: '#e2e8f0',
    marginBottom: 6,
  },
  thumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  cardMeta: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 2,
  },
  cardPrice: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 4,
  },
  cardHint: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 4,
  },
});
