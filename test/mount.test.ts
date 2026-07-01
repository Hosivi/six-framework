// Tests for onMount — the post-mount lifecycle hook.

import { test, expect } from "bun:test";
import { onMount, createRoot } from "../src/reactive/index";
import { main } from "../src/dom/tags";

test("onMount is deferred: it runs after the current synchronous task", async () => {
  const order: string[] = [];
  onMount(() => order.push("mounted"));
  order.push("setup");

  expect(order).toEqual(["setup"]); // not yet
  await Promise.resolve();
  expect(order).toEqual(["setup", "mounted"]);
});

test("multiple onMounts run in registration order", async () => {
  const order: number[] = [];
  onMount(() => order.push(1));
  onMount(() => order.push(2));
  await Promise.resolve();
  expect(order).toEqual([1, 2]);
});

test("onMount fires with the real DOM already in place", async () => {
  const host = document.createElement("div");
  const result: { text: string | null } = { text: null };

  createRoot(() => {
    const App = () => {
      onMount(() => {
        result.text = host.querySelector(".x")?.textContent ?? null;
      });
      return main("hi").class("x");
    };
    App().into(host);
  });

  expect(result.text).toBe(null); // deferred until after mount
  await Promise.resolve();
  expect(result.text).toBe("hi"); // the element existed when onMount ran
});

test("disposing the owner before flush cancels the onMount callback", async () => {
  let calls = 0;
  const dispose = createRoot((d) => {
    onMount(() => {
      calls++;
    });
    return d;
  });

  dispose();
  await Promise.resolve();

  expect(calls).toBe(0);
});

test("a throwing onMount callback does not block later callbacks", async () => {
  const order: string[] = [];
  const errors: unknown[] = [];
  const originalError = console.error;
  console.error = (error?: unknown) => {
    errors.push(error);
  };

  try {
    onMount(() => {
      order.push("first");
      throw new Error("boom");
    });
    onMount(() => {
      order.push("second");
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(order).toEqual(["first", "second"]);
    expect(errors).toHaveLength(1);
  } finally {
    console.error = originalError;
  }
});
