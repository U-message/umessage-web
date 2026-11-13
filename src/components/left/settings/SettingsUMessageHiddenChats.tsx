import type { FormEvent } from 'react';
import {
  memo, useEffect, useState,
} from '../../../lib/teact/teact';
import { getActions, withGlobal } from '../../../global';

import type { ApiChatFolder } from '../../../api/types';
import type { UMessagePinHash } from '../../../types';

import { selectSettingsKeys } from '../../../global/selectors';
import {
  checkPin, createPinHash, getIsHiddenUnlocked, getPinLockRemainingMs, setIsHiddenUnlocked, UMESSAGE_PIN_MIN_LENGTH,
} from '../../../util/umessagePin';

import useHistoryBack from '../../../hooks/useHistoryBack';
import useLang from '../../../hooks/useLang';
import useLastCallback from '../../../hooks/useLastCallback';

import Island, { IslandDescription, IslandTitle } from '../../gili/layout/Island';
import Button from '../../ui/Button';
import Checkbox from '../../ui/Checkbox';
import ListItem from '../../ui/ListItem';
import UMessageChatRow from './UMessageChatRow';

type OwnProps = {
  isActive?: boolean;
  onReset: () => void;
};

type StateProps = {
  pinHash?: UMessagePinHash;
  hiddenChatIds?: string[];
  hiddenFolderIds?: number[];
  folders: ApiChatFolder[];
};

type Stage = 'enter' | 'new' | 'repeat' | 'open';

const SettingsUMessageHiddenChats = ({
  isActive, pinHash, hiddenChatIds, hiddenFolderIds, folders, onReset,
}: OwnProps & StateProps) => {
  const {
    setSettingOption, setUMessageChatsHidden, setUMessageFolderHidden, openChat, showNotification,
  } = getActions();
  const lang = useLang();

  const [stage, setStage] = useState<Stage>(() => getInitialStage(pinHash));
  const [pin, setPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [error, setError] = useState<string>();
  const [isChecking, setIsChecking] = useState(false);

  useHistoryBack({ isActive, onBack: onReset });

  useEffect(() => {
    if (!isActive) {
      setStage(getInitialStage(pinHash));
      setPin('');
      setError(undefined);
    }
  }, [isActive, pinHash]);

  const handleSubmit = useLastCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (isChecking) return;

    if (stage === 'enter') {
      if (!pinHash) return;
      setIsChecking(true);
      const isCorrect = await checkPin(pin, pinHash);
      setIsChecking(false);
      setPin('');
      if (!isCorrect) {
        setError(lang('UMessageHiddenPasswordWrong'));
        return;
      }
      setIsHiddenUnlocked(true);
      setError(undefined);
      setStage('open');
      return;
    }

    if (stage === 'new') {
      if (pin.length < UMESSAGE_PIN_MIN_LENGTH) return;
      setNewPin(pin);
      setPin('');
      setError(undefined);
      setStage('repeat');
      return;
    }

    if (stage === 'repeat') {
      if (pin !== newPin) {
        setPin('');
        setNewPin('');
        setError(lang('UMessageHiddenPasswordMismatch'));
        setStage('new');
        return;
      }
      setIsChecking(true);
      const hash = await createPinHash(pin);
      setIsChecking(false);
      setSettingOption({ umHiddenPin: hash });
      setIsHiddenUnlocked(true);
      setPin('');
      setNewPin('');
      setError(undefined);
      setStage('open');
      showNotification({ message: { key: 'UMessageHiddenPasswordSaved' } });
    }
  });

  if (stage !== 'open') {
    const titleKey = stage === 'enter' ? 'UMessageHiddenPinPrompt'
      : stage === 'new' ? 'UMessageHiddenPinNew' : 'UMessageHiddenPasswordRepeat';
    const lockSeconds = Math.ceil(getPinLockRemainingMs() / 1000);

    return (
      <div className="settings-content custom-scroll">
        <IslandTitle dir={lang.isRtl ? 'rtl' : undefined}>{lang(titleKey)}</IslandTitle>
        <Island>
          <form className="settings-item" onSubmit={handleSubmit}>
            <div className={`input-group ${error ? 'error' : ''}`}>
              <input
                className="form-control"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                autoFocus
                value={pin}
                placeholder={lang(titleKey)}
                onChange={(e) => setPin(e.currentTarget.value.replace(/\D/g, ''))}
              />
              {error && <label>{error}</label>}
            </div>
            <Button
              type="submit"
              isLoading={isChecking}
              disabled={pin.length < UMESSAGE_PIN_MIN_LENGTH || Boolean(lockSeconds && stage === 'enter')}
            >
              {lang('Next')}
            </Button>
          </form>
        </Island>
        <IslandDescription dir={lang.isRtl ? 'rtl' : undefined}>{lang('UMessageHiddenPasswordInfo')}</IslandDescription>
      </div>
    );
  }

  return (
    <div className="settings-content custom-scroll">
      <IslandTitle dir={lang.isRtl ? 'rtl' : undefined}>{lang('UMessageHiddenChats')}</IslandTitle>
      <Island>
        {hiddenChatIds?.length ? hiddenChatIds.map((chatId) => (
          <UMessageChatRow
            key={chatId}
            chatId={chatId}
            onClick={(id) => openChat({ id, shouldReplaceHistory: true })}
            contextActions={[{
              title: lang('UMessageUnhideChat'),
              icon: 'eye-outline',
              handler: () => setUMessageChatsHidden({ chatIds: [chatId], isHidden: false }),
            }]}
          />
        )) : (
          <p className="settings-item-description">{lang('UMessageHiddenChatsEmpty')}</p>
        )}
      </Island>
      {Boolean(hiddenChatIds?.length) && (
        <IslandDescription dir={lang.isRtl ? 'rtl' : undefined}>{lang('UMessageHiddenChatsInfo')}</IslandDescription>
      )}

      {Boolean(folders.length) && (
        <>
          <IslandTitle dir={lang.isRtl ? 'rtl' : undefined}>{lang('UMessageHiddenFolders')}</IslandTitle>
          <Island>
            {folders.map((folder) => {
              const isHidden = Boolean(hiddenFolderIds?.includes(folder.id));
              return (
                <Checkbox
                  key={folder.id}
                  label={folder.title.text}
                  subLabel={lang(isHidden ? 'UMessageShowFolder' : 'UMessageHideFolder')}
                  checked={isHidden}
                  onCheck={(isChecked) => setUMessageFolderHidden({ folderId: folder.id, isHidden: isChecked })}
                />
              );
            })}
          </Island>
        </>
      )}

      <Island>
        <ListItem icon="lock" narrow onClick={() => setStage('new')}>
          <span className="title">{lang('UMessageHiddenPasswordChange')}</span>
        </ListItem>
      </Island>
    </div>
  );
};

function getInitialStage(pinHash?: UMessagePinHash): Stage {
  if (!pinHash) return 'new';
  return getIsHiddenUnlocked() ? 'open' : 'enter';
}

export default memo(withGlobal<OwnProps>(
  (global): Complete<StateProps> => {
    const { umHiddenPin, umHiddenChatIds, umHiddenFolderIds } = selectSettingsKeys(global);
    const { byId, orderedIds } = global.chatFolders;

    return {
      pinHash: umHiddenPin,
      hiddenChatIds: umHiddenChatIds,
      hiddenFolderIds: umHiddenFolderIds,
      folders: (orderedIds || []).map((id) => byId[id]).filter(Boolean),
    };
  },
)(SettingsUMessageHiddenChats));
