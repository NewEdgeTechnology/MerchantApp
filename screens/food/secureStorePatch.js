// screens/food/secureStorePatch.js
import * as SecureStore from 'expo-secure-store';

// Threshold and chunk size (keep chunk < 2KB to stay safe)
const KB2 = 2048;
const CHUNK_SIZE = 1800;

const metaKey = (k) => `${k}__parts`;
const partKey = (k, i) => `${k}__p${i}`;

const byteLen = (v) => {
  try {
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    return new TextEncoder().encode(s).length;
  } catch {
    return String(v).length;
  }
};

async function setChunked(key, str) {
  // slice by code units; fine for JSON/ASCII typical app data
  const parts = [];
  for (let i = 0; i < str.length; i += CHUNK_SIZE) {
    parts.push(str.slice(i, i + CHUNK_SIZE));
  }
  for (let i = 0; i < parts.length; i++) {
    await SecureStore.__origSet(partKey(key, i), parts[i]);
  }
  await SecureStore.__origSet(metaKey(key), String(parts.length));
  // ensure single-key removed (if any)
  await SecureStore.__origDel?.(key);
}

async function getChunked(key) {
  const countStr = await SecureStore.__origGet(metaKey(key));
  if (!countStr) {
    // single-key path
    return SecureStore.__origGet(key);
  }
  const count = parseInt(countStr, 10);
  if (!Number.isFinite(count) || count <= 0) return null;

  const out = [];
  for (let i = 0; i < count; i++) {
    const p = await SecureStore.__origGet(partKey(key, i));
    out.push(p || '');
  }
  return out.join('');
}

async function delChunked(key) {
  const countStr = await SecureStore.__origGet(metaKey(key));
  if (countStr) {
    const count = parseInt(countStr, 10);
    for (let i = 0; i < count; i++) {
      await SecureStore.__origDel?.(partKey(key, i));
    }
    await SecureStore.__origDel?.(metaKey(key));
  }
  await SecureStore.__origDel?.(key);
}

// Patch only once
if (!SecureStore.__autoChunkPatched) {
  // keep originals
  SecureStore.__origSet = SecureStore.setItemAsync.bind(SecureStore);
  SecureStore.__origGet = SecureStore.getItemAsync.bind(SecureStore);
  SecureStore.__origDel = SecureStore.deleteItemAsync?.bind(SecureStore);

  // Auto-chunk on oversized writes (NO WARNINGS)
  SecureStore.setItemAsync = async (key, value, options) => {
    const str = String(value ?? '');
    if (byteLen(str) > KB2) {
      return setChunked(key, str);
    }
    return SecureStore.__origSet(key, str, options);
  };

  // Reassemble on reads
  SecureStore.getItemAsync = async (key, options) => {
    return getChunked(key);
  };

  // Delete all parts transparently
  if (SecureStore.deleteItemAsync) {
    SecureStore.deleteItemAsync = async (key, options) => {
      return delChunked(key);
    };
  }

  SecureStore.__autoChunkPatched = true;
}
