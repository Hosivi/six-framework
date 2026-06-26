// Browser entry: mounts the .sx products page (scoped @styles + fluent + signals).

import { createRoot } from "../../src/reactive/index";
import { Products } from "./Products.sx";

const root = document.getElementById("root");
if (root) createRoot(() => Products().into(root));
