// Tests for context (generic) and provideStore/useStore.

import { test, expect } from "bun:test";
import { createRoot, createContext, effect, provide, signal, useContext } from "../src/reactive/index";
import { channel } from "../src/messaging/index";
import {
  createStore,
  createStoreContext,
  provideStore,
  useStore,
} from "../src/state/index";

test("useContext returns the default when no provider is present", () => {
  const Theme = createContext("light");
  createRoot(() => {
    expect(useContext(Theme)).toBe("light");
  });
});

test("provide makes useContext resolve to the provided value", () => {
  const Theme = createContext("light");
  createRoot(() => {
    provide(Theme, "dark", () => {
      expect(useContext(Theme)).toBe("dark");
    });
  });
});

test("nested provide overrides, and the outer value is restored after", () => {
  const Theme = createContext("light");
  createRoot(() => {
    provide(Theme, "dark", () => {
      expect(useContext(Theme)).toBe("dark");
      provide(Theme, "solarized", () => {
        expect(useContext(Theme)).toBe("solarized");
      });
      expect(useContext(Theme)).toBe("dark"); // inner scope popped
    });
    expect(useContext(Theme)).toBe("light"); // outer scope popped
  });
});

test("sibling scopes do not leak context to each other", () => {
  const Theme = createContext("light");
  createRoot(() => {
    provide(Theme, "dark", () => {});
    expect(useContext(Theme)).toBe("light"); // sibling sees only the default
  });
});

test("provideStore + useStore gives a decoupled component the live store", () => {
  const CounterStore = createStoreContext<ReturnType<typeof makeStore>>();
  const makeStore = () =>
    createStore({
      state: { count: 0 },
      actions: (s) => ({ inc: () => ({ count: s.count() + 1 }) }),
    });

  createRoot(() => {
    const store = makeStore();
    provideStore(CounterStore, store, () => {
      const injected = useStore(CounterStore); // pulled, not passed
      injected.inc();
      expect(injected.count()).toBe(1);
      expect(injected).toBe(store); // same instance
    });
  });
});

test("useStore throws when no store was provided", () => {
  const CounterStore = createStoreContext<{ count: () => number }>();
  createRoot(() => {
    expect(() => useStore(CounterStore)).toThrow("no store provided");
  });
});

test("effects created inside provide are disposed with the parent root", () => {
  const Theme = createContext("light");
  const count = signal(0);
  const seen: number[] = [];

  const dispose = createRoot((disposeRoot) => {
    provide(Theme, "dark", () => {
      effect(() => {
        useContext(Theme);
        seen.push(count());
      });
    });
    return disposeRoot;
  });

  expect(seen).toEqual([0]);
  count.set(1);
  expect(seen).toEqual([0, 1]);

  dispose();
  count.set(2);
  expect(seen).toEqual([0, 1]);
});

test("channel subscriptions created inside provide are disposed with the parent root", () => {
  const Scope = createContext<null>(null);
  const messages = channel<number>();
  const seen: number[] = [];

  const dispose = createRoot((disposeRoot) => {
    provide(Scope, null, () => {
      messages.on((value) => {
        seen.push(value);
      });
    });
    return disposeRoot;
  });

  messages.send(1);
  expect(seen).toEqual([1]);

  dispose();
  messages.send(2);
  expect(seen).toEqual([1]);
});
