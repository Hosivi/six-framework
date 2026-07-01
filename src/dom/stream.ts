// Streaming SSR (Layer 1) — emit HTML in chunks instead of one buffered string.
//
// SCOPE — read this before extending: this is SYNCHRONOUS chunked streaming.
// It emits the opening tag as a chunk, then each top-level child as its own
// chunk, then the closing tag — so a large tree is not materialized as a single
// giant string in memory (lower TTFB, less peak memory). Every chunk is still
// produced synchronously from data that is already available.
//
// It does NOT do async / suspense-aware out-of-order streaming (the React-18
// style where the server emits a placeholder, keeps the connection open, and
// swaps in real content once a server-side resource resolves). That requires
// async SSR (awaiting resources mid-tree) and is FUTURE work. Nothing here
// awaits data — the `async` generator is only so callers can `for await` and
// so a WHATWG ReadableStream can back-pressure between chunks.
//
// INVARIANT: concatenating every chunk yields EXACTLY `node.toHTML()`. This is
// guaranteed by reusing the same serializer helpers (`collect`,
// `serializeChild`, `serializeAttrs`, `VOID_ELEMENTS`) that `serialize` uses —
// nothing here reimplements serialization.

import type { SxNode } from "./types";
import { collect, serialize, serializeChild, serializeAttrs, VOID_ELEMENTS } from "./node";
import { escapeHTML } from "./security";

/**
 * Async generator of HTML chunks for `node`.
 *
 * Concatenating all yielded chunks equals `node.toHTML()`. Void elements yield
 * a single self-closing chunk; text nodes yield opening tag, escaped text, and
 * closing tag; element nodes yield the opening tag, one chunk per top-level
 * child, then the closing tag.
 */
export async function* renderToStream(node: SxNode): AsyncGenerator<string> {
  // Void elements have no children and no closing tag: `<tag attrs />`.
  // This is a single small chunk, so delegating to `serialize` stays exact
  // without buffering any large subtree.
  if (VOID_ELEMENTS.has(node.tag)) {
    yield serialize(node);
    return;
  }

  const { attrs, text } = collect(node);
  const attrStr = serializeAttrs(attrs);

  // Opening tag as its own chunk — mirrors `serialize`'s `<${tag}${attrStr}>`.
  yield `<${node.tag}${attrStr}>`;

  if (text !== null) {
    // A `.text()` modifier wins over children, exactly as in `serialize`.
    yield escapeHTML(text);
  } else {
    const children = node.children;
    if (Array.isArray(children)) {
      // One chunk per top-level child. `serializeChild` over each element and
      // joined with "" equals `serializeChild(children)`, so concatenation is
      // byte-identical to the buffered path. Empty results are skipped to keep
      // the stream free of no-op chunks (concatenation is unaffected).
      for (const child of children) {
        const html = serializeChild(child);
        if (html) yield html;
      }
    } else {
      // Single child (string, node, dynamic region, thunk, ...): one chunk.
      const html = serializeChild(children);
      if (html) yield html;
    }
  }

  // Closing tag as its own chunk.
  yield `</${node.tag}>`;
}

/**
 * Drain the stream into a single string.
 *
 * `await streamToString(node)` equals `node.toHTML()`. Useful when a caller
 * wants the chunked code path but a buffered result.
 */
export async function streamToString(node: SxNode): Promise<string> {
  let out = "";
  for await (const chunk of renderToStream(node)) out += chunk;
  return out;
}

/**
 * Wrap the chunk generator in a WHATWG `ReadableStream<string>` for server
 * frameworks (Bun/Node 18+, edge runtimes) that speak Web Streams.
 *
 * Throws if the runtime has no global `ReadableStream`. Guard with a
 * `typeof ReadableStream !== "undefined"` check at the call site if targeting
 * environments where it may be absent.
 */
export function renderToReadableStream(node: SxNode): ReadableStream<string> {
  if (typeof ReadableStream === "undefined") {
    throw new Error(
      "renderToReadableStream: global ReadableStream is not available in this runtime.",
    );
  }
  const iterator = renderToStream(node);
  return new ReadableStream<string>({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) {
        controller.close();
        return;
      }
      controller.enqueue(value);
    },
    async cancel() {
      // Let the generator run its `finally` blocks and release resources.
      await iterator.return?.(undefined);
    },
  });
}
