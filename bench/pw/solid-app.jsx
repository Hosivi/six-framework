// Solid app for the real-browser bench — idiomatic <For> + per-item signal.
// Compiled by babel-preset-solid (see bench/playwright.ts). Exposes window.__bench.

import { createSignal, batch, For } from "solid-js";
import { render } from "solid-js/web";

const Card = (r) => (
  <div class="card">
    <div class="card__avatar">A</div>
    <div class="card__body">
      <div class="card__name">{r.name()}</div>
      <div class="card__handle">@user{r.id}</div>
      <p class="card__bio">Lorem ipsum dolor sit amet, consectetur adipiscing.</p>
      <div class="card__stats"><span>Posts 42</span><span>Followers 1.2k</span><span>Following 180</span></div>
      <div class="card__actions"><button class="btn btn--primary">Follow</button><button class="btn">Message</button></div>
    </div>
  </div>
);

const Row = (r) => (
  <div class="row">
    <div class="row__id">{r.id}</div>
    <div class="row__name">{r.name()}</div>
    <div class="row__email">user{r.id}@six.dev</div>
    <div class="row__role">Editor</div>
    <div class="row__status"><span class="badge">Active</span></div>
    <div class="row__actions"><button class="btn">Edit</button><button class="btn">Delete</button></div>
  </div>
);

const Field = (r) => (
  <div class="field">
    <label class="field__label">Field {r.id}</label>
    <input class="field__input" value={r.name()} />
    <p class="field__hint">Helper text for this field — keep it short and useful.</p>
  </div>
);

const COMPONENTS = { card: Card, row: Row, field: Field };

let items = [];
const [list, setList] = createSignal([]);
const [kind, setKind] = createSignal("card");

render(
  () => <For each={list()}>{(r) => COMPONENTS[kind()](r)}</For>,
  document.getElementById("app"),
);

window.__bench = {
  create(n, type) {
    setKind(type);
    items = Array.from({ length: n }, (_, i) => {
      const [name, setName] = createSignal(`Name ${i + 1}`);
      return { id: i + 1, name, setName };
    });
    setList(items);
  },
  updateAll() {
    batch(() => {
      for (const r of items) r.setName(r.name() + " !");
    });
  },
  update10th() {
    batch(() => {
      for (let i = 0; i < items.length; i += 10) items[i].setName(items[i].name() + " !");
    });
  },
  clear() {
    items = [];
    setList([]);
  },
  count() {
    return document.querySelectorAll(".card, .row, .field").length;
  },
};
