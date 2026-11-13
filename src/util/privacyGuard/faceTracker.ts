import type { FacePose } from './faceGeometry';

import OneEuroFilter from './oneEuroFilter';
import {
  BLINK_CLOSED, BLINK_MAX_MS, BLINK_OPEN, EMBED_MAX_PITCH_DEG, EMBED_MAX_YAW_DEG, EMBED_MIN_FACE_PX, EYE_PITCH_WEIGHT,
  EYE_YAW_WEIGHT, EYES_CLOSED, GAZE_ENTER, GAZE_EXIT, GAZE_OFF_DEG, GAZE_ON_DEG, GAZE_SCORE_TAU_MS, HEAD_MAX_PITCH_DEG,
  HEAD_MAX_YAW_DEG, IDENTITY_EMA, LIVE_HOLD_MS, LIVE_POSE_STD_DEG, LIVE_WINDOW_MS, MIN_FACE_WIDTH_FRACTION,
  OWNER_ACCEPT, OWNER_ACCEPT_SINGLE, OWNER_LOOK_AWAY_DEG, RESOLVE_INTERVAL_MS, REVERIFY_OWNER_MS, REVERIFY_UNKNOWN_MS,
  SCREEN_PITCH_BIAS_DEG, TRACK_COAST_MS, TRACK_CONFIRM_HITS, TRACK_CONFIRM_MS, TRACK_MATCH_IOU, UNKNOWN_REJECT,
  UNKNOWN_REJECT_SINGLE,
} from './tuning';

// Follows faces across frames and turns noisy per-frame measurements into stable per-person judgments
// (FaceTracker.java): who the owner is, whether an unknown person looks at the screen, whether the face is alive.

export type Identity = 'unresolved' | 'owner' | 'unknown';

export type TrackObservation = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  pose: FacePose;
  index: number;
};

export type TrackSummary = {
  ownerVisible: boolean;
  ownerLooking: boolean;
  unknownPresent: boolean;
  unknownLooking: boolean;
};

const HISTORY = 24;
const OWNER_SEEN_MS = 300;
const UNRESOLVED_AS_UNKNOWN_MS = 400;

export class Track {
  left = 0;

  top = 0;

  right = 0;

  bottom = 0;

  lastSeen: number;

  lastUpdate: number;

  hits = 0;

  isConfirmed = false;

  isSeenThisFrame = false;

  isPoseFresh = false;

  isDismissed = false;

  yawFilter = new OneEuroFilter(1, 0.05, 1);

  pitchFilter = new OneEuroFilter(1, 0.05, 1);

  eyeYawFilter = new OneEuroFilter(1.5, 0.05, 1);

  eyePitchFilter = new OneEuroFilter(1.5, 0.05, 1);

  yaw = 0;

  pitch = 0;

  deviation = 0;

  blink = 0;

  widthPx = 0;

  widthFraction = 0;

  gazeScore = 0;

  isLooking = false;

  identity: Identity = 'unresolved';

  similarity = 0;

  samples = 0;

  lastResolveAttempt = -Infinity;

  lastResolved = -Infinity;

  history: { time: number; yaw: number; pitch: number; eye: number }[] = [];

  areEyesClosed = false;

  eyesClosedSince = 0;

  lastLiveEvidence = -Infinity;

  constructor(public id: number, public firstSeen: number) {
    this.lastSeen = firstSeen;
    this.lastUpdate = firstSeen;
  }

  get width() {
    return this.right - this.left;
  }

  isLive(now: number) {
    return now - this.lastLiveEvidence <= LIVE_HOLD_MS;
  }
}

export type IdentityRequest = (observation: TrackObservation, track: Track) => void;

export default class FaceTracker {
  tracks: Track[] = [];

  private nextId = 1;

  reset() {
    this.tracks = [];
  }

  getOwnerTrack() {
    return this.tracks.find((t) => t.identity === 'owner' && t.isSeenThisFrame);
  }

  // Current faces no longer count as suspicious (the user chose to show the chat anyway); new faces still do
  dismissCurrent() {
    this.tracks.forEach((t) => {
      t.isDismissed = true;
    });
  }

  update(
    observations: TrackObservation[], now: number, frameWidth: number, sensitivity: number,
    requestIdentity?: IdentityRequest,
  ) {
    this.tracks.forEach((t) => {
      t.isSeenThisFrame = false;
    });
    const assigned = this.associate(observations);
    observations.forEach((o, i) => {
      let t = assigned[i];
      if (!t) {
        t = new Track(this.nextId++, now);
        this.tracks.push(t);
        assigned[i] = t;
      }
      t.isSeenThisFrame = true;
      t.lastSeen = now;
      t.hits++;
      t.left = o.left;
      t.top = o.top;
      t.right = o.right;
      t.bottom = o.bottom;
      if (!t.isConfirmed && t.hits >= TRACK_CONFIRM_HITS && now - t.firstSeen >= TRACK_CONFIRM_MS) {
        t.isConfirmed = true;
      }
      t.isPoseFresh = true;
      updatePose(t, o.pose, now, frameWidth, sensitivity);
      updateLiveness(t, o.pose, now);
    });
    this.tracks = this.tracks.filter((t) => {
      if (t.isSeenThisFrame) return true;
      if (now - t.lastSeen > TRACK_COAST_MS) return false;
      smoothGaze(t, 0, now);
      return true;
    });
    if (requestIdentity) this.resolveIdentity(observations, assigned as Track[], now, requestIdentity);
  }

  // Embeddings run asynchronously on the web; their result lands here
  applyResolved(trackId: number, similarity: number, now: number) {
    const track = this.tracks.find((t) => t.id === trackId);
    if (!track || Number.isNaN(similarity)) return;
    track.lastResolved = now;
    applySimilarity(track, similarity);
    this.enforceSingleOwner();
  }

  summarize(now: number, sensitivity: number): TrackSummary {
    let owner: Track | undefined;
    this.tracks.forEach((t) => {
      if (t.identity === 'owner' && now - t.lastSeen <= OWNER_SEEN_MS) owner = t;
    });
    const summary: TrackSummary = {
      ownerVisible: Boolean(owner),
      ownerLooking: Boolean(owner && owner.deviation < OWNER_LOOK_AWAY_DEG && owner.blink < EYES_CLOSED),
      unknownPresent: false,
      unknownLooking: false,
    };
    const minFraction = MIN_FACE_WIDTH_FRACTION[sensitivity];
    this.tracks.forEach((t) => {
      if (t === owner || !t.isConfirmed || t.isDismissed) return;
      // a face we could not identify next to the recognized owner is someone else
      const isUnknown = t.identity === 'unknown'
        || (t.identity === 'unresolved' && owner && now - t.firstSeen >= UNRESOLVED_AS_UNKNOWN_MS
          && iou(t.left, t.top, t.right, t.bottom, owner.left, owner.top, owner.right, owner.bottom) < 0.1);
      if (!isUnknown || t.widthFraction < minFraction || !t.isLive(now)) return;
      summary.unknownPresent = true;
      if (t.isLooking) summary.unknownLooking = true;
    });
    return summary;
  }

  private associate(observations: TrackObservation[]) {
    const assigned: (Track | undefined)[] = new Array(observations.length);
    const taken = new Array(this.tracks.length).fill(false);
    // greedy by overlap, then by center distance for fast motion
    while (true) {
      let best = TRACK_MATCH_IOU;
      let bestObs = -1;
      let bestTrack = -1;
      observations.forEach((o, i) => {
        if (assigned[i]) return;
        this.tracks.forEach((t, j) => {
          if (taken[j]) return;
          let score = iou(o.left, o.top, o.right, o.bottom, t.left, t.top, t.right, t.bottom);
          if (score < TRACK_MATCH_IOU) {
            const oWidth = o.right - o.left;
            const dist = Math.hypot(
              (o.left + o.right) / 2 - (t.left + t.right) / 2, (o.top + o.bottom) / 2 - (t.top + t.bottom) / 2,
            );
            const size = Math.max(oWidth, t.width);
            const ratio = Math.min(oWidth, t.width) / Math.max(1, size);
            if (dist < size * 0.5 && ratio > 0.6) score = TRACK_MATCH_IOU + 0.001 * (1 - dist / size);
          }
          if (score > best) {
            best = score;
            bestObs = i;
            bestTrack = j;
          }
        });
      });
      if (bestObs < 0) break;
      assigned[bestObs] = this.tracks[bestTrack];
      taken[bestTrack] = true;
    }
    return assigned;
  }

  private resolveIdentity(
    observations: TrackObservation[], assigned: Track[], now: number, requestIdentity: IdentityRequest,
  ) {
    let bestIndex = -1;
    let bestPriority = 0;
    let bestWidth = 0;
    observations.forEach((o, i) => {
      const t = assigned[i];
      if (t.hits < 2 || !t.isPoseFresh || !canEmbed(t)) return;
      let priority: number;
      if (t.identity === 'unresolved') {
        priority = now - t.lastResolveAttempt >= RESOLVE_INTERVAL_MS ? 2 : 0;
      } else {
        const interval = t.identity === 'owner' ? REVERIFY_OWNER_MS : REVERIFY_UNKNOWN_MS;
        priority = now - t.lastResolved >= interval ? 1 : 0;
      }
      if (priority > bestPriority || (priority === bestPriority && priority > 0 && t.widthPx > bestWidth)) {
        bestPriority = priority;
        bestWidth = t.widthPx;
        bestIndex = i;
      }
    });
    if (bestIndex < 0) return;
    const track = assigned[bestIndex];
    track.lastResolveAttempt = now;
    requestIdentity(observations[bestIndex], track);
  }

  // There is one owner: if several faces match, the best one keeps the role
  private enforceSingleOwner() {
    let owner: Track | undefined;
    this.tracks.forEach((t) => {
      if (t.identity === 'owner' && (!owner || t.similarity > owner.similarity)) owner = t;
    });
    this.tracks.forEach((t) => {
      if (t !== owner && t.identity === 'owner') t.identity = 'unknown';
    });
  }
}

export function applySimilarity(t: Track, sim: number) {
  t.similarity = t.samples === 0 ? sim : t.similarity + IDENTITY_EMA * (sim - t.similarity);
  t.samples++;
  const hasEnough = t.samples >= 2;
  if (t.identity !== 'owner') {
    if ((hasEnough && t.similarity >= OWNER_ACCEPT) || (sim >= OWNER_ACCEPT_SINGLE && t.identity === 'unresolved')) {
      t.identity = 'owner';
    } else if ((hasEnough && t.similarity <= UNKNOWN_REJECT) || sim <= UNKNOWN_REJECT_SINGLE) {
      t.identity = 'unknown';
    }
  } else if (hasEnough && t.similarity <= UNKNOWN_REJECT) {
    t.identity = 'unknown';
  }
}

function canEmbed(t: Track) {
  return t.widthPx >= EMBED_MIN_FACE_PX && Math.abs(t.yaw) <= EMBED_MAX_YAW_DEG
    && Math.abs(t.pitch) <= EMBED_MAX_PITCH_DEG && t.blink < 0.5;
}

function updatePose(t: Track, p: FacePose, now: number, frameWidth: number, sensitivity: number) {
  t.yaw = t.yawFilter.filter(p.yaw, now);
  t.pitch = t.pitchFilter.filter(p.pitch, now);
  const eyeYaw = t.eyeYawFilter.filter(p.isIrisReliable ? p.eyeYaw : t.eyeYawFilter.get(), now);
  const eyePitch = t.eyePitchFilter.filter(p.eyePitch, now);
  t.deviation = getScreenDeviation(t.yaw + EYE_YAW_WEIGHT * eyeYaw, t.pitch + EYE_PITCH_WEIGHT * eyePitch);
  t.blink = p.blink;
  t.widthPx = p.faceWidth;
  t.widthFraction = frameWidth > 0 ? p.faceWidth / frameWidth : 0;

  let raw = 1 - smoothstep(GAZE_ON_DEG[sensitivity], GAZE_OFF_DEG[sensitivity], t.deviation);
  if (Math.abs(t.yaw) > HEAD_MAX_YAW_DEG || Math.abs(t.pitch) > HEAD_MAX_PITCH_DEG) raw = 0;
  if (p.blink > EYES_CLOSED) raw = 0;
  const minFraction = MIN_FACE_WIDTH_FRACTION[sensitivity];
  raw *= Math.max(0, Math.min(1, (t.widthFraction - minFraction) / (minFraction * 0.3)));
  smoothGaze(t, raw, now);
}

function smoothGaze(t: Track, target: number, now: number) {
  const dt = Math.max(1, now - t.lastUpdate);
  t.lastUpdate = now;
  const alpha = 1 - Math.exp(-dt / GAZE_SCORE_TAU_MS);
  t.gazeScore += alpha * (target - t.gazeScore);
  t.isLooking = t.isLooking ? t.gazeScore > GAZE_EXIT : t.gazeScore > GAZE_ENTER;
}

function updateLiveness(t: Track, p: FacePose, now: number) {
  // blinks
  if (!t.areEyesClosed && p.blink > BLINK_CLOSED) {
    t.areEyesClosed = true;
    t.eyesClosedSince = now;
  } else if (t.areEyesClosed && p.blink < BLINK_OPEN) {
    t.areEyesClosed = false;
    if (now - t.eyesClosedSince <= BLINK_MAX_MS) t.lastLiveEvidence = now;
  }

  // natural head and eye micro motion; the threshold grows for small, noisier faces
  t.history.push({
    time: now, yaw: p.yaw, pitch: p.pitch, eye: p.eyeYaw,
  });
  if (t.history.length > HISTORY) t.history.shift();
  const recent = t.history.filter((h) => now - h.time <= LIVE_WINDOW_MS);
  if (recent.length < 5 || now - recent[0].time < 600) return;
  const poseStd = Math.sqrt(variance(recent.map((h) => h.yaw)) + variance(recent.map((h) => h.pitch)));
  const eyeStd = Math.sqrt(variance(recent.map((h) => h.eye)));
  const noise = Math.max(1, 120 / Math.max(1, t.widthPx));
  if (poseStd > LIVE_POSE_STD_DEG * noise || eyeStd > 2 * LIVE_POSE_STD_DEG * noise) t.lastLiveEvidence = now;
}

function variance(values: number[]) {
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  return Math.max(0, values.reduce((sum, v) => sum + v * v, 0) / values.length - mean * mean);
}

// Angle between where the person looks and the screen
export function getScreenDeviation(gazeYaw: number, gazePitch: number) {
  return Math.hypot(gazeYaw, gazePitch - SCREEN_PITCH_BIAS_DEG);
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function iou(l1: number, t1: number, r1: number, b1: number, l2: number, t2: number, r2: number, b2: number) {
  const iw = Math.max(0, Math.min(r1, r2) - Math.max(l1, l2));
  const ih = Math.max(0, Math.min(b1, b2) - Math.max(t1, t2));
  const inter = iw * ih;
  const union = (r1 - l1) * (b1 - t1) + (r2 - l2) * (b2 - t2) - inter;
  return union > 0 ? inter / union : 0;
}
