// Minimal types for the LiteRT.js calls Privacy Guard makes (see litert.js for why the package types are not used)
export type LiteRtTensor = {
  data(): Promise<Float32Array>;
  delete(): void;
};

export type LiteRtTensorDetails = { readonly shape: Int32Array };

export type LiteRtModel = {
  getInputDetails(): readonly LiteRtTensorDetails[];
  run(input: LiteRtTensor): Promise<LiteRtTensor[]>;
};

export function loadLiteRt(path: string): Promise<unknown>;
export function loadAndCompile(model: string, options?: { accelerator?: 'wasm' | 'webgpu' }): Promise<LiteRtModel>;

export const Tensor: new (data: Float32Array, shape: number[]) => LiteRtTensor;
