// Self-verifying playground for the reactive core.
// Run with:  npm run play
//
// Every scenario asserts the engine's behavior so you can SEE the model work.

import {
  signal,
  computed,
  effect,
  batch,
  untrack,
  createRoot,
  onCleanup,
} from "../src/reactive/index";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean): void {
  if (cond) {
    pass++;
    console.log("  ✓ " + label);
  } else {
    fail++;
    console.error("  ✗ " + label);
  }
}

console.log("\n# 1. signal — read, set, update");
{
  const count = signal(0);
  check("initial value", count() === 0);
  count.set(5);
  check("after set", count() === 5);
  count.update((c) => c + 1);
  check("after update", count() === 6);
}

console.log("\n# 2. computed — lazy + memoized");
{
  let runs = 0;
  const first = signal("Ada");
  const last = signal("Lovelace");
  const full = computed(() => {
    runs++;
    return `${first()} ${last()}`;
  });
  check("not computed until read (lazy)", runs === 0);
  check("first read value", full() === "Ada Lovelace");
  check("computed once", runs === 1);
  full();
  full();
  check("memoized (no recompute on re-read)", runs === 1);
  first.set("Grace");
  check("still lazy after change (not read yet)", runs === 1);
  check("recomputes on next read", full() === "Grace Lovelace");
  check("computed twice total", runs === 2);
}

console.log("\n# 3. effect — runs on change, batch coalesces, NO deps array");
{
  let runs = 0;
  const count = signal(0);
  const dispose = effect(() => {
    count();
    runs++;
  });
  check("runs immediately", runs === 1);
  count.set(1);
  check("re-runs on change", runs === 2);
  batch(() => {
    count.set(2);
    count.set(3);
    count.set(4);
  });
  check("batch coalesces to ONE run", runs === 3);
  check("final value applied", count() === 4);
  dispose();
  count.set(99);
  check("no run after dispose", runs === 3);
}

console.log("\n# 4. diamond — single recompute, glitch-free");
{
  let bRuns = 0;
  let cRuns = 0;
  let dRuns = 0;
  const a = signal(1);
  const b = computed(() => {
    bRuns++;
    return a() + 1;
  });
  const c = computed(() => {
    cRuns++;
    return a() + 2;
  });
  const d = computed(() => {
    dRuns++;
    return b() + c();
  });
  let out = 0;
  effect(() => {
    out = d();
  });
  check("initial d = 5", out === 5);
  check("d computed once initially", dRuns === 1);
  a.set(10);
  check("d updated to 23", out === 23);
  check("d recomputed ONCE (not twice)", dRuns === 2);
  check("b recomputed once", bRuns === 2);
  check("c recomputed once", cRuns === 2);
}

console.log("\n# 5. conditional (dynamic) dependencies");
{
  let runs = 0;
  const show = signal(true);
  const name = signal("Ada");
  effect(() => {
    runs++;
    if (show()) name();
  });
  check("runs once", runs === 1);
  name.set("Grace");
  check("re-runs (name is a dep)", runs === 2);
  show.set(false);
  check("re-runs (show changed)", runs === 3);
  name.set("Linus");
  check("name no longer a dep -> no run", runs === 3);
}

console.log("\n# 6. cleanup + ownership (createRoot / onCleanup)");
{
  const log: string[] = [];
  const n = signal(0);
  const dispose = createRoot((dispose) => {
    effect(() => {
      const v = n();
      log.push(`run:${v}`);
      onCleanup(() => log.push(`cleanup:${v}`));
    });
    return dispose;
  });
  check("first run", log.join(",") === "run:0");
  n.set(1);
  check("cleanup before re-run", log.join(",") === "run:0,cleanup:0,run:1");
  dispose();
  check("cleanup on dispose", log.join(",") === "run:0,cleanup:0,run:1,cleanup:1");
  n.set(2);
  check("no run after root dispose", log.join(",") === "run:0,cleanup:0,run:1,cleanup:1");
}

console.log("\n# 7. untrack — read without subscribing");
{
  let runs = 0;
  const a = signal(0);
  const b = signal(0);
  effect(() => {
    a();
    untrack(() => b());
    runs++;
  });
  check("runs once", runs === 1);
  b.set(1);
  check("untracked read does NOT trigger", runs === 1);
  a.set(1);
  check("tracked read triggers", runs === 2);
}

console.log(
  `\n${fail === 0 ? "✅ ALL GREEN" : "❌ FAILURES"}: ${pass} passed, ${fail} failed\n`,
);
if (fail > 0) process.exitCode = 1;
