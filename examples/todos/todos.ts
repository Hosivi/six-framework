// A todo list in six's native fluent API: when() for the empty state,
// each() for the keyed list. State lives in plain LOCAL signals — compare with
// examples/store/app.ts (the same app driven by createStore) to see the difference.

import { signal } from "../../src/reactive/index";
import { main, h1, div, input, button, ul, li, span, p } from "../../src/dom/tags";
import { when, each } from "../../src/dom/control";
import type { SxNode } from "../../src/dom/types";

type Todo = { id: number; text: string };

export const App = (): SxNode => {
  const todos = signal<Todo[]>([
    { id: 1, text: "Aprender sx" },
    { id: 2, text: "Construir algo real" },
  ]);
  const draft = signal("");
  let nextId = 3;

  const add = (): void => {
    const text = draft().trim();
    if (!text) return;
    todos.update((list) => [...list, { id: nextId++, text }]);
    draft.set("");
  };

  const remove = (id: number): void =>
    todos.update((list) => list.filter((t) => t.id !== id));

  return main([
    h1("Todos sx").class("title"),

    div([
      input("", { type: "text", placeholder: "Nueva tarea..." })
        .class("input")
        .attr("value", draft)
        .onInput((e) => {
          const target = (e as Event).target as HTMLInputElement;
          draft.set(target.value);
        })
        .onKeyDown((e) => {
          if ((e as KeyboardEvent).key === "Enter") add();
        }),
      button("Agregar").class("btn").onClick(add),
    ]).class("row"),

    when(() => todos().length === 0, () => p("No hay tareas. ¡Agregá una!").class("empty")),

    ul(
      each(
        todos,
        (t) =>
          li([
            span(t.text).class("todo__text"),
            button("✕").class("todo__del").onClick(() => remove(t.id)),
          ]),
        (t) => t.id,
      ),
    ).class("list"),

    p(() => `${todos().length} tarea(s)`).class("count"),
  ]).class("app");
};
