import { PRIVACY_GUARD_IDB_STORE } from '../browser/idb';

// The owner's face templates (identity embeddings, never photos), encrypted with AES-256-GCM under a WebCrypto key
// that cannot be exported from this browser (the web counterpart of the Android Keystore key). Never sent anywhere.
const KEY_ID = 'key';
const TEMPLATES_ID = 'templates';
const IV_BYTES = 12;

let cached: number[][] | undefined;

async function getKey(shouldCreate: boolean) {
  const existing = await PRIVACY_GUARD_IDB_STORE.get<CryptoKey>(KEY_ID);
  if (existing || !shouldCreate) return existing;
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await PRIVACY_GUARD_IDB_STORE.set(KEY_ID, key);
  return key;
}

export async function saveOwnerTemplates(templates: number[][]) {
  const key = (await getKey(true))!;
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const plain = new TextEncoder().encode(JSON.stringify(templates));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);
  await PRIVACY_GUARD_IDB_STORE.set(TEMPLATES_ID, { iv, data });
  cached = templates;
}

export async function loadOwnerTemplates() {
  if (cached) return cached;
  const key = await getKey(false);
  const stored = await PRIVACY_GUARD_IDB_STORE.get<{ iv: Uint8Array; data: ArrayBuffer }>(TEMPLATES_ID);
  if (!key || !stored) return undefined;
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(stored.iv) }, key, stored.data);
    cached = JSON.parse(new TextDecoder().decode(plain)) as number[][];
    return cached;
  } catch {
    return undefined;
  }
}

export async function hasOwnerTemplates() {
  return Boolean(await PRIVACY_GUARD_IDB_STORE.get(TEMPLATES_ID));
}

// Deletes the templates and the key protecting them
export async function deleteOwnerTemplates() {
  cached = undefined;
  await PRIVACY_GUARD_IDB_STORE.clear();
}

// Decrypted templates stay in memory only while Privacy Guard runs
export function clearOwnerCache() {
  cached = undefined;
}
