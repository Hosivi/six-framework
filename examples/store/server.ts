// Dev server for the store-driven todos (reuses the todos stylesheet).
//
//   bun run store   ->  http://127.0.0.1:3739

export {}; // mark as a module so top-level await is allowed

import { serve } from "../serve";

await serve({
  title: "sx — todos (store)",
  entry: "examples/store/client.ts",
  css: "examples/todos/todos.css",
  port: 3739,
});
