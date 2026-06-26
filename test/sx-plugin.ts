// Test preload: register the .sx compiler as a Bun runtime loader so tests can
// `import` .sx fixtures directly.

import { plugin } from "bun";
import { sxPlugin } from "../src/compiler/plugin";

plugin(sxPlugin);
