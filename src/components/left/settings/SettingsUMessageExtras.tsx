import {
  memo, useEffect, useMemo, useState,
} from '../../../lib/teact/teact';
import { getActions, withGlobal } from '../../../global';

import type { ApiChatFolder } from '../../../api/types';

import { selectSettingsKeys } from '../../../global/selectors';
import { clearHistory, getHistorySizeBytes } from '../../../util/umessageHistory';

import useFlag from '../../../hooks/useFlag';
import useLang from '../../../hooks/useLang';
import useLastCallback from '../../../hooks/useLastCallback';

import Island, { IslandDescription, IslandTitle } from '../../gili/layout/Island';
import Checkbox from '../../ui/Checkbox';
import ConfirmDialog from '../../ui/ConfirmDialog';
import ListItem from '../../ui/ListItem';
import RadioGroup from '../../ui/RadioGroup';

type StateProps = {
  isFocusEnabled?: boolean;
  focusStart: number;
  focusEnd: number;
  focusFolderIds?: number[];
  isReminderEnabled?: boolean;
  reminderDelayMinutes: number;
  reminderSound: 'notification' | 'none';
  shouldSaveDeleted?: boolean;
  hasAdminFolders: boolean;
  folders: ApiChatFolder[];
};

const DEFAULT_FOCUS_START = 9 * 60;
const DEFAULT_FOCUS_END = 18 * 60;
const REMINDER_DELAYS_MINUTES = [1, 5, 10, 15, 30, 60];
const KB = 1024;

function toTimeValue(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function fromTimeValue(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

// U message phase 3 sections: reminders and focus, deleted messages, admin folders, local data
const SettingsUMessageExtras = ({
  isFocusEnabled, focusStart, focusEnd, focusFolderIds, isReminderEnabled, reminderDelayMinutes, reminderSound,
  shouldSaveDeleted, hasAdminFolders, folders,
}: StateProps) => {
  const { setSettingOption, setUMessageAdminFolders, showNotification } = getActions();
  const lang = useLang();
  const [historySize, setHistorySize] = useState<number>();
  const [isClearConfirmOpen, openClearConfirm, closeClearConfirm] = useFlag();

  useEffect(() => {
    void getHistorySizeBytes().then(setHistorySize);
  }, [shouldSaveDeleted]);

  const delayOptions = useMemo(() => {
    const format = new Intl.NumberFormat(lang.code, { style: 'unit', unit: 'minute', unitDisplay: 'long' });
    return REMINDER_DELAYS_MINUTES.map((minutes) => ({ value: String(minutes), label: format.format(minutes) }));
  }, [lang]);

  const soundOptions = useMemo(() => [
    { value: 'notification', label: lang('UMessageSoundNotification') },
    { value: 'none', label: lang('UMessageSoundNone') },
  ], [lang]);

  const toggleFocusFolder = useLastCallback((folderId: number, isChecked: boolean) => {
    const current = focusFolderIds || [];
    setSettingOption({
      umFocusFolderIds: isChecked ? [...current, folderId] : current.filter((id) => id !== folderId),
    });
  });

  const handleClear = useLastCallback(async () => {
    closeClearConfirm();
    await clearHistory();
    setHistorySize(0);
    showNotification({ message: { key: 'UMessageLocalDataCleared' } });
  });

  return (
    <>
      <IslandTitle dir={lang.isRtl ? 'rtl' : undefined}>{lang('UMessageSectionReminderFocus')}</IslandTitle>
      <Island>
        <Checkbox
          label={lang('UMessageReminder')}
          subLabel={lang('UMessageReminderInfo')}
          checked={Boolean(isReminderEnabled)}
          onCheck={(isChecked) => setSettingOption({ umReminder: isChecked })}
        />
        <Checkbox
          label={lang('UMessageFocus')}
          subLabel={lang('UMessageFocusInfo')}
          checked={Boolean(isFocusEnabled)}
          onCheck={(isChecked) => setSettingOption({ umFocusEnabled: isChecked })}
        />
      </Island>

      {isReminderEnabled && (
        <>
          <IslandTitle dir={lang.isRtl ? 'rtl' : undefined}>{lang('UMessageReminderDelay')}</IslandTitle>
          <Island>
            <RadioGroup
              name="umessage-reminder-delay"
              options={delayOptions}
              selected={String(reminderDelayMinutes)}
              onChange={(value) => setSettingOption({ umReminderDelayMinutes: Number(value) })}
            />
          </Island>
          <IslandTitle dir={lang.isRtl ? 'rtl' : undefined}>{lang('UMessageReminderSound')}</IslandTitle>
          <Island>
            <RadioGroup
              name="umessage-reminder-sound"
              options={soundOptions}
              selected={reminderSound}
              onChange={(value) => setSettingOption({ umReminderSound: value as 'notification' | 'none' })}
            />
          </Island>
        </>
      )}

      {isFocusEnabled && (
        <>
          <IslandTitle dir={lang.isRtl ? 'rtl' : undefined}>{lang('UMessageFocus')}</IslandTitle>
          <Island>
            <div className="settings-item">
              <label>{lang('UMessageFocusFrom')}</label>
              <input
                className="form-control"
                type="time"
                value={toTimeValue(focusStart)}
                onChange={(e) => setSettingOption({ umFocusStart: fromTimeValue(e.currentTarget.value) })}
              />
              <label>{lang('UMessageFocusTo')}</label>
              <input
                className="form-control"
                type="time"
                value={toTimeValue(focusEnd)}
                onChange={(e) => setSettingOption({ umFocusEnd: fromTimeValue(e.currentTarget.value) })}
              />
            </div>
          </Island>
          <IslandTitle dir={lang.isRtl ? 'rtl' : undefined}>{lang('UMessageFocusFolders')}</IslandTitle>
          <Island>
            {folders.length ? folders.map((folder) => (
              <Checkbox
                key={folder.id}
                label={folder.title.text}
                checked={Boolean(focusFolderIds?.includes(folder.id))}
                onCheck={(isChecked) => toggleFocusFolder(folder.id, isChecked)}
              />
            )) : (
              <p className="settings-item-description">{lang('UMessageFocusNoFolders')}</p>
            )}
          </Island>
          <IslandDescription dir={lang.isRtl ? 'rtl' : undefined}>{lang('UMessageFocusFoldersInfo')}</IslandDescription>
        </>
      )}

      <IslandTitle dir={lang.isRtl ? 'rtl' : undefined}>{lang('UMessageSectionFolders')}</IslandTitle>
      <Island>
        <Checkbox
          label={lang('UMessageAdminFolders')}
          subLabel={lang('UMessageAdminFoldersInfo')}
          checked={hasAdminFolders}
          onCheck={(isChecked) => setUMessageAdminFolders({ isEnabled: isChecked })}
        />
      </Island>

      <IslandTitle dir={lang.isRtl ? 'rtl' : undefined}>{lang('UMessageLocalData')}</IslandTitle>
      <Island>
        <Checkbox
          label={lang('UMessageSaveDeleted')}
          subLabel={lang('UMessageSaveDeletedInfo')}
          checked={Boolean(shouldSaveDeleted)}
          onCheck={(isChecked) => setSettingOption({ umSaveDeleted: isChecked })}
        />
        <ListItem icon="delete" narrow disabled={!historySize} onClick={openClearConfirm}>
          <span className="title">{lang('UMessageLocalDataClear')}</span>
          <span className="settings-item__current-value">
            {historySize ? `${lang('UMessageLocalHistorySize')}: ${Math.max(1, Math.round(historySize / KB))} KB` : ''}
          </span>
        </ListItem>
      </Island>
      <ConfirmDialog
        isOpen={isClearConfirmOpen}
        title={lang('UMessageLocalDataClear')}
        text={lang('UMessageLocalDataConfirm')}
        confirmLabel={lang('Delete')}
        confirmIsDestructive
        confirmHandler={handleClear}
        onClose={closeClearConfirm}
      />
    </>
  );
};

export default memo(withGlobal(
  (global): Complete<StateProps> => {
    const {
      umFocusEnabled, umFocusStart, umFocusEnd, umFocusFolderIds, umReminder, umReminderDelayMinutes,
      umReminderSound, umSaveDeleted, umAdminFolderIds,
    } = selectSettingsKeys(global);
    const { byId, orderedIds } = global.chatFolders;

    return {
      isFocusEnabled: umFocusEnabled,
      focusStart: umFocusStart ?? DEFAULT_FOCUS_START,
      focusEnd: umFocusEnd ?? DEFAULT_FOCUS_END,
      focusFolderIds: umFocusFolderIds,
      isReminderEnabled: umReminder,
      reminderDelayMinutes: umReminderDelayMinutes ?? 5,
      reminderSound: umReminderSound || 'notification',
      shouldSaveDeleted: umSaveDeleted,
      hasAdminFolders: Boolean(umAdminFolderIds?.length),
      folders: (orderedIds || []).map((id) => byId[id]).filter(Boolean),
    };
  },
)(SettingsUMessageExtras));
