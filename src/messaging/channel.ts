// channel — typed pub/sub for TRANSIENT events (Xamarin MessagingCenter-style).
//
// Complements the store: a store holds shared reactive STATE ("what is the
// value now"); a channel carries fire-and-forget EVENTS ("something happened,
// notify whoever cares"). Subscribers are decoupled from publishers.
//
//   const loggedOut = channel<void>();
//   loggedOut.on(() => router.go("/login"));   // subscribe (auto-cleanup)
//   loggedOut.send();                           // publish
//
//   const itemAdded = channel<{ id: number }>();
//   itemAdded.send({ id: 5 });
//
// Subscribing inside an owner scope (a component build / createRoot) registers
// an automatic unsubscribe, so handlers don't leak when the scope is disposed.

import { onCleanup } from "../reactive/index";

const MAX_DISPATCHES_PER_FLUSH = 1000;

const reportAsyncError = (error: unknown): void => {
  queueMicrotask(() => {
    console.error(error);
  });
};

export interface Channel<T> {
  /** Subscribe. Returns an unsubscribe fn; also auto-removed on scope dispose. */
  on(handler: (payload: T) => void): () => void;
  /** Publish to all current subscribers (synchronous, fire-and-forget). */
  send: [T] extends [void] ? () => void : (payload: T) => void;
}

export function channel<T = void>(): Channel<T> {
  const handlers = new Set<(payload: T) => void>();
  const queue: T[] = [];
  let flushing = false;

  const on = (handler: (payload: T) => void): (() => void) => {
    handlers.add(handler);
    const off = (): void => {
      handlers.delete(handler);
    };
    onCleanup(off); // no-op outside an owner; ties the sub to the current scope
    return off;
  };

  // Iterate a copy so a handler that unsubscribes mid-dispatch is safe.
  const send = (payload?: T): void => {
    queue.push(payload as T);
    if (flushing) return;

    flushing = true;
    let dispatches = 0;

    try {
      while (queue.length > 0) {
        const next = queue.shift() as T;
        dispatches++;
        if (dispatches > MAX_DISPATCHES_PER_FLUSH) {
          queue.length = 0;
          reportAsyncError(new Error("channel.send() exceeded the dispatch recursion guard"));
          break;
        }
        for (const handler of [...handlers]) {
          try {
            handler(next);
          } catch (error) {
            reportAsyncError(error);
          }
        }
      }
    } finally {
      flushing = false;
    }
  };

  return { on, send: send as Channel<T>["send"] };
}
