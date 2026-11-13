import type { GlobalState } from '../types';

import { isUserId } from '../../util/entities/ids';
import { selectSettingsKeys } from './settings';

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
