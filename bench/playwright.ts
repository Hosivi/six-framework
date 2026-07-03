// Real-browser (Playwright) component bench: sx vs Solid vs React.
//
//   bun bench/playwright.ts            # default 1000 instances / component
//   bun bench/playwright.ts 2000       # custom count
//
// Renders N instances of three static-heavy components (card / row / field) and
// measures create / updateAll / update10th / clear IN A REAL BROWSER — each
// timing waits two rAFs so LAYOUT + PAINT are included (the thing happy-dom
// cannot measure). sx uses the html`` clone path; Solid its compiler; React
// setState. Runs under default (node) resolution: it only bundles + drives
// chromium (Bun.build resolves each framework's browser build itself).
//
// NOTE: this cannot run in a restricted sandbox where chromium's CDP pipe is
// blocked (the launch times out). Run it on a normal dev machine or in CI.

import { chromium } from "playwright";
import { transformFileSync } from "@babel/core";
import { writeFileSync } from "node:fs";

const N = Number(process.argv[2] ?? 1000);
const ROUNDS = 5;
const COMPONENTS = ["card", "row", "field"] as const;
const PHASES = ["create", "updateAll", "update10th", "clear"] as const;

const CSS = `
body{font-family:system-ui,sans-serif;margin:0;padding:16px;background:#0f172a;color:#e2e8f0}
#app{display:flex;flex-wrap:wrap;gap:10px;align-content:flex-start}
.card{width:280px;display:flex;gap:12px;padding:14px;background:#111c33;border:1px solid #1e2d4a;border-radius:12px}
.card__avatar{width:44px;height:44px;flex:0 0 44px;border-radius:999px;background:#1d4ed8;display:grid;place-items:center;font-weight:700}
.card__name{font-weight:700}.card__handle{color:#64748b;font-size:13px}.card__bio{margin:8px 0;font-size:13px;color:#94a3b8}
.card__stats{display:flex;gap:12px;font-size:12px;color:#64748b}.card__actions{display:flex;gap:8px;margin-top:10px}
.row{display:flex;gap:12px;width:100%;padding:8px 12px;border-bottom:1px solid #1e2d4a;align-items:center}
.row>div{flex:1}.badge{padding:2px 8px;border-radius:999px;background:#052e1a;color:#4ade80;font-size:12px}
.field{width:320px;padding:10px;background:#111c33;border:1px solid #1e2d4a;border-radius:10px}
.field__label{display:block;font-size:13px;color:#94a3b8;margin-bottom:6px}
.field__input{width:100%;box-sizing:border-box;padding:8px;background:#0b1526;border:1px solid #24365a;border-radius:8px;color:#e2e8f0}
.field__hint{margin:6px 0 0;font-size:12px;color:#64748b}
.btn{padding:6px 12px;border-radius:8px;border:0;background:#1d4ed8;color:#fff;font-size:13px;cursor:pointer}
.btn--primary{background:#2563eb}
`;

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};

const bundle = async (
  entry: string,
  opts: { conditions?: string[]; define?: Record<string, string> } = {},
): Promise<string> => {
  const build = await Bun.build({
    entrypoints: [entry],
    target: "browser",
    minify: true,
    conditions: opts.conditions,
    define: opts.define,
  });
  if (!build.success) {
    for (const log of build.logs) console.error(log);
    throw new Error(`bundle failed: ${entry}`);
  }
  return build.outputs[0]!.text();
};

const pageHtml = (js: string): string =>
  `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head>` +
  `<body><div id="app"></div>` +
  // React's bundle references process.env even after the NODE_ENV define; shim it
  // so the module doesn't throw "process is not defined" before setting __bench.
  `<script>window.process={env:{NODE_ENV:"production"}};</script>` +
  `<script type="module">${js}</script></body></html>`;

// Run one op in-page, waiting two rAFs so layout+paint are included.
const runOp = (
  page: import("playwright").Page,
  fn: string,
  n: number,
  type: string,
): Promise<number> =>
  page.evaluate(
    async ([fn, n, type]) => {
      const b = (window as unknown as { __bench: Record<string, (...a: unknown[]) => unknown> }).__bench;
      const t0 = performance.now();
      if (fn === "create") b.create(n, type);
      else b[fn]!();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
      return performance.now() - t0;
    },
    [fn, n, type] as [string, number, string],
  );

const countRows = (page: import("playwright").Page): Promise<number> =>
  page.evaluate(() => (window as unknown as { __bench: { count: () => number } }).__bench.count());

const main = async (): Promise<void> => {
  console.log(`Real-browser component bench — ${N} instances/component, median of ${ROUNDS}\n`);

  // 1) compile Solid (babel-preset-solid) under node resolution
  const solidOut = transformFileSync("bench/pw/solid-app.jsx", {
    presets: [["babel-preset-solid", {}]],
    filename: "bench/pw/solid-app.jsx",
  });
  if (!solidOut?.code) throw new Error("solid compile failed");
  writeFileSync("bench/pw/solid-app.gen.js", solidOut.code);

  // 2) bundle each app for the browser
  const apps: Record<string, string> = {
    sx: await bundle("bench/pw/sx-app.ts"),
    solid: await bundle("bench/pw/solid-app.gen.js", { conditions: ["browser"] }),
    react: await bundle("bench/pw/react-app.tsx", {
      define: { "process.env.NODE_ENV": '"production"' },
    }),
  };
  console.log(
    "bundled (min):",
    Object.entries(apps)
      .map(([k, v]) => `${k} ${(v.length / 1024).toFixed(0)}KB`)
      .join("  ·  "),
  );

  // 3) drive a browser — try several strategies. The default headless-shell
  // uses a debugging PIPE that Windows security software / policy often blocks
  // (the launch times out); the system Edge/Chrome channels are registered
  // differently and usually work where headless-shell does not.
  const strategies: Array<{ name: string; opts: import("playwright").LaunchOptions }> = [
    { name: "chromium (headless-shell, pipe)", opts: { timeout: 20000 } },
    { name: "system Edge (channel: msedge)", opts: { channel: "msedge", timeout: 20000 } },
    { name: "system Chrome (channel: chrome)", opts: { channel: "chrome", timeout: 20000 } },
    { name: "chromium headed (headless: false)", opts: { headless: false, timeout: 20000 } },
  ];
  let browser: import("playwright").Browser | null = null;
  for (const s of strategies) {
    process.stdout.write(`launching ${s.name}... `);
    try {
      browser = await chromium.launch(s.opts);
      console.log("OK");
      break;
    } catch (e) {
      console.log("failed (" + (e as Error).message.split("\n")[0].trim() + ")");
    }
  }
  if (!browser) {
    console.error(
      "\n✗ Every launch strategy failed — this machine blocks Chromium's debugging\n" +
        "  pipe (usually Windows security/AV policy, not your code). The apps bundled\n" +
        "  fine above. Reliable path: run it in CI (Linux runner) — see the GitHub\n" +
        "  Actions snippet in bench/pw/README.md.",
    );
    return;
  }

  const results: Record<string, Record<string, Record<string, number>>> = {};
  const okNames: string[] = [];
  for (const [name, js] of Object.entries(apps)) {
    const page = await browser.newPage();
    page.on("pageerror", (e) => console.error(`  [${name}] pageerror: ${e.message}`));
    try {
      await page.setContent(pageHtml(js), { waitUntil: "load" });
      const ok = await page.evaluate(
        () => typeof (window as unknown as { __bench?: unknown }).__bench === "object",
      );
      if (!ok) throw new Error("window.__bench not defined (bundle/init failed)");

      results[name] = {};
      for (const comp of COMPONENTS) {
        const samples: Record<string, number[]> = { create: [], updateAll: [], update10th: [], clear: [] };
        for (let r = 0; r < ROUNDS; r++) {
          samples.create!.push(await runOp(page, "create", N, comp));
          if ((await countRows(page)) !== N) throw new Error(`${comp}: created ≠ ${N}`);
          samples.updateAll!.push(await runOp(page, "updateAll", 0, comp));
          samples.update10th!.push(await runOp(page, "update10th", 0, comp));
          samples.clear!.push(await runOp(page, "clear", 0, comp));
          if ((await countRows(page)) !== 0) throw new Error(`${comp}: clear left rows`);
        }
        results[name]![comp] = Object.fromEntries(
          PHASES.map((p) => [p, median(samples[p]!)]),
        ) as Record<string, number>;
      }
      okNames.push(name);
      console.log(`  ✓ ${name}`);
    } catch (e) {
      // one broken framework must not sink the whole run — skip it, keep the rest
      console.error(`  ✗ ${name} skipped: ${(e as Error).message}`);
    }
    await page.close();
  }
  await browser.close();

  if (okNames.length === 0) {
    console.error("\nNo framework completed — see pageerror logs above.");
    return;
  }

  // 4) report per component (paint included) — only frameworks that completed
  for (const comp of COMPONENTS) {
    console.log(`\n[${comp}]  ${N} instances  (ms, layout+paint included)`);
    console.table(
      PHASES.map((p) => {
        const row: Record<string, string> = { phase: p };
        for (const n of okNames) row[n] = results[n]![comp]![p]!.toFixed(2);
        if (okNames.includes("sx") && okNames.includes("solid"))
          row["sx/solid"] = (results.sx![comp]![p]! / results.solid![comp]![p]!).toFixed(2) + "×";
        if (okNames.includes("sx") && okNames.includes("react"))
          row["sx/react"] = (results.sx![comp]![p]! / results.react![comp]![p]!).toFixed(2) + "×";
        return row;
      }),
    );
  }
};

await main();
