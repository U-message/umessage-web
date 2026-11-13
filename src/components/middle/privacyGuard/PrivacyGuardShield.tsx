import type { FormEvent } from 'react';
import {
  memo, useEffect, useState,
} from '../../../lib/teact/teact';
import { withGlobal } from '../../../global';

import type { GuardSnapshot } from '../../../util/privacyGuard/engine';

import {
  selectCurrentMessageList, selectTabState, selectUMessagePrivacyGuard,
} from '../../../global/selectors';
import buildClassName from '../../../util/buildClassName';
import {
  dismissGuard, getGuardSnapshot, setGuardConfig, startGuard, stopGuard, subscribeToGuard,
} from '../../../util/privacyGuard/engine';
import { checkPin, UMESSAGE_PIN_MIN_LENGTH } from '../../../util/umessagePin';

import useLang from '../../../hooks/useLang';
import useLastCallback from '../../../hooks/useLastCallback';

import Button from '../../ui/Button';

import styles from './PrivacyGuardShield.module.scss';

type StateProps = ReturnType<typeof selectUMessagePrivacyGuard> & {
  chatId?: string;
  isMediaViewerOpen: boolean;
};

function useIsPageVisible() {
  const [isVisible, setIsVisible] = useState(() => document.visibilityState === 'visible');
  useEffect(() => {
    const handle = () => setIsVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', handle);
    return () => document.removeEventListener('visibilitychange', handle);
  }, []);
  return isVisible;
}

// Privacy Guard over the open chat: runs the camera only while a chat is open and the page is visible, and hides the
// chat (blur, or lock until the owner is back or the passcode is entered) when someone else looks at the screen
const PrivacyGuardShield = ({
  isEnabled, mode, action, sensitivity, shouldHideWhenOwnerAway, shouldProtectMedia, shouldProtectComposer, passcode,
  chatId, isMediaViewerOpen,
}: StateProps) => {
  const lang = useLang();
  const isPageVisible = useIsPageVisible();
  const [guard, setGuard] = useState<GuardSnapshot>(getGuardSnapshot);
  const [isLocked, setIsLocked] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string>();

  const shouldRun = isEnabled && Boolean(chatId) && isPageVisible;

  useEffect(() => subscribeToGuard(setGuard), []);

  useEffect(() => {
    setGuardConfig({ mode, sensitivity, shouldHideWhenOwnerAway });
  }, [mode, sensitivity, shouldHideWhenOwnerAway]);

  useEffect(() => {
    if (shouldRun) void startGuard();
    else stopGuard();
  }, [shouldRun]);

  useEffect(() => () => stopGuard(), []);

  // "Lock": once hidden, the chat stays hidden until the guard clears (the owner is back) or the passcode is entered
  useEffect(() => {
    if (action !== 'lock') {
      setIsLocked(false);
    } else if (guard.isProtected) {
      setIsLocked(true);
    } else if (guard.status === 'running' && !guard.isProtected) {
      setIsLocked(false);
    }
  }, [action, guard.isProtected, guard.status]);

  const handleShow = useLastCallback(() => {
    if (action === 'lock') return;
    dismissGuard();
  });

  const handleUnlock = useLastCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (!passcode) return;
    if (await checkPin(pin, passcode)) {
      setPin('');
      setPinError(undefined);
      setIsLocked(false);
      dismissGuard();
    } else {
      setPin('');
      setPinError(lang('UMessageHiddenPasswordWrong'));
    }
  });

  const isHidden = shouldRun && (guard.isProtected || isLocked);
  if (!isHidden) return undefined;

  const isLockMode = action === 'lock';
  const title = isLockMode ? lang('PrivacyGuardChatLocked')
    : lang(guard.reason === 'ownerAway' ? 'PrivacyGuardLookedAway' : 'PrivacyGuardMayBeViewing');

  return (
    <div
      className={buildClassName(
        styles.shield,
        !shouldProtectComposer && !isMediaViewerOpen && styles.keepComposer,
        shouldProtectMedia && isMediaViewerOpen && styles.media,
      )}
      onClick={handleShow}
      role="alert"
    >
      <p className={styles.title}>{title}</p>
      {!isLockMode && <p className={styles.subtitle}>{lang('PrivacyGuardTapToShow')}</p>}
      {isLockMode && passcode && (
        <form className={styles.form} onSubmit={handleUnlock}>
          <input
            className={buildClassName('form-control', styles.input)}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            placeholder={pinError || lang('PrivacyGuardEnterPasscode')}
            onChange={(e) => setPin(e.currentTarget.value.replace(/\D/g, ''))}
          />
          <Button type="submit" disabled={pin.length < UMESSAGE_PIN_MIN_LENGTH}>
            {lang('PrivacyGuardTapToUnlock')}
          </Button>
        </form>
      )}
    </div>
  );
};

export default memo(withGlobal(
  (global): Complete<StateProps> => {
    const { mediaViewer } = selectTabState(global);
    return {
      ...selectUMessagePrivacyGuard(global),
      chatId: selectCurrentMessageList(global)?.chatId,
      isMediaViewerOpen: Boolean(mediaViewer.chatId || mediaViewer.standaloneMedia) && !mediaViewer.isHidden,
    };
  },
)(PrivacyGuardShield));
