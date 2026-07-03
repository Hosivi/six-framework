// React app for the real-browser bench — idiomatic setState + reconciliation.
// Same three components as sx-app / solid-app. Exposes window.__bench.

import { createElement as h, useState, type ReactNode } from "react";
import type { Dispatch, SetStateAction } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";

type Item = { id: number; name: string };

const Card = (r: Item): ReactNode =>
  h("div", { className: "card" },
    h("div", { className: "card__avatar" }, "A"),
    h("div", { className: "card__body" },
      h("div", { className: "card__name" }, r.name),
      h("div", { className: "card__handle" }, `@user${r.id}`),
      h("p", { className: "card__bio" }, "Lorem ipsum dolor sit amet, consectetur adipiscing."),
      h("div", { className: "card__stats" },
        h("span", null, "Posts 42"), h("span", null, "Followers 1.2k"), h("span", null, "Following 180")),
      h("div", { className: "card__actions" },
        h("button", { className: "btn btn--primary" }, "Follow"), h("button", { className: "btn" }, "Message")),
    ),
  );

const Row = (r: Item): ReactNode =>
  h("div", { className: "row" },
    h("div", { className: "row__id" }, r.id),
    h("div", { className: "row__name" }, r.name),
    h("div", { className: "row__email" }, `user${r.id}@six.dev`),
    h("div", { className: "row__role" }, "Editor"),
    h("div", { className: "row__status" }, h("span", { className: "badge" }, "Active")),
    h("div", { className: "row__actions" },
      h("button", { className: "btn" }, "Edit"), h("button", { className: "btn" }, "Delete")),
  );

const Field = (r: Item): ReactNode =>
  h("div", { className: "field" },
    h("label", { className: "field__label" }, `Field ${r.id}`),
    h("input", { className: "field__input", value: r.name, readOnly: true }),
    h("p", { className: "field__hint" }, "Helper text for this field — keep it short and useful."),
  );

const COMPONENTS: Record<string, (r: Item) => ReactNode> = { card: Card, row: Row, field: Field };

let setState: Dispatch<SetStateAction<{ items: Item[]; kind: string }>> | null = null;

const App = (): ReactNode => {
  const [s, set] = useState<{ items: Item[]; kind: string }>({ items: [], kind: "card" });
  setState = set;
  const C = COMPONENTS[s.kind]!;
  return h("div", null, s.items.map((r) => h(C as (p: Item & { key: number }) => ReactNode, { ...r, key: r.id })));
};

const rootEl = document.getElementById("app")!;
const reactRoot = createRoot(rootEl);
flushSync(() => reactRoot.render(h(App)));
const commit = (u: SetStateAction<{ items: Item[]; kind: string }>): void => flushSync(() => setState!(u));

(window as unknown as { __bench: unknown }).__bench = {
  create(n: number, type: string): void {
    commit({ items: Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `Name ${i + 1}` })), kind: type });
  },
  updateAll(): void {
    commit((cur) => ({ ...cur, items: cur.items.map((r) => ({ ...r, name: r.name + " !" })) }));
  },
  update10th(): void {
    commit((cur) => ({ ...cur, items: cur.items.map((r, i) => (i % 10 === 0 ? { ...r, name: r.name + " !" } : r)) }));
  },
  clear(): void {
    commit((cur) => ({ ...cur, items: [] }));
  },
  count(): number {
    return document.querySelectorAll(".card, .row, .field").length;
  },
};
