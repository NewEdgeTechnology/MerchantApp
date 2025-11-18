// screens/food/HomeTab.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  BackHandler,
  Platform,
  ActivityIndicator,
  Pressable,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect, useRoute } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import {
  DISPLAY_MENU_ENDPOINT as ENV_DISPLAY_MENU_ENDPOINT,
  DISPLAY_ITEM_ENDPOINT as ENV_DISPLAY_ITEM_ENDPOINT,
  BANNERS_ENDPOINT as ENV_BANNERS_ENDPOINT,
  BANNERS_BY_BUSINESS_ENDPOINT as ENV_BANNERS_BY_BUSINESS_ENDPOINT,
  BANNERS_IMAGE_ENDPOINT as ENV_BANNERS_IMAGE_ENDPOINT,
  MENU_IMAGE_ENDPOINT as ENV_MENU_IMAGE_ENDPOINT,
  ITEM_IMAGE_ENDPOINT as ENV_ITEM_IMAGE_ENDPOINT,
  ORDER_ENDPOINT as ENV_ORDER_ENDPOINT,
} from '@env';

/* ---------------- constants for Quick Actions ---------------- */
const KEY_QUICK_ACTIONS = 'quick_actions_v1';
const ALL_ACTIONS = [
  { key: 'menu', icon: 'restaurant-outline', label: 'Menu' },
  { key: 'promos', icon: 'pricetags-outline', label: 'Promotions' },
  { key: 'payouts', icon: 'card-outline', label: 'Payouts' },
  { key: 'settings', icon: 'settings-outline', label: 'Settings' },
  { key: 'orders', icon: 'receipt-outline', label: 'Orders' },
  { key: 'addItem', icon: 'add-circle-outline', label: 'Add item' },
];
const DEFAULT_ACTIONS = ['menu', 'promos', 'payouts', 'settings'];

/* ---------------- order status meta (match OrdersTab) ---------------- */
const BASE_STATUS_LABELS = [
  { key: 'PENDING', label: 'Pending' },
  { key: 'CONFIRMED', label: 'Confirmed' },
  { key: 'PREPARING', label: 'Preparing' }, // hidden for Mart
  { key: 'READY', label: 'Ready' },
  { key: 'OUT_FOR_DELIVERY', label: 'Out for delivery' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'REJECTED', label: 'Rejected' },
];

/* ---------------- Small UI bits ---------------- */
const KpiCard = ({ icon, label, value, sub, isTablet }) => {
  const size = isTablet ? 40 : 36;
  return (
    <View style={[styles.kpiCard, { width: isTablet ? '23.5%' : '48%' }]}>
      <View style={[styles.kpiIconWrap, { width: size, height: size, borderRadius: size / 2 }]}>
        <Ionicons name={icon} size={isTablet ? 20 : 18} color="#0f172a" />
      </View>
      <Text style={[styles.kpiLabel, { fontSize: isTablet ? 13 : 12 }]}>{label}</Text>
      <Text style={[styles.kpiValue, { fontSize: isTablet ? 22 : 20 }]}>{value}</Text>
      {!!sub && <Text style={[styles.kpiSub, { fontSize: isTablet ? 12 : 11 }]}>{sub}</Text>}
    </View>
  );
};

const Shortcut = ({ icon, label, onPress = () => {}, isTablet }) => (
  <TouchableOpacity style={styles.shortcut} onPress={onPress} activeOpacity={0.9}>
    <View style={styles.shortcutIcon}>
      <Ionicons name={icon} size={isTablet ? 22 : 20} color="#0f172a" />
    </View>
    <Text style={[styles.shortcutText, { fontSize: isTablet ? 13 : 12 }]}>{label}</Text>
  </TouchableOpacity>
);

const StatusChip = ({ label, count = 0, onPress, active = false }) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.8}
    style={[styles.statusChip, active && styles.statusChipActive]}
    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
  >
    <Text style={[styles.statusChipText, active && styles.statusChipTextActive]}>{label}</Text>
    <View style={[styles.badge, active && styles.badgeActive]}>
      <Text style={[styles.badgeText, active && styles.badgeTextActive]}>{count}</Text>
    </View>
  </TouchableOpacity>
);

// Menu/Item card
const MenuItem = ({ item, isTablet, money, onPress = () => {} }) => {
  const price =
    typeof item?.price === 'number'
      ? money(item.price, item.currency || 'Nu')
      : item?.price ?? '';
  const inStock = item?.inStock ?? true;
  const cat = item?.category || item?.categoryName || '';

  return (
    <Pressable
      onPress={() => onPress(item)}
      style={styles.menuCard}
      android_ripple={{ color: 'rgba(0,0,0,0.06)', borderless: false }}
    >
      {item?.image ? (
        <Image
          source={{ uri: item.image }}
          style={styles.menuThumb}
          onError={(e) => {
            console.warn('[MenuItem] Image failed:', item.image, e?.nativeEvent?.error);
          }}
        />
      ) : (
        <View style={[styles.menuThumb, styles.menuThumbFallback]}>
          <Ionicons name="image-outline" size={18} color="#64748b" />
        </View>
      )}

      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={[styles.menuTitle, { fontSize: isTablet ? 15 : 14 }]}>
          {item?.name || item?.title || 'Unnamed item'}
        </Text>
        {!!cat && (
          <Text numberOfLines={1} style={[styles.menuMeta, { fontSize: isTablet ? 12 : 11 }]}>
            {cat}
          </Text>
        )}
        {!!price && <Text style={[styles.menuPrice, { fontSize: isTablet ? 14 : 13 }]}>{price}</Text>}
      </View>

      {Number(item?.discount) > 0 && (
        <View style={[styles.badge, { backgroundColor: '#fde68a', marginLeft: 8 }]}>
          <Text style={[styles.badgeText, { color: '#92400e' }]}>{`${Math.round(
            Number(item.discount)
          )}% OFF`}</Text>
        </View>
      )}

      <View style={[styles.stockPill, { backgroundColor: inStock ? '#dcfce7' : '#fee2e2' }]}>
        <Text
          style={[
            styles.stockText,
            { color: inStock ? '#166534' : '#991b1b', fontSize: isTablet ? 12 : 11 },
          ]}
        >
          {inStock ? 'In stock' : 'Out of stock'}
        </Text>
      </View>
    </Pressable>
  );
};

const BannerItem = ({ b, isTablet }) => {
  const img = b.image || '';
  const inactive =
    Number(b.is_active) !== 1 ||
    (b?.end_date ? String(b.end_date).slice(0, 10) <= new Date().toISOString().slice(0, 10) : false);

  return (
    <View style={styles.bannerCard}>
      {img ? (
        <Image
          source={{ uri: img }}
          style={styles.bannerThumb}
          onError={(e) => console.warn('[Banner] Image failed:', img, e?.nativeEvent?.error)}
        />
      ) : (
        <View style={[styles.bannerThumb, styles.menuThumbFallback]}>
          <Ionicons name="image-outline" size={18} color="#64748b" />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={[styles.bannerTitle, { fontSize: isTablet ? 15 : 14 }]}>
          {b.title || '—'}
        </Text>
        {!!b.description && (
          <Text numberOfLines={2} style={[styles.bannerDesc, { fontSize: isTablet ? 12 : 11 }]}>
            {b.description}
          </Text>
        )}
        <Text numberOfLines={1} style={[styles.bannerDates, { fontSize: isTablet ? 12 : 11 }]}>
          {(b.start_date || '').slice(0, 10) || '—'} → {(b.end_date || '').slice(0, 10) || '—'}
        </Text>
      </View>
      <View style={[styles.badge, { backgroundColor: inactive ? '#f3f4f6' : '#e8f5e9', marginLeft: 8 }]}>
        <Text
          style={[
            styles.badgeText,
            { color: inactive ? '#334155' : '#166534', fontSize: isTablet ? 12 : 11 },
          ]}
        >
          {inactive ? 'Inactive' : 'Active'}
        </Text>
      </View>
    </View>
  );
};

/* ---------------- Utils ---------------- */
const normalizeHost = (url) => {
  if (!url) return '';
  try {
    const u = new URL(url);
    if (Platform.OS === 'android' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) {
      u.hostname = '10.0.2.2';
    }
    return u.toString();
  } catch {
    if (/^https?:\/\//i.test(url)) return url;
    return url;
  }
};

async function getStoredOwnerId() {
  try {
    const raw = await SecureStore.getItemAsync('merchant_login');
    if (!raw) return '';
    const json = JSON.parse(raw);
    const candidates = [
      json?.user?.id,
      json?.merchant?.id,
      json?.merchant_id,
      json?.owner_id,
      json?.id,
    ];
    const found = candidates.find(
      (v) => v !== undefined && v !== null && String(v).trim() !== ''
    );
    return found ? String(found) : '';
  } catch {
    return '';
  }
}

const normalizeOwnerType = (v) => {
  const s = String(v ?? '').trim().toLowerCase();
  if (s === '2' || s === 'mart') return 'mart';
  if (s === '1' || s === 'food') return 'food';
  return s || 'food';
};

/* ---------------- KPI helpers ---------------- */
const toNumber = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const isTodayLocal = (iso) => {
  if (!iso) return false;
  const d = new Date(iso);
  const n = new Date();
  return (
    d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate()
  );
};
const normalizeBusinessId = (v) => {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower === 'null' || lower === 'undefined') return null;
  return s;
};
const isValidBusinessId = (v) => !!normalizeBusinessId(v);

async function fetchJSON(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    const looksLikeHtml = /^\s*<!doctype html|^\s*<html[\s>]/i.test(text);
    let json = null;
    try {
      json = looksLikeHtml ? null : text ? JSON.parse(text) : null;
    } catch {}
    if (!res.ok || looksLikeHtml) {
      const msg = looksLikeHtml
        ? '404 page not found'
        : (json && (json.message || json.error)) || text || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return json;
  } finally {
    clearTimeout(tid);
  }
}

const buildOrdersUrlSmart = (
  base,
  businessId,
  { appendOwnerType = true, ownerType = 'food', altParam = 'business_id' } = {}
) => {
  if (!base || !isValidBusinessId(businessId)) return null;
  const id = encodeURIComponent(normalizeBusinessId(businessId));
  const b = String(base).trim().replace(/\/+$/, '');
  let replaced = b
    .replace(/\{\s*businessId\s*\}/g, id)
    .replace(/\{\s*business_id\s*\}/gi, id)
    .replace(/:businessId/g, id)
    .replace(/:business_id/gi, id);

  if (replaced === b) {
    if (/\/business$/i.test(b)) replaced = `${b}/${id}`;
    else if (!b.endsWith(`/${id}`)) {
      const sep = b.includes('?') ? '&' : '?';
      replaced = `${b}${sep}${altParam}=${id}`;
    }
  }
  if (appendOwnerType) {
    const sep2 = replaced.includes('?') ? '&' : '?';
    replaced = `${replaced}${sep2}owner_type=${encodeURIComponent(ownerType)}`;
  }
  return replaced;
};

const getCreated = (o) =>
  o?.created_at || o?.createdAt || o?.ordered_at || o?.order_date || null;
const getTotal = (o) =>
  toNumber(o?.total_amount ?? o?.total ?? o?.grand_total ?? o?.amount ?? 0);
const getStatus = (o) => String(o?.status ?? o?.order_status ?? '').toUpperCase();

const pluckOrdersLight = (payload) => {
  try {
    if (payload && Array.isArray(payload.data)) {
      const out = [];
      for (const block of payload.data) {
        const orders = block?.orders || block?.rows || block?.result || [];
        if (Array.isArray(orders)) {
          for (const o of orders) out.push({ status: getStatus(o), total: getTotal(o), created_at: getCreated(o) });
        }
      }
      if (out.length) return out;
    }
    if (Array.isArray(payload))
      return payload.map((o) => ({
        status: getStatus(o),
        total: getTotal(o),
        created_at: getCreated(o),
      }));
    if (Array.isArray(payload?.orders))
      return payload.orders.map((o) => ({
        status: getStatus(o),
        total: getTotal(o),
        created_at: getCreated(o),
      }));
    if (Array.isArray(payload?.rows))
      return payload.rows.map((o) => ({
        status: getStatus(o),
        total: getTotal(o),
        created_at: getCreated(o),
      }));
    if (Array.isArray(payload?.result))
      return payload.result.map((o) => ({
        status: getStatus(o),
        total: getTotal(o),
        created_at: getCreated(o),
      }));
  } catch {}
  return [];
};

const UP = (s) => String(s || '').toUpperCase();
const countKpisLikeOrdersTab = (rows, kind = 'food') => {
  const ACTIVE_SET = new Set(
    String(kind).toLowerCase() === 'mart'
      ? ['PENDING', 'CONFIRMED', 'READY', 'OUT_FOR_DELIVERY']
      : ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY']
  );
  const CANCEL_SET = new Set(['CANCELLED', 'CANCELED', 'REJECTED', 'DECLINED']);
  const ACCEPTED_SET = new Set([...ACTIVE_SET, 'COMPLETED']);

  let active = 0;
  let cancelledToday = 0;
  let accepted = 0;
  let salesToday = 0;

  const statusCounts = Object.create(null);

  for (const r of rows || []) {
    const st = UP(r.status);
    const today = isTodayLocal(r.created_at);

    statusCounts[st] = (statusCounts[st] || 0) + 1;

    if (ACTIVE_SET.has(st)) active += 1;
    if (
      (st === 'CANCELLED' || st === 'CANCELED' || st === 'REJECTED' || st === 'DECLINED') &&
      today
    ) {
      cancelledToday += 1;
    }
    if (ACCEPTED_SET.has(st)) accepted += 1;
    if (!CANCEL_SET.has(st) && today) salesToday += toNumber(r.total);
  }

  const denom = accepted + cancelledToday;
  const acceptanceRate = denom > 0 ? Math.round((accepted / denom) * 100) : 0;

  return {
    kpis: {
      salesToday,
      salesCurrency: 'Nu',
      activeOrders: active,
      cancellations: cancelledToday,
      acceptanceRate,
    },
    statusCounts,
  };
};

/* ---------------- IMAGE HELPERS ---------------- */
const originOf = (u) => {
  try {
    return new URL(u).origin;
  } catch {
    return '';
  }
};

const sanitizePath = (p) => {
  let path = String(p || '');
  path = path.replace(/^\/(mart\/)?uploads\/uploads\//i, '/$1uploads/');
  path = path.replace(/([^:]\/)\/+/g, '$1');
  return path;
};

const encodePathSegments = (p) =>
  String(p || '')
    .split('/')
    .map((seg) => (seg ? encodeURIComponent(seg) : ''))
    .join('/');

const absJoin = (base, raw) => {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^https?:\/\/\S+/i.test(s)) return normalizeHost(s);

  const baseNorm = String(normalizeHost(base || '')).replace(/\/+$/, '');
  let path = s.startsWith('/') ? s : `/${s}`;

  if (/\/(?:mart\/)?uploads$/i.test(baseNorm) && /^\/(?:mart\/)?uploads\//i.test(path)) {
    path = path.replace(/^\/(?:mart\/)?uploads/i, '');
  }

  path = sanitizePath(path);
  const encodedPath = encodePathSegments(path);
  const joined = `${baseNorm}${encodedPath.startsWith('/') ? '' : '/'}${encodedPath}`.replace(
    /([^:]\/)\/+/g,
    '$1'
  );
  return joined;
};

const hostOnly = (u) => {
  const norm = normalizeHost(u || '');
  return originOf(norm || '') || '';
};

const IMAGE_BASES = (owner) =>
  ({
    food: {
      item:
        normalizeHost(ENV_MENU_IMAGE_ENDPOINT) ||
        originOf(ENV_DISPLAY_MENU_ENDPOINT || ''),
      promo:
        normalizeHost(ENV_BANNERS_IMAGE_ENDPOINT) ||
        originOf(ENV_BANNERS_ENDPOINT || ''),
    },
    mart: {
      item:
        normalizeHost(ENV_ITEM_IMAGE_ENDPOINT) ||
        originOf(ENV_DISPLAY_ITEM_ENDPOINT || ''),
      promo:
        normalizeHost(ENV_BANNERS_IMAGE_ENDPOINT) ||
        originOf(ENV_BANNERS_ENDPOINT || ''),
    },
  }[owner] || { item: '', promo: '' });

const baseWithServicePrefix = (u) => {
  try {
    const url = new URL(normalizeHost(u || ''));
    const firstSeg = url.pathname.split('/').filter(Boolean)[0];
    if (firstSeg === 'food' || firstSeg === 'mart') return `${url.origin}/${firstSeg}`;
    return url.origin;
  } catch {
    return originOf(normalizeHost(u || '')) || '';
  }
};

const useBuildImg = (ownerType, listBase) => {
  const bases = useMemo(() => IMAGE_BASES(ownerType), [ownerType]);
  const fallbackBase = useMemo(() => baseWithServicePrefix(listBase), [listBase]);

  return useCallback(
    (kind, raw) => {
      if (!raw) return '';
      if (/^https?:\/\//i.test(raw)) return normalizeHost(raw);

      const chosenBase =
        (kind === 'promo' ? bases.promo || fallbackBase : bases.item || fallbackBase) || '';

      const baseNorm = String(normalizeHost(chosenBase)).replace(/\/+$/, '');
      let path = raw.startsWith('/') ? raw : `/${raw}`;

      if (/\/food$/i.test(baseNorm) && /^\/food\//i.test(path)) path = path.replace(/^\/food/i, '');
      if (/\/mart$/i.test(baseNorm) && /^\/mart\//i.test(path)) path = path.replace(/^\/mart/i, '');

      if (kind === 'item') {
        const baseIsFoodOrMart = /\/(food|mart)$/i.test(baseNorm);
        const missingUploads = !/^\/(?:uploads|merchant\/uploads)\//i.test(path);
        if (baseIsFoodOrMart && missingUploads) path = `/uploads${path}`;
        if (/\/uploads$/i.test(baseNorm) && /^\/uploads\//i.test(path))
          path = path.replace(/^\/uploads/i, '');
      }

      path = sanitizePath(path);
      return absJoin(baseNorm, path);
    },
    [ownerType, bases, fallbackBase]
  );
};

const buildBannerImg = (raw, bannerImgBase, endpointByBiz, endpointAll) => {
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return normalizeHost(raw);

  const baseHost =
    hostOnly(bannerImgBase) ||
    originOf(normalizeHost(endpointByBiz || '')) ||
    originOf(normalizeHost(endpointAll || '')) ||
    '';

  const needsMerchant =
    /\/merchant(\/|$)/i.test(String(endpointByBiz || '')) ||
    /\/merchant(\/|$)/i.test(String(endpointAll || ''));

  let path = raw.startsWith('/') ? raw : `/${raw}`;

  if (needsMerchant && /^\/uploads\//i.test(path) && !/^\/merchant\//i.test(path)) {
    path = `/merchant${path}`;
  }

  const baseHasMerchantUploads = /\/merchant\/uploads$/i.test(baseHost);
  if (baseHasMerchantUploads && /^\/merchant\/uploads\//i.test(path)) {
    path = path.replace(/^\/merchant\/uploads/i, '');
  }

  path = sanitizePath(path);
  const finalUrl = absJoin(baseHost, path);
  return finalUrl;
};

/* ---------------- per-context storage key ---------------- */
const menusStoreKey = (bizId, ownerId, ownerType) =>
  `menus_${String(bizId || 'na')}_${String(ownerId || 'na')}_${String(ownerType || 'food')}`;

const baseOriginFromEnvLists = () => {
  const src = normalizeHost(ENV_DISPLAY_MENU_ENDPOINT || ENV_DISPLAY_ITEM_ENDPOINT || '');
  try {
    return new URL(src).origin;
  } catch {
    return '';
  }
};

const buildBaseCandidates = (kind, serviceOrdersBase) => {
  const origin = baseOriginFromEnvLists();
  const fromEnv = normalizeHost(ENV_ORDER_ENDPOINT || '');
  const fromService = normalizeHost(serviceOrdersBase || '');
  const base = normalizeHost(origin);

  const swapFoodMart = (u) =>
    u ? u.replace(/\/food\//g, '/mart/').replace(/\/mart\//g, '/food/') : u;

  const candidates = [
    fromEnv,
    fromService,
    swapFoodMart(fromEnv),
    swapFoodMart(fromService),
    `${base}/api/${kind}/orders`,
    `${base}/api/orders`,
    `${base}/${kind}/orders`,
    `${base}/orders`,
  ]
    .filter(Boolean)
    .map((u) => u.replace(/\/+$/, ''));

  return Array.from(new Set(candidates));
};

async function probeOrdersPayload({ baseCandidates, businessId, kind }) {
  const idParams = ['business_id', 'businessId', 'id'];
  const typeParams = ['owner_type', 'ownerType', 'kind'];
  const tries = [];

  for (const base of baseCandidates) {
    idParams.forEach((idKey) => {
      tries.push(
        buildOrdersUrlSmart(base, businessId, {
          appendOwnerType: true,
          ownerType: kind,
          altParam: idKey,
        })
      );
    });
    idParams.forEach((idKey) => {
      typeParams.forEach((tKey) => {
        const id = encodeURIComponent(normalizeBusinessId(businessId));
        const b = String(base).trim().replace(/\/+$/, '');
        const sep = b.includes('?') ? '&' : '?';
        tries.push(`${b}${sep}${idKey}=${id}&${tKey}=${encodeURIComponent(kind)}`);
      });
    });
    tries.push(`${base}/business/${encodeURIComponent(normalizeBusinessId(businessId))}`);
  }

  const candidates = Array.from(new Set(tries.filter(Boolean)));
  let lastErr = null;
  for (const url of candidates) {
    try {
      const payload = await fetchJSON(url, { headers: { Accept: 'application/json' } });
      const rows = pluckOrdersLight(payload);
      return rows;
    } catch (e) {
      lastErr = e;
    }
  }
  if (lastErr) throw lastErr;
  return [];
}

export default function HomeTab({
  isTablet,
  menus = [],
  money: moneyProp,
  onPressNav = () => {},
  ownerType: ownerTypeProp,
  businessId: businessIdProp,
  serviceConfig,
  kpis: kpisProp,
}) {
  const navigation = useNavigation();
  const route = useRoute();

  // ✅ categories JSON from route (your big JSON)
  const categoriesPayload = useMemo(
    () =>
      route?.params?.categoriesPayload ??
      route?.params?.categories ??
      route?.params?.categoryData ??
      null,
    [route?.params]
  );

  const ownerType = useMemo(
    () =>
      normalizeOwnerType(
        ownerTypeProp ?? route?.params?.owner_type ?? route?.params?.ownerType ?? 'food'
      ),
    [ownerTypeProp, route?.params?.owner_type, route?.params?.ownerType]
  );
  const isMart = ownerType === 'mart';

  const nouns = useMemo(() => {
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    const base = isMart ? 'item' : 'menu';
    const plural = isMart ? 'items' : 'menus';
    return {
      noun: base,
      nounCap: cap(base),
      nounPlural: plural,
      nounPluralCap: cap(plural),
      quickActionTitle: isMart ? 'Items' : 'Menu',
      addBtn: isMart ? 'Add item' : 'Add menu',
      headerAdded: isMart ? 'Added items' : 'Added menus',
      emptyText: isMart
        ? 'No items available for your account.'
        : 'No menus available for your account.',
      emptyListTitle: isMart ? 'No items yet' : 'No menu items yet',
      emptyListSub: 'Add your first item to start selling.',
    };
  }, [isMart]);

  const BUSINESS_ID_RAW = useMemo(() => {
    const p = route?.params ?? {};
    return (
      businessIdProp ||
      p.businessId ||
      p.business_id ||
      p.merchant?.businessId ||
      p.merchant?.id ||
      ''
    )
      .toString()
      .trim();
  }, [businessIdProp, route?.params]);
  const BUSINESS_ID = useMemo(() => String(BUSINESS_ID_RAW || ''), [BUSINESS_ID_RAW]);

  const [ownerId, setOwnerId] = useState('');
  const [allMenus, setAllMenus] = useState(() => (Array.isArray(menus) ? menus : []));
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [kpis, setKpis] = useState({
    salesToday: 0,
    salesCurrency: 'Nu',
    activeOrders: 0,
    acceptanceRate: 0,
    cancellations: 0,
  });
  const [statusCounts, setStatusCounts] = useState({});

  const [quickActions, setQuickActions] = useState(DEFAULT_ACTIONS);
  const actionMeta = useCallback((key) => ALL_ACTIONS.find((a) => a.key === key), []);

  const [banners, setBanners] = useState([]);
  const [bannersLoading, setBannersLoading] = useState(false);
  const [bannersError, setBannersError] = useState('');

  const contextKey = `${String(BUSINESS_ID || '')}|${String(ownerId || '')}|${String(
    ownerType || ''
  )}`;
  const latestContextRef = useRef(contextKey);
  useEffect(() => {
    latestContextRef.current = contextKey;
  }, [contextKey]);

  useEffect(() => {
    (async () => setOwnerId(await getStoredOwnerId()))();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const key = menusStoreKey(BUSINESS_ID, ownerId, ownerType);
        const storedMenus = await SecureStore.getItemAsync(key);
        setAllMenus(storedMenus ? JSON.parse(storedMenus) : []);
      } catch {
        setAllMenus([]);
      }
    })();
  }, [BUSINESS_ID, ownerId, ownerType]);

  useEffect(() => {
    (async () => {
      try {
        const key = menusStoreKey(BUSINESS_ID, ownerId, ownerType);
        if (allMenus.length > 0) await SecureStore.setItemAsync(key, JSON.stringify(allMenus));
      } catch {}
    })();
  }, [allMenus, BUSINESS_ID, ownerId, ownerType]);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      (async () => {
        try {
          const raw = await SecureStore.getItemAsync(KEY_QUICK_ACTIONS);
          const arr = raw ? JSON.parse(raw) : DEFAULT_ACTIONS;
          if (isActive && Array.isArray(arr) && arr.length) setQuickActions(arr);
        } catch {
          if (isActive) setQuickActions(DEFAULT_ACTIONS);
        }
      })();
      return () => {
        isActive = false;
      };
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return undefined;
      const onBack = () => {
        if (navigation.canGoBack()) {
          navigation.goBack();
          return true;
        }
        return false;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [navigation])
  );

  const ENV_LIST_BASE = useMemo(() => {
    const foodBase = normalizeHost((ENV_DISPLAY_MENU_ENDPOINT || '').replace(/\/+$/, ''));
    const martBase = normalizeHost((ENV_DISPLAY_ITEM_ENDPOINT || '').replace(/\/+$/, ''));
    return isMart ? martBase : foodBase;
  }, [isMart]);

  const CONFIG_LIST = useMemo(() => {
    const sc = route?.params?.serviceConfig || serviceConfig || {};
    return isMart ? sc.itemsList || sc.menus || '' : sc.menusList || sc.menus || '';
  }, [route?.params?.serviceConfig, serviceConfig, isMart]);

  const LIST_BASE = useMemo(() => {
    const chosen =
      (ENV_LIST_BASE && ENV_LIST_BASE.length) || !CONFIG_LIST ? ENV_LIST_BASE : CONFIG_LIST || '';
    return normalizeHost((chosen || '').replace(/\/+$/, ''));
  }, [ENV_LIST_BASE, CONFIG_LIST]);

  const buildImg = useBuildImg(ownerType, LIST_BASE);

  const buildFetchUrl = useCallback(() => {
    if (!LIST_BASE || !BUSINESS_ID) return '';
    if (/\/business$/i.test(LIST_BASE)) {
      return `${LIST_BASE}/${encodeURIComponent(BUSINESS_ID)}`;
    }
    const sep = LIST_BASE.includes('?') ? '&' : '?';
    return `${LIST_BASE}${sep}business_id=${encodeURIComponent(BUSINESS_ID)}`;
  }, [LIST_BASE, BUSINESS_ID]);

  const extractItemsFromResponse = useCallback((raw) => {
    const seen = new Set();
    const dfs = (obj) => {
      if (obj == null || typeof obj !== 'object' || seen.has(obj)) return null;
      seen.add(obj);
      if (Array.isArray(obj)) return obj;
      for (const k of ['data', 'items', 'menus', 'menu', 'rows', 'result', 'payload', 'list']) {
        if (Array.isArray(obj?.[k])) return obj[k];
      }
      for (const v of Object.values(obj)) {
        const found = dfs(v);
        if (found) return found;
      }
      return null;
    };
    const res = dfs(raw);
    return Array.isArray(res) ? res : [];
  }, []);

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

      const hasPromo =
        Number(x?.discount_percentage) > 0 ||
        Boolean(x?.has_promo) ||
        Boolean(x?.promo_active);

      const rawPromoImg = x?.promo_image || x?.promoImage || x?.banner_image || '';
      const rawItemImg = x?.image_url ?? x?.item_image_url ?? x?.item_image ?? x?.image ?? '';

      const absImage =
        hasPromo && rawPromoImg
          ? buildImg('promo', rawPromoImg)
          : buildImg('item', rawItemImg);

      const bizId =
        x?.business_id ??
        x?.businessId ??
        x?.merchant_business_id ??
        x?.restaurant_id ??
        x?.store_id;
      const ownId =
        x?.owner_id ??
        x?.ownerId ??
        x?.merchant_id ??
        x?.merchantId ??
        x?.created_by ??
        x?.user_id;

      return {
        id: String(x?.id ?? x?._id ?? x?.menu_id ?? idx),
        name: x?.item_name ?? x?.name ?? x?.title ?? 'Unnamed item',
        title: x?.title ?? undefined,
        price,
        discount: x?.discount_percentage ?? '',
        taxRate: x?.tax_rate ?? '',
        currency: x?.currency ?? 'Nu',
        inStock: (x?.is_available ?? x?.inStock ?? 1) ? true : false,
        category: x?.category_name ?? x?.category ?? x?.categoryName ?? '',
        categoryName: x?.category_name ?? x?.category ?? x?.categoryName ?? '',
        image: absImage,
        description: x?.description ?? '',
        businessId: bizId ? String(bizId) : '',
        ownerId: ownId ? String(ownId) : '',
        _raw: x,
      };
    },
    [buildImg]
  );

  const filterMenusForOwner = useCallback(
    (arr) => {
      if (!ownerId && !BUSINESS_ID) return arr;
      return arr.filter((it) => {
        const matchBusiness = BUSINESS_ID
          ? String(it.businessId || '') === String(BUSINESS_ID)
          : true;
        const matchOwner = ownerId ? String(it.ownerId || '') === String(ownerId) : true;
        return matchBusiness && matchOwner;
      });
    },
    [ownerId, BUSINESS_ID]
  );

  const fetchMenus = useCallback(async () => {
    if (!LIST_BASE) {
      setErrorMsg('Missing list endpoint (.env or serviceConfig).');
      return;
    }
    if (!BUSINESS_ID) {
      setErrorMsg('Missing businessId.');
      return;
    }

    const myKey = latestContextRef.current;
    setLoading(true);
    setErrorMsg('');
    try {
      const token = (await SecureStore.getItemAsync('auth_token')) || '';
      const url = buildFetchUrl();
      if (!url) throw new Error('Could not build URL');

      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const text = await res.text();
      let parsed = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = null;
      }

      if (!res.ok) {
        const msg =
          (parsed && (parsed.message || parsed.error)) || text || `HTTP ${res.status}`;
        throw new Error(msg);
      }

      const items = extractItemsFromResponse(parsed);
      const normalized = items.map((x, i) => normalizeItem(x, i));
      const filtered = filterMenusForOwner(normalized);

      if (latestContextRef.current !== myKey) return;

      if (filtered.length === 0) {
        setAllMenus([]);
        setErrorMsg(nouns.emptyText);
      } else {
        setAllMenus(filtered);
        setErrorMsg('');
      }
    } catch (e) {
      if (latestContextRef.current === myKey) {
        setErrorMsg(`Error fetching ${nouns.nounPlural}: ${e.message}`);
      }
    } finally {
      if (latestContextRef.current === myKey) setLoading(false);
    }
  }, [
    LIST_BASE,
    BUSINESS_ID,
    buildFetchUrl,
    extractItemsFromResponse,
    normalizeItem,
    filterMenusForOwner,
    nouns.nounPlural,
    nouns.emptyText,
  ]);

  const fetchKpis = useCallback(async () => {
    const id = normalizeBusinessId(BUSINESS_ID);
    if (!isValidBusinessId(id)) return;

    try {
      const baseCandidates = buildBaseCandidates(ownerType, serviceConfig?.orders);
      const rows = await probeOrdersPayload({ baseCandidates, businessId: id, kind: ownerType });
      const { kpis: computed, statusCounts: counts } = countKpisLikeOrdersTab(rows, ownerType);
      setKpis(computed);
      setStatusCounts(counts);
    } catch (e) {
      // ignore, keep last KPIs
    }
  }, [BUSINESS_ID, ownerType, serviceConfig?.orders]);

  const BANNERS_ENDPOINT = useMemo(() => normalizeHost(ENV_BANNERS_ENDPOINT || ''), []);
  const BANNERS_BY_BUSINESS_ENDPOINT = useMemo(
    () => normalizeHost(ENV_BANNERS_BY_BUSINESS_ENDPOINT || ''),
    []
  );
  const BANNERS_IMG_BASE = useMemo(
    () => normalizeHost(ENV_BANNERS_IMAGE_ENDPOINT || ''),
    []
  );
  const originFromUrl = (u) => {
    try {
      return new URL(u).origin;
    } catch {
      return '';
    }
  };

  const todayISO = () => new Date().toISOString().slice(0, 10);

  const normalizeBanner = (b, imgBase) => {
    const rawImg = b?.banner_image || b?.image || b?.image_url || '';
    return {
      id: String(b?.id ?? b?._id ?? ''),
      title: b?.title ?? '',
      description: b?.description ?? '',
      image: buildBannerImg(
        rawImg,
        imgBase,
        BANNERS_BY_BUSINESS_ENDPOINT,
        BANNERS_ENDPOINT
      ),
      is_active: Number(b?.is_active ?? 1),
      start_date: b?.start_date ? String(b.start_date).slice(0, 10) : '',
      end_date: b?.end_date ? String(b.end_date).slice(0, 10) : '',
      owner_type: (b?.owner_type || '').toLowerCase(),
      business_id: String(b?.business_id ?? b?.businessId ?? ''),
    };
  };

  const fetchBanners = useCallback(async () => {
    if (!BUSINESS_ID) {
      setBanners([]);
      setBannersError('');
      return;
    }
    if (!BANNERS_ENDPOINT && !BANNERS_BY_BUSINESS_ENDPOINT) {
      setBanners([]);
      setBannersError('');
      return;
    }

    const myKey = latestContextRef.current;
    setBannersLoading(true);
    setBannersError('');

    const byBizBase = (BANNERS_BY_BUSINESS_ENDPOINT || '').replace(/\/+$/, '');
    const allBase = (BANNERS_ENDPOINT || '').replace(/\/+$/, '');
    const imgOriginByBiz = originFromUrl(BANNERS_BY_BUSINESS_ENDPOINT || '');
    const imgOriginAll = originFromUrl(BANNERS_ENDPOINT || '');

    const imgBaseByBiz = BANNERS_IMG_BASE || imgOriginByBiz;
    const imgBaseAll = BANNERS_IMG_BASE || imgOriginAll;

    const sameBiz = (b) =>
      String(b?.business_id ?? b?.businessId ?? '') === String(BUSINESS_ID);
    const isActiveNow = (b) =>
      Number(b.is_active) === 1 && (!b.end_date || b.end_date > todayISO());

    try {
      let list = [];

      if (byBizBase) {
        const url = `${byBizBase}/${encodeURIComponent(BUSINESS_ID)}`;
        const res = await fetch(url);
        const raw = await res.text();
        if (res.ok) {
          const json = raw ? JSON.parse(raw) : [];
          const arr = Array.isArray(json)
            ? json
            : Array.isArray(json.data)
            ? json.data
            : [];
          list = (arr || []).map((b) => normalizeBanner(b, imgBaseByBiz)).filter(sameBiz);
        }
      }

      if (!list.length && allBase) {
        const url = allBase;
        const res = await fetch(url);
        const raw = await res.text();
        if (res.ok) {
          const json = raw ? JSON.parse(raw) : [];
          const arr = Array.isArray(json)
            ? json
            : Array.isArray(json.data)
            ? json.data
            : [];
          list = (arr || []).map((b) => normalizeBanner(b, imgBaseAll)).filter(sameBiz);
        }
      }

      if (latestContextRef.current !== myKey) return;
      setBanners(list.filter(isActiveNow));
      setBannersError('');
    } catch (e) {
      if (latestContextRef.current !== myKey) return;
      setBanners([]);
      setBannersError('');
    } finally {
      if (latestContextRef.current === myKey) setBannersLoading(false);
    }
  }, [
    BUSINESS_ID,
    BANNERS_ENDPOINT,
    BANNERS_BY_BUSINESS_ENDPOINT,
    BANNERS_IMG_BASE,
    ownerType,
  ]);

  const ready = useMemo(() => Boolean(BUSINESS_ID && LIST_BASE), [BUSINESS_ID, LIST_BASE]);

  useFocusEffect(
    useCallback(() => {
      if (ready) {
        fetchMenus();
        fetchBanners();
      }
    }, [ready, fetchMenus, fetchBanners])
  );
  useEffect(() => {
    if (ready) {
      fetchMenus();
      fetchBanners();
    }
  }, [ownerId, BUSINESS_ID, ownerType, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  useFocusEffect(
    useCallback(() => {
      if (BUSINESS_ID) {
        fetchKpis();
      }
    }, [BUSINESS_ID, ownerType, fetchKpis])
  );
  useEffect(() => {
    if (BUSINESS_ID) {
      fetchKpis();
    }
  }, [BUSINESS_ID, ownerType]); // eslint-disable-line react-hooks/exhaustive-deps

  const fmtMoney = useCallback(
    (n, ccy = 'Nu') =>
      typeof moneyProp === 'function'
        ? moneyProp(n, ccy)
        : `${ccy} ${Number(n || 0).toFixed(2)}`,
    [moneyProp]
  );
  const pct = useCallback(
    (v) => `${Math.round(Number.isFinite(v) ? v : 0)}%`,
    []
  );

  const eff = (obj) => (obj && typeof obj === 'object' ? obj : {});
  const mergedKpis = {
    salesToday: 0,
    salesCurrency: 'Nu',
    activeOrders: 0,
    acceptanceRate: 0,
    cancellations: 0,
    ...eff(kpis),
    ...eff(kpisProp),
  };
  const salesToday = Number(mergedKpis.salesToday ?? 0);
  const salesCurrency = mergedKpis.salesCurrency || 'Nu';
  const activeOrders = Number(mergedKpis.activeOrders ?? 0);
  const acceptanceRate = Number.isFinite(mergedKpis.acceptanceRate)
    ? mergedKpis.acceptanceRate
    : 0;
  const cancellations = Number(mergedKpis.cancellations ?? 0);

  const visibleMenus = useMemo(() => allMenus.slice(0, 3), [allMenus]);
  const showCountNote = allMenus.length > 3;

  useEffect(() => {
    if (!loading && visibleMenus.length === 0) setErrorMsg(nouns.emptyText);
  }, [nouns.emptyText, isMart, loading, visibleMenus.length]);

  const onShortcutPress = useCallback(
    (key) => {
      switch (key) {
        case 'menu':
          navigation.navigate('MenuScreen', {
            businessId: BUSINESS_ID || 'YOUR_BUSINESS_ID',
            owner_type: ownerType,
            categoriesPayload, // ✅ pass categories JSON
          });
          break;
        case 'promos':
          onPressNav('Promos');
          break;
        case 'payouts':
          onPressNav('Payouts');
          break;
        case 'settings':
          navigation.navigate('AccountSettings', { businessId: BUSINESS_ID });
          break;
        case 'orders':
          onPressNav('Orders');
          break;
        case 'addItem':
          onPressNav('AddMenuTab', {
            businessId: BUSINESS_ID || 'YOUR_BUSINESS_ID',
            owner_type: ownerType,
          });
          break;
        default:
          break;
      }
    },
    [navigation, onPressNav, BUSINESS_ID, ownerType, categoriesPayload]
  );

  const actionLabelFor = useCallback(
    (meta) => {
      if (!meta) return '';
      if (meta.key === 'menu') return nouns.quickActionTitle;
      if (meta.key === 'addItem') return nouns.addBtn;
      return meta.label;
    },
    [nouns]
  );

  const actionIconFor = useCallback(
    (meta) => {
      if (!meta) return 'help-outline';
      if (meta.key === 'menu') return isMart ? 'cube-outline' : 'restaurant-outline';
      return meta.icon;
    },
    [isMart]
  );

  const totalStatusCount = useMemo(
    () =>
      Object.values(statusCounts || {}).reduce(
        (a, b) => a + (Number(b) || 0),
        0
      ),
    [statusCounts]
  );

  /* ---------- Header as a React node (we'll render it inside ScrollView) ---------- */
  const Header = useMemo(
    () => (
      <>
        {/* KPIs */}
        <View
          style={[
            styles.kpiRow,
            { marginHorizontal: isTablet ? 20 : 12, marginTop: isTablet ? 20 : 16 },
          ]}
        >
          <KpiCard
            isTablet={isTablet}
            icon="cash-outline"
            label="Today"
            value={fmtMoney(salesToday, salesCurrency)}
            sub="Sales"
          />
          <KpiCard
            isTablet={isTablet}
            icon="receipt-outline"
            label="Active"
            value={String(activeOrders)}
            sub="Orders"
          />
          <KpiCard
            isTablet={isTablet}
            icon="trending-up-outline"
            label="Accept"
            value={pct(acceptanceRate)}
            sub="Rate"
          />
          <KpiCard
            isTablet={isTablet}
            icon="alert-circle-outline"
            label="Cancel"
            value={String(cancellations)}
            sub="Today"
          />
        </View>

        {/* Status chips placeholder (if you enable later) */}
        <View style={[styles.section, { marginTop: 8 }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              alignItems: 'center',
              paddingVertical: 6,
              gap: 8,
            }}
          >
            {/* you can render StatusChip here if you want */}
          </ScrollView>
        </View>

        {/* Quick actions */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={[styles.sectionTitle, { fontSize: isTablet ? 18 : 16 }]}>
              Quick actions
            </Text>
            <TouchableOpacity
              style={styles.linkRow}
              onPress={() => navigation.navigate('ManageQuickActions')}
            >
              <Text style={[styles.linkText, { fontSize: isTablet ? 14 : 13 }]}>
                Manage
              </Text>
              <Ionicons
                name="chevron-forward"
                size={isTablet ? 18 : 16}
                color="#00b14f"
              />
            </TouchableOpacity>
          </View>

          <View style={[styles.shortcutsRow, { flexWrap: 'wrap' }]}>
            {quickActions.map((k) => {
              const meta = actionMeta(k);
              if (!meta) return null;
              return (
                <Shortcut
                  key={k}
                  isTablet={isTablet}
                  icon={actionIconFor(meta)}
                  label={actionLabelFor(meta)}
                  onPress={() => onShortcutPress(k)}
                />
              );
            })}
          </View>
        </View>

        {/* Added menus/items */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={[styles.sectionTitle, { fontSize: isTablet ? 18 : 16 }]}>
              {nouns.headerAdded}
            </Text>
            <TouchableOpacity
              style={styles.linkRow}
              onPress={() =>
                navigation.navigate('MenuScreen', {
                  businessId: BUSINESS_ID || 'YOUR_BUSINESS_ID',
                  owner_type: ownerType,
                  categoriesPayload, // ✅ pass here too
                })
              }
            >
              <Text style={[styles.linkText, { fontSize: isTablet ? 14 : 13 }]}>
                View all
              </Text>
              <Ionicons
                name="chevron-forward"
                size={isTablet ? 18 : 16}
                color="#00b14f"
              />
            </TouchableOpacity>
          </View>
          {showCountNote && (
            <Text style={styles.countNote}>
              {`Showing 3 of ${allMenus.length} ${nouns.nounPlural}`}
            </Text>
          )}

          {!loading && !errorMsg && visibleMenus.length === 0 && (
            <View
              style={[
                styles.section,
                styles.emptyBox,
                { marginHorizontal: 0, marginTop: 10 },
              ]}
            >
              <Ionicons
                name={isMart ? 'cube-outline' : 'fast-food-outline'}
                size={isTablet ? 30 : 28}
                color="#0f172a"
              />
              <Text
                style={[styles.emptyTitle, { fontSize: isTablet ? 15 : 14 }]}
              >
                {nouns.emptyListTitle}
              </Text>
              <Text
                style={[styles.emptySub, { fontSize: isTablet ? 13 : 12 }]}
              >
                {nouns.emptyListSub}
              </Text>
            </View>
          )}

          {!!errorMsg && (
            <View style={[styles.emptyBox, { marginHorizontal: 0, marginTop: 10 }]}>
              <Ionicons name="warning-outline" size={20} color="#ef4444" />
              <Text
                style={[styles.emptyTitle, { color: '#ef4444' }]}
                selectable
              >
                {errorMsg}
              </Text>
              <TouchableOpacity
                onPress={fetchMenus}
                style={[styles.badge, { marginTop: 8 }]}
              >
                <Text style={styles.badgeText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </>
    ),
    [
      isTablet,
      fmtMoney,
      salesToday,
      salesCurrency,
      activeOrders,
      acceptanceRate,
      cancellations,
      pct,
      navigation,
      BUSINESS_ID,
      allMenus.length,
      showCountNote,
      quickActions,
      actionMeta,
      onShortcutPress,
      loading,
      errorMsg,
      visibleMenus.length,
      fetchMenus,
      nouns,
      isMart,
      actionIconFor,
      actionLabelFor,
      ownerType,
      statusCounts,
      totalStatusCount,
      onPressNav,
      categoriesPayload,
    ]
  );

  /* ---------- Row renderer for menu items & banners section ---------- */
  const renderRow = useCallback(
    (item) => {
      if (item?.__type === 'bannersSection') {
        return (
          <View style={[styles.section, { marginTop: 16 }]}>
            <View style={styles.sectionHead}>
              <Text
                style={[styles.sectionTitle, { fontSize: isTablet ? 18 : 16 }]}
              >
                Promo banners
              </Text>
              <TouchableOpacity
                style={styles.linkRow}
                onPress={() => onPressNav('Promos')}
              >
                <Text
                  style={[styles.linkText, { fontSize: isTablet ? 14 : 13 }]}
                >
                  View all
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={isTablet ? 18 : 16}
                  color="#00b14f"
                />
              </TouchableOpacity>
            </View>

            {bannersLoading ? (
              <View style={[styles.emptyBox, { marginHorizontal: 0 }]}>
                <ActivityIndicator />
                <Text
                  style={[styles.emptySub, { marginTop: 6 }]}
                >
                  Loading banners…
                </Text>
              </View>
            ) : bannersError ? (
              <View style={[styles.emptyBox, { marginHorizontal: 0 }]}>
                <Ionicons name="warning-outline" size={20} color="#ef4444" />
                <Text
                  style={[styles.emptyTitle, { color: '#ef4444' }]}
                  selectable
                >
                  {bannersError}
                </Text>
                <TouchableOpacity
                  onPress={fetchBanners}
                  style={[styles.badge, { marginTop: 8 }]}
                >
                  <Text style={styles.badgeText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {banners.length > 3 && (
                  <Text style={styles.countNote}>
                    Showing 3 of {banners.length} banners
                  </Text>
                )}
                <View style={{ gap: 12, marginTop: 8 }}>
                  {banners.slice(0, 3).map((b) => (
                    <BannerItem key={b.id} b={b} isTablet={isTablet} />
                  ))}
                  {banners.slice(0, 3).length === 0 && (
                    <View style={[styles.emptyBox, { marginHorizontal: 0 }]}>
                      <Ionicons
                        name="image-outline"
                        size={24}
                        color="#64748b"
                      />
                      <Text style={styles.emptyTitle}>No banners yet</Text>
                      <Text style={styles.emptySub}>
                        Create your first banner in Promotions.
                      </Text>
                    </View>
                  )}
                </View>
              </>
            )}
          </View>
        );
      }

      return (
        <MenuItem
          isTablet={isTablet}
          money={fmtMoney}
          item={item}
          onPress={(it) =>
            navigation.navigate('MenuScreen', {
              businessId: BUSINESS_ID || 'YOUR_BUSINESS_ID',
              editItem: it,
              owner_type: ownerType,
              categoriesPayload, // ✅ pass when editing too
            })
          }
        />
      );
    },
    [
      isTablet,
      fmtMoney,
      navigation,
      BUSINESS_ID,
      onPressNav,
      bannersLoading,
      bannersError,
      banners,
      fetchBanners,
      ownerType,
      categoriesPayload,
    ]
  );

  const listData = useMemo(
    () => [...visibleMenus, { __type: 'bannersSection', id: '__banners__' }],
    [visibleMenus]
  );

  const keyFor = useCallback(
    (item, i) =>
      String(
        item?.id ?? item?._id ?? item?.slug ?? item?.name ?? item?.__type ?? i
      ),
    []
  );

  const onRefreshBoth = useCallback(async () => {
    setLoading(true);
    setBannersLoading(true);
    await Promise.allSettled([fetchMenus(), fetchBanners(), fetchKpis()]);
    setLoading(false);
    setBannersLoading(false);
  }, [fetchMenus, fetchBanners, fetchKpis]);

  /* ---------- ✅ NO FlatList here anymore, just a ScrollView ---------- */
  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 75 }}
      nestedScrollEnabled
      refreshControl={
        <RefreshControl
          refreshing={loading || bannersLoading}
          onRefresh={onRefreshBoth}
        />
      }
    >
      {Header}

      {listData.map((item, index) => (
        <View key={keyFor(item, index)}>
          {/* separator like FlatList's ItemSeparatorComponent */}
          {index > 0 && <View style={{ height: 12, marginHorizontal: 16 }} />}
          {renderRow(item)}
        </View>
      ))}
    </ScrollView>
  );
}

/* ---------------- styles ---------------- */
const styles = StyleSheet.create({
  section: { marginTop: 16, paddingHorizontal: 16 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: { fontWeight: '700', color: '#0f172a' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  linkText: { color: '#00b14f', fontWeight: '600' },
  countNote: { color: '#64748b', marginTop: -6, paddingHorizontal: 2 },

  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  statusChipActive: {
    backgroundColor: '#16a34a1A',
    borderColor: '#16a34a',
  },
  statusChipText: { color: '#0f172a', fontWeight: '700', fontSize: 14 },
  statusChipTextActive: { color: '#065f46' },

  badge: {
    minWidth: 16,
    height: 16,
    paddingHorizontal: 6,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e2e8f0',
    marginLeft: 6,
  },
  badgeActive: { backgroundColor: '#16a34a' },
  badgeText: { color: '#0f172a', fontSize: 12, fontWeight: '700' },
  badgeTextActive: { color: 'white' },

  kpiRow: {
    marginTop: -10,
    backgroundColor: 'transparent',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  kpiCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  kpiIconWrap: {
    alignSelf: 'flex-start',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
    marginBottom: 8,
  },
  kpiLabel: { color: '#6b7280' },
  kpiValue: { fontWeight: '700', marginTop: 2, color: '#0f172a' },
  kpiSub: { color: '#9ca3af', marginTop: 2 },

  shortcutsRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 16 },
  shortcut: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    marginHorizontal: 0,
  },
  shortcutIcon: {
    padding: 10,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
    marginBottom: 8,
  },
  shortcutText: { fontWeight: '600', color: '#0f172a' },

  menuCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    marginHorizontal: 16,
  },
  menuThumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#e2e8f0',
  },
  menuThumbFallback: { alignItems: 'center', justifyContent: 'center' },
  menuTitle: { fontWeight: '700', color: '#111827' },
  menuMeta: { color: '#6b7280', marginTop: 2 },
  menuPrice: { color: '#0f172a', fontWeight: '700', marginTop: 4 },
  stockPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    marginLeft: 8,
  },

  stockText: { fontWeight: '700' },

  bannerCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    marginHorizontal: 16,
  },
  bannerThumb: {
    width: 64,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#e2e8f0',
  },
  bannerTitle: { fontWeight: '800', color: '#111827' },
  bannerDesc: { color: '#6b7280', marginTop: 2 },
  bannerDates: { color: '#94a3b8', marginTop: 2 },

  emptyBox: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 16,
  },
  emptyTitle: { fontWeight: '700', color: '#0f172a' },
  emptySub: { color: '#6b7280' },

  badgeTextAlt: { color: '#fff', fontWeight: '700' },
  badgeAlt: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#00b14f',
  },
});
