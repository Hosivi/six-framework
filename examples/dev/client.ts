// Browser entry for the dev app shell.

import { createRoot } from "../../src/reactive/index";
import { App } from "./app";

const root = document.getElementById("root");
if (root) createRoot(() => App().into(root));
