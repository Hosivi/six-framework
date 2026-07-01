// Browser entry: mounts the store-driven todo app.

import { createRoot } from "../../src/reactive/index";
import { App } from "./app";

const root = document.getElementById("root");
if (root) createRoot(() => App().into(root));
