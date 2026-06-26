// Bun bundler/runtime plugin: compiles `.sx` files on load.
// Strips @styles, scopes classes, expands @html blocks into precompiled
// template factories, then hands the result to Bun's `ts` loader.

import type { BunPlugin } from "bun";
import { dirname, relative, resolve } from "node:path";
import { compileSx } from "./compile";

const RUNTIME_ABS = resolve("src/dom/runtime.ts");

/** Import specifier for the @html runtime, relative to the .sx file. */
const runtimeSpecifier = (sxPath: string): string => {
  let spec = relative(dirname(sxPath), RUNTIME_ABS)
    .replace(/\\/g, "/")
    .replace(/\.ts$/, "");
  if (!spec.startsWith(".")) spec = "./" + spec;
  return spec;
};

export const sxPlugin: BunPlugin = {
  name: "sx",
  setup(build) {
    build.onLoad({ filter: /\.sx$/ }, async (args) => {
      const source = await Bun.file(args.path).text();
      const { code } = compileSx(source, args.path, {
        htmlRuntime: runtimeSpecifier(args.path),
      });
      return { contents: code, loader: "ts" };
    });
  },
};
