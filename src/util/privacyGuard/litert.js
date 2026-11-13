// LiteRT.js ships a `declare global` that changes TypedArray constructors for the whole project, so its types stay
// out of TypeScript: this file is excluded from tsconfig and typed by litert.d.ts instead.
export { loadAndCompile, loadLiteRt, Tensor } from '@litertjs/core';
