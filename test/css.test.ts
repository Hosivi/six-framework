// Tests for css() — scoped styles from a plain object (functional CSS-in-JS).

import { test, expect } from "bun:test";
import { css } from "../src/dom/css";

const ruleFor = (className: string): string =>
  document.getElementById(className)?.textContent ?? "";

test("returns a scoped sx-* className", () => {
  const c = css({ color: "red" });
  expect(c).toMatch(/^sx-[a-z0-9]+$/);
});

test("equal objects dedup to the same className and one <style>", () => {
  const a = css({ color: "blue", padding: "1rem" });
  const b = css({ color: "blue", padding: "1rem" });
  expect(a).toBe(b);
  expect(document.querySelectorAll(`#${a}`).length).toBe(1); // injected once
});

test("different objects get different classNames", () => {
  const a = css({ color: "red" });
  const b = css({ color: "green" });
  expect(a).not.toBe(b);
});

test("converts camelCase properties to kebab-case", () => {
  const c = css({ backgroundColor: "white", fontSize: "14px" });
  expect(ruleFor(c)).toBe(`.${c}{background-color:white;font-size:14px;}`);
});

test("leaves CSS custom properties untouched", () => {
  const c = css({ "--brand": "tomato" });
  expect(ruleFor(c)).toBe(`.${c}{--brand:tomato;}`);
});

test("nests a pseudo-class under the scoped selector", () => {
  const c = css({
    color: "black",
    ":hover": { color: "blue" },
  });
  expect(ruleFor(c)).toBe(`.${c}{color:black;}.${c}:hover{color:blue;}`);
});

test("expands & to the scoped selector", () => {
  const c = css({ "&:focus": { outline: "none" } });
  expect(ruleFor(c)).toBe(`.${c}:focus{outline:none;}`);
});

test("treats a plain nested key as a descendant selector", () => {
  const c = css({ ".label": { fontWeight: "bold" } });
  expect(ruleFor(c)).toBe(`.${c} .label{font-weight:bold;}`);
});
