// End-to-end test for examples/ssr — the SSR + hydration demo.
//
// Proves the full isomorphic loop: the component is serialized to HTML on the
// "server" (toHTML), then hydrate() ADOPTS that markup on the "client" (same
// nodes reused, no rebuild), onMount flips the badge, and events come alive.

import { test, expect } from "bun:test";
import { hydrate } from "../src/dom/hydrate";
import { App } from "../examples/ssr/app";

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0)); // flush onMount microtask

test("server renders the app to HTML with initial state", () => {
  const html = App().toHTML();
  expect(html).toContain("renderizado en el servidor");
  expect(html).toContain(`class="count"`);
  expect(html).toContain(">0<"); // counter starts at 0
});

test("hydration adopts server nodes instead of rebuilding them", () => {
  const root = document.createElement("div");
  root.innerHTML = App().toHTML();

  const serverCount = root.querySelector(".count")!;
  const serverBadge = root.querySelector(".badge")!;

  hydrate(App(), root);

  // Same node references — adoption, not a fresh render (which would flash).
  expect(root.querySelector(".count")).toBe(serverCount);
  expect(root.querySelector(".badge")).toBe(serverBadge);
});

test("onMount flips the badge to the client state after hydration", async () => {
  const root = document.createElement("div");
  root.innerHTML = App().toHTML();
  expect(root.querySelector(".badge")?.textContent).toContain("renderizado en el servidor");

  hydrate(App(), root);
  await tick();

  expect(root.querySelector(".badge")?.textContent).toContain("hidratado en el cliente");
});

test("the counter is interactive once hydrated", () => {
  const root = document.createElement("div");
  root.innerHTML = App().toHTML();
  const count = root.querySelector(".count")!;
  expect(count.textContent).toBe("0");

  hydrate(App(), root);

  const [minus, plus] = Array.from(root.querySelectorAll("button")) as HTMLButtonElement[];
  plus.click();
  plus.click();
  expect(count.textContent).toBe("2");
  minus.click();
  expect(count.textContent).toBe("1");
});
