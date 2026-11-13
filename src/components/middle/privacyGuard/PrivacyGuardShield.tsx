import {
  memo, useEffect, useState,
} from '../../../lib/teact/teact';
import { withGlobal } from '../../../global';

import type { GuardSnapshot } from '../../../util/privacyGuard/engine';

import { selectUMessagePrivacyGuard } from '../../../global/selectors';
import buildClassName from '../../../util/buildClassName';
import {
  dismissGuard, getGuardSnapshot, setGuardConfig, startGuard, stopGuard, subscribeToGuard,
} from '../../../util/privacyGuard/engine';
import { checkPin } from '../../../util/umessagePin';
import { LOCAL_TGS_URLS } from '../../common/helpers/animatedAssets';

import useLang from '../../../hooks/useLang';
import useLastCallback from '../../../hooks/useLastCallback';

import AnimatedIconWithPreview from '../../common/AnimatedIconWithPreview';
import PasswordForm from '../../common/PasswordForm';
import PasswordMonkey from '../../common/PasswordMonkey';
import Button from '../../ui/Button';
import Portal from '../../ui/Portal';

import styles from './PrivacyGuardShield.module.scss';

import lockPreviewUrl from '../../../assets/lock.png';

const GUARD_RETRY_MS = 3000;
const MONKEY_PEEK_INTERVAL_MS = 1800;
const LOCK_ICON_SIZE = 120;

type StateProps = ReturnType<typeof selectUMessagePrivacyGuard>;

function useIsPageVisible() {
  const [isVisible, setIsVisible] = useState(() => document.visibilityState === 'visible');
  useEffect(() => {
    const handle = () => setIsVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', handle);
    return () => document.removeEventListener('visibilitychange', handle);
  }, []);
  return isVisible;
}

// Privacy Guard: runs the camera while U message is open and the page is visible, and hides everything (blur, or lock until the owner is back or the passcode is entered) when someone else looks at the screen
const PrivacyGuardShield = ({
  isEnabled, mode, action, sensitivity, shouldHideWhenOwnerAway, passcode,
}: StateProps) => {
  const lang = useLang();
  const isPageVisible = useIsPageVisible();
  const [guard, setGuard] = useState<GuardSnapshot>(getGuardSnapshot);
  const [isLocked, setIsLocked] = useState(false);
  const [isAskingPasscode, setIsAskingPasscode] = useState(false);
  const [isMonkeyPeeking, setIsMonkeyPeeking] = useState(false);
  const [isPasscodeVisible, setIsPasscodeVisible] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [pinError, setPinError] = useState<string>();

  // The chat list is private too: the guard runs whenever U message is open and visible, not only inside a chat
  const shouldRun = isEnabled && isPageVisible;

  useEffect(() => subscribeToGuard(setGuard), []);

  useEffect(() => {
    setGuardConfig({ mode, sensitivity, shouldHideWhenOwnerAway });
  }, [mode, sensitivity, shouldHideWhenOwnerAway]);

  // Start whenever the guard should run but is not running; after an error (no enrolled face yet, camera busy,
  // models still downloading) try again shortly instead of staying off until a reload
  useEffect(() => {
    if (!shouldRun) {
      stopGuard();
      return undefined;
    }
    if (guard.status === 'off') {
      void startGuard();
      return undefined;
    }
    if (guard.status === 'error') {
      const timer = window.setTimeout(() => {
        stopGuard();
        void startGuard();
      }, GUARD_RETRY_MS);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [shouldRun, guard.status]);

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

  // With a passcode set, a tap is not enough: the chat opens only with the passcode (or when the owner is back)
  const needsPasscode = action === 'lock' || Boolean(passcode);

  // Telegram-style: a tap on the card shows the chat, or asks for the passcode when one is set
  const handleCardClick = useLastCallback(() => {
    if (passcode) {
      setIsAskingPasscode(true);
    } else if (!needsPasscode) {
      dismissGuard();
    }
  });

  const handleUnlock = useLastCallback(async (value: string) => {
    if (!passcode) return;
    setIsChecking(true);
    const isCorrect = await checkPin(value, passcode);
    setIsChecking(false);
    if (isCorrect) {
      setPinError(undefined);
      setIsAskingPasscode(false);
      setIsLocked(false);
      dismissGuard();
    } else {
      setPinError(lang('UMessageHiddenPasswordWrong'));
    }
  });

  const isHidden = shouldRun && (guard.isProtected || isLocked);

  useEffect(() => {
    if (!isHidden) {
      setIsAskingPasscode(false);
      setPinError(undefined);
    }
  }, [isHidden]);

  useEffect(() => {
    if (!isHidden || isAskingPasscode) {
      setIsMonkeyPeeking(false);
      return undefined;
    }
    const timer = window.setInterval(() => setIsMonkeyPeeking((value) => !value), MONKEY_PEEK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [isHidden, isAskingPasscode]);

  if (!isHidden) return undefined;

  const isLockMode = action === 'lock';
  const title = isLockMode ? lang('PrivacyGuardChatLocked')
    : lang(guard.reason === 'ownerAway' ? 'PrivacyGuardLookedAway' : 'PrivacyGuardMayBeViewing');
  const hint = passcode ? lang('UMessagePgTapOrLook')
    : needsPasscode ? lang('UMessagePgLookAtCamera') : lang('UMessagePgTapShowOrLook');

  // One blur over the whole window (chat list, chat, composer and media), the card in the centre of the screen
  return (
    <Portal>
      <div className={styles.shield} role="alert">
        <div
          className={buildClassName(styles.card, !isAskingPasscode && styles.clickable)}
          onClick={isAskingPasscode ? undefined : handleCardClick}
          dir={lang.isRtl ? 'rtl' : undefined}
        >
          {isAskingPasscode ? (
            <>
              <AnimatedIconWithPreview
                tgsUrl={LOCAL_TGS_URLS.Lock}
                previewUrl={lockPreviewUrl}
                size={LOCK_ICON_SIZE}
                className={styles.lock}
              />
              <p className={styles.title}>{lang('PrivacyGuardUnlockTitle')}</p>
              <PasswordForm
                key="privacy-guard-passcode"
                shouldShowSubmit
                shouldDisablePasswordManager
                isLoading={isChecking}
                error={pinError}
                placeholder={lang('PrivacyGuardEnterPasscode')}
                submitLabel={lang('Next')}
                isPasswordVisible={isPasscodeVisible}
                noRipple
                onClearError={() => setPinError(undefined)}
                onChangePasswordVisibility={setIsPasscodeVisible}
                onSubmit={handleUnlock}
              />
              <Button isText className={styles.cancel} onClick={() => setIsAskingPasscode(false)}>
                {lang('Cancel')}
              </Button>
            </>
          ) : (
            <>
              {/* Hides its eyes and keeps peeking out on its own while the chat is hidden */}
              <div className={styles.icon}>
                <PasswordMonkey isPasswordVisible={isMonkeyPeeking} />
              </div>
              <p className={styles.title}>{title}</p>
              <p className={styles.subtitle}>{hint}</p>
            </>
          )}
        </div>
      </div>
    </Portal>
  );
};

export default memo(withGlobal(
  (global): Complete<StateProps> => {
    return selectUMessagePrivacyGuard(global);
  },
)(PrivacyGuardShield));
