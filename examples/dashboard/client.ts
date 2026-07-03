// Browser entry: start the router (history mode), then mount the dashboard.
// startRouter() adopts the current URL and keeps currentPath() in sync with
// browser back/forward, so deep-links like /users/2 render the right view.

import { createRoot } from "../../src/reactive/index";
import { startRouter } from "../../src/router/index";
import { App } from "./dashboard";

const root = document.getElementById("root");
if (root) {
  createRoot(() => {
    startRouter({ mode: "history" });
    App().into(root);
  });
}
