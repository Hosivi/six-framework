// sx — the public API barrel.
//
// Re-exports every layer so the framework is a single import surface:
//   import { signal, div, when, createStore, resource, channel } from "sixframework";
//
// Each primitive still lives in its own module, so bundlers tree-shake whatever
// you don't import — the barrel is just a convenience, not a bundle.

export * from "./reactive/index"; // Layer 0 — reactive core + lifecycle + context
export * from "./dom/index"; //     Layer 1 — tags, builder, control flow, render/SSR
export * from "./state/index"; //   state — createStore + provideStore/useStore
export * from "./async/index"; //   async — resource
export * from "./messaging/index"; // messaging — channel
export * from "./router/index"; //  router — route/router/navigate/link
export * from "./devtools/index"; // devtools — reactive-graph instrumentation
