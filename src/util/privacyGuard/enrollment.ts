import { closeCamera, getMeanLuma, openCamera } from './camera';
import { computePose } from './faceGeometry';
import {
  cosine, detectFaces, embedFace, loadEmbedder, loadLandmarker, normalize,
} from './models';
import { saveOwnerTemplates } from './ownerStore';

// Registers the owner's face (PrivacyGuardEnrollment.java): the head direction lights the matching part of a ring,
// all the way around, like Face ID. Only identity embeddings are kept, encrypted; no photo is taken or stored.

export type EnrollHint = 'none' | 'noFace' | 'multipleFaces' | 'moveCloser' | 'tooDark' | 'openEyes';
export type EnrollError = 'camera' | 'models' | 'inconsistent' | 'save';
export type EnrollProgress = {
  hint: EnrollHint;
  straightFill: number; // 0..1
  covered: boolean[]; // ring sectors, 0 = top, clockwise on the mirrored preview
};

const STEP_STRAIGHT = 0;
const STEP_SIDE = 1;
const STEP_OTHER_SIDE = 2;
const STEP_UP = 3;
const STEP_DOWN = 4;
const STEP_COUNT = 5;
const SAMPLES_PER_STEP = 3;
const MAX_SIDE_SAMPLES = 6;
const SAMPLE_INTERVAL_MS = 220;
const FRAME_INTERVAL_MS = 110;
const MIN_FACE_FRACTION = 0.2;
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
  let lastSector = -1;
  let lastSample = 0;

  const stop = () => {
    isRunning = false;
    window.clearTimeout(timer);
    closeCamera(video, stream);
  };

  const finish = (isSuccess: boolean, error?: EnrollError) => {
    stop();
    onFinish(isSuccess, error);
  };

  const report = (hint: EnrollHint) => onProgress({
    hint, straightFill: Math.min(1, samples[STEP_STRAIGHT].length / SAMPLES_PER_STEP), covered: [...covered],
  });

  const relYaw = () => smoothYaw - baselineYaw;
  const relPitch = () => (samples[STEP_STRAIGHT].length ? smoothPitch - baselinePitch : smoothPitch);
  const isStraight = () => Math.abs(relYaw()) < 9 && Math.abs(relPitch()) < 11;
  const getSector = () => {
    const x = -relYaw() / 28; // mirrored preview: a negative yaw is a turn toward screen right
    const y = relPitch() / 20; // up is positive
    const m = Math.hypot(x, y);
    if (m < 0.45 || m > 1.7) return -1;
    let deg = Math.atan2(x, y) * 180 / Math.PI;
    if (deg < 0) deg += 360;
    return Math.min(ENROLL_SECTORS - 1, Math.floor(deg / (360 / ENROLL_SECTORS)));
  };
  const getQuadrant = (sector: number) => {
    const deg = (sector + 0.5) * 360 / ENROLL_SECTORS;
    if (deg >= 315 || deg < 45) return STEP_UP;
    if (deg < 135) return STEP_SIDE;
    if (deg < 225) return STEP_DOWN;
    return STEP_OTHER_SIDE;
  };
  const isComplete = () => covered.every(Boolean) && samples[STEP_STRAIGHT].length >= SAMPLES_PER_STEP
    && samples.slice(1).every((list) => list.length > 0);

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
      [landmarker, embedder] = await Promise.all([loadLandmarker(), loadEmbedder()]);
    } catch {
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
        const [face] = faces;
        if (faces.length > 1 && faces[1].right - faces[1].left > (face.right - face.left) * 0.4) {
          report('multipleFaces');
          return;
        }
        const pose = computePose(face);
        if (pose.faceWidth / video.videoWidth < MIN_FACE_FRACTION) {
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
        // the ring only counts once the straight look is known: directions are measured from it
        const isCalibrated = samples[STEP_STRAIGHT].length >= SAMPLES_PER_STEP;
        const rawSector = isCalibrated ? getSector() : -1;
        // a sector is covered only after the head stayed there for two analysed frames in a row
        const sector = rawSector >= 0 && rawSector === lastSector ? rawSector : -1;
        lastSector = rawSector;
        let isChanged = false;
        if (sector >= 0 && !covered[sector]) {
          covered[sector] = true;
          isChanged = true;
        }
        const bucket = sector >= 0 ? getQuadrant(sector)
          : !isCalibrated
            ? (Math.abs(smoothYaw) < 12 && Math.abs(smoothPitch) < 20 ? STEP_STRAIGHT : -1)
            : (isStraight() ? STEP_STRAIGHT : -1);
        const limit = bucket === STEP_STRAIGHT ? SAMPLES_PER_STEP : MAX_SIDE_SAMPLES;
        if (bucket >= 0 && samples[bucket].length < limit && now - lastSample >= SAMPLE_INTERVAL_MS) {
          lastSample = now;
          const list = samples[bucket];
          list.push(await embedFace(embedder, video, face));
          if (bucket === STEP_STRAIGHT) {
            // the user's natural straight look becomes the centre
            baselinePitch += (smoothPitch - baselinePitch) / list.length;
            baselineYaw += (smoothYaw - baselineYaw) / list.length;
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
