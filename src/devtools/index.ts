// devtools — reactive-graph instrumentation layer.
//
// NOT a browser extension. This is the hook layer a devtool builds ON: it
// exposes six's reactive graph (signals, computeds, effects) and a live event
// stream of "signal changed -> computations ran". React inspects a component
// tree; six has no components — it has a reactive graph, so this inspects that.
//
//   enableDevtools();
//   // ...run your app...
//   getDevtools().stats();          // { signals, computeds, effects, writes, runs }
//   getDevtools().onEvent((e) => console.log(e));
//   globalThis.__SX_DEVTOOLS__      // same handle, for an external inspector
//
// Zero-cost when off: nothing here runs until enableDevtools() installs the
// hook, and the graph hot path only pays a `!== null` check while it's on.

import { setDevtoolsHook } from "../reactive/graph";
import type { SignalState, Computation, DevtoolsHook } from "../reactive/graph";

export type DevtoolsEvent =
  | { type: "signal:create"; id: number; name?: string }
  | { type: "signal:write"; id: number; name?: string; next: unknown; prev: unknown }
  | { type: "computation:create"; id: number; name?: string; kind: "computed" | "effect" }
  | { type: "computation:run"; id: number; name?: string; kind: "computed" | "effect" };

export interface DevtoolsStats {
  signals: number;
  computeds: number;
  effects: number;
  writes: number;
  runs: number;
}

export interface Devtools {
  stats(): DevtoolsStats;
  events(): readonly DevtoolsEvent[]; // ring buffer of recent events
  onEvent(cb: (e: DevtoolsEvent) => void): () => void; // subscribe; returns unsubscribe
  clear(): void;
  disable(): void;
}

// Largest number of events kept in the ring buffer. Older events are dropped
// once this is exceeded, so a long-running app can't leak memory here.
const MAX_EVENTS = 1000;

// The property an external inspector reads off globalThis to grab the handle.
const GLOBAL_KEY = "__SX_DEVTOOLS__";

// globalThis, typed so we can attach the handle without `any`.
interface DevtoolsGlobal {
  [GLOBAL_KEY]?: Devtools | null;
}

// Module-global singleton. The core hook is process-wide state, so devtools is
// too: enabling twice returns the same instance instead of stacking hooks.
let current: Devtools | null = null;

/**
 * Turn on reactive-graph instrumentation. Idempotent: if devtools is already
 * enabled, the existing handle is returned untouched. Installs a DevtoolsHook
 * into the reactive core and publishes the handle on globalThis.
 */
export function enableDevtools(): Devtools {
  if (current !== null) return current;

  // Stable identity for every node, assigned lazily on first sighting. A
  // WeakMap keeps nodes garbage-collectable; a counter keeps ids readable and
  // deterministic (no Date.now/Math.random).
  const ids = new WeakMap<object, number>();
  let nextId = 0;
  const idOf = (node: object): number => {
    const existing = ids.get(node);
    if (existing !== undefined) return existing;
    const id = ++nextId;
    ids.set(node, id);
    return id;
  };

  const stats: DevtoolsStats = {
    signals: 0,
    computeds: 0,
    effects: 0,
    writes: 0,
    runs: 0,
  };

  const buffer: DevtoolsEvent[] = [];
  const subscribers = new Set<(e: DevtoolsEvent) => void>();

  const emit = (event: DevtoolsEvent): void => {
    buffer.push(event);
    if (buffer.length > MAX_EVENTS) buffer.shift();
    for (const cb of subscribers) cb(event);
  };

  const kindOf = (node: Computation): "computed" | "effect" =>
    node.pure ? "computed" : "effect";

  const hook: DevtoolsHook = {
    onSignalCreate(node: SignalState): void {
      stats.signals++;
      emit({ type: "signal:create", id: idOf(node), name: node.name });
    },
    onSignalWrite(node: SignalState, next: unknown, prev: unknown): void {
      stats.writes++;
      emit({ type: "signal:write", id: idOf(node), name: node.name, next, prev });
    },
    onComputationCreate(node: Computation): void {
      const kind = kindOf(node);
      if (kind === "computed") stats.computeds++;
      else stats.effects++;
      emit({ type: "computation:create", id: idOf(node), name: node.name, kind });
    },
    onComputationRun(node: Computation): void {
      stats.runs++;
      emit({ type: "computation:run", id: idOf(node), name: node.name, kind: kindOf(node) });
    },
  };

  const devtools: Devtools = {
    stats(): DevtoolsStats {
      // Copy so callers can't mutate the live counters.
      return { ...stats };
    },
    events(): readonly DevtoolsEvent[] {
      return buffer.slice();
    },
    onEvent(cb: (e: DevtoolsEvent) => void): () => void {
      subscribers.add(cb);
      return (): void => {
        subscribers.delete(cb);
      };
    },
    clear(): void {
      buffer.length = 0;
      stats.signals = 0;
      stats.computeds = 0;
      stats.effects = 0;
      stats.writes = 0;
      stats.runs = 0;
    },
    disable(): void {
      setDevtoolsHook(null);
      subscribers.clear();
      buffer.length = 0;
      current = null;
      if (typeof globalThis !== "undefined") {
        (globalThis as DevtoolsGlobal)[GLOBAL_KEY] = undefined;
      }
    },
  };

  setDevtoolsHook(hook);
  current = devtools;
  if (typeof globalThis !== "undefined") {
    (globalThis as DevtoolsGlobal)[GLOBAL_KEY] = devtools;
  }
  return devtools;
}

/** The active devtools handle, or null when instrumentation is off. */
export function getDevtools(): Devtools | null {
  return current;
}

// ---- store devtools (Redux-style: time-travel + action log + extension bridge) ----
export { enableStoreDevtools, getStoreDevtools } from "./store";
export type { StoreDevtools, StoreDevtoolsOptions, RecordedAction } from "./store";
