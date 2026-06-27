// The dev server: one app, one fixed port — the `npm run dev` of sx.
//
//   bun run dev   ->  http://127.0.0.1:5173

export {}; // mark as a module so top-level await is allowed

import { serve } from "../serve";

await serve({
  title: "sx — dev",
  entry: "examples/dev/client.ts",
  css: "examples/dev/app.css",
  port: 5173,
});
