// The dev "app shell" in six's fluent API: a reactive tab nav that swaps
// between the Counter and Todos demos. This is what `bun run dev` serves —
// one app, one fixed port, like a React/Solid dev server.
//
// when() mounts/unmounts the chosen demo when `view` flips (fresh state each
// switch — fine for a showcase). The CSS scopes each demo via [data-view].

import { signal } from "../../src/reactive/index";
import { div, header, span, nav, button, section } from "../../src/dom/tags";
import { when } from "../../src/dom/control";
import { App as Counter } from "../counter/counter";
import { App as Todos } from "../todos/todos";
import type { SxNode } from "../../src/dom/types";

type View = "counter" | "todos";

export const App = (): SxNode => {
  const view = signal<View>("counter");

  const tab = (label: string, target: View): SxNode =>
    button(label)
      .class("tab")
      .attr("aria-current", () => (view() === target ? "page" : "false"))
      .onClick(() => view.set(target));

  return div([
    header([
      span("sx").class("brand"),
      nav([tab("Counter", "counter"), tab("Todos", "todos")]).class("tabs"),
    ]).class("topbar"),

    section(
      when(
        () => view() === "counter",
        () => Counter(),
        () => Todos(),
      ),
    )
      .class("stage")
      .attr("data-view", view),
  ]).class("shell");
};
