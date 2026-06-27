// The counter — written in six's native fluent API.
// Tags are functions, modifiers are chainable closures (no classes, no `this`).
// Returns an SxNode descriptor: built once, then `.into()` renders it live.

import { signal } from "../../src/reactive/index";
import { main, h1, p, div, span, button } from "../../src/dom/tags";
import type { SxNode } from "../../src/dom/types";

export const App = (): SxNode => {
  const count = signal(0);

  return main([
    h1("Welcome to sx").class("title"),
    p("Fine-grained reactive. No Virtual DOM. No re-renders.").class("subtitle"),

    div([
      button("−").class("btn").onClick(() => count.update((c) => c - 1)),
      span(() => String(count())).class("count"),
      button("+").class("btn").onClick(() => count.update((c) => c + 1)),
    ]).class("counter"),

    p(() =>
      count() === 0 ? "Click a button to start" : `You clicked ${count()} times`,
    ).class("hint"),
  ]).class("app");
};
