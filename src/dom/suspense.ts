// suspense() — coordinate one shared fallback across N async sources.
//
// Unlike React/Solid's implicit Suspense (which needs offscreen rendering to
// keep children mounted while they suspend), six resources start fetching when
// CREATED, not when mounted. So suspense is explicit and simple: you create the
// resources, they run on their own, and suspense just swaps a shared fallback
// for the children once every source has settled (no longer loading).
//
//   const user  = resource(() => fetchUser(id));
//   const posts = resource(() => fetchPosts(id));
//   suspense([user, posts], () => Spinner(), () => Dashboard(user()!, posts()!));
//
// Combine with errorBoundary() to handle rejected sources.

import { when } from "./control";
import type { SxNode, DynamicChild } from "./types";

/** Something whose loading state suspense can observe: a Resource or a thunk. */
export type SuspenseSource = { loading: () => boolean } | (() => boolean);

const isLoading = (s: SuspenseSource): boolean => {
  // A Resource is BOTH callable (its data accessor) AND carries a .loading()
  // method, so probe for .loading first — otherwise we'd invoke the resource as
  // a plain thunk and read its data instead of its loading flag.
  const maybe = s as { loading?: () => boolean };
  return typeof maybe.loading === "function"
    ? maybe.loading()
    : (s as () => boolean)();
};

/**
 * Show `fallback` while ANY source is loading; swap to `children` once all
 * sources have settled. Reactive: re-evaluates as each source's loading flips.
 */
export const suspense = (
  sources: SuspenseSource | SuspenseSource[],
  fallback: () => SxNode,
  children: () => SxNode,
): DynamicChild => {
  const list = Array.isArray(sources) ? sources : [sources];
  return when(() => list.some(isLoading), fallback, children);
};
