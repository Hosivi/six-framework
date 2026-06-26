// Tests for SSR scoped-style collection (the .sx compiler registers into
// globalThis.__SX_STYLES__ when there is no DOM; these helpers read it).

import { test, expect } from "bun:test";
import { collectStyles, resetStyles } from "../src/dom/styles";

const registry = () =>
  globalThis as unknown as { __SX_STYLES__?: Map<string, string> };

test("collectStyles emits <style> tags for registered scoped css", () => {
  resetStyles();
  registry().__SX_STYLES__!.set("sx-abc", ".card-abc{color:red}");
  expect(collectStyles()).toBe(`<style id="sx-abc">.card-abc{color:red}</style>`);
});

test("resetStyles clears the registry", () => {
  registry().__SX_STYLES__!.set("sx-1", "x");
  resetStyles();
  expect(collectStyles()).toBe("");
});
