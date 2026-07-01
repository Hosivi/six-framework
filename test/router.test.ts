// Tests for the functional router (route/router/navigate/link).

import { test, expect } from "bun:test";
import { createRoot } from "../src/reactive/index";
import { div, span } from "../src/dom/tags";
import { route, router, navigate, setPath, link, withRouter, currentPath } from "../src/router/index";

// ---- pattern matching (pure, no DOM) --------------------------------------

test("route('/') matches '/' but not '/users'", () => {
  const r = route("/", () => span("home"));
  expect(r.matches("/")).toBe(true);
  expect(r.matches("/users")).toBe(false);
});

test("route('/users/:id') matches '/users/42' and extracts { id: '42' }", () => {
  const r = route("/users/:id", () => span("user"));
  expect(r.matches("/users/42")).toBe(true);
  expect(r.params("/users/42")).toEqual({ id: "42" });
});

test("route('/users/:id') does NOT match '/users' or '/users/1/2'", () => {
  const r = route("/users/:id", () => span("user"));
  expect(r.matches("/users")).toBe(false);
  expect(r.matches("/users/1/2")).toBe(false);
});

test("route('/users/:id/posts/:postId') extracts both params", () => {
  const r = route("/users/:id/posts/:postId", () => span("post"));
  expect(r.matches("/users/7/posts/99")).toBe(true);
  expect(r.params("/users/7/posts/99")).toEqual({ id: "7", postId: "99" });
});

test("query string is ignored in the match", () => {
  const r = route("/users/:id", () => span("user"));
  expect(r.matches("/users/42?tab=info")).toBe(true);
  expect(r.params("/users/42?tab=info")).toEqual({ id: "42" });
});

test("wildcard route('/files/*') matches nested paths and captures rest", () => {
  const r = route("/files/*", () => span("file"));
  expect(r.matches("/files/a/b/c")).toBe(true);
  expect(r.params("/files/a/b/c")).toEqual({ rest: "a/b/c" });
});

test("params are URL-decoded", () => {
  const r = route("/search/:q", () => span("search"));
  expect(r.params("/search/hello%20world")).toEqual({ q: "hello world" });
});

test("malformed route params do not crash and are treated as no-match", () => {
  const r = route("/x/:id", () => span("bad"));
  expect(r.matches("/x/%E0%A4%A")).toBe(false);
  expect(r.params("/x/%E0%A4%A")).toEqual({});
});

// ---- router() SSR (setPath + toHTML) --------------------------------------

test("router SSR: renders the '/' view", () => {
  const html = createRoot(() =>
    withRouter("/", () =>
      div([
        router([
          route("/", () => span("home")),
          route("/users/:id", (p) => span(`user ${p.id}`)),
        ]),
      ]).toHTML(),
    ),
  );
  expect(html).toContain("home");
  expect(html).not.toContain("user ");
});

test("router SSR: renders a param view with the extracted id", () => {
  const html = createRoot(() =>
    withRouter("/users/7", () =>
      div([
        router([
          route("/", () => span("home")),
          route("/users/:id", (p) => span(`user ${p.id}`)),
        ]),
      ]).toHTML(),
    ),
  );
  expect(html).toContain("user 7");
  expect(html).not.toContain(">home<");
});

test("router SSR: renders the fallback when no route matches", () => {
  const html = createRoot(() =>
    withRouter("/nope", () =>
      div([
        router(
          [route("/", () => span("home"))],
          () => span("not found"),
        ),
      ]).toHTML(),
    ),
  );
  expect(html).toContain("not found");
});

test("router SSR isolates request-local path state", async () => {
  const render = (path: string) =>
    createRoot(() =>
      withRouter(path, () =>
        div([
          router([
            route("/", () => span("home")),
            route("/users/:id", (p) => span(`user ${p.id}`)),
          ]),
        ]).toHTML(),
      ),
    );

  const [first, second] = await Promise.all([
    Promise.resolve().then(() => render("/users/1")),
    Promise.resolve().then(() => render("/users/2")),
  ]);

  expect(first).toContain("user 1");
  expect(first).not.toContain("user 2");
  expect(second).toContain("user 2");
  expect(second).not.toContain("user 1");
});

test("setPath on the server requires an isolated router scope", () => {
  const restoreWindow = (globalThis as { window?: Window }).window;
  Reflect.deleteProperty(globalThis as Record<string, unknown>, "window");
  try {
    expect(() => setPath("/server-only")).toThrow(
      "setPath() on the server requires withRouter(path, fn)",
    );
  } finally {
    if (restoreWindow) (globalThis as { window?: Window }).window = restoreWindow;
  }
});

// ---- router() live DOM (navigate) -----------------------------------------

test("router live DOM: navigate switches the rendered view", () => {
  navigate("/"); // reset shared path for isolation
  const host = document.createElement("div");

  createRoot(() => {
    div([
      router([
        route("/", () => span("home")),
        route("/about", () => span("about")),
      ]),
    ]).into(host);

    expect(host.querySelector("span")?.textContent).toBe("home");

    navigate("/about");
    expect(host.querySelector("span")?.textContent).toBe("about");

    navigate("/"); // restore for other tests
  });
});

test("router live DOM: navigate to a param route renders the id", () => {
  navigate("/");
  const host = document.createElement("div");

  createRoot(() => {
    div([
      router([
        route("/", () => span("home")),
        route("/users/:id", (p) => span(`user ${p.id}`)),
      ]),
    ]).into(host);

    navigate("/users/42");
    expect(host.querySelector("span")?.textContent).toBe("user 42");

    navigate("/");
  });
});

// ---- link() ---------------------------------------------------------------

test("link() produces an <a> with the target href", () => {
  const html = link("/x", span("go")).toHTML();
  expect(html).toContain(`href="/x"`);
  expect(html).toContain("go");
  expect(html.startsWith("<a")).toBe(true);
});

test("withRouter rejects async callbacks because router context is sync-only", async () => {
  await expect(
    Promise.resolve().then(() =>
      createRoot(() =>
        withRouter("/users/1", async () => {
          await Promise.resolve();
          return currentPath();
        }),
      ),
    ),
  ).rejects.toThrow(
    "provide() callbacks must be synchronous; context is not preserved across await.",
  );
});
