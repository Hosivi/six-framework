// Registers a happy-dom global environment so tests can use `document`,
// `Element`, events, etc. Loaded via bunfig.toml `[test] preload`.

import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();
