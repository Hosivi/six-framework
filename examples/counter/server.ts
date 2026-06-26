// Dev server for the .sx counter (Bun-only DEV script).
// The counter styling comes from the scoped @styles inside App.sx.
//
//   bun run serve   ->  http://127.0.0.1:3737

export {}; // mark as a module so top-level await is allowed

import { sxPlugin } from "../../src/compiler/plugin";

const build = await Bun.build({
  entrypoints: ["examples/counter/client.ts"],
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
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>sx — counter</title>
<style>body { font-family: system-ui, sans-serif; background:#0f172a; color:#e2e8f0; display:grid; place-items:center; min-height:100vh; margin:0; }</style>
</head>
<body>
<div id="root"></div>
<script type="module" src="/client.js"></script>
</body>
</html>`;

const server = Bun.serve({
  port: 3737,
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
console.log(`sx counter (.sx)  ->  http://127.0.0.1:${server.port}`);
