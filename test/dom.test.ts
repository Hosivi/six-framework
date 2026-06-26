import { test, expect } from "bun:test";
import { signal } from "../src/reactive/index";
import { div, h1, span, img } from "../src/dom/tags";

test("serializes nested static structure", () => {
  const n = div([h1("Hi"), span("there")], { id: "app" });
  expect(n.toHTML()).toBe(`<div id="app"><h1>Hi</h1><span>there</span></div>`);
});

test("merges class and conditional addClass", () => {
  const on = signal(true);
  const n = div("x").class("card").addClass("on", () => on());
  expect(n.toHTML()).toBe(`<div class="card on">x</div>`);
});

test("reactive child resolves to current signal value", () => {
  const name = signal("Ada");
  const n = h1(() => name());
  expect(n.toHTML()).toBe(`<h1>Ada</h1>`);
  name.set("Grace");
  expect(n.toHTML()).toBe(`<h1>Grace</h1>`);
});

test("escapes HTML in text (XSS-safe)", () => {
  const n = span(() => "<b>x</b>");
  expect(n.toHTML()).toBe(`<span>&lt;b&gt;x&lt;/b&gt;</span>`);
});

test("void element self-closes", () => {
  const n = img("", { src: "/a.png" });
  expect(n.toHTML()).toBe(`<img src="/a.png" />`);
});
