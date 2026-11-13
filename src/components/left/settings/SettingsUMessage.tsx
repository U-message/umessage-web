import { memo, useMemo } from '../../../lib/teact/teact';
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
    } = selectSettingsKeys(global);

    return {
      isGhostMode: umGhostMode,
      ghostScope: umGhostScope || 'all',
      ghostUsersCount: umGhostUserIds?.length || 0,
      shouldBlockAds: umBlockAds,
      shouldConfirmSticker: umConfirmSticker,
      shouldConfirmVoice: umConfirmVoice,
      shouldConfirmGif: umConfirmGif,
    };
  },
)(SettingsUMessage));
