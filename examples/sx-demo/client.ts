// Browser entry — imports a .sx single-file component (compiled by the plugin).

import { Card } from "./Card.sx";

const root = document.getElementById("root");
if (root) Card().into(root);
