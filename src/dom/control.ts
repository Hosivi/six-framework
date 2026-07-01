// Reactive control flow (Layer 1): when(), each(), match(), index(), portal(), errorBoundary().
// All return a DynamicChild marker that the renderer treats as a live region:
//   - toHTML() serializes a static snapshot
//   - .into() mounts/unmounts reactively

import type { SxNode, DynamicChild } from "./types";

/**
 * Conditional region. Re-mounts only when the condition actually flips.
 * `condition` is a thunk so it stays reactive (the descriptor is built once);
 * `then` / `else_` are lazy — a branch is constructed only when selected.
 */
export const when = (
  condition: () => boolean,
  then: () => SxNode,
  else_?: () => SxNode,
): DynamicChild => ({ kind: "when", condition, truthy: then, falsy: else_ });

/** Keyed list region. Unchanged items are reused; only diffs touch the DOM. */
export const each = <T>(
  list: () => readonly T[],
  renderItem: (item: T, index: number) => SxNode,
  key?: (item: T, index: number) => string | number,
): DynamicChild => ({
  kind: "each",
  items: () => list() as unknown[],
  renderItem: renderItem as (item: unknown, index: number) => SxNode,
  key: (key ?? ((_item, index) => index)) as (
    item: unknown,
    index: number,
  ) => string | number,
});

/**
 * Multi-branch conditional. Evaluates cases in order and renders the first
 * truthy one. Falls back to `fallback` if no case matches.
 */
export const match = (
  cases: Array<[() => boolean, () => SxNode]>,
  fallback?: () => SxNode,
): DynamicChild => ({ kind: "match", cases, fallback });

/**
 * Index-keyed list. Like `each` but uses array position as the reconciliation
 * key — simpler when items have no stable identity.
 */
export const index = <T>(
  list: () => readonly T[],
  renderItem: (item: T, index: number) => SxNode,
): DynamicChild => each(list, renderItem, (_item, i) => i);

/**
 * Portal. Renders children into `target` (outside the normal parent hierarchy).
 * The live DOM element is inserted into target; nothing is rendered in the
 * local position.
 */
export const portal = (
  target: Element | (() => Element),
  children: () => SxNode,
): DynamicChild => ({
  kind: "portal",
  target: typeof target === "function" ? target : () => target,
  children,
});

/**
 * Error boundary. Renders children normally; if children() throws, renders
 * the fallback instead. The fallback receives the caught error and a reset()
 * callback that clears the error and re-attempts children.
 */
export const errorBoundary = (
  children: () => SxNode,
  fallback: (err: unknown, reset: () => void) => SxNode,
): DynamicChild => ({ kind: "error", children, fallback });
