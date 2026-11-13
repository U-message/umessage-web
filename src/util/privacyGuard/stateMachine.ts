import {
  ACTIVATE_DWELL_MS, OWNER_AWAY_DELAY_MS, OWNER_RECENT_MS, OWNER_RETURN_MS, RELEASE_DELAY_MS, SUSPICIOUS_GRACE_MS,
} from './tuning';

// Decides when the chat is hidden from per-frame summaries of the tracked faces (PrivacyGuardStateMachine.java).
//   SCANNING / SAFE_OWNER_ONLY / UNKNOWN_NOT_LOOKING --unknown looks at the screen--> SUSPICIOUS_GAZE
//   SUSPICIOUS_GAZE --continuously for the dwell time--> PROTECTED, --looks away beyond a short grace--> back
//   PROTECTED --nothing suspicious for the release delay and the owner present--> back

export type GuardState = 'scanning' | 'safeOwnerOnly' | 'unknownNotLooking' | 'suspiciousGaze' | 'protected';
export type GuardReason = 'none' | 'unknownViewer' | 'unknownFace' | 'ownerAway';
export type GuardMode = 'looking' | 'anyFace';

export type GuardObservation = {
  now: number;
  ownerVisible: boolean;
  ownerLooking: boolean;
  unknownPresent: boolean;
  unknownLooking: boolean;
};

export type GuardConfig = {
  mode: GuardMode;
  sensitivity: number;
  shouldHideWhenOwnerAway: boolean;
};

export default class GuardStateMachine {
  state: GuardState = 'scanning';

  reason: GuardReason = 'none';

  private suspiciousStart = -1;

  private lastSuspicious = -1;

  private lastOwnerSeen = -1;

  private ownerAwaySince = -1;

  private ownerBackSince = -1;

  private isOwnerAwaySuppressed = false;

  get isProtected() {
    return this.state === 'protected';
  }

  reset() {
    this.state = 'scanning';
    this.reason = 'none';
    this.suspiciousStart = -1;
    this.lastSuspicious = -1;
    this.lastOwnerSeen = -1;
    this.ownerAwaySince = -1;
    this.ownerBackSince = -1;
    this.isOwnerAwaySuppressed = false;
  }

  // The user chose to show the chat: drop the current protection; it must build up again from scratch
  dismiss() {
    if (this.state === 'protected' && this.reason === 'ownerAway') this.isOwnerAwaySuppressed = true;
    this.state = 'scanning';
    this.reason = 'none';
    this.suspiciousStart = -1;
    this.lastSuspicious = -1;
    this.ownerAwaySince = -1;
  }

  update(o: GuardObservation, config: GuardConfig) {
    const { now } = o;
    if (o.ownerVisible) this.lastOwnerSeen = now;

    const isSuspicious = config.mode === 'anyFace' ? o.unknownPresent : o.unknownLooking;
    if (isSuspicious) {
      if (this.suspiciousStart < 0) this.suspiciousStart = now;
      this.lastSuspicious = now;
    } else if (this.suspiciousStart >= 0 && now - this.lastSuspicious > SUSPICIOUS_GRACE_MS) {
      this.suspiciousStart = -1;
    }

    const isOwnerAttentive = o.ownerVisible && o.ownerLooking;
    if (isOwnerAttentive) {
      this.ownerAwaySince = -1;
      if (this.ownerBackSince < 0) this.ownerBackSince = now;
      this.isOwnerAwaySuppressed = false;
    } else {
      this.ownerBackSince = -1;
      if (this.ownerAwaySince < 0) this.ownerAwaySince = now;
    }
    const isOwnerAway = config.shouldHideWhenOwnerAway && !this.isOwnerAwaySuppressed
      && this.ownerAwaySince >= 0 && now - this.ownerAwaySince >= OWNER_AWAY_DELAY_MS;

    if (this.state === 'protected') {
      const isClear = this.suspiciousStart < 0
        && (this.lastSuspicious < 0 || now - this.lastSuspicious >= RELEASE_DELAY_MS);
      let shouldRelease: boolean;
      if (this.reason === 'ownerAway') {
        shouldRelease = isClear && isOwnerAttentive && now - this.ownerBackSince >= OWNER_RETURN_MS;
      } else {
        const isOwnerRecent = this.lastOwnerSeen >= 0 && now - this.lastOwnerSeen <= OWNER_RECENT_MS;
        shouldRelease = isClear && isOwnerRecent;
        if (shouldRelease && isOwnerAway) {
          this.reason = 'ownerAway';
          shouldRelease = false;
        }
      }
      if (shouldRelease) {
        this.reason = 'none';
        this.state = this.derive(o, isSuspicious);
      }
      return this.state;
    }

    if (this.suspiciousStart >= 0 && now - this.suspiciousStart >= ACTIVATE_DWELL_MS[config.sensitivity]) {
      this.state = 'protected';
      this.reason = config.mode === 'anyFace' ? 'unknownFace' : 'unknownViewer';
      return this.state;
    }
    if (isOwnerAway) {
      this.state = 'protected';
      this.reason = 'ownerAway';
      return this.state;
    }
    this.state = this.derive(o, isSuspicious);
    return this.state;
  }

  private derive(o: GuardObservation, isSuspicious: boolean): GuardState {
    if (this.suspiciousStart >= 0 || isSuspicious) return 'suspiciousGaze';
    if (o.unknownPresent) return 'unknownNotLooking';
    if (o.ownerVisible) return 'safeOwnerOnly';
    return 'scanning';
  }
}
