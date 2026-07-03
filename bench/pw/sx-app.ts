// sx app for the real-browser (Playwright) bench — uses the html`` clone path.
// Exposes window.__bench so the driver can drive create/update/clear in-page.
// Three static-heavy components (card / row / field): lots of static markup so
// the cloneNode advantage has something to amortize (unlike a 2-cell row).

import { signal, batch, createRoot } from "../../src/reactive/index";
import { html } from "../../src/dom/html";
import { insert } from "../../src/dom/template";
import type { WritableSignal } from "../../src/reactive/types";

type Item = { id: number; name: WritableSignal<string> };

const card = (r: Item): DocumentFragment => html`<div class="card">
  <div class="card__avatar">A</div>
  <div class="card__body">
    <div class="card__name">${() => r.name()}</div>
    <div class="card__handle">@user${r.id}</div>
    <p class="card__bio">Lorem ipsum dolor sit amet, consectetur adipiscing.</p>
    <div class="card__stats"><span>Posts 42</span><span>Followers 1.2k</span><span>Following 180</span></div>
    <div class="card__actions"><button class="btn btn--primary">Follow</button><button class="btn">Message</button></div>
  </div>
</div>`;

const row = (r: Item): DocumentFragment => html`<div class="row">
  <div class="row__id">${r.id}</div>
  <div class="row__name">${() => r.name()}</div>
  <div class="row__email">user${r.id}@six.dev</div>
  <div class="row__role">Editor</div>
  <div class="row__status"><span class="badge">Active</span></div>
  <div class="row__actions"><button class="btn">Edit</button><button class="btn">Delete</button></div>
</div>`;

const field = (r: Item): DocumentFragment => html`<div class="field">
  <label class="field__label">Field ${r.id}</label>
  <input class="field__input" value=${() => r.name()} />
  <p class="field__hint">Helper text for this field — keep it short and useful.</p>
</div>`;

const renderers: Record<string, (r: Item) => DocumentFragment> = { card, row, field };

let items: Item[] = [];
let kind = "card";
const list = signal<Item[]>([]);

createRoot(() => {
  const host = document.getElementById("app")!;
  // fragments list — relies on the insert() DocumentFragment fix.
  insert(host, () => list().map((r) => renderers[kind]!(r)));
});

(window as unknown as { __bench: unknown }).__bench = {
  create(n: number, type: string): void {
    kind = type;
    items = Array.from({ length: n }, (_, i) => ({ id: i + 1, name: signal(`Name ${i + 1}`) }));
    list.set(items);
  },
  updateAll(): void {
    batch(() => {
      for (const r of items) r.name.update((s) => s + " !");
    });
  },
  update10th(): void {
    batch(() => {
      for (let i = 0; i < items.length; i += 10) items[i]!.name.update((s) => s + " !");
    });
  },
  clear(): void {
    items = [];
    list.set([]);
  },
  count(): number {
    return document.querySelectorAll(".card, .row, .field").length;
  },
};
