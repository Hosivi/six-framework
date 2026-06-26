// End-to-end: a real .sx file with an @html block + events is compiled by the
// plugin (registered in preload), rendered, and clicked. Proves the whole
// pipeline — markup -> template/clone -> bindings -> live events.

import { test, expect } from "bun:test";
import { createRoot } from "../src/reactive/index";
import { div } from "../src/dom/tags";
// @ts-expect-error — .sx has no static type declaration (compiled at runtime).
import { Counter } from "./fixtures/counter.sx";
// @ts-expect-error — .sx has no static type declaration (compiled at runtime).
import { Counter as PerInstance } from "./fixtures/two-counters.sx";
// @ts-expect-error — .sx has no static type declaration (compiled at runtime).
import { List } from "./fixtures/list.sx";

test(".sx @html compiles, renders, and handles events end-to-end", () => {
  const host = document.createElement("div");
  createRoot(() => host.appendChild(Counter()));

  const val = host.querySelector(".val")!;
  const buttons = host.querySelectorAll("button");
  expect(val.textContent).toBe("0");

  (buttons[1] as HTMLButtonElement).click(); // +
  (buttons[1] as HTMLButtonElement).click(); // +
  expect(val.textContent).toBe("2");

  (buttons[0] as HTMLButtonElement).click(); // -
  expect(val.textContent).toBe("1");
});

test("inline @html gives per-instance state (two independent counters)", () => {
  const host = document.createElement("div");
  createRoot(() => {
    host.appendChild(PerInstance());
    host.appendChild(PerInstance());
  });

  const btns = host.querySelectorAll("button");
  expect(btns[0].textContent).toBe("0");
  expect(btns[1].textContent).toBe("0");

  btns[0].click();
  expect(btns[0].textContent).toBe("1");
  expect(btns[1].textContent).toBe("0"); // independent — own signal
});

test("an @html component composes inside a fluent component", () => {
  const host = document.createElement("div");
  // div([...]) is fluent (SxNode); PerInstance() is a raw @html Element child.
  createRoot(() => div([PerInstance(), PerInstance()]).into(host));

  const btns = host.querySelectorAll("button");
  expect(btns.length).toBe(2);
  btns[0].click();
  expect(btns[0].textContent).toBe("1");
  expect(btns[1].textContent).toBe("0"); // each composed instance is independent
});

test("@html markup renders a reactive list via {items().map(row)}", () => {
  const host = document.createElement("div");
  createRoot(() => host.appendChild(List()));

  expect(host.querySelectorAll("li").length).toBe(2);
  expect(Array.from(host.querySelectorAll("li")).map((e) => e.textContent)).toEqual([
    "a",
    "b",
  ]);

  host.querySelector("button")!.click();
  expect(host.querySelectorAll("li").length).toBe(3);
  expect(host.querySelectorAll("li")[2].textContent).toBe("item2");
});
