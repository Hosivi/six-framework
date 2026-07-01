// toJSON must render the errorBoundary fallback when children throw — the same
// as serializeChild (HTML). Previously toJSON silently dropped it, diverging
// from the HTML output for the same tree.

import { test, expect } from "bun:test";
import { div, span } from "../src/dom/tags";
import { errorBoundary } from "../src/dom/control";

test("toJSON renders the errorBoundary fallback when children throw", () => {
  const node = div([
    errorBoundary(
      () => {
        throw new Error("boom");
      },
      () => span("fallback"),
    ),
  ]);
  const flat = JSON.stringify(node.toJSON());
  expect(flat).toContain("fallback");
  expect(flat).toContain("span");
});

test("toJSON renders errorBoundary children normally when they do not throw", () => {
  const node = div([errorBoundary(() => span("ok"), () => span("fallback"))]);
  const flat = JSON.stringify(node.toJSON());
  expect(flat).toContain("ok");
  expect(flat).not.toContain("fallback");
});

test("toJSON errorBoundary output agrees with HTML output on throw", () => {
  const make = () =>
    div([
      errorBoundary(
        () => {
          throw new Error("x");
        },
        () => span("caught"),
      ),
    ]);
  // Both serializers must surface the fallback.
  expect(make().toHTML()).toContain("caught");
  expect(JSON.stringify(make().toJSON())).toContain("caught");
});
