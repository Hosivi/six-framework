// Dev server for the .sx products page (Bun-only DEV script).
// The page is LIVE (interactive "Agregar") — all card styling comes from the
// scoped @styles inside Products.sx, injected by the compiler.
//
//   bun run products   ->  http://127.0.0.1:3741

export {}; // mark as a module so top-level await is allowed

import { sxPlugin } from "../../src/compiler/plugin";

const build = await Bun.build({
  entrypoints: ["examples/products/client.ts"],
  target: "browser",
  plugins: [sxPlugin],
});

if (!build.success) {
  console.error("Build failed:");
  for (const log of build.logs) console.error(log);
  process.exit(1);
}

const clientJs = await build.outputs[0].text();

const INDEX = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Tienda sx</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; padding: 2rem; }
</style>
</head>
<body>
<div id="root"></div>
<script type="module" src="/client.js"></script>
</body>
</html>`;

const server = Bun.serve({
  port: 3741,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/client.js") {
      return new Response(clientJs, {
        headers: { "Content-Type": "text/javascript; charset=utf-8" },
      });
    }
    return new Response(INDEX, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  },
});

// Use 127.0.0.1 explicitly: on Windows `localhost` may resolve to IPv6 first.
console.log(`tienda sx (.sx)  ->  http://127.0.0.1:${server.port}`);
