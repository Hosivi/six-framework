// End-to-end test for examples/dashboard — the functional-router demo.
//
// Mounts the real dashboard App and drives it through navigation, asserting the
// router swaps views, resolves route params, highlights the active nav link,
// falls back to 404, and that a view's local signal stays reactive.

import { test, expect } from "bun:test";
import { createRoot } from "../src/reactive/index";
import { navigate } from "../src/router/index";
import { App } from "../examples/dashboard/dashboard";

const mount = (): HTMLElement => {
  const root = document.createElement("div");
  navigate("/"); // reset router path before each mount
  createRoot(() => App().into(root));
  return root;
};

// The active nav link is marked with aria-current="page" (Tailwind utilities
// carry the visual highlight; aria-current is the stable, accessible hook).
const activeLink = (root: HTMLElement): string | null =>
  root.querySelector('[aria-current="page"]')?.textContent ?? null;

test("renders the overview at / and highlights its nav link", () => {
  const root = mount();
  expect(root.textContent).toContain("Resumen");
  expect(root.textContent).toContain("Usuarios"); // stat card
  expect(activeLink(root)).toBe("Resumen");
});

test("navigates to the users list", () => {
  const root = mount();
  navigate("/users");
  expect(root.textContent).toContain("Ada Lovelace");
  expect(root.textContent).toContain("Linus Torvalds");
  expect(activeLink(root)).toBe("Usuarios");
});

test("resolves a route param and highlights the parent section", () => {
  const root = mount();
  navigate("/users/2");
  expect(root.textContent).toContain("Alan Turing");
  expect(root.textContent).toContain("alan@six.dev");
  expect(activeLink(root)).toBe("Usuarios"); // nested route keeps /users active
});

test("shows a not-found view for an unknown user id", () => {
  const root = mount();
  navigate("/users/999");
  expect(root.textContent).toContain("Usuario no encontrado");
});

test("falls back to 404 on an unmatched path", () => {
  const root = mount();
  navigate("/nope");
  expect(root.textContent).toContain("404");
  expect(activeLink(root)).toBeNull();
});

test("settings input binding stays reactive", () => {
  const root = mount();
  navigate("/settings");
  expect(root.textContent).toContain("Configuración");
  expect(root.textContent).toContain("Mi Panel"); // preview reflects default

  const input = root.querySelector('input[type="text"]') as HTMLInputElement;
  input.value = "Panel de Ada";
  input.dispatchEvent(new Event("input"));
  expect(root.textContent).toContain("Panel de Ada");
});
