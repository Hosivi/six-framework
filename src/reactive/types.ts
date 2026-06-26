// Public types for the reactive core (Layer 0).
// These are the contract the rest of the framework builds on.

/** A read-only reactive value. Calling it reads AND tracks the dependency. */
export type Accessor<T> = () => T;

/**
 * A writable reactive value. It is callable (read + track) and carries
 * `set` / `update` as closures — no `this`, no class, no proxy.
 */
export interface WritableSignal<T> {
  (): T;
  set(value: T): void;
  update(fn: (prev: T) => T): void;
}

export interface SignalOptions<T> {
  /** Custom equality. `false` means "always notify" (never bail out). */
  equals?: false | ((prev: T, next: T) => boolean);
  /** Optional name for debugging / future addressing (resumability). */
  name?: string;
}

export interface ComputedOptions<T> {
  equals?: false | ((prev: T, next: T) => boolean);
  name?: string;
}

export interface EffectOptions {
  name?: string;
}

/** Disposes a reactive scope or effect. */
export type Dispose = () => void;

/** A cleanup callback registered via onCleanup. */
export type Cleanup = () => void;
