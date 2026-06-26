// Public API of the reactive core (Layer 0).
// Each primitive is its own module so bundlers can tree-shake what you don't use.

export { signal } from "./signal";
export { computed } from "./computed";
export { effect } from "./effect";
export { batch } from "./batch";
export { untrack } from "./untrack";
export { createRoot, onCleanup } from "./owner";

export type {
  Accessor,
  WritableSignal,
  SignalOptions,
  ComputedOptions,
  EffectOptions,
  Dispose,
  Cleanup,
} from "./types";
