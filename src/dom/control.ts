// Reactive control flow (Layer 1): when() and each().
// Both return a DynamicChild marker that the renderer treats as a live region:
//   - toHTML() serializes a static snapshot
//   - .into() mounts/unmounts (when) or reconciles by key (each)

import type { SxNode, DynamicChild } from "./types";

/** Conditional region. Re-mounts only when the boolean actually flips. */
export const when = (
  condition: () => boolean,
  truthy: () => SxNode,
  falsy?: () => SxNode,
): DynamicChild => ({ kind: "when", condition, truthy, falsy });

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
