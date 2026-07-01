// Redux-style store devtools: time-travel + action log, with optional bridge to
// the Redux DevTools browser extension.
//
// six's createStore is already Redux-shaped (actions -> patches, serializable
// state via dehydrate/hydrate), so time-travel is: snapshot on each action,
// and jumping in time is store.hydrate(snapshot). If the Redux DevTools
// extension is installed, we ALSO speak its protocol so six stores show up in
// that panel with real time-travel — no custom extension needed.
//
// Zero-cost when off: nothing here runs until enableStoreDevtools() installs the
// hook, and each store's action hot path only pays a `!== null` check while on.

import { setStoreDevtoolsHook } from "../state/store";
import type { StoreDevtoolsHook } from "../state/store";

export interface RecordedAction {
  seq: number; // monotonic sequence (no Date.now/Math.random — deterministic)
  storeId: number;
  store: string;
  action: string;
  payload: unknown;
  state: Record<string, unknown>; // full state snapshot AFTER this action
}

export interface StoreDevtools {
  /** All recorded actions across every store, in order. */
  history(): readonly RecordedAction[];
  /** History for a single store by name. */
  historyFor(store: string): readonly RecordedAction[];
  /** Time-travel: restore the snapshot recorded at `seq` (via the store's hydrate). */
  jumpTo(seq: number): void;
  /** Restore a store (or every store) to its initial recorded state. */
  reset(store?: string): void;
  /** Serialize the full session (for sharing a repro). */
  export(): string;
  /** Load a previously exported session (does NOT hydrate; call jumpTo after). */
  import(json: string): void;
  /** Remove the hook + disconnect the extension. Zero-cost when off. */
  disable(): void;
}

export interface StoreDevtoolsOptions {
  /** Bridge to window.__REDUX_DEVTOOLS_EXTENSION__ if present. Default true. */
  reduxExtension?: boolean;
  /** Max recorded actions kept in memory (ring buffer). Default 1000. */
  maxActions?: number;
}

// ---- Redux DevTools extension protocol (only the parts we use) ----
interface ReduxConnection {
  init: (state: unknown) => void;
  send: (action: { type: string; payload?: unknown }, state: unknown) => void;
  subscribe: (listener: (message: ReduxMessage) => void) => (() => void) | void;
  unsubscribe?: () => void;
}
interface ReduxExtension {
  connect: (opts?: { name?: string }) => ReduxConnection;
}
interface ReduxMessage {
  type: string; // "DISPATCH", "ACTION", "START", "STOP", ...
  // for DISPATCH: "JUMP_TO_ACTION" | "JUMP_TO_STATE" | "RESET" | "COMMIT" | ...
  payload?: { type?: string };
  state?: string; // JSON string of the state to restore (for JUMP_*)
}
interface ReduxWindow {
  __REDUX_DEVTOOLS_EXTENSION__?: ReduxExtension;
}

// The property an external inspector reads off globalThis to grab the handle.
const GLOBAL_KEY = "__SX_STORE_DEVTOOLS__";

// globalThis, typed so we can attach the handle without `any`.
interface StoreDevtoolsGlobal {
  [GLOBAL_KEY]?: StoreDevtools | null;
}

const DEFAULT_MAX_ACTIONS = 1000;

// Module-global singleton. The store hook is process-wide state, so devtools is
// too: enabling twice returns the same instance instead of stacking hooks.
let current: StoreDevtools | null = null;

// Read the extension off window, guarded for SSR/Node where there is no window.
function getReduxExtension(): ReduxExtension | null {
  if (typeof window === "undefined") return null;
  const ext = (window as unknown as ReduxWindow).__REDUX_DEVTOOLS_EXTENSION__;
  return ext ?? null;
}

/**
 * Turn on Redux-style store devtools. Idempotent: if already enabled, the
 * existing handle is returned untouched. Installs a StoreDevtoolsHook into the
 * state layer and publishes the handle on globalThis. When the Redux DevTools
 * extension is present (and not opted out), also bridges every store to it.
 */
export function enableStoreDevtools(options?: StoreDevtoolsOptions): StoreDevtools {
  if (current !== null) return current;

  const maxActions = options?.maxActions ?? DEFAULT_MAX_ACTIONS;
  const useRedux = options?.reduxExtension !== false;

  // Ring buffer of recorded actions + a monotonic sequence. seq is NEVER reset
  // by shift(), so `seq` values stay unique and jumpTo can address dropped-out
  // history that is still in the buffer.
  const buffer: RecordedAction[] = [];
  let seq = 0;

  // Per-store registry for in-memory time-travel.
  interface StoreEntry {
    name: string;
    hydrate: (patch: Record<string, unknown>) => void;
    initial: Record<string, unknown>;
  }
  const stores = new Map<number, StoreEntry>();

  // Redux extension connections, keyed by storeId (populated only when bridged).
  const connections = new Map<number, ReduxConnection>();
  const unsubscribers: Array<() => void> = [];

  // Captured once at enable time; null in SSR/Node or when opted out.
  const ext = useRedux ? getReduxExtension() : null;

  const record = (action: RecordedAction): void => {
    buffer.push(action);
    if (buffer.length > maxActions) buffer.shift();
  };

  // Time-travel initiated FROM the extension panel.
  const handleReduxMessage = (storeId: number, message: ReduxMessage): void => {
    if (message.type !== "DISPATCH") return;
    const entry = stores.get(storeId);
    if (entry === undefined) return;
    const sub = message.payload?.type;
    if ((sub === "JUMP_TO_ACTION" || sub === "JUMP_TO_STATE") && message.state !== undefined) {
      const state = JSON.parse(message.state) as Record<string, unknown>;
      entry.hydrate(state);
    } else if (sub === "RESET") {
      entry.hydrate(entry.initial);
    }
  };

  const hook: StoreDevtoolsHook = {
    onStoreCreate(meta): void {
      stores.set(meta.id, {
        name: meta.name,
        hydrate: meta.hydrate,
        initial: meta.state,
      });
      if (ext !== null) {
        const conn = ext.connect({ name: meta.name });
        connections.set(meta.id, conn);
        conn.init(meta.state);
        const unsub = conn.subscribe((message) => handleReduxMessage(meta.id, message));
        if (typeof unsub === "function") unsubscribers.push(unsub);
      }
    },
    onAction(event): void {
      record({
        seq: seq++,
        storeId: event.id,
        store: event.name,
        action: event.action,
        payload: event.payload,
        state: event.state,
      });
      const conn = connections.get(event.id);
      if (conn !== undefined) {
        conn.send({ type: event.action, payload: event.payload }, event.state);
      }
    },
  };

  const devtools: StoreDevtools = {
    history(): readonly RecordedAction[] {
      return buffer.slice();
    },
    historyFor(store: string): readonly RecordedAction[] {
      return buffer.filter((a) => a.store === store);
    },
    jumpTo(seqTarget: number): void {
      const action = buffer.find((a) => a.seq === seqTarget);
      if (action === undefined) return;
      const entry = stores.get(action.storeId);
      if (entry === undefined) return;
      entry.hydrate(action.state);
    },
    reset(store?: string): void {
      for (const entry of stores.values()) {
        if (store === undefined || entry.name === store) entry.hydrate(entry.initial);
      }
    },
    export(): string {
      return JSON.stringify({ history: buffer, seq });
    },
    import(json: string): void {
      const parsed = JSON.parse(json) as { history?: RecordedAction[]; seq?: number };
      buffer.length = 0;
      if (Array.isArray(parsed.history)) {
        for (const a of parsed.history) buffer.push(a);
      }
      if (typeof parsed.seq === "number") seq = parsed.seq;
    },
    disable(): void {
      setStoreDevtoolsHook(null);
      for (const unsub of unsubscribers) unsub();
      unsubscribers.length = 0;
      for (const conn of connections.values()) {
        if (typeof conn.unsubscribe === "function") conn.unsubscribe();
      }
      connections.clear();
      stores.clear();
      buffer.length = 0;
      current = null;
      if (typeof globalThis !== "undefined") {
        (globalThis as StoreDevtoolsGlobal)[GLOBAL_KEY] = undefined;
      }
    },
  };

  setStoreDevtoolsHook(hook);
  current = devtools;
  if (typeof globalThis !== "undefined") {
    (globalThis as StoreDevtoolsGlobal)[GLOBAL_KEY] = devtools;
  }
  return devtools;
}

/** The active store-devtools handle, or null when instrumentation is off. */
export function getStoreDevtools(): StoreDevtools | null {
  return current;
}
