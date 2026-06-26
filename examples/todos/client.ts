// Browser entry: mounts the .sx todo app (scoped @styles + when/each + signals).

import { createRoot } from "../../src/reactive/index";
import { App } from "./TodoApp.sx";

const root = document.getElementById("root");
if (root) createRoot(() => App().into(root));
