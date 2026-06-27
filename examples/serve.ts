// Shared Bun dev-server for the html`` examples (Bun-only DEV script).
//
// No sx plugin, no compiler: html`` is a plain runtime function, so the client
// is ordinary TypeScript. Styles live in a separate .css file, inlined here.

interface ServeOptions {
  title: string;
  /** Client entrypoint, e.g. "examples/counter/client.ts". */
  entry: string;
  /** Stylesheet path, e.g. "examples/counter/counter.css". */
  css: string;
  port: number;
}

export const serve = async (opts: ServeOptions): Promise<void> => {
  const build = await Bun.build({
    entrypoints: [opts.entry],
    target: "browser",
  });

  if (!build.success) {
    console.error("Build failed:");
    for (const log of build.logs) console.error(log);
    process.exit(1);
  }

  const clientJs = await build.outputs[0].text();
  const css = await Bun.file(opts.css).text();

  const index = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${opts.title}</title>
<style>
  body { font-family: system-ui, sans-serif; background:#0f172a; color:#e2e8f0; display:grid; place-items:center; min-height:100vh; margin:0; }
${css}
</style>
</head>
<body>
<div id="root"></div>
<script type="module" src="/client.js"></script>
</body>
</html>`;

  const server = Bun.serve({
    port: opts.port,
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/client.js") {
        return new Response(clientJs, {
          headers: { "Content-Type": "text/javascript; charset=utf-8" },
        });
      }
      return new Response(index, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    },
  });

  // Use 127.0.0.1 explicitly: on Windows `localhost` may resolve to IPv6 first.
  console.log(`${opts.title}  ->  http://127.0.0.1:${server.port}`);
};
