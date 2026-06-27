// Dev server for the html`` counter.
//
//   bun run serve   ->  http://127.0.0.1:3737

export {}; // mark as a module so top-level await is allowed

import { serve } from "../serve";

await serve({
  title: "sx — counter",
  entry: "examples/counter/client.ts",
  css: "examples/counter/counter.css",
  port: 3737,
});
