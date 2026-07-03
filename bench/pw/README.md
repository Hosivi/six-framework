# Real-browser component bench (Playwright)

Measures **create / updateAll / update10th / clear** for three static-heavy
components — **card**, **row**, **field** — rendered N times, in a real Chromium
with **layout + paint included** (each timing waits two `requestAnimationFrame`s).
Compares **sx** (`html\`\`` clone path) vs **Solid** (its compiler) vs **React**.

## Run locally

```sh
bun bench/playwright.ts          # 1000 instances / component (default)
bun bench/playwright.ts 2000     # custom count
```

First run needs the browser once: `bunx playwright install chromium`.

The driver bundles each app for the browser (Bun.build; Solid is compiled with
babel-preset-solid first), serves it, and drives Chromium. Each phase is gated
by a correctness check (created N, cleared to 0).

## Run in CI (GitHub Actions)

```yaml
jobs:
  bench:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bunx playwright install --with-deps chromium
      - run: bun bench/playwright.ts 1000
```

## Verified here (happy-dom, no browser)

- All three apps bundle: sx ~8 KB, Solid ~17 KB, React ~183 KB (minified).
- The Solid bundle resolves the **client** runtime (cloneNode present), not the
  SSR stub — the fairness trap is avoided.
- sx and React component logic: create 12 → update → clear 0.
- The sx app exercises the `insert()` DocumentFragment fix (list of `html\`\``).

## Not verifiable here

The Chromium launch: this sandbox blocks Playwright's CDP pipe (the launch times
out). The driver detects this and prints a message. On a normal machine or CI it
runs and prints one table per component with `sx/solid` and `sx/react` ratios.

## Why these components
Unlike the 2-cell rows in `bench/dom.ts` (almost all dynamic), these components
are **static-heavy** — a card has ~12 static nodes and one dynamic hole — so the
`cloneNode` advantage of the clone/compiler paths has structure to amortize.
This is where the create-time gap to Solid is expected to shrink.
