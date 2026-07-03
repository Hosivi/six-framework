// graph.ts — internal reactive substrate (Layer 0).
//
// Holds the shared mutable context and the core algorithms:
//   - automatic dependency tracking (zero proxies, just instrumented reads)
//   - glitch-free coloring (CLEAN / CHECK / DIRTY)
//   - ownership tree (deterministic disposal)
//   - the flush scheduler (synchronous by default, batchable)
//
// Nothing here knows about the DOM. It runs anywhere: browser, Node, Deno.
// That blindness to the UI is exactly what makes SSR and multiplatform possible.

// ---- coloring state ----
export const CLEAN = 0;
export const CHECK = 1;
export const DIRTY = 2;
export type State = 0 | 1 | 2;

// ---- node model ----
export interface Owner {
  owned: Owned[] | null; // child computations/scopes created during this scope's run
  cleanups: Array<() => void> | null; // onCleanup callbacks
  owner: Owner | null; // parent scope
  context: Record<symbol, unknown> | null; // context values provided at this scope
}

export interface ObservableNode {
  observers: Set<Computation> | null; // computations that read this node
}

export interface SignalState<T = unknown> extends ObservableNode {
  value: T;
  equals: ((a: T, b: T) => boolean) | false;
  name?: string;
}

export interface Computation<T = unknown> extends Owner, ObservableNode {
  fn: (prev: T) => T;
  value: T;
  state: State;
  sources: Set<Source> | null; // nodes this computation reads
  pure: boolean; // true = computed (caches value), false = effect (side effect)
  equals: ((a: T, b: T) => boolean) | false;
  name?: string;
}

export type Owned = Computation | Owner;
export type Source = SignalState | Computation;

// ---- devtools instrumentation (opt-in, zero-cost when disabled) ----
// A single nullable hook is the ONLY tax the hot path pays when devtools is off:
// one `!== null` comparison per instrumented point. No allocation, no branching
// cost beyond that. The hook layer (src/devtools) installs itself here.
export interface DevtoolsHook {
  onSignalCreate?: (node: SignalState) => void;
  onSignalWrite?: (node: SignalState, next: unknown, prev: unknown) => void;
  onComputationCreate?: (node: Computation) => void;
  onComputationRun?: (node: Computation) => void;
}
let devtoolsHook: DevtoolsHook | null = null;
export function setDevtoolsHook(hook: DevtoolsHook | null): void {
  devtoolsHook = hook;
}

// ---- shared mutable context ----
let Listener: Computation | null = null; // who is reading right now
let CurrentOwner: Owner | null = null; // current ownership scope

export function getObserver(): Computation | null {
  return Listener;
}
export function setObserver(o: Computation | null): void {
  Listener = o;
}
export function getOwner(): Owner | null {
  return CurrentOwner;
}
export function setOwner(o: Owner | null): void {
  CurrentOwner = o;
}

// ---- scheduler (synchronous by default; pluggable later) ----
const effectQueue: Computation[] = [];
let batchDepth = 0;
let running = false;

export function batch<T>(fn: () => T): T {
  batchDepth++;
  try {
    return fn();
  } finally {
    batchDepth--;
    if (batchDepth === 0) flushEffects();
  }
}

function maybeFlush(): void {
  if (batchDepth === 0) flushEffects();
}

function flushEffects(): void {
  if (running) return; // re-entrant write: the outer drain loop will pick it up
  running = true;
  let guard = 0;
  try {
    while (effectQueue.length > 0) {
      if (++guard > 100_000) {
        effectQueue.length = 0;
        console.warn("[reactive] flush aborted: possible infinite update loop");
        break;
      }
      const node = effectQueue.shift()!;
      if (node.state !== CLEAN) updateIfNecessary(node);
    }
  } finally {
    running = false;
  }
}

// ---- dependency tracking ----
function track(node: ObservableNode): void {
  if (Listener !== null) {
    (node.observers ??= new Set()).add(Listener);
    (Listener.sources ??= new Set()).add(node as Source);
  }
}

// ---- signals ----
export function createSignalState<T>(
  value: T,
  equals: ((a: T, b: T) => boolean) | false,
  name?: string,
): SignalState<T> {
  const node: SignalState<T> = { value, observers: null, equals, name };
  if (devtoolsHook !== null) devtoolsHook.onSignalCreate?.(node as SignalState);
  return node;
}

export function readSignal<T>(node: SignalState<T>): T {
  track(node);
  return node.value;
}

export function writeSignal<T>(node: SignalState<T>, value: T): T {
  if (node.equals !== false && node.equals(node.value, value)) return node.value;
  const prev = node.value;
  node.value = value;
  if (devtoolsHook !== null) devtoolsHook.onSignalWrite?.(node as SignalState, value, prev);
  if (node.observers !== null) {
    for (const obs of [...node.observers]) markStale(obs, DIRTY);
  }
  maybeFlush();
  return value;
}

// ---- computations (computed + effect share this machinery) ----
export function createComputation<T>(
  fn: (prev: T) => T,
  init: T,
  pure: boolean,
  equals: ((a: T, b: T) => boolean) | false,
  name?: string,
): Computation<T> {
  const node: Computation<T> = {
    fn,
    value: init,
    state: DIRTY,
    sources: null,
    observers: null,
    owned: null,
    cleanups: null,
    owner: CurrentOwner,
    context: null,
    pure,
    equals,
    name,
  };
  if (CurrentOwner !== null) (CurrentOwner.owned ??= []).push(node as Computation);
  if (devtoolsHook !== null) devtoolsHook.onComputationCreate?.(node as Computation);
  return node;
}

export function readComputation<T>(node: Computation<T>): T {
  updateIfNecessary(node as Computation); // lazy: recompute only if needed
  track(node as Source);
  return node.value;
}

export function runInitial(node: Computation): void {
  updateIfNecessary(node);
}

// ---- glitch-free coloring ----
function markStale(node: Computation, state: State): void {
  if (node.state >= state) return; // already stale enough
  const wasClean = node.state === CLEAN;
  node.state = state;
  if (wasClean) {
    if (node.pure) {
      // computed: propagate CHECK ("maybe dirty") to its observers
      if (node.observers !== null) {
        for (const obs of node.observers) markStale(obs, CHECK);
      }
    } else {
      // effect: schedule it (it will validate itself on flush)
      effectQueue.push(node);
    }
  }
}

function updateIfNecessary(node: Computation): void {
  if (node.state === CLEAN) return;
  if (node.state === CHECK && node.sources !== null) {
    // "maybe dirty": resolve each computed source; recompute only if one really changed
    for (const src of node.sources) {
      if ("fn" in src) updateIfNecessary(src as Computation);
      if ((node.state as State) === DIRTY) break; // a source's update marked us dirty
    }
  }
  if ((node.state as State) === DIRTY) updateComputation(node);
  node.state = CLEAN;
}

function updateComputation(node: Computation): void {
  if (devtoolsHook !== null) devtoolsHook.onComputationRun?.(node);
  disposeNode(node, false); // run cleanups, drop old deps/children before re-run
  const prevListener = Listener;
  const prevOwner = CurrentOwner;
  Listener = node;
  CurrentOwner = node;
  try {
    const next = node.fn(node.value);
    if (node.pure) {
      // computed: only propagate if the OUTPUT actually changed
      if (node.equals === false || !node.equals(node.value, next)) {
        node.value = next;
        if (node.observers !== null) {
          for (const obs of node.observers) markStale(obs, DIRTY);
        }
      }
    } else {
      node.value = next; // effect: store last return (unused for now)
    }
  } finally {
    Listener = prevListener;
    CurrentOwner = prevOwner;
  }
}

// ---- disposal ----
export function disposeNode(node: Computation, full: boolean = true): void {
  if (node.cleanups !== null) {
    for (const c of node.cleanups) c();
    node.cleanups = null;
  }
  if (node.owned !== null) {
    for (const child of node.owned) disposeOwned(child);
    node.owned = null;
  }
  if (node.sources !== null) {
    for (const src of node.sources) src.observers?.delete(node);
    node.sources = null;
  }
  if (full) node.state = CLEAN;
}

// ---- ownership helpers ----
export function onCleanup(fn: () => void): void {
  if (CurrentOwner !== null) (CurrentOwner.cleanups ??= []).push(fn);
}

function disposeOwned(node: Owned): void {
  if ("fn" in node) disposeNode(node, true);
  else disposeOwner(node);
}

export function disposeOwner(owner: Owner): void {
  if (owner.cleanups !== null) {
    for (const c of owner.cleanups) c();
    owner.cleanups = null;
  }
  if (owner.owned !== null) {
    for (const child of owner.owned) disposeOwned(child);
    owner.owned = null;
  }
}
