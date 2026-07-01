// Scoped-style registry (runtime-neutral — only touches globalThis).
//
// Both the .sx compiler and the runtime css() helper register scoped CSS here.
// In the browser a <style> is appended to <head> (deduped by id); in Node/SSR
// the rule is kept in globalThis.__SX_STYLES__ so collectStyles() can inline it.

import { escapeHTML, escapeStyleTagContent } from "./security";

type Registry = Map<string, string>;

const registry = (): Registry => {
  const g = globalThis as unknown as { __SX_STYLES__?: Registry };
  return (g.__SX_STYLES__ ??= new Map());
};

/**
 * Register one scoped rule under `id`. Idempotent: the same id is injected once.
 * Browser → a <style> in <head>; SSR (no document) → the collectible registry.
 * Trusted-code API: pass only framework-generated or otherwise trusted CSS.
 */
export const registerStyle = (id: string, css: string): void => {
  if (typeof document !== "undefined") {
    if (!document.getElementById(id)) {
      const el = document.createElement("style");
      el.id = id;
      el.textContent = css;
      document.head.appendChild(el);
    }
    return;
  }
  registry().set(id, css);
};

/** All collected scoped styles as <style> tags, for the SSR <head>. */
export const collectStyles = (): string => {
  let out = "";
  for (const [id, css] of registry()) {
    out += `<style id="${escapeHTML(id)}">${escapeStyleTagContent(css)}</style>`;
  }
  return out;
};

/** Clear the collected styles (call once per SSR request). */
export const resetStyles = (): void => {
  registry().clear();
};
