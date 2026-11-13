import { memo, useEffect, useMemo, useState } from '../../../lib/teact/teact';
import { getActions, withGlobal } from '../../../global';

import type { UMessageGhostScope } from '../../../types';
import { SettingsScreens } from '../../../types';

import { selectSettingsKeys } from '../../../global/selectors';

import useHistoryBack from '../../../hooks/useHistoryBack';
import useLang from '../../../hooks/useLang';
import useLastCallback from '../../../hooks/useLastCallback';

import Island, { IslandTitle } from '../../gili/layout/Island';
import Checkbox from '../../ui/Checkbox';
import ListItem from '../../ui/ListItem';
import RadioGroup from '../../ui/RadioGroup';
import TextArea from '../../ui/TextArea';

type OwnProps = {
  isActive?: boolean;
  onReset: () => void;
};

type StateProps = {
  isGhostMode?: boolean;
  ghostScope: UMessageGhostScope;
  ghostUsersCount: number;
  shouldBlockAds?: boolean;
  shouldConfirmSticker?: boolean;
  shouldConfirmVoice?: boolean;
  shouldConfirmGif?: boolean;
  hiddenChatsCount: number;
  trashCount: number;
  hasStrangerProtection?: boolean;
  hasAutoReply?: boolean;
  autoReplyText?: string;
  templatesCount: number;
};

const SettingsUMessage = ({
  isActive,
  isGhostMode,
  ghostScope,
  ghostUsersCount,
  shouldBlockAds,
  shouldConfirmSticker,
  shouldConfirmVoice,
  shouldConfirmGif,
  hiddenChatsCount,
  trashCount,
  hasStrangerProtection,
  hasAutoReply,
  autoReplyText,
  templatesCount,
  onReset,
}: OwnProps & StateProps) => {
  const {
    setSettingOption, openSettingsScreen, setUMessageGhostMode, setUMessageGhostScope,
  } = getActions();
  const lang = useLang();

  useHistoryBack({ isActive, onBack: onReset });

  const scopeOptions = useMemo(() => [
    { value: 'all', label: lang('UMessageGhostScopeAll') },
    { value: 'only', label: lang('UMessageGhostScopeOnly') },
    { value: 'except', label: lang('UMessageGhostScopeExcept') },
  ], [lang]);

  const handleScopeChange = useLastCallback((value: string) => {
    setUMessageGhostScope({ scope: value as UMessageGhostScope });
  });

  const handleOpenGhostUsers = useLastCallback(() => {
    openSettingsScreen({ screen: SettingsScreens.UMessageGhostUsers });
  });

  const [replyDraft, setReplyDraft] = useState(() => autoReplyText ?? lang('UMessageAutoReplyDefault'));
  useEffect(() => {
    setReplyDraft(autoReplyText ?? lang('UMessageAutoReplyDefault'));
  }, [autoReplyText, lang]);

  const handleAutoReplyToggle = useLastCallback((isChecked: boolean) => {
    // A fresh start answers everyone once again, like on Android
    setSettingOption({ umAutoReply: isChecked, umAutoRepliedChatIds: [] });
  });

  const handleReplyTextSave = useLastCallback(() => {
    const text = replyDraft.trim();
    setSettingOption({ umAutoReplyText: text || undefined });
  });

  return (
    <div className="settings-content custom-scroll">
      <IslandTitle dir={lang.isRtl ? 'rtl' : undefined}>{lang('UMessageSectionPrivacy')}</IslandTitle>
      <Island>
        <Checkbox
          label={lang('UMessageGhostMode')}
          subLabel={lang('UMessageGhostModeInfo')}
          checked={Boolean(isGhostMode)}
          onCheck={(isChecked) => setUMessageGhostMode({ isEnabled: isChecked })}
        />
      </Island>

      {isGhostMode && (
        <>
          <IslandTitle dir={lang.isRtl ? 'rtl' : undefined}>{lang('UMessageGhostScope')}</IslandTitle>
          <Island>
            <RadioGroup
              name="umessage-ghost-scope"
              options={scopeOptions}
              selected={ghostScope}
              onChange={handleScopeChange}
            />
            {ghostScope !== 'all' && (
              <ListItem icon="add-user" narrow onClick={handleOpenGhostUsers}>
                <span className="title">{lang('UMessageGhostUsers')}</span>
                <span className="settings-item__current-value">{ghostUsersCount || ''}</span>
              </ListItem>
            )}
          </Island>
        </>
      )}

      <IslandTitle dir={lang.isRtl ? 'rtl' : undefined}>{lang('UMessageSectionProtection')}</IslandTitle>
      <Island>
        <ListItem
          icon="eye-crossed"
          narrow
          onClick={() => openSettingsScreen({ screen: SettingsScreens.UMessageHiddenChats })}
        >
          <span className="title">{lang('UMessageHiddenChats')}</span>
          <span className="settings-item__current-value">{hiddenChatsCount || ''}</span>
        </ListItem>
        <ListItem
          icon="delete"
          narrow
          onClick={() => openSettingsScreen({ screen: SettingsScreens.UMessageChatTrash })}
        >
          <span className="title">{lang('UMessageChatTrash')}</span>
          <span className="settings-item__current-value">{trashCount || ''}</span>
        </ListItem>
      </Island>

      <IslandTitle dir={lang.isRtl ? 'rtl' : undefined}>{lang('UMessageSectionStrangers')}</IslandTitle>
      <Island>
        <Checkbox
          label={lang('UMessageStrangerProtection')}
          subLabel={lang('UMessageStrangerProtectionInfo')}
          checked={Boolean(hasStrangerProtection)}
          onCheck={(isChecked) => setSettingOption({ umStrangerProtection: isChecked })}
        />
        {hasStrangerProtection && (
          <ListItem
            icon="user"
            narrow
            onClick={() => openSettingsScreen({ screen: SettingsScreens.UMessageStrangerChats })}
          >
            <span className="title">{lang('UMessageStrangerChats')}</span>
          </ListItem>
        )}
      </Island>

      <IslandTitle dir={lang.isRtl ? 'rtl' : undefined}>{lang('UMessageSectionAutoReply')}</IslandTitle>
      <Island>
        <Checkbox
          label={lang('UMessageAutoReply')}
          subLabel={lang('UMessageAutoReplyInfo')}
          checked={Boolean(hasAutoReply)}
          onCheck={handleAutoReplyToggle}
        />
        {hasAutoReply && (
          <div className="settings-item">
            <TextArea
              label={lang('UMessageAutoReplyText')}
              value={replyDraft}
              onChange={(e) => setReplyDraft(e.currentTarget.value)}
              onBlur={handleReplyTextSave}
            />
          </div>
        )}
        <ListItem
          icon="reply"
          narrow
          onClick={() => openSettingsScreen({ screen: SettingsScreens.UMessageTemplates })}
        >
          <span className="title">{lang('UMessageTemplates')}</span>
          <span className="settings-item__current-value">{templatesCount || ''}</span>
        </ListItem>
      </Island>

      <IslandTitle dir={lang.isRtl ? 'rtl' : undefined}>{lang('UMessageSectionGeneral')}</IslandTitle>
      <Island>
        <Checkbox
          label={lang('UMessageBlockAds')}
          subLabel={lang('UMessageBlockAdsInfo')}
          checked={Boolean(shouldBlockAds)}
          onCheck={(isChecked) => setSettingOption({ umBlockAds: isChecked })}
        />
      </Island>

      <IslandTitle dir={lang.isRtl ? 'rtl' : undefined}>{lang('UMessageSectionConfirm')}</IslandTitle>
      <Island>
        <Checkbox
          label={lang('UMessageConfirmSticker')}
          subLabel={lang('UMessageConfirmStickerInfo')}
          checked={Boolean(shouldConfirmSticker)}
          onCheck={(isChecked) => setSettingOption({ umConfirmSticker: isChecked })}
        />
        <Checkbox
          label={lang('UMessageConfirmVoice')}
          subLabel={lang('UMessageConfirmVoiceInfo')}
          checked={Boolean(shouldConfirmVoice)}
          onCheck={(isChecked) => setSettingOption({ umConfirmVoice: isChecked })}
        />
        <Checkbox
          label={lang('UMessageConfirmGif')}
          subLabel={lang('UMessageConfirmGifInfo')}
          checked={Boolean(shouldConfirmGif)}
          onCheck={(isChecked) => setSettingOption({ umConfirmGif: isChecked })}
        />
      </Island>
    </div>
  );
};

export default memo(withGlobal<OwnProps>(
  (global): Complete<StateProps> => {
    const {
      umGhostMode, umGhostScope, umGhostUserIds, umBlockAds, umConfirmSticker, umConfirmVoice, umConfirmGif,
      umHiddenChatIds, umTrash, umStrangerProtection, umAutoReply, umAutoReplyText, umTemplates,
    } = selectSettingsKeys(global);

    return {
      isGhostMode: umGhostMode,
      ghostScope: umGhostScope || 'all',
      ghostUsersCount: umGhostUserIds?.length || 0,
      shouldBlockAds: umBlockAds,
      shouldConfirmSticker: umConfirmSticker,
      shouldConfirmVoice: umConfirmVoice,
      shouldConfirmGif: umConfirmGif,
      hiddenChatsCount: umHiddenChatIds?.length || 0,
      trashCount: umTrash?.length || 0,
      hasStrangerProtection: umStrangerProtection,
      hasAutoReply: umAutoReply,
      autoReplyText: umAutoReplyText,
      templatesCount: umTemplates?.length || 0,
    };
  },
)(SettingsUMessage));
