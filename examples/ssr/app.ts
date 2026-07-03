// The SAME component runs in two places:
//   - on the SERVER, App().toHTML() serializes it to an HTML string (no DOM);
//   - in the BROWSER, hydrate(App(), root) wires reactivity onto that markup.
//
// onMount runs ONLY in the browser, right after hydration finishes. On the
// server it is a no-op, so toHTML() serializes `hydrated()` as false. The badge
// therefore ships as "renderizado en el servidor" and flips to "hidratado en el
// cliente" the moment hydration runs — a visible proof of the handoff.

import { signal, onMount } from "../../src/reactive/index";
import { main, h1, p, div, button, span, strong } from "../../src/dom/tags";
import type { SxNode } from "../../src/dom/types";

export const App = (): SxNode => {
  const count = signal(0);
  const hydrated = signal(false);

  onMount(() => hydrated.set(true));

  return main([
    h1("SSR + Hidratación"),

    p([
      span("Estado: "),
      strong(() => (hydrated() ? "✅ hidratado en el cliente" : "⏳ renderizado en el servidor"))
        .class(() => (hydrated() ? "badge badge--on" : "badge badge--off")),
    ]).class("status"),

    // These buttons are DEAD until hydration wires the onClick handlers.
    div([
      button("−").class("btn").onClick(() => count.update((n) => n - 1)),
      strong(() => String(count())).class("count"),
      button("+").class("btn").onClick(() => count.update((n) => n + 1)),
    ]).class("counter"),

    p(
      "El texto y el número ya se ven antes de que cargue el JS: eso es el SSR. " +
        "Los botones recién responden cuando termina la hidratación.",
    ).class("hint"),
  ]).class("app");
};
