// Tests for the .style() modifier — inline CSS, static or reactive.

import { test, expect } from "bun:test";
import { createRoot, signal } from "../src/reactive/index";
import { div } from "../src/dom/tags";

// ---- SSR (toHTML) ----

test("serializes a single style property", () => {
  expect(div("x").style("color", "red").toHTML()).toBe(
    `<div style="color: red">x</div>`,
  );
});

test("merges multiple style properties into one attribute", () => {
  const html = div("x").style("color", "red").style("font-size", "14px").toHTML();
  expect(html).toBe(`<div style="color: red; font-size: 14px">x</div>`);
});

test("resolves a reactive style value on serialize", () => {
  const color = signal("blue");
  expect(div("x").style("color", () => color()).toHTML()).toBe(
    `<div style="color: blue">x</div>`,
  );
});

test("skips a null style value", () => {
  expect(div("x").style("color", null).toHTML()).toBe(`<div>x</div>`);
});

// ---- live DOM (.into) ----

test("applies a static style to the live element", () => {
  const host = document.createElement("div");
  createRoot(() => div("x").style("color", "red").into(host));
  const el = host.querySelector("div") as HTMLElement;
  expect(el.style.color).toBe("red");
});

test("updates the style when its signal changes", () => {
  const host = document.createElement("div");
  const width = signal("10px");
  createRoot(() => div("x").style("width", () => width()).into(host));
  const el = host.querySelector("div") as HTMLElement;
  expect(el.style.width).toBe("10px");

  width.set("20px");
  expect(el.style.width).toBe("20px"); // fine-grained, no re-render
});

test("removes the property when the reactive value becomes null", () => {
  const host = document.createElement("div");
  const color = signal<string | null>("red");
  createRoot(() => div("x").style("color", () => color()).into(host));
  const el = host.querySelector("div") as HTMLElement;
  expect(el.style.color).toBe("red");

  color.set(null);
  expect(el.style.color).toBe("");
});
