// The framework's first micro-demo: a FLUENT layout (main/h1/p/div) that
// COMPOSES compiled @html components (Counter). Each counter owns its state.

import { createRoot } from "../../src/reactive/index";
import { main, h1, p, div } from "../../src/dom/tags";
import { Counter } from "./Counter.sx";

const App = () =>
  main([
    h1("sx").class("title"),
    p("Layout fluent + componentes @html compilados. Cada contador tiene su propio estado.").class(
      "subtitle",
    ),
    div([Counter(), Counter(), Counter()]).class("row"),
  ]).class("app");

const root = document.getElementById("root");
if (root) createRoot(() => App().into(root));
