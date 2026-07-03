// Tests for the precompiled-DOM primitives (the @html compile target).

import { test, expect } from "bun:test";
import { signal } from "../src/reactive/index";
import { template, insert, bindEvent } from "../src/dom/template";
import { html } from "../src/dom/html";

test("template clones a precompiled node (no per-instance tree build)", () => {
  const make = template(`<div class="card"><span></span></div>`);
  const a = make();
  const b = make();
  expect(a).not.toBe(b); // distinct clones
  expect(a.outerHTML).toBe(`<div class="card"><span></span></div>`);
  expect(a.className).toBe("card");
});

test("insert binds reactive text into a clone, fine-grained", () => {
  const count = signal(0);
  const el = template(`<span></span>`)();
  insert(el, () => count());
  expect(el.textContent).toBe("0");
  const textNode = el.firstChild;

  count.set(7);
  expect(el.textContent).toBe("7");
  expect(el.firstChild).toBe(textNode); // same text node
});

test("insert renders a reactive list (array of nodes) — each", () => {
  const items = signal(["a", "b"]);
  const host = document.createElement("div");
  insert(host, () =>
    items().map((t) => {
      const li = document.createElement("li");
      li.textContent = t;
      return li;
    }),
  );
  expect(host.querySelectorAll("li").length).toBe(2);

  items.set(["a", "b", "c"]);
  expect(Array.from(host.querySelectorAll("li")).map((e) => e.textContent)).toEqual([
    "a",
    "b",
    "c",
  ]);

  items.set([]);
  expect(host.querySelectorAll("li").length).toBe(0);
});

test("insert swaps a reactive conditional node — when", () => {
  const ok = signal(true);
  const a = document.createElement("a");
  a.textContent = "yes";
  const b = document.createElement("b");
  b.textContent = "no";
  const host = document.createElement("div");
  insert(host, () => (ok() ? a : b));

  expect(host.querySelector("a")?.textContent).toBe("yes");
  expect(host.querySelector("b")).toBe(null);

  ok.set(false);
  expect(host.querySelector("a")).toBe(null);
  expect(host.querySelector("b")?.textContent).toBe("no");
});

test("bindEvent wires events on a clone", () => {
  const count = signal(0);
  const el = template(`<button></button>`)() as HTMLButtonElement;
  bindEvent(el, "click", () => count.update((c) => c + 1));
  el.click();
  el.click();
  expect(count()).toBe(2);
});

test("a hand-written 'compiled' counter works (the shape @html will emit)", () => {
  // EXACTLY the code the @html compiler will generate: clone + bind holes.
  const tmpl = template(`<div><button>-</button><span></span><button>+</button></div>`);

  const Counter = (): Element => {
    const count = signal(0);
    const el = tmpl();
    const dec = el.children[0];
    const val = el.children[1];
    const inc = el.children[2];
    bindEvent(dec, "click", () => count.update((c) => c - 1));
    insert(val, () => count()); // binding ONLY at the dynamic spot
    bindEvent(inc, "click", () => count.update((c) => c + 1));
    return el;
  };

  const host = document.createElement("div");
  host.appendChild(Counter());

  const val = host.querySelector("span")!;
  const buttons = host.querySelectorAll("button");
  expect(val.textContent).toBe("0");

  (buttons[1] as HTMLButtonElement).click(); // +
  (buttons[1] as HTMLButtonElement).click(); // +
  expect(val.textContent).toBe("2");

  (buttons[0] as HTMLButtonElement).click(); // -
  expect(val.textContent).toBe("1");
});

test("insert clears a reactive list of html`` fragments without throwing", () => {
  // html`` returns a DocumentFragment; insertBefore empties it. Clearing the
  // list must remove the fragment's CHILDREN, not call fragment.remove()
  // (DocumentFragment has no .remove() — that used to throw).
  const list = signal(["a", "b"]);
  const host = document.createElement("div");
  insert(host, () => list().map((t) => html`<li>${t}</li>`));
  expect(host.querySelectorAll("li").length).toBe(2);
  expect(host.querySelectorAll("li")[0]?.textContent).toBe("a");

  expect(() => list.set([])).not.toThrow();
  expect(host.querySelectorAll("li").length).toBe(0);

  // and it can re-populate after clearing
  list.set(["x", "y", "z"]);
  expect(Array.from(host.querySelectorAll("li")).map((e) => e.textContent)).toEqual(["x", "y", "z"]);
});
