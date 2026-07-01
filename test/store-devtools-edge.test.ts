// Store-devtools edge cases: duplicate store names must not collide in the
// Redux panel, and an extension that loads AFTER enableStoreDevtools() must
// still bridge newly created stores.

import { test, expect, afterEach } from "bun:test";
import { createStore } from "../src/state/store";
import { enableStoreDevtools, getStoreDevtools } from "../src/devtools/store";

type ExtHost = { __REDUX_DEVTOOLS_EXTENSION__?: unknown };

const stubConnection = () => ({
  init() {},
  send() {},
  subscribe() {
    return () => {};
  },
});

afterEach(() => {
  getStoreDevtools()?.disable();
  delete (globalThis as ExtHost).__REDUX_DEVTOOLS_EXTENSION__;
});

test("duplicate store names are disambiguated in the Redux bridge", () => {
  const connectedNames: string[] = [];
  (globalThis as ExtHost).__REDUX_DEVTOOLS_EXTENSION__ = {
    connect: (opts?: { name?: string }) => {
      connectedNames.push(opts?.name ?? "");
      return stubConnection();
    },
  };

  enableStoreDevtools();
  createStore({ name: "counter", state: { n: 0 } });
  createStore({ name: "counter", state: { n: 0 } });

  expect(connectedNames.length).toBe(2);
  // Two stores sharing a name must connect under DISTINCT panel names.
  expect(new Set(connectedNames).size).toBe(2);
});

test("an extension that appears AFTER enable still bridges new stores", () => {
  delete (globalThis as ExtHost).__REDUX_DEVTOOLS_EXTENSION__;
  enableStoreDevtools(); // no extension present at enable time

  let connected = false;
  (globalThis as ExtHost).__REDUX_DEVTOOLS_EXTENSION__ = {
    connect: () => {
      connected = true;
      return stubConnection();
    },
  };

  createStore({ name: "late", state: { n: 0 } });
  expect(connected).toBe(true);
});
