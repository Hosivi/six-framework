// Tests for channel — typed pub/sub for transient events (Xamarin-style).

import { test, expect } from "bun:test";
import { createRoot } from "../src/reactive/index";
import { channel } from "../src/messaging/index";

test("send delivers the payload to a subscriber", () => {
  const itemAdded = channel<number>();
  let received = 0;
  itemAdded.on((n) => (received = n));
  itemAdded.send(42);
  expect(received).toBe(42);
});

test("every subscriber receives the message", () => {
  const ping = channel<void>();
  let a = 0;
  let b = 0;
  ping.on(() => a++);
  ping.on(() => b++);
  ping.send();
  expect(a).toBe(1);
  expect(b).toBe(1);
});

test("a void channel sends with no argument", () => {
  const logout = channel(); // defaults to channel<void>
  let fired = false;
  logout.on(() => (fired = true));
  logout.send();
  expect(fired).toBe(true);
});

test("unsubscribing stops delivery", () => {
  const ch = channel<string>();
  let calls = 0;
  const off = ch.on(() => calls++);
  ch.send("a");
  off();
  ch.send("b");
  expect(calls).toBe(1);
});

test("subscriptions auto-clean when their owner scope disposes", () => {
  const ch = channel<void>();
  let calls = 0;
  const dispose = createRoot((d) => {
    ch.on(() => calls++);
    return d;
  });

  ch.send();
  expect(calls).toBe(1);

  dispose(); // tears down the scope -> the handler is removed
  ch.send();
  expect(calls).toBe(1); // no longer received
});

test("typed payloads are delivered intact", () => {
  const itemAdded = channel<{ id: number; name: string }>();
  const received: Array<{ id: number; name: string }> = [];
  itemAdded.on((item) => received.push(item));
  itemAdded.send({ id: 7, name: "coffee" });
  expect(received[0]).toEqual({ id: 7, name: "coffee" });
});

test("recursive send is flattened through the dispatch queue", () => {
  const ch = channel<number>();
  const seen: number[] = [];

  ch.on((value) => {
    seen.push(value);
    if (value < 3) ch.send(value + 1);
  });

  ch.send(1);
  expect(seen).toEqual([1, 2, 3]);
});

test("a throwing handler does not block later subscribers", async () => {
  const ch = channel<string>();
  const seen: string[] = [];
  const errors: unknown[] = [];
  const originalError = console.error;
  console.error = (error?: unknown) => {
    errors.push(error);
  };

  try {
    ch.on(() => {
      throw new Error("boom");
    });
    ch.on((value) => {
      seen.push(value);
    });

    ch.send("ok");
    await Promise.resolve();

    expect(seen).toEqual(["ok"]);
    expect(errors).toHaveLength(1);
  } finally {
    console.error = originalError;
  }
});
