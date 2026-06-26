// Dev server for the @html counter demo (Bun-only DEV script).
// The component comes from Counter.sx via an @html block — compiled to a
// cloned template + hole bindings (Solid-style), events included.
//
//   bun run html-demo   ->  http://127.0.0.1:3740

export {}; // mark as a module so top-level await is allowed

import { sxPlugin } from "../../src/compiler/plugin";

const build = await Bun.build({
  entrypoints: ["examples/sx-demo/counter-client.ts"],
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
<title>sx — @html counter</title>
<style>
  body { font-family: system-ui, sans-serif; background:#0f172a; color:#e2e8f0; display:grid; place-items:center; min-height:100vh; margin:0; }
  .app { text-align:center; }
  .title { font-size:2rem; margin:0 0 .25rem; }
  .subtitle { color:#94a3b8; max-width:30rem; margin:0 auto 2rem; }
  .row { display:flex; gap:2rem; justify-content:center; flex-wrap:wrap; }
  .counter { display:flex; align-items:center; gap:1rem; background:#1e293b; padding:1rem 1.25rem; border-radius:12px; }
  .btn { width:44px; height:44px; font-size:1.4rem; border:0; border-radius:10px; background:#6366f1; color:#fff; cursor:pointer; }
  .btn:hover { background:#818cf8; }
  .val { font-size:2rem; font-weight:700; min-width:2.5rem; text-align:center; }
</style>
</head>
<body>
<div id="root"></div>
<script type="module" src="/client.js"></script>
</body>
</html>`;

const server = Bun.serve({
  port: 3740,
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
console.log(`sx @html counter  ->  http://127.0.0.1:${server.port}`);
