import type { GuardConfig, GuardReason } from './stateMachine';

import { createCallbackManager } from '../callbacks';
import { closeCamera, openCamera } from './camera';
import { computePose } from './faceGeometry';
import FaceTracker from './faceTracker';
import {
  detectFaces, embedFace, getOwnerSimilarity, loadModels,
} from './models';
import { clearOwnerCache, loadOwnerTemplates } from './ownerStore';
import GuardStateMachine from './stateMachine';
import { FPS_ACTIVE } from './tuning';

// Privacy Guard while a chat is open (PrivacyGuardEngine.java): camera frames -> faces -> tracker -> state machine.
// Frames are analysed in memory and dropped; nothing is recorded, stored or sent.

export type GuardStatus = 'off' | 'starting' | 'running' | 'error';
export type GuardSnapshot = { status: GuardStatus; isProtected: boolean; reason: GuardReason };

const FRAME_INTERVAL_MS = 1000 / FPS_ACTIVE;

let snapshot: GuardSnapshot = { status: 'off', isProtected: false, reason: 'none' };
const listeners = createCallbackManager<(value: GuardSnapshot) => void>();

let config: GuardConfig = { mode: 'looking', sensitivity: 1, shouldHideWhenOwnerAway: true };
let runId = 0;
let video: HTMLVideoElement | undefined;
let stream: MediaStream | undefined;
let timer: number | undefined;
const tracker = new FaceTracker();
const stateMachine = new GuardStateMachine();
let isEmbedding = false;
let isSuspended = false;

// Enrollment needs the camera: the guard steps aside meanwhile and the shield restarts it afterwards
export function setGuardSuspended(value: boolean) {
  isSuspended = value;
  if (value) stopGuard();
  else listeners.runCallbacks({ ...snapshot }); // a fresh object so subscribers re-render and restart
}

function publish(next: Partial<GuardSnapshot>) {
  const merged = { ...snapshot, ...next };
  if (merged.status === snapshot.status && merged.isProtected === snapshot.isProtected
    && merged.reason === snapshot.reason) return;
  snapshot = merged;
  listeners.runCallbacks(snapshot);
}

export function getGuardSnapshot() {
  return snapshot;
}

export function subscribeToGuard(callback: (value: GuardSnapshot) => void) {
  listeners.addCallback(callback);
  return () => listeners.removeCallback(callback);
}

export function setGuardConfig(next: GuardConfig) {
  config = next;
}

// The user chose to show the chat anyway: current faces stop counting, new ones still do
export function dismissGuard() {
  tracker.dismissCurrent();
  stateMachine.dismiss();
  publish({ isProtected: false, reason: 'none' });
}

export async function startGuard() {
  if (isSuspended || snapshot.status === 'running' || snapshot.status === 'starting') return;
  const id = ++runId;
  publish({ status: 'starting' });
  try {
    const { landmarker, embedder } = await loadModels();
    const templates = await loadOwnerTemplates();
    if (id !== runId) return;
    if (!templates?.length) throw new Error('No enrolled face');
    video = document.createElement('video');
    stream = await openCamera(video);
    if (id !== runId) {
      closeCamera(video, stream);
      return;
    }
    tracker.reset();
    stateMachine.reset();
    publish({ status: 'running', isProtected: false, reason: 'none' });

    const tick = () => {
      if (id !== runId || !video) return;
      const now = performance.now();
      try {
        const faces = detectFaces(landmarker, video, now);
        const observations = faces.map((face, index) => ({
          left: face.left, top: face.top, right: face.right, bottom: face.bottom, pose: computePose(face), index,
        }));
        tracker.update(observations, now, video.videoWidth, config.sensitivity, (observation, track) => {
          // Embeddings are async on the web; one at a time, applied to the track when ready
          if (isEmbedding || !video) return;
          isEmbedding = true;
          const currentVideo = video;
          embedFace(embedder, currentVideo, faces[observation.index])
            .then((embedding) => {
              if (id !== runId) return;
              tracker.applyResolved(track.id, getOwnerSimilarity(embedding, templates), performance.now());
            })
            .catch(() => undefined)
            .finally(() => {
              isEmbedding = false;
            });
        });
        const summary = tracker.summarize(now, config.sensitivity);
        stateMachine.update({ now, ...summary }, config);
        publish({ isProtected: stateMachine.isProtected, reason: stateMachine.reason });
      } finally {
        if (id === runId) timer = window.setTimeout(tick, FRAME_INTERVAL_MS);
      }
    };
    tick();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[PrivacyGuard] could not start', err);
    if (id === runId) {
      stopGuard();
      publish({ status: 'error' });
    }
  }
}

export function stopGuard() {
  runId++;
  window.clearTimeout(timer);
  if (video) closeCamera(video, stream);
  video = undefined;
  stream = undefined;
  tracker.reset();
  stateMachine.reset();
  clearOwnerCache();
  publish({ status: 'off', isProtected: false, reason: 'none' });
}
