// Dev server for the router dashboard example (Tailwind v4 via CLI).
//
//   bun run dashboard  ->  http://127.0.0.1:3739
//
// On start, the Tailwind CLI scans dashboard.ts for utility classes and emits
// dashboard.generated.css (only the utilities actually used), which serve()
// inlines. serve() then returns the same index.html for every path (SPA
// fallback) — exactly what history-mode routing needs: a deep-link such as
// /users/2 loads the page and the client-side router resolves the view.

export {}; // mark as a module so top-level await is allowed

import { serve } from "../serve";

const CSS_OUT = "examples/dashboard/dashboard.generated.css";

// Build the Tailwind stylesheet before serving so the inlined CSS is always
// in sync with the utilities currently used in dashboard.ts.
const build = Bun.spawnSync([
  "bunx",
  "tailwindcss",
  "--input",
  "examples/dashboard/tailwind.css",
  "--output",
  CSS_OUT,
  "--minify",
]);

if (build.exitCode !== 0) {
  console.error("Tailwind build failed:\n" + build.stderr.toString());
  process.exit(1);
}

await serve({
  title: "sx — dashboard",
  entry: "examples/dashboard/client.ts",
  css: CSS_OUT,
  port: 3739,
});
