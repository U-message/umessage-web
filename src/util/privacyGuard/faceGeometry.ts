import { EYE_PITCH_GAIN, EYE_PITCH_WEIGHT, EYE_YAW_GAIN, EYE_YAW_WEIGHT } from './tuning';

// One face from MediaPipe, in frame pixels (z uses the x scale, smaller is closer)
export type Face = {
  landmarks: Float32Array; // x, y, z per landmark, 478 landmarks with iris
  blendshapes: Record<string, number>;
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type FacePose = {
  yaw: number;
  pitch: number;
  eyeYaw: number;
  eyePitch: number;
  isIrisReliable: boolean;
  blink: number;
  gazeYaw: number;
  gazePitch: number;
  faceWidth: number;
};

const x = (f: Face, i: number) => f.landmarks[i * 3];
const y = (f: Face, i: number) => f.landmarks[i * 3 + 1];
const z = (f: Face, i: number) => f.landmarks[i * 3 + 2];
const toDeg = (rad: number) => rad * 180 / Math.PI;

export function getFaceWidth(f: Face) {
  return Math.hypot(x(f, 454) - x(f, 234), y(f, 454) - y(f, 234));
}

// Head pose and gaze from the face mesh (FaceGeometry.java). Degrees in the upright frame; yaw positive toward +x,
// pitch positive when looking up. A face looking at the camera appears frontal, so pose already includes its position.
export function computePose(f: Face): FacePose {
  // face axes: across the eyes and cheeks, and forehead to chin
  const xx = (x(f, 263) - x(f, 33)) + (x(f, 454) - x(f, 234));
  const xy = (y(f, 263) - y(f, 33)) + (y(f, 454) - y(f, 234));
  const xz = (z(f, 263) - z(f, 33)) + (z(f, 454) - z(f, 234));
  const yx = x(f, 152) - x(f, 10);
  const yy = y(f, 152) - y(f, 10);
  const yz = z(f, 152) - z(f, 10);
  // forward (toward the viewer's gaze) = -(x cross y)
  let fx = -(xy * yz - xz * yy);
  let fy = -(xz * yx - xx * yz);
  let fz = -(xx * yy - xy * yx);
  const len = Math.sqrt(fx * fx + fy * fy + fz * fz);
  if (len > 1e-6) {
    fx /= len;
    fy /= len;
    fz /= len;
  }
  const yaw = toDeg(Math.atan2(fx, -fz));
  const pitch = toDeg(Math.atan2(-fy, -fz));

  // eyes: iris position between the eye corners; the average cancels the symmetric resting offset
  const o1 = getIrisOffset(f, 468, 33, 133);
  const o2 = getIrisOffset(f, 473, 362, 263);
  const isIrisReliable = Math.abs(o1) < 0.6 && Math.abs(o2) < 0.6;
  const eyeYaw = isIrisReliable ? ((o1 + o2) / 2) * EYE_YAW_GAIN : 0;
  const bs = f.blendshapes;
  const up = ((bs.eyeLookUpLeft || 0) + (bs.eyeLookUpRight || 0)) / 2;
  const down = ((bs.eyeLookDownLeft || 0) + (bs.eyeLookDownRight || 0)) / 2;
  const eyePitch = (up - down) * EYE_PITCH_GAIN;
  const blink = ((bs.eyeBlinkLeft || 0) + (bs.eyeBlinkRight || 0)) / 2;

  return {
    yaw,
    pitch,
    eyeYaw,
    eyePitch,
    isIrisReliable,
    blink,
    gazeYaw: yaw + EYE_YAW_WEIGHT * eyeYaw,
    gazePitch: pitch + EYE_PITCH_WEIGHT * eyePitch,
    faceWidth: getFaceWidth(f),
  };
}

// Iris position along the eye, -0.5 .. 0.5, positive toward +x
function getIrisOffset(f: Face, iris: number, c1: number, c2: number) {
  let ax = x(f, c1);
  let ay = y(f, c1);
  let bx = x(f, c2);
  let by = y(f, c2);
  if (ax > bx) {
    [ax, bx] = [bx, ax];
    [ay, by] = [by, ay];
  }
  const vx = bx - ax;
  const vy = by - ay;
  const len2 = vx * vx + vy * vy;
  if (len2 < 1e-3) return 1;
  return ((x(f, iris) - ax) * vx + (y(f, iris) - ay) * vy) / len2 - 0.5;
}

// Eye centers, nose tip and mouth corners, left to right in the frame: the 5 points MobileFaceNet is aligned on
export function getAlignmentPoints(f: Face) {
  let e1 = [(x(f, 33) + x(f, 133)) / 2, (y(f, 33) + y(f, 133)) / 2];
  let e2 = [(x(f, 362) + x(f, 263)) / 2, (y(f, 362) + y(f, 263)) / 2];
  if (e1[0] > e2[0]) [e1, e2] = [e2, e1];
  let m1 = [x(f, 61), y(f, 61)];
  let m2 = [x(f, 291), y(f, 291)];
  if (m1[0] > m2[0]) [m1, m2] = [m2, m1];
  return [e1, e2, [x(f, 1), y(f, 1)], m1, m2];
}
