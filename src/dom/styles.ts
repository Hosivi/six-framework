// SSR style collection (runtime-neutral — only touches globalThis).
//
// The .sx compiler registers each component's scoped CSS into
// globalThis.__SX_STYLES__ when there is no DOM (Node/SSR). These helpers read
// that registry to inline <style> tags into a server-rendered document.

type Registry = Map<string, string>;

const registry = (): Registry => {
  const g = globalThis as unknown as { __SX_STYLES__?: Registry };
  return (g.__SX_STYLES__ ??= new Map());
};

/** All collected scoped styles as <style> tags, for the SSR <head>. */
export const collectStyles = (): string => {
  let out = "";
  for (const [id, css] of registry()) {
    out += `<style id="${id}">${css}</style>`;
  }
  return out;
};

/** Clear the collected styles (call once per SSR request). */
export const resetStyles = (): void => {
  registry().clear();
};
