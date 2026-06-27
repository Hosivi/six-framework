// Browser entry: mounts the fluent counter (signals + fine-grained DOM).

import { createRoot } from "../../src/reactive/index";
import { App } from "./counter";

const root = document.getElementById("root");
if (root) createRoot(() => App().into(root));
