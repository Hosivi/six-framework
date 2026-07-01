// Tests for resource — async data as a reactive primitive.

import { test, expect } from "bun:test";
import { createRoot, signal } from "../src/reactive/index";
import { main, span } from "../src/dom/tags";
import { resource } from "../src/async/index";

// Flush all microtasks (let the fetcher promise chain settle).
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

test("starts loading, then resolves to data", async () => {
  const r = createRoot(() =>
    resource(() => 1, (id) => Promise.resolve(`user-${id}`)),
  );
  expect(r.loading()).toBe(true); // set synchronously on creation
  expect(r()).toBeUndefined();

  await tick();
  expect(r.loading()).toBe(false);
  expect(r()).toBe("user-1");
  expect(r.error()).toBe(null);
});

test("captures a rejection as error", async () => {
  const r = createRoot(() =>
    resource(() => 1, () => Promise.reject(new Error("boom"))),
  );
  await tick();
  expect(r.error()).toBeInstanceOf(Error);
  expect(r.loading()).toBe(false);
  expect(r()).toBeUndefined();
});

test("exposes initialValue before the first resolve", async () => {
  const r = createRoot(() =>
    resource(() => 1, () => Promise.resolve("done"), { initialValue: "wait" }),
  );
  expect(r()).toBe("wait");
  await tick();
  expect(r()).toBe("done");
});

test("refetch re-runs the fetcher", async () => {
  let calls = 0;
  const r = createRoot(() =>
    resource(() => 1, (id) => {
      calls++;
      return Promise.resolve(id);
    }),
  );
  await tick();
  expect(calls).toBe(1);

  r.refetch();
  await tick();
  expect(calls).toBe(2);
});

test("re-fetches when the source changes", async () => {
  const id = signal(1);
  const seen: number[] = [];
  const r = createRoot(() =>
    resource(id, (v) => {
      seen.push(v);
      return Promise.resolve(v * 10);
    }),
  );
  await tick();
  id.set(2);
  await tick();

  expect(seen).toEqual([1, 2]);
  expect(r()).toBe(20);
});

test("a falsy source gates (skips) the fetch", async () => {
  let calls = 0;
  const r = createRoot(() =>
    resource<number | null, number>(
      () => null,
      () => {
        calls++;
        return Promise.resolve(1);
      },
    ),
  );
  await tick();
  expect(calls).toBe(0);
  expect(r.loading()).toBe(false);
});

test("gating the source off aborts in-flight work and blocks stale publication", async () => {
  let resolveFetch!: (value: string) => void;
  const id = signal<number | null>(1);
  const aborts: boolean[] = [];

  const r = createRoot(() =>
    resource(id, (_value, context) => {
      context?.signal.addEventListener("abort", () => aborts.push(true), { once: true });
      return new Promise<string>((resolve) => {
        resolveFetch = resolve;
      });
    }),
  );

  expect(r.loading()).toBe(true);
  id.set(null);

  expect(r.loading()).toBe(false);
  expect(r.error()).toBe(null);
  expect(aborts).toEqual([true]);

  resolveFetch("stale-secret");
  await tick();

  expect(r()).toBeUndefined();
  expect(r.loading()).toBe(false);
  expect(r.error()).toBe(null);
});

test("mutate overwrites the value locally without fetching", async () => {
  let calls = 0;
  const r = createRoot(() =>
    resource(() => 1, (id) => {
      calls++;
      return Promise.resolve(`U${id}`);
    }),
  );
  await tick();
  expect(r()).toBe("U1");
  expect(calls).toBe(1);

  r.mutate("optimistic");
  expect(r()).toBe("optimistic");
  expect(calls).toBe(1); // no extra fetch
});

test("mutate accepts an updater that receives the previous value", async () => {
  const r = createRoot(() =>
    resource(() => 1, () => Promise.resolve(10)),
  );
  await tick();
  expect(r()).toBe(10);

  r.mutate((prev) => (prev ?? 0) + 5);
  expect(r()).toBe(15);
});

test("keeps the previous value while refetching (latest)", async () => {
  const r = createRoot(() =>
    resource(() => 1, (id) => Promise.resolve(`U${id}`)),
  );
  await tick();
  expect(r()).toBe("U1");

  r.refetch();
  expect(r.loading()).toBe(true);
  expect(r()).toBe("U1"); // old value still visible during the reload
  await tick();
  expect(r.loading()).toBe(false);
  expect(r()).toBe("U1");
});

test("match renders loading then the ready branch", async () => {
  const host = document.createElement("div");
  createRoot(() => {
    const r = resource(() => 1, (id) => Promise.resolve(`U${id}`));
    main(
      r.match({
        loading: () => span("loading").class("s"),
        error: () => span("err").class("e"),
        ready: (u) => span(u).class("r"),
      }),
    ).into(host);
  });

  expect(host.querySelector(".s")?.textContent).toBe("loading"); // loading state
  await tick();
  expect(host.querySelector(".s")).toBe(null);
  expect(host.querySelector(".r")?.textContent).toBe("U1"); // ready state
});

test("disposing the owner before resolve prevents late publication", async () => {
  let resolveFetch!: (value: string) => void;
  let api!: ReturnType<typeof resource<string>>;

  const dispose = createRoot((disposeRoot) => {
    api = resource(() =>
      new Promise<string>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    return disposeRoot;
  });

  expect(api.loading()).toBe(true);
  dispose();
  expect(api.loading()).toBe(false);

  resolveFetch("late-secret");
  await tick();

  expect(api()).toBeUndefined();
  expect(api.loading()).toBe(false);
  expect(api.error()).toBe(null);
});

test("disposing the owner aborts in-flight resource work", () => {
  let aborted = false;

  const dispose = createRoot((disposeRoot) => {
    resource(() => 1, (_value, context) => {
      context?.signal.addEventListener("abort", () => {
        aborted = true;
      }, { once: true });
      return new Promise<number>(() => {});
    });
    return disposeRoot;
  });

  dispose();
  expect(aborted).toBe(true);
});
