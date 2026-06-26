// Browser entry: mounts the .sx counter (scoped @styles + signals).

import { createRoot } from "../../src/reactive/index";
import { App } from "./App.sx";

const root = document.getElementById("root");
if (root) createRoot(() => App().into(root));
