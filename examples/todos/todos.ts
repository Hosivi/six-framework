// The todo app driven by createStore — all state (todos, draft, id counter)
// lives in ONE store with actions and getters. The view just reads accessors
// and dispatches actions; six's fluent API renders it fine-grained.

import { main, h1, div, input, button, ul, li, span, p } from "../../src/dom/tags";
import { when, each } from "../../src/dom/control";
import { createStore } from "../../src/state/index";
import type { SxNode } from "../../src/dom/types";

type Todo = { id: number; text: string };

const createTodoStore = () =>
  createStore({
    state: {
      todos: [
        { id: 1, text: "Aprender sx" },
        { id: 2, text: "Construir algo real" },
      ] as Todo[],
      draft: "",
      nextId: 3,
    },
    actions: (s) => ({
      setDraft: (value: string) => ({ draft: value }),
      add: () => {
        const text = s.draft().trim();
        if (!text) return; // no patch -> state unchanged
        return {
          todos: [...s.todos(), { id: s.nextId(), text }],
          draft: "",
          nextId: s.nextId() + 1,
        };
      },
      remove: (id: number) => ({ todos: s.todos().filter((t) => t.id !== id) }),
    }),
    getters: (s) => ({
      count: () => s.todos().length,
      isEmpty: () => s.todos().length === 0,
    }),
  });

export const App = (): SxNode => {
  const store = createTodoStore();

  return main([
    h1("Todos sx").class("title"),

    div([
      input("", { type: "text", placeholder: "Nueva tarea..." })
        .class("input")
        .attr("value", store.draft)
        .onInput((e) => {
          const target = (e as Event).target as HTMLInputElement;
          store.setDraft(target.value);
        })
        .onKeyDown((e) => {
          if ((e as KeyboardEvent).key === "Enter") store.add();
        }),
      button("Agregar").class("btn").onClick(() => store.add()),
    ]).class("row"),

    when(store.isEmpty, () => p("No hay tareas. ¡Agregá una!").class("empty")),

    ul(
      each(
        store.todos,
        (t) =>
          li([
            span(t.text).class("todo__text"),
            button("✕").class("todo__del").onClick(() => store.remove(t.id)),
          ]),
        (t) => t.id,
      ),
    ).class("list"),

    p(() => `${store.count()} tarea(s)`).class("count"),
  ]).class("app");
};
