import { test, expect } from "bun:test";
import { signal } from "../src/reactive/index";
import { a, button, div, el, img, li, span, ul } from "../src/dom/tags";
import { each } from "../src/dom/control";
import { hydrate } from "../src/dom/hydrate";
import { html } from "../src/dom/html";
import { collectStyles, resetStyles } from "../src/dom/styles";

const ssr = (markup: string): HTMLElement => {
  const host = document.createElement("div");
  host.innerHTML = markup;
  return host;
};

const registry = () =>
  globalThis as unknown as { __SX_STYLES__?: Map<string, string> };

test("SSR and dynamic text escape user HTML", () => {
  const payload = signal(`<img src=x onerror="alert(1)">`);

  expect(span(() => payload()).toHTML()).toBe(
    `<span>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</span>`,
  );

  const host = document.createElement("div");
  span(() => payload()).into(host);
  expect(host.querySelector("img")).toBeNull();
  expect(host.textContent).toBe(`<img src=x onerror="alert(1)">`);
});

test("generic props and attr paths ignore inline event attributes", () => {
  const node = button("Run", { onclick: "alert(1)" }).attr("onerror", "alert(2)");

  expect(node.toHTML()).toBe(`<button>Run</button>`);

  const host = document.createElement("div");
  node.into(host);
  const btn = host.querySelector("button")!;
  expect(btn.getAttribute("onclick")).toBeNull();
  expect(btn.getAttribute("onerror")).toBeNull();
});

test("URL-bearing attributes block javascript and unsafe data URLs", () => {
  expect(a("bad", { href: "javascript:alert(1)" }).toHTML()).toBe(`<a>bad</a>`);
  expect(img("", { src: "data:text/html,<script>alert(1)</script>" }).toHTML()).toBe(
    `<img />`,
  );
  expect(el("object", null, { data: "javascript:alert(1)" }).toHTML()).toBe(
    `<object></object>`,
  );
  expect(el("video", null, { poster: "javascript:alert(1)" }).toHTML()).toBe(
    `<video></video>`,
  );
  expect(el("blockquote", "quote", { cite: "javascript:alert(1)" }).toHTML()).toBe(
    `<blockquote>quote</blockquote>`,
  );
  expect(el("body", null, { background: "javascript:alert(1)" }).toHTML()).toBe(
    `<body></body>`,
  );
  expect(img("", { srcset: "/safe.png 1x, javascript:alert(1) 2x" }).toHTML()).toBe(
    `<img />`,
  );

  const host = document.createElement("div");
  a("bad", { href: "java\nscript:alert(1)" }).into(host);
  expect(host.querySelector("a")!.getAttribute("href")).toBeNull();

  el("object", null, { data: "javascript:alert(1)" }).into(host);
  expect(host.querySelector("object")!.getAttribute("data")).toBeNull();
});

test("URL-bearing attributes allow relative, web, contact, and safe image data URLs", () => {
  expect(a("docs", { href: "/docs" }).toHTML()).toBe(`<a href="/docs">docs</a>`);
  expect(a("site", { href: "https://example.com" }).toHTML()).toBe(
    `<a href="https://example.com">site</a>`,
  );
  expect(a("mail", { href: "mailto:test@example.com" }).toHTML()).toBe(
    `<a href="mailto:test@example.com">mail</a>`,
  );
  expect(a("call", { href: "tel:+123456" }).toHTML()).toBe(
    `<a href="tel:+123456">call</a>`,
  );
  expect(img("", { src: "data:image/png;base64,iVBORw0KGgo=" }).toHTML()).toBe(
    `<img src="data:image/png;base64,iVBORw0KGgo=" />`,
  );
  expect(img("", { srcset: "/a.png 1x, https://example.com/a.png 2x" }).toHTML()).toBe(
    `<img srcset="/a.png 1x, https://example.com/a.png 2x" />`,
  );
});

test("html attribute binding applies the same event and URL policy", () => {
  const href = signal("javascript:alert(1)");
  const objectData = signal("javascript:alert(2)");
  const eventAttr = signal("alert(1)");
  const host = document.createElement("div");

  host.appendChild(html`<a href=${href} onclick=${eventAttr}>x</a>`);
  host.appendChild(html`<object data=${objectData}></object>`);
  const link = host.querySelector("a")!;
  const object = host.querySelector("object")!;

  expect(link.getAttribute("href")).toBeNull();
  expect(link.getAttribute("onclick")).toBeNull();
  expect(object.getAttribute("data")).toBeNull();

  href.set("/safe");
  objectData.set("/movie.swf");
  expect(link.getAttribute("href")).toBe("/safe");
  expect(object.getAttribute("data")).toBe("/movie.swf");
});

test("srcdoc is blocked in SSR and live DOM", () => {
  expect(el("iframe", null, { srcdoc: `<script>alert(1)</script>` }).toHTML()).toBe(
    `<iframe></iframe>`,
  );

  const host = document.createElement("div");
  el("iframe", null, { srcdoc: `<script>alert(1)</script>` }).into(host);
  expect(host.querySelector("iframe")!.getAttribute("srcdoc")).toBeNull();
});

test("property URL bindings block unsafe URLs and keep safe URLs working", () => {
  const href = signal("javascript:alert(1)");
  const host = document.createElement("div");

  host.appendChild(html`<a .href=${href}>x</a>`);
  const link = host.querySelector("a")!;

  expect(link.getAttribute("href")).toBeNull();

  href.set("/safe");
  expect(link.getAttribute("href")).toBe("/safe");
});

test("property URL bindings clear previous safe values on unsafe transitions", () => {
  const href = signal("/safe");
  const host = document.createElement("div");

  host.appendChild(html`<a .href=${href}>x</a>`);
  const link = host.querySelector("a")!;

  expect(link.getAttribute("href")).toBe("/safe");

  href.set("javascript:alert(1)");
  expect(link.getAttribute("href")).toBeNull();
});

test("SSR each keys are comment-safe and hydrate against decoded keys", () => {
  const items = signal([{ id: "a-->b", label: "A" }]);
  const App = () => ul(each(items, (item) => li(item.label), (item) => item.id));
  const markup = App().toHTML();

  expect(markup).toContain("<!--sx:i:a%2D%2D%3Eb-->");
  expect(markup).not.toContain("<!--sx:i:a-->b-->");

  const host = ssr(markup);
  const existing = host.querySelector("li")!;
  hydrate(App(), host);

  expect(host.querySelector("li")).toBe(existing);
  items.set([{ id: "a-->b", label: "A" }, { id: "c", label: "C" }]);
  expect(Array.from(host.querySelectorAll("li")).map((el) => el.textContent)).toEqual([
    "A",
    "C",
  ]);
});

test("collectStyles escapes style tag break-out payloads", () => {
  resetStyles();
  registry().__SX_STYLES__!.set("sx-test", `.x{color:red}</style><script>alert(1)</script>`);

  const out = collectStyles();
  expect(out).toBe(
    `<style id="sx-test">.x{color:red}<\\/style><script>alert(1)</script></style>`,
  );
  expect(out).not.toContain(`.x{color:red}</style><script>`);
});

test("dangerous property bindings are ignored", () => {
  const host = document.createElement("div");
  host.appendChild(html`<div .innerHTML=${`<img src=x onerror="alert(1)">`}></div>`);

  const target = host.querySelector("div")!;
  expect(target.innerHTML).toBe("");
  expect(host.querySelector("img")).toBeNull();
});

test("explicit event APIs still work", () => {
  const count = signal(0);
  const host = document.createElement("div");

  div([button("descriptor").onClick(() => count.update((n) => n + 1))]).into(host);
  host.querySelector("button")!.click();

  host.appendChild(html`<button @click=${() => count.update((n) => n + 1)}>template</button>`);
  host.querySelectorAll("button")[1].click();

  expect(count()).toBe(2);
});
