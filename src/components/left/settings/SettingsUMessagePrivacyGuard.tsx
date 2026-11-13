import type { FormEvent } from 'react';
import {
  memo, useEffect, useMemo, useState,
} from '../../../lib/teact/teact';
import { getActions, withGlobal } from '../../../global';

import type { UMessagePinHash } from '../../../types';
import { SettingsScreens } from '../../../types';

import { selectUMessagePrivacyGuard } from '../../../global/selectors';
import { deleteOwnerTemplates, hasOwnerTemplates } from '../../../util/privacyGuard/ownerStore';
import { createPinHash, UMESSAGE_PIN_MIN_LENGTH } from '../../../util/umessagePin';

import useFlag from '../../../hooks/useFlag';
import useHistoryBack from '../../../hooks/useHistoryBack';
import useLang from '../../../hooks/useLang';
import useLastCallback from '../../../hooks/useLastCallback';

import Island, { IslandDescription, IslandTitle } from '../../gili/layout/Island';
import Button from '../../ui/Button';
import Checkbox from '../../ui/Checkbox';
import ConfirmDialog from '../../ui/ConfirmDialog';
import ListItem from '../../ui/ListItem';
import RadioGroup from '../../ui/RadioGroup';

type OwnProps = {
  isActive?: boolean;
  onReset: () => void;
};

type StateProps = ReturnType<typeof selectUMessagePrivacyGuard>;

// Settings → U message → Privacy Guard, the web port of the Android screen (no screenshot blocking on the web)
const SettingsUMessagePrivacyGuard = ({
  isActive, isEnabled, mode, action, sensitivity, shouldHideWhenOwnerAway, passcode, onReset,
}: OwnProps & StateProps) => {
  const { setSettingOption, openSettingsScreen, showNotification } = getActions();
  const lang = useLang();
  const [hasFace, setHasFace] = useState<boolean>();
  const [isDeleteConfirmOpen, openDeleteConfirm, closeDeleteConfirm] = useFlag();
  const [passcodeStage, setPasscodeStage] = useState<'new' | 'repeat'>();
  const [pin, setPin] = useState('');
  const [firstPin, setFirstPin] = useState('');
  const [pinError, setPinError] = useState<string>();

  useHistoryBack({ isActive, onBack: onReset });

  useEffect(() => {
    if (isActive) void hasOwnerTemplates().then(setHasFace);
  }, [isActive]);

  const modeOptions = useMemo(() => [
    { value: 'looking', label: lang('PrivacyGuardModeLooking') },
    { value: 'anyFace', label: lang('PrivacyGuardModeAnyFace') },
  ], [lang]);
  const actionOptions = useMemo(() => [
    { value: 'blur', label: lang('PrivacyGuardActionBlur') },
    { value: 'lock', label: lang('PrivacyGuardActionLock') },
  ], [lang]);
  const sensitivityOptions = useMemo(() => [
    { value: '0', label: lang('PrivacyGuardSensitivityLow') },
    { value: '1', label: lang('PrivacyGuardSensitivityBalanced') },
    { value: '2', label: lang('PrivacyGuardSensitivityHigh') },
  ], [lang]);

  const openEnroll = useLastCallback(() => openSettingsScreen({ screen: SettingsScreens.UMessagePrivacyGuardEnroll }));

  const handleToggle = useLastCallback((isChecked: boolean) => {
    if (isChecked && !hasFace) {
      showNotification({ message: { key: 'PrivacyGuardNeedsFace' } });
      openEnroll();
      return;
    }
    setSettingOption({ umPgEnabled: isChecked });
  });

  const handleDeleteFace = useLastCallback(async () => {
    closeDeleteConfirm();
    await deleteOwnerTemplates();
    setHasFace(false);
    setSettingOption({ umPgEnabled: false });
  });

  const handlePinSubmit = useLastCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (pin.length < UMESSAGE_PIN_MIN_LENGTH) return;
    if (passcodeStage === 'new') {
      setFirstPin(pin);
      setPin('');
      setPinError(undefined);
      setPasscodeStage('repeat');
      return;
    }
    if (pin !== firstPin) {
      setPin('');
      setFirstPin('');
      setPinError(lang('PrivacyGuardPasscodesDontMatch'));
      setPasscodeStage('new');
      return;
    }
    const hash: UMessagePinHash = await createPinHash(pin);
    setSettingOption({ umPgPasscode: hash });
    setPin('');
    setFirstPin('');
    setPasscodeStage(undefined);
    showNotification({ message: { key: 'PrivacyGuardPasscodeSet' } });
  });

  return (
    <div className="settings-content custom-scroll">
      <IslandDescription dir={lang.isRtl ? 'rtl' : undefined}>{lang('PrivacyGuardAbout')}</IslandDescription>
      <Island>
        <Checkbox
          label={lang('PrivacyGuard')}
          subLabel={lang('PrivacyGuardSettingInfo')}
          checked={isEnabled}
          onCheck={handleToggle}
        />
      </Island>

      <IslandTitle dir={lang.isRtl ? 'rtl' : undefined}>{lang('PrivacyGuardRegisteredFace')}</IslandTitle>
      <Island>
        <ListItem icon="user" narrow onClick={openEnroll}>
          <span className="title">{lang(hasFace ? 'PrivacyGuardReregisterFace' : 'PrivacyGuardRegisterFace')}</span>
          <span className="settings-item__current-value">
            {hasFace !== undefined && lang(hasFace ? 'PrivacyGuardFaceConfigured' : 'PrivacyGuardFaceNotConfigured')}
          </span>
        </ListItem>
        {hasFace && (
          <ListItem icon="delete" destructive narrow onClick={openDeleteConfirm}>
            <span className="title">{lang('PrivacyGuardDeleteFace')}</span>
          </ListItem>
        )}
      </Island>
      <IslandDescription dir={lang.isRtl ? 'rtl' : undefined}>{lang('PrivacyGuardFaceInfo')}</IslandDescription>

      <IslandTitle dir={lang.isRtl ? 'rtl' : undefined}>{lang('PrivacyGuardMode')}</IslandTitle>
      <Island>
        <RadioGroup
          name="umessage-pg-mode"
          options={modeOptions}
          selected={mode}
          onChange={(value) => setSettingOption({ umPgMode: value as 'looking' | 'anyFace' })}
        />
      </Island>

      <IslandTitle dir={lang.isRtl ? 'rtl' : undefined}>{lang('PrivacyGuardAction')}</IslandTitle>
      <Island>
        <RadioGroup
          name="umessage-pg-action"
          options={actionOptions}
          selected={action}
          onChange={(value) => setSettingOption({ umPgAction: value as 'blur' | 'lock' })}
        />
      </Island>

      <IslandTitle dir={lang.isRtl ? 'rtl' : undefined}>{lang('PrivacyGuardSensitivity')}</IslandTitle>
      <Island>
        <RadioGroup
          name="umessage-pg-sensitivity"
          options={sensitivityOptions}
          selected={String(sensitivity)}
          onChange={(value) => setSettingOption({ umPgSensitivity: Number(value) as 0 | 1 | 2 })}
        />
      </Island>
      <IslandDescription dir={lang.isRtl ? 'rtl' : undefined}>{lang('PrivacyGuardSensitivityInfo')}</IslandDescription>

      <IslandTitle dir={lang.isRtl ? 'rtl' : undefined}>{lang('PrivacyGuardAdditional')}</IslandTitle>
      <Island>
        <Checkbox
          label={lang('PrivacyGuardHideOwnerAway')}
          subLabel={lang('PrivacyGuardHideOwnerAwayInfo')}
          checked={shouldHideWhenOwnerAway}
          onCheck={(isChecked) => setSettingOption({ umPgHideOwnerAway: isChecked })}
        />
      </Island>

      <IslandTitle dir={lang.isRtl ? 'rtl' : undefined}>{lang('PrivacyGuardSetPasscode')}</IslandTitle>
      <Island>
        {passcodeStage ? (
          <form className="settings-item" onSubmit={handlePinSubmit}>
            <div className={`input-group ${pinError ? 'error' : ''}`}>
              <input
                className="form-control"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                autoFocus
                value={pin}
                placeholder={lang(
                  passcodeStage === 'new' ? 'PrivacyGuardCreatePasscode' : 'PrivacyGuardConfirmPasscode',
                )}
                onChange={(e) => setPin(e.currentTarget.value.replace(/\D/g, ''))}
              />
              <label>{pinError || lang('PrivacyGuardPasscodeHint')}</label>
            </div>
            <Button type="submit" disabled={pin.length < UMESSAGE_PIN_MIN_LENGTH}>{lang('Next')}</Button>
          </form>
        ) : passcode ? (
          <ListItem icon="lock" destructive narrow onClick={() => setSettingOption({ umPgPasscode: undefined })}>
            <span className="title">{lang('PrivacyGuardRemovePasscode')}</span>
            <span className="settings-item__current-value">{lang('PrivacyGuardPasscodeSet')}</span>
          </ListItem>
        ) : (
          <ListItem icon="lock" narrow onClick={() => setPasscodeStage('new')}>
            <span className="title">{lang('PrivacyGuardCreatePasscode')}</span>
          </ListItem>
        )}
      </Island>
      <IslandDescription dir={lang.isRtl ? 'rtl' : undefined}>{lang('PrivacyGuardSetPasscodeInfo')}</IslandDescription>

      <ConfirmDialog
        isOpen={isDeleteConfirmOpen}
        title={lang('PrivacyGuardDeleteFace')}
        text={lang('PrivacyGuardDeleteFaceConfirm')}
        confirmLabel={lang('Delete')}
        confirmIsDestructive
        confirmHandler={handleDeleteFace}
        onClose={closeDeleteConfirm}
      />
    </div>
  );
};

export default memo(withGlobal<OwnProps>(
  (global): Complete<StateProps> => selectUMessagePrivacyGuard(global),
)(SettingsUMessagePrivacyGuard));
