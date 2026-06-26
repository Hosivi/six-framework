// Descriptor types for the DOM layer (Layer 1).
// A node is a plain data descriptor + chainable builder methods.
// No classes, no `this`: every method is a closure over the node.
//
// DOM-blind on purpose: event types are kept generic so these types
// compile under the ES2022 lib only (the core must run in Node/SSR).

/** A value that may be static or reactive (a signal/computed accessor or a thunk). */
export type Reactive<T> = T | (() => T);

export type SxChild =
  | string
  | number
  | boolean
  | null
  | undefined
  | SxNode
  | DynamicChild
  | Node
  | (() => SxChild)
  | SxChild[];

/** A reactive control region produced by when() / each(). */
export type DynamicChild =
  | {
      kind: "when";
      condition: () => boolean;
      truthy: () => SxNode;
      falsy?: () => SxNode;
    }
  | {
      kind: "each";
      items: () => unknown[];
      renderItem: (item: unknown, index: number) => SxNode;
      key: (item: unknown, index: number) => string | number;
    };

export type EventHandler = (event: unknown) => void;

export type HtmlProps = Record<string, Reactive<string | number | boolean | null>>;

export type Modifier =
  | { type: "class"; value: Reactive<string> }
  | { type: "addClass"; name: string; when: () => boolean }
  | { type: "attr"; key: string; value: Reactive<string | number | boolean | null> }
  | { type: "text"; value: Reactive<string | number> }
  | { type: "on"; event: string; handler: EventHandler };

export interface JsonDescriptor {
  tag: string;
  attrs: Record<string, string>;
  children: Array<JsonDescriptor | string>;
}

export interface SxNode {
  readonly tag: string;
  readonly children: SxChild;
  readonly props: HtmlProps;
  readonly modifiers: Modifier[];

  class(value: Reactive<string>): SxNode;
  addClass(name: string, when: () => boolean): SxNode;
  attr(key: string, value: Reactive<string | number | boolean | null>): SxNode;
  id(value: string): SxNode;
  text(value: Reactive<string | number>): SxNode;
  on(event: string, handler: EventHandler): SxNode;

  // Named event helpers (autocomplete-friendly). `on` stays the escape hatch.
  onClick(handler: EventHandler): SxNode;
  onDblClick(handler: EventHandler): SxNode;
  onInput(handler: EventHandler): SxNode;
  onChange(handler: EventHandler): SxNode;
  onSubmit(handler: EventHandler): SxNode;
  onFocus(handler: EventHandler): SxNode;
  onBlur(handler: EventHandler): SxNode;
  onKeyDown(handler: EventHandler): SxNode;
  onKeyUp(handler: EventHandler): SxNode;
  onMouseEnter(handler: EventHandler): SxNode;
  onMouseLeave(handler: EventHandler): SxNode;
  onScroll(handler: EventHandler): SxNode;

  /** Mount into a live DOM target (browser). Returns a dispose function. */
  into(target: Element): () => void;

  /** Serialize to an HTML string (SSR). Runs in pure Node, no DOM. */
  toHTML(): string;
  /** Serialize to a plain JS object — debugging / transport. */
  toJSON(): JsonDescriptor;
}
