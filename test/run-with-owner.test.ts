// runWithOwner / getOwner — resolve context in DEFERRED code (event handlers,
// timers) that runs outside the synchronous component/provider scope.

import { test, expect } from "bun:test";
import {
  createRoot,
  createContext,
  provide,
  useContext,
  getOwner,
  runWithOwner,
} from "../src/reactive/index";

test("getOwner returns the current owner inside a scope, null outside", () => {
  expect(getOwner()).toBeNull();
  createRoot(() => {
    expect(getOwner()).not.toBeNull();
  });
});

test("runWithOwner resolves context deferred outside the provider scope", () => {
  const Theme = createContext("light");
  let captured: ReturnType<typeof getOwner> = null;
  let deferred: (() => string) | null = null;

  provide(Theme, "dark", () => {
    createRoot(() => {
      captured = getOwner();
      // Simulate an event handler captured now, invoked later (after the
      // provider scope has been popped).
      deferred = () => useContext(Theme);
    });
  });

  // A bare deferred call sees only the default — no active owner chain:
  expect(deferred!()).toBe("light");
  // Re-running it under the captured owner resolves the provided value:
  expect(runWithOwner(captured, () => deferred!())).toBe("dark");
});

test("runWithOwner restores the previous owner afterwards", () => {
  createRoot(() => {
    const before = getOwner();
    runWithOwner(null, () => {
      expect(getOwner()).toBeNull();
    });
    expect(getOwner()).toBe(before);
  });
});
