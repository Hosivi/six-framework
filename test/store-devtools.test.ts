// Tests for the Redux-style store devtools: time-travel + action log + the
// Redux DevTools extension bridge.
//
// The store hook is module-global state, so every test MUST leave it OFF. The
// afterEach below disables store devtools no matter how a test exits, and also
// clears the mocked Redux extension so the global hook + the fake extension
// never contaminate other tests in the suite.

import { test, expect, afterEach } from "bun:test";
import { enableStoreDevtools, getStoreDevtools } from "../src/devtools/store";
import { createStore } from "../src/state/store";

// Minimal shapes for the extension mock — internal to store.ts, redeclared here.
type ReduxMessage = { type: string; payload?: { type?: string }; state?: string };
type ReduxWindowMock = { __REDUX_DEVTOOLS_EXTENSION__?: unknown };

afterEach(() => {
  getStoreDevtools()?.disable();
  delete (globalThis as ReduxWindowMock).__REDUX_DEVTOOLS_EXTENSION__;
});

test("action log records dispatches with the state AFTER applying", () => {
  const dt = enableStoreDevtools();
  const store = createStore({
    state: { count: 0 },
    actions: (s) => ({ inc: () => ({ count: s.count() + 1 }) }),
  });

  store.inc();

  const history = dt.history();
  expect(history.length).toBe(1);
  expect(history[0]?.action).toBe("inc");
  expect(history[0]?.state).toEqual({ count: 1 });
});

test("action payload is captured in the recorded action", () => {
  const dt = enableStoreDevtools();
  const store = createStore({
    state: { total: 0 },
    actions: (s) => ({ add: (n: number) => ({ total: s.total() + n }) }),
  });

  store.add(5);

  expect(dt.history()[0]?.payload).toBe(5);
});

test("jumpTo time-travels the real store signal", () => {
  const dt = enableStoreDevtools();
  const store = createStore({
    state: { count: 0 },
    actions: (s) => ({ inc: () => ({ count: s.count() + 1 }) }),
  });

  store.inc(); // count 1
  store.inc(); // count 2
  store.inc(); // count 3
  expect(store.count()).toBe(3);

  const firstIncSeq = dt.history()[0]?.seq;
  expect(firstIncSeq).toBeDefined();
  dt.jumpTo(firstIncSeq as number);

  // The store's own signal was actually restored, not just the log.
  expect(store.count()).toBe(1);
});

test("reset restores a store to its initial recorded state", () => {
  const dt = enableStoreDevtools();
  const store = createStore({
    state: { count: 0 },
    actions: (s) => ({ inc: () => ({ count: s.count() + 1 }) }),
  });

  store.inc();
  store.inc();
  expect(store.count()).toBe(2);

  dt.reset();
  expect(store.count()).toBe(0);
});

test("export/import roundtrip preserves the history", () => {
  const dt = enableStoreDevtools();
  const store = createStore({
    state: { count: 0 },
    actions: (s) => ({ inc: () => ({ count: s.count() + 1 }) }),
  });

  store.inc();
  store.inc();
  const before = dt.history();

  const dump = dt.export();
  dt.import(dump);

  expect(dt.history()).toEqual(before);
});

test("bridges to the Redux DevTools extension: init, send, and panel time-travel", () => {
  const initCalls: unknown[] = [];
  const sendCalls: Array<{ action: { type: string; payload?: unknown }; state: unknown }> = [];
  // Ref holder: a plain `let` gets collapsed by control-flow analysis because it
  // is only ever assigned inside a closure. A holder object keeps the union type.
  const listenerRef: { current: ((message: ReduxMessage) => void) | null } = { current: null };

  const fakeConnection = {
    init: (state: unknown): void => {
      initCalls.push(state);
    },
    send: (action: { type: string; payload?: unknown }, state: unknown): void => {
      sendCalls.push({ action, state });
    },
    subscribe: (listener: (message: ReduxMessage) => void): (() => void) => {
      listenerRef.current = listener;
      return (): void => {
        listenerRef.current = null;
      };
    },
  };
  const fakeExt = { connect: (): typeof fakeConnection => fakeConnection };
  (globalThis as ReduxWindowMock).__REDUX_DEVTOOLS_EXTENSION__ = fakeExt;

  enableStoreDevtools();
  const store = createStore({
    state: { count: 0 },
    actions: (s) => ({ inc: () => ({ count: s.count() + 1 }) }),
  });

  // init fires on store creation with the initial state.
  expect(initCalls).toEqual([{ count: 0 }]);

  store.inc();
  expect(sendCalls.length).toBe(1);
  expect(sendCalls[0]?.action.type).toBe("inc");
  expect(sendCalls[0]?.state).toEqual({ count: 1 });

  // Simulate time-travel initiated FROM the extension panel.
  expect(listenerRef.current).not.toBeNull();
  listenerRef.current?.({
    type: "DISPATCH",
    payload: { type: "JUMP_TO_STATE" },
    state: JSON.stringify({ count: 42 }),
  });
  expect(store.count()).toBe(42);
});

test("with devtools off, dispatching is inert and getStoreDevtools() is null", () => {
  // Ensure we start from OFF (a prior afterEach handles this; be explicit).
  getStoreDevtools()?.disable();
  expect(getStoreDevtools()).toBeNull();

  expect(() => {
    const store = createStore({
      state: { count: 0 },
      actions: (s) => ({ inc: () => ({ count: s.count() + 1 }) }),
    });
    store.inc();
    expect(store.count()).toBe(1);
  }).not.toThrow();

  expect(getStoreDevtools()).toBeNull();
});
