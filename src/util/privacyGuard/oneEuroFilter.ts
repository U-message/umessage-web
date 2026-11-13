// One Euro filter (Casiez et al.): little lag on fast motion, strong smoothing when still
export default class OneEuroFilter {
  private isInitialized = false;

  private value = 0;

  private derivative = 0;

  private lastTime = 0;

  constructor(private minCutoff: number, private beta: number, private derivativeCutoff: number) {}

  filter(x: number, timeMs: number) {
    if (!this.isInitialized) {
      this.isInitialized = true;
      this.value = x;
      this.derivative = 0;
      this.lastTime = timeMs;
      return x;
    }
    const dt = Math.max(1, timeMs - this.lastTime) / 1000;
    this.lastTime = timeMs;
    const dx = (x - this.value) / dt;
    this.derivative += getAlpha(this.derivativeCutoff, dt) * (dx - this.derivative);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.derivative);
    this.value += getAlpha(cutoff, dt) * (x - this.value);
    return this.value;
  }

  get() {
    return this.value;
  }
}

function getAlpha(cutoff: number, dt: number) {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}
