import { closeCamera, getMeanLuma, openCamera } from './camera';
import { computePose } from './faceGeometry';
import {
  cosine, detectFaces, embedFace, loadModels, normalize,
} from './models';
import { saveOwnerTemplates } from './ownerStore';

// Registers the owner's face. Simpler than the Android ring: a straight look, then a small turn to each side, up and
// down, each lighting a quarter of the ring. Only identity embeddings are kept, encrypted; no photo is taken or stored.

export type EnrollHint = 'none' | 'noFace' | 'multipleFaces' | 'moveCloser' | 'tooDark' | 'openEyes';
export type EnrollError = 'camera' | 'models' | 'inconsistent' | 'save';
export type EnrollStep = 'straight' | 'side' | 'otherSide' | 'up' | 'down';
export type EnrollProgress = {
  hint: EnrollHint;
  step: EnrollStep; // what to do next
  straightFill: number; // 0..1
  covered: boolean[]; // ring sectors, 0 = top, clockwise on the mirrored preview
  face?: { cx: number; cy: number; size: number }; // in video pixels, for the auto-zoomed preview
};

const STEP_STRAIGHT = 0;
const STEP_SIDE = 1;
const STEP_OTHER_SIDE = 2;
const STEP_UP = 3;
const STEP_DOWN = 4;
const STEP_COUNT = 5;
const SAMPLES_PER_STEP = 3;
const SIDE_SAMPLES = 2;
// Small turns are enough; measured from the user's own straight look
const TURN_YAW_DEG = 13;
const TURN_PITCH_DEG = 9;
// Below this the face is too small for a usable identity embedding (MobileFaceNet input is 112px)
const MIN_FACE_PX = 60;
const SAMPLE_INTERVAL_MS = 220;
const FRAME_INTERVAL_MS = 110;
const MIN_LUMA = 20;
const MIN_CONSISTENCY = 0.5;
export const ENROLL_SECTORS = 24;

export type EnrollPhase = 'loading' | 'camera' | 'running';

export function startEnrollment(
  video: HTMLVideoElement,
  onProgress: (progress: EnrollProgress) => void,
  onFinish: (isSuccess: boolean, error?: EnrollError) => void,
  onPhase?: (phase: EnrollPhase) => void,
) {
  let isRunning = true;
  let stream: MediaStream | undefined;
  let timer: number | undefined;
  const samples: number[][][] = Array.from({ length: STEP_COUNT }, () => []);
  const covered = new Array(ENROLL_SECTORS).fill(false);
  let smoothYaw = NaN;
  let smoothPitch = NaN;
  let baselineYaw = 0;
  let baselinePitch = 0;
  let lastBucket = -1;
  let lastSample = 0;
  let face: EnrollProgress['face'];

  const stop = () => {
    isRunning = false;
    window.clearTimeout(timer);
    closeCamera(video, stream);
  };

  const finish = (isSuccess: boolean, error?: EnrollError) => {
    stop();
    onFinish(isSuccess, error);
  };

  const getNextStep = (): EnrollStep => {
    if (samples[STEP_STRAIGHT].length < SAMPLES_PER_STEP) return 'straight';
    const hasSide = samples[STEP_SIDE].length >= SIDE_SAMPLES;
    const hasOtherSide = samples[STEP_OTHER_SIDE].length >= SIDE_SAMPLES;
    if (!hasSide && !hasOtherSide) return 'side';
    if (!hasSide || !hasOtherSide) return 'otherSide';
    if (samples[STEP_UP].length < SIDE_SAMPLES) return 'up';
    return 'down';
  };

  const report = (hint: EnrollHint) => onProgress({
    hint,
    step: getNextStep(),
    straightFill: Math.min(1, samples[STEP_STRAIGHT].length / SAMPLES_PER_STEP),
    covered: [...covered],
    face,
  });

  // Each direction lights its quarter of the ring (up = top, STEP_SIDE = screen right on the mirrored preview)
  const QUARTERS: Record<number, number> = {
    [STEP_UP]: 0, [STEP_SIDE]: 1, [STEP_DOWN]: 2, [STEP_OTHER_SIDE]: 3,
  };
  const lightQuarter = (bucket: number) => {
    const quarter = QUARTERS[bucket];
    if (quarter === undefined) return;
    const perQuarter = ENROLL_SECTORS / 4;
    // quarter 0 is centred on the top: sectors -3..2 around 0
    for (let i = 0; i < perQuarter; i++) {
      covered[(quarter * perQuarter - perQuarter / 2 + i + ENROLL_SECTORS) % ENROLL_SECTORS] = true;
    }
  };

  const relYaw = () => smoothYaw - baselineYaw;
  const relPitch = () => (samples[STEP_STRAIGHT].length ? smoothPitch - baselinePitch : smoothPitch);
  const getBucket = (isCalibrated: boolean) => {
    if (!isCalibrated) return Math.abs(smoothYaw) < 14 && Math.abs(smoothPitch) < 20 ? STEP_STRAIGHT : -1;
    const yaw = relYaw();
    const pitch = relPitch();
    if (Math.abs(yaw) >= TURN_YAW_DEG && Math.abs(yaw) >= Math.abs(pitch)) return yaw < 0 ? STEP_SIDE : STEP_OTHER_SIDE;
    if (pitch >= TURN_PITCH_DEG) return STEP_UP;
    if (pitch <= -TURN_PITCH_DEG) return STEP_DOWN;
    return Math.abs(yaw) < 8 && Math.abs(pitch) < 8 ? STEP_STRAIGHT : -1;
  };
  const isComplete = () => samples[STEP_STRAIGHT].length >= SAMPLES_PER_STEP
    && samples.slice(1).every((list) => list.length >= SIDE_SAMPLES);

  const complete = async () => {
    // every orientation must belong to the same person as the straight one
    const mean = (list: number[][]) => normalize(list[0].map((_, i) => list.reduce((sum, v) => sum + v[i], 0)));
    const reference = mean(samples[STEP_STRAIGHT]);
    const templates: number[][] = [];
    for (const list of samples) {
      if (!list.length) continue;
      const m = mean(list);
      if (cosine(m, reference) < MIN_CONSISTENCY) {
        finish(false, 'inconsistent');
        return;
      }
      templates.push(m, ...list);
    }
    try {
      await saveOwnerTemplates(templates);
      finish(true);
    } catch {
      finish(false, 'save');
    }
  };

  void (async () => {
    let landmarker;
    let embedder;
    onPhase?.('loading');
    try {
      ({ landmarker, embedder } = await loadModels());
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[PrivacyGuard] models failed to load', err);
      finish(false, 'models');
      return;
    }
    if (!isRunning) return;
    onPhase?.('camera');
    try {
      stream = await openCamera(video);
    } catch {
      finish(false, 'camera');
      return;
    }
    if (!isRunning) {
      closeCamera(video, stream);
      return;
    }
    onPhase?.('running');

    const tick = async () => {
      if (!isRunning) return;
      const now = performance.now();
      try {
        if (getMeanLuma(video) < MIN_LUMA) {
          report('tooDark');
          return;
        }
        const faces = detectFaces(landmarker, video, now);
        if (!faces.length) {
          report('noFace');
          return;
        }
        const [main] = faces;
        face = { cx: (main.left + main.right) / 2, cy: (main.top + main.bottom) / 2, size: main.right - main.left };
        if (faces.length > 1 && faces[1].right - faces[1].left > (main.right - main.left) * 0.4) {
          report('multipleFaces');
          return;
        }
        const pose = computePose(main);
        if (pose.faceWidth < MIN_FACE_PX) {
          report('moveCloser');
          return;
        }
        if (pose.blink > 0.5) {
          report('openEyes');
          return;
        }
        // smooth the pose so one noisy frame can't light a wrong part of the ring
        if (Number.isNaN(smoothYaw)) {
          smoothYaw = pose.yaw;
          smoothPitch = pose.pitch;
        } else {
          smoothYaw += (pose.yaw - smoothYaw) * 0.5;
          smoothPitch += (pose.pitch - smoothPitch) * 0.5;
        }
        // directions are measured from the straight look; a direction counts after two analysed frames in a row
        const isCalibrated = samples[STEP_STRAIGHT].length >= SAMPLES_PER_STEP;
        const rawBucket = getBucket(isCalibrated);
        const bucket = rawBucket >= 0 && rawBucket === lastBucket ? rawBucket : -1;
        lastBucket = rawBucket;
        let isChanged = false;
        const limit = bucket === STEP_STRAIGHT ? SAMPLES_PER_STEP : SIDE_SAMPLES;
        if (bucket >= 0 && samples[bucket].length < limit && now - lastSample >= SAMPLE_INTERVAL_MS) {
          lastSample = now;
          const list = samples[bucket];
          list.push(await embedFace(embedder, video, main));
          if (bucket === STEP_STRAIGHT) {
            // the user's natural straight look becomes the centre
            baselinePitch += (smoothPitch - baselinePitch) / list.length;
            baselineYaw += (smoothYaw - baselineYaw) / list.length;
          } else if (list.length >= SIDE_SAMPLES) {
            lightQuarter(bucket);
          }
          isChanged = true;
        }
        if (isChanged && isComplete()) {
          isRunning = false;
          await complete();
          return;
        }
        report('none');
      } finally {
        if (isRunning) timer = window.setTimeout(tick, FRAME_INTERVAL_MS);
      }
    };
    void tick();
  })();

  return stop;
}
