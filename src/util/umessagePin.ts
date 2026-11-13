import type { UMessagePinHash } from '../types';

// Same scheme as the Android app: PBKDF2-HMAC-SHA256 over the PIN with a random hex salt; only the hash is stored
const PIN_KDF_ITERATIONS = 120_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;
// Wrong PINs lock the screen for growing periods, capped at an hour like on Android
const LOCKOUT_FREE_TRIES = 4;
const LOCKOUT_BASE_MS = 30_000;
const LOCKOUT_MAX_MS = 60 * 60 * 1000;

export const UMESSAGE_PIN_MIN_LENGTH = 4;

let wrongTries = 0;
let lockedUntil = 0;
let isHiddenUnlocked = false;

function toHex(bytes: ArrayBuffer | Uint8Array) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function derive(pin: string, salt: string, iterations: number) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations }, key, HASH_BITS,
  );
  return toHex(bits);
}

export async function createPinHash(pin: string): Promise<UMessagePinHash> {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(SALT_BYTES)));
  return { salt, hash: await derive(pin, salt, PIN_KDF_ITERATIONS), iterations: PIN_KDF_ITERATIONS };
}

export function getPinLockRemainingMs() {
  return Math.max(0, lockedUntil - Date.now());
}

export async function checkPin(pin: string, stored: UMessagePinHash) {
  if (getPinLockRemainingMs()) return false;

  const isMatch = await derive(pin, stored.salt, stored.iterations) === stored.hash;
  if (isMatch) {
    wrongTries = 0;
    return true;
  }

  wrongTries += 1;
  if (wrongTries > LOCKOUT_FREE_TRIES) {
    const lockMs = Math.min(LOCKOUT_MAX_MS, LOCKOUT_BASE_MS * 2 ** (wrongTries - LOCKOUT_FREE_TRIES - 1));
    lockedUntil = Date.now() + lockMs;
  }
  return false;
}

// Hidden chats stay open until the page reloads, like an unlocked screen
export function getIsHiddenUnlocked() {
  return isHiddenUnlocked;
}

export function setIsHiddenUnlocked(value: boolean) {
  isHiddenUnlocked = value;
}
