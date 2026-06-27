// Reactive control flow (Layer 1): when() and each().
// Both return a DynamicChild marker that the renderer treats as a live region:
//   - toHTML() serializes a static snapshot
//   - .into() mounts/unmounts (when) or reconciles by key (each)

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
