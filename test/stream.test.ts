import { test, expect } from "bun:test";
import {
  renderToStream,
  streamToString,
  renderToReadableStream,
} from "../src/dom/stream";
import { div, span, p, ul, li, img, input } from "../src/dom/tags";
import { when, each } from "../src/dom/control";
import { signal } from "../src/reactive/index";

// Helper: collect every chunk from the async generator into an array.
async function collectChunks(node: Parameters<typeof renderToStream>[0]): Promise<string[]> {
  const chunks: string[] = [];
  for await (const chunk of renderToStream(node)) chunks.push(chunk);
  return chunks;
}

test("main invariant: streamToString equals toHTML for a multi-child tree", async () => {
  const node = div([span("a"), span("b"), p("c")]);
  expect(await streamToString(node)).toBe(node.toHTML());
});

test("emits more than one chunk (it actually streams)", async () => {
  const node = div([span("a"), span("b"), p("c")]);
  const chunks = await collectChunks(node);
  expect(chunks.length).toBeGreaterThan(1);
  // Sanity: concatenation still equals the buffered output.
  expect(chunks.join("")).toBe(node.toHTML());
  // Opening and closing tags are their own chunks.
  expect(chunks[0]).toBe("<div>");
  expect(chunks[chunks.length - 1]).toBe("</div>");
});

test("void elements: nested void children stream and equal toHTML", async () => {
  const node = div([
    img(null, { src: "/logo.png", alt: "logo" }),
    input(null, { type: "text" }),
  ]);
  expect(await streamToString(node)).toBe(node.toHTML());
});

test("void element as root streams as a single self-closing chunk", async () => {
  const node = img(null, { src: "/a.png", alt: "a" });
  const chunks = await collectChunks(node);
  expect(chunks.length).toBe(1);
  expect(chunks[0]).toBe(node.toHTML());
});

test("control flow: when/each hydration markers survive streaming", async () => {
  const ok = signal(true);
  const items = signal([
    { id: 1, name: "Lima" },
    { id: 2, name: "Cusco" },
  ]);
  const node = div([
    when(() => ok(), () => span("yes"), () => span("no")),
    ul(each(items, (c) => li(c.name), (c) => c.id)),
  ]);
  expect(await streamToString(node)).toBe(node.toHTML());

  // Re-evaluate after state changes: streaming reflects the current values.
  ok.set(false);
  items.set([{ id: 3, name: "Piura" }]);
  expect(await streamToString(node)).toBe(node.toHTML());
});

test("text: a .text() node streams equal to toHTML", async () => {
  const node = div("hello & <world>").text("goodbye & <friends>");
  const chunks = await collectChunks(node);
  expect(chunks.join("")).toBe(node.toHTML());
  // The escaped text is its own chunk, distinct from the tags.
  expect(chunks).toEqual(["<div>", "goodbye &amp; &lt;friends&gt;", "</div>"]);
});

test("text: direct string child streams equal to toHTML", async () => {
  const node = span("plain & escaped <text>");
  expect(await streamToString(node)).toBe(node.toHTML());
});

test("renderToReadableStream: reading the stream equals toHTML", async () => {
  if (typeof ReadableStream === "undefined") return; // guard: skip if unsupported

  const node = div([span("a"), span("b"), p("c")]);
  const stream = renderToReadableStream(node);
  const reader = stream.getReader();

  let out = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    out += value;
  }
  expect(out).toBe(node.toHTML());
});
