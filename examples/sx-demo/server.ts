// Dev server for the .sx single-file-component demo (Bun-only DEV script).
// The page itself is unstyled — ALL the card styling comes from the @styles
// block inside Card.sx, scoped and injected by the compiler.
//
//   bun run sx   ->  http://127.0.0.1:3739

export {}; // mark as a module so top-level await is allowed

import { sxPlugin } from "../../src/compiler/plugin";

const build = await Bun.build({
  entrypoints: ["examples/sx-demo/client.ts"],
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
<title>sx — .sx compiler</title>
<style>body { background:#0f172a; display:grid; place-items:center; min-height:100vh; margin:0; }</style>
</head>
<body>
<div id="root"></div>
<script type="module" src="/client.js"></script>
</body>
</html>`;

const server = Bun.serve({
  port: 3739,
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
console.log(`sx .sx demo  ->  http://127.0.0.1:${server.port}`);
