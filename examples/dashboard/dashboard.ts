// A small admin dashboard showcasing the functional router with Tailwind v4:
//   route()/router() for view switching, link() for client-side navigation,
//   currentPath() for the reactive active-link highlight and breadcrumb.
// Styling is pure Tailwind utilities passed to .class() — sx emits the class
// string verbatim, so utilities and reactive .addClass() compose untouched.
// State lives in plain local signals — no store, no classes, no JSX.

import { signal } from "../../src/reactive/index";
import {
  main,
  aside,
  section,
  header,
  nav,
  div,
  span,
  p,
  h2,
  ul,
  li,
  table,
  tr,
  th,
  td,
  button,
  input,
  label,
  strong,
} from "../../src/dom/tags";
import { router, route, link, currentPath } from "../../src/router/index";
import type { SxNode, SxChild } from "../../src/dom/types";

// ---- shared utility bundles ------------------------------------------------

const VIEW = "p-6";
const H2 = "mt-0 mb-[18px] text-[22px] font-semibold";
const BTN =
  "cursor-pointer rounded-lg border-0 bg-blue-700 px-4 py-2 text-sm text-white hover:bg-blue-600";
const LINK = "text-sky-400 no-underline hover:underline";

// ---- demo data -------------------------------------------------------------

type User = {
  id: number;
  name: string;
  role: string;
  email: string;
  active: boolean;
};

const USERS: User[] = [
  {
    id: 1,
    name: "Ada Lovelace",
    role: "Admin",
    email: "ada@six.dev",
    active: true,
  },
  {
    id: 2,
    name: "Alan Turing",
    role: "Editor",
    email: "alan@six.dev",
    active: true,
  },
  {
    id: 3,
    name: "Grace Hopper",
    role: "Admin",
    email: "grace@six.dev",
    active: false,
  },
  {
    id: 4,
    name: "Linus Torvalds",
    role: "Viewer",
    email: "linus@six.dev",
    active: true,
  },
];

const findUser = (id: string): User | undefined =>
  USERS.find((u) => String(u.id) === id);

// ---- shared pieces ---------------------------------------------------------

const StatCard = (caption: string, value: SxChild): SxNode =>
  div([
    span(caption).class("text-xs uppercase tracking-wider text-slate-500"),
    strong(value).class("text-[26px] text-sky-400"),
  ]).class(
    "flex flex-col gap-1.5 rounded-xl border border-line bg-surface p-4",
  );

const Th = (labelText: string): SxNode =>
  th(labelText).class(
    "border-b border-line px-3 py-2.5 text-left text-xs uppercase tracking-wide text-slate-500",
  );

const Td = (child: SxChild): SxNode =>
  td(child).class("border-b border-line px-3 py-2.5 text-left text-slate-200");

// A router-aware nav link: highlights when the current path matches, and sets
// aria-current="page" (accessible + a stable hook the e2e test queries).
// `exact` distinguishes "/" (which prefixes everything) from section roots.
const navLink = (to: string, text: string, exact = false): SxNode => {
  const isActive = (): boolean =>
    exact
      ? currentPath() === to
      : currentPath() === to || currentPath().startsWith(`${to}/`);
  return link(to, text)
    .class(
      "block rounded-lg px-3 py-2 text-sm text-slate-400 no-underline transition-colors hover:bg-slate-800 hover:text-slate-200",
    )
    .addClass("bg-blue-700 text-white", isActive)
    .attr("aria-current", () => (isActive() ? "page" : null));
};

// ---- views -----------------------------------------------------------------

const Overview = (): SxNode => {
  const visits = signal(1280);
  const activeUsers = USERS.filter((u) => u.active).length;

  return section([
    h2("Resumen").class(H2),
    div([
      StatCard("Usuarios", String(USERS.length)),
      StatCard("Activos", String(activeUsers)),
      StatCard("Visitas hoy", () => visits().toLocaleString("es-AR")),
    ]).class("mb-5 grid grid-cols-3 gap-3.5"),
    button("Simular visita")
      .class(BTN)
      .onClick(() => visits.update((n) => n + 1)),
  ]).class(VIEW);
};

const UsersList = (): SxNode =>
  section([
    h2("Usuarios").class(H2),
    table([
      tr([Th("Nombre"), Th("Rol"), Th("Estado"), Th("")]),
      ...USERS.map((u) =>
        tr([
          Td(u.name),
          Td(u.role),
          td(u.active ? "Activo" : "Inactivo").class(
            `border-b border-line px-3 py-2.5 text-left text-sm ${u.active ? "text-green-400" : "text-red-400"}`,
          ),
          Td(link(`/users/${u.id}`, "Ver →").class(LINK)),
        ]),
      ),
    ]).class("w-full border-collapse"),
  ]).class(VIEW);

const UserDetail = (id: string): SxNode => {
  const user = findUser(id);
  if (!user) {
    return section([
      h2("Usuario no encontrado").class(H2),
      p(`No existe un usuario con id "${id}".`).class("text-slate-400"),
      link("/users", "← Volver a usuarios").class(LINK),
    ]).class(VIEW);
  }
  return section([
    link("/users", "← Volver a usuarios").class(`${LINK} mb-3 inline-block`),
    h2(user.name).class(H2),
    ul([
      li([
        strong("Rol: ").class("font-semibold text-slate-400"),
        span(user.role),
      ]).class("text-slate-300"),
      li([
        strong("Email: ").class("font-semibold text-slate-400"),
        span(user.email),
      ]).class("text-slate-300"),
      li([
        strong("Estado: ").class("font-semibold text-slate-400"),
        span(user.active ? "Activo" : "Inactivo"),
      ]).class("text-slate-300"),
    ]).class("mt-4 grid list-none gap-2.5 p-0"),
  ]).class(VIEW);
};

const Settings = (): SxNode => {
  const panelName = signal("Mi Panel");
  const notifications = signal(true);

  return section([
    h2("Configuración").class(H2),
    div([
      label("Nombre del panel").class("mb-1.5 block text-sm text-slate-400"),
      input("", { type: "text" })
        .class(
          "box-border w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-slate-200 focus:border-sky-400 focus:outline-none",
        )
        .attr("value", panelName)
        .onInput((e) =>
          panelName.set(((e as Event).target as HTMLInputElement).value),
        ),
    ]).class("mb-[18px] max-w-[360px]"),
    div([
      label([
        input("", { type: "checkbox" })
          .attr("checked", () => notifications())
          .onChange((e) =>
            notifications.set(
              ((e as Event).target as HTMLInputElement).checked,
            ),
          ),
        span("Recibir notificaciones"),
      ]).class("flex items-center gap-2 text-sm text-slate-400"),
    ]).class("mb-[18px]"),
    p(
      () =>
        `Vista previa: ${panelName()} — notificaciones ${notifications() ? "activadas" : "desactivadas"}`,
    ).class("mt-4 text-sm text-slate-500"),
  ]).class(VIEW);
};

const NotFound = (): SxNode =>
  section([
    h2("404").class(H2),
    p("Esa ruta no existe.").class("text-slate-400"),
    link("/", "← Ir al resumen").class(LINK),
  ]).class(VIEW);

// ---- app shell -------------------------------------------------------------

export const App = (): SxNode =>
  main([
    aside([
      div([
        span("◆").class("text-xl text-sky-400"),
        span("six admin").class("font-bold tracking-wide"),
      ]).class("flex items-center gap-2.5 px-1.5"),
      nav([
        navLink("/", "Resumen", true),
        navLink("/users", "Usuarios"),
        navLink("/settings", "Configuración"),
      ]).class("flex flex-col gap-1"),
    ]).class("flex flex-col gap-6 border-r border-line bg-surface p-5"),

    section([
      header([
        p(() => `Ruta actual: ${currentPath()}`).class(
          "m-0 text-[13px] text-slate-500",
        ),
      ]).class("border-b border-line px-6 py-3.5"),
      router(
        [
          route("/", () => Overview()),
          route("/users", () => UsersList()),
          route("/users/:id", (params) => UserDetail(params.id)),
          route("/settings", () => Settings()),
        ],
        () => NotFound(),
      ),
    ]).class("flex flex-col"),
  ]).class(
    "grid min-h-[78vh] w-[92vw] max-w-[1040px] grid-cols-[220px_1fr] overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl",
  );
