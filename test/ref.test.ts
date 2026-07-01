// Tests for the .ref() modifier — live element capture.

import { test, expect } from "bun:test";
import { createRoot, onMount } from "../src/reactive/index";
import { div, input } from "../src/dom/tags";

test("ref receives the real DOM element on mount", () => {
  const host = document.createElement("div");
  const captured: { el: HTMLElement | null } = { el: null };

  createRoot(() => div("hi").ref((el) => { captured.el = el; }).into(host));

  expect(captured.el).not.toBeNull();
  expect(captured.el?.tagName).toBe("DIV");
  expect(captured.el?.textContent).toBe("hi");
});

test("ref fires before onMount — element is available to onMount", async () => {
  const host = document.createElement("div");
  const order: string[] = [];
  let refEl: HTMLElement | null = null;

  createRoot(() => {
    onMount(() => {
      order.push("onMount");
      expect(refEl).not.toBeNull(); // ref already ran
    });
    div("x")
      .ref((el) => { refEl = el; order.push("ref"); })
      .into(host);
  });

  expect(order).toEqual(["ref"]); // ref is sync; onMount is deferred
  await Promise.resolve();
  expect(order).toEqual(["ref", "onMount"]);
});

test("multiple refs on one element all fire", () => {
  const host = document.createElement("div");
  const calls: HTMLElement[] = [];

  createRoot(() =>
    div("x")
      .ref((el) => calls.push(el))
      .ref((el) => calls.push(el))
      .into(host),
  );

  expect(calls).toHaveLength(2);
  expect(calls[0]).toBe(calls[1]); // same element, two callbacks
});

test("ref is silently ignored during SSR (toHTML)", () => {
  let called = false;
  const html = div("x").ref(() => { called = true; }).toHTML();
  expect(called).toBe(false);
  expect(html).toBe("<div>x</div>");
});

test("ref works with input — supports focus-on-mount pattern", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);

  let focused = false;
  createRoot(() => {
    let el: HTMLInputElement | null = null;
    onMount(() => {
      el?.focus();
      focused = document.activeElement === el;
    });
    input()
      .attr("type", "text")
      .ref((node) => { el = node as HTMLInputElement; })
      .into(host);
  });

  await Promise.resolve();
  expect(focused).toBe(true);
  document.body.removeChild(host);
});
