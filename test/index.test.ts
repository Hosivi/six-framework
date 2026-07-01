// Smoke test for the public barrel (src/index.ts).
// Guards against silent `export *` collisions: if two layers exported the same
// name, TS drops it and the import below would be undefined.

import { test, expect } from "bun:test";
import {
  // reactive
  signal,
  computed,
  effect,
  createRoot,
  onCleanup,
  onMount,
  batch,
  untrack,
  createContext,
  useContext,
  // dom
  div,
  main,
  when,
  each,
  render,
  html,
  // state
  createStore,
  provideStore,
  useStore,
  createStoreContext,
  // async
  resource,
  // messaging
  channel,
} from "../src/index";

test("every layer is reachable from the root barrel", () => {
  for (const fn of [
    signal, computed, effect, createRoot, onCleanup, onMount, batch, untrack,
    createContext, useContext,
    div, main, when, each, render, html,
    createStore, provideStore, useStore, createStoreContext,
    resource,
    channel,
  ]) {
    expect(typeof fn).toBe("function");
  }
});

test("the unified surface composes across layers", () => {
  const store = createStore({ state: { n: 1 } });
  expect(store.n()).toBe(1);

  const host = document.createElement("div");
  createRoot(() => div(() => String(store.n())).into(host));
  expect(host.querySelector("div")?.textContent).toBe("1");
});
