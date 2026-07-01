// Public API of the DOM layer (Layer 1).

export * from "./tags";
export { when, each, match, index, portal, errorBoundary } from "./control";
export { suspense } from "./suspense";
export type { SuspenseSource } from "./suspense";
export { createNode, serialize, toJSON } from "./node";
export { render } from "./render";
export { renderToStream, streamToString, renderToReadableStream } from "./stream";
export { hydrate } from "./hydrate";
export { css } from "./css";
export type { CSSObject, CSSValue } from "./css";
export { collectStyles, resetStyles, registerStyle } from "./styles";
export { template, walkElements, insert, bindAttr, bindProp, bindEvent } from "./template";
export { html } from "./html";

export type {
  SxNode,
  SxChild,
  DynamicChild,
  HtmlProps,
  Reactive,
  Modifier,
  JsonDescriptor,
  EventHandler,
} from "./types";
