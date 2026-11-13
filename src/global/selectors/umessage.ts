import type { GlobalState } from '../types';
import { MAIN_THREAD_ID } from '../../api/types';

import { SERVICE_NOTIFICATIONS_USER_ID } from '../../config';
import { isUserId } from '../../util/entities/ids';
import { isDeletedUser, isUserBot } from '../helpers/users';
import { selectChatLastMessage } from './chats';
import { selectSettingsKeys } from './settings';
import { selectThreadReadState } from './threads';
import { selectUser } from './users';

export const UMESSAGE_TRASH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Ghost mode hides typing and read receipts per chat; the scope decides which private chats it covers
export function selectIsUMessageGhostFor<T extends GlobalState>(global: T, chatId: string) {
  const { umGhostMode, umGhostScope = 'all', umGhostUserIds } = selectSettingsKeys(global);
  if (!umGhostMode) return false;
  if (umGhostScope === 'all') return true;

  const isListed = isUserId(chatId) && Boolean(umGhostUserIds?.includes(chatId));
  return umGhostScope === 'only' ? isListed : !isListed;
}

// The online status is one server-side value: only the "everyone" scope keeps reporting offline
export function selectIsUMessageGhostOnline<T extends GlobalState>(global: T) {
  const { umGhostMode, umGhostScope = 'all' } = selectSettingsKeys(global);
  return Boolean(umGhostMode) && umGhostScope === 'all';
}

export function selectShouldUMessageBlockAds<T extends GlobalState>(global: T) {
  return Boolean(selectSettingsKeys(global).umBlockAds);
}

// As on Android: a private chat with someone who is not a contact and you never wrote to
export function selectIsUMessageStranger<T extends GlobalState>(global: T, chatId: string) {
  if (!isUserId(chatId) || chatId === global.currentUserId || chatId === SERVICE_NOTIFICATIONS_USER_ID) return false;

  const user = selectUser(global, chatId);
  if (!user || user.isContact || user.isSupport || user.isVerified || isUserBot(user) || isDeletedUser(user)) {
    return false;
  }
  if (selectThreadReadState(global, chatId, MAIN_THREAD_ID)?.lastReadOutboxMessageId) return false;

  return !selectChatLastMessage(global, chatId)?.isOutgoing;
}

export function selectIsUMessageTrashed<T extends GlobalState>(global: T, chatId: string) {
  return Boolean(selectSettingsKeys(global).umTrash?.some((entry) => entry.chatId === chatId));
}

// Kept out of the chat list and silent: hidden chats, chats in the trash and, with protection on, strangers
export function selectIsUMessageHiddenFromList<T extends GlobalState>(global: T, chatId: string) {
  const { umHiddenChatIds, umStrangerProtection } = selectSettingsKeys(global);
  return Boolean(umHiddenChatIds?.includes(chatId))
    || selectIsUMessageTrashed(global, chatId)
    || (Boolean(umStrangerProtection) && selectIsUMessageStranger(global, chatId));
}

// Focus mode, as on Android: inside the focus hours (which may wrap midnight) only allowed folders notify
export function selectIsUMessageFocusActiveNow<T extends GlobalState>(global: T, now = new Date()) {
  const { umFocusEnabled, umFocusStart = 9 * 60, umFocusEnd = 18 * 60 } = selectSettingsKeys(global);
  if (!umFocusEnabled) return false;

  const minutes = now.getHours() * 60 + now.getMinutes();
  if (umFocusStart === umFocusEnd) return true;
  return umFocusStart < umFocusEnd
    ? minutes >= umFocusStart && minutes < umFocusEnd
    : minutes >= umFocusStart || minutes < umFocusEnd;
}

// Privacy Guard settings with the Android defaults filled in
export function selectUMessagePrivacyGuard<T extends GlobalState>(global: T) {
  const {
    umPgEnabled, umPgMode, umPgAction, umPgSensitivity, umPgHideOwnerAway, umPgPasscode,
  } = selectSettingsKeys(global);
  return {
    isEnabled: Boolean(umPgEnabled),
    mode: umPgMode || 'looking',
    action: umPgAction || 'blur',
    sensitivity: umPgSensitivity ?? 1,
    shouldHideWhenOwnerAway: umPgHideOwnerAway ?? true,
    passcode: umPgPasscode,
  };
}
