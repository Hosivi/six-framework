// Generates HTML from the descriptor layer (Layer 1) — pure Node, no DOM.
// This proves: describir -> serializar works, reactive values resolve to
// their CURRENT signal value, and output is escaped (XSS-safe) by default.
//
// Run with:  npm run html

import { signal } from "../src/reactive/index";
import { div, h1, h2, span, ul, li, a, img } from "../src/dom/tags";

let pass = 0;
let fail = 0;
const check = (label: string, got: string, want: string): void => {
  if (got === want) {
    pass++;
    console.log("  ✓ " + label);
  } else {
    fail++;
    console.error("  ✗ " + label + "\n      got:  " + got + "\n      want: " + want);
  }
};

console.log("\n# 1. Static nested structure -> HTML");
{
  const node = div([h1("Hola"), span("mundo")], { id: "app" });
  console.log("  " + node.toHTML());
  check("nested + attr", node.toHTML(), `<div id="app"><h1>Hola</h1><span>mundo</span></div>`);
}

console.log("\n# 2. Fluent modifiers (class / addClass / id)");
{
  const active = signal(true);
  const node = div("contenido")
    .class("card")
    .addClass("card--active", () => active())
    .addClass("card--disabled", () => !active())
    .id("box");
  console.log("  " + node.toHTML());
  check("class merge + conditional", node.toHTML(), `<div class="card card--active" id="box">contenido</div>`);
}

console.log("\n# 3. Reactive value resolves at serialization (live state)");
{
  const name = signal("Ada");
  const node = h2(() => `Hola ${name()}`);
  check("before change", node.toHTML(), `<h2>Hola Ada</h2>`);
  name.set("Grace");
  check("after change (same descriptor, new HTML)", node.toHTML(), `<h2>Hola Grace</h2>`);
}

console.log("\n# 4. Void element self-closes");
{
  const node = img("", { src: "/a.png", alt: "foto" });
  console.log("  " + node.toHTML());
  check("img self-close", node.toHTML(), `<img src="/a.png" alt="foto" />`);
}

console.log("\n# 5. XSS-safe by default (escaping)");
{
  const evil = signal('<img src=x onerror="alert(1)">');
  const node = span(() => evil());
  console.log("  " + node.toHTML());
  check(
    "text escaped",
    node.toHTML(),
    `<span>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</span>`,
  );
}

console.log("\n# 6. A small real page");
{
  const items = signal(["Lima", "Cusco", "Arequipa"]);
  const page = div([
    h1("Ciudades"),
    ul(items().map((c) => li(c))),
    a("Volver", { href: "/" }),
  ]).class("page");
  console.log("\n" + page.toHTML() + "\n");
}

console.log(`${fail === 0 ? "✅ ALL GREEN" : "❌ FAILURES"}: ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exitCode = 1;
