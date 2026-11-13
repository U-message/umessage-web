// Every threshold and timing Privacy Guard uses, ported unchanged from the Android app (PrivacyGuardTuning.java).
// Arrays indexed by sensitivity are [LOW, BALANCED, HIGH]. Calibrated on the same MediaPipe and MobileFaceNet models.

/* Timing */
export const ACTIVATE_DWELL_MS = [900, 350, 120];
export const RELEASE_DELAY_MS = 450;
export const SUSPICIOUS_GRACE_MS = 250;
export const OWNER_RECENT_MS = 700;
export const OWNER_AWAY_DELAY_MS = 600;
export const OWNER_RETURN_MS = 300;
export const OWNER_LOOK_AWAY_DEG = 35;

/* Face tracking */
export const TRACK_CONFIRM_HITS = 3;
export const TRACK_CONFIRM_MS = 250;
export const TRACK_COAST_MS = 450;
export const TRACK_MATCH_IOU = 0.2;

/* Gaze */
export const GAZE_ON_DEG = [6, 11, 18];
export const GAZE_OFF_DEG = [13, 21, 32];
// The screen lies below the camera, so a viewer reading it looks slightly down from the camera ray
export const SCREEN_PITCH_BIAS_DEG = -6;
export const EYE_YAW_GAIN = 110;
export const EYE_PITCH_GAIN = 30;
export const EYE_YAW_WEIGHT = 0.8;
export const EYE_PITCH_WEIGHT = 0.7;
export const HEAD_MAX_YAW_DEG = 45;
export const HEAD_MAX_PITCH_DEG = 40;
export const EYES_CLOSED = 0.6;
export const GAZE_ENTER = 0.6;
export const GAZE_EXIT = 0.35;
export const GAZE_SCORE_TAU_MS = 120;
export const MIN_FACE_WIDTH_FRACTION = [0.14, 0.085, 0.05];

/* Owner recognition (cosine similarity of MobileFaceNet embeddings) */
export const OWNER_ACCEPT = 0.55;
export const OWNER_ACCEPT_SINGLE = 0.68;
export const UNKNOWN_REJECT = 0.35;
export const UNKNOWN_REJECT_SINGLE = 0.2;
export const IDENTITY_EMA = 0.5;
export const EMBED_MIN_FACE_PX = 56;
export const EMBED_MAX_YAW_DEG = 40;
export const EMBED_MAX_PITCH_DEG = 35;
export const REVERIFY_OWNER_MS = 2500;
export const REVERIFY_UNKNOWN_MS = 1500;
export const RESOLVE_INTERVAL_MS = 150;

/* Liveness: printed or on-screen faces never move or blink */
export const LIVE_WINDOW_MS = 1500;
export const LIVE_POSE_STD_DEG = 0.6;
export const LIVE_HOLD_MS = 10000;
export const BLINK_CLOSED = 0.55;
export const BLINK_OPEN = 0.3;
export const BLINK_MAX_MS = 700;

/* Frames */
export const ANALYSIS_WIDTH = 640;
export const ANALYSIS_HEIGHT = 480;
export const FPS_ACTIVE = 15;
export const MAX_FACES = 4;
