// Browser entry: HYDRATE the server-rendered markup — do NOT rebuild it.
//
// hydrate() adopts the existing DOM nodes (the ones the server sent) and wires
// signals + event handlers onto them. No rebuild, no flash, DOM state kept.
//
// Swap the line below for `App().into(root)` and you get CSR instead: the
// client throws away the server markup and builds the whole tree from scratch.

import { hydrate } from "../../src/dom/hydrate";
import { App } from "./app";

const root = document.getElementById("root");
if (root) hydrate(App(), root);
