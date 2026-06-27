// Tests for the html`` tagged-template runtime (happy-dom).

import { test, expect } from "bun:test";
import { signal } from "../src/reactive/index";
import { html } from "../src/dom/html";

test("renders static markup", () => {
  const host = document.createElement("div");
  host.appendChild(html`<div class="card"><span>hi</span></div>`);
  expect(host.querySelector(".card span")?.textContent).toBe("hi");
});

test("reactive text hole updates fine-grained", () => {
  const count = signal(0);
  const host = document.createElement("div");
  host.appendChild(html`<span>${count}</span>`);

  const sp = host.querySelector("span")!;
  expect(sp.textContent).toBe("0");
  count.set(5);
  expect(sp.textContent).toBe("5");
});

test("event hole (@click) wires a live listener", () => {
  const count = signal(0);
  const host = document.createElement("div");
  host.appendChild(html`<button @click=${() => count.update((c) => c + 1)}>+</button>`);

  host.querySelector("button")!.click();
  host.querySelector("button")!.click();
  expect(count()).toBe(2);
});

test("attribute hole binds reactively", () => {
  const cls = signal("a");
  const host = document.createElement("div");
  host.appendChild(html`<div class=${cls}></div>`);

  const d = host.querySelector("div")!;
  expect(d.getAttribute("class")).toBe("a");
  cls.set("b");
  expect(d.getAttribute("class")).toBe("b");
});

test("each call produces a distinct clone (template is cached per site)", () => {
  const make = () => html`<p>x</p>`;
  expect(make()).not.toBe(make());
});

test("a full counter built with html``", () => {
  const count = signal(0);
  const Counter = () =>
    html`
      <div>
        <button @click=${() => count.update((c) => c - 1)}>-</button>
        <span class="val">${count}</span>
        <button @click=${() => count.update((c) => c + 1)}>+</button>
      </div>
    `;

  const host = document.createElement("div");
  host.appendChild(Counter());

  const val = host.querySelector(".val")!;
  expect(val.textContent).toBe("0");
  host.querySelectorAll("button")[1].click(); // +
  expect(val.textContent).toBe("1");
  host.querySelectorAll("button")[0].click(); // -
  expect(val.textContent).toBe("0");
});

test("a tag with TWO holes (attr + event) binds both, no stray '>' text", () => {
  const active = signal(false);
  const host = document.createElement("div");
  host.appendChild(
    html`<button
      class="tab"
      aria-current=${() => (active() ? "page" : "false")}
      @click=${() => active.set(true)}
    >Counter</button>`,
  );

  const btn = host.querySelector("button")!;
  expect(btn.textContent).toBe("Counter"); // not ">Counter"
  expect(btn.getAttribute("aria-current")).toBe("false");
  btn.click();
  expect(active()).toBe(true); // the @click hole is a real listener
  expect(btn.getAttribute("aria-current")).toBe("page"); // attr hole reactive
});

test("a `.prop` hole sets a live property (controlled input value)", () => {
  const text = signal("hi");
  const host = document.createElement("div");
  host.appendChild(html`<input .value=${text} />`);

  const input = host.querySelector("input")!;
  expect(input.value).toBe("hi");
  text.set("bye");
  expect(input.value).toBe("bye"); // property, survives interaction
});

test("a '>' inside an attribute value does not close the tag early", () => {
  const host = document.createElement("div");
  host.appendChild(html`<button data-label="a > b" @click=${() => {}}>x</button>`);
  const btn = host.querySelector("button")!;
  expect(btn.getAttribute("data-label")).toBe("a > b");
  expect(btn.textContent).toBe("x");
});

test("composes a list via a reactive array hole", () => {
  const items = signal(["a", "b"]);
  const host = document.createElement("div");
  host.appendChild(
    html`<ul>${() =>
      items().map((t) => {
        const li = document.createElement("li");
        li.textContent = t;
        return li;
      })}</ul>`,
  );

  expect(host.querySelectorAll("li").length).toBe(2);
  items.set(["a", "b", "c"]);
  expect(host.querySelectorAll("li").length).toBe(3);
});
