import {
  memo, useEffect, useRef, useState,
} from '../../../lib/teact/teact';
import { getActions } from '../../../global';

import type { RegularLangKey } from '../../../types/language';
import type {
  EnrollError, EnrollHint, EnrollPhase, EnrollProgress,
} from '../../../util/privacyGuard/enrollment';

import buildClassName from '../../../util/buildClassName';
import { setGuardSuspended } from '../../../util/privacyGuard/engine';
import { ENROLL_SECTORS, startEnrollment } from '../../../util/privacyGuard/enrollment';

import useHistoryBack from '../../../hooks/useHistoryBack';
import useLang from '../../../hooks/useLang';
import useLastCallback from '../../../hooks/useLastCallback';

import Button from '../../ui/Button';
import ConfirmDialog from '../../ui/ConfirmDialog';
import Portal from '../../ui/Portal';

import styles from './SettingsUMessagePrivacyGuardEnroll.module.scss';

type OwnProps = {
  isActive?: boolean;
  onReset: () => void;
};

type Stage = 'intro' | 'running' | 'done' | 'failed';

const HINT_KEYS: Record<EnrollHint, RegularLangKey> = {
  none: 'PrivacyGuardEnrollFillRing',
  noFace: 'PrivacyGuardEnrollHintNoFace',
  multipleFaces: 'PrivacyGuardEnrollHintMultiple',
  moveCloser: 'PrivacyGuardEnrollHintCloser',
  tooDark: 'PrivacyGuardEnrollHintDark',
  openEyes: 'PrivacyGuardEnrollHintEyes',
};

const ERROR_KEYS: Record<EnrollError, RegularLangKey> = {
  camera: 'PrivacyGuardEnrollFailedCamera',
  models: 'PrivacyGuardEnrollFailedGeneric',
  inconsistent: 'PrivacyGuardEnrollFailedInconsistent',
  save: 'PrivacyGuardEnrollFailedGeneric',
};

const RING_RADIUS = 46;
const SECTOR_GAP_DEG = 3;

// Face ID-like registration: turning the head lights the matching part of the ring (PrivacyGuardEnrollActivity)
const SettingsUMessagePrivacyGuardEnroll = ({ isActive, onReset }: OwnProps) => {
  const { setSettingOption } = getActions();
  const lang = useLang();
  const videoRef = useRef<HTMLVideoElement>();
  const stopRef = useRef<NoneToVoidFunction>();
  const [stage, setStage] = useState<Stage>('intro');
  const [progress, setProgress] = useState<EnrollProgress>();
  const [error, setError] = useState<EnrollError>();
  const [phase, setPhase] = useState<EnrollPhase>();
  // After registration: why the camera light will stay on, and that nothing leaves the device
  const [isCameraNoticeOpen, setIsCameraNoticeOpen] = useState(false);

  useHistoryBack({ isActive, onBack: onReset });

  useEffect(() => {
    if (!isActive) return undefined;
    setGuardSuspended(true);
    return () => setGuardSuspended(false);
  }, [isActive]);

  useEffect(() => {
    if (!isActive) {
      stopRef.current?.();
      stopRef.current = undefined;
      setStage('intro');
      setProgress(undefined);
      setPhase(undefined);
    }
  }, [isActive]);

  useEffect(() => () => stopRef.current?.(), []);

  const handleStart = useLastCallback(() => {
    if (!videoRef.current) return;
    setStage('running');
    setError(undefined);
    setProgress(undefined);
    stopRef.current = startEnrollment(videoRef.current, setProgress, (isSuccess, finishError) => {
      stopRef.current = undefined;
      if (isSuccess) {
        setSettingOption({ umPgEnabled: true });
        setStage('done');
        setIsCameraNoticeOpen(true);
      } else {
        setError(finishError);
        setStage('failed');
      }
    }, setPhase);
  });

  const covered = progress?.covered;
  const sectorAngle = 360 / ENROLL_SECTORS;

  // Shown over the whole window, top centre: right under a laptop's camera, so the face is filmed head-on
  return (
    <div className="settings-content custom-scroll">
      {isActive && (
        <Portal>
          <div className={styles.overlay}>
            <Button
              className={styles.close}
              round
              color="translucent"
              size="smaller"
              ariaLabel={lang('Close')}
              iconName="close"
              onClick={onReset}
            />
            <div className={styles.root}>
              <h3>{lang(stage === 'done' ? 'PrivacyGuardEnrollDone' : 'PrivacyGuardEnrollTitle')}</h3>
              <div className={styles.stage}>
                <video ref={videoRef} className={styles.video} muted playsInline />
                <svg className={styles.ring} viewBox="0 0 100 100" aria-hidden>
                  {Array.from({ length: ENROLL_SECTORS }, (_, i) => {
                    // sector 0 is at the top, clockwise
                    const start = (i * sectorAngle + SECTOR_GAP_DEG / 2 - 90) * Math.PI / 180;
                    const end = ((i + 1) * sectorAngle - SECTOR_GAP_DEG / 2 - 90) * Math.PI / 180;
                    const point = (angle: number) => (
                      `${50 + RING_RADIUS * Math.cos(angle)} ${50 + RING_RADIUS * Math.sin(angle)}`
                    );
                    const d = `M ${point(start)} A ${RING_RADIUS} ${RING_RADIUS} 0 0 1 ${point(end)}`;
                    return (
                      <path
                        key={i}
                        d={d}
                        fill="none"
                        className={buildClassName(styles.sector, (stage === 'done' || covered?.[i]) && styles.covered)}
                      />
                    );
                  })}
                </svg>
              </div>
              <p className={styles.hint}>
                {stage === 'intro' && lang('PrivacyGuardEnrollIntro')}
                {stage === 'running' && phase !== 'running' && (
                  lang(phase === 'camera' ? 'PrivacyGuardCameraPermission' : 'Loading')
                )}
                {stage === 'running' && phase === 'running' && lang(
                  !progress || (progress.straightFill < 1 && progress.hint === 'none')
                    ? 'PrivacyGuardEnrollStraight' : HINT_KEYS[progress.hint],
                )}
                {stage === 'done' && lang('PrivacyGuardEnrollDoneInfo')}
                {stage === 'failed' && lang(ERROR_KEYS[error || 'save'])}
              </p>
              {stage === 'intro' && <Button onClick={handleStart}>{lang('PrivacyGuardEnrollStart')}</Button>}
              {stage === 'failed' && <Button onClick={handleStart}>{lang('PrivacyGuardTryAgain')}</Button>}
              {stage === 'done' && <Button onClick={onReset}>{lang('PrivacyGuardEnrollFinish')}</Button>}
              <p className={styles.privacy}>{lang('PrivacyGuardEnrollPrivacy')}</p>
            </div>
          </div>
        </Portal>
      )}
      <ConfirmDialog
        isOpen={isCameraNoticeOpen}
        isOnlyConfirm
        className="um-camera-notice"
        title={lang('UMessagePgCameraNoticeTitle')}
        text={lang('UMessagePgCameraNoticeText')}
        confirmLabel={lang('OK')}
        confirmHandler={() => {
          setIsCameraNoticeOpen(false);
          onReset();
        }}
        onClose={() => setIsCameraNoticeOpen(false)}
      />
    </div>
  );
};

export default memo(SettingsUMessagePrivacyGuardEnroll);
