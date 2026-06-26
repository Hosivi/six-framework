// Public API of the DOM layer (Layer 1).

export * from "./tags";
export { when, each } from "./control";
export { createNode, serialize, toJSON } from "./node";
export { render } from "./render";
export { collectStyles, resetStyles } from "./styles";
export { template, walkElements, insert, bindAttr, bindEvent } from "./template";

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
