// SSR dev server: renders the app to HTML on the server, then ships a client
// bundle that HYDRATES it.
//
//   bun run ssr  ->  http://127.0.0.1:3740
//
// The contrast with the CSR examples (counter/todos/store, via ../serve.ts):
//   - CSR:  <div id="root"></div>            (empty; the client builds it)
//   - SSR:  <div id="root">…full markup…</div>  (the client only hydrates it)
//
// Open the page and choose "View Source": you will see the fully rendered app
// inside #root — that HTML came from App().toHTML() below, not from the browser.

export {}; // mark as a module so top-level await is allowed

import { App } from "./app";

const build = await Bun.build({
  entrypoints: ["examples/ssr/client.ts"],
  target: "browser",
});
if (!build.success) {
  console.error("Build failed:");
  for (const log of build.logs) console.error(log);
  process.exit(1);
}
const clientJs = await build.outputs[0].text();
const css = await Bun.file("examples/ssr/ssr.css").text();

// SERVER-SIDE RENDER: the component becomes an HTML string here, in Bun, with
// no DOM. A fresh App() per request keeps signal state request-isolated.
const page = (): string => {
  const appHtml = App().toHTML();
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>sx — SSR + hidratación</title>
<style>
  body { font-family: system-ui, sans-serif; background:#0f172a; color:#e2e8f0; display:grid; place-items:center; min-height:100vh; margin:0; }
${css}
</style>
</head>
<body>
<div id="root">${appHtml}</div>
<script type="module" src="/client.js"></script>
</body>
</html>`;
};

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 3740,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/client.js") {
      return new Response(clientJs, {
        headers: { "Content-Type": "text/javascript; charset=utf-8" },
      });
    }
    return new Response(page(), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  },
});

console.log(`sx — SSR  ->  http://127.0.0.1:${server.port}`);
