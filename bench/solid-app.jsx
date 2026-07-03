// Solid harness — idiomatic: <For> keyed list + per-row signal (fine-grained,
// mirrors sx). Compiled with babel-preset-solid into solid-app.gen.js.
import { createSignal, batch, For } from "solid-js";
import { render } from "solid-js/web";

export function makeSolid(host, N) {
  let rows = [];
  const [list, setList] = createSignal([]);
  render(
    () => (
      <table>
        <For each={list()}>
          {(r) => (
            <tr>
              <td>{r.id}</td>
              <td>{r.label()}</td>
            </tr>
          )}
        </For>
      </table>
    ),
    host,
  );
  return {
    rows: () => host.querySelectorAll("tr").length,
    run: (p) => {
      const t0 = performance.now();
      if (p === "create") {
        rows = Array.from({ length: N }, (_, i) => {
          const [label, setLabel] = createSignal(`row ${i + 1}`);
          return { id: i + 1, label, setLabel };
        });
        setList(rows);
      } else if (p === "updateAll") {
        batch(() => {
          for (const r of rows) r.setLabel(r.label() + " !");
        });
      } else if (p === "update10th") {
        batch(() => {
          for (let i = 0; i < rows.length; i += 10) rows[i].setLabel(rows[i].label() + " !");
        });
      } else {
        rows = [];
        setList([]);
      }
      return performance.now() - t0;
    },
  };
}
