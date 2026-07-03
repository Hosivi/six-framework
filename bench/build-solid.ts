// Compile the Solid harness with babel-preset-solid → solid-app.gen.js.
//
// Runs under DEFAULT (node) resolution so @babel/core's real transformer is
// available (its browser build stubs out file transforms). dom.ts then runs
// under `--conditions browser` and imports the generated file.
//
//   bun bench/build-solid.ts

import { transformFileSync } from "@babel/core";
import { writeFileSync } from "node:fs";

const res = transformFileSync("bench/solid-app.jsx", {
  presets: [["babel-preset-solid", {}]],
  filename: "bench/solid-app.jsx",
});
if (!res?.code) throw new Error("babel-preset-solid produced no code");
writeFileSync("bench/solid-app.gen.js", res.code);
console.log(`compiled solid-app.jsx → solid-app.gen.js (${res.code.length} bytes)`);
