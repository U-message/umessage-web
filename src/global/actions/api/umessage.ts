import type { ApiPrivacySettings } from '../../../api/types';
import type { UMessageGhostScope } from '../../../types';
import type { ActionReturnType, GlobalState } from '../../types';

import { unique } from '../../../util/iteratees';
import { callApi } from '../../../api/gramjs';
import { buildApiInputPrivacyRules } from '../../helpers';
import { addActionHandler, getGlobal, setGlobal } from '../../index';
import { replaceSettings } from '../../reducers';
import { selectIsUMessageGhostOnline, selectSettingsKeys } from '../../selectors';

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
