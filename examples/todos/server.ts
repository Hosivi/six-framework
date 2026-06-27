// Dev server for the html`` todo app.
//
//   bun run todos   ->  http://127.0.0.1:3738

export {}; // mark as a module so top-level await is allowed

import { serve } from "../serve";

await serve({
  title: "sx — todos",
  entry: "examples/todos/client.ts",
  css: "examples/todos/todos.css",
  port: 3738,
});
