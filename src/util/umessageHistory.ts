import type { ApiMessage } from '../api/types';

import { UMESSAGE_HISTORY_IDB_STORE } from './browser/idb';

// U message "Save deleted messages": messages others delete and earlier versions of edited messages,
// kept in this browser only (IndexedDB), per Telegram user, like the Android app keeps them on the phone.
const store = UMESSAGE_HISTORY_IDB_STORE;

export type UMessageEditVersion = { text: string; date: number };

// Deletions the user started here must not be "kept"
const ownDeletionKeys = new Set<string>();
const OWN_DELETION_TTL_MS = 60_000;

function messageKey(chatId: string, id: number) {
  return `${chatId}:${id}`;
}

export function markOwnDeletion(chatId: string, ids: number[]) {
  ids.forEach((id) => {
    const key = messageKey(chatId, id);
    ownDeletionKeys.add(key);
    setTimeout(() => ownDeletionKeys.delete(key), OWN_DELETION_TTL_MS);
  });
}

export function isOwnDeletion(chatId: string, id: number) {
  return ownDeletionKeys.has(messageKey(chatId, id));
}

export function saveDeletedMessage(userId: string, message: ApiMessage) {
  void store.set(`deleted:${userId}:${messageKey(message.chatId, message.id)}`, message);
}

export async function saveEditVersion(userId: string, chatId: string, id: number, version: UMessageEditVersion) {
  const key = `edits:${userId}:${messageKey(chatId, id)}`;
  const versions = (await store.get<UMessageEditVersion[]>(key)) || [];
  if (versions[versions.length - 1]?.text === version.text) return;
  await store.set(key, [...versions, version]);
}

export async function getEditHistory(userId: string, chatId: string, id: number) {
  return (await store.get<UMessageEditVersion[]>(`edits:${userId}:${messageKey(chatId, id)}`)) || [];
}

// Rough size for Settings → Local data: the JSON length of everything kept
export async function getHistorySizeBytes() {
  const entries = await store.entries<string, unknown>();
  return entries.reduce((sum, [key, value]) => sum + key.length + JSON.stringify(value).length, 0);
}

export function clearHistory() {
  return store.clear();
}

// Signing out removes what was kept for that user, so nothing stays behind on a shared computer
export async function clearHistoryForUser(userId: string) {
  const keys = (await store.keys<string>())
    .filter((key) => key.startsWith(`deleted:${userId}:`) || key.startsWith(`edits:${userId}:`));
  if (keys.length) await store.delMany(keys);
}
