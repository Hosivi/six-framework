// onMount — run a callback once, AFTER the component's DOM has been mounted.
//
// In six a component function runs ONCE at build time, before its DOM exists.
// onMount defers the callback to a microtask, so it fires right after the
// synchronous build+mount completes — when the real DOM is in place (for
// measuring layout, focusing, wiring a third-party library, etc.).
//
// It is the counterpart of onCleanup. There is no "update" hook: fine-grained
// effects handle reactive changes at the node level, so the whole component
// lifecycle is just  build → onMount → effects → onCleanup.
//
// Server-side it is a no-op: there is no DOM to mount, and onMount is a
// client-only concern (use `resource`/await for server data).

import { getOwner, onCleanup } from "./graph";

const queue: Array<() => void> = [];
let scheduled = false;

const reportAsyncError = (error: unknown): void => {
  queueMicrotask(() => {
    console.error(error);
  });
};

const flush = (): void => {
  scheduled = false;
  const pending = queue.splice(0);
  for (const fn of pending) {
    try {
      fn();
    } catch (error) {
      reportAsyncError(error);
    }
  }
};

export const onMount = (fn: () => void): void => {
  if (typeof document === "undefined") return; // server: nothing mounts
  let active = true;
  if (getOwner() !== null) onCleanup(() => void (active = false));
  queue.push(() => {
    if (!active) return;
    fn();
  });
  if (!scheduled) {
    scheduled = true;
    queueMicrotask(flush);
  }
};
