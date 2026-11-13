import type { ApiPrivacySettings } from '../../../api/types';
import type { UMessageGhostScope, UMessageTrashEntry } from '../../../types';
import type { RequiredGlobalActions } from '../../index';
import type { ActionReturnType, GlobalState } from '../../types';
import { MAIN_THREAD_ID } from '../../../api/types';

import { SERVICE_NOTIFICATIONS_USER_ID } from '../../../config';
import { isUserId } from '../../../util/entities/ids';
import { getCurrentTabId, isCurrentTabMaster } from '../../../util/establishMultitabRole';
import { unique } from '../../../util/iteratees';
import { getTranslationFn } from '../../../util/localization';
import { callApi } from '../../../api/gramjs';
import { buildApiInputPrivacyRules, isChatBasicGroup, isUserBot } from '../../helpers';
import { getIsChatMuted } from '../../helpers/notifications';
import { addActionHandler, getGlobal, setGlobal } from '../../index';
import { replaceSettings } from '../../reducers';
import {
  selectChat,
  selectIsUMessageGhostFor,
  selectIsUMessageGhostOnline,
  selectIsUMessageHiddenFromList,
  selectNotifyDefaults,
  selectNotifyException,
  selectSettingsKeys,
  selectUser,
  UMESSAGE_TRASH_TTL_MS,
} from '../../selectors';

// Ghost mode's online part, ported from the Android app's UMessageGhostScope:
// "everyone" keeps the client offline; the two list scopes stay online and let the
// "Last seen & online" privacy rule hide the status, with the user's own rule backed up and restored.

addActionHandler('setUMessageGhostMode', (global, actions, payload): ActionReturnType => {
  global = replaceSettings(global, { umGhostMode: payload.isEnabled });
  setGlobal(global);
  syncGhostOnline(global);
  void syncGhostPrivacy();
});

addActionHandler('setUMessageGhostScope', (global, actions, payload): ActionReturnType => {
  global = replaceSettings(global, { umGhostScope: payload.scope });
  setGlobal(global);
  syncGhostOnline(global);
  void syncGhostPrivacy();
});

addActionHandler('setUMessageGhostUsers', (global, actions, payload): ActionReturnType => {
  global = replaceSettings(global, { umGhostUserIds: unique(payload.userIds) });
  setGlobal(global);
  void syncGhostPrivacy();
});

function syncGhostOnline(global: GlobalState) {
  if (global.connectionState !== 'connectionStateReady') return;
  void callApi('updateIsOnline', !selectIsUMessageGhostOnline(global));
}

function wantsPrivacyRule(scope: UMessageGhostScope, userIds: string[], isGhostMode?: boolean) {
  if (!isGhostMode) return false;
  return scope === 'except' || (scope === 'only' && userIds.length > 0);
}

let isSyncingPrivacy = false;
let shouldResyncPrivacy = false;

async function syncGhostPrivacy() {
  if (isSyncingPrivacy) {
    shouldResyncPrivacy = true;
    return;
  }
  isSyncingPrivacy = true;
  try {
    do {
      shouldResyncPrivacy = false;
      await applyGhostPrivacy();
    } while (shouldResyncPrivacy);
  } finally {
    isSyncingPrivacy = false;
  }
}

async function applyGhostPrivacy() {
  let global = getGlobal();
  const {
    umGhostMode, umGhostScope = 'all', umGhostUserIds = [], umGhostPrivacyBackup,
  } = selectSettingsKeys(global);

  if (!wantsPrivacyRule(umGhostScope, umGhostUserIds, umGhostMode)) {
    if (!umGhostPrivacyBackup) return;
    if (await setLastSeenPrivacy(umGhostPrivacyBackup)) {
      global = getGlobal();
      global = replaceSettings(global, { umGhostPrivacyBackup: undefined });
      setGlobal(global);
    }
    return;
  }

  let backup = umGhostPrivacyBackup;
  if (!backup) {
    // First time: remember the user's own rule before replacing it
    const result = await callApi('fetchPrivacySettings', 'lastSeen');
    if (!result) return;
    backup = result.rules;
    global = getGlobal();
    global = replaceSettings(global, { umGhostPrivacyBackup: backup });
    setGlobal(global);
  }

  await setLastSeenPrivacy(buildGhostRule(backup, umGhostScope, umGhostUserIds));
}

function buildGhostRule(
  original: ApiPrivacySettings, scope: UMessageGhostScope, userIds: string[],
): ApiPrivacySettings {
  if (scope === 'except') {
    // Only the chosen users still see the status
    return {
      visibility: 'nobody',
      allowUserIds: userIds,
      allowChatIds: [],
      blockUserIds: [],
      blockChatIds: [],
      botsPrivacy: original.botsPrivacy,
    };
  }

  // "Only selected": the user's own rule, plus the chosen users never seeing the status
  return {
    ...original,
    allowUserIds: original.allowUserIds.filter((id) => !userIds.includes(id)),
    blockUserIds: unique([...userIds, ...original.blockUserIds]),
  };
}

async function setLastSeenPrivacy(settings: ApiPrivacySettings) {
  let global = getGlobal();
  const rules = buildApiInputPrivacyRules(global, {
    visibility: settings.visibility,
    isUnspecified: settings.isUnspecified,
    shouldAllowPremium: settings.shouldAllowPremium,
    allowedIds: [...settings.allowUserIds, ...settings.allowChatIds],
    blockedIds: [...settings.blockUserIds, ...settings.blockChatIds],
    botsPrivacy: settings.botsPrivacy,
  });

  const result = await callApi('setPrivacySettings', 'lastSeen', rules);
  if (!result) return false;

  global = getGlobal();
  global = {
    ...global,
    settings: {
      ...global.settings,
      privacy: { ...global.settings.privacy, lastSeen: result.rules },
    },
  };
  setGlobal(global);
  return true;
}

// Hidden chats and folders, as in the Android app: kept out of the chat list and silent, opened behind a PIN

addActionHandler('setUMessageChatsHidden', (global, actions, payload): ActionReturnType => {
  const { chatIds, isHidden } = payload;
  const current = selectSettingsKeys(global).umHiddenChatIds || [];
  const next = isHidden ? unique([...current, ...chatIds]) : current.filter((id) => !chatIds.includes(id));
  global = replaceSettings(global, { umHiddenChatIds: next });

  actions.showNotification({
    message: { key: isHidden ? 'UMessageHideChat' : 'UMessageChatsShown' },
    tabId: getCurrentTabId(),
  });
  return global;
});

addActionHandler('setUMessageFolderHidden', (global, actions, payload): ActionReturnType => {
  const { folderId, isHidden } = payload;
  const current = selectSettingsKeys(global).umHiddenFolderIds || [];
  const next = isHidden ? unique([...current, folderId]) : current.filter((id) => id !== folderId);
  return replaceSettings(global, { umHiddenFolderIds: next });
});

// Chat trash: a deleted chat is only hidden for 7 days; then (or on "Delete now") the real deletion runs

addActionHandler('trashUMessageChat', (global, actions, payload): ActionReturnType => {
  const { chatId, action } = payload;
  const trash = (selectSettingsKeys(global).umTrash || []).filter((entry) => entry.chatId !== chatId);
  global = replaceSettings(global, { umTrash: [...trash, { chatId, action, trashedAt: Date.now() }] });

  actions.showNotification({
    title: { key: 'UMessageChatTrashed' },
    message: { key: 'UMessageChatTrashedInfo' },
    tabId: getCurrentTabId(),
  });
  return global;
});

addActionHandler('restoreUMessageChat', (global, actions, payload): ActionReturnType => {
  const trash = (selectSettingsKeys(global).umTrash || []).filter((entry) => entry.chatId !== payload.chatId);
  return replaceSettings(global, { umTrash: trash });
});

addActionHandler('purgeUMessageTrash', (global, actions, payload): ActionReturnType => {
  const { chatIds, isAll } = payload || {};
  const trash = selectSettingsKeys(global).umTrash || [];
  if (!trash.length) return undefined;

  const now = Date.now();
  const due = trash.filter((entry) => (
    isAll || chatIds?.includes(entry.chatId) || now - entry.trashedAt >= UMESSAGE_TRASH_TTL_MS
  ));
  if (!due.length) return undefined;

  global = replaceSettings(global, { umTrash: trash.filter((entry) => !due.includes(entry)) });
  setGlobal(global);

  due.forEach((entry) => runTrashDeletion(global, actions, entry));
  return undefined;
});

// The same deletion the "Delete chat" dialog would have run, decided by the chat type at purge time
function runTrashDeletion(global: GlobalState, actions: RequiredGlobalActions, entry: UMessageTrashEntry) {
  const { chatId } = entry;
  const tabId = getCurrentTabId();
  const chat = selectChat(global, chatId);
  if (!chat) return;

  if (isUserId(chatId)) {
    actions.deleteHistory({ chatId, shouldDeleteForAll: false, tabId });
  } else if (isChatBasicGroup(chat)) {
    if (chat.isOwner && entry.action === 'leave') {
      actions.leaveBasicGroup({ chatId, tabId });
    } else if (chat.isOwner) {
      actions.deleteHistory({ chatId, shouldDeleteForAll: true, tabId });
      actions.deleteChat({ chatId, tabId });
    } else {
      actions.deleteHistory({ chatId, shouldDeleteForAll: false, tabId });
      actions.deleteChatUser({ chatId, userId: global.currentUserId!, tabId });
    }
  } else if (chat.isOwner && entry.action === 'delete') {
    actions.deleteChannel({ chatId, tabId });
  } else {
    actions.leaveChannel({ chatId, tabId });
  }
}

// Auto reply: one answer per private chat, not to muted chats, never in ghost mode (it would give us away)

addActionHandler('processUMessageIncoming', (global, actions, payload): ActionReturnType => {
  const { chatId, message } = payload;
  if (!isCurrentTabMaster() || message.isOutgoing || message.content.action || !isUserId(chatId)) return undefined;

  const { umAutoReply, umAutoReplyText, umAutoRepliedChatIds = [] } = selectSettingsKeys(global);
  if (!umAutoReply || umAutoRepliedChatIds.includes(chatId)) return undefined;

  const user = selectUser(global, chatId);
  const chat = selectChat(global, chatId);
  if (!user || !chat || user.isSelf || user.isSupport || isUserBot(user) || chatId === SERVICE_NOTIFICATIONS_USER_ID
    || selectIsUMessageHiddenFromList(global, chatId) || selectIsUMessageGhostFor(global, chatId)
    || getIsChatMuted(chat, selectNotifyDefaults(global), selectNotifyException(global, chatId))) {
    return undefined;
  }

  const text = umAutoReplyText?.trim() || getTranslationFn()('UMessageAutoReplyDefault');
  global = replaceSettings(global, { umAutoRepliedChatIds: [...umAutoRepliedChatIds, chatId] });
  setGlobal(global);

  actions.sendMessage({
    messageList: { chatId, threadId: MAIN_THREAD_ID, type: 'thread' },
    text,
    tabId: getCurrentTabId(),
  });
  return undefined;
});
