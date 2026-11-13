import type { FaceLandmarker } from '@mediapipe/tasks-vision';

import type { Face } from './faceGeometry';
import type { LiteRtModel } from './litert';

import { getAlignmentPoints } from './faceGeometry';
import { MAX_FACES } from './tuning';

// The models load only when Privacy Guard is used; everything runs in this browser, nothing is uploaded
const BASE_PATH = './privacy-guard';
const EMBED_SIZE = 112;
// Reference positions of the eyes, nose tip and mouth corners (left to right) in the 112x112 MobileFaceNet crop
const TEMPLATE = [
  [38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041],
];

let landmarkerPromise: Promise<FaceLandmarker> | undefined;
let embedderPromise: Promise<LiteRtModel> | undefined;
let cropCanvas: OffscreenCanvas | HTMLCanvasElement | undefined;

export function loadLandmarker() {
  landmarkerPromise ??= (async () => {
    const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
    const fileset = await FilesetResolver.forVisionTasks(`${BASE_PATH}/mediapipe-1.2.0`);
    return FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: `${BASE_PATH}/face_landmarker.task`, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numFaces: MAX_FACES,
      outputFaceBlendshapes: true,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  })();
  landmarkerPromise.catch(() => {
    landmarkerPromise = undefined;
  });
  return landmarkerPromise;
}

export function loadEmbedder() {
  embedderPromise ??= (async () => {
    const { loadLiteRt, loadAndCompile } = await import('./litert');
    await loadLiteRt(`${BASE_PATH}/litert-2.6.0/`);
    return loadAndCompile(`${BASE_PATH}/face_embedding.tflite`, { accelerator: 'wasm' });
  })();
  embedderPromise.catch(() => {
    embedderPromise = undefined;
  });
  return embedderPromise;
}

// MediaPipe landmarks are normalized; the geometry code works in frame pixels like the Android pipeline
export function detectFaces(landmarker: FaceLandmarker, video: HTMLVideoElement, timestamp: number): Face[] {
  const width = video.videoWidth;
  const height = video.videoHeight;
  const result = landmarker.detectForVideo(video, timestamp);
  const faces = result.faceLandmarks.map((points, index) => {
    const landmarks = new Float32Array(points.length * 3);
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    points.forEach((p, i) => {
      const px = p.x * width;
      const py = p.y * height;
      landmarks[i * 3] = px;
      landmarks[i * 3 + 1] = py;
      landmarks[i * 3 + 2] = p.z * width;
      left = Math.min(left, px);
      top = Math.min(top, py);
      right = Math.max(right, px);
      bottom = Math.max(bottom, py);
    });
    const blendshapes: Record<string, number> = {};
    result.faceBlendshapes[index]?.categories.forEach((c) => {
      blendshapes[c.categoryName] = c.score;
    });
    return {
      landmarks, blendshapes, left, top, right, bottom,
    };
  });
  // largest first, like the Android pipeline
  return faces.sort((a, b) => (b.right - b.left) - (a.right - a.left));
}

// L2-normalized MobileFaceNet embedding of a face aligned to the 5-point template; the face and its mirror image are
// embedded and averaged (FaceEmbedder.java), which is more robust and mirror invariant
export async function embedFace(model: LiteRtModel, video: HTMLVideoElement, face: Face) {
  const { Tensor } = await import('./litert');
  const transform = getSimilarityTransform(getAlignmentPoints(face));
  cropCanvas ??= typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(EMBED_SIZE, EMBED_SIZE)
    : Object.assign(document.createElement('canvas'), { width: EMBED_SIZE, height: EMBED_SIZE });
  const ctx = cropCanvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, EMBED_SIZE, EMBED_SIZE);
  ctx.setTransform(transform.a, transform.b, -transform.b, transform.a, transform.tx, transform.ty);
  ctx.drawImage(video, 0, 0);
  const pixels = ctx.getImageData(0, 0, EMBED_SIZE, EMBED_SIZE).data;

  const inputShape = model.getInputDetails()[0]?.shape;
  const batch = inputShape?.[0] && inputShape[0] > 1 ? inputShape[0] : 1;
  const runs = batch >= 2 ? [[false, true]] : [[false], [true]];
  let result: number[] = [];
  let dimension = 0;
  for (const mirrors of runs) {
    const input = new Float32Array(batch * EMBED_SIZE * EMBED_SIZE * 3);
    mirrors.forEach((isMirror, n) => fillInput(input, n, pixels, isMirror));
    const tensor = new Tensor(input, [batch, EMBED_SIZE, EMBED_SIZE, 3]);
    const [output] = await model.run(tensor);
    const data = await output.data();
    tensor.delete();
    output.delete();
    dimension = data.length / batch;
    mirrors.forEach((_, n) => {
      const row = normalize(Array.from(data.subarray(n * dimension, (n + 1) * dimension)));
      result = row.map((value, i) => (result[i] || 0) + value);
    });
  }
  return normalize(result);
}

function fillInput(input: Float32Array, n: number, pixels: Uint8ClampedArray, isMirror: boolean) {
  let offset = n * EMBED_SIZE * EMBED_SIZE * 3;
  for (let y = 0; y < EMBED_SIZE; y++) {
    for (let x = 0; x < EMBED_SIZE; x++) {
      const p = (y * EMBED_SIZE + (isMirror ? EMBED_SIZE - 1 - x : x)) * 4;
      input[offset++] = (pixels[p] - 127.5) / 128;
      input[offset++] = (pixels[p + 1] - 127.5) / 128;
      input[offset++] = (pixels[p + 2] - 127.5) / 128;
    }
  }
}

// Least squares similarity transform (rotation, uniform scale, translation) from the face points to the template
function getSimilarityTransform(points: number[][]) {
  let msx = 0;
  let msy = 0;
  let mdx = 0;
  let mdy = 0;
  points.forEach(([px, py], i) => {
    msx += px;
    msy += py;
    mdx += TEMPLATE[i][0];
    mdy += TEMPLATE[i][1];
  });
  msx /= 5;
  msy /= 5;
  mdx /= 5;
  mdy /= 5;
  let dot = 0;
  let cross = 0;
  let norm = 0;
  points.forEach(([px0, py0], i) => {
    const px = px0 - msx;
    const py = py0 - msy;
    const qx = TEMPLATE[i][0] - mdx;
    const qy = TEMPLATE[i][1] - mdy;
    dot += px * qx + py * qy;
    cross += px * qy - py * qx;
    norm += px * px + py * py;
  });
  const a = dot / norm;
  const b = cross / norm;
  return {
    a, b, tx: mdx - (a * msx - b * msy), ty: mdy - (b * msx + a * msy),
  };
}

export function normalize(values: number[]) {
  const length = Math.sqrt(Math.max(values.reduce((sum, v) => sum + v * v, 0), 1e-12));
  return values.map((v) => v / length);
}

export function cosine(a: number[], b: number[]) {
  let sum = 0;
  for (let i = 0, n = Math.min(a.length, b.length); i < n; i++) sum += a[i] * b[i];
  return sum;
}

// Best match of an embedding against the owner's enrolled templates
export function getOwnerSimilarity(embedding: number[], templates: number[][]) {
  return templates.reduce((best, template) => Math.max(best, cosine(embedding, template)), -1);
}
