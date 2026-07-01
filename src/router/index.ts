// Functional router (Layer 2).
//
// Built on match() + a reactive path signal. No classes, no `this`, no proxies.
// Supports two modes:
//   - "history" (default): clean URLs via history.pushState / popstate
//   - "hash": "/#/route" via location.hash / hashchange
// SSR-safe: request-local router state is injected via withRouter(), so
// concurrent requests never share path state.

import { createContext, provide, signal, untrack, useContext } from "../reactive/index";
import type { SxNode, SxChild, DynamicChild, EventHandler } from "../dom/types";
import { match } from "../dom/control";
import { a } from "../dom/tags";

export type RouteParams = Record<string, string>;

export interface RouteDef {
  matches: (path: string) => boolean;
  params: (path: string) => RouteParams;
  view: (params: RouteParams) => SxNode;
}

type RouterMode = "history" | "hash";

type RouterState = {
  mode: RouterMode;
  path: ReturnType<typeof signal<string>>;
};

// ---- module state ----------------------------------------------------------

const createRouterState = (initialPath: string, mode: RouterMode = "history"): RouterState => ({
  mode,
  path: signal(initialPath),
});

const RouterStateContext = createContext<RouterState | null>(null);
const clientRouterState = createRouterState(
  typeof window === "undefined" ? "/" : window.location.pathname + window.location.search,
);

const getScopedRouterState = (): RouterState | null => useContext(RouterStateContext);

const getRouterState = (): RouterState => getScopedRouterState() ?? clientRouterState;

const readLocation = (mode: RouterMode): string => {
  if (typeof window === "undefined") return "/";
  if (mode === "hash") return window.location.hash.slice(1) || "/";
  return window.location.pathname + window.location.search;
};

const setRouterPath = (state: RouterState, next: string): void => {
  state.path.set(state.mode === "hash" ? next.replace(/^#/, "") : next);
};

/**
 * Provide request-local router state for synchronous SSR work.
 * Async callbacks are rejected because router context is owner-stack scoped.
 */
export function withRouter<T>(path: string, fn: () => Promise<T>): never;
export function withRouter<T>(path: string, fn: () => T): T;
export function withRouter<T>(path: string, fn: () => T): T {
  return provide(RouterStateContext, createRouterState(path), fn);
}

/** Read the current router path reactively. */
export const currentPath = (): string => getRouterState().path();

/**
 * Override the current path.
 * On the server this requires an active withRouter() scope so each request
 * stays isolated.
 */
export const setPath = (next: string): void => {
  const scoped = getScopedRouterState();
  if (scoped) {
    setRouterPath(scoped, next);
    return;
  }
  if (typeof window === "undefined") {
    throw new Error("setPath() on the server requires withRouter(path, fn)");
  }
  setRouterPath(clientRouterState, next);
};

// ---- pattern compilation ---------------------------------------------------

// "/users/:id" -> regex with a capture group per :param.
// "*" matches a catch-all rest segment.
const compile = (pattern: string): { re: RegExp; names: string[] } => {
  const names: string[] = [];
  const parts = pattern.split("/").map((seg) => {
    if (seg.startsWith(":")) {
      names.push(seg.slice(1));
      return "([^/]+)";
    }
    if (seg === "*") {
      names.push("rest");
      return "(.*)";
    }
    return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // escape literal
  });
  return { re: new RegExp("^" + parts.join("/") + "$"), names };
};

const pathname = (full: string): string => full.split("?")[0] ?? "";

const safeDecodeURIComponent = (value: string): string | null => {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
};

/**
 * Define a route: a URL pattern and the view factory to render on match.
 * ":param" segments are captured and passed to the view as params.
 *
 *   route("/users/:id", (p) => UserPage(p.id))
 */
export const route = (
  pattern: string,
  view: (params: RouteParams) => SxNode,
): RouteDef => {
  const { re, names } = compile(pattern);
  const exec = (full: string): RegExpMatchArray | null => pathname(full).match(re);
  const parseParams = (full: string): RouteParams | null => {
    const m = exec(full);
    if (!m) return null;
    const params: RouteParams = {};
    for (const [index, name] of names.entries()) {
      const decoded = safeDecodeURIComponent(m[index + 1] ?? "");
      if (decoded === null) return null;
      params[name] = decoded;
    }
    return params;
  };
  return {
    matches: (full) => parseParams(full) !== null,
    params: (full) => parseParams(full) ?? {},
    view,
  };
};

// ---- router ----------------------------------------------------------------

/**
 * Reactive router region. Built on match(): the first route whose pattern
 * matches currentPath() renders; otherwise `fallback`. Re-renders when the
 * path signal changes (via navigate() or browser back/forward).
 *
 *   router([
 *     route("/",          () => Home()),
 *     route("/users/:id", (p) => User(p.id)),
 *   ], () => NotFound())
 */
export const router = (
  routes: RouteDef[],
  fallback?: () => SxNode,
): DynamicChild =>
  match(
    routes.map((r): [() => boolean, () => SxNode] => [
      () => r.matches(currentPath()),
      () => r.view(r.params(untrack(() => currentPath()))),
    ]),
    fallback,
  );

// ---- navigation ------------------------------------------------------------

/**
 * Navigate to a new path. Updates the browser URL (pushState or hash) and
 * the reactive path signal so the router re-renders. No full page reload.
 *
 * The browser-history mutation is wrapped in try/catch so a hostile or
 * restricted environment (or a test DOM that rejects pushState) can never
 * prevent the reactive path signal from updating.
 */
export const navigate = (to: string, opts?: { replace?: boolean }): void => {
  const scoped = getScopedRouterState();
  const state = scoped ?? clientRouterState;
  if (typeof window !== "undefined") {
    try {
      if (!scoped && state.mode === "hash") {
        window.location.hash = to;
        // hashchange listener will update the signal; set eagerly too.
      } else if (!scoped && opts?.replace) {
        window.history.replaceState(null, "", to);
      } else if (!scoped) {
        window.history.pushState(null, "", to);
      }
    } catch {
      // Ignore history failures — the signal update below still drives the UI.
    }
  }
  setRouterPath(state, to);
};

/**
 * Wire the router to browser navigation events. Call once on the client.
 * `history` mode listens to popstate; `hash` mode to hashchange.
 * Returns a dispose function that removes the listeners.
 */
export const startRouter = (opts?: { mode?: RouterMode }): (() => void) => {
  const state = getRouterState();
  state.mode = opts?.mode ?? "history";
  if (typeof window === "undefined") return () => {};
  const sync = (): void => state.path.set(readLocation(state.mode));
  const event = state.mode === "hash" ? "hashchange" : "popstate";
  sync(); // adopt current location under the chosen mode
  window.addEventListener(event, sync);
  return () => window.removeEventListener(event, sync);
};

// ---- link helper -----------------------------------------------------------

/**
 * An <a> that navigates via the router instead of a full page reload.
 * Falls back to normal navigation on modified clicks (ctrl/meta/middle).
 *
 *   link("/users/42", "View user")
 */
export const link = (to: string, ...children: SxChild[]): SxNode => {
  const state = getRouterState();
  const handler: EventHandler = (event) => {
    const e = event as {
      preventDefault?: () => void;
      metaKey?: boolean;
      ctrlKey?: boolean;
      shiftKey?: boolean;
      button?: number;
    };
    if (e.metaKey || e.ctrlKey || e.shiftKey || (e.button ?? 0) !== 0) return;
    e.preventDefault?.();
    navigate(to);
  };
  return a(children.length === 1 ? children[0] : children)
    .attr("href", state.mode === "hash" ? `#${to}` : to)
    .onClick(handler);
};
