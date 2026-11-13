import { ANALYSIS_HEIGHT, ANALYSIS_WIDTH } from './tuning';

// The front camera at analysis resolution; frames stay in memory only while they are analysed, nothing is recorded
export async function openCamera(video: HTMLVideoElement) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: 'user', width: { ideal: ANALYSIS_WIDTH }, height: { ideal: ANALYSIS_HEIGHT },
    },
    audio: false,
  });
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await video.play();
  return stream;
}

export function closeCamera(video: HTMLVideoElement, stream?: MediaStream) {
  stream?.getTracks().forEach((track) => track.stop());
  video.srcObject = null; // eslint-disable-line no-null/no-null
}

let lumaCanvas: HTMLCanvasElement | undefined;
const LUMA_SIZE = 32;

// Mean brightness of the frame, to ask for more light during enrollment
export function getMeanLuma(video: HTMLVideoElement) {
  lumaCanvas ??= Object.assign(document.createElement('canvas'), { width: LUMA_SIZE, height: LUMA_SIZE });
  const ctx = lumaCanvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(video, 0, 0, LUMA_SIZE, LUMA_SIZE);
  const { data } = ctx.getImageData(0, 0, LUMA_SIZE, LUMA_SIZE);
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  return sum / (data.length / 4);
}
